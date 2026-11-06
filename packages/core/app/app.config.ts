import type { PukalaniAdminModule } from '../shared/types/admin-module'
import type { PukalaniAdminNoticeConfig } from '../shared/types/admin-notice'
import type { PukalaniAuthNoticeConfig } from '../shared/types/auth-notice'
import type { PukalaniSettingsTab } from '../shared/types/settings-tab'
import type { PukalaniChromeAuthorActionConfig, PukalaniChromeNavConfig, PukalaniChromeUtilityConfig } from '../shared/types/chrome'

export default defineAppConfig({
  // pukalani.* Config-Gates: Core-Default ist IMMER aus — Apps aktivieren explizit.
  // Interne Tools bleiben komplett clean, öffentliche Seiten brauchen 3 Zeilen.
  pukalani: {
    /**
     * Name im Dashboard-Kopf. War bis 2026-07-26 als „Hawaii Studio" im
     * admin-Layer festverdrahtet — und damit stand der Firmenname des
     * BETREIBERS auch im Dashboard jeder Kunden-Community. Der Default hier
     * ist bewusst neutral; jede App setzt ihren eigenen.
     *
     * OFFEN: auf einem Mandanten-Host gehört hier der Community-Name hin. Der
     * ist heute nur serverseitig bekannt (useTenant) — ihn in die Client-
     * Payload zu heben ist ein eigener kleiner Schritt.
     */
    brand: {
      name: 'Pukalani',
      /**
       * Öffentliche Seite des Anbieters (absolute URL) — der EINZIGE Leser ist
       * heute die Fehlerseite eines unbekannten Hosts (C12b): wer sich
       * vertippt hat, landet auf einer Adresse ohne Community, und „Zur
       * Startseite" führte dort im Kreis. Leer = kein Ausweg-Link (Silo-Apps
       * haben keinen Anbieter-Auftritt, auf den sie verweisen müssten).
       */
      homeUrl: '',
    },
    admin: {
      /** Modul-Registry: Produkt-Layer tragen hier ihre Dashboard-Sektionen ein
       *  (deep-merged/konkateniert über alle Layer). Das Dashboard-Layout rendert
       *  die Nav daraus, capability-gefiltert. */
      modules: [] as PukalaniAdminModule[],
      /**
       * Hinweis-Registry der Dashboard-ÜBERSICHT (M13, s. shared/types/
       * admin-notice.ts): Produkt-Layer melden hier eine global registrierte
       * Komponente an, die oben auf /dashboard erscheint, wenn sie etwas zu
       * sagen hat. Leer = die Übersicht bleibt wie bisher.
       *
       * Der Ort ist die Übersicht und NICHT die Dashboard-Hülle: ein Banner im
       * Layout stünde auf jeder einzelnen Unterseite und wäre nach dem zweiten
       * Klick Tapete. Die Übersicht ist die Landeseite jeder Rolle — einmal
       * gesehen, sichtbar so lange es gilt.
       */
      notices: {} as PukalaniAdminNoticeConfig,
      /**
       * Reiter-Registry der Einstellungs-Hülle (F24, s. shared/types/
       * settings-tab.ts): ein Layer, dem die Routen einer Einstellungs-Seite
       * gehören, trägt hier ihren Reiter ein. Leer = nur die vier Konto-Reiter
       * des admin-Layers.
       *
       * Getrennt von `modules`, weil es zwei verschiedene Flächen sind: `modules`
       * füllt die SEITENLEISTE, das hier die horizontale Reiter-Zeile INNERHALB
       * der Einstellungen. Ein Eintrag gehört in genau eine der beiden.
       */
      settingsTabs: [] as PukalaniSettingsTab[],
      /**
       * Reiter-Registry der COMMUNITY-Hülle (F51, 2026-08-07 — Davids
       * Community-Settings-Hub, DECISION-LOG). Gleicher Typ wie
       * `settingsTabs`, andere Hülle: `/dashboard/community` statt
       * `/dashboard/settings`.
       *
       * Gerendert wird sie von packages/admin/app/pages/dashboard/community.vue,
       * gefiltert mit `resolveSettingsTabs` (Ort × Capability × die drei
       * Produkt-Gates); die Reihenfolge macht `order`. Der MENÜPUNKT unten
       * links rechnet dieselbe Liste — bleibt nach dem Filtern nichts übrig,
       * gibt es ihn nicht (im Betreiber-Kontext hat eine Community-Einstellung
       * nichts zu suchen).
       *
       * Warum eine ZWEITE Liste und nicht ein Feld `hull` an den bestehenden
       * Einträgen: die beiden Hüllen haben verschiedene Besitzer und
       * verschiedene Ebenen. Ein vergessenes Feld legte einen
       * Community-Schalter zwischen „Benachrichtigungen" und „Sicherheit" des
       * KONTOS — zwei Listen können das gar nicht erst.
       */
      communityTabs: [] as PukalaniSettingsTab[],
      /**
       * ZEIGT DIESE APP DIE INSTANZ-SICHT IM HUB? (F51 Paket 2, 2026-08-07 —
       * Davids Ebenen-Entscheidung: „Silo zeigt die volle Instanz-Sicht,
       * System entfällt im Pool".)
       *
       * Der admin-Layer meldet vier BETREIBER-Reiter am Community-Hub an
       * (Konfiguration · Produkte · Speicher · System). Sie sind `scope:
       * 'operator'` und verschwinden damit auf jedem Mandanten-Host von selbst
       * — aber `scopeVisibleAt` lässt sie an ZWEI weiteren Orten stehen, an
       * denen sie nichts zu suchen haben:
       *
       *  · `place: 'single-tenant'` — apps/control und apps/photos ziehen den
       *    admin-Layer ebenfalls. Die Betreiber-Konsole bekäme einen Menüpunkt
       *    „Community-Einstellungen" für eine Community, die es dort nicht
       *    gibt, und dazu Speicher/System ein zweites Mal (die harten
       *    bottomLinks bleiben).
       *  · `place: 'control'` — auf dem KUNDENBEREICH account.pukalani.app sind
       *    Operator-Reiter sichtbar. Genau dort wäre eine Instanz-Verwaltung
       *    unter der Überschrift „Community-Einstellungen" am irreführendsten.
       *
       * Deshalb ein `configFlag` (Core-Default AUS, wie jedes Core-Gate) statt
       * einer Liste, die man je App wiederholt. AN steht er in den Silo-Apps
       * comments, portfolio und branding (SILO-REGEL, DECISION-LOG 2026-08-04
       * und 2026-08-31); die Hülle heißt dort „Website-Einstellungen" (Davids
       * Wort vom 2026-09-08).
       */
      instanceTabs: false,
    },
    /**
     * Chrome-Registry (Audit S9): Header-Nav + Header-Utilities der
     * öffentlichen Community-Seiten. Produkt-Layer registrieren sich selbst
     * (Objekt-Map, Key = stabile ID; `false` schaltet einen Eintrag ab —
     * s. shared/types/chrome.ts). Konsument ist das blueprint-default-Layout;
     * das core-default-Layout bleibt bewusst registry-frei (marketing & Co.).
     */
    chrome: {
      nav: {} as PukalaniChromeNavConfig,
      utilities: {
        // Benachrichtigungen sind Core-Funktionalität — core registriert
        // seine eigene Glocke (nur eingeloggt), alle anderen Utilities
        // kommen aus den Produkt-Layern.
        notifications: { component: 'NotificationBell', order: 40, requiresAuth: true },
      } as PukalaniChromeUtilityConfig,
      /**
       * Aktionen neben einem AUTORENNAMEN (F56) — gerendert von
       * `CoreAuthorActions` aus den Kopfzeilen der Produkte, die Autorenzeilen
       * besitzen (heute posts und comments), NICHT vom Layout.
       *
       * Core trägt hier bewusst nichts ein: es gibt keine Handlung an einem
       * fremden Namen, die das Fundament anzubieten hätte. Bleibt die Map
       * leer, rendert `CoreAuthorActions` kein einziges Element — eine App
       * ohne messages sieht ihre Autorenzeilen unverändert.
       */
      authorActions: {} as PukalaniChromeAuthorActionConfig,
      /** Footer-Link auf /changelog — der admin-Layer (Besitzer der Seite)
       *  schaltet ihn an; Apps können ihn wieder abschalten (platform). */
      changelogLink: false,
      /** CMS-Seiten als Nav-/Footer-Quelle — registriert der pages-Layer;
       *  ohne ihn macht das Layout keinen /api/pages/public-Fetch. */
      pagesNav: false,
      /**
       * Die Glocke in den EIGENEN Shells: core-default-Layout (Kundenbereich)
       * + Dashboard-Shell (Betreiber). BEWUSST ein eigener Schalter und nicht
       * `utilities.notifications` — den liest nur das blueprint-Layout, also
       * die öffentlichen Community-Seiten (C17, 2026-07-29).
       *
       * WARUM ES DEN SCHALTER BRAUCHT: eine App ohne blueprint (apps/control)
       * hat gar kein Community-Chrome; dort schreibt der Stripe-Webhook und
       * das Control Plane kontobezogene Meldungen (`scope: 'account'`), und
       * niemand konnte sie lesen — geschrieben, zugestellt, unsichtbar. Der
       * Core-Default bleibt AUS, damit die blueprint-Apps nicht zwei Glocken
       * bekommen und interne Apps (marketing, help) keine ohne Zweck.
       *
       * Was die Glocke ZEIGT, entscheidet sie selbst über das Publikum
       * ihres Hosts (shared/notificationScope.ts) — dieser Schalter sagt nur,
       * OB sie hängt, nie WAS sie zeigt.
       */
      accountBell: false,
      /**
       * Community-Switcher im Sidebar-Kopf des Dashboards (F50, 2026-08-07 —
       * Davids Entscheidung im DECISION-LOG „Konto-Modell bestätigt,
       * Community-Switcher kommt"). AN heißt: statt des reinen Brandings
       * (`DashboardBrand`) steht dort ein Klappmenü mit allen Communities, in
       * denen der Betrachter eine Team-Rolle hat.
       *
       * CORE-DEFAULT AUS, und das ist keine Vorsicht, sondern eine
       * Voraussetzung: das Menü lebt von zwei Routen des ONBOARDING-Layers
       * (`/api/community/switcher`, `/api/community/switch`), weil dort die
       * Service-Naht ins Control Plane wohnt (A14). Eine App ohne diesen Layer
       * — jede Silo-App, jede interne App — bekäme ein Menü, das beim ersten
       * Öffnen in einen 404 läuft. Das Menü prüft dieselbe Bedingung noch ein
       * zweites Mal am ORT (nur Mandanten-Hosts, s. layouts/dashboard.vue):
       * der Schalter sagt „diese App hat die Routen", der Ort sagt „hier gibt
       * es etwas zu wechseln".
       */
      communitySwitcher: false,
    },
    /**
     * Demo-Host-Gate (CoreDemoBanner + CorePlanBadge): auf diesen Hosts ist
     * die Site eine Demo mit Beispiel-Inhalten — Banner oben, Plan-Badges an
     * den Produkten. Leer = beides existiert nicht. Bewusst KEIN Tenant-Feld:
     * der Demo-Status ist eine Deployment-Aussage der App.
     */
    demo: {
      hosts: [] as string[],
      /** CTA in den Self-Service-Trichter (absolute URL) — leer = kein CTA */
      ctaUrl: '',
    },
    ai: {
      /** Server-seitige KI-Produkte (aiComplete: Moderations-Assist, Layer-
       *  Defaults). Core-Default aus; Key server-only via NUXT_AI_KEY. */
      enabled: false,
      /** Model-Id der OpenAI-kompatiblen Chat-Completions-API (Default: OpenRouter) */
      model: 'anthropic/claude-haiku-4.5',
      /**
       * BILDER LESEN (`aiVision`, docs/archiv/BRAND-DESIGN.md §2.12) — LEER
       * heisst AUS, und das ist der Core-Default.
       *
       * Der Modell-Name IST das Gate: es gibt keinen zweiten Schalter daneben
       * (Begründung im Kopf von `server/utils/aiVision.ts`). Wer ihn setzt,
       * schickt Bilder an einen fremden Anbieter — der Transport klemmt
       * deshalb JEDEN Vision-Aufruf fest auf `provider.data_collection:
       * 'deny'` (OpenRouter-Provider-Routing, Davids ZDR-Entscheidung
       * 2026-09-08), und das lässt sich von aussen nicht abschalten.
       *
       * Zu wählen ist ein MULTIMODALES Modell, das unter dieser Bedingung
       * überhaupt Anbieter findet — sonst antwortet OpenRouter mit einem
       * Routing-Fehler statt mit einer Lesung.
       */
      visionModel: '',
      /**
       * BILDER ERZEUGEN (`aiImage`, docs/archiv/BRAND-DESIGN.md §2.12, Paket
       * D5c) — LEER heisst AUS, und das ist der Core-Default.
       *
       * Dieselbe Bauform und dieselbe Begründung wie beim Vision-Modell eine
       * Zeile darüber: der Modell-Name IST das Gate, und der Transport klemmt
       * JEDEN Aufruf fest auf `provider.data_collection: 'deny'` (Davids
       * ZDR-Entscheidung 2026-09-08).
       *
       * Zu wählen ist ein Modell mit BILD-AUSGABE, das unter dieser Bedingung
       * Anbieter findet (Davids Wahl: `google/gemini-2.5-flash-image-preview`)
       * — sonst antwortet OpenRouter mit einem Routing-Fehler statt mit einem
       * Bild, und die Werkstatt sagt „gerade nicht verfügbar".
       */
      imageModel: '',
      /**
       * VIDEOS LESEN (`aiVideo`, BI2 K5 — Plan
       * docs/plans/BRAND-INSIGHTS-KURATION.md §6/§13) — LEER heisst AUS, und
       * das ist der Core-Default.
       *
       * Dieselbe Bauform wie die zwei Schlüssel darüber, mit einem zweiten
       * Grund für die Strenge: NICHT JEDES MODELL KANN ES. Das Textmodell
       * dieses Monorepos sieht keine Videos, also wäre ein Gate am
       * allgemeinen KI-Schalter eine Einladung, mit dem falschen Modell zu
       * rufen.
       *
       * Zu wählen ist ein Modell mit VIDEO-EINGABE, das unter
       * `data_collection: 'deny'` (+ dem `zdr`/`only` des Konsumenten)
       * Anbieter findet. Gemessen am 2026-10-27 (Plan §13): die
       * `gemini-3.x`-Reihe kann es, `google/gemini-3.1-flash-lite` auch auf
       * `google-vertex/eu` — und ein 25-Minuten-Video kostet rund fünf Cent.
       */
      videoModel: '',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    auth: {
      /** Social-Login-Buttons (z.B. ['github', 'google']) — leer = keine Buttons.
       *  Provider müssen in der Appwrite Console konfiguriert sein! */
      providers: [] as string[],
      /** AGB-URL — gesetzt = Pflicht-Checkbox im Register-Formular */
      termsUrl: '',
      /**
       * DIE FASSUNG, DER JEMAND ZUSTIMMT (BS1 R1, 2026-09-07) — z. B.
       * '2026-09-draft-1'. Wird bei der Konto-ANLAGE zusammen mit
       * `termsAcceptedAt` in die Account-Prefs geschrieben (alle drei Wege:
       * Passwort, Code, Google — `server/utils/termsAcceptance.ts`).
       *
       * Leer ist erlaubt und heißt „wir wissen wann, nicht welcher Text";
       * geschrieben wird ohnehin nur, wenn `termsUrl` gesetzt ist. Wer die
       * AGB inhaltlich ändert, ÄNDERT DIESEN WERT — sonst behauptet der
       * Vermerk am Konto eine Zustimmung zu einem Text, den es nicht mehr
       * gibt. (Die Nachfrage bei Bestandskonten kommt mit Fassung 2, R3.)
       */
      termsVersion: '',
      /**
       * „Entwurf, in anwaltlicher Prüfung" NEBEN dem Häkchen (BS1 R1, Davids
       * Entscheidung 7 vom 2026-09-07).
       *
       * Ein BOOLEAN und kein i18n-Schlüssel: der Satz gehört dem Core und
       * steht in seinen Locale-Dateien (`auth.register.termsDraftNotice`),
       * damit ihn jede App in beiden Sprachen hat. Ein Schlüssel in der Config
       * wäre ein Versprechen, das `pnpm check:i18n-keys` einlösen müsste —
       * für einen Satz, der überall derselbe ist.
       *
       * Core-Default AUS: eine App mit fertigen AGB darf diesen Hinweis nicht
       * zeigen. Er sagt nichts über die Pflicht (das tut `termsUrl`), sondern
       * über den Reifegrad des Textes dahinter.
       */
      termsDraft: false,
      /**
       * NUR FÜR UNTERNEHMEN UND SELBSTSTÄNDIGE (BS1 R1c, Davids Entscheidung
       * vom 2026-09-08): true = in JEDEM Registrierungsweg steht ein zweites
       * PFLICHT-Häkchen „Ich handle als Unternehmer/in oder Selbstständige/r",
       * und bei der Konto-Anlage wird `businessConfirmedAt` in die
       * Account-Prefs geschrieben (`server/utils/businessConfirmation.ts`).
       *
       * Ein BOOLEAN und kein i18n-Schlüssel: Text und Begründung gehören dem
       * Core und stehen in seinen Locale-Dateien (`auth.register.
       * businessLabel` + `businessNotice`), damit jede App sie in beiden
       * Sprachen hat. Ein Schlüssel in der Config wäre ein Versprechen, das
       * `pnpm check:i18n-keys` einlösen müsste — für einen Satz, der überall
       * derselbe ist. (Dieselbe Abwägung wie bei `termsDraft`.)
       *
       * Core-Default AUS — und das ist mehr als die übliche Vorsicht: der
       * Schalter schliesst Verbraucher AUS. In einer App, die auch
       * Privatpersonen aufnimmt (jede Pool-Community, portfolio, comments),
       * wäre das Häkchen eine Hürde vor einer Tür, die offen sein soll.
       *
       * ER IST UNABHÄNGIG VON `termsUrl`: die AGB sagen, WELCHEM Text jemand
       * zustimmt, dieser Schalter sagt, WER zustimmt. Eine App kann das eine
       * ohne das andere verlangen, deshalb zwei Schalter und zwei Häkchen.
       */
      businessOnly: false,
      /** Passwortloser Login per E-Mail-Code (Appwrite Email-OTP) —
       *  Ergänzung zum Passwort-Login, kein Ersatz */
      otp: false,
      /** Nicht-blockierende E-Mail-Verifizierung: Signup verschickt eine
       *  Bestätigungs-Mail (Instanz-SMTP), eingeloggt erscheint ein Banner
       *  bis zur Bestätigung. E-Mail-Notifications (instant/digest) gehen
       *  IMMER nur an verifizierte Adressen — unabhängig von diesem Flag
       *  (Spam-Schutz). OTP-Logins verifizieren automatisch. */
      verification: true,
      /**
       * Hinweis-Registry über dem Register-Formular (U2, 2026-08-10) —
       * Objekt-Map wie `pukalani.admin.notices`, Key = stabile Id, `false`
       * schaltet einen geerbten Eintrag ab. Core-Default leer.
       *
       * WOFÜR: die Register-Seite gehört dem Core und wird von JEDER App
       * geerbt — der ehrliche Satz „für eine EIGENE Community brauchst du
       * derzeit eine Einladung" gilt aber nur dort, wo es ein Early-Access-Tor
       * gibt. Der onboarding-Layer meldet seine Komponente hier an; der Core
       * kennt weder sie noch den Anlass (A14). Typ + Auflösung:
       * shared/types/auth-notice.ts.
       */
      notices: {} as PukalaniAuthNoticeConfig,
    },
    analytics: {
      enabled: false,
      provider: 'plausible' as 'plausible' | 'umami',
      /** plausible: data-domain · umami: data-website-id */
      domain: '',
      websiteId: '',
      /** Eigene Script-URL (z.B. self-hosted) — leer = Provider-Default */
      src: '',
      /** Plausible-Snippet-Generation: '' = Legacy-Script mit data-domain ·
       *  'v3' = Site-Script (pa-…, VOLLE URL in `src`) + plausible.init().
       *  Beim v3-Snippet steckt die Site-Zuordnung in der Script-URL selbst
       *  (`domain` entfällt); die optionalen Messungen (Outbound-Links,
       *  Downloads, Formulare) hängen serverseitig an der Script-Id. */
      snippet: '' as '' | 'v3',
      /**
       * SELBSTBEDIENUNG (2026-08-04): Basis-Adresse UNSERER Plausible-Instanz.
       * Gesetzt = die App darf ihre Script-Id zur Laufzeit aus
       * `GET /api/analytics/config` holen (Layer `analytics`) und daraus selbst
       * das v3-Snippet bauen. Leer = nur die statische Konfiguration oben.
       *
       * Die Adresse steht HIER und nicht in der Kunden-Eingabe, und das ist der
       * ganze Sicherheitsentwurf: aus der Eingabe kommt nur eine geprüfte Id
       * (core/shared/analyticsScript.ts), nie eine Herkunft.
       */
      instance: '',
      /**
       * DIE SAMMEL-SITE (v2, 2026-08-04) — Core-Default leer, die App setzt sie.
       *
       * Gesetzt heißt: „Messung aktiv" ist in dieser App ein SCHALTER
       * (`analytics_settings.enabled`) statt einer Id-Eingabe. Alle Communities
       * dieses Deployments tracken dann in DIESELBE Plausible-Site; getrennt
       * werden ihre Zahlen erst bei der ABFRAGE, über den
       * `event:hostname`-Filter der Stats-API.
       *
       * Warum nicht eine Site je Community: die Plausible-CE hat keine
       * Sites-API (Enterprise-only, am Quellcode geprüft) — es gibt keinen Weg,
       * beim Aktivieren eine Site anzulegen. Eine eigene Site bleibt möglich
       * (das v1-Feld, im Dashboard unter „Erweitert") und GEWINNT über den
       * Schalter (`effectiveScriptId`).
       *
       * `scriptId` ist die Id für den `<script src>` (dieselbe Prüfung wie bei
       * einer Kunden-Eingabe), `siteId` der Site-Schlüssel für die Stats-API —
       * das sind zwei verschiedene Dinge, deshalb zwei Felder.
       */
      shared: {
        scriptId: '',
        siteId: '',
      },
      /**
       * ADBLOCK-PROXY (F47/Paket 5, 2026-08-12) — **Core-Default AN**, und das
       * ist die zweite begründete Ausnahme von „Core-Default ist IMMER aus"
       * (die erste ist `pukalani.realtime.enabled`, F14).
       *
       * Der Grund ist derselbe: dieser Schalter schaltet kein PRODUKT ein,
       * sondern wählt den TRANSPORT eines Produkts, das die App mit
       * `analytics.enabled` schon ausdrücklich bestellt hat. Ein Default AUS
       * hieße, dass jede der vier messenden Apps eine zweite Zeile schreiben
       * muss, um das zu bekommen, worum sie schon gebeten hat — und die eine
       * App, die es vergisst, misst dauerhaft schlechter, ohne dass es irgendwo
       * auffällt (genau die Klasse Fehler wie die fehlende SMTP-Env, F44).
       *
       * WAS ER TUT: das Mess-Script kommt von `/api/stats-script.js` statt von
       * der Plausible-Instanz, die Ereignisse gehen an `/api/stats-event`.
       * Beides sind Adressen auf dem Host der Seite selbst, also für einen
       * Inhalte-Blocker nicht von eigenen Dateien zu unterscheiden.
       *
       * AUF `false` GESETZT ist er der Not-Aus: Script und Ereignisse gehen
       * wieder direkt zur Instanz, die zwei Routen antworten 404. Er kostet
       * nichts, wenn ohnehin nicht gemessen wird — ohne `enabled` wird keine
       * der beiden Routen je bedient.
       *
       * KEINE WIRKUNG auf das Legacy-Snippet (`data-domain`, ohne `pa-…`-Id):
       * dort kommt der Proxy nicht zum Zug, weil sich aus der Adresse keine
       * Script-Id zurückrechnen lässt (core/shared/analyticsScript.ts).
       */
      proxy: true,
    },
    consent: {
      enabled: false,
    },
    /** Footer-Rechtslinks (Impressum/AGB/Datenschutz o. ä.). Core-Default leer
     *  → das Standard-Layout zeigt keine; Apps mit öffentlichen Seiten füllen
     *  sie (to = interner Pfad via localePath, labelKey = i18n-Key). */
    legalLinks: [] as { to: string, labelKey: string }[],
    seo: {
      /**
       * Basis-URL für canonical/hreflang/og:url aus dem REQUEST-Host statt aus
       * `NUXT_PUBLIC_I18N_BASE_URL` (useLocaleSeoHead). Core-Default AUS:
       * Single-Host-Apps haben genau eine öffentliche URL, und die soll die Env
       * bestimmen (auch für Aliase — control kanonisiert bewusst auf control).
       *
       * AN gehört das Gate in jede App, die MEHRERE Hosts bedient: die Env kann
       * nur einen tragen, weshalb auf allen Mandanten-Hosts der Pool-App der
       * Betreiber-Host in canonical/hreflang/og:url stand (Audit-Befund B1) —
       * Google indexierte die Kundendomain nicht, Sprachlinks verließen den
       * Mandanten. Das Schema bleibt Sache der Env (shared/seoOrigin.ts).
       */
      originFromRequest: false,
      /**
       * Bildmarke pro Mandant (Audit-Befund K2): `<link rel="icon">` auf die
       * serverseitig generierte `/favicon.svg` (Kreis in der Primärfarbe des
       * Mandanten-Themes + Initial) plus `<meta name="theme-color">` in
       * derselben Farbe. Core-Default AUS — eine Silo-App hat ein eigenes,
       * gestaltetes Favicon und darf es nicht verlieren.
       *
       * AN gehört das Gate in Apps, die viele Communities auf einem Deployment
       * bedienen: dort lieferte jeder Kunden-Host Nitros 78-Byte-Platzhalter
       * aus. Die App MUSS dann eine Route `/favicon.svg` mitbringen
       * (apps/platform/server/routes/favicon.svg.get.ts).
       */
      tenantFavicon: false,
      /**
       * Vorschaubild pro Mandant für geteilte Links (og:image, OPEN-ITEMS B2):
       * `/og/<key>.png` — 1200×630, Basisfarbe des Community-Themes,
       * Community-Name, dezente Wortmarke. Core-Default AUS.
       *
       * WARUM PNG und nicht das vorhandene SVG der Bildmarke: Facebook,
       * WhatsApp und LinkedIn ignorieren ein SVG als og:image vollständig.
       * Gerastert wird ohne Renderer im Betrieb — Chrome hat die Zeichen
       * EINMAL gebacken (packages/themes/scripts/generate-brand-card-font.mjs),
       * der Server setzt sie nur zusammen und legt das Bild auf Platte.
       *
       * AN gehört das Gate in Mehr-Host-Apps, die eine Route `/og/[key]`
       * mitbringen (apps/platform/server/routes/og/[key].get.ts). Silo-Apps
       * bleiben aus: die haben EIN Erscheinungsbild und können sich ein
       * gestaltetes Bild leisten.
       */
      tenantOgImage: false,
      /**
       * App-Icon pro Mandant für den Home-Bildschirm (OPEN-ITEMS C7):
       * `/icon/<key>.png` — randlose Kachel in der Basisfarbe des
       * Community-Themes + Initiale, 512×512 und 180×180 (`?size=180`).
       * Core-Default AUS.
       *
       * EIGENES Gate neben `tenantFavicon`, obwohl beides „die Bildmarke im
       * Browser" ist: das Favicon ist ein generiertes SVG und kostet nichts,
       * das Icon wird gerastert und auf Platte abgelegt. Vor allem aber bringt
       * eine Silo-App oft ein gestaltetes Touch-Icon mit — die soll das
       * Favicon-Gate anschalten können, ohne ihr Icon zu verlieren.
       *
       * WARUM PNG: iOS akzeptiert als `apple-touch-icon` ausschließlich
       * Bitmaps; aus dem SVG der Bildmarke ist das nicht ableitbar. Ohne diese
       * Zeile legt iOS einen Screenshot der Seite auf den Home-Bildschirm.
       *
       * AN gehört das Gate in Mehr-Host-Apps, die eine Route `/icon/[key]`
       * mitbringen (apps/platform/server/routes/icon/[key].get.ts).
       */
      tenantAppIcon: false,
    },
    tenancy: {
      /** Horizont-3 Mandanten-Auflösung (Naht 1): Host → TenantContext via
       *  registriertem Resolver (registerTenantResolver, Nitro-Plugin der
       *  Platform-App). Core-Default AUS — Single-Tenant-Apps (heutiger
       *  Betrieb) tragen null Overhead; bei aktivem Gate ohne Resolver bleibt
       *  die Middleware ein No-Op (fail-open auf heutiges Verhalten). */
      enabled: false,
      /**
       * KONTROLL-Hosts: Hostnamen derselben App, die bewusst KEIN Mandant sind
       * (Kundenbereich/Onboarding, z. B. app.pukalani.app). Ohne diese Liste
       * bekämen sie 404 wie jeder unbekannte Host.
       *
       * Laufzeit-Override: NUXT_PUBLIC_TENANCY_CONTROL_HOSTS (kommagetrennt) —
       * die Hosts unterscheiden sich je Umgebung (lokal app.localhost).
       */
      controlHosts: [] as string[],
      /**
       * WIZARD-Hosts: die Teilmenge der Kontroll-Hosts, auf denen `/` direkt in
       * den Anlege-Trichter führt (F12). Alle übrigen Kontroll-Hosts zeigen
       * dort die Kunden-Übersicht („Deine Communities").
       *
       * Eigene Achse statt „der erste controlHost ist der Kundenbereich": eine
       * Reihenfolge-Regel kippt beim nächsten Env-Override unbemerkt. Leer =
       * kein Wizard-Host → jeder Kontroll-Host beginnt bei der Übersicht (und
       * die schickt Konten OHNE Community von selbst weiter).
       *
       * Laufzeit-Override: NUXT_PUBLIC_TENANCY_WIZARD_HOSTS (kommagetrennt).
       */
      wizardHosts: [] as string[],
      /**
       * ABGESCHALTETE Kontroll-Host-Namen (AH-1): Requests darauf bekommen
       * eine 301 auf `controlHosts[0]` — Pfad und Query unverändert. Ohne die
       * Liste wären sie 404 wie jeder unbekannte Host, und ein verschickter
       * Einladungs-Link (`?code=…`, 7 Tage gültig) liefe ins Leere.
       *
       * Die Namen bleiben zusätzlich in RESERVED_SUBDOMAINS gesperrt: ein
       * zurückgegebener Plattform-Name ist der beste Phishing-Köder, den es
       * gibt.
       *
       * Laufzeit-Override: NUXT_PUBLIC_TENANCY_LEGACY_CONTROL_HOSTS
       * (kommagetrennt). Leer = die Middleware ist ein No-Op.
       */
      legacyControlHosts: [] as string[],
      /**
       * Was auf einem Kontroll-Host überhaupt aufgerufen werden darf (Präfix-
       * Vergleich, fail-closed: alles andere → 404).
       *
       * Der Grund ist kein Aufräumzwang, sondern Datentrennung: auf einem Host
       * OHNE Mandanten würde `scopeQuery` nicht scopen — `/api/comments` liefe
       * dort quer über ALLE Communities des Pool-Projekts. Diese Liste ist
       * die Grenze, die das verhindert; jeder Eintrag ist eine Entscheidung.
       */
      /**
       * `/api/notifications` ist seit C15 dabei — die EINE Entscheidung, die
       * dieser Eintrag verlangt: kontobezogene Meldungen (Zahlung, Anfragen)
       * gehören in den Kundenbereich (Davids Entscheidung 3, 2026-07-29), also
       * muss die Glocke dort ihre Liste holen dürfen. Sicher, weil die Route
       * doppelt eingegrenzt ist: Row-Security gibt nur die Zeilen DES
       * Empfängers heraus, und der Kontroll-Host filtert zusätzlich auf den
       * Kundenbereich-Sentinel (`_account`) plus ungestempelten Bestand — es
       * kann also keine Community-Meldung eines fremden Mandanten kommen.
       * Deckt auch `/api/notifications/read` und `/api/notifications/
       * run-digest` ab (letztere ist system.manage-gated).
       */
      /**
       * `/api/feedback` ist seit E10 dabei (Davids Entscheidung 1). Der
       * Feedback-Bereich ist Bestandteil ALLER Dashboards — auch des
       * Kundenbereichs auf einem Kontroll-Host, wo es keinen Mandanten gibt.
       * Sicher OHNE Mandanten-Scope, weil hier nichts gescopt werden MUSS:
       * die Routen berühren keine Tabelle dieses Projekts, sie reichen an das
       * Control Plane weiter, und DORT entscheidet die Projektion, was ein
       * Betrachter sieht (Text für alle, Herkunft nur für den Betreiber). Die
       * `communityId` im Umschlag ist auf einem Kontroll-Host schlicht leer.
       */
      /**
       * `/api/abuse` ist seit M13 dabei. Das Missbrauchs-Meldeformular muss von
       * einem Host aus erreichbar sein, der NIEMANDEM gehört und deshalb nie
       * gesperrt sein kann — genau das ist ein Kontroll-Host. Sicher ohne
       * Mandanten-Scope aus demselben Grund wie `/api/feedback`: die Route
       * berührt keine Tabelle dieses Projekts, sie reicht mit dem Service-Secret
       * an das Control Plane weiter, und dort landet die Meldung in einer
       * Tabelle ohne jede Client-Berechtigung.
       */
      /**
       * `/api/account/activity` ist seit AH-3 dabei — die eigene Aktivität über
       * alle Communities (`/profile/activity`).
       *
       * BEWUSST DER EXAKTE PFAD, kein Verzeichnis-Präfix `/api/account/`: der
       * Vergleich läuft an der Segmentgrenze, ein Verzeichnis öffnete damit
       * JEDE künftige Route unter diesem Namen mit — ohne dass jemand sie
       * gegen den fehlenden Mandanten-Scope geprüft hätte. Der nächste
       * Konto-Endpunkt bekommt seine eigene Zeile, und das ist die Absicht.
       *
       * Sicher ohne Mandanten-Scope, obwohl die Route ANDERS begründet ist als
       * `/api/feedback` und `/api/abuse` (die keine Tabelle dieses Projekts
       * berühren): sie liest sehr wohl Produkt-Tabellen, aber ausschließlich
       * über die Besitz-Spalte (`authorId`/`userId` = Session-Nutzer). Der
       * Mandant ist hier keine Grenze, weil die Frage user-zentriert ist —
       * die Grenze ist der Besitz, und die setzen die Contributors
       * (core/server/utils/userActivity.ts) durch.
       */
      /**
       * `/api/account/handle` (AH-7, 2026-08-11) — EXAKTER Pfad, aus demselben
       * Grund wie `/api/account/activity` daneben: `/api/account/` als Präfix
       * hätte jede künftige Konto-Route ungefragt mit aufgemacht.
       *
       * Sicher ohne Mandanten-Scope, weil der @name seit AH-7 dem KONTO gehört
       * und nicht mehr einer Community (`account_handles`, global eindeutig).
       * Die Route liest und schreibt ausschließlich über die Besitz-Spalte
       * `userId` = Session-Nutzer. Genau deshalb steht `/api/handles/`
       * weiterhin NICHT hier: die Suche dahinter ist eine Mitgliederliste und
       * bezieht ihre Grenze aus dem Publikum der Zeile — ohne Community gibt
       * es dort nichts zu beantworten.
       */
      // '/api/analytics/config' + die zwei stats-Pfade seit 2026-08-12 (Davids
      // Trichter-Entscheidung): der Kundenbereich misst in die Sammel-Site —
      // Config-Abfrage, Script-Proxy und Event-Proxy müssen die Allowlist
      // passieren, sonst 404t die Messung dort still (lokal erwischt, BEVOR
      // es deployt war). Bewusst der exakte config-Pfad, nicht '/api/analytics/'
      // — settings.patch und stats.get bleiben Mandanten-Routen.
      // '/api/storage/' seit 2026-08-18: die Profilseite lebt seit AH-1 im
      // Kundenbereich (account.*), ihr Foto-Upload und die Avatar-Anzeige
      // laufen über /api/storage/avatars — ohne den Eintrag 404te der Upload
      // auf dem Kontroll-Host (auf freelancer.supply ging er; live erwischt).
      // Gefahrlos ohne Mandanten-Kontext: die POST-Route lässt NUR den
      // Avatars-Bucket zu, GET/DELETE laufen über den Session-Client und
      // damit über Datei-Permissions — nichts davon ist tenant-gescopt.
      /**
       * `/api/geo/cities` + `/api/geo/countries` (Mitglieder-Karte Etappe 1,
       * 2026-08-23) — ZWEI EXAKTE Pfade, aus demselben Grund wie die zwei
       * Konto-Routen darüber: `/api/geo/` als Präfix machte jede künftige
       * Geo-Route ungefragt mit auf. Die Wache vergleicht mit `startsWith`,
       * ein Eintrag deckt seinen Nachbarn also NICHT mit ab — der Länder-
       * Filter braucht seine eigene Zeile.
       *
       * Sie GEHÖRT hierher, weil ihr Hauptwohnsitz der Kundenbereich ist: der
       * Orts-Picker steht im Profil (`/profile` auf account.pukalani.app), und
       * ohne diesen Eintrag antwortete er dort 404 — genau die Falle, in die
       * schon der Avatar-Upload gelaufen ist (`/api/storage/`, 2026-08-18).
       *
       * Sicher ohne Mandanten-Scope: die Route liest eine LOKALE DATEI mit
       * öffentlichen Ortsnamen (GeoNames) und fasst keine Zeile an. Ihre
       * Grenze ist die Sitzung, nicht die Community.
       */
      controlApiPrefixes: ['/api/auth/', '/api/storage/', '/api/onboarding/', '/api/health', '/api/telemetry/', '/api/notifications', '/api/feedback', '/api/abuse', '/api/account/activity', '/api/account/handle', '/api/geo/cities', '/api/geo/countries', '/api/analytics/config', '/api/stats-script.js', '/api/stats-event', '/api/_nuxt_icon/'] as string[],
    },
    /**
     * Realtime-Gate (F14, 2026-08-01) — der EINE Schalter, mit dem eine App
     * ohne lebende Datenebene alle Realtime-Einstiege des Core loswird:
     * Row-Streams (useRealtimeRows → Config-/Branding-Plugin, Kommentare),
     * Presence (usePresence/usePresenceState) und den Account-WS
     * (useRealtimeAccount). AUS heißt: kein Web-SDK nachgeladen, kein Socket,
     * kein `/api/auth/realtime-token`.
     *
     * DIE AUSNAHME VON „Core-Default ist IMMER aus": Realtime ist kein Zusatz,
     * sondern das bestehende Verhalten jeder Produkt-App. Vollständige
     * Begründung + die pure Regel: shared/realtimeGate.ts.
     */
    realtime: {
      enabled: true,
    },
    community: {
      /**
       * EINLADUNGEN DURCH MITGLIEDER — wie viele pro rollierender Woche
       * (F57 Mechanik 2, Davids Zahl vom 2026-08-14: **5**).
       *
       * `0` schaltet die Mechanik plattformweit ab; der Owner-Schalter je
       * Community (`communities.memberInvitesEnabled`) liegt daneben und
       * gewinnt immer nach unten — eine Community kann zumachen, was die
       * Plattform offen lässt, nie umgekehrt.
       *
       * WARUM DER WERT IM CORE STEHT und nicht im onboarding-Layer: gelesen
       * wird er im CONTROL PLANE (dort liegen `community_invites` und die
       * Wahrheit über die Community), und `apps/control` erbt onboarding
       * NICHT — das war 2026-08-12 schon einmal die Falle bei der
       * Auswertungs-Seite. Core erben beide Apps.
       *
       * BEGRÜNDETE AUSNAHME von „Core-Default ist IMMER aus": der Default ist
       * hier kein Schalter, sondern eine GRENZE. Ein Default `0` hieße nicht
       * „sicher aus", sondern „Mechanik gebaut und überall tot", und die
       * Sicherheits-Frage beantwortet ohnehin die Zahl selbst, nicht ihr
       * Vorhandensein.
       */
      memberInvitesPerWeek: 5,
    },
    security: {
      /** CSRF-Origin-Check für unsichere Methoden auf /api/* (server/middleware/
       *  csrf-origin.ts). PFLICHT, sobald eine App das partitionierte
       *  Embed-Session-Cookie (SameSite=None, Embed-Plan E2) aktiviert —
       *  bis dahin schützt sameSite:'strict' und der Check bleibt aus. */
      csrfOriginCheck: false,
    },
    observability: {
      /** Strukturierte JSON-Error-Logs für unbehandelte Server-Fehler (5xx)
       *  am zentralen Nitro-Error-Hook. Sentry-Andockpunkt: server/utils/logEvent.ts */
      enabled: false,
      /** Browser-Fehler (vue:error, window.onerror, unhandledrejection)
       *  zusätzlich an POST /api/telemetry/error melden (dedupliziert, max 10/Session) */
      clientErrors: false,
    },
  },
  ui: {
    // Nuxt UI v4 gibt Buttons per Default KEINEN Pointer-Cursor — global nachrüsten,
    // damit anklickbare Buttons (inkl. variant="link" wie "Code erneut senden") sich
    // auch wie klickbar anfühlen. Im disabled-Zustand greift weiterhin not-allowed.
    button: {
      slots: {
        base: 'cursor-pointer'
      }
    },
    colors: {
      primary: 'sky',
      // Basis-Neutral (Fallback); zur Laufzeit überschreibt der Neutral-Picker
      // via [data-neutral] die --ui-color-neutral-Ramp (siehe themes/neutral.css)
      neutral: 'mist'
    },
    icons: {
      arrowDown: 'i-ph-arrow-down',
      arrowLeft: 'i-ph-arrow-left',
      arrowRight: 'i-ph-arrow-right',
      arrowUp: 'i-ph-arrow-up',
      caution: 'i-ph-warning-circle',
      check: 'i-ph-check',
      chevronDoubleLeft: 'i-ph-caret-double-left',
      chevronDoubleRight: 'i-ph-caret-double-right',
      chevronDown: 'i-ph-caret-down',
      chevronLeft: 'i-ph-caret-left',
      chevronRight: 'i-ph-caret-right',
      chevronUp: 'i-ph-caret-up',
      close: 'i-ph-x',
      copy: 'i-ph-copy',
      copyCheck: 'i-ph-check-circle',
      dark: 'i-ph-moon',
      drag: 'i-ph-dots-six-vertical',
      ellipsis: 'i-ph-dots-three',
      error: 'i-ph-x-circle',
      external: 'i-ph-arrow-up-right',
      eye: 'i-ph-eye',
      eyeOff: 'i-ph-eye-slash',
      file: 'i-ph-file',
      folder: 'i-ph-folder',
      folderOpen: 'i-ph-folder-open',
      hash: 'i-ph-hash',
      info: 'i-ph-info',
      light: 'i-ph-sun',
      loading: 'i-ph-circle-notch',
      menu: 'i-ph-list',
      minus: 'i-ph-minus',
      panelClose: 'i-ph-sidebar-simple',
      panelOpen: 'i-ph-sidebar-simple',
      plus: 'i-ph-plus',
      reload: 'i-ph-arrow-counter-clockwise',
      search: 'i-ph-magnifying-glass',
      stop: 'i-ph-square',
      success: 'i-ph-check-circle',
      system: 'i-ph-monitor',
      tip: 'i-ph-lightbulb',
      upload: 'i-ph-upload',
      warning: 'i-ph-warning'
    }
  }
})
