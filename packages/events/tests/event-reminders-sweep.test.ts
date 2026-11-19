import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DER ERINNERUNGS-LAUF ÜBER ALLE COMMUNITIES (OPS-003).
 *
 * Bis dahin wurde nur erinnert, wo jemand die Events-Seite öffnete (oder für
 * die eine Community des alten Zeitplans). Geprüft wird hier, was der neue
 * Lauf zusagt: jede Community, jede Erinnerung in IHRER Glocke, nichts doppelt
 * — auch nicht, wenn zwei Läufe gleichzeitig starten — und im Zähl-Modus kein
 * einziger Schreibvorgang.
 *
 * Seit BE-018 (2026-11-17) dazu: der Text ist ein Rohwert (Zeitpunkt + Zone
 * des Termins), jede Erinnerung hat eine feste Zeilen-Id je (Termin,
 * Empfänger, Beginn), der Merker steht erst NACH den Benachrichtigungen, und
 * die Termin-Liste stößt keinen Lauf mehr an.
 *
 * Der Speicher unten ist nachgebaut. Was er NICHT belegen kann: dass Appwrite
 * die Abfrage (isNull + Zeitfenster + Cursor) genauso beantwortet; das zeigt
 * erst die Zähl-Zeile auf Production (Stufe 1).
 */

type Row = { $id: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const HOUR = 3600_000
let tables: Record<string, Row[]>
let listCalls: { tableId: string, queries: string[] }[]
let updateError: unknown
let notifyImpl: (input: Record<string, unknown>) => Promise<{ created: boolean, duplicate?: true, skipped?: 'former_member' }>
let notified: Record<string, unknown>[]
/** Zeilen-Ids, die die nachgebaute Glocke schon trägt — Appwrites 409 bei fester `rowId`. */
let createdRowIds: Set<string>
/** Reihenfolge der Schreibvorgänge: `notify:<user>` und `mark:<termin>`. */
let callLog: string[]
let productEnabled: boolean
let tenancy: boolean
const logged: { level: string, name: string, fields: Record<string, unknown> }[] = []

function matches(row: Row, query: ParsedQuery): boolean {
  const value = row[query.attribute ?? '']
  const operand = query.values?.[0]
  switch (query.method) {
    case 'equal': return (query.values ?? []).includes(value)
    case 'greaterThan': return String(value) > String(operand)
    case 'lessThanEqual': return String(value) <= String(operand)
    case 'isNull': return value === null || value === undefined
    default: return true
  }
}

/** Ein Takt Verzögerung je Datenbank-Zugriff — sonst wäre „gleichzeitig" im Test nie gleichzeitig. */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

async function listRows({ tableId, queries }: { tableId: string, queries: string[] }) {
  listCalls.push({ tableId, queries })
  await tick()
  const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
  let rows = (tables[tableId] ?? []).filter(row => parsed.every(q => matches(row, q)))
  const order = parsed.find(q => q.method === 'orderAsc')
  if (order) rows = [...rows].sort((a, b) => String(a[order.attribute!]).localeCompare(String(b[order.attribute!])))
  const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
  if (cursor) rows = rows.slice(rows.findIndex(row => row.$id === cursor) + 1)
  const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
  return { total: rows.length, rows: rows.slice(0, limit) }
}

async function updateRow({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) {
  await tick()
  if (updateError) throw updateError
  const row = tables[tableId]!.find(candidate => candidate.$id === rowId)!
  if (tableId === 'events' && 'remindersSentAt' in data) callLog.push(`mark:${rowId}`)
  Object.assign(row, data)
  return row
}

const tablesDB = { listRows: vi.fn(listRows), updateRow: vi.fn(updateRow) }

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy: { enabled: tenancy } } }))
vi.stubGlobal('isProductEnabled', async () => productEnabled)
vi.stubGlobal('notify', (_event: unknown, input: Record<string, unknown>) => {
  callLog.push(`notify:${String(input.recipientId)}`)
  return notifyImpl(input)
})
vi.stubGlobal('logEvent', (level: string, name: string, fields: Record<string, unknown>) => {
  logged.push({ level, name, fields })
})
// SE1 d: der ECHTE core-Vertrag (Auto-Import im Lauf). Gestellt ist nur, was
// dahinter liegt — der Resolver, den sonst die Platform-App registriert.
const reachability = await import('../../core/server/utils/communityReachability')
vi.stubGlobal('resolveUnreachableCommunities', reachability.resolveUnreachableCommunities)

