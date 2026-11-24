# Günstigeres Textmodell – Probe und Entscheidung (KM1 c)

> **Plan-Status (2026-11-24):** teils gebaut — offen: Schritt 2 bis 4 (Probe, Lese-Probe, Umstellen); Schritt 1 (Transport) gebaut, Davids Ja am 2026-11-24 ([OPEN-ITEMS](../OPEN-ITEMS.md) „KM1“).

Stand: 2026-11-22. Die Probe-Vorrichtung steht im Repo
(`scripts/ki-modell-probe.mjs`), ein echter Probelauf ist gefahren (lokal,
erfundene Eingaben, zusammen rund 0,09 $). Auf Production ist nichts
umgestellt. **Es fehlt nur Davids Entscheidung** (unten „Was David
entscheidet").

## Kurz

- **Haiku 5.5 kostet in Europa ein Zehntel** von Haiku 4.5 (Liste des
  Vermittlers, gelesen am 2026-11-22: 0,11 / 0,55 $ statt 1,10 / 5,50 $ je
  Million Tokens Eingabe / Ausgabe, dieselben zwei Europa-Endpunkte).
- **So, wie die App heute ruft, spart es nur das Zwei- bis Siebenfache — und
  der Insights-Entwurf geht kaputt.** Haiku 5.5 „denkt" von selbst nach. Die
  Denk-Tokens stehen nicht im Text, werden aber als Ausgabe bezahlt und füllen
  `max_tokens`. Beim Insights-Entwurf war die Decke 3 von 3 Mal voll, bevor das
  JSON zu Ende war.
- **Mit abgeschaltetem Denken bestehen alle Aufgaben, und jeder Aufruf kostet
  ein Sechstel bis ein Achtel.** Dafür muss der Transport ein Feld mehr
  schicken (`reasoning`), das heute nicht vorgesehen ist — eine kleine
  Code-Änderung VOR jedem Wechsel.
- **`temperature` nimmt das neue Modell nicht.** Der Vermittler lehnt den
  Aufruf nicht ab, er lässt den Wert still fallen. Die fünf Stellen, die mit 0
  „immer dieselbe Antwort" wollen, bekommen das nicht mehr.

## Die Probe

`node scripts/ki-modell-probe.mjs` stellt fünf Aufgaben mit einer festen,
erfundenen Eingabe nach (eine Bäckerei und ein Werkzeughersteller, die es
nicht gibt). Prompt, `temperature`, `max_tokens` und die Prüfung der Antwort
lädt es aus dem echten Code; „bestanden" heißt: die Antwort übersteht die
Klemmung bzw. das Schema, mit dem die Route sie annimmt. Ohne Schalter ist es
ein Trockenlauf mit gestellten Antworten (kostet nichts, prüft, dass Prompts
laden und die Prüfung greift). `--live` zeigt vorher die geschätzten
Höchstkosten und bricht über `--max-usd` (Standard 1) ab. Gerufen wird mit
dem Rumpf des Core-Transports; das Skript prüft vor dem Senden, dass die
Europa-Bindung wörtlich stimmt (`pnpm check:ai-routing` kennt es).
Ergebnis: `ergebnis.json` und `vergleich.md` (Antworten nebeneinander).

```bash
node scripts/ki-modell-probe.mjs --live --runs 3 --env-file apps/comments/.env
node scripts/ki-modell-probe.mjs --live --runs 2 --models anthropic/claude-haiku-5.5 --reasoning none --env-file apps/comments/.env
```

### Gemessen am 2026-11-22 (Kosten laut Vermittler je Aufruf, Mittel)

| Aufgabe | Haiku 4.5 heute | Haiku 5.5 wie heute gerufen | Haiku 5.5, Denken aus | Faktor (Denken aus) |
| --- | --- | --- | --- | --- |
| Marke: DNA-Vorschlag | 3/3, 0,0063 $ (JSON 3× repariert) | 3/3, 0,0012 $ | 2/2, 0,0010 $ | ≈ 6× |
| Marke: Zeichen-Brief | 3/3, 0,0035 $ | 3/3, 0,0005 $ | 2/2, 0,0005 $ | ≈ 7× |
| Insights: Entwurf (400 Wörter) | 3/3, 0,0087 $ | **0/3 — Decke voll** | 2/2, 0,0011 $ | ≈ 8× |
| Insights: Übersetzung | 3/3, 0,0015 $ | 3/3, 0,0005 $ | 2/2, 0,0002 $ | ≈ 7× |
| Insights: Änderungsnotiz | 3/3, 0,0012 $ | 3/3, 0,0005 $ | 2/2, 0,0002 $ | ≈ 6× |

Mit Denken auf „low" war es dazwischen: alles bestanden, aber der Entwurf
brauchte 3.400 von 3.400 möglichen Tokens (rund die Hälfte Denken) — eine
Decke ohne Luft. Zwei Läufe je Variante sind wenig; für die Entscheidung
genügt es, für die Eichung nicht.

### Was die Probe NICHT deckt

- **Freier Text: der Markenberater (George).** Er streamt; die Probe ruft ihn
  nicht. Ob er noch so klingt wie gewollt, kann nur ein Mensch lesen
  (`packages/brand/scripts/verify-brand-sessions.mjs` mit
  `NUXT_AI_MODEL=anthropic/claude-haiku-5.5`).
- **Prompts in Routen:** Moderations-Hilfe, Tickets einordnen, Kategorien
  übersetzen, UGC-Übersetzen. Ihre Prompts stecken in der Route und sind nicht
  ohne Server ladbar; für UGC und Seiten gibt es eigene Skripte
  (`verify-ugc-translation.mjs`, `verify-page-languages.mjs`).
- **Review und Dokument-Check der Marke, Marktvergleich.** Laden den Server mit
  (`brandGenerators`); Marktvergleich hat `market-library-compute.mjs`.
- **Die Ton-Frage** auch bei den fünf Aufgaben: `vergleich.md` legt die
  Antworten nebeneinander, gelesen hat sie noch niemand.

## Was der Wechsel im Monat spart

Die Monatssumme beim Vermittler kennt nur Davids Konto; im Repo und in
den Protokollen ohne Schlüssel steht sie nicht. Deshalb in Anteilen:

**Ersparnis ≈ Monatssumme × Anteil Text × (1 − 1/Faktor)**

- *Anteil Text*: was nicht Bild-Erzeugen, Bild-Lesen oder Video-Lesen ist
  (die haben eigene Modelle und bleiben). Beim Vermittler je Modell ablesbar.
- *Faktor*: gemessen 6 bis 8 mit Denken aus, 2 bis 5 wie heute gerufen.

**Beispiel (erfundene Summe):** 50 $ im Monat, davon 60 % Text = 30 $.
Mit Denken aus (Faktor ≈ 6,5): 30 × (1 − 1/6,5) ≈ **25 $ im Monat
gespart**. Wie heute gerufen (Faktor ≈ 3): ≈ 20 $ — aber der
Insights-Entwurf fällt aus, also keine echte Option. Bei 10 $ im Monat
sind es rund 5 $; das trägt die Arbeit unten kaum.

**Wie oft die Aufgaben laufen** (aus dem Code; Zahlen aus Protokollen gibt
es ohne Schlüssel nicht): der Markenberater läuft je Gesprächszug und ist
vermutlich der größte Posten; UGC-Übersetzen, Moderations-Hilfe und Tickets
je Klick bzw. je Ticket; Insights je Beitrag (wenige im Monat); DNA,
Zeichen-Brief und Review einmal je Marke; der Marktvergleich alle paar
Monate für vier Einträge. Welche Aufgabe das Geld ausgibt, zeigt die
Aktivitätsliste beim Vermittler (Spalte „App"/Modell).

**Schätzung aus dem Repo (2026-11-24, ohne Abrechnung):** je Aufruf heute
0,001 bis 0,009 $ (Tabelle oben), ein Gesprächszug des Markenberaters
geschätzt 0,01 bis 0,02 $ (8.000 bis 15.000 Tokens Kontext). Ohne zahlende
Kundschaft (Geld-Kette offen) sind es geschätzt 5 bis 50 Aufrufe am Tag, also
rund **1 bis 12 $ im Monat** — der Wechsel spart davon gut 80 %. Die Obergrenze
setzt der Tages-Deckel der Marke (`aiDailyInstanceCap` 1.000 Aufrufe je
Instanz): rund 450 $ im Monat, die Ersparnis wächst mit der Nutzung. David hat
am 2026-11-24 trotzdem Ja gesagt.

## Je Aufgabe: heutiges Modell, Kandidat, Risiko, Empfehlung

| Aufgabe(n) | Heute | Kandidat | Risiko | Empfehlung |
| --- | --- | --- | --- | --- |
| UGC-, Seiten-, Kategorie-Übersetzen (7 Stellen) | Haiku 4.5 (`aiModel`) | Haiku 5.5, Denken aus | gering; JSON hielt, Übersetzung kürzer im Denken | wechseln, nach einem Lauf der zwei UGC/Seiten-Skripte |
| Moderations-Hilfe, Tickets (3) | Haiku 4.5 (`aiModel` bzw. `ticketsAiModel`) | Haiku 5.5, Denken aus | gering; nur Rat, der Mensch entscheidet | wechseln |
| Insights: Entwurf, Übersetzung, Notiz (3) | Haiku 4.5 | Haiku 5.5, Denken aus | **hoch ohne Denken-aus** (Decke reißt); danach Decke neu eichen | wechseln erst mit Transport-Änderung und neuer Eichung |
| Marke: DNA, Zeichen-Brief, Website-Urteil (3) | Haiku 4.5 | Haiku 5.5, Denken aus | gering; 5.5 lieferte sauberes JSON, 4.5 brauchte Reparatur | wechseln |
| Marke: Review (2 Stufen) | Haiku 4.5 (`reviewModel`, nur per Ausliefern) | Haiku 5.5 | mittel: `temperature` 0 fällt weg, Urteile schwanken | zuletzt, nach eigener Probe |
| Markenberater (Stream) | Haiku 4.5 | Haiku 5.5 | **Ton** — nur lesbar | erst nach Davids Lese-Probe (je fünf Antworten blind) |
| Marktvergleich (Auslesen, Bericht) | Haiku 4.5 (`market.ai.*`) | Haiku 5.5 | mittel: `temperature` 0; Bibliothek wird nur alle paar Monate gerechnet | nicht wechseln — spart fast nichts |

## Wenn David Ja sagt: die Reihenfolge

1. **Transport — gebaut 2026-11-24:** `buildAiRequestBody` schickt
   `reasoning: { effort: 'none' }` für die Modelle in
   `AI_TEXT_MODELS_REASONING_OFF` (nur gemessene; heute Haiku 5.5). Haiku 4.5
   bekommt das Feld bewusst NICHT — dort ist es ungemessen, und der Rumpf von
   heute bleibt Byte für Byte gleich. Weil es am Modell hängt, kommt das Feld
   beim Umstellen auf der Config-Seite ohne Ausliefern mit. `temperature`
   bleibt im Rumpf (der Vermittler lässt sie still fallen).
2. **Probe erweitern:** dieselbe Probe mit `--runs 10`, dazu die zwei
   UGC/Seiten-Skripte und der Markenberater mit dem neuen Modell (zusammen
   unter 2 $). Decke der Insights-Entwürfe und Kosten-Gewichte der Review
   neu eichen. Startet David selbst (Entwicklungs-Schlüssel), aus dem
   Haupt-Checkout:

   ```bash
   node scripts/ki-modell-probe.mjs --live --runs 10 --models anthropic/claude-haiku-5.5 --max-usd 1 --env-file apps/comments/.env
   ```

   Das Skript zeigt vorher die geschätzten Höchstkosten und bricht über
   `--max-usd` ab. Seit Schritt 1 geht „Denken aus" ohne `--reasoning` mit.
3. **Davids Lese-Probe:** `vergleich.md` und fünf Antworten des
   Markenberaters, ohne zu wissen, welches Modell welche schrieb.
4. **Erst ein Deployment:** `aiModel` auf der Config-Seite umstellen (ein
   Klick zurück, kein Ausliefern) — das ist die echte Datenbank und Davids
   Klick. Danach die übrigen; `reviewModel` und die Ticket-Auswahl wechseln
   per Ausliefern.

Daneben anzufassen: die Auswahl-Liste und der Hinweistext in den
Ticket-Einstellungen (de + en), `verify-brand-context.mjs`,
`market-library-compute.mjs` (Preise), `pnpm ops:ai-models` läuft danach.

## Was David entscheidet

- **Monatssumme ansehen** (Konto beim Vermittler, Anteil Text). Unter 20 $:
  alles bleibt, wie es ist — Schritt 1 bis 3 kosten mehr Arbeit, als der
  Wechsel spart.
- **Darüber: Ja oder Nein zu Schritt 1 und 2** (eine Session, Proben unter
  2 $). Der eigentliche Wechsel auf Production (Schritt 4) ist danach ein
  eigenes Ja.
