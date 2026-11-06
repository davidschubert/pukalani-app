export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Layer > Core).
  pukalani: {
    /**
     * DER PRODUCTS-AUFKLAPPER (PS1, 2026-09-09 — Plan
     * docs/plans/PRODUCTS-SEITE.md §6, Davids Entscheidung e).
     *
     * ── WARUM DIE EINTRÄGE HIER STEHEN UND NICHT IM brand-LAYER ───────────
     * Die fünf Kinder zeigen auf die Marketing-Seiten von FÜNF Produkten, und
     * zwei davon gehören nicht dem brand-Layer (Marktvergleich = `market`,
     * Book & Kit = noch keiner). Ein Layer darf die anderen Produkt-Layer
     * nicht kennen (CONCEPT A14); die APP kennt laut `site.manifest.ts` alle
     * ihre Produkte und ist damit die einzige Stelle, an der diese Liste
     * vollständig und richtig sein kann. Genau dafür ist `pukalani.chrome.nav`
     * eine OBJEKT-Map: der tiefe Merge ergänzt die Layer-Registry, und wo eine
     * Id doppelt vorkommt, gewinnt die App.
     *
     * ── WAS DIESE ZEILEN AM LAYER ÄNDERN ──────────────────────────────────
     * `products` bekommt sein `to` zurück: der brand-Layer trägt `to: ''` („ein
     * Wort, das nur aufklappt"), weil es bis heute keine Übersichtsseite gab.
     * Jetzt gibt es sie, und `navMenuChildren()` stellt sie als ERSTEN Eintrag
     * in den Aufklapper (core entscheidet das, damit beide Renderer es gleich
     * tun — Begründung in core/shared/communityNavigation.ts).
     * `brand-check` bekommt ein neues Ziel: im Menü steht ab jetzt die
     * PRODUKTSEITE `/products/brand-check`, nicht mehr das Werkzeug
     * `/brand-check`. Der Weg zum Werkzeug führt über den einen Knopf auf
     * dieser Seite — sonst stünde ein Produkt im Aufklapper anders da als die
     * vier anderen, ohne dass jemand das entschieden hätte.
     *
     * ── DIE SCHLÜSSEL: DREI ALTE, DREI NEUE ───────────────────────────────
     * `brand.nav.brandCheck` und `brand.nav.foundation` gibt es im brand-Layer
     * bereits in beiden Sprachen („Brand-Check", „Brand Foundation"), ebenso
     * alle fünf Beschreibungen (`brand.nav.product.*` — sie standen seit dem
     * Klickdummy ungenutzt da und lösen genau hier ihr Versprechen ein). Die
     * drei Namen, die der Layer nicht kennt, gehören der App
     * (`products.nav.*`): Marktvergleich, Brand Design, Brand Book & Kit.
     *
     * MARKTVERGLEICH IST DIE EINE AUSNAHME VON DER EIGENNAMEN-REGEL, und zwar
     * dieselbe wie beim Slug: „Marktvergleich"/„Market Comparison" ist kein
     * Eigenname, sondern ein Wort — Davids Entscheidung b vom 2026-09-09
     * übersetzt genau dieses eine (und „Produkte"). Die vier anderen heissen
     * in beiden Sprachen gleich.
     *
     * `descriptionKey` ist seit PS1 Teil des Vertrags (core/shared/types/
     * chrome.ts) und wird von `pnpm check:i18n-keys` gedeckt.
     *
     * `insights` STEHT SEIT BI1 I3 DRIN (2026-09-10) — bis dahin fehlte es
     * bewusst, weil ein Registry-Eintrag ein Menüpunkt ist, der SOFORT
     * erscheint (Davids 404-Audit 2026-09-03), und die Seite es noch nicht
     * gab. Jetzt gibt es sie: `/insights` ist die Journal-Liste des
     * insights-Layers, und sie antwortet auch bei gesperrtem Riegel nicht 404
     * (sie zeigt dann ihren leeren Zustand — genau deshalb darf sie in die
     * Navigation). Der Schlüssel `brand.nav.insights` liegt seit dem
     * Klickdummy in beiden Sprachen im brand-Layer.
     *
     * `order: 25` setzt ihn NACH dem Products-Aufklapper (10–15) und vor
     * kommende Hauptpunkte: Insights ist der redaktionelle Bereich neben den
     * Produkten, nicht eines davon — er hat deshalb auch kein `parent`.
     *
     * Ebenso fehlen Brand Experience und Brand Monitoring: sie stehen als
     * abgeblendete „kommt"-Karten auf der Übersicht, haben aber keine Seite
     * (Plan §3).
     *
     * `order` 11–15 hält die fünf Produkte beieinander und in der Reihenfolge
     * des Kundenwegs (Audit → Build → Compare → Build → Supply); die nächsten
     * Zehner bleiben für weitere Hauptpunkte frei.
     */
    chrome: {
      nav: {
        products: { labelKey: 'brand.nav.products', to: '/products', order: 10 },
        'brand-check': {
          labelKey: 'brand.nav.brandCheck',
          descriptionKey: 'brand.nav.product.score',
          icon: 'i-ph-gauge',
          to: '/products/brand-check',
          parent: 'products',
          order: 11,
        },
        'brand-foundation': {
          labelKey: 'brand.nav.foundation',
          descriptionKey: 'brand.nav.product.wizard',
          icon: 'i-ph-compass',
          to: '/products/brand-foundation',
          parent: 'products',
          order: 12,
        },
        'market-comparison': {
          labelKey: 'products.nav.marketComparison',
          descriptionKey: 'brand.nav.product.benchmark',
          icon: 'i-ph-scales',
          to: '/products/market-comparison',
          parent: 'products',
          order: 13,
        },
        'brand-design': {
          labelKey: 'products.nav.brandDesign',
          descriptionKey: 'brand.nav.product.design',
          icon: 'i-ph-palette',
          to: '/products/brand-design',
          parent: 'products',
          order: 14,
        },
        'brand-book-kit': {
          labelKey: 'products.nav.brandBookKit',
          descriptionKey: 'brand.nav.product.book',
          icon: 'i-ph-package',
          to: '/products/brand-book-kit',
          parent: 'products',
          order: 15,
        },
        insights: { labelKey: 'brand.nav.insights', to: '/insights', order: 25 },
      },
    },
    /**
     * BILDER LESEN (Brand Design, Vorbilder-Lesung — docs/archiv/BRAND-DESIGN.md
     * §2.2/§2.12): das Vision-Modell ist Davids Entscheidung vom 2026-09-08
     * (DECISION-LOG). Nur hier gesetzt, weil branding.supply der einzige
     * Konsument ist; der Core-Default bleibt leer (= aus). Der ZDR-Filter
     * (`provider.data_collection = 'deny'`) sitzt fest im Core-Transport,
     * nicht in dieser Wahl. Ein Laufzeit-Override (`app_config.aiVisionModel`)
     * ist im Core vorbereitet, die Spalte gibt es noch nicht — bis dahin gilt
     * dieser Wert.
     *
     * ── NACHGEZOGEN AM 2026-10-27, WEIL DER VORGÄNGER TOT WAR ────────────
     * Hier stand `google/gemini-2.5-flash`. Dieses Modell hat bei OpenRouter
     * **keinen ZDR-Endpunkt mehr** (sein ganzes Angebot sind heute drei
     * AI-Studio-Routen, und AI Studio ist nicht ZDR-fähig) — jeder Aufruf
     * antwortete **404 „No endpoints found matching your data policy"**,
     * während `app_config.brandAiEnabled` auf Prod AN stand. Die Lesung war
     * also nicht abgeschaltet, sie scheiterte, und zwar still: Typecheck,
     * Lint und Tests sehen davon nichts.
     *
     * Das ist dieselbe Falle wie beim Bild-Modell drei Zeilen weiter unten
     * (`…-image-preview`, 2026-09). **Ein Modell-Slug bei OpenRouter ist kein
     * Versprechen, sondern ein Angebot, das verschwinden kann.** Der Wächter
     * dagegen ist `pnpm ops:ai-models` — er prüft JEDEN hier konfigurierten
     * Slug gegen `/models?zdr=true` und braucht dafür keinen Schlüssel.
     *
     * Davids Wahl vom 2026-10-27: `gemini-3.1-flash-lite`, und zwar für Bild
     * UND Video. Begründung aus der Probe (Plan BRAND-INSIGHTS-KURATION §13):
     * es ist das einzige video-fähige ZDR-Gemini mit einem
     * `google-vertex/eu`-Endpunkt — damit trägt EIN Modell die Lesung der
     * Kundenbilder und ab K5 das Videolesen der Redaktion, auf derselben,
     * EU-gepinnten Route (`BRAND_PROVIDER_ROUTING_EU`). Belegt mit zwei
     * echten Läufen: ein 64×64-PNG korrekt beschrieben (Farben + Muster),
     * zwei YouTube-Videos korrekt ausgelesen (Bild und Ton).
     */
    ai: {
      visionModel: 'google/gemini-3.1-flash-lite',
      /**
       * BILDER ERZEUGEN (Zeichen, Stufe 3 — KI-Entwürfe, D5c): Davids
       * Entscheidung vom 2026-09-08 (DECISION-LOG). Dieselbe Anbieter-Familie
       * wie die Lesung; die ZDR-Klemme sitzt im Core-Transport `aiImage`.
       * Der zuerst genannte Preview-Slug (`…-image-preview`) hat bei OpenRouter
       * seit 2026-09 keine Endpunkte mehr („No endpoints found", echter Lauf
       * 2026-09-08) — dies ist das freigegebene Nachfolgemodell derselben
       * Familie; der Lauf unter `data_collection: deny` + `zdr` lieferte
       * vier Bilder.
       */
      imageModel: 'google/gemini-2.5-flash-image',
      /**
       * VIDEOS LESEN (BI2 K5, „Brief aus diesem Video") — dasselbe Modell wie
       * die Bildlesung, und das ist der Grund, warum es dieses ist.
       *
       * Die Routen-Probe vom 2026-10-27 (Plan BRAND-INSIGHTS-KURATION §13)
       * hat gemessen: `gemini-3.1-flash-lite` liest eine YouTube-Adresse
       * unter unserer ZDR-Klemme, Bild UND Ton, auf `google-vertex/eu`
       * gepinnt — und es ist das EINZIGE video-fähige ZDR-Gemini mit einem
       * EU-Endpunkt. Ein 25-Minuten-Video kostet rund fünf Cent, eine
       * Folgefrage im Cache-Fenster unter einem.
       *
       * Der Weg dorthin läuft über `BRAND_PROVIDER_ROUTING_EU` — der
       * Transport klemmt `data_collection: 'deny'`, der Konsument legt `zdr`,
       * `allow_fallbacks: false` und den Ort darauf.
       */
      videoModel: 'google/gemini-3.1-flash-lite',
    },
    /**
     * DER NAME, DEN DER BESUCHER SIEHT.
     *
     * `useBrandName()` im Core geht die Kette Mandanten-Name → App-Marke →
     * Rückfall „Pukalani". Diese Site ist ein Silo ohne Mandanten, also gilt
     * die App-Marke — ohne diesen Eintrag stünde im Tab-Titel und auf der
     * Fehlerseite „Pukalani", während die Domain „branding.supply" heisst.
     *
     * ACHTUNG, GETEILTER NAMENSRAUM: `pukalani.brand` trägt hier ZWEI Dinge —
     * `name`/`homeUrl` gehören dem Core (Marke der App), `enabled`/`persona`/
     * `contentLocales`/`completionCta`/`devStubGenerator` gehören dem
     * brand-Layer (Produkt-Config). Der tiefe Merge hält beide nebeneinander;
     * ein `brand: { … }` hier ERSETZT also nichts, es ergänzt.
     *
     * `pukalani.brand.devStubGenerator` ist deshalb BEWUSST NICHT gesetzt: der
     * Layer-Default ist `false`, und der Entwicklungs-Ersatz für Georges
     * Entwürfe läuft ausschliesslich im `.playground`. Ein Ersatztext, der
     * einmal in einem echten Brand-Dokument landet, ist von einem Ergebnis
     * nicht zu unterscheiden — hier streamt erst, was ein echter Generator
     * (P2, `registerBrandSlotGenerator()`) liefert.
     */
    brand: {
      name: 'Branding Supply',
      /**
       * DAS ERSTGESPRÄCH IST ZURÜCK IN DER MARKE (BS1 Z0, 2026-09-07) —
       * DESHALB STEHT HIER KEIN `completionCta` MEHR.
       *
       * Bis Z0 stand an dieser Stelle die R0-Notlösung: `type: 'url'` auf
       * `https://pukalani.studio/erstgespraech?source=branding-supply`, mit
       * `target: '_blank'`. Sie hat den 404 abgestellt und dafür einen
       * Markenbruch mitten im Trichter gekauft — wer gerade eine halbe Stunde
       * an SEINER Marke gearbeitet hatte, landete in einem neuen Tab auf einer
       * FREMDEN.
       *
       * Seit Z0 gibt es `/erstgespraech` im `brand`-Layer. Der Layer-Default
       * (`type: 'route'`, `to: '/erstgespraech'`, `labelKey:
       * 'brand.cta.book'`) ist damit für diese Site die richtige Antwort, und
       * ein Eintrag hier wäre nur eine zweite Kopie davon. Der tiefe Merge der
       * `app.config` liefert ihn unverändert durch — weglassen ist die
       * Entscheidung, nicht das Vergessen.
       *
       * WER IHN WIEDER SETZT, setzt ihn ganz: `type: 'url'` verlangt `href`
       * (nicht `to`), und ohne `target` bleibt es derselbe Tab
       * (`packages/brand/shared/brandCompletionCta.ts`).
       *
       * Die Herkunft `?source=branding-supply` ist damit ebenfalls Geschichte
       * und wird nicht gebraucht: die eigene Seite kennt ihre Herkunft aus dem
       * `?source=`-Parameter ihrer eigenen Aufrufer und legt sie in
       * `brand_intro_requests.source` ab — sie steht jetzt also in der
       * Anfrage, nicht nur in einer fremden Web-Analyse.
       */
      /**
       * WOHIN DIE ERSTGESPRÄCH-ANFRAGEN GEMELDET WERDEN (BS1 Z0).
       *
       * LEER ist der Default und heisst „keine Betreiber-Mail" — dieselbe
       * Entscheidung wie bei `waitlistNotify` daneben. Die Anfrage geht dann
       * trotzdem nicht verloren: sie steht in `brand_intro_requests` und unter
       * /dashboard/intro-calls, und der Absender bekommt seine Bestätigung.
       *
       * DAVIDS ADRESSE (gesetzt 2026-09-07: hello@branding.supply). Ein
       * erfundener Standard-Empfänger wäre schlimmer als keiner: eine
       * Zustellung ins Nichts sieht wie eine Zustellung aus.
       */
      introCallNotify: 'hello@branding.supply',
      /**
       * DIE ÖFFENTLICHE KONTAKTADRESSE (BS1 R2a/R2, David 2026-09-07):
       * dieselbe wie `introCallNotify` — die Methodik-Seite des Brand-Checks
       * nennt sie für Entfernung, Sperre und Rückfragen, statt nur aufs
       * Impressum zu zeigen. Zwei Schlüssel, weil Postfach (intern) und
       * Anzeige (öffentlich) getrennte Fragen sind.
       */
      contactEmail: 'hello@branding.supply',
      /**
       * DIE DREI RECHTSWÖRTER IM FUSS SIND SEIT BS1 R1 ECHTE LINKS
       * (2026-09-07). Bis dahin standen sie hier bewusst leer — der
       * Layer-Default lässt die Zeile dann ganz weg, weil ein Wort ohne Ziel
       * schlechter ist als kein Wort (Begründung in
       * `packages/brand/shared/brandLegalLinks.ts`).
       *
       * Die Pfade sind die Routen des `pages`-Layers (`app/pages/[slug].vue`);
       * das Sprach-Präfix legt `BwSiteFooter` per `localePath()` darum, auf
       * /de also `/de/imprint`. Sie zeigen ab R1 auf ein ENTWURFS-Gerüst —
       * dass das kein fertiger Text ist, sagt `pukalani.pages.draftNotice`
       * unten, nicht ein fehlender Link.
       */
      legalLinks: { imprint: '/imprint', privacy: '/privacy', terms: '/terms' },
    },
    /**
     * „Anmelden mit Google" (Davids Auftrag 2026-09-03). Das ist der
     * DESIGN-Schalter (welche Anbieter, in welcher Reihenfolge); der Knopf
     * erscheint erst, wenn auch der BETRIEBS-Schalter der Site gesetzt ist
     * (`NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google` in der Server-.env) UND das
     * Appwrite-Projekt `branding` einen Google-Client trägt — Rezept:
     * docs/runbooks/GOOGLE-LOGIN.md (Redirect-URI endet auf `/branding`).
     * Bis dahin ändert diese Zeile nichts Sichtbares; das ist Absicht.
     */
    auth: {
      providers: ['google'],
      /**
       * DAS AGB-HÄKCHEN STEHT AB SOFORT — MIT DEM ENTWURF (Davids
       * Entscheidung 7 vom 2026-09-07, Plan
       * docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §9).
       *
       * Die Empfehlung war „erst die fertigen Texte, dann der Schalter".
       * Dagegen entschieden, weil die Site seit dem 2026-09-01 Konten aufnimmt
       * und jedes Konto ohne Häkchen eines ohne jede Zusage ist. Der Preis der
       * Abweichung wird an drei Stellen bezahlt:
       *
       *   1. `termsDraft` — „Entwurf, in anwaltlicher Prüfung" steht NEBEN dem
       *      Häkchen, in allen drei Anmeldewegen (Passwort, Code, Google).
       *   2. `pages.draftNotice` (unten) — derselbe Hinweis als erster Block
       *      der Seite, dazu `noindex`.
       *   3. `termsVersion` — die Fassung wird beim Konto gespeichert
       *      (`termsAcceptedAt`/`termsVersion` in den Prefs). Ohne sie wäre
       *      „hat zugestimmt" nach der Prüfung wertlos: man wüsste nicht mehr,
       *      WELCHEM Text.
       *
       * `/terms` ist die Route des `pages`-Layers; `localePath()` im Formular
       * schickt einen deutschen Leser nach `/de/terms`. NACH DER PRÜFUNG (R3):
       * neue `termsVersion`, `termsDraft` weg, `draftNotice` weg.
       */
      termsUrl: '/terms',
      termsVersion: '2026-09-draft-1',
      termsDraft: true,
      /**
       * NUR FÜR UNTERNEHMEN UND SELBSTSTÄNDIGE (BS1 R1c, Davids Entscheidung
       * vom 2026-09-08): branding.supply ist ein B2B-Angebot. In jedem
       * Registrierungsweg steht deshalb ein zweites Pflicht-Häkchen „Ich
       * handle als Unternehmer/in oder Selbstständige/r", und der Zeitpunkt
       * landet als `businessConfirmedAt` in den Prefs des Kontos.
       *
       * WARUM DAS EINE ZUSAGE UND KEIN HINWEIS SEIN MUSS: einem VERBRAUCHER
       * steht bei einem Fernabsatzvertrag ein Widerrufsrecht zu, einem
       * Unternehmer nicht. Ein Satz auf der Preisseite ist dafür zu wenig —
       * ohne die Bestätigung am Konto wäre später nicht mehr sagbar, dass
       * dieses Konto sie überhaupt abgegeben hat. Dieselbe Lehre wie bei der
       * AGB-Fassung eine Zeile darüber (R1).
       *
       * Der Google-Weg trägt sie mit: der Knopf ist gesperrt, solange EINES
       * der beiden Häkchen offen ist (`oauthBlockedBy` in `RegisterForm.vue`).
       *
       * BLEIBT NACH R3 STEHEN — anders als `termsDraft`/`draftNotice`: der
       * Schalter sagt nichts über den Reifegrad der Texte, sondern über den
       * Zuschnitt des Angebots.
       */
      businessOnly: true,
    },
    /**
     * DIE DREI RECHTSSEITEN SIND VERÖFFENTLICHT UND TROTZDEM ENTWÜRFE
     * (BS1 R1). Der Kasten „Entwurf, in anwaltlicher Prüfung" steht als
     * ERSTER Block über dem Text, und die Seiten tragen `noindex, follow` —
     * ein Impressums-Platzhalter im Suchindex wäre schlimmer als keiner.
     * Warum das eine App-Ansage ist und keine neue Spalte, steht im Kopf von
     * `packages/pages/shared/pageDraftNotice.ts`.
     *
     * DIESE ZEILE FÄLLT MIT PAKET R3, zusammen mit `auth.termsDraft` — und
     * zwar erst dann: sie ist die einzige Stelle, an der ein Besucher erfährt,
     * dass er einen ungeprüften Text vor sich hat.
     */
    /**
     * DIE HÜLLE UNTEN LINKS HEISST „WEBSITE-EINSTELLUNGEN" (Davids Entscheidung
     * 2026-09-08, DECISION-LOG „Navigation anpassen"): diese Site ist ein Silo
     * ohne Community, und der Menüpunkt hieß trotzdem „Community-Einstellungen"
     * — eine falsche Auskunft über eine Fläche, in der die Rechtsseiten und
     * die Navigation DIESER Website stehen. Der Schalter ist derselbe wie in
     * apps/comments (Begründung dort und an `instanceTabs` in
     * packages/core/app/app.config.ts): er benennt die Hülle um UND hängt die
     * vier Betreiber-Reiter Produkte · Speicher · Konfiguration · System
     * hinein — hier richtig, denn der Betreiber dieser Instanz ist David.
     */
    admin: { instanceTabs: true },
    pages: {
      draftNotice: ['imprint', 'privacy', 'terms'],
    },
    /**
     * DER MARKTVERGLEICH GEHÖRT AUF DIESE SITE — ANGESCHALTET SEIT 2026-09-06
     * (MV1 M1/M4, Plan docs/archiv/BRAND-MARKTVERGLEICH.md §2.1).
     *
     * Der Layer-Default ist `false` und bleibt es (Begründung dort): market
     * ist ein ZUSATZ zum Wizard, kein Teil von ihm, und die Site entscheidet
     * ausdrücklich selbst (mit diesem `true`). Damit steht an
     * EINER Stelle, wer dieses Produkt anbietet — bei einer zweiten Brand-Site wäre das eine echte
     * Entscheidung und keine Nebenwirkung des `extends`.
     *
     * Der Schalter sagt „dieses Deployment kann es". WER es benutzen darf,
     * entscheidet die Zuteilung je Branding (§1.9), und ausschalten im
     * Notfall kann der Betreiber über `app_config.products.market.enabled`
     * ohne Deploy.
     *
     * ── SEIT 2026-09-06 AUF `true` — DIE REIHENFOLGE WAR MIGRATION, DANN SCHALTER
     * Die Prod-Migrationen brand-018/019 und market-001…004 sind am 2026-09-06
     * mit Davids Ja auf der Instanz `branding` gelaufen (zweiter Lauf komplett
     * idempotent, Schema-Parität grün) — erst danach dieses `true`, in einem
     * eigenen Commit (Runbook docs/runbooks/MARKTVERGLEICH-EINFUEHRUNG.md).
     * Der Schalter hält bei `false` die App komplett dunkel: Seite, Leiste UND
     * Routen lesen ihn (`market.vue`, `resolveWorkspaceNavExtras`,
     * `requireMarketEnabled`). Rückweg ohne Deploy: der Runtime-Kill
     * `app_config.products.market.enabled = false` (Produkt-Registry).
     */
    market: { enabled: true },
    /**
     * DER REDAKTIONELLE BEREICH GEHÖRT AUF DIESE SITE (BI1 I1, 2026-09-09 —
     * Plan docs/plans/BRAND-INSIGHTS.md §11 Frage 1: „eigener Layer, KEINE
     * eigene Site — es lebt auf branding.supply").
     *
     * Der Layer-Default ist `false` und bleibt es (Begründung dort): die
     * Redaktion ist ein BETREIBER-Produkt, und die Site sagt mit dieser Zeile
     * ausdrücklich Ja. Damit steht an EINER Stelle, wer diesen Bereich
     * betreibt — bei einer zweiten Brand-Site wäre das eine echte
     * Entscheidung und keine Nebenwirkung des `extends`.
     *
     * ── DER SCHALTER STEHT SCHON AUF `true`, OBWOHL I1 NICHTS ZEIGT ──────
     * Anders als beim Marktvergleich daneben, wo das `true` erst NACH der
     * Prod-Migration kam — und aus einem Grund, der die Regel nicht bricht,
     * sondern sie einhält: I1 baut KEINE Route und KEINE Seite. Es gibt
     * nichts, was dieser Schalter sichtbar machen könnte, und deshalb auch
     * nichts, was ohne Tabelle in einen Fehler liefe. Was der Schalter
     * bewirkt, entsteht mit I2/I3 — und bis dahin ist er die Aussage „diese
     * Site betreibt die Redaktion", nicht „die Redaktion ist offen".
     *
     * Die REIHENFOLGE bleibt trotzdem unverändert: die Prod-Migrationen
     * insights-001…003 gehören VOR den Code-Deploy von I2, und ihr Gate ist
     * Davids Ja (CLAUDE.md). Rückweg ohne Deploy: der Runtime-Kill
     * `app_config.products.insights.enabled = false` (Produkt-Registry,
     * `apiPrefixes: ['/api/insights']`).
     *
     * EINE BEZAHL-SCHRANKE GIBT ES NICHT und soll es nicht geben: Insights
     * ist öffentlicher Inhalt, sein Zweck ist Reichweite (Entscheidung 9).
     */
    insights: {
      enabled: true,

      /**
       * DER THEMENRADAR (BI1 I4, §9.6) — DIE KANALLISTE STEHT NICHT MEHR HIER.
       *
       * Bis BI2 K3 (2026-09-09) trug diese Config elf geprüfte Kanäle, und der
       * Kommentar an dieser Stelle begründete ausführlich, warum sie in die
       * APP gehören und nicht in den Layer: eine Kanalliste sei eine
       * REDAKTIONELLE Entscheidung, und „warum ist dieser Kanal drin?"
       * beantworte ein Kommentar neben der Zeile.
       *
       * Der erste Satz stimmt weiterhin — der zweite nicht mehr. Eine
       * redaktionelle Entscheidung gehört dem BETREIBER, und der hat keinen
       * Deploy. Der Betrieb hat das an zwei Tagen dreimal gezeigt: ein
       * vermeintliches Designbüro war ein Privatkonto, zwei Kanäle luden seit
       * Jahren nichts mehr hoch. Seit Davids Entscheidung vom 2026-09-09 lebt
       * die Liste in der Tabelle `insights_channels` und wird unter
       * /dashboard/insights/channels gepflegt — mit einer Prüf-Vorschau vor
       * dem Speichern, die genau diese drei Irrtümer verhindert hätte.
       *
       * Die ALTEN Kanal-Zeilen samt ihren Begründungen stehen in der
       * Versionsgeschichte dieser Datei; ihre Notizen sind in die Saat
       * `packages/insights/shared/insightsChannelSeed.ts` gewandert und
       * landen beim einmaligen Übernehmen an der jeweiligen Zeile.
       */
      radar: {
        // Leer mit Absicht: die Kanäle liegen in `insights_channels`, die
        // zwei Betriebsgrössen (`maxVideosPerChannel`, `maxVideoAgeDays`)
        // haben im Layer eine Vorgabe (20 Videos, 180 Tage), die diese App
        // bewusst nicht überschreibt. Begründung s. o.
      },
    },
  },
  ui: {},
})
