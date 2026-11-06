import { defineConfig } from 'vitest/config'

/**
 * Unit-Tests dieser App (Muster `apps/marketing/vitest.config.ts` und
 * `apps/portfolio/vitest.config.ts`).
 *
 * `include` ist ENG auf `tests/**` gesetzt: Vitests Vorgabe
 * (`**\/*.{test,spec}.*`) würde sonst irgendwann eine Playwright-Spec
 * mitnehmen, die unter Vitest weder Browser noch Fixtures findet und mit einem
 * Fehler stirbt, der nichts mit dem Testgegenstand zu tun hat.
 *
 * Das test-Script läuft als `nuxi prepare && vitest run`: Vites oxc-Transform
 * liest die `tsconfig.json` der App, und die referenziert
 * `.nuxt/tsconfig.*.json` — ohne prepare (frischer Checkout, CI) stirbt jeder
 * Transform an „Tsconfig not found".
 *
 * KEIN `#shared`-Alias wie bei marketing/portfolio: diese App hat kein eigenes
 * `shared/`, die geprüften Dateien importieren ausschliesslich relativ.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
