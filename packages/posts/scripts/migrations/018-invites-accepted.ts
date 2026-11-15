/**
 * posts-018 — DER ZAEHLER HINTER „PROMOTER" (F57 Mechanik 2, Davids
 * Entscheidung 2026-08-14).
 *
 * EINE additive Spalte: `member_counters.invitesAccepted` — wie viele der
 * eigenen Einladungen jemand ANGENOMMEN bekommen hat. Sie traegt das Abzeichen
 * `promoter` (erste angenommene Einladung). Nichts Zerstoererisches, idempotent
 * (409 → skip).
 *
 * ── WARUM DIE ZAHL HIER LIEGT UND NICHT IM CONTROL PLANE ──────────────────
 * Die EINLADUNGEN liegen dort (`community_invites`), die Zaehler liegen hier —
 * und das bleibt so. `member_counters` ist die Zeile, gegen die der
 * Abzeichen-Katalog rechnet; eine zweite Zaehl-Quelle in einem anderen Projekt
 * haette bedeutet, dass die Abzeichen-Auswertung bei jedem Hinsehen ueber die
 * Service-Naht muss. Gemeldet wird die Annahme deshalb von der Runtime-Route,
 * die sie ohnehin abwickelt (`/api/community/members/accept`), ueber denselben
 * `recordUserCounterEvents`-Vertrag wie jede andere Zaehl-Buchung.
 *
 * ── SIE WIRD NIE GEEICHT, UND DAS IST KEINE LUECKE ────────────────────────
 * `seedValuesFrom` kann nur, was sich aus dem BESTAND ausrechnen laesst.
 * Die Quellzeilen liegen in einem ANDEREN PROJEKT, zu dem die Runtime keinen
 * Schluessel hat — ein Aggregat gibt es hier also grundsaetzlich nicht, nicht
 * nur „noch nicht". Damit steht `invitesAccepted` genau dort, wo `edits` schon
 * steht: rein mitschreibend, Start bei 0 fuer alle, `counterFellBehind` und
 * `healedValues` fassen sie nicht an.
 *
 * DAS MUSS MAN AUSSPRECHEN: das Abzeichen zaehlt AB JETZT. Wer vor dieser
 * Migration jemanden hergeholt hat, ist davon nicht zu unterscheiden — genau
 * wie beim „Editor". Ein Backfill waere auch mit Schluessel keine Loesung: die
 * Annahmen von vor dem 2026-08-14 stammen ausnahmslos aus Team-Einladungen,
 * fuer die es das Abzeichen nie gab.
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

console.log(`Migration posts-018 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// KEIN Index: gelesen wird die Spalte immer ueber die Zeile eines EINZELNEN
// Menschen, und die findet `uq_community_user` (posts-013). Eine Frage wie
// „wer hat die meisten geworben" gibt es nicht — es gibt keine Bestenliste.
const counterCols = await existingColumnKeys(COUNTERS_TABLE)
await columnStep(`Column ${COUNTERS_TABLE}.invitesAccepted`, 'invitesAccepted', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'invitesAccepted', required: false, min: 0, xdefault: 0,
}))
await waitForColumns(COUNTERS_TABLE)

console.log('✔ Migration posts-018 fertig')
console.log('  Neu: member_counters.invitesAccepted (Start 0, nie geeicht — traegt `promoter`)')
