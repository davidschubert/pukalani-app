/**
 * Beweis für MV1 M5 — „Betrieb": die 24-Stunden-Frist, die Vertraulichkeit der
 * Markt-Daten, die freiwillige Bewertung und die Erklärseite des Bots — gegen
 * ECHTE Routen, echte SSR-Seiten und die echte Ablage.
 *
 * Geprüft werden die Zusagen, die keine pure Funktion belegen kann:
 *
 *  1. ERKLÄRSEITE (§2.9 Nr. 1): `/market-bot` und `/de/market-bot` antworten
 *     200, nennen den User-Agent, die vier Formen des Nutzungsvorbehalts und
 *     die `Disallow`-Zeile — ohne rohe i18n-Schlüssel.
 *  2. DER STEMPEL (§2.9 Nr. 6): nach einem Lauf trägt der Kandidat Rohtext UND
 *     eine Frist, die 24 Stunden in der Zukunft liegt.
 *  3. DER SWEEP: eine abgelaufene Zeile wird geleert. Mit GEGENPROBE — die
 *     NICHT abgelaufene behält ihren Rohtext im selben Durchgang.
 *  4. WAS BLEIBT: das Marktprofil mit seinen Zitaten und der Bericht sind nach
 *     dem Sweep unverändert (§1.7 Nr. 4: „danach bleibt nur das strukturierte
 *     Marktprofil").
 *  5. VERTRAULICHKEIT (§2.9 Nr. 7): ein Teilen-Link, veröffentlicht NACH einem
 *     Bericht, trägt weder einen Markt-Befund noch einen Wettbewerber-Namen
 *     noch ein Zitat aus einem Marktprofil — und auch nicht den Inhalt der
 *     internen Session `a.competitors`. GEGENPROBE: der öffentliche Satz aus
 *     Kapitel B steht sehr wohl drin.
 *  6. BEWERTUNG (§2.10): die Frage zählt EINMAL je Branding (zweiter Aufruf ⇒
 *     `counted: false`, weiterhin genau EINE Ereignis-Zeile), der Satz wird
 *     PII-gefiltert abgelegt.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Takt. Ob `setInterval` nach dreissig Minuten feuert, misst hier niemand;
 * geprüft wird die ARBEIT, die beide Einstiege teilen (`runMarketRawSweep`),
 * über den Betreiber-Knopf. Und er beweist keinen Anbieter: er läuft mit
 * `MARKET_DEV_STUB=1`, also ohne einen bezahlten Aufruf.
 *
 * ── EIN SERVERPROZESS JE BEWEIS ──────────────────────────────────────────
 * Wie bei M2/M3/M4: die Eimer leben ohne Redis IM PROZESS. Vor dem Start den
 * Dev-Server frisch hochfahren, sonst meldet Schritt 2 ein 429 — das ist der
 * Deckel, kein Fehler.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`- UND `market_*`-Tabellen und ein
 * Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md, „Worktree-Beweise").
 *
 *   BRAND_DEV_STUB_REVIEW=1 MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/market/scripts/verify-market-retention.mjs
 *
 * Für die Schritte 2–6 muss `pukalani.market.enabled` in
 * `apps/branding/app/app.config.ts` LOKAL auf `true` stehen (committet ist
 * `false`, bis die Prod-Migrationen gelaufen sind) — danach zurückstellen und
 * NICHT mitcommitten.
 *
 * ── DER ZWEITE LAUF: DIE ERKLÄRSEITE BEI GATE AUS ────────────────────────
 * Sie darf NICHT am Produkt-Gate hängen (Begründung im Kopf von
 * `app/pages/market-bot.vue`: der Bot-Name steht in fremden Logs weiter, auch
 * wenn wir abschalten). Das lässt sich nur mit einem Server im ANDEREN Zustand
 * zeigen. Deshalb kennt dieses Skript `BOT_ONLY=1`: es fährt dann NUR Schritt 1
 * und braucht weder Konto noch Datenbank.
 *
 *   # Server mit dem COMMITTETEN Stand (Gate aus), dann:
 *   BOT_ONLY=1 BRANDING_PORT=3016 node packages/market/scripts/verify-market-retention.mjs
 */
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'
const BOT_ONLY = process.env.BOT_ONLY === '1'

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], aiFlag: null }
const servers = []

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

