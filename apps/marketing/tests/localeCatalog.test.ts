/**
 * Wächter für die Stellen, an denen eine ZAHL in `shared/marketing.ts` und ein
 * EINTRAG in den Locale-Dateien zueinander passen müssen. Beide Fehler, die
 * hier gefangen werden, sind still — nichts geht kaputt, es fehlt nur etwas:
 *
 * 1. `FAQ_COUNT` gegen die tatsächliche Zahl der Fragen. Die Konstante steuert
 *    die sichtbare Liste UND das FAQPage-JSON-LD auf /faq. Steht sie zu
 *    niedrig, fehlt die letzte Frage überall; steht sie zu hoch, rendert
 *    vue-i18n den ROHEN SCHLÜSSEL als Frage — und der stünde dann als
 *    strukturierte Daten bei Google. Bis U17 war diese Kopplung ungeprüft.
 *
 * 2. Der Branding-Block je Vergleichsseite. Er darf ein leeres Zitat ODER eine
 *    leere Tatsachen-Zeile haben (nicht für jeden Anbieter gibt der Benchmark
 *    beides her), aber niemals beides leer — dann stünde auf der Seite eine
 *    Überschrift über nichts.
 *
 * Der `check:i18n-keys`-Wächter des Monorepos deckt das NICHT ab: er prüft
 * Schlüssel, die in einer `app.config` deklariert sind, und diese hier stehen
 * im Markup.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FAQ_COUNT, VS_SLUGS } from '../shared/marketing'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Bundle {
  marketing: {
    faq: { items: { q: string, a: string }[] }
    vs: { items: Record<string, { branding?: { quote: string, source: string, line: string } }> }
  }
}

const LOCALES = ['de', 'en'] as const
const bundles = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    JSON.parse(readFileSync(join(root, 'i18n/locales', `${locale}.json`), 'utf8')) as Bundle,
  ]),
) as Record<(typeof LOCALES)[number], Bundle>

describe('Locale-Kataloge', () => {
  it.each(LOCALES)('FAQ_COUNT deckt sich mit den Fragen in %s', (locale) => {
    expect(bundles[locale].marketing.faq.items).toHaveLength(FAQ_COUNT)
  })

  it.each(LOCALES)('keine Frage oder Antwort ist leer (%s)', (locale) => {
    for (const [index, item] of bundles[locale].marketing.faq.items.entries()) {
      expect(item.q.trim(), `faq.items.${index}.q`).not.toBe('')
      expect(item.a.trim(), `faq.items.${index}.a`).not.toBe('')
    }
  })

  it.each(LOCALES)('jede /vs/-Seite hat einen belegten Branding-Block (%s)', (locale) => {
    for (const slug of VS_SLUGS) {
      const branding = bundles[locale].marketing.vs.items[slug]?.branding
      expect(branding, slug).toBeDefined()
      // Eine Quelle ist IMMER Pflicht — ein Zitat oder eine Zahl ohne Herkunft
      // ist genau das, was diese Seiten dem Wettbewerb vorwerfen.
      expect(branding!.source.trim(), `${slug}.source`).not.toBe('')
      expect(
        `${branding!.quote}${branding!.line}`.trim(),
        `${slug}: Zitat und Tatsachen-Zeile sind beide leer`,
      ).not.toBe('')
    }
  })
})
