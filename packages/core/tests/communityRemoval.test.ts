import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  COMMUNITY_REMOVED_CODE,
  detectCommunityRemoval,
  notificationMailedSeparately,
  removedApiAllowed,
  removedNoticeRedirect,
  type CommunityRemovalMemory,
} from '../shared/communityRemoval'

/**
 * SEC-030 Teil 2 (2026-11-13): die puren Regeln der Sperre für entfernte
 * Konten — Erlaubnisliste, Reihenfolge der Erkennung, Ziel der Umleitung.
 */

describe('removedApiAllowed — Erlaubnisliste (fail-closed)', () => {
  it.each([
    '/api/auth/me',
    '/api/auth/logout',
    '/api/health',
    '/api/_nuxt_icon/ph.json',
  ])('der Core lässt %s durch', (path) => {
    expect(removedApiAllowed(path)).toBe(true)
  })

  it.each([
    '/api/comments',
    '/api/posts',
    '/api/presence/heartbeat',
    '/api/presence/leave',
    '/api/auth/realtime-token',
    '/api/notifications',
    '/api/community/role',
    '/api/community/team',
    '/api/messages/conversations',
    '/api/config',
  ])('…aber nicht %s (Inhalte, Anwesenheit, Glocke, Realtime)', (path) => {
    expect(removedApiAllowed(path)).toBe(false)
  })

  it('vergleicht an der Segmentgrenze, nicht als blosses startsWith', () => {
    expect(removedApiAllowed('/api/healthcheck')).toBe(false)
    expect(removedApiAllowed('/api/auth/meta')).toBe(false)
    expect(removedApiAllowed('/api/auth/logout-all')).toBe(false)
  })

  it('nimmt Layer-Präfixe aus der Config dazu — nur diese', () => {
    const extra = ['/api/community/removed-contact']
    expect(removedApiAllowed('/api/community/removed-contact', extra)).toBe(true)
    expect(removedApiAllowed('/api/community/removed-contact', [])).toBe(false)
    expect(removedApiAllowed('/api/community/members', extra)).toBe(false)
  })

  it('ignoriert leere und fremde Einträge (kein Joker)', () => {
    expect(removedApiAllowed('/api/comments', [''])).toBe(false)
    expect(removedApiAllowed('/api/comments', ['/'])).toBe(false)
    expect(removedApiAllowed('/api/comments', ['comments'])).toBe(false)
  })

  it.each([
    '/api/health/../comments',
    '/api/auth/me/../../comments',
    '/api/health//x',
    '/api/health%2F..%2Fcomments',
    '/api/health\\..\\comments',
  ])('mehrdeutiger Pfad %s ⇒ nicht erlaubt', (path) => {
    expect(removedApiAllowed(path)).toBe(false)
  })
})

describe('detectCommunityRemoval — Reihenfolge der Erkennung', () => {
  function sources(memory: CommunityRemovalMemory, role: boolean | Error, former: boolean | Error) {
    const hasActiveRole = vi.fn(async () => {
      if (role instanceof Error) throw role
      return role
    })
    const isFormerMember = vi.fn(async () => {
      if (former instanceof Error) throw former
      return former
    })
    return { memory: () => memory, hasActiveRole, isFormerMember }
  }

  it('„gerade entzogen" schlägt eine gecachte Rolle — ohne weitere Fragen', async () => {
    const s = sources('removed', true, false)
    expect(await detectCommunityRemoval(s)).toBe(true)
    expect(s.hasActiveRole).not.toHaveBeenCalled()
    expect(s.isFormerMember).not.toHaveBeenCalled()
  })

  it('„gerade wieder aufgenommen" schlägt ein gecachtes „ehemalig"', async () => {
    const s = sources('readmitted', false, true)
    expect(await detectCommunityRemoval(s)).toBe(false)
    expect(s.isFormerMember).not.toHaveBeenCalled()
  })

  it('ein Mitglied endet bei der Rolle — der Resolver „ehemalig" wird NICHT gefragt', async () => {
    const s = sources(null, true, true)
    expect(await detectCommunityRemoval(s)).toBe(false)
    expect(s.isFormerMember).not.toHaveBeenCalled()
  })

  it('keine Rolle + Zeile „removed" ⇒ entfernt', async () => {
    expect(await detectCommunityRemoval(sources(null, false, true))).toBe(true)
  })

  it('keine Rolle + keine Zeile (nie Mitglied) ⇒ NICHT entfernt', async () => {
    expect(await detectCommunityRemoval(sources(null, false, false))).toBe(false)
  })

  it('Störung des Resolvers „ehemalig" ⇒ nicht entfernt (fail-soft)', async () => {
    expect(await detectCommunityRemoval(sources(null, false, new Error('down')))).toBe(false)
  })

  it('Störung der Rolle ⇒ die Tatsache „removed" entscheidet', async () => {
    expect(await detectCommunityRemoval(sources(null, new Error('down'), true))).toBe(true)
    expect(await detectCommunityRemoval(sources(null, new Error('down'), false))).toBe(false)
  })
})