/** node:http über ::1 mit gesetztem Host (CLAUDE.md, „Beweise"). */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolveCall, rejectCall) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
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
        resolveCall({ status: res.statusCode, json, text })
      })
    })
    req.on('error', rejectCall)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Sichtbarer TEXT einer SSR-Antwort (Begründung: `verify-market-ui.mjs`). */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
}

// ── Schritt 1 läuft IMMER und braucht nichts ausser dem Server ─────────────

async function checkBotPage() {
  console.log('\n1 · Die Erklärseite des Bots ist erreichbar und vollständig')
  for (const [label, path] of [['englisch', '/market-bot'], ['deutsch', '/de/market-bot']]) {
    const page = await call(path, { cookie: undefined })
    const text = visibleText(page.text)
    check(`${path} (${label}) antwortet 200 — ohne Anmeldung`, page.status === 200, String(page.status))
    check(`${path} nennt den User-Agent aus \`BRAND_MARKET_USER_AGENT\``,
      text.includes('PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)'),
      text.slice(0, 160))
    check(`${path} zeigt die Aussperr-Zeile für robots.txt`,
      text.includes('User-agent: PukalaniMarketBot') && text.includes('Disallow: /'), '')
    check(`${path} nennt alle vier Formen des Nutzungsvorbehalts`,
      text.includes('TDM-Reservation: 1')
      && text.includes('tdm-reservation')
      && text.includes('noai')
      && text.includes('tdmrep.json'), '')
    check(`${path} nennt die 24-Stunden-Frist`, /\b24\b/.test(text), '')
    check(`${path} nennt die Zitatschranke von 200 Zeichen`, /\b200\b/.test(text), '')
    check(`${path} zeigt die Pfad-Sperrliste (Beleg statt Behauptung)`,
      text.includes('impressum') && text.includes('datenschutz') && text.includes('login'), '')
    const raw = text.match(/\bmarketBot\.[a-zA-Z0-9_.]+/g) ?? []
    check(`${path} enthält keinen rohen i18n-Schlüssel`, raw.length === 0, raw.slice(0, 4).join(', '))
  }
  check('GEGENPROBE: die Seite ist KEIN Marketing — kein CTA auf das Erstgespräch',
    !visibleText((await call('/market-bot')).text).includes('Erstgespräch'), '')
}

