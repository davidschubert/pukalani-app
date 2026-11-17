#!/usr/bin/env node
/**
 * Beweis: Benachrichtigungs-MAILS verlinken auf den Host DER COMMUNITY (D5).
 *
 * DIE FRAGE, DIE DIESER BEWEIS BEANTWORTET: die Glocke in der App war seit C15
 * mandantenrichtig, die Mail nicht — jede URL kam aus EINER Env-Basis
 * (`public.appUrl`). Eine Antwort in „Kunde A" verlinkte damit auf den
 * App-Host: ein Pfad, den es dort nicht gibt, auf einer Domain, für die der
 * Empfänger nicht einmal ein Session-Cookie hat.
 *
 * Geprüft werden BEIDE Wege und alle drei Ablage-Werte:
 *   1. SOFORT-MAIL über den ECHTEN Weg — ein Nutzer antwortet über
 *      `POST /api/comments` auf dem Mandanten-Host auf einen fremden Kommentar,
 *      notify() feuert, die Mail landet in Mailpit. Kein nachgebauter Aufruf:
 *      Route, Datentür, notify(), Resolver und Mailer laufen wie im Betrieb.
 *   2. DIGEST — EINE Sammel-Mail mit drei Einträgen aus DREI Welten
 *      (Community A · Community B · Kundenbereich `_account`). Das ist der
 *      eigentliche Härtefall: der Sweep bündelt bewusst mandantenübergreifend
 *      (eine Mail pro Tag, nicht eine je Community), also muss jeder EINTRAG
 *      seinen eigenen Host tragen — nicht die Mail einen gemeinsamen.
 *   3. GEGENPROBE — die Community-Links sind nachweislich NICHT die App-Basis
 *      (sonst wäre der Beweis grün, obwohl sich nichts geändert hat).
 *
 * VORAUSSETZUNGEN (alle lokal, nichts davon zeigt auf Produktion):
 *   - Appwrite lokal, Pool-Projekt mit zwei Communities im Control Plane —
 *     Hosts und Ablage-Werte aus TENANT_HOST_A/_B und TENANT_ID_A/_B (die
 *     Bühne nennt sie: `pnpm buehne env`; ohne Angabe `t-kunde-a`/`t-kunde-b`).
 *   - Control Plane mit Schreibrecht (NUXT_PLATFORM_CONTROL_*): die Antwort in
 *     Schritt 1 ist ein erster Beitrag eines frischen Kontos und damit nur bei
 *     OFFENER Registrierung erlaubt (SEC-030). Das Skript öffnet die
 *     Registrierung von A deshalb selbst und stellt den gelesenen Wert zurück.
 *   - Mailpit (SMTP 1025, API 8025).
 *   - platform-Dev-Server MIT Mailer und App-Basis:
 *       NUXT_SMTP_HOST=localhost NUXT_SMTP_PORT=1025 \
 *       NUXT_SMTP_FROM=noreply@pukalani.test \
 *       NUXT_PUBLIC_APP_URL=http://app.localhost:3006 \
 *       pnpm --filter platform dev
 *     (die drei Werte stehen bewusst nicht in apps/platform/.env — der
 *     Mail-Versand ist im Alltag lokal aus.)
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis:
 *   node --env-file=apps/platform/.env \
 *     packages/core/scripts/verify-notification-mail-links.mjs
 *
 * Auf der Bühne: `pnpm buehne run --only verify-notification-mail-links`.
 *
 * Selbst-aufräumend: alle angelegten Nutzer und Zeilen werden am Ende gelöscht
 * (auch im Fehlerfall), samt der Mitglieds-Zeile des Beitritts; danach wird
 * nachgezählt. Die Mails bleiben in Mailpit stehen — sie sind der Beweis und
 * tragen eindeutige Adressen.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request as httpRequest } from 'node:http'
import { Client, ID, Permission, Role, TablesDB, Users } from 'node-appwrite'
import { appwriteRest, createCleanup, PROBE_EMAIL_DOMAIN, Q } from '../../../scripts/lib/probe-stage.mjs'

const PLATFORM_PORT = Number(process.env.PLATFORM_PORT || 3006)
/** Kontroll-Host der Platform-App (lokal, s. NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). */
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
/** Zwei geseedete Mandanten-Hosts + ihre Ablage-Werte (`communities.tenantId`). */
const HOST_A = process.env.TENANT_HOST_A || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_HOST_B || 'kunde-b.localhost'
const TENANT_A = process.env.TENANT_ID_A || 't-kunde-a'
const TENANT_B = process.env.TENANT_ID_B || 't-kunde-b'
/** Muss zu NUXT_PUBLIC_APP_URL des laufenden Dev-Servers passen. */
const APP_URL = (process.env.APP_URL || `http://${CONTROL_HOST}:${PLATFORM_PORT}`).replace(/\/+$/, '')
const MAILPIT = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/+$/, '')

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/platform/.env aufrufen.')
  process.exit(1)
}

