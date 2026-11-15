/**
 * events-013 — ÜBERSETZTE TERMINE (Davids Entscheidung 2026-08-18: die
 * KI-Übersetzung gilt jetzt auch für Events und Kurse).
 *
 * EINE additive Spalte auf `events`, nichts Zerstörerisches, idempotent
 * (409 → skip):
 *
 *  - `translations` (MEDIUMTEXT) — JSON `{"de":{"title":"…","body":"…"}}`.
 *    `''` = nichts übersetzt, dann gilt überall die Grundfassung aus
 *    `title`/`description`. Bestand verhält sich damit exakt wie vorher.
 *
 * Der Feldname im JSON heißt `body`, nicht `description`: die Karte wird von
 * der GETEILTEN Regel gelesen (`core/shared/ugcTranslations.ts`), und die ist
 * für alle vier Inhaltsarten dieselbe (Beitrag, Kommentar, Termin, Lektion).
 * Ein eigener Feldname hier hieße, die Fassung vor jedem Lesen umzuschreiben.
 *
 * ── WARUM MEDIUMTEXT UND NICHT VARCHAR ────────────────────────────────────
 * `events.description` fasst 10.000 Zeichen (MAX_EVENT_DESCRIPTION); sechs
 * Sprachen sind bis zu 60.000 — mal vier Byte (utf8mb4) weit jenseits des
 * MariaDB-Zeilenbudgets von ~65 KB, das ein VARCHAR voll belastet. MEDIUMTEXT
 * liegt off-row, nur ein Zeiger zählt (dieselbe Rechnung wie bei `pages.body`,
 * Migration pages-002, und wie bei posts-023).
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Über die Spalte wird nie gesucht und nie sortiert; gelesen und geschrieben
 * wird sie ausschließlich über die Row-Id. Ein Index wäre Schreiblast ohne
 * Leser — auf einem MEDIUMTEXT ohnehin nur mit Präfix-Länge zu haben.
 *
 * ── DIE MIGRATION MUSS VOR DEM CODE-DEPLOY LAUFEN ─────────────────────────
 * ZWEI Schreibwege fassen die Spalte an, und beide gehören zum Normalbetrieb:
 * `PATCH /api/events/:id` leert sie, sobald Titel oder Beschreibung sich
 * wirklich ändern (eine Übersetzung des alten Textes wäre eine stille Lüge),
 * und `POST /api/events/:id/redact` leert sie MIT dem Text — eine geschwärzte
 * Beschreibung, die in der Übersetzung weiterlebt, wäre keine Schwärzung.
 * Fehlt die Spalte, scheitern beide mit 400 `row_invalid_structure`.
 *
 * Aufruf: pnpm migrate --app <app> --layer events
 * ZIEL-INSTANZEN: jede Instanz, deren App den events-Layer trägt — in
 * Produktion heute `platform` (Pool; die comments-Silo-Site ist seit F3
 * abgeschaltet). Lokal zusätzlich das Dev-Projekt der comments-App, die den
 * Layer als E2E-Anker weiterhin führt. NICHT `control` (kein events-Layer).
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

const EVENTS_TABLE = 'events'

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

console.log(`Migration events-013 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys(EVENTS_TABLE)

await columnStep(
  `Column ${EVENTS_TABLE}.translations`,
  'translations',
  eventCols,
  () => createTranslationsColumn(EVENTS_TABLE),
)
await waitForColumns(EVENTS_TABLE)

console.log('✔ Migration events-013 fertig')
console.log('  Neu: events.translations (JSON je Sprache, "" = nichts übersetzt)')
console.log('  Der Inhalt ist ein CACHE — Bearbeiten UND Schwärzen leeren ihn')
