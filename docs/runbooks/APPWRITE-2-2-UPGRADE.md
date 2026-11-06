# Runbook: Appwrite 2.0.0 → 2.2.0 (self-hosted, MariaDB)

Gilt für beide Instanzen: **dev** (`~/Developer/orbstack/appwrite-maria/`,
OrbStack) und **prod** (`ploi@188.245.61.155:~/appwrite/`, `api.pukalani.app`).
Dev ist am 2026-09-14 nach genau diesem Ablauf gelaufen; alles unten ist dort
gemessen, nicht vermutet. Davids Entscheidung (2026-09-14): **direkt auf 2.2.0**
statt in zwei Sprüngen über 2.1.0 — ein Fenster, und 2.2 bringt genau den
MariaDB-Healthcheck-Fix, an dem Upgrades scheitern konnten. Reihenfolge: dev +
CI + Doku zuerst, prod erst nach Davids Freigabe.

Der Vorgänger — **die drei Fallen des Upgrade-Werkzeugs, der Backup-Befehl und
der Rückweg — steht unverändert in
[APPWRITE-2-0-UPGRADE.md](APPWRITE-2-0-UPGRADE.md)** und gilt weiter. Dieses
Runbook nennt nur, was in diesem Sprung ANDERS ist.

## Was 2.1 + 2.2 mitbringen (für uns relevant)

- **EIN Worker-Container statt vierzehn.** 2.2 lässt alle Warteschlangen in
  `appwrite-worker` laufen (`entrypoint: worker`); `appwrite-worker-mails`,
  `-databases`, `-deletes`, `-builds`, … gibt es nicht mehr, ebenso wenig die
  Einzel-Scheduler (nur noch `appwrite-task-scheduler`, `-maintenance`,
  `-interval`). Trifft uns an DREI Stellen: SMTP-Patch-Mount (Override),
  CI-Dienstliste (e2e.yml) und jede Anleitung, die einen Worker beim Namen nennt.
