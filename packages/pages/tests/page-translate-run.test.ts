import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as lease from '../../core/server/utils/runLease'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import { requirePlanProduct } from '../../core/server/utils/tenantPlanProducts'
import {
  describeRoleGateToDoor,
  probeRoute,
  resetCommunityWorld,
  type ProbeRun,
} from '../../core/tests/support/participationHarness'
import {
  clampPageTranslateSuggestion,
  PAGE_TRANSLATE_NOTICE_MS,
  PAGE_TRANSLATE_RESULT_TTL_MS,
  PAGE_TRANSLATE_RUN_SCOPE,
  pageTranslateNoticeDue,
  parsePageTranslateRunDetail,
  toPageTranslateRunView,
} from '../shared/pageTranslateRun'
import type { PageTranslateRunResponse } from '../shared/types/page'
import { pageTranslateRunSubject } from '../server/utils/pageTranslateRun'
import { type PagesRunDoor, pagesRunDoor, type RunRow } from './support/pagesRunDoor'

/**
 * DIE SEITEN-ÜBERSETZUNG IM HINTERGRUND (LL1 d, 2026-11-18).
 *
 * Echte Routen, echte Core-Wachen (`participationHarness`), die ECHTE
 * Sperr-Logik des Core (`core/server/utils/runLease.ts`) über eine
 * nachgebaute Datentür, die beim Anlegen einer vorhandenen Id mit 409
 * antwortet wie Appwrite (`support/pagesRunDoor.ts`). Kein KI-Aufruf: der
 * Transport ist eine Attrappe, und die Arbeit hinter der Antwort fängt der
 * Test ab, um sie selbst anzustoßen.
 */

const MANAGE = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
} as const

const PLAN_CONFIG = {
  pukalani: {
    tenancy: {
      quota: { plans: { basic: {}, personal: {}, pro: {} } },
      products: { pages: 'personal', ai: 'pro' },
    },
  },
}

const BODY = { slug: 'imprint', locale: 'en', title: 'Impressum', body: 'Angaben gemäß Gesetz.' }
const NOW = Date.parse('2026-11-18T12:00:00.000Z')

const loadStart = () => import('../server/api/pages/translate.post')
const loadState = () => import('../server/api/pages/translate/[slug].get')
const loadDelete = () => import('../server/api/pages/[slug].delete')

interface World {
  runs: PagesRunDoor
  ai: ReturnType<typeof vi.fn>
  works: (() => Promise<void>)[]
  statuses: number[]
  community: { id: string, scope: string }
  aiOn: { value: boolean }
  globals: Record<string, unknown>
}

function world(options: { aiAnswer?: () => Promise<unknown> } = {}): World {
  const community = { id: 'c-a', scope: 't-a' }
  const runs = pagesRunDoor({ community: () => community.id })
  const ai = vi.fn(options.aiAnswer ?? (async () => ({ title: 'Imprint', body: 'Legal notice.' })))
  const works: (() => Promise<void>)[] = []
  const statuses: number[] = []
  const aiOn = { value: true }
  return {
    runs,
    ai,
    works,
    statuses,
    community,
    aiOn,
    globals: {
      requirePlanProduct,
      useAppConfig: () => PLAN_CONFIG,
      isAiConfigured: async () => true,
      aiSwitchedOn: async () => aiOn.value,
      getEffectiveAiConfig: async () => ({ model: 'test-model' }),
      aiCompleteJson: ai,
      tenantCacheScope: () => community.scope,
      setResponseStatus: (_event: unknown, status: number) => statuses.push(status),
      acquireRunLease: lease.acquireRunLease,
      touchRunLease: lease.touchRunLease,
      keepRunLeaseAlive: lease.keepRunLeaseAlive,
      // Die Arbeit hinter der Antwort: abfangen, der Test stößt sie an.
      runDetached: (_label: string, work: () => Promise<void>) => works.push(work),
      forgetPublicPages: () => {},
    },
  }
}

async function start(w: World, who: 'owner' | 'admin' | 'editor' | 'operator' = 'editor', body: unknown = BODY): Promise<ProbeRun> {
  return await probeRoute(loadStart, { who, body, tenantFields: { plan: 'pro' }, door: w.runs.door, globals: w.globals })
}

