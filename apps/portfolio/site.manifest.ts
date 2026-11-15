import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; `pnpm check:manifests` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: 'portfolio',
  products: [
    'themes',
    'admin',
    // Besucherstatistik (2026-08-04): misst schon über einen fest
    // konfigurierten `src`; der Layer macht die Site im Dashboard wechselbar,
    // ohne dass dafür deployt werden muss.
    'analytics',
    // Eigene Domain dieser Site (control-036, 2026-08-07). Nur Silos ziehen
    // diesen Layer: die Pool-Fassung liegt in `onboarding` und benutzt
    // denselben Seiten-Pfad — zwei Dateien dafuer wuerden einander
    // ueberlagern (Begruendung im Kopf von packages/domains/nuxt.config.ts).
    'domains',
    // Rechtsseiten als CMS (2026-08-08): Impressum/Datenschutz entstehen als
    // Entwurfs-Vorlagen (`pnpm --filter portfolio seed:legal`; das Skript
    // gehört dem Layer: packages/pages/scripts/seed-legal-pages.ts) und
    // werden im Dashboard gefüllt und veröffentlicht — der Footer verlinkt
    // nur Veröffentlichtes.
    'pages',
    // `brand` STAND HIER (P1b) und ist mit dem Rückbau vom 2026-08-31 raus:
    // der Brand-Wizard hat seit Davids Kehrtwende eine eigene App, eine eigene
    // Domain und ein eigenes Appwrite-Projekt (apps/branding,
    // docs/plans/BRANDING-SUPPLY-INFRA.md §2). pukalani.studio ist wieder nur
    // der Studio-Trichter.
  ],
  // Ziel-Prüfung (OPS-002): nur gegen diese Appwrite-Projekte darf der
  // Migrations-Runner im Namen dieser App schreiben.
  appwriteProjects: ['portfolio'],
} satisfies SiteManifest
