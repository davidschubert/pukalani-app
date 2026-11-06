/**
 * DER PRODUKT-BEWEIS DER SCHICHT 2 „BRAND DESIGN" (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.18, Paket D9) — EIN Lauf von der gesperrten
 * Schicht bis zum geteilten Abbild.
 *
 * ── WARUM ER NEBEN `verify-brand-sessions.mjs` STEHT ─────────────────────
 * Der Sessions-Beweis prüft die MASCHINE: Eröffnungszug, Sperren, Korrektur-
 * Regel, Invarianten, jede Route eines Kapitels für sich (Abschnitte 21–31).
 * Er ist deshalb lang, und er wächst mit jedem Paket weiter.
 *
 * Dieser hier prüft das PRODUKT, in der Sprache des Konzepts: Kann eine Marke
 * freigeschaltet werden, laufen die sechs Kapitel durch, entsteht daraus ein
 * Preset, füllt es Kapitel 10 und das Board, und trägt der geteilte Link genau
 * das — und nichts Privates? Er ist damit die Zusage, die man einem Menschen
 * gibt, nicht die Zusage, die man einer Route gibt. Beide Beweise laufen
 * unabhängig: eigene Konten, eigene Marken, eigene Hilfsmittel.
 *
 * ── DIE ZEHN ZUSAGEN ─────────────────────────────────────────────────────
 *  1. VOR DER FREISCHALTUNG IST NICHTS DA: die sechs Kapitel stehen auf
 *     `design_locked`, die Werkstatt sagt es in EINEM Satz, das Board zeigt
 *     eine ruhige Sperr-Fläche („0 von 6 Kapiteln", HTTP 200 — kein 404 auf
 *     eine Adresse, die der Rail selbst anbietet), und JEDE Route der Schicht
 *     antwortet 404. Kapitel 10 der Leseansicht bleibt die Schranke.
 *  2. FREISCHALTEN IST EINE BETREIBER-HANDLUNG: ohne Anmeldung 401, mit einem
 *     fremden Konto 403, für den EIGENTÜMER 403 — und OHNE fertige Foundation
 *     409 `foundation_incomplete`. Erst danach greift sie, mit Ereignis.
 *  3. DIE WEICHE HAT ZWEI WEGE, UND BEIDE FÜHREN DURCH: Marke A geht über
 *     Vorbilder samt Lesung, Marke B ohne — in BEIDEN ist `g.dna` erreichbar
 *     und das Kapitel abnehmbar.
 *  4. JEDES KAPITEL BEKOMMT SEINE VORBELEGUNG AUS DEM VORGÄNGER (H5): die
 *     Bühne trägt die Quell-Werte der Kapitel davor, jede Session ist als
 *     BESTÄTIGUNG durchlaufbar, und nach der Abnahme geht das nächste auf.
 *  5. DAS PRESET ENTSTEHT AUS DER WAHRHEIT: sechs von sechs Kapiteln, alle
 *     sechs Teile besetzt — und die behaltenen KI-Entwürfe stehen NUR im
 *     privaten Preset.
 *  6. KAPITEL 10 UND DAS BOARD: die Leseansicht zeigt Farbwelt, Typografie,
 *     Zeichen, Bildsprache und Bewegung mit ihren fünf Sprungmarken; die
 *     Board-Seite gehört dem Besitzer (200) und sonst niemandem (404).
 *  7. DER SNAPSHOT STEIGT AUF v2: `schemaVersion: 2`, das Preset ohne
 *     `keptDrafts`, kein Vorbild, keine Lesung, kein Entwurf — auch nicht als
 *     roher Slot-Wert in `chapters` — seit D9 fällt dort das ganze KAPITEL,
 *     die visuelle Identität reist ausschliesslich als Preset. Ein v1-Abbild
 *     bleibt lesbar.
 *  8. DIE RÜCKNAHME NIMMT NICHTS WEG: die Kapitel sind wieder `design_locked`,
 *     die Werte stehen unverändert in der Ablage, und die zweite Freischaltung
 *     findet den ganzen Stand vor.
 *  9. DIE DECKEL GREIFEN: die vierte Lesung und der vierte Entwurfs-Lauf am
 *     selben Tag ⇒ 429, der elfte DNA-Vorschlag ⇒ 429, das dreizehnte Vorbild
 *     ⇒ 409. Jeder Lauf hinterlässt eine Ereignis-Zeile mit KENNZAHLEN.
 * 10. GDPR: der Export nennt Vorbilder und Entwürfe als METADATEN (nie die
 *     Bilder), und die Löschung räumt Zeilen UND Dateien aus beiden Buckets.
 *
 * ── DIE GEGENPROBE ───────────────────────────────────────────────────────
 * Mit `VERIFY_EXPECT_LEAK=1` dreht das Skript jede „steht NICHT darin"-Zusage
 * um (Zusage 7) und MUSS rot werden. Ohne diese Kehrseite wäre ein „enthält
 * nicht" auch für eine leere Antwort grün — die positiven Zusagen daneben (das
 * Preset STEHT im Abbild) sind die zweite Hälfte desselben Gedankens.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Anbieter. Die drei KI-Läufe (Lesung, DNA-Vorschlag, Briefing) und die
 * Bild-Erzeugung laufen über die Dev-Ersätze — geprüft wird, was VOR und NEBEN
 * dem Modell passiert: Sperren, Klemmung, Ablage, Deckel, Ereignis. Und er
 * beweist nicht die Farb-Mathematik: die gehört der Themes-Engine und ist in
 * `tests/brandDesign*.test.ts` belegt (2 651 Unit-Tests).
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`-Tabellen (bis brand-024) und ein
 * Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md „Tests"). Konten,
 * Beta-Zugang und Marken legt das Skript selbst an und räumt am Ende alles weg.
 *
 *   BRAND_DEV_STUB_REVIEW=1 BRAND_DEV_STUB_VISION=1 BRAND_DEV_STUB_DNA=1 \
 *     BRAND_DEV_STUB_MARK=1 BRAND_DEV_STUB_IMAGE=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-design.mjs
 */
import { createHash, randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { Client, ID, Query, Storage, TablesDB, Users } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'

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
const storage = new Storage(client)
const users = new Users(client)

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], aiFlag: null }

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
 * DIE EINE ZUSAGE, DIE SICH UMDREHEN LÄSST: „das steht NICHT darin". Mit
 * `VERIFY_EXPECT_LEAK=1` wird daraus „es steht darin" — und weil es das nicht
 * tut, ist der Lauf rot (s. Kopf).
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
        catch { /* SSE oder HTML */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Derselbe Weg mit multipart-Rumpf — von Hand gebaut, s. `call`. */
function callUpload(path, { fields = {}, file = null, cookie } = {}) {
  const boundary = `----pukalani${Math.random().toString(16).slice(2)}`
  const parts = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n`
      + `Content-Type: ${file.type}\r\n\r\n`,
    ))
    parts.push(file.data)
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  const payload = Buffer.concat(parts)

  return new Promise((resolve, reject) => {
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        host: HOST,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': payload.length,
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* kein JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/** Ein Bild-Abruf, der die BYTES behält — `call` macht aus einem PNG Unsinn. */
function callBinary(path, { cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '::1', port: PORT, path, method: 'GET',
      headers: { host: HOST, ...(cookie ? { cookie } : {}) },
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Ein echtes PNG, 1 × 1 Pixel — als Bytes, damit der Beweis ohne Anhänge läuft. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * DIE ZEHN DIMENSIONEN DER VISUAL DNA — als Liste, damit die Antwort des Laufs
 * gegen den KATALOG geprüft wird und nicht gegen sich selbst (Beweis-Regel 1
 * aus CLAUDE.md: Erwartungswerte nie aus der geprüften Antwort ableiten).
 *
 * Abgeschrieben aus `shared/brandDesignVocab.ts` statt importiert: die Datei
 * hat relative Importe ohne Endung, und Node löst die aus einem `.mjs` heraus
 * nicht auf. Läuft sie auseinander, wird dieser Beweis rot — der gewollte
 * Wächter, kein stiller Durchlauf.
 */
const DNA_DIMENSIONS = [
  'style', 'era', 'form', 'typography', 'color',
  'imagery', 'composition', 'materiality', 'motion', 'mood',
]

/** Die sechs Kapitel der Schicht, in ihrer Reihenfolge (Registry D0). */
const DESIGN_STEPS = ['dna', 'color', 'type', 'mark', 'imagery', 'motion']

const stamp = Date.now()

/**
 * EIN KONTO MIT BETA-ZUGANG. `labels: ['admin']` macht daraus einen BETREIBER
 * (`users.manage` liegt im Wildcard der admin-Rolle) — ohne das Argument bleibt
 * es ein gewöhnliches Beta-Konto, und genau das ist die Gegenprobe zu Zusage 2.
 */
async function makeAccount(tag, { labels } = {}) {
  const user = await users.create({
    userId: ID.unique(),
    email: `d9-design-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'D9-Design-Beweis',
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

/** Die KI muss AN sein, sonst antworten die Läufe `{ conversed: false }`. */
async function ensureAiEnabled() {
  let row = null
  try {
    row = await tablesDB.getRow({ databaseId, tableId: 'app_config', rowId: 'global' })
  }
  catch { /* keine Zeile */ }
  if (row?.brandAiEnabled === true) return
  cleanup.aiFlag = row ? { existed: true, before: row.brandAiEnabled ?? null } : { existed: false }
  if (row) {
    await tablesDB.updateRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true },
    })
  }
  else {
    await tablesDB.createRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true },
    })
  }
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
 * DEN ENTWURF EINES LAUFS BESTÄTIGEN — genau das, was der Mensch tut, nachdem
 * Frida geschrieben hat. Kein neuer Wert: bestätigt wird, was DA STEHT.
 */
