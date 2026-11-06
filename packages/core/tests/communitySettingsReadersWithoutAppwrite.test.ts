import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { appwriteEndpointConfigured } from '../shared/appwriteConfigured'
import { createMicrocache } from '../server/utils/microcache'

/**
 * LESER OHNE APPWRITE-INSTANZ (Logbefund 2026-10-28, help.pukalani.app).
 *
 * Die pure Regel (`appwriteEndpointConfigured`) und das Verhalten der beiden
 * optionalen Leser `readCommunitySeo` / `readCommunityRedirects`. Die Nitro-
 * Auto-Imports stehen als Globals gestubbt (Muster turnstile.test.ts);
 * `createAdminClient` ist die Attrappe des echten SDK-Verhaltens: am leeren
 * Endpunkt wirft `new Client().setEndpoint('')` „Endpoint must be a valid
 * string" — genau die Zeile, die sieben Wochen lang zweimal je Stunde im
 * pm2-Fehlerlog stand. Vor dem Fix war der erste Fall dieser Datei rot.
 */

describe('appwriteEndpointConfigured', () => {
  it('leer, Leerraum, fehlend ⇒ keine Instanz', () => {
    expect(appwriteEndpointConfigured('')).toBe(false)
    expect(appwriteEndpointConfigured('   ')).toBe(false)
    expect(appwriteEndpointConfigured(undefined)).toBe(false)
    expect(appwriteEndpointConfigured(null)).toBe(false)
  })
  it('ein gesetzter Endpunkt ⇒ Instanz', () => {
    expect(appwriteEndpointConfigured('https://api.pukalani.app/v1')).toBe(true)
  })
})

const runtime = { appwriteKey: '', public: { appwriteEndpoint: '', appwriteProjectId: '', appwriteDatabaseId: 'main' } }
const createAdminClient = vi.fn()
const logEvent = vi.fn()
let scope = 'single'
let readCommunitySeo: (event: object, communityId: string) => Promise<unknown>
let readCommunityRedirects: (event: object, communityId: string) => Promise<unknown>

/** Was das SDK am leeren Endpunkt tut — und was `setEndpoint('')` dem Leser beschert. */
function sdkEndpointRejection(): never {
  throw new Error('Endpoint must be a valid string')
}

beforeAll(async () => {
  vi.stubGlobal('useRuntimeConfig', () => runtime)
  vi.stubGlobal('createAdminClient', createAdminClient)
  vi.stubGlobal('logEvent', logEvent)
  vi.stubGlobal('createMicrocache', createMicrocache)
  vi.stubGlobal('tenantCacheScope', () => scope)
  const configured = await import('../server/utils/appwriteConfigured')
  vi.stubGlobal('appwriteConfigured', configured.appwriteConfigured)
  const seo = await import('../server/utils/communitySeoStore')
  const redirects = await import('../server/utils/communityRedirectStore')
  readCommunitySeo = seo.readCommunitySeo as unknown as typeof readCommunitySeo
  readCommunityRedirects = redirects.readCommunityRedirects as unknown as typeof readCommunityRedirects
})

afterAll(() => {
  vi.unstubAllGlobals()
})

let run = 0
beforeEach(() => {
  // Jeder Fall bekommt seinen eigenen Cache-Schlüssel — die Microcaches sind
  // modulweit, ein `null` aus dem Vorgänger-Fall würde sonst mitgelesen.
  scope = `single:${++run}`
  runtime.public.appwriteEndpoint = ''
  createAdminClient.mockReset()
  logEvent.mockClear()
})

describe('readCommunitySeo / readCommunityRedirects ohne Appwrite', () => {
  it('leerer Endpunkt (help): null, KEIN Client, KEINE Meldung', async () => {
    createAdminClient.mockImplementation(sdkEndpointRejection)
    expect(await readCommunitySeo({}, 'instance')).toBeNull()
    expect(await readCommunityRedirects({}, 'instance')).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('leerer Endpunkt: das null wird gecacht (kein zweiter Blick in die Config je Request)', async () => {
    const config = vi.fn(() => runtime)
    vi.stubGlobal('useRuntimeConfig', config)
    await readCommunitySeo({}, 'instance')
    await readCommunitySeo({}, 'instance')
    expect(config).toHaveBeenCalledTimes(1)
    vi.stubGlobal('useRuntimeConfig', () => runtime)
  })

  it('GEGENPROBE gesetzter Endpunkt, Zeile fehlt (404): null ohne Meldung — der Normalfall', async () => {
    runtime.public.appwriteEndpoint = 'https://api.pukalani.app/v1'
    createAdminClient.mockReturnValue({
      tablesDB: { getRow: async () => { throw Object.assign(new Error('Row not found'), { code: 404 }) } },
    })
    expect(await readCommunitySeo({}, 'instance')).toBeNull()
    expect(await readCommunityRedirects({}, 'instance')).toBeNull()
    expect(createAdminClient).toHaveBeenCalledTimes(2)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('GEGENPROBE gesetzter Endpunkt, Instanz nicht erreichbar: null MIT Meldung (Zertifikatsvorfall 2026-10-16…24)', async () => {
    runtime.public.appwriteEndpoint = 'https://api.pukalani.app/v1'
    createAdminClient.mockReturnValue({
      tablesDB: { getRow: async () => { throw new TypeError('fetch failed') } },
    })
    expect(await readCommunitySeo({}, 'instance')).toBeNull()
    expect(await readCommunityRedirects({}, 'instance')).toBeNull()
    expect(logEvent).toHaveBeenCalledWith('warn', 'community.seo_read_failed', { communityId: 'instance', message: 'fetch failed' })
    expect(logEvent).toHaveBeenCalledWith('warn', 'community.redirects_read_failed', { communityId: 'instance', message: 'fetch failed' })
  })

  it('GEGENPROBE gesetzter Endpunkt: die Zeile wird gelesen und geparst', async () => {
    runtime.public.appwriteEndpoint = 'https://api.pukalani.app/v1'
    createAdminClient.mockReturnValue({
      tablesDB: { getRow: async () => ({ $id: 'instance', metaDescription: 'Hilfe', noindex: true }) },
    })
    expect(await readCommunitySeo({}, 'instance')).toEqual({ metaDescription: 'Hilfe', noindex: true })
    expect(logEvent).not.toHaveBeenCalled()
  })
})
