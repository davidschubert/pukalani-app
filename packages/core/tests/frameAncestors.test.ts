import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  registerEmbeddableRoute,
  registerFrameDeniedRoute,
  resolveFrameAncestors,
} from '../server/utils/frameAncestors'

/**
 * WER DARF DIESE SEITE EINBETTEN? (Embed-Vorarbeit E0, Verbots-Richtung seit
 * Brand-Foundation G3.)
 *
 * Der Wert entsteht an EINER Stelle, weil `security-headers.ts` ihn im
 * `render:response`-Hook setzt und dabei alles überschreibt, was eine Route
 * vorher gesetzt hat. Eine Seite, die sich selbst enger stellen wollte,
 * verlöre also gegen den Default — genau das prüft die letzte Zusage hier
 * negativ: `'self'` darf für einen verbotenen Pfad nicht mehr herauskommen.
 */

const event = {} as unknown as H3Event

describe('resolveFrameAncestors', () => {
  it('Default ist `self` — Login und Dashboard sind nicht framebar', async () => {
    expect(await resolveFrameAncestors(event, '/dashboard')).toBe(`'self'`)
  })

  it('eine registrierte Embed-Route bekommt ihre Allowlist, auch mit Locale-Präfix', async () => {
    registerEmbeddableRoute({ prefix: '/embed', origins: () => ['https://kunde.example'] })
    expect(await resolveFrameAncestors(event, '/embed')).toBe(`'self' https://kunde.example`)
    expect(await resolveFrameAncestors(event, '/de/embed/xyz')).toBe(`'self' https://kunde.example`)
  })

  it('ein verbotener Pfad antwortet `none` — Unterpfad und Locale-Präfix eingeschlossen', async () => {
    registerFrameDeniedRoute('/brand/share')
    expect(await resolveFrameAncestors(event, '/brand/share/abc123')).toBe(`'none'`)
    expect(await resolveFrameAncestors(event, '/de/brand/share/abc123')).toBe(`'none'`)
  })

  it('GEGENPROBE: der Nachbarpfad bleibt beim Default', async () => {
    // Ohne diese Zeile bestünde die Zusage oben auch für eine Regel, die
    // ALLES verbietet — und die fiele erst im Dashboard auf.
    expect(await resolveFrameAncestors(event, '/brand/p1/foundation')).toBe(`'self'`)
    expect(await resolveFrameAncestors(event, '/brand/shares-uebersicht')).toBe(`'self'`)
  })

  it('VERBOT SCHLÄGT ERLAUBNIS: derselbe Pfad in beiden Registern bleibt zu', async () => {
    registerEmbeddableRoute({ prefix: '/brand/share', origins: () => ['*'] })
    expect(await resolveFrameAncestors(event, '/brand/share/abc123')).toBe(`'none'`)
  })
})
