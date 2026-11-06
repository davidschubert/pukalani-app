/**
 * Migration brand-016: `brand_checks` — DER KOSTENLOSE AUSSEN-CHECK.
 *
 * NUMMER: 015 (`brand-waitlist-doi`) war der letzte Stand auf `origin/main`
 * und in jedem Arbeitsbaum; 016 ist die nächste freie. Nummern werden von
 * parallel laufenden Sitzungen vergeben — wer nach dieser hier eine anlegt,
 * sieht zuerst nach (`ls packages/brand/scripts/migrations` gegen ein frisches
 * `git fetch origin main`).
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * Ein Ergebnis von `POST /api/brand/check` (docs/archiv/BRAND-CHECK.md): Brand
 * Score, acht Kategorie-Werte, vierzig Kriterien mit Beleg, drei Befunde. Es
 * ist zugleich der ZWISCHENSPEICHER — dieselbe Adresse innerhalb von sieben
 * Tagen bekommt genau diese Zeile zurück, ohne Abruf und ohne KI-Aufruf (Plan
 * §2 und §5). Das ist kein Nebeneffekt, sondern der Kostendeckel.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── DIE ERSTE brand_*-TABELLE OHNE KONTO ──────────────────────────────────
 * Kein `createdByUserId`, keine `profileId`: die Route läuft ohne Anmeldung
 * (Davids Hybrid-Zugang 2026-09-05). Was hier an Personenbezug entsteht, ist
 * `ipHash` — sha256 aus IP und einem TÄGLICH wechselnden Salz, ausschliesslich
 * für den 3/Tag-Deckel. Die rohe IP wird nie geschrieben und nie geloggt; nach
 * dem Salz-Wechsel ist der Stempel nicht mehr zuordenbar. Ein
 * `registerUserDataContributor` (core, GDPR-Export/Löschung) greift wie bei
 * `brand_waitlist` nicht — er hängt an einer userId, die es hier nicht gibt.
 *
 * ── KEIN SEITENTEXT ───────────────────────────────────────────────────────
 * Plan §5: das Rohmaterial der fremden Seite wird nach der Auswertung
 * verworfen. Was bleibt, sind die BELEGE (je ≤ 160 Zeichen, in `criteria`) und
 * `textHash`. Es gibt hier bewusst keine Spalte, in die ein Seitentext PASSEN
 * würde — `criteria` ist MEDIUMTEXT, weil vierzig Kriterien mit Beleg und Notiz
 * die 65-KB-Zeilengrenze von MariaDB sonst sprengen (s. `createMediumtextColumn`
 * und docs zur utf8mb4-Zeilenrechnung), nicht als Textablage.
 *
 * ── EIN INDEX ─────────────────────────────────────────────────────────────
 * `idx_url_key` (KEY, nicht unique): der Zwischenspeicher fragt „gibt es zu
 * dieser Adresse etwas Jüngeres als sieben Tage?" und braucht dafür VIELE
 * Zeilen je Schlüssel — jede Prüfung derselben Seite legt nach Ablauf eine
 * neue an, und die alten sind die Historie (Score-Verlauf ist Monitoring,
 * Plan §6, aber die Daten dafür wegzuwerfen wäre nicht mehr rückholbar).
 * Ein UNIQUE hier verböte genau das.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle antwortet `POST /api/brand/check` mit 503.
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

console.log(`Migration brand-016 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${CHECKS}`, () => tablesDB.createTable({
  databaseId, tableId: CHECKS, name: 'Brand Checks', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(CHECKS)

  // Der Cache-Schlüssel: Host + Pfad, kleingeschrieben, ohne Query und ohne
  // Fragment (`brandCheckUrlKey`). 600 deckt den Fall ab, dass eine Adresse
  // ihren gesamten 512-Zeichen-Deckel in den Pfad legt.
  await columnStep(`Column ${CHECKS}.urlKey`, 'urlKey', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'urlKey', size: 600, required: true,
  }))
  // Die Adresse, bei der wir nach allen Weiterleitungen gelandet sind — das
  // ist die, die geprüft wurde, und nur die darf im Ergebnis stehen.
  await columnStep(`Column ${CHECKS}.url`, 'url', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'url', size: 512, required: false, xdefault: '',
  }))
  await columnStep(`Column ${CHECKS}.host`, 'host', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'host', size: 256, required: false, xdefault: '',
  }))
  // Die Sprache der FRAGENDEN Seite (nicht die der geprüften).
  await columnStep(`Column ${CHECKS}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'locale', size: 8, required: false, xdefault: 'en',
  }))
  // 0–100 als Grenze der SPALTE, nicht nur der Rechnung: ein Wert ausserhalb
  // wäre kein Score mehr, und die Datenbank ist die letzte Stelle, die das
  // noch sagen kann.
  await columnStep(`Column ${CHECKS}.score`, 'score', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: CHECKS, key: 'score', required: false, min: 0, max: 100, xdefault: 0,
  }))
  await columnStep(`Column ${CHECKS}.band`, 'band', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'band', size: 32, required: false, xdefault: '',
  }))
  // Fassung der RECHNUNG und Fassung der FRAGEN — zwei Dinge, zwei Spalten:
  // ein geschärfter Prompt ändert die Urteile, eine geänderte Gewichtung den
  // Gesamtwert, und man will später wissen, welches von beidem es war.
  await columnStep(`Column ${CHECKS}.scoreVersion`, 'scoreVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'scoreVersion', size: 32, required: false, xdefault: '',
  }))
  await columnStep(`Column ${CHECKS}.promptVersion`, 'promptVersion', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'promptVersion', size: 64, required: false, xdefault: '',
  }))
  // Welches Modell geantwortet hat. Es steht in der Zeile und NICHT in der
  // öffentlichen Antwort: der Leser interessiert sich für sein Ergebnis, der
  // Betreiber für die Frage „welches Modell urteilt hier eigentlich?".
  await columnStep(`Column ${CHECKS}.model`, 'model', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'model', size: 120, required: false, xdefault: '',
  }))
  // Acht Kategorien und drei Befunde passen bequem in varchar; die vierzig
  // Kriterien mit Beleg (≤160) und Notiz (≤240) tun es NICHT.
  await columnStep(`Column ${CHECKS}.categories`, 'categories', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'categories', size: 2000, required: false, xdefault: '',
  }))
  // MEDIUMTEXT (off-row) — und deshalb OHNE Default: Appwrite lässt für
  // MEDIUMTEXT keinen zu (dieselbe Falle wie bei `posts.body`).
  await columnStep(`Column ${CHECKS}.criteria`, 'criteria', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: CHECKS, key: 'criteria', required: false,
  }))
  await columnStep(`Column ${CHECKS}.findings`, 'findings', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'findings', size: 2000, required: false, xdefault: '',
  }))
  // Alles, was von der gelesenen Seite bleibt (s. Kopf).
  await columnStep(`Column ${CHECKS}.textHash`, 'textHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'textHash', size: 64, required: false, xdefault: '',
  }))
  // Nur für den Deckel — sha256 mit Tages-Salz, nie die rohe IP (s. Kopf).
  await columnStep(`Column ${CHECKS}.ipHash`, 'ipHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CHECKS, key: 'ipHash', size: 64, required: false, xdefault: '',
  }))

  await waitForColumns(CHECKS)

  // Der Lesepfad des Zwischenspeichers. KEY, nicht UNIQUE (s. Kopf).
  await indexStep(`Index ${CHECKS}.idx_url_key`, {
    tableId: CHECKS, key: 'idx_url_key', type: TablesDBIndexType.Key, columns: ['urlKey'],
  })
}

console.log('✔ Migration brand-016 fertig')
