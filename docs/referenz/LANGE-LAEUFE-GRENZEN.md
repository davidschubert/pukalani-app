# Lange Läufe – bekannte Grenzen

Stand: 2026-11-25 (aus LL1 (c), Gesamtaudit Paket P18 und Nacharbeiten N05,
N10, N13, N15, N17, N18). Die Regel selbst steht in
`.claude/rules/lange-laeufe.md`: lange Arbeit läuft unter einer Lauf-Sperre
im Hintergrund (`runDetached()`, `202`), die Seite fragt den Stand ab. Hier
steht, was dabei BEWUSST nicht gelöst ist — damit niemand es für einen
vergessenen Fehler hält. Eine Grenze, die stört, wird wieder ein Punkt in
`docs/OPEN-ITEMS.md`.

## Herzschlag und Rückbuchung

- **Hängendes Schreiben des Herzschlags.** Scheitert das Schreiben, merkt
  der Lauf es. HÄNGT es länger als zwei Minuten, merkt er nichts. Übernimmt in
  der Zeit ein anderer Start, kann für den ersten Lauf einmal zu viel
  zurückgebucht werden (ein sichtbarer Lauf; Konto- und Instanz-Deckel bleiben
  gebucht).
- **Radar-Knopf.** Ein abgebrochener Knopf-Lauf verbraucht einen der drei
  Starts je Stunde. Abgebrochen wird er nur durch ein Ausliefern mitten im
  Lauf.
- **Newsletter-Stapel.** Stirbt der Prozess mitten in einem Stapel, bekommt
  beim Fortsetzen höchstens dieser eine Stapel die Ausgabe doppelt. Der
  Newsletter ist auf Production aus; die Sperre ist dort nur durch Tests
  belegt.

## Lauf-Zeilen ohne Frist

`market_runs`, `insights_runs` und `brand_runs` haben keine Lösch-Frist
(bewertet am 2026-11-18, COMPLETE „N13"): sie nennen niemanden und sind
klein. **Neu ansehen, wenn eine der Tabellen über 50.000 Zeilen wächst.** Die
Läufe des öffentlichen Brand-Checks hängen an keiner Marke und kommen
höchstens 200 am Tag dazu. Der Alarm (Paket P22) kann abgebrochene Läufe an
Zeilen ohne Ende mit altem Herzschlag erkennen.

## Prüfung der Quellen (Insights)

- Der Hinweis „Quelle in der Zeit nicht gelesen" erscheint nur beim
  Zustandswechsel, nicht beim Speichern eines veröffentlichten Artikels (dort
  steht weiter „Zitat nicht belegt").
- Ein Artikel mit sehr vielen langsamen Quellen lässt sich wegen der
  45 Sekunden unter Umständen nicht freigeben. Dann die Quellen einzeln über
  die Ampel prüfen und die langsamen ersetzen.

## Öffentlicher Brand-Check und Marken-Werkstatt

- Ein zweiter Besucher am SELBEN Anschluss mit derselben Adresse bekommt
  denselben Lauf. Gewollt: so folgt ein zweites Gerät demselben Lauf, und das
  Ergebnis teilen sich beide ohnehin über den Zwischenspeicher.
- Während die Dokument-Prüfung im Hintergrund eine Sitzung nachholt, kann ein
  gleichzeitiges Speichern im selben Kapitel einen Versions-Konflikt
  bekommen. Die Werkstatt löst ihn wie bisher still auf (nicht eigens
  geprüft).
- Die Marktvergleich-Seite startet den Bericht über den Vergleich; die eigene
  Bericht-Route ruft heute keine Seite.

## Was nur lokal gezeigt ist

- Alle Hintergrund-Läufe sind lokal gezeigt (65 bis 87 s, je zwei Reiter),
  der Wartezustand der Dokument-Prüfung und der Hinweis der
  Marktvergleich-Seite mit gestellten Läufen (COMPLETE „N15").
- Die Seiten-Übersetzung (`pages_runs`): der Hinweis beim zweiten Klick und
  der Satz bei fehlender Tabelle sind nur durch Tests belegt.
- `market-library-compute.mjs` und die vier `verify-market-*.mjs` fragen den
  Stand über dieselbe Hilfe ab, sind aber nicht gelaufen: sie bezahlen echte
  Läufe.
- Ein echter Lauf über 60 Sekunden auf Production: offen in
  `docs/OPEN-ITEMS.md` (LL1).
