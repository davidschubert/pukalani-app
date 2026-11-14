# AI-Runner im Betrieb: Testbefehle, Herkunft, Aufräumen

Für den Dienst auf dem Rechner (`tools/ai-runner`) und seine Seite in der
Betreiber-Konsole (`packages/runner`). Einrichtung und Aufbau stehen im
[README des Dienstes](../../tools/ai-runner/README.md); hier steht, was man im
laufenden Betrieb tut. Regel für Agenten: `.claude/rules/ai-runner.md`.

Stand: 2026-11-14 (SEC-037, SEC-038, BE-025).

## 1. Testbefehle: nur aus der Liste auf dem Rechner

Der Dienst führt nach einem Lauf nur Testbefehle aus, die in SEINER
Einstellungs-Datei stehen (`~/.config/pukalani-runner/config.json`, je Repo
das Feld `testCommands`). Die Konsole wählt daraus aus, sie schickt nie einen
eigenen Befehl.

- Verglichen wird wortgleich: gleiche Wörter, gleiche Schreibweise, genau ein
  Leerzeichen dazwischen. `pnpm lint --fix` ist nicht `pnpm lint`.
- Fehlt das Feld oder ist die Liste leer, läuft kein Testbefehl.
- Steht in einem Auftrag ein Befehl, der nicht in der Liste ist, wird der
  ganze Auftrag abgelehnt, bevor irgendetwas startet. Der Lauf endet als
  „fehlgeschlagen" mit dem Grund `test_command_not_allowed`.
- Ein ungeprüfter Auftrag (Abschnitt 2) führt nie Testbefehle aus
  (`tests_not_allowed_untrusted`).
- Es gibt keine Shell: keine Pipes, keine Umleitungen, keine Variablen. Eine
  Befehlskette gehört in ein Skript im Repo, und das Skript in die Liste.

### Einen Befehl freigeben

1. Die Datei auf dem Rechner öffnen und den Befehl unter
   `repos.<Repo>.testCommands` eintragen, genau so, wie er laufen soll.
2. Prüfen: `node --experimental-strip-types src/main.ts --dry-config` (im
   Ordner `tools/ai-runner`) zeigt die Liste oder nennt den Tippfehler.
3. Dienst neu starten:
   `launchctl kickstart -k gui/$UID/app.pukalani.ai-runner`
4. Nach spätestens einer Minute meldet der Dienst die neue Liste an die
   Konsole; das Formular „Lauf starten" bietet den Befehl dann zur Auswahl an.

Tippfehler in der Liste (Leerzeichen am Rand, doppelte Leerzeichen,
Shell-Zeichen, doppelte Einträge) lässt der Dienst nicht durchgehen: er startet
dann nicht und schreibt den Grund in sein Log.

### Wenn ein Lauf mit „nicht erlaubt" endet

- **Im Formular ist der Befehl nicht wählbar:** Er steht nicht in der Liste
  des gewählten Rechners, oder der Rechner hat sich seit der Änderung noch
  nicht gemeldet. Liste prüfen (oben), Dienst neu starten.
- **Die Konsole lehnt beim Anlegen ab** (`test_command_not_listed`,
  `tests_need_runner`, `tests_not_allowed_untrusted`): Der Befehl steht nicht
  in der gemeldeten Liste, es ist kein bestimmter Rechner gewählt, oder der
  Auftrag gilt als ungeprüft.
- **Der Dienst lehnt ab** (`test_command_not_allowed` in der Zeitleiste des
  Laufs und im Log): Der Auftrag trug einen Befehl, den die Datei auf dem
  Rechner nicht kennt. Kommt das vor, obwohl niemand etwas eingetippt hat,
  ist das ein Warnzeichen: Der Auftrag kam dann nicht über das Formular.
  Nichts freigeben, sondern nachsehen, woher der Lauf stammt.
- **Eine Fortsetzung wird abgelehnt:** Der Vorgänger-Lauf trug Befehle, die
  heute nicht mehr in der Liste stehen. Entweder freigeben oder einen neuen
  Lauf ohne diese Befehle starten.

