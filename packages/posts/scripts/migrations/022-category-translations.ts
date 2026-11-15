/**
 * posts-022 — KATEGORIE-NAMEN JE SPRACHE (Davids Entscheidung 2026-08-17).
 *
 * EINE additive Spalte auf `post_categories`, nichts Zerstörerisches,
 * idempotent (409 → skip):
 *
 *  - `translations` (String 4000) — JSON `{"en":{"name":"…","description":"…"}}`.
 *    `''` = nichts übersetzt, dann gilt überall die Grundfassung aus
 *    `name`/`description`. Bestand verhält sich damit exakt wie vorher.
 *
 * ── WARUM EINE JSON-SPALTE UND NICHT `nameEn`/`nameDe` ────────────────────
 * Weil eine neue App-Sprache sonst eine MIGRATION je Sprache und Feld kostet
 * (und zwar auf jeder Instanz). Die Sprachen der App stehen in der i18n-Config,
 * nicht im Schema — das Schema soll ihnen nicht hinterherlaufen. Gelesen wird
 * die Spalte ausschließlich über `shared/categoryI18n.ts` (pur, getestet,
 * fail-soft: unlesbares JSON heißt „nichts übersetzt", nie ein Fehler).
 *
 * ── WARUM 4000 UND NICHT MEDIUMTEXT ───────────────────────────────────────
 * Zwei Sprachen kosten rund 1200 Zeichen (2 × 80 Name + 2 × 500 Beschreibung
 * plus JSON-Gerüst). 4000 lässt Luft für zwei weitere Sprachen und bleibt weit
 * unter dem Zeilenbudget von MariaDB (utf8mb4, ~65 KB je Zeile) — `translations`
 * liegt damit IN der Zeile und kostet keinen zweiten Lesezugriff, anders als
 * ein MEDIUMTEXT.
 *
 * ── KEIN INDEX, UND DAS IST KEINE NACHLÄSSIGKEIT ──────────────────────────
 * Über diese Spalte wird nie GESUCHT und nie SORTIERT: die Kategorien einer
 * Community sind eine Handvoll Zeilen, die ohnehin vollständig geladen werden,
 * und die Suche in der Verwaltung läuft im Browser über die schon geladene
 * Liste. Ein Index wäre Schreiblast ohne Leser.
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

const CATEGORIES_TABLE = 'post_categories'

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
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration posts-022 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const categoryCols = await existingColumnKeys(CATEGORIES_TABLE)

await columnStep(`Column ${CATEGORIES_TABLE}.translations`, 'translations', categoryCols, () => tablesDB.createStringColumn({
  databaseId, tableId: CATEGORIES_TABLE, key: 'translations', size: 4000, required: false, xdefault: '',
}))
await waitForColumns(CATEGORIES_TABLE)

console.log('✔ Migration posts-022 fertig')
console.log('  Neu: post_categories.translations (JSON je Sprache, "" = nichts übersetzt)')
console.log('  Die ADRESSE (/discussions/<slug>) bleibt bewusst einsprachig — Begründung in shared/categoryI18n.ts')
