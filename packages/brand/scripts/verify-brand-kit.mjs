/**
 * DER BEWEIS DER FREISCHALTUNG „ABLEITUNG" (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.8/§2.9, Paket K1) — EIN Lauf von der
 * gesperrten Schicht 3 über die Betreiber-Handlung bis zur Rücknahme, und
 * derselbe Weg noch einmal für ein Beta-Konto.
 *
 * ── WARUM ER NEBEN `verify-brand-design.mjs` STEHT ───────────────────────
 * Jener prüft SCHICHT 2 als Produkt (sechs Kapitel, Preset, Board, Abbild).
 * Dieser prüft die SCHRANKE davor — und zwar die von Schicht 3, die anders
 * gebaut ist als die von Schicht 2: EIN Feld mit DREI Schreibern (Beta-Konto,
 * Betreiber, ab BS1 Z1 der Stripe-Webhook), und dieses eine Feld öffnet
 * zugleich den Marktvergleich. Beides zusammen ist genau das, was ein
 * Unit-Test nicht zeigen kann: dass Regel, Routen, Journey, Werkstatt und
 * Marktvergleich DIESELBE Antwort geben.
 *
 * ── DIE ACHT ZUSAGEN ─────────────────────────────────────────────────────
 *  1. OHNE FREISCHALTUNG IST SCHICHT 3 NICHT AUF DEM WEG: die drei Kapitel
 *     stehen in der Journey auf `skipped` mit Grund `derivation_locked`
 *     (NICHT `locked` — sonst zählten sie im Fortschritt mit, D0-Lehre), jede
 *     Kapitel-Route antwortet 403 mit genau diesem Grund, die Werkstatt zeigt
 *     den Sperrsatz „Teil der Ableitung" mit dem Erstgespräch-Knopf (KEIN
 *     Preis), und der Marktvergleich steht hinter derselben Schranke.
 *  2. FREISCHALTEN IST EINE BETREIBER-HANDLUNG: ohne Anmeldung 401, mit einem
 *     fremden Konto 403, für den EIGENTÜMER 403 — und OHNE fertige Foundation
 *     409 `foundation_incomplete`.
 *  3. SIE GREIFT: die drei Spalten stehen (Datum, `via: 'operator'`,
 *     Betreiber-Id), die drei `brand_steps`-Zeilen sind da, die Kapitel sind
 *     erreichbar, und die Handlung steht als Ereignis im Funnel.
 *  4. EIN ZWEITER KLICK ÄNDERT NICHTS: kein neues Datum, kein zweites Ereignis.
 *  5. DIE RÜCKNAHME LÖSCHT NICHTS: Spalten leer, Kapitel wieder zu, Zeilen und
 *     Slots liegen unverändert da, Ereignis `derivation.locked` geschrieben.
 *  6. EIN BETA-KONTO IST OHNE FELD FREI (BS1 §9 Entscheidung 6): dieselbe
 *     Marke, dieselben Routen — offen, und die Betreiber-Liste sagt „beta"
 *     ohne Datum.
 *  7. DIE BETREIBER-LISTE IST EINE BETREIBER-LISTE: ohne Anmeldung 401, fremd
 *     403, und sie trägt BEIDE Spalten je Marke.
 *  8. DER MARKTVERGLEICH LIEST DIESELBE REGEL: gesperrt ohne beides, offen mit
 *     Feld (`grant: 'derivation'`), offen mit Beta (`grant: 'beta'`).
 *  9. DIE LIEFERUNG (K6): das Manifest nennt Zeichen und Bündel; jede Datei
 *     der Registry kommt mit `private, no-store` und `Content-Disposition`;
 *     jedes Zeichen ist ein SVG; das Bündel ist ein LESBARES Zip mit README
 *     und `marks/`; ohne Preset antworten Tokens und Zeichen 409
 *     `kit_file_design_missing` und das Bündel enthält nur die drei Context-Dateien;
 *     ein fremdes Konto bekommt überall 404, eine gesperrte Marke 403; das
 *     Bündel zählt FÜNFFACH (nach zwölf Zips ist das dreizehnte 429); und die
 *     Lieferseite rendert serverseitig mit Cookie und ist ohne Cookie 404.
 *
 * ── `--keep-kailua` ──────────────────────────────────────────────────────
 * Legt am Ende zusätzlich ein Beta-Konto mit der Marke „Kailua Coffee Co."
 * an — Foundation gesät, Design gesät und abgenommen, Ableitung frei — und
 * räumt genau DIESE beiden nicht weg. Am Schluss stehen `BRAND_ID` und
 * `COOKIE` in der Ausgabe, damit ein Mensch die Lieferseite im Browser
 * ansehen kann. Nur lokal gedacht; ohne die Option bleibt nichts stehen.
 *
 * ── DIE GEGENPROBE IST EINGEBAUT ─────────────────────────────────────────
 * Jede „offen"-Zusage hat hier ihre „zu"-Hälfte an DERSELBEN Route, und beide
 * laufen im selben Durchgang. Der Grund steht in CLAUDE.md: eine Prüfung, die
 * nur den offenen Fall kennt, ist auch dann grün, wenn die Schranke gar nicht
 * existiert. Das TRÄGERKONTO der gesperrten Fälle hat deshalb bewusst KEINE
 * `brand_access`-Zeile — sonst wäre es ein Beta-Konto und alles offen.
 *
 * ── DER AUFNAHME-MODUS WIRD KURZ AUF 'open' GESTELLT ─────────────────────
 * Ein Konto ohne `brand_access`-Zeile kommt sonst gar nicht erst durch das
 * Zugangs-Gate (404, Datentür) — und genau so ein Konto braucht dieser Beweis
 * für die gesperrte Seite. `app_config.brandAdmissionMode` wird deshalb für
 * die Dauer des Laufs auf 'open' gesetzt und am Ende auf den Vorwert
 * zurückgestellt (dasselbe Muster wie `brandAiEnabled` in
 * `verify-brand-design.mjs`).
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Eine Appwrite-Instanz mit den `brand_*`-Tabellen BIS brand-025 (die drei
 * Ableitungs-Spalten!) und ein Dev-Server der branding-App AUS DEM WORKTREE
 * (CLAUDE.md „Tests"). Konten, Beta-Zugang und Marken legt das Skript selbst
 * an und räumt am Ende alles weg.
 *
 *   pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 pnpm --filter @pukalani/brand verify:kit
 *   BRANDING_PORT=3016 pnpm --filter @pukalani/brand verify:kit -- --keep-kailua
 */
