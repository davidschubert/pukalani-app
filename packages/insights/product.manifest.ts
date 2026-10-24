import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * Brand Insights — der redaktionelle Bereich von branding.supply: Markenprofile
 * fremder Marken, Brand-Duelle, Artikel und Rankings, jede Aussage mit Quelle.
 * Plan: docs/plans/BRAND-INSIGHTS.md (Konzept ENTSCHIEDEN 2026-09-08, die acht
 * Entscheidungen in §11; Frage 1 = „eigener Layer `insights`").
 *
 * STAND: **PAKET I5a** (§9.9) — der Layer ist MONTIERT, hat ein SCHEMA, seine
 * REDAKTION, seinen THEMENRADAR, seine ÖFFENTLICHEN SEITEN und seit I5a das
 * SAMMELN des Newsletters. `apps/branding/site.manifest.ts` führt ihn zwischen
 * `market` und `pages`, seine Tabellen (`insights_posts`, `insights_brands`,
 * `insights_corrections`, `insights_topics` und seit I5a
 * `insights_subscribers`, Migration insights-006) stehen im BRANDING_SOLL des
 * Paritäts-Wächters, der Vertrag
 * zum brand-Layer liegt in `server/contracts/brandContract.ts`, und es gibt
 * `/dashboard/insights` (Liste, Editor, Marken, Korrekturen, Radar) samt
 * `/api/insights/**` — inklusive der zwei Modell-Läufe (Übersetzen, Entwurf)
 * hinter Kill-Switch und Drossel und des Themenradars hinter seinem eigenen
 * Gate (API-Schlüssel, §9.6).
 *
 * ZWEI RIEGEL ENTSCHEIDEN, WAS DAVON DRAUSSEN STEHT, und beide sind eine
 * Config-Zeile: `publicFormats` (Default nur `article` — die Anwaltsantworten
 * BI1-3 und BI1-4, §6/§11.3) und `newsletter.enabled` (Default `false` — die
 * Rechtstexte BS1 R2/R3, „erst Text, dann Schalter").
 *
 * Was I5a BEWUSST NICHT baut: den VERSAND einer Ausgabe und die Betreiber-
 * Liste der Eintragungen im Dashboard. Beides ist **I5b** — eine Route ohne
 * Aufrufer wäre eine Zusage ohne Einlösung.
 *
 * `hasMigrations: true` seit I1: der Layer steht damit in der LAYER_ORDER von
 * `scripts/migrate.mjs` (`pnpm check:manifests` erzwingt beides zusammen) und
 * seine Tabellen im BRANDING_SOLL von
 * `scripts/ops/verify-schema-parity.mjs`. Das GATE davor bleibt Davids Ja zur
 * PROD-Migration — der Code darf gebaut sein, gefahren wird sie erst auf sein
 * Wort (CLAUDE.md).
 *
 * `apiPrefixes: ['/api/insights']` seit I1. Es steht VOR der ersten Route,
 * und das ist Absicht statt Nachlässigkeit: das Präfix ist die
 * Notabschaltung (§9.1 Nr. 3) — `app_config.products.insights.enabled =
 * false` ⇒ 404 für die ganze Redaktion, ohne dass ein Handler davon weiss.
 * Solange es keine Route gibt, trifft die Middleware
 * (`core/server/middleware/04.product-gate.ts`) schlicht nichts; ein
 * fehlender Eintrag dagegen wäre eine Route ohne Schalter, sobald I2 die
 * erste anlegt. EIN Präfix und nicht mehrere, damit die Abschaltung alles
 * darunter trifft und niemand den zweiten Eintrag vergessen kann. Damit die
 * Zusage greift, registriert `server/plugins/product-manifest.ts` dieses
 * Manifest zur Laufzeit — ohne diese Zeile kennt die Registry das Produkt
 * nicht, und `apiPrefixes` wäre ein Versprechen ohne Wirkung.
 *
 * `requires: ['brand']` ist die Bedingung und nicht die Höflichkeit: Score,
 * Band, Farbwelt, Archetyp-Katalog, Branchen-Katalog, die Slug-Regel und der
 * SSRF-feste Abruf kommen aus dem brand-Layer (§9.1 Nr. 2) — über GENAU EINEN
 * Vertrag in `server/contracts/`, nie über `server/utils/` (Nitro
 * auto-importiert das Verzeichnis; ein Re-Export dort stünde zweimal im
 * Auto-Import, und der spätere Layer gewönne).
 *
 * `tier: 'optional'`: das Manifest kennt nur `foundation | optional`. Insights
 * ist kein Fundament — eine App ohne den Layer verliert eine Redaktion, kein
 * Gerüst.
 *
 * Der Prototyp lebt weiter im `.playground` (Punkt-Ordner erfasst weder der
 * Manifest-Scan noch ein `extends`).
 */
export default {
  key: 'insights',
  tier: 'optional',
  requires: ['brand'],
  hasMigrations: true,
  apiPrefixes: ['/api/insights'],
  title: { en: 'Brand Insights', de: 'Brand Insights' },
  description: {
    en: 'The editorial desk: brand profiles, duels, articles and rankings about brands we do not own — every statement with its source.',
    de: 'Der redaktionelle Bereich: Markenprofile, Duelle, Artikel und Rankings über fremde Marken — jede Aussage mit ihrer Quelle.',
  },
  icon: 'i-ph-newspaper',
} satisfies ProductManifest
