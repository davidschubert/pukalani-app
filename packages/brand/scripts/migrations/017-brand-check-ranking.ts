/**
 * Migration brand-017: DAS RANKING UND SEINE KORREKTUREN.
 *
 * NUMMER: 016 (`brand-checks`) war der letzte Stand auf `origin/main` und in
 * jedem Arbeitsbaum; 017 ist die nächste freie. Nummern werden von parallel
 * laufenden Sitzungen vergeben — wer nach dieser hier eine anlegt, sieht
 * zuerst nach (`ls packages/brand/scripts/migrations` gegen ein frisches
 * `git fetch origin main`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * docs/archiv/BRAND-CHECK-SEITE.md macht aus dem einzelnen Check eine
 * PRODUKTSEITE: ein öffentliches Ranking (§3), Korrekturvorschläge dazu (§3b),
 * „Meine Brands" mit Verlauf (§5) und — schon vorgesehen — der Check eines
 * Fundament-DOKUMENTS statt einer Website (§5b). Diese Migration legt dafür
 * sechs Spalten an `brand_checks` und EINE neue Tabelle an.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── ALLE SECHS SPALTEN SIND ADDITIV UND HABEN EINEN VORGABEWERT ───────────
 * Die Zeilen aus brand-016 bleiben lesbar und bekommen genau die Bedeutung,
 * die sie verdienen: `industry: 'unknown'` (die Branche wurde damals nicht
 * gefragt), `rankingOptIn: false` (niemand hat zugestimmt — Davids
 * Entscheidung 1: ohne Häkchen bleibt ein Check privat), `hidden: false`,
 * `source: 'website'`. Ein Backfill-Skript gibt es deshalb NICHT, und es darf
 * auch keines geben: „unbekannt" nachträglich zu erraten hiesse, eine
 * Modell-Antwort zu erfinden, die nie gegeben wurde.
 *
 * ── WARUM `industry` EIN VARCHAR IST UND KEIN ENUM ────────────────────────
 * Dieselbe Entscheidung wie bei `brand_waitlist.status` (brand-012): die
 * WAHRHEIT über die erlaubten Werte steht in `shared/brandIndustries.ts` —
 * dort liest sie der Prompt, der Filter und die Prüfung des
 * Korrekturvorschlags. Ein Enum hier hiesse: eine siebzehnte Branche ist eine
 * Migration auf einer laufenden Instanz, und bis sie gelaufen ist, wirft jeder
 * Check mit dem neuen Wert beim Speichern. 40 Zeichen sind reichlich für Ids
 * wie `manufacturing`.
 *
 * ── ZWEI FLAGS, ZWEI MENSCHEN ─────────────────────────────────────────────
 * `rankingOptIn` gehört dem PRÜFER (er hat das Häkchen gesetzt), `hidden` dem
 * BETREIBER (er hat einem Entfernungswunsch stattgegeben, §3 „Recht"). Ein
 * gemeinsames `visible`-Feld wäre kürzer und falsch: ein ausgeblendeter Check
 * käme dann zurück, sobald irgendjemand dieselbe Adresse erneut mit Häkchen
 * prüft — und genau das ist der Fall, für den es den Entfernen-Weg gibt.
 *
 * ── ZWEI INDIZES, ZWEI FRAGEN ─────────────────────────────────────────────
 * `idx_ranking` (rankingOptIn, hidden, score) ist der Lesepfad der
 * Ranking-Liste: sie filtert auf genau diese beiden Flags. `score` steht als
 * dritte Spalte mit, weil dieselbe Abfrage die Fehlläufe ausschliesst
 * (`score > 0`, §6). SORTIERT wird in der Abfrage nach `$createdAt` (Appwrite
 * legt darauf von sich aus einen Index) — die Reihenfolge des Rankings selbst
 * entsteht danach im Server, weil sie über Werte INNERHALB der JSON-Spalte
 * `categories` gehen kann („die Besten in Konsistenz"), und darüber kann
 * TablesDB weder sortieren noch filtern.
 * `idx_profile` (profileId) ist der Lesepfad von „Meine Brands" (§5): alle
 * Checks EINER eigenen Brand, für die Gegenüberstellung mit dem Vorgänger.
 *
 * ── DIE NEUE TABELLE ──────────────────────────────────────────────────────
 * `brand_check_corrections` (§3b) — ein Vorschlag hat einen eigenen STATUS,
 * einen eigenen (freiwilligen) Absender, eine Begründung und eine Entscheidung
 * mit Datum; und es kann mehrere je Check geben. Das ist eine Tabelle und
 * keine Spalte. Ihr `ipHash` ist derselbe Tages-Stempel wie bei `brand_checks`
 * (sha256 aus IP und täglich wechselndem Salz, nur für den Deckel) — die rohe
 * IP wird auch hier nie geschrieben und nie geloggt.
 * EIN Index: `idx_status`. Die Arbeitsliste des Betreibers fragt genau eine
 * Frage („was ist offen?"); der Blick „gibt es zu DIESEM Check schon einen
 * offenen Vorschlag?" läuft über dieselbe Spalte plus `checkId` und ist selten
 * genug, dass ein zweiter Index mehr Schreibkosten als Lesenutzen brächte.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Spalten wirft `createRow` in `POST /api/brand/check`
 * (die Route zählt JEDE Spalte explizit auf), und der Check wäre tot.
 */
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

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const CHECKS = 'brand_checks'
const CORRECTIONS = 'brand_check_corrections'

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
/** Query.limit ist PFLICHT (Falle aus events-006): ohne Limit liefert listColumns 25. */
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
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
    const { columns } = await tablesDB.listColumns({
      databaseId: databaseId!, tableId, queries: [Query.limit(200)],
    })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration brand-017 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── brand_checks: sechs additive Spalten + zwei Indizes ────────────────────
{
  const cols = await existingColumnKeys(CHECKS)

  // Die Branche — Modell-Vorschlag aus dem ohnehin bezahlten Judge-Aufruf,
  // korrigierbar über `brand_check_corrections` (s. Kopf).
  await columnStep(`Column ${CHECKS}.industry`, 'industry', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'industry', size: 40, required: false, xdefault: 'unknown',
  }))
  // Das Häkchen des Prüfers. Default FALSE — ohne Zustimmung bleibt ein Check
  // privat (Davids Entscheidung 1).
  await columnStep(`Column ${CHECKS}.rankingOptIn`, 'rankingOptIn', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: CHECKS, key: 'rankingOptIn', required: false, xdefault: false,
  }))
  // Der Entfernen-Weg des Betreibers. Er blendet AUS und löscht NICHT: die
  // Zeile ist der Beleg dafür, was wann behauptet wurde.
  await columnStep(`Column ${CHECKS}.hidden`, 'hidden', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: CHECKS, key: 'hidden', required: false, xdefault: false,
  }))
  // Wer den Check ausgelöst hat — LEER bei jedem Gast, und das ist der
  // Normalfall (die Route läuft ohne Anmeldung). Sie ist kein Zugriffsrecht:
  // die Ergebnis-Seite ist für jeden lesbar, der die Adresse hat.
  await columnStep(`Column ${CHECKS}.userId`, 'userId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'userId', size: 64, required: false, xdefault: '',
  }))
  // Die eigene Brand, zu der dieser Check gehört (§5 „Meine Brands").
  await columnStep(`Column ${CHECKS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'profileId', size: 64, required: false, xdefault: '',
  }))
  // 'website' heute, 'document' mit dem Fundament-Check (§5b). Zwei Zahlen,
  // die NICHT dasselbe messen — deshalb eine Spalte und keine Vermischung.
  await columnStep(`Column ${CHECKS}.source`, 'source', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'source', size: 16, required: false, xdefault: 'website',
  }))

  await waitForColumns(CHECKS)

  await indexStep(`Index ${CHECKS}.idx_ranking`, {
    tableId: CHECKS,
    key: 'idx_ranking',
    type: TablesDBIndexType.Key,
    columns: ['rankingOptIn', 'hidden', 'score'],
  })
  await indexStep(`Index ${CHECKS}.idx_profile`, {
    tableId: CHECKS,
    key: 'idx_profile',
    type: TablesDBIndexType.Key,
    columns: ['profileId'],
  })
}

// ── brand_check_corrections ───────────────────────────────────────────────
await step(`Table ${CORRECTIONS}`, () => tablesDB.createTable({
  databaseId, tableId: CORRECTIONS, name: 'Brand Check Corrections', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(CORRECTIONS)

  // PFLICHT: eine Korrektur ohne Check hat kein Ziel. 64 = Appwrite-Zeilen-Id.
  await columnStep(`Column ${CORRECTIONS}.checkId`, 'checkId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'checkId', size: 64, required: true,
  }))
  // WELCHES Feld korrigiert wird. Heute nur 'industry' — die erlaubten Werte
  // stehen in `shared/brandCheckCorrections.ts`, nicht als Enum hier (dieselbe
  // Begründung wie bei `industry` oben: ein zweites Feld soll kein Deploy-Gate
  // auf einer laufenden Instanz sein).
  await columnStep(`Column ${CORRECTIONS}.field`, 'field', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'field', size: 32, required: false, xdefault: 'industry',
  }))
  await columnStep(`Column ${CORRECTIONS}.proposed`, 'proposed', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'proposed', size: 120, required: false, xdefault: '',
  }))
  // Freiwillig (§3b) — eine erzwungene Begründung wäre ein Feld voller Punkte.
  await columnStep(`Column ${CORRECTIONS}.reason`, 'reason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'reason', size: 300, required: false, xdefault: '',
  }))
  // Ebenfalls freiwillig: der einzige Personenbezug neben dem `ipHash`. Sie
  // steht in der Zeile, damit der Betreiber zurückfragen kann, und geht NIE in
  // eine öffentliche Antwort.
  await columnStep(`Column ${CORRECTIONS}.reporterEmail`, 'reporterEmail', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'reporterEmail', size: 254, required: false, xdefault: '',
  }))
  // HIER ist ein Enum richtig, anders als bei `industry` und `field`: die drei
  // Zustände sind der Ablauf selbst (offen → entschieden) und wachsen nicht
  // mit dem Katalog. Ein vierter wäre eine Änderung am Ablauf und gehört
  // deshalb in eine Migration.
  await columnStep(`Column ${CORRECTIONS}.status`, 'status', cols, () => tablesDB.createEnumColumn({
    databaseId,
    tableId: CORRECTIONS,
    key: 'status',
    elements: ['open', 'accepted', 'declined'],
    required: false,
    xdefault: 'open',
  }))
  await columnStep(`Column ${CORRECTIONS}.decisionNote`, 'decisionNote', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'decisionNote', size: 300, required: false, xdefault: '',
  }))
  // Optional, weil eine OFFENE Zeile keinen hat (dieselbe Rolle wie
  // `resolvedAt` in brand-014).
  await columnStep(`Column ${CORRECTIONS}.decidedAt`, 'decidedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CORRECTIONS, key: 'decidedAt', required: false,
  }))
  // Nur für den Deckel — sha256 mit Tages-Salz, nie die rohe IP (s. Kopf).
  await columnStep(`Column ${CORRECTIONS}.ipHash`, 'ipHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'ipHash', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(CORRECTIONS)

  await indexStep(`Index ${CORRECTIONS}.idx_status`, {
    tableId: CORRECTIONS,
    key: 'idx_status',
    type: TablesDBIndexType.Key,
    columns: ['status'],
  })
}

console.log('✔ Migration brand-017 fertig')