async function confirmDraft(profileId, stepKey, slotId) {
  const rowId = `${profileId}_${stepKey}`
  const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
  const slots = JSON.parse(row.slots || '{}')
  const draft = slots[slotId]?.latestDraft ?? ''
  slots[slotId] = { ...slots[slotId], confirmed: draft }
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId,
    data: { slots: JSON.stringify(slots), revision: (row.revision ?? 0) + 1 },
  })
  return draft
}

/** Die Slots einer Kapitel-Zeile lesen — für die Zusagen über die ABLAGE. */
async function readSlots(profileId, stepKey) {
  const row = await tablesDB.getRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`,
  })
  return JSON.parse(row.slots || '{}')
}

/** Eine Marke mit Konto anlegen — Titel und Herkunft wie im Beispiel. */
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

/**
 * DIE FOUNDATION AUF FERTIG — server-seitig, ohne die neun Kapitel zu spielen.
 *
 * Der Weg dorthin ist der Gegenstand von `verify-brand-sessions.mjs`; hier ist
 * er die VORBEDINGUNG. Die drei Werte sind die, an denen Schicht 2 wirklich
 * hängt: die gewählte Richtung (Farb-Kandidaten und Boards schöpfen daraus),
 * der Archetyp und die Werte (sie stehen im Prompt jedes Design-Laufs).
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

/**
 * EIN KAPITEL ABNEHMEN UND SCHLIESSEN — bestätigen ist die Session, ABNEHMEN
 * ist das Kapitel (§5a). Ohne den zweiten Schritt bleibt das nächste Kapitel
 * zu, und das wäre kein Befund über Brand Design, sondern der normale Weg.
 */
async function acceptAndComplete(profileId, cookie, stepKey) {
  const base = `/api/brand/profiles/${profileId}`
  const acceptance = await call(`${base}/steps/${stepKey}/acceptance`, { cookie })
  const pending = (acceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  let revision = acceptance.json?.revision ?? 0
  for (const entry of (acceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${base}/steps/${stepKey}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie, body: { revision },
    })
    if (taken.status !== 200) return { pending, accepted: false, detail: `${entry.slotId}: ${taken.status}` }
    revision = taken.json?.revision ?? revision
  }
  const done = await call(`${base}/steps/${stepKey}/complete`, {
    method: 'POST', cookie, body: { confidence: 'fits' },
  })
  return { pending, accepted: done.status === 200, detail: `${done.status} ${done.text.slice(0, 160)}` }
}

/**
 * EIN NEUES DROSSEL-FENSTER — aber nur so lange, wie es sein muss.
 *
 * `05.rate-limit.ts` zählt je IP und Minute. Die fachlichen Deckel (drei
 * Lesungen, zehn Vorschläge, zwölf Vorbilder) liegen DAHINTER, und wer sie
 * beweisen will, muss sie erreichen, ohne vorher an der eigenen Bremse zu
 * landen — sonst steht im Protokoll 429 „zu schnell", wo „heute genug" die
 * geprüfte Antwort wäre. Gewartet wird deshalb GENAU die Restzeit seit dem
 * letzten Aufruf desselben Eimers, nicht pauschal eine Minute.
 */
function waitForRateWindow(sinceMs) {
  const rest = 62_000 - (Date.now() - sinceMs)
  return rest > 0 ? new Promise(resolve => setTimeout(resolve, rest)) : Promise.resolve()
}

/* ── Die Werte der sechs Kapitel ──────────────────────────────────────────
 *
 * Sie sind die abgenommenen von Kailua Coffee Co. (Prototyp, §2.8) und stehen
 * hier als LITERAL: der Beweis vergleicht das Preset später gegen genau diese
 * Entscheidungen, nicht gegen das, was die Antwort gerade sagt.
 *
 * Was sonst der Browser schreibt (Rampen-Streifen, Rollen, Kontrast-Matrix,
 * Setzungen, Übergänge), steht als Wert in der FORM, die die Regeln erzeugen —
 * geprüft wird die Kette darum herum. Die tragenden Werte (Basisfarbe, Paar,
 * Richtung, Prinzip, Tempo) sind echt, denn aus ihnen rechnet das Preset.
 */
/** Die sechs Kapitel der Schicht 2 — dieselbe Liste wie `BRAND_DESIGN_STEP_KEYS`. */
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

const BOARDS_PLACEHOLDER = ['style', 'era', 'form']
  .map(id => `## ${id}\nPlatzhalter`).join('\n\n')

const RAMP_PLACEHOLDER = '## Hell\n50 #ffffff · 950 #000000\n\n## Dunkel\n50 #ffffff · 950 #000000'

const ROLES_PLACEHOLDER = ['Grund & Text', 'Wärme & Flächen', 'Helle Flächen', 'Akzent & Signal', 'Papier & Ruhe']
  .map(label => `## ${label}\n${BASE_HEX} · Rampe 900 · Platzhalter`).join('\n\n')

const CONTRAST_PLACEHOLDER = ['Fließtext auf Papier', 'Überschrift auf Papier']
  .map(label => `## ${label}\n${BASE_HEX} · #ffffff · 13,5:1 · AAA`).join('\n\n')

const TYPE_RULES = [
  '## Überschrift-Gewicht\n600 · Gilt für Überschriften und die Wortmarke; der Fliesstext bleibt im Normalschnitt.',
  '## Laufweite\n-0,5 px · Feinkorrektur der Überschrift. Der Fliesstext wird nie gesperrt.',
  '## Versalien\nNein · Versalien sind eine Ausnahme, kein Stil — sie kosten Lesbarkeit.',
  "## Mono-Rolle\n'Geist Mono', ui-monospace, SFMono-Regular, monospace · Fest: Herkunftsangaben, Preise, Zahlen und Code — sonst nirgends.",
].join('\n\n')

const MARK_EXAMPLES_PLACEHOLDER = [
  '## Setzungen\nWortmarke: Kailua Coffee · Monogramm: K · Schrift: Source Serif 4',
  '## Primär\nTinte #352217 · Grund #fcfaf9 · Schutzraum-Linie #a9836e',
  '## Invertiert\nTinte #fcfaf9 · Grund #352217 · Schutzraum-Linie #c8a694',
  '## Einfarbig\nTinte #0c0a09 · Grund #ffffff · Schutzraum-Linie #aba49c',
  '## Icon-Fläche\nTinte #fcfaf9 · Grund #5f4130 · Schutzraum-Linie #e8e6e3',
  '## Maße\nSchutzraum = Höhe des Versal-K · Wortmarke mind. 96 px / 24 mm · Monogramm mind. 24 px · Eckenradius 18 %',
].join('\n\n')

const IMAGERY_PRINCIPLE = [
  '## Prinzip\nNah am Handwerk · Textur statt Szene: Material, Werkzeug, Spur der Arbeit.',
  '## Licht\nDiffuses, gleichmäßiges Licht ohne Drama.',
  '## Ausschnitt\nSehr nah: das Detail füllt das Bild.',
  '## Menschen\nHände im Bild, Gesicht optional.',
  '## Farbigkeit\nNur Töne aus eurer Farbwelt, keine Fremdfarbe.',
].join('\n\n')

const IMAGERY_DODONT = [
  'Weiches Seitenlicht, sichtbare Schatten, keine Aufheller. — Don’t: Studioblitz ohne einen einzigen Schatten.',
  'Sehr naher Ausschnitt, das Detail füllt das Bild. — Don’t: Weite Übersichten ohne Gegenstand.',
  'Hände bei der Arbeit, nie in die Kamera lächelnd. — Don’t: Gestellte Gruppenbilder mit Daumen hoch.',
  'Gedämpfte Töne aus eurer Farbwelt, der Akzent sparsam. — Don’t: Farbfilter, die eure Töne verschieben.',
  'Feine Konturzeichnungen in EINER Strichstärke. — Don’t: Zeichnungen aus fremden Bibliotheken.',
  'Icons als Linie, 1,5 px stark — dieselbe Stärke überall. — Don’t: Icons aus zwei Sätzen auf einer Seite.',
].map(line => `- Do: ${line}`).join('\n')

const CALM_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const MOTION_TRANSITIONS = [
  `## motion.fast\n120 ms · ${CALM_EASING} · Hover, Fokus, kleine Zustände.`,
  `## motion.base\n240 ms · ${CALM_EASING} · Karten, Einblendungen, Menüs.`,
  `## motion.slow\n384 ms · ${CALM_EASING} · Seitenwechsel, große Flächen.`,
  `## motion.stagger\n60 ms · ${CALM_EASING} · Versatz zwischen Geschwistern (Listen, Karten).`,
].join('\n\n')

const MOTION_RULES = [
  'Bewegung erklärt einen Zusammenhang oder sie entfällt — Dekoration bewegt sich nie.',
  'Nur zwei Eigenschaften gleichzeitig: Deckkraft und eine Verschiebung.',
  'Kein Überschwingen: die Kurve läuft aus, sie federt nie.',
  'Das Zeichen steht still — auch im Vorspann eines Videos.',
  'Nichts läuft länger als 384 ms — das ist motion.slow.',
  'Bei „weniger Bewegung" im Betriebssystem steht der Endzustand sofort.',
].map(line => `- ${line}`).join('\n')

try {
  await ensureAiEnabled()

  const owner = await makeAccount('owner')
  const operator = await makeAccount('operator', { labels: ['admin'] })
  const stranger = await makeAccount('stranger')

  const brandA = await makeBrand(owner.cookie, 'Kailua Coffee')
  const brandB = await makeBrand(owner.cookie, 'Lani Studio')
  const a = `/api/brand/profiles/${brandA}`
  const b = `/api/brand/profiles/${brandB}`

  await completeFoundation(brandA)

  // ══ 1 · VOR DER FREISCHALTUNG IST DIE SCHICHT ZU ════════════════════════
  console.log('\n1 · Vor der Freischaltung: sechs gesperrte Kapitel, kein Zugang')

  const lockedJourney = await call(a, { cookie: owner.cookie })
  const lockedEntry = key => (lockedJourney.json?.journey ?? []).find(e => e.stepKey === key)
  check('die Journey nennt ALLE sechs Kapitel gesperrt — mit dem eigenen Grund `design_locked`',
    DESIGN_STEPS.every(key => lockedEntry(key)?.state === 'locked'
      && lockedEntry(key)?.reason === 'design_locked'),
    JSON.stringify(DESIGN_STEPS.map(key => [key, lockedEntry(key)?.state, lockedEntry(key)?.reason])))

  const lockedDna = await call(`${a}/steps/dna`, { cookie: owner.cookie })
  check('das erste Kapitel antwortet 403 `design_locked` (nicht das gewöhnliche `locked`)',
    lockedDna.status === 403 && lockedDna.json?.reason === 'design_locked',
    `${lockedDna.status} ${JSON.stringify(lockedDna.json?.reason ?? null)}`)

  const lockedPage = await call(`/de/brand/${brandA}/dna`, { cookie: owner.cookie })
  check('die Werkstatt erklärt es in EINEM Satz — nicht „Schließ das Kapitel davor ab"',
    lockedPage.status === 200
    && lockedPage.text.includes('Brand Design ist noch nicht freigeschaltet')
    && !lockedPage.text.includes('Schließ das Kapitel davor ab'),
    `${lockedPage.status} ${lockedPage.text.length} Zeichen`)

  /**
   * DAS BOARD IST EINE SPERR-FLÄCHE, KEIN 404 (D9-Härtung, offener Punkt aus
   * D8): der Rail bietet diese Adresse selbst an, und ein 404 darauf wäre eine
   * Sackgasse mit Absicht. Festgenagelt wird beides: HTTP 200 UND der Stand.
   */
  const lockedBoard = await call(`/de/brand/${brandA}/design`, { cookie: owner.cookie })
  check('die Board-Seite ist die ruhige Sperr-Fläche: 200, „0 von 6 Kapiteln"',
    lockedBoard.status === 200
    && lockedBoard.text.includes('data-design-locked')
    && lockedBoard.text.includes('0 von 6 Kapiteln')
    && !lockedBoard.text.includes('data-design-board'),
    `${lockedBoard.status} ${lockedBoard.text.length} Zeichen`)

  const lockedPreset = await call(`${a}/design`, { cookie: owner.cookie })
  check('… und die Preset-Route sagt dasselbe in Zahlen: kein Preset, 0 von 6',
    lockedPreset.status === 200 && lockedPreset.json?.preset === null
    && lockedPreset.json?.done === 0 && lockedPreset.json?.total === 6,
    `${lockedPreset.status} ${JSON.stringify({
      preset: lockedPreset.json?.preset, done: lockedPreset.json?.done,
    })}`)

  /**
   * JEDE ROUTE DER SCHICHT IST 404 — nicht 403 (Datentür-Regel dieses Layers,
   * Kopf von `brandInspirationStore.ts`): wo es keine Seite gibt, die etwas
   * erklärt, gibt es auch nichts zu verraten.
   */
  const closedRoutes = [
    ['die Vorbilder-Liste', 'GET', `${a}/inspiration`],
    ['der Vorbild-Upload', 'POST', `${a}/inspiration`],
    ['die Lesung', 'POST', `${a}/inspiration/read`],
    ['der DNA-Vorschlag', 'POST', `${a}/dna/propose`],
    ['das Zeichen-Briefing', 'POST', `${a}/mark/brief`],
    ['die KI-Entwürfe', 'POST', `${a}/mark/drafts`],
  ]
  for (const [label, method, path] of closedRoutes) {
    let res = await call(path, { method, cookie: owner.cookie })
    /*
     * DIE IP-BREMSE STEHT VOR DER ROUTE (`05.rate-limit.ts`) — wer diesen
     * Beweis binnen einer Minute ein zweites Mal startet, läuft hier in den
     * Nachlauf seines eigenen vorigen Laufs (Abschnitt 10 leert die Eimer der
     * Läufe). Ein 429 ist dann keine Aussage über die Sperre, sondern über den
     * Beweis selbst: einmal warten, dann noch einmal fragen.
     */
    if (res.status === 429) {
      await waitForRateWindow(Date.now())
      res = await call(path, { method, cookie: owner.cookie })
    }
    check(`${label} ⇒ 404, solange die Schicht zu ist`, res.status === 404,
      `${res.status} ${res.text.slice(0, 120)}`)
  }

  const lockedFoundation = await call(`/de/brand/${brandA}/foundation`, { cookie: owner.cookie })
  check('Kapitel 10 der Leseansicht bleibt die Schranke („folgt in Brand Design")',
    lockedFoundation.status === 200
    && lockedFoundation.text.includes('folgt in Brand Design')
    && !lockedFoundation.text.includes('data-design-chapter'),
    `${lockedFoundation.status} ${lockedFoundation.text.length} Zeichen`)

  // ══ 2 · DIE FREISCHALTUNG IST EINE BETREIBER-HANDLUNG ═══════════════════
  console.log('\n2 · Die Freischaltung: wer sie darf, und was sie voraussetzt')

  const unlockA = `/api/brand/admin/profiles/${brandA}/design-unlock`

  const guestUnlock = await call(unlockA, { method: 'POST' })
  check('ohne Anmeldung: 401', guestUnlock.status === 401, String(guestUnlock.status))
  const strangerUnlock = await call(unlockA, { method: 'POST', cookie: stranger.cookie })
  check('ein fremdes Beta-Konto: 403 (kein `users.manage`)', strangerUnlock.status === 403,
    String(strangerUnlock.status))
  const ownerUnlock = await call(unlockA, { method: 'POST', cookie: owner.cookie })
  check('auch der EIGENTÜMER kann sich Brand Design nicht selbst freischalten: 403',
    ownerUnlock.status === 403, String(ownerUnlock.status))

  /**
   * DIE GEGENPROBE STEHT AN EINER ZWEITEN MARKE (`Lani Studio`): sie hat
   * dieselben Rechte und denselben Betreiber — ihr fehlt nur das
   * Foundation-Ergebnis. Ein 409 hier beweist deshalb die BEDINGUNG und nicht
   * bloss ein geschlossenes Tor.
   */
  const tooEarly = await call(`/api/brand/admin/profiles/${brandB}/design-unlock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('GEGENPROBE: ohne fertige Foundation ⇒ 409 `foundation_incomplete`',
    tooEarly.status === 409 && tooEarly.json?.reason === 'foundation_incomplete',
    `${tooEarly.status} ${JSON.stringify(tooEarly.json?.reason ?? null)}`)

  const unlocked = await call(unlockA, { method: 'POST', cookie: operator.cookie })
  check('mit fertiger Foundation greift sie — Datum gesetzt, Betreiber genannt',
    unlocked.status === 200
    && typeof unlocked.json?.item?.designUnlockedAt === 'string'
    && unlocked.json.item.designUnlockedAt.length > 0
    && unlocked.json?.item?.designUnlockedBy === operator.id,
    `${unlocked.status} ${JSON.stringify(unlocked.json?.item ?? null)}`)

  const openJourney = await call(a, { cookie: owner.cookie })
  const openEntry = key => (openJourney.json?.journey ?? []).find(e => e.stepKey === key)
  check('danach ist `dna` offen — und `color` wartet auf den VORGÄNGER, nicht auf das Studio',
    openEntry('dna')?.state === 'open'
    && openEntry('color')?.state === 'locked'
    && openEntry('color')?.reason === 'awaiting_previous',
    JSON.stringify([openEntry('dna'), openEntry('color')]))

  const ctaPage = await call(`/de/brand/${brandA}/foundation`, { cookie: owner.cookie })
  check('Kapitel 10 lädt jetzt ein: „Brand Design starten"',
    ctaPage.text.includes('Brand Design starten')
    && ctaPage.text.includes('Freigeschaltet vom Studio am'),
    `${ctaPage.status} ${ctaPage.text.length} Zeichen`)

  const unlockEvents = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [
      Query.equal('profileId', brandA), Query.equal('type', 'design.unlocked'), Query.limit(10),
    ],
  }).catch(() => ({ rows: [] }))
  check('die Handlung steht im Funnel — genau einmal, mit dem Betreiber und ohne Inhalt',
    unlockEvents.rows.length === 1
    && unlockEvents.rows[0]?.userId === operator.id
    && !String(unlockEvents.rows[0]?.payload ?? '').includes('Kailua'),
    JSON.stringify(unlockEvents.rows.map(row => row.userId)))

  // ══ 3 · KAPITEL 1 MIT VORBILDERN (Marke A) ══════════════════════════════
  console.log('\n3 · Der Weg MIT Vorbildern: ablegen, lesen lassen, DNA')

  const dnaOpen = await call(`${a}/steps/dna`, { cookie: owner.cookie })
  check('das Kapitel steht offen und seine erste Session auch (die Weiche)',
    dnaOpen.status === 200 && dnaOpen.json?.sessions?.['g.source']?.state === 'open',
    `${dnaOpen.status} g.source=${dnaOpen.json?.sessions?.['g.source']?.state}`)
  check('… und die Bühne bringt die gewählte RICHTUNG aus der Foundation mit',
    dnaOpen.json?.sourceValues?.['result.direction'] === 'warm-editorial',
    JSON.stringify(dnaOpen.json?.sourceValues ?? {}))

  const sourceSaved = await call(`${a}/steps/dna`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      revision: dnaOpen.json?.revision ?? 0,
      slots: { 'g.source': { value: 'inspiration', confirmed: true } },
    },
  })
  check('die Weiche nimmt „inspiration"',
    sourceSaved.status === 200 && sourceSaved.json?.slots?.['g.source']?.confirmed === 'inspiration',
    `${sourceSaved.status} ${JSON.stringify(sourceSaved.json?.slots?.['g.source'] ?? null)}`)

  const inspBase = `${a}/inspiration`
  let lastInspirationHit = Date.now()
  const up1 = await callUpload(inspBase, {
    fields: { area: 'color', note: 'Warm und einladend.' },
    file: { name: 'roesterei.png', type: 'image/png', data: TINY_PNG },
    cookie: owner.cookie,
  })
  const up2 = await callUpload(inspBase, {
    fields: { area: 'composition', note: '' },
    file: { name: 'verlag.png', type: 'image/png', data: TINY_PNG },
    cookie: owner.cookie,
  })
  lastInspirationHit = Date.now()
  check('zwei Vorbilder liegen ab — mit Nummer, Bereich und Notiz',
    up1.status === 201 && up1.json?.item?.number === 1 && up1.json?.item?.area === 'color'
    && up2.status === 201 && up2.json?.item?.number === 2,
    `${up1.status}/${up2.status} ${JSON.stringify(up1.json?.item ?? null)}`)

  const firstImageId = up1.json?.item?.id ?? ''
  const ownImage = await callBinary(`${inspBase}/${firstImageId}/image`, { cookie: owner.cookie })
  check('das Bild kommt beim Besitzer an — und NIE aus einem Zwischenspeicher',
    ownImage.status === 200 && ownImage.body.equals(TINY_PNG)
    && String(ownImage.headers['cache-control']) === 'private, no-store',
    `${ownImage.status} ${ownImage.headers['cache-control']} · ${ownImage.body.length} Bytes`)
  const foreignImage = await callBinary(`${inspBase}/${firstImageId}/image`, { cookie: stranger.cookie })
  check('… ein fremdes Konto bekommt es nicht (404, Fremdwerk bleibt privat)',
    foreignImage.status === 404, String(foreignImage.status))

  const inspSlots = await readSlots(brandA, 'dna')
  check('der Slot `g.inspiration` trägt die Auswahl in Worten — und wird NIE bestätigt',
    String(inspSlots['g.inspiration']?.latestDraft ?? '').startsWith('## 1 · Farbwelt')
    && !inspSlots['g.inspiration']?.confirmed,
    JSON.stringify(inspSlots['g.inspiration'] ?? null))

  let lastReadingRun = Date.now()
  const reading = await call(`${inspBase}/read`, { method: 'POST', cookie: owner.cookie })
  const readingStub = reading.status === 200
  if (!readingStub) {
    check('ohne Vision-Modell antwortet die Lesung ruhig mit 503 `vision_unavailable`',
      reading.status === 503 && reading.json?.reason === 'vision_unavailable',
      `${reading.status} ${JSON.stringify(reading.json?.reason ?? null)}`)
  }
  else {
    const readItems = reading.json?.items ?? []
    check('die Lesung liest BEIDE Bilder — je Bild ein Urteil aus dem Vokabular',
      readItems.length === 2
      && readItems.every(item => ['fits', 'tension', 'off'].includes(item.reading?.verdict)),
      JSON.stringify(readItems.map(item => item.reading?.verdict ?? null)))
    check('… und sie nennt ihr Rest-Kontingent',
      reading.json?.quota?.limit === 3 && reading.json?.quota?.remaining === 2,
      JSON.stringify(reading.json?.quota ?? null))
    const readSlot = (await readSlots(brandA, 'dna'))['g.reading'] ?? null
    check('… ihr Fazit liegt als UNBESTÄTIGTER Slot-Wert in der Ablage',
      typeof readSlot?.latestDraft === 'string' && readSlot.latestDraft.length > 0
      && !readSlot?.confirmed,
      JSON.stringify(readSlot?.confirmed ?? null))
  }

  let lastDnaRun = Date.now()
  const propose = await call(`${a}/dna/propose`, { method: 'POST', cookie: owner.cookie })
  const dnaStub = propose.status === 200
  if (!dnaStub) {
    check('ohne Text-Modell antwortet der Vorschlag ruhig mit 503 `dna_unavailable`',
      propose.status === 503 && propose.json?.reason === 'dna_unavailable',
      `${propose.status} ${JSON.stringify(propose.json?.reason ?? null)}`)
  }
  else {
    const entries = propose.json?.entries ?? []
    check('der Vorschlag schreibt GENAU die zehn Dimensionen des Katalogs',
      entries.length === DNA_DIMENSIONS.length
      && DNA_DIMENSIONS.every(dim => entries.some(entry => entry.dimension === dim)),
      JSON.stringify(entries.map(entry => entry.dimension)))
    check('… jede Zeile trägt eine Begründung, keine erfundene Dimension',
      entries.every(entry => typeof entry.reason === 'string' && entry.reason.length > 0),
      JSON.stringify(entries[0] ?? null))
    check('… mit Vorbildern trägt mindestens EINE Zeile `both` — und keine `inspiration` allein',
      entries.some(entry => entry.origin === 'both')
      && entries.every(entry => entry.origin !== 'inspiration'),
      JSON.stringify([...new Set(entries.map(entry => entry.origin))]))
  }

  await confirmDraft(brandA, 'dna', 'g.dna')
  const afterDna = await call(`${a}/steps/dna`, { cookie: owner.cookie })
  check('bestätigte DNA öffnet die drei Moodboards',
    afterDna.json?.sessions?.['g.boards']?.state === 'open',
    `g.boards=${afterDna.json?.sessions?.['g.boards']?.state}`)

  await seedConfirmed(brandA, 'dna', {
    'g.boards': BOARDS_PLACEHOLDER,
    'g.board': 'calmer',
    'g.mix': DNA_MIX,
  })
  const dnaDone = await acceptAndComplete(brandA, owner.cookie, 'dna')
  check('das Kapitel `dna` läuft bis zur Abnahme durch',
    dnaDone.pending.length === 0 && dnaDone.accepted,
    `offen: ${JSON.stringify(dnaDone.pending.map(e => e.slotId))} · ${dnaDone.detail}`)

  // ══ 4 · KAPITEL 1 OHNE VORBILDER (Marke B) ══════════════════════════════
  console.log('\n4 · Der Weg OHNE Vorbilder: Frida schlägt vor')

  await completeFoundation(brandB)
  const unlockedB = await call(`/api/brand/admin/profiles/${brandB}/design-unlock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('dieselbe Marke lässt sich jetzt freischalten — die Bedingung war die Foundation',
    unlockedB.status === 200, `${unlockedB.status} ${unlockedB.text.slice(0, 160)}`)

  const dnaOpenB = await call(`${b}/steps/dna`, { cookie: owner.cookie })
  await call(`${b}/steps/dna`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      revision: dnaOpenB.json?.revision ?? 0,
      slots: { 'g.source': { value: 'foundation', confirmed: true } },
    },
  })
  const dnaStateB = await call(`${b}/steps/dna`, { cookie: owner.cookie })
  check('OHNE Vorbilder ist `g.dna` trotzdem offen — die Lesung zählt nur auf dem anderen Weg',
    dnaStateB.json?.sessions?.['g.dna']?.state === 'open',
    `g.dna=${dnaStateB.json?.sessions?.['g.dna']?.state} · `
    + `g.reading=${dnaStateB.json?.sessions?.['g.reading']?.state}`)

  lastDnaRun = Date.now()
  const proposeB = await call(`${b}/dna/propose`, { method: 'POST', cookie: owner.cookie })
  if (dnaStub) {
    const entriesB = proposeB.json?.entries ?? []
    check('der Vorschlag entsteht allein aus der Foundation — zehn Zeilen, alle `foundation`',
      proposeB.status === 200 && entriesB.length === DNA_DIMENSIONS.length
      && entriesB.every(entry => entry.origin === 'foundation'),
      `${proposeB.status} ${JSON.stringify([...new Set(entriesB.map(entry => entry.origin))])}`)
  }

  await confirmDraft(brandB, 'dna', 'g.dna')
  await seedConfirmed(brandB, 'dna', {
    'g.boards': BOARDS_PLACEHOLDER,
    'g.board': 'calmer',
    'g.mix': DNA_MIX,
  })
  const dnaDoneB = await acceptAndComplete(brandB, owner.cookie, 'dna')
  check('… und auch dieser Weg führt bis zur Abnahme',
    dnaDoneB.pending.length === 0 && dnaDoneB.accepted,
    `offen: ${JSON.stringify(dnaDoneB.pending.map(e => e.slotId))} · ${dnaDoneB.detail}`)
  const colorOpenB = await call(`${b}/steps/color`, { cookie: owner.cookie })
  check('… danach geht die Farbwelt auf, wie auf dem anderen Weg',
    colorOpenB.status === 200 && colorOpenB.json?.sessions?.['h.base']?.state === 'open',
    `${colorOpenB.status} h.base=${colorOpenB.json?.sessions?.['h.base']?.state}`)

  // ══ 5 · DIE FÜNF WEITEREN KAPITEL (Marke A) ═════════════════════════════
  console.log('\n5 · Fünf Kapitel, fünf Vorbelegungen — jedes als Bestätigung durchlaufbar')

  /**
   * WAS HIER GEPRÜFT WIRD: dass jedes Kapitel die Werte der Kapitel DAVOR
   * bekommt (`sourceValues`, H5 „jede Session muss als Bestätigung durchlaufbar
   * sein"), dass die Kette aufgeht und dass danach das nächste Kapitel offen
   * steht. Die INHALTE der Regeln (Rampen, Kontrast-Urteil, Strichstärken,
   * Tempo-Tokens) gehören den Unit-Tests — hier zählt der Durchgang.
   */
  const chapters = [
    {
      key: 'color',
      next: 'type',
      firstSlot: 'h.base',
      sources: ['g.mix', 'result.direction'],
      values: {
        'h.base': BASE_HEX,
        'h.ramp': RAMP_PLACEHOLDER,
        'h.neutral': 'warm',
        'h.accent': ACCENT_HEX,
        'h.roles': ROLES_PLACEHOLDER,
        'h.contrast': CONTRAST_PLACEHOLDER,
      },
    },
    {
      key: 'type',
      next: 'mark',
      firstSlot: 'i.pair',
      sources: ['g.mix', 'h.base', 'h.neutral', 'h.accent'],
      values: { 'i.pair': 'editorial', 'i.scale': 'calm', 'i.rules': TYPE_RULES },
    },
    {
      key: 'mark',
      next: 'imagery',
      firstSlot: 'j.kind',
      sources: ['g.mix', 'h.base', 'h.accent', 'i.pair', 'i.rules'],
      values: { 'j.kind': 'word', 'j.examples': MARK_EXAMPLES_PLACEHOLDER, 'j.pick': 'wordmark' },
    },
    {
      key: 'imagery',
      next: 'motion',
      firstSlot: 'k.photo',
      sources: ['g.mix', 'h.base', 'h.accent', 'i.pair'],
      values: {
        'k.photo': IMAGERY_PRINCIPLE,
        'k.illustration': 'line',
        'k.icons': 'regular',
        'k.dodont': IMAGERY_DODONT,
      },
    },
    {
      key: 'motion',
      next: null,
      firstSlot: 'l.tempo',
      sources: ['g.mix', 'h.base', 'h.accent', 'i.pair', 'i.rules'],
      values: {
        'l.tempo': 'calm',
        'l.transitions': MOTION_TRANSITIONS,
        'l.logo': 'no',
        'l.rules': MOTION_RULES,
      },
    },
  ]

  for (const chapter of chapters) {
    const detail = await call(`${a}/steps/${chapter.key}`, { cookie: owner.cookie })
    check(`\`${chapter.key}\`: offen, erste Session offen`,
      detail.status === 200 && detail.json?.sessions?.[chapter.firstSlot]?.state === 'open',
      `${detail.status} ${chapter.firstSlot}=${detail.json?.sessions?.[chapter.firstSlot]?.state}`)
    const sources = detail.json?.sourceValues ?? {}
    check(`\`${chapter.key}\`: die Bühne bekommt die Werte der Kapitel davor`,
      chapter.sources.every(slot => typeof sources[slot] === 'string' && sources[slot].length > 0),
      JSON.stringify(chapter.sources.map(slot => [slot, typeof sources[slot]])))

    /**
     * DAS ZEICHEN BEKOMMT SEIN BRIEFING AUS DEM LAUF, nicht aus diesem Skript:
     * das ist der einzige Text-Lauf der fünf Kapitel, und ein hingeschriebenes
     * Briefing bewiese ihn nicht. Bestätigt wird danach, was DA STEHT.
     */
    if (chapter.key === 'mark') {
      const brief = await call(`${a}/mark/brief`, { method: 'POST', cookie: owner.cookie })
      if (brief.status === 200) {
        const written = await confirmDraft(brandA, 'mark', 'j.brief')
        check('das Zeichen-Briefing kommt aus dem Lauf — sechs Blöcke, Maße gerechnet',
          written.split('\n\n').length === 6 && written.includes('Schutzraum'),
          `${written.split('\n\n').length} Blöcke`)
      }
      else {
        check('ohne Text-Modell antwortet das Briefing ruhig mit 503',
          brief.status === 503, `${brief.status} ${brief.text.slice(0, 120)}`)
        await seedConfirmed(brandA, 'mark', {
          'j.brief': [
            '## Charakter\nRuhig, handwerklich, überprüfbar.',
            '## Formsprache\nWeiche Kanten, eine Idee statt einer Szene.',
            '## Schutzraum & Mindestgrößen\nSchutzraum ringsum = Höhe des Versal-K.',
            '## Varianten\nPrimär, Invertiert, Einfarbig, Icon-Fläche.',
            '## No-Gos\nNicht verzerren, nicht schräg stellen, keinen Schatten.',
            '## Einsatzorte\nLadenschild, Tüte, Website-Kopf, Rechnung.',
          ].join('\n\n'),
        })
      }
    }

    await seedConfirmed(brandA, chapter.key, chapter.values)
    const done = await acceptAndComplete(brandA, owner.cookie, chapter.key)
    check(`\`${chapter.key}\`: keine Pflicht-Session mehr offen, Kapitel abgenommen`,
      done.pending.length === 0 && done.accepted,
      `offen: ${JSON.stringify(done.pending.map(e => e.slotId))} · ${done.detail}`)
    if (chapter.next) {
      const next = await call(`${a}/steps/${chapter.next}`, { cookie: owner.cookie })
      check(`… und \`${chapter.next}\` steht danach offen`, next.status === 200,
        `${next.status} ${next.text.slice(0, 120)}`)
    }
  }

  const railPage = await call(`/de/brand/${brandA}/motion`, { cookie: owner.cookie })
  check('der Rail zeigt die volle Schicht: „6 von 6 Kapiteln"',
    railPage.status === 200 && railPage.text.includes('6 von 6 Kapiteln'),
    `${railPage.status} ${railPage.text.length} Zeichen`)

  // ══ 6 · DAS PRESET ══════════════════════════════════════════════════════
  console.log('\n6 · Das Preset: aus der Wahrheit gerechnet, mit allen sechs Teilen')

  /**
   * DIE KI-ENTWÜRFE LAUFEN HIER — sie gehören ins Kapitel `mark`, hängen aber
   * NICHT an seiner Abnahme (`j.drafts` wird nie bestätigt). Sie stehen an
   * dieser Stelle, weil das Preset gleich zeigen soll, dass ein BEHALTENER
   * Entwurf privat mitreist und im Abbild fehlt (§1.11 b).
   */
  let keptDraftId = ''
  let lastDraftsRun = Date.now()
  const draftRun = await call(`${a}/mark/drafts`, { method: 'POST', cookie: owner.cookie })
  const draftsStub = draftRun.status === 200
  if (!draftsStub) {
    check('ohne Bild-Modell antwortet der Entwurfs-Lauf ruhig mit 503 `image_unavailable`',
      draftRun.status === 503 && draftRun.json?.reason === 'image_unavailable',
      `${draftRun.status} ${JSON.stringify(draftRun.json?.reason ?? null)}`)
  }
  else {
    const items = draftRun.json?.items ?? []
    check('der Entwurfs-Lauf legt VIER Entwürfe an — mit Modell und Prompt-Hash an der Zeile',
      draftRun.json?.created === 4 && items.length === 4
      && items.every(item => item.model === 'dev-stub' && /^[0-9a-f]{16}$/.test(String(item.promptHash))),
      `${draftRun.json?.created} · ${JSON.stringify(items[0] ?? null)}`)
    keptDraftId = items[0]?.id ?? ''
    const kept = await call(`${a}/mark/drafts/${keptDraftId}`, {
      method: 'PATCH', cookie: owner.cookie, body: { kept: true },
    })
    check('… „Behalten" ist die einzige Entscheidung, und sie steht an der Zeile',
      kept.status === 200 && kept.json?.item?.kept === true,
      `${kept.status} ${JSON.stringify(kept.json?.item?.kept ?? null)}`)
  }

  const designApi = await call(`${a}/design`, { cookie: owner.cookie })
  check('die Preset-Route meldet sechs von sechs Kapiteln',
    designApi.status === 200 && designApi.json?.done === 6 && designApi.json?.total === 6,
    `${designApi.status} ${JSON.stringify({ done: designApi.json?.done, total: designApi.json?.total })}`)

  const preset = designApi.json?.preset ?? null
  check('das Preset steht — mit GENAU den Entscheidungen der sechs Kapitel',
    preset !== null
    && preset.color?.base === BASE_HEX
    && preset.color?.accent === ACCENT_HEX
    && preset.type?.pair === 'editorial'
    && preset.mark?.kind === 'word'
    && preset.motion?.tempo === 'calm',
    JSON.stringify({
      base: preset?.color?.base, accent: preset?.color?.accent,
      pair: preset?.type?.pair, kind: preset?.mark?.kind, tempo: preset?.motion?.tempo,
    }))
  check('… und mit allen SECHS Teilen besetzt (DNA, Farbe, Schrift, Zeichen, Bild, Bewegung)',
    Boolean(preset?.dna) && Object.keys(preset?.dna ?? {}).length === DNA_DIMENSIONS.length
    && (preset?.color?.roles ?? []).length === 5
    && (preset?.color?.contrastPairs ?? []).length === 6
    && (preset?.type?.rules ?? []).length > 0
    && (preset?.mark?.examples ?? []).length === 8
    && (preset?.imagery?.principles ?? []).length > 0
    && (preset?.motion?.transitions ?? []).length === 4,
    JSON.stringify({
      dna: Object.keys(preset?.dna ?? {}).length,
      roles: (preset?.color?.roles ?? []).length,
      pairs: (preset?.color?.contrastPairs ?? []).length,
      rules: (preset?.type?.rules ?? []).length,
      examples: (preset?.mark?.examples ?? []).length,
      principles: (preset?.imagery?.principles ?? []).length,
      transitions: (preset?.motion?.transitions ?? []).length,
    }))
  check('… die acht Setzungen sind gerechnetes SVG, kein hochgeladenes Bild',
    (preset?.mark?.examples ?? []).every(svg => svg.startsWith('<svg') && svg.endsWith('</svg>')),
    String((preset?.mark?.examples ?? []).length))

  /**
   * DIE ADAPTIVE SCHRIFTFARBE AUF DEM AKZENT (D9-Härtung): die Matrix misst,
   * was die Szene setzt — Papier ODER die tiefste Marken-Stufe, je nachdem,
   * was den höheren Kontrast trägt. Der tiefe Akzent dieser Marke trägt
   * PAPIER; geprüft wird das gegen die Rampe der Antwort, nicht gegen ein
   * hingeschriebenes Hex.
   */
  const buttonPair = (preset?.color?.contrastPairs ?? []).find(pair => pair.id === 'button-light')
  check('das Knopf-Paar misst dieselbe Schriftfarbe, die die Szene setzt',
    buttonPair?.background === ACCENT_HEX
    && (buttonPair?.foreground === preset?.color?.neutral?.[50]
      || buttonPair?.foreground === preset?.color?.rampLight?.[950])
    && (buttonPair?.level === 'AA' || buttonPair?.level === 'AAA'),
    JSON.stringify(buttonPair ?? null))

  if (draftsStub) {
    check('der BEHALTENE Entwurf steht im privaten Preset — als Verweis, nicht als Bild',
      (preset?.mark?.keptDrafts ?? []).includes(keptDraftId)
      && (preset?.mark?.keptDrafts ?? []).length === 1,
      JSON.stringify(preset?.mark?.keptDrafts ?? null))
  }

  const foreignPreset = await call(`${a}/design`, { cookie: stranger.cookie })
  check('ein fremdes Konto bekommt das Preset nicht — 404, nicht 403',
    foreignPreset.status === 404, String(foreignPreset.status))

  // ══ 7 · KAPITEL 10 UND DAS BOARD ════════════════════════════════════════
  console.log('\n7 · Kapitel 10 und das Ergebnis-Board')

  const foundationApi = await call(`${a}/foundation`, { cookie: owner.cookie })
  const visual = (foundationApi.json?.view?.chapters ?? []).find(entry => entry.id === 'visuell')
  check('Kapitel 10 ist EIN design-Block und abgenommen — nicht sechs leere Kapitel',
    visual?.state === 'done'
    && JSON.stringify((visual?.blocks ?? []).map(block => block.kind)) === '["design"]',
    JSON.stringify({ state: visual?.state, kinds: (visual?.blocks ?? []).map(b => b.kind) }))
  check('… und der Block nennt Entwürfe nur als ZAHL, nie als Id',
    typeof visual?.blocks?.[0]?.keptDrafts === 'number'
    && !('keptDrafts' in (visual?.blocks?.[0]?.preset?.mark ?? {})),
    JSON.stringify(Object.keys(visual?.blocks?.[0]?.preset?.mark ?? {})))

  const readPage = await call(`/de/brand/${brandA}/foundation`, { cookie: owner.cookie })
  check('die Leseansicht malt die Vitrine — Board als Kopf, fünf Sprungmarken',
    readPage.status === 200
    && readPage.text.includes('data-design-chapter')
    && readPage.text.includes('data-design-board')
    && ['farbwelt', 'typografie', 'zeichen', 'bildsprache', 'bewegung']
      .every(section => readPage.text.includes(`id="visuell-${section}"`)),
    `${readPage.status} ${readPage.text.length} Zeichen`)
  check('… die Schranke ist weg, und die Farbwelt steht mit ihrer Basisfarbe da',
    !readPage.text.includes('folgt in Brand Design')
    && readPage.text.includes(BASE_HEX)
    && readPage.text.includes(preset.color.rampDark[900]),
    'Schranke, Basisfarbe oder Dunkel-Rampe fehlen')
  check('… und das Zeichen ist gesetzt (SVG mit dem Markennamen)',
    readPage.text.includes('<svg') && readPage.text.includes('Kailua Coffee'),
    'kein gesetztes Zeichen auf der Seite')

  const boardOwn = await call(`/de/brand/${brandA}/design`, { cookie: owner.cookie })
  check('die Board-Seite gehört dem Besitzer — mit dem Board darin, ohne Sperr-Fläche',
    boardOwn.status === 200 && boardOwn.text.includes('data-design-board')
    && !boardOwn.text.includes('data-design-locked'),
    `${boardOwn.status} ${boardOwn.text.length} Zeichen`)
  const boardForeign = await call(`/de/brand/${brandA}/design`, { cookie: stranger.cookie })
  const boardGuest = await call(`/de/brand/${brandA}/design`)
  check('… fremd und ohne Anmeldung: 404, wie überall in diesem Layer',
    boardForeign.status === 404 && boardGuest.status === 404,
    `${boardForeign.status}/${boardGuest.status}`)

  const boardB = await call(`/de/brand/${brandB}/design`, { cookie: owner.cookie })
  check('GEGENPROBE: die zweite Marke steht bei „1 von 6 Kapiteln" — dieselbe Seite, andere Fläche',
    boardB.status === 200 && boardB.text.includes('data-design-locked')
    && boardB.text.includes('1 von 6 Kapiteln'),
    `${boardB.status} ${boardB.text.length} Zeichen`)

  // ══ 8 · DER SNAPSHOT ════════════════════════════════════════════════════
  console.log('\n8 · Der geteilte Link: Preset ja, Privates nein')

  const share = await call(`${a}/share`, { method: 'POST', cookie: owner.cookie, body: {} })
  const shareToken = share.json?.token ?? ''
  check('ein Link lässt sich erzeugen', share.status === 200 && shareToken.length === 64,
    `${share.status} ${share.text.slice(0, 160)}`)

  const shareRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_shares', rowId: share.json?.shareId ?? 'none',
  }).catch(() => null)
  const snapshot = shareRow ? JSON.parse(shareRow.snapshot) : null
  const rawSnapshot = JSON.stringify(snapshot ?? {})

  check('das eingefrorene Abbild trägt `schemaVersion: 2` und das Preset',
    snapshot?.schemaVersion === 2 && snapshot?.design?.color?.base === BASE_HEX
    && snapshot?.presetId === `design:${brandA}`,
    JSON.stringify({
      version: snapshot?.schemaVersion,
      base: snapshot?.design?.color?.base,
      id: snapshot?.presetId,
    }))
  check('… OHNE die behaltenen Entwürfe (§1.11 b: sie sind privat)',
    Boolean(snapshot?.design) && !('keptDrafts' in (snapshot?.design?.mark ?? {})),
    JSON.stringify(Object.keys(snapshot?.design?.mark ?? {})))

  /**
   * DIE DREI SORTEN, DIE NIE REISEN — und zwar auch nicht als ROHER Slot-Wert
   * in `chapters` (der Snapshot trägt die Werte der Kapitel doppelt, s. offene
   * Frage aus D8). Geprüft wird das rohe JSON: die gerenderte Seite könnte
   * etwas verschweigen, das im Abbild trotzdem steht.
   */
  checkAbsent('kein Vorbild im Abbild', rawSnapshot, 'g.inspiration')
  checkAbsent('keine Lesung im Abbild', rawSnapshot, 'g.reading')
  checkAbsent('kein KI-Entwurf im Abbild', rawSnapshot, 'j.drafts')
  checkAbsent('auch kein Prompt-Hash eines Entwurfs', rawSnapshot, 'promptHash')

  /**
   * D9 (Davids Entscheidung 2026-09-09): DIE SECHS DESIGN-KAPITEL STEHEN NUR
   * NOCH ALS PRESET DARIN. Vor D9 trug das Abbild sie DOPPELT — einmal
   * gerechnet als `design`, einmal roh als Slot-Werte in `chapters`, die kein
   * Renderer je gelesen hat. Geprüft wird je Kapitel EIN reisefähiger Slot
   * (die internen stehen schon oben) plus der Kapitel-Kopf selbst; das Preset
   * daneben bleibt vollständig — die Zusagen darüber messen es.
   */
  const rawChapters = JSON.stringify(snapshot?.chapters ?? [])
  for (const [stepKey, slotId] of [
    ['dna', 'g.dna'],
    ['color', 'h.base'],
    ['type', 'i.pair'],
    ['mark', 'j.kind'],
    ['imagery', 'k.photo'],
    ['motion', 'l.tempo'],
  ]) {
    checkAbsent(`kein roher Slot-Wert des Kapitels „${stepKey}" in \`chapters\``, rawChapters, slotId)
    checkAbsent(`… und kein Kapitel-Kopf „${stepKey}"`, rawChapters, `"stepKey":"${stepKey}"`)
  }
  // Die positive Hälfte desselben Gedankens: `chapters` ist nicht einfach leer.
  check('… die Foundation-Kapitel stehen weiterhin in `chapters`',
    (snapshot?.chapters ?? []).length > 0
    && (snapshot?.chapters ?? []).every(chapter => !DESIGN_STEP_KEYS.includes(chapter.stepKey)),
    JSON.stringify((snapshot?.chapters ?? []).map(chapter => chapter.stepKey)))
  if (draftsStub && keptDraftId) {
    checkAbsent('und keine Entwurfs-Id', rawSnapshot, keptDraftId)
  }

  const sharePage = await call(`/brand/share/${shareToken}`)
  check('die Empfänger-Seite zeigt dasselbe volle Kapitel 10',
    sharePage.status === 200
    && sharePage.text.includes('data-design-chapter')
    && sharePage.text.includes('data-design-board'),
    `${sharePage.status} ${sharePage.text.length} Zeichen`)
  checkAbsent('… und keinen Entwurfs-Hinweis (der ist privat)', sharePage.text, 'data-design-drafts')

  /**
   * EIN v1-ABBILD BLEIBT LESBAR: so sah jede Zeile vor D8 aus. Der Renderer
   * fragt nach dem FELD, nicht nach der Zahl — ein alter Link zeigt deshalb
   * weiter Richtung und Schranke statt einer leeren Seite. Sprach-neutral
   * geprüft: `/brand/share/:token` hat kein Locale-Präfix und rendert englisch.
   */
  const legacyToken = randomBytes(32).toString('hex')
  const legacyShare = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_shares',
    rowId: ID.unique(),
    data: {
      profileId: brandA,
      tokenHash: createHash('sha256').update(legacyToken, 'utf8').digest('hex'),
      snapshot: JSON.stringify({
        schemaVersion: 1,
        title: 'Kailua Coffee',
        contentLocale: 'de',
        story: '',
        chapters: [{ stepKey: 'context', slots: [{ slotId: 'a.pitch', value: 'D9-ALTLINK' }] }],
        presetId: 'warm-editorial',
        presetVersion: '1',
      }),
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    },
  })
  const legacyPage = await call(`/brand/share/${legacyToken}`)
  check('ein v1-Link ist weiter lesbar — Festlegung und Richtung, ohne Preset',
    legacyPage.status === 200
    && legacyPage.text.includes('D9-ALTLINK')
    && legacyPage.text.includes('fd-dir-strip')
    && !legacyPage.text.includes('data-design-chapter'),
    `${legacyPage.status} · Richtung: ${legacyPage.text.includes('fd-dir-strip')}`)
  await tablesDB.deleteRow({ databaseId, tableId: 'brand_shares', rowId: legacyShare.$id })
    .catch(() => {})

  // ══ 9 · DIE RÜCKNAHME ═══════════════════════════════════════════════════
  console.log('\n9 · Die Rücknahme nimmt den Zugang, nicht die Arbeit')

  const beforeLock = await readSlots(brandA, 'color')
  const relocked = await call(`/api/brand/admin/profiles/${brandA}/design-lock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('die Rücknahme leert BEIDE Spalten',
    relocked.status === 200 && relocked.json?.item?.designUnlockedAt === null
    && relocked.json?.item?.designUnlockedBy === '',
    `${relocked.status} ${JSON.stringify(relocked.json?.item ?? null)}`)

  const relockedJourney = await call(a, { cookie: owner.cookie })
  const relockedEntry = key => (relockedJourney.json?.journey ?? []).find(e => e.stepKey === key)
  check('… alle sechs Kapitel stehen wieder auf `design_locked`',
    DESIGN_STEPS.every(key => relockedEntry(key)?.reason === 'design_locked'),
    JSON.stringify(DESIGN_STEPS.map(key => relockedEntry(key)?.reason)))

  const afterLock = await readSlots(brandA, 'color')
  check('… und NICHTS ist gelöscht: die bestätigten Werte stehen unverändert da',
    afterLock['h.base']?.confirmed === beforeLock['h.base']?.confirmed
    && afterLock['h.base']?.confirmed === BASE_HEX
    && afterLock['h.roles']?.confirmed === beforeLock['h.roles']?.confirmed,
    JSON.stringify(afterLock['h.base'] ?? null))

  const reUnlocked = await call(unlockA, { method: 'POST', cookie: operator.cookie })
  const afterReUnlock = await call(`${a}/design`, { cookie: owner.cookie })
  check('die zweite Freischaltung findet den ganzen Stand vor — sechs von sechs, dasselbe Preset',
    reUnlocked.status === 200
    && afterReUnlock.json?.done === 6
    && afterReUnlock.json?.preset?.color?.base === BASE_HEX
    && afterReUnlock.json?.preset?.type?.pair === 'editorial',
    `${reUnlocked.status} ${JSON.stringify({
      done: afterReUnlock.json?.done, base: afterReUnlock.json?.preset?.color?.base,
    })}`)

  // ══ 10 · DIE DECKEL ═════════════════════════════════════════════════════
  console.log('\n10 · Die Deckel: was ein Tag kostet')

  if (readingStub) {
    await waitForRateWindow(lastReadingRun)
    const read2 = await call(`${inspBase}/read`, { method: 'POST', cookie: owner.cookie })
    const read3 = await call(`${inspBase}/read`, { method: 'POST', cookie: owner.cookie })
    check('zweite und dritte Lesung gehen — und das Kontingent zählt herunter',
      read2.status === 200 && read2.json?.quota?.remaining === 1
      && read3.status === 200 && read3.json?.quota?.remaining === 0,
      `${read2.status}/${read2.json?.quota?.remaining} · ${read3.status}/${read3.json?.quota?.remaining}`)
    const read4 = await call(`${inspBase}/read`, { method: 'POST', cookie: owner.cookie })
    check('GEGENPROBE: die VIERTE Lesung am selben Tag ⇒ 429 `brand_reading_limit`',
      read4.status === 429 && read4.json?.reason === 'brand_reading_limit',
      `${read4.status} ${JSON.stringify(read4.json?.reason ?? null)}`)
  }

  if (dnaStub) {
    /**
     * DER DNA-DECKEL LIEGT BEI ZEHN ANLÄUFEN JE MARKE, FELD UND TAG. Einer ist
     * in Abschnitt 3 verbraucht, acht kommen hier dazu, der elfte fällt. Die
     * eigene IP-Bremse (`brand:dna`, 10/min) liegt WEITER als der fachliche
     * Deckel — trotzdem wird ein frisches Fenster abgewartet, sonst zählte der
     * Anlauf aus Abschnitt 4 mit und die Antwort wäre „zu schnell" statt
     * „heute genug".
     */
    await waitForRateWindow(lastDnaRun)
    let lastPropose = null
    for (let run = 2; run <= 10; run++) {
      lastPropose = await call(`${a}/dna/propose`, { method: 'POST', cookie: owner.cookie })
    }
    check('der zehnte Vorschlag geht noch — und meldet ein Kontingent von 0',
      lastPropose?.status === 200 && lastPropose?.json?.quota?.remaining === 0
      && lastPropose?.json?.quota?.limit === 10,
      `${lastPropose?.status} ${JSON.stringify(lastPropose?.json?.quota ?? null)}`)
    const propose11 = await call(`${a}/dna/propose`, { method: 'POST', cookie: owner.cookie })
    check('GEGENPROBE: der ELFTE Vorschlag ⇒ 429 `brand_ai_slot_limit`',
      propose11.status === 429 && propose11.json?.reason === 'brand_ai_slot_limit',
      `${propose11.status} ${JSON.stringify(propose11.json?.reason ?? null)}`)
  }

  if (draftsStub) {
    /**
     * DER PLATZ-DECKEL STEHT VOR DER DROSSEL: nach drei Läufen liegen zwölf
     * Entwürfe, für vier weitere ist kein Raum. Geleert wird AN DER ROUTE
     * VORBEI — die Handgriffe haben einen eigenen Eimer, und dieser Beweis
     * braucht seine Läufe.
     */
    await waitForRateWindow(lastDraftsRun)
    const draft2 = await call(`${a}/mark/drafts`, { method: 'POST', cookie: owner.cookie })
    const draft3 = await call(`${a}/mark/drafts`, { method: 'POST', cookie: owner.cookie })
    check('zweiter und dritter Entwurfs-Lauf gehen — das Kontingent zählt herunter',
      draft2.status === 200 && draft2.json?.quota?.remaining === 1
      && draft3.status === 200 && draft3.json?.quota?.remaining === 0,
      `${draft2.status}/${draft2.json?.quota?.remaining} · ${draft3.status}/${draft3.json?.quota?.remaining}`)
    const noRoom = await call(`${a}/mark/drafts`, { method: 'POST', cookie: owner.cookie })
    check('kein Platz für vier weitere ⇒ 409 `drafts_limit_reached` (der Platz-Deckel zuerst)',
      noRoom.status === 409 && noRoom.json?.reason === 'drafts_limit_reached',
      `${noRoom.status} ${JSON.stringify(noRoom.json?.reason ?? null)}`)

    const leftovers = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_mark_drafts',
      queries: [Query.equal('profileId', brandA), Query.limit(50)],
    }).catch(() => ({ rows: [] }))
    for (const row of leftovers.rows) {
      if (row.$id === keptDraftId) continue
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_mark_drafts', rowId: row.$id }).catch(() => {})
      await storage.deleteFile({ bucketId: 'brand-drafts', fileId: row.$id }).catch(() => {})
    }
    const draft4 = await call(`${a}/mark/drafts`, { method: 'POST', cookie: owner.cookie })
    check('GEGENPROBE: der VIERTE Lauf am selben Tag ⇒ 429 `brand_drafts_limit`',
      draft4.status === 429 && draft4.json?.reason === 'brand_drafts_limit',
      `${draft4.status} ${JSON.stringify(draft4.json?.reason ?? null)}`)
  }

  /**
   * DER VORBILD-DECKEL: die zehn fehlenden Bilder entstehen OHNE Route — die
   * Zeile IST die Datei (Zeilen-Id = Datei-Id), geprüft wird der DECKEL und
   * nicht der Upload (den hat Abschnitt 3 zweimal bewiesen).
   */
  for (let i = 3; i <= 12; i++) {
    const fileId = ID.unique()
    await storage.createFile({
      bucketId: 'brand-inspiration',
      fileId,
      file: InputFile.fromBuffer(TINY_PNG, `f${i}.png`),
    })
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_inspiration',
      rowId: fileId,
      data: { profileId: brandA, area: 'color', note: '', number: i, filename: `f${i}.png` },
    })
  }
  const listFull = await call(inspBase, { cookie: owner.cookie })
  check('zwölf Vorbilder liegen da — das zugesagte Maximum',
    listFull.json?.items?.length === 12, String(listFull.json?.items?.length))
  await waitForRateWindow(lastInspirationHit)
  const thirteenth = await callUpload(inspBase, {
    fields: { area: 'color' },
    file: { name: 'dreizehn.png', type: 'image/png', data: TINY_PNG },
    cookie: owner.cookie,
  })
  check('GEGENPROBE: das dreizehnte ⇒ 409 `inspiration_limit_reached`',
    thirteenth.status === 409 && thirteenth.json?.reason === 'inspiration_limit_reached',
    `${thirteenth.status} ${JSON.stringify(thirteenth.json?.reason ?? null)}`)

  // ══ 11 · DIE EREIGNIS-ZEILEN ════════════════════════════════════════════
  console.log('\n11 · Der Funnel: Kennzahlen, keine Inhalte')

  const events = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', brandA), Query.limit(200)],
  }).catch(() => ({ rows: [] }))
  const types = events.rows.map(row => row.type)
  const countOf = type => types.filter(entry => entry === type).length

  check('jede Handlung der Schicht steht im Funnel',
    countOf('design.unlocked') === 2 && countOf('design.locked') === 1
    && countOf('design.inspiration.added') === 2
    && countOf('step.completed') === 6,
    JSON.stringify({
      unlocked: countOf('design.unlocked'),
      locked: countOf('design.locked'),
      inspiration: countOf('design.inspiration.added'),
      completed: countOf('step.completed'),
    }))
  if (dnaStub) {
    check('… jeder DNA-Lauf eine Zeile (einer in Abschnitt 3, zehn am Deckel)',
      countOf('design.dna.run') === 10, String(countOf('design.dna.run')))
  }
  if (readingStub) {
    check('… jede Lesung eine Zeile (drei erlaubte Läufe)',
      countOf('design.reading.run') === 3, String(countOf('design.reading.run')))
  }
  if (draftsStub) {
    check('… jeder Entwurfs-Lauf eine Zeile (drei erlaubte Läufe)',
      countOf('design.drafts.run') === 3, String(countOf('design.drafts.run')))
  }

  /**
   * DIE ZEILEN SIND MESSUNG, KEIN PROTOKOLL (§2.14): Modell, Dauer, Anzahl —
   * nie ein Prompt, nie eine Begründung, nie ein Bild. Geprüft an ALLEN Zeilen
   * dieser Marke, nicht an einer ausgesuchten.
   */
  const allPayloads = events.rows.map(row => String(row.payload ?? '')).join('\n')
  checkAbsent('keine Zeile trägt den Markennamen', allPayloads, 'Kailua')
  checkAbsent('… keinen Bild-Rumpf', allPayloads, 'base64')
  checkAbsent('… und kein Briefing-Feld', allPayloads, 'Formsprache')

  /**
   * DIE LESEFASSUNG IM VERLAUF (D9-Härtung, offener Punkt aus D8): ein
   * Karten-Klick speichert die STABILE Id (`snappy`) — richtig so, Ids sind
   * sprachneutral. Der Verlauf zeigt sie beim Neuladen trotzdem als das, was
   * der Mensch angeklickt hat. Der Anlauf schreibt die rohe Id von Hand: ohne
   * ihn wäre die Prüfung tautologisch grün.
   */
  const rawTurn = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_messages',
    rowId: ID.unique(),
    data: {
      profileId: brandA, stepKey: 'motion', sessionKey: 'l.tempo',
      role: 'user', body: 'snappy', parts: '', generationId: '',
    },
  })
  const history = await call(`${a}/messages?stepKey=motion&session=l.tempo`, { cookie: owner.cookie })
  const historyBodies = (history.json?.messages ?? []).map(entry => entry.body)
  check('der persistierte Verlauf zeigt die LESEFASSUNG, nicht die rohe Katalog-Id',
    history.status === 200 && historyBodies.includes('Knapp') && !historyBodies.includes('snappy'),
    `${history.status} ${JSON.stringify(historyBodies)}`)
  await tablesDB.deleteRow({ databaseId, tableId: 'brand_messages', rowId: rawTurn.$id }).catch(() => {})

  // ══ 12 · GDPR ══════════════════════════════════════════════════════════
  console.log('\n12 · Export und Löschung — Metadaten mit, Bilder weg')

  const inspirationRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_inspiration',
    queries: [Query.equal('profileId', brandA), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  const draftRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_mark_drafts',
    queries: [Query.equal('profileId', brandA), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  const inspirationIds = inspirationRows.rows.map(row => row.$id)
  const draftIds = draftRows.rows.map(row => row.$id)

  const exported = await call('/api/auth/export', { cookie: owner.cookie })
  const exportText = exported.text
  const exportedProfile = (exported.json?.data?.brand?.profiles ?? [])
    .find(entry => entry.profile?.$id === brandA)
  check('der Export nennt die Vorbilder als METADATEN — Bereich, Notiz, Dateiname',
    exported.status === 200
    && (exportedProfile?.inspiration ?? []).length === inspirationIds.length
    && (exportedProfile?.inspiration ?? []).every(row => typeof row.area === 'string'),
    `${exported.status} ${(exportedProfile?.inspiration ?? []).length}/${inspirationIds.length}`)
  if (draftsStub) {
    check('… und die KI-Entwürfe ebenso — Modell, Prompt-Hash, „behalten"',
      (exportedProfile?.markDrafts ?? []).length === draftIds.length
      && (exportedProfile?.markDrafts ?? []).some(row => row.kept === true),
      `${(exportedProfile?.markDrafts ?? []).length}/${draftIds.length}`)
  }
  checkAbsent('… aber KEIN Bild — der Export ist eine JSON-Antwort', exportText, 'data:image/png;base64')

  const deleted = await call('/api/auth/account', { method: 'DELETE', cookie: owner.cookie })
  check('die Löschung des Kontos läuft durch', deleted.status === 200,
    `${deleted.status} ${deleted.text.slice(0, 200)}`)

  let inspirationLeft = 0
  for (const id of inspirationIds) {
    const file = await storage.getFile({ bucketId: 'brand-inspiration', fileId: id }).catch(() => null)
    if (file) inspirationLeft += 1
  }
  let draftsLeft = 0
  for (const id of draftIds) {
    const file = await storage.getFile({ bucketId: 'brand-drafts', fileId: id }).catch(() => null)
    if (file) draftsLeft += 1
  }
  check('… und räumt BEIDE Buckets: kein Vorbild, kein Entwurf bleibt liegen',
    inspirationLeft === 0 && draftsLeft === 0,
    `${inspirationLeft} Vorbilder, ${draftsLeft} Entwürfe übrig`)

  const rowsLeft = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_inspiration',
    queries: [Query.equal('profileId', brandA), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  const profileLeft = await tablesDB.getRow({
    databaseId, tableId: 'brand_profiles', rowId: brandA,
  }).catch(() => null)
  check('… die Zeilen sind ebenfalls weg — Marke, Vorbilder, alles',
    rowsLeft.rows.length === 0 && profileLeft === null,
    `${rowsLeft.rows.length} Zeilen · Profil: ${profileLeft ? 'da' : 'weg'}`)

  const afterDelete = await call(`/de/brand/${brandA}/design`, { cookie: owner.cookie })
  check('… und die Board-Seite antwortet 404, wie für jede unbekannte Marke',
    afterDelete.status === 404, String(afterDelete.status))

  /*
   * DAS AUFRÄUMEN UNTEN LÄUFT TROTZDEM — es wird hier NICHTS aus den Listen
   * gestrichen. Naheliegend wäre, die gelöschte Marke zu streichen („die ist
   * ja weg"); genau das hat beim Bau eine halbe Marke im Speicher liegen
   * lassen, als die Löschung einmal NICHT durchlief. Ein Aufräumen, das dem
   * Erfolg eines Schrittes vertraut, räumt genau dann nicht, wenn es nötig
   * wäre. Doppelte Löschversuche kosten hier ein paar 404, mehr nicht.
   */
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  /**
   * AUFRÄUMEN IN DER REIHENFOLGE DER ABHÄNGIGKEITEN: an jeder Vorbild- und
   * Entwurfs-Zeile hängt eine DATEI (Zeilen-Id = Datei-Id). Ein Beweis, der
   * Fremdwerke im Speicher liegen lässt, räumt nicht auf.
   */
  for (const id of cleanup.profiles) {
    for (const [table, bucket] of [
      ['brand_inspiration', 'brand-inspiration'],
      ['brand_mark_drafts', 'brand-drafts'],
    ]) {
      const rows = await tablesDB.listRows({
        databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(100)],
      }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) {
        await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
        await storage.deleteFile({ bucketId: bucket, fileId: row.$id }).catch(() => {})
      }
    }
    for (const table of ['brand_messages', 'brand_findings', 'brand_events', 'brand_shares']) {
      const rows = await tablesDB.listRows({
        databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
      }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) {
        await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
      }
    }
    for (const stepKey of [
      'context', 'pvm', 'architecture', 'values', 'archetype', 'manifesto', 'verbal', 'naming', 'result',
      ...DESIGN_STEPS,
    ]) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_steps', rowId: `${id}_${stepKey}` })
        .catch(() => {})
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
