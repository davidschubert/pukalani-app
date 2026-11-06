import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER BILD-TRANSPORT (`server/utils/aiImage.ts`, Brand Design D5c) — geprüft
 * wird der tatsächlich ABGESCHICKTE Body und die Klemmung der Antwort, nicht
 * der Aufruf.
 *
 * Vier Zusagen, die keine Typ-Deklaration halten kann:
 *
 *  1. REQUEST-FORM: `/chat/completions` mit `modalities: ['image','text']` —
 *     der einzige Weg, auf dem OpenRouter die Datenschutz-Bedingung überhaupt
 *     annimmt (Begründung im Kopf des Transports: das Routing-Objekt des
 *     dedizierten Bild-Endpunkts kennt `data_collection` nicht).
 *  2. DIE ZDR-KLEMME: `provider.data_collection === 'deny'` steht IMMER da,
 *     auch ohne Option und auch dann, wenn der Aufrufer ausdrücklich etwas
 *     anderes übergibt. Mit GEGENPROBE.
 *  3. GATE AUS ⇒ KEIN NETZ: ohne `pukalani.ai.imageModel` fliegt eine 503,
 *     BEVOR `fetch` gerufen wird.
 *  4. ANTWORT-KLEMMUNG: nur PNG/JPEG/WebP als `data:`-URI, höchstens 2 MB je
 *     Bild, höchstens vier Stück — alles andere fällt weg. Diese Bytes landen
 *     in einem Bucket und später in einem Browser.
 */
const appConfig: { pukalani: { ai: Record<string, unknown> } } = {
  pukalani: { ai: { enabled: false, imageModel: 'test/image', baseUrl: 'https://openrouter.test/api/v1' } },
}
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'k-test', public: { appwriteDatabaseId: 'db' } }))

/**
 * Die `app_config`-Zeile ist HIER umschaltbar, weil zwei Zusagen an ihr
 * hängen: der Laufzeit-Override (`aiImageModel`) und die Zusage, dass ein
 * LESEFEHLER kein Fehler ist, sondern der Build-Default. Der Default bleibt
 * der Wurf — so misst jeder bestehende Fall unverändert den Build-Stand.
 */
let appConfigRow: Record<string, unknown> | Error = new Error('kein app_config in diesem Test')
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: {
    getRow: async () => {
      if (appConfigRow instanceof Error) throw appConfigRow
      return appConfigRow
    },
  },
}))
vi.stubGlobal('resolveAiKey', async () => 'k-test')

const {
  AI_IMAGE_MAX_BYTES,
  aiImage,
  buildAiImageRequestBody,
  clampAiImages,
  getAiImageConfig,
  getEffectiveAiImageConfig,
  isAiImageConfigured,
  parseAiImageDataUrl,
} = await import('../server/utils/aiImage')

const event = {} as H3Event

/** Ein winziges, gültiges PNG-Byte-Muster — es muss nur dekodierbar sein. */
const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02])
const pngUrl = `data:image/png;base64,${pngBytes.toString('base64')}`

function imageMessage(urls: string[]) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      choices: [{ message: { content: 'hier sind die Entwürfe', images: urls.map(url => ({ image_url: { url } })) } }],
    }),
  }
}

const fetchMock = vi.fn(async () => imageMessage([pngUrl]))
vi.stubGlobal('fetch', fetchMock)

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as unknown as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

beforeEach(() => {
  fetchMock.mockClear()
  appConfigRow = new Error('kein app_config in diesem Test')
  fetchMock.mockImplementation(async () => imageMessage([pngUrl]))
  appConfig.pukalani.ai = {
    enabled: false,
    imageModel: 'test/image',
    baseUrl: 'https://openrouter.test/api/v1',
  }
})

