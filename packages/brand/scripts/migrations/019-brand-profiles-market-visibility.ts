/**
 * Migration brand-019: `brand_profiles.marketVisibility` — DAS OPT-IN, MIT DEM
 * EINE MARKE IM MARKTVERGLEICH ANDERER KUNDEN ERSCHEINEN DARF.
 *
 * NUMMER: 018 (`brand-findings-market-kind`) war der letzte Stand auf
 * `origin/main` und in jedem Arbeitsbaum (2026-09-05 geprüft); 019 ist die
 * nächste freie. Nummern vergeben parallel laufende Sitzungen — wer nach
 * dieser hier eine anlegt, sieht zuerst nach (`ls
 * packages/brand/scripts/migrations` gegen ein frisches `git fetch origin`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * docs/archiv/BRAND-MARKTVERGLEICH.md §7.2 Nr. 4: eine Marke eines ANDEREN
 * Kontos darf im Marktvergleich nur erscheinen, wenn ihre Eigentümerin sie
 * ausdrücklich freigegeben hat. Anhang B hat die Spalte bewusst NICHT in M1
 * gebaut („eine Spalte, die vor ihrer Oberfläche in der Datenbank steht, ist
 * ein Opt-in, das niemand geben kann") — sie kommt mit M4, zusammen mit dem
 * Schalter, der sie setzt, und dem Quellen-Wähler, der sie liest.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── ZWEI WERTE, UND DER VORGABEWERT IST DIE ABLEHNUNG ─────────────────────
 * `private` (Default) und `shared`. Jede Zeile aus der Zeit davor liest damit
 * `private`, und das ist die einzig zulässige Bedeutung: eine Zustimmung, die
 * niemand gegeben hat, darf nicht durch einen Vorgabewert entstehen. Genau
 * dieselbe Semantik trägt `brand_checks.rankingOptIn` (brand-017) — Davids
 * Leitplanke lautet ausdrücklich „keine zweite Schalter-Semantik".
 *
 * ── WARUM VARCHAR UND KEIN BOOLEAN ────────────────────────────────────────
 * Ein Boolean beantwortet heute dieselbe Frage und morgen keine mehr: denkbar
 * ist eine dritte Stufe („nur für Kunden, die mich eingeladen haben"). Ein
 * `visible: true` liesse sich dann nicht mehr erweitern, ohne die Bedeutung
 * bestehender Zeilen zu verschieben. Die WAHRHEIT über die erlaubten Werte
 * steht im Code (`BRAND_MARKET_VISIBILITIES` in
 * `server/utils/brandMarketVisibility.ts`), nicht in einem Enum — dieselbe
 * Entscheidung wie bei `brand_checks.industry` (brand-017).
 *
 * ── WARUM EIN INDEX ───────────────────────────────────────────────────────
 * Der Quellen-Wähler des Marktvergleichs sucht GENAU über diese Spalte
 * (`marketVisibility = 'shared'`) — ohne Index wäre das ein Tabellen-Scan über
 * alle Brandings der Instanz, bei jedem Tastendruck im Suchfeld. Der
 * Namens-Präfix wird bewusst NICHT indiziert: er wird im Server über die
 * (kurze) Trefferliste gefiltert, und ein zweiter Index auf `title` wäre ein
 * Versprechen auf eine Volltextsuche, die es hier nicht gibt.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Spalte lehnt Appwrite jedes Setzen des Opt-ins ab, und
 * das Schreiben ist an dieser Stelle NICHT fail-soft.
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

const PROFILES = 'brand_profiles'

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

console.log(`Migration brand-019 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  // `private` | `shared` — Default ist die Ablehnung (s. Kopf).
  await columnStep(
    `Column ${PROFILES}.marketVisibility`,
    'marketVisibility',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: PROFILES, key: 'marketVisibility', size: 16,
      required: false, xdefault: 'private',
    }),
  )

  await waitForColumns(PROFILES)

  // „Welche Brandings sind freigegeben?" — der EINE Lesepfad des
  // Quellen-Wählers (s. Kopf).
  await indexStep(`Index ${PROFILES}.idx_market_visibility`, {
    tableId: PROFILES,
    key: 'idx_market_visibility',
    type: TablesDBIndexType.Key,
    columns: ['marketVisibility'],
  })
}

console.log('✔ Migration brand-019 fertig')
