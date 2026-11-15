import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

const {
  aiEndpointUnavailableError,
  aiLogLine,
  aiProviderErrorCode,
  aiThrowableFields,
  isAiEndpointUnavailable,
  newAiRunId,
} = await import('../server/utils/aiLog')

/**
 * DIE PROTOKOLLZEILE DER KI-TRANSPORTE (P17, SEC-017) — sie nimmt nur Zahlen
 * und kurze Kennungen an. Was nicht wie eine Kennung aussieht, wird zu `?`:
 * so kann STRUKTURELL kein Fliesstext (Antwort, Rumpf, Fehlermeldung) ins Log.
 */
describe('aiLogLine', () => {
  it('baut die Zeile in fester Form', () => {
    expect(aiLogLine('brand', 'KI-API-Fehler', {
      status: 404,
      tag: 'invalid_request_error',
      model: 'anthropic/claude-haiku-4.5',
      ms: 812,
      run: 'ab12cd34',
    })).toBe('[brand] KI-API-Fehler status=404 tag=invalid_request_error model=anthropic/claude-haiku-4.5 ms=812 run=ab12cd34')
  })

  it('Fliesstext als Feldwert wird zu `?`', () => {
    const line = aiLogLine('brand', 'KI-API-Fehler', { tag: 'Die Anfrage war: mein geheimer Text', model: 'a b' })
    expect(line).toBe('[brand] KI-API-Fehler tag=? model=?')
  })

  it('zu lange Kennungen, leere Werte und NaN werden zu `?`, undefined fällt weg', () => {
    const line = aiLogLine('core', 'KI-Aufruf fehlgeschlagen', {
      tag: 'x'.repeat(81),
      gen: '',
      ms: Number.NaN,
      cause: undefined,
      run: 'ab12cd34',
    })
    expect(line).toBe('[core] KI-Aufruf fehlgeschlagen tag=? gen=? ms=? run=ab12cd34')
  })

  it('auch ein Präfix mit Leerzeichen wird nicht geglaubt', () => {
    expect(aiLogLine('mein label', 'KI-API-Fehler', {})).toBe('[?] KI-API-Fehler')
  })
})

describe('aiProviderErrorCode', () => {
  it('nimmt `code` und `type`, nie `message`', () => {
    const body = JSON.stringify({ error: { code: 'rate_limit_exceeded', type: 'requests', message: 'GEHEIM' } })
    expect(aiProviderErrorCode(body)).toBe('rate_limit_exceeded/requests')
  })

  it('GEGENPROBE: kein JSON, keine Kennung, Zahl ⇒ undefined', () => {
    expect(aiProviderErrorCode('<html>GEHEIM</html>')).toBeUndefined()
    expect(aiProviderErrorCode(JSON.stringify({ error: { message: 'GEHEIM' } }))).toBeUndefined()
    expect(aiProviderErrorCode(JSON.stringify({ error: { code: 404 } }))).toBeUndefined()
  })
})

describe('aiThrowableFields', () => {
  it('nur Name und kurzer cause.code, nie die message', () => {
    const error = new TypeError('fetch failed GEHEIM', { cause: { code: 'ECONNRESET', message: 'GEHEIM' } })
    expect(aiThrowableFields(error)).toEqual({ err: 'TypeError', cause: 'ECONNRESET' })
  })

  it('kein Error ⇒ `unknown`', () => {
    expect(aiThrowableFields('GEHEIM')).toEqual({ err: 'unknown' })
  })
})

describe('newAiRunId', () => {
  it('acht Hex-Zeichen, je Aufruf neu', () => {
    const a = newAiRunId()
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(newAiRunId()).not.toBe(a)
  })
})

describe('isAiEndpointUnavailable (Server)', () => {
  it('erkennt den eigenen Fehler', () => {
    expect(isAiEndpointUnavailable(aiEndpointUnavailableError())).toBe(true)
    expect(aiEndpointUnavailableError()).toMatchObject({ status: 503, data: { code: 'ai_endpoint_unavailable' } })
  })

  it('GEGENPROBE: andere Codes und Nicht-Objekte', () => {
    expect(isAiEndpointUnavailable({ data: { code: 'ai_truncated' } })).toBe(false)
    expect(isAiEndpointUnavailable(null)).toBe(false)
    expect(isAiEndpointUnavailable('ai_endpoint_unavailable')).toBe(false)
  })
})