const {
  EVENT_REMINDER_RUN_CAP,
  eventReminderRowId,
  runEventReminderJob,
  sweepAllEventReminders,
} = await import('../server/utils/eventReminders')

function dueEvent(id: string, communityId: string | undefined, extra: Record<string, unknown> = {}): Row {
  return {
    $id: id,
    title: `Titel ${id}`,
    status: 'published',
    startAt: new Date(Date.now() + 2 * HOUR).toISOString(),
    remindersSentAt: null,
    ...(communityId === undefined ? {} : { communityId }),
    ...extra,
  }
}

/** Zusagen tragen im Pool denselben Stempel wie ihr Termin (die Datentür stempelt beide). */
function going(id: string, eventId: string, userId: string): Row {
  const communityId = tables.events?.find(row => row.$id === eventId)?.communityId
  return { $id: id, eventId, userId, status: 'going', ...(communityId ? { communityId } : {}) }
}

/** Die nachgebaute Glocke: dieselbe `rowId` ein zweites Mal ⇒ Dublette, keine Zeile, keine Mail. */
async function deliver(input: Record<string, unknown>): Promise<{ created: boolean, duplicate?: true }> {
  const rowId = typeof input.rowId === 'string' ? input.rowId : undefined
  if (rowId && createdRowIds.has(rowId)) return { created: false, duplicate: true }
  if (rowId) createdRowIds.add(rowId)
  notified.push(input)
  return { created: true }
}

beforeEach(() => {
  tables = { events: [dueEvent('ev-a', 't-kunde-a'), dueEvent('ev-b', 't-kunde-b')], event_rsvps: [] }
  tables.event_rsvps = [
    going('r1', 'ev-a', 'u1'),
    going('r2', 'ev-a', 'u2'),
    going('r3', 'ev-b', 'u3'),
    { $id: 'r4', eventId: 'ev-b', userId: 'u4', status: 'not_going', communityId: 't-kunde-b' },
  ]
  listCalls = []
  tablesDB.listRows.mockClear()
  tablesDB.updateRow.mockClear()
  updateError = undefined
  notified = []
  createdRowIds = new Set()
  callLog = []
  notifyImpl = deliver
  productEnabled = true
  tenancy = true
  logged.length = 0
  // Ohne Registrierung antwortet niemand: der Lauf erinnert wie vor SE1 d.
  reachability.__resetUnreachableCommunitiesResolver()
})

/** Die SE1-d-Felder eines Pool-Laufs, in dem niemand nach Erreichbarkeit antwortet. */
const NO_ANSWER = { reachabilityAsked: true, reachabilityAnswered: false, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0 }
/** … und eines Laufs, in dem gar nicht gefragt wurde (nichts fällig, Einzel-Instanz). */
const NOT_ASKED = { reachabilityAsked: false, reachabilityAnswered: false, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0 }

