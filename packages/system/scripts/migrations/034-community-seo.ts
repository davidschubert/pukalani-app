/**
 * Migration system-034: Table `community_seo` — wie eine Community in der
 * SUCHE erscheint, so wie ihr Owner es eingestellt hat (U15 Teil 2).
 *
 * EINE Row pro Community, rowId = `communities.$id` (= `useSiteId()`).
 * Geschrieben ausschliesslich server-seitig (packages/pages/server/utils/
 * communitySeoStore.ts) hinter `requireCommunityPermission(event,
 * 'branding.manage')`; gelesen server-seitig beim Seitenaufbau (30 s
 * Microcache) und von dort in den SSR-Kopf gespiegelt. Vertrag,
 * Auflösungsregel und die Begründung der Feld-Form:
 * packages/core/shared/communitySeo.ts.
 *
 * FORM ÜBERNOMMEN VON `community_navigation` (system-033) und darüber von
 * `community_branding` (system-028): eine Infrastruktur-Zeile ÜBER eine
 * Community, deren rowId die Community IST. Damit gilt hier auch dieselbe
 * Begründung dafür, dass sie NICHT durch die Datentür geschrieben wird
 * (`tenantDb` würde eine `communityId` stempeln, die schon die rowId ist,
 * Row-Permissions auf eine Tabelle ohne Client-Rechte legen und über die
 * Türklinke 'member' einen A5-Beitritt auslösen). Nachzulesen im Kopf des
 * Stores.
 *
 * PERMISSIONS: **KEINE** — `permissions: []`, `rowSecurity: false`. Weder
 * `read(any)` noch sonst ein Client-Recht.
 *
 * ── DAS IST DIE ABWEICHUNG VON system-028, UND SIE IST GEWOLLT ────────────
 * Wortgleich die Entscheidung, die system-033 am 2026-08-13 nachgezogen hat
 * (Least Privilege). Der Branding-Spiegel MUSS `read(any)` tragen: dort ist
 * der Browser der Leser, er abonniert seine Row per Realtime. Hier ist er es
 * nicht — die zwei Signale werden beim SSR-Aufbau in den Kopf gerendert und
 * kommen fertig beim Besucher an. Ein Lese-Recht, das heute niemand benutzt,
 * ist kein Komfort, sondern eine offene Tür: die Tabelle wäre AUFZÄHLBAR,
 * und anders als bei system-028 (Farb-Tokens) läge darin vom Owner
 * GESCHRIEBENER Text.
 *
 * ── EIN ZWEITER GRUND, DEN system-033 NOCH NICHT HATTE ────────────────────
 * `noindex` ist die Auskunft „diese Community will nicht gefunden werden".
 * Über den ganzen Pool aufzählbar wäre das eine Liste der Communities, die
 * bewusst unter dem Radar bleiben — genau die Sorte Nebeninformation, die
 * eine für sich belanglose Tabelle wertvoll macht. Wenn dieses Recht je
 * erteilt wird, gilt ab dann die Regel von system-028: NIE eine Spalte mit
 * Name, Host oder sonst etwas Identifizierendem dazunehmen.
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
 * ZWEI ECHTE SPALTEN, KEIN JSON — der Unterschied zu system-033, und er hat
 * einen Grund: das Menü ist eine LISTE unbestimmter Länge mit einer Form, die
 * sich noch bewegen wird (deshalb dort EIN `config`-Dokument, das jede
 * Schema-Änderung überlebt). Hier sind es zwei feste Felder mit fester
 * Bedeutung. Ein JSON-Dokument darum wäre eine Verpackung ohne Inhalt und
 * machte aus zwei typisierten Spalten einen String, den jeder Leser selbst
 * auseinandernehmen muss.
 *
 * SPALTENGRÖSSE 320: die Zahl steht in `MAX_SEO_DESCRIPTION`
 * (core/shared/communitySeo.ts) — dort auch, warum sie doppelt so gross ist
 * wie das, was Google anzeigt, und warum sie zusätzlich im Zod-Schema steht.
 *
 * `noindex` ist NICHT `required` und hat `xdefault: false`. Appwrite backfillt
 * Defaults NICHT in Bestands-Rows — der Leser rechnet deshalb ohnehin mit
 * `undefined` (`resolveCommunitySeo`, Zusage 4: nur ein echtes `true` zählt).
 *
 * KEINE INDIZES, und das ist kein Vergessen (wie system-028/033): die Tabelle
 * wird ausschliesslich über die rowId angesprochen. Es gibt keine Abfrage, die
 * einen Index bräuchte — damit entfällt hier auch der `indexStep`-Retry, der
 * Pflicht wäre, sobald ein Index dazukommt.
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

/**
 * Spalte anlegen — ABER VORHER NACHSEHEN, ob es sie schon gibt.
 *
 * DIE 409-ABKÜRZUNG TRÄGT HIER NICHT, und das ist keine Vorsicht, sondern eine
 * Lehre aus 002-app-config.ts (dort steht dieselbe Warnung): fordert man eine
 * bereits vorhandene Varchar-Spalte ein zweites Mal an, antwortet Appwrite
 * nicht immer mit 409 „existiert schon", sondern mit **400
 * `column_limit_exceeded`** — es prüft das Zeilenbudget von MariaDB, bevor es
 * die Doppelung bemerkt. Ein `step()` mit reinem 409-Fang läuft dann beim
 * ZWEITEN Lauf auf einen harten Fehler, und die Migration ist genau das nicht
 * mehr, was oben zugesagt ist: idempotent.
 *
 * Das ist kein theoretischer Fall — am 2026-08-13 lokal live erwischt, an
 * system-033, das die Abkürzung benutzt: `pnpm migrate --layer system` stirbt
 * dort auf jeder Instanz, auf der 033 bereits gelaufen ist.
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

console.log(`Migration system-034 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table community_seo', () => tablesDB.createTable({
  databaseId: db,
  tableId: 'community_seo',
  name: 'Community SEO (Suche)',
  // KEINE Client-Rechte — s. Kopf. Gelesen und geschrieben wird ausschliesslich
  // server-seitig mit dem Admin-Key.
  permissions: [],
  rowSecurity: false,
}))

/**
 * REPARATURSCHRITT für Bestands-Instanzen — dieselbe Zeile, die 033 am
 * 2026-08-13 nachgetragen bekommen hat und die 035 von Anfang an trägt; hier
 * fehlte sie als einziger der drei U15-Tabellen (Audit 2026-08-15, Schnitt B).
 *
 * WARUM SIE NÖTIG IST: `createTable` oben antwortet auf eine vorhandene Tabelle
 * mit 409, und `step()` überspringt sie dann — die PERMISSIONS einer einmal
 * falsch angelegten Tabelle heilt das nie. Ohne diesen Schritt wäre die
 * least-privilege-Zusage nur auf frischen Instanzen wahr.
 *
 * IDEMPOTENT: derselbe Zustand noch einmal gesetzt ist ein No-op. Der Beweis
 * eines Permissions-Fixes ist der GREP auf DIESE Zeile, nie die Commit-Meldung
 * (Lehre vom 2026-08-13).
 */
await step('Table community_seo: permissions [] (Reparatur)', () => tablesDB.updateTable({
  databaseId: db,
  tableId: 'community_seo',
  name: 'Community SEO (Suche)',
  permissions: [],
  rowSecurity: false,
}))

// Eigene Beschreibung der Startseite. '' ist ein gültiger Wert und heisst
// „keine eigene Wahl" — deshalb nicht required. Der Leser
// (`resolveCommunitySeo`) fällt dann auf den Anriss der Startseite zurück,
// also auf das Verhalten vor U15.
await ensureColumn('community_seo', 'metaDescription', () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: 'community_seo', key: 'metaDescription', size: 320, required: false, xdefault: '',
}))

// „Diese Community aus Suchmaschinen raushalten."
await ensureColumn('community_seo', 'noindex', () => tablesDB.createBooleanColumn({
  databaseId: db, tableId: 'community_seo', key: 'noindex', required: false, xdefault: false,
}))

await waitForColumns('community_seo')

console.log('✔ Migration system-034 fertig')
