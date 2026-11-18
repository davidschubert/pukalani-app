import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireRunLease } from '../../core/server/utils/runLease'
import { requirePlanProduct } from '../../core/server/utils/tenantPlanProducts'
import {
  describeRoleGateToDoor,
  describeRoleGatedRoute,
  probeRoute,
  resetCommunityWorld,
  type RouteProbe,
  type Who,
} from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor } from '../../core/tests/support/doorFake'
import { PAGES_TABLE } from '../shared/types/page'
import { ADMIN_PAGES_MAX, PAGE_DELETE_MAX_ROUNDS } from '../server/utils/pageRows'

/**
 * ROLLEN-PROBEN FÜR DIE SEITEN-VERWALTUNG (OPS-009, N14).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`). Die Erwartungen stehen hier
 * Person für Person ausgeschrieben, abgelesen aus der Rechte-Matrix
 * (`core/shared/communityAuthz.ts`) — nie berechnet:
 *  - `pages.manage` (Seiten speichern, lesen, löschen, übersetzen lassen):
 *    Editor, Admin, Owner; der Betreiber im protokollierten Not-Zugang. Der
 *    Moderator NICHT — Seiten sind Inhalt, keine Moderation.
 *
 * Zusätzlich je Route: über WELCHE Klinke der Datentür gelesen bzw. gelöscht
 * wird, und die beiden ehrlichen Antworten der Verwaltung (`truncated`,
 * `delete_incomplete`), die bisher nur an ihrer Hilfe `server/utils/pageRows.ts`
 * belegt waren.
 *
 * Die Routen hinter `branding.manage` (Menü, Weiterleitungen, Sucheintrag)
 * stehen in `route-roles-website.test.ts`.
 */

const MANAGE = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
} as const

/** Alle, die das Tor abweist — inklusive der drei Personen ohne Rolle. */
const REJECTED: readonly Who[] = ['guest', 'stranger', 'removed', 'moderator', 'member']

const loadList = () => import('../server/api/pages/index.get')
const loadDetail = () => import('../server/api/pages/[slug].get')
const loadDelete = () => import('../server/api/pages/[slug].delete')
const loadTranslate = () => import('../server/api/pages/translate.post')
const loadSave = () => import('../server/api/pages/index.put')

/** Ein gültiger Rumpf für `PUT /api/pages` (neue englische Fassung). */
const SAVE_BODY = { slug: 'imprint', locale: 'en', title: 'Imprint', body: 'Legal notice.', status: 'draft' }

/** Was hinter der Tür eines Lese-Handlers noch gebraucht wird. */
const READ_GLOBALS = {
  tenantCacheScope: () => 't-a',
  guidelinesFallbackEnabled: () => false,
}

function pageRow(id: string, slug: string, locale: string, status = 'published'): FakeRow {
  return { $id: id, communityId: 'c-a', slug, locale, title: `${slug} ${locale}`, body: 'Text', status, sortOrder: 10 }
}

interface DoorOpen { as?: string, actor?: string }

type DoorOpener = NonNullable<RouteProbe['door']>

/** Protokolliert, mit welcher Klinke (und welchem Handelnden) die Tür geöffnet wurde. */
function recording(open: DoorOpener) {
  const opens: DoorOpen[] = []
  return {
    opens,
    door: (...[event, options]: Parameters<DoorOpener>) => {
      opens.push({ as: options?.as, actor: options?.actor })
      return open(event, options)
    },
  }
}

