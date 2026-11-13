# Changelog-Workflow

Zwei getrennte Spuren, nicht pro Push (jeder Push wäre WIP-Rauschen für
Endnutzer). Track 1 ist seit 2026-11-13 abgeschaltet; es gibt keine neuen
Releases mehr.

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

### 2A — Lokaler Draft-Generator (DER Weg)

[`packages/admin/scripts/changelog-draft.mjs`](../../packages/admin/scripts/changelog-draft.mjs)
liest die Commits seit dem letzten Tag, mappt Typen auf Kategorien
(`feat`→Feature, `fix`→Fix, `perf`/`refactor`→Verbesserung) und legt **einen
Entwurf** (`published:false`) mit gruppierter Stichpunktliste an. Den arbeitest
du im Dashboard zur fertigen Release-Note aus und veröffentlichst ihn.

```bash
pnpm changelog:draft                   # seit letztem Tag → Entwurf
pnpm changelog:draft -- --dry          # nur Vorschau
pnpm changelog:draft -- --since=v1.4.0 # ab bestimmtem Tag/SHA
pnpm changelog:draft -- --version=v1.5 # Version ins Entwurfs-Feld
```

Läuft **lokal**. `pnpm changelog:draft` liest seine vier Variablen
(`NUXT_PUBLIC_APPWRITE_ENDPOINT`, `…_PROJECT_ID`, `…_DATABASE_ID`,
`NUXT_APPWRITE_KEY`) aus `apps/comments/.env` — das ist die DEV-Instanz. Für
Prod denselben Aufruf mit `node --env-file=<prod-env des Projekts admin>
packages/admin/scripts/changelog-draft.mjs …` fahren; der Schlüssel braucht
`rows.write` auf der Tabelle `changelog`.

**Seit Track 1 abgeschaltet ist (2026-11-13):** es entstehen keine neuen
Releases und keine neuen Tags mehr. Ohne `--since` liest das Skript die
Commits seit dem letzten Tag (`git describe --tags`) — das bleibt `v4.0.0`,
der Bereich wächst also mit jedem Commit. Für einen sinnvollen Entwurf
`--since=<SHA oder Datum des letzten veröffentlichten Eintrags>` angeben.

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

Die kundenfertigen Texte stammen aus den Hilfe-Seiten (`apps/help/content`),
nicht aus Commit-Betreffs — die Hilfe ist der geprüfte Kundenstand.
Ausgeführtes Beispiel: [CHANGELOG-CL1-FREIGABE.md](../archiv/CHANGELOG-CL1-FREIGABE.md).

### 2B — Appwrite Function (STILLGELEGT, Stand 2026-11-06)

Gedacht war es voll hands-off: GitHub-Release-Webhook → Function
`changelog-draft` unter `https://changelog.pukalani.app/` → Entwurf direkt in
der DB. Aktiv war das vom 2026-07-19 an im damaligen Prod-Projekt `comments`.
Mit dem Umbau der Projekte (Control-Cutover, `comments` als Pool-Community)
verschwand das Projekt `comments` von Prod — und mit ihm die Function —, ohne
dass es jemand bemerkte: das letzte Release (v3.0.0, 2026-07-28) lag davor, der Webhook feuerte
seitdem nie. Gemessen am 2026-11-06: auf Prod 0 Functions und 0 Sites in allen
vier Projekten, `changelog.pukalani.app` liefert nur noch Traefiks
Ersatz-Zertifikat. Der GitHub-Webhook (Releases → `changelog.pukalani.app`) ist
seit demselben Tag **deaktiviert** (nicht gelöscht).

Der Code bleibt in [`functions/changelog-draft`](../../functions/changelog-draft)
— `src/parse.js` ist die geteilte Parser-Quelle von 2A und unit-getestet.
Wiederbeleben hieße: Function im Projekt `admin` deployen (Runtime `node-22`),
Custom Domain + Zertifikat, Variablen setzen, Webhook wieder einschalten —
Rezept im Archiv: [CHANGELOG-2B-AKTIVIERUNG.md](../archiv/CHANGELOG-2B-AKTIVIERUNG.md)
§§ 5–6. Solange es keine Functions auf Prod gibt, hat der Executor auch keine
Runtime-Images zu pflegen (Appwrite-Sicherheitshinweise zu Node/Bun-Runtimes
betreffen uns dann nicht).

## Warum getrennt?

- **Granularität:** Dev-Changelog = jeder Commit; Produkt-Changelog = pro
  Release, kuratiert.
- **Erreichbarkeit:** GitHub CI kann das self-hosted Appwrite (`localhost`)
  nicht beschreiben → DB-Writes laufen lokal (2A), nie in der CI (2B, die
  serverseitige Variante, ist stillgelegt).
