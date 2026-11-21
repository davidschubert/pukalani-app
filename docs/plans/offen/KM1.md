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

- **(c) Günstigeres Textmodell.** `anthropic/claude-haiku-5.5` hat dieselben
  zwei Europa-Endpunkte und kostet dort ein Zehntel (0,11 / 0,55 $ je
  Million Tokens statt 1,10 / 5,50 $). Kein Handlungsbedarf. Davids Klick
  vom 2026-11-19: die Proben vorbereiten. Die Aufstellung steht in
  [plans/KI-TEXTMODELL-WECHSEL.md](../../plans/KI-TEXTMODELL-WECHSEL.md): 21
  Stellen rufen das Textmodell, 8 davon haben schon eine echte Probe, für
  12 bräuchte es ein neues Probe-Skript (ein Arbeitstag). Alle Proben
  zusammen kosten höchstens rund 6 $. Das neue Modell führt die
  Einstellung `temperature` nicht mehr, die der Code bei jedem Aufruf
  mitschickt — das klärt die erste Probe (ein Aufruf, unter 1 Cent).
  Was der Wechsel spart, hängt an der Monatssumme beim Anbieter; die
  kennt nur Davids Konto dort. Gewechselt wird erst nach einem weiteren Ja.
- **(d) Zur Kenntnis.** Der Anbieter bietet „nur Europa" inzwischen auch als
  eigene Adresse an (in einem teureren Tarif). Nötig ist das nicht, solange
  die Bindung je Aufruf greift — und das ist am 2026-11-18 gemessen. Ob auf
  Production in der Datenbank eines Deployments ein anderes Modell steht,
  hat niemand nachgesehen; dafür bräuchte es Davids Ja.
