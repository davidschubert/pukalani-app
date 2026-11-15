/**
 * Legt die Tabelle `intro_requests` in der portfolio-Instanz an — die Ablage
 * der Erstgespräch-Anfragen (W1, `POST /api/intro-call`).
 *
 *   pnpm --filter portfolio ensure:intro-requests
 *   # oder gegen eine andere Instanz:
 *   node --env-file=<pfad>/.env apps/portfolio/scripts/ensure-intro-requests.mjs
 *
 * WARUM APP-LOKAL UND NICHT ALS LAYER-MIGRATION (Plan-Abschnitt 6, Zuschnitt
 * beim Bau): der Wizard ist eine Eigenschaft DIESER Marketing-Site und nichts,
 * was eine Community je zuschaltet. Ein Produkt-Layer dafür hätte genau einen
 * Konsumenten und läge auf jeder anderen Instanz als tote Tabelle herum. Der
 * Schema-Parity-Wächter meldet unbekannte portfolio-Tabellen ohnehin nur als
 * nicht-fatale WARNUNG — dieser Preis ist bewusst bezahlt.
 *
 * SERVER-ONLY: `permissions: []` und `rowSecurity: false`. Es gibt keine Rolle,
 * die diese Zeilen lesen darf — hier stehen Name, Firma, E-Mail und Telefon
 * fremder Menschen. Gelesen wird über die Appwrite-Console; ein Dashboard dafür
 * gibt es bewusst nicht.
 *
 * KEINE INDIZES, und das ist kein Vergessen: es gibt keine Abfrage. Geschrieben
 * wird blind, gelesen wird in der Console (die sortiert über `$createdAt`).
 * Damit entfällt hier auch die `indexRetry`-Fabrik — sie ist Pflicht, sobald
 * ein Index dazukommt.
 *
 * IDEMPOTENT (409 → skip): ein zweiter Lauf ist harmlos, eine neue Spalte
 * einfach unten anhängen und erneut laufen lassen.
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — mit --env-file=apps/portfolio/.env aufrufen.')
  process.exit(1)
}

const TABLE = 'intro_requests'
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error, code) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label, run) {
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

async function waitForColumns() {
  for (let i = 0; i < 600; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId: TABLE })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${TABLE}" wurden nicht verfügbar`)
}

console.log(`intro_requests gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId,
  tableId: TABLE,
  name: 'Erstgespräch-Anfragen',
  permissions: [],
  rowSecurity: false,
}))

/**
 * Alle Felder sind OPTIONAL mit leerem Vorgabewert, auch die im Formular
 * pflichtigen: die Prüfung gehört an die Route (Zod), nicht ins Schema. Eine
 * `required`-Spalte hier hieße, dass eine künftige Änderung an der Route eine
 * Anfrage nicht mehr speichern KANN — und dann geht die Zeile verloren,
 * während die Mail schon raus ist.
 *
 * Die Längen sind die der Zod-Grenzen, mit Luft nach oben. `goals` trägt die
 * Auswahl als JSON-Zeichenkette (Begründung in der Route).
 */
const VARCHARS = [
  ['goals', 500],
  ['projectType', 32],
  ['industry', 255],
  ['budget', 32],
  ['teamSize', 32],
  ['market', 255],
  ['currentSetup', 32],
  ['timing', 32],
  ['name', 255],
  ['company', 255],
  ['email', 255],
  ['phone', 64],
  ['locale', 8],
]

for (const [key, size] of VARCHARS) {
  await step(`Column ${TABLE}.${key}`, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TABLE, key, size, required: false, xdefault: '',
  }))
}

// `note` als MEDIUMTEXT: bis 5.000 Zeichen sind in utf8mb4 bis zu 20 KB, und
// eine MariaDB-ZEILE hat nur rund 65 KB — als varchar würde dieses eine Feld
// ein Drittel des Budgets fressen. Mediumtext liegt off-row und kostet nichts.
await step(`Column ${TABLE}.note`, () => tablesDB.createMediumtextColumn({
  databaseId, tableId: TABLE, key: 'note', required: false, xdefault: '',
}))

await waitForColumns()

console.log(`✔ ${TABLE} ist bereit`)
