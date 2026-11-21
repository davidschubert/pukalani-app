# KK1 — Einzelheiten

> Einzelheiten zum offenen Punkt **KK1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**KK1 — Kleine Korrekturen in Events, Seiten, Statistik: Reste (aus dem Gesamtaudit, Paket P28).**
Erledigt seit 2026-11-17 (COMPLETE „N03"): zweite Erinnerung nach dem
Verschieben, „bezahlt" an einem Termin prüft auch der Server, die Zahlen
fragen die Adresse aus der Zähl-Datei ab, ein Zeitpunkt wird nur noch bei
Erinnerungen gelesen, eine Liste der Betreiber-Ziele.

- **(b) Statistik.** Die Prüfung der Zähl-Kennung und das neue Ziel der
  Zahlen sind mit Tests am echten Handler belegt, aber noch an keiner echten
  Community mit eigener Zähl-Seite geklickt (Kennung speichern, Zahlen-Seite
  öffnen — am besten mit einer Seite, die in Plausible unter der `www`-Adresse
  liegt). Schon gespeicherte Kennungen werden nicht nachträglich geprüft; eine
  fremde Kennung aus der Zeit davor zeigt keine fremden Zahlen (gefragt wird
  dann die eigene Adresse), zählt aber weiter dorthin.
- **(c) Kleinigkeiten.** Das Nachholen eines halb gescheiterten Ausblendens
  (Termine) geht über die Route, die Oberfläche bietet es an einem schon
  ausgeblendeten Termin nicht an — sie kann den halben Zustand nicht erkennen.
  Die Zahlen des Seiten-Kontingents stehen nur in der Konfiguration der
  Platform-App, nicht im Katalog des Control Plane. Bewertet am 2026-11-17:
  das wirkt heute richtig (fehlt eine Art im Katalog, gilt die Zahl aus der
  Konfiguration). Für den Katalog bräuchte es zweierlei: die Plan-Route
  (`plans/[key].patch.ts`) schreibt heute die ganze Grenzen-Zeile neu und
  löschte einen Seiten-Eintrag beim nächsten Speichern der Kommentar-Grenzen
  — sie müsste zusammenführen, und die Seite bräuchte Felder je Art; dazu die
  Zahlen einmal in die drei Plan-Zeilen der echten Datenbank (Davids Ja).
  Empfehlung: erst bauen, wenn die Zahl je Plan verschieden sein soll. Die
  drei Verwaltungs-Routen der Seiten haben noch keinen Rollen-Test (stehen im
  Bestand, BT1 b); ein solcher Test belegt dann auch den Hinweis der Liste
  und den Fehler beim unvollständigen Löschen.
