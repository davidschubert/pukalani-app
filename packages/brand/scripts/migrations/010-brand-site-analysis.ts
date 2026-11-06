/**
 * Migration brand-010: der ZWISCHENSPEICHER DER URL-ANALYSE — drei Spalten auf
 * `brand_profiles` (`siteAnalysis`, `siteAnalyzedAt`, `siteAnalysisUrl`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Die Startkarte (brand-009) trägt seit P2.5 eine optionale `websiteUrl`, und
 * das Formular verspricht daneben wörtlich „ich lese sie, damit du dich nicht
 * wiederholen musst". Bis heute las sie niemand. P2.3 löst das Versprechen ein:
 * die Seite wird EINMAL gelesen, der TEXT daraus bleibt hier liegen und wird
 * Georges Quelle für `a.toneAnalysis`, `a.competitors` und `a.pitch`.
 *
 * GESPEICHERT WIRD NUR DER EXTRAHIERTE TEXT. Das rohe HTML verlässt
 * `fetchBrandSite()` gar nicht erst (Plan §9b: „Rohmaterial nach Extraktion
 * früh gelöscht") — es gibt keine Spalte dafür und keinen Aufrufer, der eine
 * füllen könnte.
 *
 * ── MEDIUMTEXT HAT KEINEN DEFAULT, UND DAS IST HIER DIE FALLE ─────────────
 * `siteAnalysis` ist der einzige der drei, der gross werden kann (Deckel
 * 20.000 Zeichen, `BRAND_SITE_ANALYSIS_MAX_TEXT`) — varchar wäre bei 16.381
 * Zeichen am Ende und risse ausserdem am ~65-KB-Zeilenbudget von MariaDB.
 * MEDIUMTEXT liegt off-row, erlaubt dafür KEINEN Vorgabewert (dieselbe Stelle
 * wie `storyBody` in brand-001): eine Bestands-Zeile liest dort `undefined`,
 * und der LESE-Pfad muss daraus '' machen. Genau das tut
 * `profileSiteAnalysisText()` in `server/utils/brandStore.ts` — wer hier eine
 * Spalte ergänzt, ergänzt dort die Normalisierung.
 *
 * Die beiden anderen sind varchar MIT `xdefault: ''`, wie die Startkarte:
 *  · `siteAnalyzedAt` — ISO-Zeitpunkt, '' heisst „nie gelesen". Bewusst kein
 *    Datetime-Typ: die drei Felder werden IMMER zusammen gelesen und nie
 *    sortiert oder gefiltert, und '' ist als „nie" ehrlicher als NULL.
 *  · `siteAnalysisUrl` — WELCHE Adresse der Zwischenspeicher beschreibt (256,
 *    dieselbe Grösse wie `websiteUrl`). Weicht sie von der heutigen
 *    `websiteUrl` ab, ist der Stand veraltet (`siteAnalysisIsStale`). Ohne
 *    dieses Feld wüsste niemand, ob der Text zur Marke gehört oder zur
 *    Website, die vorgestern noch im Feld stand.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Nach keinem der drei wird je gefiltert oder sortiert (dieselbe Begründung
 * wie bei brand-008/009). Ein Index wäre Schreiblast ohne Leser.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — die Analyse-Route schreibt alle drei Felder explizit.
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
const PROFILES = 'brand_profiles'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
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

async function columnStep(key: string, cols: Set<string>, create: () => Promise<unknown>): Promise<void> {
  const label = `Column ${PROFILES}.${key}`
  if (cols.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  try {
    await create()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) console.log(`↷ ${label} (existiert bereits)`)
    else throw error
  }
}

console.log(`Migration brand-010 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  // Der extrahierte Text. MEDIUMTEXT ⇒ kein Default (s. Kopf).
  await columnStep('siteAnalysis', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PROFILES, key: 'siteAnalysis', required: false,
  }))
  // '' = nie gelesen.
  await columnStep('siteAnalyzedAt', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'siteAnalyzedAt', size: 32, required: false, xdefault: '',
  }))
  // Welche Adresse der Zwischenspeicher beschreibt — dieselbe Grösse wie `websiteUrl`.
  await columnStep('siteAnalysisUrl', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PROFILES, key: 'siteAnalysisUrl', size: 256, required: false, xdefault: '',
  }))
}

console.log('✔ Migration brand-010 fertig')
