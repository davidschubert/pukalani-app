/**
 * posts-019 — DER TAGESSTAND DES LIKE-LIMITS (F57 Mechanik 3, Davids
 * Entscheidung 2026-08-14).
 *
 * DREI additive Spalten auf `member_counters`, nichts Zerstoererisches,
 * idempotent (409 → skip):
 *
 *  - `likeDay`       (String 10) — der UTC-Kalendertag `YYYY-MM-DD`, auf den
 *                    sich der Tagesstand bezieht. `''` = noch nie gestimmt.
 *  - `likesToday`    (Integer)   — vergebene Aufstimmen an JENEM Tag.
 *  - `likeLimitDays` (Integer)   — an wie vielen Tagen das Limit erreicht war.
 *                    Der Zaehler hinter „Out of Love" / „Higher Love" /
 *                    „Crazy in Love" (1 / 5 / 20 Tage).
 *
 * ── WARUM DER STAND IN DIESE ZEILE GEHOERT UND NICHT IN EIGENE ────────────
 * `member_counters` gibt es schon, genau EINE Zeile je (Community, Mensch),
 * und sie wird bei jeder Aufstimme ohnehin gelesen und geschrieben. Der
 * Tagesstand kostet damit keine zusaetzliche Abfrage im heissesten Pfad des
 * Produkts — nur drei Spalten.
 *
 * Eine eigene Tabelle (Mensch, Tag) waere die naheliegende Alternative gewesen
 * und ist bewusst verworfen: sie braeuchte einen eigenen Index fuer die Frage
 * „wie viele heute", je aktivem Menschen und Tag eine Zeile — und ein
 * Aufraeumen, das niemand baut und das man nach einem Jahr an der Tabellen-
 * groesse bemerkt.
 *
 * ── KEIN INDEX, UND DAS IST KEINE NACHLAESSIGKEIT ─────────────────────────
 * Gelesen werden alle drei Spalten ausschliesslich ueber die Zeile EINES
 * Menschen, und die findet `uq_community_user` (posts-013). Es gibt keine
 * Frage der Form „wer hat heute schon 40 Likes vergeben" — es gibt keine
 * Bestenliste und keinen Betreiber-Bericht darueber. Ein Index waere
 * Schreiblast ohne Leser, und geschrieben wird hier bei JEDER Aufstimme.
 *
 * ── KEIN TAGESWECHSEL-LAUF ────────────────────────────────────────────────
 * Niemand setzt nachts `likesToday` auf 0. Der Wechsel passiert beim naechsten
 * Like: steht in `likeDay` ein anderer Tag, ist der alte Stand bedeutungslos
 * und wird ueberschrieben. Ein naechtlicher Lauf ueber Millionen Zeilen taete
 * Arbeit fuer Zeilen, die an dem Tag ohnehin niemand anfasst.
 *
 * ── BESTAND STARTET BEI NULL, UND DAS MUSS MAN AUSSPRECHEN ────────────────
 * `likeLimitDays` wird NIE geeicht — anders als `upvotesGiven` gibt es hier
 * kein Aggregat, aus dem sich vergangene Tage ableiten liessen. „An diesem Tag
 * war das Kontingent aufgebraucht" ist ein Zustand, der vergeht: die Stimmen
 * jenes Tages stehen zwar noch in `comment_votes`/`post_votes`, aber eine
 * zurueckgenommene ist dort geloescht — und gerade sie hat gezaehlt (die
 * Ruecknahme erstattet nichts). Die drei Abzeichen zaehlen also AB HEUTE, wie
 * schon „Editor" und „Promoter".
 *
 * Aufruf: pnpm migrate --app <app> --layer posts
 * ZIEL-INSTANZEN: jede Instanz, deren App den posts-Layer traegt — heute
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

const COUNTERS_TABLE = 'member_counters'

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

console.log(`Migration posts-019 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const counterCols = await existingColumnKeys(COUNTERS_TABLE)

// `likeDay` ist bewusst ein STRING und kein Datetime: verglichen wird auf
// Gleichheit mit einem serverseitig gebildeten Schluessel (`utcDayKey`), nie
// auf „vorher/nachher". Ein Datetime lud dazu ein, spaeter nach Zeitraeumen zu
// fragen — und genau das soll diese Spalte nicht koennen, weil sie den Tag
// eines Menschen haelt und keine Historie.
await columnStep(`Column ${COUNTERS_TABLE}.likeDay`, 'likeDay', counterCols, () => tablesDB.createStringColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'likeDay', size: 10, required: false, xdefault: '',
}))
await columnStep(`Column ${COUNTERS_TABLE}.likesToday`, 'likesToday', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'likesToday', required: false, min: 0, xdefault: 0,
}))
// `min: 0` wie bei allen Zaehlern: Appwrite WEIST ein Herunterzaehlen unter 0
// ab, statt zu kappen — die Spalte ist das Netz, der Schreibweg die Regel.
await columnStep(`Column ${COUNTERS_TABLE}.likeLimitDays`, 'likeLimitDays', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'likeLimitDays', required: false, min: 0, xdefault: 0,
}))
await waitForColumns(COUNTERS_TABLE)

console.log('✔ Migration posts-019 fertig')
console.log('  Neu: member_counters.likeDay + .likesToday (Tagesstand, kein Sweep)')
console.log('  Neu: member_counters.likeLimitDays (Start 0, nie geeicht — traegt out-of-love/higher-love/crazy-in-love)')
