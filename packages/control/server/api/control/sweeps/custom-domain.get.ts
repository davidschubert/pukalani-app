import type { CustomDomainSweepRouteResponse } from '../../../../shared/customDomainSweep'
import { customDomainSweepConfiguredMode, runCustomDomainSweep } from '../../../utils/customDomainSweep'

/**
 * WAS DER FRISTEN-LAUF DER EIGENEN DOMAIN JETZT TÄTE (BE-014) — die Zahlen,
 * nach denen David über das Scharfschalten entscheidet.
 *
 * IMMER `dry-run`, egal was der Schalter sagt: ein GET schreibt nie, und ein
 * Knopf „Neu zählen" darf keine Domain abschalten. `dry-run` nimmt KEINE
 * Lauf-Sperre (sie wäre selbst ein Schreibvorgang) — so blockiert ein Klick
 * nie den stündlichen Lauf, und ein Zählen neben einem scharfen Lauf schadet
 * nicht (es liest nur).
 *
 * `sites.manage` (Betreiber). Die Liste trägt Community-Id, Pukalani-Adresse
 * und Domain — Betreiber-Daten, keine Adressen von Personen.
 */
export default defineEventHandler(async (event): Promise<CustomDomainSweepRouteResponse> => {
  requirePermission(event, 'sites.manage')
  const report = await runCustomDomainSweep({ mode: 'dry-run' })
  // `dry-run` hat keine Sperre und kann nicht `skipped` sein — der Typ kennt
  // den Fall trotzdem.
  if ('skipped' in report) throw createError({ status: 409, statusText: 'Sweep running', data: { code: 'run_running' } })
  return { configuredMode: customDomainSweepConfiguredMode(), ...report }
})
