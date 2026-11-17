import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { normalizeHost } from '../../core/server/utils/tenantResolver'

/**
 * BE-022 (1) — DIE ZÄHL-KENNUNG WIRD BEIM SPEICHERN GEGEN DIE EIGENE SEITE
 * GEPRÜFT (Davids Entscheidung).
 *
 * Bis dahin prüfte `PATCH /api/analytics/settings` nur die FORM der Kennung.
 * Die Kennung jeder Community steht aber öffentlich im HTML ihrer Seiten — wer
 * die einer anderen Seite derselben Instanz eintrug, ließ seine Besucher in
 * deren Statistik zählen. Gemessen wird hier die ganze Route mit einer
 * nachgebauten Datentür und einer Attrappe für `fetch`: welche Adresse sie
 * abruft, wie, und was danach geschrieben wird — oder eben nicht.
 */

const INSTANCE = 'https://plausible.example.test'
const SHARED = { scriptId: 'pa-SHAREDshared00000000', siteId: 'communities.pukalani.app' }
const OWN_HOST = 'kunde-a.pukalani.app'
const NEW_ID = 'pa-NEWnewNEWnew000000001'
const OLD_ID = 'pa-OLDoldOLDold000000001'

/** Das gemessene Format der Zähl-Datei — nur die Adresse wechselt. */
function scriptFor(domain: string): string {
  return `!function(){"use strict";var t={endpoint:"${INSTANCE}/api/event",domain:${JSON.stringify(domain)},formSubmissions:!0,fileDownloads:!0,outboundLinks:!0};t.x=1}();`
}

interface Row { $id: string, plausibleScriptId: string, enabled: boolean }

let existing: Row | null
let body: Record<string, unknown>
const writes: { method: 'update' | 'create', data: Record<string, unknown> }[] = []

const db = {
  find: vi.fn(async () => existing),
  update: vi.fn(async (_table: string, _id: string, data: Record<string, unknown>) => {
    writes.push({ method: 'update', data })
    return { ...existing!, ...data }
  }),
  create: vi.fn(async (_table: string, data: Record<string, unknown>) => {
    writes.push({ method: 'create', data })
    return { $id: 'new', ...data }
  }),
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireCommunityPermission', async () => {})
vi.stubGlobal('requirePlanProduct', () => {})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (value: unknown) => unknown) => parse(body))
vi.stubGlobal('tenantDb', () => db)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { analytics: { instance: INSTANCE, shared: SHARED } } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('writeAnalyticsConfigCache', vi.fn())
vi.stubGlobal('clearAnalyticsStatsCache', vi.fn())
vi.stubGlobal('getHeader', (event: H3Event, name: string) =>
  (event as unknown as { headers: Record<string, string> }).headers[name])
vi.stubGlobal('normalizeHost', normalizeHost)
vi.stubGlobal('useTenant', (event: H3Event) => event.context.tenant ?? null)
vi.stubGlobal('fetch', fetchMock)

const handler = (await import('../server/api/analytics/settings.patch'))
  .default as unknown as (event: H3Event) => Promise<{ scriptId: string, ownScriptId: string, enabled: boolean }>

function eventFor(host = OWN_HOST, tenant: Record<string, unknown> | null = { mode: 'pool', tenantId: 't-a' }): H3Event {
  return { headers: { host }, context: { tenant } } as unknown as H3Event
}

async function rejection(promise: Promise<unknown>): Promise<{ status?: number, data?: { code?: string } }> {
  try {
    await promise
  }
  catch (error) {
    return error as { status?: number, data?: { code?: string } }
  }
  throw new Error('Die Route hätte ablehnen müssen.')
}

beforeEach(() => {
  existing = { $id: 'row-1', plausibleScriptId: OLD_ID, enabled: false }
  body = {}
  writes.length = 0
  fetchMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PATCH /api/analytics/settings — Kennung einer ANDEREN Seite', () => {
  /** Der Verifikationsschritt des Findings. */
  it('lehnt mit 422 analytics_script_foreign ab und schreibt NICHTS', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor('kunde-b.pukalani.app'), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    const error = await rejection(handler(eventFor()))

    expect(error.status).toBe(422)
    expect(error.data?.code).toBe('analytics_script_foreign')
    expect(writes).toEqual([])
  })

  it('die Sammel-Kennung der Instanz als EIGENE einzutragen ist ebenfalls fremd', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor(SHARED.siteId), { status: 200 }))
    body = { plausibleScriptId: SHARED.scriptId }

    const error = await rejection(handler(eventFor()))

    expect(error.data?.code).toBe('analytics_script_foreign')
    expect(writes).toEqual([])
  })
})

