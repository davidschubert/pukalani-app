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

- **(c) Günstigeres Textmodell — Schritt 1 bis 3 erledigt, branding.supply
  umgestellt (2026-11-25, COMPLETE „KM1 c2").** `app_config.aiModel` steht
  dort auf `anthropic/claude-haiku-5.5` — Rückweg: Feld leeren (oder
  `PATCH /api/admin/config` mit `aiModel: ""`), dann gilt wieder Haiku 4.5.
  Offen ([Plan](../../plans/KI-TEXTMODELL-WECHSEL.md), „Wenn David Ja sagt"):
  die übrigen Deployments mit Text-KI (admin.pukalani.app: Ticket-Triage,
  Community-Hosts: UGC- und Seiten-Übersetzen — vorher einen Lauf der zwei
  UGC/Seiten-Skripte), `reviewModel` der Marke (nur per Ausliefern, eigene
  Probe) und die Ticket-Auswahl-Liste. Erst nach ein paar Tagen ohne
  KI-Ausfälle auf branding.supply.
- **(d) Zur Kenntnis.** Der Anbieter bietet „nur Europa" inzwischen auch als
  eigene Adresse an (in einem teureren Tarif). Nötig ist das nicht, solange
  die Bindung je Aufruf greift — und das ist am 2026-11-18 gemessen. Ob auf
  Production in der Datenbank eines Deployments ein anderes Modell steht,
  hat niemand nachgesehen; dafür bräuchte es Davids Ja.
