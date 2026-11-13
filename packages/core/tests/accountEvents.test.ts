import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_EVENT_AUDIT_ACTIONS,
  ACCOUNT_EVENT_KINDS,
  accountEventFromAuditRow,
  accountEventKind,
  formatAccountEventPlace,
  type AccountEventAuditRow,
} from '../shared/accountEvents'
import { readAccountEvents, type AccountEventsSource } from '../server/utils/accountEvents'

/**
 * Konto-Ereignisse auf `/profile/activity` (Davids Entscheidung 2026-11-13).
 *
 * Der Kern dieser Datei ist die BESITZ-PRÜFUNG: das Protokoll wird mit dem
 * Admin-Client gelesen, die Tabelle hat keine Row-Permissions — zwischen
 * einem Nutzer und den Zeilen aller anderen stehen also nur die Abfrage und
 * die Nachprüfung an der Zeile. Beide werden hier EINZELN gebrochen, damit
 * keine der anderen die Arbeit abnimmt.
 */

const ME = 'user-me'
const OTHER = 'user-other'

function row(over: Partial<AccountEventAuditRow> & Pick<AccountEventAuditRow, '$id'>): AccountEventAuditRow {
  return {
    $createdAt: '2026-11-13T10:00:00.000Z',
    actorId: ME,
    action: 'user.profile_updated',
    targetId: '',
    metadata: '',
    ip: '',
    ...over,
  }
}

/** Liest aus den serialisierten Query-Strings von node-appwrite. */
function parse(queries: string[]): Array<{ method: string, attribute?: string, values?: unknown[] }> {
  return queries.map(raw => JSON.parse(raw) as { method: string, attribute?: string, values?: unknown[] })
}

/**
 * Eine Tabelle, die sich wie Appwrite verhält: sie wendet `equal` auf
 * `actorId`/`action` an, sortiert absteigend und deckelt. `honorActorFilter:
 * false` simuliert die „optimierte" Abfrage, die den Besitz-Filter verliert.
 */
function fakeSource(
  table: AccountEventAuditRow[],
  opts: { honorActorFilter?: boolean, places?: Record<string, string> } = {},
): AccountEventsSource & { queries: string[][], lookedUp: string[] } {
  const queries: string[][] = []
  const lookedUp: string[] = []
  return {
    queries,
    lookedUp,
    async listRows(q) {
      queries.push(q)
      let rows = [...table]
      let limit = 25
      for (const part of parse(q)) {
        if (part.method === 'equal' && part.attribute === 'actorId' && opts.honorActorFilter !== false) {
          rows = rows.filter(r => (part.values ?? []).includes(r.actorId))
        }
        if (part.method === 'equal' && part.attribute === 'action') {
          rows = rows.filter(r => (part.values ?? []).includes(r.action))
        }
        if (part.method === 'limit') limit = Number(part.values?.[0])
      }
      rows.sort((a, b) => (a.$createdAt < b.$createdAt ? 1 : -1))
      return rows.slice(0, limit)
    },
    async resolvePlace(ip) {
      lookedUp.push(ip)
      return opts.places?.[ip] ?? ''
    },
  }
}

describe('accountEventFromAuditRow — Besitz an der Zeile', () => {
  it('nimmt die eigene Zeile', () => {
    expect(accountEventFromAuditRow(row({ $id: 'a' }), ME)).toMatchObject({ id: 'a', kind: 'profile_updated' })
  })

  it('verwirft die Zeile eines ANDEREN — auch wenn die Aktion passt', () => {
    expect(accountEventFromAuditRow(row({ $id: 'a', actorId: OTHER }), ME)).toBeNull()
  })

  it('verwirft eine Zeile mit ZIEL: dort hat jemand an einem anderen gehandelt', () => {
    // Gegenprobe zur Zeile darüber: der Verursacher bin ICH (als Admin), die
    // Aktion hieße gleich — trotzdem ist das kein Selbst-Ereignis.
    expect(accountEventFromAuditRow(row({ $id: 'a', action: 'user.mfa_disabled', targetId: OTHER }), ME)).toBeNull()
    expect(accountEventFromAuditRow(row({ $id: 'a', action: 'user.mfa_disabled', targetId: '' }), ME)).not.toBeNull()
  })

  it('ordnet eine Zeile OHNE Verursacher niemandem zu', () => {
    // Ein Fehlversuch, bei dem das Konto nicht feststand, wird mit leerer
    // actorId geschrieben. Eine leere userId darf darauf nie passen.
    const orphan = row({ $id: 'a', actorId: '', action: 'user.mfa_challenge_failed' })
    expect(accountEventFromAuditRow(orphan, '')).toBeNull()
    expect(accountEventFromAuditRow(orphan, ME)).toBeNull()
  })

  it('zeigt weder An-/Abmeldungen noch Admin-Aktionen', () => {
    for (const action of ['user.login', 'user.logout', 'user.self_deleted', 'user.roles_updated', 'config.updated']) {
      expect(accountEventFromAuditRow(row({ $id: 'a', action }), ME), action).toBeNull()
    }
  })
})

