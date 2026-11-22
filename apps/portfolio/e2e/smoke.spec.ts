import { expect, test } from '@playwright/test'

/**
 * Smoke-Tests für die Portfolio-Landing: SSR-Render, i18n, SEO-Head, 404.
 * Komplett auth-frei — die Site hat keinen öffentlichen Login-Flow.
 */

test.describe('Landing', () => {
  // Geprüft wird über die ANKER-Ids, nicht über den Überschriften-Text: die
  // Sektions-Texte kommen aus app/data/home.ts und dürfen sich ändern, die
  // Anker sind verlinkt (Navigation, Fußzeile, JSON-LD) und sind damit die
  // stabilere Zusage.
  test('rendert Hero + Referenzen + eigene Cases (englisch, Default ohne Prefix)', async ({ page }) => {
    await page.goto('/')
    // Der Titel kommt aus `HOME_META.title` (app/data/home.ts) und trägt seit
    // dem Studio-Rebrand die MARKE, nicht mehr den Personennamen.
    await expect(page).toHaveTitle(/Pukalani Studio/i)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('#referenzen-title')).toBeVisible()
    await expect(page.locator('[data-cases]')).toBeVisible()
  })

  // W3 (Studio-Funnel): Problem-Spiegel VOR den Leistungen, Vergleich und
  // Selbst-Selektion DAHINTER — die Reihenfolge ist die Zusage des Plans.
  test('W3: Problem-Spiegel vor den Leistungen, Vergleich dahinter, CTA auf den Wizard', async ({ page }) => {
    await page.goto('/')
    const order = await page.locator('main section[id], section[id]').evaluateAll(nodes => nodes.map(n => n.id))
    const idx = (id: string) => order.indexOf(id)
    expect(idx('kennen-sie-das')).toBeGreaterThan(-1)
    expect(idx('kennen-sie-das')).toBeLessThan(idx('leistungen'))
    expect(idx('passt-das')).toBeGreaterThan(idx('leistungen'))
    await expect(page.locator('#passt-das table tbody tr')).toHaveCount(6)
    await expect(page.locator('#passt-das a[href$="/erstgespraech"]')).toHaveCount(1)
    await expect(page.locator('.results-disclaimer')).toBeVisible()
  })

  test('liefert hreflang-Alternates + canonical (useLocaleHead)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  })

  test('rendert ohne schwerwiegende Konsolen-Fehler', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (/Failed to load resource|WebSocket|Hydration completed/i.test(text)) return
      errors.push(text)
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('i18n', () => {
  // Deutscher Browser: detectBrowserLanguage (redirectOn: 'all') hält /de.
  test.use({ locale: 'de-DE' })

  test('/de rendert die deutsche Variante (html lang)', async ({ page }) => {
    await page.goto('/de')
    await expect(page.locator('html')).toHaveAttribute('lang', /de/)
    await expect(page.locator('h1')).toBeVisible()
  })
})

test.describe('Fehlerseiten', () => {
  test('unbekannte Route liefert 404', async ({ page }) => {
    const response = await page.goto('/gibt-es-nicht')
    expect(response?.status()).toBe(404)
  })
})

// Review-Befund B2 (2026-11-22): auf Deutsch lief „EN" bei 375 px über den
// Rand. Jeder sichtbare Kopfzeilen-Link liegt ganz im Fenster.
test.describe('Kopfzeile auf schmalen Telefonen', () => {
  for (const width of [360, 375]) {
    test(`/de bei ${width} px: kein Kopfzeilen-Link ragt über den Rand`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/de')
      const edges = await page.locator('.header a').evaluateAll(links => links
        .map(link => link.getBoundingClientRect())
        .filter(box => box.width > 0)
        .map(box => ({ left: box.left, right: box.right })))
      expect(edges.length).toBeGreaterThanOrEqual(3)
      for (const edge of edges) {
        expect(edge.left).toBeGreaterThanOrEqual(0)
        expect(edge.right).toBeLessThanOrEqual(width)
      }
    })
  }
})
