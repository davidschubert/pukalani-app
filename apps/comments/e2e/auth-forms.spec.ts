import { test, expect } from '@playwright/test'

/**
 * Die Anmelde-Formulare nennen ihre Felder (Q08: UX-004, UX-005, UX-007,
 * UX-009, UX-010).
 *
 * TEIL 1 liest das AUSGELIEFERTE HTML, nicht den Baum im Browser: ein
 * Passwort-Manager und das Ausfüllen des Browsers greifen, bevor die Seite
 * lebt, und `UInput` setzt `autocomplete="off"`, sobald ein Formular nichts
 * angibt. Genau das stand bis 2026-11-21 an allen elf Feldern — sichtbar war
 * davon nichts, und weder Typecheck noch Lint noch ein Unit-Test sehen es.
 *
 * DIE ERWARTUNG STEHT AUSGESCHRIEBEN HIER, je Seite und Feld. Sie wird nicht
 * aus dem Formular gelesen: wer ein Feld ergänzt, muss diese Tabelle anfassen
 * und dabei entscheiden, was der Browser dort ausfüllen darf.
 *
 * TEIL 2 braucht den Browser: Reihenfolge der Tab-Taste, Ansage eines Fehlers
 * und der Fokus danach lassen sich am HTML nicht ablesen. Eine fehlende Ansage
 * findet keine Prüfmaschine — sie fällt nur beim Zuhören auf.
 */
const SEITEN: Record<string, Record<string, string>> = {
  '/login': { email: 'username', password: 'current-password' },
  '/login/code': { email: 'email' },
  '/register': { name: 'name', email: 'email', password: 'new-password', passwordConfirm: 'new-password' },
  '/register/code': { name: 'name', email: 'email' },
  '/forgot-password': { email: 'email' },
  // Ohne die beiden Angaben zeigt die Seite nur „Link ungültig" und kein Feld.
  '/reset-password?userId=probe&secret=probe': { password: 'new-password', passwordConfirm: 'new-password' },
}

interface Feld { name: string, id: string, autocomplete: string, type: string }

function attribut(tag: string, name: string): string {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? ''
}

/** Alle sichtbaren Eingabefelder einer HTML-Antwort. */
function felder(html: string): Feld[] {
  return (html.match(/<input\b[^>]*>/g) ?? [])
    .map(tag => ({
      name: attribut(tag, 'name'),
      id: attribut(tag, 'id'),
      autocomplete: attribut(tag, 'autocomplete'),
      type: attribut(tag, 'type'),
    }))
    .filter(feld => feld.type !== 'hidden' && feld.type !== 'checkbox')
}

for (const [pfad, erwartet] of Object.entries(SEITEN)) {
  test(`HTML von ${pfad.split('?')[0]}: jedes Feld hat Namen, Beschriftung und autocomplete`, async ({ request }) => {
    const antwort = await request.get(pfad, { headers: { 'accept-language': 'en' } })
    expect(antwort.status()).toBe(200)
    const html = await antwort.text()
    const gefunden = felder(html)

    // Genau diese Felder — ein neues ohne Eintrag oben fällt hier auf.
    expect(gefunden.map(feld => feld.name).sort()).toEqual(Object.keys(erwartet).sort())

    for (const feld of gefunden) {
      expect(feld.autocomplete, `${pfad}: Feld „${feld.name}"`).toBe(erwartet[feld.name])
      expect(feld.id, `${pfad}: Feld „${feld.name}" hat keine Kennung`).not.toBe('')
      expect(html, `${pfad}: Feld „${feld.name}" hat keine Beschriftung`).toContain(`for="${feld.id}"`)
    }
  })
}

test('Anmeldung: Tab führt von der E-Mail ins Passwortfeld', async ({ page }) => {
  await page.goto('/login')
  const email = page.locator('[data-login-form] input[name="email"]')
  await expect(email).toBeVisible()
  await email.focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-login-form] input[name="password"]')).toBeFocused()
  // Der Link ist weiter da — nur eben hinter dem Feld.
  await expect(page.locator('[data-login-forgot]')).toBeVisible()
})

test('Anmeldung: leeres Formular setzt den Fokus ins erste fehlerhafte Feld', async ({ page }) => {
  await page.goto('/login')
  const knopf = page.locator('[data-login-form] button[type="submit"]')
  const email = page.locator('[data-login-form] input[name="email"]')
  // Ein Klick vor der Hydration sendet das Formular am Browser vorbei —
  // deshalb klicken, bis das Formular geantwortet hat.
  await expect(async () => {
    await knopf.click()
    await expect(email).toHaveAttribute('aria-invalid', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
  await expect(email).toBeFocused()
  // Der Fehlertext hängt am Feld, sonst liest ihn der Fokus nicht vor.
  const beschreibung = await email.getAttribute('aria-describedby')
  expect(beschreibung ?? '').toContain('-error')
})

test('Anmeldung: eine Ablehnung wird angesagt, der Fokus steht im Passwortfeld', async ({ page }) => {
  await page.goto('/login')
  const email = page.locator('[data-login-form] input[name="email"]')
  const passwort = page.locator('[data-login-form] input[name="password"]')
  const meldung = page.locator('[data-login-form] [role="alert"]')
  await expect(async () => {
    await email.fill('q08-niemand@example.test')
    await passwort.fill('Kein-Konto-1234!')
    await page.locator('[data-login-form] button[type="submit"]').click()
    await expect(meldung).toBeVisible({ timeout: 10_000 })
  }).toPass({ timeout: 60_000 })
  await expect(meldung).not.toBeEmpty()
  await expect(passwort).toBeFocused()
})

test('Registrierung: jede Passwort-Regel sagt ihren Zustand, der Balken hat einen Namen', async ({ page }) => {
  await page.goto('/register')
  const passwort = page.locator('[data-register-form] input[name="password"]')
  const zustaende = page.locator('[data-register-form] [data-password-rule-state]')
  await expect(zustaende).toHaveCount(6)
  const vorher = await zustaende.allInnerTexts()
  // Nur Kleinbuchstaben: genau EINE Regel ist erfüllt. Bis die Seite lebt,
  // bleibt die Eingabe ohne Wirkung — deshalb wiederholen.
  await expect(async () => {
    await passwort.fill('abc')
    const jetzt = await zustaende.allInnerTexts()
    expect(jetzt.filter((text, index) => text !== vorher[index])).toHaveLength(1)
  }).toPass({ timeout: 60_000 })
  const balken = page.locator('[data-register-form] [role="progressbar"]')
  await expect(balken).toHaveAttribute('aria-label', /1.+6/)
})