if (BOT_ONLY) {
  console.log('BOT_ONLY=1 — nur die Erklärseite (für den Lauf mit ausgeschaltetem Produkt-Gate)')
  await checkBotPage()

  // Der eigentliche Zweck dieses Modus: die Erklärseite steht, WÄHREND das
  // Produkt aus ist. Ohne diese Gegenprobe hätte der Lauf oben nur gezeigt,
  // dass eine Seite antwortet — nicht, dass sie das Gate nicht kennt.
  console.log('\n1b · GEGENPROBE zum Gate: dieselbe App, andere Antwort')
  const marketPage = await call('/de/brand/xyz/market')
  const marketApi = await call('/api/market/profiles/xyz/report')
  const gateOff = marketPage.status === 404 && marketApi.status === 404
  if (gateOff) {
    check('die Seite „Markt" und ihre Routen antworten 404 — das Produkt ist AUS',
      true, '')
    check('und die Erklärseite trotzdem 200 — sie hängt nicht am Gate',
      (await call('/market-bot')).status === 200, '')
  }
  else {
    console.log('  ℹ Das Produkt-Gate steht AN — dieser Modus gehört gegen einen Server')
    console.log('    mit dem COMMITTETEN Stand (`market: { enabled: false }`).')
    fail++
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}

// ── Ab hier: Konto, Ablage, Läufe ─────────────────────────────────────────

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../.playground/public/demo-sites')

/** EIN Server je Demo-Site (Begründung: `verify-market-fetch.mjs`). */
async function startDemoSite(slug) {
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
    const candidates = relative === '/' || relative === ''
      ? ['index.html']
      : [relative.slice(1), `${relative.slice(1)}.html`]
    for (const candidate of candidates) {
      try {
        const body = await readFile(join(DEMO_ROOT, slug, candidate))
        const type = candidate.endsWith('.xml')
          ? 'application/xml'
          : candidate.endsWith('.txt') || candidate.endsWith('.json')
            ? 'text/plain; charset=utf-8'
            : 'text/html; charset=utf-8'
        const text = candidate.endsWith('.xml')
          ? body.toString('utf8').replace(new RegExp(`https://${slug}\\.example`, 'g'), origin)
          : body
        res.writeHead(200, { 'content-type': type })
        res.end(text)
        return
      }
      catch { /* nächster Kandidat */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  origin = `http://127.0.0.1:${server.address().port}`
  servers.push(server)
  return { slug, origin }
}

const stamp = Date.now()

async function makeAccount(tag, { labels } = {}) {
  const user = await users.create({
    userId: ID.unique(),
    email: `mv1-m5-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'MV1-M5-Beweis',
  })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  if (labels) await users.updateLabels({ userId: user.$id, labels })
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

async function ensureAiEnabled() {
  let row = null
  try {
    row = await tablesDB.getRow({ databaseId, tableId: 'app_config', rowId: 'global' })
  }
  catch { /* keine Zeile */ }
  if (row?.brandAiEnabled === true) return
  cleanup.aiFlag = row ? { existed: true, before: row.brandAiEnabled ?? null } : { existed: false }
  if (row) {
    await tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true } })
  }
  else {
    await tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true } })
  }
}

async function createProfile(account, title) {
  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: account.cookie,
    body: {
      title,
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Kaffeerösterei',
      about: 'Wir rösten Kaffee in kleinen Mengen.',
      audience: 'Cafés auf Maui.',
    },
  })
  const id = created.json?.profile?.id ?? created.json?.id
  if (!id) throw new Error(`Kein Branding angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  cleanup.profiles.push(id)
  return id
}

async function acceptChapter(profileId, stepKey) {
  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`, data: { state: 'done' },
    })
  }
  catch {
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_steps',
      rowId: `${profileId}_${stepKey}`,
      data: { profileId, stepKey, state: 'done', slots: '{}' },
    })
  }
}

async function setConfirmed(profileId, stepKey, values) {
  const rowId = `${profileId}_${stepKey}`
  let existing = {}
  let state = 'active'
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
    existing = JSON.parse(row.slots || '{}')
    state = row.state ?? 'active'
  }
  catch { /* Zeile fehlt — wird angelegt */ }
  const slots = { ...existing }
  for (const [slotId, value] of Object.entries(values)) {
    slots[slotId] = { ...(slots[slotId] ?? {}), confirmed: value, updatedAt: new Date().toISOString() }
  }
  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId, data: { slots: JSON.stringify(slots) },
    })
  }
  catch {
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_steps',
      rowId,
      data: { profileId, stepKey, state, slots: JSON.stringify(slots) },
    })
  }
}

async function marketRows(table, profileId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: table, queries: [Query.equal('profileId', profileId), Query.limit(200)],
  })
  return res.rows
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

try {
  await checkBotPage()

  await ensureAiEnabled()

  const upcountry = await startDemoSite('upcountry-roast')
  const pacific = await startDemoSite('pacificbean')

  const owner = await makeAccount('owner')
  const operator = await makeAccount('betreiber', { labels: ['admin'] })

  const profileId = await createProfile(owner, 'Kailua Coffee')
  const base = `/api/market/profiles/${profileId}`

  /**
   * DER NAME, DER NIRGENDS HIN DARF. Er steht in der INTERNEN Session
   * `a.competitors` — genau dem Feld, mit dem §2.9 Nr. 7 die Vertraulichkeit
   * der Markt-Daten begründet („vertraulich wie a.competitors").
   */
  const SECRET_RIVAL = 'Northline Kaffeekontor'
  const PUBLIC_SENTENCE = 'Kaffee soll rueckverfolgbar bleiben bis zur Farm.'

  await setConfirmed(profileId, 'context', {
    'a.category': 'Kleine Rösterei',
    'a.pitch': 'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui und liefern selbst.',
    'a.audienceSketch': 'Cafés und Restaurants auf Maui.',
    'a.competitors': `${SECRET_RIVAL} — teuer und langsam`,
  })
  await setConfirmed(profileId, 'pvm', {
    'b.positioningFirstChoice': 'Wir kennen jede Farm persönlich.',
    'b.purpose': PUBLIC_SENTENCE,
  })
  await acceptChapter(profileId, 'context')
  await acceptChapter(profileId, 'pvm')

  // ── 2 · Der Stempel ─────────────────────────────────────────────────────
  console.log('\n2 · Nach dem Lauf trägt der Kandidat Rohtext UND eine Frist')

  const added = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Upcountry Roast', url: `${upcountry.origin}/` },
  })
  const expiredId = added.json?.competitor?.id
  check('Kandidat angelegt', added.status === 200 && Boolean(expiredId), String(added.status))

  const addedKeep = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Pacific Bean', url: `${pacific.origin}/` },
  })
  const keptId = addedKeep.json?.competitor?.id
  check('zweiter Kandidat angelegt (er ist die GEGENPROBE des Sweeps)',
    addedKeep.status === 200 && Boolean(keptId), String(addedKeep.status))

  const run = await call(`${base}/run?report=1`, { method: 'POST', cookie: owner.cookie })
  check('der Lauf antwortet 200 mit Bericht',
    run.status === 200 && run.json?.ran === true && Boolean(run.json?.report),
    `${run.status} ${run.json?.reason ?? ''}`)

  const afterRun = await marketRows('market_competitors', profileId)
  const expiredBefore = afterRun.find(row => row.$id === expiredId)
  const keptBefore = afterRun.find(row => row.$id === keptId)
  const keptStep = (run.json?.steps ?? []).find(step => step.competitorId === keptId)
  check('Vorbedingung: der GEGENPROBE-Kandidat wurde wirklich gelesen',
    keptStep?.status === 'fetched', JSON.stringify(keptStep ?? {}))
  check('Rohtext ist da', Boolean(expiredBefore?.rawText), '')
  const stampMs = Date.parse(expiredBefore?.rawExpiresAt ?? '')
  const inHours = (stampMs - Date.now()) / 3_600_000
  check('die Frist liegt knapp 24 Stunden in der Zukunft',
    inHours > 23.5 && inHours <= 24.01, `${inHours.toFixed(2)} h`)

  const profilesBefore = await marketRows('market_profiles', profileId)
  const reportsBefore = await marketRows('market_reports', profileId)
  const expiredProfile = profilesBefore.find(row => row.competitorId === expiredId)
  check('es gibt ein Marktprofil mit Feldern', Boolean(expiredProfile?.fields), '')

  // ── 3 · Der Sweep ───────────────────────────────────────────────────────
  console.log('\n3 · Abgelaufen wird geleert — nicht abgelaufen bleibt stehen')

  // Die Frist in die Vergangenheit ziehen: der Beweis wartet keine 24 Stunden.
  await tablesDB.updateRow({
    databaseId,
    tableId: 'market_competitors',
    rowId: expiredId,
    data: { rawExpiresAt: new Date(Date.now() - 60_000).toISOString() },
  })

  const denied = await call('/api/market/ops/sweep', { method: 'POST', cookie: owner.cookie })
  check('GEGENPROBE: ohne `system.manage` ⇒ 403, der Knopf ist ein Betreiber-Knopf',
    denied.status === 403, String(denied.status))

  const swept = await call('/api/market/ops/sweep', { method: 'POST', cookie: operator.cookie })
  check('der Betreiber-Knopf antwortet 200 mit Zählern',
    swept.status === 200 && typeof swept.json?.swept === 'number',
    `${swept.status} ${JSON.stringify(swept.json ?? {})}`)
  check('mindestens die abgelaufene Zeile wurde geleert',
    (swept.json?.swept ?? 0) >= 1 && (swept.json?.errors ?? 0) === 0,
    JSON.stringify(swept.json ?? {}))

  const afterSweep = await marketRows('market_competitors', profileId)
  const expiredAfter = afterSweep.find(row => row.$id === expiredId)
  const keptAfter = afterSweep.find(row => row.$id === keptId)
  check('der abgelaufene Rohtext ist leer', !expiredAfter?.rawText, String(expiredAfter?.rawText ?? '').slice(0, 60))
  check('und die Frist steht nicht mehr daneben', !expiredAfter?.rawExpiresAt, String(expiredAfter?.rawExpiresAt ?? ''))
  check('GEGENPROBE: die NICHT abgelaufene Zeile behält ihren Rohtext',
    Boolean(keptAfter?.rawText) && keptAfter?.rawText === keptBefore?.rawText,
    `vorher ${(keptBefore?.rawText ?? '').length} Zeichen / nachher ${(keptAfter?.rawText ?? '').length}`)
  check('GEGENPROBE: und ihre Frist', Boolean(keptAfter?.rawExpiresAt),
    `${keptBefore?.rawExpiresAt ?? 'vorher keine'} → ${keptAfter?.rawExpiresAt ?? 'keine'}`)

  // ── 4 · Was bleibt ──────────────────────────────────────────────────────
  console.log('\n4 · Das Ergebnis bleibt: Marktprofil mit Zitaten und Bericht unverändert')

  const profilesAfter = await marketRows('market_profiles', profileId)
  const expiredProfileAfter = profilesAfter.find(row => row.competitorId === expiredId)
  check('das Marktprofil steht unverändert da',
    expiredProfileAfter?.fields === expiredProfile?.fields, '')
  const parsedFields = JSON.parse(expiredProfileAfter?.fields || '[]')
  const withEvidence = parsedFields.filter(field => field?.evidence?.quote)
  check('seine Zitate mit Quell-Adresse sind noch vorhanden',
    withEvidence.length > 0 && withEvidence.every(field => typeof field.evidence.sourceUrl === 'string'),
    `${withEvidence.length} Belege`)
  const reportsAfter = await marketRows('market_reports', profileId)
  check('die Berichte sind unangetastet',
    reportsAfter.length === reportsBefore.length && reportsAfter.length > 0,
    `${reportsBefore.length} → ${reportsAfter.length}`)
  const reportStill = await call(`${base}/report`, { cookie: owner.cookie })
  check('der Bericht ist weiterhin lesbar',
    reportStill.status === 200 && Boolean(reportStill.json?.report), String(reportStill.status))

  // ── 5 · Vertraulichkeit ─────────────────────────────────────────────────
  console.log('\n5 · Der Teilen-Link trägt keine Markt-Daten (§2.9 Nr. 7)')

  const findingsRes = await call(`/api/brand/profiles/${profileId}/findings`, { cookie: owner.cookie })
  const marketFindings = (findingsRes.json?.findings ?? []).filter(finding => finding.kind === 'market')
  check('Vorbedingung: es GIBT Markt-Befunde (sonst prüft Schritt 5 nichts)',
    marketFindings.length > 0, `${marketFindings.length}`)

  const published = await call(`/api/brand/profiles/${profileId}/share`, {
    method: 'POST', cookie: owner.cookie, body: {},
  })
  const token = published.json?.token
  check('veröffentlichen ⇒ 200 mit Token', published.status === 200 && Boolean(token), String(published.status))

  const shared = await call(`/api/brand/share/${token}`)
  check('der Link ist OHNE Anmeldung lesbar (das ist ja sein Zweck)',
    shared.status === 200 && Boolean(shared.json?.snapshot), String(shared.status))
  const snapshotJson = JSON.stringify(shared.json?.snapshot ?? {})

  check('GEGENPROBE: der öffentliche Satz aus Kapitel B steht drin — der Link ist keine leere Hülle',
    snapshotJson.includes('rueckverfolgbar'), snapshotJson.slice(0, 200))
  check('kein Wettbewerber-Name aus der internen Session `a.competitors`',
    !snapshotJson.includes(SECRET_RIVAL), '')
  check('kein Markt-Befund (weder Id noch Vorschlagstext)',
    marketFindings.every(finding => !snapshotJson.includes(finding.id)
      && (!finding.suggestion || !snapshotJson.includes(finding.suggestion))), '')
  check('kein Name eines Kandidaten',
    !snapshotJson.includes('Upcountry Roast') && !snapshotJson.includes('Pacific Bean'), '')
  check('kein Zitat aus einem Marktprofil',
    withEvidence.every(field => !snapshotJson.includes(field.evidence.quote)), '')
  check('keine market-Tabelle und kein market-Feldname im Umschlag',
    !snapshotJson.includes('market_') && !/"findings"/.test(snapshotJson), '')

  // ── 6 · Die Bewertung ───────────────────────────────────────────────────
  console.log('\n6 · Die freiwillige Frage zählt genau einmal je Branding')

  const first = await call(`${base}/rating`, {
    method: 'POST', cookie: owner.cookie,
    body: { score: 4, note: 'Brauchbar. Schreibt mir an chef@example.test, Tel. 0170 1234567.' },
  })
  check('erste Antwort ⇒ 200 counted:true',
    first.status === 200 && first.json?.counted === true,
    `${first.status} ${JSON.stringify(first.json ?? {})}`)

  const again = await call(`${base}/rating`, {
    method: 'POST', cookie: owner.cookie, body: { score: 1 },
  })
  check('zweite Antwort ⇒ 200 counted:false (kein Fehler, aber auch keine zweite Zeile)',
    again.status === 200 && again.json?.counted === false,
    `${again.status} ${JSON.stringify(again.json ?? {})}`)

  const events = (await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.equal('type', 'market.rating'), Query.limit(20)],
  })).rows
  check('genau EINE Ereignis-Zeile `market.rating`', events.length === 1, `${events.length}`)
  const payload = JSON.parse(events[0]?.payload || '{}')
  check('sie trägt die ERSTE Note, nicht die zweite', payload.score === 4, JSON.stringify(payload))
  check('der Satz ist PII-gefiltert abgelegt (keine Adresse, keine Nummer)',
    typeof payload.note === 'string'
    && !payload.note.includes('chef@example.test')
    && !payload.note.includes('0170'),
    String(payload.note ?? ''))
  check('GEGENPROBE: der sachliche Teil des Satzes ist noch da',
    String(payload.note ?? '').includes('Brauchbar'), String(payload.note ?? ''))

  const bad = await call(`${base}/rating`, { method: 'POST', cookie: owner.cookie, body: { score: 9 } })
  check('eine Note ausserhalb 1–5 ⇒ 400', bad.status === 400, String(bad.status))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  for (const server of servers) server.closeAllConnections?.()
  for (const server of servers) await new Promise(done => server.close(done))

  for (const table of ['market_reports', 'market_profiles', 'market_competitors']) {
    for (const id of cleanup.profiles) {
      const rows = await tablesDB.listRows({
        databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
      }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) {
        await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
      }
    }
  }
  for (const id of cleanup.profiles) {
    for (const table of ['brand_steps', 'brand_messages', 'brand_findings', 'brand_events', 'brand_shares']) {
      const rows = await tablesDB.listRows({
        databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
      }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) {
        await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
      }
    }
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.access) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }

  if (cleanup.aiFlag) {
    if (cleanup.aiFlag.existed) {
      await tablesDB.updateRow({
        databaseId, tableId: 'app_config', rowId: 'global',
        data: { brandAiEnabled: cleanup.aiFlag.before },
      }).catch(() => {})
    }
    else {
      await tablesDB.deleteRow({ databaseId, tableId: 'app_config', rowId: 'global' }).catch(() => {})
    }
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
