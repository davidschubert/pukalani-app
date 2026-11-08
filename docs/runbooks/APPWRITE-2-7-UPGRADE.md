# Runbook: Appwrite 2.6.2 → 2.7.1 (self-hosted, MariaDB)

Gilt für beide Instanzen: **dev** (`~/Developer/orbstack/appwrite-maria/`,
OrbStack) und **prod** (`ploi@188.245.61.155:~/appwrite/`, `api.pukalani.app`),
dazu die CI-Wegwerf-Instanz (`ci/appwrite/`). Alles, was hier „dev" heißt, ist
am 2026-11-06 (UTC) dort gemessen worden, nicht vermutet; prod lief am selben
Tag 01:16–01:19 UTC nach Davids „Ja, mit Rotation".

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
  *Nachtrag RT2 (2026-11-08):* den eigenen Account-WS gibt es nicht mehr —
  der `account`-Channel läuft über den geteilten SDK-Socket (der eigene war
  in Prod ein Gast und bekam den Session-Widerruf nie mit). Zweite 2.7-Regel,
  dabei gefunden: eine JWT-Verbindung schließt Appwrite beim Ablauf des JWT,
  mit dem sie GEÖFFNET wurde (401) — der 12-min-Refresh verbindet deshalb neu.
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
  Patchdatei wird wie immer aus dem Image gezogen). **Seit 2026-11-08 auf dev
  und prod entfernt (AW28/AW29)**, Beweis und Prod-Lauf im Abschnitt „AW28" unten.
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
deployen. Prod (lesend geprüft 2026-11-06): `_APP_CONSOLE_WHITELIST_ROOT=
"enabled"`, `_APP_CONSOLE_WHITELIST_EMAILS` nur `@pukalani.app` — Console-
Zugang hat nur das eigene Team, Deployments machen nur wir. **Damit sind wir
nach Appwrites Maßstab nicht betroffen.** Die Rotation kostet trotzdem nichts:
das Skript schreibt mit `ROTATE_EXECUTOR_SECRET=1` den neuen Wert VOR dem
Werkzeug in die `.env`, das Werkzeug übernimmt gesetzte Werte, und der
Neustart passiert ohnehin — KEINE zusätzliche Downtime. Empfehlung: mitrotieren
(der alte Wert lag zwei Jahre lang in einem Container, der Symlinks folgte; man
muss nicht beweisen, dass ihn nie jemand gelesen hat). Ohne die Variable bleibt
das Secret, wie es ist.

**Probe des Mechanismus auf dev (2026-11-06 00:47 UTC):** neues Secret per
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

### Ablauf dev (OrbStack) — gelaufen 2026-11-06

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

### Prod — Ablauf (gelaufen 2026-11-06 nach Davids „Ja, mit Rotation")

Skript [`ops/appwrite-upgrade-2.7.1.sh`](../../ops/appwrite-upgrade-2.7.1.sh)
(Aufruf im Kopf: `scp` + `ssh -t … | tee ~/appwrite-upgrade-2.7.1.log`, mit
oder ohne `ROTATE_EXECUTOR_SECRET=1`). Es prüft die Vorbedingungen (`.env` auf
2.6.2, Override auf der 2.6.2-Patchdatei, Trusted-Proxy-Eintrag), zieht ALLE
neuen Images (inkl. Console/Executor/Orchestrator — auf dev waren das die
2½ Minuten) und die Patchdatei OHNE Downtime, dumpt, rotiert optional das
Executor-Secret, dreht in der Override nur den Patch-Mount, ruft das Werkzeug,
fährt `up`, `migrate`, Beweise — OHNE `doctor` (sendet eine SMTP-Testmail).
Gemessenes Fenster: Werkzeug-Aufruf bis Beweise **99 s** (Werkzeug 27,6 s,
`up` 36 s, `migrate` 24,1 s). Images vorher von Hand gezogen, während der
App-Deploy mit dem Ping-Fix lief — Reihenfolge bewusst: ERST der Ping-Fix live
(sonst flappt jeder angemeldete Tab bis zum Deploy alle 2 min), DANN Appwrite.
Ein parallel laufender Nachbar-Deploy stört nicht: `deploy.yml` prüft nur
`/api/health` und fährt keine Migrationen.

