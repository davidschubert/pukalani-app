import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; `pnpm check:manifests` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: 'photos',
  products: [
    'themes',
    'admin',
    'media',
  ],
  // Ziel-Prüfung (OPS-002): nur gegen diese Appwrite-Projekte darf der
  // Migrations-Runner im Namen dieser App schreiben.
  appwriteProjects: ['photos-qgry'],
} satisfies SiteManifest
