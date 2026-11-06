/**
 * Migration brand-022: DIE FREISCHALTUNG VON BRAND DESIGN —
 * `brand_profiles.designUnlockedAt` + `designUnlockedBy`
 * (docs/archiv/BRAND-DESIGN.md §2.10/§2.11, Paket D1).
 *
 * NUMMER: 021 (`brand-intro-requests`) war der letzte Stand auf `origin/main`
 * und in jedem Arbeitsbaum (2026-09-08 geprüft); 022 ist die nächste freie.
 * §2.10/§2.11 nennen noch „brand-020" — die Nummern 020 (Publications) und 021
 * (Gesprächsanfragen) waren zwischen Konzeption und Bau vergeben, und die
 * DATEINAMEN entscheiden (§2.18 „Stand: D0", Punkt 2). Wer nach dieser hier
 * eine anlegt, sieht zuerst nach (`git fetch origin && git ls-tree --name-only
 * origin/main packages/brand/scripts/migrations/`).
 *
 * Es gelten dieselben gemeinsamen Regeln wie für die Tabellen davor
 * (ausgeschrieben im Kopf von brand-001): server-only (`permissions: []`,
 * `rowSecurity: false`), kein `communityId` (Silo-Layer auf `branding`),
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── ZWEI SPALTEN, WEIL DIE FREISCHALTUNG EINE HANDLUNG IST ────────────────
 * `designUnlockedAt` (datetime, nullable) beantwortet „ist Schicht 2 für diese
 * Marke offen?" — `null` ist der Default und heisst „nein", und das ist die
 * einzig zulässige Bedeutung eines fehlenden Wertes (dieselbe Leitplanke wie
 * bei `marketVisibility` in brand-019: eine Erlaubnis, die niemand gegeben
 * hat, darf nicht aus einem Vorgabewert entstehen).
 *
 * `designUnlockedBy` (varchar 64, nullable) trägt die Betreiber-Id. Sie steht
 * NEBEN dem Ereignis `design.unlocked` und nicht statt seiner: das Ereignis ist
 * die Geschichte („wer hat wann was getan"), die Spalte ist der ZUSTAND, den
 * die Betreiber-Liste je Zeile anzeigt, ohne den Funnel zu durchsuchen. Die
 * Rücknahme (`design.locked`) leert BEIDE — ein `designUnlockedBy` ohne
 * `designUnlockedAt` wäre die Behauptung einer Freischaltung, die es nicht
 * mehr gibt.
 *
 * ── KEIN INDEX ────────────────────────────────────────────────────────────
 * Es gibt keinen Lesepfad „alle freigeschalteten Marken". Die Betreiber-Liste
 * zeigt ALLE Brandings (sie muss ja gerade die noch nicht freigeschalteten
 * finden) und liest die Spalte je Zeile mit; die Werkstatt fragt immer GENAU
 * EINE Zeile über ihre Id. Ein Index wäre ein Versprechen auf eine Abfrage,
 * die es nicht gibt — und Indizes sind hier die teuerste Zeile (Cache-Falle
 * aus CLAUDE.md).
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

console.log(`Migration brand-022 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)

  // `null` = gesperrt, und zwar für jede Zeile aus der Zeit davor (s. Kopf).
  await columnStep(
    `Column ${PROFILES}.designUnlockedAt`,
    'designUnlockedAt',
    cols,
    () => tablesDB.createDatetimeColumn({
      databaseId, tableId: PROFILES, key: 'designUnlockedAt', required: false,
    }),
  )

  // Die Betreiber-Id. 64 wie jede andere Appwrite-Id in diesem Schema
  // (`brand_access.userId`, `brand_events.userId`) — nicht grösser geraten,
  // die Länge einer Id ist bekannt.
  await columnStep(
    `Column ${PROFILES}.designUnlockedBy`,
    'designUnlockedBy',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: PROFILES, key: 'designUnlockedBy', size: 64, required: false,
    }),
  )

  await waitForColumns(PROFILES)
}

console.log('✔ Migration brand-022 fertig')