describe('accountEventFromAuditRow — Inhalt', () => {
  it('gibt bei „Profil geändert" die FeldNAMEN zurück, in fester Reihenfolge', () => {
    const entry = accountEventFromAuditRow(
      row({ $id: 'a', metadata: JSON.stringify({ fields: ['location', 'avatar', 'name'] }) }),
      ME,
    )
    expect(entry?.fields).toEqual(['name', 'avatar', 'location'])
  })

  it('lässt unbekannte Feldnamen und alles, was kein Name ist, fallen', () => {
    const entry = accountEventFromAuditRow(
      row({ $id: 'a', metadata: JSON.stringify({ fields: ['avatar', 'secretAnswer', 42, { name: 'x' }], name: 'Wert' }) }),
      ME,
    )
    expect(entry?.fields).toEqual(['avatar'])
    // Nichts aus den Metadaten reist als freier Text mit.
    expect(JSON.stringify(entry)).not.toContain('Wert')
    expect(JSON.stringify(entry)).not.toContain('secretAnswer')
  })

  it('hängt Felder nur an „Profil geändert", nicht an andere Arten', () => {
    const entry = accountEventFromAuditRow(
      row({ $id: 'a', action: 'user.password_changed', metadata: JSON.stringify({ method: 'self', fields: ['avatar'] }) }),
      ME,
    )
    expect(entry).toMatchObject({ kind: 'password_changed', fields: [] })
  })

  it('unterscheidet „geändert" von „über den Mail-Link neu gesetzt"', () => {
    expect(accountEventKind('user.password_changed', { method: 'self' })).toBe('password_changed')
    expect(accountEventKind('user.password_changed', { method: 'recovery' })).toBe('password_reset')
    expect(accountEventKind('user.password_changed', {})).toBe('password_changed')
  })

  it('verschweigt einen Eintrag nicht wegen kaputter Metadaten', () => {
    for (const metadata of ['{kaputt', '[]', '"text"', 'null']) {
      expect(accountEventFromAuditRow(row({ $id: 'a', metadata }), ME), metadata).toMatchObject({ kind: 'profile_updated', fields: [] })
    }
  })

  it('gibt die IP der Zeile NIE weiter — nur den hereingereichten Ort', () => {
    const entry = accountEventFromAuditRow(row({ $id: 'a', ip: '203.0.113.7' }), ME, 'Kahului, Hawaii')
    expect(entry?.place).toBe('Kahului, Hawaii')
    expect(JSON.stringify(entry)).not.toContain('203.0.113.7')
    expect(entry).not.toHaveProperty('ip')
  })
})

describe('Arten und Aktionen passen zusammen', () => {
  it('jede gelesene Aktion ergibt eine Art', () => {
    for (const action of ACCOUNT_EVENT_AUDIT_ACTIONS) {
      expect(accountEventKind(action, {}), action).not.toBeNull()
    }
  })

  it('jede Art ist über eine gelesene Aktion erreichbar (keine tote Art)', () => {
    const reachable = new Set<string>()
    for (const action of ACCOUNT_EVENT_AUDIT_ACTIONS) {
      for (const metadata of [{}, { method: 'recovery' }]) {
        const kind = accountEventKind(action, metadata)
        if (kind) reachable.add(kind)
      }
    }
    expect([...reachable].sort()).toEqual([...ACCOUNT_EVENT_KINDS].sort())
  })

  it('liest bewusst KEINE An- und Abmeldungen (Davids Entscheidung)', () => {
    expect(ACCOUNT_EVENT_AUDIT_ACTIONS).not.toContain('user.login')
    expect(ACCOUNT_EVENT_AUDIT_ACTIONS).not.toContain('user.logout')
  })
})

describe('formatAccountEventPlace', () => {
  it('setzt Stadt und Region zusammen und lässt Leeres weg', () => {
    expect(formatAccountEventPlace({ city: 'Kahului', region: 'Hawaii' })).toBe('Kahului, Hawaii')
    expect(formatAccountEventPlace({ city: '', region: 'Hawaii' })).toBe('Hawaii')
    expect(formatAccountEventPlace({ city: ' ', region: '' })).toBe('')
    expect(formatAccountEventPlace(null)).toBe('')
  })
})

