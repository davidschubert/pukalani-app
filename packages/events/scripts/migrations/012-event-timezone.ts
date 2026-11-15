/**
 * Migration events-012: die Zeitzone eines Termins (2026-08-17).
 *
 * AUSSCHLIESSLICH ADDITIV — EINE Spalte, keine Tabelle, kein Index:
 * - events.timezone (string 64, optional) — IANA-Name (`Europe/Berlin`);
 *   '' bzw. null heißt „keine Zone hinterlegt".
 *
 * WARUM EINE SPALTE UND NICHT NUR EIN FORMULARFELD: `startAt` ist ein absoluter
 * Zeitpunkt und reicht für einen EINZELNEN Termin völlig. Für eine SERIE reicht
 * er nicht. „Jeden Dienstag 08:30" ist eine Aussage über die WANDUHR eines
 * Ortes, und die hat keinen festen UTC-Abstand: an der Zeitumstellung sind es
 * 167 oder 169 Stunden statt 168. Ohne diese Spalte konnte die Expansion nur
 * feste UTC-Wochen addieren — gemessen am 2026-08-17:
 *
 *     Woche  9  2026-10-20T06:30Z → 20.10. 08:30 Hamburg
 *     Woche 10  2026-10-27T06:30Z → 27.10. 07:30 Hamburg   ← still verschoben
 *
 * Genau deshalb speichert RFC 5545 (iCalendar) bei Wiederholungen Ortszeit plus
 * Zonen-Id statt UTC-Abstände. Die Regel dazu steht pur in
 * `shared/eventRecurrence.ts`, die Spalte ist ihre Datengrundlage.
 *
 * KEIN INDEX, und das ist eine Entscheidung: über `timezone` wird nie gefiltert
 * oder sortiert — der Wert wird gelesen, nachdem die Zeile ohnehin geladen ist
 * (Serien-Expansion, Formular-Vorbelegung). Ein Index kostete Schreiblast für
 * nichts. Käme je „alle Termine dieser Zone" dazu, gehörte er über
 * `createIndexSteps` aus `scripts/migrations-lib/indexRetry.mts` angelegt — NIE
 * über ein rohes `tablesDB.createIndex` (ESLint verbietet es genau deshalb).
 *
 * BESTANDSZEILEN BLEIBEN LEER, und sie werden NICHT nachträglich gefüllt: eine
 * geratene Zone wäre schlimmer als keine. Ohne Zone rechnet die Expansion in
 * UTC weiter — stabil, nur ohne Ortsbezug; die Begründung steht im Kopf von
 * `eventRecurrence.ts`. Wer eine Bestandsserie auf Ortszeit heben will, setzt
 * die Zone einmal am Master.
 *
 *   pnpm migrate --app <app> --layer events
 *
 * ⚠️ REIHENFOLGE IN PROD: ERST migrieren, DANN den Code deployen.
 * Andersherum legt der erste Termin nach dem Deploy eine Zeile mit einem Feld
 * an, das die Tabelle nicht kennt — Appwrite lehnt unbekannte Felder ab und
 * antwortet `400 row_invalid_structure` (derselbe Fehler, an dem der Ticket-Kauf
 * bei der E8-3-Umbenennung endlos wiederholte). Die Migration VORHER ist
 * gefahrlos: eine optionale Spalte, die niemand liest, tut nichts.
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
/**
 * Auf 'available' warten, bevor die Migration „fertig" meldet — sonst schreibt
 * der erste Termin in eine Spalte, die es noch nicht ganz gibt. Ein Index folgt
 * hier NICHT, der Cache-Anstoß aus indexRetry.mts ist also nicht nötig (die
 * physische Spalte existiert vor ihrem Status).
 */
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration events-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const eventCols = await existingColumnKeys('events')
if (eventCols.size === 0) {
  console.log('↷ Table events fehlt — events-001 zuerst ausführen. Nichts zu tun.')
  process.exit(0)
}

// 64 Zeichen: der längste IANA-Name liegt bei gut 30 (`America/Argentina/
// ComodRivadavia`) — doppelt so viel Platz kostet bei einem Varchar nichts und
// erspart eine zweite Migration, falls die tzdb je längere Namen aufnimmt.
await columnStep('Column events.timezone', 'timezone', eventCols, () => tablesDB.createStringColumn({
  databaseId, tableId: 'events', key: 'timezone', size: 64, required: false,
}))

await waitForColumns('events')

console.log('✔ Migration events-012 fertig — Serien können in Ortszeit rechnen.')
