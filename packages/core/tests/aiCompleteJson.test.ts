import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WAS `aiCompleteJson` AUS EINER ANTWORT MACHT (BI4, 2026-11-08).
 *
 * Drei Behauptungen, die man messen muss, weil an ihnen Geld hängt:
 *
 * 1. **Eine Antwort mit nicht escaptem `"` geht nicht mehr verloren.** Das ist
 *    der gemessene Fehlschlag von BI4 — vollständige Antwort, bezahlt,
 *    `finish_reason: 'stop'`, und bis BI4 ein `502 AI returned no JSON`.
 * 2. **Eine ABGESCHNITTENE Antwort wird BENANNT, nicht geraten.** Dafür gibt
 *    es nichts zu retten, und `finish_reason: 'length'` ist der direkte
 *    Beweis — er reist als `data.code = 'ai_truncated'` zur Oberfläche.
 * 3. **An einer heute gültigen Antwort ändert sich nichts.** Die Reparatur
 *    läuft erst NACH einem gescheiterten `JSON.parse`; `repaired` darf hier
 *    nie wahr werden.
 */

const appConfig = { pukalani: { ai: { enabled: true, model: 'test/model', baseUrl: 'https://openrouter.test/api/v1' } } }
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'test-key' }))

const { AI_TRUNCATED_CODE, aiCompleteDetailed, aiCompleteJson, aiCompleteJsonDetailed } = await import('../server/utils/aiComplete')

const event = {} as H3Event

/** Eine Anbieter-Antwort, wie OpenRouter sie schickt. */
function reply(content: string, finishReason = 'stop', completionTokens = 1234, promptTokens = 567): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  }), { status: 200 })))
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

interface Draft { title: string, dek: string, body: string }

describe('aiCompleteJson — die gerettete Antwort (BI4)', () => {
  it('liest einen Entwurf mit `„Adidas"` statt ihn zu verwerfen', async () => {
    // Wörtlich aus einem echten Lauf vom 2026-11-08.
    const body = 'In elf von vierzehn Einstellungen steht das Symbol allein im Bild. Die Wortmarke „Adidas" erscheint ausschließlich im Abspann.'
    reply(`{"title": "Das Symbol trägt allein", "dek": "Ein Vorspann.", "body": "${body}"}`)

    const result = await aiCompleteJson<Draft>(event, 'prompt')
    expect(result.body).toBe(body)
    expect(result.title).toBe('Das Symbol trägt allein')
  })

  it('schreibt eine Warnung, wenn repariert wurde — die Zahl will man sehen', async () => {
    reply('{"body": "das Wort „Nike" allein"}')
    await aiCompleteJson(event, 'prompt')
    expect(console.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('erst nach Reparatur')
  })

  it('lässt eine gültige Antwort unangetastet und warnt NICHT', async () => {
    reply(JSON.stringify({ title: 'T', dek: 'D', body: 'Ein „typografisch" sauberer Text.' }))
    const result = await aiCompleteJson<Draft>(event, 'prompt')
    expect(result).toEqual({ title: 'T', dek: 'D', body: 'Ein „typografisch" sauberer Text.' })
    expect(console.warn).not.toHaveBeenCalled()
  })
})

describe('aiCompleteJson — die abgeschnittene Antwort', () => {
  it('nennt `ai_truncated` statt „kein JSON", wenn die Decke gerissen ist', async () => {
    reply('{"title": "Anfang", "body": "Der Text bricht mitten', 'length', 8000)

    await expect(aiCompleteJson(event, 'prompt')).rejects.toMatchObject({
      statusCode: 502,
      statusText: 'AI response truncated',
      data: { code: AI_TRUNCATED_CODE },
    })
  })

  it('loggt dabei die Tokenzahl — sie erklärt die Rechnung', async () => {
    reply('{"body": "abgeschnitten', 'length', 15_400)
    await expect(aiCompleteJson(event, 'prompt')).rejects.toThrow()
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain('15400')
  })

  it('nimmt eine Antwort an, die TROTZ `length` gültig ist', async () => {
    // Das Modell hat genau an der Decke aufgehört und der Satz war fertig.
    // Gerettet wird, was parsbar ist — der Grund des Aufhörens erklärt nur
    // einen Fehlschlag, er erzeugt keinen.
    reply('{"body": "gerade noch fertig geworden"}', 'length', 8000)
    await expect(aiCompleteJson<{ body: string }>(event, 'prompt')).resolves.toEqual({ body: 'gerade noch fertig geworden' })
  })

  it('bleibt bei „kein JSON", wenn das Modell einfach nichts Brauchbares schrieb', async () => {
    reply('Ich kann diese Anfrage nicht bearbeiten.', 'stop')
    await expect(aiCompleteJson(event, 'prompt')).rejects.toMatchObject({
      statusCode: 502,
      statusText: 'AI returned no JSON',
    })
  })
})

describe('aiCompleteDetailed — die Nebendaten kommen überhaupt an', () => {
  it('gibt finish_reason und Tokenzahl heraus', async () => {
    reply('Text', 'length', 4321, 765)
    await expect(aiCompleteDetailed(event, 'prompt')).resolves.toEqual({
      content: 'Text',
      finishReason: 'length',
      promptTokens: 765,
      completionTokens: 4321,
    })
  })

  it('verträgt eine Antwort ohne usage und ohne finish_reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'nur Text' } }],
    }), { status: 200 })))
    await expect(aiCompleteDetailed(event, 'prompt')).resolves.toEqual({
      content: 'nur Text',
      finishReason: '',
      promptTokens: 0,
      completionTokens: 0,
    })
  })
})