describe('readAccountEvents', () => {
  const table: AccountEventAuditRow[] = [
    row({ $id: 'mine-profile', $createdAt: '2026-11-13T10:00:00.000Z', metadata: JSON.stringify({ fields: ['avatar'] }), ip: '203.0.113.7' }),
    row({ $id: 'mine-login', $createdAt: '2026-11-13T09:00:00.000Z', action: 'user.login' }),
    row({ $id: 'mine-password', $createdAt: '2026-11-12T10:00:00.000Z', action: 'user.password_changed', metadata: JSON.stringify({ method: 'self' }) }),
    row({ $id: 'theirs-profile', $createdAt: '2026-11-13T11:00:00.000Z', actorId: OTHER, metadata: JSON.stringify({ fields: ['name'] }), ip: '198.51.100.9' }),
    row({ $id: 'theirs-mfa', $createdAt: '2026-11-13T12:00:00.000Z', actorId: OTHER, action: 'user.mfa_challenge_failed' }),
  ]

  it('fragt HART nach der eigenen actorId und nur nach den Konto-Aktionen', async () => {
    const source = fakeSource(table)
    await readAccountEvents(source, ME, 10)
    const parts = parse(source.queries[0]!)
    expect(parts.find(p => p.method === 'equal' && p.attribute === 'actorId')?.values).toEqual([ME])
    expect(parts.find(p => p.method === 'equal' && p.attribute === 'action')?.values).toEqual([...ACCOUNT_EVENT_AUDIT_ACTIONS])
    expect(parts.some(p => p.method === 'limit')).toBe(true)
  })

  it('liefert die eigenen Ereignisse, neueste zuerst, ohne Anmeldung', async () => {
    const section = await readAccountEvents(fakeSource(table, { places: { '203.0.113.7': 'Kahului, Hawaii' } }), ME, 10)
    expect(section.events.map(e => e.id)).toEqual(['mine-profile', 'mine-password'])
    expect(section.events[0]).toMatchObject({ kind: 'profile_updated', fields: ['avatar'], place: 'Kahului, Hawaii' })
    expect(section.truncated).toBe(false)
  })

  it('zeigt FREMDE Zeilen auch dann nicht, wenn die Abfrage sie liefert', async () => {
    // DIE Gegenprobe: der Besitz-Filter der Abfrage ist weg (so, als hätte ihn
    // jemand „optimiert"). Die Tabelle gibt jetzt fremde Zeilen heraus — und
    // die Nachprüfung an der Zeile ist das Einzige, was noch hält.
    const source = fakeSource(table, { honorActorFilter: false, places: { '198.51.100.9': 'Berlin, Berlin' } })
    const leaky = await source.listRows([])
    expect(leaky.some(r => r.actorId === OTHER)).toBe(true)

    const section = await readAccountEvents(source, ME, 10)
    expect(section.events.map(e => e.id)).toEqual(['mine-profile', 'mine-password'])
    expect(JSON.stringify(section)).not.toContain('theirs')
    // Für eine fremde Zeile wird nicht einmal der Ort nachgeschlagen.
    expect(source.lookedUp).not.toContain('198.51.100.9')
  })

  it('der zweite Nutzer sieht seine Zeilen und keine von mir', async () => {
    const section = await readAccountEvents(fakeSource(table), OTHER, 10)
    expect(section.events.map(e => e.id)).toEqual(['theirs-mfa', 'theirs-profile'])
  })

  it('liefert ohne userId nichts und fragt gar nicht erst', async () => {
    const source = fakeSource([row({ $id: 'orphan', actorId: '' })])
    expect(await readAccountEvents(source, '', 10)).toEqual({ events: [], truncated: false })
    expect(source.queries).toHaveLength(0)
  })

  it('meldet `truncated` nur, wenn es wirklich Älteres gibt', async () => {
    const many = Array.from({ length: 4 }, (_, i) => row({ $id: `r${i}`, $createdAt: `2026-11-0${i + 1}T10:00:00.000Z` }))
    const cut = await readAccountEvents(fakeSource(many), ME, 3)
    expect(cut.events.map(e => e.id)).toEqual(['r3', 'r2', 'r1'])
    expect(cut.truncated).toBe(true)

    // Genau so viele wie das Fenster: voll, aber NICHT abgeschnitten.
    const exact = await readAccountEvents(fakeSource(many), ME, 4)
    expect(exact.events).toHaveLength(4)
    expect(exact.truncated).toBe(false)
  })

  it('behält den Eintrag, wenn die Orts-Auflösung scheitert', async () => {
    const source = fakeSource([row({ $id: 'a', ip: '203.0.113.7' })])
    source.resolvePlace = async () => { throw new Error('mmdb kaputt') }
    const section = await readAccountEvents(source, ME, 10)
    expect(section.events).toEqual([expect.objectContaining({ id: 'a', place: '' })])
  })
})
