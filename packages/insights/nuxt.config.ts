/**
 * insights-Layer — Brand Insights (Plan: docs/plans/BRAND-INSIGHTS.md).
 *
 * STAND: **PAKET I4**. Der Layer hat sein Schema (I1), seine Redaktion (I2)
 * und seit I4 den THEMENRADAR: `server/api/insights/**` (Liste,
 * Editor-Kontext, Speichern, Zustands-Gate, Beleg-Ampel, Übersetzen,
 * KI-Entwurf, Marken, Radar + Radar-Lauf), `app/pages/dashboard/insights/**`
 * (Liste, Editor, Radar) und die Sweeps (Fristen, Radar). Was hier BEWUSST
 * noch fehlt: die ÖFFENTLICHEN Seiten (`/insights`, `/brands/…`, …) — sie sind
 * Paket I3 und hängen an den Anwaltsantworten (§6, §11.3).
 *
 * ── KEIN `extends`, UND ZWAR AUCH NICHT AUF `brand` ──────────────────────
 * `requires: ['brand']` im Manifest heisst NICHT `extends`. Der Layer hängt am
 * brand-Layer über einen EXPLIZITEN Vertrag (CONCEPT A14, Plan §9.1) — den
 * zieht I1, und er wird in `server/contracts/` liegen. Bis dahin importiert
 * hier NICHTS aus einem anderen Layer, und das ist im Prototyp prüfbar: die
 * Komponenten nehmen alles, was dem brand-Layer gehört, als Prop oder als
 * SLOT herein (der Score-Ring `BwScoreRing` etwa — dasselbe Muster wie
 * `MkBrandScore` im market-Layer). Ein `<BwScoreRing>` mitten in einer
 * `In*`-Komponente wäre genau die stille Auto-Import-Kopplung, die CLAUDE.md
 * verbietet: in einer App mit `insights` ohne `brand` bliebe sie leer, ohne
 * dass es jemand merkt.
 *
 * ── KEIN EIGENES STYLESHEET ─────────────────────────────────────────────
 * Die Optik ist der Token-Satz `.bw-root` aus
 * `packages/brand/app/assets/css/brand.css`. Zwei Token-Sätze für dieselbe
 * Marke wären zwei Wahrheiten über dieselbe Farbe — der Prototyp erbt sie über
 * das `extends` seines Playgrounds, die Umsetzung später über die App.
 *
 * DER KOMPONENTEN-PRÄFIX `In` STEHT IM DATEINAMEN, nicht in einer
 * `components`-Angabe — dieselbe Lösung wie `Bw*` (brand) und `Mk*` (market).
 * Eine `prefix`-Angabe zusätzlich zum Dateinamen ergäbe `InInPostCard`.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * server-only! Env-Mapping: `NUXT_INSIGHTS_YOUTUBE_KEY` — der
     * YouTube-Data-API-v3-Schlüssel des Themenradars (BI1 I4, §9.6).
     *
     * ── WARUM NICHT UNTER `public` ──────────────────────────────────────
     * Dieselbe Lage wie beim Plausible-Schlüssel im analytics-Layer: der
     * Schlüssel steht bei Google auf UNSERER Rechnung. Im Client-Bundle wäre
     * er die Erlaubnis für jeden Besucher, unser Tagesbudget von 10.000
     * Einheiten in einer Minute zu verbrauchen — und der stille Schaden wäre
     * nicht die Rechnung, sondern der nächtliche Lauf, der dann mit
     * „quotaExceeded" ausfällt.
     *
     * Die Data-API nimmt ihn als QUERY-PARAMETER. Er steht damit in jeder
     * aufgerufenen Adresse, und `fetch` setzt Adressen in seine
     * Fehlermeldungen — deshalb geht KEIN Fehlertext dieses Layers ungefiltert
     * in ein Log (`insightsYoutubeSafeMessage` in `shared/insightsYoutube.ts`).
     *
     * ── LEER IST EIN ERLAUBTER ZUSTAND, UND ZWAR FAIL-CLOSED ────────────
     * Der Schlüssel ist eines der drei Gates aus §11.3 und heute NICHT auf dem
     * Server. Ohne ihn tut der tägliche Sweep NICHTS (und sagt es einmal je
     * Prozess als `insights.radar_unconfigured`), die Lauf-Route antwortet 503
     * mit `code: 'not_configured'`, und die Radar-Seite zeigt eine Warnung mit
     * dem Namen der Env-Zeile. Was NICHT passiert: ein halber Lauf, eine
     * Tabelle mit Bruchstücken oder eine Fehlermeldung, die nach einem Defekt
     * aussieht. Der Env-Wächter (`scripts/ops/verify-site-env.mjs`) führt die
     * Zeile trotzdem als PFLICHT für `branding` — er ist bis zu Davids Eintrag
     * bewusst rot, weil ein still nichts tuender Sweep genau die F44-Sorte
     * Loch ist.
     */
    insightsYoutubeKey: '',
    /**
     * Env-Mapping: `NUXT_INSIGHTS_YOUTUBE_BASE_URL` — NUR für den lokalen
     * Beweis.
     *
     * Der Radar lässt sich sonst ohne echten Schlüssel und ohne echte Quota
     * nicht am Stück klicken. Mit dieser Zeile zeigt er auf einen kleinen
     * Stub-Server, der dieselben drei Antwortformen liefert — dasselbe Muster
     * wie der George-Dev-Stub im brand-Layer. In PROD wird sie NICHT gesetzt,
     * und sie steht deshalb auch nicht in der Pflichtliste des Env-Wächters:
     * ein Wächter, der eine Dev-Hilfe anmahnt, erzieht zum Weglesen.
     */
    insightsYoutubeBaseUrl: 'https://www.googleapis.com/youtube/v3',
  },

  /**
   * DAS INHALTSVERZEICHNIS DES ARTIKELS BRAUCHT DIESEN SCHALTER (§9.5).
   *
   * `InArticle` trägt sein sticky Verzeichnis in einem `UContentToc` — samt
   * Scrollspy, der damit MITGELIEFERT kommt statt handgebaut zu werden (der
   * Klickdummy hat ihn noch selbst gerechnet). Nuxt UI registriert die
   * Content-Komponenten NUR mit diesem Schalter oder mit installiertem
   * @nuxt/content; ohne ihn bleibt `<UContentToc>` ein unaufgelöstes Element:
   * leere Spalte, im Browser eine Vue-Warnung, KEIN Build- und KEIN Typfehler
   * (im brand-Playground am 2026-09-05 live erwischt).
   *
   * Er steht deshalb im LAYER und nicht im Playground: sonst funktionierte
   * der Prototyp und die spätere App nicht — und zwar lautlos. Der brand-Layer
   * setzt denselben Schalter; zweimal `true` ist kein Konflikt.
   */
  ui: {
    content: true,
  },

  // Layer-stores gibt es (noch) keine; die Locales schon: sie mergen über den
  // gleichen Sprachcode mit Core-, brand- und App-Katalog.
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
