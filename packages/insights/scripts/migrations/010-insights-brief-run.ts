/**
 * Migration insights-010: DER LAUF WIRD SICHTBAR (BI3).
 *
 * Plan docs/plans/BRAND-INSIGHTS-KURATION.md §15. Gemeinsame Regeln wie
 * insights-001…009 (server-only `permissions: []` / `rowSecurity: false`,
 * kein `communityId`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz. Sie legt KEINE Tabelle an, sondern zwei Spalten in
 * `insights_watchlist`.
 *
 * ── WARUM ES ZWEI SPALTEN BRAUCHT ───────────────────────────────────────
 * Seit K5 antwortet `briefPostId` auf „habe ich das schon verarbeitet?" —
 * aber nur mit JA oder NOCH NICHT. Seit BI3 läuft der bezahlte Lauf nach der
 * Antwort weiter (nginx gibt nach 60 s auf, ein 51-Minuten-Video braucht
 * 65 s), und damit gibt es zwei Zustände mehr, die die Zeile nicht sagen
 * kann: „läuft gerade" und „ist schiefgegangen".
 *
 *  · `briefRunAt` — WANN der laufende oder letzte Lauf gebucht wurde. Sie
 *    trägt BEIDE Fragen: frisch heisst „läuft", alt heisst „nicht
 *    zurückgekommen" (die Grenze rechnet `insightsBriefState`, Zahl in
 *    `shared/insightsWatchlist.ts`). Ein verwaister Lauf braucht deshalb
 *    niemanden, der ihn aufräumt — die Uhr tut es.
 *  · `briefError` — WARUM der letzte Lauf nichts geliefert hat, aus einem
 *    geschlossenen Satz von zwei Gründen, damit die Oberfläche ihn
 *    übersetzen kann.
 *
 * Eine dritte Spalte `briefState` gibt es BEWUSST nicht: sie wäre eine
 * zweite Wahrheit über dieselben zwei Werte, und ihren Übergang „läuft" →
 * „verschollen" müsste genau der zurückschreiben, der in diesem Fall nicht
 * mehr lebt.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ────────────────────────────────────
 * `insights_watchlist` lag nach insights-009 bei 1.168 Zeichen (Rechnung in
 * den Köpfen von insights-007 und -009). `briefError` 32 macht 1.200;
 * `briefRunAt` ist ein DATETIME und zählt nicht in dieses Budget. Weit unter
 * 16.381.
 *
 * ── KEIN INDEX, UND DAS IST GERECHNET ──────────────────────────────────
 * Nahe lag `idx_brief_run` („welche Läufe sind offen?"). Er fehlt, weil die
 * Frage nur die EINE Seite stellt, die ohnehin ALLE Zeilen holt (der Deckel
 * der Liste ist 200, sie lädt sie vollständig und rechnet den Zustand im
 * Browser). Ein Index, den niemand als Filter benutzt, kostet bei jedem
 * Schreibvorgang des täglichen Laufs.
 *
 * ── SIE LÄUFT VOR DEM MERGE ────────────────────────────────────────────
 * Wie insights-009 und aus demselben Grund: `fromInsightsWatchItem` schickt
 * JEDE Spalte bei JEDEM Schreibvorgang mit. Ohne die beiden Spalten bricht
 * ein Deploy nicht nur den neuen Weg, sondern jedes Urteil, jede Notiz und
 * jeden täglichen Lauf an dieser Tabelle.
 *
 * Aufruf:
 *   pnpm migrate --app branding --layer insights
 */
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

const WATCH = 'insights_watchlist'

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

console.log(`Migration insights-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(WATCH)

  // WANN der Lauf gebucht wurde. DATETIME wie `addedAt` und `refreshedAt` —
  // ein Zeitpunkt, gegen den gerechnet wird, ist kein Text.
  await columnStep(`Column ${WATCH}.briefRunAt`, 'briefRunAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: WATCH, key: 'briefRunAt', required: false,
  }))

  // WARUM er nichts geliefert hat. 32 reicht für den geschlossenen Satz
  // (`brief_failed`, `slug_taken`) und für einen dritten Grund, falls einmal
  // einer dazukommt — Diagnose-Texte des Anbieters gehören hier nicht hinein.
  await columnStep(`Column ${WATCH}.briefError`, 'briefError', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'briefError', size: 32, required: false, xdefault: '',
  }))
}

await waitForColumns(WATCH)

console.log('✅ Migration insights-010 fertig')
