import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER ERINNERUNGS-LAUF ÜBER ALLE COMMUNITIES (OPS-003).
 *
 * Bis dahin wurde nur erinnert, wo jemand die Events-Seite öffnete (oder für
 * die eine Community des alten Zeitplans). Geprüft wird hier, was der neue
 * Lauf zusagt: jede Community, jede Erinnerung in IHRER Glocke, nichts doppelt
 * — auch nicht, wenn der Sweep beim Lesen gleichzeitig läuft — und im
 * Zähl-Modus kein einziger Schreibvorgang.
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
let notifyImpl: (input: Record<string, unknown>) => Promise<{ created: boolean }>
let notified: Record<string, unknown>[]
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
  Object.assign(row, data)
  return row
}

const tablesDB = { listRows: vi.fn(listRows), updateRow: vi.fn(updateRow) }

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy: { enabled: tenancy } } }))
vi.stubGlobal('isProductEnabled', async () => productEnabled)
vi.stubGlobal('notify', (_event: unknown, input: Record<string, unknown>) => notifyImpl(input))
vi.stubGlobal('logEvent', (level: string, name: string, fields: Record<string, unknown>) => {
  logged.push({ level, name, fields })
})
// Die Datentür des Sweeps beim Lesen: scopet auf den Mandanten des Requests,
// wie tenantDb() es im Pool tut.
vi.stubGlobal('tenantDb', (event: H3Event) => {
  const tenantId = (event.context as { tenantId?: string }).tenantId
  const scoped = (queries: string[]) => tenantId ? [...queries, JSON.stringify({ method: 'equal', attribute: 'communityId', values: [tenantId] })] : queries
  return {
    list: (tableId: string, queries: string[]) => listRows({ tableId, queries: scoped(queries) }),
    update: (tableId: string, rowId: string, data: Record<string, unknown>) => updateRow({ tableId, rowId, data }),
  }
})

const {
  EVENT_REMINDER_RUN_CAP,
  runEventReminderJob,
  sweepAllEventReminders,
  sweepEventReminders,
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
  notifyImpl = async (input) => {
    notified.push(input)
    return { created: true }
  }
  productEnabled = true
  tenancy = true
  logged.length = 0
})