describe('sweepAllEventReminders — alle Communities', () => {
  it('erinnert in beiden Communities, jede Meldung mit dem Stempel IHRER Community', async () => {
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })

    expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0, ...NO_ANSWER })
    const byUser = Object.fromEntries(notified.map(input => [input.recipientId, input]))
    expect(byUser.u1).toMatchObject({ scope: 'tenant', communityId: 't-kunde-a', type: 'reminder', title: 'Titel ev-a', link: '/events/ev-a' })
    expect(byUser.u2).toMatchObject({ communityId: 't-kunde-a' })
    expect(byUser.u3).toMatchObject({ communityId: 't-kunde-b', link: '/events/ev-b' })
    // Gegenprobe: die Absage bekommt nichts
    expect(byUser.u4).toBeUndefined()
    expect(tables.events!.every(row => typeof row.remindersSentAt === 'string')).toBe(true)
  })

  it('fasst nur fällige Termine an (Entwurf, schon erinnert, außerhalb von 24 h, schon begonnen)', async () => {
    tables.events!.push(
      dueEvent('draft', 't-kunde-a', { status: 'draft' }),
      dueEvent('done', 't-kunde-a', { remindersSentAt: '2026-11-01T00:00:00.000Z' }),
      dueEvent('later', 't-kunde-a', { startAt: new Date(Date.now() + 30 * HOUR).toISOString() }),
      dueEvent('past', 't-kunde-a', { startAt: new Date(Date.now() - HOUR).toISOString() }),
    )
    for (const id of ['draft', 'done', 'later', 'past']) tables.event_rsvps!.push(going(`g-${id}`, id, `user-${id}`))

    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result.dueEvents).toBe(2)
    expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('dryRun schreibt nichts und zählt dieselben Zahlen', async () => {
    const result = await sweepAllEventReminders({ dryRun: true, unreachableMode: 'count' })

    expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 0, errors: 0, ...NO_ANSWER })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(notified).toEqual([])
    expect(tables.events!.every(row => row.remindersSentAt === null)).toBe(true)
  })

  it('notify meldet „nicht geschrieben" ⇒ errors, nicht reminded, und KEIN Merker', async () => {
    notifyImpl = async () => ({ created: false })
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result).toMatchObject({ reminded: 0, errors: 3 })
    expect(tables.events!.every(row => row.remindersSentAt === null)).toBe(true)
  })

  it('Zusage eines inzwischen entfernten Kontos: bewusst ausgelassen ist KEINE Störung — der Merker kommt (MM1 b)', async () => {
    // u2 ist aus Community A entfernt: notify() schreibt für ihn nichts und sagt es.
    notifyImpl = async input => input.recipientId === 'u2'
      ? { created: false, skipped: 'former_member' as const }
      : deliver(input)
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })

    expect(result).toMatchObject({ recipients: 3, reminded: 2, errors: 0 })
    expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u3'])
    // Ohne den Merker fragte der Lauf jede Stunde wieder (Gegenprobe: der Test darüber).
    expect(tables.events!.every(row => typeof row.remindersSentAt === 'string')).toBe(true)
  })

  it('scheitert der Merker NACH den Benachrichtigungen, zählt errors — der nächste Takt läuft in die Dubletten', async () => {
    updateError = new Error('Schreiben gescheitert')
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result).toMatchObject({ dueEvents: 2, reminded: 3, errors: 2 })
    updateError = undefined
    const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(second).toMatchObject({ dueEvents: 2, reminded: 0, errors: 0 })
    expect(notified).toHaveLength(3)
    expect(tables.events!.every(row => typeof row.remindersSentAt === 'string')).toBe(true)
  })

  it('ein Lesefehler der Termin-Liste wirft (der Zeit-Lauf meldet failed)', async () => {
    tablesDB.listRows.mockImplementationOnce(async () => { throw new Error('Datenbank weg') })
    await expect(sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })).rejects.toThrow('Datenbank weg')
    // Die Warteschlange bleibt danach benutzbar
    expect((await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })).reminded).toBe(3)
  })

  it('ein zweiter Lauf erinnert nicht noch einmal', async () => {
    await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(second).toEqual({ communities: 0, dueEvents: 0, recipients: 0, reminded: 0, errors: 0, ...NOT_ASKED })
    expect(notified).toHaveLength(3)
  })

  it('Pool-Zeile ohne Stempel wird gezählt, nicht geraten', async () => {
    tables.events!.push(dueEvent('ev-x', undefined))
    tables.event_rsvps!.push(going('rx', 'ev-x', 'ux'))
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result.errors).toBe(1)
    expect(notified.some(input => input.recipientId === 'ux')).toBe(false)
  })

  it('Silo (Mandanten-Auflösung aus): erinnert ohne Stempel wie der bisherige Sweep', async () => {
    tenancy = false
    tables.events = [dueEvent('ev-s', undefined)]
    tables.event_rsvps = [going('rs', 'ev-s', 'us')]
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result).toEqual({ communities: 1, dueEvents: 1, recipients: 1, reminded: 1, errors: 0, ...NOT_ASKED })
    expect(notified[0]).toMatchObject({ scope: 'tenant', recipientId: 'us' })
    expect(notified[0]).not.toHaveProperty('communityId')
  })

  it(`Deckel je Lauf: höchstens ${EVENT_REMINDER_RUN_CAP} Termine, der Rest im nächsten Takt`, async () => {
    const total = EVENT_REMINDER_RUN_CAP + 30
    tables.events = Array.from({ length: total }, (_, i) =>
      dueEvent(`ev-${String(i).padStart(4, '0')}`, i % 2 ? 't-kunde-a' : 't-kunde-b', {
        startAt: new Date(Date.now() + HOUR + i * 1000).toISOString(),
      }))
    tables.event_rsvps = []

    const first = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(first.dueEvents).toBe(EVENT_REMINDER_RUN_CAP)
    // Seitenweise gelesen, keine Seite über 100
    const pages = listCalls.filter(call => call.tableId === 'events')
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) {
      const limit = page.queries.map(q => JSON.parse(q) as ParsedQuery).find(q => q.method === 'limit')
      expect(Number(limit?.values?.[0])).toBeLessThanOrEqual(100)
    }
    // Die frühesten Termine zuerst
    expect(tables.events.find(row => row.$id === 'ev-0000')!.remindersSentAt).not.toBeNull()
    expect(tables.events.find(row => row.$id === `ev-${String(total - 1).padStart(4, '0')}`)!.remindersSentAt).toBeNull()

    const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(second.dueEvents).toBe(30)
  })
})