describe('removedNoticeRedirect — Ziel der Routen-Middleware', () => {
  const base = { removed: true, loggedIn: true, noticePath: '/removed', localizedNoticePath: '/removed', toPath: '/' }

  it('entfernt + angemeldet ⇒ jede Seite führt zur Hinweisseite', () => {
    expect(removedNoticeRedirect(base)).toBe('/removed')
    expect(removedNoticeRedirect({ ...base, toPath: '/discussions/abc' })).toBe('/removed')
    expect(removedNoticeRedirect({ ...base, toPath: '/dashboard' })).toBe('/removed')
  })

  it('nimmt den lokalisierten Pfad', () => {
    expect(removedNoticeRedirect({ ...base, localizedNoticePath: '/de/removed', toPath: '/de' })).toBe('/de/removed')
  })

  it('die Hinweisseite selbst bleibt (keine Schleife) — auch mit Schrägstrich am Ende', () => {
    expect(removedNoticeRedirect({ ...base, toPath: '/removed' })).toBeNull()
    expect(removedNoticeRedirect({ ...base, toPath: '/removed/' })).toBeNull()
    expect(removedNoticeRedirect({ ...base, localizedNoticePath: '/de/removed', toPath: '/de/removed' })).toBeNull()
  })

  it('nach dem Abmelden gilt der Zustand nicht mehr (Login und Startseite erreichbar)', () => {
    expect(removedNoticeRedirect({ ...base, loggedIn: false, toPath: '/login' })).toBeNull()
    expect(removedNoticeRedirect({ ...base, loggedIn: false })).toBeNull()
  })

  it('ohne angemeldete Hinweisseite passiert nichts (Core allein hat keine)', () => {
    expect(removedNoticeRedirect({ ...base, noticePath: '', localizedNoticePath: '' })).toBeNull()
  })

  it('nicht entfernt ⇒ nichts', () => {
    expect(removedNoticeRedirect({ ...base, removed: false })).toBeNull()
  })
})

describe('Grund und Digest', () => {
  it('der Grund heißt community_removed', () => {
    expect(COMMUNITY_REMOVED_CODE).toBe('community_removed')
  })

  it('die Nachricht an die Leitung steht nicht noch einmal im Digest', () => {
    expect(notificationMailedSeparately('member.appeal')).toBe(true)
    expect(notificationMailedSeparately('reply')).toBe(false)
  })
})

describe('Bremse je Adresse für die Kontakt-Route (05.rate-limit.ts)', () => {
  const source = readFileSync(new URL('../server/middleware/05.rate-limit.ts', import.meta.url), 'utf8')

  it('steht in WRITE_LIMITED mit 5 je Stunde — und das Fenster wird auch benutzt', () => {
    const line = source.split('\n').find(l => l.includes('removed-contact$/'))
    expect(line, 'POST /api/community/removed-contact fehlt in WRITE_LIMITED').toBeTruthy()
    expect(line).toContain('max: 5')
    expect(line).toContain('windowMs: 3_600_000')
    expect(source).toContain('store.hit(key, write?.windowMs ?? WINDOW_MS)')
    // Vor dem Auffangnetz für DELETE (find() nimmt den ersten Treffer).
    expect(source.indexOf('removed-contact$/')).toBeLessThan(source.indexOf("bucket: 'delete:other'"))
  })
})
