/**
 * control meldet seine Dashboard-Sektion bei der Admin-Modul-Registry an
 * (pukalani.admin.modules, deep-merged) — Layer-Grenze A14.
 */
export default defineAppConfig({
  pukalani: {
    control: {
      /**
       * Das geteilte Appwrite-Projekt neuer Tenants (Onboarding-Default — der
       * Betreiber tippt nur noch Name/Host, das Projekt füllt der Server).
       *
       * AH-1 (2026-08-11): heißt `account` (Anzeigename „Account"). Das
       * Vorgänger-Projekt `pool` ist nach der Migration eingefroren — eine
       * Appwrite-Projekt-Id ist unveränderlich, „umbenennen" war deshalb
       * Neuanlage + Datenumzug. Steht hier je die alte Id, legt der Wizard
       * neue Communities in der EINGEFRORENEN Instanz an, und zwar lautlos.
       *
       * Env-Override je Umgebung: NUXT_PUBLIC_CONTROL_POOL_PROJECT (lokal
       * heißt das Projekt seit dem Spiegel vom 2026-11-09 ebenfalls `account`).
       */
      defaultPoolProject: 'account',
      /**
       * FRISTEN-LAUF DER EIGENEN DOMAIN (BE-014): `off` | `dry-run` | `apply`
       * (unbekannter Wert = `off`). Layer-Default `dry-run` und NICHT `off`:
       * ein zählender Lauf schreibt nichts (auch keine Sperr-Zeile) und
       * liefert die Zahlen, auf die das Scharfschalten wartet — `off` hieße,
       * es gäbe sie nie. Scharf (`apply`) schaltet nur eine App ausdrücklich.
       */
      customDomainSweep: 'dry-run',
      /**
       * ZWEITER SICHERUNGS-LAUF (SI1 b): `active`-Zeilen in stillgelegten
       * Communities auf `removed` stellen. `off` | `dry-run` | `apply`
       * (unbekannt = `off`). Vorgabe `dry-run`: live zählt er nur (Davids
       * Ja 2026-11-21, „nur zählend"); `apply` erst mit Davids Ja zur
       * gezählten Zahl, als Zeile in der app.config der App.
       */
      disabledMembershipSweep: 'dry-run',
      // Plan-Katalog der COMMUNITY (P4-Rename 2026-07-26, Davids Pricing-Entscheid:
      // Basic 0 € / Personal 29 € / Pro 149 €, jährlich −25 %; Enterprise =
      // Studio-Angebot, KEIN Self-Service-Plan) — bewusst Code statt Table
      // (versioniert wie theme.catalog). products = VOR requires-Schluss
      // (moderation kommt z. B. über comments/posts mit); nur optional-tier
      // Produkte (foundation ist nie entitlement-gated). lookupKey =
      // Stripe-Price-lookup_key (scripts/stripe/ensure-prices.mjs legt die
      // Preise an und zieht Keys bei Betragsänderung auf neue Prices um).
      // Die Keys heißen weiterhin `workspace_*` — das sind IDENTITÄTEN bei
      // Stripe (Test- und Live-Mode), kein Wort: umbenennen hieße, die
      // angelegten Preise nicht mehr zu finden.
      plans: {
        basic: { lookupKey: null, products: ['comments', 'pages'] },
        personal: { lookupKey: 'workspace_personal_monthly', lookupKeyYearly: 'workspace_personal_yearly', products: ['comments', 'pages', 'posts', 'activity', 'feedback'] },
        pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', products: ['comments', 'pages', 'posts', 'activity', 'feedback', 'events', 'courses', 'tickets', 'media'] },
      },
    },
    admin: {
      /**
       * E9: ALLE Einträge dieses Layers sind `scope: 'operator'` — das Control
       * Plane verwaltet die Plattform, nicht eine Community. Auf einem
       * Mandanten-Host verschwinden sie deshalb vollständig (der Layer wird
       * dort ohnehin nicht extended, die Ebene ist trotzdem die richtige
       * Aussage). Gruppen nach Davids Struktur: „Plattform" = die Communities
       * und ihr Zugang, „Studio" = die Websites des Betreibers.
       */
      modules: [
        {
          // Communities · Overview — steht an erster Stelle der Plattform:
          // das ist der Bestand, alles andere führt hierher.
          //
          // U8/G2 (2026-08-11): der PFAD heißt `communities`, nicht mehr
          // `tenants`. E8 hat das Objekt umbenannt (Daten, Code, Routen), die
          // Oberfläche hat es mit U6 nachgeholt — die Adresse war das letzte
          // Stück, das noch die alte Vokabel trug. Die Registry-`id` bleibt
          // `tenants` (Protokoll, kein Anzeigetext); 301 in
          // packages/control/nuxt.config.ts.
          id: 'tenants',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.tenants',
          icon: 'i-ph-users-three',
          to: '/dashboard/communities',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 1,
        },
        {
          // Markt-Signal (U19): die Auswertung der Karte „Hilf uns, Pukalani zu
          // schärfen" — Größe, Zweck, Ziel als Verteilungen.
          //
          // Sie steht direkt HINTER den Communities, weil sie über denselben
          // Bestand spricht, nur zusammengefasst statt einzeln: erst der
          // Bestand, dann was er über den Markt sagt.
          //
          // DASS ES DIESEN EINTRAG GIBT, IST DIE HALBE ARBEIT: Davids
          // Entscheidung vom 2026-08-12 macht den definierten LESER zur
          // Bedingung des Baus — die alten Wizard-Antworten wurden erhoben und
          // nie gelesen. Wer diesen Menüpunkt entfernt, nimmt der Karte drüben
          // ihre Berechtigung.
          id: 'market-signal',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.marketSignal',
          icon: 'i-ph-chart-bar',
          to: '/dashboard/market-signal',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 2,
        },
        {
          // Die Warteschlange: wer hat Early Access angefragt, wem wurde ein
          // Code geschickt, wer hat ihn eingelöst. Steht VOR den Codes, weil
          // hier die tägliche Arbeit passiert.
          id: 'invite-requests',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.inviteRequests',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/requests',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 3,
        },
        {
          // Early-Access-Tor des Self-Service-Onboardings: hier stellt der
          // Betreiber die Codes aus, mit denen Fremde eine Community anlegen
          // dürfen. Ohne gültigen Code kommt niemand in den Wizard.
          id: 'invites',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.invites',
          icon: 'i-ph-key',
          to: '/dashboard/invites',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 5,
        },
        {
          // Missbrauchsmeldungen von außen (M13). Steht direkt hinter den
          // Anfragen, weil es dieselbe Art Arbeit ist: eine Warteschlange, in
          // der ein Mensch entscheidet — nur mit größerer Wirkung.
          id: 'abuse-reports',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.abuseReports',
          icon: 'i-ph-shield-warning',
          to: '/dashboard/abuse',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 4,
        },
        {
          // Gesperrte Namen: die Code-Basisliste (RESERVED_SUBDOMAINS) zum
          // Nachsehen plus die eigenen Einträge zum Ergänzen (control-027).
          // Steht am Ende der Plattform-Gruppe — man schaut selten hin, aber
          // wenn, dann dringend.
          id: 'reserved-names',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.reservedNames',
          icon: 'i-ph-prohibit',
          to: '/dashboard/reserved-names',
          requiredCapability: 'sites.manage',
          group: 'platform',
          order: 6,
        },
        {
          // Studio = das Kundenangebot des Betreibers (Davids Wort, nicht
          // „Instanzen"). Eigene Gruppe, weil eine Website kein Mandant ist.
          id: 'websites',
          scope: 'operator',
          productKey: 'control',
          labelKey: 'admin.nav.websites',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/websites',
          requiredCapability: 'sites.manage',
          group: 'studio',
          order: 1,
        },
      ],
    },
  },
})
