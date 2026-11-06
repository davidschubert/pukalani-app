/**
 * Migration brand-025: DIE FREISCHALTUNG DER ABLEITUNG —
 * `brand_profiles.derivationUnlockedAt` + `derivationUnlockedVia` +
 * `derivationUnlockedBy` (docs/plans/BRAND-BOOK-KIT.md §2.8/§2.10, Paket K1).
 *
 * NUMMER: 024 (`brand-inspiration`) war der letzte Stand auf `origin/main` und
 * in jedem Arbeitsbaum (2026-09-09 geprüft); 025 ist die nächste freie. Wer
 * nach dieser hier eine anlegt, sieht zuerst nach (`git fetch origin &&
 * git ls-tree --name-only origin/main packages/brand/scripts/migrations/`).
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── EIN FELD, DREI SCHREIBER (§2.8) ───────────────────────────────────────
 * „Die Ableitung" ist EINE Schranke und öffnet ZWEI Produkte: Brand Book & Kit
 * (Schicht 3) und den Marktvergleich. Deshalb steht hier ein Feld und nicht
 * eine Tabelle `brand_entitlements` je Produkt — BS1 §9 Frage 4 hat das
 * ausdrücklich so entschieden und §9.1 hält fest, was damit überholt ist: der
 * Webhook muss genau ein Häkchen schreiben, der Vermerk hängt am
 * Betreiber-Schalter.
 *
 * Geschrieben wird es von DREI Stellen, und nur zwei davon sind Spalten:
 *   (1) Beta-Konto — SCHREIBT NICHTS. Die pure Regel `resolveDerivationAccess`
 *       (shared/brandDerivation.ts) liest die Beta-Zulassung des KONTOS
 *       (`brand_access`, BS1 Entscheidung 6 „dauerhaft frei"). Ein Backfill
 *       wäre falsch: die Zusage gilt dem Konto, nicht seinen Marken.
 *   (2) Betreiber-Knopf — `via: 'operator'`, `by: <Betreiber-Id>`.
 *   (3) Stripe-Webhook (BS1 Z1, später) — `via: 'purchase'`, `by: <Event-Id>`.
 *
 * ── DREI SPALTEN, WEIL DREI FRAGEN ────────────────────────────────────────
 * `derivationUnlockedAt` (datetime, nullable) beantwortet „ist die Ableitung
 * für diese Marke gekauft/freigeschaltet?" — `null` ist der Default und heisst
 * „nein". Das ist die einzig zulässige Bedeutung eines fehlenden Wertes
 * (dieselbe Leitplanke wie bei `designUnlockedAt` in brand-022 und
 * `marketVisibility` in brand-019: eine Erlaubnis, die niemand gegeben hat,
 * darf nicht aus einem Vorgabewert entstehen).
 *
 * `derivationUnlockedVia` (varchar 16, nullable) trägt die HERKUNFT
 * (`'operator' | 'purchase'`). Sie ist kein Schmuck: „frei" ohne „warum" wäre
 * in einem Streitfall keine Auskunft, und ab Z1 stehen Betreiber-Zusage und
 * bezahlter Kauf nebeneinander in derselben Spalte-Familie. 16 Zeichen reichen
 * für beide Werte mit Luft; ein Enum wäre eine Migration je neuem Weg (dieselbe
 * Begründung wie bei `brand_events.type` in brand-007).
 *
 * `derivationUnlockedBy` (varchar 64, nullable) trägt die Betreiber-Id bzw.
 * später die Stripe-Event-Id. 64 wie jede andere Appwrite-Id in diesem Schema
 * (`brand_access.userId`, `brand_events.userId`, `brand_profiles.
 * designUnlockedBy`) — Stripe-Event-Ids (`evt_…`) liegen weit darunter.
 *
 * Die drei werden ZUSAMMEN gesetzt und ZUSAMMEN geleert: ein `…Via` ohne
 * `…At` wäre die Behauptung einer Freischaltung, die es nicht mehr gibt.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Wörtlich dieselbe Lage wie bei brand-022: es gibt keinen Lesepfad „alle
 * freigeschalteten Marken". Die Betreiber-Liste zeigt ALLE Brandings (sie muss
 * ja gerade die noch nicht freigeschalteten finden) und liest die Spalten je
 * Zeile mit; Werkstatt und Marktvergleich fragen immer GENAU EINE Zeile über
 * ihre Id. Ein Index wäre ein Versprechen auf eine Abfrage, die es nicht gibt
 * — und Indizes sind hier die teuerste Zeile (Cache-Falle aus CLAUDE.md).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Spalten lehnt Appwrite jedes Anlegen eines Brandings ab
 * (`createRow` nennt im Layer JEDE Spalte ausdrücklich).
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

console.log(`Migration brand-025 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  // `null` = gesperrt, und zwar für jede Zeile aus der Zeit davor (s. Kopf).
  await columnStep(
    `Column ${PROFILES}.derivationUnlockedAt`,
    'derivationUnlockedAt',
    cols,
    () => tablesDB.createDatetimeColumn({
      databaseId, tableId: PROFILES, key: 'derivationUnlockedAt', required: false,
    }),
  )

  // Die Herkunft: 'operator' | 'purchase' (s. Kopf). Varchar statt Enum —
  // ein dritter Weg soll keine Migration kosten.
  await columnStep(
    `Column ${PROFILES}.derivationUnlockedVia`,
    'derivationUnlockedVia',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: PROFILES, key: 'derivationUnlockedVia', size: 16, required: false,
    }),
  )

  // Betreiber-Id bzw. Stripe-Event-Id — 64 wie jede andere Id in diesem Schema.
  await columnStep(
    `Column ${PROFILES}.derivationUnlockedBy`,
    'derivationUnlockedBy',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: PROFILES, key: 'derivationUnlockedBy', size: 64, required: false,
    }),
  )

  await waitForColumns(PROFILES)
}

console.log('✔ Migration brand-025 fertig')
