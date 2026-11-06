/**
 * Migration brand-018: DIE BEFUND-ART `market`.
 *
 * NUMMER: 017 (`brand-check-ranking`) war der letzte Stand auf `origin/main`
 * und in jedem Arbeitsbaum; 018 ist die nächste freie. Nummern werden von
 * parallel laufenden Sitzungen vergeben — wer nach dieser hier eine anlegt,
 * sieht zuerst nach (`ls packages/brand/scripts/migrations` gegen ein frisches
 * `git fetch origin main`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Der Marktvergleich (docs/archiv/BRAND-MARKTVERGLEICH.md, MV1 M3) legt seine
 * Befunde in DIESELBE Tabelle wie der Spezialist: sie erscheinen an denselben
 * eigenen Feldern, tragen dieselbe Entscheidung (annehmen/ablehnen) und
 * dieselben Chips (§2.7 „Befund-Speicher + Chips — neue Art `market`"). Eine
 * eigene Tabelle hätte zwei Chip-Sorten, zwei Entscheidungs-Routen und zwei
 * Antworten auf „was hängt an diesem Feld".
 *
 * `brand_findings.kind` ist aber ein ENUM (brand-014, mit guter Begründung:
 * die Werte sind CODE, kein Betreiber-Text — `blockingFindingSlots` sperrt auf
 * `conflict`). Ein Enum kennt nur, was in ihm steht: ohne diese Migration
 * antwortet Appwrite auf jeden Markt-Befund mit „Attribute kind has invalid
 * format" — und weil das Schreiben der Befunde fail-soft ist, verschwände er
 * STILL. Genau so ist es beim Bau von M3 passiert (2026-09-05, im Beweis
 * gefunden): der Bericht war fertig, der Riegel hatte gearbeitet, und die
 * Befund-Tabelle blieb leer.
 *
 * ── REIHENFOLGE: MIGRATION VOR DEPLOY ─────────────────────────────────────
 * Wie bei jeder Enum-Erweiterung. Läuft der Code vor der Migration, sind
 * Markt-Befunde still weg (fail-soft); läuft die Migration vor dem Code,
 * passiert genau nichts — ein Enum-Wert, den niemand schreibt, stört keine
 * Zeile. Deshalb ist DIESE Richtung die richtige, und deshalb ist sie
 * ungefährlich.
 *
 * ── WARUM `updateEnumColumn` UND KEIN VARCHAR-UMBAU ───────────────────────
 * Der naheliegende „Vereinfachungs"-Weg wäre, `kind` zu einem varchar zu
 * machen und die Wahrheit ins `shared/`-Verzeichnis zu legen (so wie
 * `brand_checks.industry`, brand-017). Er wäre hier FALSCH: `industry` ist
 * eine Kategorie, die wachsen soll, ohne dass jemand eine Datenbank anfasst.
 * `kind` dagegen ist eine Verzweigung im CODE — jede Art hat einen eigenen
 * Zweig in `blockingFindingSlots`, `needsStageTwo` und der Chip-Anzeige. Ein
 * getippter Wert, den kein Zweig kennt, wäre ein Befund, der nirgends
 * erscheint und nichts tut. Das Enum ist hier die Sicherung, nicht die Hürde.
 *
 * ── DIE BESTEHENDEN ZEILEN BLEIBEN UNBERÜHRT ──────────────────────────────
 * Eine Enum-ERWEITERUNG nimmt keinen Wert weg; jede Zeile aus der Zeit davor
 * liest sich unverändert. Ein Backfill gibt es deshalb nicht und darf es nicht
 * geben: es gab vor dieser Migration keinen Marktvergleich, also gibt es auch
 * keinen alten Befund, der nachträglich einer wäre.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only, kein `communityId`
 * (Silo-Layer auf `branding`), idempotent.
 *
 * ── WARUM SIE DEN DESTRUKTIV-GUARD BRAUCHT ────────────────────────────────
 * `updateEnumColumn` zählt für `pnpm check:manifests` als zerstörerischer
 * Aufruf, und zu Recht: derselbe Aufruf könnte einen Wert WEGNEHMEN, und jede
 * Zeile mit diesem Wert wäre danach unlesbar. Hier tut er das Gegenteil —
 * er ERWEITERT (`[...existing, ...ELEMENTS]`), nimmt also nie etwas weg, auch
 * keinen Wert, den eine spätere Migration ergänzt hat. Der Guard darunter ist
 * die Sicherung, dass es dabei bleibt.
 *
 * ── IDEMPOTENZ OHNE 409 ───────────────────────────────────────────────────
 * Anders als beim ANLEGEN einer Spalte gibt es hier kein 409: ein zweiter
 * `updateEnumColumn` mit derselben Liste ist schlicht erfolgreich. Der
 * zweite Lauf wird trotzdem NICHT blind geschrieben — er liest die Spalte
 * zuerst und überspringt, wenn `market` schon drinsteht. Grund: ein
 * Enum-Update schreibt die GANZE Liste, und ein Lauf gegen eine Instanz, auf
 * der eine spätere Migration einen VIERTEN Wert ergänzt hat, würde ihn
 * wortlos wieder entfernen.
 */
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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const FINDINGS = 'brand_findings'
const KIND = 'kind'
/** Die Menge NACH dieser Migration — Reihenfolge wie in `shared/brandFindings.ts`. */
const ELEMENTS = ['conflict', 'affected', 'gap', 'market']

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration brand-018 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

