import { describe, expect, it } from 'vitest'
import { MAX_DISPLAY_NAME_LENGTH, displayNameProblem, textContainsLink } from '../shared/displayName'
import { createOtpRequestSchema, createRegisterSchema, registerSchema } from '../schemas/auth'
import { profileSchema } from '../schemas/profile'

/**
 * EIN ANZEIGENAME IST KEINE NACHRICHT (Vorfall 2026-10-27): der Name landet im
 * Kopf der Verifizierungs-Mail — mit Link darin wurde die Registrierung zum
 * Spam-Werkzeug an fremde Adressen. Beide Richtungen sind Pflicht: die
 * Spam-Zeile muss fallen, echte Namen (Titel, Initialen, Apostroph, CJK,
 * Klammerzusatz) dürfen es nicht.
 */
const SPAM = 'Etsy User! Your item has been successfully sold through our marketplace. https://a29.at/9hdF2k'

describe('displayNameProblem', () => {
  it('deckelt bei 80 Zeichen', () => {
    expect(MAX_DISPLAY_NAME_LENGTH).toBe(80)
    expect(displayNameProblem('a'.repeat(80))).toBeNull()
    expect(displayNameProblem('a'.repeat(81))).toBe('too_long')
  })

  it.each([
    [SPAM, 'too_long'],
    // Dieselbe Zeile, auf unter 80 Zeichen gekürzt — dann muss der Link sie tragen.
    ['Your item has been sold. https://a29.at/9hdF2k', 'links'],
    ['siehe www.beispiel.de', 'links'],
    ['mail@x.de', 'links'],
    ['a29.at/9hdF2k', 'links'],
    ['pukalani.app', 'links'],
    ['Gewinn auf BEISPIEL.COM', 'links'],
    ['Max (pukalani.app)', 'links'],
    ['Max\uFF20example', 'links'],
    ['Zeile\nUmbruch', 'control'],
    ['Tab\tName', 'control'],
    ['Leser\u202Eppa.inalakup', 'control'],
  ])('lehnt %j ab (%s)', (name, problem) => {
    expect(displayNameProblem(name)).toBe(problem)
  })

  it.each([
    'David Schubert',
    'Dr. Anna Müller',
    'Prof. Dr. Anna Müller',
    'Prof.Dr. Müller',
    'Dr.med. Hans Meier',
    'J. R. R. Tolkien',
    'Jean-Luc O\'Neil',
    '李雷',
    'Max (Vereinsvorstand)',
    'Sportverein Pukalani e.V.',
    'Anna 👨‍👩‍👧',
  ])('lässt %j durch', (name) => {
    expect(displayNameProblem(name)).toBeNull()
  })
})

describe('Schemas mit frei wählbarem Anzeigenamen', () => {
  const basis = { email: 'opfer@example.com', password: 'Aa1!aaaa' }

  it('registerSchema lehnt die Spam-Zeile ab (Länge) und ihre gekürzte Fassung (Link)', () => {
    expect(registerSchema.safeParse({ ...basis, name: SPAM }).success).toBe(false)
    const kurz = registerSchema.safeParse({ ...basis, name: 'Sold! https://a29.at/9hdF2k' })
    expect(kurz.success).toBe(false)
    expect(kurz.error?.issues.map(i => i.message)).toEqual(['validation.nameNoLinks'])
    expect(registerSchema.safeParse({ ...basis, name: 'David Schubert' }).success).toBe(true)
  })

  it('zeigt bei zu langem Namen genau EINE Meldung (Länge), nicht zusätzlich „keine Links"', () => {
    const result = createRegisterSchema().safeParse({ ...basis, name: SPAM })
    expect(result.error?.issues.map(i => i.message)).toEqual(['validation.nameMax'])
  })

  it('profileSchema lehnt die Spam-Zeile ab — der zweite Hebel aus dem Vorfall', () => {
    expect(profileSchema.safeParse({ name: SPAM }).success).toBe(false)
    const kurz = profileSchema.safeParse({ name: 'Sold! https://a29.at/9hdF2k' })
    expect(kurz.error?.issues.map(i => i.message)).toEqual(['validation.nameNoLinks'])
    expect(profileSchema.safeParse({ name: 'Dr. Anna Müller' }).success).toBe(true)
  })

  it('OTP-Registrierung: Pflicht-Name lehnt ab, optionaler Name erlaubt leer, aber keinen Link', () => {
    const pflicht = createOtpRequestSchema(undefined, { requireName: true })
    expect(pflicht.safeParse({ email: basis.email, name: 'Sold! https://a29.at/9hdF2k' }).success).toBe(false)
    expect(pflicht.safeParse({ email: basis.email, name: '' }).success).toBe(false)

    const optional = createOtpRequestSchema()
    expect(optional.safeParse({ email: basis.email }).success).toBe(true)
    expect(optional.safeParse({ email: basis.email, name: '' }).success).toBe(true)
    expect(optional.safeParse({ email: basis.email, name: 'A' }).error?.issues.map(i => i.message))
      .toEqual(['validation.nameMin'])
    expect(optional.safeParse({ email: basis.email, name: 'Sold! https://a29.at/9hdF2k' }).error?.issues.map(i => i.message))
      .toEqual(['validation.nameNoLinks'])
  })
})

describe('textContainsLink — der Link-Zweig allein, für zurückzitierte Anliegen', () => {
  it('findet URL, www. und Domain mit Pfad', () => {
    expect(textContainsLink('Schaut mal: https://a29.at/9hdF2k')).toBe(true)
    expect(textContainsLink('siehe www.beispiel.de')).toBe(true)
    expect(textContainsLink('unsere Seite ist beispiel.de')).toBe(true)
  })

  it('lässt ein normales Anliegen mit Adresse, Satzpunkten und Zeilenumbruch durch', () => {
    expect(textContainsLink('Wir starten neu. Schreibt mir an mail@firma — gern auch telefonisch.\nDanke!')).toBe(false)
    expect(textContainsLink('Dr. Müller fragt nach einem Termin.')).toBe(false)
  })
})
