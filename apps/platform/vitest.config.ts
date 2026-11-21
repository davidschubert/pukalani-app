import { defineConfig } from 'vitest/config'

// Das test-Script läuft als `nuxi prepare && vitest run` (wie apps/marketing):
// Vites Transform lädt die tsconfig.json der App, und die referenziert
// .nuxt/tsconfig.*.json — ohne prepare stirbt jeder Transform an „Tsconfig
// not found".
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
