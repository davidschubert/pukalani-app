import {
  aiModelEndpointsUrl,
  interpretAiModelEndpoints,
  isKnownAiBroker,
} from '../../shared/aiModelEndpoints'
import type { AiModelCheck } from '../../shared/aiModelEndpoints'
import { logEvent } from './logEvent'

/**
 * MODELL BEIM SPEICHERN PRÜFEN — der Netz-Teil (KI1 c, 2026-11-17).
 *
 * Fragt die öffentliche Endpunkt-Liste des Vermittlers (kein Schlüssel, kein
 * `chat/completions`, nichts wird gebucht) und deutet sie über
 * `shared/aiModelEndpoints.ts`. Kurze Frist: ein Speichern auf der Config-Seite
 * soll nie am Vermittler hängen. Alles, was KEINE Aussage über das Modell ist —
 * Frist, Netzfehler, 5xx/429, unlesbare Antwort, eine fremde Basis-Adresse —,
 * heißt `unverified`; die Aufrufer speichern dann trotzdem und sagen es dazu.
 *
 * Protokoll nur mit Kennungen (SEC-017): Modell-Slug, Status, Ausgang, `ms`.
 * Nie der Antwortrumpf, nie ein rohes Fehlerobjekt.
 */

export const AI_MODEL_CHECK_TIMEOUT_MS = 5000

export interface AiModelCheckOptions {
  /** Basis-Adresse des KI-Transports, für den das Modell gelten soll. */
  baseUrl: string
  /** Frist in Millisekunden — Standard 5 s. */
  timeoutMs?: number
}

export async function checkAiModelEndpoints(slug: string, options: AiModelCheckOptions): Promise<AiModelCheck> {
  const model = slug.trim()
  if (!isKnownAiBroker(options.baseUrl)) {
    // Ein eigener Vermittler hat eine eigene Liste (oder keine) — dazu sagen
    // wir nichts, statt eine fremde Liste falsch zu deuten.
    logEvent('warn', 'ai.model_check', { model, check: 'unverified', why: 'foreign_base' })
    return 'unverified'
  }

  const started = Date.now()
  let status: number
  let body: unknown
  try {
    const res = await fetch(aiModelEndpointsUrl(model), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? AI_MODEL_CHECK_TIMEOUT_MS),
    })
    status = res.status
    if (res.ok) {
      try {
        body = await res.json()
      }
      catch {
        body = undefined
      }
    }
  }
  catch (error) {
    const why = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'network'
    logEvent('warn', 'ai.model_check', { model, check: 'unverified', why, ms: Date.now() - started })
    return 'unverified'
  }

  const check = interpretAiModelEndpoints(status, body)
  logEvent(check === 'ok' ? 'info' : 'warn', 'ai.model_check', { model, check, status, ms: Date.now() - started })
  return check
}
