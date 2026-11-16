/**
 * DIE FRIST DES BELEGS — Kopie für die Skripte (SEC-033).
 *
 * Original: `evidenceDueForClearing` in `packages/messages/shared/messageReport.ts`
 * (der Lösch-Lauf benutzt es). Ein `.mjs` liest kein TypeScript ohne Build,
 * deshalb steht die Regel hier noch einmal. Ändert sich das Original, ändert
 * sich diese Datei mit — `tests/reportEvidenceRule.test.ts` hält beide an
 * denselben Fällen fest.
 */

/** Dieselbe Zahl wie `REPORT_EVIDENCE_RETENTION_DAYS`. */
export const RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * @param {{ reportedBody: string, reportedAt: string, open: number, closed: number, lastClosedAt: string }} state
 * @param {Date} now
 * @returns {boolean}
 */
export function evidenceDue(state, now) {
  if (state.reportedBody === '' || state.reportedAt === '') return false
  if (state.open > 0) return false
  const anchor = state.closed > 0 ? state.lastClosedAt : state.reportedAt
  const at = Date.parse(anchor)
  if (!Number.isFinite(at)) return false
  return now.getTime() - at >= RETENTION_DAYS * DAY_MS
}
