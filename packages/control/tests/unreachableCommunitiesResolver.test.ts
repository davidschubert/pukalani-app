import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * SE1 d — der Cross-Projekt-Leser hinter `registerUnreachableCommunitiesResolver`.
 *
 * Gegen die nachgebaute Ablage (`support/raceTablesDB.ts`), die Abfragen
 * wirklich auswertet (`equal` auf der genannten Spalte, `limit`). Die Frage,
 * an der dieser Leser still scheitern kann, ist dieselbe wie beim Host-Leser
 * (communityHostResolver.test.ts): schlägt er die richtige SPALTE nach? Der
 * Stempel ist `communities.tenantId`, nie `$id` — und weil der core-Vertrag
 * „unbekannt" als „erreichbar" liest, sähe ein Nachschlagen über `$id` aus wie
 * „alle erreichbar": jede Erinnerung ginge raus, kein Fehler im Log.
 *
 * Was die Ablage NICHT belegen kann: dass Appwrite `Query.equal` mit 100
 * Werten annimmt. Das belegt der Host-Leser gegen die echte Instanz mit
 * derselben Block-Größe.
 */

const race = createRaceTablesDB()
const listCalls: string[][] = []

vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  return {
    ...actual,
    // Mit `new` gerufen: eine Funktion, die ein Objekt zurückgibt, liefert
    // genau dieses Objekt.
    TablesDB: vi.fn(function () {
      return {
        listRows: async (input: { databaseId?: string, tableId: string, queries?: string[] }) => {
          listCalls.push(input.queries ?? [])
          return race.tablesDB.listRows(input)
        },
      }
    }),
  }
})

const { createUnreachableCommunitiesResolver } = await import('../server/utils/unreachableCommunitiesResolver')
const { COMMUNITIES_TABLE } = await import('../shared/types/tenantRecord')

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function resolver() {
  return createUnreachableCommunitiesResolver({ endpoint: 'http://control.test/v1', projectId: 'control', apiKey: 'lese-schluessel', databaseId: 'main' })
}

function community($id: string, tenantId: string, status: string, suspension?: string | null) {
  race.seed(COMMUNITIES_TABLE, {
    $id,
    host: `${tenantId}.test.local`,
    mode: 'pool',
    projectId: 'shared-project',
    tenantId,
    status,
    // Bewusst OHNE Spalte, wenn nicht angegeben — wie jede Zeile vor control-034.
    ...(suspension === undefined ? {} : { suspension }),
  })
}

beforeEach(() => {
  race.reset()
  listCalls.length = 0
})

