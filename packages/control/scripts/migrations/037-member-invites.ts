/**
 * Migration control-037: EINLADUNGEN DURCH MITGLIEDER (F57 Mechanik 2).
 *
 * Davids Zuschnitt vom 2026-08-14: **5 Einladungen pro Woche je Mitglied** (ab
 * Rolle Leser/in), **je Community vom Owner abschaltbar**, Zahl als
 * Config-Wert. Diese Migration bringt die zwei Dinge, die dafür in der
 * Datenbank fehlen — EINE Spalte und EIN Index. Nichts Zerstörerisches,
 * idempotent (409 → skip).
 *
 *  1. `communities.memberInvitesEnabled` — der Schalter des Owners.
 *  2. `community_invites.idx_community_inviter` — der Index, über den das
 *     Kontingent gezählt wird.
 *
 * ── MUSS VOR DEM CODE-DEPLOY LAUFEN ────────────────────────────────────────
 * `createRow<TenantRow>` nennt ALLE Spalten explizit (CLAUDE.md) — sobald der
 * Code `memberInvitesEnabled` kennt, bricht das ANLEGEN einer Community gegen
 * ein Schema ohne die Spalte. Betroffen sind BEIDE Anlegestellen
 * (`server/api/control/tenants/index.post.ts` +
 * `server/utils/onboardingProvision.ts`). Dieselbe Reihenfolge-Pflicht wie bei
 * control-035.
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE ────────────────────────────────────
 * `communities` und `community_invites` leben AUSSCHLIESSLICH im
 * Control-Plane-Projekt. Anders als eine `system`-Migration gehört diese
 * NICHT auf jede Instanz gefahren, und `ops:schema-parity` sieht sie nicht
 * (der Wächter vergleicht die `system`-Tabellen).
 *
 * ── WARUM DER INDEX NICHT OPTIONAL IST ─────────────────────────────────────
 * Das Kontingent fragt „wie viele Zeilen hat DIESE Person in DIESER Community
 * in den letzten sieben Tagen erzeugt" — also `communityId` + `invitedBy`,
 * danach ein Zeitfenster auf `$createdAt`. Die drei bestehenden Indizes
 * (`uq_token`, `idx_community_status`, `idx_community_email`) decken
 * `invitedBy` nicht ab; ohne diesen hier läuft die Zählung über einen
 * Full-Scan der Tabelle, und zwar bei JEDEM Einladungs-Versuch.
 *
 * `$createdAt` steht BEWUSST NICHT im Index: Appwrite verwaltet die
 * System-Spalte selbst, sie ist nicht als Index-Spalte adressierbar. Der
 * Zeitfilter arbeitet deshalb auf dem Ergebnis der beiden anderen — das ist
 * billig, weil eine Person je Community nie viele Einladungen hat (genau das
 * setzt die Mechanik ja durch).
 *
 * ── WARUM KEINE ZÄHLER-SPALTE ──────────────────────────────────────────────
 * Naheliegend wäre ein Feld `invitesThisWeek` an der Mitgliedschaft. Verworfen:
 * ein Zähler braucht jemanden, der ihn zurücksetzt (Sweep, Cron, Zeitstempel-
 * Vergleich), und ein rollierendes Fenster hat keinen Moment, in dem „die
 * Woche vorbei" ist. Die Zeilen tragen ihr Datum selbst; sie zu zählen ist die
 * Wahrheit, ein Zähler daneben wäre eine Kopie davon.
 *
 *   pnpm migrate --app control --layer control
 */
import '../../../../scripts/lib/assert-target.mjs'
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const COMMUNITIES = 'communities'
const INVITES = 'community_invites'

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

console.log(`Migration control-037 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// ── 1. Der Schalter des Owners ──────────────────────────────────────────────
// `xdefault: true` für NEUE Rows; BESTANDS-Rows bekommen von Appwrite keinen
// Backfill und bleiben `null`. Genau dafür gibt es
// `resolveTenantMemberInvitesEnabled()` (fail-open) — dieselbe Bauart wie
// `openRegistration` (control-018), inklusive derselben Falle: wer die Spalte
// je direkt mit `=== true` vergleicht, schaltet jede Bestands-Community ab.
const communityCols = await existingColumnKeys(COMMUNITIES)
await columnStep(`Column ${COMMUNITIES}.memberInvitesEnabled`, 'memberInvitesEnabled', communityCols, () => tablesDB.createBooleanColumn({
  databaseId: db, tableId: COMMUNITIES, key: 'memberInvitesEnabled', required: false, xdefault: true,
}))
await waitForColumns(COMMUNITIES, ['memberInvitesEnabled'])

// ── 2. Der Index für die Kontingent-Zählung ─────────────────────────────────
// Über die Fabrik aus indexRetry.mts (Pflicht, CLAUDE.md): sie ruft
// `createIndex` selbst und bringt Retry + Cache-Anstoß mit. Rohes
// `tablesDB.createIndex` in Migrations-Scripts verbietet ESLint.
//
// `invitedBy` existiert seit control-019 (damals `site_invites`) und wird von
// `members/invite.post.ts` seit jeher geschrieben — die Spalte muss also nicht
// angelegt werden, sie war nur nie durchsuchbar.
await indexStep(`Index ${INVITES}.idx_community_inviter`, {
  tableId: INVITES, key: 'idx_community_inviter', type: TablesDBIndexType.Key,
  columns: ['communityId', 'invitedBy'],
})

console.log('✔ Migration control-037 fertig')
console.log('  Neu: communities.memberInvitesEnabled (Default AN, Bestand = null ⇒ fail-open)')
console.log('  Neu: community_invites.idx_community_inviter (Kontingent-Zählung)')
