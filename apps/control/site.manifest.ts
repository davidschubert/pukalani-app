import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; `pnpm check:manifests` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: 'control',
  products: [
    'themes',
    'admin',
    'control',
    // E10 (Davids Entscheidung 7): der Feedback-Bereich und das Board gehören
    // dorthin, wo der Betreiber ohnehin arbeitet — beide sind am 2026-07-31
    // aus apps/comments hierher gezogen.
    'feedback',
    'billing',
    'tickets',
    // AI-Runner (docs/archiv/AI-RUNNER.md): die Ausführungs-Schicht zum Board.
    // Betreiber-Werkzeug — läuft NUR hier, nie auf einer Kunden-Site.
    'runner',
    'pages',
  ],
  // Ziel-Prüfung (OPS-002): nur gegen diese Appwrite-Projekte darf der
  // Migrations-Runner im Namen dieser App schreiben.
  // `admin` = das Projekt des Control Plane.
  appwriteProjects: ['admin'],
} satisfies SiteManifest