/** Der Sentinel aus core/shared/notificationScope.ts — hier absichtlich als
 *  Literal, damit der Beweis den Spaltenwert prüft und nicht die Konstante. */
const ACCOUNT = '_account'

const controlEnv = {
  endpoint: process.env.NUXT_PLATFORM_CONTROL_ENDPOINT,
  projectId: process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID,
  databaseId: process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID,
  key: process.env.NUXT_PLATFORM_CONTROL_KEY,
}
if (!controlEnv.endpoint || !controlEnv.projectId || !controlEnv.databaseId || !controlEnv.key) {
  console.error('✗ Control Plane fehlt (NUXT_PLATFORM_CONTROL_ENDPOINT/_PROJECT_ID/_DATABASE_ID/_KEY mit Schreibrecht) — er öffnet die Registrierung von A und räumt die Mitglieds-Zeile weg.')
  process.exit(1)
}
const control = appwriteRest({ ...controlEnv, script: 'verify-notification-mail-links (Control)' })
/** Registrierung von A, wie sie vorher war ({ rowId, openRegistration }). */
const registrationRestore = []

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

let pass = 0
let fail = 0
const cleanup = { users: [], rows: [] }
/** Probe-Adressen: immer unter der nie zustellbaren Test-Domain. */
const probeAddress = (kind, stamp) => `d5-${kind}-${stamp}@${PROBE_EMAIL_DOMAIN}`

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * node:http über ::1 — Node's `fetch` verwirft einen eigenen Host-Header, und
 * genau der entscheidet hier über die Welt (Mandant vs. Kontroll-Host). Nitro
 * hört im Dev auf IPv6.
 */
