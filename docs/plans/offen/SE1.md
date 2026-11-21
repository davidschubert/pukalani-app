# SE1 — Einzelheiten

> Einzelheiten zum offenen Punkt **SE1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**SE1 — Server-Einstellungen und Schutz-Kopfzeilen: Reste (aus dem Gesamtaudit, Paket P23).**
Erledigt am 2026-11-17 (COMPLETE „N07"): die Annahme-Route für die Berichte
der Skript-Regel samt Zahl im täglichen Blick, die tote Erinnerungs-Route,
das Zähl-Skript für umgelaufene Logs, die eigene Domain für Stripe-Rückwege
und den Link im Kommentar-Bereich.

- **(a) Skript-Regel (CSP) scharf stellen.** Die Regel beobachtet weiter nur.
  Nächste Schritte, in dieser Reihenfolge: (1) eine Woche lang im täglichen
  Blick die Zahl „Skript-Regel" je App lesen und jeden Bericht ansehen
  (`grep '"event":"csp.report"'` im Fehler-Log der App) — jede bekannte
  fremde Quelle gehört in `knownScriptOrigins()`; (2) Nonces statt
  `'unsafe-inline'`, weiter beobachtend — mit Absicht erst danach: mit Nonces
  meldet der Browser auch jedes Skript, das eine Erweiterung direkt in die
  Seite schreibt, als `inline` ohne erkennbare Quelle, und das begrübe die
  erste Messung; (3) scharf stellen, wenn eine Woche keinen echten Verstoß
  zeigt (Davids Entscheidung). Nicht geprüft: Firefox und Safari.
- **(b) HSTS auch für Unter-Adressen.** Gesendet wird ein Jahr, je Host, ohne
  `includeSubDomains`. Für `pukalani.app` ginge der Zusatz erst, wenn JEDE
  Unter-Adresse der Zone sicher per HTTPS antwortet (auch die, die nicht diese
  App bedient). Kundendomains bleiben ohne. Lässt sich nicht zurücknehmen
  (Browser merken es sich ein Jahr) — nur mit Davids Entscheidung.
- **(c) Umlauf der pm2-Logs: erledigt, ein Rest am Server-Termin.**
  Nachgesehen am 2026-11-19 (COMPLETE „N17"): der Umlauf lief in der Nacht um
  03:12, der tägliche Wächter blieb grün. Rest für den Server-Termin ab
  2026-11-30 (zusammen mit d und e): die umgelaufenen Kopien der Dateien
  FRÜHERER Prozess-Nummern liegen weiter im Ordner `~/.pm2/logs/` (die größte
  rund 57 MB, `platformpukalaniapp-error-3.log.1`) — niemand schreibt mehr in
  sie, sie können von Hand weg. In der Nacht auf den 2026-11-20 muss zum
  ersten Mal je Log eine Datei `.2.gz` dazukommen; das zeigt derselbe Blick
  am Server-Termin.
- **(d) Erinnerungs-Lauf.** Die Route ist aus dem Code. Auf dem Server liegen
  noch die Einstellung `NUXT_EVENTS_SWEEP_KEY` und die Datei
  `~/events-sweep.log` — sie gehen am Server-Termin ab 2026-11-30 mit weg
  (Davids Entscheidung vom 2026-11-17, zusammen mit den Sicherungen aus e). Auswahl, Text und
  Schlüssel-Sorte `events-sweep` sind seit 2026-11-17 aus dem Code (COMPLETE
  „N08"); in der Tabelle `instance_secrets` des Projekts kann noch eine Zeile
  dieser Sorte liegen — niemand liest sie mehr, sie kann am selben Termin mit
  weg.
  **Erinnerungen in nicht erreichbaren Communities: gebaut, zählt erst nur.**
  Seit dem 2026-11-19 erkennt der Zeit-Lauf `event-reminders` Termine
  stillgelegter und wegen Missbrauchs gesperrter Communities (COMPLETE
  „N17"). Er erinnert dort noch WEITER und zählt nur, was er ausließe. Der
  erste Takt auf Production zählte lauter Nullen — es war kein Termin
  fällig, und ohne fälligen Termin fragt der Lauf das Control Plane gar
  nicht. Das zeigt die Erkennung nicht; ein fälschlich ausgelassener Termin
  ließe sich nicht nachholen, länger zählen kostet nichts.
  **Scharf stellen, wenn** der tägliche Blick in die App (Hinweis-Zeile zum
  Erinnerungs-Lauf bei `platform.pukalani.app`) einen Tag zeigt, an dem
  mindestens ein Takt „mit Frage ans Control Plane" gezählt ist und nicht
  alle davon „ohne Antwort" — UND die Zahl „Termine stillgelegter oder
  gesperrter Communities" zu dem passt, was im Control Plane wirklich
  stillgelegt oder gesperrt ist (das sieht nur, wer die Betreiber-Tabelle
  liest: ist dort nichts stillgelegt und nichts gesperrt, muss die Zahl 0
  sein). **Was dann zu ändern ist:** eine Zeile,
  `EVENT_REMINDER_UNREACHABLE_MODE` in
  `packages/events/shared/eventReminderJob.ts` von `'count'` auf `'skip'`
  (Vorlage: der Zweig des geschlossenen Pull Requests 424). Über mehrere Tage
  „ohne Antwort" größer als 0 hieße: die Platform-App erreicht das Control
  Plane für diese Frage nicht — dann erst das klären.
- **(e) Kleinigkeiten.** Sicherungen nach zwei Wochen löschen (ab 2026-11-30):
  auf dem App-Server `/home/ploi/logs/nginx/*.vorher-p23*` und
  `/home/ploi/portfolio.pukalani.app/.env.vorher-p23*`, auf dem Appwrite-Server
  `~/bin/pukalani-cert-gate.sh.vorher-p23` und `~/ops/crontab.vorher-p23`; im
  Ploi-Panel das Skript „P23: nginx-Zugriffs-Log 14 Tage". Auf `pukalani.app`
  liefert Cloudflare unveränderte Dateien noch mit den Kopfzeilen des alten
  Webservers aus (löst sich mit dem nächsten Build der Landing). Auf `admin`
  beantwortet der Webserver `/favicon.ico` selbst mit 404 (ein leerer Block
  aus Plois Schablone; der für `/robots.txt` ist seit dem 2026-11-20 weg,
  COMPLETE „Q04"). Zwei Sites senden
  `Connection 'upgrade'` fest. Die Umleitungs-Blöcke des Webservers schreiben
  weiter ins allgemeine Zugriffs-Log (jetzt 14 Tage). Der Vergleich der
  Webserver-Einstellung läuft nur auf dem App-Server (der Appwrite-Server hat
  seinen Webserver im Container).
- **(f) Eigene Domain einer Einzel-Site.** Offen, wer mag: auf pukalani.studio
  einmal „Passwort vergessen" mit der eigenen Adresse auslösen — der Link muss
  mit `https://pukalani.studio` beginnen. Die Stripe-Rückwege sind nur mit
  gestellten Stripe-Antworten geprüft.
