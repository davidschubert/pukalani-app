---
paths:
  - "**/tests/**"
  - "**/e2e/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/verify-*.mjs"
  - "**/acceptance-*.mjs"
  - "**/playwright.config.ts"
  - ".claude/launch.json"
  - "scripts/ci/**"
  - "scripts/buehne/**"
  - "scripts/lib/probe-stage.mjs"
  - "ci/**"
---

## Tests und Beweise

### Beweise aus einem Worktree
- WORKTREE-BEWEISE: ein Dev-Server aus `.claude/launch.json` startet mit
  cwd = HAUPT-Repo, nicht im Worktree — der „Beweis" misst unveränderten Code.
  Fremde Worktrees belegen Ports, der eigene Server weicht still aus. Vor jedem
  Beweis `lsof -nP -iTCP -sTCP:LISTEN` und den Pfad in der ersten
  Dev-Log-Zeile prüfen. Ein Worktree hat weder `node_modules` noch `.env`:
  installieren, `.env` aus dem Haupt-Checkout kopieren, danach löschen.
- DEV-SERVER STARTEN IMMER über `pnpm --filter <app> dev` — ein direkter
  `node ./node_modules/nuxt/bin/nuxt.mjs dev` findet `tailwindcss` nicht
  (NODE_PATH setzt erst pnpm) und liefert auf jeder SSR-Seite 500. Eigener
  Port: `pnpm --filter <app> dev -- --port N` wirkt NICHT (Port fest im
  `dev`-Skript, Nuxt weicht bei belegtem Port still aus); richtig
  `pnpm --filter <app> exec nuxi dev --port N`.
- ERSTE MESSUNG ZÄHLT NICHT: Vite bündelt nachgeladene Abhängigkeiten beim
  ersten Import und lädt die Seite neu — immer die zweite Messung nehmen.
  `performance.getEntriesByType('resource')` puffert nur 250 Einträge; für
  „nicht geladen" das Netzwerkprotokoll des Browsers nehmen.
- DIENSTE HINTER EINER NAHT gehören mit aus dem Worktree. Fremden Servern
  AUSWEICHEN statt sie neu zu starten: zweiten Dienst im Worktree auf freiem
  Port, die Naht per Env dorthin (`NUXT_ONBOARDING_CONTROL_URL=http://localhost:<port>
  pnpm --filter platform exec nuxi dev --port <port>`). Ein Beweis über
  Prozessgrenzen ist nur so ehrlich wie sein ENTFERNTESTER Dienst.

### Drei Beweis-Regeln
1. Erwartungswerte NIE aus derselben Antwort ableiten, die geprüft wird —
   eine solche Prüfung ist immer grün.
2. Auch REGRESSIONS-Beweise brauchen die volle Dienst-Kette (eine tote Naht
   sieht aus wie ein Code-Fehler).
3. EINE PIPE VERSCHLUCKT DEN EXIT-CODE: in `pnpm <x> | tail -6` ist der Status
   der von `tail` — ein roter Lauf sieht wie Erfolg aus, und der Fehler steht
   oft nicht in den letzten Zeilen. Ausgabe und Status trennen
   (`pnpm <x> > out.log 2>&1; echo "exit $?"; tail -6 out.log`) oder
   `set -o pipefail` bzw. `${PIPESTATUS[0]}`. Gilt für `| head`, `| grep`,
   `| sed -n`; betrifft jeden, der „exit 0" als Beweis NENNT.

### Unit und E2E
- Unit: `pnpm -r test`. Playwright-E2E in `apps/comments` (CI `e2e.yml`),
  `apps/control` (nachts auf der Bühne) und `apps/portfolio` (nur lokal);
  Base-URL je App per `PW_BASE_URL` überschreibbar (parallele Sitzungen).
- RENDER-TESTS (Q21): eine Seite aufbauen nur im EIGENEN Vitest-Projekt
  `render` (`@nuxt/test-utils`, `happy-dom`; Vorbild
  `packages/brand/vitest.config.ts`), nie in `unit`. Abrufe über
  `registerEndpoint`, KI-Routen zählen mit und müssen 0 bleiben; Erwartungen
  aus der Sprachdatei ROH gelesen (ein JSON-`import` liefert kompilierte
  Nachrichten). Einen Zustand, den die Seite nur als Ende eines Abrufs kennt
  (z. B. 409-Dialog), über die gestellte Antwort herbeiführen, nie von Hand
  in den Store setzen — sonst schreibt ein laufender Abruf unter Last
  dazwischen (FL1).
- `themes-visual` zielt auf die deterministische `/visual`-Seite — NIE
  Live-Daten screenshotten.
