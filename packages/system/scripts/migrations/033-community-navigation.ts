/**
 * Migration system-033: Table `community_navigation` — das öffentliche MENÜ
 * einer Community, so wie ihr Owner es zusammengestellt hat (U15 Teil 1).
 *
 * EINE Row pro Community, rowId = `communities.$id` (= `useSiteId()`), Inhalt =
 * EIN JSON-Dokument in `config`. Geschrieben ausschliesslich server-seitig
 * (packages/pages/server/utils/communityNavigationStore.ts) hinter
 * `requireCommunityPermission(event, 'branding.manage')`; gelesen SSR-seitig
 * beim Seitenaufbau (30 s Microcache). Vertrag, Auflösungsregel und die
 * Begründung der Feld-Form: packages/core/shared/communityNavigation.ts.
 *
 * FORM ÜBERNOMMEN VON `community_branding` (system-028): dieselbe Gestalt —
 * eine Infrastruktur-Zeile ÜBER eine Community, deren rowId die Community IST.
 * Damit gilt hier auch dieselbe Begründung dafür, dass sie NICHT durch die
 * Datentür geschrieben wird (`tenantDb` würde eine `communityId` stempeln, die
 * schon die rowId ist, Row-Permissions auf eine bewusst table-weit gelesene
 * Tabelle legen und über die Türklinke 'member' einen A5-Beitritt auslösen).
 * Nachzulesen im Kopf des Stores.
 *
 * PERMISSIONS: **KEINE** — `permissions: []`, `rowSecurity: false`. Weder
 * `read(any)` noch sonst ein Client-Recht. Gelesen und geschrieben wird
 * ausschliesslich server-seitig mit dem Admin-Key.
 *
 * ── DAS IST DIE ABWEICHUNG VON system-028, UND SIE IST GEWOLLT ────────────
 * Der Branding-Spiegel MUSS `read(any)` tragen: dort ist der Browser der
 * Leser, er abonniert seine Row per Realtime. Hier ist er es nicht — das Menü
 * wird beim SSR-Aufbau in das HTML gerendert und kommt fertig beim Besucher
 * an. Ein Lese-Recht, das heute niemand benutzt, ist kein Komfort, sondern
 * eine offene Tür: die Tabelle wäre AUFZÄHLBAR, und anders als bei system-028
 * (Farb-Tokens) lägen darin vom Owner GESCHRIEBENE Texte und Adressen. Davids
 * Entscheidung 2026-08-13: Least Privilege — das Recht kommt, wenn der Leser
 * kommt, nicht vorher.
 *
 * ── DIE TÜR BLEIBT ABSICHTLICH ZU, NICHT VERSEHENTLICH ────────────────────
 * Soll das Menü später live morphen wie das Branding (D6), braucht es GENAU
 * eine Ergänzung: `Permission.read(Role.any())` an dieser Tabelle, per
 * `updateTable` in einer Folge-Migration — die Schreibseite kann bereits
 * Realtime auslösen, weil sie `updateRow`/`createRow` benutzt und NIE
 * `upsertRow` (das schreibt in 1.9.6 korrekt, publiziert aber kein Event;
 * live erwischt am 2026-08-01). Wer diese Migration hier liest und `[]` für
 * ein Versehen hält, irrt: es ist der bewusste Zustand, und der Weg zurück
 * ist eine Zeile.
 *
 * WENN dieses Recht je erteilt wird, gilt ab dann die Regel von system-028:
 * NIE eine Spalte mit Name, Host oder sonst etwas Identifizierendem
 * dazunehmen — sonst wird aus einer belanglosen Liste ein Verzeichnis aller
 * Kunden.
 *
 * KEINE INDIZES, und das ist kein Vergessen (wie system-028): die Tabelle wird
 * ausschliesslich über die rowId angesprochen. Es gibt keine Abfrage, die einen
 * Index bräuchte — damit entfällt hier auch der `indexStep`-Retry, der Pflicht
 * wäre, sobald ein Index dazukommt.
 *
 * SPALTENGRÖSSE 8192: nachgerechnet in `MAX_NAV_CONFIG_CHARS`
 * (core/shared/communityNavigation.ts) — dort steht auch, warum die Grenze
 * zusätzlich im Zod-Schema steht und nicht nur hier.
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren, danach `pnpm ops:schema-parity`.
 *
 * Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer system
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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 600; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-033 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table community_navigation', () => tablesDB.createTable({
  databaseId: db,
  tableId: 'community_navigation',
  name: 'Community Navigation (Menü)',
  // LEAST PRIVILEGE (Davids Runde 2026-08-13, s. Kopf): KEIN Client-Recht —
  // gelesen wird nur server-seitig (SSR, Admin-Client). Die Live-Propagation
  // à la D6 ist eine bewusste Tür: sie bräuchte genau EIN read(any) per
  // Folge-Migration. ACHTUNG PROTOKOLL: die erste Fassung dieser Migration
  // vergab read(any) und lief so am 2026-08-13 gegen alle vier Instanzen —
  // der Reparatur-Schritt unten zieht Bestand nach (die Tabelle war leer,
  // nichts war exponiert).
  permissions: [],
  rowSecurity: false,
}))

// REPARATUR + DURCHSETZUNG: eine schon existierende Tabelle (409-Skip oben)
// wird auf die heutigen Permissions GEZOGEN statt nur belassen — sonst wäre
// dieser Fix nur auf frischen Instanzen wahr. Idempotent: derselbe Zustand
// nochmal gesetzt ist ein No-op.
await step('Table community_navigation → permissions []', () => tablesDB.updateTable({
  databaseId: db,
  tableId: 'community_navigation',
  name: 'Community Navigation (Menü)',
  permissions: [],
  rowSecurity: false,
}))

/**
 * WIE 034: eine vorhandene Varchar-Spalte antwortet auf createVarcharColumn
 * mit 400 `column_limit_exceeded`, NICHT mit 409 — die 409-Abkürzung von
 * step() greift also nicht, und der Wiederholungslauf stürbe genau hier
 * (am 2026-08-13 live erwischt: der Reparatur-Lauf setzte die Permissions
 * und starb dann an dieser Zeile). Deshalb erst nachsehen, dann anlegen.
 */
async function ensureColumn(tableId: string, key: string, create: () => Promise<unknown>) {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    if (columns.some(column => column.key === key)) {
      console.log(`↷ Column ${tableId}.${key} (existiert bereits)`)
      return
    }
  }
  catch {
    // Table fehlt o. Ä. — step() unten meldet es sauber.
  }
  await step(`Column ${tableId}.${key}`, create)
}

// `config` = das serialisierte Override-Dokument ({ entries: [...] }).
// '' ist ein gültiger Wert und heisst „keine eigene Wahl" — deshalb nicht
// required. Der Leser (parseCommunityNavOverride) macht daraus `null` und das
// Menü sieht aus wie vor U15.
await ensureColumn('community_navigation', 'config', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'community_navigation', key: 'config', size: 8192, required: false, xdefault: '',
}))

await waitForColumns('community_navigation')

console.log('✔ Migration system-033 fertig')
