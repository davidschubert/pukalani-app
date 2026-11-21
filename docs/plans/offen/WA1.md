# WA1 — Einzelheiten

> Einzelheiten zum offenen Punkt **WA1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**WA1 — Alarm in die App hinein: Nacharbeiten (aus dem Gesamtaudit, Paket P22).**

- **(a) Schwellen scharf stellen.** Rot wird heute nur, was eindeutig ist
  (Zeit-Lauf überfällig, KI ohne Guthaben oder ohne Endpunkt, Server-Fehler
  auf `platform` ab 25 in 25 Stunden). Nur gezählt werden: Server-Fehler auf
  admin, branding, portfolio, Landing und Hilfe (das Protokoll ist dort erst
  seit dem 2026-11-16 an), Fehler aus dem Browser und übrige KI-Ausfälle. Ab
  dem 2026-11-23 die Zeilen „Nur gezählt" der täglichen Läufe ansehen und in
  `scripts/ops/app-signals-rules.mjs` (`RULES`) je App eine Zahl eintragen.
- **(b) erledigt am 2026-11-17** (`NUXT_REDIS_URL` auf branding.supply, COMPLETE
  „N02").
- **(c) Speichergrenze je Prozess.** Die pm2-Dateien kennen keine
  (`max_memory_restart`). Ein zu knapper Wert startete eine Seite im Kreis
  neu, deshalb erst mit Messwerten: der tägliche Lauf berichtet den Speicher je
  Prozess. Gemessen am 2026-11-16: fünf Apps 99 bis 182 MB, `platform` 291 MB
  kurz nach dem Start und 555 MB nach gut einer Stunde (Rechner: 3,8 GB).
- **(d) Kundendomains: der neue Blick zählt erst nur.** Gebaut am 2026-11-18
  (COMPLETE „N16"): der Job `kundendomains` liest alle 30 Minuten die live
  geschalteten Kundendomains aus dem Control Plane und prüft Zertifikat und
  Erreichbarkeit. Er läuft mit `PUKALANI_CUSTOMER_HOSTS_MODE: count` — ein
  Befund ist eine Zeile „Nur gezählt", rot wird nichts. Ab dem 2026-11-23 die
  Zeilen der Läufe ansehen; sind sie sauber, in
  `.github/workflows/production-watch.yml` `alarm` eintragen (dann prüft der
  Job nur, was die feste Liste nicht schon kennt, und ein Befund ist rot) und
  danach einmal `-f kunden_drill=true`. Das Geheimnis ist seit dem 2026-11-18
  gesetzt (Davids Ja; Site `admin.pukalani.app` und Umgebung
  `production-watch`), tauschen: docs/runbooks/PRODUKTIONS-ALARM.md,
  „Kundendomains". Heute stehen alle Kundendomains der Route auch in der
  festen Liste — der Nutzen kommt mit der nächsten.
- **(e) Kleinigkeiten.** Erledigt am 2026-11-17 (COMPLETE „N09"): die Zeilen
  „[Icon] failed to load" (Ursache behoben), Fehler außerhalb einer Anfrage
  (zählbare Zeile `server.error` mit `source: process`), der Lauf
  `past-due-notice` meldet „schon im Gange" als übersprungen. Offen: Das
  Guthaben bei OpenRouter lässt sich nicht im Voraus prüfen (nur mit einem
  Verwaltungs-Schlüssel) — gemeldet wird der erste abgelehnte Aufruf. Der
  Mail-Blick liest seit dem 2026-11-18 nur noch die Dateien des laufenden
  Prozesses (COMPLETE „N16"); das alte Tor-Wort `mail-breaker` braucht nur
  noch der Probelauf — beim nächsten geplanten Einspielen des Wächter-Tors
  (`ops/app-watch-gate.sh`) kann es entfallen. Auf dem Appwrite-Server liegen die
  Sicherungen `*.vorher-p22` (nach zwei Wochen löschen). Im Log-Ordner der
  Platform-App liegt noch die Datei einer früheren Prozess-Nummer mit rund
  263.000 Icon-Zeilen (nur Platz; mit dem Aufräumen am 2026-11-30 löschen).
  Fehler außerhalb einer Anfrage zählen als Server-Fehler mit — wenn die
  Schwellen in (a) gesetzt werden, die Zeilen mit `source: process` einmal
  getrennt ansehen. Nach `pm2 update` (beim Heben von Node) beginnt die
  Zählung neu: die Prozesse schreiben in neue Log-Dateien, und was davor
  war, steht 25 Stunden lang in keiner Zahl. Der Blick sagt das seit dem
  2026-11-20 selbst (COMPLETE „N18"). Die Dateien der früheren Nummer
  mitzulesen ist bewusst nicht gebaut (das Zähl-Skript liest nie nach
  Muster) — beim Scharfstellen in (a) bedenken: ein Tag nach einem
  Node-Heben zählt weniger.
