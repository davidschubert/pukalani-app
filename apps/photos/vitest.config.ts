import { defineConfig } from 'vitest/config'

/**
 * Unit-Tests dieser App (Muster `apps/portfolio/vitest.config.ts`).
 *
 * `include` ist ENG auf `tests/**` gesetzt: Vitests Vorgabe
 * (`**\/*.{test,spec}.*`) würde die Playwright-Specs unter `e2e/` mitnehmen,
 * die unter Vitest weder Browser noch Fixtures finden.
 *
 * `oxc: { tsconfig: false }` statt `nuxi prepare` vor jedem Lauf: Vites
 * oxc-Transform liest sonst die `tsconfig.json` der App, und die verweist nur
 * auf `.nuxt/tsconfig.*.json` — ohne prepare (frischer Checkout, CI) stirbt
 * jeder Transform an „Tsconfig not found". Die Tests brauchen aus der tsconfig
 * nichts (keine Aliasse, kein JSX, keine Decorators); prepare kostete nur Zeit.
 */
export default defineConfig({
  oxc: { tsconfig: false },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
