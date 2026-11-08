# Pukalani Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo — Marke **Pukalani** (der lokale Ordner heißt weiterhin
`maui-monorepo`, das GitHub-Repo seit 2026-11 `davidschubert/pukalani-app`) — mit
zentralem Core Layer + Produkt-Layern.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.5.x (Composition API, SSR), Nuxt UI 4.10.x, Pinia 4, Tailwind CSS 4
- node-appwrite 29 (Server SDK) + appwrite 27 (Web SDK, NUR Realtime) — Appwrite
  self-hosted **2.7.1** auf dev, CI und prod (seit 2026-11-06). EINE Falle, die
  eigenen Code betrifft: seit 2.7 trennt Realtime nach 120 s STILLE, ein eigener
  `new WebSocket` braucht alle 20 s `{"type":"ping"}` wie die SDKs. Upgrade-Wege,
  Beweis-Fallen und die Versionsgeschichte: `docs/runbooks/APPWRITE-2-7-UPGRADE.md`
  (und die Runbooks davor)
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Produkt-Layer (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [produkt-layer..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- SILO-REGEL (Davids Entscheidung 2026-08-04, DECISION-LOG): Isolation im CODE
  und im DEPLOYMENT sind ZWEI Entscheidungen. Neues Produkt ⇒ IMMER eigener
  Layer, aber standardmäßig KEINE eigene Site/Instanz (Kosten: Migrationen je
  Instanz, Env-Drift, TLS, Schema-Parity) — eine Site nur mit kundenförmigem
  Grund. Heute gibt es ZWEI Silo-Deployments: portfolio und branding.supply
  (apps/branding, Projekt `branding`, Prod-Port 3007, Dev 3010) —
  docs/plans/BRANDING-SUPPLY-INFRA.md
- Produkt-Manifeste (F1): JEDER Layer hat `product.manifest.ts` (nur
  `import type`!), JEDE App `site.manifest.ts`. `pnpm check:manifests` erzwingt
  die Konsistenz. **`apiPrefixes` im Manifest ⇒ `server/plugins/product-manifest.ts`
  mit `registerProductManifest()` ist PFLICHT** (PM1): ohne das Plugin wirken
  Notabschaltung, Produkt-Gate und Katalog nicht, und weder Typecheck noch Lint
  noch Tests sehen es — `market` fuhr so wochenlang tot. Live-Beweis: der Key
  steht in `/api/platform/products`.
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
- `realtime.md` — das Config-Gate (F14) und das Host-Gate (G5), mit Messwerten
- `plans-products.md` — Pläne, Preise, F49-Sperre, Produkt-Gating
- `i18n-seo.md` — Zod/i18n-Fallen, Locale-Strategie, SEO und og:image
- `deps-build.md` — eine Version je Kernabhängigkeit, Nitro-Typen, Lint-Wächter
- `docs-ordnung.md` — welche Sorte Dokument wohin, Arbeitsablauf je Vorhaben

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
- pukalani.observability: JSON-5xx-Logs am zentralen `server/error.ts` +
  Client-Error-Inbox (`POST /api/telemetry/error`); Core-Default aus
- pukalani.realtime.enabled (F14, seit 2026-08-01): der EINE Schalter für alle
  Realtime-Einstiege des Core (Row-Streams, Presence, Account-Channel). **Core-Default
  AN** — die begründete Ausnahme von „Core-Default ist IMMER aus"; AUS in
  `marketing` + `help`. ZWEITES GATE, andere Frage: `startWhenHostResolves()`
  sagt, ob die SEITE einen Host hat (G5). Begründungen, Messwerte und die
  Fallen: `.claude/rules/realtime.md`
- pukalani.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- pukalani.admin.modules: Modul-Registry der Dashboard-Nav — Produkt-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: **neue Layer mit User-Daten MÜSSEN einen Contributor registrieren**
  (`registerUserDataContributor`, Nitro-Plugin `server/plugins/user-data.ts`);
  core orchestriert Export und Löschung (users.delete nur bei Voll-Erfolg)
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Pläne & Produkte
Pool-Pläne heißen **basic / personal / pro**; `basic` IST KEIN ANGEBOT, sondern
der Zustand ohne Abo (nur-lesend, F49). Enterprise ist kein Plan-Key, sondern
das Silo-/Studio-Angebot. EIN Wort im Code UND zur Kundschaft: „**Produkte**"/
`products`. Preise, die drei Sperr-Anlässe, das Gating (`requirePlanProduct`)
und die Ausnahmen, die `feature` heißen dürfen: `.claude/rules/plans-products.md`
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
- Zod für alle Formulare (Schemas als create*Schema(t)-Factories), i18n-Schlüssel
  für JEDEN sichtbaren Text in beiden Sprachen. Die Fallen, die weder Typecheck
  noch Test sehen (`{'@'}`-Escape, KEINE spitzen Klammern in Locale-Messages,
  `check:i18n-keys`, die i18n-Strategie mit `localePath()`, SEO und og:image):
  `.claude/rules/i18n-seo.md` — vor jeder Änderung an Locale-Dateien lesen.
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken. FACHLICHE Ablehnungsgründe
  reisen als `data: { code: 'last_owner' }` → der zentrale Handler
  (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins Envelope
  (`{ok,code,message,reason}`), der Client liest `error.data.reason`. Die rohe
  `data` bleibt draußen. Vor dem 2026-07-29 gab es das Feld nicht — Routen
  setzten `data.code`, es kam NIE an (der `last_admin`-Zweig der
  Nutzerverwaltung war deshalb toter Code).
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- EINE Version je Kernabhängigkeit, Dependencies über den pnpm-Katalog, Nitros
  Routen-Typisierung ist AUS (jeder `$fetch` nennt seinen Antworttyp selbst), und
  der Lint-Lauf ist mehr als `lint` — er fährt sechs Wächter davor. Zahlen,
  Begründungen und die drei Bump-Kopplungen: `.claude/rules/deps-build.md`
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
mehrere Sitzungen gegen dasselbe `main`. Vor JEDEM größeren Durchgang
`git fetch`, und bei einem Punkt aus OPEN-ITEMS zusätzlich
`OPEN-ITEMS-COMPLETE.md` auf `origin/main` lesen — Erledigtes zieht sofort
dorthin um. Einmal wurden so 139 Aufrufstellen ein zweites Mal umgestellt,
bevor 60 Konfliktdateien zeigten, dass die Nachbarsitzung längst fertig war.
Ist die Arbeit doppelt, wird der EIGENE Commit fallen gelassen, nicht gegen die
fremde Lösung gemergt. Was der Nachbar uncommittet offen hat, wird NIE
angefasst (kein stash, kein reset) — notfalls warten.

NACH JEDEM main-PUSH: vier Checks (Test/Lint/Typecheck/E2E); der Deploy feuert
per workflow_run auf Test UND E2E, startet also ZWEIMAL — einer der Läufe endet
per Concurrency „cancelled", das ist KEIN Fehler. Der einzige Prod-Beweis ist
der Live-Build-SHA: `curl https://<host>/api/health` → `.build`. Ein späterer
Deploy ohne App-Änderung überspringt und lässt den SHA des Vorgängers stehen.

## Doku-Ordnung (seit 2026-07-28) — Karte: docs/README.md
Vier Sorten, jede mit genau EINEM Zuhause: **Steuerung** `docs/` (darin ist
**docs/OPEN-ITEMS.md DIE EINE offene-Punkte-Liste** und enthält NUR Offenes —
Erledigtes zieht SOFORT nach `OPEN-ITEMS-COMPLETE.md`, dem Lern-Gedächtnis mit
der fetten **Gelernt:**-Zeile), **Referenz** `docs/referenz/`, **Runbooks**
`docs/runbooks/`, **Archiv** `docs/archiv/`. Welche Sorte wohin, der
Arbeitsablauf je Vorhaben und die Regeln für `plans/` und `content/`:
`.claude/rules/docs-ordnung.md`
- Regelwerk für Agenten: NUR CLAUDE.md + `.claude/rules/*.md` (wortgleich
  ausgelagerte Domänen-Abschnitte, s. oben). `AGENTS.md` ist ein Zeiger darauf —
  Inhalt dort NIE duplizieren (die alte Kopie war 144 Zeilen veraltet).
