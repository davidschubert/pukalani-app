/**
 * Migration brand-006: `brand_access` — wer den Wizard nutzen darf
 * (docs/plans/BRAND-WIZARD-SCHEMA.md §5). Gemeinsame Regeln aller
 * brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── EINE ZEILE JE KONTO, UND SIE IST DAS RECHT ────────────────────────────
 * `uq_user` UNIQUE. Gelesen wird sie vom Gate (`requireBrandAccess`), das die
 * Zeile zusammen mit `app_config.brandAdmissionMode` an die pure Regel
 * `decideBrandAccess` gibt (shared/brandAccess.ts). Drei Modi (§3e):
 * 'closed' und 'invite' verlangen BEIDE eine nicht-widerrufene Zeile —
 * 'closed' heisst „keine NEUEN Zugänge", nicht „bestehende weg"; 'open'
 * lässt jedes verifizierte Konto durch, AUCH ohne Zeile.
 *
 * ── `revokedAt` WIRKT SOFORT — UND ZWAR NUR, WEIL DIE TABELLE SERVER-ONLY IST ─
 * Ein Entzug ist eine Änderung an DIESER Zeile, mehr nicht. Gäbe es
 * Row-Permissions (`read(user:<id>)`), hätte ein widerrufenes Konto weiter
 * einen Lesepfad an dem Gate vorbei, das den Entzug auswertet. Deshalb
 * `permissions: []` UND `rowSecurity: false` — kein Umgehungspfad, den man
 * später „aufräumen" müsste.
 *
 * ── `grantedVia` IST HERKUNFT, KEIN RECHT ─────────────────────────────────
 * 'invite' | 'open' | 'operator' sagt, WIE der Zugang entstand — für die
 * Betreiber-Sicht und den Funnel. Ob jemand DARF, entscheidet allein die
 * Existenz der Zeile plus `revokedAt`; wer aus `grantedVia` eine Berechtigung
 * ableitet, baut eine zweite Zugangsregel neben die getestete.
 *
 * ── DIE rowId IST DER ATOMARITÄTS-TRICK (Schema §5) ───────────────────────
 * Bei einer Einlösung wird die Row mit `rowId = inviteId` angelegt. Das
 * zweite Einlösen desselben Codes läuft damit in den 409 — Appwrite ersetzt
 * so die fehlende Transaktion. Bei 'open'/'operator' vergibt die Route eine
 * eigene Id.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
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

const ACCESS = 'brand_access'

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

console.log(`Migration brand-006 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${ACCESS}`, () => tablesDB.createTable({
  databaseId, tableId: ACCESS, name: 'Brand Access', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(ACCESS)

  await columnStep(`Column ${ACCESS}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: ACCESS, key: 'userId', size: 64, required: true,
  }))
  await columnStep(`Column ${ACCESS}.grantedVia`, 'grantedVia', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: ACCESS, key: 'grantedVia', elements: ['invite', 'open', 'operator'], required: true,
  }))
  // Herkunft: bei grantedVia 'invite' die Einladung, sonst ''.
  await columnStep(`Column ${ACCESS}.inviteId`, 'inviteId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: ACCESS, key: 'inviteId', size: 64, required: false, xdefault: '',
  }))
  await columnStep(`Column ${ACCESS}.revokedAt`, 'revokedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: ACCESS, key: 'revokedAt', required: false,
  }))

  await waitForColumns(ACCESS)

  // EIN Konto, EINE Zeile. Der Lesepfad des Gates ist damit ein Punkt-Zugriff,
  // und ein zweiter Zugang für dasselbe Konto ist strukturell unmöglich —
  // sonst könnte ein widerrufener neben einem gültigen stehen.
  await indexStep(`Index ${ACCESS}.uq_user`, {
    tableId: ACCESS, key: 'uq_user', type: TablesDBIndexType.Unique, columns: ['userId'],
  })
}

console.log('✔ Migration brand-006 fertig')
