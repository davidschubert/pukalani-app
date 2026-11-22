import {
  customDomainClaimExpired,
  customDomainEntitlement,
  customDomainGraceEnd,
  resolveCustomDomainStatus,
} from './customDomain'
import type { TenantRow } from './types/tenantRecord'

/**
 * DER FRISTEN-LAUF DER EIGENEN DOMAIN — die PURE Hälfte (BE-014, Davids
 * Entscheidung vom 2026-11-16).
 *
 * Endet Testphase oder Abo (oder fällt der Plan unter Pro, oder fehlt die
 * Freigabe), bleibt eine AKTIVE eigene Domain noch 14 Tage aktiv
 * (`CUSTOM_DOMAIN_GRACE_DAYS`); danach wird sie ABGESCHALTET (`paused`) —
 * gelöscht wird nichts. Einträge ohne Nachweis verfallen nach 14 Tagen.
 *
 * Hier steht nur, WAS mit einer Zeile geschehen soll. Wer schreibt (der Lauf
 * im Control Plane, `server/utils/customDomainSweep.ts`) und wer die zwei
 * Hinweis-Mails schickt (der Lauf der Platform-App), steht anderswo — dieselbe
 * Arbeitsteilung wie beim Zahlungsverzug: das Control Plane stempelt und
 * schaltet, die Platform-App meldet.
 *
 * FAIL-OPEN BEI UNLESBAREN DATEN: ein Datum, das sich nicht lesen lässt, löst
 * NIE eine Handlung aus. Lieber eine Domain einen Tag zu lang aktiv als eine
 * zu Unrecht abgeschaltet.
 */

// ── Schalter ────────────────────────────────────────────────────────────────

/**
 * `pukalani.control.customDomainSweep` (app.config):
 *   off      — der Lauf meldet sich gar nicht an,
 *   dry-run  — er ZÄHLT nur und schreibt nichts (Layer-Default),
 *   apply    — er stempelt, räumt und schaltet ab.
 */
export const CUSTOM_DOMAIN_SWEEP_MODES = ['off', 'dry-run', 'apply'] as const
export type CustomDomainSweepMode = (typeof CUSTOM_DOMAIN_SWEEP_MODES)[number]

/** PURE: Schalterwert lesen — jeder unbekannte Wert ist `off` (fail-closed:
 *  ein Tippfehler darf nie scharf schalten). */
export function resolveCustomDomainSweepMode(value: unknown): CustomDomainSweepMode {
  return typeof value === 'string' && (CUSTOM_DOMAIN_SWEEP_MODES as readonly string[]).includes(value)
    ? value as CustomDomainSweepMode
    : 'off'
}

// ── Entscheidung je Zeile ───────────────────────────────────────────────────

export const CUSTOM_DOMAIN_SWEEP_ACTIONS = [
  'none',
  'start_grace',
  'clear_grace',
  'pause',
  'stamp_claim',
  'expire_claim',
] as const
export type CustomDomainSweepAction = (typeof CUSTOM_DOMAIN_SWEEP_ACTIONS)[number]

/** Die Spalten, die der Lauf schreiben darf. */
export interface CustomDomainSweepPatch {
  customDomain?: string
  customDomainStatus?: string
  customDomainToken?: string
  customDomainError?: string
  customDomainVerifiedAt?: string | null
  customDomainActivatedAt?: string | null
  customDomainClaimedAt?: string | null
  customDomainGraceEndsAt?: string | null
  customDomainPausedAt?: string | null
}

/**
 * DER EINE PATCH „Eintrag weg" — den nehmen die Owner-Route `remove.post.ts`
 * UND der Lauf (verfallener Eintrag). Eintragsdatum, Frist und Abschaltung
 * gehören der DOMAIN und gehen mit ihr; die Freigabe
 * (`customDomainApproved`) gehört der COMMUNITY und bleibt stehen.
 */
export const CUSTOM_DOMAIN_CLEARED_PATCH: Readonly<Required<CustomDomainSweepPatch>> = Object.freeze({
  customDomain: '',
  customDomainStatus: 'none',
  customDomainToken: '',
  customDomainError: '',
  customDomainVerifiedAt: null,
  customDomainActivatedAt: null,
  customDomainClaimedAt: null,
  customDomainGraceEndsAt: null,
  customDomainPausedAt: null,
})

export type CustomDomainSweepDecision =
  | { action: 'none' }
  | { action: Exclude<CustomDomainSweepAction, 'none'>, patch: CustomDomainSweepPatch }

/** Der Ausschnitt einer `communities`-Zeile, den die Entscheidung braucht. */
export type CustomDomainSweepRow = Pick<TenantRow, 'status' | 'mode'> & Partial<Pick<TenantRow,
  | 'plan'
  | 'trialEndsAt'
  | 'billingStatus'
  | 'customDomain'
  | 'customDomainStatus'
  | 'customDomainApproved'
  | 'customDomainVerifiedAt'
  | 'customDomainClaimedAt'
  | 'customDomainGraceEndsAt'
