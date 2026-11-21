# Günstigeres Textmodell – Aufstellung der Proben (KM1 c)

> **Plan-Status (2026-11-21):** nicht gebaut ([OPEN-ITEMS](../OPEN-ITEMS.md) „KM1“).

Stand: 2026-11-19. Nichts gebaut, nichts gewechselt, kein Aufruf bezahlt.
Offener Punkt: **KM1** in [OPEN-ITEMS](../OPEN-ITEMS.md). David hat am
2026-11-19 geklickt: „Ja, Proben vorbereiten". Gewechselt wird erst nach
einem weiteren Ja.

## Worum es geht

Alle Texte der Plattform schreibt heute `anthropic/claude-haiku-4.5`. Das
neuere `anthropic/claude-haiku-5.5` hat dieselben zwei Europa-Endpunkte und
steht in der Liste ohne Datenspeicherung.

| | Haiku 4.5 (heute) | Haiku 5.5 |
| --- | --- | --- |
| Preis in Europa je Million Tokens (Eingabe / Ausgabe) | 1,10 / 5,50 $ | 0,11 / 0,55 $ |
| Europa-Endpunkte | `amazon-bedrock/eu-west-1`, `google-vertex/europe` | dieselben zwei |
| Größte Eingabe / größte Ausgabe | 200.000 / 64.000 Tokens | 1.000.000 / 128.000 Tokens |
| Einstellung `temperature` | wird angenommen | **steht nicht mehr in der Liste** |

Gemessen am 2026-11-19 aus den öffentlichen Listen des Vermittlers, ohne
Schlüssel. Ein Preis aus einer Liste ist noch kein Beleg: der Beleg ist die
Abrechnung eines echten Aufrufs (Probe 0).

**Was der Wechsel spart, weiß heute niemand.** Dafür braucht es die Summe,
die der Vermittler im Monat abrechnet. Die steht in Davids Konto beim
Vermittler; im Repo steht sie nicht. Sind es wenige Dollar im Monat, lohnt
der Aufwand unten kaum.

## Was sich mit dem neuen Modell ändern kann

1. **`temperature`.** Der Transport schickt sie bei JEDEM Textaufruf mit
   (`packages/core/server/utils/aiComplete.ts`, Standard 0,2; fünf Stellen
   setzen 0, damit dieselbe Eingabe dieselbe Antwort gibt). Das neue Modell führt sie nicht mehr. Entweder lehnt der
   Vermittler den Aufruf ab, oder er lässt den Wert still fallen — dann
   gibt es „immer dieselbe Antwort" nicht mehr. Das klärt Probe 0.
2. **Die Form der Antwort.** 20 der 21 Stellen erwarten JSON. Die Reparatur
   kaputter Antworten (`packages/core/shared/aiJson.ts`) ist an Läufen mit
   Haiku 4.5 geeicht (4 von 52 Antworten waren kaputt).
3. **Die Länge der Antwort.** Die Decke für Insights-Entwürfe
   (`packages/insights/shared/insightsDraftBudget.ts`) ist aus 52 Läufen mit
   Haiku 4.5 gerechnet. Schreibt das neue Modell länger, reißt die Decke
   mitten im Text.
4. **Der Ton.** Der Markenberater und das Gespräch sind freier Text. Ob er
   noch so klingt wie gewollt, kann nur ein Mensch lesen.

## Die 21 Stellen

„Echte Probe gibt es" heißt: ein Skript im Repo ruft diese Stelle schon
heute mit einem echten Aufruf.

| Gruppe | Stellen | Antwort | Echte Probe gibt es |
| --- | --- | --- | --- |
| Übersetzen von Beiträgen, Kommentaren, Kursen, Lektionen, Terminen | 5 | JSON, von Hand geprüft | ja (`packages/core/scripts/verify-ugc-translation.mjs`) |
| Übersetzen ganzer Seiten | 1 | JSON, von Hand geprüft | ja (`packages/pages/scripts/verify-page-languages.mjs`) |
| Übersetzen von Kategorien | 1 | JSON, von Hand geprüft | nein |
| Hilfe beim Moderieren (Beitrag, Kommentar) | 2 | JSON, von Hand geprüft | nein |
| Tickets einordnen | 1 | JSON, von Hand geprüft | nein |
| Markenberater: Entwurf und Gespräch | 1 | freier Text | ja, nur das Gespräch (`packages/brand/scripts/verify-brand-sessions.mjs`) |
| Marke: Website-Urteil, DNA-Vorschlag, Zeichen-Brief | 3 | JSON, eine Stelle mit Schema | nein |
| Marke: Review (eine Stelle, zwei Stufen) | 1 | JSON mit Schema | nein |
| Insights: Entwurf, Übersetzung, Änderungsnotiz | 3 | JSON mit Schema | nein |
| Marktvergleich: Auslesen und Bericht | 2 | JSON mit Schema | ja, nur das Auslesen (`packages/market/scripts/market-library-compute.mjs`) |
| Marktvergleich: „Außensicht" (heute aus) | 1 | JSON mit Schema | nein, und nicht nötig, solange sie aus ist |

