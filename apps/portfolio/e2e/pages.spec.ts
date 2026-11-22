import { expect, test, type Page } from '@playwright/test'

/**
 * Die Unterseiten dieser Site — jede in beiden Sprachfassungen erreichbar, mit
 * genau EINEM Kopf.
 *
 * Was hier zugesagt wird, ist bewusst STRUKTUR und nicht Text: die Inhalte
 * kommen aus `app/data/*.ts` und dürfen sich jederzeit ändern (dafür gibt es
 * den Paritäts-Unit-Test). Was sich NICHT ändern darf, ist die Anzahl der
 * Absender im `<head>`:
 *
 *  - GENAU EIN `application/ld+json`. Der Graph jeder Seite entsteht an EINER
 *    Stelle (`usePortfolioSeo`). Zwei Blöcke sind für Google kein doppelter
 *    Fehler, sondern zwei konkurrierende Aussagen über dieselbe Seite — und
 *    genau so sähe es aus, wenn eine Seite den Kopf zusätzlich selbst setzte.
 *  - GENAU EINE `robots`-Meta. Sie steht einmal in der app.vue (Begründung
 *    dort). Eine zweite Angabe desselben Namens ist ein zweiter Absender, und
 *    welche ein Crawler nimmt, wäre nicht mehr unsere Entscheidung.
 *
 * Und das JSON-LD muss `JSON.parse` ÜBERSTEHEN: `jsonLdScript()` escapet `<`
 * zu `<`, damit ein Datenwert den Script-Block nicht vorzeitig schließen
 * kann. Ein kaputtes Escaping fällt im Browser nicht auf — die Seite rendert
 * normal weiter, nur die Structured Data sind still verloren.
 */

interface PageCase {
  path: string
  /** Sprachfassung — nur für die Testbeschriftung. */
  lang: 'de' | 'en'
}

const PAGES: PageCase[] = [
  { path: '/ux-audit', lang: 'en' },
  { path: '/de/ux-audit', lang: 'de' },
  { path: '/nuxt-entwickler-freelancer', lang: 'en' },
  { path: '/de/wissen/was-kostet-ux-design', lang: 'de' },
  { path: '/wissen/freelancer-oder-agentur', lang: 'en' },
]

/**
 * Der Inhalt eines `<script type="application/ld+json">` — über das DOM statt
 * über den Roh-HTTP-Text, weil unhead die Blöcke im Kopf einhängt und ein
 * Muster auf dem HTML bei wechselnder Attributreihenfolge daneben liegt.
 */
async function jsonLdBlocks(page: Page): Promise<string[]> {
  return page.locator('script[type="application/ld+json"]').allTextContents()
}

for (const entry of PAGES) {
  test.describe(`Unterseite ${entry.path}`, () => {
    test(`antwortet 200 mit sichtbarer h1 (${entry.lang})`, async ({ page }) => {
      const response = await page.goto(entry.path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('h1')).toBeVisible()
      // Genau EINE h1 — die Seite ist ein Dokument, keine Sammlung.
      await expect(page.locator('h1')).toHaveCount(1)
    })

    test('hat genau EIN gültiges JSON-LD und EINE robots-Meta', async ({ page }) => {
      await page.goto(entry.path)

      const blocks = await jsonLdBlocks(page)
      expect(blocks, 'genau ein application/ld+json erwartet').toHaveLength(1)
      // Wirft bei kaputtem Escaping — das ist die eigentliche Zusage.
      const graph = JSON.parse(blocks[0]!) as { '@context'?: string, '@graph'?: unknown[] }
      expect(graph['@context']).toBe('https://schema.org')
      expect(Array.isArray(graph['@graph'])).toBe(true)
      expect(graph['@graph']!.length).toBeGreaterThan(0)

      await expect(page.locator('meta[name="robots"]')).toHaveCount(1)
    })
  })
}

test.describe('Fußzeile', () => {
  test('verweist nicht mehr auf eine Impressums-PDF', async ({ page }) => {
    await page.goto('/')
    // Die alte Site hatte das Impressum als statische `imprint.pdf` im
    // `public/`-Ordner; heute kommt es als CMS-Seite aus dem pages-Layer.
    // Eine liegengebliebene PDF-Verlinkung wäre ein toter Pflicht-Link — und
    // ein totes Impressum ist in Deutschland kein Schönheitsfehler.
    await expect(page.locator('footer a[href*="imprint.pdf"]')).toHaveCount(0)
    await expect(page.locator('footer a[href$=".pdf"]')).toHaveCount(0)

    // BEWUSST NICHT GEPRÜFT: ob dort ein Impressums-LINK steht. Die Fußzeile
    // zeigt die veröffentlichten Rechtsseiten aus dem pages-CMS (mit festem
    // Rückfall nur, wenn die Abfrage AUSFÄLLT — `error` ≠ `[]`, siehe
    // SiteFooter.vue). Auf einer Instanz, auf der noch nichts veröffentlicht
    // ist, steht dort korrekterweise nichts; ein Test darauf wäre nicht die
    // Zusage der App, sondern der Datenstand der Maschine, auf der er läuft.
    await expect(page.locator('footer')).toBeVisible()
  })
})
