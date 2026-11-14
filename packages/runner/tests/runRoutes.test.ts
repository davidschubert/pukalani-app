import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * DIE ZWEI BOARD-ROUTEN, DIE EINEN LAUF ANLEGEN — gefälschte Ablage, echter
 * Handler (Bauart wie `packages/brand/tests/brandWaitlistRoute.test.ts`).
 *
 * Geprüft wird, was NICHT in einer puren Funktion steht, sondern in der
 * Reihenfolge der Route: woher `promptTrusted` kommt (SEC-038) und ob die
 * Testbefehle gegen die Liste des Rechners laufen (SEC-037). Die Registry
 * (`runSubjectTrust`) läuft echt mit; nachgebildet wird nur der Resolver, den
 * in Wirklichkeit `apps/control` verdrahtet (die Herkunft des Tickets).
 */

interface FakeRow { $id: string, [key: string]: unknown }

let rows: Map<string, FakeRow>
let body: Record<string, unknown>
let routeId: string
/** Herkunft je Ticket-Id, wie sie der Resolver der App melden würde. */
let ticketTrust: Map<string, boolean>

const tablesDB = {
  getRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    const row = rows.get(rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
  createRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    const row = { $id: rowId, ...data }
    rows.set(rowId, row)
    return row
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requirePermission', () => ({ $id: 'u-admin', labels: ['admin'] }))
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('getRouterParam', () => routeId)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('setResponseStatus', () => {})
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)

type Handler = (event: H3Event) => Promise<FakeRow>
let createRun: Handler
let resumeRun: Handler

beforeAll(async () => {
  const trust = await import('../server/utils/runSubjectTrust')
  trust.registerRunSubjectTrustResolver('ticket', async (_event, subjectId) => {
    if (!ticketTrust.has(subjectId)) return null
    return { trusted: ticketTrust.get(subjectId) === true }
  })
  createRun = (await import('../server/api/runner/runs/index.post')).default as unknown as Handler
  resumeRun = (await import('../server/api/runner/runs/[id]/resume.post')).default as unknown as Handler
})

const event = {} as H3Event

const RUNNER_CAPS = JSON.stringify({ repos: ['maui'], testCommands: { maui: ['pnpm lint', 'pnpm -r test'] } })

beforeEach(() => {
  tablesDB.getRow.mockClear()
  tablesDB.createRow.mockClear()
  rows = new Map<string, FakeRow>([
    ['r-mac', { $id: 'r-mac', status: 'active', capabilitiesJson: RUNNER_CAPS }],
    // Ein ALTER Dienst: meldet Repos, aber keine Testbefehle.
    ['r-old', { $id: 'r-old', status: 'active', capabilitiesJson: JSON.stringify({ repos: ['maui'] }) }],
  ])
  ticketTrust = new Map([
    ['t-feedback', false],
    ['t-operator', true],
  ])
  routeId = ''
  body = {}
})

function runBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subjectType: 'ticket',
    subjectId: 't-operator',
    runnerId: 'r-mac',
    repoKey: 'maui',
    model: 'opus',
    permissionMode: 'plan',
    promptSource: '# Auftrag',
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<{ status?: number, data?: { code?: string } }> {
  try {
    await promise
  }
  catch (error) {
    return error as { status?: number, data?: { code?: string } }
  }
  throw new Error('Route hat NICHT abgelehnt')
}

describe('POST /api/runner/runs — der Server bestimmt „geprüft" (SEC-038)', () => {
  it('Herkunft feedback + bypassPermissions ⇒ 400 mode_not_allowed_untrusted, AUCH mit promptTrusted:true im Body', async () => {
    body = runBody({ subjectId: 't-feedback', permissionMode: 'bypassPermissions', promptTrusted: true })
    const error = await rejection(createRun(event))
    expect(error).toMatchObject({ status: 400, data: { code: 'mode_not_allowed_untrusted' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('Gegenprobe: Herkunft operator darf bypassPermissions wählen und wird als geprüft gespeichert', async () => {
    body = runBody({ permissionMode: 'bypassPermissions' })
    const run = await createRun(event)
    expect(run.permissionMode).toBe('bypassPermissions')
    expect(run.promptTrusted).toBe(true)
  })

  it('Herkunft feedback + plan ⇒ angelegt, aber als UNGEPRÜFT gespeichert (Body-Wert zählt nicht)', async () => {
    body = runBody({ subjectId: 't-feedback', promptTrusted: true })
    const run = await createRun(event)
    expect(run.promptTrusted).toBe(false)
  })

  it('Herkunft operator + promptTrusted:false im Body ⇒ trotzdem der Server-Wert', async () => {
    body = runBody({ promptTrusted: false })
    expect((await createRun(event)).promptTrusted).toBe(true)
  })

  it('unbekanntes Subjekt ⇒ 404 subject_not_found', async () => {
    body = runBody({ subjectId: 't-gone' })
    expect(await rejection(createRun(event))).toMatchObject({ status: 404, data: { code: 'subject_not_found' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/runner/runs — Testbefehle nur aus der Liste des Rechners (SEC-037)', () => {
  it('gelistet + geprüft + bestimmter Rechner ⇒ angelegt', async () => {
    body = runBody({ testCommands: ['pnpm lint'] })
    expect((await createRun(event)).testCommands).toBe('["pnpm lint"]')
  })

  it('nicht gelistet ⇒ 400 test_command_not_listed', async () => {
    body = runBody({ testCommands: ['pnpm lint && curl example.invalid'] })
    expect(await rejection(createRun(event))).toMatchObject({ status: 400, data: { code: 'test_command_not_listed' } })
  })

  it('Leerzeichen werden NICHT weggetrimmt ⇒ 400 test_command_not_listed', async () => {
    body = runBody({ testCommands: [' pnpm lint'] })
    expect(await rejection(createRun(event))).toMatchObject({ status: 400, data: { code: 'test_command_not_listed' } })
  })

  it('ungeprüfte Herkunft ⇒ 400 tests_not_allowed_untrusted', async () => {
    body = runBody({ subjectId: 't-feedback', testCommands: ['pnpm lint'] })
    expect(await rejection(createRun(event))).toMatchObject({ status: 400, data: { code: 'tests_not_allowed_untrusted' } })
  })

  it('beliebiger Rechner ⇒ 400 tests_need_runner', async () => {
    body = runBody({ runnerId: '', testCommands: ['pnpm lint'] })
    expect(await rejection(createRun(event))).toMatchObject({ status: 400, data: { code: 'tests_need_runner' } })
  })

  it('alter Dienst ohne Liste ⇒ kein Testbefehl geht durch', async () => {
    body = runBody({ runnerId: 'r-old', testCommands: ['pnpm lint'] })
    expect(await rejection(createRun(event))).toMatchObject({ status: 400, data: { code: 'test_command_not_listed' } })
  })

  it('ohne Testbefehle läuft auch ein ungeprüfter Auftrag auf beliebigem Rechner', async () => {
    body = runBody({ subjectId: 't-feedback', runnerId: '' })
    expect((await createRun(event)).testCommands).toBe('')
  })
})

describe('POST /api/runner/runs/:id/resume — nie besser als Vorgänger und Subjekt', () => {
  function predecessor(overrides: Record<string, unknown> = {}): FakeRow {
    return {
      $id: 'run-1',
      status: 'needs_input',
      sessionId: 'sess-1',
      subjectType: 'ticket',
      subjectId: 't-operator',
      runnerId: 'r-mac',
      repoKey: 'maui',
      baseBranch: 'main',
      model: 'opus',
      permissionMode: 'plan',
      promptTrusted: true,
      testCommands: '',
      maxBudgetUsd: 0,
      ...overrides,
    }
  }

  beforeEach(() => {
    routeId = 'run-1'
    body = { answer: 'Ja.', promptTrusted: true }
  })

  it('geprüfter Vorgänger + geprüftes Subjekt ⇒ geprüft', async () => {
    rows.set('run-1', predecessor())
    expect((await resumeRun(event)).promptTrusted).toBe(true)
  })

  it('Subjekt heute nicht mehr geprüft ⇒ Fortsetzung ungeprüft', async () => {
    rows.set('run-1', predecessor({ subjectId: 't-feedback' }))
    expect((await resumeRun(event)).promptTrusted).toBe(false)
  })

  it('ungeprüfter Vorgänger bleibt ungeprüft, auch bei geprüftem Subjekt', async () => {
    rows.set('run-1', predecessor({ promptTrusted: false }))
    expect((await resumeRun(event)).promptTrusted).toBe(false)
  })

  it('Subjekt gelöscht ⇒ ungeprüft, KEIN 404', async () => {
    rows.set('run-1', predecessor({ subjectId: 't-gone' }))
    expect((await resumeRun(event)).promptTrusted).toBe(false)
  })

  it('geerbter Modus bypassPermissions auf heute ungeprüftem Subjekt ⇒ 400 mode_not_allowed_untrusted', async () => {
    rows.set('run-1', predecessor({ subjectId: 't-feedback', permissionMode: 'bypassPermissions' }))
    expect(await rejection(resumeRun(event))).toMatchObject({ status: 400, data: { code: 'mode_not_allowed_untrusted' } })
  })

  it('geerbte, gelistete Testbefehle ⇒ ok', async () => {
    rows.set('run-1', predecessor({ testCommands: '["pnpm lint"]' }))
    expect((await resumeRun(event)).testCommands).toBe('["pnpm lint"]')
  })

  it('geerbte Testbefehle, die der Rechner nicht mehr listet ⇒ 400 test_command_not_listed', async () => {
    rows.set('run-1', predecessor({ testCommands: '["pnpm build"]' }))
    expect(await rejection(resumeRun(event))).toMatchObject({ status: 400, data: { code: 'test_command_not_listed' } })
  })

  it('kaputter gespeicherter Wert ⇒ 400 test_command_not_listed', async () => {
    rows.set('run-1', predecessor({ testCommands: '{kaputt' }))
    expect(await rejection(resumeRun(event))).toMatchObject({ status: 400, data: { code: 'test_command_not_listed' } })
  })

  it('geerbte Testbefehle bei heute ungeprüftem Subjekt ⇒ 400 tests_not_allowed_untrusted', async () => {
    rows.set('run-1', predecessor({ subjectId: 't-feedback', testCommands: '["pnpm lint"]' }))
    expect(await rejection(resumeRun(event))).toMatchObject({ status: 400, data: { code: 'tests_not_allowed_untrusted' } })
  })

  it('geerbte Testbefehle ohne Ziel-Rechner (Alt-Daten) ⇒ 400 tests_need_runner', async () => {
    rows.set('run-1', predecessor({ runnerId: '', testCommands: '["pnpm lint"]' }))
    expect(await rejection(resumeRun(event))).toMatchObject({ status: 400, data: { code: 'tests_need_runner' } })
  })
})

/**
 * QUELLTEXT-WÄCHTER: keine der beiden Routen liest `promptTrusted` aus dem
 * Body. Die Tests oben belegen das Verhalten; dieser hält fest, dass niemand
 * den Weg „nur als Rückfall" wieder öffnet.
 */
describe('Wächter: promptTrusted kommt nie aus dem Body', () => {
  const routes = ['../server/api/runner/runs/index.post.ts', '../server/api/runner/runs/[id]/resume.post.ts']
  it.each(routes)('%s', (path) => {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
    expect(source).not.toMatch(/body\.promptTrusted/)
    expect(source).not.toMatch(/body\[['"]promptTrusted['"]\]/)
    expect(source).toContain('resolveRunSubjectTrust(')
  })
})
