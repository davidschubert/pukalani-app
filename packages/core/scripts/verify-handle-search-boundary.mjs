/**
 * Beweis: die Handle-Grenze einer Community hält — beim LESEN und beim NEHMEN.
 *
 * ZWEI FRAGEN IN EINER DATEI, weil sie denselben teuren Aufbau brauchen (zwei
 * echte Communities auf einer Instanz, drei Konten, der echte Wizard):
 *   Abschnitte 1–7  — `GET /api/handles/search` reicht nicht über die Grenze.
 *   Abschnitte 8–10 — AH-7: der NAME gehört dem Konto, das PUBLIKUM der Community.
 *
 * ── WARUM ES DIESEN BEWEIS BRAUCHT ─────────────────────────────────────────
 * Seit AH-7 (2026-08-11) ist ein Handle GLOBAL eindeutig (`account_handles`,
 * Unique auf `handleLower` allein) — alle Communities einer Instanz legen ihre
 * Namen also in DIESELBE Tabelle, und zwar ohne jede Mandanten-Spalte. Eine
 * Vorschlagsliste, die dort über die Grenze greift, wäre die Mitgliederliste
 * von Kunde B in der Schreibfläche von Kunde A. Der bisherige Beweis
 * (`packages/posts/scripts/verify-mention-menu.mjs`) lief gegen `apps/comments`
 * — ein SILO, in dem es die Grenze gar nicht gibt. Deshalb hier: der Pool, mit
 * zwei echten Communities.
 *
 * ── DREI SCHICHTEN SEIT AH-7, EINZELN GEMESSEN ─────────────────────────────
 * Vor AH-7 hielten hier zwei Dinge: der Mandanten-FILTER der Datentür und die
 * Row-Permissions. Der Filter ist ersatzlos weg (keine `communityId`-Spalte
 * mehr), und die Row-Permissions allein reichen NICHT — genau das ist der
 * Befund, der beim Bau von AH-7 an diesem Beweis auffiel:
 *
 *   (1) DIE ROW-PERMISSIONS (`read(label:<communityId>)` je Mitgliedschaft,
 *       gestempelt bei der Vergabe und nachgetragen beim ersten Auftauchen).
 *       Sie sagen, WER eine Zeile lesen darf — aber ein Leser trägt selbst
 *       Labels aus mehreren Communities, und Appwrite fragt nicht, auf welchem
 *       HOST er gerade steht.
 *   (2) DAS MITGLIEDER-GATE der Route (`requireCommunityMembership`).
 *       Allein gemessen in Abschnitt 6: der Nachbar ist Mitglied von A und
 *       steht auf Host B; über sein Label A dürfte er die Zeile von Owner A
 *       lesen (der inzwischen auch zu B gehört) — abgewiesen wird er, weil er
 *       zu B nicht gehört.
 *   (3) DER PUBLIKUMS-FILTER auf die aktuelle Community. Allein gemessen in
 *       Abschnitt 5/5b: Owner A ist Mitglied BEIDER Communities, darf also
 *       beide Zeilen lesen und passiert jedes Gate — auf Host A sieht er
 *       @…_beta trotzdem nicht, weil diese Zeile B nicht in ihrem Publikum
 *       führt.
 *
 * Zu JEDER Sperre gehört die GEGENPROBE im selben Abschnitt. Ohne sie beweist
 * eine leere Antwort nur, dass die Suche kaputt ist.
 *
 * ── DER BEWEIS WAR SELBST GEGENGEPROBT (2026-08-05, VOR AH-7) ──────────────
 * Ein Beweis, der beim ersten Lauf grün ist, hat noch nichts gezeigt. Für die
 * damalige Fassung wurden vier absichtliche Mutationen gefahren (Filter weg,
 * `as: 'operator'`, Wache weg) und jede vom zuständigen Abschnitt gefangen.
 *
 * ── UND NACH DEM AH-7-UMBAU ERNEUT (2026-08-12) ────────────────────────────
 * Die Abschnitte messen seit AH-7 andere Schichten (Gate + Publikums-Filter
 * statt Mandanten-Filter), die Probe stand also wieder aus. Sie ist jetzt
 * gefahren — und hat sich gelohnt: der ERSTE Lauf war 41/44, das Rot war echt.
 *
 * DAS LOCH (gefunden 2026-08-12, im selben Zug gefixt): das Publikum wurde
 * bei der ANLAGE gestempelt. `ensureAccountHandle` schrieb
 * `accountHandlePermissions(pool, communityId, …)`, und `handle.get.ts` gatet
 * die Zugehörigkeit erst NACH dem Anlegen — ein Fremder bekam das Lese-Publikum
 * einer fremden Community allein dadurch, dass er dort seine Kontoseite
 * öffnete, und stand danach in deren Erwähnungs-Menü. `changeAccountHandle`
 * vergab dasselbe Publikum beim Umbenennen ein zweites Mal
 * (`handleAudienceWith` auf den AKTUELLEN Host). Beides ist entfernt; die
 * Anlage stempelt kein Label mehr, die Umbenennung ERBT nur noch, und das
 * mitgliedschafts-gegatete `ensureAccountHandleAudience` ist der EINZIGE
 * Schreiber von `read(label:…)` — gerufen aus `handle.get.ts` UND (neu)
 * `handle.patch.ts`. Ohne den zweiten Aufruf verlöre ein Mitglied, das seinen
 * ersten Namen per PATCH setzt, das Publikum seiner eigenen Community (in
 * genau diese Falle lief der erste Fix-Versuch: 37/44).
 *
 * DIE DREI MUTATIONEN, jede vom zuständigen Abschnitt gefangen — bei jeder
 * Wiederholung dieser Grenze erneut zu fahren:
 *   (a) `requireCommunityMembership` in `search.get.ts` entfernen ⇒ Abschnitt 6
 *       wird rot (der Nachbar sieht auf Host B @grenzprobe_alpha).
 *       Gemessen: 40/44 — nimmt Abschnitt 7 mit, denn dieselbe Wache
 *       erzwingt auch die Sitzung (Gast bekam 200 statt 401).
 *   (b) den `handleAudienceIncludes`-Filter entfernen ⇒ Abschnitt 5 wird rot
 *       (Owner A sieht auf Host A auch @grenzprobe_beta). Gemessen: 43/44.
 *   (c) `ensureAccountHandleAudience` in `handle.get.ts` entfernen ⇒ Abschnitt
 *       5b wird rot (das Publikum wächst nie). Gemessen: 41/44.
 *
 * BEIM MUTIEREN: die Bearbeitung löst einen Nitro-Neubau aus. Wer sofort
 * startet, verliert die laufende Anfrage — die `node:http`-Aufrufe hier haben
 * keinen Timeout und warten dann ewig (2026-08-12 live erwischt, 20 Minuten).
 * Erst den Neubau abwarten, dann fahren.
 *
 * ── AUFBAU ─────────────────────────────────────────────────────────────────
 * Zwei Wegwerf-Communities über den ECHTEN Wizard-Abschluss, zwei Owner, ein
 * Nachbar, dazu ein viertes Konto ohne jede Community (Abschnitt 9). Jeder
 * setzt seinen Namen über `PATCH /api/account/handle` — also über die
 * Produktionsroute, nicht per Admin-Client in die Tabelle geschrieben.
 * Das `finally` räumt alles wieder ab.
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 * Beide Dienste gehören DIR (CLAUDE.md, „Tests"): ein Beweis über eine
 * Service-Naht ist nur so ehrlich wie sein entferntester Dienst.
 *
 *   pnpm --filter control exec nuxi dev --port 3014
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3014 \
 *     pnpm --filter platform exec nuxi dev --port 3016
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/core/scripts/verify-handle-search-boundary.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { appwriteRest, createCleanup, probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig, Rest aus apps/control/.env).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

/**
 * Gemessen wird am KONTO-Register (AH-7, system-031). `community_handles`
 * (system-029) lebt daneben als Alt-Bestand weiter, vergibt aber nichts mehr —
 * ein Beweis, der dort nachsähe, prüfte die Vergangenheit.
 */
