/**
 * Migration market-003: `market_reports` — DER VERGLEICH JE STAND.
 *
 * Paket M1, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.6. Gemeinsame Regeln
 * wie market-001 (server-only, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent).
 *
 * ── `revisionKey` IST DER GANZE KOSTENDECKEL ──────────────────────────────
 * Ein Hash über die Foundation-Revisionen der beteiligten Felder, die
 * Kandidaten-Liste und die Abrufstände (§2.3 Nr. 5). Gleicher Schlüssel ⇒
 * gespeicherter Bericht, KEIN Modell-Aufruf. Eine Korrektur eines eigenen
 * Feldes bewegt ihn mechanisch — daher ist ein Bericht nie „veraltet, aber
 * niemand merkt es": er ist entweder derselbe Schlüssel oder ein anderer.
 * Deshalb der Index `(profileId, revisionKey)`; ohne ihn wäre die
 * Wiederverwendung ein Scan über alle Berichte des Brandings.
 *
 * ── FÜNF MEDIUMTEXT-SPALTEN, NICHT EINE ──────────────────────────────────
 * Der Bericht hat vier Teile (§2.3 Nr. 4) plus das eigene Profil, gegen das
 * verglichen wurde. Sie stehen getrennt, weil die Oberfläche sie getrennt
 * lädt und weil ein Teil, der beim Erzeugen leer bleibt (niemand hat eine
 * freie Stelle), dann auch als leer LESBAR ist — in einem Sammel-JSON wäre
 * „nicht erzeugt" von „nichts gefunden" nicht mehr zu unterscheiden.
 * MEDIUMTEXT auch für die drei Listen: sie tragen Zitate mit Quell-Adresse
 * (§2.9 Nr. 4) und wachsen mit der Zahl der Kandidaten — eine varchar-Spalte
 * dafür säße im 65-KB-Zeilenbudget von MariaDB, wo sie nichts zu suchen hat.
 *
 * ── `ownProfile` WIRD EINGEFROREN, NICHT VERLINKT ─────────────────────────
 * Der Bericht zeigt, was die eigene Marke ZUM ZEITPUNKT DES VERGLEICHS gesagt
 * hat. Läse er die Foundation live, änderte sich ein alter Bericht rückwirkend
 * mit jeder Korrektur — und die Befunde daneben („euer Satz klingt wie zwei
 * andere") stünden plötzlich neben einem Satz, den es nicht mehr gibt.
 * Dasselbe Muster wie `brand_shares.snapshot`.
 *
 * ── `findingIds` STATT DER BEFUNDE SELBST ────────────────────────────────
 * Die Markt-Befunde leben im Befund-Speicher des brand-Layers
 * (`brand_findings`, Art `market`, §2.7) — dort haben sie ihren Status, ihre
 * Chips und ihre Abnahme. Hier steht nur, WELCHE zu diesem Bericht gehören;
 * eine Kopie hätte binnen eines Klicks einen zweiten, falschen Status.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer market
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

const REPORTS = 'market_reports'

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

console.log(`Migration market-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${REPORTS}`, () => tablesDB.createTable({
  databaseId, tableId: REPORTS, name: 'Market Reports', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(REPORTS)

  await columnStep(`Column ${REPORTS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'profileId', size: 64, required: true,
  }))
  // Der Idempotenz-Schlüssel (s. Kopf) — sha256, hex.
  await columnStep(`Column ${REPORTS}.revisionKey`, 'revisionKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'revisionKey', size: 64, required: true,
  }))
  // Das eingefrorene eigene Profil (s. Kopf). MEDIUMTEXT ⇒ kein Default.
  await columnStep(`Column ${REPORTS}.ownProfile`, 'ownProfile', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: REPORTS, key: 'ownProfile', required: false,
  }))
  // Die Gegenüberstellung Wir × W1..W5 je Feld, mit Zitaten (§2.3 Nr. 4).
  await columnStep(`Column ${REPORTS}.matrix`, 'matrix', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: REPORTS, key: 'matrix', required: false,
  }))
  // Was ALLE sagen — die Eintrittskarte, kein Unterscheidungsmerkmal.
  await columnStep(`Column ${REPORTS}.conventions`, 'conventions', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: REPORTS, key: 'conventions', required: false,
  }))
  // Was wir sagen und mindestens ein anderer auch.
  await columnStep(`Column ${REPORTS}.overlaps`, 'overlaps', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: REPORTS, key: 'overlaps', required: false,
  }))
  // Was im Feld niemand besetzt — als FRAGE formuliert, nicht als Empfehlung.
  await columnStep(`Column ${REPORTS}.whitespace`, 'whitespace', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: REPORTS, key: 'whitespace', required: false,
  }))
  // Die Adressen der Markt-Befunde in `brand_findings` (s. Kopf). Fünf
  // Befunde je Bericht sind der Deckel — 2000 Zeichen decken ein Vielfaches.
  await columnStep(`Column ${REPORTS}.findingIds`, 'findingIds', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'findingIds', size: 2000, required: false, xdefault: '',
  }))
  await columnStep(`Column ${REPORTS}.model`, 'model', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'model', size: 120, required: false, xdefault: '',
  }))
  await columnStep(`Column ${REPORTS}.promptVersion`, 'promptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'promptVersion', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(REPORTS)

  // „Gibt es zu DIESEM Stand schon einen Bericht?" — der Idempotenz-Pfad und
  // damit der Kostendeckel (s. Kopf). KEY, nicht UNIQUE: derselbe Schlüssel
  // darf nach einem Fehlversuch ein zweites Mal geschrieben werden, und der
  // Leser nimmt ohnehin den jüngsten.
  await indexStep(`Index ${REPORTS}.idx_profile_revision`, {
    tableId: REPORTS, key: 'idx_profile_revision', type: TablesDBIndexType.Key, columns: ['profileId', 'revisionKey'],
  })
  // „Welche Berichte hat dieses Branding?" — Verlauf und Kaskade.
  await indexStep(`Index ${REPORTS}.idx_profile`, {
    tableId: REPORTS, key: 'idx_profile', type: TablesDBIndexType.Key, columns: ['profileId'],
  })
}

console.log('✔ Migration market-003 fertig')
