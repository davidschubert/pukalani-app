import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import { parseRunLeaseDetail } from '../../../core/shared/runLease'
import {
  BRAND_RUN_OUTCOMES,
  BRAND_RUN_PROFILE_SCOPES,
  type BrandRunDetail,
  type BrandRunScope,
  type BrandRunView,
  noBrandRunView,
  toBrandRunView,
} from '../../shared/brandRun'
import { brandDb, isAppwriteNotFound } from './brandStore'

/**
 * DIE LÄUFE DES MARKENBERATERS — der Server-Teil (LL1 b, 2026-11-17).
 *
 * Was an der Zeile steht und warum, sagt der Kopf von
 * `shared/brandRun.ts`; die Sperre selbst ist die gemeinsame Hilfe aus
 * `core/server/utils/runLease.ts`. Hier steht das EINE Stück, das alle vier
 * Wege gleich brauchen: einen Lauf hinter der Antwort ausführen, der seinen
 * Ausgang IMMER an die Zeile schreibt.
 *
 * ── DIE REIHENFOLGE IN JEDER ROUTE ───────────────────────────────────────
 *  1. Alles prüfen, was nichts kostet (Zugang, Zustand, Schalter).
 *  2. DIE SPERRE nehmen (`acquireRunLease`) — der zweite Start bekommt 409
 *     `run_running`, bevor er einen Zähler berührt.
 *  3. Das Kontingent buchen; lehnt es ab, fällt die Sperre wieder
 *     (`dropRunLease`) und die Antwort ist dieselbe 429 wie früher.
 *  4. `202` mit dem Lauf-Stand, der Lauf rechnet in `startBrandRun` weiter.
 *
 * ── DER LAUF WIRFT NIE ───────────────────────────────────────────────────
 * Jeder Ausgang landet an der Zeile: `done` oder ein kurzer Grund. Ein Wurf
 * aus der Arbeit wird zu `failed` (bzw. zum Code „kein Endpunkt unter der
 * Bindung"). Lässt sich auch das Ende nicht schreiben, bleibt der Herzschlag
 * stehen und die Zeile wird nach der Frist `stalled` — unschärfer, aber nie
 * „läuft für immer".
 *
 * ── DER `event` REIST MIT ────────────────────────────────────────────────
 * Hinter der Antwort wird er nur noch LESEND benutzt (Runtime-Config,
 * Admin-Client, Bremsen-Speicher) — dasselbe wie beim Marktvergleich. In die
 * Antwort schreibt dort niemand mehr: kein `setHeader`, kein `createError`
 * als Ergebnis.
 */

export const BRAND_RUNS_TABLE = 'brand_runs'

/** Der Store der Lauf-Sperre dieses Layers. */
export function brandRunStore(event: H3Event) {
  const { tablesDB, databaseId } = brandDb(event)
  return appwriteRunLeaseStore({ tablesDB, databaseId, tableId: BRAND_RUNS_TABLE })
}

export type BrandRunStore = ReturnType<typeof brandRunStore>
export type BrandRunLease = Awaited<ReturnType<typeof acquireRunLease>>['lease']

/**
 * Der Stand des jüngsten Laufs — für die lesenden Routen der Seiten.
 *
 * FAIL-SOFT: fehlt die Tabelle (Stand VOR der Migration) oder scheitert das
 * Lesen, heisst die Antwort „kein Lauf". Eine Liste, die sich deswegen nicht
 * mehr öffnen liesse, wäre die teurere Antwort; der START prüft die Sperre
 * ohnehin selbst und lehnt dann sauber ab.
 */
export async function readBrandRunView(
  event: H3Event,
  scope: BrandRunScope,
  subject: string,
): Promise<BrandRunView> {
  try {
    const latest = await brandRunStore(event).latest(scope, subject)
    return toBrandRunView(latest, Date.now())
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.run_state_unreadable', {
        scope,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
    return noBrandRunView()
  }
}