import { request } from 'node:http'
import { strFromU8, unzipSync } from 'fflate'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf über `pnpm --filter @pukalani/brand verify:kit`')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], admission: null }

/** Was `--keep-kailua` stehen lässt — am Ende gedruckt, sonst `null`. */
let kept = null

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
 * Nitro hört auf `[::1]`; Node's `fetch` verwirft einen eigenen Host-Header
 * (CLAUDE.md, „Beweise"). Deshalb node:http über ::1 mit gesetztem Host.
 */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
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
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Die drei Kapitel der Schicht 3, in ihrer Reihenfolge (Registry K0). */
const KIT_STEPS = ['nomenclature', 'aiguide', 'presskit']

const stamp = Date.now()

/** Behält Konto und Marke „Kailua Coffee Co." für den Blick im Browser. */
const KEEP_KAILUA = process.argv.includes('--keep-kailua')

/**
 * DIE SECHS DESIGN-KAPITEL ALS SAAT — dieselben Werte wie in
 * `verify-brand-design.mjs` (dort sind sie der Gegenstand, hier die
 * VORBEDINGUNG).
 *
 * Getragen wird das Preset von sieben Werten: DNA, Basisfarbe, Akzent,
 * Neutral-Tönung, Paar, Hierarchie und Tempo. `j.examples` steht bewusst NICHT
 * dabei — die acht Setzungen werden aus Paar, Farbwelt und Markennamen
 * GERECHNET (`markExamplesOf`), nie aus dem Slot gelesen. Genau das ist der
 * Punkt dieses Abschnitts: die Zeichen im Bündel entstehen aus den
 * Entscheidungen, nicht aus einer Ablage.
 */
const DESIGN_STEP_KEYS = ['dna', 'color', 'type', 'mark', 'imagery', 'motion']
const BASE_HEX = '#4a3123'
const ACCENT_HEX = '#22392f'

const DNA_MIX = [
  '## Visueller Stil\nRedaktionell · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Ästhetische Epoche\nZeitlos · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Formsprache\nWeich gerundet · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Typografie-Charakter\nBuchhafte Serif · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Farb-Charakter\nErdig gedämpft · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Bildwelt\nNah am Handwerk · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Komposition\nRuhig und luftig · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Materialität\nPapier, matt · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Bewegungs-Charakter\nRuhig · Eine Stufe ruhiger · Aus eurer Foundation',
  '## Grundstimmung\nWarm einladend · Eine Stufe ruhiger · Aus eurer Foundation',
].join('\n\n')

const ROLES_PLACEHOLDER = ['Grund & Text', 'Wärme & Flächen', 'Helle Flächen', 'Akzent & Signal', 'Papier & Ruhe']
  .map(label => `## ${label}\n${BASE_HEX} · Rampe 900 · Platzhalter`).join('\n\n')

const TYPE_RULES = [
  '## Überschrift-Gewicht\n600 · Gilt für Überschriften und die Wortmarke; der Fliesstext bleibt im Normalschnitt.',
  '## Laufweite\n-0,5 px · Feinkorrektur der Überschrift. Der Fliesstext wird nie gesperrt.',
  '## Versalien\nNein · Versalien sind eine Ausnahme, kein Stil — sie kosten Lesbarkeit.',
  "## Mono-Rolle\n'Geist Mono', ui-monospace, SFMono-Regular, monospace · Fest: Herkunftsangaben, Preise, Zahlen und Code — sonst nirgends.",
].join('\n\n')

const DESIGN_VALUES = {
  dna: { 'g.mix': DNA_MIX },
  color: {
    'h.base': BASE_HEX,
    'h.neutral': 'warm',
    'h.accent': ACCENT_HEX,
    'h.roles': ROLES_PLACEHOLDER,
  },
  type: { 'i.pair': 'editorial', 'i.scale': 'calm', 'i.rules': TYPE_RULES },
  mark: { 'j.kind': 'word', 'j.pick': 'wordmark' },
  imagery: {},
  motion: { 'l.tempo': 'calm' },
}

/**
 * EIN KONTO. `beta: true` legt die `brand_access`-Zeile an — DAS ist die
 * Beta-Zulassung, an der die dauerhafte Freistellung hängt (BS1 §9
 * Entscheidung 6). Ohne sie kommt das Konto nur durch, weil der Aufnahme-Modus
 * für diesen Lauf auf 'open' steht (s. Kopf) — und genau dieses Konto ist die
 * Gegenprobe.
 *
 * `labels: ['admin']` macht daraus einen BETREIBER (`users.manage` liegt im
 * Wildcard der admin-Rolle).
 */
async function makeAccount(tag, { labels, beta = false } = {}) {
  const user = await users.create({
    userId: ID.unique(),
    email: `k1-kit-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'K1-Kit-Beweis',
  })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  if (labels) await users.updateLabels({ userId: user.$id, labels })
  if (beta) {
    const access = await tablesDB.createRow({
      databaseId,
      tableId: 'brand_access',
      rowId: ID.unique(),
      data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
    })
    cleanup.access.push(access.$id)
  }
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

/** Der Aufnahme-Modus für die Dauer des Laufs (s. Kopf) — mit Rückstellung. */
async function openAdmission() {
  let row = null
  try {
    row = await tablesDB.getRow({ databaseId, tableId: 'app_config', rowId: 'global' })
  }
  catch { /* keine Zeile */ }
  cleanup.admission = row
    ? { existed: true, before: row.brandAdmissionMode ?? null }
    : { existed: false }
  if (row) {
    await tablesDB.updateRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAdmissionMode: 'open' },
    })
  }
  else {
    await tablesDB.createRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAdmissionMode: 'open' },
    })
  }
}

/** Eine Marke mit Konto anlegen. */
async function makeBrand(cookie, title) {
  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie,
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
  if (!id) {
    console.error(`✗ Branding „${title}" konnte nicht angelegt werden (${created.status}): `
      + created.text.slice(0, 300))
    process.exit(1)
  }
  cleanup.profiles.push(id)
  return id
}

/** Slot-Werte einer Kapitel-Zeile BESTÄTIGEN — ohne Route, damit nichts verdeckt wird. */
async function seedConfirmed(profileId, stepKey, values) {
  const rowId = `${profileId}_${stepKey}`
  const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
  const slots = JSON.parse(row.slots || '{}')
  for (const [slotId, value] of Object.entries(values)) {
    slots[slotId] = { ...slots[slotId], latestDraft: value, confirmed: value }
  }
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId,
    data: { slots: JSON.stringify(slots), revision: (row.revision ?? 0) + 1 },
  })
}

