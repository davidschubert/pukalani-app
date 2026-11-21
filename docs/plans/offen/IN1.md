# IN1 — Einzelheiten

> Einzelheiten zum offenen Punkt **IN1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**IN1 — Insights-Redaktion: Nacharbeiten (aus dem Gesamtaudit, Paket P19).**
Gebaut am 2026-11-17 (COMPLETE „N05"): Marken-Seiten laufen durch dieselbe
Prüfung wie Artikel, die KI-Wege der Redaktion stehen in der Bremsen-Liste,
der Kasten der Prüfregeln sagt an einem öffentlichen Artikel das Richtige.

- **(a) KI-Prüfung als eigener Knopf.** Davids Wunsch vom 2026-11-12, am
  2026-11-16 bewusst auf später gelegt. Der Knopf liest die aktuelle Fassung
  und meldet, was unstimmig wirkt, was inhaltlich fehlt und wie der Artikel
  für Leser und Suche besser wird. Er sperrt nichts und darf falsch warnen;
  die festen Regeln bleiben die Sperre. Kosten je Klick etwa 1 bis 5 Cent.
  Vorschlag für den Zuschnitt: eigene Route wie der Vorschlag für den
  Änderungshinweis (eigenes Kontingent, schreibt nichts, Ergebnis nur
  angezeigt), langer Lauf ⇒ die Frist am Proxy mitdenken.
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
