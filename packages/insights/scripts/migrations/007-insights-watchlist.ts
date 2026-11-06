/**
 * Migration insights-007: `insights_watchlist` — DIE EIGENE VIDEO-LISTE.
 *
 * Paket BI2 K4, Plan docs/plans/BRAND-INSIGHTS-KURATION.md §4 und §5.
 * Gemeinsame Regeln wie insights-001…006 (server-only `permissions: []` /
 * `rowSecurity: false`, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz.
 *
 * (Die Nummer 006 ist seit dem 2026-10-24 für `insights_subscribers` vergeben
 * — der Newsletter aus BI1 I5a. Diese Tabelle ist deshalb die 007.)
 *
 * ── ZWEI LEBENSDAUERN IN EINER ZEILE, UND DAS IST DER ZWECK ─────────────
 * `insights_topics` daneben ist flüchtig: täglich überschrieben, 30-Tage-Netz,
 * Alters-Deckel 180 Tage (YouTube-Policies III.E.4). Für eine Liste, die ein
 * Mensch ANLEGT, wäre genau das der Fehler — man hält ein Video fest, und drei
 * Wochen später ist es weg, weil ein Aufräum-Lauf nicht wusste, dass es
 * jemandem gehört.
 *
 * Deshalb trennt diese Tabelle zwei Sorten Spalten:
 *  · DEINS und dauerhaft: `videoId`, `addedAt`, `verdict`, `note`, `topic`.
 *    Das sind keine API-Daten, sondern Aufzeichnungen ÜBER ein Video.
 *  · VON YOUTUBE und flüchtig: `title`, `channelId`, `channelTitle`,
 *    `channelSubscribers`, `views`, `likes`, `commentCount`, `publishedAt`.
 *    Die zieht der tägliche Lauf nach (ein Stapel je 50 Videos = 1 Einheit).
 *
 * `available` ist die Naht dazwischen: ist ein Video nicht mehr abrufbar
 * (gelöscht, privat), werden die ZAHLEN geleert und die Zeile bleibt stehen.
 * Die Aufbewahrungs-Pflicht der Policies ist damit erfüllt — gespeichert
 * bleibt dann nichts von YouTube.
 *
 * ── KEIN ALTERS-DECKEL ──────────────────────────────────────────────────
 * Anders als der Radar. Dort ist „was läuft gerade" die Frage; hier findet
 * jemand absichtlich auch ein Video von 2019.
 *
 * ── ZEILENBUDGET (MariaDB, utf8mb4) ─────────────────────────────────────
 * videoId 32 + verdict 16 + note 500 + topic 32 + channelId 64 +
 * channelTitle 160 + title 300 = 1.104 Zeichen. Weit unter 16.381.
 *
 * ── INDIZES ─────────────────────────────────────────────────────────────
 *  · `uq_video_id` — die fachliche Identität. Ohne ihn stünde ein Video nach
 *    einem Doppelklick zweimal in der Liste, und das Urteil hinge an zwei
 *    Zeilen.
 *  · `idx_verdict` — „zeig mir nur die interessanten", die Vorauswahl selbst.
 *  · `idx_added_at` — die Vorgabe-Sortierung (zuletzt hinzugefügt zuerst).
 *
 * Aufruf:
 *   pnpm migrate --app branding --layer insights
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

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

console.log(`Migration insights-007 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${WATCH}`, () => tablesDB.createTable({
  databaseId, tableId: WATCH, name: 'Insights Watchlist', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(WATCH)

  // ── Deins, dauerhaft ────────────────────────────────────────────────────

  // Die YouTube-Video-Id (elf Zeichen) — die fachliche Identität. 32 wie in
  // insights-004, damit beide Tabellen dieselbe Breite für dieselbe Sache
  // haben.
  await columnStep(`Column ${WATCH}.videoId`, 'videoId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'videoId', size: 32, required: true,
  }))
  // Das Urteil: `unrated` | `uninteresting` | `interesting`. Varchar und kein
  // Enum, wie überall in diesem Layer — die Wahrheit über die erlaubten Werte
  // steht im Code, eine vierte Stellung soll keine Migration kosten.
  // PFLICHT: eine Zeile ohne Urteil ist in dieser Tabelle sinnlos.
  await columnStep(`Column ${WATCH}.verdict`, 'verdict', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'verdict', size: 16, required: true,
  }))
  // Warum hast du das aufgehoben? 500 — ein Gedanke, kein Artikel.
  await columnStep(`Column ${WATCH}.note`, 'note', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'note', size: 500, required: false, xdefault: '',
  }))
  // Das Cluster, unter dem DU es führst. Beim Hinzufügen schlägt die
  // Schlagwortliste eines vor; was hier steht, hat ein Mensch behalten oder
  // geändert — ein Lauf fasst es nie an.
  await columnStep(`Column ${WATCH}.topic`, 'topic', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'topic', size: 32, required: true,
  }))
  // Wann du es hinzugefügt hast — die Vorgabe-Sortierung. Eigene Spalte und
  // nicht `$createdAt`: Appwrites Zeitstempel lässt sich nicht indizieren,
  // und „zuletzt gefunden zuerst" ist die Frage, mit der man diese Liste
  // öffnet.
  await columnStep(`Column ${WATCH}.addedAt`, 'addedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: WATCH, key: 'addedAt', required: false,
  }))

  // ── Von YouTube, flüchtig ───────────────────────────────────────────────

  // Die Naht: war das Video beim letzten Abruf noch da? `false` heisst
  // „Zahlen geleert, Zeile bleibt" — der Unterschied zum Radar, wo in diesem
  // Fall die ganze Zeile geht.
  await columnStep(`Column ${WATCH}.available`, 'available', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: WATCH, key: 'available', required: false, xdefault: true,
  }))
  // Wann die Zahlen zuletzt geholt wurden. Ohne diesen Stempel wäre eine
  // leere Zeile nicht zu deuten: nie geholt, oder gelöschtes Video?
  await columnStep(`Column ${WATCH}.refreshedAt`, 'refreshedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: WATCH, key: 'refreshedAt', required: false,
  }))
  await columnStep(`Column ${WATCH}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'title', size: 300, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WATCH}.channelId`, 'channelId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'channelId', size: 64, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WATCH}.channelTitle`, 'channelTitle', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WATCH, key: 'channelTitle', size: 160, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WATCH}.channelSubscribers`, 'channelSubscribers', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: WATCH, key: 'channelSubscribers', required: false, min: 0, xdefault: 0,
  }))
  // Die drei öffentlichen Zahlen (Leitplanke a aus §9.6, hier unverändert
  // gültig): mehr als diese darf auch die eigene Liste nicht tragen.
  await columnStep(`Column ${WATCH}.views`, 'views', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: WATCH, key: 'views', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${WATCH}.likes`, 'likes', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: WATCH, key: 'likes', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${WATCH}.commentCount`, 'commentCount', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: WATCH, key: 'commentCount', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${WATCH}.publishedAt`, 'publishedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: WATCH, key: 'publishedAt', required: false,
  }))

  await waitForColumns(WATCH)

  await indexStep(`Index ${WATCH}.uq_video_id`, {
    tableId: WATCH, key: 'uq_video_id', type: TablesDBIndexType.Unique, columns: ['videoId'],
  })
  await indexStep(`Index ${WATCH}.idx_verdict`, {
    tableId: WATCH, key: 'idx_verdict', type: TablesDBIndexType.Key, columns: ['verdict'],
  })
  await indexStep(`Index ${WATCH}.idx_added_at`, {
    tableId: WATCH, key: 'idx_added_at', type: TablesDBIndexType.Key, columns: ['addedAt'],
  })
}

console.log('✔ Migration insights-007 fertig')