/**
 * DIE FOUNDATION AUF FERTIG — server-seitig, ohne die neun Kapitel zu spielen.
 * Der Weg dorthin ist der Gegenstand von `verify-brand-sessions.mjs`; hier ist
 * er die VORBEDINGUNG beider Schranken.
 */
async function completeFoundation(profileId) {
  await seedConfirmed(profileId, 'values', { 'c.final': '- Klartext\n- Handwerk\n- Nähe' })
  await seedConfirmed(profileId, 'archetype', {
    'd.primary': 'sage',
    'd.toneWords': '- ruhig\n- fundiert\n- warm',
  })
  await seedConfirmed(profileId, 'result', { 'result.direction': 'warm-editorial' })
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_result`, data: { state: 'done' },
  })
}

/** Die Journey-Zeile eines Kapitels aus der Detail-Antwort. */
function journeyEntry(detail, stepKey) {
  return (detail.json?.journey ?? []).find(entry => entry.stepKey === stepKey) ?? null
}

/**
 * SCHICHT 2 AUF FERTIG — freischalten, säen, abnehmen.
 *
 * Die Kapitel-Zeilen entstehen erst mit der Freischaltung (`design-unlock`);
 * ohne sie gäbe es keine Zeile, in die gesät werden könnte. Danach wird der
 * Zeilen-Zustand direkt auf `done` gesetzt: der WEG dorthin ist Gegenstand von
 * `verify-brand-design.mjs`, hier ist er nur die Vorbedingung.
 */
async function seedDesign(profileId, operatorCookie) {
  const unlocked = await call(`/api/brand/admin/profiles/${profileId}/design-unlock`, {
    method: 'POST', cookie: operatorCookie,
  })
  if (unlocked.status !== 200) {
    console.error(`✗ Schicht 2 liess sich für ${profileId} nicht freischalten (${unlocked.status}): `
      + unlocked.text.slice(0, 200))
    return false
  }
  for (const stepKey of DESIGN_STEP_KEYS) {
    const values = DESIGN_VALUES[stepKey]
    if (Object.keys(values).length > 0) await seedConfirmed(profileId, stepKey, values)
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`, data: { state: 'done' },
    })
  }
  return true
}

/** Ableitung freischalten — die Betreiber-Handlung, ohne sie zu prüfen. */
async function unlockDerivation(profileId, operatorCookie) {
  const res = await call(`/api/brand/admin/profiles/${profileId}/derivation-unlock`, {
    method: 'POST', cookie: operatorCookie,
  })
  return res.status === 200
}

async function eventTypes(profileId) {
  const res = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.limit(200)],
  }).catch(() => ({ rows: [] }))
  return res.rows
}

