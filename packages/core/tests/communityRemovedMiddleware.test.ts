import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import * as join from '../server/utils/communityJoin'
import * as membership from '../server/utils/communityMembership'
import { COMMUNITY_ID, resetCommunityWorld, wireCommunityWorld, type CommunityWorld, type ThrownLike } from './support/participationHarness'

/**
 * SEC-030 Teil 2 (2026-11-13): die Server-Middleware, die entfernte Konten
 * erkennt und ihnen die API der Community sperrt.
 *
 * Echte Welt aus dem Prüfstand (`participationHarness.ts`): Rollen-Resolver
 * mit 30-s-Cache-Verhalten, Kurzzeit-Gedächtnis des Beitritts. Dazu der
 * gebündelte Resolver „ehemalig" als Spion — er kennt NUR die Personen mit
 * einer Zeile `status: 'removed'`.
 */

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

let allowedFromConfig: string[] = []
vi.stubGlobal('useAppConfig', () => ({ pukalani: { community: { removedAllowedApi: allowedFromConfig } } }))

const { default: middleware } = await import('../server/middleware/06.community-removed') as unknown as {
  default: (event: H3Event) => Promise<void>
}

const formerIds = new Set<string>(['u-removed', 'u-ghost'])
const formerResolver = vi.fn(async ({ runtimeUserIds }: { runtimeUserIds: string[] }) =>
  runtimeUserIds.filter(id => formerIds.has(id)))

function world(init: CommunityWorld & { path: string, method?: string, userId?: string }) {
  const { event } = wireCommunityWorld(init)
  membership.__resetFormerCommunityMembersResolver()
  membership.registerFormerCommunityMembersResolver(formerResolver)
  formerResolver.mockClear()
  const e = event as unknown as { path: string, method: string, context: H3Event['context'] }
  e.path = init.path
  e.method = init.method ?? 'GET'
  if (init.userId && e.context.user) e.context.user.$id = init.userId
  return event
}

async function run(event: H3Event): Promise<ThrownLike | null> {
  try {
    await middleware(event)
    return null
  }
  catch (error) {
    return error as ThrownLike
  }
}

afterEach(() => {
  resetCommunityWorld()
  membership.__resetFormerCommunityMembersResolver()
  allowedFromConfig = []
})