## 2. Herkunft: wann ein Auftrag als „geprüft" gilt

Ob ein Lauf als geprüft gilt, bestimmt der Server aus der Herkunft des
Tickets (Spalte `tickets.origin`). Der Browser kann das nicht behaupten.

| Herkunft | Bedeutung | gilt als geprüft |
| --- | --- | --- |
| `operator` | nur Konten mit der Rolle `admin` haben Titel, Beschreibung und Checkliste geschrieben | ja |
| `staff` | ein Konto ohne diese Rolle hat das Ticket angelegt oder seinen Text bearbeitet | nein |
| `feedback` | aus einer Rückmeldung übernommen | nein |
| `dependency` | maschinell erzeugtes Update-Ticket | nein |
| leer | Altbestand von vor dem 2026-11-14 | nein |

- Beim Duplizieren eines Tickets oder einer Liste wandert die Herkunft mit.
- Die Herkunft wird nie besser. Bearbeitet ein Admin ein `staff`-Ticket,
  bleibt es `staff`.
- Ein ungeprüfter Auftrag bekommt nur die Arbeitsweisen `plan` und
  `acceptEdits`, keine Testbefehle, und sein Text steht für den Agenten als
  Zitat mit einem Hinweis davor.
- Soll ein ungeprüftes Ticket mit vollen Möglichkeiten laufen: als Admin ein
  NEUES Ticket anlegen und den Text selbst hineinschreiben (lesen, nicht
  blind kopieren). Duplizieren hilft nicht.

## 3. Aufräumen: Protokolle 30 Tage, Ereignisse 90 Tage

### In der Konsole (Projekt `admin`)

Ein stündlicher Lauf der Betreiber-Konsole
(`packages/runner/server/utils/runRetention.ts`) löscht

- das Protokoll eines Laufs 30 Tage nach dessen Ende,
- Ereignis-Zeilen (`run_events`) nach 90 Tagen.

Er fasst nichts an, was zu einem noch laufenden Auftrag gehört, und keine
Anhänge. Die Zeile des Laufs mit dem Bericht bleibt.

Schalter `pukalani.runner.retention` (`apps/control/app/app.config.ts`):
`off` · `dry-run` (zählt nur) · `apply` (löscht). Die Fristen sind fest
(`packages/runner/shared/runRetention.ts`).

Jeder Lauf schreibt eine Zeile `runner.retention` mit Zahlen ins Log der App
(Kandidaten, gelöscht, übersprungen, fehlgeschlagen). Von Hand:
`POST /api/runner/retention/run` (angemeldet mit `runner.manage`); ohne Body
ist das ein Probelauf, `{ "dryRun": false }` löscht und geht nur, wenn der
Schalter auf `apply` steht. Löschen ist nicht umkehrbar.

### Auf dem Rechner

Der Dienst räumt seine Ablage selbst auf (`<stateDir>/runs/<Lauf>/`, darin
Auftrag, Anhänge und Protokoll): beim Start und danach alle 24 Stunden.
Einstellung `runRetention` in der Datei auf dem Rechner:
`{ "mode": "dry-run" | "apply" | "off", "days": 30 }`. Ohne Eintrag zählt er
nur (`dry-run`). Die Zeile „Ablage-Aufräumen" im Log des Dienstes nennt die
Zahlen.

## 4. Nach einer Änderung am Dienst

Der Dienst läuft direkt aus dem Haupt-Checkout. Eine Änderung an
`tools/ai-runner` wirkt erst nach `git pull` dort und einem Neustart
(`launchctl kickstart -k gui/$UID/app.pukalani.ai-runner`). Danach prüfen:

- Log des Dienstes: Startzeile mit Version und Repos, kein Config-Fehler.
- Konsole → Runner: „zuletzt gesehen" ist frisch.
- `--dry-config` zeigt die Liste der Testbefehle.
