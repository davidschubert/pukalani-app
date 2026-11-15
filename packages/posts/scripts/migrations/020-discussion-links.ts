/**
 * posts-020 — THEMEN-VERLINKUNG MIT RÜCKVERWEIS (F57, letzte Mechanik aus dem
 * Discussions-Konzept Teil 4; Davids Entscheidung 2026-08-13/14).
 *
 * Eine neue Tabelle `discussion_links` + EINE Zählerspalte, nichts
 * Zerstörerisches, idempotent (409 → skip):
 *
 *  - Tabelle `discussion_links` — je Paar (Quelle, Ziel) EINE Zeile:
 *      `communityId` · `sourceId` (der verweisende Beitrag) ·
 *      `targetId` (das verwiesene Thema)
 *  - `member_counters.linksMade` (Integer) — der Zähler hinter dem Abzeichen
 *    „First Link" („erster Link auf ein anderes Topic", Katalog § 3.6).
 *
 * ── WAS DIESE TABELLE IST UND WAS SIE NICHT IST ───────────────────────────
 * Sie ist ein INDEX FÜR DIE GEGENRICHTUNG, keine zweite Wahrheit. Die Wahrheit
 * steht im Beitragstext: ein Verweis ist die Zeichenkette `#<id>-<deko>`
 * (`shared/topicLinks.ts`), genau wie eine Erwähnung `@handle` ist. Wer einen
 * Beitrag liest, bekommt seine Verweise aus dem TEXT aufgelöst — diese Tabelle
 * wird dafür nie gelesen.
 *
 * Gebraucht wird sie für die eine Frage, die der Text nicht beantworten kann:
 * „WER zeigt auf mich?" Ohne sie müsste das Ziel-Thema jeden Beitrag der
 * Community nach seiner eigenen Id durchsuchen — bei jedem Seitenaufbau.
 *
 * Daraus folgt die Betriebsregel: die Tabelle darf hinterherhinken, ohne dass
 * etwas kaputtgeht. Ein misslungener Schreibvorgang kostet einen Rückverweis,
 * nie einen Beitrag; das Schreiben ist deshalb fail-soft, das Lesen des Textes
 * nicht.
 *
 * ── DREI INDIZES, JEDER MIT EINEM LESER ───────────────────────────────────
 *  - `uq_source_target` (Unique, `sourceId` + `targetId`) — ein Beitrag, der
 *    dasselbe Thema zweimal nennt, erzeugt EINEN Rückverweis. Das ist die
 *    Regel im Schema statt im Schreibweg. BEWUSST OHNE `communityId`: beide
 *    Spalten sind Row-Ids, und eine Row-Id ist global eindeutig — da kann kein
 *    Mandant mit einem anderen kollidieren (dieselbe Überlegung wie bei
 *    `events`/`courses`, CLAUDE.md „Pool-Unique-Regel").
 *  - `idx_community_target` — die Rückverweis-Abfrage („wer zeigt auf dieses
 *    Thema?"), immer mandantengescopt durch die Datentür.
 *  - `idx_community_source` — das Ersetzen beim Bearbeiten („welche Verweise
 *    hatte dieser Beitrag bisher?").
 *
 * ── KEIN `authorId`, UND DAS IST EINE DATENSCHUTZ-ENTSCHEIDUNG ────────────
 * Die Zeile trägt zwei Row-Ids und eine Mandanten-Id — nichts
 * Personenbezogenes. Sie braucht deshalb keinen GDPR-Beitrag und taucht in
 * keinem Export auf. Ein `authorId` hätte genau einen Zweck gehabt (den
 * Zähler `linksMade` aus dem Bestand eichen zu können) und dafür jede Zeile
 * personenbezogen gemacht — ein schlechter Tausch.
 *
 * Folge, die man aussprechen muss: **`linksMade` startet für alle bei 0** und
 * wird NIE geeicht, wie `edits` und `invitesAccepted`. „First Link" zählt ab
 * heute.
 *
 * ── WARUM DER LÖSCHPFAD FEHLT ─────────────────────────────────────────────
 * Beiträge werden hier SOFT gelöscht (`status: 'deleted'`, Row bleibt), und
 * der GDPR-Weg setzt einen Grabstein. Verwaiste Verweis-Zeilen kann es also
 * geben — sichtbar werden sie nie: die Rückverweis-Anzeige lädt die
 * QUELL-Beiträge und zeigt nur, was veröffentlicht und lesbar ist. Ein
 * eigener Aufräum-Pfad wäre eine zweite Stelle, an die man sich erinnern
 * müsste, für ein Ergebnis, das der Anzeige-Filter ohnehin liefert.
 *
 * Aufruf: pnpm migrate --app <app> --layer posts
 * ZIEL-INSTANZEN: jede Instanz, deren App den posts-Layer trägt — heute
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

const TABLE = 'discussion_links'
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

console.log(`Migration posts-020 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

/* ── 1. Die Rückverweis-Tabelle ────────────────────────────────────────── */

// `Permission.create(Role.users())` wie bei den Reaktionen: angelegt wird eine
// Zeile immer im Namen eines angemeldeten Menschen, der gerade schreibt.
// `rowSecurity: true`, das Lese-Publikum steht an der Zeile (Datentür).
await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId, tableId: TABLE, name: 'Discussion Links',
  permissions: [Permission.create(Role.users())], rowSecurity: true,
}))

const cols = await existingColumnKeys(TABLE)

await columnStep(`Column ${TABLE}.communityId`, 'communityId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'communityId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.sourceId`, 'sourceId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'sourceId', size: 36, required: false, xdefault: '',
}))
await columnStep(`Column ${TABLE}.targetId`, 'targetId', cols, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE, key: 'targetId', size: 36, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

await indexStep(`Unique-Index ${TABLE}.uq_source_target`, {
  tableId: TABLE, key: 'uq_source_target', type: TablesDBIndexType.Unique,
  columns: ['sourceId', 'targetId'],
})
await indexStep(`Index ${TABLE}.idx_community_target`, {
  tableId: TABLE, key: 'idx_community_target', type: TablesDBIndexType.Key,
  columns: ['communityId', 'targetId'],
})
await indexStep(`Index ${TABLE}.idx_community_source`, {
  tableId: TABLE, key: 'idx_community_source', type: TablesDBIndexType.Key,
  columns: ['communityId', 'sourceId'],
})

/* ── 2. Der mitschreibende Zähler ──────────────────────────────────────── */

// `min: 0` wie bei allen Zählern: Appwrite WEIST ein Herunterzählen unter 0
// ab, statt zu kappen — die Spalte ist das Netz, der Schreibweg die Regel.
const counterCols = await existingColumnKeys(COUNTERS_TABLE)
await columnStep(`Column ${COUNTERS_TABLE}.linksMade`, 'linksMade', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'linksMade', required: false, min: 0, xdefault: 0,
}))
await waitForColumns(COUNTERS_TABLE)

console.log('✔ Migration posts-020 fertig')
console.log('  Neu: Tabelle discussion_links (Rückverweis-Index, 3 Indizes)')
console.log('  Neu: member_counters.linksMade (Start 0, nie geeicht — trägt first-link)')
