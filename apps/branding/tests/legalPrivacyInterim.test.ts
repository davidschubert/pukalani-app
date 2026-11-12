import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../../packages/core/shared/markdown'
import { MAX_PAGE_BODY } from '../../../packages/pages/schemas/page'
import {
  PRIVACY_INTERIM_BODY,
  PRIVACY_INTERIM_DATE,
  PRIVACY_INTERIM_MARKER,
} from '../scripts/legalPrivacyInterim'

/**
 * DIE VORLÄUFIGE DATENSCHUTZERKLÄRUNG — Eigenschaften, nicht Wortlaut.
 *
 * Der Text darf jederzeit besser werden. Was er nie verlieren darf:
 *  1. Er sagt im ERSTEN Block, dass er vorläufig ist, und nennt sein Datum.
 *  2. Er trägt keine offene Stelle — kein Gerüst-Marker, kein Platzhalter.
 *  3. Er geht durch den Markdown-Parser, der die Seite wirklich rendert, und
 *     benutzt nur, was dieser kennt (keine Tabelle, kein rohes HTML).
 *  4. Beide Sprachen haben dieselbe Gliederung — ein Abschnitt, der nur in
 *     einer Sprache steht, ist eine Auskunft, die die andere nicht bekommt.
 *  5. Jeder Empfänger steht in beiden Sprachen.
 */

const LOCALES = ['de', 'en'] as const

function headings(body: string): number {
  return parseMarkdown(body).filter(block => block.type === 'heading').length
}

function links(body: string): string[] {
  return [...body.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]!)
}

describe('branding: vorläufige Datenschutzerklärung', () => {
  it('beginnt mit dem Vorläufig-Hinweis und nennt das Datum', () => {
    for (const locale of LOCALES) {
      expect(PRIVACY_INTERIM_BODY[locale].startsWith(PRIVACY_INTERIM_MARKER[locale])).toBe(true)
      expect(parseMarkdown(PRIVACY_INTERIM_BODY[locale])[0]?.type).toBe('quote')
    }
    const [year, month, day] = PRIVACY_INTERIM_DATE.split('-').map(Number)
    const date = new Date(Date.UTC(year!, month! - 1, day!))
    const de = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    const en = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    // Zweimal: im Hinweis oben und im Abschnitt „Änderungen" unten.
    expect(PRIVACY_INTERIM_BODY.de.split(de).length - 1).toBe(2)
    expect(PRIVACY_INTERIM_BODY.en.split(en).length - 1).toBe(2)
  })

  it('trägt keine offene Stelle', () => {
    for (const locale of LOCALES) {
      const body = PRIVACY_INTERIM_BODY[locale]
      expect(body).not.toMatch(/\[AUSFÜLLEN|\[FILL IN|TODO|TBD|XXX|\.\.\.|…/)
      // Eine eckige Klammer gibt es nur als Link `[Text](Ziel)`.
      expect(body.replace(/\[[^\]]+\]\([^)]+\)/g, '')).not.toMatch(/[[\]]/)
    }
  })

  it('bleibt im Umfang des Parsers und unter der Längengrenze der Seite', () => {
    for (const locale of LOCALES) {
      const body = PRIVACY_INTERIM_BODY[locale]
      expect(body.length).toBeLessThan(MAX_PAGE_BODY)
      // Das eine `>` am Anfang ist das Zitat des Hinweises; sonst keine spitze Klammer.
      expect(body.replace(/^> /, '')).not.toMatch(/[<>]/)
      expect(body).not.toMatch(/^\|/m)
      expect(body).not.toContain('mailto:')
      for (const target of links(body)) expect(target).toMatch(/^(https:\/\/|\/)/)
    }
  })

  it('hat in beiden Sprachen dieselbe Gliederung', () => {
    expect(headings(PRIVACY_INTERIM_BODY.de)).toBe(headings(PRIVACY_INTERIM_BODY.en))
    expect(headings(PRIVACY_INTERIM_BODY.de)).toBeGreaterThanOrEqual(10)
    const bullets = (body: string) => body.split('\n').filter(line => line.startsWith('- ')).length
    expect(bullets(PRIVACY_INTERIM_BODY.de)).toBe(bullets(PRIVACY_INTERIM_BODY.en))
    // Interne Ziele sind sprachneutral (der Renderer lokalisiert sie) und
    // müssen deshalb in beiden Fassungen dieselben sein.
    const internal = (body: string) => links(body).filter(target => target.startsWith('/')).sort()
    expect(internal(PRIVACY_INTERIM_BODY.de)).toEqual(internal(PRIVACY_INTERIM_BODY.en))
  })

  it('nennt jeden Empfänger in beiden Sprachen', () => {
    const recipients = ['Hetzner', 'Ploi', 'OpenRouter', 'Amazon', 'Google Cloud', 'Resend', 'Cloudflare', 'hello@branding.supply']
    for (const locale of LOCALES) {
      for (const name of recipients) expect(PRIVACY_INTERIM_BODY[locale]).toContain(name)
    }
  })
})
