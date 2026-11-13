export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Core-Defaults sind
  // bewusst konservativ (analytics/consent aus, keine OAuth-Buttons) — die App
  // aktiviert explizit, was sie braucht:
  // pukalani: {
  //   analytics: true,
  //   consent: true,
  //   auth: { providers: ['github'], termsUrl: '/agb', otp: true },
  // }
  pukalani: {
    brand: { name: 'Pukalani Control' },
    // DIE ADRESSE DIESER KONSOLE ist `admin.pukalani.app` (AH-4, 2026-08-11).
    // Der Altname `control.pukalani.app` ist seit AH-4b (2026-08-18, Davids
    // Entscheidung) BEWUSST tot: die ploi-Site wurde im Panel wirklich
    // umbenannt, der Altname faellt in die Wildcard-Site platform und
    // antwortet 404. Die 301-Middleware (00.legacy-console-hosts.ts) und ihre
    // adminConsole-Config sind mit dem Verzicht entfernt — der Host war rein
    // betreiber-intern, der Stripe-Webhook zeigt seit AH-4 auf admin. Der Name
    // bleibt in RESERVED_SUBDOMAINS gesperrt (Phishing).
    // Betreiber-Login per OTP-Code (H2-Live): der Control-Admin braucht kein
    // Passwort — Prod-Konto wurde server-seitig ohne Passwort angelegt.
    //
    // GOOGLE hier ist die ERSTE von ZWEI Bedingungen (core/shared/
    // oauthProviders.ts): der Knopf erscheint erst, wenn die INSTANZ ihn
    // zusätzlich in `NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS` nennt. Diese Zeile ist
    // also wirkungslos, solange die Server-Env leer ist — genau so ist es
    // gedacht, denn Client-Id und Geheimnis liegen in der Appwrite-Console
    // des Projekts `admin`, nicht im Quelltext.
    //
    // WARUM ÜBERHAUPT (Davids Entscheidung 2026-08-21): dies ist die
    // privilegierteste Oberfläche der Plattform, und ihr EINZIGES Konto hatte
    // keinen zweiten Faktor. Über Google erbt der Login den Schutz des
    // Google-Kontos. Die Redirect-URI endet auf `/admin` — die Projekt-Id,
    // NICHT auf `/control` (das Projekt ist seit 2026-08-19 gelöscht).
    auth: { otp: true, termsUrl: '/terms', providers: ['google'] },
    // Stripe-Transport des billing-Layers aktivieren (A6: Community-Billing).
    // plans bleibt leer — das Control verkauft keine Site-Abos an Endnutzer;
    // die Pläne leben in pukalani.control.plans (lookup_keys).
    billing: { enabled: true },
    // KI-Triage des Ticket-Boards (P3, Davids Entscheidung 2026-08-18):
    // Layer-Default ist AUS, die App schaltet explizit ein. Modell/baseUrl
    // kommen per tiefem Merge aus dem tickets-Layer (OpenRouter, haiku);
    // die Laufzeit-Übersteuerung bleibt app_config.ticketsAiModel
    // (Board-Einstellungen). Ohne NUXT_TICKETS_AI_KEY in der Server-.env
    // bleibt isAiAvailable() trotzdem false — der Key ist die zweite Hälfte
    // (Pflicht-Eintrag in scripts/ops/verify-site-env.mjs, F44-Netz).
    tickets: { ai: { enabled: true } },
    // Interne Projekt-Doku (/docs) in der Betreiber-Nav. Kein productKey —
    // die Doku gehört keinem Produkt-Layer, sie ist Teil DIESER App; die
    // Autorität bleibt server/middleware/docs-guard.ts.
    admin: {
      modules: [
        {
          // F55: Stripe-Verwaltung — Schlüssel, Preise, Webhook, Status.
          // BEWUSST HIER in der App und nicht im admin- oder control-LAYER:
          // die Routen (/api/control/stripe/*) liegen in DIESER App, weil sie
          // den control-Plan-Katalog mit dem billing-Stripe-Transport
          // komponieren (A14 — die Layer kennen sich nicht). Ein Eintrag im
          // Layer hätte `apps/comments` einen Menüpunkt ins Leere gegeben,
          // genau wie es die harte Reiter-Liste in
          // packages/admin/app/pages/dashboard/admin.vue täte.
          //
          // placement 'bottom' statt einer Gruppe — aus demselben Grund wie
          // beim Doku-Eintrag weiter unten: die Betreiber-Gruppen sind
          // 'platform' (Communities), 'studio' (Websites) und 'management'
          // (Werkzeuge). Stripe ist keins davon, sondern INSTANZ-UNTERBAU
          // neben Nutzer · Admin · Speicher · System, und man geht selten
          // hin. Die Gruppe 'settings' wäre falsch: sie gehört der
          // Community-Ebene, und eine Gruppe mischt keine Ebenen (E9).
          id: 'stripe',
          scope: 'operator',
          labelKey: 'control.stripe.nav',
          icon: 'i-ph-credit-card',
          to: '/dashboard/stripe',
          requiredCapability: 'system.manage',
          placement: 'bottom',
          order: 2,
        },
        {
          // E9: Betreiber-Ebene, und laut Davids Struktur gehört die
          // Dokumentation nach UNTEN zum Instanz-Unterbau (Nutzer · Admin ·
          // Speicher · System) — daher placement 'bottom' statt einer Gruppe.
          id: 'internal-docs',
          scope: 'operator',
          labelKey: 'control.docs.nav',
          icon: 'i-ph-book-open-text',
          to: '/docs',
          requiredCapability: 'dashboard.access',
          placement: 'bottom',
          order: 1,
        },
      ],
    },
    // AI-Runner: der Link einer Lauf-Ende-Meldung führt aufs zugehörige Ticket.
    // Das Mapping gehört HIERHER und nicht in den runner-Layer (A14): nur DIESE
    // App komponiert runner UND tickets, der Layer kennt tickets nicht. Der
    // Absender (finish.post.ts) hängt die subjectId ans Präfix.
    runner: { subjectLinks: { ticket: '/dashboard/tickets?ticket=' } },
    // C17: DIESE App ist der Leser der kontobezogenen Meldungen. Beide
    // `scope: 'account'`-Absender leben hier (Stripe-Webhook im billing-Layer,
    // Early-Access-Anfragen im control-Layer) und schreiben in DIESES
    // Appwrite-Projekt — die Empfänger sind Konten dieses Projekts (der
    // Betreiber unter /dashboard). Ohne blueprint gibt
    // es hier kein Community-Chrome, das die Glocke registriert; der Schalter
    // hängt sie in beide Shells (core-default-Layout + Dashboard).
    chrome: { accountBell: true },
    // Footer-Rechtslinks → die editierbaren pages-Seiten (Layer pages).
    legalLinks: [
      { to: '/imprint', labelKey: 'legal.imprint' },
      { to: '/terms', labelKey: 'legal.terms' },
      { to: '/privacy', labelKey: 'legal.privacy' },
    ],
  },
  ui: {},
})
