/**
 * Migration brand-004: `brand_shares` — eingefrorene Veröffentlichungen
 * (docs/plans/BRAND-WIZARD-SCHEMA.md §4). Gemeinsame Regeln aller
 * brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── DER ROHE TOKEN STEHT NIRGENDS ─────────────────────────────────────────
 * Gespeichert wird nur `tokenHash` (sha256 eines ≥128-Bit-Tokens), M9-Muster
 * wie `workspace_invites`/`community_invites`. Der rohe Token existiert genau
 * einmal — im Link, den der Nutzer weitergibt. Er gehört auch nicht ins Log
 * (Routen-Härtung Plan §6: no-store, noindex, frame-ancestors 'none').
 *
 * ── DER SCHNAPPSCHUSS IST EINGEFROREN, NICHT VERKNÜPFT ────────────────────
 * `snapshot` trägt Brand Story + bestätigte Kapitel + presetId/presetVersion
 * als KOPIE. Nie Chats, nie Entwürfe, nie Metriken (Audit 3). Zwei Gründe:
 * ein geteilter Link darf sich nicht ändern, während jemand ihn liest — und
 * er darf nicht mehr zeigen als das, was bewusst veröffentlicht wurde.
 * Weiterarbeiten am Branding lässt den Link deshalb unberührt.
 *
 * ── ROTATION IST EINE NEUE ROW, KEIN UPDATE ───────────────────────────────
 * Einen Link „erneuern" heisst: neue Row anlegen, alte `revokedAt` stempeln.
 * So bleibt nachvollziehbar, welcher Stand wann draussen war; ein
 * überschriebener tokenHash hätte diese Geschichte gelöscht.
 *
 * `hasActiveShare` (die abgeleitete Sichtbarkeit eines Profils, s. brand-001)
 * = existiert Row mit leerem `revokedAt` UND `expiresAt` in der Zukunft.
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

const SHARES = 'brand_shares'

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

console.log(`Migration brand-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${SHARES}`, () => tablesDB.createTable({
  databaseId, tableId: SHARES, name: 'Brand Shares', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(SHARES)

  await columnStep(`Column ${SHARES}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SHARES, key: 'profileId', size: 64, required: true,
  }))
  // 128 Zeichen: sha256-hex braucht 64 — der Vorrat kostet nichts und macht
  // einen späteren Wechsel des Verfahrens migrationsfrei.
  await columnStep(`Column ${SHARES}.tokenHash`, 'tokenHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: SHARES, key: 'tokenHash', size: 128, required: true,
  }))
  // MEDIUMTEXT: der eingefrorene Stand (Zod ≤ 400k in der Route).
  await columnStep(`Column ${SHARES}.snapshot`, 'snapshot', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: SHARES, key: 'snapshot', required: true,
  }))
  await columnStep(`Column ${SHARES}.publishedAt`, 'publishedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: SHARES, key: 'publishedAt', required: true,
  }))
  // Standard +30 Tage. Pflicht und ohne Default: ein Link OHNE Ablauf wäre
  // ein Dauerzustand, den niemand mehr überblickt — die Frist muss die
  // schreibende Route ausdrücklich setzen.
  await columnStep(`Column ${SHARES}.expiresAt`, 'expiresAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: SHARES, key: 'expiresAt', required: true,
  }))
  await columnStep(`Column ${SHARES}.revokedAt`, 'revokedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: SHARES, key: 'revokedAt', required: false,
  }))

  await waitForColumns(SHARES)

  // Der EINZIGE Lesepfad der öffentlichen Route: Hash rein, Row raus. UNIQUE,
  // damit zwei Links nie denselben Schlüssel tragen können.
  await indexStep(`Index ${SHARES}.uq_token_hash`, {
    tableId: SHARES, key: 'uq_token_hash', type: TablesDBIndexType.Unique, columns: ['tokenHash'],
  })
  // Die Gegenrichtung: „welche Links hat dieses Branding?" — Anzeige,
  // Sammel-Widerruf bei Missbrauchssperre (Audit 6) und Löschkaskade.
  await indexStep(`Index ${SHARES}.idx_profile`, {
    tableId: SHARES, key: 'idx_profile', type: TablesDBIndexType.Key, columns: ['profileId'],
  })
}

console.log('✔ Migration brand-004 fertig')
