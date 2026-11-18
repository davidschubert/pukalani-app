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
Board; einen schnellen Totmann-Zeitgeber gibt es nicht, nur die 7-Tage-Frist
für nie beendete Läufe (unten, „NIE BEENDET"). Server-Seite: Layer `packages/runner`
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

AUCH DEN AUFTRAGSTEXT BAUT DER SERVER (RU1 b, seit 2026-11-18): bis dahin
setzte die Seite den Text aus dem Ticket zusammen und schickte ihn mit; der
Server sagte „geprüft" über einen Text, den er nie gesehen hatte. Jetzt
liefert DERSELBE Vertrag (`resolveRunSubjectTrust`) neben der Herkunft den
Text: der Resolver der App liest die Ticket-Zeile einmal und baut ihn mit
`buildTicketRunPrompt` (`packages/tickets/shared/ticketRunPrompt.ts` — Titel,
Beschreibung ohne den KI-Triage-Abschnitt, offene Punkte der Checkliste; der
eine Checklisten-Leser liegt daneben in `shared/ticketChecklist.ts`). Die
Anlege-Route speichert GENAU DIESEN Text. `promptSource` im Body ist nur noch
„was die Person gesehen hat": die Oberfläche zeigt den Auftrag als Vorschau
(dieselbe Funktion) und schickt ihn zum VERGLEICH mit; weicht er vom frisch
gebauten Text ab, antwortet die Route 409 `prompt_changed` und legt nichts
an. Wer das Feld weglässt, bekommt den Text des Servers. GEPRÜFT IST NUR EIN
TEXT, DEN DER SERVER SELBST GEBAUT HAT: liefert ein Resolver keinen Text
(oder gibt es für den Subjekt-Typ keinen), ist der Text der Anfrage der
Auftrag — und der Lauf ungeprüft, egal was der Resolver zur Herkunft sagt.
Wer den Wortlaut des Auftrags ändert, ändert, was ein Agent liest:
`packages/tickets/tests/ticketRunPrompt.test.ts` hält ihn fest (samt
Vergleich mit der Fassung von vor dem Umzug). Die Fortsetzung nach einer
Rückfrage ist unverändert: ihr Text ist die Antwort der Person. Beweise:
`packages/runner/tests/runRoutes.test.ts` und
`apps/control/scripts/verify-run-prompt.mjs` (Bühne: echte Route bis zum
Abholen durch einen Rechner, mit Gegenprobe gefahren).

FRISTEN (BE-025, seit 2026-11-14): Protokolle 30 Tage nach Laufende,
Ereignisse 90 Tage. Server: stündlicher Lauf in `apps/control`
(`packages/runner/server/utils/runRetention.ts`, Schalter
`pukalani.runner.retention` off/dry-run/apply, Ops-Route
`POST /api/runner/retention/run`). Mac: der Dienst räumt `<stateDir>/runs`
selbst (`runRetention` in der Config, Vorgabe `dry-run`). TEXTE UND ANHÄNGE
(RU1 c, seit 2026-11-17): 12 Monate nach Laufende entfernt ein zweiter
stündlicher Lauf `run-text-retention` Auftrag, Fehlertext, freie
Berichtsfelder und die Anhang-Dateien; die Zeile bleibt, Kosten, Dauer,
Commit und die übrigen Zahlen und Kennungen bleiben (Erlaubnisliste in
`packages/runner/shared/runTextRetention.ts`, ein neues Berichtsfeld fällt,
bis es dort steht; Spur `textRemovedAt`). Util
`packages/runner/server/utils/runTextRetention.ts` auf dem Gerüst
`core/…/rowRetention.ts`, EIGENER Schalter `pukalani.runner.textRetention`
off/count/apply (control: `apply` seit 2026-11-17, Davids Ja zur Zahl),
Hand-Route `POST /api/runner/retention/texts` (`{ apply: true }`). NIE
BEENDET (RU1 c, seit 2026-11-17): ein Lauf in `draft`, `queued`, `claimed`
oder `running`, der seit 7 Tagen kein Lebenszeichen zeigt (jüngstes aus
`$updatedAt`, `claimedAt`, `startedAt` und dem letzten Ereignis — ein
lebender Lauf fasst seine Zeile nicht an), wird wie mit dem Abbrechen-Knopf
beendet: `cancelled`, `error: 'abandoned'`, Endzeit jetzt; danach greifen
die Fristen oben. `needs_input` ist ein Endzustand und bleibt. Dritter
stündlicher Lauf `stale-run-retention`
(`packages/runner/server/utils/staleRunRetention.ts`), EIGENER Schalter
`pukalani.runner.staleRunRetention` off/count/apply (control: `count` —
scharf nur mit Davids Ja zur gezählten Zahl), Hand-Route
`POST /api/runner/retention/stale`. FORTSETZEN NACH EINER RÜCKFRAGE prüft
die geerbten Testbefehle mit EINER Regel für Route und Board
(`checkInheritedTestCommands`, `shared/testCommands.ts`): passt ein alter
Lauf nicht mehr zur Liste, antwortet `resume.post.ts` 409 mit dem Grund, und
das Board zeigt statt des Antwortfelds den Satz „leg einen neuen Lauf an".
Runbook für alle Themen: docs/runbooks/AI-RUNNER-BETRIEB.md.