function limitOf(queries: string[] = []): number {
  for (const raw of queries) {
    const query = JSON.parse(raw) as { method: string, values?: unknown[] }
    if (query.method === 'limit') return Number(query.values?.[0] ?? 0)
  }
  return 25
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

// ── Rollen-Tore ─────────────────────────────────────────────────────────────

describeRoleGateToDoor('GET /api/pages', loadList, MANAGE, { globals: READ_GLOBALS })

describeRoleGateToDoor('GET /api/pages/:slug', loadDetail, MANAGE, {
  params: { slug: 'imprint' },
  globals: READ_GLOBALS,
})

describeRoleGateToDoor('DELETE /api/pages/:slug', loadDelete, MANAGE, {
  params: { slug: 'imprint' },
  globals: { tenantCacheScope: () => 't-a', forgetPublicPages: () => {} },
})

describeRoleGateToDoor('PUT /api/pages', loadSave, MANAGE, {
  body: SAVE_BODY,
  globals: { forgetPublicPages: () => {} },
})

// ── Klinken ─────────────────────────────────────────────────────────────────

describe('Seiten-Verwaltung: über welche Klinke gelesen und gelöscht wird', () => {
  it.each(['editor', 'operator'] as const)('GET /api/pages (%s): Operator-Klinke ohne Handelnden', async (who) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de')] } })
    const { opens, door } = recording(rows.tenantDb)
    const run = await probeRoute(loadList, { who, door, globals: READ_GLOBALS })

    expect(run.status).toBe(200)
    expect(opens).toEqual([{ as: 'operator', actor: undefined }])
    expect(run.result).toMatchObject({ groups: [{ slug: 'imprint' }], truncated: false })
  })

  it.each(['editor', 'operator'] as const)('GET /api/pages/:slug (%s): Operator-Klinke ohne Handelnden', async (who) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de'), pageRow('pg-2', 'about', 'de')] } })
    const { opens, door } = recording(rows.tenantDb)
    const run = await probeRoute(loadDetail, { who, door, params: { slug: 'imprint' }, globals: READ_GLOBALS })

    expect(run.status).toBe(200)
    expect(opens).toEqual([{ as: 'operator', actor: undefined }])
    expect(run.result).toEqual({
      rows: [{ locale: 'de', title: 'imprint de', body: 'Text', status: 'published', sortOrder: 10 }],
      isTemplate: false,
    })
  })

  it.each([
    ['editor', 'member'],
    ['owner', 'member'],
    ['operator', 'operator'],
  ] as const)('DELETE /api/pages/:slug (%s): Operator-Klinke, Handelnder %s aus dem Tor', async (who, actor) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de'), pageRow('pg-2', 'imprint', 'en'), pageRow('pg-3', 'about', 'de')] } })
    const { opens, door } = recording(rows.tenantDb)
    const forgetPublicPages = vi.fn()
    const run = await probeRoute(loadDelete, {
      who,
      door,
      params: { slug: 'imprint' },
      globals: { tenantCacheScope: () => 't-a', forgetPublicPages },
    })

    expect(run.status).toBe(200)
    expect(run.result).toEqual({ deleted: 2 })
    // Die zweite Tür: der letzte KI-Vorschlag der Seite wird geleert (LL1 d,
    // `pages_runs`) — fest die Operator-Klinke, ohne Handelnden.
    expect(opens).toEqual([{ as: 'operator', actor }, { as: 'operator', actor: undefined }])
    expect(rows.rows[PAGES_TABLE]!.map(row => row.$id)).toEqual(['pg-3'])
    expect(forgetPublicPages).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['editor', 'member'],
    ['owner', 'member'],
    ['operator', 'operator'],
  ] as const)('PUT /api/pages (%s): Operator-Klinke, Handelnder %s aus dem Tor', async (who, actor) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de')] } })
    const { opens, door } = recording(rows.tenantDb)
    const forgetPublicPages = vi.fn()
    const run = await probeRoute(loadSave, { who, door, body: SAVE_BODY, globals: { forgetPublicPages } })

    expect(run.status).toBe(200)
    expect(opens).toEqual([{ as: 'operator', actor }])
    expect(rows.calls.map(call => [call.handle, call.method])).toEqual([['operator', 'find'], ['operator', 'create']])
    expect(rows.rows[PAGES_TABLE]!.map(row => row.locale)).toEqual(['de', 'en'])
    expect(forgetPublicPages).toHaveBeenCalledTimes(1)
  })

  it.each(REJECTED)('PUT /api/pages (%s): abgewiesen, nichts geschrieben', async (who) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de')] } })
    const forgetPublicPages = vi.fn()
    const run = await probeRoute(loadSave, { who, door: rows.tenantDb, body: SAVE_BODY, globals: { forgetPublicPages } })

    expect([401, 403]).toContain(run.status)
    expect(rows.calls).toEqual([])
    expect(rows.rows[PAGES_TABLE]).toHaveLength(1)
    expect(forgetPublicPages).not.toHaveBeenCalled()
  })

  it.each(REJECTED)('DELETE /api/pages/:slug (%s): abgewiesen, nichts gelöscht', async (who) => {
    const rows = fakeDoor({ rows: { [PAGES_TABLE]: [pageRow('pg-1', 'imprint', 'de')] } })
    const run = await probeRoute(loadDelete, {
      who,
      door: rows.tenantDb,
      params: { slug: 'imprint' },
      globals: { tenantCacheScope: () => 't-a', forgetPublicPages: () => {} },
    })

    expect([401, 403]).toContain(run.status)
    expect(rows.calls).toEqual([])
    expect(rows.rows[PAGES_TABLE]).toHaveLength(1)
  })
})

