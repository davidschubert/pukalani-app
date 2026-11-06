import type { BrandCompletionCtaConfig } from '../shared/brandCompletionCta'
import type { BrandLegalLinksConfig } from '../shared/brandLegalLinks'
import type { BrandWorkspaceNavExtra } from '../shared/brandWorkspaceNav'

/**
 * Die Config-FORM des Brand-Wizards (Plan §3e). Sie liegt in `app/` und nicht
 * im Package-Root — dort wird eine `app.config.ts` stillschweigend ignoriert.
 *
 * ── DREI HEBEL, DREI FRAGEN (Audit-7-Korrektur, Plan §3e) ─────────────────
 * `pukalani.brand.enabled` ist der BUILD-/KOMPOSITIONS-Schalter: „ist dieser
 * Layer Teil dieser App?" — er steht hier auf `true`, weil eine App, die
 * `brand` extended, ihn genau deshalb extended hat. Das ist die begründete
 * Ausnahme von „Core-Default ist immer aus": der Core kennt `brand` gar nicht,
 * es gibt also keinen Core-Default, den ein Layer überschreiben könnte, und
 * jede App ohne `brand` im `extends` sieht diesen Schlüssel nie.
 *
 * Die zwei anderen Hebel liegen bewusst NICHT hier, weil sie zur Laufzeit
 * umgelegt werden müssen: die ZULASSUNG ist `app_config.brandAdmissionMode`
 * (closed|invite|open, system-038), die Produkt-NOTABSCHALTUNG ist
 * `app_config.products.brand.enabled = false`. Wer einen davon in diese
 * Datei zöge, machte aus einem Schalter ein Deployment.
 *
 * ── `persona` ─────────────────────────────────────────────────────────────
 * George ist ein EIGENNAME und läuft deshalb nicht über i18n (de = en) —
 * dieselbe Regel wie bei den Theme-Namen. `mark` ist der Pfad zum Bildzeichen
 * und bleibt leer, bis es eines gibt: ein erfundener Standardpfad wäre ein
 * 404 in jeder Sprechblase.
 *
 * ── `contentLocales` ──────────────────────────────────────────────────────
 * Die Sprachen, in denen George INHALTE erzeugt. Sie sind NICHT die
 * Oberflächen-Sprachen der App: die Inhaltssprache wird bei der Anlage eines
 * Brandings FIXIERT (`brand_profiles.contentLocale`, Plan §6) und ändert sich
 * nicht mit dem Sprachumschalter — ein halb englisches, halb deutsches
 * Manifest wäre kein Ergebnis, sondern ein Schaden.
 *
 * ── `completionCta` ───────────────────────────────────────────────────────
 * Was am Ende steht: das Erstgespräch — das eine Conversion-Ziel. Zwei Formen
 * (`type: 'route'` mit `to`, `type: 'url'` mit `href`), gelesen über die eine
 * pure Regel `resolveBrandCompletionCta()` in `shared/brandCompletionCta.ts`;
 * die Aufrufer binden das Ergebnis über `useBrandCompletionCta()`.
 *
 * DER LAYER-DEFAULT BLEIBT DIE ROUTE (BS1 R0, 2026-09-07). `/erstgespraech`
 * existiert in `apps/portfolio` (pukalani.studio) — läuft `brand` einmal dort,
 * ist der Default richtig. Auf branding.supply gibt es die Seite nicht, und
 * genau deshalb setzt `apps/branding` das Ziel selbst auf die Studio-Adresse:
 * DIE SITE entscheidet, wohin ihr Trichter zeigt, nicht der Layer. Die eigene
 * Erstgespräch-Seite kommt mit Paket Z1.
 *
 * ── `legalLinks` ──────────────────────────────────────────────────────────
 * Die drei Rechtswörter im Fuß (`BwSiteFooter`) — PFADE, keine i18n-Schlüssel
 * (die Beschriftungen stehen fest im Layer-Katalog). Leer heisst: die Zeile
 * fällt weg. Warum kein blosser Text mehr dort stehen darf, steht ausführlich
 * im Kopf von `shared/brandLegalLinks.ts`. Der Layer-Default ist leer, weil
 * kein Layer wissen kann, ob die App diese Seiten hat; BS1 R1 füllt ihn.
 *
 * EINGELÖST MIT P1c (2026-08-31): `labelKey` war ein VERSPRECHEN ohne Deckung —
 * `brand.cta.book` existierte in keiner Locale-Datei, weil der Layer keine
 * hatte. Jetzt steht es in `i18n/locales/{de,en}.json`, und das Feld
 * `pukalani.brand.completionCta.labelKey` steht in der `FIELDS`-Tabelle von
 * `scripts/check-i18n-keys.mjs` — der Wächter prüft es über `apps/branding`,
 * die einzige App, die diesen Layer extended (bis zum Rückbau am 2026-08-31
 * war das `apps/portfolio`; Gegenprobe: Schlüssel entfernen
 * ⇒ ein Befund). Ohne beides stünde im Knopf am Ende wörtlich `brand.cta.book`
 * — genau der Fehler, der vier Tage lang im Fuß von comments.pukalani.app
 * stand.
 */
