/**
 * Migration brand-012: `brand_waitlist` — WER GEFRAGT HAT, ALS ES NOCH KEINEN
 * ZUGANG GAB.
 *
 * ── WOFÜR ─────────────────────────────────────────────────────────────────
 * branding.supply läuft in geschlossener Beta. Bis heute gab es für jemanden
 * ohne Einladungscode KEINEN Weg, sich bemerkbar zu machen: die Seite versprach
 * „wir melden uns" und hatte niemanden, bei dem sie sich melden konnte. Diese
 * Tabelle ist das Gegenstück zu `brand_invites` (brand-005) — dort steht, wen
 * WIR eingeladen haben, hier, wer SICH gemeldet hat.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die sieben Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── PERSONENBEZOGENE DATEN OHNE KONTO — DIE BEKANNTE GRENZE ───────────────
 * Eine Zeile hier trägt eine E-Mail-Adresse und optional Name und Firma, aber
 * KEINE `userId`: sie entsteht, bevor es ein Konto gibt. Damit greift
 * `registerUserDataContributor` (core, GDPR-Export/Löschung) nicht — der Vertrag
 * hängt an einer userId, die es hier nicht gibt. Eine Löschung auf Zuruf ist
 * heute ein Handgriff des Betreibers in der Appwrite-Konsole (Zeile über
 * `emailLower` suchen, löschen). Das ist bewusst so klein gehalten und steht
 * ebenso im Kopf der Route — wer die Warteliste später an Konten koppelt,
 * bekommt an dieser Stelle die Aufgabe mit.
 *
 * ── DIE SPALTEN ───────────────────────────────────────────────────────────
 *  · `emailLower` (256, Pflicht) — der VERGLEICHSWERT, kleingeschrieben und
 *    getrimmt vom Zod-Schema. Er trägt den UNIQUE-Index; ohne ihn wäre eine
 *    zweite Anfrage derselben Person eine zweite Zeile.
 *  · `email` (256, Pflicht) — dieselbe Adresse in ihrer ORIGINAL-Schreibweise.
 *    Zwei Spalten für eine Adresse ist Absicht: verglichen wird technisch
 *    (klein), angeschrieben wird so, wie jemand sich selbst geschrieben hat.
 *    256 statt der 320 von `brand_invites` — die Zod-Grenze der Route ist 256,
 *    und eine Spalte, die mehr fasst als je ankommt, verspricht zu viel.
 *  · `name` (120) · `company` (160) · `website` (256) — freiwillig, Default ''
 *    (dieselbe Größe wie `brand_profiles.websiteUrl`).
 *  · `locale` (8, Default 'en') — die Sprache der fragenden Seite; sie
 *    entscheidet, in welcher Sprache geantwortet wird.
 *  · `source` (64, Default '') — WELCHE Seite gefragt hat ('about', 'team',
 *    'invite', 'home'). Freier String statt Aufzählung: eine neue Landeseite
 *    soll keine Migration kosten.
 *  · `status` (32, Default 'new') — 'new' | 'invited' | 'declined'. Heute reine
 *    ANZEIGE für den Betreiber: kein Code liest sie, und varchar statt enum,
 *    weil eine Betreiber-Notiz keine Migration wert ist, wenn ein vierter Fall
 *    auftaucht.
 *  · `note` (500, Default '') — die Notiz des Betreibers zur Zeile.
 *
 * ── EIN INDEX, UND ZWAR UNIQUE ────────────────────────────────────────────
 * `idx_email_lower` ist beides — der Name folgt bewusst NICHT dem `uq_`-Muster
 * von brand-005, weil er so beauftragt wurde und ein Indexname nie umbenannt
 * wird: Lesepfad der Route (eine Abfrage vor dem Schreiben) UND die Garantie,
 * dass zwei gleichzeitige Anfragen derselben Adresse keine Dublette bauen —
 * die Vorab-Abfrage allein wäre ein Rennen. Nach `source` oder `status` wird
 * nicht gefiltert (die Liste ist klein und wird in der Konsole gelesen); ein
 * Index dafür wäre Schreiblast ohne Leser.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle antwortet `POST /api/brand/waitlist` mit 503.
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

const WAITLIST = 'brand_waitlist'

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

console.log(`Migration brand-012 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${WAITLIST}`, () => tablesDB.createTable({
  databaseId, tableId: WAITLIST, name: 'Brand Waitlist', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(WAITLIST)

  // Der Vergleichswert (klein geschrieben) — trägt den UNIQUE-Index.
  await columnStep(`Column ${WAITLIST}.emailLower`, 'emailLower', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'emailLower', size: 256, required: true,
  }))
  // Dieselbe Adresse, wie sie eingetippt wurde — für die Anrede.
  await columnStep(`Column ${WAITLIST}.email`, 'email', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'email', size: 256, required: true,
  }))
  // Ab hier alles freiwillig: '' heißt „gefragt, nicht beantwortet".
  await columnStep(`Column ${WAITLIST}.name`, 'name', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'name', size: 120, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WAITLIST}.company`, 'company', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'company', size: 160, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WAITLIST}.website`, 'website', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'website', size: 256, required: false, xdefault: '',
  }))
  await columnStep(`Column ${WAITLIST}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'locale', size: 8, required: false, xdefault: 'en',
  }))
  await columnStep(`Column ${WAITLIST}.source`, 'source', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'source', size: 64, required: false, xdefault: '',
  }))
  // Betreiber-Anzeige, keine Logik (s. Kopf) — deshalb varchar statt enum.
  await columnStep(`Column ${WAITLIST}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'status', size: 32, required: false, xdefault: 'new',
  }))
  await columnStep(`Column ${WAITLIST}.note`, 'note', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: WAITLIST, key: 'note', size: 500, required: false, xdefault: '',
  }))

  await waitForColumns(WAITLIST)

  // Lesepfad UND Dubletten-Garantie in einem (s. Kopf).
  await indexStep(`Index ${WAITLIST}.idx_email_lower`, {
    tableId: WAITLIST, key: 'idx_email_lower', type: TablesDBIndexType.Unique, columns: ['emailLower'],
  })
}

console.log('✔ Migration brand-012 fertig')