async function state(w: World, slug = 'imprint', who: 'editor' | 'owner' = 'editor'): Promise<ProbeRun> {
  return await probeRoute(loadState, { who, params: { slug }, door: w.runs.door, globals: w.globals })
}

async function drain(w: World): Promise<void> {
  const pending = w.works.splice(0)
  await Promise.all(pending.map(work => work()))
}

function runOf(run: ProbeRun) {
  return (run.result as PageTranslateRunResponse).run
}

/** Eine Lauf-Zeile von Hand (für Vorgänger, Fremde, alte Stände). */
function handRow(w: World, input: Partial<RunRow> & { seq: number }): RunRow {
  const subject = pageTranslateRunSubject(w.community.scope, 'imprint')
  const row: RunRow = {
    $id: lease.runLeaseRowId(PAGE_TRANSLATE_RUN_SCOPE, subject, input.seq),
    communityId: w.community.id,
    scope: PAGE_TRANSLATE_RUN_SCOPE,
    subject,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    heartbeatAt: new Date(Date.now() - 1000).toISOString(),
    finishedAt: '',
    outcome: '',
    detail: JSON.stringify({ locale: 'en', model: 'test-model', paid: false }),
    result: '',
    ...input,
  }
  w.runs.rows.push(row)
  return row
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── Der pure Teil ───────────────────────────────────────────────────────────

describe('pageTranslateRun (pur)', () => {
  const base = { startedAt: '2026-11-18T11:59:00.000Z', heartbeatAt: '2026-11-18T11:59:50.000Z', finishedAt: '', outcome: '', detail: '{"locale":"en","model":"m","paid":true}' }

  it('ohne Zeile: kein Lauf', () => {
    expect(toPageTranslateRunView(null, NOW)).toEqual({ state: 'none', startedAt: '', finishedAt: '', failure: '', locale: '', result: null })
  })

  it('frischer Herzschlag: läuft, ohne Vorschlag', () => {
    expect(toPageTranslateRunView({ ...base, result: '{"title":"T","body":"B"}' }, NOW)).toMatchObject({ state: 'running', locale: 'en', result: null })
  })

  it('Herzschlag älter als die Frist: abgebrochen', () => {
    const old = new Date(NOW - RUN_LEASE_STALL_MS - 1).toISOString()
    expect(toPageTranslateRunView({ ...base, heartbeatAt: old }, NOW).state).toBe('stalled')
  })

  it('fertig: der Vorschlag mit Zielsprache und Modell', () => {
    const finishedAt = new Date(NOW - 60_000).toISOString()
    expect(toPageTranslateRunView({ ...base, finishedAt, outcome: 'done', result: '{"title":"T","body":"B"}' }, NOW).result)
      .toEqual({ locale: 'en', model: 'm', title: 'T', body: 'B' })
  })

  it('fertig, aber älter als eine Stunde: kein Vorschlag mehr', () => {
    const finishedAt = new Date(NOW - PAGE_TRANSLATE_RESULT_TTL_MS - 1).toISOString()
    const view = toPageTranslateRunView({ ...base, finishedAt, outcome: 'done', result: '{"title":"T","body":"B"}' }, NOW)
    expect(view.state).toBe('done')
    expect(view.result).toBeNull()
  })

  it('kaputter Vorschlag ⇒ keiner; gescheitert ⇒ der kurze Grund', () => {
    const finishedAt = new Date(NOW - 1000).toISOString()
    expect(toPageTranslateRunView({ ...base, finishedAt, outcome: 'done', result: '{kaputt' }, NOW).result).toBeNull()
    expect(toPageTranslateRunView({ ...base, finishedAt, outcome: 'ai_endpoint_unavailable' }, NOW))
      .toMatchObject({ state: 'failed', failure: 'ai_endpoint_unavailable', result: null })
  })

  it('das Detail trägt nur Kennungen; Fremdes fällt weg', () => {
    expect(parsePageTranslateRunDetail('{"locale":"en","model":"m","paid":true,"title":"Geheim"}'))
      .toEqual({ locale: 'en', model: 'm', paid: true })
  })

  it('klemmt den Vorschlag wie das Formular', () => {
    const clamped = clampPageTranslateSuggestion({ title: ` ${'t'.repeat(300)} `, body: 'b'.repeat(13_000) })
    expect(clamped.title).toHaveLength(256)
    expect(clamped.body).toHaveLength(12_000)
  })

  it('weist nur auf junge Fehlschläge hin', () => {
    const young = new Date(NOW - 60_000).toISOString()
    const old = new Date(NOW - PAGE_TRANSLATE_NOTICE_MS - 1).toISOString()
    expect(pageTranslateNoticeDue({ state: 'stalled', startedAt: young }, NOW)).toBe(true)
    expect(pageTranslateNoticeDue({ state: 'failed', startedAt: old }, NOW)).toBe(false)
    expect(pageTranslateNoticeDue({ state: 'done', startedAt: young }, NOW)).toBe(false)
  })

  it('der Gegenstand trennt Mandanten und Seiten und passt in die Spalte', () => {
    const a = pageTranslateRunSubject('pool:c-a', 'imprint')
    expect(a).toHaveLength(41)
    expect(a).not.toBe(pageTranslateRunSubject('pool:c-b', 'imprint'))
    expect(a).not.toBe(pageTranslateRunSubject('pool:c-a', 'privacy'))
    expect(a).toBe(pageTranslateRunSubject('pool:c-a', 'imprint'))
  })
})

// ── Rollen ──────────────────────────────────────────────────────────────────

describe('Rollen-Tore der Lauf-Routen', () => {
  // Die Tür der Probe: jede Person bekommt eine frische Lauf-Tabelle.
  const roleGlobals = () => world().globals
  describeRoleGateToDoor('GET /api/pages/translate/:slug', loadState, MANAGE, {
    params: { slug: 'imprint' },
    door: (event, options) => pagesRunDoor().door(event, options),
    globals: roleGlobals(),
  })
})

describe('POST /api/pages/translate — Abgewiesene erreichen weder Sperre noch KI', () => {
  it.each(['guest', 'stranger', 'removed', 'moderator', 'member'] as const)('%s: abgewiesen, keine Lauf-Zeile', async (who) => {
    const w = world()
    const run = await probeRoute(loadStart, { who, body: BODY, tenantFields: { plan: 'pro' }, door: w.runs.door, globals: w.globals })
    expect([401, 403]).toContain(run.status)
    expect(w.runs.rows).toHaveLength(0)
    expect(w.works).toHaveLength(0)
    expect(w.ai).not.toHaveBeenCalled()
  })
})

// ── Start, Lauf, Ergebnis ───────────────────────────────────────────────────

describe('POST /api/pages/translate — 202, dann der Lauf hinter der Antwort', () => {
  it.each(MANAGE.allow)('%s: 202 mit „läuft", keine KI in der Anfrage; danach genau ein Aufruf und der Vorschlag an der Lauf-Zeile', async (who) => {
    const w = world()
    const run = await start(w, who)

    expect(run.status).toBe(200)
    expect(w.statuses).toEqual([202])
    expect(runOf(run)).toMatchObject({ state: 'running', locale: 'en', result: null })
    expect(w.ai, 'die Anfrage rechnet nicht').not.toHaveBeenCalled()
    expect(w.runs.rows).toHaveLength(1)
    expect(w.runs.opens.every(open => open.as === 'operator' && open.actor === undefined)).toBe(true)

    await drain(w)
    expect(w.ai).toHaveBeenCalledTimes(1)
    const row = w.runs.rows[0]!
    expect(row.outcome).toBe('done')
    expect(JSON.parse(String(row.result))).toEqual({ title: 'Imprint', body: 'Legal notice.' })
    // Im Detail nur Kennungen — kein Text der Seite.
    expect(JSON.parse(String(row.detail))).toEqual({ locale: 'en', model: 'test-model', paid: true })
  })

  it('die Lauf-Zeile bekommt KEIN Recht für ein Konto (permissions: [])', async () => {
    const w = world()
    await start(w)
    expect(w.runs.createdPermissions).toEqual([[]])
  })

  it('zehn GLEICHZEITIGE Starts: genau einer gewinnt (202), neun bekommen 409 run_running, ein KI-Aufruf', async () => {
    const w = world()
    let open!: () => void
    w.runs.gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const all = Promise.all(Array.from({ length: 10 }, () => start(w)))
    // Alle zehn haben gelesen (derselbe leere Vorgänger) — erst dann anlegen lassen.
    await new Promise(resolve => setTimeout(resolve, 20))
    open()
    const runs = await all

    const won = runs.filter(run => run.status === 200)
    const busy = runs.filter(run => run.status === 409)
    expect(won).toHaveLength(1)
    expect(busy).toHaveLength(9)
    expect(busy.every(run => run.error?.data?.code === 'run_running')).toBe(true)
    expect(w.runs.rows).toHaveLength(1)

    await drain(w)
    expect(w.ai).toHaveBeenCalledTimes(1)
  })

  it('ein zweiter Klick, während der erste rechnet: 409, keine zweite Zeile, keine KI', async () => {
    const w = world()
    await start(w)
    const second = await start(w)
    expect(second.status).toBe(409)
    expect(second.error?.data?.code).toBe('run_running')
    expect(w.runs.rows).toHaveLength(1)
    expect(w.works).toHaveLength(1)
  })

  it('eine ANDERE Community startet dieselbe Seite unabhängig (der Gegenstand trägt den Mandanten)', async () => {
    const w = world()
    await start(w)
    w.community.id = 'c-b'
    w.community.scope = 't-b'
    const other = await start(w)
    expect(other.status).toBe(200)
    expect(w.runs.rows.map(row => row.communityId).sort()).toEqual(['c-a', 'c-b'])
  })

  it('nach einem abgebrochenen Vorgänger startet der nächste — und leert dessen Vorschlag', async () => {
    const w = world()
    const stale = new Date(Date.now() - RUN_LEASE_STALL_MS - 1000).toISOString()
    const previous = handRow(w, { seq: 1, startedAt: stale, heartbeatAt: stale, finishedAt: stale, outcome: 'done', result: '{"title":"Alt","body":"Alt"}' })
    const run = await start(w)
    expect(run.status).toBe(200)
    expect(w.runs.rows).toHaveLength(2)
    expect(previous.result, 'höchstens ein Vorschlag je Seite').toBe('')
    expect(w.runs.rows[1]!.seq).toBe(2)
  })

  it('Abschalter aus: 503 ai_disabled, VOR der Sperre — keine Zeile', async () => {
    const w = world()
    w.aiOn.value = false
    const run = await start(w)
    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBe('ai_disabled')
    expect(w.runs.rows).toHaveLength(0)
  })

  it('ohne Adresse: 400 vor der Sperre (die Adresse ist der Gegenstand)', async () => {
    const w = world()
    const { slug: _slug, ...withoutSlug } = BODY
    const run = await start(w, 'editor', withoutSlug)
    expect(run.status).not.toBe(200)
    expect(w.runs.rows).toHaveLength(0)
  })

  it('OHNE LAUF-TABELLE (Instanz ohne pages-007): 503 run_lease_unavailable, kein Lauf, keine KI', async () => {
    const w = world()
    w.runs.missing = true
    const run = await start(w)
    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBe('run_lease_unavailable')
    expect(w.works).toHaveLength(0)
    expect(w.ai).not.toHaveBeenCalled()
  })

  it('kein Modell unter der Bindung: der Lauf endet mit ai_endpoint_unavailable, ohne Vorschlag', async () => {
    const w = world({
      aiAnswer: async () => {
        throw Object.assign(new Error('x'), { statusCode: 503, data: { code: 'ai_endpoint_unavailable' } })
      },
    })
    await start(w)
    await drain(w)
    expect(w.runs.rows[0]).toMatchObject({ outcome: 'ai_endpoint_unavailable', result: '' })
  })

  it('leere Antwort: `empty`, nichts abgelegt', async () => {
    const w = world({ aiAnswer: async () => ({ title: '  ', body: '' }) })
    await start(w)
    await drain(w)
    expect(w.runs.rows[0]).toMatchObject({ outcome: 'empty', result: '' })
  })

  it('der paid-Vermerk lässt sich nicht schreiben: KEIN Aufruf, `lease_unwritable`', async () => {
    const w = world()
    await start(w)
    w.runs.failUpdateAt = w.runs.updates + 1
    await drain(w)
    expect(w.ai).not.toHaveBeenCalled()
    expect(w.runs.rows[0]!.outcome).toBe('lease_unwritable')
  })

  it('der Vermerk `paid` steht VOR dem Aufruf an der Zeile', async () => {
    let paidAtCall: unknown
    const w = world({
      aiAnswer: async () => {
        paidAtCall = JSON.parse(String(w.runs.rows[0]!.detail)).paid
        return { title: 'T', body: 'B' }
      },
    })
    await start(w)
    await drain(w)
    expect(paidAtCall).toBe(true)
  })
})

// ── Der Stand ───────────────────────────────────────────────────────────────

describe('GET /api/pages/translate/:slug — der Stand für den Editor', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('kein Lauf ⇒ none; nach dem Lauf ⇒ fertig mit Vorschlag', async () => {
    const w = world()
    expect(runOf(await state(w)).state).toBe('none')
    await start(w)
    expect(runOf(await state(w)).state).toBe('running')
    await drain(w)
    expect(runOf(await state(w))).toMatchObject({
      state: 'done',
      result: { locale: 'en', title: 'Imprint', body: 'Legal notice.', model: 'test-model' },
    })
  })

  it('Herzschlag 120 s alt ⇒ abgebrochen', async () => {
    const w = world()
    const stale = new Date(Date.now() - RUN_LEASE_STALL_MS - 1000).toISOString()
    handRow(w, { seq: 1, startedAt: stale, heartbeatAt: stale })
    expect(runOf(await state(w)).state).toBe('stalled')
  })

  it('der Vorschlag einer ANDEREN Community ist nicht zu sehen', async () => {
    const w = world()
    await start(w)
    await drain(w)
    w.community.id = 'c-b'
    w.community.scope = 't-b'
    expect(runOf(await state(w))).toMatchObject({ state: 'none', result: null })
  })

  it('auch nicht, wenn eine fremde Zeile denselben Gegenstand trüge (die Tür filtert den Mandanten)', async () => {
    const w = world()
    await start(w)
    await drain(w)
    // Gleicher Gegenstand, anderer Mandant an der Tür: nur der Filter der Tür hält.
    w.community.id = 'c-b'
    expect(runOf(await state(w)).state).toBe('none')
  })

  it('OHNE LAUF-TABELLE: „kein Lauf" statt Fehler (der Editor bleibt benutzbar)', async () => {
    const w = world()
    w.runs.missing = true
    const run = await state(w)
    expect(run.status).toBe(200)
    expect(runOf(run).state).toBe('none')
  })

  it('eine falsch geformte Adresse: 400, die Tabelle wird nicht gefragt', async () => {
    const w = world()
    const run = await state(w, 'Impressum/../x')
    expect(run.status).toBe(400)
    expect(w.runs.opens).toHaveLength(0)
  })
})