- **Eine Organisation je self-hosted Instanz** (2.1, „Self-hosted instances
  enforce the single-organization limit per instance"). Eine ZWEITE Organisation
  anzulegen antwortet **403** — siehe „Live erwischt" unten.
- **`appwrite-autogravity` ist eine harte Abhängigkeit** des `appwrite`-Dienstes
  (`depends_on`), auch wenn `_APP_AUTOGRAVITY_HOST` leer ist und damit
  `gravity=auto` aus bleibt. Der Dienst startet also überall mit, auch in CI.
- **Executions leben nur noch in ClickHouse** (2.2). ClickHouse fahren wir seit
  2.0, der Wegfall von `_APP_EXECUTIONS_DUAL_WRITE` kostet uns nichts; wir führen
  keine Appwrite-Functions.
  ACHTUNG (Vorfall 2026-09-28, OPEN-ITEMS-COMPLETE): die Stock-Compose mountet
  für `clickhouse` keine Logger-Config, das Image loggt auf Trace und füllte
  prod in 20 Tagen mit 31 GB `system.*`-Tabellen (Redis MISCONF). Die Override
  auf prod mountet seither `patches/clickhouse-logging.xml` nach
  `/etc/clickhouse-server/config.d/logging.xml` — beim Upgrade prüfen, dass der
  Dienst weiterhin `clickhouse` heißt und der Mount nach `up -d` sitzt.
- **Entfallene .env-Schlüssel**, die das Werkzeug selbst herausnimmt:
  `_APP_EXECUTIONS_DUAL_WRITE`, `_APP_LOGGING_PROVIDER`,
  `_APP_MAINTENANCE_RETENTION_USAGE_HOURLY` (dazu `_APP_CONNECTIONS_DB_LOGS`,
  bei uns nie gesetzt). NEU: `_APP_AUTOGRAVITY_HOST` (leer lassen) und
  `_APP_COMPUTE_BUILD_SIZE_LIMIT` (löst `_APP_FUNCTIONS_BUILD_SIZE_LIMIT` ab).
  Fehlerberichte sind seit 2.1 **Sentry-only**: LogOwl/Raygun/AppSignal werden
  beim Start abgelehnt. Bei uns steht ohnehin nichts drin.
- **Console 1.1.96-self-hosted** (ohne Cloud-CDN), Traefik-Basisflags unverändert
  zu 2.0 — die XFF-Override kann eins zu eins bleiben (geprüft: dieselben acht
  Flags).
- **`keepAlive: true` steht weiterhin** in `registers.php`, jetzt Zeile **340**
  (Datei in 2.2 neu geschnitten, 363 statt ~500 Zeilen). Der SMTP-Patch bleibt
  also Pflicht — Patchdatei aus dem 2.2.0-Image neu ziehen.
- **SDKs bleiben:** `node-appwrite` 29.0.0 und `appwrite` 27.0.0 sind die
  aktuellsten; für 2.1/2.2 gibt es keine neuen. Response-Format `2.0.0` bleibt
  gültig, `packages/core/server/utils/appwriteHealth.ts` unverändert (alle vier
  Endpunkte `/health/db`, `/health/cache`, `/health/storage`, `/health/time`
  antworten wie gehabt).

## Live erwischt: `create-site` scheiterte am Ein-Organisations-Limit

`pnpm create-site` legte bis 2.0 eine eigene Organisation `pukalani-sites` an.
Auf 2.1+ antwortet das mit
`403 … This self-hosted instance already has an organization.` — das Gate G1 der
E2E stirbt an dieser Stelle, und zwar NACH dem Schreiben der App-Dateien.
Behoben in `scripts/create-site.mjs`: bei 403 wird die vorhandene (einzige)
Organisation des Console-Accounts benutzt. Beweis: G1 läuft auf 2.2 wieder
vollständig durch (Projekt, Keys, Platform, Bootstrap, `check:manifests`).

## Ablauf (dev, gelaufen am 2026-09-14)

- [x] **Backup** — Befehl unverändert aus dem 2.0-Runbook. Dev: 10 MB,
  847 Tabellen, dazu das Config-Tar.
- [x] **Patchdatei aus dem 2.2.0-Image ziehen:**
  ```bash
  docker run --rm --entrypoint=cat appwrite/appwrite:2.2.0 /usr/src/code/app/init/registers.php > patches/registers-2.2.0.orig.php
  sed 's/keepAlive: true,/keepAlive: false,/' patches/registers-2.2.0.orig.php > patches/registers-2.2.0-keepalive-off.php
  diff patches/registers-2.2.0.orig.php patches/registers-2.2.0-keepalive-off.php   # genau Zeile 340
  ```
- [x] **Images vorziehen:** `appwrite/appwrite:2.2.0`,
  `appwrite/new:1.1.96-self-hosted`, `ghcr.io/appwrite/autogravity:0.0.10`,
  `ghcr.io/open-runtimes/orchestrator/orchestrator:2.2.0`. Der Rest
  (geo 0.3.1, browser 0.3.4, clickhouse 26.4.3-alpine, executor 0.29.0,
  mariadb 10.11, redis 7.4.7-alpine, traefik 3.6) ist zu 2.0 unverändert.
- [x] **Upgrade-Werkzeug** im ELTERN-Verzeichnis (Fallen 1+2 gelten
  unverändert — es startet selbst, und zwar OHNE Override):
  ```bash
  docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock \
    --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw \
    --entrypoint="upgrade" appwrite/appwrite:2.2.0 --interactive=N
  ```
  Dev: 35 s bis „Appwrite installed successfully". Die alten Worker-Container
  räumt `--remove-orphans` dabei selbst weg (kein Waisen-Fall wie
  `appwrite-embedding` bei 2.0).
- [x] **Override auf 2.2 ziehen** — Patchdatei UND Dienstname:
  ```bash
  cd appwrite
  sed -i '' 's#registers-2.0.0-keepalive-off.php#registers-2.2.0-keepalive-off.php#' docker-compose.override.yml
  # und: appwrite-worker-mails:  ⇒  appwrite-worker:
  docker compose up -d
  docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs   # 2
  docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php                   # 340: false
  docker exec appwrite-clickhouse-1 grep -c '<level>warning' /var/lib/clickhouse/preprocessed_configs/config.xml  # 1 (prod: Logging-Override)
  ```
  Ohne die Umbenennung stirbt `docker compose up` sofort mit
  „service appwrite-worker-mails has neither an image nor a build context
  specified" — der Stack läuft dann weiter in dem Zustand, den das Werkzeug
  hinterlassen hat: ohne trustedIPs und ohne SMTP-Patch.
- [x] **Migration:** `docker compose exec -T appwrite migrate` → „Migration
  completed", dev in **1,5 s** (2.2 fügt nur zwei Spalten und einen Index an
  `notifications` der Console-DB an).
