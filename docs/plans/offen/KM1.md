# KM1 — Einzelheiten

> Einzelheiten zum offenen Punkt **KM1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**KM1 — Günstigeres Textmodell ansehen (Rest der Vorschläge nach dem KI-Alarm vom 2026-11-18).**
Der Alarm (Issue 401) war ein falscher: der Anbieter führt die
Europa-Endpunkte jetzt in einer zweiten Liste, die Aufrufe liefen die ganze
Zeit (COMPLETE „KA1"). Von den Vorschlägen danach ist (a) gebaut, (b)
abgelehnt und (e) gebaut (COMPLETE „KM1 a" und „KM1 e"). Offen:

- **(c) Günstigeres Textmodell — Probe gefahren, wartet auf Davids
  Entscheidung.** `anthropic/claude-haiku-5.5` kostet in Europa ein Zehntel.
  Die Probe (`scripts/ki-modell-probe.mjs`, lokal am 2026-11-22, rund
  0,09 $) zeigt: wie die App heute ruft, „denkt" das Modell von selbst, das
  frisst beim Insights-Entwurf die Decke (0 von 3) und lässt nur das Zwei- bis
  Siebenfache an Ersparnis. Mit abgeschaltetem Denken bestehen alle fünf
  Aufgaben bei einem Sechstel bis Achtel der Kosten — dafür braucht der
  Transport erst ein Feld mehr. `temperature` fällt beim neuen Modell still
  weg. Ergebnis, Rechnung und Reihenfolge:
  [plans/KI-TEXTMODELL-WECHSEL.md](../../plans/KI-TEXTMODELL-WECHSEL.md).
  Gewechselt wird erst nach Davids Ja.
- **(d) Zur Kenntnis.** Der Anbieter bietet „nur Europa" inzwischen auch als
  eigene Adresse an (in einem teureren Tarif). Nötig ist das nicht, solange
  die Bindung je Aufruf greift — und das ist am 2026-11-18 gemessen. Ob auf
  Production in der Datenbank eines Deployments ein anderes Modell steht,
  hat niemand nachgesehen; dafür bräuchte es Davids Ja.
