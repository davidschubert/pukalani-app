/**
 * posts-023 — ÜBERSETZTE BEITRÄGE (Davids Entscheidungen 2026-08-17: Beiträge
 * + Kommentare, ein Knopf je Inhalt, Produkt-Gate ist das Inhalts-Produkt).
 *
 * EINE additive Spalte auf `community_posts`, nichts Zerstörerisches,
 * idempotent (409 → skip):
 *
 *  - `translations` (MEDIUMTEXT) — JSON `{"en":{"title":"…","body":"…"}}`.
 *    `''` = nichts übersetzt, dann gilt überall die Grundfassung aus
 *    `title`/`body`. Bestand verhält sich damit exakt wie vorher.
 *
 * ── WARUM MEDIUMTEXT UND NICHT VARCHAR(4000) WIE BEI posts-022 ────────────
 * Dort standen Kategorie-Namen drin (80 + 500 Zeichen je Sprache, rund 1200
 * gesamt) — VARCHAR war die richtige Wahl, weil die Spalte damit IN der Zeile
 * liegt und keinen zweiten Lesezugriff kostet. Hier steht der TEXT drin: ein
 * Beitrag darf 10.000 Zeichen tragen, sechs Sprachen sind bis zu 60.000 — mal
 * vier Byte (utf8mb4) weit jenseits des MariaDB-Zeilenbudgets von ~65 KB, das
 * ein VARCHAR voll belastet. MEDIUMTEXT liegt off-row, nur ein Zeiger zählt
 * (dieselbe Rechnung wie bei `pages.body`, Migration pages-002).
 *
 * ── KEIN INDEX, UND DAS IST KEINE NACHLÄSSIGKEIT ──────────────────────────
 * Über diese Spalte wird nie GESUCHT und nie SORTIERT: sie wird ausschließlich
 * über die Row-Id gelesen (die Zeile ist ohnehin geladen) und über die Row-Id
 * geschrieben. Ein Index wäre Schreiblast ohne Leser — und auf einem
 * MEDIUMTEXT ohnehin nur mit Präfix-Länge zu haben.
 *
 * ── DIE MIGRATION MUSS VOR DEM CODE-DEPLOY LAUFEN ─────────────────────────
 * Nicht nur wegen der Übersetzungs-Route: `PATCH /api/posts/:id` LEERT die
 * Spalte bei jeder echten Inhalts-Änderung (eine Übersetzung des alten Textes
 * wäre eine stille Lüge). Fehlt die Spalte, scheitert damit das BEARBEITEN
 * eines Beitrags mit 400 `row_invalid_structure` — also der Normalfall, nicht
 * die neue Funktion.
 *
 * Aufruf: pnpm migrate --app <app> --layer posts
 * ZIEL-INSTANZEN: jede Instanz, deren App den posts-Layer trägt — heute
 * `platform` (Pool) und `comments`. NICHT `control` (kein posts-Layer).
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

const POSTS_TABLE = 'community_posts'

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

console.log(`Migration posts-023 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const postCols = await existingColumnKeys(POSTS_TABLE)

await columnStep(
  `Column ${POSTS_TABLE}.translations`,
  'translations',
  postCols,
  () => createTranslationsColumn(POSTS_TABLE),
)
await waitForColumns(POSTS_TABLE)

console.log('✔ Migration posts-023 fertig')
console.log('  Neu: community_posts.translations (JSON je Sprache, "" = nichts übersetzt)')
console.log('  Der Inhalt ist ein CACHE — jede echte Inhalts-Änderung leert ihn (siehe [id].patch.ts)')
