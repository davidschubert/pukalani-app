# apps/control — Betreiber-Konsole (admin.pukalani.app)

Die App, in der der Betreiber arbeitet: Control Plane der Plattform
(Communities, Pläne, Einladungs-Codes, eigene Domains), Feedback-Bereich,
Ticket-Board, AI-Runner und die interne Projekt-Doku. Im Code, im Deployment
und in pm2 heißt sie `control`; die Adresse ist seit 2026-08-11
**admin.pukalani.app**, das Appwrite-Projekt seit 2026-08-18 **`admin`**
(Protokolle der Umzüge: `docs/archiv/ADMIN-CUTOVER.md`,
`docs/archiv/ADMIN-PROJEKT-CUTOVER.md`).

Kein Mandant, kein Kunden-Host: hier liegen `communities` und
`community_members`, alle Sites lesen sie über die Service-Naht bzw. mit einem
nur lesenden Schlüssel.

## Layer

Steht in `site.manifest.ts` (die eine Quelle; `pnpm check:manifests` hält
`extends` und `package.json` dazu konsistent): `themes`, `admin`, `control`,
`feedback`, `billing`, `tickets`, `runner`, `pages` — dazu immer `core` und
`system`.

## Lokal starten

```bash
pnpm --filter control dev   # Port 3004
```

`.env` aus `.env.example` anlegen. Migrationen laufen nur über den zentralen
Runner und nur gegen das Projekt aus `appwriteProjects`:

```bash
pnpm migrate --app control
```

Production: `.claude/rules/appwrite-migrationen.md` („ZIEL-PRÜFUNG VOR DEM SCHREIBEN") —
immer mit `--only`, erst `--dry-run`, und nur mit Freigabe.

## Interne Projekt-Doku unter `/docs`

`admin.pukalani.app/docs` rendert **dieselben Markdown-Quellen** wie die
eigenständige Docs-App (`pnpm dev:docs`, Port 4000): `docs/content/**`. Es wird
nichts kopiert und nichts synchronisiert — `content.config.ts` zeigt per `cwd`
direkt dorthin (Collection `internalDocs`, `prefix: '/docs'`).

- **Auth:** der ganze Bereich hängt an der Betreiber-Session. Seiten UND die
  Content-API (`/__nuxt_content/**` — `sql_dump.txt` ist die komplette Doku!)
  laufen fail-closed durch `server/middleware/docs-guard.ts`. Gast → Login
  bzw. 401, niemals Inhalt.
- **Prerender ist bewusst AUS** (`nuxt.config.ts`): sonst läge der SQL-Dump als
  statische Datei in `.output/public/` und würde am Guard vorbei ausgeliefert.
- **Build:** die Inhalte werden beim Build eingebettet (`.output/server/chunks/
  build/database.compressed.mjs`) — der Deploy braucht `docs/content` zur
  Laufzeit NICHT, wohl aber beim Bauen.
- **Beweis:**
  ```bash
  node --env-file=apps/control/.env apps/control/scripts/verify-docs-access.mjs
  ```
  (Dev-Server muss laufen; `PROBE_BASE=…` für einen anderen Port.)

## Weiterlesen

- Hosts, Altnamen und Pflicht-Einstellungen: `.claude/rules/hosts-ops.md`, `.claude/rules/ops-server.md`
- Anlegen, Mitglieder, Stilllegen: `.claude/rules/onboarding.md`
- Pläne und Produkte: `.claude/rules/plans-products.md`
- Betrieb und Ausliefern: `docs/runbooks/DEPLOYMENT.md`
