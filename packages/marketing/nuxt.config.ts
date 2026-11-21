/**
 * Chrome-Layer der Marke Pukalani (marketing) — s. product.manifest.ts.
 *
 * Hier liegen Kopf und Fuß der öffentlichen Seiten GENAU EINMAL, dazu ihre
 * Marken-CSS-Brücke, ihre i18n-Schlüssel und die Link-Auflösung. Wer den Layer
 * in `extends` aufnimmt, bekommt beide Bauteile per Auto-Import und muss sie
 * nur noch in sein Layout stellen.
 *
 * ZWEI BETRIEBSARTEN, EIN CODE (siehe app/app.config.ts): auf pukalani.app
 * (`pukalani.marketing.home = true`) lösen die internen Ziele über Route-NAMEN
 * auf, überall sonst über absolute URLs auf pukalani.app. Ein Kopf, der auf
 * help.pukalani.app `localePath({ name: 'faq' })` rechnete, zeigte dort ins
 * Leere — die Route gibt es nur in apps/marketing.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  // puka-theme.css = Theme-Brücke (eigene `puka`-Palette + --ui-primary), MUSS
  // vor marketing.css stehen; marketing.css = Licht-Dramaturgie (§6.3 des
  // Konzepts), gescopet auf body.marketing-site, damit sie nicht in
  // Login/Dashboard-Layouts der Layer blutet.
  //
  // ABSOLUTER Pfad über `join(currentDir, …)` wie im Core- und im
  // themes-Layer: ein relativer css-Eintrag (`~/assets/…`) löst gegen die
  // KONSUMIERENDE App auf, nicht gegen den Layer — die Datei wäre dort nicht
  // zu finden.
  css: [
    join(currentDir, './app/assets/css/puka-theme.css'),
    join(currentDir, './app/assets/css/marketing.css'),
  ],

  /**
   * DIE BILDMARKE IM TAB (Davids Befund 2026-08-19): beide Marken-Sites
   * beantworteten /favicon.ico mit 404 — der Browser-Tab blieb ohne Zeichen.
   * Die Dateien liegen im public/ DIESES Layers (Layer-public wird von den
   * erbenden Apps ausgeliefert, dasselbe Muster wie public/themes/* im
   * themes-Layer) und sind aus der puka in packages/core/app/components/PukaMark.vue abgeleitet:
   * favicon.svg (Original, skaliert verlustfrei), favicon.ico (32er-PNG im
   * ICO-Mantel für Alt-Konsumenten), apple-touch-icon.png (iOS nimmt NUR
   * Bitmaps, mit hellem Grund — dieselbe Begründung wie in
   * packages/themes/shared/brandIcon.ts).
   *
   * Die Links stehen EXPLIZIT im Kopf, damit nicht der Browser-Fallback
   * entscheidet (der fragte auf help unter /de/… relativ an und lief ins
   * 404). Das Mandanten-Favicon-Gate (`pukalani.seo.tenantFavicon`, themes)
   * ist davon unberührt — diese Apps erben den themes-Layer nicht.
   */
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', sizes: '32x32', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  // Layer-Keys mergen mit den Locales der App (gleicher code). Der Layer
  // bringt AUSSCHLIESSLICH die Schlüssel mit, die seine eigenen Bauteile
  // rendern (marketing.nav.* + marketing.footer.*) — was er nicht mitbringt,
  // stünde auf einer fremden App als ROHER SCHLÜSSEL im Markup.
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],

    /**
     * EIN SPRACH-MERKER FÜR DIE MARKEN-SITES (Davids Befund 2026-08-19):
     * pukalani.app und help.pukalani.app sind zwei Hosts, und der Core-Cookie
     * `i18n_redirected` gilt pro Host — wer auf der Hilfe auf Deutsch
     * wechselte, kam auf eine englische Marketing-Seite zurück, und wegen
     * `redirectOn: 'all'` schlug deren eigener (englischer) Merker sogar den
     * `/de`-Link aus dem Hilfe-Chrome. Deshalb teilen sich die Sites, die
     * diesen Layer erben, EINEN Domain-Cookie (`Domain=.pukalani.app`).
     *
     * ZWEI DINGE DARAN SIND PFLICHT, nicht Geschmack:
     *  - EIGENER NAME (`pukalani-lang`) statt `i18n_redirected`: auf beiden
     *    Hosts liegen bereits Host-Cookies mit dem alten Namen. Host- und
     *    Domain-Cookie gleichen Namens reisen BEIDE im Request, und welcher
     *    zuerst steht, entscheidet der Browser — der Server läse mal den
     *    alten, mal den neuen Wert. Der neue Name lässt die Altlast einfach
     *    ungelesen liegen (dasselbe Muster wie `pukalani-appearance`, F53).
     *  - NUR IM PROD-BUILD (`NODE_ENV`): auf localhost wird ein Cookie mit
     *    `Domain=.pukalani.app` vom Browser VERWORFEN — die Sprachwahl
     *    hielte im Dev keinen Seitenwechsel. Lokal reicht der Host-Cookie
     *    ohnehin: alle Dev-Server teilen sich `localhost`, Ports zählen für
     *    Cookies nicht.
     *
     * BEWUSST NUR DIE MARKEN-SITES: Mandanten-Communities, account.* und
     * demo.* erben diesen Layer nicht und behalten ihre Wahl pro Host — eine
     * Community darf deutsch bleiben, während www englisch ist. Der
     * Domain-Cookie reist zwar auch zu diesen Hosts mit, wird dort aber nie
     * gelesen (anderer cookieKey).
     */
    detectBrowserLanguage: {
      cookieKey: 'pukalani-lang',
      cookieDomain: process.env.NODE_ENV === 'production' ? '.pukalani.app' : undefined,
    },
  },

  // Ziel-Links der Marketing-CTAs (useProductLinks). Die Werte sind die
  // PROD-Hosts; lokal/Staging per Env überschreibbar — ohne Skeleton-Key
  // mappt die Env-Var ins Leere (gleiches Muster wie appUrl im Core).
  // Env: NUXT_PUBLIC_MARKETING_START_URL / _SIGN_IN_URL / _DEMO_URL /
  //      _REQUEST_URL
  //
  // Sie stehen im LAYER und nicht in der App, weil Kopf und Fuß sie lesen —
  // jede App, die den Chrome zeigt, braucht sie also. Layer-Configs mergen
  // mit der App; ein App-eigener Wert gewinnt weiterhin.
  runtimeConfig: {
    public: {
      // Kundenbereich. Seit AH-1 (2026-08-11) EIN Name: account.pukalani.app
      // (vorher my.pukalani.app, davor app.pukalani.app). Die Altnamen leiten
      // 301 weiter — hier steht trotzdem der heutige, damit eine beworbene URL
      // nicht dauerhaft über einen Umweg läuft.
      marketingStartUrl: 'https://account.pukalani.app/register',
      marketingSignInUrl: 'https://account.pukalani.app/login',
      marketingDemoUrl: 'https://demo.pukalani.app',
      /**
       * Zugang anfragen (U3, 2026-08-10) — das Ziel für jede Absicht, die
       * KEIN Selbstbedienungs-Kauf ist (Early Access). Vorher zeigten diese
       * Knöpfe auf `/login`: der Besucher wollte etwas hinterlassen und bekam
       * ein Passwortfeld.
       *
       * `/request-access` IN BEIDEN SPRACHEN: der Kundenbereich lokalisiert
       * seine Adressen seit U8 (Trichter-Befund M5, 2026-08-11) nicht mehr —
       * nur die Marketing-Seite tut das (`/produkte` ↔ `/products`). Die Seite
       * trägt `defineI18nRoute({ paths: { de: '/request-access', en:
       * '/request-access' } })` (packages/onboarding/app/pages/anfragen.vue —
       * der DATEIname bleibt, weil an ihm der Routen-Name hängt, über den die
       * internen Links laufen). Die App steht auf `prefix_except_default` mit
       * `en` als Vorgabe: ein deutschsprachiger Besucher wird von
       * `detectBrowserLanguage` (`redirectOn: 'all'`) von hier auf
       * `/de/request-access` weitergeleitet, genau wie bei `/register` oben.
       * Die alte `/de/anfragen` bleibt als 301 erhalten.
       */
      marketingRequestUrl: 'https://account.pukalani.app/request-access',
      /**
       * ZUSTAND DES EARLY-ACCESS-TORS (U2, Davids Entscheidung 8 vom
       * 2026-08-10): braucht eine eigene Community gerade einen
       * Einladungs-Code? Die Landing beschriftet ihre Haupt-CTAs danach —
       * dynamisch, damit das Umlegen des Schalters im Betreiber-Dashboard kein
       * Text-Deploy hier ist.
       *
       * Gelesen wird AUSSCHLIESSLICH serverseitig (server/api/gate.get.ts) —
       * dass der Wert unter `public` steht, ist nur der Skeleton-Mechanismus
       * für die Env-Var. Es gibt hier nichts zu verbergen: die Antwort ist ein
       * Ja/Nein, das anschließend auf der Startseite steht.
       *
       * Env: NUXT_PUBLIC_MARKETING_GATE_URL
       */
      marketingGateUrl: 'https://account.pukalani.app/api/onboarding/gate',
    },
  },
})
