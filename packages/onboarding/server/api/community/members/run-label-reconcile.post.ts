import { z } from 'zod'
import { labelReconcileAvailable, labelReconcileMode, runLabelReconcile, type LabelReconcileResult } from '../../../utils/labelReconcile'

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
}).optional()

/**
 * LABEL-ABGLEICH JETZT LAUFEN LASSEN (Ops/Verifikation, SEC-024) — dasselbe
 * Paar aus Plugin und Handroute wie bei der Zahlungswarnung
 * (`/api/community/billing/run-past-due-notice`) und aus demselben Grund: ein
 * Lauf, den man nur durch Warten beobachten kann, wird nie bewiesen.
 *
 * system.manage-gated (Betreiber), MANDANTENÜBERGREIFEND — die dokumentierte
 * Sweep-Ausnahme: der Lauf sieht alle entzogenen Mitgliedschaften DIESES
 * Runtime-Projekts, nicht nur die des Hosts, auf dem er ausgelöst wurde.
 *
 * Body `{ dryRun?: boolean }`, Standard `true` (nur zählen). `dryRun: false`
 * schreibt NUR, wenn der Schalter `pukalani.community.labelReconcile` auf
 * `apply` steht — sonst 409 `label_reconcile_not_apply`: die Handroute ist
 * kein Weg am Schalter vorbei. Ein Probelauf geht immer (er liest nur).
 *
 * Antwort: nur Anzahlen (keine Kennungen — die stehen je Entzug im Log).
 * 503 ohne verdrahteten Leser (Control-Env fehlt): falsch konfiguriert, nicht
 * abwesend.
 */
export default defineEventHandler(async (event): Promise<LabelReconcileResult> => {
  requirePermission(event, 'system.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const dryRun = body?.dryRun ?? true

  if (!labelReconcileAvailable()) {
    throw createError({ status: 503, statusText: 'Control plane is not configured' })
  }
  if (!dryRun && labelReconcileMode() !== 'apply') {
    throw createError({
      status: 409,
      statusText: 'Label reconcile is not switched to apply',
      data: { code: 'label_reconcile_not_apply' },
    })
  }

  const result = await runLabelReconcile(dryRun ? 'dry-run' : 'apply')
  if (!result) throw createError({ status: 503, statusText: 'Control plane is not configured' })
  return result
})
