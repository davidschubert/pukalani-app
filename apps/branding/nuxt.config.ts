export default defineNuxtConfig({
  /**
   * branding.supply — die eigene App des Brand-Wizards (Infra-Plan
   * docs/plans/BRANDING-SUPPLY-INFRA.md §2, Davids Entscheidung 2026-08-31).
   *
   * Früher gelistet = höhere Priorität; core + system sind das Fundament und
   * bleiben immer. Die Menge muss zum Site-Manifest passen — `pnpm
   * check:manifests` erzwingt Reihenfolge UND Menge.
   *
   * SEIT 2026-09-03 MIT `themes` + `admin` (Davids Entscheidung: „als Admin
   * der Seite einen eigenen Dashboard-Zugang, wie auf allen anderen
   * Pukalani-Websites"): die Betreiber-Konsole unter /dashboard (Changelog,
   * Nutzer, Laufzeit-Config — u. a. der brandAiEnabled-Schalter ohne ssh)
   * plus die Konto-Seiten (/dashboard/settings: Sitzungen, Sicherheit,
   * Daten). `themes` kommt mit, weil die Dashboard-Shell über
   * `DashboardUserMenu` an `useTheme()` koppelt. Die admin-Migrationen
   * (001–003, changelog) gehören auf die branding-Instanz gefahren; die
   * Soll-Liste im Schema-Parity-Wächter zieht mit.
   *
   * WEITER OHNE `blueprint`: der Kompositions-Layer zieht per `requires`
   * posts/comments/events/courses mit — vier Produkt-Layer samt Tabellen,
   * von denen der Wizard keinen einzigen anfasst (nachgesehen 2026-08-31);
   * sein Vollbild-Workspace bringt seinen Rahmen über `BwWorkspace` + das
   * eigene Layout `brand-workspace` selbst mit.
   *
   * SEIT MV1 M1 (2026-09-05) MIT `market`: der Marktvergleich (Plan
   * docs/archiv/BRAND-MARKTVERGLEICH.md) ist ein EIGENER Produkt-Layer, der
   * per `requires` an `brand` hängt und ihn über EINEN expliziten Vertrag
   * kennt (`packages/market/server/utils/brandContract.ts`, CONCEPT A14) —
   * nicht über die extends-Kette. Seine drei Tabellen (market-001…003)
   * gehören damit auf die branding-Instanz; die Soll-Liste im
   * Schema-Parity-Wächter zieht mit.
   *
   * SEIT BI1 I1 (2026-09-09) MIT `insights`: der redaktionelle Bereich (Plan
   * docs/plans/BRAND-INSIGHTS.md, Davids Entscheidung 1 in §11) ist ein
   * EIGENER Produkt-Layer — eigenes Dokument (der Beitrag), eigene
   * Zustandsmaschine (Entwurf → Redaktion → veröffentlicht), eigenes Publikum
   * (anonyme Leser statt eingeloggter Eigentümer) und ein eigener Gegenstand
   * (FREMDE Marken, nicht die des Kunden). Er hängt per `requires` an `brand`
   * und kennt ihn über GENAU EINEN Vertrag
   * (`packages/insights/server/contracts/brandContract.ts`, CONCEPT A14) —
   * nicht über die extends-Kette. Seine drei Tabellen (insights-001…003)
   * gehören auf die branding-Instanz; die Soll-Liste im Schema-Parity-Wächter
   * zieht mit. `insights` steht NACH `market` und VOR `pages`: die beiden
   * ersten kennt die kanonische EXTENDS_ORDER nicht und hängt sie in der
   * Reihenfolge des Site-Manifests ans Ende, und `pages` muss mit seiner
   * dynamischen Route `/[slug]` zuletzt bleiben.
   *
   * SEIT BS1 R1 (2026-09-07) MIT `pages`: die Rechtstexte (Impressum,
   * Datenschutz, AGB) leben als CMS-Zeilen wie auf pukalani.studio — Davids
   * Entscheidung zu Frage 1 des Plans
   * docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md. Der Grund ist der
   * Anwaltsdurchlauf: eine Korrektur ist damit eine Bearbeitung unter
   * /dashboard/pages und kein Deploy. Die sechs pages-Migrationen gehören auf
   * die branding-Instanz (Migration VOR dem Code-Deploy, §2.3 des Plans); die
   * Soll-Liste im Schema-Parity-Wächter zieht mit. `pages` steht ZULETZT unter
   * den Produkten: seine dynamische Route `/[slug]` soll die niedrigste
   * Priorität haben und keine Wizard-Seite überlagern.
   *
   * REIHENFOLGE: themes/admin vorn (kanonische EXTENDS_ORDER), dann brand,
   * dann market, dann insights, dann pages (die vier kennt die EXTENDS_ORDER nicht, sie
   * landen in der Reihenfolge des Site-Manifests am Ende der Produkte) —
   * die Werkstatt-Optik kollidiert mit keiner admin-Datei (eigene
   * Bw-Präfixe, eigene Routen); das frühere App-Layout `dashboard.vue`
   * (Ersatz-Durchreiche) ist GELÖSCHT, damit die echte Shell des
   * admin-Layers greift. Die brand-eigenen Seiten /dashboard/brands/*
   * fordern seit demselben Tag das default-Layout an (Wizard-Nav) — sie
   * sind Kunden-Fläche, keine Betreiber-Fläche.
   */
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/brand', '../../packages/market', '../../packages/insights', '../../packages/pages', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (3000–3009 vergeben — 3006 hält platform,
  // 3009 der brand-Playground; die erste Wahl 3006 kollidierte damit und ist
  // am 2026-09-01 hierher verschoben). Dev-Portkarte:
  // docs/content/2.architektur/6.hosts-und-ports.md
  devServer: {
    port: 3010,
  },

  /**
   * DIE ALTE BEISPIEL-SEITE ANTWORTET 301.
   *
   * `/beispiel/kailua-coffee` war die redaktionelle Zweitfassung des
   * Beispiel-Brandings (Paket G5, 2026-09-07). Seit Discover D5 steht dieselbe
   * Marke als ECHTE Anatomie unter `/discover/kailua-coffee-co` — aus
   * `brand_publications`, mit Steckbrief, Markenabdruck und eigenem og:image.
   * Zwei indexierbare Seiten für eine Marke sind zwei Pflegestellen und zwei
   * Kandidaten in derselben Suche; die Seite ist deshalb gelöscht und ihre
   * Adresse zeigt dauerhaft auf das Original.
   *
   * ZWEI ZEILEN, WEIL ES ZWEI ADRESSEN GIBT (i18n 'prefix_except_default'):
   * die englische ohne Prefix, die deutsche unter `/de/*`. Eine Regel `/de/**`
   * gibt es hier bewusst nicht — sie träfe jede deutsche Seite.
   * Muster: `apps/marketing/nuxt.config.ts`.
   */
  routeRules: {
    '/beispiel/kailua-coffee': { redirect: { to: '/discover/kailua-coffee-co', statusCode: 301 } },
    '/de/beispiel/kailua-coffee': { redirect: { to: '/de/discover/kailua-coffee-co', statusCode: 301 } },
  },

  // Eigene Keys der App — werden mit den Layer-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