>>

/**
 * PURE (unit-getestet): was geschieht mit dieser Zeile JETZT?
 *
 *  - stillgelegte Community (`status !== 'active'`), keine Pool-Community
 *    (eigene Domains mit Frist gibt es nur im Pool, control-040) oder keine
 *    Domain eingetragen ⇒ `none`. Eine `abuse`-Sperre hält den Lauf NICHT
 *    auf: die Regel an der Domain ist dieselbe.
 *  - Domain `active`:
 *      berechtigt + Frist gesetzt          ⇒ `clear_grace` (Kauf kam an),
 *      nicht berechtigt + keine Frist      ⇒ `start_grace` (14 Tage ab jetzt),
 *      nicht berechtigt + Frist erreicht   ⇒ `pause`,
 *      Frist unlesbar                      ⇒ `none` (fail-open).
 *  - Eintrag ohne Nachweis (`pending_dns`, oder `error` ohne
 *    `customDomainVerifiedAt`) ohne Eintragsdatum ⇒ `stamp_claim`: der
 *    Bestand beginnt beim ersten Lauf zu zählen.
 *  - `customDomainClaimExpired` ⇒ `expire_claim` (Eintrag wie „Domain
 *    entfernen" leeren, die Freigabe bleibt).
 *
 * `approvalWaived` (PK1 K6): dieselbe Ausnahme wie an der Tür der Domain-Routen
 * — der Lauf fragt sie EINMAL je Lauf (`customDomainApprovalWaived`), nie je
 * Zeile.
 */
export function decideCustomDomainSweep(
  row: CustomDomainSweepRow,
  now: number,
  options: { approvalWaived?: boolean } = {},
): CustomDomainSweepDecision {
  if (row.status !== 'active' || row.mode !== 'pool' || !row.customDomain) return { action: 'none' }
  const status = resolveCustomDomainStatus(row.customDomainStatus)

  if (status === 'active') {
    const entitled = customDomainEntitlement(row, now, options).allowed
    const graceRaw = row.customDomainGraceEndsAt ?? ''
    if (entitled) {
      return graceRaw
        ? { action: 'clear_grace', patch: { customDomainGraceEndsAt: null } }
        : { action: 'none' }
    }
    if (!graceRaw) return { action: 'start_grace', patch: { customDomainGraceEndsAt: customDomainGraceEnd(now) } }
    const graceEnd = Date.parse(graceRaw)
    if (!Number.isFinite(graceEnd)) return { action: 'none' }
    if (graceEnd > now) return { action: 'none' }
    return {
      action: 'pause',
      patch: {
        customDomainStatus: 'paused',
        customDomainPausedAt: new Date(now).toISOString(),
        customDomainGraceEndsAt: null,
      },
    }
  }

  const withoutProof = status === 'pending_dns' || (status === 'error' && !row.customDomainVerifiedAt)
  if (withoutProof && !row.customDomainClaimedAt) {
    return { action: 'stamp_claim', patch: { customDomainClaimedAt: new Date(now).toISOString() } }
  }
  if (customDomainClaimExpired(row, now)) return { action: 'expire_claim', patch: { ...CUSTOM_DOMAIN_CLEARED_PATCH } }
  return { action: 'none' }
}

// ── Bericht (Lauf, Betreiber-Route, Seite) ──────────────────────────────────

/** `remind` = keine Schreib-Handlung, aber die Erinnerung „in drei Tagen"
 *  ist fällig — der Betreiber soll sie in der Liste sehen. */
export type CustomDomainSweepItemAction = Exclude<CustomDomainSweepAction, 'none'> | 'remind'

export interface CustomDomainSweepItem {
  communityId: string
  /** Die Pukalani-Adresse der Community. */
  host: string
  domain: string
  action: CustomDomainSweepItemAction
  /** Ende der Frist nach der Handlung (ISO) — `null`, wenn keine läuft. */
  graceEndsAt: string | null
  /** Aktive Owner (= Empfänger der Hinweis-Mails). */
  owners: number
}

export interface CustomDomainSweepReport {
  mode: 'dry-run' | 'apply'
  /** Zeilen mit eingetragener Domain. */
  checked: number
  counts: {
    startGrace: number
    clearGrace: number
    pause: number
    stampClaim: number
    expireClaim: number
    failed: number
  }
  /** Was der Hinweis-Lauf der Platform-App verschicken wird (Anzahl Owner). */
  mails: { start: number, ending: number }
  items: CustomDomainSweepItem[]
}

/** Antwort der Betreiber-Route `GET /api/control/sweeps/custom-domain`. */
export interface CustomDomainSweepRouteResponse extends CustomDomainSweepReport {
  configuredMode: CustomDomainSweepMode
}