let column: { elements?: string[] } | undefined
try {
  // Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert
  // listColumns 25, und `brand_findings` hat heute elf Spalten — morgen
  // vielleicht mehr.
  const { columns } = await tablesDB.listColumns({
    databaseId, tableId: FINDINGS, queries: [Query.limit(200)],
  })
  column = columns.find(entry => entry.key === KIND) as { elements?: string[] } | undefined
}
catch (error) {
  if (hasCode(error, 404)) {
    console.error(`✗ Tabelle ${FINDINGS} fehlt — brand-014 zuerst fahren.`)
    process.exit(1)
  }
  throw error
}

if (!column) {
  console.error(`✗ Spalte ${FINDINGS}.${KIND} fehlt — brand-014 zuerst fahren.`)
  process.exit(1)
}

const existing = column.elements ?? []
if (existing.includes('market')) {
  console.log(`↷ Enum ${FINDINGS}.${KIND} kennt \`market\` bereits (${existing.join(', ')})`)
}
else {
  // Die bestehenden Werte bleiben ALLE stehen — es kommt einer dazu. Eine
  // fremde vierte Art (aus einer späteren Migration) würde hier mitgenommen,
  // statt überschrieben.
  const elements = [...new Set([...existing, ...ELEMENTS])]
  // Der GUARD zum Marker: es wird nur ERWEITERT. Verlöre die neue Liste einen
  // bestehenden Wert, wären alle Zeilen mit ihm unlesbar — deshalb bricht der
  // Lauf hier ab, statt zu schreiben.
  const verloren = existing.filter(value => !elements.includes(value))
  if (verloren.length) {
    console.error(`✗ Abbruch: die neue Liste verlöre ${verloren.join(', ')} — das wäre zerstörerisch.`)
    process.exit(1)
  }
  // destruktiv-ok: `updateEnumColumn` ist hier rein ADDITIV (nur `market`
  // kommt dazu, kein Wert fällt weg — vom Guard darüber erzwungen). Ohne
  // diesen Aufruf gibt es keinen Weg, einem bestehenden Enum einen Wert
  // hinzuzufügen; ein Spalten-Neubau wäre die WIRKLICH zerstörerische Variante.
  await tablesDB.updateEnumColumn({
    databaseId,
    tableId: FINDINGS,
    key: KIND,
    elements,
    // Unverändert aus brand-014: Pflichtfeld, kein Vorgabewert. Ein Default
    // hier hiesse, dass ein Befund ohne Art eine bekäme — und `conflict` als
    // Vorgabe sperrte dann eine Abnahme, die niemand ausgelöst hat.
    required: true,
    /**
     * SDK-FALLE (node-appwrite 26.2, live erwischt): `xdefault` ist im TYP
     * optional, im CODE aber PFLICHT — der Client wirft „Missing required
     * parameter" schon bei `undefined`, ohne die Anfrage je zu stellen. Ein
     * Pflichtfeld darf keinen Vorgabewert haben, also ist der richtige Wert
     * `null`; nur der Typ kennt ihn nicht. Weglassen geht nicht, `''` wäre ein
     * Vorgabewert, den es nicht geben darf.
     */
    xdefault: null as unknown as string,
  })
  console.log(`✔ Enum ${FINDINGS}.${KIND} → ${elements.join(', ')}`)
}

console.log('✔ Migration brand-018 fertig')
