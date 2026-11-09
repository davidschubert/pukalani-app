import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from '../../core/server/utils/logEvent'

/**
 * WAS DIE LOG-ZEILE EINES BEZAHLTEN LAUFS SAGT (2026-11-09).
 *
 * Der Kopf von `insightsAi.ts` begründet, warum die Betriebsdaten eines
 * Redaktions-Laufs in eine strukturierte Log-Zeile gehören und nicht in eine
 * Tabelle: ein Beitrag hat viele Läufe, eine Spalte behielte nur den letzten.
 * Damit ist die Zeile der EINZIGE Ort, an dem je nachzulesen ist, was ein Lauf
 * gekostet hat — und eine Zusage, die nur an einem Ort steht, braucht dort
 * einen Wächter.
 *
 * Geprüft wird mit dem ECHTEN `logEvent` des Core, nicht mit einer Attrappe:
 * die Behauptung ist nicht „die Route ruft etwas auf", sondern „die Zahlen
 * stehen hinterher in der Zeile". Dazwischen liegt ein `JSON.stringify`, und
 * genau dessen Verhalten gegenüber `undefined` ist der zweite Test.
 */

vi.stubGlobal('logEvent', logEvent)

const { insightsLogAi } = await import('../server/utils/insightsAi')

let lines: Record<string, unknown>[]

/** Die zuletzt geschriebene Zeile, zurückgelesen wie ein Log-Shipper sie sieht. */
function lastLine(): Record<string, unknown> {
  const line = lines.at(-1)
  if (!line) throw new Error('keine Log-Zeile geschrieben')
  return line
}

beforeEach(() => {
  lines = []
  const capture = (raw: unknown): void => {
    lines.push(JSON.parse(String(raw)) as Record<string, unknown>)
  }
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('insightsLogAi — die Zahlen, die eine Rechnung erklären', () => {
  it('trägt beide Tokenzahlen und den finish_reason eines fertigen Entwurfs', () => {
    insightsLogAi('completed', 'draft', {
      postId: 'post-1',
      format: 'article',
      model: 'anthropic/claude-haiku-4.5',
      promptVersion: 'insights-d-3',
      durationMs: 42_000,
      promptTokens: 2400,
      completionTokens: 1100,
      finishReason: 'stop',
    })

    expect(lastLine()).toMatchObject({
      event: 'insights.draft.completed',
      promptTokens: 2400,
      completionTokens: 1100,
      finishReason: 'stop',
    })
  })

  it('sagt an einem GESCHEITERTEN Lauf, was er trotzdem verbraucht hat', () => {
    // Der Anbieter hat geliefert und ist bezahlt, erst das Schema hat
    // abgelehnt — genau der Lauf, dessen Verbrauch man sehen will.
    insightsLogAi('failed', 'translate', {
      postId: 'post-1',
      model: 'anthropic/claude-haiku-4.5',
      errorCode: '502 AI returned no JSON',
      promptTokens: 900,
      completionTokens: 8000,
      finishReason: 'length',
    })

    expect(lastLine()).toMatchObject({
      event: 'insights.translate.failed',
      level: 'warn',
      completionTokens: 8000,
      finishReason: 'length',
    })
  })

  it('GEGENPROBE: ohne Zahlen stehen die Schlüssel NICHT in der Zeile', () => {
    // Der Anbieter antwortete gar nicht (Zeitüberschreitung, 502). Die Route
    // reicht dann `undefined` durch, und eine Zeile mit
    // `"completionTokens":null` wäre eine Behauptung über einen Verbrauch,
    // den niemand gemessen hat.
    insightsLogAi('failed', 'draft', {
      postId: 'post-1',
      model: 'anthropic/claude-haiku-4.5',
      errorCode: '502 AI provider unavailable',
      promptTokens: undefined,
      completionTokens: undefined,
      finishReason: undefined,
    })

    const line = lastLine()
    expect(line).toMatchObject({ event: 'insights.draft.failed' })
    expect(Object.keys(line)).not.toContain('promptTokens')
    expect(Object.keys(line)).not.toContain('completionTokens')
    expect(Object.keys(line)).not.toContain('finishReason')
  })

  it('schreibt NIE den Brief oder den Text — nur ihre Länge', () => {
    insightsLogAi('completed', 'draft', {
      postId: 'post-1',
      briefChars: 1887,
      briefRawChars: 2194,
      promptTokens: 2400,
      completionTokens: 1100,
    })

    const raw = JSON.stringify(lastLine())
    expect(raw).toContain('1887')
    expect(raw).not.toContain('brief"')
    expect(raw).not.toContain('body')
  })
})
