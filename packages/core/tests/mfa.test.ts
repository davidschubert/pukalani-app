import { describe, expect, it } from 'vitest'
import {
  MFA_FACTOR_RECOVERY_CODE,
  MFA_FACTOR_TOTP,
  isInvalidMfaCode,
  isMoreFactorsRequired,
  mfaFactorFor,
  mfaLoginMethod,
  normalizeMfaCode,
  secondFactorPending,
} from '../shared/mfa'
import { mfaChallengeSchema, mfaVerifySchema } from '../schemas/auth'

describe('mfaFactorFor', () => {
  it('bildet totp ab', () => {
    expect(mfaFactorFor('totp')).toBe(MFA_FACTOR_TOTP)
  })

  /**
   * DAS IST DER WICHTIGSTE TEST DER DATEI. Appwrite 1.9.6 vergleicht den
   * Challenge-Typ mit `===` gegen `Type::RECOVERY_CODE` = 'recoveryCode',
   * während jedes SDK-Enum 'recoverycode' sendet. Mit der kleingeschriebenen
   * Variante ist JEDER Wiederherstellungs-Code ungültig — und der Fehler ist
   * von einem Tippfehler des Nutzers nicht zu unterscheiden.
   */
  it('sendet recoveryCode in camelCase — nicht die SDK-Schreibweise', () => {
    expect(mfaFactorFor('recovery')).toBe('recoveryCode')
    expect(mfaFactorFor('recovery')).not.toBe('recoverycode')
    expect(MFA_FACTOR_RECOVERY_CODE).toBe('recoveryCode')
  })
})

describe('Appwrite-Fehler erkennen', () => {
  it('erkennt die halbe Session', () => {
    expect(isMoreFactorsRequired({ type: 'user_more_factors_required' })).toBe(true)
    expect(isMoreFactorsRequired({ type: 'user_invalid_token' })).toBe(false)
    expect(isMoreFactorsRequired(null)).toBe(false)
    expect(isMoreFactorsRequired(new Error('kaputt'))).toBe(false)
  })

  it('erkennt einen falschen Code', () => {
    expect(isInvalidMfaCode({ type: 'user_invalid_token' })).toBe(true)
    expect(isInvalidMfaCode({ type: 'user_invalid_credentials' })).toBe(true)
    expect(isInvalidMfaCode({ type: 'user_more_factors_required' })).toBe(false)
    expect(isInvalidMfaCode(undefined)).toBe(false)
  })
})

/**
 * Die EINE Weiche hinter login.post.ts UND otp/verify.post.ts. Der Code-Weg
 * hatte sie bis zum 2026-10-24 nicht: nach dem richtigen E-Mail-Code entstand
 * eine Session mit `factors: ['email']`, und der Nutzer stand wortlos wieder
 * vor dem Login. Hier steht fest, was die Weiche aus jeder Antwort der Probe
 * macht — damit kein Aufrufer sie je wieder selbst nachbaut.
 */
describe('secondFactorPending (die Weiche hinter Passwort- UND Code-Login)', () => {
  it('meldet den fehlenden zweiten Faktor, wenn Appwrite ihn verlangt', async () => {
    const probe = async () => { throw { type: 'user_more_factors_required', code: 401 } }
    await expect(secondFactorPending(probe)).resolves.toBe(true)
  })

  it('lässt durch, wenn der Konto-Aufruf gelingt', async () => {
    await expect(secondFactorPending(async () => ({ $id: 'u1' }))).resolves.toBe(false)
  })

  it('hält jeden ANDEREN Fehler nicht für einen fehlenden Faktor', async () => {
    // Netz, Appwrite, 500 — kein Fehler der Anmeldung: die Session steht,
    // der Aufrufer macht normal weiter statt eine Challenge zu verlangen.
    await expect(secondFactorPending(async () => { throw new Error('ECONNRESET') })).resolves.toBe(false)
    await expect(secondFactorPending(async () => { throw { type: 'general_unknown', code: 500 } })).resolves.toBe(false)
    await expect(secondFactorPending(async () => { throw null })).resolves.toBe(false)
  })

  it('ruft die Probe genau einmal', async () => {
    let calls = 0
    await secondFactorPending(async () => { calls++ })
    expect(calls).toBe(1)
  })
})

describe('mfaLoginMethod (Protokoll-Name nach dem zweiten Faktor)', () => {
  it('nennt den Code-Weg otp, wie otp/verify es ohne Zweitfaktor tut', () => {
    expect(mfaLoginMethod(['email', 'totp'], 'totp')).toBe('otp+totp')
    expect(mfaLoginMethod(['email', 'recoveryCode'], 'recovery')).toBe('otp+recovery')
  })

  it('lässt den Passwort-Weg wie bisher', () => {
    expect(mfaLoginMethod(['password', 'totp'], 'totp')).toBe('password+totp')
  })

  it('behauptet ohne Faktoren nichts', () => {
    expect(mfaLoginMethod([], 'totp')).toBe('unknown+totp')
  })
})

describe('normalizeMfaCode', () => {
  it('putzt Leerzeichen und Bindestriche', () => {
    expect(normalizeMfaCode('123 456')).toBe('123456')
    expect(normalizeMfaCode('4f3a-9c2b-10')).toBe('4f3a9c2b10')
    expect(normalizeMfaCode('  123456  ')).toBe('123456')
  })
})

describe('mfaChallengeSchema', () => {
  it('nimmt einen sechsstelligen TOTP-Code, auch mit Leerzeichen', () => {
    expect(mfaChallengeSchema.parse({ mode: 'totp', code: '123 456' }).code).toBe('123456')
  })

  it('lehnt einen zu kurzen TOTP-Code ab', () => {
    expect(() => mfaChallengeSchema.parse({ mode: 'totp', code: '12345' })).toThrow()
  })

  it('lehnt einen Wiederherstellungs-Code im TOTP-Modus ab', () => {
    expect(() => mfaChallengeSchema.parse({ mode: 'totp', code: '4f3a9c2b10' })).toThrow()
  })

  it('nimmt einen zehnstelligen Wiederherstellungs-Code', () => {
    expect(mfaChallengeSchema.parse({ mode: 'recovery', code: '4f3a-9c2b-10' }).code).toBe('4f3a9c2b10')
  })

  it('lehnt einen unbekannten Modus ab', () => {
    expect(() => mfaChallengeSchema.parse({ mode: 'sms', code: '123456' })).toThrow()
  })
})

describe('mfaVerifySchema', () => {
  it('nimmt nur sechsstellige Ziffern', () => {
    expect(mfaVerifySchema.parse({ code: '000123' }).code).toBe('000123')
    expect(() => mfaVerifySchema.parse({ code: '4f3a9c2b10' })).toThrow()
  })
})
