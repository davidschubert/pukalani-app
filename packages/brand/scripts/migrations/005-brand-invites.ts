/**
 * Migration brand-005: `brand_invites` — die Einladungen der Beta
 * (docs/plans/BRAND-WIZARD-SCHEMA.md §5). Gemeinsame Regeln aller
 * brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── E-MAIL-GEBUNDEN UND NUR ALS HASH (M9-Muster) ──────────────────────────
 * `codeHash` = sha256 des Codes; der rohe Code steht ausschliesslich in der
 * Versand-Mail. `emailLower` bindet die Einladung an genau eine Adresse —
 * ein weitergereichter Code öffnet damit keinen fremden Zugang.
 *
 * ── DREI ZUSTÄNDE, DREI SPALTEN, KEIN status-FELD ─────────────────────────
 * `revokedAt` (zurückgezogen), `redeemedAt` + `redeemedByUserId`
 * (eingelöst) — abgelaufen rechnet man aus `expiresAt`. Ein zusätzliches
 * `status` wäre eine zweite Wahrheit über dieselben Tatsachen und könnte
 * ihnen widersprechen.
 *
 * ── DIE EINLÖSUNG IST ATOMAR OHNE TRANSAKTION (Schema §5) ─────────────────
 * Appwrite kennt keine Transaktionen. Die `brand_access`-Row wird deshalb mit
 * `rowId = inviteId` angelegt: das ZWEITE Einlösen desselben Codes läuft in
 * den 409 (dasselbe Muster wie die Idempotenz von `notify()`), und erst NACH
 * erfolgreichem createRow wird hier `redeemedAt` gestempelt. Ein Stempel
 * zuerst hätte bei einem Fehlschlag den Code verbrannt, ohne Zugang zu geben.
 *
 * ── REIHENFOLGE BEIM NEUEN KONTO (Plan §6) ────────────────────────────────
 * Code neutral prüfen → Konto anlegen → E-Mail verifizieren → Access
 * schreiben + Invite verbrauchen. Ein UNVERIFIZIERTES Konto verbrennt den
 * Code nicht. Falsch, abgelaufen und widerrufen führen zu DERSELBEN
 * neutralen Ablehnung — sonst wäre die Beta über Fehlermeldungen
 * enumerierbar.
 *
 * OB eine Einlösung überhaupt Zugang schaffen darf, sagt der Aufnahme-Modus
 * (`admissionAllowsRedeem` in shared/brandAccess.ts): nur 'invite'.
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

const INVITES = 'brand_invites'

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

console.log(`Migration brand-005 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${INVITES}`, () => tablesDB.createTable({
  databaseId, tableId: INVITES, name: 'Brand Invites', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(INVITES)

  // 320 = die maximale Länge einer E-Mail-Adresse (64 lokal + @ + 255 Domain).
  // Kleingeschrieben gespeichert, damit der Vergleich eindeutig ist.
  await columnStep(`Column ${INVITES}.emailLower`, 'emailLower', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INVITES, key: 'emailLower', size: 320, required: true,
  }))
  await columnStep(`Column ${INVITES}.codeHash`, 'codeHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INVITES, key: 'codeHash', size: 128, required: true,
  }))
  await columnStep(`Column ${INVITES}.createdByUserId`, 'createdByUserId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INVITES, key: 'createdByUserId', size: 64, required: true,
  }))
  await columnStep(`Column ${INVITES}.expiresAt`, 'expiresAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: INVITES, key: 'expiresAt', required: true,
  }))
  await columnStep(`Column ${INVITES}.revokedAt`, 'revokedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: INVITES, key: 'revokedAt', required: false,
  }))
  await columnStep(`Column ${INVITES}.redeemedAt`, 'redeemedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: INVITES, key: 'redeemedAt', required: false,
  }))
  await columnStep(`Column ${INVITES}.redeemedByUserId`, 'redeemedByUserId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INVITES, key: 'redeemedByUserId', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(INVITES)

  // Der Prüfpfad: Hash rein, Einladung raus. UNIQUE, damit derselbe Code nie
  // zweimal vergeben werden kann.
  await indexStep(`Index ${INVITES}.uq_code_hash`, {
    tableId: INVITES, key: 'uq_code_hash', type: TablesDBIndexType.Unique, columns: ['codeHash'],
  })
  // Die Betreiber-Sicht („wen haben wir eingeladen?") UND der GDPR-Pfad: die
  // Löschung anonymisiert Einladungen über die ADRESSE, nicht über eine
  // userId — ein nie eingelöster Code kennt keinen Nutzer.
  await indexStep(`Index ${INVITES}.idx_email`, {
    tableId: INVITES, key: 'idx_email', type: TablesDBIndexType.Key, columns: ['emailLower'],
  })
}

console.log('✔ Migration brand-005 fertig')
