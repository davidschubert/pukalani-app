import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { requirePermission } from '../../core/server/utils/requirePermission'
import { checkAiModelEndpoints } from '../../core/server/utils/aiModelCheck'
import { AI_BROKER_BASE_URL } from '../../core/shared/aiModelEndpoints'

/**
 * PATCH /api/admin/config — KI-Modell wird beim Speichern geprüft (KI1 c,
 * 2026-11-17).
 *
 * Ausgeführt werden der ECHTE Handler, die ECHTE Rechte-Prüfung und die ECHTE
 * Prüf-Hilfe des Core; gestellt sind nur die Ablage und `fetch` (kein echter
 * Aufruf beim Vermittler). Wer durch darf, steht AUSGESCHRIEBEN: nur `admin`
 * (`system.manage`).
 */

interface Row { aiModel?: string, [key: string]: unknown }

let stored: Row | null
let user: { $id: string, name: string, labels: string[] } | null
let body: Record<string, unknown>
let baseUrl: string
const audits: Record<string, unknown>[] = []

const tablesDB = {
  getRow: vi.fn(async () => {
    if (!stored) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return { $id: 'global', ...stored }
  }),
  updateRow: vi.fn(async ({ data }: { data: Row }) => {
    if (!stored) throw new AppwriteException('Row not found', 404, 'row_not_found')
    stored = { ...stored, ...data }
    return stored
  }),
  createRow: vi.fn(async ({ data }: { data: Row }) => {
    stored = { ...data }
    return stored
  }),
}
const fetchMock = vi.fn<typeof fetch>()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
// Wie h3: ein Fehler der Prüfung wird zu 400 „Validation Error".
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => {
  try {
    return run(body)
  }
  catch (error) {
    throw Object.assign(new Error('Validation Error'), { status: 400, statusCode: 400, data: error })
  }
})
vi.stubGlobal('recordAudit', async (_event: H3Event, entry: Record<string, unknown>) => { audits.push(entry) })
vi.stubGlobal('getAiConfig', () => ({ enabled: true, model: 'anthropic/claude-haiku-4.5', baseUrl }))
vi.stubGlobal('requirePermission', requirePermission)
vi.stubGlobal('checkAiModelEndpoints', checkAiModelEndpoints)
vi.stubGlobal('fetch', fetchMock)
const { mutateAppConfig } = await import('../server/utils/appConfigWrite')
vi.stubGlobal('mutateAppConfig', mutateAppConfig)

const handler = (await import('../server/api/admin/config.patch'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const call = () => handler({ context: { user } } as unknown as H3Event)

const ADMIN = { $id: 'u-admin', name: 'Ada', labels: ['admin'] }
const FLAGS = { registrationEnabled: true, commentsEnabled: true, maintenanceMode: false }
const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status })
const withTags = (...tags: string[]) => json(200, { data: { endpoints: tags.map(tag => ({ tag })) } })

