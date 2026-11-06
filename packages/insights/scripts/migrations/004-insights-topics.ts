/**
 * Migration insights-004: `insights_topics` — DER THEMENRADAR.
 *
 * Paket I4, Plan docs/plans/BRAND-INSIGHTS.md §9.6. Gemeinsame Regeln wie
 * insights-001…003 (server-only `permissions: []` / `rowSecurity: false`, kein
 * `communityId`, Indizes nur über `createIndexSteps`, idempotent 409 → skip);
 * sie läuft ausschliesslich auf der `branding`-Instanz.
 *
 * ── WAS HIER STEHEN DARF, STEHT IN §9.6 LEITPLANKE (a) ──────────────────
 * Je Video die öffentlichen Zahlen der YouTube Data API: Aufrufe, Likes,
 * Kommentar-ZAHL, Veröffentlichungsdatum, Kanal, Titel. Nicht mehr.
 *
 *  · KEINE Kommentar-TEXTE und KEINE Nutzernamen (Leitplanke b) — der Sweep
 *    ruft `commentThreads.list` nicht auf, und es gibt hier keine Spalte, in
 *    die so etwas passte. Die Kommentar-ZAHL ist keine Kommentar-Auswertung:
 *    sie ist eine öffentliche Kennzahl des Videos.
 *  · KEIN Verdichten über Kanäle hinweg (Policies III.E.2) — eine Zeile ist
 *    EIN Video. Es gibt bewusst keine Kanal-Tabelle mit Summen daneben; was
 *    die Redaktion über einen Kanal wissen will, liest sie aus seinen Videos.
 *
 * ── DIE AUFBEWAHRUNG: TÄGLICH NEU + 30-TAGE-NETZ (Entscheidung I4) ──────
 * Die Policies (III.E.4) lassen zwei Wege: höchstens 30 Kalendertage
 * aufbewahren ODER die Zahlen täglich neu holen und überschreiben. §9.6 sagt
 * ausdrücklich, dass die Entscheidung „an der Lauf-Frequenz hängt, nicht am
 * Recht" — und die Frequenz steht fest: EIN Lauf am Tag. Also BEIDES, und
 * zwar in dieser Rollenverteilung:
 *
 *  · Der tägliche Lauf ÜBERSCHREIBT je Video (Upsert über `uq_video_id`). Das
 *    ist der Normalfall und der Grund, warum eine Zeile hier nie altert.
 *  · Das 30-Tage-Netz LÖSCHT, was der Lauf nicht mehr erreicht hat
 *    (`fetchedAt` älter als `INSIGHTS_RADAR_RETENTION_DAYS`): der Lauf ist
 *    tagelang ausgefallen, ein Kanal ist aus der Liste geflogen, ein Video
 *    wurde privat gestellt. Ohne das Netz bliebe genau der Bestand liegen, für
 *    den die 30 Tage überhaupt gelten.
 *
 * GELÖSCHT WIRD DIE GANZE ZEILE — auch unsere Opportunity-Zahl. Leitplanke (a)
 * ERLAUBT ihr zu bleiben („sie darf bleiben, auch wenn die Zahlen darunter
 * ablaufen"), sie VERLANGT es nicht. Und eine 30 Tage alte Zahl zu einem Video,
 * das wir nicht mehr beobachten, hilft der Redaktion beim Entdecken nicht: der
 * Radar ist ein Signal über das, was JETZT läuft. Eine halbe Zeile mit einer
 * Zahl und ohne die Werte darunter wäre ausserdem genau die Sorte Datensatz,
 * die niemand mehr erklären kann.
 *
 * ── WARUM `videoId` UND NICHT DIE ZEILEN-ID DER SCHLÜSSEL IST ───────────
 * Der Upsert braucht eine fachliche Identität: dasselbe Video muss morgen
 * dieselbe Zeile treffen. Appwrite-Zeilen-Ids sind ≤ 36 Zeichen und dürfen
 * nicht mit `_` beginnen — YouTube-Video-Ids fangen genau damit an
 * (`_abc…`) und tragen `-`; sie als `rowId` zu verwenden hiesse, sie zu
 * verstümmeln. Stattdessen `uq_video_id` als UNIQUE-Index: die Datenbank
 * verhindert die zweite Zeile, und der Sweep behandelt den 409 beim Anlegen
 * als „dann eben aktualisieren" statt als Fehler.
 *
 * ── DAS MARIADB-ZEILENBUDGET, VORGERECHNET ──────────────────────────────
 * videoId 32 + channelId 64 + channelTitle 160 + title 300 + topic 32 = 588
 * varchar-Zeichen. Dazu sechs Zahlen-/Datums-Spalten mit fester Breite. Weit
 * unter 16.381 (utf8mb4-Grenze) — keine MEDIUMTEXT-Spalte nötig, und es soll
 * auch keine geben: was hier nicht in 300 Zeichen passt, gehört nicht hierher.
 *
 * ── DREI INDIZES, DREI FRAGEN ───────────────────────────────────────────
 *  · `uq_video_id` (UNIQUE) — „gibt es dieses Video schon?" Der Lesepfad des
 *    Upserts UND der Riegel gegen die doppelte Zeile (s. o.).
 *  · `idx_fetched_at` — „was ist älter als 30 Tage?" Der Lesepfad des Netzes.
 *    Er trägt zusätzlich die Sortierung der Betreiber-Ansicht (jüngste
 *    zuerst); Appwrite verlangt für eine Order-Spalte ohnehin einen Index.
 *  · `idx_topic` — „was läuft in diesem Cluster?" Die Frage, für die es den
 *    Radar gibt.
 *
 * KEIN Index auf `opportunity`, obwohl die Ansicht danach sortiert: die
 * Sortierung passiert im Server-Code über höchstens 500 Zeilen (Begründung in
 * `server/api/insights/radar/index.get.ts`). Ein Index für eine Spalte, die
 * jeder Lauf neu schreibt, kostet bei jedem Upsert und spart bei einer Liste,
 * die ohnehin komplett gelesen wird, nichts.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
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

const TOPICS = 'insights_topics'

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

console.log(`Migration insights-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TOPICS}`, () => tablesDB.createTable({
  databaseId, tableId: TOPICS, name: 'Insights Topics', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(TOPICS)

  // Die YouTube-Video-Id — die fachliche Identität der Zeile (s. Kopf).
  // PFLICHT: eine Radar-Zeile ohne Video ist keine.
  await columnStep(`Column ${TOPICS}.videoId`, 'videoId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TOPICS, key: 'videoId', size: 32, required: true,
  }))
  // Der Kanal — `UC` + 22 Zeichen. 64 ist Rand für den Fall, dass Google die
  // Form je ändert; eine zu enge Spalte kostete eine Migration auf einer
  // laufenden Instanz.
  await columnStep(`Column ${TOPICS}.channelId`, 'channelId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TOPICS, key: 'channelId', size: 64, required: true,
  }))
  // Der Kanalname, wie ihn `channels.list` HEUTE liefert — nicht der Name aus
  // unserer Konfiguration: der könnte veraltet sein, und ein veralteter Name
  // in einer Redaktions-Ansicht ist schlimmer als gar keiner.
  await columnStep(`Column ${TOPICS}.channelTitle`, 'channelTitle', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TOPICS, key: 'channelTitle', size: 160, required: false, xdefault: '',
  }))
  // Der Nenner der Popularität (Aufrufe ÷ Abonnenten, §9.6). 0 heisst „der
  // Kanal verbirgt seine Zahl" — `insightsPopularity` gibt dann 0 zurück,
  // statt durch null zu teilen.
  await columnStep(`Column ${TOPICS}.channelSubscribers`, 'channelSubscribers', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'channelSubscribers', required: false, min: 0, xdefault: 0,
  }))
  // Der Videotitel. 300 wie `proposed`/`reason` in insights-003 — YouTube
  // deckelt bei 100, der Rand kostet nichts.
  await columnStep(`Column ${TOPICS}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TOPICS, key: 'title', size: 300, required: false, xdefault: '',
  }))
  // Die drei öffentlichen Zahlen (Leitplanke a). Sie kommen aus der API als
  // ZEICHENKETTEN und werden vor dem Schreiben zu Zahlen; fehlt eine (Likes
  // oder Kommentare abgeschaltet), steht 0 — das ist die Aussage, nicht ein
  // Ersatzwert.
  await columnStep(`Column ${TOPICS}.views`, 'views', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'views', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${TOPICS}.likes`, 'likes', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'likes', required: false, min: 0, xdefault: 0,
  }))
  await columnStep(`Column ${TOPICS}.commentCount`, 'commentCount', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'commentCount', required: false, min: 0, xdefault: 0,
  }))
  // Das Veröffentlichungsdatum — der Zähler des Alters-Signals.
  await columnStep(`Column ${TOPICS}.publishedAt`, 'publishedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: TOPICS, key: 'publishedAt', required: false,
  }))
  // WANN WIR DIE ZAHLEN GEHOLT HABEN — die Spalte, an der die Aufbewahrung
  // hängt (s. Kopf). Sie ist zugleich der „letzter Lauf"-Stempel der
  // Betreiber-Ansicht: ein zweiter Zustand daneben („lastRunAt" irgendwo)
  // könnte von den Zeilen abweichen, und dann glaubte niemand mehr einem der
  // beiden.
  await columnStep(`Column ${TOPICS}.fetchedAt`, 'fetchedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: TOPICS, key: 'fetchedAt', required: false,
  }))
  // Der Cluster-Schlüssel aus dem Katalog in `insightsPost.ts`. Varchar und
  // kein Enum — dieselbe Begründung wie in insights-001…003: die Wahrheit über
  // die erlaubten Werte steht im Code, ein neunter Cluster soll keine Migration
  // auf einer laufenden Instanz kosten.
  await columnStep(`Column ${TOPICS}.topic`, 'topic', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: TOPICS, key: 'topic', size: 32, required: true,
  }))
  // UNSERE ZAHL Nr. 1: Nähe zu unseren Clustern, 0–1, aus der Schlagwortliste
  // (`insightsRadarClassify`). Float, weil 0.75 kein Integer ist und eine
  // Skalierung auf 0–100 hier nur eine zweite Einheit einführte.
  await columnStep(`Column ${TOPICS}.relevance`, 'relevance', cols, () => tablesDB.createFloatColumn({
    databaseId, tableId: TOPICS, key: 'relevance', required: false, min: 0, max: 1, xdefault: 0,
  }))
  // UNSERE ZAHL Nr. 2: die Opportunity, 0–100. OHNE Vorgabewert und damit
  // NULL-fähig — das ist der Punkt: „kein Signal" ist `null`, nie 0. Eine 0
  // wäre die Bewertung „das Video taugt nichts", wo gar nicht gemessen wurde
  // (wörtlich die Regel aus `insightsOpportunity`).
  await columnStep(`Column ${TOPICS}.opportunity`, 'opportunity', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'opportunity', required: false, min: 0, max: 100,
  }))
  // Aus wie vielen Signalen die Zahl gerechnet ist — die Fussnote „aus 3 von
  // 5 Signalen" (§11.1 Nr. 2). Sie wird MITGESPEICHERT und nicht beim Anzeigen
  // neu gerechnet: sonst behauptete die Ansicht von einer alten Zeile, sie sei
  // mit der heutigen Signal-Lage entstanden.
  await columnStep(`Column ${TOPICS}.opportunitySignals`, 'opportunitySignals', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: TOPICS, key: 'opportunitySignals', required: false, min: 0, max: 5, xdefault: 0,
  }))

  await waitForColumns(TOPICS)

  await indexStep(`Index ${TOPICS}.uq_video_id`, {
    tableId: TOPICS, key: 'uq_video_id', type: TablesDBIndexType.Unique, columns: ['videoId'],
  })
  await indexStep(`Index ${TOPICS}.idx_fetched_at`, {
    tableId: TOPICS, key: 'idx_fetched_at', type: TablesDBIndexType.Key, columns: ['fetchedAt'],
  })
  await indexStep(`Index ${TOPICS}.idx_topic`, {
    tableId: TOPICS, key: 'idx_topic', type: TablesDBIndexType.Key, columns: ['topic'],
  })
}

console.log('✔ Migration insights-004 fertig')
