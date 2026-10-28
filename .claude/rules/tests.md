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
