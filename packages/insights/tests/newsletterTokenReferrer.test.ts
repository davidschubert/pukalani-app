import { describe, expect, it, vi } from 'vitest'

/**
 * SEC-006: die zwei Seiten mit Token in der Adresse senden `no-referrer`.
 * Die Gegenprobe ist Pflicht — eine Regel, die JEDE Seite trifft, bestünde
 * die Zusage auch und nähme dem Rest der Seite den Referrer.
 */

interface FakeEvent { path: string, headers: Record<string, string> }

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string) => {
  event.headers[name] = value
})

const mod = await import('../server/middleware/10.newsletter-token-referrer')
const middleware = mod.default as unknown as (event: FakeEvent) => void

function run(path: string): Record<string, string> {
  const event: FakeEvent = { path, headers: {} }
  middleware(event)
  return event.headers
}

describe('10.newsletter-token-referrer', () => {
  it('Bestätigen und Abmelden — mit Token, Locale-Präfix und Schluss-Slash', () => {
    for (const path of [
      '/newsletter/confirm?token=abc',
      '/newsletter/unsubscribe?token=abc',
      '/de/newsletter/confirm?token=abc',
      '/en-US/newsletter/unsubscribe',
      '/newsletter/confirm/',
    ]) {
      expect(run(path), path).toEqual({ 'referrer-policy': 'no-referrer' })
    }
  })

  it('GEGENPROBE: Nachbarseiten und die API bleiben beim Core-Wert', () => {
    for (const path of [
      '/newsletter',
      '/newsletter/confirmed',
      '/insights/newsletter/confirm',
      '/api/insights/public/newsletter/confirm',
      '/',
    ]) {
      expect(run(path), path).toEqual({})
    }
  })

  it('die pure Regel kennt nur den Pfad', () => {
    expect(mod.isNewsletterTokenPage('/newsletter/unsubscribe?token=x')).toBe(true)
    expect(mod.isNewsletterTokenPage('/newsletter/unsubscribe-all')).toBe(false)
  })
})
