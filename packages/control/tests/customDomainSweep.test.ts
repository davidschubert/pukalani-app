import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { TablesDB } from 'node-appwrite'
import { appwriteRunLeaseStore } from '../../core/server/utils/runLease'
import type { CustomDomainSweepReport, CustomDomainSweepRouteResponse } from '../shared/customDomainSweep'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * BE-014 — DER FRISTEN-LAUF DER EIGENEN DOMAIN gegen die Renn-Ablage
 * (`support/raceTablesDB.ts`: jeder Aufruf gibt die Hand ab, `createRow` mit
 * vorhandener Id ist 409). Nachgebildet ist nur ploi.
 *
 * Bewiesen wird: `dry-run` schreibt GAR NICHTS und zählt richtig (auch die
 * Mails je Owner), `apply` stempelt/räumt/schaltet ab/leert, liest vor dem
 * Schreiben frisch, ein Fehlschlag hält die anderen nicht auf, zwei
 * gleichzeitige Läufe ⇒ einer arbeitet, einer `skipped`, ein zweiter Lauf
 * ändert nichts, und die Betreiber-Route schreibt nie.
 */

const race = createRaceTablesDB()
const { table, seed, failingUpdates } = race

const ploiRemoved: string[] = []
vi.mock('../server/utils/ploi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/ploi')>()
  return {
    ...actual,
    removePloiTenant: async (_config: unknown, host: string) => { ploiRemoved.push(host); return { ok: true, skipped: false, message: '' } },
  }
})

const logs: { level: string, name: string, detail: Record<string, unknown> }[] = []
let configuredSwitch: unknown = 'dry-run'

/** Zählt Schreibvorgänge auf `communities` (die Sperre in `system_runs` zählt extra). */
const writes: string[] = []
let afterCommunitiesList: (() => void) | null = null
const tablesDB = {
  ...race.tablesDB,
  async listRows(args: Parameters<typeof race.tablesDB.listRows>[0]) {
    const result = await race.tablesDB.listRows(args)
    if (args.tableId === 'communities' && afterCommunitiesList) {
      const hook = afterCommunitiesList
      afterCommunitiesList = null
      hook()
    }
    return result
  },
  async updateRow(args: Parameters<typeof race.tablesDB.updateRow>[0]) {
    writes.push(`${args.tableId}:update:${args.rowId}`)
    return await race.tablesDB.updateRow(args)
  },
  async createRow(args: Parameters<typeof race.tablesDB.createRow>[0]) {
    writes.push(`${args.tableId}:create:${args.rowId}`)
    return await race.tablesDB.createRow(args)
  },
  async deleteRow(args: Parameters<typeof race.tablesDB.deleteRow>[0]) {
    writes.push(`${args.tableId}:delete:${args.rowId}`)
    return await race.tablesDB.deleteRow(args)
  },
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { control: { customDomainSweep: configuredSwitch } } }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' }, customDomainDryRun: '1' }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('logEvent', (level: string, name: string, detail: Record<string, unknown> = {}) => { logs.push({ level, name, detail }) })
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('requirePermission', (event: H3Event, capability: string) => {
  const granted = (event.context as { permissions?: string[] }).permissions ?? []
  if (!granted.includes(capability)) throw Object.assign(new Error('Forbidden'), { status: 403, statusCode: 403 })
})

const { runCustomDomainSweep } = await import('../server/utils/customDomainSweep')
const route = (await import('../server/api/control/sweeps/custom-domain.get')).default as unknown as (event: H3Event) => Promise<CustomDomainSweepRouteResponse>

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const PLOI = { token: 't', baseUrl: 'https://ploi.invalid', serverId: '1', siteId: '2', dryRun: false }

function deps(withLease = true) {
  return {
    tablesDB: tablesDB as unknown as TablesDB,
    databaseId: 'main',
    ploi: PLOI,
    leaseStore: withLease ? appwriteRunLeaseStore({ tablesDB: tablesDB as unknown as TablesDB, databaseId: 'main', tableId: 'system_runs' }) : null,
  }
}

function owner(communityId: string, n: number, extra: Record<string, unknown> = {}) {
  seed('community_members', {
    $id: `m-${communityId}-${n}`, communityId, runtimeProjectId: 'account', runtimeUserId: `u-${communityId}-${n}`,
    role: 'owner', status: 'active', ...extra,
  })
}

/** Bezahltes Pro, freigegeben, aktive Domain — Abweichungen je Fall. */
function community(id: string, overrides: Record<string, unknown> = {}) {
  seed('communities', {
    $id: id, name: `Name ${id}`, host: `${id}.pukalani.app`, mode: 'pool', projectId: 'account', tenantId: `t-${id}`,
    status: 'active', plan: 'pro', trialEndsAt: null, billingStatus: 'active', suspension: '',
    customDomain: `${id}.de`, customDomainStatus: 'active', customDomainApproved: true,
    customDomainVerifiedAt: iso(NOW - 40 * DAY), customDomainActivatedAt: iso(NOW - 40 * DAY),
    customDomainToken: 'a'.repeat(32), customDomainError: '',
    customDomainClaimedAt: iso(NOW - 40 * DAY), customDomainGraceEndsAt: null, customDomainPausedAt: null,
    ...overrides,
  })
}

