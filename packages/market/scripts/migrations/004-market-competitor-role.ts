/**
 * Migration market-004: `market_competitors.role` — WETTBEWERBER ODER DIE
 * EIGENE ALTE WEBSITE.
 *
 * Vierte Migration des market-Layers (Paket M4, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §7.2 Nr. 2). Sie läuft AUSSCHLIESSLICH
 * auf der `branding`-Instanz — der Layer steht deshalb nur im BRANDING_SOLL
 * von scripts/ops/verify-schema-parity.mjs, nicht in der instanzweiten
 * Spalten-Parität.
 *
 * Es gelten dieselben gemeinsamen Regeln wie für market-001 bis market-003:
 * server-only (`permissions: []`, `rowSecurity: false`), kein `communityId`,
 * Indizes NUR über `createIndexSteps`, idempotent (409 → skip).
 *
 * ── WARUM EINE EIGENE SPALTE UND NICHT EIN FÜNFTER `sourceKind` ───────────
 * `sourceKind` sagt, WOHER die Aussagen einer Zeile kommen (Website,
 * Foundation, Bibliothek, freigegebene Marke). Diese Spalte sagt, WESSEN
 * Aussagen es sind. Beide Fragen sind unabhängig — die alte eigene Website
 * ist `website` + `self`, ein zweites eigenes Branding ist `foundation` +
 * `self`, die Seite eines Mitbewerbers ist `website` + `competitor`. Ein
 * einziger Wert, der beides ausdrücken müsste, ginge beim ersten dieser drei
 * Fälle kaputt (ausführlich am Typ `MarketCandidateRole` in
 * `shared/marketProfile.ts`).
 *
 * ── DER VORGABEWERT IST DER BESTAND ───────────────────────────────────────
 * `competitor`. Jede Zeile aus M1–M3 liest damit genau das, was sie war, und
 * es gibt kein Backfill-Skript — es gäbe nichts zu füllen.
 *
 * ── KEIN INDEX ───────────────────────────────────────────────────────────
 * Die Rolle wird nie GEFILTERT, sondern immer über die ohnehin geladene
 * Kandidatenliste eines Brandings gelesen (höchstens sechs Zeilen: fünf
 * Wettbewerber plus die eigene alte Website). Ein Index darauf wäre ein
 * Lesepfad, den niemand nimmt.
 *
 * ── DER DECKEL BLEIBT FÜNF ───────────────────────────────────────────────
 * `MARKET_COMPETITORS_MAX` zählt seit M4 nur noch Zeilen mit
 * `role: 'competitor'` (§2.9 Nr. 8 spricht von WETTBEWERBERN). Die
 * Kandidaten-Abfrage holt deshalb eine Zeile mehr — sonst verschwände die
 * eigene alte Website bei fünf Wettbewerbern still aus der Liste.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer market
 *
 * Die Regel aus CLAUDE.md gilt: diese Migration MUSS vor dem Code-Deploy
 * laufen — ohne die Spalte lehnt Appwrite das Anlegen eines `self`-Kandidaten
 * ab.
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

console.log(`Migration market-004 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(COMPETITORS)

  await columnStep(
    `Column ${COMPETITORS}.role`,
    'role',
    cols,
    () => tablesDB.createVarcharColumn({
      databaseId, tableId: COMPETITORS, key: 'role', size: 16,
      required: false, xdefault: 'competitor',
    }),
  )

  await waitForColumns(COMPETITORS)
}

console.log('✔ Migration market-004 fertig')