export default defineAppConfig({
  pukalani: {
    /**
     * DIE KOPF-NAVIGATION DIESER SITE ALS REGISTRY (U15 Teil 3, Davids
     * Entscheidung 2026-09-08, DECISION-LOG „Navigation anpassen").
     *
     * Bis heute stand diese Liste FEST in `BwSiteNav.vue`. Der
     * Navigations-Editor unter /dashboard/community/navigation war damit auf
     * branding.supply eine leere Seite und ein Schalter ohne Draht: er bietet
     * genau zwei Quellen an — diese Registry und die veröffentlichten
     * CMS-Seiten —, und beide waren leer (die einzigen Seiten sind Impressum,
     * Datenschutz und AGB, und die gehören in den Fuß).
     *
     * `pukalani.chrome.nav` ist der bestehende Vertrag dafür
     * (core/shared/types/chrome.ts, OBJEKT-Map): jeder Layer trägt seine
     * Einträge selbst ein, niemand importiert jemanden (A14). Die Reihenfolge
     * kommt aus `order` und ist die von vorher (Discover · About · Team).
     *
     * KEIN `productKey` und kein `planProduct`: das Produkt-Gate `brand`
     * schaltet den WIZARD ab, nicht die Marketing-Seiten dieser Site, und
     * Tarife gibt es hier nicht (branding.supply hat keine Mandanten).
     *
     * Die Beschriftungen bleiben, wo sie hingehören: in den Locale-Katalogen
     * dieses Layers (`brand.nav.*`). Davids Eigennamen-Regel gilt dort weiter
     * — die Hauptpunkte heißen in BEIDEN Sprachen englisch; `pnpm
     * check:i18n-keys` deckt `pukalani.chrome.nav.<id>.labelKey` ohnehin ab.
     *
     * `insights` steht BEWUSST NICHT hier, obwohl der i18n-Schlüssel existiert:
     * die Seite gibt es noch nicht, und ein Registry-Eintrag ist ein Menüpunkt,
     * der sofort erscheint (Davids 404-Audit vom 2026-09-03). Sobald sie da
     * ist, ist es eine Zeile.
     *
     * ── DAVIDS ZUSCHNITT VOM 2026-09-08 (Korrektur am Prototyp) ────────────
     * Das Standard-Menü lautet „Products ▾ (Brand-Check) · Discover Brands ·
     * About · Team". `products` ist ein AUFKLAPPER OHNE EIGENE SEITE (`to: ''`)
     * — eine Produkt-Übersichtsseite gibt es nicht, und ein Menüpunkt, der auf
     * eine fehlende Seite zeigt, ist genau der 404 aus dem Audit oben. Unter
     * ihm hängt heute ein Eintrag: „Brand-Check" auf `/brand-check`, die
     * Seite, die es wirklich gibt (`app/pages/brand-check/index.vue`).
     *
     * ── NACHTRAG PS1 (2026-09-09): DIE APP HAT DIESE ZWEI ÜBERSCHRIEBEN ────
     * `apps/branding` bringt seit PS1 eine Produkt-Übersicht `/products` und
     * fünf Produktseiten mit und trägt sie in ihre eigene `app.config` ein
     * (gleiche Ids ⇒ App-Werte gewinnen): `products` bekommt dort `to:
     * '/products'`, `brand-check` zeigt dort auf die PRODUKTSEITE
     * `/products/brand-check` statt auf das Werkzeug. Beide Zeilen BLEIBEN
     * hier trotzdem stehen, und zwar nicht aus Nachlässigkeit: sie sind das
     * Standard-Menü einer Site, die nur den brand-Layer hat und keine
     * Marketing-Seiten — für die ist ein Aufklapper ohne eigene Seite mit dem
     * Werkzeug darunter weiterhin die richtige Antwort. Die Liste der fünf
     * Produkte kann dieser Layer gar nicht führen: zwei davon gehören ihm
     * nicht (A14).
     *
     * `parent` ist die Registry-Vorgabe (Zusage 9 in
     * core/shared/communityNavigation.ts): sie gilt, solange der Owner im
     * Navigations-Editor nichts anderes gespeichert hat — dann gewinnt seine
     * Wahl, auch wenn sie die Gruppe auflöst.
     *
     * `order` bleibt lückenhaft und das ist Absicht: 10/11 halten die Gruppe
     * und ihr Kind beieinander, die nächsten Zehner bleiben für weitere
     * Hauptpunkte frei.
     */
    chrome: {
      nav: {
        products: { labelKey: 'brand.nav.products', to: '', order: 10 },
        'brand-check': { labelKey: 'brand.nav.brandCheck', to: '/brand-check', parent: 'products', order: 11 },
        discover: { labelKey: 'brand.nav.discover', to: '/discover', order: 20 },
        about: { labelKey: 'brand.nav.about', to: '/about', order: 30 },
        team: { labelKey: 'brand.nav.team', to: '/team', order: 40 },
      },
    },
    admin: {
      /**
       * DIE BETREIBER-FLÄCHE DIESES LAYERS (2026-09-05) — bisher hatte `brand`
       * keinen einzigen Eintrag in der Dashboard-Registry, weil seine Seiten
       * (`/dashboard/brands/*`) KUNDEN-Fläche sind und über das
       * default-Layout laufen. Die Warteliste ist die erste Ausnahme: sie
       * verwaltet den Zugang zur Beta und gehört damit dem Betreiber.
       *
       * `scope: 'operator'` — dieselbe Aussage wie beim AI-Runner: auf einem
       * Mandanten-Host wäre das die Verwaltung einer fremden Plattform. Dass
       * `branding` gar keine Mandanten hat, ändert die richtige EBENE nicht.
       *
       * `users.manage` statt `sites.manage`: die Liste entscheidet, wer ein
       * Konto in dieser Beta bekommt — Sites gibt es hier keine (Begründung
       * ausführlich in `server/utils/brandWaitlistAdmin.ts`). Beide sind
       * ohnehin nur im Admin-Wildcard.
       *
       * `group: 'management'` (Betreiber-Werkzeuge), `order: 130` — der nächste
       * freie Zehner-Block nach der Vergabe-Regel in
       * `core/shared/dashboardNav.ts` (posts 10–40 … comments 110–120).
       *
       * KEIN `productKey`: das Produkt-Gate `brand` schaltet den WIZARD ab, und
       * genau dann muss die Warteliste erst recht erreichbar bleiben — sie ist
       * die Liste derer, die auf seine Öffnung warten.
       */
      modules: [
        {
          id: 'brand-waitlist',
          scope: 'operator',
          labelKey: 'brand.admin.waitlist.nav',
          icon: 'i-ph-list-checks',
          to: '/dashboard/waitlist',
          requiredCapability: 'users.manage',
          group: 'management',
          order: 130,
        },
        /**
         * DIE KORREKTUR-WARTESCHLANGE (2026-09-05, Plan §3b) — der zweite
         * Betreiber-Eintrag dieses Layers, und zwar direkt unter der
         * Warteliste (`order: 131`): beide sind Arbeitslisten desselben
         * Menschen, und zwischen ihnen gehört keine fremde Sache.
         *
         * Dieselbe Capability wie die Warteliste: `users.manage`. Sie ist die
         * Betreiber-Klammer dieses Layers — wer über den Beta-Zugang
         * entscheidet, entscheidet auch über eine falsch zugeordnete Branche.
         * Eine eigene Capability dafür wäre eine Rolle, die es hier nicht gibt.
         *
         * KEIN `productKey`, aus demselben Grund wie oben: das Produkt-Gate
         * `brand` schaltet den WIZARD ab, nicht die Pflichten, die aus einem
         * öffentlichen Ranking über fremde Auftritte folgen (§3 „Recht").
         */
        {
          id: 'brand-check-corrections',
          scope: 'operator',
          labelKey: 'brand.admin.checkCorrections.nav',
          icon: 'i-ph-chats-circle',
          to: '/dashboard/brand-check/corrections',
          requiredCapability: 'users.manage',
          group: 'management',
          order: 131,
        },
        /**
         * DIE GESPRÄCHSANFRAGEN (BS1 Z0) — der dritte Betreiber-Eintrag
         * dieses Layers, direkt unter den beiden anderen (`order: 132`).
         * Alle drei sind Arbeitslisten desselben Menschen, und zwischen ihnen
         * gehört keine fremde Sache.
         *
         * Dieselbe Capability wie Warteliste und Korrekturen: `users.manage`.
         * Sie ist die Betreiber-Klammer dieses Layers — die ausführliche
         * Begründung steht in `server/utils/brandWaitlistAdmin.ts` und gilt
         * hier unverändert.
         *
         * KEIN `productKey`: das Produkt-Gate `brand` schaltet den WIZARD ab.
         * Eine Anfrage, die jemand gestellt hat, muss auch dann noch lesbar
         * sein — sie ist eine Zusage an einen Menschen, kein Produktteil.
         */
        {
          id: 'brand-intro-calls',
          scope: 'operator',
          labelKey: 'brand.admin.introCalls.nav',
          icon: 'i-ph-phone-call',
          to: '/dashboard/intro-calls',
          requiredCapability: 'users.manage',
          group: 'management',
          order: 132,
        },
        /**
         * DIE MODERATION DER ÖFFENTLICHEN GALERIE (Paket D3,
         * docs/plans/DISCOVER-BRANDS.md §4.4) — der dritte Betreiber-Eintrag
         * dieses Layers, direkt unter den Korrekturen (`order: 132`): alle
         * drei sind Arbeitslisten desselben Menschen, und zwischen ihnen
         * gehört keine fremde Sache.
         *
         * Dieselbe Capability wie die zwei darüber: `users.manage`. Sie ist
         * die Betreiber-Klammer dieses Layers — wer über den Beta-Zugang
         * entscheidet, entscheidet auch, welche Marke öffentlich unter
         * unserer Adresse steht (Begründung ausgeschrieben im Kopf von
         * `server/utils/brandPublications.ts`).
         *
         * KEIN `productKey`, aus demselben Grund wie oben: das Produkt-Gate
         * `brand` schaltet den WIZARD ab, nicht die Pflichten, die aus einer
         * öffentlichen Galerie folgen — im Gegenteil, gerade dann muss eine
         * gemeldete Marke noch aus ihr genommen werden können.
         */
        {
          id: 'brand-discover',
          scope: 'operator',
          labelKey: 'brand.admin.discover.nav',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/discover',
          requiredCapability: 'users.manage',
          group: 'management',
          order: 132,
        },
        /**
         * DIE FREISCHALTUNGEN (Konzept docs/archiv/BRAND-DESIGN.md §2.10 für
         * Schicht 2, docs/plans/BRAND-BOOK-KIT.md §2.20 Nr. 5 für die
         * Ableitung) — der fünfte Betreiber-Eintrag dieses Layers, unter den
         * anderen (`order: 133`). Alle sind Arbeitslisten desselben Menschen,
         * und zwischen ihnen gehört keine fremde Sache.
         *
         * EIN EINTRAG FÜR ZWEI SCHRANKEN (K1): bis dahin hiess er „Brand
         * Design" und zeigte auf `/dashboard/brand-design`. Seit K1 stehen
         * Brand Design und die Ableitung als zwei SPALTEN einer Tabelle unter
         * `/dashboard/brand-unlocks` (Davids Entscheidung §2.20 Nr. 5); die
         * alte Adresse antwortet 301 (routeRules im Layer). Zwei
         * Menü-Einträge wären zwei Orte für dieselbe Frage.
         *
         * Dieselbe Capability wie die vier darüber: `users.manage`. §2.10
         * nennt eine Capability `brand.manage` — die gibt es hier nicht, und
         * sie zu ERFINDEN wäre eine neue RBAC-Rolle für genau einen Knopf.
         * `users.manage` ist die Betreiber-Klammer dieses Layers (Begründung
         * ausgeschrieben in `server/utils/brandDesignUnlock.ts`): wer über den
         * Beta-Zugang entscheidet, entscheidet auch, welche Marke das
         * begleitete Produkt bekommt.
         *
         * KEIN `productKey`, aus demselben Grund wie oben: das Produkt-Gate
         * `brand` schaltet den WIZARD ab. Eine Zusage, die das Studio einem
         * Kunden im Erstgespräch gegeben hat, muss auch dann noch
         * zurücknehmbar sein.
         */
        {
          id: 'brand-unlocks',
          scope: 'operator',
          labelKey: 'brand.admin.unlocks.nav',
          icon: 'i-ph-lock-simple-open',
          to: '/dashboard/brand-unlocks',
          requiredCapability: 'users.manage',
          group: 'management',
          order: 133,
        },
      ],
    },
    brand: {
      enabled: true,
      persona: { name: 'George', mark: '' },
      contentLocales: ['en', 'de'],
      completionCta: {
        type: 'route',
        to: '/erstgespraech',
        labelKey: 'brand.cta.book',
        /* Die ANNOTATION ist der Punkt: ohne sie leitet TypeScript aus dem
         * Default den engen Route-Typ ab, und eine App, die `type: 'url'`
         * setzt, bekäme einen Fehler über eine unbekannte Eigenschaft `href`
         * — die Site könnte ihr Ziel dann nur noch mit einem `as` setzen. */
      } as BrandCompletionCtaConfig,
      legalLinks: { imprint: '', privacy: '', terms: '' } as BrandLegalLinksConfig,
      /**
       * DER ENTWICKLUNGS-ERSATZ FÜR GEORGES ENTWÜRFE (P1c).
       *
       * Steht er auf `true`, beantwortet ein deterministischer Stub jede
       * Generierung — das §3e-Streaming-Protokoll ist damit OHNE KI-Schlüssel
       * und ohne Anbieter end-to-end beweisbar. `false` ist der Default und
       * gehört in JEDE App: ein Ersatztext, der einmal in einem echten
       * Brand-Dokument landet, ist von einem Ergebnis nicht zu unterscheiden.
       * Eingeschaltet ist er ausschliesslich im `.playground`.
       *
       * Er ist ein RÜCKFALL, keine Registrierung: sobald P2 einen echten
       * Generator über `registerBrandSlotGenerator()` einträgt, gewinnt der
       * — unabhängig von diesem Schalter (s. `server/utils/brandGenerators.ts`).
       */
      devStubGenerator: false,
      /**
       * DER INSTANZWEITE TAGES-DECKEL für echte KI-Generierungen (P2.1) —
       * Gesamtzahl über ALLE Konten, das Kosten-Netz des Betreibers. Zahl,
       * Begründung und die Prüfung stehen in `shared/brandAiLimits.ts`
       * (`resolveBrandAiInstanceCap`): nur eine ganze Zahl > 0 gilt, alles
       * andere fällt auf den Default zurück. AUSSCHALTEN geht hierüber
       * BEWUSST nicht — dafür gibt es `app_config.brandAiEnabled`, und nur
       * dort sagt die Oberfläche auch den richtigen Satz dazu.
       */
      aiDailyInstanceCap: 1000,
      /**
       * DAS MODELL DER STUFE 1 DES SPEZIALISTEN (BW2 Paket 4, Plan §7/§13).
       *
       * ── WARUM ES DIESEN SCHLÜSSEL GIBT UND KEINEN FÜR STUFE 2 ───────────
       * Davids Entscheidung vom 2026-09-04 ist ZWEISTUFIG: Stufe 1 prüft jede
       * geschlossene Session mit einem günstigen Modell, Stufe 2 schaut nur
       * dort genau hin, wo Stufe 1 einen Konflikt vermutet — und zwar mit dem
       * GEORGE-Modell. Für Stufe 2 gibt es deshalb bewusst KEINEN eigenen
       * Schalter: zwei getrennt einstellbare Urteile driften auseinander, und
       * der teure Blick soll derselbe sein, der auch die Entwürfe schreibt
       * (`getEffectiveAiConfig()`: app_config.aiModel > pukalani.ai.model).
       *
       * ── WARUM DER DEFAULT DERSELBE STRING IST WIE DER CORE-DEFAULT ──────
       * `anthropic/claude-haiku-4.5` ist das EINZIGE Modell, das dieses
       * Projekt je durch die ZDR-Bedingungen des Wizards geschickt hat
       * (`BRAND_PROVIDER_ROUTING`: zdr, dataCollection deny, keine
       * Ausweich-Anbieter) — und damit das einzige, von dem wir wissen, dass
       * es unter ihnen erreichbar ist. Ein billigeres Modell hier
       * hineinzuschreiben, ohne es gegen diese Bedingungen geprüft zu haben,
       * wäre eine Behauptung: „allowFallbacks: false" macht daraus keinen
       * langsameren Lauf, sondern gar keinen.
       *
       * Der Schlüssel steht trotzdem GETRENNT da und zeigt nicht einfach auf
       * die George-Kette: hebt der Betreiber `app_config.aiModel` auf ein
       * teures Modell an (weil Georges Entwürfe besser werden sollen), bleibt
       * Stufe 1 hier stehen, wo sie steht. Genau dafür ist die Trennung da.
       */
      ai: { reviewModel: 'anthropic/claude-haiku-4.5' },
      /**
       * WOHIN DIE WARTELISTE MELDET — die Adresse des Betreibers, an die
       * `POST /api/brand/waitlist` eine neue Anfrage schickt.
       *
       * LEER ist der Default und heißt „keine Mail": die Zeile steht dann
       * trotzdem in `brand_waitlist`, sie holt sich nur niemand ab. Ein
       * erfundener Standard-Empfänger (`hallo@…`) wäre schlimmer als keiner —
       * eine Zustellung ins Nichts sieht wie eine Zustellung aus.
       *
       * Sie steht als CONFIG und nicht in der Env, weil sie kein Geheimnis ist
       * und je App verschieden sein darf; `apps/branding` setzt sie bewusst
       * NICHT — David trägt sie ein, wenn er benachrichtigt werden will. Ein
       * Mail-Fehler ändert die Antwort der Route nie (fail-soft).
       */
      waitlistNotify: '',
      /**
       * WOHIN DAS ERSTGESPRÄCH MELDET (BS1 Z0) — die Adresse des Betreibers,
       * an die `POST /api/brand/intro-call` eine neue Anfrage schickt.
       *
       * EIGENER SCHLÜSSEL NEBEN `waitlistNotify` UND KEIN GETEILTER: das sind
       * zwei verschiedene Postfächer-Fragen. „Wer will in die Beta?" ist eine
       * Liste, die man einmal die Woche durchgeht; „wer will reden?" ist ein
       * Lead, der heute eine Antwort braucht. Wer beides an dieselbe Adresse
       * will, schreibt sie zweimal hin — das kostet eine Zeile und lässt die
       * Wahl offen.
       *
       * LEER ist der Default und heisst „keine Mail". Anders als bei der
       * Warteliste geht dabei NICHTS verloren: die Anfrage steht in
       * `brand_intro_requests` und unter /dashboard/intro-calls, und der
       * Absender bekommt seine Bestätigung unabhängig davon. Ein erfundener
       * Standard-Empfänger wäre schlimmer als keiner — eine Zustellung ins
       * Nichts sieht wie eine Zustellung aus.
       */
      introCallNotify: '',
      /**
       * ÖFFENTLICHE KONTAKTADRESSE DER SITE (BS1 R2a) — leer im Layer: die
       * Methodik-Seite zeigt dann nur den Impressum-Link. Eine Site setzt sie
       * bewusst; ein Layer-Default wäre eine erfundene Adresse.
       */
      contactEmail: '',
      /**
       * ZUSÄTZLICHE EBENE-1-EINTRÄGE DER WERKSTATT-LEISTE (MV1 M4).
       *
       * LEER ist der Default und die richtige Aussage: `brand` ist ein
       * Fundament und kennt kein Produkt, das darauf aufsetzt (CONCEPT A14).
       * Wer einen Eintrag will, trägt ihn in SEINER `app.config` ein — defu
       * verkettet Arrays über die Layer, der Produkt-Layer meldet sich also
       * selbst an, und eine Silo-App ohne ihn bekommt keinen Menüpunkt ins
       * Leere. Die FORM steht in `shared/brandWorkspaceNav.ts`
       * (`BrandWorkspaceNavExtra`), gerechnet wird sie dort ebenfalls
       * (`resolveWorkspaceNavExtras`).
       */
      workspaceNavExtras: [] as BrandWorkspaceNavExtra[],
    },
  },
})
