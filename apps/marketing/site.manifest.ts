import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl der Marketing-Startseite (pukalani.app). Keine KUNDEN-Produkte
 * (die Seite ist öffentlich + statisch), aber der Chrome-Layer `marketing`:
 * Kopf, Fuß, Marken-CSS und ihre i18n-Schlüssel liegen dort, damit
 * help.pukalani.app dasselbe Erscheinungsbild bekommt, ohne es zu kopieren.
 * `pnpm check:manifests` hält extends + package.json konsistent.
 */
export default {
  siteId: 'marketing',
  products: ['marketing'],
  // Keine eigene Appwrite-Instanz (öffentlich + statisch) — der
  // Migrations-Runner lehnt jede Env-Datei ab (OPS-002).
  appwriteProjects: [],
} satisfies SiteManifest
