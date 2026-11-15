/**
 * Migration system-038: die zwei Laufzeit-Flags des Brand-Wizards
 * (docs/plans/BRAND-WIZARD-SCHEMA.md §8, Teil von P1a).
 *
 *   app_config.brandAdmissionMode — DREI Werte (Plan §3e):
 *     'closed' (Default) = keine NEUEN Zugänge; bestehende brand_access-Rows
 *       bleiben gültig · 'invite' = neue Zugänge nur per Einladungscode ·
 *       'open' = jedes eingeloggte, E-Mail-verifizierte Konto.
 *     Im GATE verhalten sich 'closed' und 'invite' gleich (Zeile nötig); sie
 *     unterscheiden sich in der EINLÖSUNG — die pure Regel dazu steht in
 *     packages/brand/shared/brandAccess.ts. Die Öffnung ist damit ein
 *     LAUFZEITFLAG, kein Deploy; die KONTO-PFLICHT gilt IMMER (kein
 *     Anonym-Start), und ein expliziter Entzug (brand_access.revokedAt)
 *     schlägt jeden Modus. varchar(16) fasst alle drei Werte.
 *   app_config.brandAiEnabled — brand-spezifischer KI-Kill-Switch, Default
 *     false. Aus heißt: der bestehende Stand bleibt VOLL BEARBEITBAR, es
 *     entstehen nur keine neuen KI-Entwürfe mehr.
 *
 * Beide additiv mit Default — `system` läuft auf JEDER Instanz mit, und die
 * Spalten-Parität (scripts/ops/verify-schema-parity.mjs) vergleicht app_config
 * über alle Instanzen. Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'

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

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * app_config ist am utf8mb4-Zeilenbudget von MariaDB — Appwrite prüft die
 * Größe VOR der Duplikat-Erkennung und antwortet auf ein erneutes
 * createColumn mit 400 `column_limit_exceeded` statt 409. Ohne Vorab-Check
 * wäre diese Migration nicht mehr idempotent (N2).
 */
async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    // Query.limit ist PFLICHT (Falle aus events-006): ohne explizites Limit
    // liefert listColumns 25 Spalten, und app_config wächst mit jedem Flag.
    // Eine abgeschnittene Liste meldet "Spalte fehlt" — createColumn antwortet
    // dann 400 column_limit_exceeded statt 409, und genau die 409-Abkürzung
    // ist die Idempotenz dieser Migration.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    return columns.some(column => column.key === key)
  }
  catch {
    return false
  }
}

console.log(`Migration system-038 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

if (await columnExists('app_config', 'brandAdmissionMode')) {
  console.log('↷ Column app_config.brandAdmissionMode (existiert bereits)')
}
else {
  try {
    await tablesDB.createVarcharColumn({
      databaseId, tableId: 'app_config', key: 'brandAdmissionMode', size: 16, required: false, xdefault: 'closed',
    })
    console.log('✔ Column app_config.brandAdmissionMode')
  }
  catch (error) {
    if (hasCode(error, 409)) console.log('↷ Column app_config.brandAdmissionMode (existiert bereits)')
    else throw error
  }
}

if (await columnExists('app_config', 'brandAiEnabled')) {
  console.log('↷ Column app_config.brandAiEnabled (existiert bereits)')
}
else {
  try {
    await tablesDB.createBooleanColumn({
      databaseId, tableId: 'app_config', key: 'brandAiEnabled', required: false, xdefault: false,
    })
    console.log('✔ Column app_config.brandAiEnabled')
  }
  catch (error) {
    if (hasCode(error, 409)) console.log('↷ Column app_config.brandAiEnabled (existiert bereits)')
    else throw error
  }
}

console.log('✔ Migration system-038 fertig')
