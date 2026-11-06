import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * Marktvergleich — die Behauptungen der Wettbewerber in DERSELBEN Feldstruktur
 * wie die eigene Brand Foundation, jede mit Zitat und Quelle.
 * Plan: docs/archiv/BRAND-MARKTVERGLEICH.md (Strategie + Konzept freigegeben
 * 2026-09-05, alle acht Entscheidungen in §6; Prototyp M0/M0b von David
 * freigegeben 2026-09-05).
 *
 * STAND: **M1 „Layer + Vertrag"** — das Fundament steht: die drei Tabellen
 * (`market_competitors`, `market_profiles`, `market_reports`, Migrationen
 * market-001…003, Schema-Anhang B des Plans), der explizite Vertrag zum
 * brand-Layer (`server/utils/brandContract.ts`), der Store, der
 * GDPR-Contributor und die Profil-Kaskade. Seit **M2 „Abruf + Extraktion"** stehen darauf die
 * Routen unter `/api/market/profiles/:id/*` (Kandidaten führen, Lauf), der
 * geteilte Mehrseiten-Abruf im brand-Layer (§7.4), der Beleg-Riegel und die
 * KI-Aussensicht (§7.5). Der VERGLEICH (Bericht, Befunde) kommt mit M3.
 *
 * `hasMigrations: true` seit M1: der Layer steht damit in der LAYER_ORDER von
 * `scripts/migrate.mjs` (NACH `brand` — seine Tabellen hängen an
 * `brand_profiles`) und im BRANDING_SOLL von `pnpm ops:schema-parity`.
 *
 * `requires: ['brand']` ist keine Höflichkeit, sondern die Bedingung: ohne
 * Foundation gibt es keine eigene Behauptung, gegen die man vergleichen
 * könnte (§2.4 — freigeschaltet ab abgenommenem Kapitel B).
 *
 * `tier: 'optional'` IST die Bezahl-Aussage. Das Manifest kennt nur
 * `foundation | optional`; „bezahlt" steht nicht als drittes Wort darin,
 * sondern in der Zuteilung (`entitlementKey`, hier = key) und in der
 * Schranke der Oberfläche (§1.9: „frei bauen, bezahlt anwenden").
 *
 * `apiPrefixes: ['/api/market']` seit **M2**: die erste Route steht, und damit
 * ist das Versprechen eingelöst. Die Middleware `04.product-gate.ts` (core)
 * matcht JEDE `/api/market/**`-Route gegen den Produkt-Schalter — die
 * Notabschaltung `app_config.products.market.enabled = false` antwortet danach
 * mit 404 für alles, ohne dass ein Handler etwas davon wissen muss.
 *
 * EIN Präfix und nicht mehrere: alle Routen liegen darunter, und ein zweiter
 * Eintrag wäre die Stelle, an der man den einen künftig vergisst.
 */
export default {
  key: 'market',
  tier: 'optional',
  requires: ['brand'],
  hasMigrations: true,
  apiPrefixes: ['/api/market'],
  title: { en: 'Market comparison', de: 'Marktvergleich' },
  description: {
    en: 'Puts your brand foundation next to what competitors publicly say — field by field, every statement with a quote and its source.',
    de: 'Stellt eure Brand Foundation neben das, was Wettbewerber öffentlich sagen — Feld für Feld, jede Aussage mit Zitat und Quelle.',
  },
  icon: 'i-ph-compass',
} satisfies ProductManifest
