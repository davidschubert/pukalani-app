import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Viele Core-Tests starten echte Prozesse (bash, node, tar, git). Bei
    // einem vollen `pnpm -r test` laufen alle Pakete gleichzeitig, dann
    // braucht allein ein Prozess-Start Sekunden — die 5-s-Vorgabe von Vitest
    // misst dort die Last der Maschine, nicht den Code (Q26-N).
    testTimeout: 30_000,
  },
})