try {
  const health = await call('/api/health')
  if (health.status !== 200) {
    console.error(`✗ Kein Dev-Server auf Port ${PORT} (Health ${health.status}). `
      + 'Erst starten: pnpm --filter branding exec nuxi dev --port 3016')
    process.exit(1)
  }

  await openAdmission()

  // ══ 0 · AUFBAU ═════════════════════════════════════════════════════════
  console.log('\n0 · Konten und Marken')

  // OHNE `brand_access`: das ist die Gegenprobe-Seite des ganzen Beweises.
  const owner = await makeAccount('owner')
  const stranger = await makeAccount('stranger')
  const betaOwner = await makeAccount('beta', { beta: true })
  const operator = await makeAccount('operator', { labels: ['admin'] })

  const brandA = await makeBrand(owner.cookie, 'Kailua Coffee Co.')
  const brandB = await makeBrand(owner.cookie, 'Lani Studio')
  const brandBeta = await makeBrand(betaOwner.cookie, 'Hafenkontor')
  await completeFoundation(brandA)
  await completeFoundation(brandBeta)
  // brandB bleibt bewusst OHNE fertige Foundation — die 409-Gegenprobe.
  check('drei Marken angelegt, zwei mit fertiger Foundation',
    Boolean(brandA && brandB && brandBeta), `${brandA} · ${brandB} · ${brandBeta}`)

  const a = `/api/brand/profiles/${brandA}`

  // ══ 1 · OHNE FREISCHALTUNG IST SCHICHT 3 NICHT AUF DEM WEG ═════════════
  console.log('\n1 · Ohne Freischaltung: nicht auf dem Weg, nicht gesperrt')

  const lockedDetail = await call(a, { cookie: owner.cookie })
  check('die drei Kapitel stehen auf `skipped` mit Grund `derivation_locked`',
    KIT_STEPS.every((stepKey) => {
      const entry = journeyEntry(lockedDetail, stepKey)
      return entry?.state === 'skipped' && entry?.reason === 'derivation_locked'
    }),
    JSON.stringify(KIT_STEPS.map(stepKey => journeyEntry(lockedDetail, stepKey))))
  check('… und NICHT auf `locked` (sonst zählten sie im Fortschritt mit — D0-Lehre)',
    KIT_STEPS.every(stepKey => journeyEntry(lockedDetail, stepKey)?.state !== 'locked'))
  check('die Marke selbst sagt „Ableitung zu"',
    lockedDetail.json?.profile?.derivationUnlocked === false,
    JSON.stringify(lockedDetail.json?.profile?.derivationUnlocked))

  for (const stepKey of KIT_STEPS) {
    const res = await call(`${a}/steps/${stepKey}`, { cookie: owner.cookie })
    check(`Kapitel-Route ${stepKey} ⇒ 403 \`derivation_locked\``,
      res.status === 403 && res.json?.reason === 'derivation_locked',
      `${res.status} ${JSON.stringify(res.json?.reason ?? null)}`)
  }

  const lockedPage = await call(`/de/brand/${brandA}/aiguide`, { cookie: owner.cookie })
  check('die Werkstatt zeigt den Sperrsatz „Teil der Ableitung" mit dem Erstgespräch-Knopf',
    lockedPage.status === 200
    && lockedPage.text.includes('Teil der Ableitung')
    && lockedPage.text.includes('data-derivation-cta'),
    `${lockedPage.status} ${lockedPage.text.length} Zeichen`)
  check('… und KEINEN Preis (§2.7: CTA, kein Preis)',
    !/\d\s?(?:€|EUR)/.test(lockedPage.text))

  const lockedMarket = await call(`/api/market/profiles/${brandA}`, { cookie: owner.cookie })
  check('GEGENPROBE Marktvergleich: dieselbe Schranke, ohne Beta und ohne Feld',
    lockedMarket.status === 200
    && lockedMarket.json?.paywall?.unlocked === false
    && lockedMarket.json?.paywall?.grant === 'none',
    `${lockedMarket.status} ${JSON.stringify(lockedMarket.json?.paywall ?? null)}`)

  // ══ 2 · DIE FREISCHALTUNG IST EINE BETREIBER-HANDLUNG ══════════════════
  console.log('\n2 · Wer sie darf, und was sie voraussetzt')

  const unlockA = `/api/brand/admin/profiles/${brandA}/derivation-unlock`

  const guest = await call(unlockA, { method: 'POST' })
  check('ohne Anmeldung: 401', guest.status === 401, String(guest.status))
  const byStranger = await call(unlockA, { method: 'POST', cookie: stranger.cookie })
  check('ein fremdes Konto: 403 (kein `users.manage`)', byStranger.status === 403,
    String(byStranger.status))
  const byOwner = await call(unlockA, { method: 'POST', cookie: owner.cookie })
  check('auch der EIGENTÜMER kann sich die Ableitung nicht selbst freischalten: 403',
    byOwner.status === 403, String(byOwner.status))

  const tooEarly = await call(`/api/brand/admin/profiles/${brandB}/derivation-unlock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('GEGENPROBE: ohne fertige Foundation ⇒ 409 `foundation_incomplete`',
    tooEarly.status === 409 && tooEarly.json?.reason === 'foundation_incomplete',
    `${tooEarly.status} ${JSON.stringify(tooEarly.json?.reason ?? null)}`)

  // ══ 3 · SIE GREIFT ═════════════════════════════════════════════════════
  console.log('\n3 · Die Freischaltung greift')

  const unlocked = await call(unlockA, { method: 'POST', cookie: operator.cookie })
  check('mit fertiger Foundation: Datum, Herkunft und Betreiber stehen',
    unlocked.status === 200
    && typeof unlocked.json?.item?.derivationUnlockedAt === 'string'
    && unlocked.json.item.derivationUnlockedAt.length > 0
    && unlocked.json?.item?.derivationUnlockedBy === operator.id
    && unlocked.json?.item?.derivationGrant === 'operator',
    `${unlocked.status} ${JSON.stringify(unlocked.json?.item ?? null)}`)

  const openDetail = await call(a, { cookie: owner.cookie })
  check('die drei Kapitel liegen jetzt auf dem Weg — das erste offen, die anderen warten',
    journeyEntry(openDetail, 'aiguide')?.state === 'open'
    && journeyEntry(openDetail, 'presskit')?.state === 'locked'
    && journeyEntry(openDetail, 'presskit')?.reason === 'awaiting_previous',
    JSON.stringify(KIT_STEPS.map(stepKey => journeyEntry(openDetail, stepKey))))
  // Die Zusage ist „ERBT WÖRTLICH die Weiche von `architecture`" (brandJourney,
  // §2.20 Nr. 4) — also derselbe Grund wie dort, nicht ein fester. Die Testmarke
  // hat W4 nie beantwortet: `architecture` steht auf `junction_undecided`, und
  // genau das muss `nomenclature` auch sagen (erster Lauf gegen Prod 2026-09-09
  // hatte `junction_off` fest erwartet und war damit strenger als der Vertrag).
  check('… und `nomenclature` bleibt die Weiche der Markenarchitektur (§2.20 Nr. 4)',
    journeyEntry(openDetail, 'nomenclature')?.state === 'skipped'
    && journeyEntry(openDetail, 'architecture')?.state === 'skipped'
    && journeyEntry(openDetail, 'nomenclature')?.reason === journeyEntry(openDetail, 'architecture')?.reason,
    JSON.stringify({ nomenclature: journeyEntry(openDetail, 'nomenclature'), architecture: journeyEntry(openDetail, 'architecture') }))
  check('die Marke sagt „Ableitung offen"',
    openDetail.json?.profile?.derivationUnlocked === true)

  const chapter = await call(`${a}/steps/aiguide`, { cookie: owner.cookie })
  check('das Kapitel `aiguide` ist erreichbar', chapter.status === 200,
    `${chapter.status} ${chapter.text.slice(0, 120)}`)

  const kitRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_steps',
    queries: [Query.equal('profileId', brandA), Query.equal('stepKey', KIT_STEPS), Query.limit(10)],
  }).catch(() => ({ rows: [] }))
  check('alle drei `brand_steps`-Zeilen sind da — auch die des optionalen Kapitels',
    kitRows.rows.length === 3, String(kitRows.rows.length))

  const afterUnlockEvents = await eventTypes(brandA)
  const unlockedEvents = afterUnlockEvents.filter(row => row.type === 'derivation.unlocked')
  check('die Handlung steht im Funnel — genau einmal, mit dem Betreiber und ohne Inhalt',
    unlockedEvents.length === 1
    && unlockedEvents[0]?.userId === operator.id
    && !String(unlockedEvents[0]?.payload ?? '').includes('Kailua'),
    JSON.stringify(unlockedEvents.map(row => row.userId)))
  check('… und ihr Rumpf nennt die Herkunft',
    String(unlockedEvents[0]?.payload ?? '').includes('operator'),
    String(unlockedEvents[0]?.payload ?? '').slice(0, 160))

  const openMarket = await call(`/api/market/profiles/${brandA}`, { cookie: owner.cookie })
  check('der Marktvergleich folgt derselben Regel — jetzt offen, Herkunft `derivation`',
    openMarket.json?.paywall?.unlocked === true
    && openMarket.json?.paywall?.grant === 'derivation',
    JSON.stringify(openMarket.json?.paywall ?? null))

  // ══ 4 · ZWEITER KLICK ══════════════════════════════════════════════════
  console.log('\n4 · Der zweite Klick ändert nichts')

  const again = await call(unlockA, { method: 'POST', cookie: operator.cookie })
  check('dasselbe Datum, kein zweites Ereignis',
    again.status === 200
    && again.json?.item?.derivationUnlockedAt === unlocked.json?.item?.derivationUnlockedAt
    && (await eventTypes(brandA)).filter(row => row.type === 'derivation.unlocked').length === 1,
    `${again.status} ${again.json?.item?.derivationUnlockedAt}`)

  // ══ 5 · DIE RÜCKNAHME LÖSCHT NICHTS ════════════════════════════════════
  console.log('\n5 · Die Rücknahme')

  const locked = await call(`/api/brand/admin/profiles/${brandA}/derivation-lock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('die drei Spalten sind leer, die Herkunft ist `none`',
    locked.status === 200
    && locked.json?.item?.derivationUnlockedAt === null
    && locked.json?.item?.derivationUnlockedBy === ''
    && locked.json?.item?.derivationGrant === 'none',
    `${locked.status} ${JSON.stringify(locked.json?.item ?? null)}`)

  const relocked = await call(`${a}/steps/aiguide`, { cookie: owner.cookie })
  check('das Kapitel ist wieder zu — mit demselben Grund wie vorher',
    relocked.status === 403 && relocked.json?.reason === 'derivation_locked',
    `${relocked.status} ${JSON.stringify(relocked.json?.reason ?? null)}`)

  const rowsAfterLock = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_steps',
    queries: [Query.equal('profileId', brandA), Query.equal('stepKey', KIT_STEPS), Query.limit(10)],
  }).catch(() => ({ rows: [] }))
  check('… und die drei Zeilen liegen unangetastet da (§3e: inaktiv, nie gelöscht)',
    rowsAfterLock.rows.length === 3, String(rowsAfterLock.rows.length))

  const lockEvents = (await eventTypes(brandA)).filter(row => row.type === 'derivation.locked')
  check('die Rücknahme steht im Funnel — genau einmal',
    lockEvents.length === 1 && lockEvents[0]?.userId === operator.id,
    JSON.stringify(lockEvents.map(row => row.type)))

  const lockedMarketAgain = await call(`/api/market/profiles/${brandA}`, { cookie: owner.cookie })
  check('GEGENPROBE: der Marktvergleich steht sofort wieder hinter der Schranke',
    lockedMarketAgain.json?.paywall?.unlocked === false,
    JSON.stringify(lockedMarketAgain.json?.paywall ?? null))

  // ══ 6 · DAS BETA-KONTO ═════════════════════════════════════════════════
  console.log('\n6 · Ein Beta-Konto ist ohne Feld frei (BS1 §9 Entscheidung 6)')

  const betaDetail = await call(`/api/brand/profiles/${brandBeta}`, { cookie: betaOwner.cookie })
  check('dieselbe Lage, anderes Konto: die Ableitung ist offen — ohne ein einziges Feld',
    betaDetail.json?.profile?.derivationUnlocked === true
    && journeyEntry(betaDetail, 'aiguide')?.state === 'open',
    JSON.stringify(journeyEntry(betaDetail, 'aiguide')))

  const betaChapter = await call(`/api/brand/profiles/${brandBeta}/steps/aiguide`, {
    cookie: betaOwner.cookie,
  })
  check('… und das Kapitel ist erreichbar', betaChapter.status === 200, String(betaChapter.status))

  const betaMarket = await call(`/api/market/profiles/${brandBeta}`, { cookie: betaOwner.cookie })
  check('… der Marktvergleich ebenso, mit Herkunft `beta`',
    betaMarket.json?.paywall?.unlocked === true && betaMarket.json?.paywall?.grant === 'beta',
    JSON.stringify(betaMarket.json?.paywall ?? null))

  const betaRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_profiles', rowId: brandBeta,
  })
  check('BEWEIS, dass es wirklich am KONTO hängt: die Spalte ist leer',
    !betaRow.derivationUnlockedAt, JSON.stringify(betaRow.derivationUnlockedAt ?? null))

  // ══ 7 · DIE BETREIBER-LISTE ════════════════════════════════════════════
  console.log('\n7 · Die Betreiber-Liste')

  const listPath = '/api/brand/admin/derivation-unlocks'
  const listGuest = await call(listPath)
  check('ohne Anmeldung: 401', listGuest.status === 401, String(listGuest.status))
  const listStranger = await call(listPath, { cookie: stranger.cookie })
  check('ein fremdes Konto: 403', listStranger.status === 403, String(listStranger.status))

  const list = await call(listPath, { cookie: operator.cookie })
  const rowOf = id => (list.json?.items ?? []).find(item => item.id === id) ?? null
  check('der Betreiber sieht beide Spalten je Marke',
    list.status === 200
    && rowOf(brandA)?.derivationGrant === 'none'
    && rowOf(brandA)?.designUnlockedAt === null,
    `${list.status} ${JSON.stringify(rowOf(brandA))}`)
  check('… und beim Beta-Konto steht „beta" OHNE Datum',
    rowOf(brandBeta)?.derivationGrant === 'beta'
    && rowOf(brandBeta)?.derivationUnlockedAt === null,
    JSON.stringify(rowOf(brandBeta)))
  check('… die Marke ohne fertige Foundation ist als solche erkennbar (der Knopf bleibt aus)',
    rowOf(brandB)?.foundationDone === false && rowOf(brandA)?.foundationDone === true,
    JSON.stringify([rowOf(brandB)?.foundationDone, rowOf(brandA)?.foundationDone]))

  // ══ 8 · DIE ALTE ADRESSE ═══════════════════════════════════════════════
  console.log('\n8 · Die alte Betreiber-Seite leitet weiter (§2.20 Nr. 5)')

  const oldPage = await call('/de/dashboard/brand-design')
  check('`/de/dashboard/brand-design` ⇒ 301 auf `/de/dashboard/brand-unlocks`',
    oldPage.status === 301 && oldPage.headers.location === '/de/dashboard/brand-unlocks',
    `${oldPage.status} ${oldPage.headers.location}`)
  const oldPageEn = await call('/dashboard/brand-design')
  check('… und dasselbe ohne Sprach-Präfix',
    oldPageEn.status === 301 && oldPageEn.headers.location === '/dashboard/brand-unlocks',
    `${oldPageEn.status} ${oldPageEn.headers.location}`)

  // ══ 9 · DIE LIEFERUNG (K6) ═════════════════════════════════════════════
  console.log('\n9 · Die Lieferung: Manifest, Dateien, Zeichen, Bündel')

  /*
   * DREI FRISCHE MARKEN, WEIL DREI ZUSTÄNDE GEPRÜFT WERDEN: eine mit
   * abgenommenem Design (das volle Kit), eine ohne (die drei Context-Dateien)
   * und eine nur für den Eimer — der zählt je MARKE, und ein geteilter Zähler
   * machte aus dem Deckel-Beweis eine Frage der Reihenfolge.
   */
  const brandFull = await makeBrand(owner.cookie, 'Kailua Coffee Co.')
  const brandPlain = await makeBrand(owner.cookie, 'Lani Kontor')
  const brandBucket = await makeBrand(owner.cookie, 'Eimer Test')
  for (const id of [brandFull, brandPlain, brandBucket]) await completeFoundation(id)
  const seeded = await seedDesign(brandFull, operator.cookie)
  const unlockedAll = (await Promise.all(
    [brandFull, brandPlain, brandBucket].map(id => unlockDerivation(id, operator.cookie)),
  )).every(Boolean)
  check('drei Marken für die Lieferung: eine mit Design, zwei ohne — alle frei',
    seeded && unlockedAll, `${brandFull} · ${brandPlain} · ${brandBucket}`)

  const kitFull = `/api/brand/profiles/${brandFull}/kit`
  const kitPlain = `/api/brand/profiles/${brandPlain}/kit`

  const manifest = await call(kitFull, { cookie: owner.cookie })
  check('das Manifest nennt Marke, Stand, sechs Dateien, acht Zeichen und das Bündel',
    manifest.status === 200
    && manifest.json?.designReady === true
    && (manifest.json?.files ?? []).length === 6
    && (manifest.json?.marks ?? []).length === 8
    && manifest.json?.bundle?.filename === `kailua-coffee-co-brand-kit-${(manifest.json?.stand ?? '').slice(0, 10)}.zip`
    && manifest.json?.bundle?.weight === 5
    && manifest.json?.bundle?.missing === 0,
    `${manifest.status} ${JSON.stringify({
      ready: manifest.json?.designReady,
      files: (manifest.json?.files ?? []).length,
      marks: (manifest.json?.marks ?? []).length,
      bundle: manifest.json?.bundle,
    })}`)
  check('… und es trägt die drei Kit-Kapitel mit ihrem Zustand',
    (manifest.json?.chapters ?? []).length === 3
    && (manifest.json?.chapters ?? []).every(entry => typeof entry.state === 'string'),
    JSON.stringify(manifest.json?.chapters ?? null))
  check('… der Stand ist der JÜNGSTE aller Kapitel, nicht nur der Design-Kapitel',
    Boolean(manifest.json?.stand)
    && manifest.json.stand >= (manifest.json.designStand ?? '')
    && manifest.json.stand >= (manifest.json.foundationStand ?? ''),
    JSON.stringify({
      stand: manifest.json?.stand,
      design: manifest.json?.designStand,
      foundation: manifest.json?.foundationStand,
    }))

  const fileIds = ['tokens.json', 'tokens.css', 'licenses.md', 'brand.md', 'brand.json', 'readme.md']
  const fileResults = []
  for (const id of fileIds) {
    const res = await call(`${kitFull}/${id}`, { cookie: owner.cookie })
    fileResults.push({ id, res })
  }
  check('jede der sechs Dateien kommt mit 200, `private, no-store` und Dateinamen',
    fileResults.every(entry => entry.res.status === 200
      && entry.res.headers['cache-control'] === 'private, no-store'
      && String(entry.res.headers['content-disposition'] ?? '').includes('filename*=UTF-8')),
    JSON.stringify(fileResults.map(entry => [entry.id, entry.res.status,
      entry.res.headers['cache-control']])))
  check('… und jede trägt ihren eigenen Inhaltstyp',
    fileResults.find(entry => entry.id === 'tokens.json').res.headers['content-type']
      ?.startsWith('application/json')
    && fileResults.find(entry => entry.id === 'tokens.css').res.headers['content-type']
      ?.startsWith('text/css')
    && fileResults.find(entry => entry.id === 'brand.md').res.headers['content-type']
      ?.startsWith('text/markdown'),
    JSON.stringify(fileResults.map(entry => [entry.id, entry.res.headers['content-type']])))

  const markNames = (manifest.json?.marks ?? []).map(mark => mark.filename)
  const markResults = []
  for (const name of markNames) {
    markResults.push(await call(`${kitFull}/marks/${name}`, { cookie: owner.cookie }))
  }
  check('alle acht Zeichen kommen als SVG — mit Titel und ohne Zwischenspeicher',
    markResults.length === 8
    && markResults.every(res => res.status === 200
      && String(res.headers['content-type'] ?? '').startsWith('image/svg+xml')
      && res.headers['cache-control'] === 'private, no-store'
      && res.text.startsWith('<svg') && res.text.includes('<title>')),
    JSON.stringify(markResults.map(res => [res.status, res.headers['content-type']])))
  const foreignMark = await call(`${kitFull}/marks/gibt-es-nicht.svg`, { cookie: owner.cookie })
  check('… ein erfundener Zeichen-Name ist 404, kein Pfad',
    foreignMark.status === 404, String(foreignMark.status))

  /** Das Bündel als Bytes — `call` liefert Text, deshalb hier ein eigener Weg. */
  const fetchZip = (path, cookie) => new Promise((resolve, reject) => {
    const req = request({
      host: '::1', port: PORT, path, method: 'GET',
      headers: { host: HOST, ...(cookie ? { cookie } : {}) },
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks),
      }))
    })
    req.on('error', reject)
    req.end()
  })

  const zip = await fetchZip(`${kitFull}.zip`, owner.cookie)
  let zipNames = []
  try {
    zipNames = Object.keys(unzipSync(new Uint8Array(zip.body)))
  }
  catch { /* kein gültiges Zip — die Prüfung darunter wird rot */ }
  check('das Bündel ist ein gültiges Zip mit allen Dateien und acht Zeichen',
    zip.status === 200
    && zip.headers['content-type'] === 'application/zip'
    && zip.headers['cache-control'] === 'private, no-store'
    && String(zip.headers['content-disposition'] ?? '').includes('brand-kit')
    && zipNames.includes('README.md')
    && zipNames.filter(name => name.startsWith('marks/')).length === 8
    && zipNames.length === 14,
    `${zip.status} ${zip.headers['content-type']} ${JSON.stringify(zipNames)}`)
  check('… und die README im Bündel nennt den Ordner `marks/`',
    (() => {
      try {
        return strFromU8(unzipSync(new Uint8Array(zip.body))['README.md']).includes('`marks/`')
      }
      catch { return false }
    })(),
    'README.md')

  // ── Ohne Preset: dieselbe Marke, nur ohne Schicht 2 ────────────────────
  const plainTokens = await call(`${kitPlain}/tokens.json`, { cookie: owner.cookie })
  check('ohne Design antworten die Token-Dateien 409 `kit_file_design_missing`',
    plainTokens.status === 409
    && plainTokens.json?.reason === 'kit_file_design_missing',
    `${plainTokens.status} ${plainTokens.text.slice(0, 160)}`)
  const plainMark = await call(`${kitPlain}/marks/lani-kontor-wordmark-primary.svg`, { cookie: owner.cookie })
  check('… und ein Zeichen ebenso — 409 mit Grund, nicht 404',
    plainMark.status === 409 && plainMark.json?.reason === 'kit_file_design_missing',
    `${plainMark.status} ${plainMark.text.slice(0, 160)}`)

  const plainZip = await fetchZip(`${kitPlain}.zip`, owner.cookie)
  let plainNames = []
  try {
    plainNames = Object.keys(unzipSync(new Uint8Array(plainZip.body))).sort()
  }
  catch { /* s. o. */ }
  check('… das Bündel gibt es trotzdem — mit den drei Context-Dateien',
    plainZip.status === 200
    && plainNames.join(',') === 'README.md,brand.json,brand.md',
    `${plainZip.status} ${JSON.stringify(plainNames)}`)

  // ── Die drei Türen ────────────────────────────────────────────────────
  const strangerManifest = await call(kitFull, { cookie: stranger.cookie })
  const strangerFile = await call(`${kitFull}/brand.md`, { cookie: stranger.cookie })
  const strangerMark = await call(`${kitFull}/marks/${markNames[0]}`, { cookie: stranger.cookie })
  const strangerZip = await fetchZip(`${kitFull}.zip`, stranger.cookie)
  check('ein fremdes Konto bekommt überall 404 — Manifest, Datei, Zeichen, Bündel',
    [strangerManifest.status, strangerFile.status, strangerMark.status, strangerZip.status]
      .every(status => status === 404),
    JSON.stringify([strangerManifest.status, strangerFile.status, strangerMark.status, strangerZip.status]))

  // `brandA` ist seit Abschnitt 5 wieder gesperrt — die Gegenprobe im selben Lauf.
  const lockedZip = await fetchZip(`/api/brand/profiles/${brandA}/kit.zip`, owner.cookie)
  const lockedBody = JSON.parse(lockedZip.body.toString('utf8') || '{}')
  check('eine gesperrte Marke antwortet auf das Bündel 403 `derivation_locked`',
    lockedZip.status === 403 && lockedBody.reason === 'derivation_locked',
    `${lockedZip.status} ${lockedZip.body.toString('utf8').slice(0, 160)}`)

  // ── Der Eimer: das Bündel zählt fünffach ──────────────────────────────
  const bucketPath = `/api/brand/profiles/${brandBucket}/kit.zip`
  const bucketStatuses = []
  for (let round = 0; round < 12; round++) {
    bucketStatuses.push((await fetchZip(bucketPath, owner.cookie)).status)
  }
  const thirteenth = await fetchZip(bucketPath, owner.cookie)
  const thirteenthBody = JSON.parse(thirteenth.body.toString('utf8') || '{}')
  check('das Bündel zählt FÜNFFACH: zwölf gehen durch, das dreizehnte ist 429 `brand_kit_limit`',
    bucketStatuses.every(status => status === 200)
    && thirteenth.status === 429
    && thirteenthBody.reason === 'brand_kit_limit',
    `${JSON.stringify([...new Set(bucketStatuses)])} → ${thirteenth.status} `
    + thirteenth.body.toString('utf8').slice(0, 120))

  // ── Die Lieferseite selbst ────────────────────────────────────────────
  const page = await call(`/de/brand/${brandFull}/kit`, { cookie: owner.cookie })
  check('die Lieferseite rendert serverseitig und trägt den Markennamen',
    page.status === 200 && page.text.includes('Kailua Coffee Co.'),
    `${page.status} ${page.text.length} Zeichen`)
  const pageGuest = await call(`/de/brand/${brandFull}/kit`)
  check('… und ohne Anmeldung ist sie 404 (Datentür)',
    pageGuest.status === 404, String(pageGuest.status))

  // ══ 10 · DER BLICK IM BROWSER (nur mit --keep-kailua) ═══════════════════
  if (KEEP_KAILUA) {
    console.log('\n10 · Eine Marke zum Ansehen (--keep-kailua)')
    /* Alles, was AB HIER angelegt wird, bleibt stehen: die Listen werden am
     * Ende dieses Blocks auf ihre Länge von jetzt zurückgeschnitten. Das ist
     * genauer als „die letzten drei entfernen" — es bleibt richtig, wenn hier
     * später eine weitere Zeile dazukommt. */
    const keepMark = {
      profiles: cleanup.profiles.length,
      users: cleanup.users.length,
      access: cleanup.access.length,
    }
    const keepOwner = await makeAccount('keep', { beta: true })
    const keepBrand = await makeBrand(keepOwner.cookie, 'Kailua Coffee Co.')
    await completeFoundation(keepBrand)
    const keepSeeded = await seedDesign(keepBrand, operator.cookie)
    const keepFree = await unlockDerivation(keepBrand, operator.cookie)
    const keepPage = await call(`/de/brand/${keepBrand}/kit`, { cookie: keepOwner.cookie })
    check('die Marke zum Ansehen steht — Foundation, Design, Ableitung, Seite',
      keepSeeded && keepFree && keepPage.status === 200, `${keepPage.status}`)
    cleanup.profiles.length = keepMark.profiles
    cleanup.users.length = keepMark.users
    cleanup.access.length = keepMark.access
    kept = { brandId: keepBrand, cookie: keepOwner.cookie, port: PORT }
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  for (const id of cleanup.profiles) {
    for (const table of ['brand_messages', 'brand_findings', 'brand_events', 'brand_shares']) {
      const rows = await tablesDB.listRows({
        databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
      }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) {
        await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
      }
    }
    // Alle Kapitel-Zeilen aller drei Schichten — der Beweis legt die dritte an.
    const stepRows = await tablesDB.listRows({
      databaseId, tableId: 'brand_steps', queries: [Query.equal('profileId', id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of stepRows.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_steps', rowId: row.$id }).catch(() => {})
    }
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.access) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }
  if (cleanup.admission) {
    if (cleanup.admission.existed) {
      await tablesDB.updateRow({
        databaseId, tableId: 'app_config', rowId: 'global',
        data: { brandAdmissionMode: cleanup.admission.before },
      }).catch(() => {})
    }
    else {
      await tablesDB.deleteRow({ databaseId, tableId: 'app_config', rowId: 'global' }).catch(() => {})
    }
  }

  if (kept) {
    console.log('\n── Zum Ansehen im Browser (räumt sich NICHT weg) ─────────────────')
    console.log(`BRAND_ID=${kept.brandId}`)
    console.log(`COOKIE=${kept.cookie}`)
    console.log(`URL=http://localhost:${kept.port}/de/brand/${kept.brandId}/kit`)
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
