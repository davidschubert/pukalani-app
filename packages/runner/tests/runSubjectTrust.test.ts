import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * Die Registry „gilt der Text dieses Subjekts als geprüft?" (SEC-038) —
 * server/utils/runSubjectTrust.ts. Jede Regel hat ihre Gegenprobe: ein Test,
 * der nur „geprüft ⇒ geprüft" zeigt, bleibt grün, wenn jemand die Regel zu
 * „im Zweifel geprüft" vereinfacht.
 */

vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

type Trust = typeof import('../server/utils/runSubjectTrust')
let trust: Trust

beforeAll(async () => {
  trust = await import('../server/utils/runSubjectTrust')
})

afterEach(() => {
  trust.__resetRunSubjectTrustResolvers()
  vi.restoreAllMocks()
})

const event = {} as H3Event

describe('resolveRunSubjectTrust', () => {
  it('ohne Resolver für den Typ ⇒ gefunden, aber UNGEPRÜFT', async () => {
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: true, trusted: false })
  })

  it('ein Resolver für einen ANDEREN Typ hilft nicht', async () => {
    trust.registerRunSubjectTrustResolver('roadmap', async () => ({ trusted: true }))
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: true, trusted: false })
  })

  it('Resolver sagt geprüft ⇒ geprüft (die Gegenprobe zu allem anderen)', async () => {
    trust.registerRunSubjectTrustResolver('ticket', async () => ({ trusted: true }))
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: true, trusted: true })
  })

  it('Resolver sagt ungeprüft ⇒ ungeprüft', async () => {
    trust.registerRunSubjectTrustResolver('ticket', async () => ({ trusted: false }))
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: true, trusted: false })
  })

  it('null ⇒ nicht gefunden', async () => {
    trust.registerRunSubjectTrustResolver('ticket', async () => null)
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: false, trusted: false })
  })

  it.each([['true'], [1], [{}], [undefined]])('nur ein boolesches true zählt (%j ⇒ ungeprüft)', async (value) => {
    trust.registerRunSubjectTrustResolver('ticket', async () => ({ trusted: value as unknown as boolean }))
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).resolves.toEqual({ found: true, trusted: false })
  })

  it('Resolver wirft ⇒ 503 subject_trust_unavailable, nie ein geratenes Ergebnis', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    trust.registerRunSubjectTrustResolver('ticket', async () => {
      throw new Error('appwrite down')
    })
    await expect(trust.resolveRunSubjectTrust(event, 'ticket', 't1')).rejects.toMatchObject({
      status: 503,
      data: { code: 'subject_trust_unavailable' },
    })
  })

  it('reicht Ereignis und Subjekt-Id an den Resolver durch', async () => {
    const resolver = vi.fn(async () => ({ trusted: true }))
    trust.registerRunSubjectTrustResolver('ticket', resolver)
    await trust.resolveRunSubjectTrust(event, 'ticket', 't-42')
    expect(resolver).toHaveBeenCalledWith(event, 't-42')
  })
})
