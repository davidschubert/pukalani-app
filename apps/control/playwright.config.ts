import { defineConfig, devices } from '@playwright/test'

/**
 * E2E-Smoke-Tests für control (Port 3004) — Muster von apps/comments.
 *
 * Kein `channel` ⇒ Playwrights GEBÜNDELTES Chromium (seit 2026-08-01, vorher
 * `channel: 'chrome'`). Grund wie bei apps/comments: System-Chrome startet auf
 * macOS GoogleUpdater/chrome_crashpad_handler, die Playwrights stdout/stderr-
 * Socketpair erben, zu launchd reparenten und nie schließen — der Worker
 * bekommt kein EOF und hängt bis zum 300-s-Force-Kill (Exit 1 trotz grüner
 * Suite). Preis: `npx playwright install chromium` einmalig. In der CI läuft
 * die Suite nur im nächtlichen Lauf der Bühne (`buehne.yml`, `pnpm buehne
 * e2e`); das Chromium installiert dort der Schritt über `--filter comments`
 * (dieselbe Version aus dem Katalog). Läuft gegen einen bereits laufenden
 * Dev-Server (reuseExistingServer) oder startet ihn selbst.
 *
 * Bewusst auth-frei: Routing, SSR-Render, i18n, Auth-Guards und die
 * öffentlichen Rechtsseiten (pages-Layer) — ohne Appwrite-Credentials.
 * Eingeloggte Flows (Dashboard) werden manuell verifiziert.
 */
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:3004'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [
    // Kein `channel` ⇒ gebündeltes Chromium (siehe Kopfkommentar).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PW_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