- CI `e2e.yml` fährt eine echte Wegwerf-Appwrite (`ci/appwrite` +
  `scripts/ci/appwrite-setup.mjs` → `bootstrap --seed` → volle Suite inkl.
  Realtime). E2E läuft gegen den DEV-Server, auch in der CI.
- E2E-FALLEN: (1) Kein Haken an einem CONTAINER, wenn ein Config-Gate den
  Zweig austauscht (`data-embed-login` vs. Gast-Composer) — Haken ans
  handelnde Element. (2) KALTSTART: der Dev-Server kompiliert jede SEITE beim
  ersten Zugriff (API-Routen bündelt Nitro beim Start) ⇒ Test-Budget 90 s,
  Lebendigkeits-Wartezeiten 60 s; Embed-Specs rufen `/embed` einmal IM
  BROWSER bis zur HYDRATION auf, bevor die Hostseite lädt — ein SSR-Abruf
  (oder ein `goto` nur bis `load`) wärmt das Client-Bundle nicht, und `embed.js` versteckt das iframe nach 10 s
  ohne Höhen-Meldung endgültig. Ein zu knappes Budget meldet eine falsche
  Stelle; `retries: 1` macht daraus „flaky" — grün, aber wertlos.
  (3) NIE `channel: 'chrome'` in einer `playwright.config.ts` (System-Chrome
  weckt auf macOS den GoogleUpdater, der Worker endet nie): Playwrights
  gebündeltes Chromium, einmalig `npx playwright install chromium`, in der CI
  ein eigener Install-Schritt. Test-eigene `node:http`-Server rufen
  `closeAllConnections()` vor `close()`.
- SCHMALE FENSTER (Q01): wer eine Kopfzeile, ein Menü oder ein schwebendes
  Bauteil ändert, ergänzt einen Fall in `apps/comments/e2e/narrow-screens.spec.ts`
  oder `narrow-screens-pool.spec.ts`, mit den Hilfen aus
  `apps/comments/e2e/support/narrowScreens.ts`: „erreichbar" heißt sichtbar,
  quer im Fenster UND an der Mitte liegt nichts obenauf (`toBeVisible()` sieht
  einen überdeckten Link als sichtbar). Fälle zu Textbreite laufen auf DEUTSCH.

### Das Ergebnis prüfen, nicht nur das Programm
- Typecheck, Lint und Routen-Tests sehen, was die App ERZEUGT, nicht was beim
  Besucher ankommt. Eine Änderung an öffentlichen Seiten (Kopfzeile, Menü,
  Layout) bekommt einen Browser-Fall bei 375 und 768 px
  (`NARROW_WIDTHS` in `apps/comments/e2e/support/narrowScreens.ts`, s. o.).
  Die Auslieferung (Skript gepackt mit `content-encoding`, `/robots.txt` mit
  Regeln und eigener Sitemap, genau ein Vorschaubild, Symbol-Route ohne
  fremden Dienst) prüft täglich je öffentlichem Host
  `scripts/ops/verify-delivery.mjs` im Produktions-Wächter
  (`.github/workflows/production-watch.yml`); neuer öffentlicher Host ⇒ Zeile
  in `HOSTS` im Skript. Fest geschriebene Symbol-Namen hält `pnpm check:icons`.

### Rollen-Tests an der echten Route (OPS-009, Davids Entscheidung)
- JEDE NEUE SCHREIBENDE ODER PERSONENBEZOGENE ROUTE BEKOMMT EINEN TEST, DER
  SIE LÄDT UND AUSFÜHRT. Prüfstand
  `packages/core/tests/support/participationHarness.ts` (echter Handler, echte
  Core-Wachen, nachgebildet nur die Naht; Personen Gast bis Betreiber).
  Frage-Sätze: `describeGuardedRoute`, `describeRoleGatedRoute`,
  `describeRoleGateToDoor`, `describeAccountRoute`. Beim Rollen-Tor steht, wer
  durch darf, AUSGESCHRIEBEN im Test — nie aus der Rechte-Matrix berechnet
  (Beweis-Regel 1). Routen, die erst lesen und dann entscheiden, bekommen die
  nachgebaute Datentür (`packages/core/tests/support/doorFake.ts`, Option
  `door`) und prüfen, über WELCHE Klinke gelesen wird. Beispiele:
  `packages/*/tests/route-roles*.test.ts`.
