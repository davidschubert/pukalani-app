import { describe, expect, it } from 'vitest'
import { resolveTermsAcceptance } from '../shared/termsAcceptance'

/**
 * Die AGB-Zustimmung am Konto (BS1 R1) — die pure Hälfte.
 *
 * Die GEGENPROBE ist der wichtigste Fall dieser Datei: ohne `termsUrl` darf
 * nichts geschrieben werden. Genau das ist der Beweis-Schritt, mit dem sich
 * zeigen lässt, dass die Prefs an der Konfiguration hängen und nicht daran,
 * dass eine Route zufällig läuft.
 */
const NOW = new Date('2026-09-07T10:00:00.000Z')

describe('resolveTermsAcceptance', () => {
  it('schreibt nichts ohne termsUrl (Gegenprobe)', () => {
    expect(resolveTermsAcceptance({ termsVersion: '2026-09-draft-1' }, {}, NOW)).toBeNull()
    expect(resolveTermsAcceptance({ termsUrl: '', termsVersion: 'x' }, {}, NOW)).toBeNull()
    expect(resolveTermsAcceptance({ termsUrl: '   ' }, {}, NOW)).toBeNull()
    expect(resolveTermsAcceptance(undefined, {}, NOW)).toBeNull()
  })

  it('hält Zeitpunkt und Fassung fest', () => {
    expect(resolveTermsAcceptance({ termsUrl: '/terms', termsVersion: '2026-09-draft-1' }, {}, NOW)).toEqual({
      termsAcceptedAt: '2026-09-07T10:00:00.000Z',
      termsVersion: '2026-09-draft-1',
    })
  })

  it('erlaubt eine App ohne benannte Fassung — Zeitpunkt zählt trotzdem', () => {
    expect(resolveTermsAcceptance({ termsUrl: '/terms' }, undefined, NOW)).toEqual({
      termsAcceptedAt: '2026-09-07T10:00:00.000Z',
      termsVersion: '',
    })
  })

  it('überschreibt eine bestehende Zustimmung derselben Fassung nicht', () => {
    const prefs = { termsAcceptedAt: '2026-09-01T08:00:00.000Z', termsVersion: '2026-09-draft-1' }
    expect(resolveTermsAcceptance({ termsUrl: '/terms', termsVersion: '2026-09-draft-1' }, prefs, NOW)).toBeNull()
  })

  it('vermerkt eine NEUE Fassung erneut (Grundlage der Nachfrage in R3)', () => {
    const prefs = { termsAcceptedAt: '2026-09-01T08:00:00.000Z', termsVersion: '2026-09-draft-1' }
    expect(resolveTermsAcceptance({ termsUrl: '/terms', termsVersion: '2026-11-final' }, prefs, NOW)).toEqual({
      termsAcceptedAt: '2026-09-07T10:00:00.000Z',
      termsVersion: '2026-11-final',
    })
  })

  it('behandelt ein Konto mit Fassung, aber ohne Zeitpunkt als offen', () => {
    expect(resolveTermsAcceptance({ termsUrl: '/terms', termsVersion: 'v1' }, { termsVersion: 'v1' }, NOW)).toEqual({
      termsAcceptedAt: '2026-09-07T10:00:00.000Z',
      termsVersion: 'v1',
    })
  })

  it('lässt fremde Prefs-Felder unangetastet (der Aufrufer merged)', () => {
    const prefs = { bio: 'hallo', timezone: 'Europe/Berlin' }
    const next = resolveTermsAcceptance({ termsUrl: '/terms', termsVersion: 'v1' }, prefs, NOW)
    expect(Object.keys(next ?? {})).toEqual(['termsAcceptedAt', 'termsVersion'])
    expect(prefs).toEqual({ bio: 'hallo', timezone: 'Europe/Berlin' })
  })
})
