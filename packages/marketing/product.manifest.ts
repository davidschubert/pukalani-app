import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * CHROME-LAYER der Marke Pukalani — Kopf- und Fußbereich der öffentlichen
 * Seiten, geteilt von pukalani.app (apps/marketing) und help.pukalani.app
 * (apps/help).
 *
 * WARUM EIN EIGENER LAYER UND NICHT EINE KOPIE JE APP: Kopf und Fuß SIND die
 * Marke — dieselbe Navigation, dieselben Rechtslinks, dieselbe Sprach- und
 * Darstellungs-Wahl. Zwei Kopien laufen genau so auseinander wie die
 * Produkt-Kompositionen vor `blueprint`: eine App bekommt einen neuen
 * Menüpunkt, die andere nicht, und niemandem fällt es auf, weil nichts
 * kaputtgeht.
 *
 * `tier: 'foundation'` und KEIN `requires`: das hier ist kein Kunden-Produkt,
 * das eine Community buchen könnte, sondern das Erscheinungsbild der
 * öffentlichen Seiten. Es hängt an nichts außer dem Core — ein Chrome-Layer,
 * der ein Produkt voraussetzt, wäre in der ersten Silo-Site ein Loch.
 *
 * KEINE Tables, KEINE Migrationen, KEINE Produkt-Logik. Was hier lebt:
 * die zwei Bauteile (Kopf/Fuß), ihre Link-Auflösung (app/composables/
 * useMarketingSite.ts — intern auf pukalani.app, absolut überall sonst), die
 * Marken-CSS-Brücke und die i18n-Schlüssel, die BEIDE Bauteile rendern.
 */
export default {
  key: 'marketing',
  tier: 'foundation',
  hasMigrations: false,
  userData: false,
  title: { en: 'Marketing chrome', de: 'Marketing-Chrome' },
  description: {
    en: 'Marketing chrome: the Pukalani header and footer, shared by pukalani.app and help.pukalani.app.',
    de: 'Marketing-Chrome: Kopf- und Fußbereich der Marke Pukalani — geteilt von pukalani.app und help.pukalani.app.',
  },
  icon: 'i-ph-megaphone',
} satisfies ProductManifest
