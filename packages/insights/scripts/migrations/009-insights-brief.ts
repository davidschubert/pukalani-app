/**
 * Migration insights-009: DER BRIEF WIRD EINE SPALTE.
 *
 * Paket BI2 K5 („Brief aus diesem Video"), Plan
 * docs/plans/BRAND-INSIGHTS-KURATION.md §6 und §13. Gemeinsame Regeln wie
 * insights-001…008 (server-only `permissions: []` / `rowSecurity: false`,
 * kein `communityId`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz.
 *
 * (Die 008 ist seit dem 2026-10-25 für `insights_sends` vergeben — der
 * Newsletter-Versand aus BI1 I5. Diese Migration ist deshalb die 009. Sie
 * legt KEINE Tabelle an, sondern fünf Spalten in zwei bestehenden.)
 *
 * ── WARUM DER BRIEF ÜBERHAUPT GESPEICHERT WIRD ──────────────────────────
 * Bis K5 war er flüchtig: ein Textfeld im Editor, das mit dem Knopf
 * „Entwurf schreiben" in die Route reiste und danach verschwand. Für einen
 * Brief, den ein Mensch tippt, war das ehrlich — er stand ja im Browser.
 *
 * Ein Brief aus einem VIDEO ist etwas anderes: er ist BEZAHLT (ein
 * 25-Minuten-Video kostet rund fünf Cent) und er ist ARBEIT (ein Mensch liest
 * und schärft ihn, bevor der Entwurf läuft). Beides darf ein Neuladen nicht
 * wegwerfen. Dazu kommt die Herkunft: „warum steht das so im Artikel?" ist
 * nur beantwortbar, solange der AUFTRAG noch da ist — dieselbe Begründung,
 * aus der `draftModel` und `draftPromptVersion` seit insights-001 mitlaufen.
 *
 * ── DREI SPALTEN FÜR DIE HERKUNFT, EINE FÜR DEN TEXT ────────────────────
 * `brief` gehört dem MENSCHEN (im Formular änderbar), `briefModel`,
 * `briefPromptVersion` und `briefVideoId` dem LAUF (server-eigen,
 * `INSIGHTS_SERVER_OWNED_FIELDS`). Die Trennung ist dieselbe wie in
 * `insights_watchlist`: was jemand entschieden hat, überschreibt kein Lauf.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ────────────────────────────────────
 * `insights_posts` lag bei 7.532 Zeichen (Rechnung im Kopf von
 * insights-001). Dazu kommen hier briefModel 120 + briefPromptVersion 64 +
 * briefVideoId 32 = 216, also 7.748 — weit unter 16.381.
 *
 * `brief` zählt NICHT mit: 2.000 Zeichen wären 8.000 Byte und damit die
 * Hälfte des restlichen Budgets für ein Feld, das Text trägt. Es ist deshalb
 * MEDIUMTEXT (liegt off-row, kostet in der Zeile einen Zeiger) — dieselbe
 * Wahl und dieselbe Begründung wie bei `bodyDe`, `sources` und `facts`.
 *
 * `insights_watchlist` lag bei 1.104; `briefPostId` 64 macht 1.168.
 *
 * ── KEIN INDEX, UND DAS IST GERECHNET ──────────────────────────────────
 * Nahe lag `idx_brief_video` auf `insights_posts.briefVideoId` („welcher
 * Beitrag kam aus diesem Video?"). Er fehlt, weil die Frage anders gestellt
 * wird: die Fundstück-Liste hat die Antwort schon an ihrer EIGENEN Zeile
 * (`briefPostId`) und braucht dafür keinen zweiten Weg. Ein Index, den nur
 * eine Diagnose benutzt, kostet bei jedem Schreibvorgang.
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

const POSTS = 'insights_posts'
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

console.log(`Migration insights-009 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(POSTS)

  // Der Auftrag selbst. MEDIUMTEXT (s. Zeilenbudget im Kopf).
  await columnStep(`Column ${POSTS}.brief`, 'brief', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'brief', required: false, xdefault: '',
  }))
  // WELCHES Modell den Brief geschrieben hat. 120 wie `draftModel` — die
  // längste Modell-Kennung dieses Monorepos liegt bei knapp 40 Zeichen.
  await columnStep(`Column ${POSTS}.briefModel`, 'briefModel', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'briefModel', size: 120, required: false, xdefault: '',
  }))
  // WELCHE Prompt-Fassung (`insights-b-1`). Ohne sie ist ein alter Brief
  // nicht mehr einzuordnen.
  await columnStep(`Column ${POSTS}.briefPromptVersion`, 'briefPromptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'briefPromptVersion', size: 64, required: false, xdefault: '',
  }))
  // AUS WELCHEM Video. Leer heisst „getippt" — der Weg, den es vor K5 als
  // einzigen gab und der bleibt.
  await columnStep(`Column ${POSTS}.briefVideoId`, 'briefVideoId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'briefVideoId', size: 32, required: false, xdefault: '',
  }))
}

{
  const cols = await existingColumnKeys(WATCH)

  // Die Rückrichtung: welcher Beitrag ist aus diesem Fundstück entstanden?
  // 64 wie `reviewedBy` — eine Appwrite-Zeilen-Id ist 20 Zeichen, der Rest
  // ist Luft für ein künftiges Präfix.
  await columnStep(`Column ${WATCH}.briefPostId`, 'briefPostId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'briefPostId', size: 64, required: false, xdefault: '',
  }))
}

await waitForColumns(POSTS)
await waitForColumns(WATCH)

console.log('✅ Migration insights-009 fertig')