describe('06.community-removed — entfernte Konten', () => {
  it('entfernt ⇒ /api/comments antwortet 403 community_removed', async () => {
    const event = world({ who: 'removed', path: '/api/comments?targetId=x', method: 'GET' })
    const thrown = await run(event)
    expect(thrown?.status).toBe(403)
    expect(thrown?.data?.code).toBe('community_removed')
    expect(event.context.communityRemoved).toBe(true)
  })

  it('…auch schreibend (private Antworten, Beiträge) — ohne bis zur Route zu kommen', async () => {
    for (const path of ['/api/messages/conversations', '/api/posts', '/api/presence/heartbeat', '/api/auth/realtime-token', '/api/notifications']) {
      const thrown = await run(world({ who: 'removed', path, method: 'POST' }))
      expect(thrown?.data?.code, path).toBe('community_removed')
    }
  })

  it('erlaubte Pfade kommen durch (Abmelden, Sitzung, Betriebsprüfung)', async () => {
    for (const path of ['/api/auth/logout', '/api/auth/me', '/api/health']) {
      const event = world({ who: 'removed', path })
      expect(await run(event), path).toBeNull()
      expect(event.context.communityRemoved).toBe(true)
    }
  })

  it('ein Layer-Präfix aus der Config kommt durch — nur mit Eintrag', async () => {
    expect((await run(world({ who: 'removed', path: '/api/community/removed-contact', method: 'POST' })))?.status).toBe(403)
    allowedFromConfig = ['/api/community/removed-contact']
    expect(await run(world({ who: 'removed', path: '/api/community/removed-contact', method: 'POST' }))).toBeNull()
  })

  it('Seiten-Request: nichts geworfen, aber der Zustand steht im Kontext', async () => {
    const event = world({ who: 'removed', path: '/discussions' })
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBe(true)
  })

  it('interne Pfade (/_nuxt, /_i18n) werden übersprungen', async () => {
    const event = world({ who: 'removed', path: '/_i18n/de/messages.json' })
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
  })

  it('ohne Notiz: Zeile „removed" + keine Rolle ⇒ entfernt (der Normalfall nach 30 s)', async () => {
    const event = world({ who: 'stranger', userId: 'u-ghost', path: '/api/comments' })
    expect((await run(event))?.data?.code).toBe('community_removed')
  })

  it('nie Mitglied ⇒ nichts (weder Sperre noch Zustand)', async () => {
    const event = world({ who: 'stranger', path: '/api/comments' })
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
    const page = world({ who: 'stranger', path: '/' })
    expect(await run(page)).toBeNull()
    expect(page.context.communityRemoved).toBeUndefined()
  })

  it('Mitglied ⇒ nichts, und der Resolver „ehemalig" wird NICHT gefragt', async () => {
    const event = world({ who: 'member', path: '/api/comments' })
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
    expect(formerResolver).not.toHaveBeenCalled()
  })

  it('Gast ⇒ nichts', async () => {
    const event = world({ who: 'guest', path: '/api/comments' })
    expect(await run(event)).toBeNull()
    expect(formerResolver).not.toHaveBeenCalled()
  })

  it('Silo ⇒ nichts (das Projekt ist die Grenze)', async () => {
    const event = world({ who: 'removed', mode: 'silo', path: '/api/comments' })
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
  })

  it('Störung des Resolvers „ehemalig" ⇒ nichts (fail-soft)', async () => {
    const event = world({ who: 'stranger', userId: 'u-ghost', path: '/api/comments' })
    formerResolver.mockRejectedValueOnce(new Error('control plane down'))
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
  })

  it('„gerade entzogen" schlägt die gecachte Rolle', async () => {
    // who: 'removed' — der Rollen-Resolver antwortet noch „viewer" (30-s-Cache),
    // die Notiz der Entfernen-Route steht aber schon.
    const event = world({ who: 'removed', path: '/api/comments' })
    expect((await run(event))?.data?.code).toBe('community_removed')
  })

  it('„wieder aufgenommen" schlägt ein gecachtes „ehemalig"', async () => {
    // Der Resolver „ehemalig" sagt (aus seinem 60-s-Cache) noch „ja", die
    // Rolle ist (aus ihrem 30-s-Cache) noch leer — die Einladung ist aber
    // gerade angenommen worden.
    const event = world({ who: 'stranger', userId: 'u-ghost', path: '/api/comments' })
    join.rememberCommunityAccessRestored(COMMUNITY_ID, 'u-ghost')
    expect(await run(event)).toBeNull()
    expect(event.context.communityRemoved).toBeUndefined()
  })

  it('ein neuer Entzug nach der Rückkehr gilt wieder sofort', async () => {
    join.rememberCommunityAccessRestored(COMMUNITY_ID, 'u-ghost')
    const event = world({ who: 'stranger', userId: 'u-ghost', path: '/api/comments' })
    join.rememberCommunityAccessRestored(COMMUNITY_ID, 'u-ghost')
    join.rememberCommunityAccessRevoked(COMMUNITY_ID, 'u-ghost')
    expect((await run(event))?.data?.code).toBe('community_removed')
  })
})

describe('Kurzzeit-Gedächtnis unterscheidet die Ablehnungen', () => {
  afterEach(() => join.__resetCommunityJoinMemory())

  it('removed, readmitted und nichts', () => {
    expect(join.communityAccessMemory('c', 'u')).toBeNull()
    join.rememberCommunityAccessRevoked('c', 'u')
    expect(join.communityAccessMemory('c', 'u')).toBe('removed')
    join.forgetCommunityAccessDecision('c', 'u')
    join.rememberCommunityAccessRestored('c', 'u')
    expect(join.communityAccessMemory('c', 'u')).toBe('readmitted')
    // Die Notiz beeinflusst den Beitritt NICHT: sie ist keine Ablehnung.
    expect(join.communityAccessRecentlyDenied('c', 'u')).toBe(false)
  })
})
