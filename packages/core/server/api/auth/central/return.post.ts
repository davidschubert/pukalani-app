import { z } from 'zod'
import { centralReturnUrl } from '../../../../shared/centralLogin'
import { safeRedirectTarget } from '../../../../shared/redirectTarget'
import { resolveCentralReturn } from '../../../utils/centralLogin'
import { deriveHandoffKey, sealHandoff } from '../../../utils/embedHandoff'
import { requestHandoffGrant } from '../../../utils/sessionHandoff'

/**
 * Zentrale Anmeldung (PK1 E2, Prototyp): nach der Anmeldung im Kundenbereich
 * zurück auf die Community. Siegelt die Sitzung DIESER Anfrage für den
 * geprüften Host der Community (60 s, an den Host gebunden, im Modus `write`
 * einmal einlösbar) und gibt die Rücksprung-Adresse zurück; die Community löst
 * sie über `GET /api/auth/site-session` ein (`establishSiteSession`).
 *
 * Wird beim KLICK gerufen („Weiter als …" oder nach dem Formular), nie beim
 * Seitenaufbau — das Siegel lebt nur 60 s.
 *
 * Der Host kommt aus `resolveCentralReturn` (Mandanten-Auflösung), nie aus
 * dem Body. Schalter aus oder unbekannter Host ⇒ 404; ohne Anmeldung ⇒ 401.
 */
const bodySchema = z.object({
  site: z.string().trim().min(1).max(253),
  to: z.string().max(512).optional(),
}).strict()

export default defineEventHandler(async (event): Promise<{ url: string }> => {
  const body = await readValidatedBody(event, bodySchema.safeParse)
  const target = body.success ? await resolveCentralReturn(event, body.data.site) : null
  if (!target) throw createError({ status: 404, statusText: 'Not found' })
  if (!event.context.user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const grant = requestHandoffGrant(event, { leavesHost: true })
  if (!grant) throw createError({ status: 401, statusText: 'Unauthorized' })

  const config = useRuntimeConfig(event)
  const token = sealHandoff(grant, deriveHandoffKey(config.appwriteKey), target.host)
  logEvent('info', 'auth.central_return_issued', { host: target.host, userId: event.context.user.$id })
  const port = (getHeader(event, 'host') ?? '').split(':')[1] ?? ''
  const to = body.success ? safeRedirectTarget(body.data.to) : null
  return { url: centralReturnUrl(target.host, token, to ?? '/', port) }
})
