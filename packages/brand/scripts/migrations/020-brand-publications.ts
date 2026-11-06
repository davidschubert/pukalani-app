/**
 * Migration brand-020: DIE ÖFFENTLICHE MARKENGALERIE — `publicationVisibility`
 * am Profil, `brand_publications` und `brand_publication_reports`
 * (docs/plans/DISCOVER-BRANDS.md §5, Paket D1).
 *
 * NUMMER: 019 (`brand-profiles-market-visibility`) war der letzte Stand auf
 * `origin/main` und in jedem Arbeitsbaum (2026-09-08 geprüft); 020 ist die
 * nächste freie. Nummern vergeben parallel laufende Sitzungen — wer nach
 * dieser hier eine anlegt, sieht zuerst nach (`git fetch origin &&
 * git ls-tree --name-only origin/main packages/brand/scripts/migrations/`).
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── EIN EIGENES OPT-IN, OBWOHL `marketVisibility` DANEBEN STEHT (§2) ──────
 * Eine Zustimmung gilt nur für das, wofür sie gegeben wurde. „Meine Marke darf
 * im Marktvergleich anderer Kunden als Kandidat erscheinen" (brand-019) und
 * „meine Marke darf als indexierbare Seite im offenen Netz stehen" sind zwei
 * verschiedene Sätze — der zweite ist der grössere. Die Spalte wiederzuverwenden
 * hiesse, die eine Zustimmung im Schatten der anderen einzusammeln. Vorgabewert
 * ist deshalb wieder die ABLEHNUNG (`private`), und die Wahrheit über die
 * erlaubten Werte steht im Code (`shared/brandPublication.ts`), nicht in einem
 * Enum — dieselbe Entscheidung wie bei brand-017/019.
 *
 * ── EINE ZEILE JE BRAND, ROW-ID = PROFIL-ID ──────────────────────────────
 * Eine Marke hat GENAU EINE Veröffentlichung; ihre Geschichte ist der Zustand,
 * nicht eine Reihe von Zeilen (anders als `brand_shares`, wo jede Rotation eine
 * neue Zeile ist, weil jeder alte Link seinen eigenen Inhalt behalten muss).
 * Die abgeleitete Id macht daraus ein `getRow` statt einer Abfrage — dasselbe
 * Muster wie bei `brand_steps` — und aus dem erneuten Einreichen eine
 * idempotente Handlung. Eine `profileId`-SPALTE gibt es deshalb bewusst nicht;
 * die Löschkaskade räumt über die Zeilen-Id (`index.delete.ts`).
 *
 * ── ZWEI SNAPSHOT-SPALTEN, UND DAS IST DER KERN DER FREIGABE (§3.4) ──────
 * `snapshot` = der ÖFFENTLICHE Stand, `pendingSnapshot` = der EINGEREICHTE.
 * Wer eine bereits freigegebene Marke aktualisiert, schreibt nur den zweiten:
 * bis der Betreiber entscheidet, bleibt der alte Stand öffentlich. Mit nur
 * einer Spalte sähe die Öffentlichkeit während der Prüfung genau das, was noch
 * niemand geprüft hat. Beide MEDIUMTEXT (off-row) und deshalb OHNE Default —
 * Appwrite lässt für MEDIUMTEXT keinen zu (dieselbe Falle wie bei
 * `brand_checks.criteria` und `posts.body`).
 *
 * ── DIE STECKBRIEF-FELDER SIND KOPIEN, UND ZWAR MIT ABSICHT ──────────────
 * `pathKind`, `industry`, `archetype`, `archetypeSecondary`, `paletteId`,
 * `locale`, `checkId` stehen alle auch woanders. Hier stehen sie, weil die
 * Galerie ÜBER sie filtert und sortiert (§4.1) — eine Facette, die je Kachel
 * drei fremde Zeilen nachladen müsste, ist keine. Und sie sind eingefroren wie
 * der Snapshot: eine spätere Korrektur der Branche ändert eine bestehende
 * Veröffentlichung nicht rückwirkend, sie geht mit dem nächsten Stand durch
 * die Freigabe.
 *
 * ── FÜNF INDIZES, JEDER FÜR EINEN LESEPFAD ───────────────────────────────
 *  · `uq_slug`             — die Adresse `/discover/<slug>`. UNIQUE, weil zwei
 *                            Marken unter derselben Adresse nicht existieren
 *                            dürfen; die Kollisionsauflösung (`-2`, `-3`)
 *                            hängt genau an diesem 409.
 *  · `idx_status_published` — die Galerie: „alle freigegebenen, neueste zuerst".
 *  · `idx_featured`        — Brand of the Day (genau eine, Entscheidung 6).
 *  · `idx_archetype`, `idx_palette` — die zwei Facetten, die nur wir haben.
 * KEIN Index auf `industry`: die Branchen-Facette läuft heute über dieselbe
 * Abfrage wie die Galerie und filtert im Code über eine kleine Menge; ein
 * Index dafür wäre ein Versprechen auf eine Datenmenge, die es noch nicht gibt.
 *
 * ── DIE MELDUNGEN SIND EINE EIGENE TABELLE ───────────────────────────────
 * Wie `brand_check_corrections` (brand-017) und aus demselben Grund: eine
 * Meldung hat einen eigenen Zustand, einen eigenen Absender, und es kann
 * mehrere je Veröffentlichung geben. `reportCount` an der Veröffentlichung ist
 * nur der ZÄHLER für die Betreiber-Liste, nie die Wahrheit — die steht in den
 * Zeilen.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Tabelle antwortet das Einreichen mit 503, und ohne die
 * Spalte lehnt Appwrite jedes Setzen des Opt-ins ab.
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

const PROFILES = 'brand_profiles'
const PUBLICATIONS = 'brand_publications'
const REPORTS = 'brand_publication_reports'

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

console.log(`Migration brand-020 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// ── 1 · Das Opt-in am Profil ────────────────────────────────────────────────
{
  const cols = await existingColumnKeys(PROFILES)

  // `private` (Default) | `public` — der Vorgabewert ist die Ablehnung (s. Kopf).
  await columnStep(
    `Column ${PROFILES}.publicationVisibility`,
    'publicationVisibility',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: PROFILES, key: 'publicationVisibility', size: 16,
      required: false, xdefault: 'private',
    }),
  )

  await waitForColumns(PROFILES)

  // „Welche Brandings haben zugestimmt?" — die Frage des Betreiber-Überblicks
  // und jedes künftigen Aufräum-Laufs.
  await indexStep(`Index ${PROFILES}.idx_publication_visibility`, {
    tableId: PROFILES,
    key: 'idx_publication_visibility',
    type: TablesDBIndexType.Key,
    columns: ['publicationVisibility'],
  })
}

// ── 2 · Die Veröffentlichungen ──────────────────────────────────────────────
await step(`Table ${PUBLICATIONS}`, () => tablesDB.createTable({
  databaseId, tableId: PUBLICATIONS, name: 'Brand Publications', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(PUBLICATIONS)

  // Die Adresse. 160 statt der 80 aus `BRAND_PUBLICATION_SLUG_MAX`: die Spalte
  // ist der Rahmen, nicht die Regel — sie soll eine spätere Lockerung der
  // Regel nicht zur Migration machen.
  await columnStep(`Column ${PUBLICATIONS}.slug`, 'slug', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'slug', size: 160, required: true,
  }))
  // Der Titel, wie er in der Galerie steht — eingefroren wie alles hier.
  await columnStep(`Column ${PUBLICATIONS}.title`, 'title', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'title', size: 200, required: false, xdefault: '',
  }))
  // Der ÖFFENTLICHE Stand (s. Kopf). MEDIUMTEXT ⇒ kein Default.
  await columnStep(`Column ${PUBLICATIONS}.snapshot`, 'snapshot', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PUBLICATIONS, key: 'snapshot', required: false,
  }))
  // Der EINGEREICHTE Stand, der auf die Freigabe wartet (s. Kopf).
  await columnStep(`Column ${PUBLICATIONS}.pendingSnapshot`, 'pendingSnapshot', cols, () => tablesDB.createMediumtextColumn({
    databaseId, tableId: PUBLICATIONS, key: 'pendingSnapshot', required: false,
  }))
  // Drei Zeitpunkte, drei Fragen: wann eingereicht, wann freigegeben, wann
  // entschieden. `decidedAt` ist OPTIONAL ohne Default — „noch nie entschieden"
  // ist ein echter Zustand und kein leerer Text.
  await columnStep(`Column ${PUBLICATIONS}.submittedAt`, 'submittedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PUBLICATIONS, key: 'submittedAt', required: false,
  }))
  await columnStep(`Column ${PUBLICATIONS}.publishedAt`, 'publishedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PUBLICATIONS, key: 'publishedAt', required: false,
  }))
  await columnStep(`Column ${PUBLICATIONS}.updatedAt`, 'updatedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PUBLICATIONS, key: 'updatedAt', required: false,
  }))
  await columnStep(`Column ${PUBLICATIONS}.decidedAt`, 'decidedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PUBLICATIONS, key: 'decidedAt', required: false,
  }))
  // Der Steckbrief (s. Kopf) — Kopien, über die die Galerie filtert.
  await columnStep(`Column ${PUBLICATIONS}.pathKind`, 'pathKind', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'pathKind', size: 16, required: false, xdefault: 'new',
  }))
  await columnStep(`Column ${PUBLICATIONS}.industry`, 'industry', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'industry', size: 40, required: false, xdefault: 'unknown',
  }))
  await columnStep(`Column ${PUBLICATIONS}.archetype`, 'archetype', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'archetype', size: 40, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PUBLICATIONS}.archetypeSecondary`, 'archetypeSecondary', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'archetypeSecondary', size: 40, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PUBLICATIONS}.paletteId`, 'paletteId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'paletteId', size: 40, required: false, xdefault: '',
  }))
  await columnStep(`Column ${PUBLICATIONS}.locale`, 'locale', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'locale', size: 8, required: false, xdefault: 'de',
  }))
  // NUR die Adresse des jüngsten Checks — nie seine Zahlen. Die Anatomie holt
  // sie beim Anzeigen; ein eingefrorener Score wäre spätestens beim nächsten
  // Check eine Behauptung über einen Stand, den es nicht mehr gibt.
  await columnStep(`Column ${PUBLICATIONS}.checkId`, 'checkId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'checkId', size: 64, required: false, xdefault: '',
  }))
  // Der Zustand (`shared/brandPublication.ts`). Default `pending`: eine Zeile,
  // die entsteht, wartet — öffentlich wird sie nur durch eine Entscheidung.
  await columnStep(`Column ${PUBLICATIONS}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'status', size: 16, required: false, xdefault: 'pending',
  }))
  // Die Begründung des Betreibers beim Ablehnen ODER Ausblenden. ≤ 300 Zeichen
  // (§4.4) — sie ist ein Satz an den Kunden, kein Protokoll.
  await columnStep(`Column ${PUBLICATIONS}.decisionNote`, 'decisionNote', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: PUBLICATIONS, key: 'decisionNote', size: 300, required: false, xdefault: '',
  }))
  // Brand of the Day (Entscheidung 6: genau eine, die letzte gewinnt). Ohne
  // Default: „nie hervorgehoben" ist ein Zustand, kein leerer Text.
  await columnStep(`Column ${PUBLICATIONS}.featuredAt`, 'featuredAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: PUBLICATIONS, key: 'featuredAt', required: false,
  }))
  // Der Zähler für die Betreiber-Liste — nie die Wahrheit (s. Kopf).
  await columnStep(`Column ${PUBLICATIONS}.reportCount`, 'reportCount', cols, () => tablesDB.createIntegerColumn({
    databaseId, tableId: PUBLICATIONS, key: 'reportCount', required: false, min: 0, max: 1_000_000, xdefault: 0,
  }))
  // Das redaktionelle Beispiel-Branding (Entscheidung 4, Badge „Beispiel").
  await columnStep(`Column ${PUBLICATIONS}.example`, 'example', cols, () => tablesDB.createBooleanColumn({
    databaseId, tableId: PUBLICATIONS, key: 'example', required: false, xdefault: false,
  }))

  await waitForColumns(PUBLICATIONS)

  await indexStep(`Index ${PUBLICATIONS}.uq_slug`, {
    tableId: PUBLICATIONS, key: 'uq_slug', type: TablesDBIndexType.Unique, columns: ['slug'],
  })
  await indexStep(`Index ${PUBLICATIONS}.idx_status_published`, {
    tableId: PUBLICATIONS, key: 'idx_status_published', type: TablesDBIndexType.Key,
    columns: ['status', 'publishedAt'],
  })
  await indexStep(`Index ${PUBLICATIONS}.idx_featured`, {
    tableId: PUBLICATIONS, key: 'idx_featured', type: TablesDBIndexType.Key, columns: ['featuredAt'],
  })
  await indexStep(`Index ${PUBLICATIONS}.idx_archetype`, {
    tableId: PUBLICATIONS, key: 'idx_archetype', type: TablesDBIndexType.Key, columns: ['archetype'],
  })
  await indexStep(`Index ${PUBLICATIONS}.idx_palette`, {
    tableId: PUBLICATIONS, key: 'idx_palette', type: TablesDBIndexType.Key, columns: ['paletteId'],
  })
}

// ── 3 · Die Meldungen ───────────────────────────────────────────────────────
await step(`Table ${REPORTS}`, () => tablesDB.createTable({
  databaseId, tableId: REPORTS, name: 'Brand Publication Reports', permissions: [], rowSecurity: false,
}))

{
  const cols = await existingColumnKeys(REPORTS)

  // Die Veröffentlichung, die gemeldet wurde — ihre Zeilen-Id (= Profil-Id).
  await columnStep(`Column ${REPORTS}.publicationId`, 'publicationId', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'publicationId', size: 64, required: true,
  }))
  await columnStep(`Column ${REPORTS}.reason`, 'reason', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'reason', size: 300, required: false, xdefault: '',
  }))
  // FREIWILLIG und der einzige Personenbezug neben dem `ipHash`: sie steht in
  // der Zeile, damit der Betreiber zurückfragen kann, und geht deshalb NUR an
  // die Betreiber-Liste (dieselbe Regel wie bei `brand_check_corrections`).
  await columnStep(`Column ${REPORTS}.reporterEmail`, 'reporterEmail', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'reporterEmail', size: 254, required: false, xdefault: '',
  }))
  // `open` (Default) | `done`. Die Arbeitsliste des Betreibers ist `open`.
  await columnStep(`Column ${REPORTS}.status`, 'status', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'status', size: 16, required: false, xdefault: 'open',
  }))
  // Nur für den Deckel — sha256 mit Tages-Salz, nie die rohe IP.
  await columnStep(`Column ${REPORTS}.ipHash`, 'ipHash', cols, () => tablesDB.createVarcharColumn({
    databaseId, tableId: REPORTS, key: 'ipHash', size: 64, required: false, xdefault: '',
  }))
  await columnStep(`Column ${REPORTS}.decidedAt`, 'decidedAt', cols, () => tablesDB.createDatetimeColumn({
    databaseId, tableId: REPORTS, key: 'decidedAt', required: false,
  }))

  await waitForColumns(REPORTS)

  // Der EINE Lesepfad: „was liegt offen?" (Betreiber-Reiter „Meldungen", §4.4).
  await indexStep(`Index ${REPORTS}.idx_status`, {
    tableId: REPORTS, key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'],
  })
}

console.log('✔ Migration brand-020 fertig')
