---
paths:
  - "tools/ai-runner/**"
  - "packages/runner/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## AI-Runner-Daemon (tools/ai-runner, seit 2026-08-18)
DIE ALLOWLIST LIEGT AUF DEM MAC (`~/.config/pukalani-runner/config.json`) —
über die Naht reist nur ein `repoKey`, nie ein Pfad; erlaubte Modi/Modelle/
Budget/geschützte Branches/Testbefehle stehen ausschliesslich dort, und ein
Lauf wird bei Modus, Modell und Budget still heruntergestuft (mit
Ereigniszeile) statt abgelehnt. Der Daemon fährt
genau EINEN Lauf gleichzeitig und committet SELBST (`acceptEdits` erlaubt
kein `git commit`, gemessen) — nie push, nie auf einem geschützten Branch.
`needs_input` kommt NIE aus dem Exit-Code: ein blockierter Lauf endet als
`success`/`is_error:false`; die Wahrheit steht in `permission_denials` und im
`post_turn_summary` (AI-RUNNER.md § 11, gemessen). Stirbt der Daemon mitten im
Lauf, bleibt der Lauf auf `running` — die Kur ist der Abbrechen-Knopf im
Board, kein Totmann-Zeitgeber. Server-Seite: Layer `packages/runner`
(Board-UI + Naht, Tabellen runners/runs/run_events, Capability
`runner.manage` NUR admin); Beweise: `verify-runner-boundary.mjs` (24) und
`tools/ai-runner/scripts/smoke.mjs` (86, läuft seit 2026-11-14 mit
`pnpm -r test`).

TESTBEFEHLE SIND EINE AUSWAHL, KEIN TEXT (SEC-037, seit 2026-11-14 — Davids
Entscheidung): der Dienst führt nur aus, was WORTGLEICH in seiner lokalen
Liste steht (`repos.<key>.testCommands` in der Config auf dem Mac; fehlt sie,
läuft nichts). Anders als bei Modus und Modell wird hier NICHT heruntergestuft:
ein einziger nicht gelisteter Befehl lehnt den GANZEN Auftrag ab, vor Material
und Agent (`test_command_not_allowed`, Fehler-Ereignis und Log). Ausgeführt
wird der Listeneintrag, nie der Text aus der Naht. Der Heartbeat meldet die
Liste als Anzeige-Kopie (`capabilities.testCommands`); das Formular bietet nur
sie an, und die Anlege- und die Fortsetzungs-Route prüfen die Auswahl dagegen
(`packages/runner/shared/testCommands.ts`: `test_command_not_listed`,
`tests_need_runner`). Meldet ein Rechner keine Liste, lässt der Server keinen
Testbefehl durch. Ein neues Feld, das der Dienst AUSFÜHRT oder in einen Pfad
setzt, braucht dieselbe Prüfung gegen die lokale Datei — die Testbefehle
kamen nach dem Entwurf dazu und liefen genau deshalb an ihr vorbei. Auch die
Lauf-Id wird im Dienst geprüft, bevor sie in einen Pfad geht (`isSafeRunId`).

„GEPRÜFT" BESTIMMT DER SERVER (SEC-038, seit 2026-11-14): `runs.promptTrusted`
kommt NIE aus dem Body. Die Anlege-Route fragt den Vertrag
`resolveRunSubjectTrust` (`packages/runner/server/utils/runSubjectTrust.ts`);
den Resolver für Tickets verdrahtet `apps/control`
(`server/plugins/runner-ticket-trust.ts`, A14: nur die App kennt beide Layer).
Kein Resolver ⇒ ungeprüft; Resolver wirft ⇒ 503. Die Herkunft steht am Ticket
(`tickets.origin`: `operator` | `staff` | `feedback` | `dependency` | leer =
Altbestand), jeder Schreibweg setzt sie serverseitig
(`packages/tickets/shared/ticketOrigin.ts`), Duplizieren kopiert sie, und sie
wird nie besser — geprüft ist nur `operator`. `feedbackId` ist NUR noch der
Dedup-Schlüssel. Eine Fortsetzung ist höchstens so gut wie ihr Vorgänger UND
wie die heutige Herkunft. Ungeprüft heisst: nur `plan`/`acceptEdits`, KEINE
Testbefehle (sie führten aus, was der Agent nach fremdem Text geschrieben
hat), und der Dienst rahmt den Text als Zitat. Neuer Schreibweg für Tickets ⇒
`origin` setzen (Wächter `packages/tickets/tests/ticketOrigin.test.ts`).

FRISTEN (BE-025, seit 2026-11-14): Protokolle 30 Tage nach Laufende,
Ereignisse 90 Tage. Server: stündlicher Lauf in `apps/control`
(`packages/runner/server/utils/runRetention.ts`, Schalter
`pukalani.runner.retention` off/dry-run/apply, Ops-Route
`POST /api/runner/retention/run`). Mac: der Dienst räumt `<stateDir>/runs`
selbst (`runRetention` in der Config, Vorgabe `dry-run`). Runbook für alle
drei Themen: docs/runbooks/AI-RUNNER-BETRIEB.md.