describe('sweepAllEventReminders — alle Communities', () => {
  it('erinnert in beiden Communities, jede Meldung mit dem Stempel IHRER Community', async () => {
    const result = await sweepAllEventReminders({ dryRun: false })

    expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 3, errors: 0 })
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

    const result = await sweepAllEventReminders({ dryRun: false })
    expect(result.dueEvents).toBe(2)
    expect(notified.map(input => input.recipientId).sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('dryRun schreibt nichts und zählt dieselben Zahlen', async () => {
    const result = await sweepAllEventReminders({ dryRun: true })

    expect(result).toEqual({ communities: 2, dueEvents: 2, recipients: 3, reminded: 0, errors: 0 })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(notified).toEqual([])
    expect(tables.events!.every(row => row.remindersSentAt === null)).toBe(true)
  })

  it('Merker vor notify: wirft notify, bleibt der Merker stehen und errors zählt', async () => {
    notifyImpl = async () => { throw new Error('Glocke kaputt') }
    const result = await sweepAllEventReminders({ dryRun: false })

    expect(result.errors).toBe(3)
    expect(result.reminded).toBe(0)
    expect(tables.events!.every(row => typeof row.remindersSentAt === 'string')).toBe(true)
    // ... und der nächste Lauf versucht es nicht noch einmal
    notifyImpl = async (input) => { notified.push(input); return { created: true } }
    expect((await sweepAllEventReminders({ dryRun: false })).dueEvents).toBe(0)
    expect(notified).toEqual([])
  })

  it('notify meldet „nicht geschrieben" ⇒ errors, nicht reminded', async () => {
    notifyImpl = async () => ({ created: false })
    const result = await sweepAllEventReminders({ dryRun: false })
    expect(result).toMatchObject({ reminded: 0, errors: 3 })
  })

  it('scheitert der Merker, geht keine Erinnerung raus, der Lauf läuft weiter', async () => {
    updateError = new Error('Schreiben gescheitert')
    const result = await sweepAllEventReminders({ dryRun: false })
    expect(result).toMatchObject({ dueEvents: 2, reminded: 0, errors: 2 })
    expect(notified).toEqual([])
  })

  it('ein Lesefehler der Termin-Liste wirft (der Zeit-Lauf meldet failed)', async () => {
    tablesDB.listRows.mockImplementationOnce(async () => { throw new Error('Datenbank weg') })
    await expect(sweepAllEventReminders({ dryRun: false })).rejects.toThrow('Datenbank weg')
    // Die Warteschlange bleibt danach benutzbar
    expect((await sweepAllEventReminders({ dryRun: false })).reminded).toBe(3)
  })

  it('ein zweiter Lauf erinnert nicht noch einmal', async () => {
    await sweepAllEventReminders({ dryRun: false })
    const second = await sweepAllEventReminders({ dryRun: false })
    expect(second).toEqual({ communities: 0, dueEvents: 0, recipients: 0, reminded: 0, errors: 0 })
    expect(notified).toHaveLength(3)
  })

  it('Pool-Zeile ohne Stempel wird gezählt, nicht geraten', async () => {
    tables.events!.push(dueEvent('ev-x', undefined))
    tables.event_rsvps!.push(going('rx', 'ev-x', 'ux'))
    const result = await sweepAllEventReminders({ dryRun: false })
    expect(result.errors).toBe(1)
    expect(notified.some(input => input.recipientId === 'ux')).toBe(false)
  })

  it('Silo (Mandanten-Auflösung aus): erinnert ohne Stempel wie der bisherige Sweep', async () => {
    tenancy = false
    tables.events = [dueEvent('ev-s', undefined)]
    tables.event_rsvps = [going('rs', 'ev-s', 'us')]
    const result = await sweepAllEventReminders({ dryRun: false })
    expect(result).toEqual({ communities: 1, dueEvents: 1, recipients: 1, reminded: 1, errors: 0 })
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

    const first = await sweepAllEventReminders({ dryRun: false })
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

    const second = await sweepAllEventReminders({ dryRun: false })
    expect(second.dueEvents).toBe(30)
  })
})

describe('eine Warteschlange im Prozess', () => {
  const readEvent = (tenantId: string) => ({ context: { tenantId } }) as unknown as H3Event

  function remindersPerUser(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const input of notified) counts[input.recipientId as string] = (counts[input.recipientId as string] ?? 0) + 1
    return counts
  }

  it('Sweep beim Lesen und Zeit-Lauf gleichzeitig ⇒ jede Zusage genau eine Erinnerung', async () => {
    const read = sweepEventReminders(readEvent('t-kunde-a'))
    const all = sweepAllEventReminders({ dryRun: false })
    await Promise.all([read, all])
    expect(remindersPerUser()).toEqual({ u1: 1, u2: 1, u3: 1 })
  })

  it('auch in umgekehrter Reihenfolge (der Lauf zuerst, der GET wartet nicht dahinter)', async () => {
    const all = sweepAllEventReminders({ dryRun: false })
    const read = sweepEventReminders(readEvent('t-kunde-a'))
    await Promise.all([read, all])
    expect(remindersPerUser()).toEqual({ u1: 1, u2: 1, u3: 1 })
  })

  it('zwei Zeit-Läufe gleichzeitig (Route + Takt) ⇒ der spätere liest den Merker des früheren', async () => {
    // Liefen sie parallel, sähen beide `remindersSentAt: null` — der Speicher
    // oben antwortet mit einem Takt Verzögerung, das Fenster wäre also offen.
    await Promise.all([sweepAllEventReminders({ dryRun: false }), sweepAllEventReminders({ dryRun: false })])
    expect(remindersPerUser()).toEqual({ u1: 1, u2: 1, u3: 1 })
  })
})

describe('runEventReminderJob — ein Takt des Zeit-Laufs', () => {
  it("Modus 'count': genau eine Zeile events.reminder_count, nur Zahlen, nichts geschrieben", async () => {
    expect(await runEventReminderJob('count')).toBeUndefined()

    expect(logged).toHaveLength(1)
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
    await runEventReminderJob('count')
    expect(logged.map(entry => entry.name)).toEqual(['events.reminder_count'])
  })

  it("Modus 'send' erinnert", async () => {
    await runEventReminderJob('send')
    expect(notified).toHaveLength(3)
    expect(logged.map(entry => entry.name)).toEqual(['events.reminders_sent'])
  })

  it('abgeschaltetes Produkt ⇒ skipped, kein Lesen, keine Zeile', async () => {
    productEnabled = false
    expect(await runEventReminderJob('send')).toBe('skipped')
    expect(listCalls).toEqual([])
    expect(notified).toEqual([])
    expect(logged).toEqual([])
  })
})
