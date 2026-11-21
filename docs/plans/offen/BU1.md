# BU1 — Einzelheiten

> Einzelheiten zum offenen Punkt **BU1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**BU1 — Backup der Datenbank: Nacharbeiten (aus dem Gesamtaudit, Paket P11).**

- **(c) Übung wiederholen.** Einmal im Jahr und nach jeder Änderung an den
  Skripten (Runbook `APPWRITE-WIEDERHERSTELLUNG.md`, § 7). Die Skripte sind am
  2026-11-18 geändert worden (das Bündel der App-Einstellungen kam dazu): die
  nächste Übung öffnet zum ersten Mal `app-env.tar.gz.gpg` mit dem privaten
  Schlüssel und vergleicht eine Datei daraus mit dem Server — bis dahin ist
  nur bewiesen, dass verschlüsselt und abgelegt wird, nicht, dass sich das
  Bündel wieder lesen lässt. Noch nie geübt: ein voller Start mit allen
  Diensten, ein echter Ersatz-Server mit Umstellen der Adresse, der Abruf von
  der Storage Box ohne den alten Server. Braucht Davids privaten Schlüssel.
- **(d) Kleinigkeiten.** Die Backups sind verschlüsselt, aber nicht signiert
  — wer Zugang zur Box hat, könnte einen Lauf ersetzen; dagegen stehen die
  Schnappschüsse und die Zählung beim Zurückspielen. Auf dem Appwrite-Server
  liegen alte Sicherungskopien im Appwrite-Ordner und zwei Volume-Reste ohne
  Eintrag in der Compose-Datei; beides aufräumen. Der Zugang zum Konto beim
  Hoster gehört gehärtet (Einzelheiten privat). **Kopien löschen, ab dem
  2026-12-02** (zwei ruhige Wochen nach dem 2026-11-18, Davids Ja): auf dem
  Appwrite-Server die Vorgänger der Skripte (`*.vorher-p11*`,
  `*.vorher-n11`), die Kopie der Einstellungs-Datei im Compose-Ordner
  (`.env.vorher-n11-…`, sie trägt die alten Werte im Klartext) und die Kopien
  von `config`, `known_hosts` und des Zeitplans; auf dem App-Server
  `authorized_keys.vorher-n11-…`; auf dem Mac die drei
  `*.env.vorher-n11` neben den Migrations-Schlüsseln. Erledigt und nur noch
  nachgemessen: der nächtliche Zeitplan steht als erwarteter Eintrag in
  `ops/cron.conf` und als Zeile im Runbook, und ein Probealarm über
  `backup_drill` trägt „(Probealarm)" im Titel.
