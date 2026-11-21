# LL1 — Einzelheiten

> Einzelheiten zum offenen Punkt **LL1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**LL1 — Lange Läufe: Reste (aus dem Gesamtaudit, Paket P18).**
Gebaut am 2026-11-17 (COMPLETE „N05"): Radar-Knopf im Hintergrund,
Video-Brief unter der Lauf-Sperre, Lebenszeichen der zwei Berater-Streams.
Gebaut am 2026-11-18 (COMPLETE „N10"): Zeichen-Entwürfe, Vorbilder lesen und
Fundament-Check rechnen im Hintergrund (Lauf-Tabelle `brand_runs`); ein
Wächter hält je Route die Summe ihrer Fristen gegen die Wartezeit des
Webservers (`packages/core/tests/routeDeadlineBudget.test.ts`).
Gebaut am 2026-11-18 (COMPLETE „N13"): der öffentliche Brand-Check, der
Marktbericht und die Dokument-Prüfung des Markenberaters rechnen im
Hintergrund; Kapitel-Prüfung und Schließen einer Sitzung haben einen
Zeitdeckel von 50 Sekunden über beide Stufen. Der Bestand des Wächters ist
von sechs auf einen Weg gesunken.

- **(c) Kleinigkeiten.** Ein abgebrochener Knopf-Lauf des Radars verbraucht
  einen der drei Starts je Stunde (bekannte Grenze: nur ein Ausliefern mitten
  im Lauf bricht ihn ab). `market-library-compute.mjs` und die vier
  `verify-market-*.mjs` fragen den Stand über dieselbe Hilfe ab, sind aber
  nicht gelaufen (sie bezahlen echte Läufe). Die Lesung der Vorbilder bucht
  seit dem 2026-11-19 wie die Entwürfe zurück (COMPLETE „N17"); seit dem
  2026-11-20 schreibt auch der Entwurfs-Lauf seine Zahl sofort, und ein Lauf
  mit verlorenem Herzschlag bekommt seinen sichtbaren Lauf beim nächsten
  Start zurück (COMPLETE „N18"). Bekannte Grenze, nicht gebaut: HÄNGT das
  Schreiben des Herzschlags länger als zwei Minuten (statt zu scheitern),
  merkt der Lauf nichts. Übernimmt in der Zeit ein anderer Start, kann für
  den ersten Lauf einmal zu viel zurückgebucht werden (ein sichtbarer Lauf;
  Konto- und Instanz-Deckel bleiben gebucht).
  Die Lauf-Zeilen (`market_runs`, `insights_runs`,
  `brand_runs`) haben bewusst keine Frist (bewertet am 2026-11-18, COMPLETE
  „N13"): sie nennen niemanden und sind klein. Neu ansehen, wenn eine der
  Tabellen über 50.000 Zeilen wächst — die Läufe des öffentlichen Checks
  hängen an keiner Marke und kommen höchstens 200 am Tag dazu.
  Der Hinweis „Quelle in der Zeit nicht gelesen" erscheint nur beim
  Zustandswechsel, nicht beim Speichern eines veröffentlichten Artikels (dort
  steht weiter „Zitat nicht belegt"). Ein Artikel mit sehr vielen langsamen
  Quellen lässt sich wegen der 45 Sekunden unter Umständen nicht freigeben —
  dann die Quellen einzeln über die Ampel prüfen und die langsamen ersetzen.
  Stirbt der Prozess mitten in einem Newsletter-Stapel, bekommt beim
  Fortsetzen höchstens dieser eine Stapel die Ausgabe doppelt (bekannte
  Grenze, unverändert). Der Newsletter ist auf Production ausgeschaltet; die
  Sperre ist dort nur durch Tests belegt. Der Alarm (Paket P22) kann
  abgebrochene Läufe an Lauf-Zeilen ohne Ende mit altem Herzschlag erkennen.
  Auf Production ist ein Lauf ÜBER 60 Sekunden weiter nicht gezeigt, auch
  nicht beim öffentlichen Brand-Check; alles ist lokal gezeigt (65 bis 87 s,
  je zwei Reiter). Der Wartezustand der Dokument-Prüfung und der Hinweis der
  Marktvergleich-Seite auf einen laufenden Bericht sind seit dem 2026-11-18
  lokal im Browser gezeigt, mit gestellten Läufen (COMPLETE „N15"). Die
  Marktvergleich-Seite startet den Bericht
  weiter über den Vergleich; die eigene Bericht-Route ruft heute keine Seite.
  Beim öffentlichen Check bekommt ein zweiter Besucher am SELBEN Anschluss
  mit derselben Adresse denselben Lauf (bewusst: so folgt ein zweites Gerät
  demselben Lauf; das Ergebnis teilen sich beide ohnehin über den
  Zwischenspeicher). Während die Dokument-Prüfung im Hintergrund eine Sitzung
  nachholt, kann ein gleichzeitiges Speichern im selben Kapitel einen
  Versions-Konflikt bekommen; die Werkstatt löst ihn wie bisher still auf
  (nicht eigens geprüft).
- **(d) Erledigt am 2026-11-18 (COMPLETE „N15").** Die Übersetzung einer
  ganzen Seite rechnet im Hintergrund (Lauf-Tabelle `pages_runs`, Migration
  `pages-007` in allen vier Projekten). Der Bestand des Fristen-Wächters
  „über der Wartezeit" ist leer. Nicht gesehen: ein echter Lauf über 60
  Sekunden mit einem Modell, der Hinweis beim zweiten Klick und der Satz bei
  fehlender Tabelle im Browser (nur in Tests).