beforeEach(() => {
  stored = { ...FLAGS, aiModel: 'anthropic/claude-haiku-4.5' }
  user = ADMIN
  body = { ...FLAGS }
  baseUrl = AI_BROKER_BASE_URL
  audits.length = 0
  fetchMock.mockReset()
  tablesDB.getRow.mockClear()
  tablesDB.updateRow.mockClear()
  tablesDB.createRow.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/admin/config — Rollen', () => {
  it.each([
    ['Gast', null, 401],
    ['Konto ohne Rolle', { $id: 'u-1', name: 'Udo', labels: [] }, 403],
    ['Moderator', { $id: 'u-2', name: 'Mo', labels: ['moderator'] }, 403],
    ['Community-Label', { $id: 'u-3', name: 'Lu', labels: ['c-123'] }, 403],
  ] as const)('%s ⇒ %s, vor jedem Lesen und ohne Netz', async (_label, who, status) => {
    user = who === null ? null : { ...who, labels: [...who.labels] }
    body = { ...FLAGS, maintenanceMode: true, aiModel: 'openai/gpt-4o' }
    await expect(call()).rejects.toMatchObject({ status })
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/config — Modell-Prüfung beim Speichern', () => {
  it('ohne `aiModel` (alter Client) ⇒ kein Netz, gespeichert, kein Feld', async () => {
    body = { ...FLAGS, maintenanceMode: true }
    const result = await call()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('aiModelCheck')
    expect(stored?.maintenanceMode).toBe(true)
  })

  it('leeres Modell ⇒ kein Netz, gespeichert (zurück auf den Build-Default)', async () => {
    body = { ...FLAGS, aiModel: '' }
    const result = await call()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('aiModelCheck')
    expect(stored?.aiModel).toBe('')
  })

  it('unverändertes Modell ⇒ kein Netz, auch wenn es heute keinen EU-Ort hätte', async () => {
    fetchMock.mockResolvedValue(withTags('openai/default'))
    body = { ...FLAGS, maintenanceMode: true, aiModel: '  anthropic/claude-haiku-4.5 ' }
    await call()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stored?.maintenanceMode).toBe(true)
  })

  it('neues Modell ohne EU-Ort ⇒ 422 `ai_model_no_eu_endpoint`, NICHTS geschrieben', async () => {
    fetchMock.mockResolvedValue(withTags('openai/default', 'google-vertex/global'))
    body = { ...FLAGS, maintenanceMode: true, aiModel: 'openai/gpt-4o' }
    await expect(call()).rejects.toMatchObject({ status: 422, data: { code: 'ai_model_no_eu_endpoint' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(stored).toMatchObject({ maintenanceMode: false, aiModel: 'anthropic/claude-haiku-4.5' })
    expect(audits).toHaveLength(0)
  })

  it('unbekanntes Modell (404) ⇒ 422 `ai_model_unknown`, NICHTS geschrieben', async () => {
    fetchMock.mockResolvedValue(json(404, {}))
    body = { ...FLAGS, aiModel: 'nope/does-not-exist' }
    await expect(call()).rejects.toMatchObject({ status: 422, data: { code: 'ai_model_unknown' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('Vermittler gestört (500) ⇒ gespeichert mit `aiModelCheck: unverified`', async () => {
    fetchMock.mockResolvedValue(json(500, {}))
    body = { ...FLAGS, aiModel: 'google/gemini-2.5-flash' }
    const result = await call()
    expect(result.aiModelCheck).toBe('unverified')
    expect(stored?.aiModel).toBe('google/gemini-2.5-flash')
    expect(audits[0]?.metadata).toMatchObject({ aiModelCheck: 'unverified' })
  })

  it('Netzfehler ⇒ gespeichert mit `unverified` — ein Ausfall blockiert nie', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    body = { ...FLAGS, aiModel: 'google/gemini-2.5-flash' }
    await expect(call()).resolves.toMatchObject({ aiModelCheck: 'unverified' })
    expect(stored?.aiModel).toBe('google/gemini-2.5-flash')
  })

  it('fremde Basis-Adresse ⇒ kein Netz, gespeichert mit `unverified`', async () => {
    baseUrl = 'https://llm.example.test/v1'
    body = { ...FLAGS, aiModel: 'google/gemini-2.5-flash' }
    await expect(call()).resolves.toMatchObject({ aiModelCheck: 'unverified' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('neues Modell mit EU-Ort ⇒ gespeichert mit `aiModelCheck: ok`', async () => {
    fetchMock.mockResolvedValue(withTags('amazon-bedrock/eu-west-1', 'anthropic/default'))
    body = { ...FLAGS, aiModel: 'anthropic/claude-sonnet-4.5' }
    await expect(call()).resolves.toMatchObject({ aiModel: 'anthropic/claude-sonnet-4.5', aiModelCheck: 'ok' })
    expect(stored?.aiModel).toBe('anthropic/claude-sonnet-4.5')
  })

  it('Zeile fehlt noch ⇒ geprüft, dann angelegt', async () => {
    stored = null
    fetchMock.mockResolvedValue(withTags('google-vertex/europe'))
    body = { ...FLAGS, aiModel: 'google/gemini-2.5-flash' }
    await expect(call()).resolves.toMatchObject({ aiModelCheck: 'ok' })
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/admin/config — Teil-Objekt (nur was der Klick ändert)', () => {
  it('leeres Teil-Objekt ⇒ 400, nichts gelesen und nichts geschrieben', async () => {
    body = {}
    await expect(call()).rejects.toMatchObject({ status: 400 })
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(audits).toHaveLength(0)
  })

  it('nur unbekannte Felder ⇒ 400 (sie fallen weg, übrig bleibt nichts)', async () => {
    body = { somethingElse: true }
    await expect(call()).rejects.toMatchObject({ status: 400 })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('ein Feld ⇒ geschrieben wird genau diese Spalte', async () => {
    body = { maintenanceMode: true }
    await expect(call()).resolves.toEqual({ maintenanceMode: true })
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
    expect(tablesDB.updateRow.mock.calls[0]?.[0]).toMatchObject({ data: { maintenanceMode: true } })
    expect(Object.keys((tablesDB.updateRow.mock.calls[0]?.[0] as { data: Row }).data)).toEqual(['maintenanceMode'])
    expect(audits[0]?.metadata).toEqual({ maintenanceMode: true })
  })

  it('zwei Betreiber gleichzeitig, verschiedene Felder ⇒ beide Änderungen stehen', async () => {
    const calls = [{ maintenanceMode: true }, { registrationEnabled: false }].map((part) => {
      body = part
      return call()
    })
    await Promise.all(calls)
    expect(stored).toMatchObject({ maintenanceMode: true, registrationEnabled: false, commentsEnabled: true })
    expect(audits).toHaveLength(2)
  })

  it('Gegenprobe: die alte Seite (alle Felder aus dem eigenen Stand) verliert eine Änderung', async () => {
    // Beide Seiten luden FLAGS; jede legt EINEN Schalter um und schickt alles.
    const calls = [{ ...FLAGS, maintenanceMode: true }, { ...FLAGS, registrationEnabled: false }].map((full) => {
      body = full
      return call()
    })
    await Promise.all(calls)
    // Der zweite schreibt `maintenanceMode: false` aus seinem alten Stand zurück.
    expect(stored).toMatchObject({ maintenanceMode: false, registrationEnabled: false })
  })
})
