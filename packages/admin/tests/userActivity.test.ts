import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_EVENT_PROFILE_FIELDS } from '../../core/shared/accountEvents'
import { readUserActivity, type UserActivitySource } from '../server/utils/userActivity'
import {
  USER_ACTIVITY_ACTION_KEYS,
  USER_ACTIVITY_HIDDEN_ACTIONS,
  mergeUserActivityRows,
  userActivityFromAuditRow,
  userActivityTextKey,
  type UserActivityAuditRow,
} from '../shared/userActivity'

/**
 * AKTIVITÄTSLISTE DER ADMIN-NUTZERANSICHT (AL1): der Leser über `audit_logs`
 * ohne Appwrite — die Quelle ist eine Attrappe, die die Abfragen SELBST
 * auswertet, damit geprüft wird, was der Leser fragt, und nicht nur, was er
 * mit einer fertigen Antwort tut.
 */

const ME = 'person-1'
const OTHER = 'person-2'
const OPERATOR = 'betreiber-1'

let seq = 0
function row(partial: Partial<UserActivityAuditRow> & { minute: number }): UserActivityAuditRow {
  seq += 1
  const { minute, ...rest } = partial
  return {
    $id: `row-${seq}`,
    $createdAt: new Date(Date.UTC(2026, 10, 17, 10, minute)).toISOString(),
    actorId: ME,
    actorName: 'Erika',
    action: 'user.login',
    targetType: '',
    targetId: '',
    metadata: '',
    ip: '203.0.113.7',
    ...rest,
  }
}

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function parse(query: string): ParsedQuery {
  return JSON.parse(query) as ParsedQuery
}

function matches(r: UserActivityAuditRow, q: ParsedQuery): boolean {
  const value = (r as unknown as Record<string, unknown>)[q.attribute ?? '']
  switch (q.method) {
    case 'equal': return (q.values ?? []).includes(value ?? null)
    case 'notEqual': return !(q.values ?? []).includes(value)
    case 'isNull': return value === null || value === undefined
    case 'or': return (q.values as string[] | ParsedQuery[]).some(v => matches(r, typeof v === 'string' ? parse(v) : v))
    default: return true
  }
}

/** Eine Tabelle im Speicher, die die Queries des Lesers wirklich anwendet. */
function tableSource(rows: UserActivityAuditRow[], places: Record<string, string> = {}) {
  const calls: ParsedQuery[][] = []
  const resolved: string[] = []
  const source: UserActivitySource = {
    listRows: async (queries) => {
      const parsed = queries.map(parse)
      calls.push(parsed)
      const limit = parsed.find(q => q.method === 'limit')?.values?.[0]
      expect(typeof limit, 'jede Abfrage nennt ihr Limit').toBe('number')
      expect(parsed.some(q => q.method === 'orderDesc' && q.attribute === '$createdAt')).toBe(true)
      return rows
        .filter(r => parsed.every(q => matches(r, q)))
        .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
        .slice(0, Number(limit))
    },
    resolvePlace: async (ip) => {
      resolved.push(ip)
      return places[ip] ?? ''
    },
  }
  return { source, calls, resolved }
}

