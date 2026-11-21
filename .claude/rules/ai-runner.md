---
paths:
  - "tools/ai-runner/**"
  - "packages/runner/**"
---

## AI-Runner-Daemon (`tools/ai-runner`) und Layer `packages/runner`

- DIE ALLOWLIST LIEGT AUF DEM MAC (`~/.config/pukalani-runner/config.json`):
  erlaubte Modi, Modelle, Budget, geschützte Branches und Testbefehle stehen
  NUR dort; über die Naht reist nur ein `repoKey`, nie ein Pfad. Modus, Modell
  und Budget werden still heruntergestuft (mit Ereigniszeile), nicht abgelehnt.
- EIN LAUF, SELBST COMMITTEN: der Daemon fährt genau EINEN Lauf gleichzeitig
  und committet selbst (`acceptEdits` erlaubt kein `git commit`) — nie push,
  nie auf einem geschützten Branch.
- `needs_input` NIE AUS DEM EXIT-CODE: ein blockierter Lauf endet als
  `success`/`is_error:false`; die Wahrheit steht in `permission_denials` und
  im `post_turn_summary` (`docs/archiv/AI-RUNNER.md` § 11).
- DAEMON TOT ⇒ der Lauf bleibt `running`; die Kur ist der Abbrechen-Knopf im
  Board. Einen schnellen Totmann gibt es nicht, nur die 7-Tage-Frist („NIE
  BEENDET").
- SERVER-SEITE: Layer `packages/runner` (Board-UI + Naht, Tabellen
  runners/runs/run_events), Capability `runner.manage` NUR admin. Beweise:
  `packages/runner/scripts/verify-runner-boundary.mjs` und
  `tools/ai-runner/scripts/smoke.mjs` (läuft mit `pnpm -r test`).

- TESTBEFEHLE SIND EINE AUSWAHL, KEIN TEXT (SEC-037, Davids Entscheidung): der
  Dienst führt nur aus, was WORTGLEICH in `repos.<key>.testCommands` seiner
  lokalen Config steht (fehlt die Liste, läuft nichts), und zwar den
  Listeneintrag, nie den Text aus der Naht. NICHT heruntergestuft: ein
  einziger nicht gelisteter Befehl lehnt den GANZEN Auftrag ab, vor Material
  und Agent (`test_command_not_allowed`, Fehler-Ereignis und Log). Der
  Heartbeat meldet die Liste nur als Anzeige-Kopie
  (`capabilities.testCommands`); das Formular bietet nur sie an, Anlege- und
  Fortsetzungs-Route prüfen dagegen (`packages/runner/shared/testCommands.ts`:
  `test_command_not_listed`, `tests_need_runner`). Meldet ein Rechner keine
  Liste, lässt der Server keinen Testbefehl durch.
- NEUES FELD, DAS DER DIENST AUSFÜHRT ODER IN EINEN PFAD SETZT ⇒ dieselbe
  Prüfung gegen die lokale Datei. Auch die Lauf-Id wird im Dienst geprüft,
  bevor sie in einen Pfad geht (`isSafeRunId`).

- „GEPRÜFT" BESTIMMT DER SERVER (SEC-038): `runs.promptTrusted` kommt NIE aus
  dem Body. Die Anlege-Route fragt den Vertrag `resolveRunSubjectTrust`
  (`packages/runner/server/utils/runSubjectTrust.ts`); den Ticket-Resolver
  verdrahtet `apps/control/server/plugins/runner-ticket-trust.ts` (A14: nur die
  App kennt beide Layer). Kein Resolver ⇒ ungeprüft; Resolver wirft ⇒ 503.
- HERKUNFT AM TICKET: `tickets.origin` (`operator` | `staff` | `feedback` |
  `dependency` | leer = Altbestand). Jeder Schreibweg setzt sie serverseitig
  (`packages/tickets/shared/ticketOrigin.ts`), Duplizieren kopiert sie, sie
  wird nie besser; geprüft ist nur `operator`. `feedbackId` ist NUR der
  Dedup-Schlüssel. Eine Fortsetzung ist höchstens so gut wie ihr Vorgänger UND
  die heutige Herkunft. Neuer Schreibweg für Tickets ⇒ `origin` setzen
  (Wächter `packages/tickets/tests/ticketOrigin.test.ts`).
- UNGEPRÜFT HEISST: nur `plan`/`acceptEdits`, KEINE Testbefehle, und der
  Dienst rahmt den Text als Zitat.
- AUCH DEN AUFTRAGSTEXT BAUT DER SERVER (RU1 b): derselbe Vertrag liefert
  neben der Herkunft den Text; der Resolver der App baut ihn mit
  `buildTicketRunPrompt` (`packages/tickets/shared/ticketRunPrompt.ts` —
  Titel, Beschreibung ohne den KI-Triage-Abschnitt, offene Checklisten-Punkte;
  der eine Checklisten-Leser ist `packages/tickets/shared/ticketChecklist.ts`).
  Die Anlege-Route speichert GENAU DIESEN Text. `promptSource` im Body ist nur
  „was die Person gesehen hat" (Vorschau mit derselben Funktion) und dient
  dem VERGLEICH: weicht er ab ⇒ 409 `prompt_changed`, nichts angelegt; fehlt
  er ⇒ der Text des Servers.
- GEPRÜFT IST NUR EIN TEXT, DEN DER SERVER SELBST GEBAUT HAT: liefert ein
  Resolver keinen Text (oder gibt es für den Subjekt-Typ keinen), ist der Text
  der Anfrage der Auftrag — und der Lauf ungeprüft, egal was der Resolver zur
  Herkunft sagt. Wer den Wortlaut ändert, ändert, was ein Agent liest:
  `packages/tickets/tests/ticketRunPrompt.test.ts` hält ihn fest. Die
  Fortsetzung nach einer Rückfrage behält ihren Text: die Antwort der Person.
  Beweise: `packages/runner/tests/runRoutes.test.ts`,
  `apps/control/scripts/verify-run-prompt.mjs`.

- SCHALTER DER LÖSCH-LÄUFE STEHEN JE APP in deren `app.config.ts`
  (`pukalani.runner.*`, heute `apps/control/app/app.config.ts`); Layer-Vorgabe
  `off` (`packages/runner/app/app.config.ts`). Was dort steht, ist der Stand —
  vor jeder Aussage „zählt nur"/„löscht" dort nachsehen; `apply` nur mit
  Davids Ja zur gezählten Zahl (`zeit-laeufe.md`). Die Läufe fahren
  stündlich über `defineTimedJob` (`packages/runner/server/plugins/`).
- FRISTEN (BE-025): Protokolle 30 Tage nach Laufende, Ereignisse 90 Tage
  (`packages/runner/server/utils/runRetention.ts`, Schalter
  `pukalani.runner.retention` off/dry-run/apply, Ops-Route
  `POST /api/runner/retention/run`). Auf dem Mac räumt der Dienst
  `<stateDir>/runs` selbst (`runRetention` in der Config, Vorgabe `dry-run`).
- TEXTE UND ANHÄNGE (RU1 c): 12 Monate nach Laufende entfernt
  `run-text-retention` Auftrag, Fehlertext, freie Berichtsfelder und die
  Anhang-Dateien; die Zeile bleibt, Kosten, Dauer, Commit und übrige Zahlen
  und Kennungen bleiben. Erlaubnisliste in
  `packages/runner/shared/runTextRetention.ts` — ein neues Berichtsfeld fällt,
  bis es dort steht; Spur `textRemovedAt`. Util
  `packages/runner/server/utils/runTextRetention.ts` auf dem Gerüst
  `core/server/utils/rowRetention.ts`, EIGENER Schalter
  `pukalani.runner.textRetention` off/count/apply, Hand-Route
  `POST /api/runner/retention/texts` (`{ apply: true }`).
- NIE BEENDET (RU1 c): ein Lauf in `draft`, `queued`, `claimed` oder
  `running` ohne Lebenszeichen seit 7 Tagen (jüngstes aus `$updatedAt`,
  `claimedAt`, `startedAt` und dem letzten Ereignis) wird wie mit dem
  Abbrechen-Knopf beendet: `cancelled`, `error: 'abandoned'`, Endzeit jetzt;
  danach greifen die Fristen oben. `needs_input` ist ein Endzustand und
  bleibt. Lauf `stale-run-retention`
  (`packages/runner/server/utils/staleRunRetention.ts`), EIGENER Schalter
  `pukalani.runner.staleRunRetention` off/count/apply, Hand-Route
  `POST /api/runner/retention/stale`.
- FORTSETZEN NACH EINER RÜCKFRAGE prüft die geerbten Testbefehle mit EINER
  Regel für Route und Board (`checkInheritedTestCommands`,
  `packages/runner/shared/testCommands.ts`): passt ein alter Lauf nicht mehr
  zur Liste, antwortet die Fortsetzungs-Route
  (`packages/runner/server/api/runner/runs/[id]/resume.post.ts`) 409 mit dem
  Grund, und das Board zeigt statt des Antwortfelds „leg einen neuen Lauf an".

Runbook für alle Themen: `docs/runbooks/AI-RUNNER-BETRIEB.md`.