**Danach wie bei 2.6.2:** alle Hosts `/api/health ok:true`, SSR-Seite mit
Session 200, Realtime 101 (`curl --http1.1`), OTP-Mail nach Leerlauf (der
KeepAlive-Fall), `node scripts/ops/verify-tls.mjs`, `pnpm ops:schema-parity`
(Soll unverändert — die neuen Collections sind Appwrite-intern), dazu NEU:
im Browser 3 Minuten ein Dashboard offen lassen und im Netzwerk-Tab prüfen,
dass der Account-WS (`channels[]=account`) NICHT neu aufgebaut wird und kein
`/api/auth/me` alle 2 min nachkommt. **Prod-Beweis 2026-11-08** (angemeldet,
account.pukalani.app/de, `WebSocket.prototype.send` instrumentiert): nach 210 s
beide Sockets (Account-WS + geteilter SDK-Socket) `readyState 1`, 16 Pings,
0 `close`-Ereignisse, kein `/api/auth/me` im Netzwerk.

**Rückweg:** `.env` + `docker-compose.yml` aus `*.<epoch>.backup`, Override-
Mount zurück auf `registers-2.6.2-keepalive-off.php`, `docker compose up -d
--remove-orphans`, **Dump zurückspielen** — anders als bei 2.6.2 hat `migrate`
diesmal Neues angelegt (Attribute, Indizes, Collections); ob 2.6.2 damit
weiterläuft, ist nicht geprüft, der Dump ist der sichere Weg. Ein rotiertes
Executor-Secret steht im Config-Tar.

### Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack, 2.6.2 → 2.7.1) | 2026-11-06 00:37–00:41 | 10,9 MB, 943 Tabellen | „Migration completed", 9,2 s (334 „already exists", 0 Fehler) | Werkzeug 161 s (Image-Pulls), Aufruf bis Beweise ~3,5 min | Tabellen vorher (Dump) gegen nachher (`information_schema`): **0 verschwunden, 66 neu** — alle Appwrite-intern (`reviews*` × 12 je Projekt × 5, `_console_transfers/monitors/monitorAlerts`), Nutzertabellen `_database_*` 388 → 388 · `health/version` 2.7.1 · PHP 8.5.12 · Brotli 1.2.1-r0 · keepAlive 372 `false` · trustedIPs 2 + mqtt 2, 8883/8084 auf 127.0.0.1 · Executor 1.3.1 (`OPR_EXECUTOR_VERSION`), Orchestrator 4.0.0, Console 1.2.138, Browser 0.3.10 · 7 Container auf 2.7.1, keiner auf 2.6.2, alle Up · Realtime-Limits 100/100/100 in der Env · Console 302 · Realtime 101 · Leerlauf-Probe 120,2 s / Ping lebt · **E2E `apps/comments` 16/16** (ohne `themes-visual`, Worktree-Dev-Server mit Ping-Code) · core-Unit 1740 grün · Executor-Secret-Rotation geprobt (s. oben) · `pnpm ops:schema-parity` (prod, unverändert 2.6.2) 69/42/41/43, Spalten deckungsgleich — Ausgangsstand für AW27 |
| prod (`api.pukalani.app`, 2.6.2 → 2.7.1) | 2026-11-06 01:16–01:19 | 22,3 MB, 872 Tabellen | „Migration completed", 24,1 s (257 „already exists", 0 Fehler) | Werkzeug 27,6 s „installed successfully", Aufruf bis Beweise **99 s** | `ROTATE_EXECUTOR_SECRET=1 bash ~/appwrite-upgrade-2.7.1.sh` per `ssh` (Log `~/appwrite-upgrade-2.7.1.log`), Skript-Exit 0 · Executor 1.3.1, Secret in appwrite+executor gleich, `/v1/runtimes` neu 200 / falsch 401 · PHP 8.5.12, Brotli 1.2.1-r0, keepAlive 372 `false`, trustedIPs 2 + mqtt 2, 8883/8084 auf 127.0.0.1, `config.d` mit `logging.xml` · 7 Container auf 2.7.1, alle Up · 0 Fehler in API/Worker/Realtime nach dem Start · extern `health/version` 2.7.1, Realtime 101 (`--http1.1`) · `verify-health` 10/10 (Build bb380b92 mit Ping-Fix), `verify-tls` grün, `schema-parity` 69/42/41/43 deckungsgleich · SSR demo/branding.supply/pukalani.studio 200, account 302 · **Mail-Beweis** 01:19 UTC: Gast-`POST /v1/account/tokens/email` (Projekt `account`, `userId` `probe-mail-20261106`, `delivered@resend.dev`) → 201, Worker `v1-mails` otp · cloud · `success` 1,73 s; Probe-Nutzer auf dem App-Server gelöscht (204, Gegenprobe 404) · Platte 41 % → 45 % · **offen:** Browser-Blick mit Anmeldung (Account-WS > 2 min stabil) — Chrome war auf account. nicht angemeldet |

