import { describe, expect, it } from 'vitest'
import { createOtpRequestSchema, createRegisterFormSchema } from '../schemas/auth'
import { resolveBusinessConfirmation } from '../shared/businessConfirmation'

/**
 * Die Unternehmer-Bestätigung am Konto (BS1 R1c) — die pure Hälfte.
 *
 * Die GEGENPROBE ist auch hier der wichtigste Fall: ohne `businessOnly` darf
 * nichts geschrieben werden. Genau das ist der Beweis-Schritt, mit dem sich
 * zeigen lässt, dass die Prefs an der Konfiguration hängen und nicht daran,
 * dass eine Route zufällig läuft — und er hält jede App fest, die auch
 * Verbraucher aufnimmt (Pool-Communities, portfolio, comments).
 */
const NOW = new Date('2026-09-08T10:00:00.000Z')

describe('resolveBusinessConfirmation', () => {
  it('schreibt nichts ohne businessOnly (Gegenprobe)', () => {
    expect(resolveBusinessConfirmation({}, {}, NOW)).toBeNull()
    expect(resolveBusinessConfirmation({ businessOnly: false }, {}, NOW)).toBeNull()
    expect(resolveBusinessConfirmation(undefined, {}, NOW)).toBeNull()
  })

  it('verlangt echtes true — kein wahrheitsähnlicher Wert', () => {
    // Eine App-Config wird tief gemergt und kann alles Mögliche liefern; nur
    // ein ausdrückliches `true` schliesst Verbraucher aus.
    expect(resolveBusinessConfirmation({ businessOnly: 1 as unknown as boolean }, {}, NOW)).toBeNull()
    expect(resolveBusinessConfirmation({ businessOnly: 'true' as unknown as boolean }, {}, NOW)).toBeNull()
  })

  it('hält den Zeitpunkt fest', () => {
    expect(resolveBusinessConfirmation({ businessOnly: true }, {}, NOW)).toEqual({
      businessConfirmedAt: '2026-09-08T10:00:00.000Z',
    })
    expect(resolveBusinessConfirmation({ businessOnly: true }, undefined, NOW)).toEqual({
      businessConfirmedAt: '2026-09-08T10:00:00.000Z',
    })
  })

  it('überschreibt eine bestehende Bestätigung nicht — der erste Zeitpunkt zählt', () => {
    const prefs = { businessConfirmedAt: '2026-09-01T08:00:00.000Z' }
    expect(resolveBusinessConfirmation({ businessOnly: true }, prefs, NOW)).toBeNull()
  })

  it('behandelt einen leeren Zeitstempel als fehlend', () => {
    expect(resolveBusinessConfirmation({ businessOnly: true }, { businessConfirmedAt: '   ' }, NOW)).toEqual({
      businessConfirmedAt: '2026-09-08T10:00:00.000Z',
    })
  })

  it('kennt bewusst KEIN Fassungsfeld und lässt fremde Prefs unangetastet', () => {
    const prefs = { bio: 'hallo', termsAcceptedAt: '2026-09-07T10:00:00.000Z', termsVersion: 'v1' }
    const next = resolveBusinessConfirmation({ businessOnly: true }, prefs, NOW)
    expect(Object.keys(next ?? {})).toEqual(['businessConfirmedAt'])
    expect(prefs).toEqual({ bio: 'hallo', termsAcceptedAt: '2026-09-07T10:00:00.000Z', termsVersion: 'v1' })
  })
})

/**
 * Die FORMULAR-Hälfte: das Häkchen ist eine Zod-Pflicht und erreicht den Server
 * bewusst nie (wie `terms` seit jeher). Es gibt deshalb keine Route, die ein
 * fehlendes Häkchen mit 400 beantworten könnte — die Zusage steht hier.
 */
const VALID_REGISTER = {
  name: 'Firma Muster',
  email: 'Chef@Example.test',
  password: 'Passwort1!',
  passwordConfirm: 'Passwort1!',
  terms: true,
}

describe('Unternehmer-Häkchen im Formular-Schema', () => {
  it('lehnt die Registrierung ohne Häkchen ab, wenn die App B2B ist', () => {
    const schema = createRegisterFormSchema(undefined, { requireTerms: true, requireBusiness: true })
    const result = schema.safeParse({ ...VALID_REGISTER, business: false })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some(issue => issue.path[0] === 'business')).toBe(true)
  })

  it('lässt sie mit Häkchen durch', () => {
    const schema = createRegisterFormSchema(undefined, { requireTerms: true, requireBusiness: true })
    expect(schema.safeParse({ ...VALID_REGISTER, business: true }).success).toBe(true)
  })

  it('Gegenprobe: ohne den Schalter ist das Feld gleichgültig', () => {
    const schema = createRegisterFormSchema(undefined, { requireTerms: true })
    expect(schema.safeParse({ ...VALID_REGISTER, business: false }).success).toBe(true)
    expect(schema.safeParse(VALID_REGISTER).success).toBe(true)
  })

  it('gilt genauso im Code-Weg (OTP-Registrierung)', () => {
    const schema = createOtpRequestSchema(undefined, { requireBusiness: true, requireName: true })
    expect(schema.safeParse({ email: 'chef@example.test', name: 'Firma Muster', business: false }).success).toBe(false)
    expect(schema.safeParse({ email: 'chef@example.test', name: 'Firma Muster', business: true }).success).toBe(true)
    // Gegenprobe: der reine LOGIN per Code fragt nichts ab.
    const login = createOtpRequestSchema(undefined, {})
    expect(login.safeParse({ email: 'chef@example.test' }).success).toBe(true)
  })
})
