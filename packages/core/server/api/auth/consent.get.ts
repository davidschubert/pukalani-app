import { appRequiredConsents, missingConsents } from '../../utils/consentRecords'
import type { ConsentStateResponse } from '../../../shared/types/consent'

/**
 * Stand der Zustimmung des eingeloggten Kontos (SEC-007): was die App
 * verlangt, was fehlt, wohin der AGB-Link führt. Leser: die Nachfrage im
 * Browser (`consent-prompt.client.ts`), wenn sie ohne Seitenaufbau geöffnet
 * wird (nach einer Anmeldung im Browser oder nach einem 403
 * `consent_required`).
 *
 * Eine App ohne Pflicht antwortet ohne Datenbank-Aufruf mit leeren Listen.
 */
export default defineEventHandler(async (event): Promise<ConsentStateResponse> => {
  const userId = event.context.user?.$id
  if (!userId) throw createError({ status: 401, statusText: 'Unauthorized' })

  const appConfig = useAppConfig() as { pukalani?: { auth?: { termsUrl?: string } } }
  return {
    required: appRequiredConsents(),
    missing: await missingConsents(event, userId),
    termsUrl: appConfig.pukalani?.auth?.termsUrl ?? '',
  }
})
