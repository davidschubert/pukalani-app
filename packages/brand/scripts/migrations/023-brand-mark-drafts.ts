/**
 * Migration brand-023: DIE KI-ENTWÜRFE DES ZEICHENS — Tabelle
 * `brand_mark_drafts` und Bucket `brand-drafts` (docs/archiv/BRAND-DESIGN.md
 * §2.5 Stufe 3 / §2.11, Paket D5c; Davids Freigabe im DECISION-LOG
 * 2026-09-08).
 *
 * NUMMER: 023 war seit brand-024 (Vorbilder) für genau diese Fläche
 * RESERVIERT — die Lücke war Absicht und wird hier geschlossen. Die
 * Reihenfolge der Dateinamen ist damit nicht die Reihenfolge der Entstehung,
 * und das ist in Ordnung: es gibt kein Migrations-Register in der Datenbank
 * (CLAUDE.md), die Idempotenz kommt vom 409, und jede dieser drei Migrationen
 * ist unabhängig von den anderen.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── DIE ZEILEN-ID IST DIE DATEI-ID ────────────────────────────────────────
 * Wörtlich dasselbe Muster wie bei den Vorbildern (brand-024) und aus
 * demselben Grund: ein Entwurf IST genau ein Bild; die Zeile beschreibt es.
 * Es gibt deshalb KEINE `fileId`-Spalte — sie wäre eine zweite Wahrheit über
 * dieselbe Sache und die erste, die nach einem abgebrochenen Lauf danebensteht.
 * Löschen ist ein `deleteRow` + `deleteFile` auf dieselbe Id, Ausliefern ein
 * `getFileView` ohne Nachschlagen. Und keine `createdAt`-Spalte: Appwrite führt
 * `$createdAt` an jeder Zeile, und §2.5 meint diesen Zeitpunkt.
 *
 * ── DIE HERKUNFT IST DIE LEITPLANKE, ALSO STEHT SIE IN DER ZEILE ──────────
 * `model` und `promptHash` sind keine Diagnose-Felder, sondern Produkt: §1.11 b
 * verlangt, dass jeder Entwurf seine Herkunft trägt („Modell · Datum ·
 * Prompt-Hash"). Stünden sie nur im Ereignis-Funnel, wäre die Herkunfts-Zeile
 * einer Karte eine Rekonstruktion über Zeitstempel — und beim ersten
 * Sweep (`brandEventsSweep`) wäre sie weg. Der HASH und nicht der Prompt: der
 * Prompt trägt Foundation-Inhalte, und die haben in einer Zeile nichts zu
 * suchen, die nur sagen soll, dass zwei Entwürfe aus demselben Lauf stammen.
 *
 * ── `kept` IST DIE EINZIGE ENTSCHEIDUNG DES MENSCHEN ──────────────────────
 * Boolean mit Default `false`: erzeugt heisst nicht behalten. Die behaltenen
 * Ids stehen zusätzlich im Slot-Wert `j.drafts` — der Slot ist die ANZEIGE,
 * die Spalte ist die Wahrheit (dieselbe Arbeitsteilung wie bei den Vorbildern).
 *
 * ── EIN INDEX, EIN LESEPFAD ───────────────────────────────────────────────
 * Gelesen wird immer „alle Entwürfe DIESER Marke" (wenige Zeilen), sortiert
 * wird danach im Code. Ein zweiter Index auf `kept` wäre ein Versprechen auf
 * eine Abfrage, die es nicht gibt — und Indizes sind hier die teuerste Zeile
 * (Cache-Falle aus CLAUDE.md; deshalb ausschliesslich `indexStep`).
 *
 * ── DER BUCKET IST SERVER-ONLY, UND DAS IST DER KERN VON §2.13 ────────────
 * `permissions: []` + `fileSecurity: false` heisst: es gibt KEINEN Weg an der
 * Route vorbei. Ein Entwurf ist ein unfertiger Vorschlag für EINE Marke;
 * ausgeliefert wird er ausschliesslich über `GET …/mark/drafts/:id/image` mit
 * Besitzprüfung und `Cache-Control: private, no-store`. Der 409-Zweig zieht
 * einen BESTEHENDEN Bucket auf denselben Stand nach — Lehre aus system-032/037:
 * `createBucket` überspringt bei 409, die Permissions heilt das nie.
 *
 * 2 MB je Datei (nicht 5 wie bei den Vorbildern): ein Vorbild ist ein
 * hochgeladener Screenshot, ein Entwurf ist eine Modell-Ausgabe von 1024 px
 * Kante. Die Zahl ist dieselbe wie `AI_IMAGE_MAX_BYTES` im Core-Transport —
 * läge sie hier tiefer, käme ein Bild durch die Klemmung und würde vom
 * Speicher abgewiesen.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne Tabelle und Bucket antwortet jeder Lauf mit 503.
 */
