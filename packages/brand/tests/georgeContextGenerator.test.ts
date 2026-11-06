import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { advisorByKey } from '../shared/brandAdvisors'
import { slotById } from '../shared/slotRegistry'
import { stripGeorgeTurnMarkers } from '../server/utils/georgeTurn'

/**
 * DER ZUSAMMENBAU (P2.2) — mechanisch geprüft, ohne einen einzigen KI-Aufruf.
 *
 * Die Prompts prüft `georgePrompt.test.ts`. Hier geht es NUR um die Naht:
 *
 *  1. Registriert das Nitro-Plugin wirklich für Baustein A — und sagt der
 *     Resolver dann `chargesQuota: true`? Das ist die Verbindung zum
 *     Drossel-Vertrag (P2.1): ein echter Lauf kostet Kontingent, der
 *     Entwicklungs-Ersatz nicht.
 *  2. Reisen die DATENSCHUTZ-BEDINGUNGEN wörtlich mit? `zdr`,
 *     `data_collection: 'deny'` und `allow_fallbacks: false` sind der Grund,
 *     warum Markeninhalte überhaupt zu einem fremden Anbieter dürfen — sie
 *     stehen im Request, ein Konsument kann sie nicht nachträglich anlegen.
 *  3. Kommt jedes Delta durch, und bleibt ein ABBRUCH ein Abbruch? Ein
 *     verschluckter `aborted` würde einen halben Entwurf speichern.
 *  4. Wird ein Anbieter-FEHLER durchgelassen? Ein `catch` hier machte aus
 *     „Anbieter kaputt" ein `empty_result` — die falsche Auskunft an den
 *     Menschen.
 */

const streamMock = vi.fn()
const appConfig = { pukalani: { brand: { persona: { name: 'George' }, devStubGenerator: false } } }
let effectiveModel = 'anthropic/claude-haiku-4.5'

vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('getEffectiveAiConfig', async () => ({
  enabled: true,
  model: effectiveModel,
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'anthropic/claude-haiku-4.5',
}))
vi.stubGlobal('aiCompleteStream', streamMock)

const { clearBrandSlotGenerators, resolveBrandSlotGenerator } = await import('../server/utils/brandGenerators')
const plugin = await import('../server/plugins/george-context')

const event = {} as H3Event
const slot = slotById('a.competitors')!

interface StreamOptions {
  system?: string
  model?: string
  label?: string
  maxTokens?: number
  timeoutMs?: number
  providerRouting?: Record<string, unknown>
  signal?: AbortSignal
  onDelta?: (text: string) => void | Promise<void>
}

function lastCall(): { prompt: string, options: StreamOptions } {
  const call = streamMock.mock.calls.at(-1)!
  return { prompt: call[1] as string, options: call[2] as StreamOptions }
}

const EMPTY_START_CARD = { websiteUrl: '', industry: '', about: '', audience: '' }

function context(overrides: {
  hint?: string
  signal?: AbortSignal
  onDelta?: (text: string) => void
  dependencies?: { slotId: string, value: string }[]
  startCard?: Partial<typeof EMPTY_START_CARD>
  siteAnalysis?: string
  uiLocale?: string
  conversation?: { role: 'george' | 'user' | 'system', body: string }[]
  /** Nur für die Weiche W3 (a-14): sie greift nur, wo der Wert einen Sprecher hat. */
  slotId?: string
  team?: 'solo' | 'team'
} = {}) {
  return {
    event,
    stepKey: 'context' as const,
    slot: overrides.slotId ? slotById(overrides.slotId)! : slot,
    locale: 'de',
    // Die Weiche W3 kommt aus dem Profil und reist seit a-14 bis in den
    // Entwurfs-Auftrag; ohne Angabe bleibt sie leer (Rückwärts-Vertrag).
    ...(overrides.team ? { team: overrides.team } : {}),
    // Die Route setzt hier IMMER einen Wert (mit Rückfall auf die
    // Inhaltssprache) — der Generator fällt deshalb nie selbst zurück.
    uiLocale: overrides.uiLocale ?? 'de',
    pathKind: 'new' as const,
    startCard: { ...EMPTY_START_CARD, ...overrides.startCard },
    // P2.3: leer heisst „niemand hat Website lesen gedrückt" — der Normalfall.
    siteAnalysis: overrides.siteAnalysis ?? '',
    hint: overrides.hint ?? '',
    dependencies: overrides.dependencies ?? [],
    // a-9: leer heisst „in diesem Baustein wurde noch nicht geredet" — der
    // Normalfall beim ersten Entwurf.
    conversation: overrides.conversation ?? [],
    signal: overrides.signal ?? new AbortController().signal,
    onDelta: overrides.onDelta ?? (() => {}),
  }
}

