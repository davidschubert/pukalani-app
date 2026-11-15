/**
 * posts-017 — EMOJI-REAKTIONEN (F57 Mechanik 1, Davids Entscheidung
 * 2026-08-10 „Reaktionen zuerst").
 *
 * Legt zwei Dinge an:
 *  1. die Tabelle `discussion_reactions` — EINE Zeile je (Ziel, Mensch,
 *     Reaktion). Mehrere verschiedene Emojis pro Mensch und Beitrag sind
 *     ausdruecklich erlaubt, dasselbe Emoji zweimal nicht (Slack-/Discourse-
 *     Muster: nochmal klicken nimmt zurueck).
 *  2. die Spalte `member_counters.reactionsGiven` — der mitschreibende Zaehler
 *     hinter dem Abzeichen `first-reaction`.
 *
 * ── DER UNIQUE-INDEX TRAEGT KEINE `communityId`, UND DAS IST DIE REGEL ─────
 * Die Pool-Unique-Regel verlangt die Mandanten-Spalte nur fuer tenant-RELATIVE
 * Schluessel (Host, Slug). Hier ist der erste Schluessel `targetId`, also eine
 * Appwrite-Row-Id — global eindeutig, kein Mandant kann mit einem anderen
 * kollidieren. Dieselbe Ueberlegung wie bei (courseId, userId) in courses.
 * Gestempelt und GEFILTERT wird `communityId` trotzdem ueberall: sie ist die
 * Datentuer, nicht die Eindeutigkeit.
 *
 * ── WARUM DIE ZEILEN LESER HABEN (anders als `post_views`/`member_counters`) ─
 * Eine Reaktion ist SICHTBARER Inhalt: die Leiste zeigt fremde Reaktionen mit
 * Anzahl. Die Zeilen bekommen deshalb die gewoehnlichen Inhalts-Rechte ueber
 * `tenantRowPermissionsFor` (Pool: `read(label:<communityId>)`), gesetzt von
 * der Datentuer beim Anlegen — nicht hier. Die Tabelle selbst braucht nur das
 * Anlege-Recht fuer angemeldete Nutzer, genau wie `post_votes`: geschrieben
 * wird mit dem SESSION-Client, damit M13 (Sperre) und A5 (Beitritt) an der
 * Tuerklinke `member` ueberhaupt greifen koennen.
 *
 * ── DREI INDIZES, JEDER MIT EINER FRAGE ───────────────────────────────────
 *  - `uq_target_user_reaction` — die Eindeutigkeit UND der Toggle: angelegt
 *    wird blind, ein 409 heisst „hat er schon" (dann wird geloescht).
 *  - `idx_community_target` — die EINE gebuendelte Leseabfrage der Themenseite
 *    („alle Reaktionen dieser sichtbaren Ziele"). Ohne ihn waere die Anzeige
 *    ein Tabellen-Scan je Seitenaufbau.
 *  - `idx_community_user` — der Lazy-Seed des Zaehlers und der GDPR-Beitrag
 *    („alles von diesem Menschen").
 *
 * Aufruf: pnpm migrate --app <app> --layer posts
 * ZIEL-INSTANZEN: jede Instanz, deren App den posts-Layer traegt — heute
 * `platform` (Pool) und `comments`. NICHT `control` (kein posts-Layer).
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

const TABLE = 'discussion_reactions'
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

console.log(`Migration posts-017 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

/* ── 1. Die Reaktions-Tabelle ──────────────────────────────────────────── */

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Discussion Reactions',
  permissions: [Permission.create(Role.users())], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
// Heute ausschliesslich 'post'. Die Spalte steht VON ANFANG AN da, damit die
// Antwort-Ebene (comments) spaeter ohne Migration dazukommen kann — welcher
// Layer sie besitzt, ist eine offene Entscheidung (siehe shared/reactions.ts).
await columnStep(`Column ${TABLE}.targetType`, 'targetType', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'targetType', size: 32, required: false, xdefault: 'post',
}))
await columnStep(`Column ${TABLE}.targetId`, 'targetId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'targetId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'userId', size: 36, required: false, xdefault: '',
}))
// Der SCHLUESSEL ('tada'), nie das Zeichen — Begruendung in shared/reactions.ts.
// 32 Zeichen sind reichlich fuer ASCII-Schluessel und lassen Luft nach oben.
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

/* ── 2. Der mitschreibende Zaehler ─────────────────────────────────────── */

// ADDITIV zu posts-013. Bestandszeilen starten bei 0 und werden beim naechsten
// Hinsehen aus dem Aggregat geeicht (`counterFellBehind` kennt die Spalte) —
// kein Backfill, aus denselben Gruenden wie dort.
const counterCols = await existingColumnKeys(COUNTERS_TABLE)
await columnStep(`Column ${COUNTERS_TABLE}.reactionsGiven`, 'reactionsGiven', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'reactionsGiven', required: false, min: 0, xdefault: 0,
}))
await waitForColumns(COUNTERS_TABLE)

console.log('✔ Migration posts-017 fertig')
