/**
 * Migration system-030: app_config.onboardingInviteOnly — braucht das GRÜNDEN
 * einer eigenen Community einen Einladungs-Code? (U2, Davids Entscheidung 1
 * der UX-Planungsrunde vom 2026-08-10.)
 *
 * Die Pflicht bleibt; sie bekommt nur einen Schalter, damit ihr Abschalten
 * kein Deploy ist. Gelesen wird die Spalte AUSSCHLIESSLICH auf dem Control
 * Plane (packages/control/server/utils/onboardingGate.ts) — sie wandert
 * trotzdem auf jede Instanz, weil der system-Layer überall mitläuft und
 * `pnpm ops:schema-parity` sonst auf jeder anderen Instanz eine fehlende
 * Spalte meldet.
 *
 * DEFAULT `true`: eine Instanz, die diese Migration noch nicht gesehen hat,
 * und eine Zeile ohne den Wert bedeuten beide „Einladung nötig". Der Fail-safe
 * steht zusätzlich im Code (shared/onboardingGate.ts) — ein aufgerissenes Tor
 * merkt sonst niemand.
 *
 * Idempotent (Vorab-Check + 409 → skip).
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
 * wäre diese Migration nicht mehr idempotent (N2). Query.limit ist PFLICHT:
 * ohne explizites Limit liefert listColumns 25 Spalten, und app_config wächst
 * mit jedem Flag — eine abgeschnittene Liste meldete „Spalte fehlt".
 */
async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    return columns.some(column => column.key === key)
  }
  catch {
    return false
  }
}

console.log(`Migration system-030 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

if (await columnExists('app_config', 'onboardingInviteOnly')) {
  console.log('↷ Column app_config.onboardingInviteOnly (existiert bereits)')
}
else {
  try {
    await tablesDB.createBooleanColumn({
      databaseId, tableId: 'app_config', key: 'onboardingInviteOnly', required: false, xdefault: true,
    })
    console.log('✔ Column app_config.onboardingInviteOnly')
  }
  catch (error) {
    if (hasCode(error, 409)) console.log('↷ Column app_config.onboardingInviteOnly (existiert bereits)')
    else throw error
  }
}

console.log('✔ Migration system-030 fertig')
