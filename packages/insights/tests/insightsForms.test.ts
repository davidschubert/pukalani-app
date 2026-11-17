import { describe, expect, it } from 'vitest'
import { createInsightsBrandSchema, insightsLinkRejected } from '../app/utils/insightsForms'
import { insightsSourceSchema } from '../shared/insightsPost'

/**
 * HINWEIS AM FELD BEI EINEM ABGELEHNTEN LINK (SR1 d): die Formulare der
 * Redaktion sollen dasselbe ablehnen wie der Server — am Feld, nicht erst in
 * der Antwort.
 */

const t = (key: string) => key

describe('createInsightsBrandSchema — Homepage', () => {
  const schema = createInsightsBrandSchema(t)
  const parse = (homepage: string) => schema.safeParse({ name: 'Marke', homepage, industry: '' })

  it('nimmt http(s) und das leere Feld', () => {
    expect(parse('https://example.com').success).toBe(true)
    expect(parse('http://example.com/pfad').success).toBe(true)
    expect(parse('').success).toBe(true)
  })

  it.each(['javascript:alert(1)', 'ftp://example.com', 'mailto:person@example.com', 'example.com'])(
    'lehnt %s am Feld ab, mit dem übersetzten Hinweis',
    (value) => {
      const result = parse(value)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['homepage'])
        expect(result.error.issues.map(issue => issue.message)).toContain('insights.editor.brandHomepageInvalid')
      }
    },
  )
})

describe('insightsLinkRejected — Quellen-Felder ohne UForm', () => {
  it('leer ist kein Fehler', () => {
    expect(insightsLinkRejected('')).toBe(false)
    expect(insightsLinkRejected(undefined)).toBe(false)
    expect(insightsLinkRejected(null)).toBe(false)
  })

  it('http(s) ist kein Fehler, alles andere schon', () => {
    expect(insightsLinkRejected('https://example.com/a?b=1')).toBe(false)
    for (const value of ['javascript:alert(1)', 'ftp://example.com', 'example.com', 'https://example.com/mit leerzeichen']) {
      expect(insightsLinkRejected(value), value).toBe(true)
    }
  })

  // Der Hinweis darf nie strenger oder lockerer sein als der Vertrag des Servers.
  it.each(['https://example.com', 'http://example.com/x', 'javascript:alert(1)', 'ftp://example.com', 'example.com'])(
    'stimmt für %s mit dem Vertrag der Quelle überein',
    (url) => {
      const server = insightsSourceSchema.safeParse({ url, publisher: 'Haus', date: '', kind: 'press', quote: '', license: '' })
      const urlRejectedByServer = !server.success && server.error.issues.some(issue => issue.path[0] === 'url')
      expect(insightsLinkRejected(url)).toBe(urlRejectedByServer)
    },
  )
})