## AW28 — keepAlive-Patch entfernt (2026-11-08)

**Ergebnis:** Der Patch (`registers.php` mit `keepAlive: false`, gemountet in
`appwrite-worker`, seit 2026-07-19) wird ab 2.7 nicht mehr gebraucht. dev ohne
Patch seit 2026-11-08 17:54 UTC; CI trug ihn NIE (`ci/appwrite/` hat keine
Override, `_APP_SMTP_HOST` ist leer); prod: Skript fertig, Lauf wartet auf
Davids Ja.

**Warum (Quelltext am Tag 2.7.1 im Container gelesen):** 2.7 hat einen NEUEN
SMTP-Adapter (`packages/messaging/src/Adapter/Email/SMTP.php`, kein PHPMailer
mehr — der alte Fehler war ein verschlucktes PHPMailer-`false`). Zwei Netze:
(1) `reusable()` schickt nach mehr als `pingThreshold` = 30 s Stille ein NOOP,
bevor eine gehaltene Verbindung wiederverwendet wird; (2) stirbt die gehaltene
Verbindung trotzdem vor dem Punkt (`ConnectionException`/`ProtocolException`
oder 421), sendet `deliver(…, false)` die Mail EINMAL auf frischer Verbindung
(#14213). Und ein Fehlschlag ist jetzt sichtbar: `mail.status failure`, nicht
mehr „success".

**Beweis dev** (OrbStack, Mailpit v1.29.3, OTP über Gast-`POST
/v1/account/tokens/email`, Projekt `reddit-comments`, je Probe eine neue
Adresse `aw28-<etikett>-<zeit>@example.test`; „gehaltener Socket" = Zeile für
Port 1025 in `/proc/net/tcp` des Workers, `01` = offen, `08` = `CLOSE_WAIT`,
die Gegenseite hat geschlossen; „getötet" = `docker restart mailpit`):

| Zeit (UTC) | Adapter im Worker | Fall | Ergebnis |
| --- | --- | --- | --- |
| 17:51:14 | 2.7.1 ohne Ping, ohne Retry (Gegenprobe G0) | Aufwärmen | `success` 110 ms, Socket gehalten (`01`) |
| 17:51:55 | G0 | Socket getötet (`08`) | **`failure` 4,8 ms, Mailpit 0 Treffer, kein Queue-Nachversuch** — die Probe kann rot werden |
| 17:53:07 | 2.7.1 ohne Ping, MIT Retry (G1) | Aufwärmen | `success` 184 ms |
| 17:53:38 | G1 | Socket getötet (`08`) | `success` 73 ms, NEUER Socket, Mail da — der Retry allein heilt |
| 17:54:30 | 2.7.1 unverändert, ohne Patch | Aufwärmen | `success` 120 ms |
| 17:55:02 | unverändert | Socket getötet (`08`) | `success` 68 ms, neuer Socket, Mail da |
| **21:55:34** | unverändert | **4 h Leerlauf** (17:55:27–21:55:33, 0 `v1-mails`-Spans im Fenster, Worker und Mailpit seit 17:54 nicht neu gestartet) — Mailpit hatte den gehaltenen Socket in der Stille SELBST geschlossen (`08`) | **`success` 29,7 ms, neuer Socket, Mail in Mailpit 21:55:34.394** |

Die Gegenprobe-Adapter sind Kopien des 2.7.1-Originals mit genau zwei
Änderungen (`reusable()` → immer `true`; `process()` → `deliver($message,
false)`), per Override-Mount auf `/usr/src/code/packages/messaging/src/
Adapter/Email/SMTP.php` eingehängt; sie liegen auf dev unter `patches/
SMTP-2.7.1-noping{,-noretry}.php` und taugen als Werkzeug, falls ein späteres
Release den Adapter wieder umbaut: Gegenprobe zuerst, dann der Beweis. Das
1.9.x-Verhalten selbst (verschlucktes `false`) lässt sich in 2.7 nicht mehr
herstellen — der Code dafür existiert nicht mehr; G0 ist der nächste Fall, und
er unterscheidet sich vom alten nur dadurch, dass er `failure` loggt.

**Prod** — Skript
[`ops/appwrite-aw28-drop-smtp-keepalive-patch.sh`](../../ops/appwrite-aw28-drop-smtp-keepalive-patch.sh)
(Aufruf im Kopf, NUR nach Davids Ja): prüft `.env` 2.7.1 und den Patch-Mount,
sichert die Override (`.bak-aw28-<TS>`), schreibt den Kopfkommentar neu und
entfernt NUR den Block `appwrite-worker` (traefik- und clickhouse-Block
bleiben — an einer lesend geholten Kopie der Prod-Override geprüft: −10
Kommentarzeilen +5, −3 Blockzeilen), `docker compose config --quiet`, dann
nur `docker compose up -d appwrite-worker` (Sekunden; API/Realtime/Console
laufen durch, Jobs warten in Redis). Beweise: keepAlive 372 `true`, 0
Patch-Mounts, Retry-Zeile im Adapter vorhanden, `health/version`, alle
Container Up, OTP an `delivered@resend.dev` mit `v1-mails`-Span. Probe-Nutzer
`probe-aw28-<datum>` danach mit dem Runtime-Key auf dem App-Server löschen
(die Migrations-Keys haben keinen `users.*`-Scope, s. Runbook 2.6). Der
eigentliche Leerlauf-Beweis auf prod ist dieselbe OTP-Probe nach ≥ 3 h
Stille. **Rückweg:** `cp docker-compose.override.yml.bak-aw28-<TS>
docker-compose.override.yml && docker compose up -d appwrite-worker` — die
Patchdateien bleiben unter `patches/` liegen.

**Prod-Lauf (AW29, Davids „Ja, prod jetzt“)** — 2026-11-08 23:00:49–23:01:25
UTC, `ssh` mit Log `~/appwrite-aw28.log`, Sicherung
`docker-compose.override.yml.bak-aw28-20261108-2300`. Diff genau wie an der
Kopie geprüft (Kopf −10/+5, Block −3), Worker neu erzeugt in 15 s (die Zeile
„Volume appwrite-builds Created“ ist nur Compose-Gerede — das Volume besteht
seit 2026-09-08, API und Worker hängen beide daran). Beweise: keepAlive 372
`true`, 0 Patch-Mounts, Retry-Zeile 1, `{"version":"2.7.1"}`, alle Container
Up, 0 Worker-Fehler. OTP-Probe `probe-aw28-20261108` → `201`,
`worker.v1-mails · 1.58s · otp · smtp_type cloud · resend.dev · success`;
Probe-Nutzer auf dem App-Server gelöscht (`GET 200` → `DELETE 204` → `GET 404`).

**Künftige Upgrades:** keine Patchdatei mehr ziehen. Die Upgrade-Skripte
`ops/appwrite-upgrade-2.*.sh` prüfen den Patch-Mount als Vorbedingung — ein
NEUES Skript lässt diese Prüfung und den Mount-Dreh weg.
