import type { H3Event } from 'h3'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { insightsLicenseHref, insightsSourceHref } from '../app/utils/insightsFormat'
import { insightsBrandEditSchema, insightsSourceSchema, type InsightsSource } from '../shared/insightsPost'

/**
 * SEC-021: Links der Redaktion nehmen nur http(s) an, leer bleibt wie bisher.
 * Und die Anzeige: ein gespeicherter Altwert mit anderem Schema wird kein Link.
 */
const OTHER_SCHEMES = ['javascript:void(0)', 'data:text/plain,x', 'ftp://example.com']

const ownSource = { url: 'https://example.com/a', publisher: '', date: '', kind: 'own-data', quote: '', license: '' } as const

describe('insightsSourceSchema.url', () => {
  it('http(s) angenommen', () => {
    expect(insightsSourceSchema.safeParse(ownSource).success).toBe(true)
    expect(insightsSourceSchema.safeParse({ ...ownSource, url: 'http://example.com/a' }).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(insightsSourceSchema.safeParse({ ...ownSource, url: value }).success).toBe(false)
  })
})

describe('insightsSourceSchema.license', () => {
  it('leer bleibt erlaubt, http(s) angenommen', () => {
    expect(insightsSourceSchema.safeParse({ ...ownSource, license: '' }).success).toBe(true)
    expect(insightsSourceSchema.safeParse({ ...ownSource, license: 'https://creativecommons.org/licenses/by-sa/4.0/' }).success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(insightsSourceSchema.safeParse({ ...ownSource, license: value }).success).toBe(false)
  })
})

describe('insightsBrandEditSchema.homepage', () => {
  const homepage = insightsBrandEditSchema.shape.homepage
  it('leer bleibt erlaubt, http(s) angenommen', () => {
    expect(homepage.safeParse('').success).toBe(true)
    expect(homepage.safeParse(undefined).success).toBe(true)
    expect(homepage.safeParse('https://example.com').success).toBe(true)
    expect(homepage.safeParse('http://example.com').success).toBe(true)
  })
  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', (value) => {
    expect(homepage.safeParse(value).success).toBe(false)
  })
})

// ── Die Anlage-Route (eigenes Rumpf-Schema) ────────────────────────────────
let body: unknown = {}
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
// Nach der Prüfung des Rumpfs endet der Lauf hier mit 409 — so sieht der Test,
// dass die Adresse die Prüfung passiert hat, ohne eine Datenbank zu brauchen.
vi.stubGlobal('findFreeInsightsSlug', async () => null)

type Handler = (event: H3Event) => Promise<unknown>
let handler: Handler
beforeAll(async () => {
  handler = (await import('../server/api/insights/brands/index.post')).default as unknown as Handler
})

describe('POST /api/insights/brands — homepage', () => {
  const run = (homepage: unknown) => {
    body = { name: 'Marke', homepage }
    return handler({} as H3Event)
  }

  it.each(['', 'https://example.com', 'http://example.com'])('angenommen: %j', async (value) => {
    await expect(run(value)).rejects.toMatchObject({ status: 409 })
  })

  it.each(OTHER_SCHEMES)('anderes Schema abgelehnt: %s', async (value) => {
    await expect(run(value)).rejects.toMatchObject({ name: 'ZodError' })
  })
})

// ── Die Anzeige ────────────────────────────────────────────────────────────
describe('Quellenliste: ein gespeicherter Altwert mit anderem Schema ergibt keinen Link', () => {
  const source = (patch: Partial<InsightsSource>): InsightsSource => ({ ...ownSource, ...patch })

  it('die Quelle: http(s) wird verlinkt, alles andere nicht', () => {
    expect(insightsSourceHref(source({}))).toBe('https://example.com/a')
    for (const value of OTHER_SCHEMES) expect(insightsSourceHref(source({ url: value }))).toBeUndefined()
  })

  it('die Prototyp-Naht resolveHref greift nur bei einer http(s)-Quelle', () => {
    const resolve = () => '/demo/quelle'
    expect(insightsSourceHref(source({}), resolve)).toBe('/demo/quelle')
    expect(insightsSourceHref(source({ url: 'ftp://example.com' }), resolve)).toBeUndefined()
  })

  it('die Lizenz: http(s) wird verlinkt, leer oder anderes Schema nicht', () => {
    expect(insightsLicenseHref(source({ license: 'https://creativecommons.org/licenses/by-sa/4.0/' })))
      .toBe('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(insightsLicenseHref(source({ license: '' }))).toBeUndefined()
    for (const value of OTHER_SCHEMES) expect(insightsLicenseHref(source({ license: value }))).toBeUndefined()
  })
})
