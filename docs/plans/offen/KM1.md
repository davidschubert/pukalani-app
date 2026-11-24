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

- **(c) Günstigeres Textmodell — Davids Ja am 2026-11-24, Schritt 1
  gebaut.** Der Core-Rumpf (`buildAiRequestBody`) schickt für die Modelle in
  `AI_TEXT_MODELS_REASONING_OFF` (heute nur `anthropic/claude-haiku-5.5`)
  `reasoning: { effort: 'none' }` mit; für Haiku 4.5 bleibt der Rumpf, wie er
  war (COMPLETE „KM1 c1"). Offen, in dieser Reihenfolge
  ([Plan](../../plans/KI-TEXTMODELL-WECHSEL.md), „Wenn David Ja sagt"):
  (2) größere Probe lokal, zusammen unter 2 $, mit dem Entwicklungs-Schlüssel —
  David startet sie, die Befehle stehen im Plan; (3) Davids Lese-Probe
  (`vergleich.md`, fünf Antworten des Markenberaters blind); (4) `aiModel` auf
  der Config-Seite eines Deployments umstellen (ein Klick zurück, kein
  Ausliefern), danach die übrigen.
- **(d) Zur Kenntnis.** Der Anbieter bietet „nur Europa" inzwischen auch als
  eigene Adresse an (in einem teureren Tarif). Nötig ist das nicht, solange
  die Bindung je Aufruf greift — und das ist am 2026-11-18 gemessen. Ob auf
  Production in der Datenbank eines Deployments ein anderes Modell steht,
  hat niemand nachgesehen; dafür bräuchte es Davids Ja.