import { Client, Query, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const DRAFTS = 'brand_mark_drafts'
const BUCKET = 'brand-drafts'

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

console.log(`Migration brand-023 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1 · Die Zeilen ──────────────────────────────────────────────────────────
await step(`Table ${DRAFTS}`, () => tablesDB.createTable({
  databaseId, tableId: DRAFTS, name: 'Brand Mark Drafts', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(DRAFTS)

  // Die Marke. Der EINE Lesepfad hängt daran (s. Kopf).
  await columnStep(`Column ${DRAFTS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: DRAFTS, key: 'profileId', size: 64, required: true,
  }))
  // Die Modell-Kennung OHNE Schlüssel — sie steht auf der Karte (s. Kopf).
  // 64 statt der heute längsten Kennung (`google/gemini-2.5-flash-image-preview`,
  // 36): die Spalte ist der Rahmen, nicht die Regel.
  await columnStep(`Column ${DRAFTS}.model`, 'model', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: DRAFTS, key: 'model', size: 64, required: false, xdefault: '',
  }))
  // Der Prompt-HASH, nie der Prompt (s. Kopf). 16 Zeichen sind die Länge, die
  // die Karte zeigt und die zwei Läufe sicher unterscheidet.
  await columnStep(`Column ${DRAFTS}.promptHash`, 'promptHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: DRAFTS, key: 'promptHash', size: 16, required: false, xdefault: '',
  }))
  // Die EINE Entscheidung des Menschen. Default `false` — erzeugt ist nicht
  // behalten.
  await columnStep(`Column ${DRAFTS}.kept`, 'kept', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: DRAFTS, key: 'kept', required: false, xdefault: false,
  }))
  // Der Name auf der Karte („Entwurf 3") — ANZEIGE, vom Menschen änderbar.
  await columnStep(`Column ${DRAFTS}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: DRAFTS, key: 'title', size: 120, required: false, xdefault: '',
  }))

  await waitForColumns(DRAFTS)

  await indexStep(`Index ${DRAFTS}.idx_profile`, {
    tableId: DRAFTS,
    key: 'idx_profile',
    type: TablesDBIndexType.Key,
    columns: ['profileId'],
  })
}

// ── 2 · Der Bucket ──────────────────────────────────────────────────────────
/**
 * `permissions: []` UND `fileSecurity: false` — s. Kopf. Der 409-Zweig zieht
 * einen BESTEHENDEN Bucket auf denselben Stand nach (Lehre aus system-032).
 */
const bucketSettings = {
  name: 'brand-drafts',
  permissions: [],
  fileSecurity: false,
  maximumFileSize: 2_000_000,
  allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp'],
  encryption: true,
  antivirus: true,
}
try {
  await storage.createBucket({ bucketId: BUCKET, ...bucketSettings })
  console.log(`✔ Bucket '${BUCKET}'`)
}
catch (error) {
  if (!hasCode(error, 409)) throw error
  await storage.updateBucket({ bucketId: BUCKET, enabled: true, ...bucketSettings })
  console.log(`↷ Bucket '${BUCKET}' (existierte — Einstellungen nachgezogen)`)
}

console.log('✔ Migration brand-023 fertig')
