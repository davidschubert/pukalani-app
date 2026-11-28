# WA1 — Einzelheiten

> Einzelheiten zum offenen Punkt **WA1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**WA1 — Alarm in die App hinein: Nacharbeiten (aus dem Gesamtaudit, Paket P22).**

- **(a), (c), (d) erledigt am 2026-11-28** (COMPLETE „WA1 (a), (c), (d)"):
  Server-Fehler auf allen Apps scharf (platform 25, die übrigen 10),
  `max_memory_restart` in jeder Ecosystem-Datei, Kundendomains auf `alarm`.
  Offen daraus nur für David: einmal
  `gh workflow run production-watch.yml -f kunden_drill=true`, danach ein
  Lauf ohne Schalter zum Aufräumen (Runbook PRODUKTIONS-ALARM, „Kundendomains").
- **(b) erledigt am 2026-11-17** (`NUXT_REDIS_URL` auf branding.supply, COMPLETE
  „N02").
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
  Fehler außerhalb einer Anfrage zählen als Server-Fehler mit (in der
  Messwoche zu (a): keine einzige Zeile). Nach `pm2 update` (beim Heben von Node) beginnt die
  Zählung neu: die Prozesse schreiben in neue Log-Dateien, und was davor
  war, steht 25 Stunden lang in keiner Zahl. Der Blick sagt das seit dem
  2026-11-20 selbst (COMPLETE „N18"). Die Dateien der früheren Nummer
  mitzulesen ist bewusst nicht gebaut (das Zähl-Skript liest nie nach
  Muster) — wer eine Schwelle aus (a) neu misst, bedenkt: ein Tag nach
  einem Node-Heben zählt weniger.
