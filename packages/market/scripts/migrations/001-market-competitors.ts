/**
 * Migration market-001: `market_competitors` — DIE KANDIDATEN EINES VERGLEICHS.
 *
 * ERSTE Migration des market-Layers (Paket M1, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §2.6 + §7.6). Sie läuft AUSSCHLIESSLICH
 * auf der `branding`-Instanz — der Layer steht deshalb nur im BRANDING_SOLL
 * von scripts/ops/verify-schema-parity.mjs, nicht in der instanzweiten
 * Spalten-Parität.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die brand_*-Tabellen
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── EINE ZEILE IST EIN KANDIDAT, NICHT EINE WEBSITE ───────────────────────
 * Seit §7.2 gibt es VIER Quellen: eine Adresse, eine eigene Marke aus dem
 * Konto, ein Eintrag der kuratierten Bibliothek und (Phase 2) eine mit Opt-in
 * freigegebene Wizard-Marke. Deshalb tragen `url` und `rawText` KEINE
 * Pflicht: bei den drei Nicht-Website-Quellen gibt es weder eine Adresse zum
 * Abrufen noch einen Rohtext zum Aufbewahren, und eine Pflichtspalte zwänge
 * die Route, eine leere Zeichenkette als Adresse zu behaupten. Woher der
 * Kandidat kommt, sagt `sourceKind`; WORAUF er zeigt, sagt `sourceRef`.
 *
 * ── `rawText` IST EIN ZWISCHENSTAND, KEIN BESTAND ─────────────────────────
 * Der Rohtext einer FREMDEN Website lebt 24 Stunden (§2.9 Nr. 6): er wird für
 * die Extraktion gebraucht und für die deterministische Beleg-Prüfung
 * (`evidence ⊂ rawText`), danach geleert. Genau dafür gibt es `rawExpiresAt`
 * UND den Index darauf — ohne ihn müsste der Sweep aus M5 jede Zeile lesen,
 * um zu erfahren, dass er nichts zu tun hat, und Appwrite verlangt für eine
 * Filter-Spalte ohnehin einen Index. Der Index steht damit BEWUSST zusätzlich
 * zu den zwei aus §2.6: eine Aufbewahrungsfrist ohne Lesepfad ist ein
 * Versprechen, das der Betrieb nicht einlösen kann.
 *
 * ── `brandCheckId` STATT EINES ZWEITEN SCORES ─────────────────────────────
 * §7.3 (Davids Entscheidung): der Marktvergleich zeigt den BESTEHENDEN
 * Brand-Score des Brand-Checks, keine eigene Zahl. Hier steht deshalb nur die
 * ADRESSE des Ergebnisses (`brand_checks.$id`) — Score, Band und Fassung
 * bleiben dort, wo sie gerechnet wurden. Eine Kopie des Scores würde altern,
 * sobald der Check neu läuft.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer market
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle antwortet jede spätere market-Route mit 503.
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

const COMPETITORS = 'market_competitors'

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

console.log(`Migration market-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${COMPETITORS}`, () => tablesDB.createTable({
  databaseId, tableId: COMPETITORS, name: 'Market Competitors', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(COMPETITORS)

  // Das Branding, zu dem dieser Kandidat gehört (`brand_profiles.$id`). Er ist
  // die Besitz-Grenze: `market` hat keine eigene Autorisierung, sondern fragt
  // über den brand-Vertrag, ob dieses Profil dem Aufrufer gehört.
  await columnStep(`Column ${COMPETITORS}.profileId`, 'profileId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'profileId', size: 64, required: true,
  }))
  // Der Name kommt als VORSCHLAG aus `a.competitors` — eingetragen hat ihn
  // trotzdem der Mensch (§2.3 Nr. 1). Pflicht, weil eine Zeile ohne Namen in
  // keiner Liste beschriftbar wäre.
  await columnStep(`Column ${COMPETITORS}.name`, 'name', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'name', size: 200, required: true,
  }))
  // Normalisiert (Schema + Host kleingeschrieben, ohne Fragment). Optional —
  // s. Kopf: die drei Nicht-Website-Quellen haben keine.
  await columnStep(`Column ${COMPETITORS}.url`, 'url', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'url', size: 512, required: false, xdefault: '',
  }))
  // pending · reading · fetched · excluded · failed (`MarketCompetitorStatus`).
  await columnStep(`Column ${COMPETITORS}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'status', size: 16, required: false, xdefault: 'pending',
  }))
  // AUFZÄHLBAR, nicht frei (robots · tdm · noText · unreachable): der Grund
  // wird dem Kunden in SEINER Sprache gezeigt, und ein freier Text vom Server
  // wäre in der zweiten Sprache nicht übersetzt.
  await columnStep(`Column ${COMPETITORS}.excludedReason`, 'excludedReason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'excludedReason', size: 32, required: false, xdefault: '',
  }))
  // Welche der vier Quellen (§7.2): website · foundation · library · shared.
  // Default `website` — der Normalfall und der einzige, der überhaupt
  // abgerufen wird.
  //
  // DIE WÖRTER SIND DIE DES PRODUKTVERTRAGS (`MarketCandidateSource` in
  // shared/marketProfile.ts), nicht eigene: dieselbe Herkunft steht auch an
  // jedem einzelnen FELD eines Marktprofils (§7.6, `source`). Zwei
  // Schreibweisen für dieselbe Sache — `shared` hier, `shared-brand` dort —
  // wären eine Abbildung, die jemand pflegen muss, und die erste Stelle, an
  // der ein Vergleich stillschweigend danebengreift.
  await columnStep(`Column ${COMPETITORS}.sourceKind`, 'sourceKind', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'sourceKind', size: 20, required: false, xdefault: 'website',
  }))
  // Worauf die Quelle zeigt: bei `foundation` eine `brand_profiles.$id`, bei
  // `library` der Schlüssel des Repo-Eintrags, bei `shared` die
  // freigegebene Profil-Id. Bei `website` leer — dort ist `url` die Adresse.
  await columnStep(`Column ${COMPETITORS}.sourceRef`, 'sourceRef', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'sourceRef', size: 128, required: false, xdefault: '',
  }))
  // Die Adresse des Brand-Check-Ergebnisses dieser Marke (s. Kopf) — NICHT
  // der Score selbst.
  await columnStep(`Column ${COMPETITORS}.brandCheckId`, 'brandCheckId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'brandCheckId', size: 64, required: false, xdefault: '',
  }))
  // Die tatsächlich gelesenen Seiten als JSON-Liste — die Belege zeigen
  // darauf. Deckel des Abrufs: 8 Seiten (§7.4), je ≤ 512 Zeichen Adresse;
  // 5000 deckt das mit Rand ab und bleibt weit unter dem varchar-Maximum.
  await columnStep(`Column ${COMPETITORS}.pagesFetched`, 'pagesFetched', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: COMPETITORS, key: 'pagesFetched', size: 5000, required: false, xdefault: '',
  }))
  await columnStep(`Column ${COMPETITORS}.fetchedAt`, 'fetchedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: COMPETITORS, key: 'fetchedAt', required: false,
  }))
  // MEDIUMTEXT (off-row) — und deshalb OHNE Default: Appwrite lässt für
  // MEDIUMTEXT keinen zu (dieselbe Falle wie bei `posts.body`). Hier landet
  // der gefilterte Text der gelesenen Seiten; er wird nach `rawExpiresAt`
  // geleert (s. Kopf).
  await columnStep(`Column ${COMPETITORS}.rawText`, 'rawText', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: COMPETITORS, key: 'rawText', required: false,
  }))
  await columnStep(`Column ${COMPETITORS}.rawExpiresAt`, 'rawExpiresAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: COMPETITORS, key: 'rawExpiresAt', required: false,
  }))

  await waitForColumns(COMPETITORS)

  // „Welche Kandidaten hat dieses Branding?" — der Lesepfad der Seite „Markt"
  // und der Löschpfad der Profil-Kaskade.
  await indexStep(`Index ${COMPETITORS}.idx_profile`, {
    tableId: COMPETITORS, key: 'idx_profile', type: TablesDBIndexType.Key, columns: ['profileId'],
  })
  // „Welche sind schon gelesen?" — der Lauf und die Idempotenz-Rechnung
  // fragen nach Stand, nicht nach allen (§2.6).
  await indexStep(`Index ${COMPETITORS}.idx_profile_status`, {
    tableId: COMPETITORS, key: 'idx_profile_status', type: TablesDBIndexType.Key, columns: ['profileId', 'status'],
  })
  // Der Lesepfad der Aufbewahrungsfrist (s. Kopf) — mandantenübergreifend,
  // weil ein Sweep kein Branding kennt.
  await indexStep(`Index ${COMPETITORS}.idx_raw_expires`, {
    tableId: COMPETITORS, key: 'idx_raw_expires', type: TablesDBIndexType.Key, columns: ['rawExpiresAt'],
  })
}

console.log('✔ Migration market-001 fertig')
