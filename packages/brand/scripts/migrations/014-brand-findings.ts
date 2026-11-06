/**
 * Migration brand-014: `brand_findings` — WAS DER SPEZIALIST BEIM SCHLIESSEN
 * GEFUNDEN HAT (docs/archiv/BRAND-WIZARD-SESSIONS.md §4, §8, §12).
 *
 * ── WARUM EINE EIGENE TABELLE UND KEIN JSON IM SLOT ───────────────────────
 * Notizen (`slots[id].notes`) und Quellen-Hash liegen additiv in der
 * bestehenden `slots`-Spalte, weil sie GENAU EINER Zeile gehören. Ein BEFUND
 * gehört keiner: ein Konflikt zwischen `b.purpose` und `c.conflictRule`
 * verbindet zwei Sessions aus zwei Kapiteln, also zwei `brand_steps`-Zeilen.
 * In eine davon geschrieben, wäre er für die andere unsichtbar — und beim
 * „Nochmal von vorn" des einen Kapitels stillschweigend weg, obwohl der
 * andere Wert weiter steht.
 *
 * Dazu kommt der STATUS: ein Befund lebt weiter, nachdem er entstanden ist
 * (`open` → `accepted` / `dismissed`, §8). Ein Zustand, den ein Mensch
 * verändert, gehört in eine Zeile, die man einzeln adressieren kann — nicht
 * in ein JSON-Objekt, das jeder Autosave im Ganzen überschreibt.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die acht Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false` — wie `brand_messages`), kein `communityId` (Silo-Layer
 * auf `branding`), Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── DIE SPALTEN ───────────────────────────────────────────────────────────
 *  · `profileId` (64, Pflicht) — das Branding. Erster Bestandteil beider
 *    Indizes; ohne ihn gäbe es keine Abfrage, die nur EINE Marke liest.
 *  · `stepKey` (32, Pflicht) — das Kapitel der QUELL-Session. Es steht neben
 *    `sourceSession`, obwohl es daraus ableitbar wäre: die Abnahme-Seite fragt
 *    „hängt an DIESEM Kapitel ein offener Konflikt?" (§5a Schritt 3), und
 *    diese Frage soll ein Index beantworten und keine Schleife über die
 *    Registry.
 *  · `kind` (enum, Pflicht) — `conflict` (zwei Felder widersprechen sich),
 *    `affected` (ein Feld ist von einer Korrektur inhaltlich getroffen, §9),
 *    `gap` (eine Lücke, §10). Enum und nicht varchar: die drei Werte sind
 *    CODE (`brandStepAcceptance` sperrt auf `conflict`), keine Betreiber-Notiz
 *    — anders als `brand_waitlist.status`.
 *  · `slots` (512, Pflicht) — die beteiligten Feld-Ids als JSON-Array. Bei
 *    `conflict` immer ZWEI, damit die Oberfläche beide verlinken kann (§4).
 *    Als JSON in EINER Spalte statt als Array-Spalte: Appwrite-Array-Spalten
 *    sind nicht indizierbar, und gesucht wird hier ohnehin nie nach einem
 *    Slot, sondern immer nach Profil und Status.
 *  · `why` (1000, Pflicht) · `suggestion` (1000, Default '') — Chat-Sprache,
 *    je ein Satz. Der Deckel ist grosszügiger als der eine Satz, den §4
 *    verlangt, und trotzdem hart: der Text kommt aus einem Modell.
 *  · `status` (enum, Default 'open') — `open` | `accepted` | `dismissed`.
 *  · `sourceSession` (64, Pflicht) — die Session, deren Schliess-Aufruf den
 *    Befund erzeugt hat. Sie ist der Ort, an den ein „abgelehnt, weil …"
 *    als Notiz zurückfliesst (§8).
 *  · `dismissReason` (500, Default '') — der Grund der Ablehnung. Er ist
 *    PFLICHT an der Route (≥ 3 Zeichen) und optional in der Spalte: eine
 *    angenommene Zeile hat keinen.
 *  · `resolvedAt` (datetime, null) — wann der Mensch entschieden hat.
 *  · `mentionedAt` (datetime, null) — wann George den Befund im Gespräch
 *    ausgesprochen hat. §8 sagt „George formuliert ihn EINMAL"; ohne eine
 *    Marke IN der Zeile wäre „einmal" eine Rechnung über dem Verlauf, und die
 *    ginge bei jedem neuen Fenster von sechs Zügen wieder auf.
 *
 * ── ZWEI INDIZES, ZWEI FRAGEN ─────────────────────────────────────────────
 * `idx_profile_status` (profileId, status) ist die Liste „was ist hier noch
 * offen" — der Lesepfad der Chips (Paket 5) und des Prüfblicks (§10).
 * `idx_profile_step` (profileId, stepKey) ist die Kapitel-Sperre: die
 * Abnahme-Seite fragt genau ein Kapitel. Beide zusammen wären EIN Index nur,
 * wenn Appwrite Teil-Präfixe über drei Spalten so nutzte — tut es, aber die
 * zweite Abfrage filtert nach `stepKey` OHNE `status` an zweiter Stelle, und
 * ein Index, dessen mittlere Spalte übersprungen wird, trägt nicht.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle bleibt der Schliess-Aufruf fail-soft ohne Befunde
 * (`reviewed: false`), und das sähe wie ein kaputtes Modell aus.
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

const FINDINGS = 'brand_findings'

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

console.log(`Migration brand-014 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${FINDINGS}`, () => tablesDB.createTable({
  databaseId, tableId: FINDINGS, name: 'Brand Findings', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(FINDINGS)

  await columnStep(`Column ${FINDINGS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'profileId', size: 64, required: true,
  }))
  // Das Kapitel der QUELL-Session — die Kapitel-Sperre der Abnahme (s. Kopf).
  await columnStep(`Column ${FINDINGS}.stepKey`, 'stepKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'stepKey', size: 32, required: true,
  }))
  // Enum, nicht varchar: die drei Werte sind Code, keine Betreiber-Notiz.
  await columnStep(`Column ${FINDINGS}.kind`, 'kind', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: FINDINGS, key: 'kind', elements: ['conflict', 'affected', 'gap'], required: true,
  }))
  // Die beteiligten Feld-Ids als JSON-Array (bei `conflict` genau zwei).
  await columnStep(`Column ${FINDINGS}.slots`, 'slots', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'slots', size: 512, required: true,
  }))
  await columnStep(`Column ${FINDINGS}.why`, 'why', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'why', size: 1000, required: true,
  }))
  await columnStep(`Column ${FINDINGS}.suggestion`, 'suggestion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'suggestion', size: 1000, required: false, xdefault: '',
  }))
  await columnStep(`Column ${FINDINGS}.status`, 'status', cols, () => tablesDB.createEnumColumn({
    databaseId,
    tableId: FINDINGS,
    key: 'status',
    elements: ['open', 'accepted', 'dismissed'],
    required: false,
    xdefault: 'open',
  }))
  await columnStep(`Column ${FINDINGS}.sourceSession`, 'sourceSession', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'sourceSession', size: 64, required: true,
  }))
  await columnStep(`Column ${FINDINGS}.dismissReason`, 'dismissReason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: FINDINGS, key: 'dismissReason', size: 500, required: false, xdefault: '',
  }))
  // Kein `xdefault` auf den beiden Zeitstempeln: „noch nicht passiert" ist
  // `null` und nicht eine erfundene Stunde null.
  await columnStep(`Column ${FINDINGS}.resolvedAt`, 'resolvedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: FINDINGS, key: 'resolvedAt', required: false,
  }))
  await columnStep(`Column ${FINDINGS}.mentionedAt`, 'mentionedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: FINDINGS, key: 'mentionedAt', required: false,
  }))

  await waitForColumns(FINDINGS)

  // „Was ist in diesem Branding noch offen?" — Chips, Prüfblick, Dedup.
  await indexStep(`Index ${FINDINGS}.idx_profile_status`, {
    tableId: FINDINGS, key: 'idx_profile_status', type: TablesDBIndexType.Key, columns: ['profileId', 'status'],
  })
  // „Hängt an DIESEM Kapitel ein Befund?" — die Sperre der Finalen Abnahme.
  await indexStep(`Index ${FINDINGS}.idx_profile_step`, {
    tableId: FINDINGS, key: 'idx_profile_step', type: TablesDBIndexType.Key, columns: ['profileId', 'stepKey'],
  })
}

console.log('✔ Migration brand-014 fertig')
