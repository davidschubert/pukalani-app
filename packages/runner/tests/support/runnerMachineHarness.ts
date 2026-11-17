import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { hashRunnerSecret, requireOwnRun, requireRunner } from '../../server/utils/runnerAuth'
import { RUNNERS_TABLE, RUNS_TABLE } from '../../shared/types/runner'

/**
 * PRÜFSTAND FÜR DIE MASCHINEN-ROUTEN DES AI-RUNNERS (OPS-009).
 *
 * Der Runner weist sich NICHT mit einer Sitzung aus, sondern mit dem
 * Bearer-Ausweis `<runnerId>.<secret>` (`server/utils/runnerAuth.ts`). Die
 * Wachen laufen ECHT: `requireRunner` (Ausweis prüfen, Hash vergleichen,
 * stillgelegt = abgelehnt) und `requireOwnRun` (der Lauf gehört diesem
 * Runner). Nachgebildet ist nur die Ablage (eine kleine Tabelle im Speicher).
 *
 * Die Welt:
 *  - Runner `r-eigen` (aktiv), `r-fremd` (aktiv, ein anderer Rechner),
 *    `r-still` (stillgelegt — mit seinem richtigen Geheimnis).
 *  - Lauf `run-eigen` gehört `r-eigen`, Lauf `run-fremd` gehört `r-fremd`.
 *    Beide tragen einen Anhang `f-1`.
 *
 * Geheimnisse sind sprechende Platzhalter, keine echten Werte.
 */

export const OWN_RUNNER = 'r-eigen'
export const FOREIGN_RUNNER = 'r-fremd'
export const DISABLED_RUNNER = 'r-still'
export const OWN_RUN = 'run-eigen'
export const FOREIGN_RUN = 'run-fremd'
export const ATTACHMENT_ID = 'f-1'

const SECRETS: Record<string, string> = {
  [OWN_RUNNER]: 'probe-runner-ausweis',
  [FOREIGN_RUNNER]: 'probe-fremder-ausweis',
  [DISABLED_RUNNER]: 'probe-stiller-ausweis',
}

/**
 * Welcher Ausweis in der Kopfzeile steht:
 *  - `none`           — keine Kopfzeile,
 *  - `malformed`      — kein `Bearer <id>.<secret>`,
 *  - `wrong-secret`   — eigene Id, falsches Geheimnis,
 *  - `unknown-runner` — Id, die es nicht gibt,
 *  - `disabled`       — stillgelegter Runner mit seinem richtigen Geheimnis,
 *  - `own`            — `r-eigen` mit dem richtigen Geheimnis,
 *  - `foreign`        — `r-fremd` mit SEINEM richtigen Geheimnis.
 */
export type Credential = 'none' | 'malformed' | 'wrong-secret' | 'unknown-runner' | 'disabled' | 'own' | 'foreign'

function headerFor(credential: Credential): string | undefined {
  switch (credential) {
    case 'none': return undefined
    case 'malformed': return 'Bearer ohne-punkt'
    case 'wrong-secret': return `Bearer ${OWN_RUNNER}.falsches-geheimnis`
    case 'unknown-runner': return 'Bearer r-unbekannt.probe-runner-ausweis'
    case 'disabled': return `Bearer ${DISABLED_RUNNER}.${SECRETS[DISABLED_RUNNER]}`
    case 'own': return `Bearer ${OWN_RUNNER}.${SECRETS[OWN_RUNNER]}`
    case 'foreign': return `Bearer ${FOREIGN_RUNNER}.${SECRETS[FOREIGN_RUNNER]}`
  }
}

export interface MachineProbe {
  credential: Credential
  /** Eine Betreiber-Sitzung (globales Label `admin`) — ersetzt keinen Ausweis. */
  operatorSession?: boolean
  params?: Record<string, string>
}

export interface ThrownLike {
  status?: number
  statusText?: string
  data?: { code?: string }
}

export interface MachineRun {
  status: number
  error?: ThrownLike
  result?: unknown
  /** Welche Tabellen gelesen wurden, in Reihenfolge (`runners` = die Ausweis-Prüfung). */
  reads: string[]
  /** Wurde eine Datei aus der Ablage gelesen? */
  fileRead: boolean
}

function makeError(init: Record<string, unknown>): Error {
  return Object.assign(new Error(String(init.statusText ?? 'Error')), init, { statusCode: init.status })
}

function notFound(): Error {
  return Object.assign(new Error('Row not found'), { code: 404 })
}

const ATTACHMENTS = JSON.stringify([{ fileId: ATTACHMENT_ID, name: 'probe.txt', mimeType: 'text/plain', size: 5 }])

function world(): Record<string, Record<string, Record<string, unknown>>> {
  const runner = (id: string, status: string) => ({
    $id: id, name: `Probe ${id}`, kind: 'local', status, secretHash: hashRunnerSecret(SECRETS[id]!), capabilitiesJson: '', lastSeenAt: null,
  })
  const run = (id: string, runnerId: string) => ({
    $id: id, runnerId, status: 'running', attachmentsJson: ATTACHMENTS, resultJson: '',
  })
  return {
    [RUNNERS_TABLE]: {
      [OWN_RUNNER]: runner(OWN_RUNNER, 'active'),
      [FOREIGN_RUNNER]: runner(FOREIGN_RUNNER, 'active'),
      [DISABLED_RUNNER]: runner(DISABLED_RUNNER, 'disabled'),
    },
    [RUNS_TABLE]: {
      [OWN_RUN]: run(OWN_RUN, OWN_RUNNER),
      [FOREIGN_RUN]: run(FOREIGN_RUN, FOREIGN_RUNNER),
    },
  }
}

