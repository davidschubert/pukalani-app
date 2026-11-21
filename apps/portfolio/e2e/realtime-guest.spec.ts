import { expect, test } from '@playwright/test'

/**
 * Gäste auf den öffentlichen Seiten öffnen KEINE Live-Verbindung (PERF-012,
 * Q23, 2026-11-21).
 *
 * Die App hat ein Dashboard, darum ist Realtime hier an (Config-Gate F14).
 * Vorher abonnierten zwei app-weite Plugins (Laufzeit-Flags, Farbwelten) auch
 * für Gäste — jeder Besucher der Landing hielt eine Verbindung samt
 * nachgeladenem Web-SDK. Seit Q23 starten sie erst nach der Anmeldung
 * (`whileSignedIn`, core/app/utils/hostGate.ts).
 *
 * GEGENPROBE (2026-11-21, lokal gegen den Stand davor): rot — auf der Landing
 * eine Verbindung zu `/v1/realtime`.
 */
const PAGES = ['/', '/de']
const QUIET_MS = 8_000

test.describe('Gast: keine Live-Verbindung (Q23)', () => {
  for (const path of PAGES) {
    test(`${path}: kein WebSocket zu Realtime`, async ({ page }) => {
      const sockets: string[] = []
      page.on('websocket', (ws) => {
        if (ws.url().includes('/realtime')) sockets.push(ws.url().split('?')[0]!)
      })
      // Erster Aufruf wärmt den Dev-Server (er bündelt und lädt einmal neu;
      // ein kalter Server antwortet den Skripten 503 — dann startet gar
      // nichts, und der Fall wäre grün, ohne etwas zu prüfen).
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.reload()
      await expect(page.locator('h1')).toBeVisible()
      // Hydriert: der Plugin-Lauf ist durch, ein Abo stünde jetzt.
      // Ohne diese Zeile wäre der Fall auch dann grün, wenn das Skript der
      // Seite nie lief. `window.useNuxtApp` stellt der Dev-Server bereit (die
      // Suite läuft nur gegen ihn); nach der Hydration sind alle Plugins durch.
      await page.waitForFunction(() => {
        const nuxt = (window as unknown as { useNuxtApp?: () => { isHydrating?: boolean } }).useNuxtApp
        return typeof nuxt === 'function' && nuxt().isHydrating === false
      }, undefined, { timeout: 30_000 })
      await page.waitForTimeout(QUIET_MS)
      expect(sockets).toEqual([])
    })
  }
})
