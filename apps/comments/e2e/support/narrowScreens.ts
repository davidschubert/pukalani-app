import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Hilfen für die Prüfungen bei schmalem Fenster (Q01, 2026-11-20).
 *
 * WARUM ES SIE GIBT: bis dahin lief jeder Browser-Test im breiten Fenster. Drei
 * Fehler waren deshalb monatelang unsichtbar — die Menüpunkte einer Community
 * lagen auf dem Handy unter den Symbolen, die Kopfzeile von pukalani.app war
 * bei 768 px breiter als das Fenster, und der Feedback-Knopf lag am Seitenende
 * über einem Link. Keiner davon wirft einen Fehler; man sieht sie nur, wenn man
 * misst, WO etwas liegt und WAS dort obenauf ist.
 */

/** Handy und Tablet hochkant — die zwei Breiten, an denen die Fehler lagen. */
export const NARROW_WIDTHS = [375, 768] as const

/**
 * Eine Messung, die einen Neuaufbau der Seite übersteht: der Dev-Server lädt
 * die Seite nach dem ersten Bündeln einmal neu, und eine Messung genau in dem
 * Augenblick verliert ihren Kontext („Execution context was destroyed"). Das
 * ist kein Befund über die Seite — also noch einmal messen.
 */
async function measured<T>(read: () => Promise<T>): Promise<T> {
  let value: T | undefined
  await expect(async () => { value = await read() }).toPass({ timeout: 30_000 })
  return value as T
}

/** Die Seite ist nicht breiter als das Fenster (sonst rollt sie quer). */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const size = await measured(() => page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
  })))
  expect(size.content, `Seite ${size.content} px breit im Fenster ${size.window} px`).toBeLessThanOrEqual(size.window)
}

/**
 * ERREICHBAR heisst dreierlei: zu sehen, quer ganz im Fenster, und an seiner
 * Mitte liegt nichts anderes obenauf. `toBeVisible()` allein genügt nicht — ein
 * Link unter einem anderen Bauteil ist für Playwright „sichtbar".
 *
 * Mit Wiederholung, weil eine Schublade erst hereinfährt.
 */
export async function expectReachable(target: Locator, what: string): Promise<void> {
  await target.scrollIntoViewIfNeeded({ timeout: 15_000 })
  await expect.poll(() => target.evaluate((el) => {
    const box = el.getBoundingClientRect()
    if (!box.width || !box.height) return 'ohne Fläche'
    if (box.left < -1 || box.right > window.innerWidth + 1) return `ausserhalb (${Math.round(box.left)}–${Math.round(box.right)} von ${window.innerWidth})`
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    if (!top) return 'kein Treffer'
    if (el.contains(top) || top.contains(el)) return 'ok'
    return `verdeckt von <${top.tagName.toLowerCase()}> „${(top.textContent ?? '').trim().slice(0, 30)}"`
  }), { message: what, timeout: 15_000 }).toBe('ok')
}

/**
 * Öffnet die Schublade über den Menü-Knopf. Der Klick wird wiederholt, bis sie
 * steht: vor der Hydration verpufft er (der Dev-Server baut die Seite beim
 * ersten Zugriff erst).
 */
export async function openDrawer(toggle: Locator, drawer: Locator): Promise<void> {
  await expect(async () => {
    if (!(await drawer.isVisible())) await toggle.click({ timeout: 3_000 })
    await expect(drawer).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 60_000 })
}

/** Alle Texte der Links und Knöpfe in einem Bereich, ohne Leerzeilen. */
export async function labelsIn(area: Locator): Promise<string[]> {
  const texts = await measured(() => area.locator('a, button').evaluateAll(nodes =>
    nodes.map(node => (node.textContent ?? '').replace(/\s+/g, ' ').trim())))
  return texts.filter(Boolean)
}

/**
 * Am Seitenende liegt der Feedback-Knopf über keinem Link und keinem Knopf.
 * Gibt die Texte der überdeckten Teile zurück (leer = gut).
 */
export async function coveredByFeedback(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  // Zweimal messen, bis die Seite nicht mehr wächst (nachgeladene Inhalte).
  await expect.poll(async () => {
    const before = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.waitForTimeout(250)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    return (await page.evaluate(() => document.documentElement.scrollHeight)) === before
  }, { timeout: 15_000 }).toBe(true)
  return page.evaluate(() => {
    const button = document.querySelector('[data-testid="feedback-button"]')
    if (!button) return ['(kein Feedback-Knopf auf der Seite)']
    const b = button.getBoundingClientRect()
    return [...document.querySelectorAll('a, button')]
      .filter(el => el !== button && !button.contains(el))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top
      })
      .map(el => (el.textContent ?? '').trim().slice(0, 40))
  })
}
