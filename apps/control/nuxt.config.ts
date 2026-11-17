// Diese App ist die BETREIBER-KONSOLE und antwortet seit AH-4 (2026-08-11) auf
// admin.pukalani.app. Der ALTNAME control.pukalani.app fällt seit AH-4b
// (2026-08-18) in die Wildcard-Site platform und antwortet 404.
// NAMENS-LAGE seit AH-4b/AH-4c (beide 2026-08-18): ploi-Site, Verzeichnis,
// Zertifikat, pm2-Prozess (adminpukalaniapp) UND das Appwrite-Projekt heißen
// wirklich `admin` (Cookie a_session_admin; Projekt-Umzug per
// docs/archiv/ADMIN-PROJEKT-CUTOVER.md, Alt-Projekt `control` eingefroren).
// Den Namen `control` behalten NUR noch: Ordner (apps/control),
// Workspace-Paketname und Release-Slot (releases/control). Eine Umbenennung
// des Ordners nach apps/admin wurde am 2026-08-17 geprüft und VERWORFEN:
// `admin` ist als geteilter Dashboard-Layer packages/admin vergeben.
export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  // feedback + tickets sind mit E10 (Davids Entscheidung 7, 2026-07-30) HIER
  // eingezogen und in apps/comments ausgezogen: die Rückmeldungen aller
  // Communities laufen beim Betreiber auf, nicht in einer Kunden-Silo-App.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/control', '../../packages/feedback', '../../packages/billing', '../../packages/tickets', '../../packages/runner', '../../packages/pages', '../../packages/core', '../../packages/system'],

  modules: [
    // Interne Projekt-Doku (/docs) — Quelle ist docs/content/** (content.config.ts).
    '@nuxt/content',
    // Inline-Modul: nimmt @nuxt/contents `prerender: true` für den SQL-Dump
    // WIEDER ZURÜCK. Sonst landet die komplette interne Doku als statische
    // Datei in `.output/public/__nuxt_content/**` — statische Assets werden vor
    // der Server-Middleware ausgeliefert, der Bereich wäre also trotz Guard
    // öffentlich lesbar. Ohne Prerender bedient der node-Preset-Handler den
    // Dump zur Laufzeit — und der läuft durch server/middleware/docs-guard.ts.
    (_options, nuxt) => {
      nuxt.hook('modules:done', () => {
        nuxt.options.routeRules ||= {}
        for (const [route, rule] of Object.entries(nuxt.options.routeRules)) {
          if (route.startsWith('/__nuxt_content/')) {
            nuxt.options.routeRules[route] = { ...rule, prerender: false }
          }
        }
      })
    },
  ],

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

  // Port pro App eindeutig vergeben (Konvention: 3001 comments, 3002+ weitere)
  devServer: {
    port: 3004,
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },

  nitro: {
    prerender: {
      // Gürtel + Hosenträger zum Inline-Modul oben: selbst wenn eine künftige
      // @nuxt/content-Version die Route anders anmeldet, wird unter
      // /__nuxt_content/ nichts vorgerendert (= nichts öffentlich abgelegt).
      ignore: ['/__nuxt_content'],
    },
  },
})