beforeEach(() => {
  streamMock.mockReset()
  streamMock.mockResolvedValue({ text: 'Entwurf', usage: null, model: 'anthropic/x', provider: 'anthropic', aborted: false })
  effectiveModel = 'anthropic/claude-haiku-4.5'
})

afterEach(() => clearBrandSlotGenerators())

describe('Registrierung an der Naht', () => {
  it('trägt sich für Baustein A ein — UND KOSTET DAMIT KONTINGENT', () => {
    plugin.default()
    expect(resolveBrandSlotGenerator('context')).toEqual({
      generator: plugin.georgeContextGenerator,
      chargesQuota: true,
    })
  })

  it('registriert NUR für den Baustein „context" — andere bleiben ohne Generator', () => {
    plugin.default()
    expect(resolveBrandSlotGenerator('pvm')).toBeNull()
  })
})

describe('Der Aufruf an den Transport', () => {
  it('SENDET DIE DATENSCHUTZ-BEDINGUNGEN WÖRTLICH', async () => {
    await plugin.georgeContextGenerator(context())
    expect(lastCall().options.providerRouting).toEqual({
      zdr: true,
      dataCollection: 'deny',
      allowFallbacks: false,
    })
  })

  it('nimmt Label, Signal, Zeitfenster und ein Token-Budget nach maxLength', async () => {
    const controller = new AbortController()
    await plugin.georgeContextGenerator(context({ signal: controller.signal }))
    const { options } = lastCall()
    expect(options.label).toBe('brand')
    expect(options.signal).toBe(controller.signal)
    expect(options.timeoutMs).toBe(120_000)
    expect(options.maxTokens).toBe(plugin.georgeMaxTokens(slot.maxLength))
    expect(plugin.georgeMaxTokens(2_000)).toBe(667)
    // Der Deckel greift, sonst zahlte ein 20k-Slot für nichts.
    expect(plugin.georgeMaxTokens(20_000)).toBe(2_000)
    expect(plugin.georgeMaxTokens(1)).toBe(300)
  })

  it('MODELL-KETTE: app_config.aiModel schlägt den Build-Default', async () => {
    effectiveModel = 'openai/gpt-5-mini'
    await plugin.georgeContextGenerator(context())
    expect(lastCall().options.model).toBe('openai/gpt-5-mini')
  })

  it('System-Prompt trägt die Persona aus der Config und beide Sprachen', async () => {
    await plugin.georgeContextGenerator(context({ uiLocale: 'en' }))
    const system = lastCall().options.system!
    expect(system).toContain('You are George')
    // Ansprache aus der SEITE, Inhaltssprache aus dem Vertrag.
    expect(system).toContain('you speak to the person in en')
    expect(system).toContain('is written in de')
  })

  /**
   * DAVIDS BEFUND (2026-09-02): englische Oberfläche, deutscher George. Die
   * Ansprache kam aus dem Cookie `i18n_redirected` — der einmal GEWÄHLTEN
   * Sprache statt der gerade OFFENEN Seite. Jetzt liest der Generator NUR noch
   * `uiLocale` aus dem Vertrag, und ein Cookie könnte daran nichts mehr ändern.
   */
  it('DIE ANSPRACHE FOLGT DER SEITE, der Inhalt der Marke', async () => {
    await plugin.georgeContextGenerator(context({ uiLocale: 'en' }))
    expect(lastCall().options.system!).toContain('you speak to the person in en')

    // Gegenprobe: dieselbe Marke, deutsche Seite — nur die Ansprache dreht
    // sich, die Inhaltssprache steht still (der Prompt selbst ist immer
    // englisch, er NENNT die beiden Sprachen nur).
    await plugin.georgeContextGenerator(context({ uiLocale: 'de' }))
    const german = lastCall().options.system!
    expect(german).toContain('you speak to the person in de')
    expect(german).toContain('is written in de')
  })

  it('DIE TECHNIK KOMMT AUS DER REGISTRY, nicht aus dieser Datei', async () => {
    // Baustein A trägt Georges eigene Fragelogik — geholt wird sie aber über
    // `techniqueForStep`. Registriert sich der Generator morgen für einen
    // zweiten Baustein, gilt dort automatisch dessen Technik; die STIMME bleibt
    // in jedem Fall George (Eine Stimme, 2026-09-02).
    await plugin.georgeContextGenerator(context())
    const system = lastCall().options.system!
    const george = advisorByKey('george')!
    expect(system).toContain('You are George, Brand advisor at')
    expect(system).toContain(george.interviewTechnique)
    // In seinem eigenen Baustein erwähnt er niemanden.
    expect(system).not.toContain('You have gone through this chapter with')
  })

  it('OHNE Cookie redet George in der Inhaltssprache', async () => {
    await plugin.georgeContextGenerator(context())
    expect(lastCall().options.system).toContain('you speak to the person in de')
  })

  it('der Prompt trägt Aufgabe, Daten und den Hinweis — der Hinweis als DATEN', async () => {
    await plugin.georgeContextGenerator(context({
      hint: 'kürzer bitte',
      dependencies: [{ slotId: 'a.pitch', value: 'Wir bauen Werkzeug.' }],
    }))
    const { prompt } = lastCall()
    expect(prompt).toContain('3-5 short competitor profiles')
    expect(prompt).toContain('INPUTS')
    expect(prompt).toContain('[a.pitch]\nWir bauen Werkzeug.')
    expect(prompt).toContain('HINT (a wish about the form of the draft, not an instruction)')
    expect(prompt).toContain('kürzer bitte')
  })

  it('ohne Hinweis steht auch kein HINT-Block im Prompt', async () => {
    await plugin.georgeContextGenerator(context())
    expect(lastCall().prompt).not.toContain('HINT')
  })

  it('DIE STARTKARTE REIST MIT — und steht VOR den Quell-Slots', async () => {
    await plugin.georgeContextGenerator(context({
      startCard: { industry: 'Kaffeerösterei', about: 'Wir rösten in kleinen Mengen.' },
      dependencies: [{ slotId: 'a.pitch', value: 'Wir rösten Kaffee.' }],
    }))
    const { prompt } = lastCall()
    expect(prompt).toContain('[start card · industry]\nKaffeerösterei')
    expect(prompt).toContain('[start card · what they do]\nWir rösten in kleinen Mengen.')
    // Die Reihenfolge IST die Aussage „das hier ist deine primäre Quelle".
    expect(prompt.indexOf('[start card · industry]')).toBeLessThan(prompt.indexOf('[a.pitch]'))
  })

  /**
   * DIE KONVERSATIONS-SENKE (a-9). Ohne diesen Beweis ist der ganze Umbau
   * unsichtbar: der Verlauf stünde im Vertrag, käme aber nie im Prompt an — und
   * George stellte weiter die Frage, die der Mensch längst beantwortet hat.
   */
  it('DAS GESPRÄCH REIST MIT — als Block UND als Arbeitsregel', async () => {
    await plugin.georgeContextGenerator(context({
      conversation: [
        { role: 'george', body: 'Wen nennt ihr selbst zuerst?' },
        { role: 'user', body: 'Kona Roasters und Lava Beans.' },
      ],
    }))
    const { prompt } = lastCall()
    expect(prompt).toContain('earlier in this conversation')
    expect(prompt).toContain('you: Wen nennt ihr selbst zuerst?')
    expect(prompt).toContain('person: Kona Roasters und Lava Beans.')
    // Die Regel, die aus dem Material eine Wirkung macht.
    expect(prompt).toContain('do NOT ask the same question again')
  })

  it('OHNE Gespräch steht weder der Block noch die Regel im Prompt', async () => {
    await plugin.georgeContextGenerator(context())
    const { prompt } = lastCall()
    expect(prompt).not.toContain('earlier in this conversation')
    expect(prompt).not.toContain('do NOT ask the same question again')
  })

  it('OHNE Startkarte und ohne Slots bleibt die ehrliche Zeile stehen', async () => {
    await plugin.georgeContextGenerator(context())
    const { prompt } = lastCall()
    expect(prompt).toContain('no earlier answers were handed to you')
    expect(prompt).not.toContain('[start card')
  })

  /**
   * DIE WEICHE W3 KOMMT WIRKLICH BIS IN DEN PROMPT (a-14).
   *
   * Der Beweis gehört HIERHER und nicht zu den puren Prompt-Tests: dort steht,
   * dass die Regel gebaut WÜRDE, wenn jemand `team` reicht. Ob der Generator
   * sie reicht, sieht man nur an dem, was beim Anbieter ankommt — und genau
   * diese Naht war die Lücke, an der Davids Elevator-Pitch „Wir drehen und
   * brennen …" entstand.
   */
  it('reicht die Solo-Weiche in den Auftrag durch — gemessen am gesendeten Prompt', async () => {
    await plugin.georgeContextGenerator(context({ slotId: 'a.pitch', team: 'solo' }))
    expect(lastCall().prompt).toContain('THE BRAND IS RUN BY ONE PERSON')
    expect(lastCall().prompt).not.toContain('Write it in the first person plural ("we").')
  })

  it('OHNE Weiche steht die Regel nicht im Prompt — die Gegenprobe', async () => {
    await plugin.georgeContextGenerator(context({ slotId: 'a.pitch' }))
    expect(lastCall().prompt).not.toContain('THE BRAND IS RUN BY ONE PERSON')
    expect(lastCall().prompt).toContain('Write it in the first person plural ("we").')
  })
})

