/**
 * Beweis für Paket G3 „Teilen sichtbar" (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §5, Zeile G3) — gegen einen
 * echten Server, weil keine pure Funktion belegen kann, was an Route, Ablage
 * und Kopfzeilen hängt:
 *
 *  1. ZUSTAND: `GET …/profiles/:id/share` meldet ohne Link `active: null`,
 *     nach dem Veröffentlichen die Zeile MIT Ablaufdatum — und in keinem Fall
 *     einen Token.
 *  2. VERÖFFENTLICHEN: der Token steht genau einmal in der Antwort, 64 Zeichen
 *     hex, Frist 30 Tage.
 *  3. DIE SEITE: `/brand/share/<token>` antwortet 200 und zeigt die
 *     Festlegung — mit den vier Schutz-Köpfen (`X-Robots-Tag`,
 *     `Referrer-Policy`, `Cache-Control`, `frame-ancestors 'none'`). Der
 *     letzte ist der teuerste: der Core stempelt jeder SSR-Seite `'self'` auf,
 *     und ohne den Eintrag in der Verbots-Registry gewänne dieser Default.
 *  4. NICHTS INTERNES: weder die Seite noch die API zeigen den bestätigten
 *     Beschwerde-Text — obwohl er bestätigt in der Zeile steht.
 *  5. ALT-SNAPSHOT (§4): eine Zeile, die den Beschwerde-Text WÖRTLICH im
 *     eingefrorenen Abbild trägt (so entstand jeder Snapshot vor MV1 M5),
 *     gibt ihn trotzdem nicht heraus — der Filter sitzt seit G3 auch im
 *     Lesepfad.
 *  6. WIDERRUF: Seite und API antworten danach 404.
 *  7. ABLAUF: eine Zeile mit `expiresAt` in der Vergangenheit ⇒ 404, wie
 *     unbekannt.
 *  8. FREMD: der Zustand eines fremden Brandings ist 404, nicht 403.
 *  9. EREIGNISSE: `share.viewed` und `foundation.viewed` stehen im Funnel —
 *     und KEIN Ereignis dieses Brandings trägt den Token.
 * 10. BRAND DESIGN (D8/D9): jedes neue Abbild trägt `schemaVersion: 2` — und
 *     weder ein KI-Entwurf noch ein Vorbild reist mit, auch dann nicht, wenn
 *     ihre Slots bestätigt in der Ablage stehen (§1.11 b). Seit D9 fällt das
 *     ganze KAPITEL: auch ein reisefähiger Design-Wert (`h.base`) steht nicht
 *     mehr roh in `chapters` — die visuelle Identität reist als Preset.
 *
 * ── DIE GEGENPROBE ────────────────────────────────────────────────────────
 * Mit `VERIFY_EXPECT_LEAK=1` dreht das Skript die Zusagen 4, 5 und 10 um: es
 * ERWARTET dann den Beschwerde-Text und MUSS rot werden. Ein „enthält nicht"
 * ist sonst auch für eine Antwort grün, die gar nichts enthält — die positiven
 * Zusagen (der Pitch steht da) sind die zweite Hälfte desselben Gedankens.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`-Tabellen und ein Dev-Server der
 * branding-App AUS DEM WORKTREE (CLAUDE.md „Tests"). Konto, Beta-Zugang und
 * Branding legt das Skript selbst an und räumt am Ende alles weg.
 *
 *   pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-share.mjs
 *
 * `--base=http://localhost:3016` tut dasselbe, wenn ein anderer Worktree den
 * Standard-Port belegt.
 */
import { createHash, randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const baseArg = process.argv.slice(2).find(arg => arg.startsWith('--base='))
const baseUrl = baseArg ? new URL(baseArg.slice('--base='.length)) : null
const PORT = Number(baseUrl?.port || process.env.BRANDING_PORT || 3016)
const HOST = baseUrl?.hostname || process.env.BRANDING_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  process.exit(1)
}

/** Erwartet das Skript ein LECK? Nur für die Gegenprobe (s. Kopf). */
const EXPECT_LEAK = process.env.VERIFY_EXPECT_LEAK === '1'

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], shares: [] }

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

/**
 * DIE EINE ZUSAGE, DIE SICH UMDREHEN LÄSST: „dieser Text steht NICHT darin".
 * Mit `VERIFY_EXPECT_LEAK=1` wird daraus „er steht darin" — und weil er es
 * nicht tut, ist der Lauf rot. So ist bewiesen, dass die Prüfung wirklich in
 * den Text sieht und nicht nur an einer leeren Antwort vorbeiläuft.
 */