- [x] **Beweise dev:** `health/version` → `2.2.0` · `health`, `health/db`
  (Console.DB + Projects.DB), `health/cache`, `health/storage` je `pass` ·
  `users?limit=1` → 85 Nutzer, `tablesdb/main/tables` → 55 Tabellen (Bestände
  unverändert) · Console `/console` → 302.

## CI (`ci/appwrite/`) — abgeleitet, nicht nachgepflegt

Der geschnittene CI-Stack wird aus dem Compose der Dev-Instanz abgeleitet (die
vier Abweichungen stehen im Kopf von `ci/appwrite/docker-compose.yml`). Probe
vor dem Hub: die Ableitung auf das ALTE Dev-Compose angewandt muss die
committete Datei exakt reproduzieren — dann stimmen die Abweichungen noch. So
schrumpfte die Datei von 2168 auf 903 Zeilen (die Einzel-Worker sind weg).

Dazu: `_APP_VERSION="2.2.0"` in `ci.env`, die entfallenen Schlüssel raus, die
zwei neuen rein (Schlüsselmenge ist danach deckungsgleich mit der Dev-`.env`,
bis auf den je Lauf erzeugten `_APP_OPENSSL_KEY_V1`), und in `e2e.yml`
`appwrite-worker-databases appwrite-worker-deletes` ⇒ `appwrite-worker`.

**Lokal nachstellen** (Ports 8080/8443, kollidiert nicht mit der Dev-Instanz):

```bash
cp ci/appwrite/ci.env /tmp/ci.env.local
printf '\n_APP_OPENSSL_KEY_V1=%s\n' "$(openssl rand -hex 16)" >> /tmp/ci.env.local
cd ci/appwrite && docker compose --env-file /tmp/ci.env.local --project-name appwrite-ci up -d \
  traefik appwrite appwrite-realtime appwrite-geo appwrite-worker mariadb redis
```

Beweise gegen diesen Stack am 2026-09-14, alle grün auf 2.2.0: Console-Setup
(Account/Org/Projekt/Key/Platform) · `bootstrap --seed` (alle Migrationen,
Spalten und Indizes — also der databases-Pfad des vereinten Workers) ·
verify-paid-ticket 13 · verify-pool-isolation comments 9 / posts 7 ·
verify-audience-flip 49 · verify-presence-boundary 10 · verify-index-nudge 9 ·
Gate G1 create-site · Playwright mit `CI=1`: **16 bestanden, 9 übersprungen**
(die neun sind die macOS-Baselines von themes-visual, die in CI immer
aussetzen) · Realtime-Spec einzeln grün (geteilter SDK-Socket + JWT).

## Prod — offen, wartet auf Davids Freigabe

Ablauf wie dev, mit den Prod-Besonderheiten aus dem 2.0-Runbook (Fenster ohne
Deploy, danach `pnpm ops:schema-parity`, `verify-tls.mjs`, Mail-Beweis über eine
OTP-Anmeldung auf `account.pukalani.app`). Zusätzlich für diesen Sprung:

- Die Override auf `appwrite-prod` trägt denselben Dienstnamen
  `appwrite-worker-mails` — **vor** dem eigenen `up` auf `appwrite-worker`
  ziehen, sonst startet der Stack ohne SMTP-Patch und ohne trustedIPs.
- Patchdatei `registers-2.2.0-keepalive-off.php` dort neu erzeugen (aus dem
  Image auf dem Prod-Host, nicht kopieren).
- Nach dem Lauf prüfen, dass die 14 alten Worker-Container weg sind und genau
  ein `appwrite-worker` läuft.

## Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack) | 2026-09-14 ~21:10 | 10 MB, 847 Tabellen | „Migration completed", 1,5 s | Werkzeug 35 s, gesamt < 3 min | Dienstname `appwrite-worker-mails` weg (Compose-Abbruch), `create-site` 403 am Ein-Organisations-Limit |
| prod (`api.pukalani.app`) | offen | — | — | — | wartet auf Davids Freigabe |
