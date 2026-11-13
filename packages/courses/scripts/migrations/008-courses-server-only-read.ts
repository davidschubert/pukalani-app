/**
 * courses-008 — KURS-ZEILEN OHNE LESERECHT (SEC-029, Davids Entscheidung
 * 2026-11-13).
 *
 * Bis hierher trug jeder VERÖFFENTLICHTE Kurs `read("users")`. Seit SEC-029
 * gilt für `courses` dasselbe Modell wie für `pages` und `lessons`: die Zeile
 * trägt kein Leserecht, ausgeliefert wird nur über die Routen (Operator-Klinke,
 * Feldauswahl der Vorschau, Mitglieder-Wache für alles Weitere). Diese
 * Migration räumt den BESTAND ab.
 *
 * ── WAS SIE TUT ───────────────────────────────────────────────────────────
 * Ein Cursor-Lauf über ALLE Zeilen von `courses`, mandantenübergreifend
 * (Migrationen stehen außerhalb der Datentür). Entfernt werden ausschließlich
 * Leserechte breiter Rollen — `read("users")`, `read("any")`,
 * `read("guests")`, `read("label:…")`; die Regel steht pur und getestet in
 * `../lib/broadReadPermissions.ts`. Jeder andere Eintrag bleibt stehen. Keine
 * Daten-Felder, nichts wird gelöscht.
 *
 * WIEDERHOLBAR: eine Zeile ohne solche Rechte zählt als „bereits im
 * Zielzustand" und wird nicht geschrieben. `DRY_RUN=1` zählt nur.
 *
 * DAZU, NUR LESEND (Warnung mit Anzahl, keine Änderung):
 *  - `lessons` trägt keine breiten Leserechte,
 *  - `enrollments`/`lesson_progress` tragen höchstens `read("user:…")`,
 *  - die TABELLEN-Rechte von `courses`/`lessons` sind leer.
 *
 * Die Ausgabe nennt nur Zahlen und — bei Fehlern — Row-Ids, nie Titel oder
 * andere Inhalte.
 *
 * ── REIHENFOLGE: ERST CODE AUSLIEFERN, DANN MIGRATION ─────────────────────
 * Der neue Code liest Kurse über die Operator-Klinke und braucht diese
 * Migration nicht. Der ALTE Code las den Katalog mit dem Session-Client — lief
 * die Migration vor dem Deploy, zeigte er bis dahin einen leeren Katalog.
 *
 * Aufruf: pnpm migrate --app <app> --layer courses   (Probe: DRY_RUN=1 davor)
 * ZIEL-INSTANZEN: wie courses-007 — jede Instanz mit courses-Layer (Prod heute
 * `platform`/Pool; lokal zusätzlich das Dev-Projekt der comments-App).
 */
import { Client, Query, TablesDB, type Models } from 'node-appwrite'
import { onlyOwnUserReads, splitBroadReads } from '../lib/broadReadPermissions.ts'

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

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const PAGE = 100

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function errorText(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return `Code ${String(error.code)}`
  return error instanceof Error ? error.name : 'unbekannt'
}

/** Alle Zeilen einer Tabelle seitenweise; `null`, wenn es die Tabelle nicht gibt. */
async function forEachRow(tableId: string, visit: (row: Models.Row) => Promise<void>): Promise<boolean> {
  let cursor: string | null = null
  for (;;) {
    let page: Models.RowList<Models.Row>
    try {
      page = await tablesDB.listRows({
        databaseId: databaseId!,
        tableId,
        queries: [Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
      })
    }
    catch (error) {
      if (hasCode(error, 404)) return false
      throw error
    }
    if (page.rows.length === 0) break
    for (const row of page.rows) await visit(row)
    cursor = page.rows.at(-1)?.$id ?? null
    if (page.rows.length < PAGE) break
  }
  return true
}

console.log(`Migration courses-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}${DRY_RUN ? ' (DRY_RUN — nur zählen)' : ''}`)

// ── 1. courses: breite Leserechte entfernen ─────────────────────────────────
let read = 0
let changed = 0
let alreadyDone = 0
const failedIds: string[] = []

const coursesExist = await forEachRow('courses', async (row) => {
  read++
  const { kept, removed } = splitBroadReads(row.$permissions)
  if (removed.length === 0) {
    alreadyDone++
    return
  }
  if (DRY_RUN) {
    changed++
    return
  }
  try {
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: 'courses', rowId: row.$id, permissions: kept })
    changed++
  }
  catch (error) {
    failedIds.push(row.$id)
    console.error(`✗ courses/${row.$id}: Rechte nicht geschrieben (${errorText(error)})`)
  }
})

if (!coursesExist) {
  console.log('↷ Tabelle courses fehlt — courses-001 zuerst ausführen. Nichts zu tun.')
  process.exit(0)
}

console.log(`${DRY_RUN ? '◌' : '✔'} courses: ${read} gelesen / ${changed} ${DRY_RUN ? 'würden geändert' : 'geändert'} / ${alreadyDone} bereits im Zielzustand / ${failedIds.length} fehlgeschlagen`)

// ── 2. Nur lesend: die Nachbar-Tabellen ─────────────────────────────────────
let warnings = 0

let broadLessons = 0
await forEachRow('lessons', async (row) => {
  if (splitBroadReads(row.$permissions).removed.length > 0) broadLessons++
})
if (broadLessons > 0) {
  warnings++
  console.warn(`⚠ lessons: ${broadLessons} Zeile(n) mit breitem Leserecht — erwartet: keine. Nicht geändert.`)
}

for (const tableId of ['enrollments', 'lesson_progress']) {
  let deviating = 0
  await forEachRow(tableId, async (row) => {
    if (!onlyOwnUserReads(row.$permissions)) deviating++
  })
  if (deviating > 0) {
    warnings++
    console.warn(`⚠ ${tableId}: ${deviating} Zeile(n) mit mehr als read("user:…") — nicht geändert.`)
  }
}

for (const tableId of ['courses', 'lessons']) {
  const table = await tablesDB.getTable({ databaseId: databaseId!, tableId }).catch((error: unknown) => {
    if (hasCode(error, 404)) return null
    throw error
  })
  if (table && table.$permissions.length > 0) {
    warnings++
    console.warn(`⚠ Tabelle ${tableId}: ${table.$permissions.length} Tabellen-Recht(e) gesetzt — erwartet: keine. Nicht geändert.`)
  }
}

if (warnings === 0) console.log('✔ lessons/enrollments/lesson_progress und Tabellen-Rechte wie erwartet')

if (failedIds.length > 0) {
  console.error(`✗ Migration courses-008 UNVOLLSTÄNDIG — ${failedIds.length} Zeile(n) offen. Erneut ausführen.`)
  process.exit(1)
}
console.log(`✔ Migration courses-008 ${DRY_RUN ? 'geprüft (DRY_RUN)' : 'fertig'} — Kurs-Zeilen tragen kein breites Leserecht.`)