describe('buildAiImageRequestBody', () => {
  it('verlangt BILD-Ausgabe über `modalities` — sonst wäre es ein Text-Aufruf', () => {
    const body = buildAiImageRequestBody({ model: 'm', prompt: 'ein Zeichen' })
    expect(body.modalities).toEqual(['image', 'text'])
    expect(body.messages).toEqual([{ role: 'user', content: 'ein Zeichen' }])
  })

  it('stellt ein System-Prompt VOR den Zug und lässt ihn sonst weg', () => {
    const withSystem = buildAiImageRequestBody({ model: 'm', prompt: 'p', system: 'S' })
    expect((withSystem.messages as { role: string }[])[0]!.role).toBe('system')
    expect((buildAiImageRequestBody({ model: 'm', prompt: 'p' }).messages as unknown[])).toHaveLength(1)
  })

  it('ZDR: `data_collection: "deny"` steht auch OHNE providerRouting da', () => {
    expect(buildAiImageRequestBody({ model: 'm', prompt: 'p' }).provider)
      .toEqual({ data_collection: 'deny' })
  })

  it('GEGENPROBE: ein übergebenes `dataCollection: "allow"` wird überschrieben', () => {
    const body = buildAiImageRequestBody({
      model: 'm',
      prompt: 'p',
      providerRouting: { dataCollection: 'allow', zdr: true, allowFallbacks: false, only: ['a'] },
    })
    expect(body.provider).toEqual({
      zdr: true,
      only: ['a'],
      allow_fallbacks: false,
      data_collection: 'deny',
    })
  })

  it('ein eigener Token-Deckel — ein Bild kostet Ausgabe-Tokens', () => {
    expect(buildAiImageRequestBody({ model: 'm', prompt: 'p' }).max_tokens).toBe(8000)
  })
})

describe('parseAiImageDataUrl', () => {
  it('nimmt PNG, JPEG und WebP als `data:`-URI', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      const parsed = parseAiImageDataUrl(`data:${mime};base64,${pngBytes.toString('base64')}`)
      expect(parsed?.mime).toBe(mime)
      expect(Buffer.from(parsed!.bytes)).toEqual(pngBytes)
    }
  })

  it('GEGENPROBE: eine http-Adresse wird NICHT geholt, sondern verworfen', () => {
    expect(parseAiImageDataUrl('https://beispiel.test/logo.png')).toBeNull()
  })

  it('GEGENPROBE: ein fremder Typ (SVG) fällt durch', () => {
    expect(parseAiImageDataUrl(`data:image/svg+xml;base64,${pngBytes.toString('base64')}`)).toBeNull()
  })

  it('GEGENPROBE: mehr als 2 MB fallen durch', () => {
    const big = Buffer.alloc(AI_IMAGE_MAX_BYTES + 1, 0x41)
    expect(parseAiImageDataUrl(`data:image/png;base64,${big.toString('base64')}`)).toBeNull()
  })

  it('GEGENPROBE: leere Bytes und Nicht-Zeichenketten fallen durch', () => {
    expect(parseAiImageDataUrl('data:image/png;base64,')).toBeNull()
    expect(parseAiImageDataUrl(null)).toBeNull()
    expect(parseAiImageDataUrl({ url: pngUrl })).toBeNull()
  })
})

describe('clampAiImages', () => {
  it('nimmt höchstens vier Bilder — auch wenn das Modell mehr schickt', () => {
    const many = Array.from({ length: 9 }, () => ({ image_url: { url: pngUrl } }))
    expect(clampAiImages(many)).toHaveLength(4)
  })

  it('ein kaputtes Bild macht den Lauf nicht wertlos — die guten bleiben', () => {
    expect(clampAiImages([
      { image_url: { url: 'https://beispiel.test/x.png' } },
      { image_url: { url: pngUrl } },
      { nichts: true },
    ])).toHaveLength(1)
  })

  it('keine Liste ⇒ keine Bilder', () => {
    expect(clampAiImages(undefined)).toEqual([])
    expect(clampAiImages('data:image/png;base64,AAAA')).toEqual([])
  })
})

describe('getAiImageConfig', () => {
  it('leeres Modell = aus (Core-Default)', () => {
    appConfig.pukalani.ai = { imageModel: '' }
    expect(getAiImageConfig().enabled).toBe(false)
  })

  it('gesetztes Modell = an, unabhängig von `pukalani.ai.enabled`', () => {
    appConfig.pukalani.ai = { enabled: false, imageModel: 'x/y' }
    expect(getAiImageConfig()).toMatchObject({ enabled: true, model: 'x/y' })
  })

  it('schneidet den trailing Slash der Basis-URL ab', () => {
    appConfig.pukalani.ai = { imageModel: 'x/y', baseUrl: 'https://h.test/api/v1/' }
    expect(getAiImageConfig().baseUrl).toBe('https://h.test/api/v1')
  })
})

