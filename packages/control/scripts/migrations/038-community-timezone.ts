/**
 * Migration control-038: DIE HEIMAT-ZEITZONE EINER COMMUNITY (2026-08-17).
 *
 * Davids Entscheidung: eine Community hat einen Heimatort, und Termin-Zeiten
 * sind per Definition Community-Zeit. Der Organisator tippt „19:00" und meint
 * immer die Zeit der Gruppe — egal, wo er selbst gerade sitzt. Genau das
 * Meetup-Modell; Eventbrite verfeinert es beim Anlegen über den Ort, und diese
 * Spalte ist die Ebene DARÜBER.
 *
 * AUSSCHLIESSLICH ADDITIV — EINE Spalte, kein Index:
 * - `communities.timezone` (varchar 64, optional, Default '') — IANA-Name
 *   (`Europe/Berlin`); '' heißt „keine eigene Wahl".
 *
 * ── WARUM ÜBERHAUPT ────────────────────────────────────────────────────────
 * Ohne sie kam die Vorgabe aus dem BROWSER dessen, der das Formular ausfüllt.
 * Live erlebt am 2026-08-17 auf freelancer.supply: ein Betreiber in Honolulu
 * legte den „Freelancer-Stammtisch Hamburg" für 19:00 an — gespeichert wurde
 * 05:00 UTC, in Hamburg also **07:00 morgens**. Das Feld war nicht kaputt
 * (`datetime-local` meint immer die Zeit des Tippenden); es fehlte die Ebene,
 * die sagt, WESSEN Zeit gemeint ist. Kein Anbieter nimmt dafür die
 * Browser-Zone: Meetup nimmt die Gruppe, Eventbrite den Ort, Google Calendar
 * und Zoom die Konto-Einstellung.
 *
 * ── SIE ERSETZT NICHT DIE KONTO-ZONE ───────────────────────────────────────
 * `prefs.timezone` (U15 Teil 5) bleibt, was sie ist: wie ein EINZELNER MENSCH
 * Zeiten ANGEZEIGT bekommt. Diese Spalte sagt, in welcher Zone die Community
 * PLANT. Zwei verschiedene Fragen — deshalb zwei Werte, nicht einer.
 *
 * ── KEIN INDEX, und das ist eine Entscheidung ──────────────────────────────
 * Über `timezone` wird nie gefiltert oder sortiert; der Wert wird gelesen,
 * nachdem der Resolver die Row ohnehin geladen hat (30-s-Cache). Ein Index
 * kostete Schreiblast für nichts. Käme je eine solche Abfrage dazu, gehörte er
 * über `createIndexSteps` aus `scripts/migrations-lib/indexRetry.mts` angelegt
 * — NIE über ein rohes `tablesDB.createIndex` (ESLint verbietet es deshalb).
 *
 * ── MUSS VOR DEM CODE-DEPLOY LAUFEN ────────────────────────────────────────
 * `createRow<TenantRow>` nennt ALLE Spalten explizit (CLAUDE.md) — sobald der
 * Code `timezone` kennt, bricht das ANLEGEN einer Community gegen ein Schema
 * ohne die Spalte. Betroffen sind BEIDE Anlegestellen
 * (`server/api/control/tenants/index.post.ts` +
 * `server/utils/onboardingProvision.ts`). Dieselbe Reihenfolge-Pflicht wie bei
 * control-035 und control-037.
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE ────────────────────────────────────
 * `communities` lebt AUSSCHLIESSLICH im Control-Plane-Projekt. Anders als eine
 * `system`-Migration gehört diese NICHT auf jede Instanz gefahren, und
 * `ops:schema-parity` sieht sie nicht (der Wächter vergleicht die
 * `system`-Tabellen; `communities` liegt auf dem Pool nur als eingefrorener
 * Alt-Schatten, s. control-037).
 *
 * ── BESTANDSZEILEN BLEIBEN '' ──────────────────────────────────────────────
 * Kein Backfill, und das ist Absicht: eine geratene Zone wäre schlimmer als
 * keine. '' heißt „keine eigene Wahl", und dann verhält sich alles wie bisher
 * (die Vorgabe kommt aus dem Gerät des Ausfüllenden, sichtbar beschriftet).
 * Aus dem Heimatort ließe sie sich nicht ableiten — den kennt die Row nicht.
 *
 *   pnpm migrate --app control --layer control
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, Query, TablesDB } from 'node-appwrite'

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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const COMMUNITIES = 'communities'

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
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
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

async function waitForColumns(tableId: string, keys: string[]) {
  for (let i = 0; i < 300; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const wanted = columns.filter(column => keys.includes(column.key))
    if (wanted.length === keys.length && wanted.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns ${keys.join(', ')} von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-038 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// 64 Zeichen: der längste IANA-Name liegt bei gut 30 (`America/Argentina/
// ComodRivadavia`) — doppelt so viel Platz kostet bei einem Varchar nichts und
// erspart eine zweite Migration, falls die tzdb je längere Namen aufnimmt.
// `xdefault: ''` gilt für NEUE Rows; Bestands-Rows bleiben null, und der Leser
// behandelt null wie '' (dieselbe Bauart wie `neutral`, control-020).
const communityCols = await existingColumnKeys(COMMUNITIES)
await columnStep(`Column ${COMMUNITIES}.timezone`, 'timezone', communityCols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'timezone', size: 64, required: false, xdefault: '',
}))
await waitForColumns(COMMUNITIES, ['timezone'])

console.log('✔ Migration control-038 fertig — Communities können ihre Heimat-Zeitzone setzen.')