/**
 * EINE Lauf-Zeile über ihre Id — für die lesende Route des öffentlichen
 * Brand-Checks, die den Lauf über das Kennzeichen des Starters findet
 * (`brandCheckRunToken.ts`) und nicht über (Art, Gegenstand).
 *
 * `null` für „gibt es nicht" UND für „nicht lesbar": die Route antwortet auf
 * beides gleich (sie verrät nicht, ob es eine Zeile gibt), und ein Aussetzer
 * heilt sich beim nächsten Nachfragen der Seite.
 */
export async function readBrandRunRow(event: H3Event, rowId: string): Promise<BrandRunLease | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const row = await tablesDB.getRow<BrandRunExportRow & { subject?: string | null }>({
      databaseId,
      tableId: BRAND_RUNS_TABLE,
      rowId,
    })
    return {
      $id: row.$id,
      scope: row.scope ?? '',
      subject: row.subject ?? '',
      seq: typeof row.seq === 'number' ? row.seq : 0,
      startedAt: row.startedAt ?? '',
      heartbeatAt: row.heartbeatAt ?? '',
      finishedAt: row.finishedAt ?? '',
      outcome: row.outcome ?? '',
      detail: row.detail ?? '',
    }
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.run_state_unreadable', {
        scope: 'row',
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
    return null
  }
}

/** Was die Arbeit eines Laufs in die Hand bekommt. */
export interface BrandRunContext {
  /** Das Detail der Zeile — die Arbeit ändert es und ruft `progress()`. */
  readonly detail: BrandRunDetail
  /** Den Zwischenstand schreiben. Fail-soft: der Herzschlag hält die Sperre. */
  progress: () => Promise<void>
  /** Ging der Herzschlag verloren? Dann darf ein anderer Start übernehmen. */
  lost: () => boolean
}

export interface BrandRunInput {
  /** Kurzes Wort fürs Log (`brand-drafts`, …). */
  label: string
  store: BrandRunStore
  lease: BrandRunLease
  detail: BrandRunDetail
  /**
   * Die Arbeit. Sie gibt den AUSGANG zurück (`done` oder ein kurzer Grund,
   * höchstens 32 Zeichen) und wirft nur, wenn etwas Unerwartetes geschieht.
   */
  work: (context: BrandRunContext) => Promise<string>
  /**
   * Läuft auf JEDEM Ausgang, VOR dem Schreiben des Endes — Rückbuchen,
   * Burst-Platz freigeben. Bekommt den Ausgang und darf das Detail noch
   * ändern (`refunded`). Wirft es, wird das geloggt und das Ende trotzdem
   * geschrieben.
   */
  settle?: (outcome: string, detail: BrandRunDetail) => Promise<void> | void
}

/**
 * Einen Lauf hinter der Antwort ausführen — mit Besitzer (`runDetached`),
 * Herzschlag und einem Ende, das immer geschrieben wird (s. Kopf).
 */
