/**
 * comments-019 — EMOJI-REAKTIONEN AUF ANTWORTEN (F57, Davids Entscheidung
 * 2026-08-13 „Ja, nachbauen").
 *
 * Legt EINE Tabelle an: `comment_reactions`, eine Zeile je (Kommentar, Mensch,
 * Reaktion). Mehrere verschiedene Emojis pro Mensch und Kommentar sind
 * ausdruecklich erlaubt, dasselbe Emoji zweimal nicht (Slack-/Discourse-
 * Muster: nochmal klicken nimmt zurueck).
 *
 * ── WARUM EINE ZWEITE TABELLE UND NICHT `discussion_reactions` ─────────────
 * Das Konzept hatte die Antwort-Ebene als „additiv ohne Migration" in
 * Aussicht gestellt — gemeint war die Spalte `targetType`, die posts-017
 * vorsorglich mitbringt. Dieser Weg ist BEWUSST nicht genommen worden, und
 * zwar nicht aus Bequemlichkeit: `discussion_reactions` gehoert dem
 * posts-Layer, und `comments` steht in jedem `extends` VOR `posts`. Eine
 * Route in comments, die diese Tabelle liest, waere die Abhaengigkeits-Umkehr,
 * die A14 verbietet — und zwar die schlimmste Sorte, weil sie ueber einen
 * blossen Tabellen-NAMEN laeuft und deshalb nirgends rot wird.
 *
 * Damit bleibt der zweite der beiden Wege, die das Konzept gegeneinander
 * gestellt hat: ein eigenes Datenmodell nach dem Muster der STIMMEN. Genau so
 * steht `comment_votes` neben `post_votes` und `VoteButtons` neben
 * `PostVoteButtons` — zwei Produkte, zweimal dieselbe Mechanik, nie ein
 * Griff ueber die Layer-Grenze. Geteilt wird stattdessen die REGEL
 * (`core/shared/reactions.ts`), und die kostet keine Tabelle.
 *
 * ── KEIN `targetType` HIER, UND DAS IST DER UNTERSCHIED ZU posts-017 ───────
 * Dort steht die Spalte, weil `community_posts` zwei Dinge traegt (Themen mit
 * Kategorie, Feed-Beitraege ohne) und weil sie einmal der Platzhalter fuer
 * genau diese Erweiterung war. Hier gibt es nur eine Art Ziel: einen
 * Kommentar. Eine Spalte, die nie etwas anderes als 'comment' enthaelt, ist
 * kein Vorrat, sondern eine Frage, die sich jeder spaetere Leser stellt.
 *
 * ── DER UNIQUE-INDEX TRAEGT KEINE `communityId`, UND DAS IST DIE REGEL ─────
 * Die Pool-Unique-Regel verlangt die Mandanten-Spalte nur fuer tenant-RELATIVE
 * Schluessel (Host, Slug). Hier ist der erste Schluessel `targetId`, also eine
 * Appwrite-Row-Id — global eindeutig, kein Mandant kann mit einem anderen
 * kollidieren. Dieselbe Ueberlegung wie bei posts-017 und bei
 * (courseId, userId) in courses. Gestempelt und GEFILTERT wird `communityId`
 * trotzdem ueberall: sie ist die Datentuer, nicht die Eindeutigkeit.
 *
 * ── DIE ZEILEN HABEN LESER, ANDERS ALS `comment_votes` ────────────────────
 * Das ist die eine bewusste Abweichung vom Stimmen-Muster. Eine STIMME ist
 * geheim: die Liste liefert nur Summen, die Rohzeile sieht ausschliesslich der
 * Stimmende (`Permission.read(Role.user(...))`, comments-007). Eine REAKTION
 * ist sichtbarer Inhalt — die Leiste zeigt fremde Reaktionen mit Anzahl. Die
 * Zeilen bekommen deshalb die gewoehnlichen Inhalts-Rechte ueber
 * `tenantRowPermissionsFor` (Pool: `read(label:<communityId>)`), gesetzt von
 * der Datentuer beim Anlegen — nicht hier. Waeren sie privat, muesste die
 * gebuendelte Leseabfrage ueber den Admin-Client laufen, und die Sichtbarkeit
 * waere handgeschriebene Logik statt einer Berechtigung; genau dort entsteht
 * das erste Leck.
 *
 * Die Tabelle selbst braucht nur das Anlege-Recht fuer angemeldete Nutzer,
 * genau wie `comment_votes`: geschrieben wird mit dem SESSION-Client, damit
 * M13 (Sperre) und A5 (Beitritt) an der Tuerklinke `member` ueberhaupt
 * greifen koennen.
 *
 * ── DREI INDIZES, JEDER MIT EINER FRAGE ───────────────────────────────────
 *  - `uq_target_user_reaction` — die Eindeutigkeit UND der Toggle: angelegt
 *    wird blind, ein 409 heisst „hat er schon" (dann wird geloescht).
 *  - `idx_community_target` — die EINE gebuendelte Leseabfrage einer
 *    Kommentarliste („alle Reaktionen dieser 25 Antworten"). Ohne ihn waere
 *    die Anzeige ein Tabellen-Scan je Seitenaufbau.
 *  - `idx_community_user` — der GDPR-Beitrag und der Community-Export
 *    („alles von diesem Menschen").
 *
 * KEINE Zaehler-Spalte: `member_counters.reactionsGiven` gibt es seit
 * posts-017, und der Zaehler ist layer-neutral (Core-Vertrag
 * `recordUserCounterEvents`). Eine Antwort-Reaktion zaehlt in DENSELBEN Stand
 * wie eine Themen-Reaktion — `first-reaction` bleibt EIN Abzeichen fuer die
 * erste Reaktion, egal wo sie abgegeben wurde. In einer App ohne posts-Layer
 * ist der Vertrag unbesetzt und die Meldung verpufft folgenlos.
 *
 * Idempotent (409 → skip). Index-Anlage NUR ueber die Fabrik (F19).
 *
 * Aufruf: pnpm migrate --app <app> --layer comments
 * ZIEL-INSTANZEN: jede Instanz, deren App den comments-Layer traegt — heute
 * `platform` (Pool) und `comments`. NICHT `control` (kein comments-Layer).
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Permission, Role, TablesDB, TablesDBIndexType } from 'node-appwrite'
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

const TABLE = 'comment_reactions'

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

console.log(`Migration comments-019 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Comment Reactions',
  permissions: [Permission.create(Role.users())], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
// Die Row-Id des KOMMENTARS. `targetId` und nicht `commentId`, damit die
// gebuendelte Aggregation dieselbe pure Funktion nutzen kann wie posts
// (`aggregateReactions` liest genau dieses Feld) — die Tabelle traegt hier
// bewusst den Namen der REGEL, nicht den ihres einen Ziels.
await columnStep(`Column ${TABLE}.targetId`, 'targetId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'targetId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))
// Der SCHLUESSEL ('tada'), nie das Zeichen — Begruendung in
// core/shared/reactions.ts. 32 Zeichen sind reichlich fuer ASCII-Schluessel.
await columnStep(`Column ${TABLE}.reaction`, 'reaction', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'reaction', size: 32, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

await indexStep(`Unique-Index ${TABLE}.uq_target_user_reaction`, {
  tableId: TABLE, key: 'uq_target_user_reaction', type: TablesDBIndexType.Unique,
  columns: ['targetId', 'userId', 'reaction'],
})
await indexStep(`Index ${TABLE}.idx_community_target`, {
  tableId: TABLE, key: 'idx_community_target', type: TablesDBIndexType.Key,
  columns: ['communityId', 'targetId'],
})
await indexStep(`Index ${TABLE}.idx_community_user`, {
  tableId: TABLE, key: 'idx_community_user', type: TablesDBIndexType.Key,
  columns: ['communityId', 'userId'],
})

console.log('✔ Migration comments-019 fertig')
