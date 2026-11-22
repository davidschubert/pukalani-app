#!/usr/bin/env node
/**
 * BEWEIS: „sichtbar schlägt away (fremder Mandant)" — die Vorfahrts-Regel vom
 * 2026-08-18 (packages/core/shared/presencePriority.ts).
 *
 * DER VORFALL, den dieses Skript nachstellt: die Plattform führt EINE Presence
 * pro User (presenceId = userId). Wer die Dashboards ZWEIER Communities
 * gleichzeitig offen hat, betreibt zwei Origins, die sich im Browser nicht
 * absprechen können — beide Tabs schreiben dieselbe Zeile. Der versteckte Tab
 * (away, von der Browser-Drossel auf ~1×/Minute gebremst) stahl dem sichtbaren
 * Tab (20-s-Takt) regelmäßig den `metadata.tenantId`-Stempel. Weil BEIDE Leser
 * fail-closed auf genau diesen Stempel filtern (server/utils/presenceFilter.ts,
 * app/composables/usePresence.ts), flackerte der Online-Zähler beider
 * Communities zwischen 0 und 1.
 *
 * GEPRÜFT WIRD DER ECHTE PFAD durch unseren Code — Route, Tenant-Auflösung,
 * Regel, Appwrite —, gelesen wird der Rohzustand mit dem Admin-Client (also an
 * unserem Code vorbei). Sechs Schritte, jeder mit seiner Gegenprobe:
 *   1. Heartbeat A (sichtbar)              → Stempel A
 *   2. Heartbeat B (away)                  → Stempel BLEIBT A   ← der Kern
 *   3. Heartbeat A (away, GLEICHER Mandant)→ away landet         (Gegenprobe)
 *   4. Heartbeat B (away über away)        → Stempel wechselt zu B (Gegenprobe)
 *   5. leave über Host B, während A sichtbar → Presence lebt weiter
 *   6. leave über Host A                   → Presence weg        (Gegenprobe)
 * Ohne die Schritte 3/4/6 wäre auch eine Regel grün, die einfach ALLES
 * blockiert — und die wäre schlimmer als der Fehler.
 *
 * DER WEGWERF-NUTZER IST MITGLIED BEIDER COMMUNITIES (seit 2026-11-18, BT1 e):
 * der Heartbeat schreibt im Pool nur noch für Mitglieder der Community des
 * Hosts. Bis dahin ermittelte Schritt 0 die Community-Ids, indem ein Konto
 * OHNE Zugehörigkeit auf beiden Hosts schrieb — genau das, was jetzt still
 * ausbleibt. Die Ids kommen deshalb von der Bühne (`BUEHNE_COMMUNITY_A/B`,
 * `pnpm buehne run`), der Nutzer bekommt beide Labels VOR dem ersten Takt, und
 * Schritt 0 prüft die neue Regel gleich mit (ein Konto ohne Label schreibt
 * nichts). Die MANDANTEN-STEMPEL verrät weiter der Heartbeat selbst
 * (`metadata.tenantId`); `communities` lebt im Control Plane, dafür hat
 * dieses Skript keinen Schlüssel.
 *
 * VORAUSSETZUNGEN (alles lokal, nichts zeigt auf Produktion):
 *   - lokale Appwrite + Pool-Projekt (Runtime-Key MIT presences.read/write),
 *   - zwei geseedete Mandanten-Hosts (Default kunde-a/kunde-b.localhost),
 *   - laufender platform-Dev-Server: `pnpm --filter platform dev`.
 * Ohne Server wird mit Hinweis übersprungen (Exit 0), nicht rot gemeldet.
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis:
 *   node --env-file=apps/platform/.env \
 *     packages/core/scripts/verify-presence-away-priority.mjs
 *
 * Legt einen Wegwerf-Nutzer an und räumt ihn (auch im Fehlerfall) wieder weg.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Presences, Users } from 'node-appwrite'
import { createHostLogins } from '../../../scripts/lib/probe-stage.mjs'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/platform/.env aufrufen (Runtime-Key mit users/sessions/presences).')
  process.exit(1)
}

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const HOST_A = process.env.TENANT_HOST_A || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_HOST_B || 'kunde-b.localhost'
/** Die Community-Ids der zwei Hosts (= die Labels der Mitglieder) — von der Bühne. */
const COMMUNITY_A = process.env.BUEHNE_COMMUNITY_A || ''
const COMMUNITY_B = process.env.BUEHNE_COMMUNITY_B || ''

const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const adminUsers = new Users(admin)
const adminPresences = new Presences(admin)

