/**
 * Migration brand-003: `brand_messages` — der Gesprächsverlauf
 * (docs/archiv/BRAND-WIZARD-SCHEMA.md §3). Gemeinsame Regeln aller
 * brand_*-Tabellen: Kopf von `001-brand-profiles.ts`.
 *
 * ── DER VERLAUF HÄNGT AM BAUSTEIN, NICHT AM BRANDING ──────────────────────
 * `stepKey` steht neben `profileId`, weil George je Kapitel ein eigenes
 * Gespräch führt: wer nach Wochen zurückkommt, soll den Faden DIESES
 * Bausteins vorfinden und nicht 400 Züge quer durch die Marke.
 *
 * ── SPEICHERN VOR DEM STREAM-ENDE (Plan §6) ───────────────────────────────
 * Das validierte Ergebnis UND die Nachricht sind geschrieben, BEVOR
 * `generation.completed` gestreamt wird. Sonst hätte ein Verbindungsabbruch
 * genau die Fassung verschluckt, die der Nutzer schon gelesen hat.
 *
 * ── RETENTION: DAUERHAFT (Davids Entscheidung) ────────────────────────────
 * Anders als `brand_events` (24 Monate) wird hier nichts weggeräumt: der
 * Wiedereinstieg mit Kontext IST das Produkt. Gelöscht wird nur über die
 * Profil-Kaskade (§7) und die GDPR-Löschung.
 *
 * ── PAGINATION ────────────────────────────────────────────────────────────
 * Cursor-basiert über `$id` (`Query.cursorAfter`), Default-limit 50 — nie
 * Offset: ein langer Verlauf wächst, während man ihn blättert.
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

const MESSAGES = 'brand_messages'

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

console.log(`Migration brand-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${MESSAGES}`, () => tablesDB.createTable({
  databaseId, tableId: MESSAGES, name: 'Brand Messages', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(MESSAGES)

  await columnStep(`Column ${MESSAGES}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'profileId', size: 64, required: true,
  }))
  await columnStep(`Column ${MESSAGES}.stepKey`, 'stepKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'stepKey', size: 32, required: true,
  }))
  // 'system' ist kein Anzeige-Zug, sondern der Protokoll-Eintrag (Weiche
  // gewechselt, Kapitel neu gestartet) — er gehört in denselben Faden.
  await columnStep(`Column ${MESSAGES}.role`, 'role', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: MESSAGES, key: 'role', elements: ['george', 'user', 'system'], required: true,
  }))
  // MEDIUMTEXT: Georges Züge sind lang, und ein Verlauf ist die Summe davon
  // (Zod ≤ 20k je Nachricht). Markdown wird beim RENDERN sanitisiert, nicht
  // beim Speichern — was ankam, bleibt nachlesbar.
  await columnStep(`Column ${MESSAGES}.body`, 'body', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: MESSAGES, key: 'body', required: true,
  }))
  // Strukturierte Message-Parts (Chips, Karten, Paar-Referenzen) — die
  // BEDIENUNG eines Zuges, getrennt vom Text.
  await columnStep(`Column ${MESSAGES}.parts`, 'parts', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'parts', size: 8192, required: false, xdefault: '',
  }))
  // Verknüpft einen George-Zug mit seinen Generations-Metadaten in
  // brand_steps.generations — Nutzer-Züge tragen hier ''.
  await columnStep(`Column ${MESSAGES}.generationId`, 'generationId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: MESSAGES, key: 'generationId', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(MESSAGES)

  // Der eine Lesepfad: der Faden EINES Bausteins. `$createdAt` steht bewusst
  // NICHT im Index — auf interne Attribute legt dieses Projekt nirgends
  // welche (system-021), Appwrite ordnet sie selbst.
  await indexStep(`Index ${MESSAGES}.idx_profile_step`, {
    tableId: MESSAGES, key: 'idx_profile_step', type: TablesDBIndexType.Key, columns: ['profileId', 'stepKey'],
  })
}

console.log('✔ Migration brand-003 fertig')
