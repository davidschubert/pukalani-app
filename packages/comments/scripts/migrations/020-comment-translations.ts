/**
 * comments-020 — ÜBERSETZTE ANTWORTEN (Davids Entscheidungen 2026-08-17:
 * Beiträge + Kommentare, ein Knopf je Inhalt, Produkt-Gate ist das
 * Inhalts-Produkt).
 *
 * EINE additive Spalte auf `comments`, nichts Zerstörerisches, idempotent
 * (409 → skip):
 *
 *  - `translations` (MEDIUMTEXT) — JSON `{"en":{"body":"…"}}`. `''` = nichts
 *    übersetzt, dann gilt überall die Grundfassung aus `content`. Bestand
 *    verhält sich damit exakt wie vorher.
 *
 * Das Zwillingsstück zu posts-023, bis auf das eine Feld: ein Kommentar hat
 * keinen Titel. Der Schlüssel im JSON heißt trotzdem `body` und nicht
 * `content` — die Karte wird von der GETEILTEN Regel gelesen
 * (`core/shared/ugcTranslations.ts`), und die ist für beide Produkte dieselbe.
 * Ein eigener Feldname hier hieße, die Fassung vor jedem Lesen umzuschreiben.
 *
 * ── WARUM MEDIUMTEXT UND NICHT VARCHAR ────────────────────────────────────
 * Ein Kommentar darf 10.000 Zeichen tragen (Zod-Schema), sechs Sprachen sind
 * bis zu 60.000 — mal vier Byte (utf8mb4) weit jenseits des MariaDB-
 * Zeilenbudgets von ~65 KB, das ein VARCHAR voll belastet. MEDIUMTEXT liegt
 * off-row, nur ein Zeiger zählt (dieselbe Rechnung wie bei `pages.body`,
 * Migration pages-002). Anders als bei den Kategorie-Namen (posts-022,
 * VARCHAR 4000) ist die Menge hier unbeschränkt genug, dass das Budget kippt.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Über die Spalte wird nie gesucht und nie sortiert; gelesen und geschrieben
 * wird sie ausschließlich über die Row-Id. Ein Index wäre Schreiblast ohne
 * Leser.
 *
 * ── DIE MIGRATION MUSS VOR DEM CODE-DEPLOY LAUFEN ─────────────────────────
 * `PATCH /api/comments/:id` LEERT die Spalte, sobald sich der Text wirklich
 * ändert (eine Übersetzung des alten Textes wäre eine stille Lüge). Fehlt die
 * Spalte, scheitert damit das BEARBEITEN eines Kommentars mit 400
 * `row_invalid_structure` — also der Normalfall, nicht die neue Funktion.
 *
 * Aufruf: pnpm migrate --app <app> --layer comments
 * ZIEL-INSTANZEN: jede Instanz, deren App den comments-Layer trägt — heute
 * `platform` (Pool) und `comments`. NICHT `control` (kein comments-Layer).
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'

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

const COMMENTS_TABLE = 'comments'

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
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
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
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
/**
 * MEDIUMTEXT MIT DEFAULT, WENN DIE MASCHINE IHN LÄSST (pages-002-Muster):
 * manche MariaDB-Setups erlauben kein DEFAULT auf TEXT-Spalten. Ohne Default
 * tragen Bestandszeilen NULL statt '' — der Leser (`parseUgcTranslations`)
 * behandelt beides gleich als „nichts übersetzt", also kostet der Rückfall
 * nichts. Ein 409 reicht bewusst durch: die Idempotenz gehört `step`.
 */
async function createTranslationsColumn(tableId: string) {
  try {
    await tablesDB.createMediumtextColumn({
      databaseId: databaseId!, tableId, key: 'translations', required: false, xdefault: '',
    })
  }
  catch (error) {
    if (hasCode(error, 409)) throw error
    await tablesDB.createMediumtextColumn({
      databaseId: databaseId!, tableId, key: 'translations', required: false,
    })
  }
}

console.log(`Migration comments-020 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const commentCols = await existingColumnKeys(COMMENTS_TABLE)

await columnStep(
  `Column ${COMMENTS_TABLE}.translations`,
  'translations',
  commentCols,
  () => createTranslationsColumn(COMMENTS_TABLE),
)
await waitForColumns(COMMENTS_TABLE)

console.log('✔ Migration comments-020 fertig')
console.log('  Neu: comments.translations (JSON je Sprache, "" = nichts übersetzt)')
console.log('  Der Inhalt ist ein CACHE — jede echte Text-Änderung leert ihn (siehe [id].patch.ts)')
