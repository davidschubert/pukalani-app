import {
  aiModelEndpointsUrl,
  aiModelEuEndpointsUrl,
  interpretAiModelEndpoints,
  isKnownAiBroker,
} from '../../shared/aiModelEndpoints'
import type { AiModelCheck, AiModelEndpointAnswer } from '../../shared/aiModelEndpoints'
import { logEvent } from './logEvent'

/**
 * MODELL BEIM SPEICHERN PRÜFEN — der Netz-Teil (KI1 c, 2026-11-17).
 *
 * Fragt die öffentliche Endpunkt-Liste des Vermittlers (kein Schlüssel, kein
 * `chat/completions`, nichts wird gebucht) und deutet sie über
 * `shared/aiModelEndpoints.ts`. Gelesen werden ZWEI Listen zugleich, die der
 * weltweiten und die der Europa-Adresse (warum, steht dort) — unter EINER
 * Frist, nicht nacheinander. Kurze Frist: ein Speichern auf der Config-Seite
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
  const timeoutMs = options.timeoutMs ?? AI_MODEL_CHECK_TIMEOUT_MS
  const [global, eu] = await Promise.all([
    readEndpointList(aiModelEndpointsUrl(model), timeoutMs),
    readEndpointList(aiModelEuEndpointsUrl(model), timeoutMs),
  ])

  const check = interpretAiModelEndpoints(global.answer, eu.answer)
  // `why` nur, wenn keine Aussage möglich war UND eine Liste gar nicht
  // antwortete — die weltweite zuerst, sie ist die ältere Auskunft.
  const why = check === 'unverified' ? (global.why ?? eu.why) : undefined
  logEvent(check === 'ok' ? 'info' : 'warn', 'ai.model_check', {
    model,
    check,
    ...(why ? { why } : {}),
    ...(global.answer ? { status: global.answer.status } : {}),
    ...(eu.answer ? { euStatus: eu.answer.status } : {}),
    ms: Date.now() - started,
  })
  return check
}

interface EndpointListRead {
  /** `null`, wenn die Liste nicht antwortete. */
  answer: AiModelEndpointAnswer | null
  /** Warum sie nicht antwortete — nur eine Kennung, nie der Fehlertext. */
  why?: 'timeout' | 'network'
}

async function readEndpointList(url: string, timeoutMs: number): Promise<EndpointListRead> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    let body: unknown
    if (res.ok) {
      try {
        body = await res.json()
      }
      catch {
        body = undefined
      }
    }
    return { answer: { status: res.status, body } }
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { answer: null, why: timedOut ? 'timeout' : 'network' }
  }
}