const stamp = Date.now().toString(36)
const created = { users: [], presences: [] }
let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil fetch einen eigenen Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1', port: PORT, path, method,
      headers: {
        host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Anmelden JE HOST (PK1 E1c): zwei Tabs auf zwei Hosts sind im Browser zwei
 * Anmeldungen — das Cookie ist host-only, im Modus `write` eine Karte, die
 * nur auf ihrem Host gilt.
 */
const cookieOn = createHostLogins(call)

/** Heartbeat über den ECHTEN Endpunkt — `away` ist der einzige Unterschied. */
async function heartbeat(host, cookie, away) {
  const res = await call(host, '/api/presence/heartbeat', {
    method: 'POST', cookie, body: away ? { away: true } : {},
  })
  if (res.status !== 200) throw new Error(`Heartbeat auf ${host} (away=${!!away}) → ${res.status}: ${res.text.slice(0, 160)}`)
  return res
}

/** Rohzustand der Presence, mit dem Admin-Client gelesen. null = gibt es nicht. */
async function presenceState(userId) {
  try {
    const p = await adminPresences.get({ presenceId: userId })
    const meta = p.metadata ?? {}
    return {
      tenantId: typeof meta.tenantId === 'string' ? meta.tenantId : '',
      away: meta.away === true,
      permissions: p.$permissions ?? [],
      updatedAt: p.$updatedAt,
    }
  }
  catch (error) {
    if (error?.code === 404) return null
    throw error
  }
}

/** `read("label:<communityId>")` → die Community-Id, die der Heartbeat schrieb. */
function communityIdFromPermissions(permissions) {
  const found = permissions.find(p => p.startsWith('read("label:'))
  return found ? found.slice('read("label:'.length, -2) : ''
}

try {
  console.log(`\nVorfahrts-Regel „sichtbar schlägt away" gegen ${endpoint} / Projekt ${projectId}`)
  console.log(`Host A = ${HOST_A} · Host B = ${HOST_B} · Port ${PORT}\n`)

  const alive = await call(HOST_A, '/api/health').catch(() => null)
  if (!alive) {
    console.log(`ⓘ übersprungen — kein Platform-Server auf Port ${PORT}.`)
    console.log('  (starten mit `pnpm --filter platform dev`, dann erneut laufen lassen)\n')
    process.exit(0)
  }

  if (!COMMUNITY_A || !COMMUNITY_B) {
    // Kein stilles Überspringen: ohne die Ids prüft dieser Lauf nichts.
    throw new Error('BUEHNE_COMMUNITY_A/B fehlen — über `pnpm buehne run --only verify-presence-away-priority` starten')
  }

  const account = {
    email: `away-prio-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
  }
  const user = await adminUsers.create({
    userId: ID.unique(), email: account.email, password: account.password, name: `Away ${stamp}`,
  })
  created.users.push(user.$id)
  created.presences.push(user.$id)
  // Mitglied beider Communities: das Label ist die Zugehörigkeit, nach der der
  // Heartbeat fragt (Bestand „Label ohne Zeile" zählt als Mitglied). Gesetzt
  // VOR der Anmeldung, damit schon der erste Takt als Mitglied läuft.
  await adminUsers.updateLabels({ userId: user.$id, labels: [COMMUNITY_A, COMMUNITY_B] })

  // EIN Konto, ZWEI Tabs auf zwei Hosts: jeder Tab hat seine eigene
  // Anmeldung (host-only Cookie; im Modus `write` gilt eine Karte nur auf
  // ihrem Host). Die Anwesenheit hängt am KONTO (presenceId = userId), nicht
  // an der Sitzung — darum teilen sich beide Tabs trotzdem die EINE Presence.
  const cookieA = await cookieOn(HOST_A, account)
  const cookieB = await cookieOn(HOST_B, account)

  console.log('0. Aufwärmen — ohne Zugehörigkeit keine Anwesenheit, mit ihr die Stempel der zwei Hosts')
  // Die Regel selbst, mit einem ZWEITEN Konto ohne jedes Label: der Takt wird
  // still angenommen (200), geschrieben wird nichts. Die Gegenprobe sind alle
  // Schritte danach — dasselbe mit Label schreibt.
  const strangerAccount = { email: `away-prio-fremd-${stamp}@example.test`, password: `Pw-${ID.unique()}` }
  const stranger = await adminUsers.create({
    userId: ID.unique(), email: strangerAccount.email, password: strangerAccount.password, name: `Fremd ${stamp}`,
  })
  created.users.push(stranger.$id)
  created.presences.push(stranger.$id)
  const strangerCookie = await cookieOn(HOST_A, strangerAccount)
  await heartbeat(HOST_A, strangerCookie, false)
  check('ein Konto OHNE Zugehörigkeit: der Takt wird angenommen, aber es entsteht keine Anwesenheit',
    await presenceState(stranger.$id) === null, JSON.stringify(await presenceState(stranger.$id)))

  await heartbeat(HOST_A, cookieA, false)
  const warmA = await presenceState(user.$id)
  await heartbeat(HOST_B, cookieB, false)
  const warmB = await presenceState(user.$id)
  const TENANT_A = warmA?.tenantId ?? ''
  const TENANT_B = warmB?.tenantId ?? ''
  const communityA = communityIdFromPermissions(warmA?.permissions ?? [])
  const communityB = communityIdFromPermissions(warmB?.permissions ?? [])
  check('beide Hosts sind Mandanten mit VERSCHIEDENEN Stempeln',
    !!TENANT_A && !!TENANT_B && TENANT_A !== TENANT_B, `${TENANT_A} / ${TENANT_B}`)
  // Gegen den Stempel von A geprüft (TENANT_B stammt aus dieser Antwort und
  // wäre gegen sich selbst immer grün): der B-Schreiber hat die FRISCHE,
  // SICHTBARE Presence von A überschrieben — sichtbar gated die Regel nicht.
  check('sichtbar über sichtbar bleibt Letzter-gewinnt (die Regel greift NUR bei away)',
    !!warmB?.tenantId && warmB.tenantId !== TENANT_A, JSON.stringify(warmB))
  // Die Zeile trägt das Lese-Publikum der Community des Hosts — verglichen mit
  // den Ids der Bühne, nicht mit dem, was dieselbe Antwort behauptet.
  check('die Anwesenheit trägt das Lese-Publikum der Community des jeweiligen Hosts',
    communityA === COMMUNITY_A && communityB === COMMUNITY_B, `${communityA} / ${communityB}`)
  console.log(`   Stempel A = ${TENANT_A} · B = ${TENANT_B} · Labels = ${COMMUNITY_A}, ${COMMUNITY_B}`)

  console.log('\n1. Sichtbarer Tab auf Host A schreibt')
  await heartbeat(HOST_A, cookieA, false)
  const s1 = await presenceState(user.$id)
  check('Presence trägt den Stempel von A und ist NICHT away',
    s1?.tenantId === TENANT_A && s1.away === false, JSON.stringify(s1))

  console.log('\n2. DER KERN — versteckter Tab auf Host B (away) darf nicht überschreiben')
  await heartbeat(HOST_B, cookieB, true)
  const s2 = await presenceState(user.$id)
  check('Stempel BLEIBT A (vor dem Fix flippte er hier auf B)',
    s2?.tenantId === TENANT_A, JSON.stringify(s2))
  check('und die Presence bleibt sichtbar (away wurde nicht gesetzt)',
    s2?.away === false, JSON.stringify(s2))

  console.log('\n3. Gegenprobe — GLEICHER Mandant: away muss durchkommen')
  // Sonst könnte ein Mensch mit nur EINEM Tab nie „im anderen Tab" melden:
  // seine eigene letzte sichtbare Presence trägt denselben Stempel.
  await heartbeat(HOST_A, cookieA, true)
  const s3 = await presenceState(user.$id)
  check('away ist gesetzt, Stempel weiterhin A',
    s3?.away === true && s3.tenantId === TENANT_A, JSON.stringify(s3))

  console.log('\n4. Gegenprobe — away über away bleibt bewusst Letzter-gewinnt')
  // Zwei versteckte Tabs, die sich gegenseitig sperren, hießen im Grenzfall:
  // niemand verlängert die Expiry und die Presence stirbt.
  await heartbeat(HOST_B, cookieB, true)
  const s4 = await presenceState(user.$id)
  check('Stempel wechselt zu B', s4?.tenantId === TENANT_B, JSON.stringify(s4))

  console.log('\n5. Leave-Guard — Hintergrund-Tab schließen radiert den sichtbaren nicht aus')
  await heartbeat(HOST_A, cookieA, false)
  const beforeLeave = await presenceState(user.$id)
  check('Ausgangslage: A sichtbar', beforeLeave?.tenantId === TENANT_A && beforeLeave.away === false,
    JSON.stringify(beforeLeave))
  const leaveB = await call(HOST_B, '/api/presence/leave', { method: 'POST', cookie: cookieB })
  check('leave über Host B → 200 (fail-soft wie bisher)', leaveB.status === 200, `Status ${leaveB.status}`)
  const s5 = await presenceState(user.$id)
  check('Presence LEBT weiter und trägt weiterhin A',
    s5?.tenantId === TENANT_A, JSON.stringify(s5))

  console.log('\n6. Gegenprobe — leave über den EIGENEN Host löscht wie immer')
  const leaveA = await call(HOST_A, '/api/presence/leave', { method: 'POST', cookie: cookieA })
  check('leave über Host A → 200', leaveA.status === 200, `Status ${leaveA.status}`)
  const s6 = await presenceState(user.$id)
  check('Presence ist weg', s6 === null, JSON.stringify(s6))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n7. Aufräumen')
  for (const id of created.presences) await adminPresences.delete({ presenceId: id }).catch(() => {})
  for (const id of created.users) await adminUsers.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ ${created.users.length} Nutzer + ${created.presences.length} Presences entfernt`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