/** Führt einen ECHTEN Handler mit den ECHTEN Runner-Wachen aus. */
export async function probeMachineRoute(
  load: () => Promise<{ default: unknown }>,
  probe: MachineProbe,
): Promise<MachineRun> {
  const rows = world()
  const reads: string[] = []
  let fileRead = false
  const header = headerFor(probe.credential)

  const tablesDB = {
    getRow: async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
      reads.push(tableId)
      const row = rows[tableId]?.[rowId]
      if (!row) throw notFound()
      return { ...row }
    },
    listRows: async ({ tableId }: { tableId: string }) => {
      reads.push(tableId)
      // `run_events` ist leer: die Ende-Markierung fehlt (`ended: false`).
      return { total: 0, rows: [] }
    },
  }
  const storage = {
    getFileView: async () => {
      fileRead = true
      return new TextEncoder().encode('probe').buffer
    },
  }

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', makeError)
  vi.stubGlobal('toH3Error', (error: unknown, message: string) => {
    const code = (error as { code?: unknown })?.code
    return makeError({ status: typeof code === 'number' && code >= 400 && code < 500 ? code : 500, statusText: message })
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB, storage }))
  vi.stubGlobal('getRequestHeader', (_e: unknown, name: string) => (name.toLowerCase() === 'authorization' ? header : undefined))
  vi.stubGlobal('getHeader', (_e: unknown, name: string) => (name.toLowerCase() === 'authorization' ? header : undefined))
  vi.stubGlobal('getRouterParam', (_e: unknown, name: string) => probe.params?.[name])
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('requireRunner', requireRunner)
  vi.stubGlobal('requireOwnRun', requireOwnRun)

  const user = probe.operatorSession ? { $id: 'u-operator', name: 'Betreiber', labels: ['admin'] } : undefined
  const event = { context: { user }, path: '/api/runner/probe', method: 'GET' } as unknown as H3Event

  const handler = (await load()).default as (e: H3Event) => Promise<unknown>
  try {
    const result = await handler(event)
    return { status: 200, result, reads, fileRead }
  }
  catch (thrown) {
    const error = thrown as ThrownLike
    return { status: error.status ?? 500, error, reads, fileRead }
  }
}

export interface MachineRouteOptions {
  /** Parameter für den EIGENEN Lauf; `id` wird für die Fremd-Probe ersetzt. */
  params: Record<string, string>
}

/**
 * Die Fragen an eine Maschinen-Route, die an EINEN Lauf gebunden ist:
 *  - ohne / kaputter / falscher / unbekannter / stillgelegter Ausweis ⇒ 401,
 *    und der Lauf wird gar nicht erst gelesen,
 *  - Betreiber-Sitzung ohne Ausweis ⇒ 401 (die Naht kennt keine Sitzungen),
 *  - richtiger Ausweis, eigener Lauf ⇒ 200,
 *  - richtiger Ausweis, FREMDER Lauf ⇒ 403 `not_your_run`,
 *  - der Ausweis des anderen Runners für den eigenen Lauf ⇒ 403 `not_your_run`.
 */
export function describeRunnerMachineRoute(
  name: string,
  load: () => Promise<{ default: unknown }>,
  options: MachineRouteOptions,
): void {
  const own = options.params
  const foreign = { ...options.params, id: FOREIGN_RUN }

  describe(`${name} (Runner-Ausweis)`, () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const rejected = (run: MachineRun) => {
      expect(run.status).toBe(401)
      expect(run.reads.includes(RUNS_TABLE), 'der Lauf wird nicht gelesen').toBe(false)
      expect(run.fileRead).toBe(false)
    }

    for (const credential of ['none', 'malformed', 'wrong-secret', 'unknown-runner', 'disabled'] as const) {
      it(`Ausweis ${credential}: 401, Lauf nicht gelesen`, async () => {
        rejected(await probeMachineRoute(load, { credential, params: own }))
      })
    }

    it('Betreiber-Sitzung ohne Ausweis: 401, Lauf nicht gelesen', async () => {
      rejected(await probeMachineRoute(load, { credential: 'none', operatorSession: true, params: own }))
    })

    it('richtiger Ausweis, eigener Lauf: 200', async () => {
      const run = await probeMachineRoute(load, { credential: 'own', params: own })
      expect(run.status, run.error?.statusText).toBe(200)
    })

    it('richtiger Ausweis, fremder Lauf: 403 not_your_run, keine Datei gelesen', async () => {
      const run = await probeMachineRoute(load, { credential: 'own', params: foreign })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('not_your_run')
      expect(run.fileRead).toBe(false)
    })

    it('Ausweis des anderen Runners für den eigenen Lauf: 403 not_your_run', async () => {
      const run = await probeMachineRoute(load, { credential: 'foreign', params: own })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('not_your_run')
      expect(run.fileRead).toBe(false)
    })
  })
}
