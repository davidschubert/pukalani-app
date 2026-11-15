/**
 * Migration system-035: Table `community_redirects` — die WEITERLEITUNGEN einer
 * Community (alte Adresse ⇒ neue Adresse, U15 Teil 3).
 *
 * EINE Row pro Community, rowId = `communities.$id` (= `useSiteId()`).
 * Geschrieben ausschliesslich server-seitig (core/server/utils/
 * communityRedirectStore.ts) hinter `requireCommunityPermission(event,
 * 'branding.manage')`; gelesen server-seitig in der Middleware
 * `01.community-redirect.ts`, bevor irgendetwas gerendert wird (30 s
 * Microcache). Vertrag, Auflösungsregel und die Begründung jeder Grenze:
 * packages/core/shared/communityRedirects.ts.
 *
 * FORM ÜBERNOMMEN VON `community_navigation` (system-033) und `community_seo`
 * (system-034), und darüber von `community_branding` (system-028): eine
 * Infrastruktur-Zeile ÜBER eine Community, deren rowId die Community IST.
 * Damit gilt hier auch dieselbe Begründung dafür, dass sie NICHT durch die
 * Datentür geschrieben wird (`tenantDb` würde eine `communityId` stempeln, die
 * schon die rowId ist, Row-Permissions auf eine Tabelle ohne Client-Rechte
 * legen und über die Türklinke 'member' einen A5-Beitritt auslösen).
 * Nachzulesen im Kopf des Stores.
 *
 * PERMISSIONS: **KEINE** — `permissions: []`, `rowSecurity: false`. Weder
 * `read(any)` noch sonst ein Client-Recht.
 *
 * ── DIESELBE ABWEICHUNG VON system-028 WIE BEI 033/034, UND SIE IST GEWOLLT ─
 * Der Branding-Spiegel MUSS `read(any)` tragen: dort ist der Browser der
 * Leser, er abonniert seine Row per Realtime. Hier ist er es nicht — die
 * Weiterleitung passiert auf dem SERVER, bevor der Browser irgendetwas sieht.
 * Ein Lese-Recht, das heute niemand benutzt, ist kein Komfort, sondern eine
 * offene Tür.
 *
 * ── UND HIER WIEGT SIE SCHWERER ALS BEI DEN GESCHWISTERN ───────────────────
 * Diese Tabelle ist die LANDKARTE der alten Adressen einer Community: welche
 * Seiten es einmal gab, wie sie hiessen, wohin sie gezogen sind. Über den
 * ganzen Pool aufzählbar wäre das eine Struktur-Historie jeder Kunden-Website
 * — für sich belanglos, in Summe genau die Sorte Nebeninformation, die man
 * nicht verschenkt. Wenn dieses Recht je erteilt wird, gilt ab dann die Regel
 * von system-028: NIE eine Spalte mit Name, Host oder sonst etwas
 * Identifizierendem dazunehmen.
 *
 * ── DIE TÜR BLEIBT ABSICHTLICH ZU, NICHT VERSEHENTLICH ────────────────────
 * Soll die Einstellung später live morphen wie das Branding (D6), braucht es
 * GENAU eine Ergänzung: `Permission.read(Role.any())` an dieser Tabelle, per
 * `updateTable` in einer Folge-Migration — die Schreibseite kann bereits
 * Realtime auslösen, weil sie `updateRow`/`createRow` benutzt und NIE
 * `upsertRow` (das schreibt in 1.9.6 korrekt, publiziert aber kein Event;
 * live erwischt am 2026-08-01). Wer diese Migration liest und `[]` für ein
 * Versehen hält, irrt.
 *
 * ── EINE MEDIUMTEXT-SPALTE, UND DAS IST DER UNTERSCHIED ZU system-033 ──────
 * Das Menü kam mit `config` als varchar 8192 aus. Hier nicht, und die Zahl
 * sagt warum: 100 Regeln × (256 Quelle + 512 Ziel + JSON-Gerüst) sind rund
 * 79.000 Zeichen — eine varchar-Spalte endet bei MariaDB/utf8mb4 bei 16.381.
 * Es passt um den Faktor fünf nicht. Die Grenze so weit zu senken, bis es
 * passt, hiesse rund 20 Regeln, und das ist genau die Community nicht, die
 * Weiterleitungen braucht.
 *
 * Also MEDIUMTEXT (off-row, dasselbe Muster wie `pages.body` seit pages-002):
 * kein Zeilenbudget. Die Obergrenze setzt die App per Zod
 * (`MAX_REDIRECT_CONFIG_CHARS`) — nachgerechnet und als Test festgenagelt in
 * `packages/core/tests/communityRedirects.test.ts`.
 *
 * KEINE INDIZES, und das ist kein Vergessen (wie system-028/033/034): die
 * Tabelle wird ausschliesslich über die rowId angesprochen. Es gibt keine
 * Abfrage, die einen Index bräuchte — damit entfällt hier auch der
 * `indexStep`-Retry, der Pflicht wäre, sobald ein Index dazukommt.
 *
 * Der `system`-Layer läuft auf JEDER Instanz — diese Migration gehört überall
 * gefahren, danach `pnpm ops:schema-parity`. Die Tabelle steht dafür in der
 * `SYSTEM_TABLES`-Liste von `scripts/ops/verify-schema-parity.mjs`; ein
 * Wächter mit handgepflegter Liste ist nur so wach wie sein letzter Pfleger
 * (am 2026-08-13 live erwischt: er meldete „deckungsgleich", während drei
 * Instanzen eine Tabelle nicht hatten).
 *
 * Idempotent (409 → skip, Spalten über `ensureColumn`).
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

/**
 * Spalte anlegen — ABER VORHER NACHSEHEN, ob es sie schon gibt.
 *
 * DIE 409-ABKÜRZUNG TRÄGT NICHT, und das ist keine Vorsicht, sondern eine
 * Lehre aus 002-app-config.ts und aus system-033: fordert man eine bereits
 * vorhandene Spalte ein zweites Mal an, antwortet Appwrite nicht immer mit 409
 * „existiert schon", sondern mit **400 `column_limit_exceeded`** — es prüft das
 * Zeilenbudget von MariaDB, bevor es die Doppelung bemerkt. Ein `step()` mit
 * reinem 409-Fang läuft dann beim ZWEITEN Lauf auf einen harten Fehler, und
 * die Migration ist genau das nicht mehr, was oben zugesagt ist: idempotent.
 * Am 2026-08-13 lokal live erwischt (an system-033, das die Abkürzung
 * benutzte) — deshalb steht das hier VON ANFANG AN.
 *
 * `Query.limit(200)` ist PFLICHT: ohne explizites Limit liefert `listColumns`
 * 25 Spalten. Eine abgeschnittene Liste meldet „Spalte fehlt" — und dann steht
 * man wieder vor genau dem 400.
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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 600; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration system-035 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table community_redirects', () => tablesDB.createTable({
  databaseId: db,
  tableId: 'community_redirects',
  name: 'Community Redirects (Weiterleitungen)',
  // KEINE Client-Rechte — s. Kopf. Gelesen und geschrieben wird ausschliesslich
  // server-seitig mit dem Admin-Key.
  permissions: [],
  rowSecurity: false,
}))

/**
 * REPARATURSCHRITT für Bestands-Instanzen — dieselbe Zeile, die system-033 am
 * 2026-08-13 nachgetragen bekommen hat, und aus demselben Grund: eine Tabelle,
 * die einmal mit falschen Rechten angelegt wurde, heilt der `createTable`-409
 * NICHT. Hier ist die Tabelle neu und der Schritt damit heute wirkungslos —
 * er steht trotzdem da, weil ein späterer Lauf gegen eine Instanz, auf der
 * jemand die Rechte von Hand gesetzt hat, sie zurückholen soll. Der Beweis
 * eines Permissions-Fixes ist der GREP auf DIESE Zeile, nie die
 * Commit-Meldung (Lehre vom 2026-08-13).
 */
await step('Table community_redirects: permissions [] (Reparatur)', () => tablesDB.updateTable({
  databaseId: db,
  tableId: 'community_redirects',
  name: 'Community Redirects (Weiterleitungen)',
  permissions: [],
  rowSecurity: false,
}))

// Das gespeicherte Dokument (`{"rules":[…]}`). MEDIUMTEXT statt varchar —
// Begründung und Nachrechnung im Kopf.
await ensureColumn('community_redirects', 'config', async () => {
  try {
    await tablesDB.createMediumtextColumn({
      databaseId: db, tableId: 'community_redirects', key: 'config', required: false, xdefault: '',
    })
  }
  catch {
    // Manche MariaDB-Setups erlauben kein DEFAULT auf TEXT — ohne Default
    // erneut (wortgleich pages-001). Der Leser rechnet ohnehin mit `undefined`:
    // `parseCommunityRedirectConfig(undefined)` ist `null` = „keine Regeln".
    await tablesDB.createMediumtextColumn({
      databaseId: db, tableId: 'community_redirects', key: 'config', required: false,
    })
  }
})

await waitForColumns('community_redirects')

console.log('✔ Migration system-035 fertig')
