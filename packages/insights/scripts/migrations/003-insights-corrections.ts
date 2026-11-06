/**
 * Migration insights-003: `insights_corrections` — KORREKTURVORSCHLAG UND
 * ENTFERNEN-WUNSCH.
 *
 * Paket I1, Plan docs/plans/BRAND-INSIGHTS.md §9.3. Muster:
 * `brand_check_corrections` (Migration brand-017). Gemeinsame Regeln wie
 * insights-001 (server-only, kein `communityId`, Indizes nur über
 * `createIndexSteps`, idempotent 409 → skip); sie läuft ausschliesslich auf
 * der `branding`-Instanz.
 *
 * ── EINE TABELLE, ZWEI ANLÄSSE ──────────────────────────────────────────
 * `kind: 'correction'` ist „das stimmt so nicht", `kind: 'removal'` ist der
 * Notausgang aus Entscheidung 11. Beide laufen über dieselbe Zeile, denselben
 * Status und dieselbe Entscheidung — sie unterscheiden sich in dem, was eine
 * ANNAHME auslöst, nicht in dem, was der Mensch schreibt. Zwei Tabellen
 * hätten zwei Arbeitslisten für denselben Vorgang und zwei Antworten auf
 * Anwaltsfrage 3 („funktioniert der Korrekturweg?").
 *
 * `targetKind` + `targetId` statt zweier Spalten (`brandId`/`postId`): ein
 * Vorschlag zeigt auf GENAU EIN Ding, und zwei Spalten, von denen immer eine
 * leer ist, wären eine Einladung, beide zu füllen.
 *
 * ── DER ENTSCHEIDUNGS-EINTRAG BLEIBT, DIE PERSON GEHT ───────────────────
 * §9.3: „Der ENTSCHEIDUNGS-Eintrag bleibt dauerhaft — er ist der Nachweis,
 * dass der Korrekturweg funktioniert, und genau danach fragt Anwaltsfrage 3.
 * Was NICHT bleibt: `contactEmail` und `ipHash` werden nach 12 Monaten
 * geleert."
 *
 * Dafür gibt es ZWEI Dinge, die §9.3 nicht ausdrücklich nennt und die diese
 * Migration ergänzt, weil eine Frist ohne Mechanik nur ein Satz ist (dieselbe
 * Lehre wie bei `brand_events`, wo die 24 Monate ein Jahr lang im
 * Migrationskopf standen und der Sweep fehlte):
 *
 *  · `retentionAt` (datetime) — der Zeitpunkt, ab dem geleert wird. Er wird
 *    BEIM ANLEGEN gerechnet (`insightsCorrectionRetentionAt`, Frist als EINE
 *    Konstante `INSIGHTS_CORRECTION_PII_RETENTION_DAYS = 365` in
 *    `shared/insightsCorrection.ts`) und steht damit AN der Zeile. Der Sweep
 *    vergleicht dann nur, statt zu rechnen — und ein späterer Wechsel der
 *    Frist verlängert nicht rückwirkend, was schon zugesagt wurde.
 *  · `idx_retention` — der Lesepfad dazu. Ohne ihn müsste der Sweep jede
 *    Zeile lesen, um zu erfahren, dass er nichts zu tun hat, und Appwrite
 *    verlangt für eine Filter-Spalte ohnehin einen Index. Dieselbe
 *    Überlegung wie bei `market_competitors.idx_raw_expires`: eine
 *    Aufbewahrungsfrist ohne Lesepfad ist ein Versprechen, das der Betrieb
 *    nicht einlösen kann.
 *
 * ── `contactEmail` WIRD KLEINGESCHRIEBEN GESPEICHERT, UND DAS IST EIN INDEX
 * `idx_contact_email` ist der Lesepfad des GDPR-Contributors: „welche Zeilen
 * gehören der Adresse dieses Kontos?" Ein Korrekturvorschlag kommt von
 * DRAUSSEN und trägt keine `userId` — die Adresse ist die einzige
 * Verbindung. Appwrite vergleicht Zeichen für Zeichen, deshalb normalisiert
 * das Zod-Schema (`shared/insightsCorrection.ts`) auf Kleinschreibung: eine
 * Zeile mit `Max@Example.COM` fände die Auskunfts-Abfrage nie, und eine still
 * unvollständige Auskunft ist die teuerste Art, eine Auskunftspflicht zu
 * verfehlen. Dasselbe Muster wie `brand_invites.emailLower` und
 * `brand_waitlist.emailLower`.
 *
 * ── `ipHash` IST EIN TAGES-STEMPEL, NIE EINE IP ─────────────────────────
 * sha256 aus IP und täglich wechselndem Salz, nur für den Missbrauchs-Deckel
 * — dieselbe Konstruktion wie bei `brand_checks.ipHash` und
 * `brand_check_corrections.ipHash`. Die rohe IP wird nie geschrieben und nie
 * geloggt.
 *
 * ── WARUM `status` UND `kind` VARCHARS SIND UND KEINE ENUMS ─────────────
 * Anders als in brand-017, wo `status` ein Enum ist. Der Grund ist nicht
 * Nachlässigkeit, sondern Einheitlichkeit INNERHALB dieses Layers: `format`,
 * `state`, `baseLocale` (insights-001) und `state` (insights-002) sind
 * varchars, weil ihre Wahrheit im Code steht. Zwei Konventionen in drei
 * Tabellen desselben Layers wären beim Lesen eine Frage mehr, und den Gewinn
 * eines Enums — die Datenbank lehnt einen unbekannten Wert ab — holt hier das
 * Zod-Schema, das ohnehin vor jedem Schreibvorgang läuft.
 *
 * ── DAS MARIADB-ZEILENBUDGET, VORGERECHNET ──────────────────────────────
 * targetKind 16 + targetId 64 + kind 16 + field 32 + proposed 300
 * + reason 300 + contactEmail 254 + status 16 + decisionNote 300
 * + ipHash 64 = 1.362 — weit unter 16.381. Keine MEDIUMTEXT-Spalte: ein
 * Korrekturvorschlag ist ein Absatz, kein Artikel.
 *
 * ── VIER INDIZES, VIER FRAGEN ───────────────────────────────────────────
 *  · `idx_status` — die Arbeitsliste des Betreibers („was ist offen?").
 *  · `idx_target` (`targetKind`, `targetId`) — „gibt es zu DIESEM Profil
 *    schon einen Vorschlag?", gefragt auf jeder öffentlichen Seite mit
 *    Korrekturweg.
 *  · `idx_contact_email` — der GDPR-Lesepfad (s. o.).
 *  · `idx_retention` — der Sweep-Lesepfad (s. o.).
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

const CORRECTIONS = 'insights_corrections'

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

console.log(`Migration insights-003 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step(`Table ${CORRECTIONS}`, () => tablesDB.createTable({
  databaseId, tableId: CORRECTIONS, name: 'Insights Corrections', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(CORRECTIONS)

  // `brand` | `post` — worauf der Vorschlag zeigt (s. Kopf). PFLICHT: ein
  // Vorschlag ohne Ziel hat kein Ziel.
  await columnStep(`Column ${CORRECTIONS}.targetKind`, 'targetKind', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'targetKind', size: 16, required: true,
  }))
  // Die Zeilen-Id in `insights_brands` bzw. `insights_posts`. 64 =
  // Appwrite-Zeilen-Id mit Rand.
  await columnStep(`Column ${CORRECTIONS}.targetId`, 'targetId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'targetId', size: 64, required: true,
  }))
  // `correction` | `removal` — die zwei Anlässe (s. Kopf).
  await columnStep(`Column ${CORRECTIONS}.kind`, 'kind', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'kind', size: 16, required: false, xdefault: 'correction',
  }))
  // WELCHES Feld korrigiert wird — frei, nicht aufgezählt: welche Felder
  // korrigierbar sind, entscheidet die Oberfläche in I2/I3, und ein neues
  // Feld soll dort ein Eintrag in einer Datei sein statt eine Migration auf
  // einer laufenden Instanz (dieselbe Entscheidung wie in brand-017).
  await columnStep(`Column ${CORRECTIONS}.field`, 'field', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'field', size: 32, required: false, xdefault: '',
  }))
  // Der VORGESCHLAGENE Wert. Bei `kind: 'removal'` leer — ein
  // Entfernungs-Wunsch schlägt keinen anderen Wert vor, er nennt einen Grund.
  await columnStep(`Column ${CORRECTIONS}.proposed`, 'proposed', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'proposed', size: 300, required: false, xdefault: '',
  }))
  // Die Begründung. Bei einer Korrektur freiwillig (eine erzwungene wäre ein
  // Feld voller Punkte), beim Entfernungs-Wunsch PFLICHT — das erzwingt das
  // Zod-Schema, nicht die Spalte: eine Pflichtspalte hier verböte auch der
  // Redaktion, eine Zeile ohne Grund zu korrigieren.
  await columnStep(`Column ${CORRECTIONS}.reason`, 'reason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'reason', size: 300, required: false, xdefault: '',
  }))
  // FREIWILLIG und kleingeschrieben (s. Kopf) — der einzige echte
  // Personenbezug dieses Layers. Sie steht in der Zeile, damit die Redaktion
  // zurückfragen kann, und geht NIE in eine öffentliche Antwort. Nach
  // `retentionAt` leert sie der Sweep.
  await columnStep(`Column ${CORRECTIONS}.contactEmail`, 'contactEmail', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'contactEmail', size: 254, required: false, xdefault: '',
  }))
  // open · accepted · declined. Varchar, nicht Enum (s. Kopf).
  await columnStep(`Column ${CORRECTIONS}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'status', size: 16, required: false, xdefault: 'open',
  }))
  // Die Notiz zur Entscheidung. Bei einer ABLEHNUNG Pflicht (Zod-Schema): ein
  // „nein" ohne Antwort ist genau das, wonach Anwaltsfrage 3 NICHT fragt.
  await columnStep(`Column ${CORRECTIONS}.decisionNote`, 'decisionNote', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'decisionNote', size: 300, required: false, xdefault: '',
  }))
  // Optional, weil eine OFFENE Zeile keinen hat (dieselbe Rolle wie
  // `decidedAt` in brand-017).
  await columnStep(`Column ${CORRECTIONS}.decidedAt`, 'decidedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CORRECTIONS, key: 'decidedAt', required: false,
  }))
  // Nur für den Deckel — sha256 mit Tages-Salz, nie die rohe IP (s. Kopf).
  await columnStep(`Column ${CORRECTIONS}.ipHash`, 'ipHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: CORRECTIONS, key: 'ipHash', size: 64, required: false, xdefault: '',
  }))
  // Ab hier werden `contactEmail` und `ipHash` geleert (s. Kopf). Optional,
  // weil eine Zeile ohne Frist möglich sein muss — sie fällt dem Betreiber in
  // der Liste auf, eine stillschweigend geleerte nicht.
  await columnStep(`Column ${CORRECTIONS}.retentionAt`, 'retentionAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: CORRECTIONS, key: 'retentionAt', required: false,
  }))

  await waitForColumns(CORRECTIONS)

  await indexStep(`Index ${CORRECTIONS}.idx_status`, {
    tableId: CORRECTIONS, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
  })
  await indexStep(`Index ${CORRECTIONS}.idx_target`, {
    tableId: CORRECTIONS, key: 'idx_target', type: TablesDBIndexType.Key, columns: ['targetKind', 'targetId'],
  })
  await indexStep(`Index ${CORRECTIONS}.idx_contact_email`, {
    tableId: CORRECTIONS, key: 'idx_contact_email', type: TablesDBIndexType.Key, columns: ['contactEmail'],
  })
  await indexStep(`Index ${CORRECTIONS}.idx_retention`, {
    tableId: CORRECTIONS, key: 'idx_retention', type: TablesDBIndexType.Key, columns: ['retentionAt'],
  })
}

console.log('✔ Migration insights-003 fertig')