describe('eine Warteschlange im Prozess', () => {
  function remindersPerUser(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const input of notified) counts[input.recipientId as string] = (counts[input.recipientId as string] ?? 0) + 1
    return counts
  }

  it('zwei Zeit-Läufe gleichzeitig ⇒ der spätere liest den Merker des früheren', async () => {
    // Liefen sie parallel, sähen beide `remindersSentAt: null` — der Speicher
    // oben antwortet mit einem Takt Verzögerung, das Fenster wäre also offen.
    await Promise.all([sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' }), sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })])
    expect(remindersPerUser()).toEqual({ u1: 1, u2: 1, u3: 1 })
  })
})

describe('runEventReminderJob — ein Takt des Zeit-Laufs', () => {
  it("Modus 'count': genau eine Zeile events.reminder_count, nur Zahlen, nichts geschrieben", async () => {
    expect(await runEventReminderJob('count', 'count')).toBeUndefined()

    // Im Pool steht daneben die Zählzeile von SE1 d (eigener Block unten).
    expect(logged.map(entry => entry.name)).toEqual(['events.reminder_count', 'events.reminder_unreachable'])
    expect(logged[0]).toEqual({
      level: 'info',
      name: 'events.reminder_count',
      fields: { communities: 2, dueEvents: 2, recipients: 3, reminded: 0, errors: 0 },
    })
    const line = JSON.stringify(logged[0])
    for (const leak of ['Titel', 'ev-a', 'ev-b', 't-kunde', 'u1', '/events/']) expect(line).not.toContain(leak)
    expect(notified).toEqual([])
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it("Modus 'count' schreibt die Zeile auch bei lauter Nullen", async () => {
    tables.events = []
    await runEventReminderJob('count', 'count')
    expect(logged.map(entry => entry.name)).toEqual(['events.reminder_count', 'events.reminder_unreachable'])
  })

  it("Modus 'send' erinnert", async () => {
    await runEventReminderJob('send', 'count')
    expect(notified).toHaveLength(3)
    expect(logged.map(entry => entry.name)).toEqual(['events.reminders_sent', 'events.reminder_unreachable'])
  })

  it('abgeschaltetes Produkt ⇒ skipped, kein Lesen, keine Zeile', async () => {
    productEnabled = false
    expect(await runEventReminderJob('send', 'count')).toBe('skipped')
    expect(listCalls).toEqual([])
    expect(notified).toEqual([])
    expect(logged).toEqual([])
  })
})

describe('SE1 d — Termine nicht erreichbarer Communities', () => {
  /**
   * Das gestellte Control Plane: Zeilen je Stempel. Der Resolver nennt, was
   * eine Zeile HAT und stillgelegt oder wegen Missbrauchs gesperrt ist — die
   * Regel selbst liegt im control-Layer (dort getestet); hier zählt nur, was
   * der Lauf mit der Antwort macht.
   */
  let controlRows: Record<string, { status: string, suspension?: string }>
  let resolverCalls: string[][]

  function registerControlPlane() {
    reachability.registerUnreachableCommunitiesResolver(async (ids) => {
      resolverCalls.push(ids)
      return ids.filter((id) => {
        const row = controlRows[id]
        return row !== undefined && (row.status !== 'active' || row.suspension === 'abuse')
      })
    })
  }

  function event(id: string): Row {
    return tables.events!.find(row => row.$id === id)!
  }

  function rsvpReadsFor(eventId: string): number {
    return listCalls.filter(call => call.tableId === 'event_rsvps' && call.queries.some(q => q.includes(`"${eventId}"`))).length
  }

  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    controlRows = { 't-kunde-a': { status: 'active', suspension: '' }, 't-kunde-b': { status: 'active', suspension: '' } }
    resolverCalls = []
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  describe("Modus 'count' — erinnert wie bisher UND zählt", () => {
    it('erreichbar ⇒ erinnert, nichts gezählt, EINE Frage für beide Communities', async () => {
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({
        communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0,
      })
      expect(resolverCalls).toEqual([['t-kunde-a', 't-kunde-b']])
    })

    it('stillgelegt ⇒ erinnert (mit Merker) und zählt Termin, Zusagen, Community', async () => {
      controlRows['t-kunde-a'] = { status: 'disabled', suspension: '' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({
        communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 1, unreachableEvents: 1, unreachableRecipients: 2,
      })
      expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u2', 'u3'])
      expect(typeof event('ev-a').remindersSentAt).toBe('string')
    })

    it('wegen Missbrauchs gesperrt ⇒ erinnert und zählt', async () => {
      controlRows['t-kunde-b'] = { status: 'active', suspension: 'abuse' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({
        communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 1, unreachableEvents: 1, unreachableRecipients: 1,
      })
      expect(typeof event('ev-b').remindersSentAt).toBe('string')
    })

    it('Zahlungs-Sperre ⇒ nicht gezählt (Gegenprobe)', async () => {
      controlRows['t-kunde-b'] = { status: 'active', suspension: 'billing' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toMatchObject({ reminded: 3, reachabilityAnswered: true, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0 })
    })

    it('zwei Termine derselben stillgelegten Community ⇒ zwei Termine, eine Community', async () => {
      tables.events!.push(dueEvent('ev-a2', 't-kunde-a'))
      tables.event_rsvps!.push(going('r5', 'ev-a2', 'u5'))
      controlRows['t-kunde-a'] = { status: 'disabled' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toMatchObject({ dueEvents: 3, reminded: 4, unreachableCommunities: 1, unreachableEvents: 2, unreachableRecipients: 3 })
    })

    it('keine Antwort (Resolver wirft) ⇒ erinnert, nichts gezählt, answered: false', async () => {
      controlRows['t-kunde-a'] = { status: 'disabled' }
      reachability.registerUnreachableCommunitiesResolver(async () => {
        throw new Error('Control Plane weg')
      })
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0, ...NO_ANSWER })
    })

    it('keine Antwort (kein Resolver registriert) ⇒ erinnert, answered: false', async () => {
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0, ...NO_ANSWER })
    })

    it('Einzel-Instanz (Mandanten-Auflösung aus) ⇒ der Vertrag wird nie gefragt', async () => {
      tenancy = false
      tables.events = [dueEvent('ev-s', undefined)]
      tables.event_rsvps = [going('rs', 'ev-s', 'us')]
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({ communities: 1, dueEvents: 1, recipients: 1, reminded: 1, errors: 0, ...NOT_ASKED })
      expect(resolverCalls).toEqual([])
    })

    it('nichts fällig ⇒ nicht gefragt', async () => {
      tables.events = []
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
      expect(result).toEqual({ communities: 0, dueEvents: 0, recipients: 0, reminded: 0, errors: 0, ...NOT_ASKED })
      expect(resolverCalls).toEqual([])
    })
  })

  describe("Modus 'skip' — lässt aus, ohne Merker und ohne Fehler", () => {
    it('erreichbar ⇒ erinnert wie bisher', async () => {
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toEqual({
        communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0,
      })
    })

    it('stillgelegt ⇒ keine Zusagen gelesen, keine Erinnerung, kein Merker, kein Fehler — wieder erreichbar ⇒ nächster Takt erinnert', async () => {
      controlRows['t-kunde-a'] = { status: 'disabled', suspension: '' }
      registerControlPlane()
      const first = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(first).toEqual({
        communities: 2, dueEvents: 2, recipients: 1, reminded: 1, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 1, unreachableEvents: 1, unreachableRecipients: 0,
      })
      expect(notified.map(input => input.recipientId)).toEqual(['u3'])
      expect(rsvpReadsFor('ev-a')).toBe(0)
      expect(event('ev-a').remindersSentAt).toBeNull()
      // Gegenprobe: die erreichbare Community bekam ihre Erinnerung samt Merker.
      expect(rsvpReadsFor('ev-b')).toBe(1)
      expect(typeof event('ev-b').remindersSentAt).toBe('string')

      // Die Community geht vor dem Beginn wieder ans Netz.
      controlRows['t-kunde-a'] = { status: 'active', suspension: '' }
      const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(second).toEqual({
        communities: 1, dueEvents: 1, recipients: 2, reminded: 2, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 0, unreachableEvents: 0, unreachableRecipients: 0,
      })
      expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u2', 'u3'])
      expect(typeof event('ev-a').remindersSentAt).toBe('string')
    })

    it('bleibt sie aus, bleibt der Termin fällig und wird bei jedem Takt wieder ausgelassen', async () => {
      controlRows['t-kunde-a'] = { status: 'disabled' }
      registerControlPlane()
      await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(second).toEqual({
        communities: 1, dueEvents: 1, recipients: 0, reminded: 0, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 1, unreachableEvents: 1, unreachableRecipients: 0,
      })
      expect(notified.map(input => input.recipientId)).toEqual(['u3'])
    })

    it('wegen Missbrauchs gesperrt ⇒ ausgelassen, kein Merker, kein Fehler', async () => {
      controlRows['t-kunde-b'] = { status: 'active', suspension: 'abuse' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toEqual({
        communities: 2, dueEvents: 2, recipients: 2, reminded: 2, errors: 0,
        reachabilityAsked: true, reachabilityAnswered: true, unreachableCommunities: 1, unreachableEvents: 1, unreachableRecipients: 0,
      })
      expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u2'])
      expect(rsvpReadsFor('ev-b')).toBe(0)
      expect(event('ev-b').remindersSentAt).toBeNull()
    })

    it('Zahlungs-Sperre ⇒ erinnert (Gegenprobe)', async () => {
      controlRows['t-kunde-b'] = { status: 'active', suspension: 'billing' }
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toMatchObject({ reminded: 3, unreachableEvents: 0 })
      expect(typeof event('ev-b').remindersSentAt).toBe('string')
    })

    it('keine Antwort (Resolver wirft) ⇒ erinnert wie bisher', async () => {
      controlRows['t-kunde-a'] = { status: 'disabled' }
      reachability.registerUnreachableCommunitiesResolver(async () => {
        throw new Error('Control Plane weg')
      })
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0, ...NO_ANSWER })
      expect(typeof event('ev-a').remindersSentAt).toBe('string')
    })

    it('keine Antwort (kein Resolver registriert) ⇒ erinnert wie bisher', async () => {
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0, ...NO_ANSWER })
    })

    it('Einzel-Instanz ⇒ nie gefragt, erinnert', async () => {
      tenancy = false
      tables.events = [dueEvent('ev-s', undefined)]
      tables.event_rsvps = [going('rs', 'ev-s', 'us')]
      registerControlPlane()
      const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'skip' })
      expect(result).toEqual({ communities: 1, dueEvents: 1, recipients: 1, reminded: 1, errors: 0, ...NOT_ASKED })
      expect(resolverCalls).toEqual([])
    })
  })

  describe('runEventReminderJob — die Zeile events.reminder_unreachable', () => {
    function unreachableLines() {
      return logged.filter(entry => entry.name === 'events.reminder_unreachable')
    }

    it("'count' im Pool: GENAU EINE Zeile je Takt, nur Zahlen und feste Wörter", async () => {
      controlRows['t-kunde-a'] = { status: 'disabled' }
      registerControlPlane()
      await runEventReminderJob('send', 'count')
      expect(unreachableLines()).toEqual([{
        level: 'info',
        name: 'events.reminder_unreachable',
        fields: { mode: 'count', asked: true, answered: true, dueEvents: 2, communities: 1, events: 1, recipients: 2 },
      }])
      const line = JSON.stringify(unreachableLines())
      for (const leak of ['Titel', 'ev-a', 'ev-b', 't-kunde', 'u1', '/events/', '.local']) expect(line).not.toContain(leak)
      // Stufe 1 sendet weiter.
      expect(notified).toHaveLength(3)
    })

    it("'count' im Pool schreibt die Zeile auch bei lauter Nullen (nichts fällig)", async () => {
      tables.events = []
      registerControlPlane()
      await runEventReminderJob('send', 'count')
      expect(unreachableLines()).toEqual([{
        level: 'info',
        name: 'events.reminder_unreachable',
        fields: { mode: 'count', asked: false, answered: false, dueEvents: 0, communities: 0, events: 0, recipients: 0 },
      }])
    })

    it("'count' ohne Antwort: answered false steht in der Zeile", async () => {
      await runEventReminderJob('send', 'count')
      expect(unreachableLines().map(entry => entry.fields)).toEqual([
        { mode: 'count', asked: true, answered: false, dueEvents: 2, communities: 0, events: 0, recipients: 0 },
      ])
    })

    it("'skip': still, wenn nichts ausgelassen wurde und die Antwort kam", async () => {
      registerControlPlane()
      await runEventReminderJob('send', 'skip')
      expect(unreachableLines()).toEqual([])
      expect(notified).toHaveLength(3)
    })

    it("'skip': eine Zeile, wenn etwas ausgelassen wurde", async () => {
      controlRows['t-kunde-b'] = { status: 'active', suspension: 'abuse' }
      registerControlPlane()
      await runEventReminderJob('send', 'skip')
      expect(unreachableLines().map(entry => entry.fields)).toEqual([
        { mode: 'skip', asked: true, answered: true, dueEvents: 2, communities: 1, events: 1, recipients: 0 },
      ])
    })

    it("'skip': eine Zeile, wenn die Antwort ausblieb", async () => {
      await runEventReminderJob('send', 'skip')
      expect(unreachableLines().map(entry => entry.fields)).toEqual([
        { mode: 'skip', asked: true, answered: false, dueEvents: 2, communities: 0, events: 0, recipients: 0 },
      ])
    })

    it('Einzel-Instanz: keine Zeile, auch im Modus count', async () => {
      tenancy = false
      tables.events = [dueEvent('ev-s', undefined)]
      tables.event_rsvps = [going('rs', 'ev-s', 'us')]
      await runEventReminderJob('send', 'count')
      expect(unreachableLines()).toEqual([])
    })
  })
})

