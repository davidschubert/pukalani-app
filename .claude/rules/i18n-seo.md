---
paths:
  - "**/i18n/locales/*.json"
  - "**/app.config.ts"
  - "**/app.vue"
  - "**/pages/**"
  - "scripts/check-i18n-keys.mjs"
  - "packages/core/shared/seoOrigin.ts"
  - "packages/core/app/composables/useLocaleSeoHead*"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-11-08 (Token-Hygiene, SH1 e): lädt
     automatisch, sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen
     (cat/sed) diese Datei bewusst per Read öffnen. Wortlaut unverändert. -->

## i18n, Formulare und SEO — die Fallen, die kein Test sieht

- Zod für alle Formulare (Schemas als create*Schema(t)-Factories),
  i18n keys für User-facing Strings (keine hartcodierten Strings im Markup/Toasts);
  '@' in Locale-Messages als {'@'} escapen. KEINE SPITZEN KLAMMERN in
  Locale-Messages (2026-08-04 live erwischt): `/discussions/<adresse>` als
  Platzhalter hielt nuxt-i18n für HTML — der Nachrichten-Compiler steigt dann
  auf dem CLIENT aus, SSR rendert noch übersetzt, im Browser stehen rohe
  Schlüssel (`home.title`), daraus folgt ein Hydration-Mismatch und die
  gesamte Client-Seite ist unzuverlässig. Zwei E2E-Specs (Realtime-Pille,
  Embed-Composer) starben daran; Unit-Tests, Typecheck und Lint sehen es NICHT,
  nur `nuxt-i18n WARN Detected HTML in 1 message` im Dev-Log. Platzhalter ohne
  Klammern schreiben (`/discussions/adresse`).
- EIN SCHLÜSSEL IN EINER CONFIG IST EIN VERSPRECHEN (Wächter seit 2026-08-06):
  `pnpm check:i18n-keys` (CI/lint) prüft, dass jeder in einer `app.config`
  deklarierte i18n-Schlüssel in JEDER App existiert, die ihn erbt — beide
  Sprachen. Die effektive Schlüsselmenge ist die Vereinigung der Locale-Dateien
  der App UND aller Layer aus ihrem `extends`; die effektive Config ist
  App-über-Layern mit defu-Semantik (Arrays konkateniert). Nötig, weil ein
  `labelKey` von einem FREMDEN Layer gerendert wird (der Fuß gehört blueprint,
  der Text der App) und vue-i18n bei fehlender Übersetzung den SCHLÜSSEL
  ausgibt: `apps/comments` schrieb am 2026-08-02 `labelKey: 'legal.imprint'`
  ohne den Schlüssel anzulegen, und vier Tage lang stand im Fuß von
  comments.pukalani.app wörtlich `legal.imprint` — Typecheck, Lint und
  Unit-Tests sehen davon nichts. NEUES CONFIG-FELD MIT SCHLÜSSEL ⇒ in die
  `FIELDS`-Tabelle von `scripts/check-i18n-keys.mjs` eintragen, sonst ist es
  ungedeckt. Der Wächter prüft BEWUSST nur Config-Schlüssel, keine
  `t()`-Aufrufe im Markup — Begründung im Kopf des Skripts.
- i18n-Strategie 'prefix_except_default' (en Default ohne Prefix unter /...,
  de unter /de/*, detectBrowserLanguage redirectOn: 'all' → jede Seite folgt dem
  i18n_redirected-Cookie, nicht nur '/'; BEWUSST ohne fallbackLocale — signal-
  lose Requests wie Crawler behalten die URL-Locale, sonst EN-Content unter
  /de/*): interne Links/Redirects IMMER über localePath() — auch in Middleware
  (useLocalePath()('/...')), sonst geht der Locale-Prefix verloren. SEO:
  useLocaleSeoHead() (core) ist der EINZIGE Aufruf in jeder app.vue und liefert
  hreflang/canonical/og:url/og:locale + lang/dir; absolute URLs via
  NUXT_PUBLIC_I18N_BASE_URL (i18n.baseUrl-Skeleton in core). MEHR-HOST-Apps
  (Pool) setzen zusätzlich pukalani.seo.originFromRequest: dann kommt Host+Port aus
  dem Request und nur das SCHEMA aus der Env (core/shared/seoOrigin.ts) — mit
  der einen Env-Basis zeigten canonical/hreflang/og:url auf ALLEN Mandanten-
  Hosts auf platform.pukalani.app (Audit-Befund B1). og:image gehört EBENFALLS
  dorthin (nie in eine Seite): Produkt-Layer tragen den Pfad in
  useBrandOgImage() ein, useLocaleSeoHead() macht die absolute URL + Maße/Typ/
  twitter:card. Je Community `/og/<key>.png` (1200×630, Gate
  pukalani.seo.tenantOgImage) — **PNG, nicht SVG**: Facebook/WhatsApp/LinkedIn
  zeigen SVG als og:image nicht. Gerastert OHNE Laufzeit-Renderer: Chrome hat
  die Zeichen EINMAL in ein Atlas gebacken (packages/themes/scripts/
  generate-brand-card-font.mjs → shared/brandCardFont.gen.ts, committet,
  server-only, BEWUSST NICHT im check:themes-Gate — das Ergebnis hängt an den
  Schriften der backenden Maschine). Der Schlüssel in der URL ist NIE Eingabe
  (sonst füllt ein Bot mit erfundenen Schlüsseln die Platte), sondern nur
  Cache-Brecher; Ablage in tmpdir(), nie in .output (Release-Slots wechseln
  den Pfad)
