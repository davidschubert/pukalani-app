# RU1 — Einzelheiten

> Einzelheiten zum offenen Punkt **RU1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**RU1 — Runner: Reste nach der Klick-Probe vom 2026-11-21.**

- **(b) Das Budget-Feld lehnt jede Zahl ab.** Im Formular „Lauf starten" zeigt
  das Feld „Budget (USD)" bei jeder Eingabe „Invalid input: expected string,
  received number" und sperrt den Knopf. Ursache: `RunnerRunForm.vue` bindet
  ein Zahlenfeld an `maxBudgetText`, das Schema
  (`packages/runner/schemas/runStart.ts`) erwartet dort Text. Heute startet
  ein Lauf deshalb nur mit leerem Feld und bekommt den Deckel des Rechners.
  Dazu: der Satz ist die rohe englische Meldung, kein Text aus den
  Sprachdateien.
- **(c) Dateiname wird zum Link.** Der Editor der Ticket-Beschreibung macht
  aus `README.md` den Link `[README.md](http://README.md)`; so steht es dann
  auch im Auftrag an den Agenten. Der Lauf kam damit zurecht.
