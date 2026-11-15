/**
 * posts-021 — WER HAT WEN HERGEHOLT, UND WIE WEIT IST ER GEKOMMEN
 * (F57-Stufen, Davids Entscheidung 2026-08-14).
 *
 * VIER additive Spalten auf `member_counters`, nichts Zerstoererisches,
 * idempotent (409 → skip):
 *
 *  - `invitedBy`      (String 36) — die Runtime-Ablage von
 *                     `community_invites.invitedBy`, gestempelt bei der
 *                     ANNAHME. `''` = selbst gekommen oder Alt-Bestand.
 *  - `inviteesBasic`  (Integer)   — wie viele Eingeladene Stufe 1 („Basic")
 *                     erreicht haben. Der Zaehler hinter `campaigner` (3).
 *  - `inviteesMember` (Integer)   — dasselbe fuer Stufe 2 („Member"). Der
 *                     Zaehler hinter `champion` (5).
 *  - `likeLimitDay`   (String 10) — der UTC-Tag, fuer den `likeLimitDays`
 *                     zuletzt hochgezaehlt wurde. `''` = noch nie.
 *
 * ── WARUM `invitedBy` IN DER RUNTIME LIEGT, OBWOHL ES DIE WAHRHEIT SCHON GIBT
 * Die Wahrheit steht in `community_invites` im CONTROL PLANE — einem anderen
 * Appwrite-Projekt, zu dem die Runtime keinen Schluessel hat. Die zwei
 * Abzeichen haengen aber am STUFEN-AUFSTIEG des Eingeladenen, und der passiert
 * mitten im Schreibpfad: dort eine Naht ueber die Projektgrenze zu oeffnen,
 * fuer eine Antwort, die sich NIE aendert, waere der teuerste denkbare Weg.
 * Die Annahme-Route bekommt `invitedBy` ohnehin zurueck (sie zaehlt damit
 * schon `invitesAccepted` fuer `promoter`) — sie hinterlegt es hier gleich
 * mit. Ein Schreibvorgang, einmal im Leben einer Mitgliedschaft.
 *
 * ── KEIN INDEX, UND DAS IST KEINE NACHLAESSIGKEIT ─────────────────────────
 * Gelesen wird `invitedBy` ausschliesslich ueber die Zeile EINES Menschen (die
 * seine, beim eigenen Aufstieg) — die findet `uq_community_user` (posts-013).
 * Die Gegenfrage „wen habe ICH alles eingeladen" wird hier NIE gestellt: sie
 * waere die N+1-Variante, gegen die diese Ablage gebaut ist. Ein Index waere
 * Schreiblast ohne Leser.
 *
 * ── BESTAND STARTET BEI NULL, UND DAS MUSS MAN AUSSPRECHEN ────────────────
 * Beide Zaehler werden NIE geeicht, und diesmal fehlen gleich ZWEI Quellen:
 * die Zuordnung liegt im Control Plane (unerreichbar), und die Stufen der
 * Eingeladenen liegen in DEREN Zeilen (ein Lauf ueber alle Mitglieder je
 * Einladendem). Wer vor diesem Paket zwanzig Leute hergeholt hat, faengt bei 0
 * an — wie schon bei „Editor", „Promoter" und den Like-Limit-Tagen.
 *
 * `likeLimitDay` ist die Sicherung fuer eine Zusage, die seit der Staffel
 * nicht mehr von allein haelt: „an einem Tag genau einmal". Steigt jemand
 * MITTEN AM TAG eine Stufe auf, waechst sein Kontingent von 50 auf 75 — und
 * die Gleichheit `likesToday === limit` traefe an EINEM Nachmittag zweimal.
 * Die Spalte haelt den bereits gebuchten Tag fest.
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

console.log(`Migration posts-021 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const counterCols = await existingColumnKeys(COUNTERS_TABLE)

// 36 Zeichen wie jede Appwrite-Nutzer-Id, und wie `community_invites.invitedBy`
// im Control Plane (control-019/023). Nicht `required`: die allermeisten Zeilen
// gehoeren Menschen, die niemand eingeladen hat.
await columnStep(`Column ${COUNTERS_TABLE}.invitedBy`, 'invitedBy', counterCols, () => tablesDB.createStringColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'invitedBy', size: 36, required: false, xdefault: '',
}))
// `min: 0` wie bei allen Zaehlern: Appwrite WEIST ein Herunterzaehlen unter 0
// ab, statt zu kappen — die Spalte ist das Netz, der Schreibweg die Regel.
await columnStep(`Column ${COUNTERS_TABLE}.inviteesBasic`, 'inviteesBasic', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'inviteesBasic', required: false, min: 0, xdefault: 0,
}))
await columnStep(`Column ${COUNTERS_TABLE}.inviteesMember`, 'inviteesMember', counterCols, () => tablesDB.createIntegerColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'inviteesMember', required: false, min: 0, xdefault: 0,
}))
// Wie `likeDay` (posts-019) bewusst ein STRING und kein Datetime: verglichen
// wird auf Gleichheit mit einem serverseitig gebildeten Schluessel, nie auf
// „vorher/nachher".
await columnStep(`Column ${COUNTERS_TABLE}.likeLimitDay`, 'likeLimitDay', counterCols, () => tablesDB.createStringColumn({
  databaseId, tableId: COUNTERS_TABLE, key: 'likeLimitDay', size: 10, required: false, xdefault: '',
}))
await waitForColumns(COUNTERS_TABLE)

console.log('✔ Migration posts-021 fertig')
console.log('  Neu: member_counters.invitedBy (gestempelt bei der Annahme, erste Einladung gewinnt)')
console.log('  Neu: member_counters.inviteesBasic/.inviteesMember (Start 0, nie geeicht — tragen campaigner/champion)')
console.log('  Neu: member_counters.likeLimitDay (haelt „genau einmal je Tag", seit das Limit staffelt)')
