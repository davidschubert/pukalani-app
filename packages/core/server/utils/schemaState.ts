import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { createAdminClient } from '../lib/appwrite'
import { aggregateSchemaState, classifyProbeError } from '../../shared/schemaState'
import type { ProbeOutcome, SchemaState } from '../../shared/schemaState'
import type { ProductSchemaState } from '../../shared/types/manifest'
import { getProductRegistry } from './productRegistry'
import { logEvent } from './logEvent'

/**
 * Schema-Stand für `/api/health` (OPS-008): passt die Datenbank zum
 * ausgerollten Programm?
 *
 * Jeder EINKOMPILIERTE Layer mit `schema` im Manifest (Laufzeit-Registry,
 * `productRegistry.ts`) bringt EINE Probe mit. Geprüft wird mit dem
 * Laufzeit-Schlüssel (`rows.read` genügt) über
 * `listRows(limit(1), select([spalte]))`: fehlt die Spalte, antwortet
 * Appwrite 400 `general_query_invalid`, fehlt die Tabelle, 404
 * `table_not_found` — beides heißt „Migration ausstehend". Alles andere
 * (Ausfall, Frist, falscher Schlüssel) heißt „weiß nicht" und ist kein
 * Alarm. Die Deutung steht pur in `shared/schemaState.ts`.
 *
 * Diese Funktion WIRFT NIE und lehnt nie ab: `/api/health` darf an der
 * Schema-Prüfung nicht scheitern.
 */

/** Frist JE PROBE — antwortet eine nicht, zählt sie als „weiß nicht". */
export const PROBE_TIMEOUT_MS = 4_000

/**
 * Wie lange ein Ergebnis gilt. `ok` lange (das Schema ändert sich nur per
 * Migration), `behind` kurz (nach dem Migrationslauf soll es bald grün
 * werden), `unknown` sehr kurz (ein Wackler soll nicht lange stehen bleiben).
 */
export const SCHEMA_CACHE_MS: Record<SchemaState['state'], number> = {
  ok: 5 * 60_000,
  behind: 30_000,
  unknown: 10_000,
}

/**
 * Obergrenze für das Teilen einer LAUFENDEN Prüfung. Jede Probe hat ihre
 * eigene Frist, die Prüfung endet also spätestens nach `PROBE_TIMEOUT_MS`;
 * diese Grenze ist nur das Netz dahinter (wie `IN_FLIGHT_MS` in health.ts).
 */
const IN_FLIGHT_MS = 10_000

interface Probe {
  /** `<layer>-<migration>`, z. B. `brand-026` — nur fürs Server-Log. */
  name: string
  probe: ProductSchemaState['probe']
}

interface Resolved {
  state: SchemaState
  /** Sicher fehlende Proben — verlassen den Server NUR über das Log. */
  missing: string[]
}

let cached: { result: Promise<Resolved>, expiresAt: number } | null = null
/** Zuletzt geloggtes `behind` (Liste der Fehlenden), damit nur WECHSEL loggen. */
let lastLoggedBehind: string | null = null

/** Test-Haken: Zwischenspeicher und Log-Gedächtnis leeren. */
export function resetSchemaStateCache(): void {
  cached = null
  lastLoggedBehind = null
}

function collectProbes(): Probe[] {
  const probes: Probe[] = []
  for (const manifest of getProductRegistry().values()) {
    if (!manifest.schema) continue
    probes.push({ name: `${manifest.key}-${manifest.schema.probe.migration}`, probe: manifest.schema.probe })
  }
  return probes.sort((a, b) => a.name.localeCompare(b.name))
}

const DEADLINE = Symbol('deadline')

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof DEADLINE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof DEADLINE>((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

type TablesDB = ReturnType<typeof createAdminClient>['tablesDB']

async function runProbe(tablesDB: TablesDB, databaseId: string, { probe }: Probe): Promise<ProbeOutcome> {
  try {
    const answer = await withDeadline(tablesDB.listRows({
      databaseId,
      tableId: probe.table,
      queries: [Query.limit(1), Query.select([probe.column ?? '$id'])],
      // Keine Zählung — die Probe will nur wissen, ob die Abfrage gültig ist.
      total: false,
    }), PROBE_TIMEOUT_MS)
    return answer === DEADLINE ? 'unknown' : 'present'
  }
  catch (error) {
    return classifyProbeError(error)
  }
}

async function probeAll(event: H3Event): Promise<Resolved> {
  const probes = collectProbes()
  if (probes.length === 0) return { state: aggregateSchemaState([]), missing: [] }

  let outcomes: ProbeOutcome[]
  try {
    const databaseId = String(useRuntimeConfig(event).public.appwriteDatabaseId ?? '')
    // Kann synchron werfen (z. B. 501 bei fremdem Projekt) — dann „weiß nicht".
    const { tablesDB } = createAdminClient(event)
    outcomes = await Promise.all(probes.map(probe => runProbe(tablesDB, databaseId, probe)))
  }
  catch {
    outcomes = probes.map((): ProbeOutcome => 'unknown')
  }

  const missing = probes.filter((_, index) => outcomes[index] === 'missing').map(probe => probe.name)
  return { state: aggregateSchemaState(outcomes), missing }
}

/**
 * EINE Zeile im Server-Log, sobald das Ergebnis zu `behind` WECHSELT (oder
 * sich die Liste der Fehlenden ändert). Genannt werden die Migrationen
 * (`brand-026`), nie Tabellen- oder Spaltennamen. Ein `unknown` dazwischen
 * vergisst nichts — ein Wackler soll keine zweite Zeile erzeugen.
 */
function logOnChange({ state, missing }: Resolved): void {
  if (state.state === 'ok') {
    lastLoggedBehind = null
    return
  }
  if (state.state !== 'behind') return
  const key = missing.join(',')
  if (key === lastLoggedBehind) return
  lastLoggedBehind = key
  logEvent('error', 'schema.behind', { missing, expected: state.expected, found: state.found })
}

/**
 * Schema-Stand dieses Prozesses — zwischengespeichert, gleichzeitige Aufrufe
 * teilen sich EINE laufende Prüfung (dasselbe Muster wie der Appwrite-Check
 * in `api/health.ts`). Wirft nie, lehnt nie ab.
 */
export function resolveSchemaState(event: H3Event): Promise<SchemaState> {
  try {
    if (cached && Date.now() < cached.expiresAt) return cached.result.then(resolved => resolved.state)

    const entry = {
      result: probeAll(event).catch((): Resolved => ({ state: aggregateSchemaState(['unknown']), missing: [] })),
      expiresAt: Date.now() + IN_FLIGHT_MS,
    }
    void entry.result.then((resolved) => {
      entry.expiresAt = Date.now() + SCHEMA_CACHE_MS[resolved.state.state]
      try {
        logOnChange(resolved)
      }
      catch {
        // Ein Log-Fehler darf den Stand nicht verfälschen.
      }
    })
    cached = entry
    return entry.result.then(resolved => resolved.state)
  }
  catch {
    return Promise.resolve({ state: 'unknown', expected: 0, found: null })
  }
}
