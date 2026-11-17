import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * BE-020 (3) — die Rückgabe eines Likes ist best-effort und wirft nie.
 *
 * Sie hängt an DERSELBEN Registrierung wie das Verbrauchen
 * (`registerLikeAllowanceAuthority`): die Autorität trägt die Rückgabe als
 * `refund` mit. Ohne Autorität oder ohne `refund` ist sie ein No-op.
 */

const event = {} as H3Event
const logEvent = vi.fn()

beforeEach(() => {
  vi.stubGlobal('logEvent', logEvent)
  logEvent.mockClear()
})

afterEach(async () => {
  const { __resetLikeAllowanceAuthority } = await import('../server/utils/likeAllowance')
  __resetLikeAllowanceAuthority()
  vi.unstubAllGlobals()
})

describe('refundLikeAllowance', () => {
  it('ohne Autorität: nichts passiert', async () => {
    const { refundLikeAllowance } = await import('../server/utils/likeAllowance')
    await expect(refundLikeAllowance(event, 'u-1')).resolves.toBeUndefined()
  })

  it('ruft die Rückgabe der registrierten Autorität mit dem Konto', async () => {
    const { registerLikeAllowanceAuthority, refundLikeAllowance } = await import('../server/utils/likeAllowance')
    const refund = vi.fn(async () => {})
    registerLikeAllowanceAuthority(Object.assign(async () => ({ ok: true as const }), { refund }))
    await refundLikeAllowance(event, 'u-1')
    expect(refund).toHaveBeenCalledWith(event, 'u-1')
  })

  it('eine Autorität ohne Rückgabe: nichts passiert', async () => {
    const { registerLikeAllowanceAuthority, refundLikeAllowance } = await import('../server/utils/likeAllowance')
    registerLikeAllowanceAuthority(async () => ({ ok: true }))
    await expect(refundLikeAllowance(event, 'u-1')).resolves.toBeUndefined()
  })

  it('wirft nie — ein Fehler der Rückgabe wird nur mit Kennungen protokolliert', async () => {
    const { registerLikeAllowanceAuthority, refundLikeAllowance } = await import('../server/utils/likeAllowance')
    registerLikeAllowanceAuthority(Object.assign(async () => ({ ok: true as const }), {
      refund: async () => { throw new Error('db down') },
    }))
    await expect(refundLikeAllowance(event, 'u-1')).resolves.toBeUndefined()
    expect(logEvent).toHaveBeenCalledWith('warn', 'like_allowance.refund_failed', { userId: 'u-1' })
  })

  it('ohne Konto: nichts passiert', async () => {
    const { registerLikeAllowanceAuthority, refundLikeAllowance } = await import('../server/utils/likeAllowance')
    const refund = vi.fn(async () => {})
    registerLikeAllowanceAuthority(Object.assign(async () => ({ ok: true as const }), { refund }))
    await refundLikeAllowance(event, '')
    expect(refund).not.toHaveBeenCalled()
  })
})