function call(host, path, { method = 'GET', body, cookie, accept } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = httpRequest({
      host: '::1', port: PLATFORM_PORT, path, method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
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

async function login(host, account) {
  const res = await call(host, '/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  return res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0] ?? ''
}

/** Nutzer mit VERIFIZIERTER Adresse + Mail-Einstellung (der Opt-in-Zweig
 *  schickt nur an verifizierte Adressen — Spam-Schutz aus notificationEmail.ts). */
async function createRecipient(stamp, kind, mode) {
  const account = { email: probeAddress(kind, stamp), password: `Pw-${ID.unique()}` }
  const user = await users.create({ userId: ID.unique(), email: account.email, password: account.password, name: `D5 ${kind}` })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  await users.updatePrefs({ userId: user.$id, prefs: { emailNotifications: mode, emailLocale: 'de' } })
  account.id = user.$id
  return account
}

/** Eine Notification anlegen, GENAU wie notify() es tut (Empfänger-Permissions,
 *  communityId als Ablage-Merkmal). */
async function seedNotification(recipientId, { communityId, link, title }) {
  const row = await db.createRow({
    databaseId, tableId: 'notifications', rowId: ID.unique(),
    data: { recipientId, type: 'reply', title, body: 'D5-Beweis', link, read: false, communityId },
    permissions: [Permission.read(Role.user(recipientId)), Permission.update(Role.user(recipientId))],
  })
  cleanup.rows.push({ table: 'notifications', id: row.$id })
  return row
}

async function mailpit(path) {
  const res = await fetch(`${MAILPIT}${path}`)
  if (!res.ok) throw new Error(`Mailpit ${path} → ${res.status}`)
  return await res.json()
}

/** Wartet auf genau die Mails an EINE Adresse (der Versand läuft nebenläufig). */
async function mailsTo(address, attempts = 40, delay = 250) {
  for (let i = 0; i < attempts; i++) {
    const found = await mailpit(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
    if (found.messages?.length) {
      const bodies = []
      for (const message of found.messages) bodies.push(await mailpit(`/api/v1/message/${message.ID}`))
      return bodies
    }
    await new Promise(r => setTimeout(r, delay))
  }
  return []
}

/** Alle http(s)-URLs eines Mail-Textes (Text-Teil reicht — HTML trägt dieselben). */
function urlsIn(message) {
  return [...new Set((message.Text || '').match(/https?:\/\/[^\s"'<>)]+/g) ?? [])]
}

try {
  console.log(`\nBeweis „Mail-Links zeigen auf die Community" (D5) — platform :${PLATFORM_PORT}`)
  console.log(`Projekt ${projectId} · App-Basis ${APP_URL} · Mailpit ${MAILPIT}\n`)

  // Vorbedingungen laut sagen — ein fehlender Mailer sähe sonst wie ein
  // fehlgeschlagener Versand aus.
  const health = await call(CONTROL_HOST, '/api/health')
  if (health.status !== 200) {
    console.error(`✗ platform-Dev-Server antwortet nicht (${health.status}) — läuft er auf :${PLATFORM_PORT}?`)
    process.exit(1)
  }
  await mailpit('/api/v1/messages?limit=1').catch(() => {
    console.error(`✗ Mailpit nicht erreichbar unter ${MAILPIT}`)
    process.exit(1)
  })

  // Der Konto-Eintrag im Digest verlinkt auf die App-Basis des SERVERS
  // (NUXT_PUBLIC_APP_URL). Läuft er ohne sie, kann Schritt 2 nicht grün
  // werden — das hier laut sagen statt es wie einen Fehler im Code aussehen
  // zu lassen. Gelesen aus der öffentlichen Konfiguration einer Seite, nicht
  // aus der Mail, die danach geprüft wird.
  const loginPage = await call(CONTROL_HOST, '/de/login', { accept: 'text/html' })
  const serverAppUrl = loginPage.text.match(/appUrl:"([^"]*)"/)?.[1]
  if (serverAppUrl !== undefined && serverAppUrl.replace(/\/+$/, '') !== APP_URL) {
    console.log(`  ⓘ Vorbedingung verletzt: der Server läuft mit NUXT_PUBLIC_APP_URL=„${serverAppUrl}", erwartet ${APP_URL} — der Konto-Eintrag in Schritt 2 wird deshalb rot.\n`)
  }

  const stamp = Date.now().toString(36)

  // ──────────────────────────────────────────────────────────────────────────
  console.log('1. Sofort-Mail über den ECHTEN Weg (Antwort auf einen Kommentar)')

  const replyTarget = await createRecipient(stamp, 'sofort', 'instant')
  const author = { email: probeAddress('autor', stamp), password: `Pw-${ID.unique()}` }
  const authorUser = await users.create({ userId: ID.unique(), email: author.email, password: author.password, name: 'D5 Antwortende' })
  cleanup.users.push(authorUser.$id)

  // Eltern-Kommentar in Community A — geschrieben wie die Datentür ihn stempelt.
  const targetId = `d5-thread-${stamp}`
  const parentUrl = `/de/threads/${targetId}`
  const parent = await db.createRow({
    databaseId, tableId: 'comments', rowId: ID.unique(),
    data: {
      targetId, targetType: 'page', content: 'D5 Ausgangskommentar', parentId: null, rootId: null,
      depth: 0, editedAt: null, authorId: replyTarget.id, authorName: 'D5 sofort', targetUrl: parentUrl,
      upvotes: 0, downvotes: 0, score: 0, status: 'active', communityId: TENANT_A,
    },
    permissions: [Permission.read(Role.any())],
  })
  cleanup.rows.push({ table: 'comments', id: parent.$id })

  const authorCookie = await login(HOST_A, author)
  check(`Anmeldung auf ${HOST_A} erfolgreich`, !!authorCookie)

  // Die Antwort ist der erste Beitrag eines frischen Kontos — ein Beitritt,
  // den es nur bei offener Registrierung gibt (SEC-030). A ausdrücklich
  // öffnen statt es vorauszusetzen; der gelesene Wert kommt im finally zurück.
  // Der Beitritt liest die Zeile frisch, ein Warten auf Caches entfällt.
  const siteA = (await control.listRows(controlEnv.databaseId, 'communities', [Q.equal('host', HOST_A), Q.limit(1)])).rows[0]
  if (!siteA) throw new Error(`Community ${HOST_A} nicht im Control Plane gefunden.`)
  registrationRestore.push({ rowId: siteA.$id, openRegistration: siteA.openRegistration })
  await control.updateRow(controlEnv.databaseId, 'communities', siteA.$id, { openRegistration: true })

  const reply = await call(HOST_A, '/api/comments', {
    method: 'POST', cookie: authorCookie,
    body: { targetId, targetType: 'page', content: 'D5 Antwort — bitte ansehen', parentId: parent.$id, targetUrl: parentUrl },
  })
  check('Antwort über die echte Route angelegt', reply.status === 200 || reply.status === 201,
    `${reply.status} ${reply.text.slice(0, 200)}`)
  if (reply.json?.$id ?? reply.json?.comment?.$id) {
    cleanup.rows.push({ table: 'comments', id: reply.json.$id ?? reply.json.comment.$id })
  }

  const instantMails = await mailsTo(replyTarget.email)
  check('genau EINE Sofort-Mail zugestellt', instantMails.length === 1, `${instantMails.length} Mails`)
  const instantUrls = instantMails[0] ? urlsIn(instantMails[0]) : []
  const expectedInstant = `http://${HOST_A}${parentUrl}`
  console.log(`     Links in der Mail: ${instantUrls.join(' | ') || '—'}`)
  check(`Link zeigt auf ${expectedInstant}`, instantUrls.includes(expectedInstant), instantUrls.join(' | '))
  check('GEGENPROBE: der Link ist NICHT die App-Basis (das war der Fehler)',
    instantUrls.length > 0 && !instantUrls.some(url => url.startsWith(`${APP_URL}/de/threads/`)))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2. Digest — EINE Mail, DREI Welten')

  const digest = await createRecipient(stamp, 'digest', 'digest')
  await seedNotification(digest.id, { communityId: TENANT_A, link: `/de/threads/a-${stamp}`, title: 'D5 A' })
  await seedNotification(digest.id, { communityId: TENANT_B, link: `/de/threads/b-${stamp}`, title: 'D5 B' })
  await seedNotification(digest.id, { communityId: ACCOUNT, link: '/dashboard/billing', title: 'D5 Konto' })

  // Betreiber-Session für den Sweep-Auslöser (system.manage). Der Sweep selbst
  // ist mandantenübergreifend — der Host des Auslösers ist ihm egal.
  const operator = { email: probeAddress('op', stamp), password: `Pw-${ID.unique()}` }
  const operatorUser = await users.create({ userId: ID.unique(), email: operator.email, password: operator.password, name: 'D5 Betreiber' })
  cleanup.users.push(operatorUser.$id)
  await users.updateLabels({ userId: operatorUser.$id, labels: ['admin'] })
  const operatorCookie = await login(CONTROL_HOST, operator)

  const sweep = await call(CONTROL_HOST, '/api/notifications/run-digest', { method: 'POST', cookie: operatorCookie })
  check('Digest-Sweep ausgelöst', sweep.status === 200, `${sweep.status} ${sweep.text.slice(0, 200)}`)

  const digestMails = await mailsTo(digest.email)
  check('genau EINE Sammel-Mail zugestellt', digestMails.length === 1, `${digestMails.length} Mails`)
  const digestUrls = digestMails[0] ? urlsIn(digestMails[0]) : []
  console.log(`     Links in der Mail: ${digestUrls.join(' | ') || '—'}`)
  check(`Eintrag A → http://${HOST_A}/de/threads/a-${stamp}`, digestUrls.includes(`http://${HOST_A}/de/threads/a-${stamp}`))
  check(`Eintrag B → http://${HOST_B}/de/threads/b-${stamp}`, digestUrls.includes(`http://${HOST_B}/de/threads/b-${stamp}`))
  check(`Konto-Eintrag → ${APP_URL}/dashboard/billing`, digestUrls.includes(`${APP_URL}/dashboard/billing`))
  check('GEGENPROBE: drei verschiedene Hosts in EINER Mail',
    new Set(digestUrls.map(url => new URL(url).host)).size === 3,
    [...new Set(digestUrls.map(url => new URL(url).host))].join(' | '))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  for (const { rowId, openRegistration } of registrationRestore) {
    await control.updateRow(controlEnv.databaseId, 'communities', rowId, { openRegistration }).catch((error) => {
      fail++
      console.log(`  ✗ Registrierung von ${rowId} nicht zurückgestellt — ${error?.message ?? error}`)
    })
  }
  for (const row of cleanup.rows) {
    await db.deleteRow({ databaseId, tableId: row.table, rowId: row.id }).catch(() => {})
  }
  // Das Register der gemeinsamen Hilfe löscht, was über eine Personen-Spalte
  // an den Konten hängt (Benachrichtigungen, Kommentare, die Mitglieds-Zeile
  // des Beitritts im Control Plane), löscht die Konten und zählt nach.
  const register = createCleanup({
    pool: appwriteRest({ endpoint, projectId, key: apiKey, script: 'verify-notification-mail-links' }),
    control, poolDatabaseId: databaseId, controlDatabaseId: controlEnv.databaseId,
  })
  for (const id of cleanup.users) register.track('account', id)
  for (const row of cleanup.rows) register.track('poolRow', `${row.table}/${row.id}`)
  const { leftovers } = await register.run().catch(error => ({ leftovers: [`Aufräumen abgebrochen: ${error?.message ?? error}`] }))
  for (const { rowId, openRegistration } of registrationRestore) {
    const row = await control.getRow(controlEnv.databaseId, 'communities', rowId).catch(() => null)
    if (row?.openRegistration !== openRegistration) leftovers.push(`Registrierung von ${rowId}`)
  }
  check(`nachgezählt: nichts übrig (${cleanup.users.length} Konten samt Spuren, Registrierung zurück)`, leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} bestanden, ${fail} fehlgeschlagen`)
  process.exit(fail === 0 ? 0 : 1)
}
