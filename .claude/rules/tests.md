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
  - "ci/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Tests
WORKTREE-BEWEISE (2026-07-29 live erwischt, gleich zweimal): ein Dev-Server aus
`.claude/launch.json` startet mit cwd = HAUPT-Repo, nicht im Worktree — ein
„Beweis" misst dann unveränderten Code und sieht wie ein Fehlschlag der neuen
Arbeit aus. Ebenso belegen fremde Worktrees Ports und der eigene Server fällt
still auf einen anderen zurück. Vor jedem Beweis: `lsof -nP -iTCP -sTCP:LISTEN`
und den Pfad in der ersten Dev-Log-Zeile prüfen. Dev-Server IMMER über
`pnpm --filter <app> dev` starten — ein direkter
`node ./node_modules/nuxt/bin/nuxt.mjs dev` findet `tailwindcss` nicht
(liegt nur in `node_modules/.pnpm/node_modules/`, das pnpm erst beim
Script-Lauf in den NODE_PATH legt) und liefert auf JEDER SSR-Seite 500 —
sieht aus wie ein Regressionsschaden, ist aber nur der falsche Start
(2026-07-31 live erwischt). EIGENER PORT im Worktree: `pnpm --filter <app> dev
-- --port N` wirkt NICHT — das `dev`-Skript hat `--port` fest verdrahtet, das
zweite landet als Positionsargument, und Nuxt weicht bei belegtem Port STILL
auf einen anderen aus (2026-08-01: 3007 → 3000, also fast auf den Port des
core-Playgrounds). Richtig ist `pnpm --filter <app> exec nuxi dev --port N`
(läuft ebenfalls über pnpm, NODE_PATH stimmt). Und: der ERSTE Seitenaufruf
nach einem Dev-Server-Start beweist nichts über NACHGELADENE Abhängigkeiten —
Vite bündelt sie beim ersten Import erst („dependency optimized") und lädt die
Seite dabei neu; immer die zweite Messung nehmen. Ebenso puffert
`performance.getEntriesByType('resource')` nur 250 Einträge: im Dev-Modus
fallen nachgeladene Chunks hinten raus und „nicht geladen" ist dann ein
Messfehler — für solche Beweise das Netzwerkprotokoll des Browsers nehmen.
ES REICHT NICHT, DEN EIGENEN SERVER AUS DEM
WORKTREE ZU FAHREN — jeder Dienst HINTER EINER SERVICE-NAHT gehört mit
(2026-08-01 live erwischt): der F12-Beweis lief gegen einen Worktree-Platform-
Server, sprach über `NUXT_ONBOARDING_CONTROL_URL` aber das Control Plane auf
:3004 aus dem HAUPT-Repo an — und maß dort den halbfertigen Arbeitsstand einer
fremden Sitzung (ein zusätzliches Feld im Umschlag ⇒ 26/27). Fremden Servern
weicht man AUS, statt sie neu zu starten: zweiten Dienst im Worktree auf einem
freien Port hochfahren (Port-Regel oben) und die Naht per Env dorthin zeigen
(`NUXT_ONBOARDING_CONTROL_URL=http://localhost:3014 pnpm --filter platform exec
nuxi dev --port 3016`) — danach 27/27. Ein Beweis, der über Prozessgrenzen
läuft, ist nur so ehrlich wie sein ENTFERNTESTER Dienst; ein Worktree hat
außerdem weder `node_modules` noch `.env` (installieren, `.env` aus dem
Haupt-Checkout kopieren, danach wieder löschen).

DREI BEWEIS-REGELN: (1) Erwartungswerte NIE aus derselben Antwort ableiten, die
geprüft wird — eine solche Prüfung ist IMMER grün (Tautologie im Aufwärm-Schritt
von verify-presence-away-priority; 2026-08-18 erwischt). (2) Auch REGRESSIONS-
Beweise brauchen die volle Dienst-Kette: verify-presence-boundary war 16/23 rot,
weil nur die Control-Naht (:3004) tot war, nicht der Code (2026-08-18).
(3) EINE PIPE VERSCHLUCKT DEN EXIT-CODE (2026-10-28 live erwischt): in
`pnpm --filter <app> typecheck | tail -6` ist der Status der von `tail`, also
fast immer 0 — ein FEHLGESCHLAGENER Lauf sieht damit genau wie Erfolg aus.
Besonders tückisch neben der Ausgaben-Deckelung aus der Sitzungs-Hygiene: der
Fehler steht oft gar nicht in den letzten Zeilen. So kam ein TS2322 nach `main`
und hielt den Typecheck drei Pushes lang rot, während die Sitzung ihn für grün
hielt. Entweder Ausgabe UND Status trennen (`pnpm x > out.log 2>&1;
echo "exit $?"; tail -6 out.log`) oder in der Pipe `set -o pipefail` setzen bzw.
`${PIPESTATUS[0]}` lesen. Wer nur INHALT prüft (eine Erfolgszeile, eine
Zählung), ist nicht betroffen — wer „exit 0" als Beweis NENNT, schon. Gilt
genauso für `| head`, `| grep` und `| sed -n`.

pnpm -r test (Unit) · Playwright-E2E in apps/comments (Base-URL per
PW_BASE_URL überschreibbar — parallele Dev-Sessions) · themes-visual zielt
auf die deterministische /visual-Seite (NIE Live-Daten screenshotten) ·
CI e2e.yml fährt eine echte Wegwerf-Appwrite (ci/appwrite +
scripts/ci/appwrite-setup.mjs → bootstrap --seed → volle Suite inkl. Realtime).
E2E läuft gegen den DEV-Server (auch in CI) — drei Fallen, alle 2026-07-28
live erwischt: (1) Ein Test darf nicht an einem CONTAINER-Haken hängen, wenn
ein Config-Gate den Zweig austauscht (`data-embed-login` vs. Gast-Composer bei
`pukalani.comments.embed.guests`) — Haken ans handelnde Element. (2) KALTSTART:
der Dev-Server kompiliert jede SEITE beim ersten Zugriff (`/` ~25 s, `/embed`
mit Client-Bundle >30 s). API-Routen NICHT: Nitro bündelt sie beim Start,
kalt gemessen 0,05 s (2026-08-01 — die alte Behauptung „jede /api/auth-Route
beim ersten Aufruf" hat eine F10-Diagnose auf eine falsche Fährte geschickt).
Deshalb Test-Budget 90 s statt der 30 s Standard, Lebendigkeits-Wartezeiten
60 s, und die Embed-Specs rufen `/embed` einmal IM BROWSER auf und warten dort
bis zur HYDRATION, bevor die Hostseite lädt — ein SSR-Abruf (oder ein `goto`
nur bis 'load') wärmt das Client-Bundle NICHT. Grund: `embed.js`
versteckt das iframe nach 10 s ohne Höhen-Meldung ENDGÜLTIG (display:none),
und die Höhe kommt erst aus onMounted. Ein zu knappes Budget meldet eine
Zeitüberschreitung an beliebiger Stelle statt der echten Ursache; `retries: 1`
kaschiert das zu „flaky" — grün, aber wertlos. (3) Der Teardown-Hang ist
BEHOBEN (2026-08-01). Ursache: `channel: 'chrome'` — ein Start von
System-Chrome weckt auf macOS den `GoogleUpdater`, dessen crash-handler die
stdout/stderr-Sockets des Workers ERBEN, zu launchd reparenten und nie
schließen; ohne EOF endete der Worker nie (Force-Kill nach 300 s ⇒ Exit 1
trotz grüner Suite, und nach einem ROTEN Test stand die ganze Suite, weil der
Worker-Neustart darauf wartet). Startflags helfen nicht. Kur: **Playwrights
gebündeltes Chromium** (kein `channel` in playwright.config.ts) — einmalig
`npx playwright install chromium`, in CI ein eigener Install-Schritt, weil
ubuntu-latest Chrome mitbringt, aber kein Playwright-Chromium. Volle Suite
seither 24/24 in ~25 s, Exit 0. Test-eigene `node:http`-Server rufen weiterhin
`closeAllConnections()` vor `close()` (richtige Hygiene — `close()` wartet
sonst auf Keep-alive-Sockets), das war nie die Hang-Ursache. NICHT auf
`channel: 'chrome'` zurückwechseln.

ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, seit 2026-11-17 — Davids
Entscheidung „Klein beginnen: Die Prüfungen aus P04 und P05 bekommen sofort
ihre Tests"): die häufigste Fehlerklasse des Gesamtaudits war eine Route, der
eine Prüfung fehlt — die Regel als Funktion war getestet, ihr Aufruf in der
Route nicht. Deshalb gilt: JEDE NEUE SCHREIBENDE ODER PERSONENBEZOGENE ROUTE
BEKOMMT EINEN TEST, DER SIE LÄDT UND AUSFÜHRT. Der Prüfstand
`packages/core/tests/support/participationHarness.ts` führt den echten
Handler mit den echten Core-Wachen aus (nachgebildet ist nur die Naht zum
Control Plane) und kennt die Personen Gast, Mitglied, fremdes Konto,
entferntes Konto, Bestands-Mitglied, Owner, Admin, Moderator, Editor und
Betreiber (globales Label, keine Community-Rolle). Vier fertige Frage-Sätze:
`describeGuardedRoute` (Mitmachen / eigenes Ändern / Melden),
`describeRoleGatedRoute` und `describeRoleGateToDoor` (Rollen-Tor: wer durch
darf, steht AUSGESCHRIEBEN im Test — nie aus der Rechte-Matrix berechnet,
das wäre Beweis-Regel 1), `describeAccountRoute` (nur das eigene Konto).
Routen, die erst lesen und dann entscheiden, bekommen eine nachgebaute
Datentür (`doorFake.ts`, Option `door`) und prüfen, über WELCHE Klinke gelesen
wird. Beispiele: `packages/*/tests/route-roles*.test.ts`. Wächter:
`packages/core/tests/route-role-coverage.test.ts` zählt alle Routen aus dem
Code (schreibend nach Dateiname, personenbezogen = eine lesende Route fragt
nach dem Konto) und verlangt je Route einen Test, der sie per
`import('../server/api/…')` lädt, eine begründete Ausnahme oder einen Eintrag
im Bestand `support/routeRoleBacklog.ts`. DER BESTAND DARF NUR SCHRUMPFEN:
eine neue Route ohne Test ist rot, ein Bestands-Eintrag mit Test ebenso, bis
er gestrichen ist. Für die neun Pool-Produkte ist er leer und bleibt es
(`ZERO_BACKLOG_LAYERS`); seit 2026-11-17 auch für `onboarding`, `control`,
`core`, `admin`, `tickets`, `runner`, `domains` und `billing` (Hilfen je
Sorte Route: `controlSeam.ts` für die Naht, `controlRouteHarness.ts` für
Betreiber- und Naht-Routen des Control Plane, `adminRouteHarness.ts` für das
Dashboard in Pool und Einzel-Instanz, `instanceRoleGate.ts` für ein Recht am
globalen Label, `appwriteFake.ts` für Konto-Routen). Im Bestand stehen noch
brand, insights, market, pages und vier App-Routen-Gruppen. WAS DER WÄCHTER NICHT SIEHT: ob der Test die
richtigen Fragen stellt (er erkennt nur das Laden), und Pfade, die mit
`${…}` zusammengesetzt werden. WAS DER PRÜFSTAND NICHT BEWEIST: die
Middleware davor (Sperre für Entfernte, Herkunftsprüfung, Bremsen, Zustimmung)
läuft nicht mit, die Datenbank ist eine Attrappe ohne Schema — dafür gibt es
die Beweis-Skripte gegen die echte Instanz. Wer eine Route umbenennt oder
löscht, zieht den Pfad im Test bzw. im Bestand nach (der Wächter nennt ihn).

DIE BÜHNE (OPS-009, seit 2026-11-17): Probe-Communities und Probe-Konten
baut NIEMAND mehr von Hand. `pnpm buehne up` legt zwei Communities
(`kunde-a.localhost` Registrierung zu, `kunde-b.localhost` offen) und Konten je
Rolle an (Owner, Admin, Moderator, Editor, Mitglied, entfernt, fremd,
Betreiber), `pnpm buehne env` nennt einem Skript Hosts und Ports,
`pnpm buehne smoke` prüft die Rollen über echte Routen, `pnpm buehne down`
löscht alles und ZÄHLT NACH (übrig ⇒ Exit 1). Auf einem geteilten Rechner
IMMER mit `--suffix <wort>` (eigene Hostnamen je Sitzung — `host` ist im
Control Plane eindeutig) und eigenen Ports; beide Server aus DEMSELBEN
Checkout (Regeln oben). Ein NEUES BEWEIS-SKRIPT nimmt die gemeinsame Hilfe
`scripts/lib/probe-stage.mjs` (Rumpf für `POST /api/onboarding/site`,
HTTP mit Host-Kopfzeile, Konten `@example.test` mit erzeugtem Passwort,
Anmelden, Community über die echte Route, Aufräum-Register mit Nachzählen) —
nie wieder ein kopierter Rumpf: ein neues Pflichtfeld an der Route brach
einmal 25 Skripte, ohne dass ein Test es merkte. Zwei Netze:
`packages/onboarding/tests/probeSiteBody.test.ts` (der Rumpf besteht das
echte Schema und den echten Handler) und der Wächter
`packages/core/tests/proofScriptStageHelper.test.ts` (kein Skript baut den
Rumpf selbst). In der CI baut `.github/workflows/buehne.yml` dieselbe Bühne
auf der Wegwerf-Appwrite (`scripts/ci/buehne-setup.mjs`: Projekte `admin` und
`account` — die Ids sind nicht frei, der Migrations-Runner prüft sie gegen
`site.manifest.ts`). WAS DIE BÜHNE NICHT BEWEIST: die direkten Anmelde-Wege
der Datenbank sind lokal und in der CI AN, auf Production AUS; die Server
laufen als Entwicklungs-Server ohne Webserver davor; die CI-Datenbank ist
leer; kein Fremddienst spricht mit. DREI FALLEN, alle beim Bau gemessen:
(1) im Pool heißt der Stempel einer Zeile `communityId` und trägt die
tenantId — nach `tenantId` zu suchen findet dort nichts; (2) eine Anlage
über die echte Route hinterlässt mehr als die Community (fünf Seiten, den
ersten Beitrag, eine Kategorie, Zustimmungs- und Protokoll-Zeilen, im Control
Plane die Testphasen-Zeile) — wer nur Konto und Community löscht, lässt das
liegen; (3) ein Hilfs-Modul, das direkt gestartet nichts tut, endet mit
Exit 0 und sieht aus wie ein bestandener Lauf — der Rauchtest weigert sich
deshalb ohne `pnpm buehne smoke`. Einordnung aller Skripte:
docs/referenz/LIVE-BEWEISE.md.

EINE LIVE-PROBE EINER ROUTE GEHÖRT AUF EINEN KONTROLL- ODER COMMUNITY-HOST
(PB1 d): `platform.pukalani.app` selbst hat keinen Mandanten und beantwortet
nur `/api/health` — jede andere Route dort endet in 404 `unknown_host` und
sieht aus wie „Route fehlt". Für eine Probe `account.pukalani.app`
(Kontroll-Host) oder `demo.pukalani.app` (Community) nehmen.

DIE BEWEISE LAUFEN VON SELBST (OPS-009, seit 2026-11-17): bis dahin liefen
6 von 82 Beweis-Skripten in der CI, alle anderen nur, wenn jemand daran
dachte — und ein Beweis, der nicht läuft, veraltet still (beim Einzug auf die
Bühne waren von 42 gestarteten Skripten 27 rot, fast alle wegen des Skripts,
nicht wegen des Produkts). EINE Stelle sagt, was wo läuft:
`scripts/buehne/beweise.mjs`, eine Zeile je Skript — `lauf: 'e2e'` (Schritt in
e2e.yml), `'buehne'` (bei jedem Pull Request und auf `main`, zusammen rund zwei
Minuten), `'nacht'` (nur im nächtlichen Lauf: ab rund 45 s oder mit
Wartezeiten) oder `'hand'` mit GRUND. Der Läufer `pnpm buehne run --lauf
buehne|nacht [--only <teil>]` fährt sie nacheinander mit der richtigen
Env-Datei, den Hosts der Bühne und einer EIGENEN Aufrufer-Adresse je Skript
(`scripts/buehne/client-address.mjs` hängt `x-forwarded-for` an, wie es auf
Production der Webserver tut — ohne das laufen alle Skripte in dieselben
Bremsen, z. B. fünf Community-Anlagen je Adresse). In der CI:
`.github/workflows/buehne.yml` — neben den Pflicht-Prüfungen, kein Tor fürs
Ausliefern; die Tabelle je Skript steht in der Zusammenfassung des Laufs; rot
auf `main` oder nachts ⇒ Issue `buehne-alarm` (docs/runbooks/
PRODUKTIONS-ALARM.md). Dort laufen auch die acht Isolations-Tests gegen die
echte Datenbank, die `pnpm -r test` ohne Datenbank überspringt.
NEUES BEWEIS-SKRIPT ⇒ Zeile in `beweise.mjs` (sonst sind
`pnpm check:live-beweise` und `packages/core/tests/proofScriptManifest.test.ts`
rot), dann `pnpm live-beweise`. VIER REGELN FÜR EIN SKRIPT AUF DER BÜHNE, alle
beim Einzug gemessen: (1) es SETZT seine Annahmen über die Probe-Community
selbst (Plan, Registrierung) und stellt sie im `finally` zurück — nie
voraussetzen, was ein anderes Skript gerade geändert haben kann; (2) es räumt
über `createCleanup` auf und ZÄHLT NACH — „✔ aufgeräumt" ohne Zählung stand in
einem Dutzend Skripten, die Seiten, Beiträge und Protokoll-Zeilen liegen
ließen; (3) eine Sonde, die „geht das noch?" fragt, darf dabei nichts anlegen
(eine Registrierungs-Sonde legte je Abfrage ein echtes Konto an); (4) Hosts,
Ports und Ids kommen aus der Umgebung (`pnpm buehne env`), Konten für den
Betreiber über den Laufzeit-Schlüssel (der Migrations-Schlüssel darf lokal
keine Konten anlegen). EIN ROTER BEWEIS IST ENTWEDER EIN VERALTETES SKRIPT
ODER EIN FEHLER IM PRODUKT — die Prüfung wird nie gestrichen, weil sie rot
ist: Regel geändert ⇒ Prüfung anpassen und die Regel nennen; Produkt falsch ⇒
Skript auf `hand` mit neutralem Grund und den Fehler melden. DIE
EINZEL-INSTANZ (seit 2026-11-17): nachts startet `buehne.yml` `apps/comments`
als dritten Server (Projekt `comments`, `bootstrap --seed`); Skripte mit
`braucht: [..., 'einzel']` bekommen `EINZEL_URL`/`EINZEL_PORT`, lokal nur mit
`pnpm buehne run --einzel-port N`, sonst „übersprungen". Sie räumen über
`createEinzelCleanup` mit Nachzählen auf. WAS FEHLT: zwei Skripte, die die
Einzel-Instanz EIGENS eingestellt brauchen (`verify-silo-domain`,
`verify-domain-settle`), und die 12 von branding.supply (eigenes Projekt)
stehen auf `hand`; Skripte mit echten KI-Aufrufen, Stripe oder fremden
Websites bleiben dort.
