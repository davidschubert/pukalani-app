# Pukalani Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo — Marke **Pukalani** (der lokale Ordner heißt weiterhin
`maui-monorepo`, ebenso das GitHub-Repo) — mit zentralem Core Layer + Produkt-Layern.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.5.x (Composition API, SSR), Nuxt UI 4.10.x, Pinia 4, Tailwind CSS 4
- node-appwrite 29 (Server SDK) + appwrite 27 (Web SDK, NUR Realtime) — Appwrite self-hosted
  **2.6.1** (dev + CI seit 2026-10-23, prod seit 2026-10-24 — PHP 8.5.12;
  MariaDB bleibt. Sprung auf 2.6.1 (PHP 8.5.12, CVE-2026-109618/-9):
  docs/runbooks/APPWRITE-2-6-UPGRADE.md — Client-IP jetzt „rechtester nicht
  vertrauter Hop" (`_APP_TRUSTED_PROXIES` braucht die Nuxt-Server-IP), das
  Werkzeug lädt die Override MIT und braucht darin ABSOLUTE Mount-Pfade. 2.0→2.2
  (EIN `appwrite-worker`, EINE Organisation): APPWRITE-2-2-UPGRADE.md; Fallen
  des Werkzeugs: APPWRITE-2-0-UPGRADE.md)
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Produkt-Layer (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [produkt-layer..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- SILO-REGEL (Davids Entscheidung 2026-08-04): Isolation im CODE und im
  DEPLOYMENT sind ZWEI Entscheidungen. Neues Produkt ⇒ IMMER eigener Layer,
  aber standardmäßig KEINE eigene Site/Instanz (Kosten: Migrationen je
  Instanz, Env-Drift, TLS, Schema-Parity) — Playground + demo.pukalani.app
  reichen; eine Site nur mit kundenförmigem Grund. `comments` ist seit F3 (2026-08-12) eine POOL-COMMUNITY —
  der Ordner apps/comments bleibt als CODE der E2E-Anker und der Beweis der
  Studio-Form (App-ohne-Deployment wie `photos`); Silo-DEPLOYMENTS sind seit
  der Kehrtwende vom 2026-08-31 ZWEI: portfolio (Davids eigene Site) und
  branding.supply (apps/branding, Appwrite-Projekt `branding`, Server-Port
  3007 — Dev-Port 3010, zwei getrennte Achsen). Der kundenförmige Grund ist
  Davids Entscheidung selbst: der Brand-Wizard lebt von Tag eins unter
  eigener Marke mit eigenem Konten-Stamm statt im portfolio-Silo (P1b
  zurückgebaut) — docs/plans/BRANDING-SUPPLY-INFRA.md.
  DECISION-LOG 2026-08-04.
- Produkt-Manifeste (Plattform-Strategie F1): JEDER Layer hat
  product.manifest.ts (key/tier/requires/Katalog-Texte, nur `import type`!),
  JEDE App site.manifest.ts = Single Source der Produkt-Wahl.
  `pnpm check:manifests` (CI/lint) erzwingt Konsistenz mit extends +
  package.json + migrate.mjs-LAYER_ORDER — neue Layer/Apps immer mit
  Manifest anlegen. `apiPrefixes` im Manifest ⇒ `server/plugins/
  product-manifest.ts` mit `registerProductManifest(manifest)` PFLICHT
  (PM1, 2026-09-09; Ausnahmeliste im Skript, heute leer): das Manifest ist
  `import type`-only, erst das Plugin macht Notabschaltung, Produkt-Gate und
  Katalog wirksam — `market` fuhr so wochenlang tot, Typecheck/Lint/Tests
  sehen das nicht. Live-Beweis: der Key steht in `/api/platform/products`.
  Strategie: docs/referenz/MULTI-SITE-PLATFORM-STRATEGIE.md
- packages/blueprint = KOMPOSITIONS-Layer („Bauplan", seit 2026-07-27): der
  EINZIGE Layer, der mehrere Produkt-Layer kennen darf — Produkt-
  Kompositionen (Feed+Kommentare, …) existieren GENAU EINMAL hier, nie je
  App (Pool und Silo müssen identisches Produktverhalten zeigen —
  docs/referenz/PRODUKT-BILANZ.md). In extends VOR den Produkt-Layern listen.
  Keine Produkt-Logik, keine Tables, kein server/ in blueprint.
- Layer-Grenzen-Matrix (wer darf was besitzen) + Durchsetzung: CONCEPT.md A14.
  Neue Cross-Layer-Abhängigkeiten als EXPLIZITE Verträge (kein impliziter
  Auto-Import/String-Coupling); ESLint no-restricted-imports als Backstop.
  Fundament-Layer (core, geplant: moderation/system) hängen NIE von Produkten ab.

## Domänen-Regeln (.claude/rules — seit 2026-09-08, Token-Hygiene)
Diese Datei ist der KERN und liegt in jeder Runde und in jedem Subagenten im
Kontext (vorher 88 KB ≈ 44k Tokens je Runde). Die Domänen-Abschnitte sind
WORTGLEICH nach `.claude/rules/<name>.md` gezogen und laden per
`paths:`-Frontmatter nur, wenn eine passende Datei gelesen wird. Wer per
Bash liest (cat/sed) oder eine Domäne nur BERÄT, öffnet die Regel-Datei
bewusst per Read — sie gilt mit derselben Priorität wie CLAUDE.md:
- `appwrite.md` — TablesDB, Clients/Keys, Migrationen + indexStep, Realtime,
  Presence (Grenze, Vorfahrt)
- `themes.md` — Katalog/Generator, Custom Themes, Farbwelt-Regel (B5),
  Branding-Spiegel (D6), Favicon-Upload, Schriften, Settings-Hub + Switcher
- `hosts-ops.md` — admin./account./Altnamen, TLS-Fallen, drei Wächter,
  Env-Pflichtliste, RESERVED_SUBDOMAINS
- `onboarding.md` — Kontroll-Hosts, Anlegen im Control Plane, Mitglieder-
  Verwaltung, Stilllegen, „ehemaliges Mitglied", Beweise
- `ki-mail-embed-moderation.md` — aiComplete, UGC-Übersetzung, sendMail/
  Digest, Embed, Moderation, Microcache
- `tenant-isolation.md` — tenantDb (Datentür), as/actor, ESLint-Backstop,
  M13-Sperre, Site-Label (A5), Beitritt, Benachrichtigungen (C15/D5/C17), N7
- `editor.md` — UEditor gesetzt, Markdown-Kopplung, Erwähnungen + Handles
- `tests.md` — Worktree-Beweise, Ports, E2E-Fallen, Beweis-Regeln
- `ai-runner.md` — Daemon, Allowlist, Board

## Sitzungs-Hygiene (seit 2026-09-09) — docs/referenz/SESSION-HYGIENE.md
Jede Runde sendet den ganzen Kontext neu, das Limit ist über alle Modelle
geteilt. Kurzform: Session = Paket (danach neue Session über die Karte);
Erkunden an Explore/audit-scout, Bauen an Opus, Prüfen im Hauptloop; Sub-
Agent falsch ⇒ neu spawnen statt nachsteuern; Ausgaben deckeln (Ausschnitte,
`head`/`tail`, Playwright `--reporter=dot`, Screenshots nur als Endbeweis);
`/compact` nur vor einer Pause und mit Fokus; nichts Stilles einschalten
(Advisor, Workflows, Loops, MCP ohne Repo-Bezug).

# Compact instructions
Beim Compacten behalten: offene Beweise und ihre Gegenproben, geänderte
Dateien mit Grund, getroffene Entscheidungen (wer/wann/warum), der nächste
konkrete Schritt. Weglassen: Erkundungs-Zwischenstände, Tool-Ausgaben, die
schon in einer Datei stehen.

## Config-Gates (app.config.ts, Namespace pukalani.*)
- pukalani.analytics / pukalani.consent: Core-Default false, App aktiviert explizit
- pukalani.observability: strukturierte JSON-5xx-Logs am zentralen server/error.ts
  + Client-Error-Inbox (POST /api/telemetry/error, rate-limited); Core-Default
  aus, Sentry-Andockpunkt in core/server/utils/logEvent.ts
- pukalani.realtime.enabled (F14, seit 2026-08-01): der EINE Schalter für alle
  Realtime-Einstiege des Core — Row-Streams (useRealtimeRows), Presence
  (usePresence/-State) und den Account-WS (useRealtimeAccount). AUS heißt: kein
  Web-SDK nachgeladen, kein Socket, kein /api/auth/realtime-token. **Core-Default
  AN** — die begründete Ausnahme von „Core-Default ist IMMER aus": Realtime ist
  kein Zusatz, sondern das bestehende Verhalten jeder Produkt-App, und ein
  Default AUS entkoppelte sie stillschweigend (die Seite sieht richtig aus, sie
  aktualisiert sich nur nicht mehr). AUS in `marketing` + `help` (öffentlich,
  kontenlos, ohne themes-Layer — sie abonnierten `app_config` über den geerbten
  core-Layer, ohne die Flags je zu lesen). EINE pure Regel in
  core/shared/realtimeGate.ts (`realtimeAllowed(enabled, ...ids)` — Gate UND
  Datenebene; der `!databaseId`-Guard aus dem Live-Vorfall 2026-07-29 geht darin
  auf), gelesen an EINER Stelle (`realtimeEnabled()` in useRealtimeClient.ts,
  memoisiert). `ensureRealtimeClients`/`sharedRealtime`/`realtimeCookieClient`
  geben bewusst `… | null` zurück: der strict-Modus zwingt so JEDEN künftigen
  Konsumenten, „diese App hat keine Realtime" zu behandeln.
  ZWEITES GATE, ANDERE FRAGE (G5, 2026-08-03): das Config-Gate sagt, ob die APP
  Realtime hat — `startWhenHostResolves()` (core/app/utils/hostGate.ts) sagt, ob
  die SEITE dazu einen Host hat. Auf einem unbekannten oder `abuse`-gesperrten
  Host antwortet jeder Pfad 404, die Fehlerseite rendert aber MIT hydriertem
  Auth-Store (C12b) — der Account-WS lief los, und JEDER Abbruch zog
  `/api/auth/me` + `/api/community/role` nach (gemessen: 66 WS + 15 Requests in
  60 s, jetzt 1 + 0). JEDES neue client-Realtime-Plugin gehört in diese Klammer
  (heute: realtime-account, realtime-config, realtime-themes; realtime-branding
  steigt ohne `useSiteId()` ohnehin aus). Bedingung ist `isUnknownHostError`,
  NICHT `useError()` — auf einer Tippfehler-404 einer GESUNDEN Community läuft
  Realtime weiter, sonst verlöre man dort die Sofort-Abmeldung bei
  Session-Widerruf. Nachgeholt, sobald `clearError()` räumt. Der Auth-Nachtrag
  selbst hat zusätzlich einen Mindestabstand (`accountVerifyDue`, 30 s) — er ist
  der Verstärker bei jedem flappenden Socket, nicht nur auf 404-Hosts. Der feste
  1-s-Reconnect in der Konsole kommt aus dem Appwrite-Web-SDK (es nullt
  `reconnectAttempts` im `open`-Handler, erreicht seine Staffelung also nie);
  unser eigener Backoff staffelt 1→15 s und ist nicht das Problem.
- pukalani.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- pukalani.admin.modules: Modul-Registry der Dashboard-Nav — Produkt-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: registerUserDataContributor (core/server/utils/userData.ts) — Produkt-
  Layer registrieren Export/Löschung ihrer User-Daten per Nitro-Plugin
  (server/plugins/user-data.ts); core orchestriert (deleteUserCompletely:
  Snapshot → Sperren → Contributors → users.delete nur bei Voll-Erfolg).
  Neue Layer mit User-Daten MÜSSEN einen Contributor registrieren.
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Pläne & Produkte (P4-Rename 2026-07-26, Davids Pricing-Entscheid)
- Pool-Pläne heißen **basic / personal / pro** (vorher free/pro/business —
  normalizeTenantPlan() mappt Altwerte; Daten sind migriert). Enterprise ist
  KEIN Plan-Key: das ist das Silo-/Pukalani-Studio-Angebot. Preise: Personal
  29 €, Pro 149 €, jährlich −25 % (scripts/stripe/ensure-prices.mjs — zieht
  lookup_keys bei Betragsänderung auf neue Prices um).
- `basic` IST KEIN ANGEBOT MEHR, sondern der Zustand ohne Abo (F49, Davids
  Entscheidung 2026-08-07): ohne bezahltes Abo ist eine Community NUR-LESEND
  (M13-`billing`-Sperre) — nach der Testphase (trialSweep, rückwirkend auch
  Bestand), nach Kündigung (free-fallback SETZT die Sperre) und bei Verzug
  (unverändert 14 Tage). `plan: 'basic'` bleibt als Quota-Anker gesetzt.
  `shouldLiftBillingSuspension` hebt NUR bei `billingStatus === 'active'` auf
  (`!== 'past_due'` wäre der Gegenspieler der neuen Sperren); der Kauf öffnet
  im selben Webhook-Schreibvorgang, abuse-Sperren bleiben immer unangetastet.
  Preisseite www zeigt nur Personal + Pro (+ Enterprise-Kontakt); „kostenlos"
  ist das MITMACHEN (Konto), nie die eigene Community. Betreiber-Ausweg für
  Einzelfälle: `trialEndsAt` in die Zukunft setzen (der Sweep sperrt sonst
  binnen einer Stunde erneut, eine Betreiber-Entsperrung allein hält nicht).
- EIN Wort: „**Produkte**"/`products` — Kundensprache UND Code (E11, 2026-07-30;
  hebt die P4-Zeile „im CODE bleibt features" bewusst auf). product.manifest.ts,
  productKey, productGates, app_config.products, product_catalog,
  /api/platform/products. Das ZUSAMMENZIEHEN ist DURCH (control-025 inkl.
  idx_site_product, system-024, courses-004): alte Spalten/Tabellen und alle
  Übergangs-Spiegel/Aliasse sind entfernt — es gibt nur noch die
  product-Namen. AUSNAHMEN (bleiben `feature`): `featured` („hervorgehoben"),
  UPageFeature (Nuxt UI), Changelog-Kategorie `feature` (= „Neuerung",
  Daten-Wert), Migrations-Dateien (Protokoll).
- Produkt-Gating im Pool: pukalani.tenancy.products (Produkt-Key → Mindest-Plan,
  Plan-Ordnung = Reihenfolge der quota.plans-Keys) + requirePlanProduct(event,
  key) an den API-Einstiegen (posts = personal, ai = pro; 404 wie Datentür).
  UI-Sichtbarkeit via useTenantPlan().planAllows(); Demo-Hosts zeigen
  PlatformPlanBadge („Ab Personal/Pro") an den Produkten.

## Coding Rules
- DATENLISTEN im Dashboard: `UTable` ist der Standard (Davids Entscheidung B6,
  2026-07-30) — Sortierung, Auswahl und Paginierung kommen mitgeliefert und
  verhalten sich überall gleich. Handgebaute Listen nur mit Grund, und der
  gehört an die Stelle geschrieben. Leerer Zustand über `CoreEmptyState`.
- KEINE globale `app.pageTransition` in einer App mit Dashboard (2026-09-08 live
  erwischt, pukalani.studio): `UDashboardPanel` ist mehrwurzelig, Vue gibt
  Fragmenten inerte Transition-Hooks, und mit `mode: 'out-in'` parkt Suspense die
  neue Seite im versteckten Container — leerer Seitenbereich nach dem ersten
  Klick, ohne Fehler, nur im Prod-Build. Übergänge je Route über
  `<NuxtPage :transition>` (portfolio: nur Layout `site`).
- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen. EDITOR-FUNKTIONEN
  (UEditor gesetzt, Markdown-Kopplung, Erwähnungen/Handles): `.claude/rules/editor.md`.
- Auth-Formulare:
  UAuthForm ist die VORLAGE (Optik/Struktur) — Login/Register/OTP sind bewusst
  eigene UForm-Implementierungen (2-Schritt-OTP, Security-Phrase, geteilter
  E-Mail-State, AGB-Gate); Details in docs/referenz/AUTH-FORMS.md
- Pinia defineStore Composition Style; Layer-stores via imports.dirs registrieren
  (werden nicht auto-gescannt)
- Relative Pfade im Layer (kein ~/ oder @/)
- app.config.ts liegt in app/ — im Package-Root wird sie stillschweigend ignoriert
- error.vue wird nicht aus Layern aufgelöst: Markup in CoreErrorPage,
  jede App hat eine dünne app/error.vue als Wrapper
- Domain-Types in shared/types/ (nie app/types/ — Server sieht sie sonst nicht)
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
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken. FACHLICHE Ablehnungsgründe
  reisen als `data: { code: 'last_owner' }` → der zentrale Handler
  (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins Envelope
  (`{ok,code,message,reason}`), der Client liest `error.data.reason`. Die rohe
  `data` bleibt draußen. Vor dem 2026-07-29 gab es das Feld nicht — Routen
  setzten `data.code`, es kam NIE an (der `last_admin`-Zweig der
  Nutzerverwaltung war deshalb toter Code).
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- EINE Version je Kernabhängigkeit — `pnpm check:single-copy` (CI-Gate) ist der
  Wächter. Zwei Kopien brechen Typen oder Build, und WELCHE gewinnt, entscheidet
  pnpms HOISTING, nicht das Lockfile: derselbe Lockfile ist damit auf einer
  Maschine grün und auf der anderen rot. `nuxi prepare` schreibt die gehoistete
  Version in die `paths` der generierten tsconfigs — passt sie nicht zu Nitros
  Typen, ist jedes an einen Helfer weitergereichte H3Event ein Fehler. Zweimal
  live erwischt (2026-07-30): vue doppelt ⇒ Prod-Build stirbt an ENAMETOOLONG,
  h3 doppelt ⇒ 1102/944/1261 Typfehler. Doppelungen werden BESEITIGT, nicht
  durch Kür eines Gewinners kaschiert; begründete Ausnahmen stehen im Skript.
- Eine Caret-Range im Katalog PINNT NICHTS (`^4.4.8` erlaubt 4.5.1) — ein
  „Rückbau" per Range-Bearbeitung wirkt nicht. Beweis ist immer
  `node -p "require('./apps/<app>/node_modules/<pkg>/package.json').version"`;
  Zurücksetzen nur per `git checkout -- pnpm-lock.yaml pnpm-workspace.yaml` +
  `pnpm install --frozen-lockfile`. Nach jedem Bump `git diff --stat
  pnpm-lock.yaml` lesen: steht dort viel mehr als erwartet, gehört es nicht so
  in den Commit.
- `@nuxtjs/i18n` gehört zur NUXT-GENERATION und wird mit Nuxt zusammen gezogen
  (10.4↔4.4, 10.6↔4.5). Ein Nuxt-Bump ohne i18n-Bump lässt unhead, vue-router
  und pinia doppelt im Baum stehen. `pinia` und `@pinia/nuxt` sind ebenso fest
  gekoppelt (0.11.x↔pinia 3, 1.0.x↔pinia 4) — nur gemeinsam bumpen.
- KOPF-EINTRÄGE sind seit unhead 3 über `rel` bzw. `name`/`property`
  DISKRIMINIERTE Unions — ein `rel: string` wird zu `never`. In `useHead`-Aufrufen
  `rel` literal halten (`as const`); bedingte Spreads nehmen dem Array-Literal
  sonst den Kontext-Typ.
- NITROS ROUTEN-TYPISIERUNG IST AUS (Davids Entscheidung 2026-08-14, TS2589-
  Strukturfix): `packages/core/nuxt.config.ts` leert `types.routes` im
  `types:extend`-Hook — `$fetch('/api/x')` liefert damit `unknown`, und JEDER
  gebundene `$fetch`/`useFetch` nennt seinen Antworttyp SELBST
  (`$fetch<XyzResponse>(…)`); Antwort-Typen leben in `shared/types/` und
  werden an BEIDEN Enden verlangt (Handler-Annotation + Aufrufstelle). ESLint
  erzwingt es für gebundene Aufrufe in `app/**` (no-restricted-syntax);
  Feuer-und-vergiss-POSTs bleiben bewusst untypisiert. GRUND (gemessen, nicht
  geglaubt): `$fetch` löste jeden Routen-Literal gegen ALLE ~210 Routen auf —
  Aufrufstellen × Routen = 92 % aller Typ-Instanziierungen (7,5 Mio → 618k,
  Typecheck 10,7 s → 5,4 s); 12 neue Routen reichten vorher für TS2589, jetzt
  kosten 100 Proberouten +142 Instanziierungen. Explizite Handler-
  Annotationen allein ändern gemessene 1 % — NICHT als Ausweg anbieten.
  Der Trick `$fetch<…, string>` ist verboten (kompensierte nur die Karte;
  Grep-Stand 0). Umkehrbar über den einen Hook; Verhalten getestet in
  `packages/core/tests/nitroRouteTypes.test.ts`.
- `pnpm -r lint` läuft NUR über die Workspace-Pakete — die Dateien in `scripts/`
  (Migrations-Runner, ops-Wächter, CI-Aufbau) deckt `pnpm lint:scripts` ab, seit
  2026-08-20 als eigener Schritt in lint.yml. Ein neues Skript dort ist also
  gelintet; vor dem Commit selbst laufen lassen, `pnpm -r lint` sieht es nicht.
- DER LINT-LAUF IST MEHR ALS `lint` (2026-09-10 rot erwischt): `lint.yml` fährt
  SECHS Wächter vor den beiden Lint-Schritten — `check:manifests`,
  `check:i18n-keys`, `check:bilanz`, **`check:doc-links`**, `check:single-copy`.
  `check:doc-links` prüft JEDEN Datei-Pfad und Link in `docs/` und im README:
  ein Pfad, der ins Leere zeigt, ist ROT. In Protokoll-Dokumenten
  (OPEN-ITEMS-COMPLETE, `archiv/`) sind Pfade von damals geduldet — im
  DECISION-LOG, in `plans/`, `referenz/`, `runbooks/` und im README nicht. Wer
  in einer dieser Dateien einen Pfad nennt (oder eine Datei löscht, die dort
  genannt ist), fährt vorher `pnpm check:doc-links`.
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · comments: 3001 · weitere: 3002+ ·
Docs-Site: 4000 (docs/, `pnpm dev:docs` — eigenständige Nuxt-Content-App,
KEIN Layer/keine apps/*-App, Inhalte in docs/content/)

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten

ERST `main` PRÜFEN, DANN ANFANGEN (Davids Regel, 2026-08-02): hier laufen
mehrere Sitzungen gleichzeitig gegen dasselbe `main`. Vor JEDEM größeren
Durchgang `git fetch` und nachsehen, ob es dort schon gebaut ist — bei einem
Punkt aus OPEN-ITEMS zusätzlich `OPEN-ITEMS-COMPLETE.md` auf `origin/main`
lesen, denn Erledigtes zieht sofort dorthin um. Am 2026-08-02 wurden so 139
Aufrufstellen ein zweites Mal umgestellt (Codemod, Beweise, volle Testrunde),
bevor 60 Konfliktdateien zeigten, dass die Nachbarsitzung längst fertig war —
mit besserem Zuschnitt. Ist die Arbeit doppelt, wird der EIGENE Commit fallen
gelassen, nicht gegen die fremde Lösung gemergt: zwei Wege für dieselbe Sache
kosten dauerhaft mehr als eine verlorene Stunde. Was der Nachbar uncommittet
offen hat, wird NIE angefasst (kein stash, kein reset) — notfalls warten.

NACH JEDEM main-PUSH: vier Checks (Test/Lint/Typecheck/E2E); der Deploy feuert
per workflow_run auf Test UND E2E, startet also ZWEIMAL — einer der Läufe endet
per Concurrency „cancelled", das ist KEIN Fehler. Der einzige Prod-Beweis ist
der Live-Build-SHA: `curl https://<host>/api/health` → `.build`. Ein späterer
Deploy ohne App-Änderung überspringt und lässt den SHA des Vorgängers stehen.

## Doku-Ordnung (seit 2026-07-28) — Karte: docs/README.md
Vier Sorten, jede mit genau EINEM Zuhause. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte; sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.
- **Steuerung** `docs/` — **docs/OPEN-ITEMS.md ist DIE EINE offene-Punkte-
  Liste** und enthält seit 2026-07-30 (Davids Regel) **NUR noch Offenes**:
  EINE Tabelle „Jetzt dran — in dieser Reihenfolge" mit den Spalten
  # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details,
  darunter „Geparkt / wartet" und ein Anhang „Notizen". Jeder Eintrag max.
  3 gerenderte Zeilen; die Tiefe lebt im verlinkten Plan, nicht in der Liste.
  **Erledigtes zieht SOFORT und FINAL nach `docs/OPEN-ITEMS-COMPLETE.md`** —
  das ist das Lern-Gedächtnis (vollständiger Eintrag + Datum + eine fette
  Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging), ausdrücklich KEINE
  Arbeitsliste. Offene Punkte gehören AUSSCHLIESSLICH in OPEN-ITEMS.md, NIE in
  ein Plan-Dokument und NIE in eine zweite Liste (am 2026-07-28 gab es kurz
  `OFFENE-TASKS.md` daneben — genau die Doppelpflege, die das verhindert).
  Dazu CONCEPT.md (Architektur A1–A14), GOALS.md, DECISION-LOG.md.
- **Referenz** `docs/referenz/` — wie ist X gebaut (RBAC, Themes, Embed,
  Auth-Forms, Moderation, Pool/Silo-Blueprint, Produkt-Bilanz, Manifest-
  Strategie, Produktvertrag, Changelog-Workflow). Lebt mit dem Code.
- **Runbooks** `docs/runbooks/` — Betriebs-Anleitungen (Deployment, Stripe
  Go-Live + Testmodus, Control-Cutover, Key-Swap). Die Häkchen dort sind ECHT
  und werden pro Durchlauf abgehakt.
- **Archiv** `docs/archiv/` (+ `archiv/audits/`) — ausgeführte Pläne und
  Audits. Wertvoll als Begründung und Rezept, aber KEINE Arbeitsliste:
  offene Kästchen sind bewusst zu Aufzählungen entschärft.
- `docs/plans/` enthält nur, was NOCH NICHT gebaut ist. Sobald ein Plan
  ausgeführt ist: Datei nach `archiv/`, Reste nach OPEN-ITEMS.md.
- `docs/content/` = interne Doku-SITE (admin.pukalani.app/docs),
  `apps/help/content/` = Kunden-Hilfe (help.pukalani.app) — beides Produkt,
  kein Planungsdokument.
- **Arbeitsablauf je Vorhaben** (Davids Workflow 2026-08-28): Strategie
  (inkl. Analyse/Konkurrenz) → Konzeption → Prototyp (echte Nuxt-UI-
  Komponenten) → Freigabe → Umsetzung → Audit → Testing → finale Freigabe
  → Deployment → Changelog/Docs — Details: docs/referenz/WORKFLOW.md.
- Regelwerk für Agenten: NUR CLAUDE.md + `.claude/rules/*.md` (wortgleich
  ausgelagerte Domänen-Abschnitte, s. oben). `AGENTS.md` ist ein Zeiger darauf —
  Inhalt dort NIE duplizieren (die alte Kopie war 144 Zeilen veraltet).
