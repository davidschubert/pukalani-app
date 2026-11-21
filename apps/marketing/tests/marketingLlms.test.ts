/**
 * llms.txt von pukalani.app (Q11, GEO-003): nur Sätze der Site, Preise aus der
 * einen Quelle (hier AUSGESCHRIEBEN erwartet), jede Seite der Sitemap.
 */
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import { marketingLlmsTxt, plainMessage, type MarketingLlmsMessages } from '../server/utils/marketingLlms'
import { MARKETING_ROUTES } from '../server/utils/marketingRoutes'

const messages = en as MarketingLlmsMessages
const body = marketingLlmsTxt('https://pukalani.app/', messages)

/** Alle Texte der Sprachdatei, flach — die Menge, aus der die Datei schöpfen darf. */
function allMessages(value: unknown): string[] {
  if (typeof value === 'string') return [plainMessage(value)]
  if (value && typeof value === 'object') return Object.values(value).flatMap(allMessages)
  return []
}

/** Die Sätze der Datei ohne Überschriften, Adressen und Preis-Angaben. */
function prose(text: string): string[] {
  return text.split('\n')
    .map(line => line.replace(/^#+ |^> /, '').replace(/^- \[[^\]]*\]\([^)]*\): /, '').replace(/^- [^:]+\): [^.]+\. /, ''))
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(part => part.replace(/€[\d.,]+ per month(, billed yearly)?(, or)?/g, '').replace(/Deutsch https:\/\/\S+/g, '').trim())
    .filter(part => part.length > 12 && !/^(Pricing|Pages)$/.test(part))
}

describe('pukalani.app: llms.txt', () => {
  it('Preise wie auf der Preisseite', () => {
    expect(body).toContain('€29.00 per month, or €21.75 per month, billed yearly.')
    expect(body).toContain('€149.00 per month, or €111.75 per month, billed yearly.')
    expect(body).not.toMatch(/basic/i)
  })

  it('kein Anbieter, keine Anschrift, keine Steuer-Angabe', () => {
    expect(body).not.toMatch(/\bVAT\b|\bUSt\b|\btax|address|GmbH|LLC|\bInc\./i)
  })

  it('jede Seite der Sitemap mit beiden Adressen', () => {
    for (const route of MARKETING_ROUTES) {
      expect(body).toContain(`(https://pukalani.app${route.en})`)
      expect(body).toContain(`Deutsch https://pukalani.app${route.de}`)
    }
  })

  it('jeder Satz steht so in der Sprachdatei — keine neuen Werbesätze', () => {
    const source = allMessages(messages).join('\n')
    for (const sentence of prose(body)) expect(source, sentence).toContain(sentence)
  })

  it('GEGENPROBE: ein von Hand ergänzter Satz fällt auf', () => {
    const source = allMessages(messages).join('\n')
    const extra = prose(`${body}\nThe best community platform in the world, trusted by millions.\n`)
    expect(extra.some(sentence => !source.includes(sentence))).toBe(true)
  })
})