export function startBrandRun(input: BrandRunInput): void {
  runDetached(input.label, async () => {
    const alive = keepRunLeaseAlive(input.store, input.lease)
    const detail = input.detail
    let outcome: string

    const progress = async (): Promise<void> => {
      try {
        await touchRunLease(input.store, input.lease, { detail })
      }
      catch {
        // Ein verpasster Zwischenstand ist kein Abbruch; das Ende schreibt alles.
      }
    }

    try {
      outcome = await input.work({ detail, progress, lost: () => alive.lost() })
    }
    catch (error) {
      outcome = isAiEndpointUnavailable(error)
        ? BRAND_RUN_OUTCOMES.aiEndpointUnavailable
        : BRAND_RUN_OUTCOMES.failed
      // Nur die Meldung — nie das rohe Objekt (Protokoll-Regel SEC-017).
      logEvent('error', 'brand.run_failed', {
        label: input.label,
        outcome,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
    finally {
      alive.stop()
    }

    try {
      await input.settle?.(outcome, detail)
    }
    catch (error) {
      logEvent('warn', 'brand.run_settle_failed', {
        label: input.label,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }

    try {
      await finishRunLease(input.store, input.lease, { outcome, detail })
    }
    catch (error) {
      // Das Ende steht nicht an der Zeile ⇒ sie wird nach der Frist `stalled`.
      logEvent('error', 'brand.run_end_unwritten', {
        label: input.label,
        outcome,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  })
}

/** Die Antwort eines Starts: der Lauf läuft, mehr weiss noch niemand. */
export function runningBrandRunView(lease: BrandRunLease, detail: BrandRunDetail): BrandRunView {
  return toBrandRunView({ ...lease, detail: JSON.stringify(detail) }, Date.parse(lease.startedAt) || Date.now())
}

/**
 * Gibt es die Marke noch? Ein Lauf, der Dateien oder Zeilen ablegt, fragt das
 * unmittelbar davor — sonst blieben nach einem Löschen während des Laufs
 * Reste ohne Besitzer liegen. Ein Lesefehler heisst „weiss nicht" und damit
 * NICHT ablegen: lieber ein Lauf ohne Ergebnis als ein verwaister Rest.
 */
export async function brandRunProfileExists(event: H3Event, tableId: string, profileId: string): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.getRow({ databaseId, tableId, rowId: profileId })
    return true
  }
  catch {
    return false
  }
}

// ── Auskunft und Löschung ───────────────────────────────────────────────────

type BrandRunExportRow = Models.Row & {
  scope?: string | null
  seq?: number | null
  startedAt?: string | null
  heartbeatAt?: string | null
  finishedAt?: string | null
  outcome?: string | null
  detail?: string | null
}

/** Die Abfrage „alle Läufe dieser Marke" — über den Index (scope, subject). */
function brandRunsOfProfile(profileId: string): string[] {
  return [Query.equal('scope', [...BRAND_RUN_PROFILE_SCOPES]), Query.equal('subject', profileId)]
}

/**
 * Die Läufe einer Marke für die AUSKUNFT: Zeitpunkte, Ausgang, und aus dem
 * `detail` nur die Zahlen — keine Kennung eines Ergebnisses, kein Modell.
 * Fehlt die Tabelle, ist die Liste leer.
 */
export async function exportBrandRuns(event: H3Event, profileId: string): Promise<unknown[]> {
  const { tablesDB, databaseId } = brandDb(event)
  const rows = await listAllRowsIfTableExists<BrandRunExportRow>(
    tablesDB, databaseId, BRAND_RUNS_TABLE, brandRunsOfProfile(profileId),
  )
  return rows.map((row) => {
    const counts: Record<string, number> = {}
    for (const [key, value] of Object.entries(parseRunLeaseDetail(row.detail))) {
      if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
    }
    return {
      scope: row.scope ?? '',
      seq: row.seq ?? 0,
      startedAt: row.startedAt ?? '',
      heartbeatAt: row.heartbeatAt ?? '',
      finishedAt: row.finishedAt ?? '',
      outcome: row.outcome ?? '',
      counts,
    }
  })
}

/**
 * Die Läufe einer Marke LÖSCHEN — sie gehen mit ihr (Löschen der Marke,
 * Löschen des Kontos). Ein Lesefehler schlägt durch (nie „nichts gefunden"
 * melden, wenn niemand nachsehen konnte); nur die fehlende Tabelle ist leer.
 */
export async function purgeBrandRuns(event: H3Event, profileId: string): Promise<number> {
  const { tablesDB, databaseId } = brandDb(event)
  const rows = await listAllRowsIfTableExists<Models.Row>(
    tablesDB, databaseId, BRAND_RUNS_TABLE, brandRunsOfProfile(profileId),
  )
  let removed = 0
  for (const row of rows) {
    try {
      await tablesDB.deleteRow({ databaseId, tableId: BRAND_RUNS_TABLE, rowId: row.$id })
      removed++
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) throw error
    }
  }
  return removed
}
