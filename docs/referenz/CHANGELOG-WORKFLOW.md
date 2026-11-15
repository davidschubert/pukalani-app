# Changelog-Workflow

Zwei getrennte Spuren, nicht pro Push (jeder Push wäre WIP-Rauschen für
Endnutzer). Track 1 ist seit 2026-11-13 abgeschaltet; es gibt keine neuen
Releases mehr. Track 2 wird seit 2026-11-15 nur noch von Hand im Dashboard
gepflegt — die Function und das Entwurfs-Werkzeug sind entfernt.

## Track 1 — Entwickler-`CHANGELOG.md` (ABGESCHALTET seit 2026-11-13)

Von 2026-07-08 bis 2026-11-13 schrieb **release-please** aus den Conventional
Commits einen Release-PR mit Versionsnummer und Änderungsliste; sein Merge
erzeugte Git-Tag + GitHub-Release. Davids Entscheidung vom 2026-11-12: das
wird nicht gebraucht, der Automat ist abgeschaltet (Workflow, Konfiguration und
Versions-Manifest gelöscht).

- **Warum:** Releases steuern hier nichts — ausgeliefert wird je Push auf
  `main`. Der Release-PR lag monatelang offen, und seine Prüfläufe warteten
  30 Tage auf eine Freigabe und verfielen dann als rote Läufe, die nichts
  bedeuteten.
- **Was bleibt:** [`CHANGELOG.md`](../../CHANGELOG.md) als Historie bis
  Version **4.0.0** (letztes Release, veröffentlicht 2026-11-07), nicht mehr fortgeschrieben.
  **Conventional Commits bleiben Pflicht** — die Git-Historie ist jetzt das
  Entwickler-Änderungsprotokoll, Erledigtes steht zusätzlich in
  `docs/OPEN-ITEMS-COMPLETE.md`.

## Track 2 — Produkt-„Was ist neu" (kuratiert, assistiert)

Die nutzerseitigen Release-Notes leben in der Appwrite-Tabelle `changelog`
im Prod-Projekt **`admin`** (Dashboard → Changelog; öffentlich lesbar unter
**https://admin.pukalani.app/changelog** und im „Was ist neu"-Popover). Sie sind
**kuratiert** — gruppierte, verständliche Notes, kein Commit-Log. Die
Marketing-Seite verlinkt genau diese Seite (`marketing.changelogUrl` in
`packages/marketing/app/app.config.ts`).

### So entsteht ein Eintrag (seit 2026-11-15: nur noch von Hand)

Einträge werden im Dashboard geschrieben (Dashboard → Changelog → Neuer
Eintrag), als Entwurf gespeichert und dann veröffentlicht. Die Texte kommen
aus den Hilfe-Seiten (`apps/help/content`) — die Hilfe ist der geprüfte
Kundenstand —, nicht aus Commit-Betreffs. Ausgeführtes Beispiel:
[CHANGELOG-CL1-FREIGABE.md](../archiv/CHANGELOG-CL1-FREIGABE.md).

Wer wissen will, was sich seit dem letzten Eintrag geändert hat, liest die
Git-Historie: `git log --oneline <Commit des letzten Eintrags>..HEAD`
(Conventional Commits: `feat` = Neues, `fix` = Korrektur).

### Zwei Fallen beim Veröffentlichen (CL1, 2026-11-06)

- **Version sortiert vor Datum.** `compareChangelogByVersion` stellt Einträge
  MIT `version` immer vor alle ohne — ein „v3.0.0" vom Juli stünde über jedem
  späteren Eintrag ohne Version. Seit CL1 tragen die öffentlichen Einträge
  KEINE Version und ordnen sich nach `date` (= Tag des Feature-Commits). Wer
  wieder Versionen will, setzt sie an ALLEN Einträgen.
- **Hilfe-Links je Sprache.** help.pukalani.app hat Englisch ohne Präfix:
  im `body` (de) `https://help.pukalani.app/de/anleitung/…`, im `bodyEn`
  `https://help.pukalani.app/anleitung/…` — `/en/…` ist nur eine Weiterleitung.
- Direkte DB-Schreibvorgänge (Skript statt Dashboard) leeren den Microcache
  der öffentlichen Liste NICHT — bis zu 5 Minuten Verzug; `?limit=50` ist ein
  anderer Cache-Schlüssel und zeigt den Stand sofort.

### Was es nicht mehr gibt (entfernt 2026-11-15, Gesamtaudit BE-027)

Davids Entscheidung vom 2026-11-12 („automatischen Changelog-Entwurf
entfernen") und vom 2026-11-15 (das Hand-Werkzeug mit).

- **Die Appwrite Function `changelog-draft`** (früher „Track 2B"): GitHub-
  Release-Webhook → Function unter `changelog.pukalani.app` → Entwurf in der
  Datenbank. Aktiv vom 2026-07-19 an im damaligen Prod-Projekt `comments`; mit
  dem Umbau der Projekte verschwand das Projekt und mit ihm die Function, ohne
  dass es jemand bemerkte. Seit release-please abgeschaltet ist, gibt es auch
  kein Release mehr, das sie auslösen könnte. Entfernt: der Ordner
  `functions/`, `appwrite.config.json`, der (abgeschaltete) Webhook bei
  GitHub. Auf Production gab es am 2026-11-15 in keinem der vier Projekte eine
  Function (gezählt in der Datenbank).
- **Das Hand-Werkzeug `pnpm changelog:draft`** (früher „Track 2A",
  das Skript changelog-draft.mjs im admin-Layer): legte aus den Commits seit
  dem letzten Tag einen Entwurf an. Zuletzt im Juli benutzt (Entwurf 3.0.0, nie
  veröffentlicht); ohne neue Tags las es einen immer größeren Bereich.
- Letzter Commit mit beidem: `9788e7ab`. Das Rezept der Function steht im
  Archiv: [CHANGELOG-2B-AKTIVIERUNG.md](../archiv/CHANGELOG-2B-AKTIVIERUNG.md).

## Warum getrennt?

- **Granularität:** Dev-Changelog = jeder Commit; Produkt-Changelog = pro
  Release, kuratiert.
- **Erreichbarkeit:** GitHub CI schreibt nie in die Appwrite-Datenbank —
  Einträge entstehen im Dashboard.
