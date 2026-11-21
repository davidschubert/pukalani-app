---
paths:
  - "**/i18n/locales/*.json"
  - "**/app.config.ts"
  - "**/app.vue"
  - "**/pages/**"
  - "**/llms.txt*"
  - "**/robots.txt*"
  - "**/*Sitemap.ts"
  - "packages/core/shared/aiCrawlers.ts"
  - "**/*sonLd.ts"
  - "scripts/check-i18n-keys.mjs"
  - "**/product.manifest.ts"
  - "scripts/lib/customer-words.mjs"
  - "packages/core/shared/seoOrigin.ts"
  - "packages/core/app/composables/useLocaleSeoHead*"
---

## i18n, Formulare und SEO — die Fallen, die kein Test sieht

- Zod für alle Formulare (Schemas als `create*Schema(t)`-Factories), i18n-Keys
  für jeden sichtbaren Text (keine hartcodierten Strings in Markup/Toasts);
  `@` in Locale-Messages als `{'@'}` escapen.
- KEINE SPITZEN KLAMMERN IN LOCALE-MESSAGES: ein Platzhalter wie
  `/discussions/<adresse>` gilt nuxt-i18n als HTML — der Compiler steigt auf
  dem CLIENT aus, SSR rendert noch übersetzt, im Browser stehen rohe Schlüssel,
  Hydration-Mismatch. Unit-Tests, Typecheck und Lint sehen es NICHT, nur
  `nuxt-i18n WARN Detected HTML in 1 message` im Dev-Log. Platzhalter ohne
  Klammern schreiben (`/discussions/adresse`).
- EIN SCHLÜSSEL IN EINER CONFIG IST EIN VERSPRECHEN: `pnpm check:i18n-keys`
  (läuft mit lint) prüft, dass jeder in einer `app.config` deklarierte
  i18n-Schlüssel in JEDER erbenden App existiert, beide Sprachen. Effektive
  Schlüsselmenge = Locale-Dateien der App UND aller Layer aus ihrem `extends`;
  effektive Config = App über Layern mit defu-Semantik (Arrays konkateniert).
  Nötig, weil ein `labelKey` von einem FREMDEN Layer gerendert wird und
  vue-i18n bei fehlender Übersetzung den SCHLÜSSEL ausgibt. NEUES CONFIG-FELD
  MIT SCHLÜSSEL ⇒ in die `FIELDS`-Tabelle von `scripts/check-i18n-keys.mjs`,
  sonst ist es ungedeckt.
- ZWEITER TEIL (Q03): derselbe Lauf liest jeden FEST genannten Schlüssel —
  `t('…')`, `$t('…')`, `keypath="…"` in `app/` und `shared/` — und verlangt ihn
  in JEDER App, die die Datei mitbringt, in beiden Sprachen
  (`scripts/lib/i18n-static-keys.mjs`, Test mit Gegenproben
  `packages/core/tests/checkI18nKeys.test.ts`). NICHT gelesen werden
  zusammengesetzte Schlüssel (t(`a.${x}`)), `te()`, `server/` (dort heißt auch
  eine eigene Hilfe `t`) und Felder wie `labelKey:` im Code — dort selbst
  prüfen.
- EIN WORT JE SACHE (Q16): Kundentexte (Werte der Sprachdateien,
  `customerDescription` im Manifest) halten die Wortliste; rot macht
  `pnpm check:customer-words` (Liste, Ausnahmen mit Grund:
  `scripts/lib/customer-words.mjs`). Kern:

  | de | nicht | en | nicht |
  | --- | --- | --- | --- |
  | Konto | Account | account | prefs |
  | Einladungscode | Einladungs-Code | invite code | invitation code |
  | Markenberater | — | brand advisor | brand consultant |
  | Marke, Marken entdecken | Brand(s), Discover Brands | brand | — |
  | Brand Score | Brand-Score | Brand Score | — |
  | Upvote · Downvote | Hochvoten | upvote · downvote | — |
  | hier · diese Site · eigene Plattform | Instanz | here · this site | instance |

  Dazu ß statt ss, deutsche Menüpunkte auf deutschen Seiten (Produkte,
  Über uns), keine Schicht-Nummern. ANREDE je Site: Pool „du“ (die Community
  „ihr“), pukalani.studio „Sie“ und „wir“, branding.supply Werbung „ihr“,
  hinter der Anmeldung die Weiche `profile.team`; Knöpfe auf Werbeseiten ohne
  Anrede („Branding starten“). Mehrzahl als `{count} Zusage | {count} Zusagen`
  und `t(key, { count }, count)`. Ein optionales Produkt braucht
  `customerDescription` — `description` ist der Entwickler-Text.
- EIN NAME JE SPRACHE IN DER ADRESSE BRAUCHT DEN RÜCKWEG (Q03): die
  Sprach-Erkennung (`redirectOn: 'all'`) übersetzt nur den FESTEN Teil einer
  Adresse, bevor die Seite lädt (`/products/posts` → `/de/produkte/posts`).
  Eine `[slug]`-Seite mit übersetzten Namen sucht bei einem Fehlgriff in der
  ANDEREN Sprache und leitet per 301 über `localePath()` um (sie ZEIGT die
  Seite dort nicht, sonst zwei Adressen). Vorbild `matchProductSlug` /
  `matchAudienceSlug` in `packages/marketing/shared/marketing.ts`, Test
  `apps/marketing/tests/localeSlugRedirect.test.ts`. Beweis nur mit
  `Accept-Language` der anderen Sprache.