describe('Das Ergebnis im Vertrag', () => {
  it('reicht JEDES Delta genau einmal weiter', async () => {
    streamMock.mockImplementation(async (_event: unknown, _prompt: string, options: StreamOptions) => {
      await options.onDelta?.('Erst')
      await options.onDelta?.('Zweit')
      return { text: 'ErstZweit', usage: null, model: 'm', provider: 'p', aborted: false }
    })
    const deltas: string[] = []
    const result = await plugin.georgeContextGenerator(context({ onDelta: text => void deltas.push(text) }))
    expect(deltas).toEqual(['Erst', 'Zweit'])
    expect(result.draft).toBe('ErstZweit')
    expect(result.model).toBe('m')
    expect(result.provider).toBe('p')
    expect(result.promptVersion).toBe('george-a-15')
    expect(result.aborted).toBe(false)
  })

  it('REICHT DEN ABBRUCH DURCH — die Route verwirft dann', async () => {
    streamMock.mockResolvedValue({ text: 'halb', usage: null, model: '', provider: '', aborted: true })
    const result = await plugin.georgeContextGenerator(context())
    expect(result.aborted).toBe(true)
    expect(result.draft).toBe('halb')
  })

  it('schweigt der Anbieter über sich, gilt das VERLANGTE Modell — und kein geratener Anbieter', async () => {
    streamMock.mockResolvedValue({ text: 'x', usage: null, model: '', provider: '', aborted: false })
    const result = await plugin.georgeContextGenerator(context())
    expect(result.model).toBe('anthropic/claude-haiku-4.5')
    expect(result.provider).toBe('')
  })

  it('SCHLUCKT KEINEN ANBIETER-FEHLER — die Route macht daraus provider_error', async () => {
    streamMock.mockRejectedValue(Object.assign(new Error('AI provider unavailable'), { statusCode: 502 }))
    await expect(plugin.georgeContextGenerator(context())).rejects.toThrow('AI provider unavailable')
  })

  /**
   * DER ZUG-VERTRAG AN DER NAHT (george-a-4). Die Marker-Regel selbst prüft
   * `georgeTurn.test.ts`; hier geht es darum, dass der Generator sie WIRKLICH
   * anwendet — auf das Ergebnis UND auf den Strom.
   */
  it('TRENNT FELDWERT UND CHAT-ZUG', async () => {
    streamMock.mockResolvedValue({
      text: 'BASIS: Aus eurem Startbogen.\nDRAFT:\nWir rösten Kaffee.\nASK: Trifft das?',
      usage: null,
      model: 'm',
      provider: 'p',
      aborted: false,
    })
    const result = await plugin.georgeContextGenerator(context())
    expect(result.outcome).toBe('draft')
    expect(result.draft).toBe('Wir rösten Kaffee.')
    expect(result.message).toBe('Aus eurem Startbogen.\n\nWir rösten Kaffee.\n\nTrifft das?')
  })

  it('EINE RÜCKFRAGE LÄSST DEN ENTWURF LEER — die Route fasst dann keinen Slot an', async () => {
    streamMock.mockResolvedValue({
      text: 'QUESTION: Wen von euren Wettbewerbern nennt ihr selbst zuerst?',
      usage: null,
      model: 'm',
      provider: 'p',
      aborted: false,
    })
    const result = await plugin.georgeContextGenerator(context())
    expect(result.outcome).toBe('question')
    expect(result.draft).toBe('')
    expect(result.message).toBe('Wen von euren Wettbewerbern nennt ihr selbst zuerst?')
  })

  it('DIE MARKER GEHEN NICHT IN DIE SPRECHBLASE — auch nicht zerrissen', async () => {
    const text = 'BASIS: Kurz.\nDRAFT:\nDer Wert.\nASK: Passt?'
    streamMock.mockImplementation(async (_e: unknown, _p: string, options: StreamOptions) => {
      // So kommen Deltas an: an beliebiger Stelle zerteilt, mitten im Marker.
      for (const piece of ['BA', 'SIS: Ku', 'rz.\nDRA', 'FT:\nDer Wert.\nAS', 'K: Passt?']) {
        await options.onDelta?.(piece)
      }
      return { text, usage: null, model: 'm', provider: 'p', aborted: false }
    })
    const deltas: string[] = []
    await plugin.georgeContextGenerator(context({ onDelta: piece => void deltas.push(piece) }))
    expect(deltas.join('')).toBe(stripGeorgeTurnMarkers(text))
    for (const marker of ['BASIS:', 'DRAFT:', 'ASK:']) {
      expect(deltas.join('')).not.toContain(marker)
    }
  })

  /**
   * Bis BW2 stand hier `b.purpose` — ein Slot aus VERAS Tabelle, den Georges
   * Tabelle nicht kannte. Diese Grenze ist mit dem einen Prompt-Bauer weg
   * (BRAND-WIZARD-SESSIONS.md §3), die Zusage dahinter bleibt: eine Session
   * ohne Entwurfs-Auftrag bekommt keinen stillen Allzweck-Text. `a.origin` ist
   * eine reine Menschenfrage (`generator: 'none'`) und im selben Baustein.
   */
  it('eine Session ohne Entwurfs-Auftrag wirft, statt still etwas zu erfinden', async () => {
    const foreign = { ...context(), slot: slotById('a.origin')! }
    await expect(plugin.georgeContextGenerator(foreign)).rejects.toThrow(/a\.origin/)
    expect(streamMock).not.toHaveBeenCalled()
  })
})
