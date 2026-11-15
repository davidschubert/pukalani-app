/**
 * Migration brand-008: `brand_profiles.namingOpted` — die vierte Weiche
 * bekommt ihre Spalte.
 *
 * ── WARUM SIE IN 001 FEHLTE ───────────────────────────────────────────────
 * Der Schema-Anhang §1 listet die drei Weichen `hasName`, `team` und
 * `subBrands`. Die VIERTE steht nicht dort, sondern im Katalog §2.2 und in der
 * puren Regel: `brandNamingIncluded()` öffnet den Baustein „Name" beim
 * NEUSCHNITT auch dann, wenn die Marke einen Namen hat — sofern der Chip „Name
 * auf den Prüfstand?" gesetzt wurde (Default nein). `BrandProfileFacts` trägt
 * das Feld seit dem Bau der Zustandsmaschine; eine Spalte hatte es nie.
 *
 * Ohne sie liesse sich der Chip zwar anklicken, aber nicht speichern: die
 * PATCH-Route nähme ihn entgegen, `applyJunctionChange` rechnete korrekt, und
 * beim nächsten Laden wäre Naming wieder zu. Eine Weiche, die nach dem Neuladen
 * vergessen ist, ist schlimmer als eine, die es nicht gibt.
 *
 * ── ADDITIV UND FAIL-SAFE ─────────────────────────────────────────────────
 * `required: false` + `xdefault: false` — ein Deploy VOR dieser Migration liest
 * `undefined`, und der Leser (`profileFacts`) behandelt alles ausser `true` als
 * `false`. Das ist genau der Default. Umgekehrt gilt die Regel aus CLAUDE.md:
 * die Migration MUSS vor dem Code-Deploy laufen, sonst bricht das ANLEGEN eines
 * Profils (die Anlage-Route schreibt das Feld explizit).
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *
 *   pnpm migrate --app branding --layer brand
 */
import '../../../../scripts/lib/assert-target.mjs'
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

console.log(`Migration brand-008 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

{
  const cols = await existingColumnKeys(PROFILES)
  if (cols.has('namingOpted')) {
    console.log(`↷ Column ${PROFILES}.namingOpted (existiert bereits)`)
  }
  else {
    try {
      await tablesDB.createBooleanColumn({
        databaseId, tableId: PROFILES, key: 'namingOpted', required: false, xdefault: false,
      })
      console.log(`✔ Column ${PROFILES}.namingOpted`)
    }
    catch (error) {
      if (hasCode(error, 409)) console.log(`↷ Column ${PROFILES}.namingOpted (existiert bereits)`)
      else throw error
    }
  }
}

// KEIN Index: die Spalte wird nie gefiltert oder sortiert — sie wird mit dem
// Profil gelesen. Ein Index darauf wäre Schreiblast ohne Leser.

console.log('✔ Migration brand-008 fertig')
