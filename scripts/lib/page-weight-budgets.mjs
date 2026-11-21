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
 */
export const PAGE_WEIGHT_BUDGETS = {
  marketing: { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 295 },
  help: { roots: ['pages/index.vue'], maxScriptGzipKB: 300 },
  portfolio: { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 258 },
}