function world() {
  community('c-start', { plan: 'basic', billingStatus: null })
  owner('c-start', 1)
  owner('c-start', 2)
  owner('c-start', 3, { status: 'removed' }) // zählt nicht
  owner('c-start', 4, { role: 'admin' }) // zählt nicht
  community('c-clear', { customDomainGraceEndsAt: iso(NOW + 4 * DAY) })
  owner('c-clear', 1)
  community('c-pause', { plan: 'basic', billingStatus: null, customDomainGraceEndsAt: iso(NOW - 60_000) })
  owner('c-pause', 1)
  community('c-remind', { plan: 'basic', billingStatus: null, customDomainGraceEndsAt: iso(NOW + 2 * DAY) })
  owner('c-remind', 1)
  owner('c-remind', 2)
  owner('c-remind', 3)
  community('c-running', { plan: 'basic', billingStatus: null, customDomainGraceEndsAt: iso(NOW + 9 * DAY) })
  community('c-stamp', { customDomainStatus: 'pending_dns', customDomainVerifiedAt: null, customDomainClaimedAt: null })
  community('c-expire', { customDomain: 'www.c-expire.de', customDomainStatus: 'pending_dns', customDomainVerifiedAt: null, customDomainClaimedAt: iso(NOW - 20 * DAY), customDomainApproved: true })
  community('c-ok')
  community('c-disabled', { status: 'disabled', plan: 'basic' })
  community('c-nodomain', { customDomain: '', customDomainStatus: 'none' })
  community('c-null', { customDomain: null, customDomainStatus: null })
}

function communityWrites(): string[] {
  return writes.filter(entry => entry.startsWith('communities:'))
}

function asReport(result: CustomDomainSweepReport | { skipped: true }): CustomDomainSweepReport {
  if ('skipped' in result) throw new Error('unerwartet übersprungen')
  return result
}

beforeEach(() => {
  race.reset()
  writes.length = 0
  logs.length = 0
  ploiRemoved.length = 0
  afterCommunitiesList = null
  configuredSwitch = 'dry-run'
  world()
})

describe('dry-run', () => {
  it('schreibt GAR NICHTS (auch keine Sperre) und zählt jede Handlung', async () => {
    const report = asReport(await runCustomDomainSweep({ mode: 'dry-run', now: NOW }, deps(false)))
    expect(writes).toEqual([])
    expect(ploiRemoved).toEqual([])
    expect(report.mode).toBe('dry-run')
    expect(report.checked).toBe(9) // alle mit Domain, ohne c-nodomain/c-null
    expect(report.counts).toEqual({ startGrace: 1, clearGrace: 1, pause: 1, stampClaim: 1, expireClaim: 1, failed: 0 })
    // Mails = AKTIVE OWNER: c-start hat 2 (ein entfernter, ein Admin zählen nicht),
    // c-remind (Frist endet in 2 Tagen) hat 3.
    expect(report.mails).toEqual({ start: 2, ending: 3 })
    const byId = Object.fromEntries(report.items.map(item => [item.communityId, item]))
    expect(byId['c-start']).toMatchObject({ action: 'start_grace', domain: 'c-start.de', host: 'c-start.pukalani.app', owners: 2, graceEndsAt: iso(NOW + 14 * DAY) })
    expect(byId['c-remind']).toMatchObject({ action: 'remind', owners: 3 })
    expect(byId['c-running']).toBeUndefined()
    expect(byId['c-ok']).toBeUndefined()
    expect(byId['c-disabled']).toBeUndefined()
  })

  it('schreibt eine Zusammenfassung, keine Zeile je Handlung', async () => {
    await runCustomDomainSweep({ mode: 'dry-run', now: NOW }, deps(false))
    expect(logs.map(log => log.name)).toEqual(['custom_domain.sweep_dry_run'])
    expect(logs[0]!.detail).toMatchObject({ checked: 9, startGrace: 1, pause: 1, mailsStart: 2, mailsEnding: 3 })
  })
})

