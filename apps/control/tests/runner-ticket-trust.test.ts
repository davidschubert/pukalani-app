import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER TICKET-RESOLVER DER BETREIBER-APP (RU1 b) — `server/plugins/runner-ticket-trust.ts`.
 *
 * Nur diese App kennt Tickets UND Runner. Ihr Plugin beantwortet dem
 * runner-Layer zwei Fragen aus EINEM Lesevorgang: gilt der Auftrag als
 * geprüft (Herkunft des Tickets), und wie lautet er (gebaut vom tickets-Layer).
 * Das Plugin läuft hier echt; nachgebildet sind die Ablage und die
 * Anmeldung des Resolvers bei der Registry.
 *
 * Die erwarteten Texte stehen ausgeschrieben da — nicht mit der Funktion des
 * Programms gebaut.
 */

type Answer = { trusted: boolean, promptSource?: string } | null
type Resolver = (event: H3Event, subjectId: string) => Promise<Answer>

interface TicketFake { $id: string, title: string, description: string, checklist: string, origin: string }

let tickets: Map<string, TicketFake>
let readError: unknown
const registered = new Map<string, Resolver>()
const getRow = vi.fn(async ({ tableId, rowId }: { databaseId: string, tableId: string, rowId: string }) => {
  if (readError) throw readError
  expect(tableId).toBe('tickets')
  const row = tickets.get(rowId)
  if (!row) throw Object.assign(new Error('Row not found'), { code: 404 })
  return row
})

vi.stubGlobal('defineNitroPlugin', (setup: () => void) => setup)
vi.stubGlobal('registerRunSubjectTrustResolver', (type: string, resolver: Resolver) => { registered.set(type, resolver) })
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: { getRow } }))

const event = {} as H3Event
let resolve: Resolver

beforeAll(async () => {
  const plugin = (await import('../server/plugins/runner-ticket-trust')).default as unknown as () => void
  plugin()
  const resolver = registered.get('ticket')
  if (!resolver) throw new Error('Das Plugin hat keinen Resolver für Tickets angemeldet')
  resolve = resolver
})

beforeEach(() => {
  getRow.mockClear()
  readError = null
  tickets = new Map([
    ['t-operator', {
      $id: 't-operator',
      title: 'Knopf ohne Beschriftung',
      description: 'Bitte beheben.\n\n---\n\n**🤖 KI-Triage** (Modell)\n\nDieser Absatz gehört nicht in den Auftrag.',
      checklist: JSON.stringify([{ text: 'Beschriftung setzen', done: false }, { text: 'erledigt', done: true }]),
      origin: 'operator',
    }],
    ['t-feedback', { $id: 't-feedback', title: 'Aus einer Rückmeldung', description: 'Text von außen', checklist: '', origin: 'feedback' }],
    ['t-alt', { $id: 't-alt', title: 'Altbestand', description: '', checklist: '', origin: '' }],
  ])
})

describe('Ticket-Resolver: Herkunft und Auftragstext aus einem Lesevorgang', () => {
  it('meldet sich genau für den Subjekt-Typ `ticket` an', () => {
    expect([...registered.keys()]).toEqual(['ticket'])
  })

  it('Ticket vom Betreiber: geprüft, und der Text ist der Auftrag aus der Zeile', async () => {
    await expect(resolve(event, 't-operator')).resolves.toEqual({
      trusted: true,
      promptSource: '# Knopf ohne Beschriftung\n\nBitte beheben.\n\n## Checkliste\n\n- [ ] Beschriftung setzen\n',
    })
    expect(getRow).toHaveBeenCalledTimes(1)
  })

  it('Ticket aus einer Rückmeldung: ungeprüft — der Text kommt trotzdem vom Server', async () => {
    await expect(resolve(event, 't-feedback')).resolves.toEqual({
      trusted: false,
      promptSource: '# Aus einer Rückmeldung\n\nText von außen\n',
    })
  })

  it('Altbestand ohne Herkunft: ungeprüft', async () => {
    await expect(resolve(event, 't-alt')).resolves.toEqual({ trusted: false, promptSource: '# Altbestand\n' })
  })

  it('das Ticket gibt es nicht: null (die Anlege-Route antwortet dann 404)', async () => {
    await expect(resolve(event, 't-weg')).resolves.toBeNull()
  })

  it('die Ablage antwortet nicht: der Fehler geht weiter — geraten wird nicht', async () => {
    readError = Object.assign(new Error('Service unavailable'), { code: 503 })
    await expect(resolve(event, 't-operator')).rejects.toThrow('Service unavailable')
  })
})
