/**
 * pages meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — capability-gefiltert (A14).
 */
export default defineAppConfig({
  pukalani: {
    pages: {
      /**
       * Fehlt die Regeln-Seite, liefern die Routen die Vorlage aus und das
       * Dashboard bietet sie zum Bearbeiten an (F1, Davids Entscheidung 2 —
       * Begründung in shared/guidelinesFallback.ts, Schalter-Begründung in
       * server/utils/guidelinesFallbackGate.ts).
       *
       * Layer-Default AUS: dieser Layer läuft auch in `control`, wo der
       * BETREIBER seine eigenen Rechtstexte pflegt und Community-Regeln
       * niemanden meinen. Eingeschaltet wird er dort, wo die Seiten einer
       * Community gehören (apps/platform).
       */
      guidelinesFallback: false,
      /**
       * VERÖFFENTLICHT, ABER NOCH ENTWURF (BS1 R1, 2026-09-07) — die Slugs,
       * über denen „Entwurf, in anwaltlicher Prüfung" steht und die `noindex`
       * tragen. Die vollständige Begründung (warum eine App-Ansage und keine
       * Spalte) steht im Kopf von `shared/pageDraftNotice.ts`.
       *
       * Layer-Default LEER: portfolio, control und platform fahren diesen
       * Layer heute mit fertigen bzw. kundeneigenen Texten — sie sollen von
       * dieser Möglichkeit nichts sehen. Gesetzt wird sie in `apps/branding`
       * und dort in R3 wieder entfernt.
       */
      draftNotice: [] as string[],
    },
    // Chrome-Registry (S9): pages ist die CMS-Nav-Quelle — das blueprint-
    // Layout holt /api/pages/public NUR, wenn dieses Flag (= dieser Layer)
    // da ist. Veröffentlichte Seiten erscheinen in der Haupt-Nav, Seiten mit
    // Legal-Slugs (imprint/impressum/privacy/datenschutz) im Footer.
    chrome: {
      pagesNav: true,
      /**
       * U15: dieser Layer besitzt den Navigations-Editor UND die Route
       * dahinter (`/api/pages/navigation`). Das Flag sagt dem
       * blueprint-Layout, dass es die gespeicherte Menü-Wahl überhaupt holen
       * darf — ohne diesen Layer gibt es sie nicht, und ein Abruf ins Leere
       * kostete jeden SSR-Aufbau einen 404. Dieselbe Mechanik und dieselbe
       * Begründung wie `pagesNav` darüber.
       */
      navOverride: true,
    },
    admin: {
      /**
       * DAS MENÜ DER COMMUNITY (U15 Teil 1) — Reiter im Community-Hub.
       *
       * Der Hinweis an den Modulen unten („Navigation kommt später als
       * zweiter Eintrag dazu", E9) hat sich bestätigt und den Ort gewechselt:
       * seit F51 (2026-08-07) leben Community-Einstellungen als REITER unter
       * /dashboard/community/*, nicht als Menüpunkte. Die Gruppe „Website"
       * behält damit die Seiten-VERWALTUNG (Redaktion, `pages.manage`), das
       * Menü zieht zu den übrigen Community-Einstellungen.
       *
       * `branding.manage` (owner + admin), NICHT `pages.manage`: die
       * ausführliche Begründung steht an der Route
       * (server/api/pages/navigation.patch.ts). Kurz: wer einen Text
       * schreiben darf, soll nicht die Struktur der Website umstellen.
       *
       * `order: 25` setzt ihn direkt hinter „Erscheinungsbild" (20) — beides
       * ist Gestaltung der öffentlichen Seite, und beides verlangt dieselbe
       * Capability.
       */
      communityTabs: [
        {
          id: 'community-navigation',
          scope: 'community',
          labelKey: 'pages.navigation.navLabel',
          icon: 'i-ph-list-dashes',
          to: '/dashboard/community/navigation',
          requiredCapability: 'branding.manage',
          order: 25,
        },
        /**
         * WIE DIE COMMUNITY IN DER SUCHE ERSCHEINT (U15 Teil 2) — der zweite
         * der beiden Punkte, die der Dashboard-Audit vom 2026-08-09 als
         * Erst-Prioritäten führt (§ 5, „Settings · Website · SEO").
         *
         * Dieselbe Capability wie Menü und Erscheinungsbild, und hier ist sie
         * am wenigsten verhandelbar: der noindex-Schalter ist die
         * folgenreichste Einstellung dieser Fläche (zurück in den Index kommt
         * eine Community erst nach dem nächsten Crawl). Begründung an der
         * Route (server/api/pages/seo.patch.ts).
         *
         * `order: 26` direkt hinter das Menü (25): Erscheinungsbild, Menü und
         * Sucheintrag sind die drei Flächen, auf denen der Owner seinen
         * öffentlichen Auftritt einstellt, und sie gehören nebeneinander.
         */
        {
          id: 'community-seo',
          scope: 'community',
          labelKey: 'pages.seo.navLabel',
          icon: 'i-ph-magnifying-glass',
          to: '/dashboard/community/seo',
          requiredCapability: 'branding.manage',
          order: 26,
        },
        /**
         * WEITERLEITUNGEN (U15 Teil 3, Davids Entscheidung 2026-08-13) — die
         * alten Adressen einer Community zeigen auf die neuen.
         *
         * Dieselbe Capability wie Erscheinungsbild, Menü und Sucheintrag, und
         * hier mit dem stärksten Grund von allen: das ist die einzige der vier
         * Flächen, die einen Besucher WEGSCHICKT, bevor die Seite lädt.
         * Begründung an der Route (server/api/pages/redirects.patch.ts).
         *
         * `order: 27` direkt hinter den Sucheintrag (26). Die Reihenfolge
         * erzählt den Weg: erst wie die Community AUSSIEHT (20), dann wie man
         * sich in ihr BEWEGT (25), dann wie man sie FINDET (26), dann wo die
         * alten Wege HINFÜHREN (27).
         */
        {
          id: 'community-redirects',
          scope: 'community',
          labelKey: 'pages.redirects.navLabel',
          icon: 'i-ph-arrow-bend-up-right',
          to: '/dashboard/community/redirects',
          requiredCapability: 'branding.manage',
          order: 27,
        },
      ],
      modules: [
        {
          // E9: die Seiten SIND die Website einer Community (eigene Gruppe
          // „Website"; „Navigation" kommt später als zweiter Eintrag dazu).
          // scope 'community', weil sie einer Community gehören — im
          // Einzelbetrieb (apps/control pflegt hier seine Rechtstexte) bleibt
          // der Eintrag über das Operator-Label sichtbar.
          id: 'pages',
          scope: 'community',
          productKey: 'pages',
          labelKey: 'admin.nav.pages',
          icon: 'i-ph-file-text',
          to: '/dashboard/pages',
          requiredCapability: 'pages.manage',
          group: 'website',
          order: 1,
        },
      ],
    },
  },
})
