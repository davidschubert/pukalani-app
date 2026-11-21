import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

/**
 * ZWEI VITEST-PROJEKTE (Q21).
 *
 * `unit` sind die schnellen Tests wie bisher: reine Funktionen, Umgebung
 * `node`, kein Nuxt. `render` baut Seiten in einer gestellten Nuxt-Umgebung
 * auf (`@nuxt/test-utils`, DOM aus `happy-dom`) — das kostet einen Nuxt-Start
 * (Vite + alle Layer des Playgrounds) und liegt deshalb in einem EIGENEN
 * Projekt: die Unit-Tests laden davon nichts, und ein Render-Test wartet nicht
 * auf die 148 anderen. `vitest run` (= `pnpm test`, Pflicht-Lauf `test`) fährt
 * beide; einzeln: `vitest run --project render`.
 *
 * Wurzel des Render-Projekts ist der Playground (`brand` + `core`): die
 * kleinste echte App, die die Werkstatt-Seite trägt. `apps/branding` zöge
 * acht weitere Layer mit hinein, die die Seite nicht braucht.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/render/**'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        test: {
          name: 'render',
          include: ['tests/render/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('./.playground', import.meta.url)),
              domEnvironment: 'happy-dom',
            },
          },
          // Der erste Aufbau übersetzt die 5.000-Zeilen-Seite samt Layern;
          // unter Last eines vollen `pnpm -r test` misst die 5-s-Vorgabe die
          // Maschine, nicht die Seite.
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      }),
    ],
  },
})
