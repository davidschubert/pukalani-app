/**
 * OBERGRENZEN FÜR DAS SKRIPT-GEWICHT DER STARTSEITE (Q22) — die EINE Liste.
 *
 * Wert = Stand nach Q22 (2026-11-21, gzip) plus rund 5 % Puffer. Wer die
 * Grenze reißt, hat etwas in den Einstieg gezogen, das jede Seite lädt —
 * erst nach dem Grund fragen (ein fester Import, der `defineAsyncComponent`
 * sein könnte?), dann erst die Zahl heben, mit Begründung in dieser Datei.
 *
 * `roots` sind Schlüssel aus dem Client-Manifest: die Startseite und ihr
 * Layout (`definePageMeta({ layout })`; ohne Layout nur die Seite).
 * Geprüft wird nach jedem Build im Ausliefern (`.github/workflows/deploy.yml`)
 * und lokal mit `pnpm check:page-weight --app <name>` nach `pnpm --filter
 * <name> build`.
 *
 * branding und platform seit PERF-006 Paket 2 (Bahn 5, 2026-11-21): vorher
 * 383 bzw. 376 KB; „Neue Marke" in der Kopfzeile (zog den Wizard-Katalog) und
 * der Kommentar-Block der Community-Startseite laden jetzt erst bei Bedarf —
 * 305 bzw. 313 KB, Grenze wieder plus rund 5 %. Reißt eine der zwei Grenzen,
 * zuerst `BwSiteNav` (fester Import?) bzw. `apps/platform/app/pages/index.vue`
 * ansehen.
 */
export const PAGE_WEIGHT_BUDGETS = {
  marketing: { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 295 },
  help: { roots: ['pages/index.vue'], maxScriptGzipKB: 300 },
  portfolio: { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 258 },
  branding: { roots: ['pages/index.vue', 'layouts/default.vue'], maxScriptGzipKB: 320 },
  platform: { roots: ['pages/index.vue', '../../../packages/blueprint/app/layouts/default.vue'], maxScriptGzipKB: 329 },
}
