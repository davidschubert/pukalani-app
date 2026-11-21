# MG1 — Einzelheiten

> Einzelheiten zum offenen Punkt **MG1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**MG1 — Tests von Shell-Skripten, die auf `main` ohne erkennbaren Grund rot waren.**
Gebaut am 2026-11-18 (COMPLETE „N12"): der tägliche Datenbank-Blick prüft
jetzt spaltengenau, je App nur die Layer, die sie nutzt.

- **(b) Zwei Tests, keine Ursache.** (1) Nach dem ersten Merge von P21
  scheiterte auf `main` `packages/core/tests/rollbackScript.test.ts` („legt den
  Verweis um …") mit leerer Ausgabe; im Pull Request und im zweiten Versuch
  war er grün. (2) Am 2026-11-18 scheiterte
  `packages/core/tests/appReleaseScript.test.ts` FÜNFMAL zwischen 08:20 und
  08:52 UTC (einmal in einem Pull Request, viermal auf `main`: `f9e43b81`,
  `0bf4d038` zweimal, `3b865d72`) — immer mit der Meldung „Archiv nicht
  lesbar", und nur in den zwei Worten, die ein UNGEPACKTES tar über
  `head | tar` lesen (`ops-put`, `fonts-put`), nie in `release-put`
  (`head | zstd | tar`). Solange hielt er das Ausliefern aller Gruppen auf.
  Seit der Härtung (PR 339, 09:36 UTC: beurteilt werden die Entpacker
  einzeln, ein `head`, das mit 141 endet, ist kein Fehler mehr) ist er in
  rund 25 Läufen nicht wieder aufgetreten. BEWIESEN ist die Ursache damit
  nicht: nachstellen ließ sich der Fehlschlag weder in 2.500 Wiederholungen
  im Linux-Container (mit und ohne Node als Aufrufer, mit Last) noch mit
  einer Eingabe, die in zwei Teilen mit Pause ankommt (geteilt vor und hinter
  der Ende-Marke des Archivs — das alte Skript bestand beides). Die Häufung
  in einer halben Stunde spricht auch für die CI-Rechner dieses Zeitraums.
  Beide Tests schreiben bei einem Fehlschlag jetzt Exit-Code und Ausgabe ins
  Protokoll, das Ausliefer-Skript nennt die Teil-Ergebnisse seiner
  Entpack-Pipe als Zahlen, und im Test ist die Fehlerausgabe von tar
  sichtbar. Kommt es wieder: dort lesen (welcher Teil der Pipe, welche
  Meldung), dann die Ursache suchen.
  Der rote Lauf vom 2026-11-20 war keiner von beiden: dort wackelte ein
  Test mit Zufallswerten, Ursache gefunden und behoben (COMPLETE „N20").
