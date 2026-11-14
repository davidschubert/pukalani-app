import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_MARK_DRAFTS_ENDPOINT, brandImageModelLabel } from '../../../packages/brand/shared/brandMarkDrafts'
import { parseMarkdown } from '../../../packages/core/shared/markdown'
import { MAX_PAGE_BODY } from '../../../packages/pages/schemas/page'
import {
  PRIVACY_INTERIM_BODY,
  PRIVACY_INTERIM_DATE,
  PRIVACY_INTERIM_MARKER,
  PRIVACY_INTERIM_SUPERSEDED_SHA256,
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
 *  6. Das BILDMODELL der Zeichen-Entwürfe steht mit Namen und Betreiber da —
 *     und zwar das, das die App wirklich konfiguriert (BE-004). Wer das Modell
 *     wechselt, wird hier rot, bis der Text nachgezogen ist.
 *  7. Frühere Fassungen sind als Prüfsumme geführt, die aktuelle steht nicht
 *     darunter — sonst ersetzte das Einspiel-Skript sie durch sich selbst
 *     oder, schlimmer, hielte einen alten Text für den neuen.
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

  it('nennt das Bildmodell, das die App konfiguriert, mit Betreiber und offenem Ort', () => {
    // Aus der Quelle gelesen und nicht importiert: `app.config.ts` braucht
    // Nuxts `defineAppConfig`, das es in einem Unit-Test nicht gibt.
    const config = readFileSync(fileURLToPath(new URL('../app/app.config.ts', import.meta.url)), 'utf8')
    const slug = /[{\s]imageModel:\s*'([^']+)'/.exec(config)?.[1] ?? ''
    expect(slug).not.toBe('')
    const label = brandImageModelLabel(slug)
    // Ein Modell ohne Anzeigenamen erschiene im Hinweis als roher Slug — dann
    // fehlt der Eintrag in `BRAND_IMAGE_MODEL_LABELS`.
    expect(label).not.toBe(slug)
    // Der Pin ist ortlos; nur dann stimmt der Satz „keine EU-Zusage".
    expect(BRAND_MARK_DRAFTS_ENDPOINT).toBe('google-vertex/global')
    for (const locale of LOCALES) {
      const body = PRIVACY_INTERIM_BODY[locale]
      const bullet = body.split('\n').find(line => line.includes(label)) ?? ''
      expect(bullet).toContain('Google Cloud Vertex AI')
      expect(bullet).toContain('OpenRouter')
      expect(bullet).toMatch(locale === 'de' ? /nicht zusagen/ : /cannot promise/)
      expect(bullet).toMatch(locale === 'de' ? /freiwillig/ : /optional/)
    }
  })

  it('führt frühere Fassungen als Prüfsumme und die aktuelle nicht darunter', () => {
    for (const locale of LOCALES) {
      const superseded = PRIVACY_INTERIM_SUPERSEDED_SHA256[locale]
      expect(superseded.length).toBeGreaterThanOrEqual(1)
      for (const hash of superseded) expect(hash).toMatch(/^[0-9a-f]{64}$/)
      const current = createHash('sha256').update(PRIVACY_INTERIM_BODY[locale], 'utf8').digest('hex')
      expect(superseded).not.toContain(current)
    }
  })
})