describe('BE-018 — Rohwert, feste Zeilen-Id, Merker zuletzt', () => {
  const ROW_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

  it('body ist das Token mit dem Beginn und der Zone DES TERMINS — kein fertiger Text', async () => {
    tables.events = [dueEvent('ev-ny', 't-kunde-a', { timezone: 'America/New_York' })]
    tables.event_rsvps = [going('rn', 'ev-ny', 'un')]
    await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(notified[0]!.body).toBe(`@when:${String(tables.events[0]!.startAt)};America/New_York`)
    // Gegenprobe: ein Termin ohne Zone trägt eine leere Zone, nie die des Servers
    tables.events.push(dueEvent('ev-nozone', 't-kunde-a', { timezone: null }))
    tables.event_rsvps.push(going('rz', 'ev-nozone', 'uz'))
    await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    const nozone = notified.find(input => input.recipientId === 'uz')!
    expect(nozone.body).toBe(`@when:${String(tables.events[1]!.startAt)};`)
  })

  it('rowId je (Termin, Empfänger, Beginn): stabil, gültig für Appwrite, verschieden je Teil', async () => {
    await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    const u1 = notified.find(input => input.recipientId === 'u1')!
    const startAt = String(tables.events!.find(row => row.$id === 'ev-a')!.startAt)
    expect(u1.rowId).toBe(eventReminderRowId('ev-a', 'u1', startAt))
    const id = eventReminderRowId('ev-a', 'u1', startAt)
    expect(id).toMatch(ROW_ID)
    expect(id.length).toBeLessThanOrEqual(36)
    expect(eventReminderRowId('ev-a', 'u1', startAt)).toBe(id)
    expect(eventReminderRowId('ev-a', 'u2', startAt)).not.toBe(id)
    expect(eventReminderRowId('ev-b', 'u1', startAt)).not.toBe(id)
    // Verschobener Termin ⇒ neue Id, also darf er erneut erinnern
    expect(eventReminderRowId('ev-a', 'u1', '2026-12-01T10:00:00.000Z')).not.toBe(id)
  })

  it('der Merker steht erst NACH allen Benachrichtigungen seines Termins', async () => {
    await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    const mark = callLog.indexOf('mark:ev-a')
    expect(mark).toBeGreaterThan(callLog.indexOf('notify:u1'))
    expect(mark).toBeGreaterThan(callLog.indexOf('notify:u2'))
    expect(callLog.indexOf('mark:ev-b')).toBeGreaterThan(callLog.indexOf('notify:u3'))
  })

  it('ein Empfänger scheitert ⇒ kein Merker; der nächste Takt holt NUR ihn nach und setzt dann den Merker', async () => {
    let failU2 = true
    notifyImpl = async (input) => {
      if (input.recipientId === 'u2' && failU2) return { created: false }
      return deliver(input)
    }
    const first = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(first).toMatchObject({ dueEvents: 2, recipients: 3, reminded: 2, errors: 1 })
    expect(tables.events!.find(row => row.$id === 'ev-a')!.remindersSentAt).toBeNull()
    expect(typeof tables.events!.find(row => row.$id === 'ev-b')!.remindersSentAt).toBe('string')

    failU2 = false
    const second = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    // u1 läuft in die Dublette (keine Zeile, keine Mail), u2 bekommt seine Erinnerung
    expect(second).toMatchObject({ dueEvents: 1, recipients: 2, reminded: 1, errors: 0 })
    expect(remindersPerUserOf(notified)).toEqual({ u1: 1, u2: 1, u3: 1 })
    expect(typeof tables.events!.find(row => row.$id === 'ev-a')!.remindersSentAt).toBe('string')
  })

  it('wirft notify für einen Empfänger, gilt dasselbe (Störung, kein Merker)', async () => {
    notifyImpl = async (input) => {
      if (input.recipientId === 'u3') throw new Error('Glocke kaputt')
      return deliver(input)
    }
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result).toMatchObject({ reminded: 2, errors: 1 })
    expect(tables.events!.find(row => row.$id === 'ev-b')!.remindersSentAt).toBeNull()
  })

  it('Termin ohne Zusagen ⇒ Merker sofort', async () => {
    tables.event_rsvps = []
    const result = await sweepAllEventReminders({ dryRun: false, unreachableMode: 'count' })
    expect(result).toMatchObject({ dueEvents: 2, recipients: 0, reminded: 0, errors: 0 })
    expect(tables.events!.every(row => typeof row.remindersSentAt === 'string')).toBe(true)
  })

  it('die Termin-Liste (GET /api/events) stößt keinen Lauf mehr an', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../server/api/events/index.get.ts'), 'utf8')
    expect(source).not.toMatch(/sweepEventReminders|sweepAllEventReminders/)
    // Gegenprobe: der Lese-Pfad läuft weiter (Serien-Fenster)
    expect(source).toContain('topUpSeries(event)')
  })
})

function remindersPerUserOf(inputs: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const input of inputs) counts[input.recipientId as string] = (counts[input.recipientId as string] ?? 0) + 1
  return counts
}
