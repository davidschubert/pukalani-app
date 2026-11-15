/**
 * Migration brand-026: DAS LÖSCHEN ERREICHT DIE PRÜFERGEBNISSE —
 * `brand_checks.erasedAt` + Index `idx_erased` (SEC-015).
 *
 * NUMMER: 025 (`brand-derivation-unlock`) war der letzte Stand auf
 * `origin/main` und in diesem Arbeitsbaum (2026-11-15 geprüft); 026 ist die
 * nächste freie. Wer nach dieser hier eine anlegt, sieht zuerst nach
 * (`git fetch origin && git ls-tree --name-only origin/main
 * packages/brand/scripts/migrations/`).
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only, kein `communityId`
 * (Silo-Layer auf `branding`), Indizes NUR über `createIndexSteps`,
 * idempotent (409 → skip), nur additiv.
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Davids Entscheidung (2026-11-12 und 2026-11-15): „Export und Löschung nehmen
 * auch Prüfergebnisse, Korrektur-Meldungen und die Warteliste mit." Löscht
 * jemand sein Konto oder eine Marke, sind deren Checks SOFORT für alle
 * unsichtbar und werden nach 90 Tagen von einem geplanten Lauf endgültig
 * abgeräumt. Bis dahin kann nur der Betreiber sie von Hand zurückholen.
 * Nach den 90 Tagen: private Ergebnisse (Dokument-Checks) werden gelöscht,
 * Ergebnisse über öffentliche Websites bleiben — OHNE jeden Bezug zur Person.
 * Die Regel dazu steht pur in `server/utils/brandCheckErasure.ts`.
 *
 * ── DREI FLAGS, DREI MENSCHEN ─────────────────────────────────────────────
 * brand-017 hat die Unterscheidung angelegt, diese Migration setzt sie fort:
 *   · `rankingOptIn` gehört dem PRÜFER — er hat der Veröffentlichung im
 *     Ranking zugestimmt.
 *   · `hidden` gehört dem BETREIBER — er hat einem Entfernungswunsch
 *     stattgegeben. Diese Zeilen bleiben FÜR IMMER stehen: sie sind sein
 *     Beleg dafür, was wann behauptet wurde.
 *   · `erasedAt` gehört dem EIGENTÜMER — er hat sein Konto oder seine Marke
 *     gelöscht. Diese Zeilen werden nach der Frist abgeräumt.
 * Ein gemeinsames Feld wäre kürzer und falsch: ein Löschen darf weder eine
 * Zustimmung vortäuschen noch den Beleg des Betreibers überschreiben, und ein
 * Wiederherstellen durch den Betreiber darf eine Ausblendung nicht aufheben.
 *
 * ── WARUM EIN ZEITPUNKT UND KEIN JA/NEIN ──────────────────────────────────
 * Weil die Frist daran hängt. `null` (der Default jeder Zeile) heisst „nicht
 * gelöscht" — die einzig zulässige Bedeutung eines fehlenden Wertes, dieselbe
 * Leitplanke wie bei `designUnlockedAt` (brand-022). Der Zeitpunkt wird beim
 * ERSTEN Löschen gesetzt und nie verschoben: ein zweiter Löschlauf darf die
 * 90 Tage nicht neu beginnen lassen.
 *
 * ── EIN INDEX, EINE FRAGE ─────────────────────────────────────────────────
 * `idx_erased` (erasedAt) ist der Lesepfad des späteren stündlichen Laufs:
 * „welche Zeilen sind seit mehr als 90 Tagen gelöscht?" (`lessThan`). Die
 * Leser der Oberfläche schliessen gelöschte Zeilen über `isNull('erasedAt')`
 * aus — das Ranking in der Abfrage, damit sie sein Lesefenster nicht
 * verbrauchen.
 *
 * ── KEIN BACKFILL ─────────────────────────────────────────────────────────
 * Es gibt keine Bestandszeile, die „schon gelöscht" wäre: bis heute hat das
 * Löschen eines Kontos oder einer Marke die Checks gar nicht berührt. Welche
 * Checks zu längst gelöschten Konten gehörten, lässt sich nicht verlässlich
 * rekonstruieren — eine geratene Markierung wäre schlimmer als keine.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Diese Migration MUSS vor dem Code-Deploy laufen: die Leser fragen
 * `isNull('erasedAt')`, und eine Abfrage auf eine fehlende Spalte lehnt
 * Appwrite ab — das Ranking stünde dann leer, das Löschen eines Kontos
 * scheiterte am Schreiben des Zeitpunkts.
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

const CHECKS = 'brand_checks'

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

console.log(`Migration brand-026 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(CHECKS)

  // `null` = nicht gelöscht, und zwar für jede Zeile aus der Zeit davor
  // (s. Kopf: kein Backfill).
  await columnStep(`Column ${CHECKS}.erasedAt`, 'erasedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CHECKS, key: 'erasedAt', required: false,
  }))

  await waitForColumns(CHECKS)

  await indexStep(`Index ${CHECKS}.idx_erased`, {
    tableId: CHECKS,
    key: 'idx_erased',
    type: TablesDBIndexType.Key,
    columns: ['erasedAt'],
  })
}

console.log('✔ Migration brand-026 fertig')
