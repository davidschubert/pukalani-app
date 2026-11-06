import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { mergeBrandSlotFacts } from '../shared/brandJourney'
import { confirmableRequiredSlotsForStep, slotById } from '../shared/slotRegistry'
import { brandSourcesHash, toStepFacts } from '../server/utils/brandStore'

/**
 * DIE FINALE ABNAHME AN DER ROUTE (BW2 §5a, Paket 3b) — abnehmen, vertagen,
 * die Seite lesen und „Nochmal von vorn" mit seinem Schutz.
 *
 * ── WARUM DAS HIER UND NICHT NUR PUR GEPRÜFT WIRD ─────────────────────────
 * Die Zustandsmaschine sagt, WAS erlaubt ist; die Routen sagen, was
 * WIRKLICH passiert — Revision, Schreibvorgang, Schnappschuss, Antwort. Genau
 * dazwischen liegen die Fehler, die eine pure Prüfung nie sieht: ein Restart,
 * der löscht, bevor er den Schnappschuss geschrieben hat; ein Ack, der zwar
 * geprüft, aber nie gegen den AKTUELLEN Stand gerechnet wird; ein `accepted`,
 * das nach einer Wert-Änderung stehen bleibt.
 *
 * Die Doppel des Servers sind dieselben wie in `brandStepPatchRoute.test.ts`:
 * eine Zeile im Speicher, ein `tablesDB`-Doppel, sonst nichts.
 */

const profileRow = {
  $id: 'p1',
  $createdAt: '2026-09-01T00:00:00.000Z',
  $updatedAt: '2026-09-01T00:00:00.000Z',
  createdByUserId: 'u1',
  ownerType: 'user',
  ownerId: 'u1',
  title: 'Testmarke',
  contentLocale: 'de',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'no',
  progressPct: 0,
  currentStepKey: 'values',
  lastActivityAt: '2026-09-01T00:00:00.000Z',
}

interface FakeRow { $id: string, [key: string]: unknown }

let stepRows: FakeRow[]
let body: Record<string, unknown>
let routeStepKey: string
let routeSlotId: string
const createdRows: { tableId: string, data: Record<string, unknown> }[] = []

function stepRow(stepKey: string): FakeRow {
  return stepRows.find(row => row.stepKey === stepKey)!
}

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') return profileRow
    if (tableId === 'brand_steps') {
      const row = stepRows.find(entry => entry.$id === rowId)
      if (row) return row
      throw Object.assign(new Error('not found'), { code: 404 })
    }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => (tableId === 'brand_steps'
    ? { rows: stepRows }
    : { rows: [] })),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (tableId === 'brand_steps') {
      const row = stepRows.find(entry => entry.$id === rowId)
      if (row) Object.assign(row, data)
    }
    return stepRows[0]
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    createdRows.push({ tableId, data })
    return { $id: 'e1' }
  }),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => {
  if (name === 'id') return 'p1'
  if (name === 'stepKey') return routeStepKey
  return routeSlotId
})
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (value: unknown) => unknown) => parse(body))

const accept = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/accept.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const defer = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/defer.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const acceptAll = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/accept-all.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const acceptance = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/acceptance.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const restartImpact = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/restart-impact.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const restart = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/restart.post'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const restamp = (await import('../server/api/brand/profiles/[id]/steps/[stepKey]/sessions/[slotId]/restamp.post'))
  .default as unknown as (event: H3Event) => Promise<{ revision: number }>

const event = { context: {} } as unknown as H3Event

/** Alle Pflicht-Sessions eines Kapitels bestätigt (und optional abgenommen). */
function confirmedSlots(stepKey: string, accepted = false): Record<string, unknown> {
  return Object.fromEntries(confirmableRequiredSlotsForStep(stepKey as 'values')
    .map(slot => [slot.id, { confirmed: 'steht', ...(accepted ? { accepted: true } : {}) }]))
}

function makeStep(stepKey: string, extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'open',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    revision: 2,
    activeSeconds: 0,
    ...extra,
  }
}

function storedSlots(stepKey: string): Record<string, Record<string, unknown>> {
  return JSON.parse(String(stepRow(stepKey).slots))
}