const HANDLES_TABLE = 'account_handles'
/** Gemeinsames Präfix — genau darum geht es: EINE Suche, zwei Communities. */
const PREFIX = 'grenzprobe'
const HANDLE_A = `${PREFIX}_alpha`
const HANDLE_B = `${PREFIX}_beta`
/** Der Name, den sich der Fremde von einem fremden Host aus nimmt (AH-7 §9). */
const HANDLE_SQUAT = `${PREFIX}_vorstand`
const ALL_HANDLES = [HANDLE_A, HANDLE_B, HANDLE_SQUAT]

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], tenantIds: [], members: [], handles: [] }

function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
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
        catch { /* HTML-Fehlerseite */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createPoolUser(tag) {
  const email = `handle-boundary-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Probe ${tag}` })
  cleanup.users.push(user.$id)
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse.
  await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })
  return { userId: user.$id, email, password }
}

/** Anmelden auf dem Kontroll-Host → Session-Cookie (host-übergreifend gesendet). */
async function login(account) {
  const res = await call(CONTROL_HOST, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-HANDLE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Handle-Grenze', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function createCommunity(cookie, slug, name, code) {
  const res = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: probeSiteBody({
      name,
      slug,
      description: 'Wegwerf-Community für den Beweis der Handle-Grenze.',
      vibe: 'elegant',
      inviteCode: code,
    }),
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Community "${slug}" nicht angelegt (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  // Der SPALTEN-Wert der Handle-Zeilen ist `tenantId`, nicht `communityId` —
  // zwei verschiedene Schlüssel (die Zeile trägt den einen, das Label den anderen).
  cleanup.tenantIds.push(res.json.tenantId)
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', res.json.communityId), Query.limit(25)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: res.json.communityId, tenantId: res.json.tenantId, host: res.json.host }
}

/** Die Suche als Liste von Handles — genau das, was das Menü anzeigt. */
async function search(host, cookie, q) {
  const res = await call(host, `/api/handles/search?q=${encodeURIComponent(q)}`, { cookie })
  return { status: res.status, handles: Array.isArray(res.json) ? res.json.map(r => r.label) : null, raw: res }
}

/** Mitgliedschaft anlegen (wie in verify-site-authz) + Label über einen Besuch. */
async function joinAs(account, cookie, community, host, role = 'viewer') {
  const row = await control.createRow({
    databaseId, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId: community.communityId,
      runtimeProjectId: poolProject,
      runtimeUserId: account.userId,
      role,
      status: 'active',
      email: account.email,
    },
  })
  cleanup.members.push(row.$id)
  // Das Label vergibt server/middleware/06.community-label.ts bei einem Besuch
  // auf dem Host — genau der Weg, den ein echtes Mitglied nimmt.
  await call(host, '/api/auth/me', { cookie })
  const labels = (await poolUsers.get({ userId: account.userId })).labels ?? []
  return labels.includes(community.communityId)
}

try {
  console.log(`\nHandle-Grenze: Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  console.log('1. Aufbau: zwei Communities auf DERSELBEN Instanz')
  const code = await issueCode()
  const ownerA = await createPoolUser('owner-a')
  const ownerB = await createPoolUser('owner-b')
  const neighbour = await createPoolUser('nachbar')
  const cookieA = await login(ownerA)
  const cookieB = await login(ownerB)
  const cookieN = await login(neighbour)

  const stamp = Date.now().toString(36)
  const siteA = await createCommunity(cookieA, `hgrenze-a-${stamp}`, 'Handle-Grenze A', code)
  const siteB = await createCommunity(cookieB, `hgrenze-b-${stamp}`, 'Handle-Grenze B', code)
  check('Community A angelegt', !!siteA.communityId, JSON.stringify(siteA))
  check('Community B angelegt', !!siteB.communityId, JSON.stringify(siteB))
  check('… es sind wirklich zwei verschiedene', siteA.communityId !== siteB.communityId)
  check('Host A antwortet', await waitForHost(siteA.host), siteA.host)
  check('Host B antwortet', await waitForHost(siteB.host), siteB.host)

  console.log('\n2. Zwei Namen mit GEMEINSAMEM Präfix — über die echte Route gesetzt')
  const setA = await call(siteA.host, '/api/account/handle', { method: 'PATCH', cookie: cookieA, body: { handle: HANDLE_A } })
  check(`Owner A heißt @${HANDLE_A}`, setA.status === 200 && setA.json?.handle === HANDLE_A,
    `Status ${setA.status} ${setA.text.slice(0, 160)}`)
  const setB = await call(siteB.host, '/api/account/handle', { method: 'PATCH', cookie: cookieB, body: { handle: HANDLE_B } })
  check(`Owner B heißt @${HANDLE_B}`, setB.status === 200 && setB.json?.handle === HANDLE_B,
    `Status ${setB.status} ${setB.text.slice(0, 160)}`)

  // Der Kern der Sache, mit dem Admin-Client nachgesehen: BEIDE Zeilen liegen in
  // DERSELBEN Tabelle. Wäre das nicht so, bewiese der Rest nichts.
  const rowsInTable = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('handleLower', [HANDLE_A, HANDLE_B]), Query.limit(10)],
  })
  cleanup.handles.push(...rowsInTable.rows.map(row => row.$id))
  const rowA = rowsInTable.rows.find(row => row.handleLower === HANDLE_A)
  const rowB = rowsInTable.rows.find(row => row.handleLower === HANDLE_B)
  check('beide Namen liegen in DERSELBEN Tabelle', rowsInTable.total === 2, `total=${rowsInTable.total}`)
  // SEIT AH-7 GIBT ES KEINE MANDANTEN-SPALTE MEHR. Vorher trennten zwei Dinge
  // diese Zeilen (die Spalte `communityId` UND das Lese-Publikum); jetzt ist es
  // genau eines — deshalb steht dieser Beweis überhaupt noch hier.
  check('… OHNE Mandanten-Spalte (der Name gehört dem Konto, nicht der Community)',
    rowA?.communityId === undefined && rowB?.communityId === undefined,
    `${JSON.stringify(rowA?.communityId)} / ${JSON.stringify(rowB?.communityId)}`)
  check('… getrennt EINZIG durch ihr Lese-Publikum read(label:<communityId>)',
    (rowA?.$permissions ?? []).includes(`read("label:${siteA.communityId}")`)
    && (rowB?.$permissions ?? []).includes(`read("label:${siteB.communityId}")`),
    `${JSON.stringify(rowA?.$permissions)} / ${JSON.stringify(rowB?.$permissions)}`)

  console.log('\n3. GEGENPROBE: die Suche funktioniert überhaupt')
  const ownFindA = await search(siteA.host, cookieA, PREFIX)
  check(`Owner A findet auf seinem Host @${HANDLE_A}`,
    ownFindA.status === 200 && ownFindA.handles?.includes(HANDLE_A),
    `Status ${ownFindA.status} ${JSON.stringify(ownFindA.handles)}`)
  const ownFindB = await search(siteB.host, cookieB, PREFIX)
  check(`Owner B findet auf seinem Host @${HANDLE_B}`,
    ownFindB.status === 200 && ownFindB.handles?.includes(HANDLE_B),
    `Status ${ownFindB.status} ${JSON.stringify(ownFindB.handles)}`)

  console.log('\n4. DIE GRENZE: derselbe Präfix, der fremde Name bleibt draußen')
  check(`Owner A sieht @${HANDLE_B} NICHT`, !ownFindA.handles?.includes(HANDLE_B), JSON.stringify(ownFindA.handles))
  check(`Owner B sieht @${HANDLE_A} NICHT`, !ownFindB.handles?.includes(HANDLE_A), JSON.stringify(ownFindB.handles))
  const exactB = await search(siteA.host, cookieA, HANDLE_B)
  check('… auch die Suche nach dem VOLLEN fremden Namen bleibt leer',
    exactB.status === 200 && exactB.handles?.length === 0, `Status ${exactB.status} ${JSON.stringify(exactB.handles)}`)
  const exactA = await search(siteB.host, cookieB, HANDLE_A)
  check('… und in der Gegenrichtung ebenso',
    exactA.status === 200 && exactA.handles?.length === 0, `Status ${exactA.status} ${JSON.stringify(exactA.handles)}`)

  console.log('\n5. Mehrfach-Mitgliedschaft: das Publikum ist eine LISTE, kein Schalter')
  // Owner A tritt Community B bei. Ab jetzt trägt SEIN KONTO beide Labels — er
  // darf also die Zeile von Owner B lesen. Was das NICHT ändert: dass Owner B
  // seinerseits nur zu B gehört. Vor AH-7 hielt hier der Mandanten-Filter der
  // Datentür; den gibt es nicht mehr, und genau deshalb wird hier gemessen,
  // dass die Grenze trotzdem an derselben Stelle liegt.
  check('Owner A ist jetzt auch Mitglied von B (beide Labels)',
    await joinAs(ownerA, cookieA, siteB, siteB.host))
  const bothLabels = (await poolUsers.get({ userId: ownerA.userId })).labels ?? []
  check('… nachgemessen an den Labels des Kontos',
    bothLabels.includes(siteA.communityId) && bothLabels.includes(siteB.communityId), JSON.stringify(bothLabels))

  const crossFind = await search(siteB.host, cookieA, PREFIX)
  check('GEGENPROBE: auf Host B sieht er @' + HANDLE_B + ' (das Label greift wirklich)',
    crossFind.status === 200 && crossFind.handles?.includes(HANDLE_B),
    `Status ${crossFind.status} ${JSON.stringify(crossFind.handles)}`)
  const homeFind = await search(siteA.host, cookieA, PREFIX)
  check('auf Host A bleibt es trotz Label B bei @' + HANDLE_A + ' — @' + HANDLE_B + ' hat dort kein Publikum',
    homeFind.status === 200 && homeFind.handles?.includes(HANDLE_A) && !homeFind.handles.includes(HANDLE_B),
    `Status ${homeFind.status} ${JSON.stringify(homeFind.handles)}`)

  console.log('\n5b. AH-7: das Publikum WÄCHST erst beim Auftauchen (ensureAccountHandleAudience)')
  // Vor dem ersten Blick auf die Kontoseite kennt B den Namen von Owner A
  // nicht: er ist Mitglied, aber seine ZEILE trägt B noch nicht. Genau dieses
  // Nachtragen ist der Ersatz für die weggefallene Mandanten-Spalte.
  const beforeAudience = await search(siteB.host, cookieB, HANDLE_A)
  check(`Owner B sieht @${HANDLE_A} noch NICHT (Publikum noch nicht nachgetragen)`,
    beforeAudience.status === 200 && beforeAudience.handles?.length === 0,
    `Status ${beforeAudience.status} ${JSON.stringify(beforeAudience.handles)}`)
  const touchB = await call(siteB.host, '/api/account/handle', { cookie: cookieA })
  check('… Owner A ruft auf Host B seine Kontoseite auf', touchB.status === 200 && touchB.json?.handle === HANDLE_A,
    `Status ${touchB.status} ${touchB.text.slice(0, 160)}`)
  const rowAfter = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('userId', ownerA.userId), Query.limit(5)],
  })
  check('… und SEINE Zeile trägt danach BEIDE Lese-Rollen',
    rowAfter.rows.some(row => (row.$permissions ?? []).includes(`read("label:${siteA.communityId}")`)
      && (row.$permissions ?? []).includes(`read("label:${siteB.communityId}")`)),
    JSON.stringify(rowAfter.rows.map(r => r.$permissions)))
  const afterAudience = await search(siteB.host, cookieB, HANDLE_A)
  check(`… erst JETZT schlägt B ihn vor (@${HANDLE_A})`,
    afterAudience.status === 200 && afterAudience.handles?.includes(HANDLE_A),
    `Status ${afterAudience.status} ${JSON.stringify(afterAudience.handles)}`)

  console.log('\n6. Der Fremde auf einem fremden Host — das MITGLIEDER-GATE (AH-7)')
  // Der Nachbar ist Mitglied von A, nicht von B. Vor AH-7 bekam er auf Host B
  // eine LEERE Liste (die Row-Permissions hielten allein). Das reicht seit dem
  // konto-weiten Register NICHT mehr: Owner A trägt inzwischen beide Labels,
  // seine ZEILE ebenso — und Appwrite fragt nicht, auf welchem Host jemand
  // steht. Ohne Gate sähe der Nachbar auf Host B also @grenzprobe_alpha, weil
  // er dessen Zeile über SEIN Label A lesen darf. Deshalb antwortet die Route
  // einem Nicht-Mitglied jetzt gar nicht mehr.
  check('Nachbar ist Mitglied von A', await joinAs(neighbour, cookieN, siteA, siteA.host))
  const neighbourLabels = (await poolUsers.get({ userId: neighbour.userId })).labels ?? []
  check('… und NICHT von B', !neighbourLabels.includes(siteB.communityId), JSON.stringify(neighbourLabels))

  const neighbourHome = await search(siteA.host, cookieN, PREFIX)
  check('GEGENPROBE: auf Host A findet er @' + HANDLE_A,
    neighbourHome.status === 200 && neighbourHome.handles?.includes(HANDLE_A),
    `Status ${neighbourHome.status} ${JSON.stringify(neighbourHome.handles)}`)
  const neighbourAway = await search(siteB.host, cookieN, PREFIX)
  check('auf Host B wird er ABGEWIESEN (403) — das Gate hält',
    neighbourAway.status === 403, `Status ${neighbourAway.status} ${neighbourAway.raw.text.slice(0, 160)}`)
  check('… mit fachlichem Grund im Envelope (reason: not_a_member)',
    neighbourAway.raw.json?.reason === 'not_a_member', JSON.stringify(neighbourAway.raw.json))

  console.log('\n7. Ohne Sitzung gibt es gar nichts')
  for (const [label, host] of [['A', siteA.host], ['B', siteB.host]]) {
    const res = await search(host, undefined, PREFIX)
    check(`Gast auf Host ${label} → 401`, res.status === 401, `Status ${res.status}`)
  }

  /**
   * ── WAS AH-7 AN H1 ÄNDERT (2026-08-11) ────────────────────────────────────
   * H1 (2026-08-05) schloss eine Lücke, die es SO nicht mehr gibt: solange ein
   * Handle je Community galt, konnte sich ein Fremder durch den ganzen Pool
   * arbeiten und überall `@vorstand` wegschnappen — eine Zeile je Community,
   * jede für immer belegt. Im konto-weiten Register hält ein Konto GENAU EINEN
   * Namen; der Angriff ist nicht abgesichert, sondern nicht mehr formulierbar.
   *
   * Was dafür NEU gilt und hier gemessen wird, weil es Davids Entscheidung ist
   * und keine Nachlässigkeit: der Namensraum ist GLOBAL. Wer zuerst kommt,
   * behält — auch wenn er mit der Community, die den Namen gern hätte, nichts
   * zu tun hat. Was H1 wirklich geschützt hat, hält weiter: SICHTBAR wird
   * niemand in einer Community, zu der er nicht gehört.
   */
  console.log('\n8. AH-7: der Fremde bekommt einen KONTO-Namen — aber kein Publikum in B')
  const rowsOfNeighbour = () => poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('userId', neighbour.userId), Query.limit(25)],
  })
  const beforeRows = await rowsOfNeighbour()
  const mineAway = await call(siteB.host, '/api/account/handle', { cookie: cookieN })
  check('GET /api/account/handle auf dem fremden Host → 200 (kein roher Fehler)',
    mineAway.status === 200, `Status ${mineAway.status} ${mineAway.text.slice(0, 160)}`)
  check('… und vergibt einen Namen, denn der gehört dem KONTO', !!mineAway.json?.handle,
    JSON.stringify(mineAway.json))

  const afterRows = await rowsOfNeighbour()
  cleanup.handles.push(...afterRows.rows.map(row => row.$id))
  check('… es bleibt bei GENAU EINER Zeile — nicht einer je Community',
    afterRows.total <= 1 && afterRows.total >= beforeRows.total,
    `vorher ${beforeRows.total}, nachher ${afterRows.total}`)
  check('… und sie trägt KEIN Lese-Publikum der fremden Community B',
    !(afterRows.rows[0]?.$permissions ?? []).includes(`read("label:${siteB.communityId}")`),
    JSON.stringify(afterRows.rows[0]?.$permissions))

  const bSuggests = await search(siteB.host, cookieB, mineAway.json?.handle ?? 'probe')
  check('… und das Erwähnungs-Menü von B kennt ihn NICHT',
    bSuggests.status === 200 && bSuggests.handles?.length === 0,
    `Status ${bSuggests.status} ${JSON.stringify(bSuggests.handles)}`)

  console.log('\n9. AH-7: der Namensraum ist GLOBAL — wer zuerst kam, behält')
  const squat = await call(siteB.host, '/api/account/handle', {
    method: 'PATCH', cookie: cookieN, body: { handle: HANDLE_SQUAT },
  })
  check(`PATCH auf dem fremden Host → 200 (ein Konto-Name hängt an keinem Host)`,
    squat.status === 200 && squat.json?.handle === HANDLE_SQUAT,
    `Status ${squat.status} ${squat.text.slice(0, 160)}`)

  // Die Kehrseite derselben Entscheidung, ausdrücklich gemessen: der Name ist
  // damit für JEDEN anderen weg. Geprüft mit einem FRISCHEN Konto — die drei
  // aus Abschnitt 2/9 sitzen jetzt alle in der 30-Tage-Sperrfrist, und die
  // gilt seit AH-7 ebenfalls konto-weit.
  const fremder = await createPoolUser('fremder')
  const cookieF = await login(fremder)
  const taken = await call(siteA.host, '/api/account/handle', {
    method: 'PATCH', cookie: cookieF, body: { handle: HANDLE_SQUAT },
  })
  check(`@${HANDLE_SQUAT} ist danach WELTWEIT vergeben (409 taken)`,
    taken.status === 409 && taken.json?.reason === 'taken',
    `Status ${taken.status} ${taken.text.slice(0, 160)}`)

  const bAfterSquat = await search(siteB.host, cookieB, HANDLE_SQUAT)
  check('… und trotzdem steht der Fremde NICHT im Menü von B',
    bAfterSquat.status === 200 && bAfterSquat.handles?.length === 0,
    `Status ${bAfterSquat.status} ${JSON.stringify(bAfterSquat.handles)}`)

  console.log('\n10. GEGENPROBE: EIN Name, überall derselbe')
  const mineHome = await call(siteA.host, '/api/account/handle', { cookie: cookieN })
  check('auf SEINEM Host trägt derselbe Mensch denselben Namen',
    mineHome.status === 200 && mineHome.json?.handle === HANDLE_SQUAT,
    `Status ${mineHome.status} ${JSON.stringify(mineHome.json)}`)
  const homeSuggests = await search(siteA.host, cookieN, HANDLE_SQUAT)
  check('… und SEINE Community schlägt ihn vor (das Publikum wurde nachgetragen)',
    homeSuggests.status === 200 && homeSuggests.handles?.includes(HANDLE_SQUAT),
    `Status ${homeSuggests.status} ${JSON.stringify(homeSuggests.handles)}`)
  const tooSoon = await call(siteA.host, '/api/account/handle', {
    method: 'PATCH', cookie: cookieN, body: { handle: `${PREFIX}_zweitversuch` },
  })
  check('… und die 30-Tage-Sperrfrist gilt ebenfalls konto-weit (change_too_soon)',
    tooSoon.status === 400 && tooSoon.json?.reason === 'change_too_soon',
    `Status ${tooSoon.status} ${tooSoon.text.slice(0, 160)}`)
  const ownerStillWorks = await call(siteA.host, '/api/account/handle', { cookie: cookieA })
  check('… und Owner A behält seinen',
    ownerStillWorks.status === 200 && ownerStillWorks.json?.handle === HANDLE_A,
    `Status ${ownerStillWorks.status} ${JSON.stringify(ownerStillWorks.json)}`)

  const guestMine = await call(siteA.host, '/api/account/handle', {})
  check('ohne Sitzung bleibt es bei 401 (die Wache ersetzt sie nicht)',
    guestMine.status === 401, `Status ${guestMine.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n11. Aufräumen')
  // Handle-Zeilen liegen im POOL-Projekt, alles andere im Control Plane.
  // Gesucht wird über BEIDE Wege: die gesetzten Namen UND alles, was den
  // Wegwerf-Konten gehört (die automatische Vergabe erfindet Namen selbst —
  // `probenachbar`, `probeownera`, … — die keine Konstante hier kennt).
  const strays = await poolDb.listRows({
    databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
    queries: [Query.equal('handleLower', ALL_HANDLES), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  // Konto-Zeilen tragen keine communityId mehr (AH-7) — gesucht wird über die
  // Wegwerf-Konten selbst.
  const mine = cleanup.users.length
    ? await poolDb.listRows({
        databaseId: poolDatabaseId, tableId: HANDLES_TABLE,
        queries: [Query.equal('userId', cleanup.users), Query.limit(100)],
      }).catch(() => ({ rows: [] }))
    : { rows: [] }
  strays.rows.push(...mine.rows)
  for (const id of new Set([...cleanup.handles, ...strays.rows.map(row => row.$id)])) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: HANDLES_TABLE, rowId: id }).catch(() => {})
  }
  // Eine Anlage über die echte Route hinterlässt mehr als Community und
  // Konto (Seiten, ersten Beitrag, Kategorie, Zustimmung, Protokoll, im
  // Control Plane die Testphase). Das Register der gemeinsamen Hilfe löscht
  // nach Stempel- und Personen-Spalten und zählt danach nach.
  const register = createCleanup({
    pool: appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script: 'verify-handle-search-boundary (Pool)' }),
    control: appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script: 'verify-handle-search-boundary (Control)' }),
    poolDatabaseId, controlDatabaseId: databaseId,
  })
  for (const id of cleanup.users) register.track('account', id)
  for (const id of cleanup.members) register.track('member', id)
  for (const id of cleanup.tenants) register.track('community', id)
  for (const id of cleanup.tenantIds) register.track('tenant', id)
  for (const id of cleanup.codes) register.track('inviteCode', id)
  const { leftovers } = await register.run().catch(error => ({ leftovers: [`Aufräumen abgebrochen: ${error?.message || error}`] }))
  check(`nachgezählt: nichts übrig (${cleanup.users.length} Konten, ${cleanup.tenants.length} Communities samt Spuren)`, leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
