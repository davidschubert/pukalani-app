import { AppwriteException, Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import {
  acquireRunLease,
  appwriteRunLeaseStore,
  finishRunLease,
  keepRunLeaseAlive,
  type RunLeaseRow,
  type RunLeaseStore,
} from '../../../core/server/utils/runLease'
import {
  evidenceDueForClearing,
  resolveReportEvidenceSweepMode,
  shouldLogEvidenceSweep,
  type ReportEvidenceReports,
  type ReportEvidenceSweepMode,
} from '../../shared/messageReport'
import { MESSAGE_REPORT_TARGET, MESSAGES_TABLE } from '../../shared/types/message'
import { softFailWith } from '../../../core/server/utils/softFail'

/**
 * DER LÖSCH-LAUF FÜR DEN BELEG GEMELDETER NACHRICHTEN (SEC-033, Davids
 * Entscheidung 2026-11-12: „Den Text einer gemeldeten privaten Nachricht sieht
 * die Moderation nur, solange die Meldung offen ist. Danach bleibt er 90 Tage
 * gespeichert und wird dann gelöscht.").
 *
 * ── WAS ER TUT ──────────────────────────────────────────────────────────
 * Er geht die gemeldeten Nachrichten durch (`reportedAt != ''`, seitenweise,
 * gedeckelt je Lauf) und fragt je Nachricht den Stand ihrer Meldungen ab. Die
 * Regel steht pur in `shared/messageReport.ts` (`evidenceDueForClearing`):
 * fällig ist ein Beleg mit Text, zu dem keine Meldung offen ist und dessen
 * letzte Erledigung (ohne jede Meldungs-Zeile: `reportedAt`) 90 Tage her ist.
 *
 *  · `count`: zählt nur. Schreibt nichts — auch keine Sperr-Zeile.
 *  · `apply`: leert bei fälligen Zeilen den eingefrorenen Beleg — BEIDE
 *    Felder, `reportedBody` UND `reportedAt` (⇒ ''), in EINEM Schreibvorgang.
 *    Das Gespräch der Beteiligten (`body`) bleibt unangetastet, ebenso die
 *    Meldung und ihr Vermerk in `reports`: dort bleibt die Tatsache „wurde
 *    gemeldet" stehen. Vor dem Schreiben liest er Zeile UND Meldungs-Stand
 *    frisch und prüft die Regel noch einmal: eine inzwischen neu geöffnete
 *    Meldung schützt den Beleg.
 *
 * ── WARUM AUCH `reportedAt` ─────────────────────────────────────────────
 * Der Zeitstempel ist der Merker „es gibt einen Beleg" (so sagt es der Test
 * zu `shouldFreezeSnapshot`). Ohne Beleg kein Merker: eine spätere NEUE
 * Meldung friert dann den Text von dann neu ein, statt eine offene Meldung
 * ohne Text zu erzeugen. Und die Zeile fällt aus der Liste der gemeldeten
 * Nachrichten und aus der Arbeitsliste dieses Laufs (`reportedAt != ''`),
 * statt bei jedem Takt wieder gelesen zu werden. Wiederholbar — ein zweiter
 * Lauf findet sie gar nicht mehr.
 *
 * ── COMMUNITY-GRENZEN ───────────────────────────────────────────────────
 * Die LISTE der gemeldeten Nachrichten ist mandantenübergreifend (ein Lauf
 * ohne Anfrage, eine der dokumentierten Ausnahmen von der Datentür). Der
 * Stand der Meldungen wird dagegen je Nachricht NUR in ihrer eigenen
 * Community gefragt (`reportEvidenceStateForTarget` mit der `communityId` der
 * Zeile, moderation-Vertrag) — keine Abfrage über Community-Grenzen.
 *
 * ── SPERRE ──────────────────────────────────────────────────────────────
 * `apply` nimmt die Lauf-Sperre in `system_runs` (system-040, Muster
 * `core/server/utils/runLease.ts`): zwei Prozesse leeren nicht gleichzeitig.
 * Fehlt die Tabelle (404), überspringt der Lauf und meldet das EINMAL. Im
 * `detail` der Sperr-Zeile stehen nur Zahlen.
 *
 * ── DECKEL ──────────────────────────────────────────────────────────────
 * Höchstens `EVIDENCE_SWEEP_MAX_ROWS` Zeilen je Lauf, in Seiten zu 100. Der
 * Rest kommt im nächsten Takt: der Lauf merkt sich im Prozess, wo er
 * aufgehört hat (`nextAfter`), und beginnt nach einem vollständigen Durchgang
 * wieder vorn. Ein Neustart beginnt vorn — schlimmstenfalls wird etwas
 * doppelt geprüft, nie übersprungen.
 *
 * Liegt in `server/utils`, nicht im Plugin: ESLint verbietet rohes
 * `.tablesDB` in `server/plugins/**` dieses Layers (Datentür-Backstop).
 */

export const EVIDENCE_SWEEP_PAGE_SIZE = 100
export const EVIDENCE_SWEEP_MAX_ROWS = 2000
export const EVIDENCE_SWEEP_LEASE_SCOPE = 'message-report-evidence'
export const EVIDENCE_SWEEP_LEASE_SUBJECT = 'messages'
const SYSTEM_RUNS_TABLE = 'system_runs'

/** Eine gemeldete Nachricht, wie der Lauf sie sieht — nie `body`. */
export interface EvidenceRow {
  $id: string
  communityId: string
  reportedBody: string
  reportedAt: string
}

export interface EvidenceSweepStore {
  /** Gemeldete Nachrichten (`reportedAt != ''`), stabil geordnet, nach `after`. */
  listReported(input: { after: string | null, limit: number }): Promise<EvidenceRow[]>
  /** Die Zeile frisch — `null`, wenn es sie nicht mehr gibt. */
  getMessage(id: string): Promise<EvidenceRow | null>
  /** Stand der Meldungen zu GENAU dieser Nachricht in GENAU dieser Community. */
  reportState(communityId: string, messageId: string): Promise<ReportEvidenceReports>
  /** Leert den Beleg: `reportedBody` UND `reportedAt` ⇒ '', in einem Schreibvorgang. */
  clearEvidence(id: string): Promise<void>
}

export interface EvidenceSweepResult {
  mode: 'count' | 'apply'
  /** Gemeldete Nachrichten, die dieser Lauf gesehen hat. */
  reported: number
  /** … davon mit gespeichertem Text. */
  withText: number
  /** … davon ohne offene Meldung. */
  closedWithText: number
  /** … davon fällig (Frist abgelaufen). */
  due: number
  /** Tatsächlich geleert (nur `apply`). */
  cleared: number
  /** Zeilen, deren Stand nicht lesbar war oder deren Leeren scheiterte. */
  failed: number
  /** Deckel erreicht — der Rest kommt im nächsten Takt. */
  capped: boolean
  /** Wo der nächste Lauf weitermacht (`null` = Durchgang vollständig). */
  nextAfter: string | null
}

export type EvidenceSweepOutcome =
  | EvidenceSweepResult
  | { skipped: 'busy' | 'no_lease_table' | 'lease_lost' }

export interface EvidenceSweepDeps {
  store: EvidenceSweepStore
  /** Nur `apply` nimmt die Sperre. */
  lease: RunLeaseStore
  now?: () => number
  pageSize?: number
  maxRows?: number
  startAfter?: string | null
  /** Herzschlag-Abstand (Tests verkürzen ihn). */
  heartbeatMs?: number
}

function errorStatus(error: unknown): number | null {
  if (error instanceof AppwriteException) return error.code
  const status = (error as { status?: unknown, statusCode?: unknown } | null)?.status
    ?? (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : null
}

/** Einen Lauf fahren. Wirft nur, wenn die Sperre nicht prüfbar ist. */
export async function sweepReportEvidence(
  mode: 'count' | 'apply',
  deps: EvidenceSweepDeps,
): Promise<EvidenceSweepOutcome> {
  const now = deps.now ?? Date.now
  const pageSize = deps.pageSize ?? EVIDENCE_SWEEP_PAGE_SIZE
  const maxRows = deps.maxRows ?? EVIDENCE_SWEEP_MAX_ROWS

  let lease: RunLeaseRow | null = null
  let heart: { stop(): void, lost(): boolean } | null = null
  if (mode === 'apply') {
    // Erst nachsehen, ob es die Tabelle gibt: `acquireRunLease` macht aus
    // JEDEM Lesefehler ein 503 und verliert damit den Grund.
    try {
      await deps.lease.latest(EVIDENCE_SWEEP_LEASE_SCOPE, EVIDENCE_SWEEP_LEASE_SUBJECT)
    }
    catch (error) {
      if (errorStatus(error) === 404) return { skipped: 'no_lease_table' }
      throw error
    }
    try {
      const acquired = await acquireRunLease(deps.lease, {
        scope: EVIDENCE_SWEEP_LEASE_SCOPE,
        subject: EVIDENCE_SWEEP_LEASE_SUBJECT,
        detail: { mode },
        nowMs: now(),
      })
      lease = acquired.lease
    }
    catch (error) {
      if (errorStatus(error) === 409) return { skipped: 'busy' }
      throw error
    }
    heart = keepRunLeaseAlive(deps.lease, lease, deps.heartbeatMs ? { intervalMs: deps.heartbeatMs } : {})
  }

  const result: EvidenceSweepResult = {
    mode, reported: 0, withText: 0, closedWithText: 0, due: 0, cleared: 0, failed: 0, capped: false, nextAfter: null,
  }

  let lost = false
  try {
    let after = deps.startAfter ?? null
    let seen = 0
    pages: while (true) {
      const limit = Math.min(pageSize, maxRows - seen)
      if (limit <= 0) {
        result.capped = true
        result.nextAfter = after
        break
      }
      const rows = await deps.store.listReported({ after, limit })
      for (const row of rows) {
        if (heart?.lost()) {
          lost = true
          break pages
        }
        seen += 1
        after = row.$id
        result.reported += 1
        if (row.reportedBody === '') continue
        result.withText += 1

        let reports: ReportEvidenceReports
        try {
          reports = await deps.store.reportState(row.communityId, row.$id)
        }
        catch {
          // Nicht lesbar heißt nie „frei": nicht gezählt, nicht geleert.
          result.failed += 1
          continue
        }
        if (reports.open > 0) continue
        result.closedWithText += 1
        if (!evidenceDueForClearing({ ...row, ...reports }, new Date(now()))) continue
        result.due += 1
        if (mode !== 'apply') continue

        try {
          // FRISCH lesen und die Regel noch einmal prüfen: eine inzwischen neu
          // geöffnete Meldung (oder ein anderer Prozess) schützt den Beleg.
          const fresh = await deps.store.getMessage(row.$id)
          if (!fresh || fresh.reportedBody === '') continue
          const freshReports = await deps.store.reportState(fresh.communityId, fresh.$id)
          if (!evidenceDueForClearing({ ...fresh, ...freshReports }, new Date(now()))) continue
          await deps.store.clearEvidence(fresh.$id)
          result.cleared += 1
        }
        catch {
          result.failed += 1
        }
      }
      if (rows.length < limit) {
        result.nextAfter = null
        break
      }
    }
  }
  finally {
    heart?.stop()
  }

  if (lease) {
    const detail = {
      reported: result.reported,
      withText: result.withText,
      closedWithText: result.closedWithText,
      due: result.due,
      cleared: result.cleared,
      failed: result.failed,
    }
    await finishRunLease(deps.lease, lease, {
      outcome: lost ? 'lost' : result.failed > 0 ? 'incomplete' : 'done',
      detail,
      nowMs: now(),
    }).catch(softFailWith('messages:utils/reportEvidenceSweep:finishRunLease', () => {
      // Der Herzschlag hört auf; nach der Frist gilt der Lauf als abgebrochen
      // und der nächste Takt darf wieder (runLeaseState).
    }))
  }
  if (lost) return { skipped: 'lease_lost' }
  return result
}

/* ── Der Takt ─────────────────────────────────────────────────────────── */

export type EvidenceSweepLog = (level: 'info' | 'warn' | 'error', name: string, data: Record<string, unknown>) => void

/**
 * Der Lauf mit seinem Stand im Prozess: wo er weitermacht, welche Zahl er
 * zuletzt gemeldet hat, ob die fehlende Sperr-Tabelle schon gemeldet ist.
 * Getrennt von der Appwrite-Verdrahtung, damit der Test ihn mit einem
 * Fake-Store fährt.
 */
export function createReportEvidenceSweepRunner(input: {
  mode: 'count' | 'apply'
  deps: () => Omit<EvidenceSweepDeps, 'startAfter'>
  log: EvidenceSweepLog
}): () => Promise<'skipped' | undefined> {
  let resumeAfter: string | null = null
  let lastLoggedDue: number | null = null
  let missingTableReported = false

  return async () => {
    const outcome = await sweepReportEvidence(input.mode, { ...input.deps(), startAfter: resumeAfter })
    if ('skipped' in outcome) {
      if (outcome.skipped === 'no_lease_table') {
        if (!missingTableReported) {
          input.log('error', 'messages.report_evidence_sweep_skipped', { reason: 'no_lease_table', table: SYSTEM_RUNS_TABLE })
          missingTableReported = true
        }
      }
      else if (outcome.skipped === 'lease_lost') {
        input.log('warn', 'messages.report_evidence_sweep_skipped', { reason: 'lease_lost' })
      }
      return 'skipped'
    }
    missingTableReported = false
    resumeAfter = outcome.nextAfter

    if (shouldLogEvidenceSweep(lastLoggedDue, outcome)) {
      input.log('info', 'messages.report_evidence_sweep', {
        mode: outcome.mode,
        reported: outcome.reported,
        withText: outcome.withText,
        closedWithText: outcome.closedWithText,
        due: outcome.due,
        cleared: outcome.cleared,
        failed: outcome.failed,
        capped: outcome.capped,
      })
      lastLoggedDue = outcome.due
    }
    if (outcome.failed > 0) throw new Error(`unvollständig: ${outcome.failed} gemeldete Nachrichten nicht geprüft oder nicht geleert`)
    return undefined
  }
}

/* ── Appwrite ─────────────────────────────────────────────────────────── */

type MessageEvidenceRow = Models.Row & {
  communityId?: string | null
  reportedBody?: string | null
  reportedAt?: string | null
}

function toEvidenceRow(row: MessageEvidenceRow): EvidenceRow {
  return {
    $id: row.$id,
    communityId: row.communityId ?? '',
    reportedBody: row.reportedBody ?? '',
    reportedAt: row.reportedAt ?? '',
  }
}

/** Der Store über die echte Tabelle — mandantenübergreifend, Admin-Client. */
export function appwriteEvidenceSweepStore(): EvidenceSweepStore {
  const config = useRuntimeConfig()
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient()
  return {
    async listReported({ after, limit }) {
      const { rows } = await tablesDB.listRows<MessageEvidenceRow>({
        databaseId,
        tableId: MESSAGES_TABLE,
        queries: [
          Query.notEqual('reportedAt', ''),
          Query.orderAsc('$sequence'),
          Query.limit(limit),
          ...(after ? [Query.cursorAfter(after)] : []),
        ],
      })
      return rows.map(toEvidenceRow)
    },
    async getMessage(id) {
      try {
        const row = await tablesDB.getRow<MessageEvidenceRow>({ databaseId, tableId: MESSAGES_TABLE, rowId: id })
        return toEvidenceRow(row)
      }
      catch (error) {
        if (errorStatus(error) === 404) return null
        throw error
      }
    },
    reportState(communityId, messageId) {
      return reportEvidenceStateForTarget({ communityId, targetType: MESSAGE_REPORT_TARGET, targetId: messageId })
    },
    async clearEvidence(id) {
      await tablesDB.updateRow({ databaseId, tableId: MESSAGES_TABLE, rowId: id, data: { reportedBody: '', reportedAt: '' } })
    },
  }
}

/** Die Sperre in `system_runs` (system-040, in jedem Projekt). */
export function systemRunsLeaseStore(): RunLeaseStore {
  const config = useRuntimeConfig()
  const { tablesDB } = createAdminClient()
  return appwriteRunLeaseStore({ tablesDB, databaseId: config.public.appwriteDatabaseId, tableId: SYSTEM_RUNS_TABLE })
}

/** Der Schalter `pukalani.messages.reportEvidenceSweep`; unbekannt ⇒ `off` + Fehlerzeile. */
export function reportEvidenceSweepMode(): ReportEvidenceSweepMode {
  const appConfig = useAppConfig() as { pukalani?: { messages?: { reportEvidenceSweep?: unknown } } }
  const raw = appConfig.pukalani?.messages?.reportEvidenceSweep
  const { mode, invalid } = resolveReportEvidenceSweepMode(raw)
  if (invalid) logEvent('error', 'messages.report_evidence_sweep_invalid_mode', { value: String(raw).slice(0, 40) })
  return mode
}

/** Der Lauf dieser App (das Plugin ruft nur das). */
export function createAppReportEvidenceSweep(mode: 'count' | 'apply'): () => Promise<'skipped' | undefined> {
  return createReportEvidenceSweepRunner({
    mode,
    deps: () => ({ store: appwriteEvidenceSweepStore(), lease: systemRunsLeaseStore() }),
    log: (level, name, data) => logEvent(level, name, data),
  })
}