describe('isAiImageConfigured', () => {
  it('ohne Modell: false — und der Anbieter wird nicht gefragt', async () => {
    appConfig.pukalani.ai = { imageModel: '' }
    expect(await isAiImageConfigured(event)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mit Modell und Schlüssel: true', async () => {
    expect(await isAiImageConfigured(event)).toBe(true)
  })
})

describe('aiImage', () => {
  it('schickt Modell, Schlüssel und den geklemmten Body an /chat/completions', async () => {
    const images = await aiImage(event, 'ein ruhiges Zeichen', { label: 'brand-drafts' })
    expect(images).toHaveLength(1)
    expect(images[0]!.mime).toBe('image/png')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://openrouter.test/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer k-test')
    expect(sentBody().provider).toEqual({ data_collection: 'deny' })
  })

  it('GATE AUS: ohne Modell 503 — und KEIN Netzaufruf', async () => {
    appConfig.pukalani.ai = { imageModel: '' }
    await expect(aiImage(event, 'p')).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ohne Prompt: 400, ebenfalls ohne Netzaufruf', async () => {
    await expect(aiImage(event, '   ')).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('nur Text zurück ⇒ leere Liste, kein Wurf — das beurteilt der Aufrufer', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'ich kann das nicht zeichnen' } }] }),
    }) as never)
    expect(await aiImage(event, 'p')).toEqual([])
  })

  it('Anbieter-Fehler ⇒ 502', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
      json: async () => ({}),
    }) as never)
    await expect(aiImage(event, 'p')).rejects.toMatchObject({ statusCode: 502 })
  })

  /**
   * DER RUMPF DES ANBIETERS BLEIBT DRAUSSEN (Audit-Befund 2026-09-09): er
   * zitiert je nach Anbieter die Anfrage zurück, und die trägt hier den
   * Prompt — also Kundeninhalte. Ins Log gehören Status und Kennung.
   */
  it('im Log stehen Status + Kennung statt des Rumpfes', async () => {
    const logged: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: { code: 'invalid_request_error', message: 'prompt war: GEHEIM' },
      }),
      json: async () => ({}),
    }) as never)
    await expect(aiImage(event, 'p', { label: 'test' })).rejects.toMatchObject({ statusCode: 502 })
    spy.mockRestore()
    expect(logged.join('\n')).toContain('400 (invalid_request_error)')
    expect(logged.join('\n')).not.toContain('GEHEIM')
  })

  /**
   * GATE UND AUFRUF LESEN DIESELBE QUELLE (Audit-Befund 2026-09-09) — dieselbe
   * Begründung wie beim Vision-Transport.
   */
  it('ohne `options.model` gilt der Laufzeit-Override, nicht der Build-Default', async () => {
    appConfig.pukalani.ai = { imageModel: '', baseUrl: 'https://openrouter.test/api/v1' }
    appConfigRow = { $id: 'global', aiImageModel: 'runtime/image' }
    expect(await isAiImageConfigured(event)).toBe(true)
    await aiImage(event, 'p')
    expect(sentBody().model).toBe('runtime/image')
  })

  it('mit `options.model` bleibt die Wahl des Aufrufers stehen', async () => {
    appConfigRow = { $id: 'global', aiImageModel: 'runtime/image' }
    await aiImage(event, 'p', { model: 'caller/image' })
    expect(sentBody().model).toBe('caller/image')
  })
})

describe('getEffectiveAiImageConfig', () => {
  it('Zeile OHNE Feld ⇒ Build-Default (die Spalte gibt es noch nirgends)', async () => {
    appConfigRow = { $id: 'global' }
    const config = await getEffectiveAiImageConfig(event)
    expect(config.model).toBe('test/image')
    expect(config.defaultModel).toBe('test/image')
    expect(config.enabled).toBe(true)
  })

  it('leeres Feld zählt als „nicht gesetzt", nicht als Abschaltung', async () => {
    appConfigRow = { $id: 'global', aiImageModel: '   ' }
    expect((await getEffectiveAiImageConfig(event)).model).toBe('test/image')
  })

  it('`getRow` wirft ⇒ Build-Default statt Fehler (best-effort)', async () => {
    appConfigRow = new Error('Appwrite gerade nicht erreichbar')
    const config = await getEffectiveAiImageConfig(event)
    expect(config.model).toBe('test/image')
    expect(config.enabled).toBe(true)
  })
})
