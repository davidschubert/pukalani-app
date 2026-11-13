export default defineAppConfig({
  pukalani: {
    // homeUrl: der Ausweg von einem unbekannten Wildcard-Host (C12b) — diese
    // App bedient `*.pukalani.app`, also landen hier alle Vertipper.
    brand: { name: 'Pukalani', homeUrl: 'https://pukalani.app' },
    /**
     * BESUCHERSTATISTIK ALS SELBSTBEDIENUNG (2026-08-04, Layer `analytics`).
     *
     * Bewusst OHNE `src`/`domain`: diese App bedient jeden Mandanten-Host, und
     * eine gebaute Config kann pro Host nichts Eigenes sagen — ein `src` hier
     * würde die Besuche aller Communities ununterscheidbar in denselben Topf
     * werfen. Gemessen wird nur, wo der Owner es unter /dashboard/community/analytics
     * verlangt hat; ohne das wird KEIN Script geladen.
     *
     * EINE SAMMEL-SITE FÜR ALLE POOL-COMMUNITIES (v2, 2026-08-04 — Davids
     * Entscheidung nach der Prüfung der CE): die Plausible-CE hat keine
     * Sites-API (Enterprise-only, am Quellcode nachgesehen), wir können beim
     * Aktivieren also keine Site je Community anlegen. Statt den Owner weiter
     * auf eine Id warten zu lassen, die nur David von Hand erzeugen kann,
     * tracken alle Communities in `communities.pukalani.app` — „Aktivieren" ist
     * damit ein Schalter in unserer eigenen Tabelle.
     *
     * GETRENNT WIRD BEI DER ABFRAGE, nicht beim Speichern: unsere Stats-Route
     * filtert die Sammel-Site auf `event:hostname` = Host der Community
     * (server/api/analytics/stats.get.ts). Der bewusst gezahlte Preis: in
     * Plausible selbst liegen die Zahlen in einem Topf — die Konsole dort ist
     * Betreiber-Werkzeug, Kunden sehen ihre Zahlen im Dashboard.
     *
     * Eine EIGENE Plausible-Site bleibt möglich (Feld „Erweitert") und schlägt
     * den Schalter — core/shared/analyticsScript.ts, `effectiveScriptId`.
     *
     * Plausible ist cookielos und speichert nichts Personenbezogenes — deshalb
     * bleibt `pukalani.consent` weiter aus (kein Banner).
     */
    analytics: {
      enabled: true,
      provider: 'plausible' as const,
      instance: 'https://plausible.hawaii.studio',
      shared: {
        scriptId: 'pa-nw6c94JiRWqzOc-zDcn1a',
        siteId: 'communities.pukalani.app',
      },
    },
    // Demo-Community „Morgenlicht" (Tagesliste 2026-07-26): der Banner macht
    // auf diesen Hosts sichtbar, dass Inhalte Beispiel-Material sind; der CTA
    // führt in den Self-Service-Trichter.
    demo: {
      hosts: ['demo.pukalani.app'],
      // AH-1: der Trichter hat keinen eigenen Host mehr — er liegt unter
      // `/start` auf dem Kundenbereich.
      ctaUrl: 'https://account.pukalani.app/start',
    },
    // Chrome-Registry (S9): der Operator-Changelog (admin-Layer schaltet
    // WhatsNew-Button + Footer-Link per Default an) ist KEIN Tenant-Inhalt —
    // auf Kunden-Hosts bleiben beide aus (Map-Override, `false` = ab).
    chrome: {
      utilities: {
        whatsNew: false,
      },
      changelogLink: false,
      /**
       * Community-Switcher im Dashboard-Kopf (F50, 2026-08-07). Genau hier
       * gehört er hin und nirgends sonst: diese App bedient JEDEN
       * Mandanten-Host des Pools, sie zieht den onboarding-Layer (also die
       * beiden Routen, die das Menü braucht), und nur hier kann ein Mensch
       * überhaupt in mehr als einer Community ein Team-Mitglied sein.
       */
      communitySwitcher: true,
    },
    // Footer-Fallback (Davids Entscheidung 5, 2026-07-27): Kunden pflegen
    // Impressum/Datenschutz als CMS-Seiten (Legal-Slugs → Footer); solange
    // ein Tenant (z. B. die Demo Morgenlicht) keine hat, verlinkt der Footer
    // das Betreiber-Impressum auf pukalani.app (externer Link).
    legalLinks: [
      { to: 'https://pukalani.app/imprint', labelKey: 'legal.imprint' },
    ],
    /**
     * VERHALTENSREGELN AUCH FÜR BESTANDSKUNDEN (F1, Davids Entscheidung 2 vom
     * 2026-08-04). Hier gehören die Seiten einer COMMUNITY — fehlt ihr die
     * Regeln-Seite (angelegt vor Stufe 2, gelöscht, importiert), zeigen die
     * öffentlichen Routen die Vorlage und das Dashboard bietet sie zum
     * Bearbeiten an. In `control` bleibt der Schalter aus: dort sind die
     * Seiten die des Betreibers.
     */
    pages: { guidelinesFallback: true },
    // KI-Assist (Moderation) ist als Gate AN — wirksam wird es erst, wenn
    // ein Schlüssel hinterlegt ist (isAiConfigured prüft beides: Konsole oder NUXT_AI_KEY). Demo-
    // Entscheidung „alle Produkte an" (David, 2026-07-26).
    ai: { enabled: true },
    // Strukturierte 5xx-Logs + Client-Error-Inbox — auf der Multi-Tenant-App
    // ohnehin überfällig (der platform-.env-Ausfall wäre damit im Log
    // sofort benannt gewesen statt nur als generischer 500 sichtbar).
    observability: { enabled: true },
    /**
     * ANMELDUNG (F37, 2026-08-02) — beides war im Silo an und im Pool aus.
     *
     * `otp`: der passwortlose Code-Login. Reiner Anzeige-/Routen-Schalter der
     * App; die Voraussetzung liegt im Appwrite-Projekt `pool` („Auth →
     * Settings → Email OTP") und beim SMTP der Instanz. Fehlt eines davon,
     * endet der Weg NICHT mehr in einem generischen Fehler: die Route
     * antwortet 503 `otp_unavailable` und die Anmeldeseite sagt „hier gerade
     * nicht verfügbar, nimm dein Passwort" (core/shared/authMethodAvailability.ts).
     *
     * `embedSession`: der Popup-Handoff, mit dem ein Angemeldeter IM iframe
     * kommentieren kann (CHIPS-partitioniertes Cookie). Gehört zwingend zum
     * Embed-Produkt unten — und zur Herkunftsprüfung, die seit SEC-004
     * Stufe 2 im Core für jede App gilt (kein Schalter mehr).
     */
    /**
     * `providers: ['google']` sagt nur „diese App BIETET Google an" — wirksam
     * wird der Knopf erst, wenn die Instanz auch die Credentials hat
     * (NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google in der Server-.env, U14).
     * Beides muss stehen; so bleibt der Knopf auf Dev/CI/Playground, die
     * diese Config erben, ohne Env-Schalter unsichtbar statt tot.
     */
    auth: { otp: true, embedSession: true, providers: ['google'] },
    // HERKUNFTSPRÜFUNG: gilt seit SEC-004 Stufe 2 im Core für JEDE App, ohne
    // Schalter. Für diese App wichtig: unter der Wildcard `*.pukalani.app` ist
    // jeder Mandanten-Host same-site zu jedem anderen, und das Embed-Cookie
    // ist `SameSite=None`. Warum der Embed-Fluss trotzdem durchgeht:
    // core/server/utils/csrfOrigin.ts.
    comments: {
      // Moderations-Demo: ab 3 offenen Meldungen verschwindet ein Kommentar
      // automatisch aus der öffentlichen Ansicht (zweiphasiges Hide).
      autoHideReports: 3,
      /**
       * DAS WIDGET IM POOL (F37, Davids Entscheidung 2026-08-02).
       *
       * Die Technik war längst mandantenfähig (`embed_sites` trägt communityId,
       * comments-015/016; die Datentür scopet Liste, Anlage und Löschung), und
       * die Landing verkauft das Einbetten als Teil von „Diskussionen" — nur
       * der Schalter fehlte. Jetzt kann jede Community ihr Widget auf ihrer
       * eigenen Website einbinden.
       *
       * Wer die Einbetter registriert: der OWNER, über `community.embed` —
       * seit U8 (2026-08-11) als Reiter des Community-Hubs unter
       * `/dashboard/community/embed` (vorher flach: `/dashboard/embed`).
       * Bis F37 verlangte diese Seite `system.manage` — ein Instanz-Label,
       * das kein Kunde je trägt.
       *
       * `allowedOrigins` sind ZUSÄTZLICHE, statische Origins zur Registry:
       * localhost fürs Entwickeln und für die Beweis-Skripte. In Produktion
       * praktisch wirkungslos (ein „Angreifer" bräuchte die Maschine des
       * Nutzers); die echten Einbetter jeder Community kommen aus `embed_sites`
       * und gelten nur für sie.
       *
       * `guests` bleibt BEWUSST AUS (anders als im Silo) — aber seit F18
       * (2026-08-02) aus einem anderen Grund als bisher. Der alte lautete:
       * Gast-Kommentare legen Name+E-Mail eines Unbekannten in `guest_authors`.
       * Diese Erhebung ist ersatzlos gefallen, ein Gast hinterlässt jetzt nur
       * noch seinen Anzeigenamen. Was BLEIBT, ist die zweite Hälfte des alten
       * Satzes und für sich schon Grund genug: ob Fremde ohne Konto mitreden
       * dürfen, ist eine Entscheidung JEDER COMMUNITY, und dafür gibt es noch
       * keinen Schalter im Kunden-Dashboard. Hier stünde sonst der Betreiber
       * für alle Mandanten auf einmal. Im Widget kommentiert also vorerst, wer
       * sich anmeldet (Popup-Handoff, s. auth.embedSession oben).
       */
      embed: {
        enabled: true,
        allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
      },
    },
    // Mehr-Host-Betrieb: canonical/hreflang/og:url müssen den Host tragen, der
    // den Request bekommen hat. Diese App bedient JEDEN Mandanten-Host plus die
    // Kontroll-Hosts — mit der einen Env-Basis (NUXT_PUBLIC_I18N_BASE_URL)
    // zeigten sie überall auf platform.pukalani.app (Audit-Befund B1).
    // Bildmarke je Community (K2): jeder Mandanten-Host bekommt ein eigenes
    // Favicon (Kreis in seiner Theme-Farbe + Initial) aus /favicon.svg statt
    // des Nitro-Platzhalters, dazu theme-color in derselben Farbe.
    // Vorschaubild je Community (B2, Davids Entscheidung 2026-07-29): geteilte
    // Links kamen ohne Bild an. /og/<key>.png erzeugt es aus Theme-Farbe +
    // Community-Name — kein Handgriff für den Kunden, ab dem ersten Tag da.
    // App-Icon je Community (C7): wer eine Community täglich benutzt, legt sie
    // auf den Home-Bildschirm — ohne /icon/<key>.png landet dort ein
    // Screenshot der Seite statt der Bildmarke.
    seo: { originFromRequest: true, tenantFavicon: true, tenantOgImage: true, tenantAppIcon: true },
    // Stündlicher Label-Abgleich (SEC-024, 2026-11-13): erst als PROBELAUF —
    // er zählt und loggt nur. Umstellen auf 'apply' ist Davids Schritt, nach
    // einem Blick ins Log (Runbook docs/runbooks/LABEL-ABGLEICH.md).
    community: { labelReconcile: 'dry-run' },
    // DIE Multi-Tenant-App (Horizont 3): das Tenant-Gate ist hier AN — die
    // Middleware 00.tenant.ts (core) löst jeden Request-Host über den in
    // server/plugins/tenant-resolver.ts registrierten Resolver auf.
    // Unbekannte Hosts bekommen 404; Pool-Hosts arbeiten zeilen-gescoped
    // (scopeQuery/scopeRow, z. B. comments-011).
    tenancy: {
      enabled: true,
      // Der Kundenbereich (Self-Service-Onboarding, SAAS-ROADMAP #1) läuft auf
      // DEMSELBEN Deployment, ist aber kein Mandant. Der Name ist in
      // RESERVED_SUBDOMAINS gesperrt, kann also niemals Tenant-Host werden;
      // die Wildcard-DNS `*.pukalani.app` zeigt schon hierher — es braucht
      // also keine neue ploi-Site und KEIN neues Zertifikat (die Lineage-Falle
      // steht in docs/content/2.architektur/6.hosts-und-ports.md). Lokal per
      // NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=app.localhost überschreiben.
      //
      // AH-1 (Davids Entscheidung 2026-08-11): EIN Name für den Kundenbereich —
      // `account.pukalani.app`. Er trägt Anmeldung, Konto, Communities und den
      // Wizard (`/start`). Die Vorgänger `my` (Kundenbereich) und `start`
      // (Kurz-Link in den Wizard) sind abgeschaltet und stehen unten in
      // `legacyControlHosts`; `app` fiel schon am 2026-07-27. ALLE DREI bleiben
      // in RESERVED_SUBDOMAINS gesperrt — ein zurückgegebener Plattform-Name
      // ist der beste Phishing-Köder, den es gibt.
      controlHosts: ['account.pukalani.app'],
      // LEER SEIT AH-1, und das ist die Aussage: mit nur einem Kontroll-Host
      // gibt es keinen Host mehr, dessen `/` in den Trichter führt — `/` zeigt
      // die Übersicht „Deine Communities", und wer keine hat, wird von der
      // Übersicht selbst in den Wizard weitergeschickt (F12). Der Wizard bleibt
      // unter `/start` erreichbar, und ein `?code=` aus einer Einladungs-Mail
      // führt weiterhin direkt dorthin. Lokal per
      // NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=start.localhost überschreibbar.
      wizardHosts: [],
      // AH-1: die zwei abgeschalteten Namen antworten 301 auf
      // `controlHosts[0]`, Pfad und Query unverändert (core/shared/
      // legacyControlHosts.ts). Sie MÜSSEN das eine Weile: eine
      // Einladungs-Mail trägt ihren `?code=` sieben Tage, und in Bios,
      // Lesezeichen und Chat-Verläufen steht der alte Name unbefristet.
      // Env-Override: NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS.
      legacyControlHosts: ['my.pukalani.app', 'start.pukalani.app'],
      // H3-4.3 Quota (Blueprint S4): Pool-Kunden erschöpfen den geteilten
      // Server nicht. PRO PLAN gestaffelt (David-Freigabe 2026-07-23) — der
      // Tenant trägt seinen Plan (tenants.plan, control-013, Default free).
      // Silo-Tenants: kein Limit (eigenes Projekt). perDay = rollierende 24 h.
      // Plan-Rename 2026-07-26 (Davids Pricing: Basic/Personal/Pro) —
      // Zahlen unverändert, nur die Keys sind umgezogen.
      //
      // Die `events`- und `media`-Zeilen sind seit dem 2026-08-03 BESTÄTIGT
      // (Davids Freigabe zu F39; vorgeschlagen am 2026-08-02 aus F27 + F40).
      // Vorher standen die Haken zwar an den Anlegewegen, der Katalog nannte
      // aber keine Zahlen: `limits` war `undefined`, `assertPoolWriteQuota`
      // kehrte sofort zurück, die Bremse war ein No-Op. Die Herleitung steht
      // je Zeile unten — sie ist die Begründung der Zahl, nicht mehr ihr
      // Vorbehalt. Beide bleiben einzeln umstellbar ohne Code-Änderung, und
      // ohne Deploy sogar über den editierbaren Katalog `community_plans`
      // (control-014), der pro Plan VOR diesen Werten greift
      // (tenantsResolver.ts → tenant.limits).
      //
      // WAS GEZÄHLT WIRD, SIND ZEILEN — NICHT BYTES. Für `comments` und
      // `events` ist das dasselbe (eine Zeile kostet eine Zeile). Für `media`
      // ist es ein STELLVERTRETER: die Kosten sind die Datei auf der Platte.
      // Die Umrechnung steht deshalb bei der media-Zeile, und ein echtes
      // Byte-Budget bleibt eine eigene Aufgabe (OPEN-ITEMS).
      quota: {
        enabled: true,
        plans: {
          basic: {
            comments: { perDay: 200, total: 5_000 },
            // events/media stehen hier BEWUSST NICHT: `tenancy.products`
            // unten gibt Basic weder Termine noch Mediathek, die Route
            // antwortet schon vorher 404 (requirePlanProduct). Basic ist
            // zugleich der Rückfall für einen UNBEKANNTEN Plan (limitsForPlan
            // nimmt den ersten Katalog-Key) — und genau dort greift dieselbe
            // Produkt-Sperre, weil planAllowsProduct einen unbekannten Plan
            // ebenfalls auf Rang 0 setzt. Ein Loch entsteht dadurch also nicht.
          },
          personal: {
            comments: { perDay: 1000, total: 50_000 },
            // TERMINE. Eine Termin-Zeile kostet nur eine DB-Zeile; die Bremse ist gegen Weglauf (Skript, Endlos-Serie),
            // nicht gegen den Kunden. Deshalb großzügig.
            // `perDay: 50` liegt bewusst ÜBER SERIES_MAX_PER_RUN (26,
            // eventSeries.ts): eine Serien-Ausdehnung legt bis zu 26 Termine
            // in EINEM Lauf an — eine kleinere Tagesgrenze würde eine
            // legitime tägliche Serie schon beim ersten Speichern zerhacken
            // (die Expansion bricht dann sauber ab und protokolliert, aber
            // der Kunde hätte eine halbe Serie).
            // `total: 1_000`: eine wöchentliche Serie kostet 52 Termine im
            // Jahr — das ist Platz für rund zwanzig Serien-Jahre. Termine
            // werden nicht aufgeräumt, der Bestand wächst also monoton.
            // ANMERKUNG: Termine sind heute ein Pro-Produkt (s. `products`),
            // ein Personal-Kunde kommt gar nicht bis hierher. Die Zeile ist
            // die Absicherung für den Tag, an dem das Produkt herunterzieht.
            events: { perDay: 50, total: 1_000 },
            // MEDIATHEK — der einzige Posten mit ECHTEN laufenden Kosten: als einziger Layer legt sie Binärdateien auf
            // die geteilte Platte. Gemessen 2026-08-02 (OPEN-ITEMS E3): 38 GB
            // Platte, 11 GB belegt — rund 27 GB frei, und davon gehört das
            // meiste NICHT der Mediathek (Appwrite, MariaDB, Release-Slots).
            // Umrechnung: MAX_MEDIA_BYTES = 15 MB ist die HARTGRENZE je Bild,
            // nicht der Alltag; ein Handy-Foto nach Export liegt bei ~4 MB.
            //   300 × 4 MB  ≈ 1,2 GB  (Planung)
            //   300 × 15 MB ≈ 4,5 GB  (böswilliges Extrem)
            // Zielgruppe: eine Vereins-Galerie mit Vereinsfest und
            // Jahresrückblick ist bei 100–300 Bildern schon üppig, ein Coach
            // kommt mit 50 aus. `perDay: 50` bremst den Massen-Import (ein
            // Ordner Urlaubsbilder auf einmal), nicht das tägliche Arbeiten.
            media: { perDay: 50, total: 300 },
          },
          pro: {
            comments: { perDay: 5000, total: 250_000 },
            // Gleiche Herleitung, eine Größenordnung darüber:
            // `total: 10_000` Termine sind für eine Community praktisch
            // unerreichbar und fangen trotzdem eine Endlos-Serie ab.
            events: { perDay: 200, total: 10_000 },
            // 1.000 × 4 MB ≈ 4 GB Planung (Extrem 15 GB). Bewusst
            // NICHT höher: eine einzelne Community darf die geteilte Platte
            // auch im Extremfall nicht allein füllen. Wer mehr braucht, ist
            // ein Studio-/Silo-Fall mit eigener Instanz.
            media: { perDay: 200, total: 1_000 },
          },
        },
      },
      // Produkt-Zugriff pro Plan (P4, Davids Zuordnung 2026-07-26): Produkt-
      // Key → Mindest-Plan. Nicht gelistete Produkte (comments, pages,
      // themes-Katalog, Moderation) sind Basic = frei. KI zählt als Pro-
      // Produkt (kostet uns pro Aufruf); Events/Courses folgen bei GA.
      products: {
        posts: 'personal',
        ai: 'pro',
        events: 'pro',
        courses: 'pro',
        // Bestätigt am 2026-08-03 (Davids Freigabe zu F39).
        // Begründung: die Mediathek legt BINÄRDATEN auf die geteilte Platte
        // (als einziger Layer) und kostet damit laufend Speicher — deshalb
        // nicht in Basic. Der Activity-Feed ist Grundfunktion: er zeigt nur,
        // was ohnehin passiert ist, und ohne ihn wirkt eine frische Community
        // tot. Beide Zeilen bleiben einzeln umstellbar, ohne Code-Änderung.
        media: 'personal',
        // 'basic' ist der niedrigste Plan-Key (quota.plans oben) und damit
        // ein bewusstes „für alle" — die Zeile steht trotzdem hier, damit die
        // Zuordnung eine ENTSCHEIDUNG ist und nicht das Fehlen einer.
        activity: 'basic',
        // Besucherstatistik (2026-08-04): ab Personal. Begründung wie bei der
        // Mediathek — die Messung läuft auf UNSERER Plausible-Instanz, jede
        // zusätzliche Site kostet dort laufend Speicher und Rechenzeit
        // (ClickHouse). Eine Basic-Community bekommt deshalb kein Script; die
        // Zeile ist ohne Code-Änderung umstellbar.
        analytics: 'personal',
        // Private Nachrichten (2026-08-05): ab Personal, und die Begründung
        // ist keine Preisstrategie, sondern eine Abhängigkeit — ohne den
        // posts-Layer gibt es keine `member_counters`, ohne Zähler keine
        // Vertrauensstufe, ohne Stufe keinen Absender. Ein PN-Produkt in
        // einem Basic-Tarif ohne posts wäre ein Menüpunkt, den niemand
        // benutzen kann (Konzept § 8, Entscheidung 7).
        messages: 'personal',
        /**
         * Eigene Domain (control-035, 2026-08-07): **ab Pro** — Davids
         * Entscheidung 1, nicht neu verhandelbar.
         *
         * DIESE ZEILE GATET NUR DIE SICHTBARKEIT (`useTenantPlan().planAllows`
         * blendet die Einstellungs-Seite ein). Durchgesetzt wird die Grenze im
         * CONTROL PLANE, das die `communities`-Zeile besitzt und den Plan aus
         * ihr liest (`CUSTOM_DOMAIN_MIN_PLAN`, packages/control/shared/
         * customDomain.ts) — dort ist die Autorität, hier die Anzeige.
         *
         * Dass beide Orte dieselbe Zahl nennen müssen, ist eine echte
         * Doppelpflege und deshalb an einen Test genagelt
         * (packages/control/tests/customDomain.test.ts liest DIESE Datei).
         */
        customDomain: 'pro',
      },
    },
  },
  ui: {},
})
