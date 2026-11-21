import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * Brand-Wizard (Phase 1 "Fundament") — KI-Markenberater "George".
 * Plan: docs/archiv/BRAND-WIZARD-PHASE-1.md. Aktueller Stand: P1b — die sieben
 * brand_*-Tabellen stehen (scripts/migrations/001–007, Schema-Anhang
 * docs/archiv/BRAND-WIZARD-SCHEMA.md); die Routen folgen.
 *
 * Die Tabellen laufen NUR auf der `branding`-Instanz (branding.supply, Silo) —
 * der Layer steht deshalb im BRANDING_SOLL von
 * scripts/ops/verify-schema-parity.mjs, nicht in der instanzweiten
 * Spalten-Parität. Bis zum 2026-08-31 hing er am `portfolio`-Silo (P1b); die
 * Kehrtwende steht in docs/archiv/BRANDING-SUPPLY-INFRA.md.
 */
export default {
  key: 'brand',
  tier: 'optional',
  kind: 'product',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): brand-027 legt die Lauf-Tabelle `brand_runs` an.
  schema: { latest: '027', probe: { migration: '027', table: 'brand_runs' } },
  // `/api/discover` ist die öffentliche Galerie (Liste, Einzelansicht, Meldung).
  // Sie gehört unter denselben Not-Aus wie der Wizard (BE-005, 2026-11-16):
  // die Produkt-Schranke prüft nur „Produkt an?", weder Anmeldung noch Plan —
  // für Gäste ändert sich nichts, solange das Produkt läuft.
  apiPrefixes: ['/api/brand', '/api/discover'],
  title: { en: 'Brand Wizard', de: 'Brand-Wizard' },
  description: {
    en: 'Guided AI brand advisor: build a complete brand foundation — purpose, values, archetype, voice and manifesto.',
    de: 'Geführter KI-Markenberater: eine vollständige Brand Foundation — Purpose, Werte, Archetyp, Stimme und Manifest.',
  },
  customerDescription: {
    en: 'Your brand, built in a conversation with a personal brand advisor: purpose, values, voice and manifesto.',
    de: 'Eure Marke, im Gespräch mit einem persönlichen Markenberater: Purpose, Werte, Stimme und Manifest.',
  },
  icon: 'i-ph-compass',
} satisfies ProductManifest
