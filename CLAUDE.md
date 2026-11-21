# Pukalani Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo — Marke **Pukalani** (der lokale Ordner heißt weiter
`maui-monorepo`, das GitHub-Repo `davidschubert/pukalani-app`) — mit zentralem
Core Layer + Produkt-Layern. Vollständiges Konzept: `docs/CONCEPT.md`

## Stack
- Nuxt 4.6.x (Composition API, SSR), Nuxt UI 4.12.x, Pinia 4, Tailwind CSS 4
- node-appwrite 31 (Server SDK) + appwrite 29 (Web SDK, NUR Realtime) — Appwrite
  self-hosted **2.7.4** auf dev, CI und prod. Falle für eigenen Code: Realtime
  trennt nach 120 s STILLE, ein eigener `new WebSocket` braucht alle 20 s
  `{"type":"ping"}` wie die SDKs. Upgrade-Wege und Beweis-Fallen:
  `docs/runbooks/APPWRITE-2-7-UPGRADE.md`
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 24 — GENAU
  die Version aus `.nvmrc`, dieselbe lokal, in der CI und auf Production
  (Patch-Weg: `docs/runbooks/DEPLOYMENT.md` A4)

## Architektur (3 Ebenen)
- `packages/core` → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- `packages/*` → Layer in drei Töpfen: Fundament, Naht, Produkt. WER WOHIN
  GEHÖRT, sagt nur die Liste in `eslint.config.mjs` (`FOUNDATION`, `SEAM`,
  `PRODUCTS`); ein Layer ohne Topf bricht den Lint. Produkte kennen einander
  nicht.