describe('createUnreachableCommunitiesResolver', () => {
  it('nennt genau die stillgelegte und die wegen Missbrauchs gesperrte Community', async () => {
    community('row-a', 't-kunde-a', 'active', '')
    community('row-plain', 't-kunde-plain', 'active')
    community('row-off', 't-kunde-off', 'disabled', '')
    community('row-abuse', 't-kunde-abuse', 'active', 'abuse')
    community('row-billing', 't-kunde-billing', 'active', 'billing')

    const named = await resolver()(['t-kunde-a', 't-kunde-plain', 't-kunde-off', 't-kunde-abuse', 't-kunde-billing'])
    expect(named.sort()).toEqual(['t-kunde-abuse', 't-kunde-off'])
  })

  it('erreichbar (aktiv, ohne Sperre, auch ohne Spalte) ⇒ nicht genannt', async () => {
    community('row-a', 't-kunde-a', 'active', '')
    community('row-plain', 't-kunde-plain', 'active')
    await expect(resolver()(['t-kunde-a', 't-kunde-plain'])).resolves.toEqual([])
  })

  it('Zahlungs-Sperre ⇒ nicht genannt; Gegenprobe Missbrauch ⇒ genannt', async () => {
    community('row-billing', 't-kunde-billing', 'active', 'billing')
    await expect(resolver()(['t-kunde-billing'])).resolves.toEqual([])
    community('row-abuse', 't-kunde-abuse', 'active', 'abuse')
    await expect(resolver()(['t-kunde-billing', 't-kunde-abuse'])).resolves.toEqual(['t-kunde-abuse'])
  })

  it('ein Stempel ohne Zeile wird NICHT genannt (unbekannt ist keine positive Tatsache)', async () => {
    community('row-off', 't-kunde-off', 'disabled', '')
    await expect(resolver()(['t-gibt-es-nicht', 't-kunde-off'])).resolves.toEqual(['t-kunde-off'])
    await expect(resolver()(['t-gibt-es-nicht'])).resolves.toEqual([])
  })

  it('schlägt über tenantId nach, NICHT über $id', async () => {
    community('row-off', 't-kunde-off', 'disabled', '')
    // Die Row-$id ist nie der Stempel: über sie gefragt, findet sich nichts.
    await expect(resolver()(['row-off'])).resolves.toEqual([])
    // Gegenprobe: über den Stempel gefragt, ist sie genannt.
    await expect(resolver()(['t-kunde-off'])).resolves.toEqual(['t-kunde-off'])
    const equal = listCalls.at(-1)!.map(q => JSON.parse(q) as ParsedQuery).find(q => q.method === 'equal')
    expect(equal).toEqual({ method: 'equal', attribute: 'tenantId', values: ['t-kunde-off'] })
  })

  it('fragt ohne Status-Filter und liest status + suspension mit', async () => {
    community('row-off', 't-kunde-off', 'disabled', '')
    await resolver()(['t-kunde-off'])
    const parsed = listCalls[0]!.map(q => JSON.parse(q) as ParsedQuery)
    expect(parsed.filter(q => q.method === 'equal').map(q => q.attribute)).toEqual(['tenantId'])
    expect(parsed.some(q => q.method === 'notEqual')).toBe(false)
    expect(parsed.find(q => q.method === 'select')?.values).toEqual(['tenantId', 'status', 'suspension'])
  })

  it('mehr als 100 Stempel ⇒ Blöcke zu höchstens 100, jeder Block gelesen', async () => {
    const stamps = Array.from({ length: 230 }, (_, i) => `t-kunde-${String(i).padStart(3, '0')}`)
    for (const [i, stamp] of stamps.entries()) community(`row-${i}`, stamp, 'active', '')
    // Je eine nicht erreichbare im ersten, zweiten und dritten Block.
    for (const i of [5, 150, 229]) race.table(COMMUNITIES_TABLE).get(`row-${i}`)!.status = 'disabled'

    const named = await resolver()(stamps)
    expect(named.sort()).toEqual(['t-kunde-005', 't-kunde-150', 't-kunde-229'])
    expect(listCalls).toHaveLength(3)
    const sizes = listCalls.map(queries => (queries.map(q => JSON.parse(q) as ParsedQuery).find(q => q.method === 'equal')?.values ?? []).length)
    expect(sizes).toEqual([100, 100, 30])
    const limits = listCalls.map(queries => queries.map(q => JSON.parse(q) as ParsedQuery).find(q => q.method === 'limit')?.values?.[0])
    expect(limits).toEqual([100, 100, 30])
  })

  it('Dubletten und leere Werte in der Eingabe werden einmal bzw. gar nicht gefragt', async () => {
    community('row-off', 't-kunde-off', 'disabled', '')
    await expect(resolver()(['t-kunde-off', '', 't-kunde-off'])).resolves.toEqual(['t-kunde-off'])
    expect(listCalls).toHaveLength(1)
    // Nichts zu fragen ⇒ keine Abfrage.
    await expect(resolver()([])).resolves.toEqual([])
    expect(listCalls).toHaveLength(1)
  })

  it('ein Lesefehler WIRFT (der core-Vertrag fängt ihn) — kein stilles „alle erreichbar"', async () => {
    community('row-off', 't-kunde-off', 'disabled', '')
    race.failingReads.set(COMMUNITIES_TABLE, () => new Error('Control Plane weg'))
    await expect(resolver()(['t-kunde-off'])).rejects.toThrow('Control Plane weg')
  })

  it('kein Zwischenspeicher: eine aufgehobene Sperre gilt beim nächsten Aufruf', async () => {
    community('row-abuse', 't-kunde-abuse', 'active', 'abuse')
    const resolve = resolver()
    await expect(resolve(['t-kunde-abuse'])).resolves.toEqual(['t-kunde-abuse'])
    race.table(COMMUNITIES_TABLE).get('row-abuse')!.suspension = ''
    await expect(resolve(['t-kunde-abuse'])).resolves.toEqual([])
  })
})
