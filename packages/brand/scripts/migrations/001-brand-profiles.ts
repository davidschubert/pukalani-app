/**
 * Migration brand-001: `brand_profiles` — der KOPF eines Brandings
 * (docs/archiv/BRAND-WIZARD-SCHEMA.md §1).
 *
 * ── DIE REGELN, DIE FÜR ALLE SIEBEN brand_*-TABELLEN GELTEN ───────────────
 * (Schema-Anhang „Gemeinsame Regeln" — hier EINMAL ausgeschrieben, die
 * Migrationen 002–007 verweisen darauf.)
 *
 * 1. **SERVER-ONLY.** `permissions: []` UND `rowSecurity: false`. Der Browser
 *    spricht ausschliesslich `/api/brand/**`, jede Route hinter
 *    `requireBrandAccess` (server/utils/brandAccess.ts). `rowSecurity: false`
 *    ist dabei die SCHÄRFERE Wahl und kein Versehen: mit `true` wären
 *    Row-Permissions wirksam, und eine versehentlich gesetzte
 *    `read(user:<id>)`-Zeile wäre ein Weg AM Gate VORBEI — etwa nach einem
 *    Beta-Widerruf. Ohne Zeilen-Sicherheit gibt es diesen Pfad gar nicht.
 *    Muster: control-032 (customer_feedback), comments-012 (embed_sites).
 * 2. **Kein `communityId`.** `brand` ist ein SILO-Layer und läuft auf
 *    `branding` (Single-Tenant; bis 2026-08-31 `portfolio`). Die
 *    Pool-Datentür (`tenantDb`) gilt hier
 *    nicht; die Zugehörigkeit einer Zeile trägt `ownerType`/`ownerId`.
 * 3. **Indizes NUR über die Fabrik** `createIndexSteps` (F19). Rohes
 *    `createIndex` verbietet ESLint.
 * 4. **Idempotent** (409 → skip), Spalten zusätzlich über die gelesene
 *    Spaltenliste vorab geprüft.
 * 5. **`required` folgt der Spalte „Pflicht" des Anhangs — mit EINER
 *    Ausnahme, die Appwrite erzwingt:** ein Default und `required: true`
 *    schliessen sich aus („Cannot be set when column is required"). Wo der
 *    Anhang selbst einen Default nennt (`subBrands` = 'unknown'), ist
 *    `required: false` + `xdefault` die einzige treue Übersetzung von
 *    „trägt immer einen Wert" — nicht eine Aufweichung der Pflicht.
 * 6. **Grosse Texte als MEDIUMTEXT** (`storyBody`): varchar ist bei 16.381
 *    Zeichen zu Ende und belastet das ~65-KB-Zeilenbudget von MariaDB voll
 *    (pages-002). MEDIUMTEXT liegt off-row. Die LÄNGEN-Grenze ist trotzdem
 *    zugesagt, sie steht aber im Zod-Schema der Route (storyBody ≤ 100k),
 *    nicht in der Spalte.
 *
 * ── WAS HIER BEWUSST FEHLT ────────────────────────────────────────────────
 * Kein `visibility`-Feld (Audit 5/6): „geteilt" ist keine Eigenschaft des
 * Profils, sondern die ABGELEITETE Frage `hasActiveShare` an `brand_shares`
 * (Row ohne `revokedAt`, `expiresAt` in der Zukunft). Zwei Wahrheiten über
 * denselben Zustand wären die teurere Bauart.
 *
 * `progressPct`/`currentStepKey` sind ausdrücklich DENORM-Cache für die
 * Brandings-Karten — die Autorität bleibt `brand_steps.slots`.
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

console.log(`Migration brand-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${PROFILES}`, () => tablesDB.createTable({
  databaseId, tableId: PROFILES, name: 'Brand Profiles', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(PROFILES)

  // Der ANLEGER bleibt auch nach einer Übertragung stehen (Schema §1) — er ist
  // Herkunft, nicht Recht; wer darf, sagt ownerType/ownerId.
  await columnStep(`Column ${PROFILES}.createdByUserId`, 'createdByUserId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'createdByUserId', size: 64, required: true,
  }))
  // 'community' steht schon im Vorrat, ist in Phase 1 aber nicht aktiv: die
  // Weiche später zu öffnen ist eine Code-Entscheidung, keine Migration.
  await columnStep(`Column ${PROFILES}.ownerType`, 'ownerType', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: PROFILES, key: 'ownerType', elements: ['user', 'community'], required: true,
  }))
  await columnStep(`Column ${PROFILES}.ownerId`, 'ownerId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'ownerId', size: 64, required: true,
  }))
  // '' ist ausdrücklich erlaubt: „Neue Marke" darf namenlos starten.
  await columnStep(`Column ${PROFILES}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'title', size: 256, required: false, xdefault: '',
  }))
  // Bei der Anlage FIXIERT (Plan §6) — deshalb Pflicht und ohne Default.
  await columnStep(`Column ${PROFILES}.contentLocale`, 'contentLocale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'contentLocale', size: 8, required: true,
  }))
  await columnStep(`Column ${PROFILES}.pathKind`, 'pathKind', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: PROFILES, key: 'pathKind', elements: ['new', 'relaunch'], required: true,
  }))
  // Nur im Relaunch-Zweig belegt. KEIN xdefault: '' steht nicht im Vorrat, und
  // ein erfundener Vorgabewert („refine") wäre eine Aussage über einen Pfad,
  // den der Nutzer nie gewählt hat.
  await columnStep(`Column ${PROFILES}.relaunchScope`, 'relaunchScope', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: PROFILES, key: 'relaunchScope', elements: ['refine', 'recut'], required: false,
  }))
  await columnStep(`Column ${PROFILES}.hasName`, 'hasName', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: PROFILES, key: 'hasName', required: true,
  }))
  await columnStep(`Column ${PROFILES}.team`, 'team', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: PROFILES, key: 'team', elements: ['solo', 'team'], required: true,
  }))
  // DREI Werte statt eines nullable Boolean: 'unknown' ist ein echter Zustand
  // (bis Ende Baustein B ist die Frage nicht gestellt), und ein leerer String
  // wäre in einem USelectItem verboten (Schema §1).
  await columnStep(`Column ${PROFILES}.subBrands`, 'subBrands', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: PROFILES, key: 'subBrands', elements: ['unknown', 'yes', 'no'], required: false, xdefault: 'unknown',
  }))
  // DENORM-Cache für die Karten (0–100). Autorität sind die Slots.
  await columnStep(`Column ${PROFILES}.progressPct`, 'progressPct', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: PROFILES, key: 'progressPct', required: true, min: 0, max: 100,
  }))
  await columnStep(`Column ${PROFILES}.currentStepKey`, 'currentStepKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'currentStepKey', size: 32, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PROFILES}.lastActivityAt`, 'lastActivityAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PROFILES, key: 'lastActivityAt', required: true,
  }))
  // MEDIUMTEXT (Regel 6 im Kopf). MariaDB erlaubt auf TEXT-Spalten keinen
  // Default — der Leser behandelt fehlend wie leer.
  await columnStep(`Column ${PROFILES}.storyBody`, 'storyBody', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PROFILES, key: 'storyBody', required: false,
  }))
  // { inputHash, generatedAt, editedByUser } — die Story ist VERALTET, wenn
  // inputHash nicht mehr zum Slot-Stand passt. Abgeleitet, kein Flag.
  await columnStep(`Column ${PROFILES}.storyMeta`, 'storyMeta', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'storyMeta', size: 2048, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PROFILES}.designPresetId`, 'designPresetId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'designPresetId', size: 64, required: false, xdefault: '',
  }))
  // Friert die Vorschau-Fassung ein: ein neu veröffentlichtes Preset darf ein
  // bestehendes Branding nicht rückwirkend umfärben.
  await columnStep(`Column ${PROFILES}.designPresetVersion`, 'designPresetVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'designPresetVersion', size: 32, required: false, xdefault: '',
  }))

  await waitForColumns(PROFILES)

  // „Meine Brandings" — die eine Listen-Abfrage der Übersicht.
  await indexStep(`Index ${PROFILES}.idx_owner`, {
    tableId: PROFILES, key: 'idx_owner', type: TablesDBIndexType.Key, columns: ['ownerType', 'ownerId'],
  })
  // GDPR-Export/Löschung fragt über den ANLEGER — auch wenn das Branding
  // inzwischen jemand anderem gehört.
  await indexStep(`Index ${PROFILES}.idx_creator`, {
    tableId: PROFILES, key: 'idx_creator', type: TablesDBIndexType.Key, columns: ['createdByUserId'],
  })
}

console.log('✔ Migration brand-001 fertig')
