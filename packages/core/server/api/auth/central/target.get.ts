import { z } from 'zod'
import { resolveCentralReturn } from '../../../utils/centralLogin'

/**
 * Zentrale Anmeldung (PK1 E2, Prototyp): für welche Community meldet man sich
 * gerade an? Die Seite `/login/continue` im Kundenbereich zeigt damit
 * „Anmelden bei <Name>". Schalter aus, kein Kontroll-Host oder unbekannter
 * Host ⇒ 404, ohne Grund (Regeln: `server/utils/centralLogin.ts`).
 *
 * Öffentlich (auch für Gäste): die Antwort nennt nur, was auf der Community
 * selbst öffentlich steht — Name und kanonischen Host.
 */
const querySchema = z.object({
  site: z.string().min(1).max(253),
}).strict()

export default defineEventHandler(async (event): Promise<{ host: string, name: string }> => {
  const query = await getValidatedQuery(event, querySchema.safeParse)
  const target = query.success ? await resolveCentralReturn(event, query.data.site) : null
  if (!target) throw createError({ status: 404, statusText: 'Not found' })
  return target
})
