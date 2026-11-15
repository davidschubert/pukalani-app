import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { EMBED_LOCAL_DEV_ORIGINS, embedLocalDevOriginsFor } from '../shared/embedOrigins'
import { registerEmbeddableRoute, resolveFrameAncestors } from '../../core/server/utils/frameAncestors'

/**
 * BE-023 — LOKALE EINBETTER NUR BEIM ENTWICKELN.
 *
 * `http://localhost:*` stand in der app.config der Test-App und wäre damit
 * in jedem Produktions-Build in `frame-ancestors` gelandet. Zwei Aussagen:
 *  1. Die Entscheidung: Dev-Server ODER ausdrückliche Variable ⇒ die zwei
 *     Muster; ein Build ohne Variable (und jeder andere Wert) ⇒ nichts.
 *  2. Der Header: mit leerer statischer Liste und ohne Registry-Treffer
 *     ergibt der ECHTE Weg (Plugin ⇒ core-Registry ⇒ Header-Wert)
 *     `frame-ancestors 'self'` — und erst die Variable öffnet ihn lokal.
 */

describe('embedLocalDevOriginsFor', () => {
  it('Build ohne Variable ⇒ leer', () => {
    expect(embedLocalDevOriginsFor(false, undefined)).toEqual([])
  })

  it('Dev-Server ⇒ die zwei lokalen Muster, auch ohne Variable', () => {
    expect(embedLocalDevOriginsFor(true, undefined)).toEqual(['http://localhost:*', 'http://127.0.0.1:*'])
    expect(embedLocalDevOriginsFor(true, false)).toEqual([...EMBED_LOCAL_DEV_ORIGINS])
  })

  it('Variable true (Boolean, wie Nuxt sie liest, oder Text) ⇒ die zwei Muster', () => {
    expect(embedLocalDevOriginsFor(false, true)).toEqual([...EMBED_LOCAL_DEV_ORIGINS])
    expect(embedLocalDevOriginsFor(false, 'true')).toEqual([...EMBED_LOCAL_DEV_ORIGINS])
  })

  it.each([
    ['leer', ''],
    ['false (Boolean)', false],
    ['false (Text)', 'false'],
    ['1', 1],
    ['yes', 'yes'],
    ['TRUE', 'TRUE'],
    ['null', null],
  ] as const)('Variable %s ⇒ leer', (_label, value) => {
    expect(embedLocalDevOriginsFor(false, value)).toEqual([])
  })

  it('gibt eine Kopie heraus — ein Aufrufer kann die Konstante nicht verändern', () => {
    const list = embedLocalDevOriginsFor(true, undefined)
    list.push('https://boese.example')
    expect(EMBED_LOCAL_DEV_ORIGINS).toHaveLength(2)
  })
})

// ── Der Header: echtes Plugin, echte core-Registry ───────────────────────────

let localFlag: unknown
let staticOrigins: string[]

vi.mock('../server/utils/embedSites', () => ({ listEmbedSites: async () => [] }))
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('registerEmbeddableRoute', registerEmbeddableRoute)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { comments: { embed: { enabled: true, allowedOrigins: staticOrigins } } } }))
vi.stubGlobal('useRuntimeConfig', () => ({ commentsEmbedLocalOrigins: localFlag }))

const { default: embedFramePlugin } = await import('../server/plugins/embed-frame')
;(embedFramePlugin as unknown as () => void)()

const event = { context: {} } as unknown as H3Event

describe('frame-ancestors für /embed (BE-023)', () => {
  beforeEach(() => {
    localFlag = undefined
    staticOrigins = []
  })

  it('Build, leere statische Liste, keine Registry ⇒ nur \'self\'', async () => {
    expect(await resolveFrameAncestors(event, '/embed')).toBe(`'self'`)
    expect(await resolveFrameAncestors(event, '/de/embed')).toBe(`'self'`)
  })

  it('mit der Variable ⇒ die lokalen Muster zusätzlich zu \'self\'', async () => {
    localFlag = true
    expect(await resolveFrameAncestors(event, '/embed')).toBe(`'self' http://localhost:* http://127.0.0.1:*`)
  })

  it('statische Origins der App bleiben, die lokalen hängen sich an (ohne Dubletten)', async () => {
    staticOrigins = ['https://blog.example', 'http://localhost:*']
    localFlag = 'true'
    expect(await resolveFrameAncestors(event, '/embed'))
      .toBe(`'self' https://blog.example http://localhost:* http://127.0.0.1:*`)
  })

  it('andere Pfade bleiben \'self\' — die Variable öffnet nur /embed', async () => {
    localFlag = true
    expect(await resolveFrameAncestors(event, '/login')).toBe(`'self'`)
  })
})