Bild-Lesen, Video-Lesen und Bild-Erzeugen haben eigene Modelle und sind
nicht betroffen. `node scripts/check-ai-routing.mjs` zählt die Stellen.

## Die Proben, in dieser Reihenfolge

Jede Stufe hört auf, sobald sie etwas findet. Alles läuft lokal, mit
Test-Konten und mit der Europa-Bindung des Codes, nie gegen Production.

- **Probe 0 – ein Aufruf.** Antwortet das neue Modell unter unserer Bindung?
  Wird zum Europa-Preis abgerechnet? Was passiert mit `temperature`?
  Kosten: unter 1 Cent. Fällt sie durch, endet das Vorhaben hier.
- **Probe 1 – die vier Skripte, die es schon gibt.** Dieselben Läufe einmal
  mit dem alten und einmal mit dem neuen Modell, die Ergebnisse
  nebeneinander. Deckt 8 Stellen ab.
- **Probe 2 – ein neues Probe-Skript für die 12 Stellen ohne Probe.** Es
  nimmt die echten Prompts aus dem Code und feste Beispiel-Eingaben, ruft
  jede Stelle zehnmal je Modell und zählt: Antwort lesbar? Schema erfüllt?
  Decke gerissen? Das Skript ist der eigentliche Aufwand.
- **Probe 3 – lesen.** David liest je fünf Antworten des Markenberaters und
  je zwei Insights-Entwürfe, alt und neu nebeneinander, ohne zu wissen,
  welches Modell welche geschrieben hat.

**Was die Proben kosten.** Ein Durchgang über alle Stellen mit beiden
Modellen erzeugt höchstens rund 82.000 Tokens Ausgabe je Modell (die Summe
aller Decken). Das sind höchstens 0,62 $ je Durchgang. Mit zehn Wiederholungen
in Probe 2: höchstens rund 6 $, erwartet unter 2 $, weil die meisten
Antworten weit unter ihrer Decke bleiben. Jede Stufe über Probe 0 hinaus
braucht Davids Klick.

**Was sie an Arbeit kosten.** Probe 0 und 1: eine Stunde. Probe 2: ein
Arbeitstag für das Skript und die Beispiel-Eingaben. Probe 3: eine halbe
Stunde Lesen für David.

## Wenn die Proben gut ausgehen: was dann anzufassen ist

- **Drei Modell-Felder:** `pukalani.ai.model` (Core), das Feld der Tickets,
  `reviewModel` (Marke). Dazu der feste Rückfall im Transport.
- **Vier weitere Stellen, die den alten Namen nennen:** die Auswahl-Liste
  und der Hinweistext in den Ticket-Einstellungen (de + en), das Skript
  `verify-brand-context.mjs`, und `market-library-compute.mjs` (dort auch
  die Preise).
- **Neu eichen:** die Decke der Insights-Entwürfe, die Kosten-Gewichte der
  Review (`packages/brand/shared/brandAiLimits.ts`) und, je nach Probe 0,
  der Umgang mit `temperature`.
- **Erst auf einem Deployment.** Das Core-Modell lässt sich je Deployment
  auf der Config-Seite umstellen, ohne Ausliefern und mit einem Klick
  zurück. `reviewModel` hat diesen Weg nicht; es wechselt nur mit einem
  Ausliefern. Die Umstellung auf der Config-Seite ändert die echte
  Datenbank und ist Davids Klick.

## Empfehlung

Erst die Monatssumme beim Vermittler ansehen. Liegt sie unter 20 $, bleibt
alles, wie es ist: der Wechsel spart dann weniger, als Probe 2 an Arbeit
kostet. Liegt sie darüber, Probe 0 und 1 machen (eine Stunde, unter 50
Cent) und danach neu entscheiden.