- `apps/*` → dünne Apps, komponieren via extends: [produkt-layer..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- SILO-REGEL (Davids Entscheidung, DECISION-LOG): Isolation im CODE und im
  DEPLOYMENT sind ZWEI Entscheidungen. Neues Produkt ⇒ IMMER eigener Layer,
  aber standardmäßig KEINE eigene Site/Instanz — eine Site nur mit
  kundenförmigem Grund.
  Heute gibt es ZWEI Silo-Deployments: portfolio und branding.supply
  (`apps/branding`, Projekt `branding`, Prod-Port 3007, Dev 3010) —
  `docs/archiv/BRANDING-SUPPLY-INFRA.md`
- Produkt-Manifeste (F1): JEDER Layer hat `product.manifest.ts` (nur
  `import type`!), JEDE App `site.manifest.ts`; `pnpm check:manifests` erzwingt
  die Konsistenz. **`apiPrefixes` im Manifest ⇒ `server/plugins/product-manifest.ts`
  mit `registerProductManifest()` ist PFLICHT** (PM1): ohne das Plugin wirken
  Notabschaltung, Produkt-Gate und Katalog nicht, und weder Typecheck noch Lint
  noch Tests sehen es. Live-Beweis: der Key steht in `/api/platform/products`.
  Derselbe Wächter hält (P20): JEDE Route eines abschaltbaren Layers liegt
  unter seinen `apiPrefixes` (sonst erreicht der Not-Aus sie nicht; Ausnahmen
  mit Grund in `scripts/lib/manifest-routes.mjs`), und jedes Manifest sagt
  `userData`. Strategie: `docs/referenz/MULTI-SITE-PLATFORM-STRATEGIE.md`
- `packages/blueprint` = KOMPOSITIONS-Layer („Bauplan"): der EINZIGE Layer, der
  mehrere Produkt-Layer kennen darf — Produkt-Kompositionen (Feed+Kommentare,
  …) existieren GENAU EINMAL hier, nie je App (Pool und Silo müssen identisches
  Produktverhalten zeigen — `docs/referenz/PRODUKT-BILANZ.md`). In extends VOR
  den Produkt-Layern listen. Keine Produkt-Logik, keine Tables, kein server/
  in blueprint.
- Layer-Grenzen-Matrix (wer darf was besitzen) + Durchsetzung: CONCEPT.md A14.
  Neue Cross-Layer-Abhängigkeiten als EXPLIZITE Verträge (kein impliziter
  Auto-Import/String-Coupling); ESLint no-restricted-imports als Backstop.
  Fundament-Layer hängen NIE von Produkten ab, `core` von keinem anderen Layer.

## Domänen-Regeln (`.claude/rules/`)
Diese Datei ist der KERN und liegt in jeder Runde und in jedem Subagenten im
Kontext. Die Domänen-Regeln laden per `paths:`-Frontmatter nur, wenn eine
passende Datei gelesen wird. Wer per Bash liest (cat/sed) oder eine Domäne nur
BERÄT, öffnet die Regel-Datei bewusst per Read — sie gilt mit derselben
Priorität wie CLAUDE.md:
- Appwrite: `appwrite.md` (Clients/Keys, Rechte, Anmelde-Wege, Bremsen,
  Zustimmung) · `appwrite-migrationen.md` (Migrationen + indexStep,
  Ziel-Prüfung der Skripte, Datenbank-Stand) · `appwrite-presence.md` (der
  eine Realtime-Socket, Presence) · `realtime.md` (Config-Gate F14, Host-Gate G5)
- Communities: `tenant-isolation.md` (tenantDb/Datentür, as/actor, DER SERVER
  SCHREIBT, ESLint-Backstop, M13-Sperre, Mitmachen, N7) ·
  `tenant-mitglieder.md` (Site-Label A5, Beitritt, „ehemaliges Mitglied",
  Benachrichtigungen C15/D5/C17) · `onboarding.md` (Kontroll-Hosts, Anlegen,
  Mitglieder-Verwaltung, Stilllegen) · `plans-products.md` (Pläne, Preise,
  F49-Sperre, Produkt-Gating)
- Betrieb: `hosts-ops.md` (admin./account./Altnamen, RESERVED_SUBDOMAINS,
  TLS-Fallen, Herkunftsprüfung, Mail-Links) · `ops-waechter.md`
  (production-watch, Alarmweg, Probealarme) · `ops-server.md` (nginx-Vorlagen,
  Schutz-Kopfzeilen, Env-Pflichtliste) · `ops-ausliefern.md` (CI-Schlüssel,
  Rückweg, Backups)
- KI und Post: `ki.md` (aiComplete, Anbieter-Bindung, UGC-Übersetzung) ·
  `lange-laeufe.md` (Lauf-Sperre, 202, Abfragen) · `mail-embed-moderation.md`
  (sendMail/Digest, öffentliche Formulare, Embed, Moderation, Microcache) ·
  `ai-runner.md` (Daemon, Allowlist, Board)
- Oberfläche: `themes.md` (Katalog, Custom Themes, Farbwelt-Regel B5,
  Branding-Spiegel D6, Schriften, Settings-Hub) · `editor.md` (UEditor,
  Markdown-Kopplung, Erwähnungen) · `i18n-seo.md` (Zod/i18n-Fallen,
  Locale-Strategie, SEO, og:image)
- Läufe: `zeit-laeufe.md` (Zeit-Lauf, Fristen-Lauf)
- Werkzeug: `tests.md` (Worktree-Beweise, Ports, E2E-Fallen, Rollen-Tests) ·
  `deps-build.md` (eine Version je Kernabhängigkeit, Nitro-Typen,
  Lint-Wächter) · `docs-ordnung.md` (welches Dokument wohin)

## Sitzungs-Hygiene — `docs/referenz/SESSION-HYGIENE.md`
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
- FUNKTIONEN sind im Core AUS, die App aktiviert ausdrücklich
  (pukalani.analytics, pukalani.consent). SCHUTZ ist die Gegenrichtung: was
  etwas ABSICHERT (Herkunftsprüfung: `hosts-ops.md`; Anbieter-Bindung der KI,
  Kostenriegel: `ki.md`), ist im Core AN; wer abweicht, tut es ausdrücklich und schreibt den Grund an
  die Stelle — bei Schutz heißt „vergessen" „ungeschützt", und nichts wird rot.
- pukalani.observability: JSON-5xx-Logs am zentralen `server/error.ts` +
  Client-Error-Inbox (`POST /api/telemetry/error`); Core-Default aus, in allen
  ausgerollten Apps an (OPS-011: der tägliche Wächter zählt die Zeilen;
  Client-Inbox nur auf Apps mit Anmeldung)
- pukalani.realtime.enabled (F14): der EINE Schalter für alle Realtime-Einstiege
  des Core (Row-Streams, Presence, Account-Channel). **Core-Default AN** — die
  begründete Ausnahme unter den Funktionen; AUS in `marketing` + `help`.
  ZWEITES GATE, andere Frage: `startWhenHostResolves()` sagt, ob die SEITE
  einen Host hat (G5). Regeln und Fallen: `.claude/rules/realtime.md`
- pukalani.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- pukalani.admin.modules: Modul-Registry der Dashboard-Nav — Produkt-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: **neue Layer mit User-Daten MÜSSEN einen Contributor registrieren**
  (`registerUserDataContributor`, Nitro-Plugin `server/plugins/user-data.ts`);
  core orchestriert Export und Löschung (users.delete nur bei Voll-Erfolg).
  JEDE TABELLE braucht eine Entscheidung in
  `core/tests/support/userDataTables.ts` (Wächter-Test); `check:manifests`
  liest Tabellen und Personen-Spalten aus den Migrationen: Manifest
  `userData: true` ohne Beitrag oder `false` mit einer Spalte wie
  `userId`/`email` ist rot (`scripts/lib/user-data-duty.mjs`). Ein Lesefehler
  bricht die Löschung ab (nie `.catch(() => [])`), Fristen setzt ein Lauf
  durch — Regeln, Fristen, Läufe: `docs/referenz/EXPORT-UND-LOESCHUNG.md`
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Pläne & Produkte
Pool-Pläne heißen **basic / personal / pro**; `basic` IST KEIN ANGEBOT, sondern
der Zustand ohne Abo (nur-lesend, F49). Enterprise ist kein Plan-Key, sondern
das Silo-/Studio-Angebot. EIN Wort im Code UND zur Kundschaft: „**Produkte**"/
`products`. Preise, die drei Sperr-Anlässe, das Gating (`requirePlanProduct`)
und die Ausnahmen, die `feature` heißen dürfen: `.claude/rules/plans-products.md`

## Coding Rules
- DATENLISTEN im Dashboard: `UTable` ist der Standard (Davids Entscheidung B6)
  Handgebaute Listen nur mit Grund, und der gehört an die Stelle geschrieben.
  Leerer Zustand über `CoreEmptyState`.
- KEINE globale `app.pageTransition` in einer App mit Dashboard:
  mit `mode: 'out-in'` bleibt der Seitenbereich nach dem ersten Klick leer —
  ohne Fehler, nur im Prod-Build.
  Übergänge je Route über `<NuxtPage :transition>` (portfolio: nur Layout
  `site`).
- DASHBOARD-SEITE: `main` und Sprunglink setzt das Layout `dashboard` (UX-006)
  — eine Seite mit diesem Layout bringt KEIN eigenes `<main>` mit, und der
  Umschalter der Seitenleiste heißt `CoreSidebarCollapse` (setzt
  `aria-expanded`), nie `UDashboardSidebarCollapse`. Wächter:
  `core/tests/dashboardLandmarksGuard.test.ts`, im Browser
  `apps/comments/e2e/dashboard-landmarks.spec.ts`.
- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen. EDITOR-FUNKTIONEN
  (UEditor gesetzt, Markdown-Kopplung, Erwähnungen/Handles): `.claude/rules/editor.md`.
- Auth-Formulare: UAuthForm ist die VORLAGE (Optik/Struktur) —
  Login/Register/OTP sind bewusst eigene UForm-Implementierungen (2-Schritt-OTP,
  Security-Phrase, geteilter E-Mail-State, AGB-Gate); Details in
  `docs/referenz/AUTH-FORMS.md`
- Pinia defineStore Composition Style; Layer-stores via imports.dirs registrieren
  (werden nicht auto-gescannt)
- Relative Pfade im Layer (kein ~/ oder @/)
- app.config.ts liegt in app/ — im Package-Root wird sie stillschweigend ignoriert
- error.vue wird nicht aus Layern aufgelöst: Markup in CoreErrorPage,
  jede App hat eine dünne app/error.vue als Wrapper
- Domain-Types in `shared/types/` (nie app/types/ — Server sieht sie sonst nicht)
- Zod für alle Formulare (Schemas als create*Schema(t)-Factories), i18n-Schlüssel
  für JEDEN sichtbaren Text in beiden Sprachen. Die Fallen, die weder Typecheck
  noch Test sehen (`{'@'}`-Escape, KEINE spitzen Klammern in Locale-Messages,
  `check:i18n-keys`, die i18n-Strategie mit `localePath()`, SEO und og:image):
  `.claude/rules/i18n-seo.md` — vor jeder Änderung an Locale-Dateien lesen.
- LANGE ARBEIT GEHÖRT NICHT IN DIE ANFRAGE (BE-008): der Webserver wartet
  60 s. Hängt die Dauer einer Route an fremden Servern, einem Modell oder einer
  Liste ⇒ Lauf-Sperre nehmen, `202`, `runDetached()`
  (`core/server/utils/runLease.ts`), die Seite fragt den Stand ab
  (`core/shared/runLease.ts`). Die Sperre ist eine Zeile mit fester Kennung,
  nie „erst lesen, dann schreiben". Regel: `.claude/rules/lange-laeufe.md`.
- BETREIBER-PROTOKOLL (`audit_logs`, BE-021/SEC-034) NUR über den einen
  Schreiber `writeAuditLog()` (`core/server/utils/auditLog.ts`; admin:
  `recordAudit`) — nie eigenes `createRow` mit leerem `catch`. Ein Ausfall
  schreibt `audit.write_failed` (zählt der tägliche Kontroll-Lauf).
  HERAUSGABE von Personendaten ist strikt: frische Anmeldung, ERST der
  Eintrag (`{ strict: true }`), DANN die Daten, sonst 503 `audit_unavailable`;
  alles andere läuft weiter. Ein neuer Export-Beitrag beachtet `audience`
  (`self` | `operator`): private Inhalte Dritter gehen nicht an den Betreiber.
- ZEIT-LAUF (Sweep, Aufräumer im Takt) NUR über `defineTimedJob()`, nie eigenes
  `setInterval` in einem Server-Plugin; FRISTEN-LAUF (löscht nach einer Frist)
  NUR auf dem Gerüst `rowRetention`: Schalter-Vorgabe `off`, live mit `count`,
  `apply` nur mit Davids Ja zur gezählten Zahl. Regel:
  `.claude/rules/zeit-laeufe.md`.
- DER SERVER SCHREIBT (SEC-002, Davids Entscheidung): keine Tabelle und keine
  Zeile trägt ein Schreibrecht für Konten; geschrieben wird über die
  Operator-Klinke der Datentür NACH den Prüfungen der Route, Rechte an Zeilen
  regeln nur das Lesen. Wem eine Zeile gehört, prüft die Route selbst, vor dem
  Schreiben. Neue Tabelle ⇒ `scripts/lib/server-written-tables.mjs`. Regel:
  `.claude/rules/tenant-isolation.md` („DER SERVER SCHREIBT").
- KEIN STILLES `.catch` IM SERVER (Q13): ein `.catch`, das seinen Fehler weder
  liest noch weiterwirft, ist unter `server/` rot (ESLint
  `pukalani/no-silent-catch`). Der Weg:
  `.catch(softFail('<layer>:<pfad>:<aufruf>', ersatz))` aus
  `core/server/utils/softFail.ts` (in Produkt-Layern ausdrücklich
  importieren) — derselbe Ersatzwert, dazu eine gezählte Zeile `soft_fail`.
  404 für eine Zeile bleibt still, eine fehlende Tabelle nicht; was an der
  Stelle sonst erwartet ist, nennt `quiet` (401 Gast, 409 Wettlauf). Die
  Kennung ist ein festes Literal, nie mit Ids zusammengesetzt.
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken. FACHLICHE Ablehnungsgründe
  reisen als `data: { code: 'last_owner' }` → der zentrale Handler
  (`core/server/error.ts`) hebt genau diesen Schlüssel als `reason` ins
  Envelope (`{ok,code,message,reason}`), der Client liest `error.data.reason`.
  Die rohe `data` bleibt draußen.
- NEUE ROUTE ⇒ ROLLEN-TEST (OPS-009): jede schreibende oder personenbezogene
  Route braucht einen Test, der sie lädt und ausführt (Gast, fremdes Konto,
  Mitglied, Rollen) — Prüfstand `core/tests/support/participationHarness.ts`,
  Wächter `core/tests/route-role-coverage.test.ts` (der Bestand ohne Test darf
  nur schrumpfen). Regel: `.claude/rules/tests.md` („ROLLEN-TESTS").
- LINK AUS GESPEICHERTEN DATEN (SEC-021): `:href` nur über
  `safeExternalHref()`, Schema-Feld mit `z.url({ protocol: HTTP_URL_PROTOCOL })`
  (`core/shared/safeHref.ts`) — `z.url()` allein nimmt JEDES Schema. Wächter:
  `core/tests/hrefBindingsGuard.test.ts`. Eine ADRESSE IM PROTOKOLL geht durch
  `stripAddressForLog()` (`core/shared/logAddress.ts`, ohne Query und Fragment,
  eine lange Kennung im Pfad gekürzt).
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- EINE Version je Kernabhängigkeit, Dependencies über den pnpm-Katalog, Nitros
  Routen-Typisierung ist AUS (jeder `$fetch` nennt seinen Antworttyp selbst), und
  der Lint-Lauf ist mehr als `lint` — davor fahren Wächter (die Liste IST
  `.github/workflows/lint.yml`). Begründungen und die Bump-Kopplungen:
  `.claude/rules/deps-build.md`
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- pnpm Catalog: Versionen zentral in `pnpm-workspace.yaml`, package.json
  referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · comments: 3001 · weitere: 3002+ ·
Docs-Site: 4000 (docs/, `pnpm dev:docs` — eigenständige Nuxt-Content-App,
KEIN Layer/keine apps/*-App, Inhalte in docs/content/)

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten

ERST `main` PRÜFEN, DANN ANFANGEN (Davids Regel): hier laufen mehrere
Sitzungen gegen dasselbe `main`. Vor JEDEM größeren Durchgang `git fetch`,
und bei einem Punkt aus OPEN-ITEMS zusätzlich `OPEN-ITEMS-COMPLETE.md` auf
`origin/main` lesen — Erledigtes zieht sofort dorthin um. Ist die Arbeit
doppelt, wird der EIGENE Commit fallen gelassen, nicht gegen die fremde Lösung
gemergt. Was der Nachbar uncommittet offen hat, wird NIE angefasst (kein
stash, kein reset) — notfalls warten.

VOR JEDEM MERGE GEGEN DEN NEUESTEN STAND TESTEN (Davids Entscheidung,
DECISION-LOG): zwei Pull Requests, die einzeln grün sind, können `main`
zusammen rot machen. Deshalb direkt vor `gh pr merge`: `git fetch`,
`git merge origin/main` lokal (ohne zu pushen genügt `--no-commit` und danach
`--abort`), die Pakete testen, die `main` seit dem Abzweigen berührt hat, und
erst dann zusammenführen. Die Frage „läuft gerade ein Ausliefern?" und der
Merge stehen in ZWEI Befehlen.

NACH JEDEM main-PUSH: vier Checks (Test/Lint/Typecheck/E2E) — ALLE VIER müssen
grün sein, sonst wird nicht ausgeliefert (P07). Der Deploy feuert per
workflow_run auf Test UND E2E, startet also ZWEIMAL — einer der Läufe endet
per Concurrency „cancelled", das ist KEIN Fehler. Wird eine rote Prüfung per
Re-run grün, feuert der Deploy VON SELBST — für den Commit DIESES Laufs. Eine
rote Prüfung deshalb nur neu starten, solange ihr Commit die Spitze von `main`
ist; nach jedem Re-run den Live-Build mit der Spitze von `main` vergleichen.
Der einzige Prod-Beweis ist der Live-Build-SHA:
`curl https://<host>/api/health` → `.build`. Daneben steht `.schema.state`
(ok | behind | unknown): passt die Datenbank zum ausgerollten Programm?
`behind` heißt, eine Migration fehlt — der Deploy-Lauf endet dann rot, der
Halbstunden-Wächter öffnet ein Issue.
MIGRATION AUF PRODUCTION IMMER VOR DEM MERGE, über den Runner und mit Davids
Ja: `pnpm migrate --app <app> --env <datei> --only <layer>-<NNN> --prod`
(erst `--dry-run`); neue Migration ⇒ Import-Zeile der Ziel-Prüfung und
`schema` im `product.manifest.ts` (`.claude/rules/appwrite-migrationen.md`). Ein späterer
Deploy ohne App-Änderung überspringt und lässt den SHA des Vorgängers stehen.
Die Prüf-Jobs `test`, `lint`, `secrets`, `typecheck` und `e2e` sind bei GitHub
PFLICHT für `main` (P08, Davids Entscheidung): ein Pull Request lässt sich
erst zusammenführen, wenn alle grün sind. Der direkte Push bleibt als
Notausgang für den Besitzer; `gh pr merge --admin` ist derselbe Notausgang und
nie der Normalweg. Fremde Actions laufen nur über einen Commit
(`pnpm check:workflows`) — ein Zweig mit alten Workflow-Dateien wird erst nach
`git merge origin/main` grün.

## Doku-Ordnung — Karte: `docs/README.md`
Vier Sorten, jede mit genau EINEM Zuhause: **Steuerung** `docs/` (darin ist
**`docs/OPEN-ITEMS.md` DIE EINE offene-Punkte-Liste** und enthält NUR Offenes —
Erledigtes zieht SOFORT nach `OPEN-ITEMS-COMPLETE.md`, dem Lern-Gedächtnis mit
der fetten **Gelernt:**-Zeile), **Referenz** `docs/referenz/`, **Runbooks**
`docs/runbooks/`, **Archiv** `docs/archiv/`. Welche Sorte wohin, der
Arbeitsablauf je Vorhaben und die Regeln für `plans/` und `content/`:
`.claude/rules/docs-ordnung.md`
- Regelwerk für Agenten: NUR CLAUDE.md + `.claude/rules/*.md`. `AGENTS.md` ist
  ein Zeiger darauf — Inhalt dort NIE duplizieren.
- REGELWERK KLEIN HALTEN (Q17, Davids Entscheidung): eine Regel sagt, was gilt
  und woran man es prüft; Herleitung, Datum, Messwert und Vorfall stehen im
  Eintrag von `OPEN-ITEMS-COMPLETE.md`, die Regel nennt dessen Kürzel. Wer
  ergänzt, kürzt in derselben Datei oder teilt sie. `pnpm check:rules` hält
  den Deckel (20.000 Bytes hier, 15.000 je Regeldatei), die Lade-Pfade und
  jeden in Backticks genannten Pfad und Skript-Namen. Eine UMBENENNUNG im Code
  endet mit `git grep` nach dem alten Namen über `CLAUDE.md` und `.claude/`.
