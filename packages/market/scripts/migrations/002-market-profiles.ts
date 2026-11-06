/**
 * Migration market-002: `market_profiles` — DAS MARKTPROFIL EINES KANDIDATEN.
 *
 * Paket M1, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.6 + §7.6. Gemeinsame
 * Regeln wie market-001 (server-only, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent).
 *
 * ── EINE EIGENE TABELLE UND KEINE SPALTEN AN `market_competitors` ─────────
 * Der Kandidat ist eine ENTSCHEIDUNG des Kunden („diese Marke will ich
 * vergleichen"), das Profil ein ERGEBNIS einer Auswertung. Beide altern
 * verschieden: die Adresse bleibt, das Profil wird ungültig, sobald der
 * Rohtext-Stand (`inputHash`) oder die Fassung des Prompts sich bewegt. In
 * einer Zeile zusammengelegt müsste man das Ergebnis löschen, um den
 * Kandidaten zu behalten — und hätte den Verlauf verloren.
 *
 * ── DIE ZEHN FELDER STEHEN ALS EIN JSON, NICHT ALS ZEHN SPALTEN ───────────
 * Jedes Feld trägt Wert, Zitat, Quell-Adresse, Abrufdatum, Sicherheit,
 * Herkunft und Häufigkeit (§2.2 + §7.6) — zehn Spalten daraus zu machen hiesse
 * siebzig. Der Vertrag lebt pur in `shared/marketProfile.ts` und wird beim
 * Lesen mit Zod geprüft; die Datenbank ist hier Ablage, nicht Schema.
 * MEDIUMTEXT (off-row), weil zehn Felder mit je ≤ 200 Zeichen Zitat plus
 * Adressen die 65-KB-Zeilengrenze von MariaDB sonst berühren.
 *
 * ── `aiOutsideView` STEHT NEBEN `fields`, NICHT DARIN ─────────────────────
 * §7.5 (Davids Entscheidung GEGEN die Empfehlung, deshalb mit der schärfsten
 * Leitplanke): „Website sagt" und „KI-Antworten sagen" dürfen sich nirgends
 * berühren. Eine Spalte, die beides trüge, wäre nicht mehr trennbar — und die
 * UNGEPRÜFTE Aussage sähe aus wie die belegte. Getrennt gespeichert, getrennt
 * gezeigt: dieselbe Trennung, die der Typ `MarketAiView` im Vertrag macht.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer market
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

const PROFILES = 'market_profiles'

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

console.log(`Migration market-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${PROFILES}`, () => tablesDB.createTable({
  databaseId, tableId: PROFILES, name: 'Market Profiles', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(PROFILES)

  // Zu WELCHEM Kandidaten (`market_competitors.$id`).
  await columnStep(`Column ${PROFILES}.competitorId`, 'competitorId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'competitorId', size: 64, required: true,
  }))
  // Das Branding — redundant über den Kandidaten erreichbar, aber die
  // Kaskade und die Besitz-Prüfung sollen NICHT über zwei Tabellen springen
  // müssen: ein Löschlauf, der erst Kandidaten sammeln muss, um Profile zu
  // finden, hinterlässt bei jedem Abbruch Waisen.
  await columnStep(`Column ${PROFILES}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'profileId', size: 64, required: true,
  }))
  // Die zehn Felder aus §2.2 als JSON (s. Kopf). MEDIUMTEXT ⇒ kein Default.
  await columnStep(`Column ${PROFILES}.fields`, 'fields', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PROFILES, key: 'fields', required: false,
  }))
  // Die ungeprüfte Aussensicht — eigene Spalte, s. Kopf (§7.5).
  await columnStep(`Column ${PROFILES}.aiOutsideView`, 'aiOutsideView', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PROFILES, key: 'aiOutsideView', required: false,
  }))
  await columnStep(`Column ${PROFILES}.extractedAt`, 'extractedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PROFILES, key: 'extractedAt', required: false,
  }))
  // Welches Modell geantwortet hat und mit welcher Fassung der Fragen — zwei
  // Dinge, zwei Spalten (dieselbe Begründung wie in brand-016): ein
  // geschärfter Prompt ändert die Aussagen, ein anderes Modell die
  // Formulierung, und man will später wissen, welches von beidem es war.
  await columnStep(`Column ${PROFILES}.model`, 'model', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'model', size: 120, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PROFILES}.promptVersion`, 'promptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'promptVersion', size: 64, required: false, xdefault: '',
  }))
  // Der Stand des Rohtexts, aus dem dieses Profil entstand (sha256). Er
  // entscheidet, ob ein erneuter Lauf rechnen muss oder das gespeicherte
  // Profil nimmt — der Kostendeckel derselben Art wie in brand-016.
  await columnStep(`Column ${PROFILES}.inputHash`, 'inputHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'inputHash', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(PROFILES)

  // „Welche Profile hat dieses Branding?" — Bericht und Kaskade.
  await indexStep(`Index ${PROFILES}.idx_profile`, {
    tableId: PROFILES, key: 'idx_profile', type: TablesDBIndexType.Key, columns: ['profileId'],
  })
  // „Gibt es zu DIESEM Kandidaten schon ein Profil?" — der Idempotenz-Pfad.
  // KEY und nicht UNIQUE: ein neu abgerufener Stand legt ein neues Profil an,
  // und die alten sind der Verlauf (dieselbe Begründung wie `idx_url_key` in
  // brand-016). Ein UNIQUE verböte genau das.
  await indexStep(`Index ${PROFILES}.idx_competitor`, {
    tableId: PROFILES, key: 'idx_competitor', type: TablesDBIndexType.Key, columns: ['competitorId'],
  })
}

console.log('✔ Migration market-002 fertig')
