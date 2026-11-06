/**
 * Migration brand-021: `brand_intro_requests` — WER UM EIN GESPRÄCH GEBETEN
 * HAT (BS1 Paket Z0, Plan
 * docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §4.1 (a) und §7 Zeile Z0).
 *
 * NUMMER: 020 (`brand-publications`) war der letzte Stand auf `origin/main`
 * und in jedem Arbeitsbaum (2026-09-07 geprüft); 021 ist die nächste freie.
 * Nummern vergeben parallel laufende Sitzungen — wer nach dieser hier eine
 * anlegt, sieht zuerst nach (`git fetch origin && git ls-tree --name-only
 * origin/main packages/brand/scripts/migrations/`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Der eine Conversion-Weg dieser Marke endete bis R0 im 404 und seit R0 auf
 * einer FREMDEN Marke (pukalani.studio). Z0 holt ihn zurück: `/erstgespraech`
 * lebt im `brand`-Layer, und diese Tabelle ist ihr Gedächtnis. Sie ist das
 * Gegenstück zu `brand_waitlist` (brand-012) — dort meldet sich, wer REIN
 * will; hier meldet sich, wer REDEN will.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── PERSONENBEZOGENE DATEN MIT UND OHNE KONTO ─────────────────────────────
 * Anders als `brand_waitlist` trägt eine Zeile hier OPTIONAL eine `userId`:
 * der wahrscheinlichere Weg führt aus der Werkstatt hierher, und dort ist
 * jemand angemeldet. Damit greift `registerUserDataContributor` (core-Vertrag
 * für GDPR-Export und -Löschung) — und zwar auf ZWEI Wegen, die diese
 * Migration beide indizieren muss:
 *  · `userId` — die Zeilen, die zu diesem Konto gehören (`idx_user`),
 *  · `emailLower` — die Zeilen, die dieselbe ADRESSE tragen, aber vor der
 *    Anmeldung entstanden sind (`idx_email_lower`). Ohne diesen zweiten Weg
 *    überlebte die Anfrage eines Gastes die Löschung des Kontos, das später
 *    zu derselben Adresse entstand.
 * Ein Index ist in Appwrite die VORBEDINGUNG einer Abfrage, nicht ihre
 * Beschleunigung — beide sind deshalb Pflicht und nicht Kür.
 *
 * ── KEIN UNIQUE AUF DER ADRESSE ───────────────────────────────────────────
 * Der bewusste Unterschied zur Warteliste: dort ist eine zweite Anfrage
 * derselben Person DIESELBE Anfrage (sie will auf eine Liste, sie steht schon
 * drauf). Hier sind zwei Anfragen zwei verschiedene Anliegen — vielleicht
 * sogar zu zwei verschiedenen Marken. Ein UNIQUE-Index würde die zweite
 * verschlucken.
 *
 * ── DIE SPALTEN ───────────────────────────────────────────────────────────
 *  · `name` (120, Pflicht) · `email` (256, Pflicht) — die Adresse in der
 *    Schreibweise des Absenders.
 *  · `emailLower` (256, Pflicht) — derselbe Wert kleingeschrieben, der
 *    Lesepfad der GDPR-Löschung. Zwei Spalten für eine Adresse ist Absicht und
 *    hat dieselbe Begründung wie in brand-012: verglichen wird technisch,
 *    angeschrieben wird menschlich.
 *  · `company` (160, Default '') — die Marke, um die es geht.
 *  · `message` (2000, Pflicht) — das Anliegen. Das Zod-Schema deckelt bei
 *    1000 Zeichen; die Spalte fasst das Doppelte, weil ein Deckel, der genau
 *    auf der Grenze sitzt, beim ersten Umlaut-Zählfehler zuschlägt. VARCHAR
 *    und kein MEDIUMTEXT: 2000 Zeichen sind weit unter dem Zeilenbudget
 *    (Memo „MariaDB/utf8mb4-Zeilenbudget"), und ein off-row-Feld wäre für
 *    einen Absatz die falsche Form.
 *  · `phone` (40, Default '') — freiwillig (Plan §4.1 (a)).
 *  · `locale` (8, Default 'en') — die Sprache der fragenden Seite; sie
 *    entscheidet die Sprache der Bestätigungs-Mail.
 *  · `source` (64, Default '') — WELCHE Seite gefragt hat. Freier String statt
 *    Aufzählung: eine neue Landeseite soll keine Migration kosten.
 *  · `profileId` (64, Default '') — das Branding, aus dem heraus gefragt
 *    wurde. Steht NUR da, wenn die Datentür der Route es bestätigt hat.
 *  · `userId` (64, Default '') — das Konto des Fragenden, sofern angemeldet.
 *  · `status` (32, Default 'new') — 'new' | 'contacted' | 'closed'. varchar
 *    statt enum, damit ein vierter Fall eine Zeile Code kostet und keine
 *    Migration; die Wahrheit steht in `shared/brandIntroCall.ts`.
 *  · `note` (500, Default '') — die Notiz des Betreibers zur Zeile.
 *
 * ── DREI INDIZES, ALLE MIT LESER ──────────────────────────────────────────
 *  · `idx_status` — der Filter der Betreiber-Liste UND ihre drei Zähler.
 *  · `idx_user` und `idx_email_lower` — die zwei GDPR-Lesepfade (s. o.).
 * KEIN Index auf `$createdAt`: Appwrite verwaltet die Spalte selbst, und
 * `orderDesc($createdAt)` läuft ohne eigenen Index — dieselbe Feststellung
 * wie im Kopf von brand-007, gemessen und in R1b noch einmal bestätigt.
 * Auf `profileId` und `source` wird nicht gefiltert; ein Index dafür wäre
 * Schreiblast ohne Leser.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen. Ohne die Tabelle scheitert der Ablage-Zweig von
 * `POST /api/brand/intro-call` — die Route bleibt zwar am Leben (die Mail ist
 * der zweite Zustellweg), aber jede Anfrage lebte dann nur in einem Postfach.
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const INTRO = 'brand_intro_requests'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
/** Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert listColumns 25. */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration brand-021 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${INTRO}`, () => tablesDB.createTable({
  databaseId, tableId: INTRO, name: 'Brand Intro Requests', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(INTRO)

  await columnStep(`Column ${INTRO}.name`, 'name', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'name', size: 120, required: true,
  }))
  await columnStep(`Column ${INTRO}.email`, 'email', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'email', size: 256, required: true,
  }))
  // Der Vergleichswert — Lesepfad der GDPR-Löschung, trägt `idx_email_lower`.
  await columnStep(`Column ${INTRO}.emailLower`, 'emailLower', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'emailLower', size: 256, required: true,
  }))
  await columnStep(`Column ${INTRO}.company`, 'company', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'company', size: 160, required: false, xdefault: '',
  }))
  // Das Anliegen. Zod deckelt bei 1000, die Spalte fasst 2000 (s. Kopf).
  await columnStep(`Column ${INTRO}.message`, 'message', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'message', size: 2000, required: true,
  }))
  await columnStep(`Column ${INTRO}.phone`, 'phone', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'phone', size: 40, required: false, xdefault: '',
  }))
  await columnStep(`Column ${INTRO}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'locale', size: 8, required: false, xdefault: 'en',
  }))
  await columnStep(`Column ${INTRO}.source`, 'source', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'source', size: 64, required: false, xdefault: '',
  }))
  // Nur gesetzt, wenn die Datentür der Route die Id bestätigt hat.
  await columnStep(`Column ${INTRO}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'profileId', size: 64, required: false, xdefault: '',
  }))
  await columnStep(`Column ${INTRO}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'userId', size: 64, required: false, xdefault: '',
  }))
  // Betreiber-Zustand, varchar statt enum (s. Kopf).
  await columnStep(`Column ${INTRO}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'status', size: 32, required: false, xdefault: 'new',
  }))
  await columnStep(`Column ${INTRO}.note`, 'note', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INTRO, key: 'note', size: 500, required: false, xdefault: '',
  }))

  await waitForColumns(INTRO)

  // Der Filter der Betreiber-Liste und ihre drei Zähler.
  await indexStep(`Index ${INTRO}.idx_status`, {
    tableId: INTRO, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
  })
  // Die zwei GDPR-Lesepfade (s. Kopf) — in Appwrite ist ein Index die
  // Vorbedingung der Abfrage, nicht ihre Beschleunigung.
  await indexStep(`Index ${INTRO}.idx_user`, {
    tableId: INTRO, key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'],
  })
  await indexStep(`Index ${INTRO}.idx_email_lower`, {
    tableId: INTRO, key: 'idx_email_lower', type: TablesDBIndexType.Key, columns: ['emailLower'],
  })
}

console.log('✔ Migration brand-021 fertig')
