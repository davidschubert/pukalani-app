export default defineNuxtConfig({
  // Öffentliche Hilfe-Site für Community-Betreiber — LIVE auf
  // help.pukalani.app (seit 2026-07-27, Deploy-Kette s. site.manifest.ts).
  // Bewusst KEIN admin/themes/comments: die Seite ist öffentlich, liest
  // nichts aus Appwrite und rendert ausschließlich Markdown aus `content/`.
  // Das Fundament (core + system) liefert Fehlerseite (CoreErrorPage),
  // Security-Header, Rate-Limits und i18n; der marketing-Layer (Davids
  // Entscheidung 2026-08-18) liefert die Marken-Chrome — MarketingHeader
  // (inkl. Resources-Menü), MarketingFooter und die puka-Farbwelt. Seine
  // Links lösen hier über den Layer-Default `pukalani.marketing.home: false`
  // als absolute URLs auf pukalani.app auf.
  extends: ['../../packages/marketing', '../../packages/core', '../../packages/system'],

  // @nuxt/ui, @pinia/nuxt und @nuxtjs/i18n kommen aus dem Core-Layer.
  modules: ['@nuxt/content'],

  // Schrift-Kontrast der Hilfe (Q07): blasse Textfarben und die Sonne als
  // Schrift — Begründung und Werte in der Datei, Wächter in
  // tests/helpContrast.test.ts.
  css: ['~/assets/css/help.css'],

  // Port pro App eindeutig (3001 comments · 3002 template · 3003 photos ·
  // 3004 control · 3005 portfolio · 3006 platform · 3007 marketing).
  // 3005 war in der Tagesliste genannt, ist aber von portfolio belegt.
  devServer: {
    port: 3008,
  },

  /**
   * KEINE routeRules mehr für `/anleitung/produkte/diskussionen`.
   *
   * Die Seite über den Kommentar-Baustein hieß bis zum 2026-08-04
   * „Diskussionen"; die Umbenennung nach `/anleitung/produkte/kommentare` ließ
   * am selben Tag einen 301 auf dem alten Pfad zurück. Wenige Stunden später
   * bekam das ECHTE Produkt Discussions seine Hilfe-Seite — und die gehört
   * laut Davids Entscheidung genau dorthin.
   *
   * Beides gleichzeitig geht nicht: eine routeRule gewinnt gegen die Seite, der
   * 301 hätte die neue Seite unerreichbar gemacht. Die Wahl fiel auf die Seite,
   * weil der Pfad den ZUTREFFENDEN Inhalt tragen soll — der Umweg war einen
   * halben Tag alt, die interne Verlinkung zeigt längst auf `kommentare`, und
   * wer über einen alten externen Link hereinkommt, findet oben auf der neuen
   * Seite einen Hinweis samt Link auf die Kommentare. Ein 301 auf eine Adresse,
   * unter der seither ein anderes Produkt erklärt wird, wäre die schlechtere
   * Lüge.
   */
  routeRules: {
    // Die englischen Adressen `/en/...` waren vom 2026-08-15 bis zum
    // Sprach-Tausch am 2026-08-18 öffentlich, beworben und indexiert. Seit dem
    // Tausch liegt Englisch an der Wurzel — die alten Adressen bekommen
    // deshalb einen 301 dorthin, statt ins Leere zu laufen.
    '/en': { redirect: { to: '/', statusCode: 301 } },
    '/en/**': { redirect: { to: '/**', statusCode: 301 } },
  },

  content: {
    build: {
      markdown: {
        toc: { searchDepth: 1 },
      },
    },
    experimental: {
      // node:sqlite (Node 22.5+) — kein nativer better-sqlite3-Build nötig
      sqliteConnector: 'native',
    },
  },

  /**
   * Hausmuster 'prefix_except_default' MIT ENGLISCHER VORGABE — genau wie im
   * übrigen Monorepo. Deutsch liegt unter `/de/*`.
   *
   * Bis zum 2026-08-18 stand hier `defaultLocale: 'de'`, begründet mit
   * Bestandsschutz: die deutschen Seiten lagen seit Monaten unter
   * `/anleitung/...` und waren verlinkt und indexiert. DAVIDS ENTSCHEIDUNG
   * 2026-08-18 kehrt das um — Einheitlichkeit im Monorepo schlägt
   * URL-Stabilität. Eine Site, die als einzige ihre Vorgabe-Sprache anders
   * herum führt, ist eine Sonderregel, an die sich jeder erinnern muss; das
   * kostet auf Dauer mehr als der einmalige Adress-Bruch.
   *
   * DER PREIS, BEWUSST BEZAHLT: die alten deutschen Adressen `/anleitung/...`
   * bleiben erreichbar, tragen künftig aber den ENGLISCHEN Inhalt. Das ist
   * keine Nachlässigkeit, sondern eine Folge davon, dass die Slugs in beiden
   * Sprachen dieselben deutschen Wörter sind (`erste-schritte`,
   * `mitglieder-und-rollen`) — die Adresse allein verrät die Sprache nicht,
   * ein pauschaler 301 nach `/de/...` wäre also gar nicht von den echten
   * englischen Adressen zu unterscheiden. Aufgefangen wird das durch
   * `detectBrowserLanguage` (redirectOn: 'all', Cookie `i18n_redirected`, aus
   * dem Core-Layer): wer mit deutschem Browser oder deutscher Vorwahl im
   * Cookie hereinkommt, landet auf `/de/...`.
   *
   * Die `/en/*`-Adressen aus der Zwischenzeit (2026-08-15 bis 2026-08-18)
   * antworten mit 301 auf die Wurzel — siehe `routeRules` oben.
   *
   * WARUM ÜBERHAUPT PREFIXE (gilt unverändert seit 2026-08-15): mit
   * `no_prefix` trägt jede Sprache dieselbe URL. Der Leser bekam die
   * Oberfläche in seiner Browsersprache, den INHALT aber immer auf Deutsch —
   * und `<html lang>` stand auf `en-US` über deutschem Text (2026-08-14 auf
   * help.pukalani.app gemessen). Das ist nicht nur unschön: Screenreader
   * sprechen den Text dann mit englischer Aussprache, und
   * Übersetzungsdienste lassen ihn in Ruhe, weil die Seite behauptet, er sei
   * schon englisch. Ohne Prefixe wäre die jeweils zweite Sprache ausserdem
   * für Suchmaschinen unsichtbar.
   *
   * Route und Content-Pfad bleiben deckungsgleich: die Sammlungen tragen die
   * Prefixe `/anleitung` bzw. `/de/anleitung` (content.config.ts), die
   * Seiten-Abfrage bleibt `queryCollection(x).path(route.path)`.
   */
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
    ],
  },
})
