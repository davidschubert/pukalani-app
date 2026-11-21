/**
 * llms.txt von branding.supply (Q11, GEO-003): nur Sätze der Site, der Betrag
 * aus der einen Quelle (hier AUSGESCHRIEBEN erwartet), jede Produktseite.
 */
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import { brandingLlmsTxt, PRODUCT_PAGE_PATHS, type BrandingLlmsMessages } from '../server/utils/brandingLlms'
import { BRANDING_ROUTES } from '../server/utils/brandingSitemap'

const messages = en as unknown as BrandingLlmsMessages
const body = brandingLlmsTxt('https://branding.supply', messages)

function allMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value.replace(/\{'([^']*)'\}/g, '$1').replace('{price}', '€149')]
  if (value && typeof value === 'object') return Object.values(value).flatMap(allMessages)
  return []
}

function prose(text: string): string[] {
  return text.split('\n')
    .map(line => line.replace(/^#+ |^> /, '').replace(/^- \[[^\]]*\]\([^)]*\): /, ''))
    .flatMap(line => line.split(/(?<=[.!?—])\s+/))
    .map(part => part.replace(/^Price: /, '').replace(/(Overview: )?https:\/\/\S+/g, '').replace(/\(Deutsch \)|Deutsch\s*$/g, '').trim())
    .filter(part => part.length > 12 && !/^(Products|Pages)$/.test(part))
}

describe('branding.supply: llms.txt', () => {
  it('der Betrag der Ableitung und „kostenlos" wie auf den Seiten', () => {
    expect(body).toContain('Price: €149 net per branding, one-off.')
    expect(body).toContain('Price: Free, no account.')
  })

  it('jede Produktseite mit beiden Adressen, aus der Liste der Sitemap', () => {
    for (const path of Object.values(PRODUCT_PAGE_PATHS)) {
      const route = BRANDING_ROUTES.find(entry => entry.path === path)
      expect(route, path).toBeDefined()
      expect(body).toContain(`(https://branding.supply${path})`)
      expect(body).toContain(`Deutsch https://branding.supply${route!.dePath}`)
    }
  })

  it('kein Anbieter und keine Anschrift', () => {
    expect(body).not.toMatch(/address|GmbH|LLC|Inc\./i)
  })

  it('jeder Satz steht so in der Sprachdatei — GEGENPROBE: ein neuer Satz fällt auf', () => {
    const source = allMessages(messages).join('\n')
    for (const sentence of prose(body)) expect(source, sentence).toContain(sentence)
    expect(prose(`${body}\nThe number one branding tool worldwide.\n`).some(sentence => !source.includes(sentence))).toBe(true)
  })
})