describe('readUserActivity: zwei Abfragen, ein Konto', () => {
  it('führt Selbst- und Betreiber-Zeilen zusammen, neueste zuerst', async () => {
    const rows = [
      row({ minute: 1, action: 'user.login', metadata: '{"method":"password"}' }),
      row({ minute: 3, actorId: OPERATOR, actorName: 'Max Betreiber', action: 'user.block', targetType: 'user', targetId: ME, ip: '198.51.100.9' }),
      row({ minute: 2, action: 'user.profile_updated', metadata: '{"fields":["avatar","name","geheim"]}' }),
    ]
    const { source, resolved } = tableSource(rows, { '203.0.113.7': 'Wailuku, Hawaii' })
    const result = await readUserActivity(source, ME, 20)

    expect(result.truncated).toBe(false)
    expect(result.activity.map(entry => [entry.action, entry.origin])).toEqual([
      ['user.block', 'operator'],
      ['user.profile_updated', 'self'],
      ['user.login', 'self'],
    ])
    const [block, profile, login] = result.activity
    // Betreiber-Zeile: Name des Betreibers, aber NICHT seine IP und kein Ort.
    expect(block).toMatchObject({ operatorName: 'Max Betreiber', ip: '', place: '' })
    // Selbst-Zeile: IP und Ort der Person, kein Betreiber-Name.
    expect(login).toMatchObject({ operatorName: '', ip: '203.0.113.7', place: 'Wailuku, Hawaii', method: 'password' })
    // Feldnamen nur aus der erlaubten Liste, in deren Reihenfolge.
    expect(profile!.fields).toEqual(['name', 'avatar'])
    // Für die Betreiber-IP wurde gar nicht erst nachgeschlagen.
    expect(resolved).not.toContain('198.51.100.9')
  })

  it('fragt (a) actorId ohne Ziel und (b) targetType user + targetId, beide mit Limit +1 und ohne Ansichten', async () => {
    const { source, calls } = tableSource([])
    await readUserActivity(source, ME, 20)
    expect(calls).toHaveLength(2)
    for (const queries of calls) {
      expect(queries.find(q => q.method === 'limit')?.values).toEqual([21])
      const excluded = queries.filter(q => q.method === 'notEqual' && q.attribute === 'action').flatMap(q => q.values)
      expect(excluded.sort()).toEqual([...USER_ACTIVITY_HIDDEN_ACTIONS].sort())
    }
    const [self, operator] = calls
    expect(self).toContainEqual({ method: 'equal', attribute: 'actorId', values: [ME] })
    expect(self!.some(q => q.method === 'or')).toBe(true)
    expect(operator).toContainEqual({ method: 'equal', attribute: 'targetId', values: [ME] })
    expect(operator).toContainEqual({ method: 'equal', attribute: 'targetType', values: ['user'] })
  })

  it('Ansichten fressen das Budget nicht: 30 × user.viewed verdrängen nichts', async () => {
    const views = Array.from({ length: 30 }, (_, i) =>
      row({ minute: 30 + i, actorId: OPERATOR, action: 'user.viewed', targetType: 'user', targetId: ME }))
    const listViews = Array.from({ length: 5 }, (_, i) => row({ minute: 10 + i, action: 'user.list_viewed' }))
    const real = row({ minute: 1, action: 'user.mfa_enabled' })
    const { source } = tableSource([...views, ...listViews, real])
    const result = await readUserActivity(source, ME, 20)
    expect(result.activity.map(entry => entry.id)).toEqual([real.$id])
    expect(result.truncated).toBe(false)
  })

  it('deckelt auf limit und meldet truncated nur, wenn es wirklich Älteres gibt', async () => {
    const exactly = Array.from({ length: 3 }, (_, i) => row({ minute: i }))
    expect((await readUserActivity(tableSource(exactly).source, ME, 3)).truncated).toBe(false)

    const more = Array.from({ length: 4 }, (_, i) => row({ minute: i }))
    const result = await readUserActivity(tableSource(more).source, ME, 3)
    expect(result.activity).toHaveLength(3)
    expect(result.truncated).toBe(true)
    // Die ÄLTESTE fällt heraus.
    expect(result.activity.map(entry => entry.id)).not.toContain(more[0]!.$id)
  })

  it('verwirft Zeilen, die zu einem anderen Konto gehören', async () => {
    const rows = [
      // ME hat als Betreiber an jemand ANDEREM gehandelt — gehört in dessen Ansicht.
      row({ minute: 5, action: 'user.block', targetType: 'user', targetId: OTHER }),
      // Ein fremdes Konto hat sich angemeldet.
      row({ minute: 4, actorId: OTHER, action: 'user.login' }),
      // Ziel-Id passt, aber das Ziel ist keine Person (Datei mit gleicher Id).
      row({ minute: 3, actorId: OPERATOR, action: 'storage.file_deleted', targetType: 'file', targetId: ME }),
      row({ minute: 1, action: 'user.logout' }),
    ]
    const result = await readUserActivity(tableSource(rows).source, ME, 20)
    expect(result.activity.map(entry => entry.action)).toEqual(['user.logout'])
  })

  it('Nachprüfung an der Zeile hält auch, wenn die Quelle alles zurückgibt', async () => {
    const rows = [
      row({ minute: 3, action: 'user.block', targetType: 'user', targetId: OTHER }),
      row({ minute: 2, actorId: OTHER, action: 'user.login' }),
      row({ minute: 1, action: 'user.viewed', actorId: OPERATOR, targetType: 'user', targetId: ME }),
    ]
    const careless: UserActivitySource = { listRows: async () => rows, resolvePlace: async () => '' }
    const result = await readUserActivity(careless, ME, 20)
    expect(result.activity).toEqual([])
  })

  it('entdoppelt nach $id (dieselbe Zeile aus beiden Abfragen erscheint einmal)', () => {
    const shared = row({ minute: 2, actorId: ME, action: 'user.roles_updated', targetType: 'user', targetId: ME })
    const self = row({ minute: 1 })
    const merged = mergeUserActivityRows([[shared, self], [shared]], ME, 20)
    expect(merged.rows.map(r => r.$id)).toEqual([shared.$id, self.$id])
    expect(merged.truncated).toBe(false)
  })

  it('kaputtes metadata-JSON bricht nichts — nur die Details fehlen', async () => {
    const rows = [
      row({ minute: 3, action: 'user.profile_updated', metadata: '{kaputt' }),
      row({ minute: 2, action: 'user.login', metadata: '["password"]' }),
      row({ minute: 1, action: 'user.password_changed', metadata: '{"method":"<script>"}' }),
    ]
    const result = await readUserActivity(tableSource(rows).source, ME, 20)
    expect(result.activity).toHaveLength(3)
    expect(result.activity.map(entry => [entry.fields, entry.method])).toEqual([[[], ''], [[], ''], [[], '']])
  })

  it('ein Ort, der nicht auflösbar ist, kostet keinen Eintrag', async () => {
    const only = row({ minute: 1 })
    const source: UserActivitySource = {
      listRows: async () => [only],
      resolvePlace: async () => { throw new Error('mmdb weg') },
    }
    const result = await readUserActivity(source, ME, 20)
    expect(result.activity).toEqual([expect.objectContaining({ place: '', ip: '203.0.113.7' })])
  })

  it('ein Lesefehler WIRFT (die Route macht daraus activityFailed, keinen leeren Tag)', async () => {
    const source: UserActivitySource = {
      listRows: async () => { throw new Error('audit_logs down') },
      resolvePlace: async () => '',
    }
    await expect(readUserActivity(source, ME, 20)).rejects.toThrow('audit_logs down')
  })

  it('ohne Konto-Id wird nichts gelesen', async () => {
    const { source, calls } = tableSource([row({ minute: 1, actorId: '' })])
    expect(await readUserActivity(source, '', 20)).toEqual({ activity: [], truncated: false })
    expect(calls).toEqual([])
  })
})

