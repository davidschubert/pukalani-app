import { QUOTA_KINDS, type TenantPlanLimits } from '../../shared/types/tenantRecord'

/**
 * Formular des Kastens „Pläne & Limits" (KK1 c) — PUR, damit die Regel ohne
 * Browser prüfbar ist (`tests/planLimitsForm.test.ts`).
 *
 * Je Plan und Art ist ein Eintrag entweder eine Zahl aus dem KATALOG
 * (`{ perDay, total }`) oder `null` = „Vorgabe": im Katalog steht nichts, es
 * gilt die Zahl aus der Konfiguration der Platform-App. Die Konsole kennt
 * diese Zahl nicht (Davids Entscheidung 6b: die Vorgabe bleibt in der
 * Platform-App) und zeigt deshalb nur das Wort.
 *
 * WARUM NICHT „leer = 0": bis KK1 c zeigte der Kasten eine fehlende Art als
 * 0 — und ein Speichern schrieb dann 0, also UNBEGRENZT, in den Katalog.
 */
export type PlanLimitsEdit = Record<string, { perDay: number, total: number } | null>

/** Die Arten, die der Kasten für einen Plan zeigt: die festen und jede weitere aus dem Katalog. */
export function planLimitKinds(stored: Record<string, TenantPlanLimits>): string[] {
  const extra = Object.keys(stored).filter(kind => !(QUOTA_KINDS as readonly string[]).includes(kind)).sort()
  return [...QUOTA_KINDS, ...extra]
}

/** Startzustand des Formulars aus dem gespeicherten Katalog. */
export function planLimitsEditFrom(stored: Record<string, TenantPlanLimits>): PlanLimitsEdit {
  const edit: PlanLimitsEdit = {}
  for (const kind of planLimitKinds(stored)) {
    const value = stored[kind]
    edit[kind] = value ? { perDay: value.perDay ?? 0, total: value.total ?? 0 } : null
  }
  return edit
}

function sameLimits(a: TenantPlanLimits, b: { perDay: number, total: number }): boolean {
  return (a.perDay ?? 0) === b.perDay && (a.total ?? 0) === b.total
}

/**
 * Der Körper für `PATCH /api/control/plans/:key`: NUR die geänderten Arten
 * (die Route führt zusammen). `null` nimmt eine Art aus dem Katalog. Leeres
 * Objekt ⇒ nichts zu speichern.
 */
export function planLimitsPatch(
  stored: Record<string, TenantPlanLimits>,
  edit: PlanLimitsEdit,
): Record<string, TenantPlanLimits | null> {
  const patch: Record<string, TenantPlanLimits | null> = {}
  for (const [kind, value] of Object.entries(edit)) {
    const before = stored[kind]
    if (value === null) {
      if (before) patch[kind] = null
      continue
    }
    const next = { perDay: Math.max(0, Math.trunc(Number(value.perDay) || 0)), total: Math.max(0, Math.trunc(Number(value.total) || 0)) }
    if (!before || !sameLimits(before, next)) patch[kind] = next
  }
  return patch
}
