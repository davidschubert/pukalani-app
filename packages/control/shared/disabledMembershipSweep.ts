/**
 * ZWEITER SICHERUNGS-LAUF (SI1 b, Davids Ja 2026-11-21: „nur zählend").
 *
 * Eine `active`-Zeile in `community_members` einer STILLGELEGTEN Community
 * (`communities.status = 'disabled'`) ist ein Rest: das Stilllegen
 * (`api/control/community/delete.post.ts`) stellt jede Mitgliedschaft MIT
 * Zugang auf `removed`, hat aber ein Zeitbudget und darf einzelne Zeilen
 * verfehlen. Der stündliche Label-Abgleich der Platform-App nimmt das Label
 * schon, darf die Zeile aber nicht umstellen (er liest das Control Plane nur).
 * Dieser Lauf gehört der Betreiber-App, die dort schreiben darf.
 *
 * Schalter `pukalani.control.disabledMembershipSweep`: `off` | `dry-run`
 * (zählt und meldet nur) | `apply` (stellt die Zeilen auf `removed`, dieselbe
 * Semantik wie das Stilllegen). Jeder unbekannte Wert ist `off`.
 */
export const DISABLED_MEMBERSHIP_SWEEP_MODES = ['off', 'dry-run', 'apply'] as const
export type DisabledMembershipSweepMode = (typeof DISABLED_MEMBERSHIP_SWEEP_MODES)[number]

/** PURE: Schalterwert lesen — fail-closed, ein Tippfehler schaltet nie scharf. */
export function resolveDisabledMembershipSweepMode(value: unknown): DisabledMembershipSweepMode {
  return typeof value === 'string' && (DISABLED_MEMBERSHIP_SWEEP_MODES as readonly string[]).includes(value)
    ? value as DisabledMembershipSweepMode
    : 'off'
}

export interface DisabledMembershipSweepReport {
  mode: 'dry-run' | 'apply'
  /** Stillgelegte Communities, die gelesen wurden. */
  disabledCommunities: number
  /** Davon mit mindestens einer `active`-Zeile. */
  affectedCommunities: number
  /** `active`-Zeilen in stillgelegten Communities (vor dem Umstellen). */
  activeRows: number
  /** Nur `apply`: umgestellt auf `removed`. */
  removed: number
  /** Nur `apply`: beim frischen Lesen nicht mehr zutreffend (übersprungen). */
  skipped: number
  /** Nur `apply`: Schreib- oder Lesefehler je Zeile. */
  failed: number
  /** Der Deckel griff — es gibt mehr, als gelesen wurde. */
  truncated: boolean
}

/** Höchstens so viele Zeilen je Lauf (der Rest kommt im nächsten Takt). */
export const DISABLED_MEMBERSHIP_SWEEP_MAX_ROWS = 1000
