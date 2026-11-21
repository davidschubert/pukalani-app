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
  liegen zwei Volume-Reste, die kein Container benutzt (am 2026-11-21
  nachgemessen: `appwrite_appwrite-builds` — das benutzte heißt
  `appwrite-builds` ohne Vorsatz — und `appwrite_appwrite-models`); löschen
  nur mit Davids Ja und nach einem Blick hinein. Die
  alten Sicherungskopien im Appwrite-Ordner sind seit dem 2026-11-20 weg,
  auch `.env.vorher-n11-…` — früher als hier geplant, mit Davids Auftrag
  zum Aufräumen (Erledigt-Liste, „AW30 (d)"); die alten Werte stehen laut
  Protokoll noch in den Backup-Läufen bis zum 2026-11-17. Der Zugang zum
  Konto beim Hoster gehört gehärtet (Einzelheiten privat). **Kopien löschen,
  ab dem 2026-12-02** (zwei ruhige Wochen nach dem 2026-11-18, Davids Ja):
  auf dem Appwrite-Server die Vorgänger der Skripte und des Zeitplans in
  `~/ops` und `~/bin` (`*.vorher-p11*`, `*.vorher-n11`, `*.vorher-n12`,
  `*.vorher-p22`, `*.vorher-p23`) und die Kopien von `config` und
  `known_hosts`; auf dem App-Server
  `authorized_keys.vorher-n11-…`; auf dem Mac die drei
  `*.env.vorher-n11` neben den Migrations-Schlüsseln. Erledigt und nur noch
  nachgemessen: der nächtliche Zeitplan steht als erwarteter Eintrag in
  `ops/cron.conf` und als Zeile im Runbook, und ein Probealarm über
  `backup_drill` trägt „(Probealarm)" im Titel.
- **(e) Hilfs-Image festlegen.** Backup und Wiederherstellung lesen und
  schreiben die Volumes über ein kleines Hilfs-Image (`alpine`, ohne Version;
  `BACKUP_HELPER_IMAGE` und `RESTORE_HELPER_IMAGE` in
  `ops/appwrite-backup.sh` und `ops/appwrite-restore.sh`). Fehlt es auf dem
  Server, lädt Docker es beim Lauf neu — so geschehen im Lauf vom 2026-11-21
  (das Image war seit der Vornacht weg; der Lauf ging gut, alle Prüfsummen
  stimmen). Zu tun: eine feste Version eintragen, das Image auf dem Server
  bereithalten, und einmal an der Attrappe zeigen, dass ein Lauf ohne das
  Image und ohne Netz ROT endet und nicht halb fertig liegen bleibt. Wer auf
  dem Server Images aufräumt, lässt dieses stehen.
