import type { H3Event } from 'h3'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * SEC-021: das Sites-Register nimmt für `endpoint` und `appUrl` nur http(s)
 * an; ein leeres `appUrl` bleibt wie bisher erlaubt.
 */
const OTHER_SCHEMES = ['javascript:void(0)', 'data:text/plain,x', 'ftp://example.com']
const PASSED = new Error('validation passed')

let body: unknown = {}
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', () => ({ $id: 'betreiber' }))
vi.stubGlobal('getRouterParam', () => 'site-1')
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
// Nach der Rumpf-Prüfung endet der Lauf hier — ohne Datenbank.
vi.stubGlobal('useRuntimeConfig', () => {
  throw PASSED
})

type Handler = (event: H3Event) => Promise<unknown>
let register: Handler
let patch: Handler
beforeAll(async () => {
  register = (await import('../server/api/control/websites/index.post')).default as unknown as Handler
  patch = (await import('../server/api/control/websites/[id].patch')).default as unknown as Handler
})

const registerBody = {
  name: 'Site',
  slug: 'site',
  projectId: 'site',
  endpoint: 'https://api.example.com/v1',
  appUrl: 'https://site.example.com',
}

describe('POST /api/control/websites', () => {
  it('http(s) angenommen, appUrl darf fehlen', async () => {
    body = registerBody
    await expect(register({} as H3Event)).rejects.toBe(PASSED)
    body = { ...registerBody, endpoint: 'http://localhost/v1', appUrl: undefined }
    await expect(register({} as H3Event)).rejects.toBe(PASSED)
  })

  it.each(OTHER_SCHEMES)('endpoint: anderes Schema abgelehnt (%s)', async (value) => {
    body = { ...registerBody, endpoint: value }
    await expect(register({} as H3Event)).rejects.toMatchObject({ name: 'ZodError' })
  })

  it.each(OTHER_SCHEMES)('appUrl: anderes Schema abgelehnt (%s)', async (value) => {
    body = { ...registerBody, appUrl: value }
    await expect(register({} as H3Event)).rejects.toMatchObject({ name: 'ZodError' })
  })
})

describe('PATCH /api/control/websites/:id', () => {
  it('http(s) und leer angenommen', async () => {
    body = { appUrl: 'https://site.example.com' }
    await expect(patch({} as H3Event)).rejects.toBe(PASSED)
    body = { appUrl: '' }
    await expect(patch({} as H3Event)).rejects.toBe(PASSED)
  })

  it.each(OTHER_SCHEMES)('appUrl: anderes Schema abgelehnt (%s)', async (value) => {
    body = { appUrl: value }
    await expect(patch({} as H3Event)).rejects.toMatchObject({ name: 'ZodError' })
  })
})