beforeEach(() => {
  routeStepKey = 'values'
  routeSlotId = 'c.final'
  createdRows.length = 0
  stepRows = [
    makeStep('context', { state: 'done' }),
    makeStep('pvm', { state: 'done' }),
    makeStep('architecture'),
    makeStep('values', { state: 'active', slots: JSON.stringify(confirmedSlots('values')) }),
    makeStep('archetype'),
    makeStep('manifesto'),
    makeStep('verbal'),
    makeStep('naming'),
    makeStep('result'),
  ]
  tablesDB.updateRow.mockClear()
  tablesDB.createRow.mockClear()
})

describe('POST …/sessions/:slotId/accept', () => {
  it('SETZT das Häkchen und meldet den neuen Zähler', async () => {
    body = { revision: 2 }
    const response = await accept(event)

    expect(response.revision).toBe(3)
    expect(response.accepted).toBe(true)
    expect(storedSlots('values')['c.final']).toMatchObject({ accepted: true })
    expect(response.acceptance).toMatchObject({ ready: false, accepted: 1 })
  })

  it('meldet `ready`, sobald alles abgenommen ist — und dann zeigt `next` auf die Abnahme', async () => {
    const slots = confirmedSlots('values', true) as Record<string, Record<string, unknown>>
    delete slots['c.final']!.accepted
    stepRow('values').slots = JSON.stringify(slots)
    body = { revision: 2 }
    const response = await accept(event)

    expect(response.acceptance).toMatchObject({ ready: true })
    expect(response.next).toEqual({ stepKey: 'values', acceptance: true })
  })

  it('WEIST einen unbestätigten Wert mit 409 `not_confirmed` ab', async () => {
    stepRow('values').slots = JSON.stringify({ 'c.final': { latestDraft: 'Entwurf' } })
    body = { revision: 2 }

    await expect(accept(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'not_confirmed' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('WEIST eine veraltete Fassung mit 409 ab — vor jeder Wirkung', async () => {
    body = { revision: 1 }
    await expect(accept(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'revision_conflict', revision: 2 },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('kennt eine fremde Session dieser Adresse nicht (404)', async () => {
    routeSlotId = 'a.pitch'
    body = { revision: 2 }
    await expect(accept(event)).rejects.toMatchObject({ status: 404 })
  })
})

/**
 * „ALLE ABNEHMEN" (Davids Befund 10, 2026-09-09) — elf Häkchen in EINEM
 * Schreibvorgang.
 *
 * Was hier gemessen wird, ist genau das, was elf Einzel-Aufrufe NICHT könnten:
 * eine Fassung statt elf, dieselbe Auswahlregel wie der Einzel-Knopf, und ein
 * Teilerfolg, der sagt, was liegen geblieben ist.
 */
describe('POST …/steps/:stepKey/accept-all', () => {
  it('nimmt ALLES ab und dreht die Fassung GENAU EINMAL weiter', () => {
    body = { revision: 2 }
    return acceptAll(event).then((response) => {
      const required = confirmableRequiredSlotsForStep('values')
      expect(response.accepted).toEqual(required.map(slot => slot.id))
      expect(response.failed).toEqual([])
      // EINE Fassung, EIN Schreibvorgang — nicht neun.
      expect(response.revision).toBe(3)
      expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
      expect(response.acceptance).toMatchObject({ ready: true })
      for (const slot of required) {
        expect(storedSlots('values')[slot.id]).toMatchObject({ accepted: true })
      }
    })
  })

  it('LÄSST UNBESTÄTIGTES LIEGEN — und meldet es nicht als abgenommen', async () => {
    const slots = confirmedSlots('values') as Record<string, Record<string, unknown>>
    delete slots['c.final']!.confirmed
    slots['c.final']!.latestDraft = 'Entwurf'
    stepRow('values').slots = JSON.stringify(slots)
    body = { revision: 2 }

    const response = await acceptAll(event)
    expect(response.accepted).not.toContain('c.final')
    expect(storedSlots('values')['c.final']).not.toHaveProperty('accepted')
    // Der Rest gilt trotzdem — eine Zeile darf die anderen nicht aufhalten.
    expect((response.accepted as string[]).length).toBeGreaterThan(0)
    expect(response.acceptance).toMatchObject({ ready: false })
  })

  it('nimmt eine OPTIONALE Session mit, sobald sie bestätigt ist', async () => {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.teamFilter': { confirmed: 'steht' },
    })
    body = { revision: 2 }
    const response = await acceptAll(event)
    expect(response.accepted).toContain('c.teamFilter')
  })

  it('ist ein NO-OP, wenn nichts mehr abzunehmen ist — keine Fassung, kein Schreibvorgang', async () => {
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    tablesDB.updateRow.mockClear()
    body = { revision: 2 }

    const response = await acceptAll(event)
    expect(response.accepted).toEqual([])
    expect(response.revision).toBe(2)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('WEIST eine veraltete Fassung mit 409 ab — vor jeder Wirkung', async () => {
    body = { revision: 1 }
    await expect(acceptAll(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'revision_conflict', revision: 2 },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })
})

describe('POST …/sessions/:slotId/defer', () => {
  it('VERTAGT, wo die Session es erlaubt', async () => {
    routeSlotId = 'c.teamFilter'
    body = { revision: 2 }
    const response = await defer(event)

    expect(response.deferred).toBe(true)
    expect(storedSlots('values')['c.teamFilter']).toMatchObject({ deferred: true })
  })

  it('GEGENPROBE: wo sie es nicht erlaubt, 400 `defer_not_allowed`', async () => {
    stepRow('values').slots = '{}'
    routeSlotId = 'c.final'
    body = { revision: 2 }

    await expect(defer(event)).rejects.toMatchObject({
      status: 400,
      data: { code: 'defer_not_allowed' },
    })
  })

  it('nimmt das Vertagen zurück und LÖSCHT das Flag statt es auf false zu setzen', async () => {
    stepRow('values').slots = JSON.stringify({ 'c.teamFilter': { deferred: true } })
    routeSlotId = 'c.teamFilter'
    body = { revision: 2, deferred: false }
    await defer(event)

    expect(storedSlots('values')['c.teamFilter']).not.toHaveProperty('deferred')
  })
})

describe('GET …/steps/:stepKey/acceptance', () => {
  it('liefert JEDE Session des Kapitels in Registry-Reihenfolge', async () => {
    const response = await acceptance(event)
    const sessions = response.sessions as { slotId: string }[]
    expect(sessions.map(entry => entry.slotId)).toEqual([
      'c.discovery1', 'c.discovery2', 'c.discovery3', 'c.candidates',
      'c.final', 'c.definitions', 'c.livedExamples', 'c.conflictRule', 'c.teamFilter',
    ])
  })

  it('trägt je Block Bereich, Beispiel und die eigene Eingabe', async () => {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: '- Mut\n- Klarheit\n- Geduld', accepted: true },
    })
    const response = await acceptance(event)
    const final = (response.sessions as Record<string, unknown>[]).find(s => s.slotId === 'c.final')!

    expect(final).toMatchObject({
      required: true,
      confirmed: true,
      accepted: true,
      deferred: false,
      allowDefer: false,
      // VOLLSTÄNDIG, nicht gekürzt (§5a Schritt 1).
      value: '- Mut\n- Klarheit\n- Geduld',
      labelKey: 'brand.labels.c.final',
      // MIT der Weiche W3: das Profil dieses Laufs ist solo, und die Frage
      // hat seit dem 2026-09-09 eine eigene Anrede-Fassung („würdest du
      // verteidigen" statt „würdet ihr"). Der Basis-Schlüssel steht nicht mehr
      // im Katalog — käme er hier heraus, stünde er wörtlich in der Abnahme.
      questionKey: 'brand.q.c.final.solo',
    })
    // Beispiele reisen in BEIDEN Sprachen — die Oberfläche wählt.
    expect((final.example as { de: string[], en: string[] }).de.length).toBeGreaterThan(0)
    expect((final.example as { de: string[], en: string[] }).en.length).toBeGreaterThan(0)
    // „fliesst später in …" ist gerechnet, nicht gepflegt.
    expect((final.affects as { count: number }).count).toBeGreaterThan(0)
  })

  it('sagt, ob die Frage „Passt dieses Kapitel?" erscheinen darf', async () => {
    expect((await acceptance(event)).acceptance).toMatchObject({ ready: false })
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    expect((await acceptance(event)).acceptance).toMatchObject({ ready: true })
  })

  it('schreibt NICHTS — es ist eine Leseansicht', async () => {
    await acceptance(event)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})

describe('GET …/steps/:stepKey/restart-impact', () => {
  it('zählt, was in DIESEM Kapitel verloren geht', async () => {
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: 'steht', accepted: true, notes: 'Vera hat mitgelesen.' },
    })
    const response = await restartImpact(event)

    expect(response.chapter).toMatchObject({
      values: confirmableRequiredSlotsForStep('values').length,
      notes: 1,
      accepted: 1,
    })
    expect(typeof response.ack).toBe('string')
  })

  it('zählt KEINE späteren Felder, solange dort nichts bestätigt ist', async () => {
    expect((await restartImpact(event)).downstream).toMatchObject({ count: 0 })
  })

  it('zählt bestätigte Felder SPÄTERER Kapitel mit', async () => {
    stepRow('archetype').slots = JSON.stringify({ 'd.voiceSamples': { confirmed: 'steht' } })
    const response = await restartImpact(event)
    const downstream = response.downstream as { count: number, byStep: Record<string, string[]> }

    expect(downstream.count).toBe(1)
    expect(downstream.byStep.archetype).toEqual(['d.voiceSamples'])
  })
})

describe('POST …/steps/:stepKey/restart', () => {
  async function currentAck(): Promise<string> {
    return String((await restartImpact(event)).ack)
  }

  it('WEIST ohne Bestätigung mit 409 ab — und legt die Hülle bei', async () => {
    body = { revision: 2, acknowledge: false, impactAck: await currentAck() }
    await expect(restart(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'restart_unacknowledged' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('WEIST einen veralteten Ack ab — die Hülle hat sich bewegt', async () => {
    body = { revision: 2, acknowledge: true, impactAck: 'stand-von-gestern' }
    await expect(restart(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'restart_unacknowledged' },
    })

    // Und der 409 trägt die AKTUELLE Hülle, damit die Oberfläche neu zeigen
    // kann, ohne einen zweiten Abruf.
    const rejected = await restart(event).catch(error => error as { data: { impact: { ack: string } } })
    expect(rejected.data.impact.ack).toBe(await currentAck())
  })

  it('SCHREIBT den Schnappschuss VOR dem Löschen und leert dann das Kapitel', async () => {
    stepRow('values').state = 'done'
    stepRow('values').confidence = 'fits'
    stepRow('values').completedAt = '2026-09-02T00:00:00.000Z'
    stepRow('values').slots = JSON.stringify(confirmedSlots('values', true))
    body = { revision: 2, acknowledge: true, impactAck: await currentAck() }

    const response = await restart(event)

    const snapshot = createdRows.find(row => row.tableId === 'brand_events')
    expect(snapshot).toBeDefined()
    expect(snapshot!.data.type).toBe('step.restarted')
    const payload = JSON.parse(String(snapshot!.data.payload))
    expect(payload).toMatchObject({ stepKey: 'values', confidence: 'fits' })
    // Der Schnappschuss trägt den STAND VOR dem Löschen.
    expect(JSON.parse(payload.snapshot)['c.final']).toMatchObject({ confirmed: 'steht' })

    expect(response.revision).toBe(3)
    expect(response.restartedAt).toBeTruthy()
    expect(storedSlots('values')).toEqual({})
    expect(stepRow('values').state).toBe('active')
    expect(stepRow('values').confidence).toBeNull()
    expect(stepRow('values').completedAt).toBeNull()
    expect(stepRow('values').restartedAt).toBe(response.restartedAt)
    // George eröffnet die erste Session des Kapitels.
    expect(response.next).toEqual({ stepKey: 'values', sessionKey: 'c.discovery1' })
  })

  /**
   * DER KERN DES GANZEN PAKETS: ein Restart fasst spätere Kapitel NICHT an —
   * sie werden über den fehlenden Quell-Wert MECHANISCH veraltet, weil der
   * beim Bestätigen gestempelte `sourcesHash` danach nicht mehr passt (§9).
   * Ohne diesen Hash wäre „Nochmal von vorn" ein stiller Datenverlust: die
   * späteren Felder behaupteten weiter, aus etwas zu schöpfen, das es nicht
   * mehr gibt.
   */
  it('MACHT SPÄTERE KAPITEL MECHANISCH VERALTET — ohne sie anzufassen', async () => {
    stepRow('values').state = 'done'
    stepRow('archetype').state = 'done'
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: '- Mut\n- Klarheit\n- Geduld' },
    })
    // `d.voiceSamples` schöpft aus `c.final` — bestätigt MIT dem Hash von
    // damals, genau wie der Autosave ihn stempelt.
    const voice = slotById('d.voiceSamples')!
    stepRow('archetype').slots = JSON.stringify({ 'd.voiceSamples': { confirmed: 'steht' } })
    const factsBefore = mergeBrandSlotFacts(toStepFacts(stepRows as never))
    stepRow('archetype').slots = JSON.stringify({
      'd.voiceSamples': { confirmed: 'steht', sourcesHash: brandSourcesHash(voice, factsBefore) },
    })

    routeStepKey = 'archetype'
    const before = (await acceptance(event)).sessions as { slotId: string, state: string }[]
    expect(before.find(entry => entry.slotId === 'd.voiceSamples')?.state).toBe('done')

    routeStepKey = 'values'
    body = { revision: 2, acknowledge: true, impactAck: await currentAck() }
    await restart(event)

    // Die Zeile des späteren Kapitels wurde NICHT geschrieben …
    const written = tablesDB.updateRow.mock.calls
      .map(call => call[0] as { tableId: string, rowId: string })
      .filter(call => call.tableId === 'brand_steps')
      .map(call => call.rowId)
    expect(written).toEqual(['p1_values'])

    // … und steht trotzdem auf `stale`.
    routeStepKey = 'archetype'
    const after = (await acceptance(event)).sessions as { slotId: string, state: string }[]
    expect(after.find(entry => entry.slotId === 'd.voiceSamples')?.state).toBe('stale')
  })

  it('WEIST eine veraltete Fassung mit 409 `revision_conflict` ab', async () => {
    body = { revision: 1, acknowledge: true, impactAck: await currentAck() }
    await expect(restart(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'revision_conflict' },
    })
  })
})

/**
 * „GILT WEITER" (BW2 Paket 6, §9) — der Stempel auf eine VERALTETE Session.
 *
 * Er ist die Hand des Menschen an der Warteschlange: der Wert bleibt Wort für
 * Wort stehen, nur seine Grundlage wird auf den heutigen Stand gesetzt. Was
 * hier gemessen wird, ist genau die Grenze — er stempelt einen HASH und
 * verändert keinen Inhalt, keine Abnahme, keine Bestätigung.
 */
describe('POST …/sessions/:slotId/restamp', () => {
  /** `d.voiceSamples` bestätigt, mit einem Hash von GESTERN ⇒ `stale`. */
  function makeStale(): void {
    stepRow('values').state = 'done'
    stepRow('archetype').state = 'active'
    stepRow('values').slots = JSON.stringify({
      ...confirmedSlots('values'),
      'c.final': { confirmed: '- Mut\n- Klarheit\n- Geduld' },
    })
    stepRow('archetype').slots = JSON.stringify({
      'd.voiceSamples': { confirmed: 'steht', accepted: true, sourcesHash: 'von-gestern' },
    })
    routeStepKey = 'archetype'
    routeSlotId = 'd.voiceSamples'
  }

  it('STEMPELT den heutigen Quellen-Stand — und die Zeile ist wieder aktuell', async () => {
    makeStale()
    const before = (await acceptance(event)).sessions as { slotId: string, state: string }[]
    expect(before.find(entry => entry.slotId === 'd.voiceSamples')?.state).toBe('stale')

    body = { revision: 2 }
    const response = await restamp(event)

    expect(response.revision).toBe(3)
    const stored = storedSlots('archetype')['d.voiceSamples'] as { sourcesHash?: string }
    expect(stored.sourcesHash).toHaveLength(64)

    const after = (await acceptance(event)).sessions as { slotId: string, state: string }[]
    expect(after.find(entry => entry.slotId === 'd.voiceSamples')?.state).toBe('done')
  })

  it('lässt WERT und ABNAHME unangetastet — „gilt weiter" ist keine Änderung', async () => {
    makeStale()
    body = { revision: 2 }
    await restamp(event)

    expect(storedSlots('archetype')['d.voiceSamples']).toMatchObject({
      confirmed: 'steht',
      accepted: true,
    })
  })

  it('eine AKTUELLE Session ist ein No-op — keine Fassung, kein Schreibvorgang', async () => {
    makeStale()
    body = { revision: 2 }
    await restamp(event)
    const revision = stepRow('archetype').revision as number
    tablesDB.updateRow.mockClear()

    body = { revision }
    const second = await restamp(event)
    expect(second.revision).toBe(revision)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('WEIST einen unbestätigten Wert mit 409 `not_confirmed` ab', async () => {
    makeStale()
    stepRow('archetype').slots = JSON.stringify({ 'd.voiceSamples': { latestDraft: 'Entwurf' } })
    body = { revision: 2 }

    await expect(restamp(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'not_confirmed' },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('WEIST eine veraltete Fassung mit 409 ab — vor jeder Wirkung', async () => {
    makeStale()
    body = { revision: 1 }

    await expect(restamp(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'revision_conflict', revision: 2 },
    })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })
})