- WÄCHTER `packages/core/tests/route-role-coverage.test.ts`: zählt alle
  Routen aus dem Code (schreibend nach Dateiname; personenbezogen = eine
  lesende Route fragt nach dem Konto) und verlangt je Route einen Test, der sie per
  `import('../server/api/…')` lädt, oder eine begründete Ausnahme. DER
  BESTAND (`packages/core/tests/support/routeRoleBacklog.ts`) IST LEER UND
  BLEIBT ES: die Liste der Layer ohne Bestand IST `ZERO_BACKLOG_LAYERS`; eine
  neue Route ohne Test ist rot. Hilfen je Sorte Route:
  `packages/onboarding/tests/support/controlSeam.ts`,
  `packages/control/tests/support/controlRouteHarness.ts`,
  `packages/admin/tests/support/adminRouteHarness.ts`,
  `packages/core/tests/support/instanceRoleGate.ts`,
  `packages/core/tests/support/appwriteFake.ts`, für branding.supply
  `packages/insights/tests/support/insightsRouteKit.ts`,
  `packages/brand/tests/support/brandRouteKit.ts`,
  `packages/market/tests/support/marketRouteKit.ts`. App-Routen testen unter
  `apps/<name>/tests/`; `apps/comments`, `apps/control` und `apps/photos`
  fahren Vitest ohne `nuxi prepare` (`oxc: { tsconfig: false }`).
- GRENZEN: der Wächter sieht nicht, ob der Test die richtigen Fragen stellt,
  und keine mit `${…}` zusammengesetzten Pfade. Der Prüfstand beweist keine
  Middleware davor (Sperre, Herkunft, Bremsen, Zustimmung) und kein Schema —
  dafür die Beweis-Skripte gegen die echte Instanz. Route umbenannt oder
  gelöscht ⇒ Pfad im Test nachziehen (der Wächter nennt ihn).

### Die Bühne (OPS-009)
- Probe-Communities und Probe-Konten baut NIEMAND von Hand: `pnpm buehne up`
  (zwei Communities, Konten je Rolle), `pnpm buehne env` (Hosts und Ports für
  Skripte), `pnpm buehne smoke`, `pnpm buehne down` (löscht und ZÄHLT NACH,
  übrig ⇒ Exit 1). Auf einem geteilten Rechner IMMER `--suffix <wort>` und
  eigene Ports; beide Server aus DEMSELBEN Checkout.
- NEUES BEWEIS-SKRIPT nimmt `scripts/lib/probe-stage.mjs` — nie einen
  kopierten Rumpf. Netze: `packages/onboarding/tests/probeSiteBody.test.ts`,
  `packages/core/tests/proofScriptStageHelper.test.ts`.
- CI: `.github/workflows/buehne.yml` + `scripts/ci/buehne-setup.mjs`,
  Projekte `admin` und `account` — die Ids sind nicht frei, der Runner prüft
  sie gegen `site.manifest.ts`.
- WAS DIE BÜHNE NICHT BEWEIST: die direkten Anmelde-Wege der Datenbank sind
  lokal und in der CI AN, auf Production AUS; Dev-Server ohne Webserver davor;
  CI-Datenbank leer; kein Fremddienst.
- FALLEN: (1) im Pool heißt der Stempel einer Zeile `communityId` und trägt
  die tenantId — nach `tenantId` suchen findet nichts; (2) eine Anlage über
  die echte Route hinterlässt mehr als die Community (Seiten, Beitrag,
  Kategorie, Zustimmungs- und Protokoll-Zeilen, im Control Plane die
  Testphasen-Zeile); (3) ein Hilfs-Modul, direkt gestartet, endet mit Exit 0
  — der Rauchtest läuft nur über `pnpm buehne smoke`.
- LIVE-PROBE EINER ROUTE (PB1 d) auf einen Kontroll- oder Community-Host
  (`account.pukalani.app`, `demo.pukalani.app`) — `platform.pukalani.app`
  beantwortet nur `/api/health`, alles andere ist 404 `unknown_host`.
- Einordnung aller Skripte: `docs/referenz/LIVE-BEWEISE.md`.

### Die Beweise laufen von selbst
- EINE Stelle sagt, was wo läuft: `scripts/buehne/beweise.mjs`, je Skript
  `lauf: 'e2e'` (Schritt in `e2e.yml`), `'buehne'` (jeder Pull Request und
  `main`), `'nacht'` (ab rund 60 s oder mit Wartezeiten) oder `'hand'` mit
  GRUND. Läufer `pnpm buehne run --lauf buehne|nacht [--only <teil>]`, mit
  eigener Aufrufer-Adresse je Skript (`scripts/buehne/client-address.mjs`,
  sonst teilen alle dieselben Bremsen).
- `buehne.yml` läuft neben den Pflicht-Prüfungen, kein Tor; rot auf `main`
  oder nachts ⇒ Issue `buehne-alarm` (`docs/runbooks/PRODUKTIONS-ALARM.md`).
  Dort laufen auch die Isolations-Tests gegen die echte Datenbank, die
  `pnpm -r test` überspringt.
