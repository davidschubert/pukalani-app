import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { listAllRows } from '../../core/server/utils/listAllRows'

/**
 * DIE FEEDBACK-DSGVO-ROUTEN PRÜFEN DAS PROJEKT (SEC-027, 2026-11-15) — echter
 * Handler, echtes Naht-Gate, gefälschte Ablage.
 *
 * Mit dem RICHTIGEN Service-Secret und einem FREMDEN `projectId` endet der
 * Aufruf in 403, bevor eine einzige Zeile gelesen wird. Mit dem Pool-Projekt
 * läuft er durch — sonst wäre die Prüfung nur eine Sperre für alle.
 */

const SECRET = 'seam-secret'
const POOL = 'account'

vi.mock('../../core/server/utils/sharedSeamSecret', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../core/server/utils/sharedSeamSecret')>()
  return { ...original, seamSecretsFor: async () => [SECRET] }
})

let body: Record<string, unknown>
let logs: { event: string, data: Record<string, unknown> }[]

const tablesDB = {
  listRows: vi.fn(async () => ({ rows: [], total: 0 })),
  updateRow: vi.fn(async () => ({})),
  deleteRow: vi.fn(async () => ({})),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  controlOnboardingSecret: SECRET,
  public: { appwriteDatabaseId: 'main', controlPoolProject: POOL },
}))
vi.stubGlobal('useAppConfig', () => ({}))
vi.stubGlobal('getHeader', () => SECRET)
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('logEvent', (_level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ event, data })
})
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

const gate = await import('../server/utils/onboardingService')
vi.stubGlobal('requireOnboardingCaller', gate.requireOnboardingCaller)
vi.stubGlobal('assertOnboardingRuntimeProject', gate.assertOnboardingRuntimeProject)

type Handler = (event: H3Event) => Promise<unknown>
const erase = (await import('../server/api/control/feedback/user-erase.post')).default as unknown as Handler
const exportRoute = (await import('../server/api/control/feedback/user-data.post')).default as unknown as Handler

const event = {} as H3Event

beforeEach(() => {
  logs = []
  tablesDB.listRows.mockClear()
})

describe.each([
  ['user-erase', erase],
  ['user-data', exportRoute],
])('feedback/%s', (_name, handler) => {
  it('ein FREMDES Projekt endet in 403, ohne dass gelesen wird', async () => {
    body = { projectId: 'silo-fremd', userId: 'u1' }
    await expect(handler(event)).rejects.toMatchObject({ status: 403, statusText: 'Unknown runtime project' })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('das Pool-Projekt läuft durch', async () => {
    body = { projectId: POOL, userId: 'u1' }
    await expect(handler(event)).resolves.toBeDefined()
    expect(tablesDB.listRows).toHaveBeenCalled()
  })
})

it('das Log nennt den GEPRÜFTEN Wert', async () => {
  body = { projectId: ` ${POOL} `, userId: 'u1' }
  await erase(event)
  expect(logs.find(entry => entry.event === 'feedback.user_erased')?.data.projectId).toBe(POOL)
})