describe('apply', () => {
  it('stempelt, räumt, schaltet ab und leert — die Freigabe bleibt', async () => {
    const report = asReport(await runCustomDomainSweep({ mode: 'apply', now: NOW }, deps()))
    expect(report.counts).toEqual({ startGrace: 1, clearGrace: 1, pause: 1, stampClaim: 1, expireClaim: 1, failed: 0 })
    const rows = table('communities')
    expect(rows.get('c-start')!.customDomainGraceEndsAt).toBe(iso(NOW + 14 * DAY))
    expect(rows.get('c-clear')!.customDomainGraceEndsAt).toBeNull()
    expect(rows.get('c-pause')).toMatchObject({ customDomainStatus: 'paused', customDomainPausedAt: iso(NOW), customDomainGraceEndsAt: null, customDomain: 'c-pause.de' })
    expect(rows.get('c-stamp')!.customDomainClaimedAt).toBe(iso(NOW))
    expect(rows.get('c-expire')).toMatchObject({ customDomain: '', customDomainStatus: 'none', customDomainToken: '', customDomainClaimedAt: null, customDomainApproved: true })
    expect(ploiRemoved.sort()).toEqual(['c-expire.de', 'www.c-expire.de'])
    expect(rows.get('c-running')!.customDomainStatus).toBe('active')
    expect(rows.get('c-disabled')!.customDomainStatus).toBe('active')
    // Die Sperre ist am Ende wieder weg (keine Zeilen-Halde in system_runs).
    expect([...table('system_runs').values()]).toEqual([])
  })

  it('loggt je Handlung eine Zeile mit Community und Host, ohne Adresse', async () => {
    await runCustomDomainSweep({ mode: 'apply', now: NOW }, deps())
    const names = logs.map(log => log.name).sort()
    expect(names).toEqual([
      'custom_domain.claim_expired',
      'custom_domain.claim_stamped',
      'custom_domain.grace_cleared',
      'custom_domain.grace_started',
      'custom_domain.paused',
    ])
    for (const log of logs) {
      expect(Object.keys(log.detail).sort()).toEqual(['communityId', 'host'])
      expect(JSON.stringify(log.detail)).not.toContain('@')
    }
  })

  it('liest vor dem Schreiben frisch: ein Kauf zwischen Liste und Schreiben ⇒ kein Abschalten', async () => {
    afterCommunitiesList = () => {
      Object.assign(table('communities').get('c-pause')!, { plan: 'pro', billingStatus: 'active', customDomainApproved: true })
    }
    const report = asReport(await runCustomDomainSweep({ mode: 'apply', now: NOW }, deps()))
    expect(table('communities').get('c-pause')!.customDomainStatus).toBe('active')
    expect(report.counts.pause).toBe(0)
    expect(communityWrites()).not.toContain('communities:update:c-pause')
  })

  it('ein Fehlschlag hält die anderen nicht auf und wird gezählt', async () => {
    failingUpdates.set('c-start', () => true)
    const report = asReport(await runCustomDomainSweep({ mode: 'apply', now: NOW }, deps()))
    expect(report.counts.failed).toBe(1)
    expect(report.counts.pause).toBe(1)
    expect(table('communities').get('c-pause')!.customDomainStatus).toBe('paused')
    const failed = logs.filter(log => log.name === 'custom_domain.sweep_failed')
    expect(failed).toEqual([{ level: 'error', name: 'custom_domain.sweep_failed', detail: { communityId: 'c-start' } }])
  })

  it('zwei gleichzeitige Läufe: einer arbeitet, einer ist übersprungen', async () => {
    const [a, b] = await Promise.all([
      runCustomDomainSweep({ mode: 'apply', now: NOW }, deps()),
      runCustomDomainSweep({ mode: 'apply', now: NOW }, deps()),
    ])
    const skipped = [a, b].filter(result => 'skipped' in result)
    expect(skipped).toHaveLength(1)
    // Jede Zeile genau einmal geschrieben.
    const updates = communityWrites()
    expect(new Set(updates).size).toBe(updates.length)
    expect(updates).toHaveLength(5)
  })

  it('ein zweiter Lauf direkt danach ändert nichts', async () => {
    await runCustomDomainSweep({ mode: 'apply', now: NOW }, deps())
    writes.length = 0
    const report = asReport(await runCustomDomainSweep({ mode: 'apply', now: NOW + 60_000 }, deps()))
    expect(communityWrites()).toEqual([])
    expect(report.counts).toEqual({ startGrace: 0, clearGrace: 0, pause: 0, stampClaim: 0, expireClaim: 0, failed: 0 })
  })

  it('ohne Sperr-Ablage läuft apply nicht', async () => {
    await expect(runCustomDomainSweep({ mode: 'apply', now: NOW }, deps(false))).rejects.toThrow()
    expect(communityWrites()).toEqual([])
  })
})

describe('Betreiber-Route GET /api/control/sweeps/custom-domain', () => {
  const event = (permissions: string[]) => ({ context: { permissions } }) as unknown as H3Event

  it('403 ohne sites.manage', async () => {
    await expect(route(event([]))).rejects.toMatchObject({ status: 403 })
  })

  it('zählt nur — auch wenn der Schalter auf apply steht', async () => {
    configuredSwitch = 'apply'
    const response = await route(event(['sites.manage']))
    expect(writes).toEqual([])
    expect(response.configuredMode).toBe('apply')
    expect(response.mode).toBe('dry-run')
    expect(response.counts.pause).toBe(1)
    expect(table('communities').get('c-pause')!.customDomainStatus).toBe('active')
  })

  it('unbekannter Schalterwert wird als off gemeldet', async () => {
    configuredSwitch = 'scharf'
    expect((await route(event(['sites.manage']))).configuredMode).toBe('off')
  })
})