// ── Löschen der Seite ───────────────────────────────────────────────────────

describe('DELETE /api/pages/:slug — der letzte Vorschlag geht mit der Seite', () => {
  it('leert das Ergebnis an JEDER Zeile der Seite, nicht nur an der jüngsten; die Lauf-Zeilen (die Sperre) bleiben', async () => {
    const w = world()
    await start(w)
    await drain(w)
    expect(w.runs.rows[0]!.result).not.toBe('')
    // Eine jüngere Zeile OHNE Vorschlag (abgebrochen) — die ältere trägt ihn noch.
    const stale = new Date(Date.now() - RUN_LEASE_STALL_MS - 1000).toISOString()
    handRow(w, { seq: 2, startedAt: stale, heartbeatAt: stale })

    // Die Seiten-Zeilen: eine leere Tabelle genügt — gelöscht wird „nichts".
    const pagesTable: Record<string, unknown>[] = []
    const door = (event: Parameters<PagesRunDoor['door']>[0], options?: { as?: string, actor?: string }) => {
      const runs = w.runs.door(event, options) as Record<string, (...args: unknown[]) => unknown>
      return {
        ...runs,
        list: async (table: string, queries?: string[]) => table === 'pages' ? { rows: pagesTable, total: 0 } : runs.list!(table, queries),
      }
    }
    const run = await probeRoute(loadDelete, { who: 'editor', params: { slug: 'imprint' }, door, globals: w.globals })
    expect(run.status).toBe(200)
    expect(w.runs.rows).toHaveLength(2)
    expect(w.runs.rows.map(row => row.result)).toEqual(['', ''])
  })
})