describe('PATCH /api/analytics/settings — Kennung der EIGENEN Seite', () => {
  it('speichert, wenn die Zähl-Datei den Host der Anfrage nennt', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor(OWN_HOST), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    const response = await handler(eventFor())

    expect(writes).toEqual([{ method: 'update', data: { plausibleScriptId: NEW_ID } }])
    expect(response.ownScriptId).toBe(NEW_ID)
  })

  it('speichert auch für das www-Geschwister der eigenen Adresse', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor('www.kunde-a.example'), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    await handler(eventFor('kunde-a.example:443'))

    expect(writes).toHaveLength(1)
  })

  it('die eigene Domain (canonicalHost) zählt auch, wenn die Anfrage über die Pukalani-Adresse kommt', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor('kunde-a.example'), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    await handler(eventFor(OWN_HOST, { mode: 'pool', tenantId: 't-a', canonicalHost: 'Kunde-A.example' }))

    expect(writes).toHaveLength(1)
  })

  it('legt die Zeile an, wenn es noch keine gibt — ebenfalls erst nach der Prüfung', async () => {
    existing = null
    fetchMock.mockResolvedValue(new Response(scriptFor(OWN_HOST), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    await handler(eventFor())

    expect(writes).toEqual([{ method: 'create', data: { plausibleScriptId: NEW_ID, enabled: false } }])
  })
})

describe('PATCH /api/analytics/settings — die Adresse und die Art des Abrufs', () => {
  it('ruft GENAU instanz/js/kennung.js ab, ohne Umleitung, ohne Zugangsdaten', async () => {
    fetchMock.mockResolvedValue(new Response(scriptFor(OWN_HOST), { status: 200 }))
    body = { plausibleScriptId: NEW_ID }

    await handler(eventFor())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${INSTANCE}/js/${NEW_ID}.js`)
    expect(init?.redirect).toBe('error')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const headers = new Headers(init?.headers)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('cookie')).toBe(false)
  })
})

describe('PATCH /api/analytics/settings — unbekannte Kennung', () => {
  it('404 der Zähl-Datei ⇒ 422 analytics_script_unknown, nichts geschrieben', async () => {
    fetchMock.mockResolvedValue(new Response('Not found', { status: 404 }))
    body = { plausibleScriptId: NEW_ID }

    const error = await rejection(handler(eventFor()))

    expect(error.status).toBe(422)
    expect(error.data?.code).toBe('analytics_script_unknown')
    expect(writes).toEqual([])
  })
})

describe('PATCH /api/analytics/settings — nicht prüfbar ⇒ 503, nichts geschrieben (fail-closed)', () => {
  const cases: [string, () => void][] = [
    ['Netzfehler', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    ['Status 500', () => fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))],
    ['Umleitung (redirect: error wirft)', () => fetchMock.mockRejectedValue(new TypeError('unexpected redirect'))],
    ['keine Adresse in der Datei', () => fetchMock.mockResolvedValue(new Response('var t={endpoint:"x"};', { status: 200 }))],
    ['zwei verschiedene Adressen', () => fetchMock.mockResolvedValue(new Response('{domain:"a.example"};{domain:"b.example"}', { status: 200 }))],
    ['zu groß', () => fetchMock.mockResolvedValue(new Response(`${scriptFor(OWN_HOST)}${' '.repeat(300_000)}`, { status: 200 }))],
  ]

  for (const [name, arrange] of cases) {
    it(name, async () => {
      arrange()
      body = { plausibleScriptId: NEW_ID }

      const error = await rejection(handler(eventFor()))

      expect(error.status).toBe(503)
      expect(error.data?.code).toBe('analytics_script_check_unavailable')
      expect(writes).toEqual([])
    })
  }

  it('Zeitlimit (5 s) bricht den Abruf ab', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    body = { plausibleScriptId: NEW_ID }

    const pending = rejection(handler(eventFor()))
    await vi.advanceTimersByTimeAsync(5_000)
    const error = await pending

    expect(error.status).toBe(503)
    expect(error.data?.code).toBe('analytics_script_check_unavailable')
    expect(writes).toEqual([])
  })

  it('ohne Instanz-Wert in der App-Config ⇒ 503 ohne Abruf', async () => {
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { analytics: { instance: '', shared: SHARED } } }))
    try {
      body = { plausibleScriptId: NEW_ID }
      const error = await rejection(handler(eventFor()))
      expect(error.status).toBe(503)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(writes).toEqual([])
    }
    finally {
      vi.stubGlobal('useAppConfig', () => ({ pukalani: { analytics: { instance: INSTANCE, shared: SHARED } } }))
    }
  })

  it('ohne Host ⇒ 503 ohne Abruf', async () => {
    body = { plausibleScriptId: NEW_ID }
    const error = await rejection(handler(eventFor('', null)))
    expect(error.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/analytics/settings — was KEINE Prüfung braucht', () => {
  it('eine unveränderte Kennung ⇒ kein Abruf', async () => {
    body = { plausibleScriptId: OLD_ID }
    await handler(eventFor())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes).toHaveLength(1)
  })

  it('Löschen (\'\') ⇒ kein Abruf', async () => {
    body = { plausibleScriptId: '' }
    await handler(eventFor())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes).toEqual([{ method: 'update', data: { plausibleScriptId: '' } }])
  })

  it('ein reiner Schalter-Klick (enabled) ⇒ kein Abruf', async () => {
    body = { enabled: true }
    await handler(eventFor())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(writes).toEqual([{ method: 'update', data: { enabled: true } }])
  })
})
