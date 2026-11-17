import { logEvent } from '../utils/logEvent'
import { processErrorKind, shapeProcessErrorLog } from '../utils/processErrors'

/**
 * Fehler außerhalb einer Anfrage landen als zählbare Zeile im Protokoll
 * (WA1 e) — Begründung und Grenzen in `../utils/processErrors.ts`.
 *
 * Dasselbe Gate wie der zentrale Fehler-Hook (`pukalani.observability`). Kein
 * eigener Lauscher am Prozess: Nitro ruft seinen Haken `error` für nicht
 * behandelte Ablehnungen und Ausnahmen mit einem Etikett, für Fehler einer
 * Anfrage ohne — die schreibt weiter nur `server/error.ts`.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    try {
      const kind = processErrorKind(context?.tags)
      if (!kind) return
      if (!useAppConfig().pukalani?.observability?.enabled) return
      logEvent('error', 'server.error', shapeProcessErrorLog(error, kind))
    }
    catch {
      // Logging darf nie selbst zum Fehler werden
    }
  })
})