describe('Texte', () => {
  const read = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as {
    admin: { users: { detail: { activity: { event: Record<string, string>, field: Record<string, string> } } } }
  }
  const locales = { de: read('../i18n/locales/de.json'), en: read('../i18n/locales/en.json') }

  it.each(Object.entries(locales))('%s: jede bekannte Aktion und jedes Feld hat einen Text', (_lang, messages) => {
    const { event, field } = messages.admin.users.detail.activity
    const needed = [...new Set([...Object.values(USER_ACTIVITY_ACTION_KEYS), 'passwordReset'])]
    for (const key of needed) expect(event[key], key).toBeTruthy()
    // Kein toter Text ohne Eintrag in der Liste (die alten Appwrite-Namen sind raus).
    expect(Object.keys(event).sort()).toEqual(needed.sort())
    for (const name of ACCOUNT_EVENT_PROFILE_FIELDS) expect(field[name], name).toBeTruthy()
  })

  it('Ansichten haben keinen Text — sie erreichen die Liste nie', () => {
    for (const action of USER_ACTIVITY_HIDDEN_ACTIONS) expect(USER_ACTIVITY_ACTION_KEYS[action]).toBeUndefined()
  })

  it('Passwort über den Mail-Link ist ein eigener Vorgang; Unbekanntes bleibt roh (null)', () => {
    expect(userActivityTextKey('user.password_changed', 'recovery')).toBe('passwordReset')
    expect(userActivityTextKey('user.password_changed', 'password')).toBe('passwordChanged')
    expect(userActivityTextKey('user.something_new', '')).toBeNull()
    const unknown = userActivityFromAuditRow(row({ minute: 1, action: 'user.something_new' }), ME)
    expect(unknown).toMatchObject({ action: 'user.something_new', origin: 'self' })
  })
})
