# Changelog-Workflow

Zwei getrennte Spuren — bewusst **release-basiert**, nicht pro Push (jeder Push
wäre WIP-Rauschen für Endnutzer).

## Track 1 — Entwickler-`CHANGELOG.md` (voll automatisch)

Aus den Conventional Commits via **release-please**
([`.github/workflows/release-please.yml`](../../.github/workflows/release-please.yml)).

- Bei Push auf `main` pflegt release-please einen **Release-PR**: sammelt
  `feat`/`fix`/`perf`/`refactor`, schreibt `CHANGELOG.md` fort, schlägt die
  nächste SemVer-Version vor.
- **Merge des PRs** erzeugt Git-Tag + GitHub-Release.
- Kein DB-Zugriff, keine Secrets — nutzt den eingebauten `GITHUB_TOKEN`.
- Konfiguration: [`release-please-config.json`](../../release-please-config.json),
  Stand der Versionen: [`.release-please-manifest.json`](../../.release-please-manifest.json)
  (gestartet bei `1.4.0`, passend zum bisherigen Produkt-Changelog → nächstes
  `feat` ⇒ `1.5.0`).
- `bootstrap-sha` begrenzt den ersten Lauf auf Commits **nach** dem
  Backfill-Commit (`466be65e…`, volle SHA nötig — als Kurz-SHA wirkungslos),
  damit die History nicht doppelt in `CHANGELOG.md` landet.
- Voraussetzung (Repo-Setting, 2026-07-08 aktiviert): *Settings → Actions →
  General → „Allow GitHub Actions to create and approve pull requests"* —
  ohne das schlägt jeder Lauf mit „GitHub Actions is not permitted to create
  or approve pull requests" fehl und es entsteht nie ein Release-PR.

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