- i18n-STRATEGIE `prefix_except_default` (en ohne Prefix, de unter `/de/*`),
  `redirectOn: 'all'` (jede Seite folgt dem `i18n_redirected`-Cookie), BEWUSST
  ohne `fallbackLocale` (signallose Requests wie Crawler behalten die
  URL-Locale, sonst EN-Content unter `/de/*`). Interne Links/Redirects IMMER
  über `localePath()` — auch in Middleware (`useLocalePath()('/...')`), sonst
  fällt der Locale-Prefix weg.
- SEO-KOPF: jede `app.vue` ruft `useLocaleSeoHead()` (core); es ist der EINZIGE
  Ort für hreflang/canonical/og:url/og:locale/og:image + `lang`/`dir`. Daneben
  setzt eine `app.vue` mit `useHead`/`useSeoMeta` nur, was diese Felder nicht
  berührt (z. B. robots-Darstellung, `bodyAttrs`, `ogSiteName`). Absolute URLs
  über `NUXT_PUBLIC_I18N_BASE_URL`. MEHR-HOST-Apps (Pool) setzen zusätzlich
  `pukalani.seo.originFromRequest`: Host+Port aus dem Request, nur das SCHEMA
  aus der Env (`core/shared/seoOrigin.ts`) — sonst zeigen canonical/hreflang/
  og:url auf allen Mandanten-Hosts auf dieselbe Basis (Befund B1).
- og:image NIE IN EINER SEITE: Produkt-Layer tragen den Pfad in
  `useBrandOgImage()` ein, `useLocaleSeoHead()` macht absolute URL, Maße, Typ
  und `twitter:card`. Vorschaubilder sind Rasterbilder, **nie SVG**
  (Facebook/WhatsApp/LinkedIn zeigen SVG nicht).
- JE COMMUNITY `/og/<key>.png` (1200×630, Gate `pukalani.seo.tenantOgImage`,
  Route `apps/platform/server/routes/og/[key].get.ts`), gerastert OHNE
  Laufzeit-Renderer: der Zeichen-Atlas ist einmal gebacken
  (`packages/themes/scripts/generate-brand-card-font.mjs` →
  `packages/themes/shared/brandCardFont.gen.ts`, committet, server-only,
  BEWUSST NICHT im `check:themes`-Gate — das Ergebnis hängt an den Schriften
  der backenden Maschine). Der Schlüssel in der URL ist NIE Eingabe (sonst
  füllt ein Bot mit erfundenen Schlüsseln die Platte), nur Cache-Brecher;
  Ablage in `tmpdir()` (`apps/platform/server/utils/brandImageStore.ts`), nie
  in `.output` (Release-Slots wechseln den Pfad).
- EINE SITE OHNE EIGENES BILD JE SEITE trägt ein festes Bild in ihrer
  `app.vue` ein (`useBrandOgImage().value = { path: '/og/…' }`, committete
  Datei unter `public/`); Hilfe und branding.supply erzeugt
  `scripts/og-site-cards.mjs`.
- SITEMAP-LISTEN VON HAND brauchen einen Vergleichstest gegen den
  Seiten-Ordner (Vorbilder `apps/marketing/tests/marketingRoutes.test.ts`,
  `apps/portfolio/tests/siteRoutes.test.ts`,
  `apps/branding/tests/brandingSitemap.test.ts`); die Hilfe baut ihre Sitemap
  aus den Inhalten.
- NEU — EINE AUSSAGE, EINE QUELLE: Ort, Preis, Zugang und Beta-Zustand stehen
  je Site EINMAL; Seitentext, `description`, JSON-LD und `llms.txt` lesen von
  dort, statt sie abzuschreiben. Vorbild: die Preise der Studio-Site in
  `apps/portfolio/app/data/home.ts` (`SERVICES`), gelesen von der Startseite
  und von `apps/portfolio/server/routes/llms.txt.get.ts` (Beweis
  `apps/portfolio/e2e/seo-routes.spec.ts`). Ändert eine Entscheidung das
  Verhalten, endet der PR mit `git grep` nach dem alten Satz in allen
  Sprachdateien. Feste Wörter für neuen Text: Konto/account ·
  Einladungscode/invite code · Markenberater/brand advisor.
- KI-CRAWLER (B2, Q11): jede `robots.txt` baut mit `buildRobotsTxt()` aus
  `packages/core/shared/aiCrawlers.ts` — eigene Seiten `own` (alles),
  öffentliche Community `community` (kein Training), geschlossene `closed`.
  Neuer Crawler-Name nur mit Quelle beim Anbieter. Wächter:
  `packages/core/tests/aiCrawlers.test.ts` (jede Route), täglich
  `scripts/ops/verify-delivery.mjs` (Prüfung `ki`). Eine Bitte, keine Sperre.
- COMMUNITY-INHALT FÜR DIE SUCHE (Q10): jede Community hat eine Hauptsprache
  (`primaryLocale`, Profil-Feld `locale`); eine Seite mit Nutzerinhalt ruft
  `useCommunityContentSeo()`, dann zeigen `canonical` und `og:url` beider
  Sprach-Adressen auf die der Hauptsprache (eine maßgebliche Adresse je
  Beitrag, beide antworten 200). Konto-Seiten und Betreiber-Oberfläche tragen
  `noindex`. Herleitung: Eintrag Q10 in `OPEN-ITEMS-COMPLETE.md`.