- NEUES BEWEIS-SKRIPT ⇒ Zeile in `beweise.mjs` (sonst sind
  `pnpm check:live-beweise` und `packages/core/tests/proofScriptManifest.test.ts`
  rot), dann `pnpm live-beweise`.
- VIER REGELN FÜR EIN SKRIPT AUF DER BÜHNE: (1) es SETZT seine Annahmen über
  die Probe-Community selbst (Plan, Registrierung) und stellt im `finally` auf
  den VORGEFUNDENEN Wert zurück, nie auf einen festen; der Läufer vergleicht
  nach jedem Skript mit `scripts/buehne/baseline.mjs` (Abweichung ⇒ DIESES
  Skript rot, dann stellt er zurück), `pnpm buehne e2e` stellt vor den
  Browser-Tests dasselbe her; (2) Aufräumen über `createCleanup` und
  NACHZÄHLEN; (3) eine Sonde („geht das noch?") legt nichts an; (4) Hosts,
  Ports, Ids aus der Umgebung (`pnpm buehne env`), Betreiber-Konten über den
  Laufzeit-Schlüssel (der Migrations-Schlüssel darf lokal keine Konten
  anlegen).
- EIN ROTER BEWEIS IST EIN VERALTETES SKRIPT ODER EIN FEHLER IM PRODUKT — die
  Prüfung wird nie gestrichen, weil sie rot ist. Regel geändert ⇒ Prüfung
  anpassen und die Regel nennen; Produkt falsch ⇒ Skript auf `hand` mit
  neutralem Grund und den Fehler melden.
- TEIL NICHT PRÜFBAR (eine Prüfung gilt nur mit, eine nur ohne gestellte
  Antworten) ⇒ `○ übersprungen` mit Grund, nicht mitzählen — nie still
  weglassen, nie als bestanden zählen.
- EINZEL-INSTANZ: nachts startet `buehne.yml` `apps/comments` als eigenen
  Server; Skripte mit `braucht: [..., 'einzel']` bekommen
  `EINZEL_URL`/`EINZEL_PORT`, lokal nur mit `pnpm buehne run --einzel-port N`,
  sonst „übersprungen". Aufräumen über `createEinzelCleanup` mit Nachzählen.
- BRANDING.SUPPLY (BT1 a): nachts startet `buehne.yml` `apps/branding`
  (`scripts/bootstrap.mjs --app branding`); Skripte mit `env: 'branding'` und
  `braucht: [..., 'branding']` bekommen `BRANDING_PORT`/`BRANDING_HOST`/
  `BRANDING_URL`, lokal nur mit `pnpm buehne run --branding-port N`. Der
  Server läuft mit GESTELLTEN ANTWORTEN (`BRAND_DEV_STUB_*`, `MARKET_DEV_STUB`,
  `BRAND_SITE_FETCH_ALLOW_LOOPBACK`; Start-Zeile in
  `docs/referenz/LIVE-BEWEISE.md`): KEIN Skript der Einteilung ruft eine echte
  KI, Stripe oder eine fremde Website, die CI-`.env` trägt dafür keinen
  Schlüssel; solche Skripte bleiben auf `hand`. Die Design-Vorlage steht an
  EINER Stelle (`packages/brand/scripts/lib/designProbe.mjs`, gehalten von
  `packages/brand/tests/designProbeTemplate.test.ts`) — nie kopieren. Vier
  Regeln: (1) ein Skript, das Konten anlegt, nimmt den LAUFZEIT-Schlüssel
  (`NUXT_APPWRITE_KEY` zuerst); (2) eine App mit AGB-Pflicht lehnt Schreiben
  eines direkt angelegten Kontos ab (403 `consent_required`) — Zustimmung über
  die echte Route festhalten (`confirmProbeConsent`), beim Aufräumen wieder
  nehmen; (3) der Läufer ZÄHLT bei `env: 'branding'` selbst nach (mehr Zeilen
  oder Konten als vorher ⇒ rot) — App-Zeilen räumt das Skript nach Spalte ab
  (`removeProbeRows`), nie über eine feste Liste; (4) Tages-Deckel zählen je
  PROZESS — bei mehrfachen lokalen Läufen den Server dazwischen neu starten
  (429 `market_instance_limit` ist sonst kein roter Beweis).
- AUFRÄUM-REGISTER BRAUCHT DAS SCHEMA: ohne `tables.read` findet es keine
  Zeile, die an einem Konto hängt, und zählt trotzdem „nichts übrig".
  `createEinzelCleanup` liest das Schema mit dem Migrations-Schlüssel, wenn die
  Umgebung einen nennt; ein Skript fragt vorher `schemaReadable()`.
