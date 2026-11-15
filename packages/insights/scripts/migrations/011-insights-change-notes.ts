/**
 * Migration insights-011: DIE ÄNDERUNGSHINWEISE UNTER EINEM ARTIKEL.
 *
 * Gemeinsame Regeln wie insights-001…010 (server-only `permissions: []` /
 * `rowSecurity: false`, kein `communityId`, idempotent: vorhandene Spalte
 * oder 409 ⇒ überspringen); sie läuft ausschliesslich auf der
 * `branding`-Instanz. Sie legt KEINE Tabelle an, sondern EINE Spalte an
 * `insights_posts`, und zerstört nichts.
 *
 * ── WOZU ────────────────────────────────────────────────────────────────
 * Unter einem geänderten Artikel steht klein, WAS geändert wurde und WANN
 * (Davids Entscheidung 2026-11-16). Die Redaktion entscheidet je Änderung, ob
 * ein Hinweis erscheint — eine korrigierte Zahl ja, ein Tippfehler nein. Die
 * Hinweise sind eine JSON-Liste `InsightsChangeNote[]` (`{ at, de, en }`,
 * höchstens 20 zu je 300 Zeichen je Sprache); das Datum `at` setzt der
 * Server, nie das Formular (`insightsStampChangeNotes`).
 *
 * ── WARUM MEDIUMTEXT (ZEILENBUDGET, MariaDB utf8mb4) ────────────────────
 * Zwanzig Hinweise mit zwei Texten zu 300 Zeichen und einem Datum sind
 * gerechnet gut 13.000 Zeichen JSON — als varchar wären das über 50.000 Byte
 * und damit weit über dem restlichen Budget der Zeile (`insights_posts` lag
 * nach insights-009 bei 7.748 von 16.381 Zeichen). MEDIUMTEXT liegt off-row
 * und kostet in der Zeile einen Zeiger — dieselbe Wahl und dieselbe
 * Begründung wie bei `sources`, `facts` und `brief`.
 *
 * Ohne Vorgabewert: eine Zeile von VOR dieser Spalte liest `null`, und
 * `toInsightsPost` macht daraus eine leere Liste.
 *
 * ── DIE SPALTE MUSS VOR DEM CODE STEHEN ────────────────────────────────
 * `fromInsightsPost` schreibt `changeNotes` bei JEDEM Speichern mit. Ein
 * Schreiben mit einer unbekannten Spalte lehnt Appwrite ab — läuft der neue
 * Code auf einer Instanz ohne diese Spalte, scheitert jedes Speichern, jeder
 * Zustandswechsel und jeder KI-Lauf an einem Beitrag. Reihenfolge deshalb:
 * erst diese Migration auf jeder Instanz, dann der Deploy.
 *
 * ── KEIN INDEX ─────────────────────────────────────────────────────────
 * Niemand fragt „welche Beiträge haben einen Hinweis?" — gelesen wird die
 * Liste nur zusammen mit ihrem Beitrag.
 *
 * Aufruf:
 *   pnpm migrate --app branding --layer insights
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'

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

const POSTS = 'insights_posts'

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

console.log(`Migration insights-011 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(POSTS)

  // JSON `InsightsChangeNote[]`. MEDIUMTEXT (s. Zeilenbudget im Kopf).
  await columnStep(`Column ${POSTS}.changeNotes`, 'changeNotes', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'changeNotes', required: false,
  }))
}

await waitForColumns(POSTS)

console.log('✅ Migration insights-011 fertig')
