# Runbook: Appwrite 2.6.2 → 2.7.1 (self-hosted, MariaDB)

Gilt für beide Instanzen: **dev** (`~/Developer/orbstack/appwrite-maria/`,
OrbStack) und **prod** (`ploi@188.245.61.155:~/appwrite/`, `api.pukalani.app`),
dazu die CI-Wegwerf-Instanz (`ci/appwrite/`). Alles, was hier „dev" heißt, ist
am 2026-11-06 Ortszeit (= 2026-11-07 UTC) dort gemessen worden, nicht vermutet.

Die Vorgänger gelten weiter und werden hier nicht wiederholt: Backup-Befehl und
Rückweg in [APPWRITE-2-0-UPGRADE.md](APPWRITE-2-0-UPGRADE.md), Ein-Worker-Dienst
und CI-Ableitung in [APPWRITE-2-2-UPGRADE.md](APPWRITE-2-2-UPGRADE.md), die
Fallen des Werkzeugs (lädt die Override MIT, braucht darin ABSOLUTE Mount-Pfade,
`--no-start` wird ignoriert) und der Ablauf 2.6.1 → 2.6.2 in
[APPWRITE-2-6-UPGRADE.md](APPWRITE-2-6-UPGRADE.md).

## 2.6.2 → 2.7.1

**Anlass:** 2.7.0 (2026-11-03) und das Security-Release 2.7.1 (2026-11-04).
2.7.1 hebt den Open-Runtimes-**Executor von 1.1.2 auf 1.3.1**: 1.1.2 folgte
Symlinks, die eine Function/Site in ihre Log-, Build- oder Cache-Dateien legt —
eine Function konnte so die Umgebung des Executors lesen, darin
`_APP_EXECUTOR_SECRET`, und mit dem Secret die Executor-API aufrufen, die
Docker auf dem Host steuert. Gelesen: `gh release view 2.7.0 -R
appwrite/appwrite`, `… 2.7.1`, dazu der Quelltext am Tag `2.7.1`
(`app/realtime.php`, `app/init/constants.php`, `app/init/registers.php`) und die
PRs #14945, #14948, #15056, #15059, #15211.

**2.7.0 braucht `migrate`.** Die Migrationsklasse bleibt V25, bekommt aber
NEUE Schritte (idempotent): `prefs` an Projekten, `alertsUnsubscribed` an
Nutzern, GeoIP-Attribute an Sessions, `type` an Transaktionen (Bestand →
`legacy`), `topicInternalId`-Indizes im Push-Ledger, die Collections
`transfers`, `monitors`, `monitorAlerts`, `reviews`. 2.7.1 selbst ändert kein
Schema; ein Sprung 2.6.2 → 2.7.1 in EINEM Werkzeug-Lauf plus `migrate` reicht
(dev so gelaufen).

### Was 2.7 für uns ändert — geprüft gegen den Code

