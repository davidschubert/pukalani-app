/**
 * Migration control-040: EIGENE DOMAIN NUR MIT FREIGABE, MIT FRIST UND
 * ABSCHALTEN (SEC-022, BE-014 — Davids Entscheidungen vom 2026-11-16).
 *
 * Bis hierher reichte der Plan Pro beim Eintragen, Prüfen und Freischalten —
 * und die Testphase läuft mit Plan `pro`. Danach sah niemand mehr auf den
 * Plan: eine einmal aktive Domain blieb aktiv, auch ohne Abo. Und ein bloßer
 * Eintrag ohne Nachweis sperrte die Domain für jede andere Community.
 *
 * Jetzt gilt (Regel pur in `shared/customDomain.ts`, `customDomainEntitlement`):
 *  - eine eigene Domain gibt es nur mit Pro, NICHT in der Testphase und nur
 *    mit der Freigabe des Betreibers je Community;
 *  - endet Testphase oder Abo, bleibt eine aktive Domain 14 Tage aktiv und
 *    wird danach ABGESCHALTET (Status `paused`) — gelöscht wird nichts;
 *  - ein Eintrag ohne Nachweis verfällt nach 14 Tagen und blockiert niemanden.
 *
 * FÜNF OPTIONALE SPALTEN an `communities`, kein Index (gefiltert wird über
 * keine davon; gelesen werden sie, nachdem die Zeile ohnehin geladen ist):
 *  - `customDomainApproved` (boolean, ohne Default ⇒ `null` = nicht
 *    freigegeben) — die Freigabe gehört der COMMUNITY, nicht der Domain:
 *    „Domain entfernen" lässt sie stehen.
 *  - `customDomainApprovedAt` (datetime) — wann freigegeben.
 *  - `customDomainClaimedAt` (datetime) — wann die Domain eingetragen wurde;
 *    daran misst sich der Verfall eines Eintrags ohne Nachweis.
 *  - `customDomainGraceEndsAt` (datetime) — Ende der Frist nach Plan-Ende;
 *    `null` = keine Frist läuft.
 *  - `customDomainPausedAt` (datetime) — wann abgeschaltet.
 *
 * ── MUSS VOR DEM CODE-DEPLOY LAUFEN ────────────────────────────────────────
 * `createRow<TenantRow>` nennt ALLE Spalten explizit (CLAUDE.md) — sobald der
 * Code die fünf Spalten kennt, bricht das ANLEGEN einer Community gegen ein
 * Schema ohne sie. Betroffen sind BEIDE Anlegestellen
 * (`server/api/control/tenants/index.post.ts` +
 * `server/utils/onboardingProvision.ts`). Dieselbe Reihenfolge-Pflicht wie bei
 * control-035, -037 und -038.
 *
 * ── BESTANDSZEILEN ─────────────────────────────────────────────────────────
 * Die Migration schreibt KEINE Daten. Heute aktive Domains übernimmt danach
 * einmal `scripts/backfill-custom-domain-approval.mjs` als freigegeben (erst
 * zählen, dann `--apply`) — ohne diesen Lauf zählen sie nicht als freigegeben,
 * bleiben aber aktiv (die Spalten sind nur Regeln für das NÄCHSTE Prüfen).
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE ────────────────────────────────────
 * `communities` lebt ausschließlich im Control-Plane-Projekt (s. control-038).
 *
 *   pnpm migrate --app control --only control-040
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

console.log(`Migration control-040 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

const cols = await existingColumnKeys(COMMUNITIES)

// KEIN Default: `null` heißt „nicht freigegeben", genau wie `false`. Ein
// Default `false` hätte für Bestandszeilen ohnehin nichts geändert (Appwrite
// backfillt Defaults nicht) — so gibt es nur EINE Lesart: `=== true`.
await columnStep(`Column ${COMMUNITIES}.customDomainApproved`, 'customDomainApproved', cols, () => tablesDB.createBooleanColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainApproved', required: false,
}))
await columnStep(`Column ${COMMUNITIES}.customDomainApprovedAt`, 'customDomainApprovedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainApprovedAt', required: false,
}))
await columnStep(`Column ${COMMUNITIES}.customDomainClaimedAt`, 'customDomainClaimedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainClaimedAt', required: false,
}))
await columnStep(`Column ${COMMUNITIES}.customDomainGraceEndsAt`, 'customDomainGraceEndsAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainGraceEndsAt', required: false,
}))
await columnStep(`Column ${COMMUNITIES}.customDomainPausedAt`, 'customDomainPausedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'customDomainPausedAt', required: false,
}))

await waitForColumns(COMMUNITIES, [
  'customDomainApproved',
  'customDomainApprovedAt',
  'customDomainClaimedAt',
  'customDomainGraceEndsAt',
  'customDomainPausedAt',
])

console.log('✔ Migration control-040 fertig — 5 Spalten an communities (Freigabe, Eintragsdatum, Frist, Abschaltung).')
