import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PLATFORM_QUOTA_PLANS } from '../shared/quotaPlans.ts'
import { fillMissingPlanLimits, type TenantPlanLimits } from '../../../packages/control/shared/types/tenantRecord'
import { mapTenantRowToContext } from '../../../packages/control/server/utils/tenantsResolver'

/**
 * KONTINGENT-ZAHLEN IM KATALOG (KK1 c) — dieselben Zahlen vorher und nachher.
 *
 *  1. Die Zahlen sind unverändert aus `app/app.config.ts` umgezogen (die
 *     Tabelle unten ist der Stand von `main` vor dem Umzug, abgeschrieben am
 *     2026-11-22), und die app.config liest genau diese Datei.
 *  2. RÜCKFALL: ohne Katalog-Zeilen (Production vor control-042) rechnet die
 *     echte Bremse `tenantLimitsFor` mit diesen Zahlen — wie vorher.
 *  3. NACH control-042 (Katalog gefüllt mit `fillMissingPlanLimits`, gelesen
 *     über den echten `mapTenantRowToContext`) rechnet sie mit DENSELBEN
 *     Zahlen, für jeden Plan und jede Art.
 *  4. Gegenproben: eine abweichende Katalog-Zahl gewinnt, und das Füllen
 *     überschreibt sie nicht; ein Silo und ein fremder Plan bekommen nichts
 *     Neues.
 */

const BEFORE_KK1C = {
  basic: {
    comments: { perDay: 200, total: 5_000 },
    pages: { perDay: 50, total: 300 },
  },
  personal: {
    comments: { perDay: 1000, total: 50_000 },
    pages: { perDay: 50, total: 300 },
    events: { perDay: 50, total: 1_000 },
    media: { perDay: 50, total: 300 },
  },
  pro: {
    comments: { perDay: 5000, total: 250_000 },
    pages: { perDay: 50, total: 300 },
    events: { perDay: 200, total: 10_000 },
    media: { perDay: 200, total: 1_000 },
  },
}

const KINDS = ['comments', 'pages', 'events', 'media']
const PLANS = ['basic', 'personal', 'pro'] as const

type Limits = TenantPlanLimits | undefined
let tenantLimitsFor: (event: unknown, kind: string) => Limits
let appConfig: { pukalani: { tenancy: { quota: { enabled: boolean, plans: unknown } } } }

beforeAll(async () => {
  vi.stubGlobal('defineAppConfig', (config: unknown) => config)
  appConfig = (await import('../app/app.config')).default as typeof appConfig
  vi.stubGlobal('useAppConfig', () => appConfig)
  vi.stubGlobal('useTenant', (event: { tenant: unknown }) => event.tenant)
  tenantLimitsFor = (await import('../../../packages/core/server/utils/tenantQuota')).tenantLimitsFor as typeof tenantLimitsFor
})

function poolRow(plan: string) {
  return { $id: 'c-probe', mode: 'pool' as const, projectId: 'account', tenantId: 'c-probe', status: 'active' as const, plan: plan as 'basic' }
}

/** Was die Bremse für eine Community mit diesem Plan und Katalog rechnet. */
function effective(plan: string, catalog: Record<string, Record<string, TenantPlanLimits>>, kind: string): Limits {
  const tenant = mapTenantRowToContext(poolRow(plan), catalog)
  return tenantLimitsFor({ tenant }, kind)
}

/** Der Katalog nach control-042 auf einer leeren Tabelle. */
function filledCatalog(): Record<string, Record<string, TenantPlanLimits>> {
  const catalog: Record<string, Record<string, TenantPlanLimits>> = {}
  for (const plan of PLANS) catalog[plan] = fillMissingPlanLimits({}, PLATFORM_QUOTA_PLANS[plan]).limits
  return catalog
}

describe('Kontingent-Vorgabe der Platform-App (KK1 c)', () => {
  it('die Zahlen sind dieselben wie vor dem Umzug', () => {
    expect(PLATFORM_QUOTA_PLANS).toEqual(BEFORE_KK1C)
    expect(Object.keys(PLATFORM_QUOTA_PLANS)).toEqual(['basic', 'personal', 'pro'])
  })

  it('app.config liest genau diese Datei, Quota bleibt an', () => {
    expect(appConfig.pukalani.tenancy.quota.enabled).toBe(true)
    expect(appConfig.pukalani.tenancy.quota.plans).toBe(PLATFORM_QUOTA_PLANS)
  })
})

describe('Bremse: Rückfall ohne Katalog und gleiche Zahlen mit Katalog', () => {
  it('ohne Katalog-Zeilen gelten die heutigen Zahlen (Production vor control-042)', () => {
    for (const plan of PLANS) {
      for (const kind of KINDS) {
        expect(effective(plan, {}, kind), `${plan}.${kind}`).toEqual(BEFORE_KK1C[plan][kind as keyof typeof BEFORE_KK1C[typeof plan]])
      }
    }
  })

  it('ein Katalog mit nur Kommentaren (der heutige Stand) ändert an Seiten, Terminen, Mediathek nichts', () => {
    const catalog = { personal: { comments: { perDay: 1000, total: 50_000 } } }
    expect(effective('personal', catalog, 'pages')).toEqual({ perDay: 50, total: 300 })
    expect(effective('personal', catalog, 'media')).toEqual({ perDay: 50, total: 300 })
  })

  it('nach control-042 rechnet die Bremse für jeden Plan und jede Art mit denselben Zahlen', () => {
    const catalog = filledCatalog()
    for (const plan of PLANS) {
      expect(Object.keys(catalog[plan]!)).toEqual(Object.keys(BEFORE_KK1C[plan]))
      for (const kind of KINDS) {
        expect(effective(plan, catalog, kind), `${plan}.${kind}`).toEqual(effective(plan, {}, kind))
      }
    }
  })

  it('Gegenprobe: eine Zahl im Katalog gewinnt über die Vorgabe', () => {
    const catalog = filledCatalog()
    catalog.pro!.pages = { perDay: 5, total: 10 }
    expect(effective('pro', catalog, 'pages')).toEqual({ perDay: 5, total: 10 })
    expect(effective('pro', {}, 'pages')).toEqual({ perDay: 50, total: 300 })
  })

  it('Gegenprobe: das Füllen überschreibt eine vorhandene Art nie', () => {
    const stored = { comments: { perDay: 7, total: 70 } }
    const { limits, added } = fillMissingPlanLimits(stored, PLATFORM_QUOTA_PLANS.personal)
    expect(limits.comments).toEqual({ perDay: 7, total: 70 })
    expect(added).toEqual(['pages', 'events', 'media'])
    expect(stored).toEqual({ comments: { perDay: 7, total: 70 } })
    expect(fillMissingPlanLimits(limits, PLATFORM_QUOTA_PLANS.personal).added).toEqual([])
  })

  it('Gegenprobe: ein Silo hat kein Kontingent, auch mit gefülltem Katalog', () => {
    const tenant = mapTenantRowToContext({ ...poolRow('pro'), mode: 'silo' }, filledCatalog())
    expect(tenantLimitsFor({ tenant }, 'comments')).toBeUndefined()
  })
})
