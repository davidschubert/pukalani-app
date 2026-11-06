/**
 * Migration insights-002: `insights_brands` — DIE MARKEN-ENTITÄT EINER
 * FREMDEN MARKE.
 *
 * Paket I1, Plan docs/plans/BRAND-INSIGHTS.md §9.3. Gemeinsame Regeln wie
 * insights-001 (server-only, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz.
 *
 * ── WARUM DAS NICHT `brand_publications` IST (§9.3, §8 Frage 3) ──────────
 * Eine Discover-Publikation und ein Insights-Profil sehen einander ähnlich
 * und sind in drei Punkten das GEGENTEIL voneinander:
 *
 *  1. DIE RECHTSGRUNDLAGE. Eine Publikation steht dort, weil ihr Eigentümer
 *     ausdrücklich zugestimmt hat (Opt-in, eingefrorener Snapshot, Widerruf
 *     per Klick). Ein Insights-Profil steht dort, weil wir uns auf Zitatrecht
 *     und Meinungsfreiheit stützen — die Marke hat nie zugestimmt und wird
 *     nie gefragt. Eine Zeile mit zwei Rechtsgrundlagen hätte auf die Frage
 *     „darf das weg?" zwei Antworten.
 *  2. DER NOTAUSGANG. Discover zurückziehen ist eine Kunden-Handlung;
 *     Insights entfernen ist eine Zusage von uns, „ohne Diskussion gewährt"
 *     (Entscheidung 11). Das eine ist ein Knopf, das andere ein
 *     protokollierter Vorgang mit Datum und Grund — deshalb `removedAt` und
 *     `removalReason` als eigene Spalten.
 *  3. DER INHALT. Die Discover-Anatomie zeigt Purpose, Werte, Stimme — Dinge,
 *     die eine Marke über sich selbst FESTGELEGT hat. Bei einer fremden Marke
 *     wissen wir das nicht und dürften es nicht behaupten; hier stehen
 *     stattdessen Zeichen (`marks`), Historie (`history`) und Beziehungen
 *     (`relations`), jeweils mit Beleg.
 *
 * Wenn eine Marke BEIDES ist (ein Kunde, über den wir auch redaktionell
 * schreiben), trägt `publicationId` die Verknüpfung, und die Regel lautet:
 * das Kundenprofil gewinnt — `/brands/<slug>` zeigt die redaktionelle
 * Einordnung und VERLINKT die Anatomie, wiederholt aber keine
 * Fundament-Kapitel.
 *
 * ── KEIN SCORE IN DIESER TABELLE ────────────────────────────────────────
 * `checkId` zeigt auf `brand_checks.$id` — die Adresse des Ergebnisses, nicht
 * die Zahl. Entscheidung 7 sagt es ausdrücklich: „keine zweite Skala, kein
 * Insights-Score". Eine kopierte Zahl würde altern, sobald der Check neu
 * läuft, und dann stünden zwei verschiedene Scores derselben Marke auf zwei
 * Seiten derselben Website. Dieselbe Entscheidung wie bei
 * `market_competitors.brandCheckId`.
 *
 * ── JEDES ZEICHEN UND JEDE HISTORIEN-ZEILE TRÄGT EINEN BELEG ────────────
 * `marks` und `history` sind JSON-Listen mit `sourceIndex`, der in `sources`
 * derselben Zeile zeigt. Das Zod-Schema (`insightsBrandSchema`) lehnt einen
 * Zeiger ins Leere ab: ein Beleg, der auf nichts zeigt, sieht in der Tabelle
 * aus wie ein Beleg. Bei einer FREMDEN Marke ist das kein Schönheitsfehler,
 * sondern der Unterschied zwischen einem Zitat und einer Behauptung.
 *
 * ── `industry` KOMMT AUS DEM 16er-KATALOG DES BRAND-CHECKS ──────────────
 * Wörtlich derselbe (`BRAND_INDUSTRIES` im brand-Layer, über den Vertrag in
 * `server/contracts/brandContract.ts`) — sonst stünde dieselbe Marke im
 * Ranking unter „Gastronomie" und im Profil unter „Food & Beverage". Varchar
 * und kein Enum, aus derselben Begründung wie in brand-017: eine siebzehnte
 * Branche soll ein Eintrag in einer Datei sein, keine Migration auf einer
 * laufenden Instanz. Für `state` gilt dasselbe.
 *
 * ── DAS MARIADB-ZEILENBUDGET, VORGERECHNET ──────────────────────────────
 * Varchar max 16.381 Zeichen je Zeile. Diese Tabelle:
 *
 *   slug 160 + slugHistory 1000 + name 200 + homepage 512
 *   + libraryKey 64 + checkId 64 + publicationId 64
 *   + industry 40 + country 2 + archetype 40 + archetypeSecondary 40
 *   + paletteId 40 + marks 4000 + history 5000 + relations 2000
 *   + state 16 + removalReason 300 + claimedBy 64
 *   = 13.606
 *
 * `sources` ist MEDIUMTEXT und zählt nicht mit; `foundedYear` ist ein
 * Integer.
 *
 * ── EINE ABWEICHUNG VON DEN GRÖSSEN IN §9.3, NACHGERECHNET ──────────────
 * §9.3 nennt `history` als „4000, JSON". Der Vertrag (`insightsBrandSchema`)
 * lässt 12 Einträge zu, je `year` + `text` ≤ 300 + `sourceIndex` +
 * Schlüssel/Anführungszeichen ≈ 370 Zeichen ⇒ ~4.440 im Maximalfall. 5.000
 * deckt das mit Rand und bleibt im Zeilenbudget (s. o.). `marks` bleibt bei
 * 4.000: 8 Einträge × ~370 ≈ 2.960 passen. `relations` bleibt bei 2.000: 12
 * Zeilen-Ids × 67 ≈ 810 passen.
 *
 * ── FÜNF INDIZES, FÜNF FRAGEN (§9.3) ────────────────────────────────────
 *  · `uq_slug` (UNIQUE) — die Adresse `/brands/<slug>`, von DB1 reserviert
 *    (DISCOVER-BRANDS §9 Entscheidung 2) und hier eingelöst. Ein EIGENER
 *    Namensraum neben `brand_publications.uq_slug`: dieselbe Marke KANN unter
 *    beiden Adressen stehen, geteilt wird nur die Slug-FUNKTION, nie der
 *    Index (§9.2).
 *  · `idx_state` — „was ist veröffentlicht, was ist entfernt?"
 *  · `idx_industry` — der Branchen-Filter der Marken-Liste.
 *  · `idx_library_key` — der Weg von einem Eintrag der Marktvergleichs-
 *    Bibliothek zum redaktionellen Profil derselben Marke.
 *  · `idx_slug_history` — die 301-Suche nach einer Umbenennung (§9.2).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer insights
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

const BRANDS = 'insights_brands'

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

console.log(`Migration insights-002 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${BRANDS}`, () => tablesDB.createTable({
  databaseId, tableId: BRANDS, name: 'Insights Brands', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(BRANDS)

  // Die Adresse `/brands/<slug>` (s. Kopf). 160 wie bei `insights_posts`.
  await columnStep(`Column ${BRANDS}.slug`, 'slug', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'slug', size: 160, required: true,
  }))
  // JSON `string[]`, höchstens 5 — der Lesepfad des 301 (§9.2).
  await columnStep(`Column ${BRANDS}.slugHistory`, 'slugHistory', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'slugHistory', size: 1000, required: false, xdefault: '',
  }))
  // Der Markenname, wie er geschrieben wird. Pflicht: eine Marke ohne Namen
  // wäre in keiner Liste beschriftbar.
  await columnStep(`Column ${BRANDS}.name`, 'name', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'name', size: 200, required: true,
  }))
  // Die Website der Marke — der Ausgangspunkt jeder Recherche und der
  // Schlüssel zu einem bestehenden Brand-Check (`findBrandCheckForUrl`).
  await columnStep(`Column ${BRANDS}.homepage`, 'homepage', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'homepage', size: 512, required: false, xdefault: '',
  }))
  // Der Schlüssel der Marktvergleichs-Bibliothek, `''` wenn keiner. Er ist
  // die Brücke zu einer Marke, die dort schon kuratiert liegt — nicht ihre
  // Kopie.
  await columnStep(`Column ${BRANDS}.libraryKey`, 'libraryKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'libraryKey', size: 64, required: false, xdefault: '',
  }))
  // Der jüngste Brand-Check DIESER Website (`brand_checks.$id`) — die
  // Adresse, nicht die Zahl (s. Kopf).
  await columnStep(`Column ${BRANDS}.checkId`, 'checkId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'checkId', size: 64, required: false, xdefault: '',
  }))
  // Die Discover-Veröffentlichung derselben Marke, falls sie Kunde ist
  // (`brand_publications.$id`, s. Kopf). Leer ist der Normalfall.
  await columnStep(`Column ${BRANDS}.publicationId`, 'publicationId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'publicationId', size: 64, required: false, xdefault: '',
  }))
  // Aus dem 16er-Katalog des Brand-Checks (s. Kopf). `unknown` ist der
  // Vorgabewert dort und deshalb auch hier.
  await columnStep(`Column ${BRANDS}.industry`, 'industry', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'industry', size: 40, required: false, xdefault: 'unknown',
  }))
  // ISO-3166-1 alpha-2, kleingeschrieben. Zwei Zeichen, weil das der Code
  // ist — ein längeres Feld lüde dazu ein, Ländernamen hineinzuschreiben, und
  // die stehen in zwei Sprachen verschieden da.
  await columnStep(`Column ${BRANDS}.country`, 'country', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'country', size: 2, required: false, xdefault: '',
  }))
  // 0 = unbekannt. Bewusst kein „required" und kein Ratewert: ein erfundenes
  // Gründungsjahr wäre bei einer FREMDEN Marke genau die Sorte Behauptung,
  // die dieses Produkt sich selbst verbietet.
  await columnStep(`Column ${BRANDS}.foundedYear`, 'foundedYear', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: BRANDS, key: 'foundedYear', required: false, min: 0, max: 2999, xdefault: 0,
  }))
  // Schlüssel aus `BRAND_ARCHETYPES` (brand-Layer, über den Vertrag) — nicht
  // freier Text: „Der Held" muss im Profil dasselbe heissen wie im Wizard.
  await columnStep(`Column ${BRANDS}.archetype`, 'archetype', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'archetype', size: 40, required: false, xdefault: '',
  }))
  await columnStep(`Column ${BRANDS}.archetypeSecondary`, 'archetypeSecondary', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'archetypeSecondary', size: 40, required: false, xdefault: '',
  }))
  // Die Farbwelt des Hero (`brandPaletteId`, brand-Layer) — dieselbe Palette
  // wie im Wizard, damit dieselbe Marke nicht zweimal verschieden aussieht.
  await columnStep(`Column ${BRANDS}.paletteId`, 'paletteId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'paletteId', size: 40, required: false, xdefault: '',
  }))
  // JSON `[{ kind, text, sourceIndex }]` — Symbol, Claim, Typografie, Farbe;
  // je ein Satz MIT Beleg (s. Kopf). Höchstens 8 Einträge.
  await columnStep(`Column ${BRANDS}.marks`, 'marks', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'marks', size: 4000, required: false, xdefault: '',
  }))
  // JSON `[{ year, text, sourceIndex }]` — höchstens 12 Einträge. Zur Grösse
  // 5000 statt der 4000 aus §9.3 s. Kopf.
  await columnStep(`Column ${BRANDS}.history`, 'history', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'history', size: 5000, required: false, xdefault: '',
  }))
  // JSON `string[]` — Zeilen-Ids der Wettbewerber IN DIESER Tabelle. Kein
  // Fremdschlüssel, weil TablesDB keinen kennt; die Auflösung ist ein
  // zweiter Lesevorgang und darf ins Leere gehen (eine entfernte Marke).
  await columnStep(`Column ${BRANDS}.relations`, 'relations', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'relations', size: 2000, required: false, xdefault: '',
  }))
  // JSON `InsightsSource[]` — dieselbe Form wie bei `insights_posts`.
  // MEDIUMTEXT ⇒ kein Default (Appwrite lässt für MEDIUMTEXT keinen zu).
  await columnStep(`Column ${BRANDS}.sources`, 'sources', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: BRANDS, key: 'sources', required: false,
  }))
  // draft · published · removed. Varchar, nicht Enum (s. Kopf).
  await columnStep(`Column ${BRANDS}.state`, 'state', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'state', size: 16, required: false, xdefault: 'draft',
  }))
  // Der Notausgang aus Entscheidung 11 („ohne Diskussion gewährt") — MIT
  // Datum und Grund, weil genau danach Anwaltsfrage 3 fragt. Die Zeile wird
  // NICHT gelöscht: sie ist der Nachweis, dass wir dem Wunsch entsprochen
  // haben, und ohne sie käme dieselbe Marke beim nächsten Recherche-Lauf
  // ahnungslos zurück.
  await columnStep(`Column ${BRANDS}.removedAt`, 'removedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: BRANDS, key: 'removedAt', required: false,
  }))
  await columnStep(`Column ${BRANDS}.removalReason`, 'removalReason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'removalReason', size: 300, required: false, xdefault: '',
  }))
  // Wer dieses Profil als SEINE Marke reklamiert hat (`userId`). Es ist kein
  // Zugriffsrecht und kein Vetorecht — die redaktionelle Einordnung bleibt
  // unsere; die Spalte sagt nur, dass sich jemand gemeldet hat.
  await columnStep(`Column ${BRANDS}.claimedBy`, 'claimedBy', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: BRANDS, key: 'claimedBy', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(BRANDS)

  await indexStep(`Index ${BRANDS}.uq_slug`, {
    tableId: BRANDS, key: 'uq_slug', type: TablesDBIndexType.Unique, columns: ['slug'],
  })
  await indexStep(`Index ${BRANDS}.idx_state`, {
    tableId: BRANDS, key: 'idx_state', type: TablesDBIndexType.Key, columns: ['state'],
  })
  await indexStep(`Index ${BRANDS}.idx_industry`, {
    tableId: BRANDS, key: 'idx_industry', type: TablesDBIndexType.Key, columns: ['industry'],
  })
  await indexStep(`Index ${BRANDS}.idx_library_key`, {
    tableId: BRANDS, key: 'idx_library_key', type: TablesDBIndexType.Key, columns: ['libraryKey'],
  })
  // DER LÄNGEN-DECKEL IST HIER PFLICHT, NICHT KÜR (lokal am 2026-09-09
  // erwischt): Appwrite lehnt einen Index über eine varchar-Spalte > 768
  // Zeichen mit `column_index_invalid` ab („Index length is longer than the
  // maximum: 768") — das ist MariaDBs InnoDB-Grenze von 3072 Byte geteilt
  // durch die 4 Byte je utf8mb4-Zeichen. `slugHistory` ist 1000 lang, damit
  // fünf Slugs à 160 Zeichen hineinpassen; indiziert wird deshalb nur das
  // PRÄFIX. Das kostet nichts: die Spalte muss überhaupt einen Index tragen,
  // damit Appwrite eine Abfrage darauf zulässt, und der JÜNGSTE alte Slug —
  // der mit Abstand am häufigsten aufgerufene — steht in der Liste vorn.
  await indexStep(`Index ${BRANDS}.idx_slug_history`, {
    tableId: BRANDS, key: 'idx_slug_history', type: TablesDBIndexType.Key, columns: ['slugHistory'], lengths: [768],
  })
}

console.log('✔ Migration insights-002 fertig')
