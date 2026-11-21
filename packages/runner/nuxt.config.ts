/**
 * Produkt-Layer: AI-Runner — Konzept docs/archiv/AI-RUNNER.md.
 *
 * BETREIBER-WERKZEUG, kein Kundenprodukt: der Layer läuft ausschließlich in
 * `apps/control`, alles darin ist operator-only (Capability `runner.manage`,
 * admin — bewusst OHNE moderator, § 4). Kein Mandanten-Thema, keine Datentür.
 *
 * ER KENNT `tickets` NICHT (A14) — so wie `tickets` den `feedback`-Layer nicht
 * kennt. Der Bezug auf das auslösende Objekt läuft über die zwei neutralen
 * Spalten `subjectType`/`subjectId` (heute nur `'ticket'`), NICHT über eine
 * `ticketId`; verdrahtet wird beides in der App. Sonst wäre der spätere
 * Auslöser „Roadmap-Eintrag" oder „GitHub-Issue" eine Migration.
 *
 * RATE-LIMIT: der Claim-Poll hat einen eigenen Bucket `runner:claim`
 * (30/min), deklariert — wie jeder andere — in der ZENTRALEN Tabelle
 * `packages/core/server/middleware/05.rate-limit.ts`; ein Layer deklariert
 * seine Buckets NICHT in der eigenen `nuxt.config` (dasselbe Muster wie
 * `feedback:create`, siehe Kopf von packages/feedback/nuxt.config.ts). Der
 * Grund dort ist Selbst-DoS-Schutz und nicht Spam (§ 5): ein Poll-Loop mit
 * Fehler hämmert die eigene Betreiber-Konsole, und zwar mit gültigem Secret.
 *
 * BEWUSST LEER GELASSEN:
 *  - kein runtimeConfig — das Bearer-Secret des Runners liegt GEHASHT in
 *    `runners.secretHash` (M9-Muster wie `community_invites`), nicht in der
 *    Env: es gibt je Rechner eines, und ein Env-Wert wäre weder rotierbar
 *    noch mehrfach vergebbar.
 */
export default defineNuxtConfig({
  // Eigene Layer-Strings — mergen mit Core- und App-Locales (gleiche codes).
  // `admin.nav.runner` MUSS in BEIDEN Dateien stehen: der Menüpunkt wird vom
  // admin-Layout gerendert, und vue-i18n gibt bei fehlender Übersetzung den
  // SCHLÜSSEL aus (Wächter `pnpm check:i18n-keys`).
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