// ── Ehrliche Antworten der Verwaltung ───────────────────────────────────────

describe('GET /api/pages — `truncated` sagt, dass das Netz gegriffen hat', () => {
  /** Eine Tür, die `total` Zeilen geblättert ausliefert (je Abfrage höchstens `limit`). */
  function pagingDoor(total: number) {
    let served = 0
    return {
      list: async (_table: string, queries?: string[]) => {
        const count = Math.max(0, Math.min(limitOf(queries), total - served))
        const rows = Array.from({ length: count }, (_, i) => pageRow(`pg-${served + i}`, `seite-${served + i}`, 'de'))
        served += count
        return { rows, total }
      },
    }
  }

  it('mehr Zeilen als das Netz: truncated true, die Liste endet am Netz', async () => {
    const run = await probeRoute(loadList, {
      who: 'editor',
      door: () => pagingDoor(ADMIN_PAGES_MAX + 500),
      globals: READ_GLOBALS,
    })

    expect(run.status).toBe(200)
    const result = run.result as { groups: unknown[], truncated: boolean }
    expect(result.truncated).toBe(true)
    expect(result.groups).toHaveLength(ADMIN_PAGES_MAX)
  })

  it('unter dem Netz: truncated false, alle Seiten da', async () => {
    const run = await probeRoute(loadList, {
      who: 'editor',
      door: () => pagingDoor(150),
      globals: READ_GLOBALS,
    })

    expect(run.status).toBe(200)
    const result = run.result as { groups: unknown[], truncated: boolean }
    expect(result.truncated).toBe(false)
    expect(result.groups).toHaveLength(150)
  })
})

describe('DELETE /api/pages/:slug — unvollständiges Löschen ist kein „gelöscht"', () => {
  it('bleibt nach dem Deckel eine Fassung stehen: 500 mit code delete_incomplete, Liste verworfen', async () => {
    let listed = 0
    let removed = 0
    // Eine Tür, an der das Löschen still nichts bewirkt — genau der Fall,
    // gegen den der Deckel in `removePageVersions` schützt.
    const stubborn = {
      list: async () => {
        listed += 1
        return { rows: [pageRow('pg-1', 'imprint', 'de')], total: 1 }
      },
      remove: async () => {
        removed += 1
      },
    }
    const forgetPublicPages = vi.fn()
    const run = await probeRoute(loadDelete, {
      who: 'editor',
      door: () => stubborn,
      params: { slug: 'imprint' },
      globals: { tenantCacheScope: () => 't-a', forgetPublicPages },
    })

    expect(run.status).toBe(500)
    expect(run.error?.data?.code).toBe('delete_incomplete')
    expect(run.result).toBeUndefined()
    expect(removed).toBe(PAGE_DELETE_MAX_ROUNDS)
    expect(listed).toBe(PAGE_DELETE_MAX_ROUNDS + 1)
    expect(forgetPublicPages).toHaveBeenCalledTimes(1)
  })
})

// ── KI-Übersetzung: zwei Produkt-Tore, dann das Rollen-Tor ──────────────────

/** Pläne aufsteigend; `pages` ab personal, `ai` ab pro (die Konfiguration der Probe). */
const PLAN_CONFIG = {
  pukalani: {
    tenancy: {
      quota: { plans: { basic: {}, personal: {}, pro: {} } },
      products: { pages: 'personal', ai: 'pro' },
    },
  },
}

const TRANSLATE_BODY = { slug: 'imprint', locale: 'en', title: 'Impressum', body: 'Angaben gemäß Gesetz.' }

/**
 * Die Attrappe des KI-Transports — es gibt in diesen Tests keinen echten
 * Aufruf. Seit LL1 d rechnet der Lauf hinter der Antwort: `runDetached` fängt
 * die Arbeit ab, damit eine Probe nie aus Versehen „rechnet". Was hinter der
 * Tür geschieht (Sperre, Lauf, Vorschlag), belegt `page-translate-run.test.ts`.
 */