- **Realtime: Stille-Trennung nach 2 Minuten (#15059).** Swoole
  `heartbeat_check_interval: 30`, `heartbeat_idle_time: 120`: eine Verbindung,
  die zwei Minuten NICHTS sendet, wird geschlossen. Jedes Appwrite-SDK pingt
  alle 20 s (`{"type":"ping"}`) — unsere geteilte JWT-Realtime
  (`useRealtimeClient.ts`, Web-SDK `appwrite` 27) ist damit gedeckt. **Nicht
  gedeckt war der cookie-native Account-WS** (`useRealtimeAccount.ts`): ein
  handgeschriebener `new WebSocket`, der nur zuhört — genau der Fall, den
  Appwrite in #15059 nennt. Er flog alle 2 min raus, und jeder Abbruch löst
  `onClose` → Auth-Nachtrag (`/api/auth/me`, gedrosselt über
  `accountVerifyDue`) → Reconnect aus. Seit diesem Vorhaben pingt er alle 20 s
  selbst (20 s statt knapp unter 120 s, weil Browser die Timer von
  Hintergrund-Tabs auf einmal pro Minute drosseln — Appwrites eigene
  Begründung). **Leerlauf-Probe auf dev (2.7.1):** zwei Gast-WS gegen
  `/v1/realtime?project=reddit-comments&channels[]=account` — der stumme wurde
  nach **120,2 s** mit 1006 geschlossen, der mit 20-s-Ping stand nach 170 s
  noch (readyState 1).
- **Realtime: Grenzen je Verbindung (#14945, #14948).** Höchstens 100
  Subscriptions, 100 Channels und 100 Queries (verschachtelte zählen) je
  Verbindung (`_APP_LIMIT_REALTIME_SUBSCRIPTIONS/_CHANNELS/_QUERIES`, Default
  100), sonst `REALTIME_POLICY_VIOLATION`. Unser geteilter Socket auf der
  vollsten Seite (Dashboard-Start im Pool, im Code gezählt): `app_config`
  (Config-Plugin) + `community_branding` (Branding-Spiegel) + `custom_themes`,
  `custom_fonts`, `app_config` (Themes-Plugin) + Glocke + „Neu"-Knopf +
  `comments` + `audit_logs` + Presence (Dashboard, Seitenbetrachter) + Billing
  + Aktivität — **rund 15 Subscriptions mit je EINEM Channel, eine Handvoll
  Queries**. Weit unter 100; die Grenze wäre nur mit einer Liste erreichbar,
  die je Zeile abonniert (gibt es nicht — `useRealtimeRows` abonniert je
  TABELLE).
- **Realtime: 32 Verbindungen je Nutzer und Worker, 128 je Gast-IP.** Ein Tab
  hält ZWEI Verbindungen (geteilte JWT-Realtime + Account-WS) — ab dem 17.
  gleichzeitig offenen Tab desselben Nutzers wird die 33. Verbindung
  abgewiesen. Realtime läuft mit EINEM Worker (`_APP_WORKERS_NUM` ungesetzt).
  Für uns kein Maß, aber der Grund, warum ein Nutzer mit sehr vielen Tabs „tote"
  Live-Aktualisierung melden könnte. Gäste zählen je IP (bzw. IPv6-/64) und
  Projekt — 128 reicht auch für die CI-E2E (alle Browser von `127.0.0.1`).
- **Richtlinie „Deny realtime guests" (Auth > Policies > Realtime, #14945/
  #14996) BLEIBT AUS — Davids Linie seit der Changelog-Prüfung vom
  2026-10-29.** Gäste abonnieren bei uns ABSICHTLICH `read(any)`-Tabellen:
  `app_config` (`realtime-config.client.ts` — Flags/Produkte schalten live um),
  `custom_themes`/`custom_fonts` (`realtime-themes.client.ts`), den
  `community_branding`-Spiegel (`realtime-branding.client.ts`) und die
  Kommentar-Threads (`CommentSection.vue`). Mit der Richtlinie bräche diese
  Live-Aktualisierung für ABGEMELDETE Besucher STILL: keine Fehlermeldung,
  die Seite sieht richtig aus, sie aktualisiert sich nur nicht mehr — genau
  das Fehlerbild, gegen das `pukalani.realtime.enabled` (F14) gebaut ist. Wer
  sie einschalten will, braucht vorher einen Ersatz für diese vier Wege.
- **Bulk-Writes aus Client-Sessions → 401 (#15235).** Bulk update/upsert/
  delete brauchen einen API-Key oder Console-Nutzer. Grep: kein
  `updateRows`/`upsertRows`/`deleteRows` im Code — und CRUD läuft ohnehin nur
  über `server/api/*`.
- **SMTP: „Retry a stale SMTP session once" (#14213, #15211, „Fixes #12623").**
  Das ist upstream genau der Fehler, gegen den unser keepAlive-Patch seit
  2026-07-19 steht (Instanz-Mail nach Leerlauf still weg). Der Patch BLEIBT in
  diesem Upgrade (Gürtel und Hosenträger; `registers.php` hat sich geändert —
  Redis-Timeouts —, keepAlive steht jetzt in **Zeile 372** statt 367, die
  Patchdatei wird wie immer aus dem Image gezogen). Ob er fallen kann, ist ein
  eigener Schritt mit Mail-Beweis nach Leerlauf — OPEN-ITEMS.
- **Server-Key-Rotation (#15198/#15199):** `_APP_OPENSSL_KEY_CURRENT`/`_OLDEST`
  (Werkzeug schreibt `1`/`1` = nichts ändert sich), `_APP_OPENSSL_KEY_V2` leer.
  Keine Handlung. Achtung für später: nach einer Konfigurationsänderung
  `docker compose up -d`, nicht `restart` (hält die alte Umgebung).
- **`rules.read` für Projekt-Nutzer entfällt (#15013)**, Membership-Privacy in
  Create/Update-Antworten, Last-Owner-Regel für Console-Teams, TOTP-Codes
  einmalig, MFA-Abschalten braucht frische Challenge — keine Code-Stelle bei
  uns betroffen (wir lesen keine Proxy-Rules aus Client-Sessions).
- **`OTP-Token`-Header in OTP-Mails (#15096)** nur für HTTPS-Origins — unsere
  OTP-Anmeldung schickt Appwrite über die Instanz-SMTP; der Header ist ein
  Zusatz für Passwort-Manager, kein Verhaltenswechsel.
- **Leere `{}` (z. B. `prefs`) bleiben in Event-Payloads Objekte statt `[]`
  (#13650)** — betrifft nur Realtime-/Webhook-Payloads, nicht REST; unser
  Prefs-Code liest REST.
- **`_APP_DB_MAX_CONNECTIONS` (500)** gilt nur für das gebündelte PostgreSQL —
  wir fahren MariaDB.

### Executor-Secret — Davids Entscheidung

Betroffen ist laut Appwrite, wer FREMDEN erlaubt, Functions oder Sites zu
deployen. Prod (lesend geprüft 2026-11-07): `_APP_CONSOLE_WHITELIST_ROOT=
"enabled"`, `_APP_CONSOLE_WHITELIST_EMAILS` nur `@pukalani.app` — Console-
Zugang hat nur das eigene Team, Deployments machen nur wir. **Damit sind wir
nach Appwrites Maßstab nicht betroffen.** Die Rotation kostet trotzdem nichts:
das Skript schreibt mit `ROTATE_EXECUTOR_SECRET=1` den neuen Wert VOR dem
Werkzeug in die `.env`, das Werkzeug übernimmt gesetzte Werte, und der
Neustart passiert ohnehin — KEINE zusätzliche Downtime. Empfehlung: mitrotieren
(der alte Wert lag zwei Jahre lang in einem Container, der Symlinks folgte; man
muss nicht beweisen, dass ihn nie jemand gelesen hat). Ohne die Variable bleibt
das Secret, wie es ist.

**Probe des Mechanismus auf dev (2026-11-07 00:47 UTC):** neues Secret per
`openssl rand -hex 32` in die `.env`, Werkzeug 2.7.1 erneut (wiederholbar,
20,6 s, „installed successfully") → der Wert steht danach UNVERÄNDERT in der
`.env`; `appwrite`, `appwrite-worker` und `exc1` (`OPR_EXECUTOR_SECRET`)
tragen denselben neuen Wert; Executor-API `GET /v1/runtimes` mit dem neuen
Secret **200**, mit falschem **401** (`/v1/health` des Executors prüft KEIN
Secret, antwortet immer 200 — taugt nicht als Beweis).

### Images 2.6.2 → 2.7.1

`appwrite/appwrite` **2.7.1** (PHP 8.5.12, Brotli 1.2.1-r0 unverändert),
Console `appwrite/new` 1.2.108 → **1.2.138-self-hosted**, `appwrite/browser`
0.3.8 → **0.3.10**, `openruntimes/executor` 1.1.2 → **1.3.1**, Orchestrator
2.2.4 → **4.0.0**. Unverändert: autogravity 0.0.11, exiftool 0.1.1, geo 0.3.2,
mariadb 10.11, redis 7.4.7-alpine, traefik 3.6, clickhouse 26.4.3-alpine.

**Compose-Diff (vom Werkzeug auf dev erzeugt, 74 Diff-Zeilen):** die fünf
Image-Tags, `_APP_WORKER_MAX_COROUTINES` 79 → 83 am `appwrite-worker`, sonst nur
neue Env-Durchreichungen (`_APP_OPENSSL_KEY_V2/_CURRENT/_OLDEST` in allen
PHP-Diensten, `_APP_LIMIT_REALTIME_*` an Realtime, `_APP_ALERTS_*`,
`_APP_MAINTENANCE_RETENTION_ALERTS`, `_APP_NOTIFICATIONS_PUSH_APNS*`,
`_APP_DOMAIN_FUNCTIONS_FALLBACK`, `_APP_REVIEWS_SECRET`). **Neue `.env`-
Schlüssel** (Werkzeug schreibt sie selbst): die drei OpenSSL-, drei
Realtime-Limit-Schlüssel, `_APP_DB_MAX_CONNECTIONS`,
`_APP_DOMAIN_FUNCTIONS_FALLBACK`, `_APP_ALERTS_INTERVAL` (60),
`_APP_ALERTS_USAGE_LAG` (120), `_APP_MAINTENANCE_RETENTION_ALERTS` (7776000),
`_APP_NOTIFICATIONS_PUSH_APNS(_KEY)`, vier `_APP_REVIEWS_*` (leer).

### Ablauf dev (OrbStack) — gelaufen 2026-11-07

Dieselben Schritte wie das Prod-Skript, nur mit Dev-Pfaden (`stat -f`,
`sed -i ''`, Mount-Pfad `/Users/…/appwrite-maria/appwrite/patches/…`):

1. `docker pull appwrite/appwrite:2.7.1`; Patchdatei aus dem Image ziehen,
   `keepAlive: true` → `false` (Diff: genau Zeile 372).
2. Dump + Config-Tar (`backups/appwrite-dev-pre-2.7.1-*.sql.gz`).
3. Override: NUR den Patch-Mount auf `registers-2.7.1-keepalive-off.php`
   drehen (absoluter Pfad bleibt), `docker compose config --quiet` grün.
4. Werkzeug im Elternverzeichnis, `--entrypoint="upgrade"`,
   `--interactive=N` → „Appwrite installed successfully" (dev **161 s**, fast
   alles Image-Pulls: Console 1.2.138, Executor, Orchestrator — vorziehen
   spart das auf prod).
5. `docker compose up -d --remove-orphans`, dann
   `docker compose exec -T appwrite migrate` → „Migration completed".
6. Beweise (s. „Durchläufe").

### CI (`ci/appwrite/`)

`ci.env`: `_APP_VERSION="2.7.1"`, Block „NEU MIT APPWRITE 2.7.0 / 2.7.1" mit
den 17 neuen Schlüsseln (Werte wie das Werkzeug auf dev) — Schlüsselmenge
wieder deckungsgleich mit der Dev-`.env` bis auf `_APP_OPENSSL_KEY_V1` (je Lauf
erzeugt). Compose: der Dev-Diff (`diff -u` alt/neu) per `patch` auf die
abgeleitete Datei — 17 von 19 Hunks passen, die zwei Image-Tags an Diensten
mit `container_name` (Console, Browser; in der CI-Fassung ohne) von Hand.
`docker compose config --quiet` grün. Die CI installiert je Lauf FRISCH, ein
`migrate` gibt es dort nicht. Live-Beweis ist der E2E-Lauf auf dem PR.

### Prod — Ablauf (nach Davids Freigabe)

Skript [`ops/appwrite-upgrade-2.7.1.sh`](../../ops/appwrite-upgrade-2.7.1.sh)
(Aufruf im Kopf: `scp` + `ssh -t … | tee ~/appwrite-upgrade-2.7.1.log`, mit
oder ohne `ROTATE_EXECUTOR_SECRET=1`). Es prüft die Vorbedingungen (`.env` auf
2.6.2, Override auf der 2.6.2-Patchdatei, Trusted-Proxy-Eintrag), zieht ALLE
neuen Images (inkl. Console/Executor/Orchestrator — auf dev waren das die
2½ Minuten) und die Patchdatei OHNE Downtime, dumpt, rotiert optional das
Executor-Secret, dreht in der Override nur den Patch-Mount, ruft das Werkzeug,
fährt `up`, `migrate`, Beweise — OHNE `doctor` (sendet eine SMTP-Testmail).
Erwartetes Fenster wie 2.6.2 (dort 81 s) plus etwas mehr `migrate` (neue
Schritte; dev 9,2 s statt 1,6 s, prod hatte 19,6 s bei 2.6.2).

**Danach wie bei 2.6.2:** alle Hosts `/api/health ok:true`, SSR-Seite mit
Session 200, Realtime 101 (`curl --http1.1`), OTP-Mail nach Leerlauf (der
KeepAlive-Fall), `node scripts/ops/verify-tls.mjs`, `pnpm ops:schema-parity`
(Soll unverändert — die neuen Collections sind Appwrite-intern), dazu NEU:
im Browser 3 Minuten ein Dashboard offen lassen und im Netzwerk-Tab prüfen,
dass der Account-WS (`channels[]=account`) NICHT neu aufgebaut wird und kein
`/api/auth/me` alle 2 min nachkommt.

**Rückweg:** `.env` + `docker-compose.yml` aus `*.<epoch>.backup`, Override-
Mount zurück auf `registers-2.6.2-keepalive-off.php`, `docker compose up -d
--remove-orphans`, **Dump zurückspielen** — anders als bei 2.6.2 hat `migrate`
diesmal Neues angelegt (Attribute, Indizes, Collections); ob 2.6.2 damit
weiterläuft, ist nicht geprüft, der Dump ist der sichere Weg. Ein rotiertes
Executor-Secret steht im Config-Tar.

### Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack, 2.6.2 → 2.7.1) | 2026-11-07 00:37–00:41 | 10,9 MB, 943 Tabellen | „Migration completed", 9,2 s (334 „already exists", 0 Fehler) | Werkzeug 161 s (Image-Pulls), Aufruf bis Beweise ~3,5 min | Tabellen vorher (Dump) gegen nachher (`information_schema`): **0 verschwunden, 66 neu** — alle Appwrite-intern (`reviews*` × 12 je Projekt × 5, `_console_transfers/monitors/monitorAlerts`), Nutzertabellen `_database_*` 388 → 388 · `health/version` 2.7.1 · PHP 8.5.12 · Brotli 1.2.1-r0 · keepAlive 372 `false` · trustedIPs 2 + mqtt 2, 8883/8084 auf 127.0.0.1 · Executor 1.3.1 (`OPR_EXECUTOR_VERSION`), Orchestrator 4.0.0, Console 1.2.138, Browser 0.3.10 · 7 Container auf 2.7.1, keiner auf 2.6.2, alle Up · Realtime-Limits 100/100/100 in der Env · Console 302 · Realtime 101 · Leerlauf-Probe 120,2 s / Ping lebt · **E2E `apps/comments` 16/16** (ohne `themes-visual`, Worktree-Dev-Server mit Ping-Code) · core-Unit 1740 grün · Executor-Secret-Rotation geprobt (s. oben) · `pnpm ops:schema-parity` (prod, unverändert 2.6.2) 69/42/41/43, Spalten deckungsgleich — Ausgangsstand für AW27 |
