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
  Die Kontingent-Zahlen im Katalog: gebaut und auf Production gefahren
  (2026-11-22, COMPLETE „KK1 (c) — Kontingent-Zahlen"), die Kommentar-Grenze
  von Pro am selben Tag auf 5000/250.000 gehoben. Die drei
  Verwaltungs-Routen der Seiten haben seit dem 2026-11-18 ihren Rollen-Test
  (BT1 b), samt Hinweis der Liste (`truncated`) und Fehler beim
  unvollständigen Löschen (`packages/pages/tests/route-roles.test.ts`).
