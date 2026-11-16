import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BE-014 — DER SCHALTER `pukalani.control.customDomainSweep` am Zeit-Lauf.
 *
 * `off` (und jeder unbekannte Wert) ⇒ der Lauf meldet sich GAR NICHT an
 * (sonst hielte ihn der Wächter für überfällig). Sonst: belegte Sperre ⇒
 * `skipped`, Fehlschläge ⇒ der Takt wirft (der Alarm zählt ihn als
 * gescheitert), und der Lauf bekommt den Modus des Schalters.
 */

const runSweep = vi.fn()
vi.mock('../server/utils/customDomainSweep', async (importOriginal) => ({
  ...await importOriginal<typeof import('../server/utils/customDomainSweep')>(),
  runCustomDomainSweep: (...args: unknown[]) => runSweep(...args),
}))
vi.mock('../server/utils/trialSweep', () => ({ runTrialSweep: vi.fn() }))
vi.mock('../server/utils/inviteRequestPrune', () => ({ pruneInviteRequests: vi.fn() }))
vi.mock('../server/utils/pastDueSweep', () => ({ runPastDueSweep: vi.fn() }))
vi.mock('../server/utils/abuseReportPrune', () => ({ eraseStaleReporterEmails: vi.fn() }))

interface Job { name: string, everyMs: number, firstRunMs?: number, run: () => Promise<'skipped' | undefined> }
const jobs: Job[] = []
let configuredSwitch: unknown

vi.stubGlobal('defineNitroPlugin', (fn: () => void) => fn)
vi.stubGlobal('defineTimedJob', (job: Job) => { jobs.push(job) })
vi.stubGlobal('useAppConfig', () => ({ pukalani: { control: { customDomainSweep: configuredSwitch } } }))

const plugin = (await import('../server/plugins/trial-sweep')).default as unknown as () => void

function sweepJob(): Job | undefined {
  return jobs.find(job => job.name === 'custom-domain-sweep')
}

beforeEach(() => {
  jobs.length = 0
  runSweep.mockReset()
})

describe('Schalter', () => {
  it.each([['off'], [undefined], ['scharf'], ['APPLY']])('%s ⇒ nicht angemeldet (die anderen vier schon)', (value) => {
    configuredSwitch = value
    plugin()
    expect(sweepJob()).toBeUndefined()
    expect(jobs.map(job => job.name)).toEqual(['trial-sweep', 'invite-request-prune', 'past-due-sweep', 'reporter-email-prune'])
  })

  it.each([['dry-run'], ['apply']])('%s ⇒ angemeldet, stündlich, versetzt, mit diesem Modus', async (value) => {
    configuredSwitch = value
    plugin()
    const job = sweepJob()!
    expect(job.everyMs).toBe(60 * 60 * 1000)
    expect(job.firstRunMs).toBe(60 * 1000)
    runSweep.mockResolvedValue({ counts: { failed: 0 } })
    await expect(job.run()).resolves.toBeUndefined()
    expect(runSweep).toHaveBeenCalledWith({ mode: value })
  })
})

describe('Ergebnis des Takts', () => {
  beforeEach(() => {
    configuredSwitch = 'apply'
    plugin()
  })

  it('belegte Sperre ⇒ skipped', async () => {
    runSweep.mockResolvedValue({ skipped: true })
    await expect(sweepJob()!.run()).resolves.toBe('skipped')
  })

  it('Fehlschläge ⇒ der Takt wirft', async () => {
    runSweep.mockResolvedValue({ counts: { failed: 2 } })
    await expect(sweepJob()!.run()).rejects.toThrow(/2 Fehlschläge/)
  })
})
