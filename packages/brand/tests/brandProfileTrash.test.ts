import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND_CHECK_ERASURE_RETENTION_DAYS } from '../server/utils/brandCheckErasure'
import {
  BRAND_PROFILE_TRASH_DAYS,
  BRAND_PROFILE_TRASH_JOB,
  brandProfilePurgeAt,
  brandProfileTrashDaysLeft,
  brandProfileTrashState,
  decideBrandProfileTrash,
  isBrandProfileErased,
} from '../shared/brandProfileTrash'

/**
 * DER PAPIERKORB DER MARKEN (WH1) — die pure Regel als Tabelle, mit
 * gestellter Uhr, und die Verdrahtung (Schalter, Takt, Kennung).
 */

const here = dirname(fileURLToPath(import.meta.url))
const NOW = new Date('2026-11-25T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs).toISOString()

describe('brandProfileTrashState', () => {
  it.each([
    ['nie gelöscht (undefined)', undefined, 'active'],
    ['nie gelöscht (null)', null, 'active'],
    ['leerer Text', '', 'active'],
    ['gerade gelöscht', ago(0), 'trashed'],
    ['vor 89 Tagen', ago(89), 'trashed'],
    ['genau 90 Tage — noch nicht „nach" 90 Tagen', ago(90), 'trashed'],
    ['90 Tage und eine Sekunde', ago(90, 1000), 'due'],
    ['vor einem Jahr', ago(365), 'due'],
    ['unlesbar ⇒ versteckt, nie fällig', 'kein-datum', 'trashed'],
    ['Appwrite-Form mit +00:00', ago(91).replace('Z', '+00:00'), 'due'],
  ] as const)('%s ⇒ %s', (_name, erasedAt, expected) => {
    expect(brandProfileTrashState({ erasedAt }, NOW)).toBe(expected)
  })

  it('isBrandProfileErased folgt derselben Regel', () => {
    expect(isBrandProfileErased({ erasedAt: null })).toBe(false)
    expect(isBrandProfileErased({ erasedAt: 'kein-datum' })).toBe(true)
  })

  it('der Lauf löscht genau die fälligen', () => {
    expect(decideBrandProfileTrash({ erasedAt: ago(91) }, NOW)).toBe('expired')
    expect(decideBrandProfileTrash({ erasedAt: ago(10) }, NOW)).toBeNull()
    expect(decideBrandProfileTrash({ erasedAt: null }, NOW)).toBeNull()
    expect(decideBrandProfileTrash({ erasedAt: 'kein-datum' }, NOW)).toBeNull()
  })
})

describe('Anzeige: Löschtag und verbleibende Tage', () => {
  it('Löschtag = Zeitpunkt + 90 Tage', () => {
    expect(brandProfilePurgeAt('2026-11-01T00:00:00.000Z')).toBe('2027-01-30T00:00:00.000Z')
    expect(brandProfilePurgeAt(null)).toBeNull()
    expect(brandProfilePurgeAt('kein-datum')).toBeNull()
  })

  it.each([
    [ago(0), 90],
    [ago(5), 85],
    [ago(89, 1000), 1],
    [ago(120), 0],
    ['kein-datum', 90],
  ] as const)('%s ⇒ noch %i Tage', (erasedAt, left) => {
    expect(brandProfileTrashDaysLeft(erasedAt, NOW)).toBe(left)
  })
})

describe('Kopplungen', () => {
  it('die Frist ist dieselbe wie die der Prüfergebnisse einer gelöschten Marke', () => {
    expect(BRAND_PROFILE_TRASH_DAYS).toBe(BRAND_CHECK_ERASURE_RETENTION_DAYS)
  })

  it('der Layer gibt `off` vor; branding.supply zählt nur', () => {
    const layer = readFileSync(join(here, '..', 'app', 'app.config.ts'), 'utf8')
    const app = readFileSync(join(here, '..', '..', '..', 'apps', 'branding', 'app', 'app.config.ts'), 'utf8')
    expect(layer).toContain(`profileTrash: 'off' as RowRetentionMode,`)
    expect(app).toContain(`profileTrash: 'count',`)
  })

  it('der Takt trägt die Kennung des Laufs, und ops/timed-jobs.conf kennt sie', () => {
    const source = readFileSync(join(here, '..', 'server', 'plugins', 'brand-profile-trash.ts'), 'utf8')
    expect(source).toContain(`name: '${BRAND_PROFILE_TRASH_JOB}',`)
    const conf = readFileSync(join(here, '..', '..', '..', 'ops', 'timed-jobs.conf'), 'utf8')
    expect(conf).toMatch(new RegExp(`^branding\\s+${BRAND_PROFILE_TRASH_JOB}$`, 'm'))
  })
})

describe('server/plugins/brand-profile-trash.ts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function plugin(mode: unknown): Promise<unknown[]> {
    const jobs: unknown[] = []
    vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { profileTrash: mode } } }))
    vi.stubGlobal('logEvent', () => {})
    vi.stubGlobal('retentionModeOf', (_job: string, raw: unknown) => (['off', 'count', 'apply'].includes(String(raw)) ? raw : 'off'))
    vi.stubGlobal('retentionTick', () => async () => undefined)
    vi.stubGlobal('defineTimedJob', (job: unknown) => jobs.push(job))
    vi.resetModules()
    const run = (await import('../server/plugins/brand-profile-trash')).default as unknown as () => void
    run()
    return jobs
  }

  it('aus ⇒ kein Takt', async () => {
    expect(await plugin(undefined)).toEqual([])
    expect(await plugin('off')).toEqual([])
  })

  it('zählen ⇒ stündlich, erster Lauf nach 12 Minuten', async () => {
    const [job] = await plugin('count')
    expect(job).toMatchObject({ name: 'brand-profile-trash', everyMs: 60 * 60 * 1000, firstRunMs: 12 * 60 * 1000, unref: true })
  })
})
