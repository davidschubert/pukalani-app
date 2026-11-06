/**
 * Migration insights-001: `insights_posts` — DER BEITRAG (alle vier Formate,
 * eine Zeile).
 *
 * ERSTE Migration des insights-Layers (Paket I1, Plan
 * docs/plans/BRAND-INSIGHTS.md §9.3). Sie läuft AUSSCHLIESSLICH auf der
 * `branding`-Instanz — der Layer steht deshalb nur im BRANDING_SOLL von
 * scripts/ops/verify-schema-parity.mjs, nicht in der instanzweiten
 * Spalten-Parität.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die brand_*- und market_*-
 * Tabellen (ausgeschrieben im Kopf von brand-001): server-only
 * (`permissions: []`, `rowSecurity: false`), kein `communityId` (Silo-Layer
 * auf `branding`), Indizes NUR über `createIndexSteps`, idempotent
 * (409 → skip).
 *
 * ── EINE ZEILE TRÄGT ALLE VIER FORMATE ───────────────────────────────────
 * `profile` · `duel` · `article` · `ranking` (§2). Vier Tabellen hätten vier
 * Redaktionslisten, vier Zustands-Umschalter und vier Antworten auf „was ist
 * veröffentlicht?" — obwohl die Formate sich in genau ZWEI Feldern
 * unterscheiden (`facts` und `brandRefs`) und in allem anderen gleich sind:
 * Titel, Vorspann, Fliesstext, Quellen, Zustand, Sprachfassungen.
 *
 * ── VIER ZUSTÄNDE, UND `übersetzt` IST KEINER DAVON ─────────────────────
 * `draft` · `review` · `published` · `updated` (§9.3). Die lineare Kette aus
 * §3.2 (`… → freigegeben → übersetzt`) trägt nicht: ein Beitrag kann auf
 * Deutsch freigegeben sein, während die englische Fassung noch redigiert
 * wird, und „halb veröffentlicht" lässt sich linear nicht ausdrücken.
 * `übersetzt` ist deshalb eine EIGENSCHAFT der zweiten Fassung
 * (`translationReviewed`) — erst `true` macht sie öffentlich. Das Versprechen
 * „eine maschinell erzeugte, unredigierte Fassung ist NIE öffentlich" bleibt
 * damit wörtlich erfüllt und wird prüfbar statt vorgenommen.
 *
 * ── WARUM `format`, `state` UND `baseLocale` VARCHARS SIND UND KEINE ENUMS
 * Dieselbe Entscheidung wie bei `brand_checks.industry` (brand-017): die
 * WAHRHEIT über die erlaubten Werte steht in `shared/insightsPost.ts`
 * (`INSIGHTS_FORMATS`, `INSIGHTS_STATES`, `INSIGHTS_LOCALES`) — dort liest
 * sie der Editor, die Leseroute und der Test. Ein Enum hier hiesse: ein
 * fünftes Format ist eine Migration auf einer laufenden Instanz, und bis sie
 * gelaufen ist, wirft jedes Speichern mit dem neuen Wert. Die Abbildung
 * `shared/insightsRows.ts` fängt einen unbekannten Wert in die SICHERE
 * Richtung ab (`state` ⇒ `draft`, also nicht öffentlich).
 *
 * ── DAS MARIADB-ZEILENBUDGET, VORGERECHNET ──────────────────────────────
 * Varchar max 16.381 Zeichen je Zeile (Memory „MariaDB/utf8mb4-
 * Zeilenbudget"). Diese Tabelle:
 *
 *   format 16 + slug 160 + slugHistory 1000 + state 16 + baseLocale 8
 *   + titleDe 200 + titleEn 200 + dekDe 400 + dekEn 400
 *   + translationModel 120 + translationPromptVersion 64
 *   + topics 200 + brandRefs 4000
 *   + reviewedBy 64 + noteInternal 500
 *   + draftModel 120 + draftPromptVersion 64
 *   = 7.532
 *
 * Die vier MEDIUMTEXT-Spalten (`bodyDe`, `bodyEn`, `sources`, `facts`) zählen
 * nicht mit — sie liegen off-row und kosten in der Zeile nur einen Zeiger.
 * Genau dafür gibt es `createMediumtextColumn`.
 *
 * ── ZWEI ABWEICHUNGEN VON DEN GRÖSSEN IN §9.3, BEIDE NACHGERECHNET ──────
 * §9.3 nennt `facts` als „varchar 4000 (JSON)" und `brandRefs` als
 * „varchar 2000 (JSON)". Beide Zahlen entstanden VOR dem Prototyp I0, der
 * die Obergrenzen im Zod-Vertrag festgezurrt hat — und gegen diese Grenzen
 * gerechnet reichen sie nicht:
 *
 *  · `facts`: der Vertrag lässt 12 Duell-Zeilen zu (`key` 40 + `labelDe` 80
 *    + `labelEn` 80 + `left` 200 + `right` 200 + Schlüssel/Anführungszeichen
 *    ≈ 620 Zeichen je Zeile ⇒ ~7.400) bzw. ein Ranking mit 10 Plätzen
 *    (`brandId` 64 + `checkId` 64 + `reasonDe` 300 + `reasonEn` 300 + Rest
 *    ≈ 820 ⇒ ~8.300). BEIDE Formen sprengen 4.000 im Maximalfall. Und diese
 *    Spalte auf 8.000 zu ziehen kostete die Hälfte des Zeilenbudgets für
 *    eine Spalte, die ohnehin JSON trägt. Sie ist deshalb MEDIUMTEXT —
 *    dieselbe Wahl und dieselbe Begründung wie bei `sources`.
 *  · `brandRefs`: 20 Verweise × (`brandId` 64 + `checkId` 64 + `libraryKey`
 *    64 + `publicationId` 64 + Schlüssel ≈ 60) ≈ 6.300 im Maximalfall,
 *    realistisch (Appwrite-Zeilen-Ids sind 20 Zeichen) ≈ 2.500 — also auch
 *    im Normalfall über 2.000. 4.000 deckt den realistischen Fall mit Rand
 *    und bleibt im Zeilenbudget (s. o.).
 *
 * Eine Spalte, die den eigenen Vertrag nicht fasst, ist kein Detail: sie
 * scheitert erst beim SCHREIBEN, mit einem 400 aus Appwrite, und nur bei den
 * längsten Beiträgen — also genau bei denen, an denen am meisten Arbeit
 * hängt. Und ein späteres Vergrössern wäre `updateVarcharColumn`, also ein
 * Aufruf, den der Destruktiv-Guard aus `check-manifests.mjs` zu Recht
 * anhält.
 *
 * ── ALLE LISTEN-SPALTEN SIND JSON, AUCH `topics` ────────────────────────
 * §9.3 nennt `topics` „kommagetrennte Schlüssel". Hier steht JSON, aus zwei
 * Gründen: EIN Parser statt zweier (die Abbildung in
 * `shared/insightsRows.ts` behandelt `slugHistory`, `topics`, `brandRefs`,
 * `sources` und `facts` gleich), und `Query.contains` — der einzige Weg, in
 * Appwrite in einer Zeichenkette zu suchen — trifft bei kommagetrennten
 * Werten auch Präfixe: ein Filter auf `brand-strategy` fände auch
 * `brand-strategy-advanced`. Mit den Anführungszeichen des JSON kann das
 * nicht passieren. Derselbe Grund gilt für `slugHistory`, wo genau diese
 * Suche den 301 aus §9.2 trägt.
 *
 * ── VIER INDIZES, VIER FRAGEN (§9.3) ────────────────────────────────────
 *  · `uq_slug` (UNIQUE) — die Adresse `/insights/<slug>`. Unique, weil zwei
 *    Beiträge mit demselben Slug zwei Seiten unter einer Adresse wären und
 *    welche gewönne, entschiede die Abfrage-Reihenfolge.
 *  · `idx_state_published` (`state`, `publishedAt`) — der Lesepfad der
 *    Journal-Liste: „was ist öffentlich, neueste zuerst".
 *  · `idx_format` — der Format-Filter derselben Liste.
 *  · `idx_slug_history` — die 301-Suche nach einer Umbenennung (§9.2). Ohne
 *    ihn wäre der Nachschlag ein Scan über alle Beiträge, und zwar auf dem
 *    404-Pfad, den Bots am häufigsten treffen.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer insights
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle antwortet jede spätere insights-Route mit 503.
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

const POSTS = 'insights_posts'

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

console.log(`Migration insights-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${POSTS}`, () => tablesDB.createTable({
  databaseId, tableId: POSTS, name: 'Insights Posts', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(POSTS)

  // `profile` · `duel` · `article` · `ranking` (§2). Pflicht: eine Zeile ohne
  // Format wäre in keiner Vorlage darstellbar.
  await columnStep(`Column ${POSTS}.format`, 'format', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'format', size: 16, required: true,
  }))
  // Die Adresse `/insights/<slug>` — EINSPRACHIG (§9.2, Entscheidung 2): die
  // Sprache trägt das i18n-Präfix. Zwei Slugs je Zeile hiessen zwei
  // Unique-Indizes, zwei Kollisionsprüfungen und zwei Weiterleitungen je
  // Umbenennung. 160 ist doppelt so viel wie der Deckel der Slug-Funktion
  // (`BRAND_PUBLICATION_SLUG_MAX` = 80) — Platz für einen von Hand gesetzten.
  await columnStep(`Column ${POSTS}.slug`, 'slug', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'slug', size: 160, required: true,
  }))
  // JSON `string[]`, jüngster zuerst, höchstens 5 (`INSIGHTS_SLUG_HISTORY_MAX`).
  // Der Lesepfad des 301 nach einer Umbenennung (§9.2) — die Regel, die DB1
  // versprochen und nicht gebaut hat. 5 × 160 + JSON-Zeichen ≈ 820 < 1000.
  await columnStep(`Column ${POSTS}.slugHistory`, 'slugHistory', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'slugHistory', size: 1000, required: false, xdefault: '',
  }))
  // draft · review · published · updated (s. Kopf).
  await columnStep(`Column ${POSTS}.state`, 'state', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'state', size: 16, required: false, xdefault: 'draft',
  }))
  // `de` oder `en` — die REDIGIERTE Grundfassung (Entscheidung 3). Sie ist
  // die Fassung, die IMMER öffentlich ist; die andere braucht
  // `translationReviewed`.
  await columnStep(`Column ${POSTS}.baseLocale`, 'baseLocale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'baseLocale', size: 8, required: false, xdefault: 'en',
  }))
  await columnStep(`Column ${POSTS}.titleDe`, 'titleDe', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'titleDe', size: 200, required: false, xdefault: '',
  }))
  await columnStep(`Column ${POSTS}.titleEn`, 'titleEn', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'titleEn', size: 200, required: false, xdefault: '',
  }))
  // Der Vorspann (Dek) — die Zeile unter der Überschrift in der Liste.
  await columnStep(`Column ${POSTS}.dekDe`, 'dekDe', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'dekDe', size: 400, required: false, xdefault: '',
  }))
  await columnStep(`Column ${POSTS}.dekEn`, 'dekEn', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'dekEn', size: 400, required: false, xdefault: '',
  }))
  // Markdown aus `UEditor`. MEDIUMTEXT (off-row) — und deshalb OHNE Default:
  // Appwrite lässt für MEDIUMTEXT keinen zu (dieselbe Falle wie bei
  // `posts.body` und `market_competitors.rawText`). Ein Artikel passt in
  // keine varchar-Spalte, das war der Anlass der Regel im Kopf von §9.3.
  await columnStep(`Column ${POSTS}.bodyDe`, 'bodyDe', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'bodyDe', required: false,
  }))
  await columnStep(`Column ${POSTS}.bodyEn`, 'bodyEn', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'bodyEn', required: false,
  }))
  // Wann die zweite Fassung entstand — nicht wann sie freigegeben wurde.
  await columnStep(`Column ${POSTS}.translatedAt`, 'translatedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: POSTS, key: 'translatedAt', required: false,
  }))
  // Die Herkunft der zweiten Fassung (§9.3). Sie steht in der Zeile, damit
  // eine spätere Modell-Ablösung nachvollziehbar bleibt: welcher Text von
  // welchem Modell stammt, ist sonst nach dem ersten Wechsel unbeantwortbar.
  await columnStep(`Column ${POSTS}.translationModel`, 'translationModel', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'translationModel', size: 120, required: false, xdefault: '',
  }))
  await columnStep(`Column ${POSTS}.translationPromptVersion`, 'translationPromptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'translationPromptVersion', size: 64, required: false, xdefault: '',
  }))
  // DER RIEGEL: erst `true` ist die zweite Fassung öffentlich (§9.3, §11
  // Frage 4). Default FALSE — eine unbestätigte Maschinenfassung zählt nicht
  // als Fassung, und der Vorgabewert ist die Zusage.
  await columnStep(`Column ${POSTS}.translationReviewed`, 'translationReviewed', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: POSTS, key: 'translationReviewed', required: false, xdefault: false,
  }))
  // JSON `string[]` — Schlüssel aus dem Cluster-Katalog `INSIGHTS_TOPICS`
  // (acht Themen, im Code und nicht als Tabelle: sie ändern sich seltener als
  // ein Deploy). Zum JSON statt kommagetrennt s. Kopf.
  await columnStep(`Column ${POSTS}.topics`, 'topics', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'topics', size: 200, required: false, xdefault: '',
  }))
  // JSON `InsightsSource[]` — die ZITATSCHRANKE im Schema (§9.3): je Eintrag
  // Adresse, Herausgeber, Datum, Art, Zitat ≤ 200 Zeichen, bei Wikipedia
  // zusätzlich die Lizenz. Die Prüfung sitzt im Zod-Schema UND im Übergang
  // nach `review` — „eine Regel, die nur im Formular steht, ist keine".
  // MEDIUMTEXT ⇒ kein Default: 40 Quellen mit Zitat sprengen jede varchar.
  await columnStep(`Column ${POSTS}.sources`, 'sources', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'sources', required: false,
  }))
  // JSON `[{ brandId, checkId, libraryKey, publicationId }]` — die erwähnten
  // Marken. Zur Grösse 4000 statt der 2000 aus §9.3 s. Kopf.
  await columnStep(`Column ${POSTS}.brandRefs`, 'brandRefs', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'brandRefs', size: 4000, required: false, xdefault: '',
  }))
  // JSON, ZWEI Formen (§9.3): eine LISTE ⇒ Duell-Zeilen
  // (`{ key, labelDe, labelEn, left, right, winner, sourceIndex }`), ein
  // OBJEKT ⇒ das eingefrorene Ranking (`{ issue, asOf, entries }`). Beide
  // tragen `sourceIndex` bzw. `checkId` — eine Faktenzeile OHNE Beleg lässt
  // sich nicht speichern. MEDIUMTEXT statt varchar 4000, Rechnung im Kopf.
  await columnStep(`Column ${POSTS}.facts`, 'facts', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: POSTS, key: 'facts', required: false,
  }))
  // Wörter ÷ 200, aufgerundet — gerechnet aus der GRUNDFASSUNG und beim
  // SPEICHERN, nicht beim Lesen (§9.3). Sonst rechnete jede Seitenansicht
  // dieselbe Zahl neu, und „kürzeste Lesezeit" als Sortierung müsste den
  // ganzen Text laden.
  await columnStep(`Column ${POSTS}.readingMinutes`, 'readingMinutes', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: POSTS, key: 'readingMinutes', required: false, min: 0, max: 120, xdefault: 0,
  }))
  await columnStep(`Column ${POSTS}.publishedAt`, 'publishedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: POSTS, key: 'publishedAt', required: false,
  }))
  await columnStep(`Column ${POSTS}.reviewedAt`, 'reviewedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: POSTS, key: 'reviewedAt', required: false,
  }))
  // Wer das Zeichen gegeben hat (`userId`). KEIN Autorenname für die
  // Öffentlichkeit — Entscheidung 4 sagt ausdrücklich: kein Autorenname am
  // Artikel. Das hier ist ein Betreiber-Stempel; der GDPR-Contributor leert
  // ihn bei einer Konto-Löschung, statt den Beitrag zu löschen.
  await columnStep(`Column ${POSTS}.reviewedBy`, 'reviewedBy', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'reviewedBy', size: 64, required: false, xdefault: '',
  }))
  // Redaktionsnotiz — NIE öffentlich (§9.3). Sie steht in derselben Zeile,
  // weil sie zu diesem Beitrag gehört; dass sie draussen bleibt, entscheidet
  // die Leseroute, nicht die Ablage.
  await columnStep(`Column ${POSTS}.noteInternal`, 'noteInternal', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'noteInternal', size: 500, required: false, xdefault: '',
  }))
  // Herkunft des KI-ENTWURFS (§9.3) — getrennt von der Übersetzung oben,
  // weil es zwei verschiedene Aufrufe mit zwei verschiedenen Prompts sind.
  await columnStep(`Column ${POSTS}.draftModel`, 'draftModel', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'draftModel', size: 120, required: false, xdefault: '',
  }))
  await columnStep(`Column ${POSTS}.draftPromptVersion`, 'draftPromptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: POSTS, key: 'draftPromptVersion', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(POSTS)

  // Die Adresse — UNIQUE (s. Kopf).
  await indexStep(`Index ${POSTS}.uq_slug`, {
    tableId: POSTS, key: 'uq_slug', type: TablesDBIndexType.Unique, columns: ['slug'],
  })
  // „Was ist öffentlich, neueste zuerst?" — der Lesepfad der Journal-Liste.
  await indexStep(`Index ${POSTS}.idx_state_published`, {
    tableId: POSTS, key: 'idx_state_published', type: TablesDBIndexType.Key, columns: ['state', 'publishedAt'],
  })
  // Der Format-Filter derselben Liste (§9.2).
  await indexStep(`Index ${POSTS}.idx_format`, {
    tableId: POSTS, key: 'idx_format', type: TablesDBIndexType.Key, columns: ['format'],
  })
  // Die 301-Suche nach einer Umbenennung (§9.2) — auf dem 404-Pfad, deshalb
  // ein Index und kein Scan.
  // DER LÄNGEN-DECKEL IST HIER PFLICHT, NICHT KÜR (lokal am 2026-09-09
  // erwischt): Appwrite lehnt einen Index über eine varchar-Spalte > 768
  // Zeichen mit `column_index_invalid` ab („Index length is longer than the
  // maximum: 768") — das ist MariaDBs InnoDB-Grenze von 3072 Byte geteilt
  // durch die 4 Byte je utf8mb4-Zeichen. `slugHistory` ist 1000 lang, damit
  // fünf Slugs à 160 Zeichen hineinpassen; indiziert wird deshalb nur das
  // PRÄFIX. Das kostet nichts: die Spalte muss überhaupt einen Index tragen,
  // damit Appwrite eine Abfrage darauf zulässt, und der JÜNGSTE alte Slug —
  // der mit Abstand am häufigsten aufgerufene — steht in der Liste vorn.
  await indexStep(`Index ${POSTS}.idx_slug_history`, {
    tableId: POSTS, key: 'idx_slug_history', type: TablesDBIndexType.Key, columns: ['slugHistory'], lengths: [768],
  })
}

console.log('✔ Migration insights-001 fertig')
