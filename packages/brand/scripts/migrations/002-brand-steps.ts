/**
 * Migration brand-002: `brand_steps` — EINE Row je Profil × Baustein
 * (docs/plans/BRAND-WIZARD-SCHEMA.md §2). Die gemeinsamen Regeln aller
 * brand_*-Tabellen (server-only, kein communityId, Index-Fabrik, Pflicht-
 * Übersetzung, MEDIUMTEXT) stehen EINMAL im Kopf von `001-brand-profiles.ts`.
 *
 * stepKeys (Content-Spez): context · pvm · architecture · values · archetype ·
 * manifesto · verbal · naming · result. Sie stehen BEWUSST nicht als Enum in
 * der Spalte: der Katalog ist versioniert und wächst (Plan §3e „Registry- und
 * Daten-Migration"), und ein neuer Baustein soll eine Registry-Änderung sein,
 * keine Schema-Migration.
 *
 * ── ZWEI MEDIUMTEXT-SPALTEN, ZWEI VERSCHIEDENE DINGE ──────────────────────
 * `slots` ist der ARBEITSSTAND: je Slot `{ firstDraft, latestDraft, confirmed,
 * confidence, updatedAt }`. `firstDraft` NEBEN `latestDraft` ist kein Luxus,
 * sondern der Versions-Vertrag für BEIDE Übernahmequoten (Audit 2) — wie viel
 * von Georges ERSTEM Vorschlag überlebt, ist eine andere Frage als wie viel
 * vom LETZTEN.
 *
 * `generations` ist das PROTOKOLL der letzten ~10 Generierungen
 * (`{ generationId, schemaVersion, promptVersion, model, provider, locale,
 * inputHash, createdAt }` + `generationCount` gesamt) — Metadaten, NIE
 * Prompt- oder Inhaltstext (Log-Regel Plan §6).
 *
 * ── „VERALTET" IST ABGELEITET, KEIN FLAG ──────────────────────────────────
 * `inputHash` hält den Hash der Quell-Slot-Stände der LETZTEN Generierung.
 * Ob ein Kapitel veraltet ist, rechnet der Leser aus (Hash ≠ aktuell). Ein
 * gespeichertes Flag müsste an jeder schreibenden Stelle mitgepflegt werden
 * und wäre genau dort falsch, wo es niemand nachsieht.
 *
 * ── `revision` IST DIE NEBENLÄUFIGKEIT ────────────────────────────────────
 * Autosave sendet die GELESENE revision; ist sie veraltet, antwortet die
 * Route 409 und überschreibt NIE automatisch (Plan §3e „Autosave-Client-
 * Regel"). Die No-op-Regel gilt wie bei `bodyToSave`: Speichern ohne echte
 * Änderung schreibt nicht und erhöht keine revision — sonst meldete der
 * Wizard einen Konflikt, den niemand verursacht hat.
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

const STEPS = 'brand_steps'

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

console.log(`Migration brand-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${STEPS}`, () => tablesDB.createTable({
  databaseId, tableId: STEPS, name: 'Brand Steps', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(STEPS)

  await columnStep(`Column ${STEPS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: STEPS, key: 'profileId', size: 64, required: true,
  }))
  await columnStep(`Column ${STEPS}.stepKey`, 'stepKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: STEPS, key: 'stepKey', size: 32, required: true,
  }))
  // Sequenzielle Freischaltung (§3b.9) — der SERVER erzwingt die Übergänge,
  // nicht die UI.
  await columnStep(`Column ${STEPS}.state`, 'state', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: STEPS, key: 'state', elements: ['locked', 'open', 'active', 'done'], required: true,
  }))
  // MEDIUMTEXT: der Arbeitsstand aller Slots eines Bausteins (Zod ≤ 200k
  // gesamt, einzelner Slot-Text ≤ 20k — die Grenzen hält die Route).
  await columnStep(`Column ${STEPS}.slots`, 'slots', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: STEPS, key: 'slots', required: true,
  }))
  await columnStep(`Column ${STEPS}.generations`, 'generations', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: STEPS, key: 'generations', required: true,
  }))
  await columnStep(`Column ${STEPS}.inputHash`, 'inputHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: STEPS, key: 'inputHash', size: 128, required: false, xdefault: '',
  }))
  await columnStep(`Column ${STEPS}.revision`, 'revision', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: STEPS, key: 'revision', required: true, min: 0,
  }))
  // Die letzte Konfidenz-Weiche des Bausteins. Ohne Default: „noch nicht
  // gefragt" ist ein anderer Zustand als „passt".
  await columnStep(`Column ${STEPS}.confidence`, 'confidence', cols, () => tablesDB.createEnumColumn({
    databaseId, tableId: STEPS, key: 'confidence', elements: ['fits', 'almost', 'restart'], required: false,
  }))
  await columnStep(`Column ${STEPS}.startedAt`, 'startedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: STEPS, key: 'startedAt', required: false,
  }))
  await columnStep(`Column ${STEPS}.completedAt`, 'completedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: STEPS, key: 'completedAt', required: false,
  }))
  // GEMESSENE aktive Zeit — sie kalibriert die Zeitangaben der Bausteine
  // (§9b). Deshalb ein eigener Zähler und nicht completedAt − startedAt: eine
  // über Nacht offene Registerkarte ist keine Arbeitszeit.
  await columnStep(`Column ${STEPS}.activeSeconds`, 'activeSeconds', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: STEPS, key: 'activeSeconds', required: true, min: 0,
  }))

  await waitForColumns(STEPS)

  // EINE Row je Profil × Baustein — die Eindeutigkeit steht in der Datenbank,
  // nicht nur in der Route. Row-Id-frei und damit ohne Mandanten-Frage
  // (Pool-Unique-Regel greift im Silo ohnehin nicht).
  await indexStep(`Index ${STEPS}.uq_profile_step`, {
    tableId: STEPS, key: 'uq_profile_step', type: TablesDBIndexType.Unique, columns: ['profileId', 'stepKey'],
  })
  // „alle Bausteine dieses Brandings" — Fortschritt, Journey, Löschkaskade.
  await indexStep(`Index ${STEPS}.idx_profile`, {
    tableId: STEPS, key: 'idx_profile', type: TablesDBIndexType.Key, columns: ['profileId'],
  })
}

console.log('✔ Migration brand-002 fertig')
