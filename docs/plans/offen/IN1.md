# IN1 — Einzelheiten

> Einzelheiten zum offenen Punkt **IN1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**IN1 — Insights-Redaktion: Nacharbeiten (aus dem Gesamtaudit, Paket P19).**
Gebaut am 2026-11-17 (COMPLETE „N05"): Marken-Seiten laufen durch dieselbe
Prüfung wie Artikel, die KI-Wege der Redaktion stehen in der Bremsen-Liste,
der Kasten der Prüfregeln sagt an einem öffentlichen Artikel das Richtige.

- **(a) KI-Prüfung als eigener Knopf — GEBAUT (2026-11-22), Klick offen.**
  Knopf „KI-Prüfung starten" im Editor; `POST`/`GET
  /api/insights/posts/:id/review`: Lauf-Sperre in `insights_runs` (Art
  `review`), eigenes Kontingent, `202` und Abfrage, Ergebnis nur angezeigt.
  Das Ergebnis liegt im Speicher des Prozesses (keine neue Spalte, keine
  Migration); nach einem Neustart sagt die Seite „Ergebnis nicht mehr da".
  Begründung im Kopf von `packages/insights/server/utils/insightsAiReviewRun.ts`.
  Lokal geklickt mit gestellter KI (COMPLETE „IN1 (a)"). OFFEN: ein Lauf mit
  echtem Modell (Prompt und Kosten je Klick unbelegt) — auf Live, wenn David
  ihn auslöst.
- **(b) Klick-Probe auf Live.** Auf Production ist noch kein Artikel
  veröffentlicht (BI5). Danach einmal: einen veröffentlichten Artikel
  regelwidrig ändern (erwartet: „nicht gespeichert", die Seite bleibt), einen
  Hinweis von Hand anlegen, einmal „Vorschlag holen (KI)" klicken. Der Klick
  auf den Vorschlags-Knopf ist auch lokal nicht geklickt, nur die Route
  dahinter gefahren. Dazu seit N05: eine Marke mit einem unbelegten Zitat auf
  „Veröffentlicht" stellen (erwartet: „Nicht gespeichert", der Punkt steht in
  der Liste) — lokal geklickt, auf Live nicht.
- **(c) Vorhandene Marken-Seiten.** Marken, die schon vor der neuen Prüfung
  auf „veröffentlicht" standen, sind nicht nachgeprüft. Eine davon lässt sich
  erst wieder als „veröffentlicht" speichern, wenn sie die Regeln erfüllt (als
  Entwurf und „entfernt" geht immer). Vor dem Freischalten von Profil, Duell
  und Ranking deshalb jede veröffentlichte Marke einmal öffnen und speichern.
  Das Skript `seed-launch.mjs` schreibt Marken als Entwurf und prüft sie
  seit dem 2026-11-17 vorher mit denselben Regeln (COMPLETE „N08").
- **(d) Kleinigkeiten.** Das Datum eines Hinweises ist der Kalendertag in
  UTC. Ein Artikel, der eine heute geltende Regel verletzt (etwa vor Regel 7
  veröffentlicht), lässt sich erst wieder speichern, wenn er sie erfüllt oder
  zurückgezogen ist — vor dem ersten Veröffentlichen auf Production also
  einmal alle Entwürfe durch „In die Redaktion geben" schicken. Die zwei
  lesenden Marken-Routen haben noch keinen Rollen-Test (stehen im Bestand).