/**
 * DIE ZAHLEN AM ERFOLGREICHEN LAUF (2026-11-09).
 *
 * Bis hierher konnte nur ein GESCHEITERTER Lauf sagen, was er verbraucht hat
 * — und der ist der seltene Fall. Die Gegenprobe gehört dazu: `aiCompleteJson`
 * darf von dieser Erweiterung NICHTS mitbekommen, sonst wandert sie durch
 * jeden anderen Konsumenten (Triage, Assist, Übersetzung, Brand-Wizard).
 */
describe('aiCompleteJsonDetailed — was der Lauf verbraucht hat', () => {
  it('liefert die Daten UND beide Tokenzahlen', async () => {
    reply(JSON.stringify({ body: 'fertig' }), 'stop', 1100, 2400)
    await expect(aiCompleteJsonDetailed<{ body: string }>(event, 'prompt')).resolves.toEqual({
      value: { body: 'fertig' },
      finishReason: 'stop',
      promptTokens: 2400,
      completionTokens: 1100,
    })
  })

  it('zählt auch den Lauf, der erst nach der Reparatur JSON war', async () => {
    reply('{"body": "das Wort „Nike" allein"}', 'stop', 42, 99)
    const result = await aiCompleteJsonDetailed<{ body: string }>(event, 'prompt')
    expect(result.completionTokens).toBe(42)
    expect(result.promptTokens).toBe(99)
  })

  it('nennt `0`, wenn der Anbieter keine Zahlen schickt — nicht `undefined`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"body": "ohne usage"}' }, finish_reason: 'stop' }],
    }), { status: 200 })))
    await expect(aiCompleteJsonDetailed(event, 'prompt')).resolves.toEqual({
      value: { body: 'ohne usage' },
      finishReason: 'stop',
      promptTokens: 0,
      completionTokens: 0,
    })
  })

  it('GEGENPROBE: `aiCompleteJson` gibt weiter NUR die Daten heraus', async () => {
    reply(JSON.stringify({ body: 'fertig' }), 'stop', 1100, 2400)
    await expect(aiCompleteJson<{ body: string }>(event, 'prompt')).resolves.toEqual({ body: 'fertig' })
  })
})