function translateGlobals(options: { aiConfigured?: boolean } = {}) {
  const ai = vi.fn(async () => ({ title: 'Imprint', body: 'Legal notice.' }))
  return {
    ai,
    globals: {
      requirePlanProduct,
      useAppConfig: () => PLAN_CONFIG,
      isAiConfigured: async () => options.aiConfigured ?? true,
      aiSwitchedOn: async () => true,
      getEffectiveAiConfig: async () => ({ model: 'test-model' }),
      aiCompleteJson: ai,
      tenantCacheScope: () => 't-a',
      acquireRunLease,
      runDetached: () => {},
    },
  }
}

describeRoleGatedRoute('POST /api/pages/translate', loadTranslate, MANAGE, {
  body: TRANSLATE_BODY,
  tenantFields: { plan: 'pro' },
  globals: translateGlobals().globals,
})

describe('POST /api/pages/translate — abgewiesen wird VOR dem KI-Aufruf', () => {
  it.each(REJECTED)('%s (Plan pro): abgewiesen, keine KI', async (who) => {
    const { ai, globals } = translateGlobals()
    const run = await probeRoute(loadTranslate, { who, body: TRANSLATE_BODY, tenantFields: { plan: 'pro' }, globals })

    expect([401, 403]).toContain(run.status)
    expect(ai).not.toHaveBeenCalled()
  })

  it.each(['owner', 'operator'] as const)('%s, Plan personal (ohne ai): 404 vor dem Rollen-Tor, keine KI', async (who) => {
    const { ai, globals } = translateGlobals()
    const run = await probeRoute(loadTranslate, { who, body: TRANSLATE_BODY, tenantFields: { plan: 'personal' }, globals })

    expect(run.status).toBe(404)
    expect(run.guardPassed).toBe(false)
    expect(ai).not.toHaveBeenCalled()
  })

  it('Owner, Plan basic (ohne pages): 404 vor dem Rollen-Tor, keine KI', async () => {
    const { ai, globals } = translateGlobals()
    const run = await probeRoute(loadTranslate, { who: 'owner', body: TRANSLATE_BODY, tenantFields: { plan: 'basic' }, globals })

    expect(run.status).toBe(404)
    expect(run.guardPassed).toBe(false)
    expect(ai).not.toHaveBeenCalled()
  })

  it('Gast, Plan personal: das Produkt-Tor antwortet zuerst (404), keine KI', async () => {
    const { ai, globals } = translateGlobals()
    const run = await probeRoute(loadTranslate, { who: 'guest', body: TRANSLATE_BODY, tenantFields: { plan: 'personal' }, globals })

    expect(run.status).toBe(404)
    expect(ai).not.toHaveBeenCalled()
  })

  it('Editor, Plan pro, aber kein KI-Schlüssel: 503, keine KI', async () => {
    const { ai, globals } = translateGlobals({ aiConfigured: false })
    const run = await probeRoute(loadTranslate, { who: 'editor', body: TRANSLATE_BODY, tenantFields: { plan: 'pro' }, globals })

    expect(run.status).toBe(503)
    expect(run.guardPassed).toBe(true)
    expect(ai).not.toHaveBeenCalled()
  })

  it.each(MANAGE.allow)('%s, Plan pro: erreicht die Lauf-Tabelle über die Operator-Klinke, KEINE KI in der Anfrage, Seiten unberührt', async (who) => {
    const { ai, globals } = translateGlobals()
    const opens: DoorOpen[] = []
    const run = await probeRoute(loadTranslate, {
      who,
      body: TRANSLATE_BODY,
      tenantFields: { plan: 'pro' },
      globals,
      // Die Probe endet an der Tür (Tabelle „fehlt") — gefragt ist, WELCHE Tür.
      door: (_event, options) => {
        opens.push({ as: options?.as, actor: options?.actor })
        return { list: async (table: string) => {
          expect(table, 'die Übersetzung fasst die Seiten-Zeilen nicht an').toBe('pages_runs')
          throw Object.assign(new Error('Table not found'), { code: 404 })
        } }
      },
    })

    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBe('run_lease_unavailable')
    expect(ai).not.toHaveBeenCalled()
    expect(opens).toEqual([{ as: 'operator', actor: undefined }])
  })
})
