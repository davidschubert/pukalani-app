/**
 * Migration brand-028: DER PAPIERKORB DER MARKEN (WH1) —
 * `brand_profiles.erasedAt` + Index `idx_erased`.
 *
 * NUMMER: 027 (`brand-runs`) war der letzte Stand auf `origin/main` und auf
 * jedem offenen Zweig (2026-11-25 geprüft); 028 ist die nächste freie.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only, kein `communityId`,
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip), nur additiv.
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Davids Entscheidung (2026-11-15, `docs/plans/WIEDERHERSTELLUNG.md`): eine
 * gelöschte Marke verschwindet sofort überall, liegt 90 Tage unter „Gelöschte
 * Marken" und wird danach von einem stündlichen Lauf endgültig gelöscht.
 * `erasedAt` ist der Zeitpunkt des Löschens; `null` (der Default jeder Zeile)
 * heisst „nicht gelöscht" — die einzig zulässige Bedeutung eines fehlenden
 * Wertes. Die Regel dazu steht pur in `shared/brandProfileTrash.ts`.
 *
 * ── EIN INDEX, EINE FRAGE ─────────────────────────────────────────────────
 * `idx_erased` ist der Lesepfad des Laufs („seit mehr als 90 Tagen
 * gelöscht", `lessThan`). Die Liste der eigenen Marken liest über
 * `ownerId` und filtert `erasedAt` danach im Speicher.
 *
 * KEIN BACKFILL: bis heute wurde eine Marke sofort gelöscht, es gibt keine
 * Bestandszeile, die „im Papierkorb" wäre.
 *
 * Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --only brand-028
 *
 * Diese Migration MUSS vor dem Code-Deploy laufen: das Löschen schreibt den
 * Zeitpunkt, und Appwrite lehnt das Schreiben einer fehlenden Spalte ab.
 */
import '../../../../scripts/lib/assert-target.mjs'
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

console.log(`Migration brand-028 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  // `null` = nicht gelöscht (s. Kopf: kein Backfill).
  await columnStep(`Column ${PROFILES}.erasedAt`, 'erasedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PROFILES, key: 'erasedAt', required: false,
  }))

  await waitForColumns(PROFILES)

  await indexStep(`Index ${PROFILES}.idx_erased`, {
    tableId: PROFILES,
    key: 'idx_erased',
    type: TablesDBIndexType.Key,
    columns: ['erasedAt'],
  })
}

console.log('✔ Migration brand-028 fertig')
