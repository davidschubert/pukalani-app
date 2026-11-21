import { expect, test, type Page } from '@playwright/test'

/**
 * Abweichungen zwischen Server- und Browser-Fassung (FE-003, Q15, 2026-11-21).
 *
 * Vue meldet eine Abweichung NUR IN DER KONSOLE: die Seite sieht danach meist
 * richtig aus (der Teil wird neu aufgebaut), kein Test, kein Typecheck und
 * kein Lint wird rot. So standen sechs Dashboard-Seiten monatelang mit der
 * Meldung da, und sie galt als „bekannter Fehler der Bibliothek".
 *
 * Diese Hilfe hört die Konsole ab, während eine Seite FRISCH VOM SERVER
 * geladen wird (nur dann übernimmt der Browser eine Server-Fassung — nach
 * einem Klick in der App gibt es nichts zu übernehmen).
 *
 * WAS ZÄHLT:
 *  - jede Warnung und jeder Fehler mit „Hydration" (der Dev-Server nennt
 *    Knoten, Text, Klasse, Stil und Attribut einzeln; der Production-Build nur
 *    „Hydration completed but contains mismatches");
 *  - „Failed to resolve component": ein Baustein, den es nicht (mehr) gibt,
 *    wird auf dem Server zu einem Kommentar und im Browser zu einem
 *    unbekannten Element — zwei der sechs Seiten hatten genau das.
 *
 * WAS DIE HILFE NICHT SIEHT: eine Abweichung, die nur mit bestimmten Daten
 * entsteht (die Probe-Instanz ist fast leer), und alles hinter einem Klick.
 */
const MISMATCH = /hydration|failed to resolve component/i

/** Hört ab jetzt mit; `messages` wächst, `reset()` leert vor der nächsten Seite. */
export function listenForMismatches(page: Page): { messages: string[], reset: () => void } {
  const messages: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'warning' && msg.type() !== 'error') return
    const text = msg.text()
    // Die erste Zeile reicht für den Bericht; der Rest ist die Baum-Spur.
    if (MISMATCH.test(text)) messages.push(text.split('\n').slice(0, 3).join(' ').slice(0, 300))
  })
  return { messages, reset: () => { messages.length = 0 } }
}

/**
 * Die Seite ist übernommen: die App hängt, und der Teilbaum der SEITE (hinter
 * `<Suspense>`, also später als die App) trägt seinen Knoten. `__vnode` setzt
 * Vue nur im Dev-Build — die Suite fährt immer gegen den Dev-Server.
 */
const pageHydrated = (selector: string) => {
  const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
  const el = document.querySelector(selector) as (Element & { __vnode?: unknown }) | null
  return Boolean(root?.__vue_app__ && el && el.__vnode !== undefined)
}

/**
 * Lädt jede Adresse frisch vom Server und verlangt eine Konsole ohne
 * Abweichungs-Meldung. Alle Seiten werden gemessen (weiche Erwartung), damit
 * ein roter Lauf jede betroffene Seite nennt und nicht nur die erste.
 *
 * `landmark` ist ein Element, das die SEITE zeichnet (nicht das Layout).
 */
export async function expectNoMismatchOnFreshLoad(page: Page, hrefs: string[], landmark = 'main#dashboard-main h1'): Promise<void> {
  const listener = listenForMismatches(page)
  for (const href of hrefs) {
    await test.step(`frisch geladen: ${href}`, async () => {
      // Mit Wiederholung: der Dev-Server lädt eine Seite nach dem ersten
      // Bündeln einmal neu; gezählt wird der Lauf, der zu Ende kommt.
      await expect(async () => {
        listener.reset()
        await page.goto(href)
        await page.waitForFunction(pageHydrated, landmark, { timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 30_000 })
      }).toPass({ timeout: 150_000 })
      expect.soft(listener.messages, `Abweichung zwischen Server und Browser auf ${href}`).toEqual([])
    })
  }
}
