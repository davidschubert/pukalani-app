export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  //
  // `brand` STAND HIER und ist mit dem Rückbau vom 2026-08-31 wieder raus
  // (docs/plans/BRANDING-SUPPLY-INFRA.md §2): der Brand-Wizard lebt seit
  // Davids Kehrtwende unter seiner eigenen Marke in `apps/branding` —
  // eigene Domain, eigenes Appwrite-Projekt, eigener Konten-Stamm. Die
  // P1b-Einhängung hier war der Zwischenstand „eine Site, eine Login-Welt".
  // Kein toter Code bleibt zurück: die Routen `/api/brand/**` und die
  // P1c-Seiten ziehen MIT dem Layer um, sie lagen nie in dieser App.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/analytics', '../../packages/domains', '../../packages/pages', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 comments, 3002+ weitere)
  devServer: {
    port: 3005,
  },

  // Portfolio-Design (Syne + Glibbergreen, DNA der alten davidschubert.com) —
  // gescopet auf body.portfolio-site (site-Layout): Login/Dashboard behalten
  // den Standard-Look. Syne self-hostet @nuxt/fonts über die font-family-
  // Deklaration im CSS (Registry-Muster, kein Google-Link).
  css: ['~/assets/css/portfolio.css'],

  // KEINE globale `app.pageTransition` mehr (2026-09-08, live erwischt): mit
  // `mode: 'out-in'` blieb im Dashboard nach der ERSTEN Client-Navigation der
  // ganze Seitenbereich leer — `UDashboardPanel` hat mehrere Wurzelknoten, und
  // Vue Suspense parkt die fertig gerenderte Seite dann im versteckten
  // Container, weil die Fragment-Transition-Hooks nie „afterLeave" feuern (kein
  // Fehler, kein Log, harter Reload rendert). Der Fade gilt deshalb nur noch
  // auf der öffentlichen Site: app.vue setzt ihn je Route über `<NuxtPage
  // :transition>` (Layout `site`); das CSS ist ohnehin auf `.portfolio-site`
  // gescopet. Bisektion 2026-09-08: gleiche Versionen mit/ohne Transition.

  // SPRACHRICHTUNG GEDREHT (Content-Umzug aus dem alten Portfolio-Repo):
  // dort lag Deutsch auf `/` und Englisch unter `/en`. Hier gilt die
  // Monorepo-Konvention `prefix_except_default` — Englisch ohne Präfix,
  // Deutsch unter `/de/*`. `/en` und `/en/**` sind damit HISTORISCHE,
  // veröffentlichte und verlinkte Adressen (u. a. aus llms.txt und dem alten
  // Fußzeilen-Link) und leiten dauerhaft (301) auf ihr heutiges Gegenstück.
  // Die Quell-Muster dürfen nie mit umbenannt werden: eine Weiterleitung
  // beschreibt die Vergangenheit, nur ihr Ziel folgt der heutigen Struktur.
  routeRules: {
    '/en': { redirect: { to: '/', statusCode: 301 } },
    '/en/**': { redirect: { to: '/**', statusCode: 301 } },
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
