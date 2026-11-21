import { beforeAll, describe, expect, it, vi } from 'vitest'
import { aiCrawlerPolicy, aiCrawlerRobotsProblems } from '../../../packages/core/shared/aiCrawlers'

/**
 * KI-TRAINING JE COMMUNITY (KC1) — die ECHTE Route `/robots.txt` der
 * Platform-App, gestellt ist nur der Mandanten-Kontext.
 *
 *  - Vorgabe (keine Wahl im Profil): Training NEIN.
 *  - Wahl „ja" ändert die robots.txt DIESER Community — und nur dieser: zwei
 *    Mandanten auf demselben Prozess, jeder bekommt seine eigene Antwort.
 *  - Gegenprobe: „nur für Mitglieder" sperrt weiter alles, auch mit „ja".
 */

type Handler = (event: unknown) => string
let handler: Handler

interface FakeEvent { host: string, context: { tenant: Record<string, unknown> | null, controlCenter?: boolean } }

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('useTenant', (event: FakeEvent) => event.context.tenant)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(`https://${event.host}/robots.txt`))
  handler = (await import('../server/routes/robots.txt.get')).default as unknown as Handler
})

function call(host: string, tenant: Record<string, unknown>): string {
  return handler({ host, context: { tenant } })
}

const PUBLIC = { mode: 'pool', communityId: 'c', tenantId: 't', audience: 'public' }

describe('robots.txt einer Community und die Wahl des Owners', () => {
  it('Vorgabe ohne Wahl: Training nein', () => {
    const body = call('kunde-a.pukalani.app', { ...PUBLIC, communityId: 'c-a' })
    expect(aiCrawlerRobotsProblems(body, aiCrawlerPolicy('community'))).toEqual([])
    expect(body).toContain('ai-train=no')
  })

  it('Wahl „ja": Training erlaubt — und nur für diese Community', () => {
    const chosen = call('kunde-a.pukalani.app', { ...PUBLIC, communityId: 'c-a', aiTraining: true })
    const neighbour = call('kunde-b.pukalani.app', { ...PUBLIC, communityId: 'c-b' })
    expect(aiCrawlerRobotsProblems(chosen, aiCrawlerPolicy('community', { training: true }))).toEqual([])
    expect(chosen).toContain('ai-train=yes')
    // Mandanten-Grenze: der Nachbar bleibt bei der Vorgabe.
    expect(aiCrawlerRobotsProblems(neighbour, aiCrawlerPolicy('community'))).toEqual([])
    expect(neighbour).toContain('ai-train=no')
    // Gegenprobe: die zwei Antworten unterscheiden sich wirklich.
    expect(chosen).not.toEqual(neighbour.replace('kunde-b', 'kunde-a'))
  })

  it('Gegenprobe: „nur für Mitglieder" sperrt weiter alles, auch mit Wahl „ja"', () => {
    const body = call('kunde-a.pukalani.app', { ...PUBLIC, audience: 'members', aiTraining: true })
    expect(body).toContain('Disallow: /')
    expect(body).not.toContain('ai-train=yes')
  })
})
