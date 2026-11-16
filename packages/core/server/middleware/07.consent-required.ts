import { requiredConsents, CONSENT_REQUIRED_CODE, type ConsentConfig } from '../../shared/consent'
import { consentGateAllowed, isSafeMethod } from '../../shared/consentGate'
import { missingConsents } from '../utils/consentRecords'
import type { ConsentKind } from '../../shared/types/consent'

/**
 * TÜR ZU UND EINMAL FRAGEN (SEC-007, Davids Entscheidung 2026-11-16): wer in
 * einer App, die AGB verlangt, keine festgehaltene Zustimmung hat, kann
 * lesen, aber nichts anlegen, kaufen oder KI-Läufe starten. Wer zugestimmt
 * hat, merkt nichts.
 *
 * DIE EINE STELLE: jede schreibende `/api/**`-Anfrage eines angemeldeten
 * Kontos ohne Zustimmung bekommt hier 403 mit `data: { code:
 * 'consent_required' }` — vor jeder Route. Eine neue Schreib-Route muss
 * dafür nichts tun. Ausnahmen: die fail-closed Liste in
 * `shared/consentGate.ts` (Konto/Sitzung, Auskunft und Löschung des eigenen
 * Kontos, Telemetrie, Anwesenheit, Health); Layer erweitern sie nicht.
 *
 * SEITEN (GET, kein `/api/`, kein `/_`): hier wird nichts abgewiesen, nur
 * `event.context.consentMissing` gesetzt — der Server-Plugin
 * `consent-state.server.ts` reicht es an die Nachfrage im Browser weiter.
 *
 * DATEINAME: Nitro sortiert lexikografisch; `07.consent-required` liegt nach
 * `02.auth` (Konto bekannt), `05.rate-limit` (gedrosselte Anfragen kosten
 * keine Prüfung) und den Community-Middlewares (`07.community-role`:
 * `m` < `n`).
 *
 * KOSTEN: die App verlangt nichts, kein Konto oder lesende API-Anfrage ⇒
 * Ausstieg vor jedem `await`. Sonst je Art ein `getRow`, bis die Zustimmung
 * einmal gesehen wurde (danach aus dem Prozess-Speicher).
 *
 * FEHLER BEIM NACHSEHEN (Datenbank weg): die Anfrage geht DURCH, mit
 * `auth.consent_check_failed` im Log. Die Tür sperrt sonst bei einem
 * Ausfall jedes Konto aus; die eigenen Prüfungen der Routen gelten weiter.
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { auth?: ConsentConfig } }
  if (!requiredConsents(appConfig.pukalani?.auth).length) return
  const userId = event.context.user?.$id
  if (!userId) return

  const path = event.path.split('?')[0] ?? ''
  const isApi = path === '/api' || path.startsWith('/api/')

  if (isApi) {
    if (isSafeMethod(event.method)) return
    if (consentGateAllowed(path)) return
  }
  // Seiten ja, Dateien (`/favicon.ico`, `/og/x.png`) und interne Pfade nicht.
  else if (event.method !== 'GET' || path.startsWith('/_') || /\.[a-z0-9]+$/i.test(path)) {
    return
  }

  let missing: ConsentKind[]
  try {
    missing = await missingConsents(event, userId)
  }
  catch (error) {
    logEvent('warn', 'auth.consent_check_failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (!isApi) {
    if (missing.length) event.context.consentMissing = missing
    return
  }

  if (missing.length) {
    throw createError({ status: 403, statusText: 'Consent required', data: { code: CONSENT_REQUIRED_CODE } })
  }
})
