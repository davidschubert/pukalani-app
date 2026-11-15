import { z } from 'zod'
import { scrubClientErrorReport } from '../../../shared/logAddress'

const clientErrorSchema = z.object({
  source: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(1024).optional(),
})

/**
 * Client-Error-Inbox (Observability-Gate): nimmt Browser-Fehler entgegen und
 * schreibt sie als strukturierte JSON-Zeile ins Server-Log (logEvent). Nur
 * aktiv, wenn die App pukalani.observability.enabled + clientErrors gesetzt hat —
 * sonst 404. Rate-limited (rate-limit.ts, Bucket telemetry:error). Es wird
 * bewusst NUR das validierte Payload geloggt (keine Header/Cookies — PII).
 *
 * ADRESSEN OHNE QUERY UND FRAGMENT (SEC-013): die Route nimmt Text von jedem
 * an — also wird hier gekürzt, nicht nur im Plugin davor. `url` behält Schema,
 * Host und Pfad; Adressen in `message` und `stack` ebenso
 * (`shared/logAddress.ts`, dieselbe Rechnung wie in `server/error.ts`).
 */
export default defineEventHandler(async (event) => {
  const gate = useAppConfig().pukalani?.observability
  if (!gate?.enabled || !gate?.clientErrors) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const payload = await readValidatedBody(event, clientErrorSchema.parse)

  logEvent('error', 'client.error', {
    ...scrubClientErrorReport(payload),
    // userId hilft beim Zuordnen von Sessions-Fehlern; anonyme Gäste bleiben leer
    userId: event.context.user?.$id ?? '',
  })

  return { ok: true }
})
