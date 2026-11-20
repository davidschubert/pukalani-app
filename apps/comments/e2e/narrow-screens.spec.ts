import { test, expect } from '@playwright/test'
import { NARROW_WIDTHS, expectNoSidewaysScroll, expectReachable, labelsIn, openDrawer } from './support/narrowScreens'

/**
 * Schmale Fenster (Q01, 2026-11-20): Handy (375 px) und Tablet hochkant (768 px).
 *
 * ZWEI SEITEN, EINE FRAGE — kommt man überall hin, und rollt die Seite quer?
 *  - die Community (diese App, Layout aus `packages/blueprint`): unter 1024 px
 *    steht ein Menü-Knopf, der ALLE Punkte der breiten Reihe in einer Schublade
 *    zeigt;
 *  - die Kopfzeile von pukalani.app (`packages/marketing`, auch von der Hilfe
 *    geerbt): sie schaltet erst ab 1024 px auf die breite Fassung.
 *
 * WOHER DIE ERWARTUNG KOMMT: die Punkte werden einmal im breiten Fenster aus
 * der Reihe gelesen und dann im schmalen in der Schublade gesucht — zwei
 * verschiedene Bauteile über derselben Quelle. Feste Namen stehen im
 * Pool-Test daneben (`narrow-screens-pool.spec.ts`), dort mit eigenen Punkten
 * und Unterpunkten.
 *
 * GEGENPROBE (2026-11-20, gegen den Stand davor): alle Fälle hier rot — der
 * Menü-Knopf fehlt, und pukalani.app ist bei 768 px 826 px breit.
 */
const marketingUrl = process.env.PW_MARKETING_URL ?? 'http://localhost:3007'

test.describe('Community: Navigation im schmalen Fenster', () => {
  for (const width of NARROW_WIDTHS) {
    test(`${width} px: Menü-Knopf öffnet alle Punkte, nichts rollt quer`, async ({ page }) => {
      // Erst breit: was steht in der Reihe?
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      const row = page.getByTestId('chrome-nav')
      await expect(row).toBeVisible({ timeout: 60_000 })
      const wide = (await labelsIn(row)).filter(label => !/^more$/i.test(label))
      expect(wide.length, `Punkte der breiten Reihe: ${wide.join(', ')}`).toBeGreaterThanOrEqual(2)

      // Dann schmal.
      await page.setViewportSize({ width, height: 812 })
      await expect(row).toBeHidden()
      await expectNoSidewaysScroll(page)

      // Kopfzeile: jedes sichtbare Teil ist erreichbar (nichts liegt übereinander).
      const header = page.getByTestId('main-nav')
      const controls = header.locator('a:visible, button:visible')
      const count = await controls.count()
      expect(count).toBeGreaterThanOrEqual(3)
      for (let i = 0; i < count; i++) await expectReachable(controls.nth(i), `Kopfzeile, Teil ${i + 1}`)

      // Der Knopf trägt eine Beschriftung und öffnet die Schublade.
      const toggle = page.getByTestId('chrome-nav-toggle')
      await expect(toggle).toHaveAttribute('aria-label', /open menu/i)
      const drawer = page.getByTestId('chrome-nav-drawer')
      await openDrawer(toggle, drawer)

      const inDrawer = await labelsIn(drawer)
      for (const label of wide) expect(inDrawer, `„${label}" fehlt in der Schublade`).toContain(label)
      const links = drawer.locator('a')
      for (let i = 0; i < await links.count(); i++) await expectReachable(links.nth(i), `Schublade, Link ${i + 1}`)
      await expectNoSidewaysScroll(page)

      // Ein Klick führt hin und schliesst die Schublade.
      const second = links.nth(1)
      const href = await second.getAttribute('href')
      await second.click()
      await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`), { timeout: 60_000 })
      await expect(drawer).toBeHidden()
      await expectNoSidewaysScroll(page)
    })
  }

  test('1024 px: die Reihe steht, der Menü-Knopf ist weg', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/')
    await expect(page.getByTestId('chrome-nav')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('chrome-nav-toggle')).toBeHidden()
    await expectNoSidewaysScroll(page)
  })
})

test.describe('pukalani.app: Kopfzeile im schmalen Fenster', () => {
  // AUF DEUTSCH, mit Absicht: die deutschen Knöpfe sind länger („Ich habe einen
  // Code", „Zugang anfragen"). Auf Englisch passte die alte Kopfzeile bei
  // 768 px gerade noch — die Gegenprobe blieb dort grün.
  test.use({ locale: 'de-DE' })
  const start = `${marketingUrl}/de`

  for (const width of NARROW_WIDTHS) {
    test(`${width} px: Hauptknopf ganz zu sehen, Menü erreichbar, nichts rollt quer`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(start)
      const header = page.locator('header').first()
      // Der Hauptknopf heisst je nach Tor anders; es gibt genau einen.
      const cta = header.getByRole('link', { name: /zugang anfragen|kostenlos starten/i })
      await expect(cta).toBeVisible({ timeout: 60_000 })
      await expectNoSidewaysScroll(page)
      await expectReachable(cta, 'Hauptknopf der Kopfzeile')

      const toggle = header.getByRole('button', { name: /menü öffnen/i })
      await expectReachable(toggle, 'Menü-Knopf')
      const signIn = page.getByRole('dialog').getByRole('link', { name: /^anmelden$/i })
      await openDrawer(toggle, signIn)
      await expectReachable(signIn, '„Anmelden" im Menü')
      await expect(page.getByRole('dialog').getByRole('link', { name: /^preise$/i })).toBeVisible()
      await expectNoSidewaysScroll(page)
    })
  }

  test('1024 px: die breite Fassung passt ins Fenster', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto(start)
    const header = page.locator('header').first()
    await expect(header.getByRole('link', { name: /^preise$/i })).toBeVisible({ timeout: 60_000 })
    await expectNoSidewaysScroll(page)
    const controls = header.locator('a:visible, button:visible')
    for (let i = 0; i < await controls.count(); i++) await expectReachable(controls.nth(i), `Kopfzeile, Teil ${i + 1}`)
    await expect(header.getByRole('button', { name: /menü öffnen/i })).toBeHidden()
  })
})
