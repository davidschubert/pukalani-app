import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: '' }))

const { DECOY_WINDOW_END_S, DECOY_WINDOW_START_S, deriveOtpDecoyKey, otpDecoyUserIdFor } = await import('../server/utils/otpDecoyUserId')

/** V1: die Ersatz-Kennung der Code-Anmeldung — fest je Adresse, geformt wie Appwrites `ID.unique()`. */
describe('otpDecoyUserIdFor', () => {
  const key = deriveOtpDecoyKey('geheim')!

  it('fest je Adresse, Schreibweise egal', () => {
    expect(otpDecoyUserIdFor(key, 'a@example.com')).toBe(otpDecoyUserIdFor(key, ' A@Example.com '))
  })

  it('anderer Schlüssel ⇒ andere Kennung (nicht aus der Adresse allein ableitbar)', () => {
    expect(otpDecoyUserIdFor(key, 'a@example.com')).not.toBe(otpDecoyUserIdFor(deriveOtpDecoyKey('anders')!, 'a@example.com'))
  })

  it('Form wie ID.unique(): 8 Hex Sekunden im Fenster, 5 Hex Millisekunden unter 1000, 7 Hex', () => {
    for (const email of ['a@example.com', 'b@example.com', 'c@example.org', 'xyz@test.dev']) {
      const id = otpDecoyUserIdFor(key, email)
      expect(id).toMatch(/^[0-9a-f]{20}$/)
      const sec = Number.parseInt(id.slice(0, 8), 16)
      expect(sec).toBeGreaterThanOrEqual(DECOY_WINDOW_START_S)
      expect(sec).toBeLessThan(DECOY_WINDOW_END_S)
      expect(Number.parseInt(id.slice(8, 13), 16)).toBeLessThan(1000)
    }
  })

  it('ohne Geheimnis kein Schlüssel', () => {
    expect(deriveOtpDecoyKey('')).toBeNull()
  })
})