function checkAbsent(label, haystack, needle, detail = '') {
  const present = String(haystack ?? '').includes(needle)
  check(label, EXPECT_LEAK ? present : !present, detail || (present ? 'gefunden' : 'nicht gefunden'))
}

/**
 * Nitro hört auf `[::1]`; Node's `fetch` verwirft einen eigenen Host-Header
 * (CLAUDE.md, „Beweise"). Deshalb node:http über ::1 mit gesetztem Host.
 */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: HOST === 'localhost' ? '::1' : HOST,
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
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
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const stamp = Date.now()

/** Ein Konto MIT Beta-Zugang — der Fremde braucht ihn auch, sonst bewiese sein 404 nur das Tor. */
async function makeAccount(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `g3-share-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'G3-Share-Beweis',
  })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  const access = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_access',
    rowId: ID.unique(),
    data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
  })
  cleanup.access.push(access.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

async function setSlots(profileId, stepKey, slots) {
  await tablesDB.updateRow({
    databaseId,
    tableId: 'brand_steps',
    rowId: `${profileId}_${stepKey}`,
    data: { slots: JSON.stringify(slots) },
  })
}

/** Dieselbe Rechnung wie `server/utils/brandShares.ts` — ohne Salz, sha256. */
function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Ein wiedererkennbarer Wert je Sorte — der eine reist, der andere nie. */
const PITCH = 'Roesterei mit Ausschank auf Oahu G3BEWEIS'
const COMPLAINT = 'Zweimal war die Suppe um 13 Uhr alle G3GEHEIM'
/** Die zwei privaten Sorten aus Brand Design (D2a/D5c) — sie reisen NIE. */
const DRAFT_SECRET_DRAFT = 'D8GEHEIM-KI-ENTWURF-SIEGEL'
const DRAFT_SECRET_REFERENCE = 'D8GEHEIM-VORBILD-PINNWAND'
/**
 * EIN REISEFÄHIGER Design-Wert (D9). Anders als die zwei oben ist `h.base`
 * `public` UND Festlegung — der Slot-Filter lässt ihn also durch. Was ihn
 * zurückhält, ist allein die KAPITEL-Regel (`isBrandChapterShareable`), und
 * genau die soll hier gemessen werden.
 */
const DESIGN_RAW_VALUE = 'D9ROH-BASISTON-DER-FARBWELT'

try {
  const owner = await makeAccount('owner')
  const stranger = await makeAccount('stranger')

  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      title: 'Kailua Coffee',
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Kaffeerösterei',
      about: 'Wir rösten Kaffee in kleinen Mengen.',
      audience: 'Cafés auf Maui.',
    },
  })
  const profileId = created.json?.profile?.id ?? created.json?.id
  if (!profileId) {
    console.error(`✗ Branding konnte nicht angelegt werden (${created.status}): ${created.text.slice(0, 300)}`)
    process.exit(1)
  }
  cleanup.profiles.push(profileId)
  const base = `/api/brand/profiles/${profileId}`

  // Zwei bestätigte Werte: eine Festlegung (reist) und ein vertraulicher Wert
  // (reist nie) — der zweite ist die ganze Gegenprobe dieses Beweises.
  await setSlots(profileId, 'context', {
    'a.pitch': { confirmed: PITCH, accepted: true },
    'a.complaints': { confirmed: COMPLAINT, accepted: true },
  })

  console.log('\n1 · Ohne Link meldet der Zustand nichts')
  const empty = await call(`${base}/share`, { cookie: owner.cookie })
  check('Zustand ⇒ 200 mit `active: null`',
    empty.status === 200 && empty.json?.active === null,
    `${empty.status} ${empty.text.slice(0, 160)}`)

  console.log('\n2 · Veröffentlichen gibt den Token GENAU EINMAL')
  const published = await call(`${base}/share`, { method: 'POST', cookie: owner.cookie, body: {} })
  const token = published.json?.token ?? ''
  check('Veröffentlichen ⇒ 200 mit Token',
    published.status === 200 && /^[0-9a-f]{64}$/.test(token),
    `${published.status} ${published.text.slice(0, 160)}`)
  const days = (Date.parse(published.json?.expiresAt ?? '') - Date.parse(published.json?.publishedAt ?? ''))
    / (24 * 3600_000)
  check('Frist 30 Tage', Math.round(days) === 30, String(days))

  const status = await call(`${base}/share`, { cookie: owner.cookie })
  check('Zustand ⇒ aktiv, mit derselben Id und Frist',
    status.status === 200 && status.json?.active?.shareId === published.json?.shareId
    && status.json?.active?.expiresAt === published.json?.expiresAt,
    `${status.status} ${status.text.slice(0, 200)}`)
  checkAbsent('… und OHNE Token', status.text, token)

  console.log('\n3 · Die Seite antwortet — mit ihren vier Schutz-Köpfen')
  const page = await call(`/brand/share/${token}`)
  check('Seite ⇒ 200', page.status === 200, `${page.status} ${page.text.slice(0, 200)}`)
  check('… und zeigt die Festlegung', page.text.includes(PITCH), `${page.text.length} Zeichen`)
  check('X-Robots-Tag: noindex, nofollow',
    page.headers['x-robots-tag'] === 'noindex, nofollow', String(page.headers['x-robots-tag']))
  check('Referrer-Policy: no-referrer',
    page.headers['referrer-policy'] === 'no-referrer', String(page.headers['referrer-policy']))
  check('Cache-Control: no-store',
    String(page.headers['cache-control'] ?? '').includes('no-store'), String(page.headers['cache-control']))
  check('Content-Security-Policy: frame-ancestors \'none\' (nicht der Core-Default \'self\')',
    page.headers['content-security-policy'] === 'frame-ancestors \'none\'',
    String(page.headers['content-security-policy']))
  check('GEGENPROBE: die private Seite behält den Default \'self\'',
    (await call(`/brand/${profileId}/foundation`, { cookie: owner.cookie }))
      .headers['content-security-policy'] === 'frame-ancestors \'self\'')

  console.log('\n4 · Nichts Internes — weder im HTML noch in der API')
  checkAbsent('der Beschwerde-Text steht NICHT im HTML', page.text, COMPLAINT)
  const api = await call(`/api/brand/share/${token}`)
  check('API ⇒ 200 mit Snapshot', api.status === 200 && Array.isArray(api.json?.snapshot?.chapters),
    `${api.status} ${api.text.slice(0, 200)}`)
  check('… die Festlegung ist drin', api.text.includes(PITCH))
  checkAbsent('… der Beschwerde-Text nicht', api.text, COMPLAINT)

  console.log('\n5 · Ein ALTER Snapshot gibt sein Internes trotzdem nicht heraus')
  // So sah jede Zeile vor MV1 M5 aus: der Filter beim Schreiben gab es noch
  // nicht. Geschrieben wird sie hier von Hand, weil die Route sie so gar nicht
  // mehr erzeugen kann — genau das ist der Punkt (§4).
  const legacyToken = randomBytes(32).toString('hex')
  const legacy = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_shares',
    rowId: ID.unique(),
    data: {
      profileId,
      tokenHash: hashToken(legacyToken),
      snapshot: JSON.stringify({
        schemaVersion: 1,
        title: 'Kailua Coffee',
        contentLocale: 'de',
        story: '',
        chapters: [{
          stepKey: 'context',
          slots: [
            { slotId: 'a.pitch', value: PITCH },
            { slotId: 'a.complaints', value: COMPLAINT },
          ],
        }],
        presetId: '',
        presetVersion: '',
      }),
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    },
  })
  cleanup.shares.push(legacy.$id)
  const legacyApi = await call(`/api/brand/share/${legacyToken}`)
  const legacyPage = await call(`/brand/share/${legacyToken}`)
  check('Alt-Snapshot: API 200, Seite 200',
    legacyApi.status === 200 && legacyPage.status === 200,
    `${legacyApi.status}/${legacyPage.status}`)
  check('… die Festlegung steht weiter da', legacyApi.text.includes(PITCH) && legacyPage.text.includes(PITCH))
  checkAbsent('… der Beschwerde-Text nicht (API)', legacyApi.text, COMPLAINT)
  checkAbsent('… der Beschwerde-Text nicht (HTML)', legacyPage.text, COMPLAINT)

  console.log('\n6 · Widerrufen wirkt sofort')
  const revoked = await call('/api/brand/share/revoke', {
    method: 'POST', cookie: owner.cookie, body: { profileId },
  })
  check('Widerruf ⇒ 200', revoked.status === 200 && revoked.json?.revoked >= 1,
    `${revoked.status} ${revoked.text.slice(0, 160)}`)
  const afterPage = await call(`/brand/share/${token}`)
  const afterApi = await call(`/api/brand/share/${token}`)
  check('Seite ⇒ 404', afterPage.status === 404, String(afterPage.status))
  check('API ⇒ 404', afterApi.status === 404, String(afterApi.status))
  const afterStatus = await call(`${base}/share`, { cookie: owner.cookie })
  check('Zustand ⇒ wieder `active: null`', afterStatus.json?.active === null, afterStatus.text.slice(0, 160))

  console.log('\n7 · Abgelaufen antwortet wie unbekannt')
  const second = await call(`${base}/share`, { method: 'POST', cookie: owner.cookie, body: {} })
  const secondToken = second.json?.token ?? ''
  check('zweiter Link ⇒ 200 mit neuem Token',
    second.status === 200 && secondToken.length === 64 && secondToken !== token, String(second.status))
  const live = await call(`/brand/share/${secondToken}`)
  check('… und er lebt (200)', live.status === 200, String(live.status))
  await tablesDB.updateRow({
    databaseId,
    tableId: 'brand_shares',
    rowId: second.json.shareId,
    data: { expiresAt: new Date(Date.now() - 3600_000).toISOString() },
  })
  const expiredPage = await call(`/brand/share/${secondToken}`)
  const expiredApi = await call(`/api/brand/share/${secondToken}`)
  check('nach dem Ablauf: Seite 404, API 404',
    expiredPage.status === 404 && expiredApi.status === 404,
    `${expiredPage.status}/${expiredApi.status}`)
  const unknown = await call(`/api/brand/share/${randomBytes(32).toString('hex')}`)
  check('ein erfundener Token antwortet GENAUSO (404)', unknown.status === 404, String(unknown.status))

  console.log('\n8 · Fremdes Branding ist 404, nicht 403')
  const foreign = await call(`${base}/share`, { cookie: stranger.cookie })
  check('Zustand eines fremden Brandings ⇒ 404', foreign.status === 404,
    `${foreign.status} ${foreign.text.slice(0, 160)}`)
  const foreignRevoke = await call('/api/brand/share/revoke', {
    method: 'POST', cookie: stranger.cookie, body: { profileId },
  })
  check('… und widerrufen kann er ihn auch nicht', foreignRevoke.status === 404, String(foreignRevoke.status))
  const anonymous = await call(`${base}/share`)
  check('… ohne Anmeldung ebenfalls kein Zustand', anonymous.status >= 400, String(anonymous.status))

  console.log('\n9 · Der Funnel zählt — ohne Token')
  await call(`${base}/foundation`, { cookie: owner.cookie })
  const events = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.limit(200)],
  })
  const types = events.rows.map(row => row.type)
  check('`share.viewed` steht im Funnel', types.includes('share.viewed'), JSON.stringify(types))
  check('`foundation.viewed` ebenfalls', types.includes('foundation.viewed'), JSON.stringify(types))
  check('`share.revoked` ebenfalls', types.includes('share.revoked'), JSON.stringify(types))
  const payloads = events.rows.map(row => String(row.payload ?? '')).join(' ')
  check('KEIN Ereignis trägt den Token',
    !payloads.includes(token) && !payloads.includes(secondToken) && !payloads.includes(legacyToken))
  check('KEIN Ereignis trägt Inhalt',
    !payloads.includes(PITCH) && !payloads.includes(COMPLAINT))

  /**
   * 10 · BRAND DESIGN IM ABBILD (Paket D8, §2.8/§1.11 b).
   *
   * ── WAS HIER GEPRÜFT WIRD ────────────────────────────────────────────────
   * Zwei Dinge, die man nur an einer echten Zeile sieht: (a) jedes NEUE Abbild
   * trägt `schemaVersion: 2` — die Form ist eine andere, auch wenn diese Marke
   * kein fertiges Brand Design hat; (b) die zwei privaten Sorten reisen nicht.
   *
   * ── DER ADVERSARISCHE FALL ───────────────────────────────────────────────
   * `g.inspiration` und `j.drafts` werden im Produkt NIE `confirmed` (D2a/D5c).
   * Genau deshalb werden sie hier von Hand bestätigt in die Ablage geschrieben:
   * die Zusage darf nicht daran hängen, dass ein Schreibweg sich benimmt,
   * sondern am REGISTRY-Filter (`isBrandSlotShareable`) — und der ist die
   * Stelle, die man später versehentlich lockert.
   *
   * Das volle v2-Abbild MIT Preset steht in Abschnitt 31 von
   * `verify-brand-sessions.mjs`; hier geht es um das, was NICHT darin steht.
   */
  console.log('\n10 · Brand Design: `schemaVersion: 2` — und nichts Privates darin')

  // Die sechs Design-Zeilen legt schon die Anlage an (D1) — hier wird nur
  // geschrieben. Ein `createRow` liefe in ein 409 auf die eigene Id.
  for (const [stepKey, slots] of [
    ['dna', { 'g.inspiration': { confirmed: DRAFT_SECRET_REFERENCE, accepted: true } }],
    ['mark', { 'j.drafts': { confirmed: DRAFT_SECRET_DRAFT, accepted: true } }],
    ['color', { 'h.base': { confirmed: DESIGN_RAW_VALUE, accepted: true } }],
  ]) {
    await tablesDB.updateRow({
      databaseId,
      tableId: 'brand_steps',
      rowId: `${profileId}_${stepKey}`,
      data: { state: 'done', slots: JSON.stringify(slots) },
    })
  }

  const designShare = await call(`${base}/share`, { method: 'POST', cookie: owner.cookie, body: {} })
  const designToken = designShare.json?.token ?? ''
  check('ein neuer Link lässt sich erzeugen', designShare.status === 200 && designToken.length === 64,
    `${designShare.status} ${designShare.text.slice(0, 160)}`)

  const designRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_shares', rowId: designShare.json?.shareId ?? 'none',
  }).catch(() => null)
  cleanup.shares.push(designRow?.$id ?? '')
  const designSnapshot = designRow ? JSON.parse(designRow.snapshot) : null
  check('jedes neue Abbild trägt `schemaVersion: 2`',
    designSnapshot?.schemaVersion === 2, String(designSnapshot?.schemaVersion))
  check('… ohne fertiges Brand Design trägt es KEIN Preset',
    designSnapshot !== null && designSnapshot.design === undefined,
    JSON.stringify(Object.keys(designSnapshot ?? {})))

  const designApi = await call(`/api/brand/share/${designToken}`)
  const designPage = await call(`/brand/share/${designToken}`)
  check('Seite und API antworten (200/200)',
    designApi.status === 200 && designPage.status === 200,
    `${designApi.status}/${designPage.status}`)
  checkAbsent('der KI-Entwurf steht NICHT im eingefrorenen Abbild', designRow?.snapshot, DRAFT_SECRET_DRAFT)
  checkAbsent('… und nicht in der API', designApi.text, DRAFT_SECRET_DRAFT)
  checkAbsent('… und nicht im HTML', designPage.text, DRAFT_SECRET_DRAFT)
  checkAbsent('das Vorbild steht NICHT im eingefrorenen Abbild', designRow?.snapshot, DRAFT_SECRET_REFERENCE)
  checkAbsent('… und nicht in der API', designApi.text, DRAFT_SECRET_REFERENCE)
  checkAbsent('… und nicht im HTML', designPage.text, DRAFT_SECRET_REFERENCE)

  /**
   * D9: AUCH EIN REISEFÄHIGER DESIGN-WERT BLEIBT DRAUSSEN — als Kapitel, nicht
   * als Slot. Diese Marke hat Brand Design nie freigeschaltet; ihr `color`-
   * Kapitel steht in der Journey trotzdem (`state: 'locked'`, nicht `skipped`)
   * und kam vor D9 als rohe `h.base`-Zeile mit. Die Zusage hängt damit an der
   * Kapitel-Regel und nicht daran, ob eine Schicht offen ist.
   */
  checkAbsent('ein roher Design-Wert steht NICHT im Abbild', designRow?.snapshot, DESIGN_RAW_VALUE)
  checkAbsent('… und sein Slot-Schlüssel auch nicht', designRow?.snapshot, 'h.base')
  checkAbsent('… und das Kapitel selbst steht nicht in `chapters`',
    JSON.stringify(JSON.parse(designRow?.snapshot ?? '{}').chapters ?? []), '"stepKey":"color"')
  checkAbsent('… und nichts davon in der API', designApi.text, DESIGN_RAW_VALUE)
  // Die positive Hälfte desselben Gedankens: das Abbild ist nicht einfach leer.
  check('… die Festlegung steht weiterhin darin', designApi.text.includes(PITCH))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  for (const id of cleanup.profiles) {
    const shares = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_shares',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of shares.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_shares', rowId: row.$id }).catch(() => {})
    }
    const events = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_events',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of events.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_events', rowId: row.$id }).catch(() => {})
    }
    const messages = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_messages',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of messages.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_messages', rowId: row.$id }).catch(() => {})
    }
    for (const stepKey of [
      'context', 'pvm', 'architecture', 'values', 'archetype', 'manifesto', 'verbal', 'naming', 'result',
      // Die sechs Zeilen von Brand Design — sie entstehen bei der Anlage und
      // blieben sonst als Waisen liegen (Abschnitt 10 schreibt in zwei davon).
      'dna', 'color', 'type', 'mark', 'imagery', 'motion',
    ]) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_steps', rowId: `${id}_${stepKey}` }).catch(() => {})
    }
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.access) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
