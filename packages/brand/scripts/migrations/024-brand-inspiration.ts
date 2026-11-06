/**
 * Migration brand-024: DIE VORBILDER — Tabelle `brand_inspiration` und Bucket
 * `brand-inspiration` (docs/archiv/BRAND-DESIGN.md §2.2 Schritt 2 / §2.11,
 * Paket D2a).
 *
 * NUMMER: 022 (`brand-design-unlock`) war der letzte Stand in diesem
 * Arbeitsbaum und auf `origin/main` (2026-09-08 geprüft). **023 ist RESERVIERT**
 * für die KI-Entwürfe des Zeichens (§2.18 „Stand D0" Punkt 2: Freischaltung =
 * 022, KI-Entwürfe = 023, Vorbilder = **024**) — die Lücke ist Absicht und
 * kein Versehen; sie zu schliessen hiesse, D5c die Nummer zu nehmen, die im
 * Konzept schon steht. Wer nach dieser hier eine anlegt, sieht zuerst nach
 * (`git fetch origin && git ls-tree --name-only origin/main
 * packages/brand/scripts/migrations/`).
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── DIE ZEILEN-ID IST DIE DATEI-ID ────────────────────────────────────────
 * Ein Vorbild ist GENAU EINE Datei; die Zeile beschreibt sie. Beide tragen
 * deshalb dieselbe Id, und es gibt KEINE `fileId`-Spalte — sie wäre eine
 * zweite Wahrheit über dieselbe Sache und die erste, die nach einem
 * abgebrochenen Upload danebensteht. Dasselbe Muster wie bei
 * `brand_publications` (brand-020: „Eine `profileId`-SPALTE gibt es deshalb
 * bewusst nicht") und beim Community-Favicon (CLAUDE.md: „die WAHRHEIT ist die
 * DATEI selbst"). Aus dem Löschen wird damit ein `deleteRow` + `deleteFile` auf
 * dieselbe Id, aus dem Ausliefern ein `getFileView` ohne Nachschlagen.
 *
 * Aus demselben Grund gibt es keine `createdAt`-Spalte: Appwrite führt
 * `$createdAt` an jeder Zeile, und §2.11 meint diesen Zeitpunkt, nicht einen
 * zweiten daneben.
 *
 * ── DIE BEREICHS-SPALTE IST EIN VARCHAR, KEIN ENUM ────────────────────────
 * Die erlaubten Werte stehen im Code (`BRAND_INSPIRATION_AREAS` in
 * `shared/brandDesignVocab.ts`, geprüft in der Upload-Route) — dieselbe
 * Entscheidung wie bei brand-017/019/020 und aus demselben Grund: ein
 * Vokabular, das wächst, wäre sonst je Begriff eine Migration, und die
 * DATENBANK ist hier nicht die Stelle, an der ein unbekannter Bereich auffällt
 * (die Route weist ihn mit 400 ab, bevor eine Zeile entsteht).
 *
 * ── `filename` STEHT DA, WEIL DIE KARTE IHN ZEIGT ─────────────────────────
 * Appwrite kennt den Namen auch selbst — aber nur über `getFile` je Datei. Die
 * Werkstatt zeigt zwölf Karten mit „roesterei-startseite.png" darunter; ohne
 * diese Spalte wären das zwölf zusätzliche Abrufe für eine reine Anzeige-Hilfe.
 * Er ist ANZEIGE und nie ein Pfad: ausgeliefert wird über die Zeilen-Id.
 *
 * ── `reading` IST FÜR D2b, UND ZWAR JETZT ─────────────────────────────────
 * Die Lesung (`g.reading`, Vision-Modell) hängt an EINEM Bild und wird dort
 * gespeichert, wo das Bild steht. Die Spalte entsteht hier mit, damit D2b eine
 * reine Code-Änderung ist: eine Migration mitten in einem Paket wäre ein
 * zweiter Prod-Termin für dieselbe Fläche. MEDIUMTEXT (off-row, kein
 * Zeilenbudget) ⇒ Appwrite lässt dafür KEINEN Default zu — dieselbe Falle wie
 * bei `brand_checks.criteria` und `posts.body`.
 *
 * ── EIN INDEX, EIN LESEPFAD ───────────────────────────────────────────────
 * Gelesen wird immer „alle Vorbilder DIESER Marke" (≤ 12 Zeilen), sortiert
 * wird danach im Code. Ein zweiter Index auf `number` wäre ein Versprechen auf
 * eine Abfrage, die es nicht gibt — und Indizes sind hier die teuerste Zeile
 * (Cache-Falle aus CLAUDE.md; deshalb ausschliesslich `indexStep`).
 *
 * ── DER BUCKET IST SERVER-ONLY, UND DAS IST DER KERN VON §2.13 ────────────
 * `permissions: []` + `fileSecurity: false` heisst: es gibt KEINEN Weg an der
 * Route vorbei. Vorbilder sind Fremdwerke; ausgeliefert werden sie
 * ausschliesslich über `GET …/inspiration/:id/image` mit Besitzprüfung und
 * `Cache-Control: private, no-store`. Der 409-Zweig zieht einen BESTEHENDEN
 * Bucket auf denselben Stand nach — Lehre aus system-032/037: `createBucket`
 * überspringt bei 409, die Permissions heilt das nie.
 *
 * `allowedFileExtensions` ist die zweite Sicherung neben den Magic-Bytes der
 * Route (`detectBrandInspirationImage`), nicht ihr Ersatz: eine Endung ist
 * Client-Eingabe, der Inhalt ist es nicht.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne Tabelle und Bucket antwortet jeder Upload mit 503.
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

const INSPIRATION = 'brand_inspiration'
const BUCKET = 'brand-inspiration'

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

console.log(`Migration brand-024 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1 · Die Zeilen ──────────────────────────────────────────────────────────
await step(`Table ${INSPIRATION}`, () => tablesDB.createTable({
  databaseId, tableId: INSPIRATION, name: 'Brand Inspiration', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(INSPIRATION)

  // Die Marke. Der EINE Lesepfad hängt daran (s. Kopf).
  await columnStep(`Column ${INSPIRATION}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INSPIRATION, key: 'profileId', size: 64, required: true,
  }))
  // Der Bereich — eine Id aus `BRAND_INSPIRATION_AREAS` (s. Kopf: kein Enum).
  // 24 statt der heute längsten Id (`composition`, 11): die Spalte ist der
  // Rahmen, nicht die Regel.
  await columnStep(`Column ${INSPIRATION}.area`, 'area', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INSPIRATION, key: 'area', size: 24, required: true,
  }))
  // Der Satz des Kunden, warum es ihm gefällt. Optional — er ist es auch im UI.
  await columnStep(`Column ${INSPIRATION}.note`, 'note', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INSPIRATION, key: 'note', size: 240, required: false, xdefault: '',
  }))
  // „Vorbild 3" — die Nummer, auf die die Lesung zeigt. Sie zählt vom höchsten
  // vergebenen Wert weiter und ist deshalb NICHT die Anzahl (s.
  // `nextBrandInspirationNumber`); der Deckel liegt bewusst über den zwölf.
  await columnStep(`Column ${INSPIRATION}.number`, 'number', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: INSPIRATION, key: 'number', required: false, min: 1, max: 9999, xdefault: 1,
  }))
  // Der Dateiname als ANZEIGE-Hilfe (s. Kopf) — nie ein Pfad.
  await columnStep(`Column ${INSPIRATION}.filename`, 'filename', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: INSPIRATION, key: 'filename', size: 200, required: false, xdefault: '',
  }))
  // Die Lesung des Vision-Modells (D2b). MEDIUMTEXT ⇒ kein Default (s. Kopf).
  await columnStep(`Column ${INSPIRATION}.reading`, 'reading', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: INSPIRATION, key: 'reading', required: false,
  }))

  await waitForColumns(INSPIRATION)

  await indexStep(`Index ${INSPIRATION}.idx_profile`, {
    tableId: INSPIRATION,
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
  name: 'brand-inspiration',
  permissions: [],
  fileSecurity: false,
  maximumFileSize: 5_000_000,
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

console.log('✔ Migration brand-024 fertig')
