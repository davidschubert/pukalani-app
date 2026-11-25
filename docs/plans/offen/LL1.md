# LL1 — Einzelheiten

> Einzelheiten zum offenen Punkt **LL1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**LL1 — Lange Läufe: ein echter Lauf über 60 Sekunden auf Production.**
Alles andere aus LL1 ist erledigt oder als bekannte Grenze beschrieben
([LANGE-LAEUFE-GRENZEN.md](../../referenz/LANGE-LAEUFE-GRENZEN.md), COMPLETE
„LL1 (c)", 2026-11-25).

- **Was fehlt:** einmal auf Production sehen, dass ein Hintergrund-Lauf, der
  länger als 60 Sekunden rechnet, sauber zu Ende kommt und die Seite das
  Ergebnis zeigt. Lokal ist das für alle Wege gezeigt (65 bis 87 s, je zwei
  Reiter).
- **Warum es auf David wartet:** jeder solche Lauf ist ein bezahlter KI-Lauf
  auf Production (Geld und Production-Daten). Am günstigsten ist der
  öffentliche Brand-Check auf branding.supply oder eine Seiten-Übersetzung
  einer langen Seite.
- **Billiger Weg ohne neuen Lauf:** mit Davids Ja in `brand_runs`,
  `market_runs` oder `pages_runs` auf Production nach einem fertigen Lauf
  suchen, dessen Dauer über 60 Sekunden lag. Gibt es einen, ist der Punkt
  ohne neuen Lauf erledigt.
