/**
 * Warten auf die HYDRATION im Browser — an Elementen, nie an Netz-Ruhe
 * (BT1 d, 2026-11-28).
 *
 * Vorher warteten `verify-handles-mentions` und `verify-mention-menu` mit
 * `page.waitForLoadState('networkidle')` (30 s) darauf, dass Vue die Seite
 * übernommen hat. Mit offener Live-Verbindung wird das Netz aber nie ganz
 * still: in den Nacht-Läufen vom 22. und 25.11. scheiterte der Beweis genau
 * dort, ohne dass am Programm etwas falsch war.
 *
 * Die Frage ist nicht „ist das Netz still?", sondern „reagiert die Seite?" —
 * also: handeln und am Ergebnis prüfen, ob es gewirkt hat. Vor der Hydration
 * findet ein Klick keinen Vue-Handler; dann geht der Fokus wieder weg (bzw.
 * das Menü zu) und es folgt ein neuer Versuch, bis die Frist abläuft.
 */

/** So lange darf ein einzelner Versuch auf seine Wirkung warten. */
const STEP_MS = 5_000

/**
 * Öffnet den Editor im Composer: der Wechsel vom Textfeld auf den Editor hängt
 * an `@focusin` (PostBodyField) — ein Fokus vor der Hydration bewirkt nichts.
 *
 * @param {import('playwright').Page} page
 * @param {{ deadlineMs?: number }} [options]
 * @returns {Promise<number>} wie viele Versuche es brauchte
 */
export async function openComposerEditor(page, { deadlineMs = 120_000 } = {}) {
  const textarea = page.locator('[data-composer-body] textarea')
  const editor = page.locator('[data-composer-body] [contenteditable="true"]')
  await textarea.waitFor({ timeout: 90_000 })
  const until = Date.now() + deadlineMs
  let attempts = 0
  while (Date.now() < until) {
    attempts++
    // Das Textfeld kann zwischen zwei Versuchen schon dem Editor gewichen sein.
    if (await textarea.count()) await textarea.click({ timeout: STEP_MS }).catch(() => undefined)
    try {
      await editor.waitFor({ timeout: STEP_MS })
      // Der Editor ist da — einen Augenblick, bis er Eingaben annimmt.
      await page.waitForTimeout(600)
      return attempts
    }
    catch {
      // Noch nicht hydriert: Fokus wegnehmen, damit der nächste Klick wieder
      // ein `focusin` auslöst.
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
    }
  }
  throw new Error(`Der Editor im Composer kam nach ${attempts} Versuchen in ${Math.round(deadlineMs / 1000)} s nicht.`)
}

/**
 * Öffnet ein Menü (UDropdownMenu, Inhalt im Portal) und wartet auf einen
 * Eintrag darin. Vor der Hydration öffnet der Knopf nichts; dann Escape und
 * ein neuer Versuch.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} trigger der Knopf, der das Menü öffnet
 * @param {string} itemName sichtbarer Name des Eintrags
 * @param {{ deadlineMs?: number }} [options]
 * @returns {Promise<import('playwright').Locator | null>} der Eintrag, oder `null`, wenn er nie kam
 */
export async function openMenuItem(page, trigger, itemName, { deadlineMs = 60_000 } = {}) {
  const item = page.getByRole('menuitem', { name: itemName })
  const until = Date.now() + deadlineMs
  while (Date.now() < until) {
    await trigger.click({ timeout: STEP_MS }).catch(() => undefined)
    try {
      await item.first().waitFor({ timeout: STEP_MS })
      return item.first()
    }
    catch {
      await page.keyboard.press('Escape')
    }
  }
  return null
}
