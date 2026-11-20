# Runbook: Appwrite 2.6.2 → 2.7.1 → 2.7.3 → 2.7.4 (self-hosted, MariaDB)

> **Stand 2026-11-20:** dev, CI und Production laufen auf **2.7.4**. Der
> Schritt steht unten im Abschnitt [„2.7.3 → 2.7.4"](#273--274); Production
> lief am 2026-11-20 15:11–15:16 UTC nach Davids „ja production jetzt", danach
> der Beweis-Neustart für die Neustart-Regel der Container (grün). Der Schritt
> 2.7.1 → 2.7.3 steht im Abschnitt
> [„2.7.1 → 2.7.3"](#271--273); Production lief am 2026-11-18 22:24–22:26 UTC
> nach Davids „Ja, Production jetzt".

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
  *Nachtrag 2026-11-09:* seit RT2 (s. oben) hält ein Tab nur noch EINE
  Verbindung (Rows, Presence und `account` über den geteilten SDK-Socket) —
  die Grenze greift damit erst ab dem 33. offenen Tab desselben Nutzers.
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

Skript [`appwrite-upgrade-2.7.1.sh`](../archiv/skripte/appwrite-upgrade-2.7.1.sh) (erledigt, seit 2026-11-15 im Archiv; lag unter `ops/`)
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
[`appwrite-aw28-drop-smtp-keepalive-patch.sh`](../archiv/skripte/appwrite-aw28-drop-smtp-keepalive-patch.sh) (erledigt, seit 2026-11-15 im Archiv; lag unter `ops/`)
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

**Leerlauf-Beweis prod** — 3 h nach dem Neustart (23:01:30 bis 2026-11-09
02:04:22 UTC, **0** `v1-mails`-Spans im Fenster, Worker seit 23:00:55 ohne
Neustart). Vor der Probe stand der gehaltene SMTP-Socket zu Resend (Port 587)
in **`08` CLOSE_WAIT** — Resend hatte ihn selbst geschlossen, also genau der
Fall, in dem 1.9.5–2.6 die Mail still verlor. Probe `probe-aw29-idle-20261109`
02:04:24 → `201`, `worker.v1-mails · 1.59s · otp · smtp_type cloud ·
resend.dev · success`; danach ein NEUER Socket (anderer Quellport) in `01`.
0 Worker-Fehler im ganzen Fenster; Probe-Nutzer gelöscht (`204`, Gegenprobe
`404`).

**Künftige Upgrades:** keine Patchdatei mehr ziehen. Die Upgrade-Skripte
`docs/archiv/skripte/appwrite-upgrade-2.*.sh` (erledigt, im Archiv) prüfen den Patch-Mount als Vorbedingung — ein
NEUES Skript lässt diese Prüfung und den Mount-Dreh weg. Es entsteht als Kopie
des letzten aus dem Archiv, liegt für die Dauer des Upgrades unter `ops/` und
zieht nach dem Lauf auf Production ebenfalls ins Archiv (Regel:
[archiv/skripte/README.md](../archiv/skripte/README.md)).

## 2.7.1 → 2.7.3

**Anlass:** das Sicherheits-Release 2.7.2 (2026-11-12) und das Wartungs-Release
2.7.3 (2026-11-17), Issue 369. Gelesen: `gh release view 2.7.2 -R
appwrite/appwrite`, `… 2.7.3`, der Quelltext beider Images gegeneinander
(`/usr/src/code/src` und `/app` aus `appwrite/appwrite:2.7.1` und `:2.7.3`
gezogen, 51 geänderte Dateien) und die Pull Requests #15277, #15470, #15280,
#15458, #15546, #15308, #15176. Die neuen SDKs (`node-appwrite` 31.3,
`appwrite` 29.3; Issues 352 und 353) senden das Antwortformat 2.7.2 — deshalb
kommt ERST der Server, dann die SDKs. `RESPONSE_FORMAT` in
`packages/core/server/utils/appwriteHealth.ts` bleibt bis dahin bei `2.6.2`.
Nachtrag 2026-11-20: beide SDKs sind gehoben (`node-appwrite` 31.3.0,
`appwrite` 29.3.1), `RESPONSE_FORMAT` steht auf `2.7.2`.

**Kein Schema, keine neuen Einstellungen.** Die Migrationsklasse bleibt V25
(`Migration.php` bekommt nur die zwei Versionszeilen). `migrate` läuft
trotzdem (Vorgabe des Herstellers) und meldet nur „already exists". Die `.env`
ändert sich in genau EINER Zeile (`_APP_VERSION`), die Schlüsselmenge bleibt.

### Images 2.7.1 → 2.7.3

`appwrite/appwrite` **2.7.3** (Basis-Image 2.2.12; PHP weiter 8.5.12), Console
`appwrite/new` 1.2.138 → **1.2.181-self-hosted** (kam mit 2.7.2),
`openruntimes/executor` 1.3.1 → **1.3.5** (kam mit 2.7.3). Unverändert:
browser 0.3.10, orchestrator 4.0.0, autogravity 0.0.11, exiftool 0.1.1, geo
0.3.2, embedding 0.3.1, mariadb 10.11, redis 7.4.7-alpine, traefik 3.6,
clickhouse 26.4.3-alpine.

**Compose-Diff:** das offizielle Compose (`docker-compose.yml` am Tag 2.7.1,
2.7.2, 2.7.3) unterscheidet sich in genau diesen zwei Image-Zeilen, und die
Datei, die das Werkzeug auf dev erzeugt hat, ebenso (`diff` alt/neu: zwei
Zeilen). Das offizielle Compose enthält daneben Dienste, die wir nicht fahren
(`appwrite/postgres`, `mongo`, `hansi`) — sie standen dort schon bei 2.7.1 und
kommen nicht hinzu.

### Was 2.7.2 für uns ändert — geprüft gegen den Code

- **Code-Bestätigungen zählen jetzt auch API-Schlüssel (#15277, #15470).**
  Appwrite zählt jetzt auf `POST /account/sessions/token`, `PUT
  /account/recovery`, `PUT /account/verification` und `PUT
  /account/mfa/challenges` jeden Aufrufer; bis 2.7.1 waren Aufrufe mit
  Schlüssel von jeder Bremse ausgenommen. Es gilt 10 je Konto (bei MFA: je
  Challenge) und Stunde. **Bei uns trifft das genau einen Aufruf:**
  `account.createSession` mit dem Admin-Client, in `otp/verify.post.ts` (Code
  aus der Mail) und `oauth/callback.get.ts` (Geheimnis des Anbieters, ein
  Versuch je Anmeldung). Rücksetzen, Bestätigen und der zweite Faktor laufen
  ohne Schlüssel (Gast- oder Sitzungs-Client) und wurden schon immer gezählt.
  **Gemessen auf dev (2.7.3, mit dem
  Laufzeit-Schlüssel):** zwölf falsche Codes für ein Wegwerf-Konto → zehnmal
  401, dann 429 `general_rate_limit_exceeded`; ein richtiger Code dazwischen
  setzt den Zähler zurück (6 falsche, 1 richtiger mit 201, danach wieder 10 ×
  401 vor dem 429). Unsere eigene Bremse (`accountAttempts.ts`, 10 Fehlversuche
  in 15 Minuten je Konto) greift bei derselben Zahl zuerst. **Neu ist der
  Rest der Stunde:** läuft unser Fenster nach 15 Minuten ab, lehnt Appwrite
  weiter ab, und `otp/verify.post.ts` macht aus jedem 4xx ein 401 „Invalid or
  expired code" — auch für den RICHTIGEN Code. Das ist strenger als vorher und
  gewollt (der Zähler schützt vor dem Durchprobieren von sechs Ziffern); die
  ehrlichere Meldung ist als Nacharbeit notiert (OPEN-ITEMS „AW30" b).
- **Bremsen je Konto und je Adresse gelten jetzt je Projekt (#15280).** Vorher
  teilten sich alle Projekte einer Instanz einen Zähler; zehn
  Passwort-Rücksetzungen für eine Adresse in `portfolio` sperrten dieselbe
  Adresse in `account`. Für uns nur besser, kein Code betroffen.
- **Buckets prüfen den Inhalt (#15458, #15546).** Hat ein Bucket
  `allowedFileExtensions` und trägt die Datei eine Bild- oder PDF-Endung, muss
  der Inhalt eines der ERLAUBTEN Formate sein, sonst 400
  `storage_file_type_unsupported` — auch mit Admin-Schlüssel. **Gemessen auf
  dev:** HTML als `probe.png` in den Profilbild-Bucket → abgelehnt; ein JPEG
  als `x.png` → 201 (der Bucket erlaubt `jpg`). Endungen ohne feste Kennung
  (`woff2`, `json`, `svg`) prüft Appwrite weiter nur am Namen. Alle unsere
  Upload-Routen prüfen die ersten Bytes selbst, bevor sie schreiben (Profilbild
  benennt nach dem erkannten Typ, Favicon ist immer PNG, Event-Cover und Medien
  nehmen nur JPEG, PNG und WebP, nach Endung UND Inhalt) — über unsere Routen
  kommt damit nichts an, was Appwrite jetzt zusätzlich ablehnte. **Ein
  E2E-Fall hing an der alten Lücke:**
  `avatar-storage.spec.ts` legte HTML als `probe.png` mit dem Admin-Schlüssel
  ab, um zu zeigen, dass die Auslieferung es nicht herausgibt. Das Ablegen
  scheitert jetzt; der Fall hält seitdem die Sperre selbst fest, die
  Auslieferung beweist weiter `packages/core/tests/storageRoutes.test.ts`.
- **Realtime: Konto-Ereignisse gehen an die ganze Nutzer-Id (#15308),
  Mitglieder-Ereignisse achten die Privatsphäre-Schalter (#15176), Sockets
  enden, wenn das Projekt-Team gelöscht wird (#15335).** Unsere Nutzer-Ids
  kommen aus `ID.unique()` und tragen keinen Punkt; die Sofort-Abmeldung über
  den `account`-Channel ist mit `session-revoke.spec.ts` (3 Fälle) gegen 2.7.3
  grün.
- **Bestätigungs-Token der E-Mail wird unter der Zeilensperre des Nutzers
  eingelöst (#15278).** `verification.put.ts` macht aus jedem Fehler dieser
  Route ein 400 „Invalid or expired verification link" — daran ändert sich
  nichts.
- **Ohne Bezug zu unserem Code** (per `grep` geprüft: kein `Messaging`-Dienst,
  kein GraphQL-Aufruf, kein Abo auf Team- oder Mitglieder-Channels):
  Push-Bilder und Nachrichten-Routen, Functions/Sites/VCS (keine fremden
  Deployments), GraphQL-Kosten, Projekt-Übergaben zwischen
  Organisationen, Rule-Domains an der Label-Grenze, Listen-Cache je Version.

### Ablauf dev (OrbStack) — gelaufen 2026-11-18

1. `docker pull appwrite/appwrite:2.7.3`. KEINE Patchdatei mehr (AW28).
2. Dump + Config-Tar im `appwrite/`-Ordner (Befehl wie in
   [APPWRITE-2-0-UPGRADE.md](APPWRITE-2-0-UPGRADE.md)):
   `backups/appwrite-dev-pre-2.7.3-<zeit>.sql.gz`. Die Schlusszeile „Dump
   completed" und die Zahl der `CREATE TABLE` prüfen.
3. Werkzeug im Elternverzeichnis, `--entrypoint="upgrade"`, `--interactive=N`
   → „Appwrite installed successfully".
4. `docker compose up -d --remove-orphans`, dann
   `docker compose exec -T appwrite migrate </dev/null` → „Migration
   completed".
5. Beweise (s. „Durchläufe").

Die lokale Instanz ist seit dem 2026-11-09 ein Spiegel der vier
Production-Projekte ([APPWRITE-PROD-SPIEGEL.md](APPWRITE-PROD-SPIEGEL.md)) —
ein Realtime-Handshake nennt deshalb `project=account` (oder `console`), nicht
mehr `reddit-comments`: der Handshake antwortet auch für ein unbekanntes
Projekt mit 101 und schließt erst danach mit 1008, die Wahrheit steht im Log
des Realtime-Containers (`realtime.success`). **Solange dev und Production
verschiedene Versionen fahren, bricht das Spiegel-Werkzeug ab** (es verlangt
dieselbe `_APP_VERSION` auf beiden Seiten) — ein neuer Spiegel geht erst
wieder nach dem Production-Lauf.

### CI (`ci/appwrite/`)

`ci.env`: `_APP_VERSION="2.7.3"`, keine neuen Schlüssel (Schlüsselmenge
weiter deckungsgleich mit der Dev-`.env` bis auf `_APP_OPENSSL_KEY_V1`).
Compose: die zwei Image-Zeilen (Console, Executor); die Image-Liste der
CI-Datei ist danach wortgleich mit der Dev-Datei. `docker compose config
--quiet` grün. Die CI installiert je Lauf FRISCH, ein `migrate` gibt es dort
nicht. Live-Beweis ist der E2E-Lauf auf dem Pull Request — er fährt auch die
zwei Fälle, die lokal Seed-Daten brauchen (s. „Durchläufe").

### Prod — Ablauf (gelaufen 2026-11-18 nach Davids „Ja, Production jetzt")

Skript [`appwrite-upgrade-2.7.3.sh`](../archiv/skripte/appwrite-upgrade-2.7.3.sh)
(seit dem Lauf im Archiv; während des Upgrades lag es unter `ops/`) — eine
Kopie des 2.7.1-Skripts, ohne Patchdatei, ohne Override-Dreh und ohne
Secret-Rotation. Vor dem Lauf einmal komplett gegen die Entwicklungs-Instanz
geprobt (`OLD=2.7.3 APPWRITE_DIR=…`, Exit 0, Werkzeug-Aufruf bis Beweise 30 s).

**Vorher:**

- [x] Davids Ja für diesen Lauf.
- [x] Nicht zwischen 03:20 und 04:15 UTC (nächtliches Backup; das Skript
      bricht ab, wenn es läuft) und nicht, während ein Ausliefern läuft.
      GEWARTET WURDE AUCH AUF EIN GEWÖHNLICHES AUSLIEFERN: dessen Probe liest
      `ok` aus `/api/health`, und das ist während des Ausfalls falsch — der
      Lauf endete sonst rot, ohne dass etwas fehlt.
- [x] `curl -s https://api.pukalani.app/v1/health/version` zeigt 2.7.1.
- [x] Das nächtliche Backup der letzten Nacht ist da (Wächter grün, kein
      offener Alarm). Das Skript zieht zusätzlich einen eigenen Dump.
- [x] Der Ausfall liegt nicht auf einem Halbstunden-Lauf des Wächters
      (gemessen starten sie um Minute 10 und Minute 35) — sonst öffnet
      er einen Alarm für einen gewollten Ausfall.

**Der Lauf** (das Protokoll bleibt auf dem Server):

```bash
scp ops/appwrite-upgrade-2.7.3.sh ploi@188.245.61.155:~/appwrite-upgrade-2.7.3.sh
```

```bash
ssh ploi@188.245.61.155 'nohup setsid bash ~/appwrite-upgrade-2.7.3.sh > ~/appwrite-upgrade-2.7.3.log 2>&1 < /dev/null &'
```

Gestartet wurde ABGEKOPPELT (`nohup setsid`), nicht wie zuerst geplant mit
`ssh -t … | tee`: reißt die Verbindung, endet ein Skript an der Leitung mitten
im Ausfall. Den Stand liest ein zweiter Aufruf aus dem Protokoll (`grep -E
'^== |ABBRUCH|^FERTIG'`).

Das Skript prüft die Vorbedingungen (`.env` auf 2.7.1, kein Patch-Mount,
Compose grün, `_APP_TRUSTED_PROXIES` gesetzt), zieht die drei Images und den
Dump OHNE Ausfall, wartet auf eine ruhige Stelle im Fünf-Minuten-Takt des
Realtime-Wächters (der würde `appwrite-realtime` mitten im Ausfall neu
erstellen), ruft das Werkzeug, fährt `up` und `migrate` und druckt die
Beweise — ohne `doctor`. Erwartetes Fenster: unter zwei Minuten (2.7.1 auf
Production: 99 s mit echter Migration; diesmal sind die Images vorgezogen und
`migrate` ändert nichts).

**Nach dem Lauf** (von außen):

- [x] `curl -s https://api.pukalani.app/v1/health/version` → `2.7.3`
- [x] `node scripts/ops/verify-health.mjs` (alle Hosts `ok:true`, `schema` ok),
      `node scripts/ops/verify-tls.mjs`, `node scripts/ops/verify-realtime.mjs --handshake`
- [x] `pnpm ops:schema-parity` unverändert
- [x] Anmelden, abmelden, erneut anmelden — 2026-11-19 auf
      `demo.pukalani.app` mit dem Konto des Betreibers in seinem Browser
      (Passwort und Code hat er selbst getippt): die bestehende Sitzung galt
      (`/api/auth/me` 200, auch auf `account.pukalani.app`; ob sie von vor dem
      Upgrade stammte, wurde nicht abgelesen); Abmelden führt auf `/login`,
      danach 401; die neue Sitzung trägt den Weg `email` mit dem Faktor
      `password`. Die Seite blieb 188 s offen: kein neuer Socket, kein
      `/api/auth/me`, nur der Presence-Takt (10 Heartbeats, 19 Lese-Aufrufe).
      Die Live-Verbindung mit dem Token der Sitzung meldet `connected` mit
      Konto, Ping und Pong laufen.
- [ ] Ein Kommentar und eine Stimme in einer Community — **nicht geklickt**:
      das wäre ein öffentlicher Beitrag auf der Demo und braucht ein eigenes Ja
      (OPEN-ITEMS „AW30" c)
- [x] Ein Profilbild hochladen (die neue Inhaltsprüfung des Buckets) —
      2026-11-19 über die Routen der Seite mit derselben Sitzung: Probe-Bild
      hoch (200, gespeichert als `avatar.png`), Abruf 200 `image/png`,
      Löschen 200, danach 404; HTML mit Bild-Typ 415. Bewusst NICHT über den
      Speichern-Knopf im Profil: der ersetzt das echte Profilbild und löscht
      die alte Datei.
- [x] OTP-Anmeldung mit einem echten Konto (Code-Bestätigung mit Schlüssel) —
      2026-11-19: Code angefordert, Mail kam, Sitzung mit dem Weg `token` und
      dem Faktor `email`
- [x] `ci.env`-Kommentar, `CLAUDE.md`, `README.md`, `docs/CONCEPT.md`,
      `docs/content/` (Setup, Übersicht, Hosts und Ports) und
      `docs/runbooks/DEPLOYMENT.md` auf „2.7.3 überall" gestellt; das Skript im
      Archiv; Issue 369 geschlossen. Danach die SDKs (Issues 352, 353)
- [x] Die Images der Vorgänger auf dem Server aufräumen (2.6.2 und 2.7.1) —
      gelöscht am 2026-11-20 nach dem Schritt auf 2.7.4 (Erledigt-Liste,
      „AW30 (d)").

**Rückweg:** `.env` + `docker-compose.yml` aus `*.<epoch>.backup` (legt das
Werkzeug an) oder aus dem Config-Tar zurück, `docker compose up -d
--remove-orphans`. `migrate` legt bei diesem Schritt nichts an — der Dump ist
die Sicherung, gebraucht wird er für den Rückweg voraussichtlich nicht. Nicht
geprüft: ob eine Sitzung oder ein Zähler, den 2.7.3 geschrieben hat, 2.7.1
stört (beide lesen dasselbe Schema).

### Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack, 2.7.1 → 2.7.3) | 2026-11-18 18:17–18:20 | 22,4 MB, 970 Tabellen | „Migration completed", 7,0 s (383 „already exists", 0 andere Fehlerzeilen) | Werkzeug 70 s (Image-Pulls für Console und Executor), `migrate` 8 s | Tabellen vorher gegen nachher (`information_schema`): **940 / 940, 0 verschwunden, 0 neu** · `.env`: nur `_APP_VERSION` · Compose: zwei Image-Zeilen · `health/version` 2.7.3 · PHP 8.5.12 · Executor 1.3.5 (`OPR_EXECUTOR_VERSION`), Secret in appwrite und Executor gleich · Console 1.2.181 (302) · 7 Container auf 2.7.3, keiner auf 2.7.1, alle Up · trustedIPs 2 + mqtt 2 · Realtime 101 für `account`, `admin`, `portfolio`, `branding`, im Log viermal `realtime.success true` · 0 Fehlerzeilen in API, Worker, Realtime · Skript-Probe 18:22–18:26 (Exit 0) · Unit: alle Pakete grün (core 4832, comments 320, darin `realtimeAuth` 14/14 und `server-writes-votes` 8/8), `pnpm -r typecheck` Exit 0 · **E2E `apps/comments` gegen den Worktree-Dev-Server: 29 von 31 Fällen grün** (ohne `themes-visual`; darunter Realtime 1/1, Session-Widerruf 3/3, Profilbild-Ablage 3/3 nach der Anpassung des einen Falls). Die zwei roten brauchen den Demo-Seed, den der Production-Spiegel nicht hat (`uma@demo.local` für den Embed-Login, Changelog „v1.7") — sie laufen in der CI. Die neun Bildvergleiche (`themes-visual`) waren lokal rot (rund 2 % abweichende Pixel in allen neun Themes) und sind in der CI ohnehin ausgeschaltet; ein Bezug zu Appwrite ist weder belegt noch ausgeschlossen · **Klick-Beweis mit zwei Browser-Sitzungen** (Wegwerf-Skript, zwei Wegwerf-Konten, danach gelöscht): Anmelden 200, Abmelden über das Menü 200 und `/api/auth/me` 401, erneut anmelden 200, Kommentar 201 erscheint in der zweiten Sitzung live, Stimme 200 zählt in der ersten Sitzung live auf 1, `docker restart appwrite-realtime` → beide Sitzungen öffnen neue Sockets, danach Kommentar und Stimme wieder live ohne Neuladen |
| prod (`api.pukalani.app`, 2.7.1 → 2.7.3) | 2026-11-18 22:24–22:26 | 22,3 MB, 970 Tabellen | „Migration completed", 12,6 s (383 „already exists", 0 andere Fehlerzeilen) | **45 s** vom Werkzeug-Aufruf (22:25:43) bis zu den Beweisen (22:26:28); Images und Dump davor ohne Ausfall (22:24:07–22:25:43) | Tabellen vorher gegen nachher: **940 / 940** · Compose-Diff genau zwei Image-Zeilen (Console 1.2.138 → 1.2.181, Executor 1.3.1 → 1.3.5) · Schlüsselmenge der `.env` unverändert · `health/version` 2.7.3 · PHP 8.5.12 · Executor 1.3.5, Secret in appwrite und Executor gleich · 7 Container auf 2.7.3, keiner auf einer anderen Version, alle Up · trustedIPs 2 + mqtt 2 · Patch-Mounts 0 · Realtime 101 lokal und von außen für `account`, `admin`, `portfolio`, `branding`; im Realtime-Log 60 gelungene Verbindungen in den ersten Minuten · 0 Fehlerzeilen in API, Worker, Realtime (beim Lauf und zehn Minuten danach) · von außen: `verify-health` 10 von 10 Hosts gesund (alle Apps `schema` ok), `verify-tls` grün, `verify-realtime --handshake` 101, `ops:schema-parity` alle vier Projekte spaltengleich · Platte 45 % → 56 % (drei neue Images neben den alten) · abgekoppelt gestartet (`nohup setsid`), vorher auf das Ende eines laufenden Ausliefern gewartet · **nicht geprüft:** Anmelden, Profilbild und OTP mit einem Konto auf Production |


## 2.7.3 → 2.7.4

**Anlass:** das Wartungs-Release 2.7.4 (2026-11-19). Es baut auf PHP 8.5.13
(vorher 8.5.12): mit 8.5.12 konnte ein Swoole-Worker durch einen Fehler im
OPcache jede `DateTime` ablehnen (`must be of type DateTime, DateTime given`),
bis er neu startete. Gelesen: `gh release view 2.7.4 -R appwrite/appwrite`,
der Vergleich der Tags (`gh api repos/appwrite/appwrite/compare/2.7.3...2.7.4`:
sechs Commits, sechs Dateien) und der Quelltext beider Images gegeneinander
(`/usr/src/code/src` und `/usr/src/code/app` aus `appwrite/appwrite:2.7.3` und
`:2.7.4` gezogen).

**Für unseren Code ändert sich nichts.** Der Quelltext der Images unterscheidet
sich in genau ZWEI Dateien und dort nur in Versionszeilen:
`app/init/constants.php` (`APP_VERSION_STABLE`) und
`src/Appwrite/Migration/Migration.php` (eine Zeile `'2.7.4' => 'V25'`). Kein
Schema, keine neue Einstellung, kein neuer Dienst, dasselbe Antwortformat.
`migrate` läuft trotzdem (Vorgabe des Herstellers) und meldet nur „already
exists". Die `.env` ändert sich in genau EINER Zeile (`_APP_VERSION`).

### Images 2.7.3 → 2.7.4

`appwrite/appwrite` **2.7.4** (Basis-Image 2.2.12 → **2.2.13**, PHP 8.5.12 →
**8.5.13**, Swoole weiter 6.2.5), `openruntimes/executor` 1.3.5 → **1.3.7**
(dieselbe PHP-Version; ein Runtime, der beim Start abstürzt, meldet das jetzt
sofort). Unverändert: Console `appwrite/new` 1.2.181-self-hosted, browser
0.3.10, orchestrator 4.0.0, autogravity 0.0.11, exiftool 0.1.1, geo 0.3.2,
embedding 0.3.1, mariadb 10.11, redis 7.4.7-alpine, traefik 3.6, clickhouse
26.4.3-alpine.

**Compose-Diff:** das offizielle Compose unterscheidet sich zwischen den Tags
in genau EINER Zeile (Executor), und die Datei, die das Werkzeug auf dev
erzeugt hat, ebenso (`diff` alt/neu: eine Zeile).

### Ablauf dev (OrbStack) — gelaufen 2026-11-20

Diesmal fährt dasselbe Skript wie auf Production auch den ersten Lauf auf dev
(vorher war es dort nur die Probe danach):

```bash
APPWRITE_DIR=~/Developer/orbstack/appwrite-maria/appwrite bash ops/appwrite-upgrade-2.7.4.sh
```

Vorher nachsehen, ob jemand die Instanz gerade benutzt (`lsof -nP -iTCP
-sTCP:LISTEN | grep node`, `docker logs --since 3m appwrite | grep http.uri`):
sie steht rund eine halbe Minute. Solange dev und Production verschiedene
Versionen fahren, bricht das Spiegel-Werkzeug ab (s. Abschnitt 2.7.1 → 2.7.3).

### CI (`ci/appwrite/`)

`ci.env`: `_APP_VERSION="2.7.4"`, keine neuen Schlüssel. Compose: die eine
Image-Zeile (Executor). `docker compose --env-file ci/appwrite/ci.env -f
ci/appwrite/docker-compose.yml config --quiet` grün. Live-Beweis ist der
E2E-Lauf auf dem Pull Request.

### Prod — Ablauf (gelaufen 2026-11-20 nach Davids „ja production jetzt")

Skript [`appwrite-upgrade-2.7.4.sh`](../archiv/skripte/appwrite-upgrade-2.7.4.sh)
(seit dem Lauf im Archiv; während des Upgrades lag es unter `ops/`) — eine
Kopie des 2.7.3-Skripts mit zwei statt drei
Images und einer Zeile mehr in den Beweisen: „Container ohne Neustart-Regel"
(Production: erwartet „keiner"; die Entwicklungs-Instanz nennt dort vier, ihre
Override trägt die Regel nicht).

**Vorher:**

- [x] Davids Ja für diesen Lauf.
- [x] Nicht zwischen 03:20 und 04:15 UTC (nächtliches Backup) und nicht,
      während ein Ausliefern läuft (auch ein gewöhnliches: seine Probe liest
      `ok` aus `/api/health`).
- [x] `curl -s https://api.pukalani.app/v1/health/version` zeigt 2.7.3.
- [x] Das nächtliche Backup der letzten Nacht ist da (Wächter grün, kein
      offener Alarm).
- [x] Der Ausfall liegt nicht auf einem Halbstunden-Lauf des Wächters (sie
      starten um Minute 10 und Minute 35) — der Lauf von 15:11 war fertig,
      bevor das Werkzeug um 15:15 begann.
- [x] Die Prüfungen des Pull Requests sind grün (der E2E-Lauf fährt eine
      frische 2.7.4).
- [x] `docker compose config` auf dem Server zeigt für JEDEN Dienst eine
      Neustart-Regel (seit dem 2026-11-20 trägt die Override `restart:
      unless-stopped` für `traefik`, `appwrite`, `redis`, `appwrite-browser`).

**Der Lauf** (abgekoppelt; das Protokoll bleibt auf dem Server):

```bash
scp ops/appwrite-upgrade-2.7.4.sh ploi@188.245.61.155:~/appwrite-upgrade-2.7.4.sh
```

```bash
ssh ploi@188.245.61.155 'nohup setsid bash ~/appwrite-upgrade-2.7.4.sh > ~/appwrite-upgrade-2.7.4.log 2>&1 < /dev/null &'
```

Den Stand liest ein zweiter Aufruf aus dem Protokoll (`grep -E '^==
|ABBRUCH|^FERTIG'`). Erwartetes Fenster: unter einer Minute (dev: 34 s; 2.7.3
auf Production: 45 s). Das Skript lag dabei noch unter `ops/` im Zweig des
Pull Requests.

**Nach dem Lauf** (von außen):

- [x] `curl -s https://api.pukalani.app/v1/health/version` → `2.7.4`
- [x] `node scripts/ops/verify-health.mjs` (alle zehn Hosts gesund, jede App
      mit Datenbank meldet ihren Stand vollständig), `node
      scripts/ops/verify-tls.mjs`, `node scripts/ops/verify-realtime.mjs
      --handshake` (101) — nach dem Upgrade und noch einmal nach dem Neustart
- [ ] `pnpm ops:schema-parity` — **nicht gefahren** (der Arbeitsbaum dieses
      Laufs hatte keine installierten Pakete). Stattdessen gelesen: Tabellen
      940 / 940 und der Datenbank-Stand je App in `/api/health`.
- [x] Ein Wächter-Lauf von Hand (`gh workflow run production-watch.yml`),
      kein offener Alarm
- [x] Die Images der Vorgänger 2.6.2 und 2.7.1 samt Begleitern sind am
      2026-11-20 gelöscht (Platte 66 % → 40 %; Erledigt-Liste, „AW30 (d)").
- [ ] Das Image 2.7.3 (und Executor 1.3.5) aufräumen, wenn 2.7.4 eine Weile
      ruhig lief — bis dahin ist es der Rückweg ohne neuen Abruf (OPEN-ITEMS
      „AW30" d).

**Rückweg:** wie bei 2.7.3 — `.env` + `docker-compose.yml` aus
`*.1795187724.backup` (legt das Werkzeug an) oder aus dem Config-Tar zurück,
`docker compose up -d --remove-orphans`.

### Beweis-Neustart (Neustart-Regel der Container)

**Wozu:** bis zum 2026-11-20 hatten `appwrite`, `appwrite-traefik`,
`appwrite-redis` und `appwrite-browser` keine Neustart-Regel. Nach jedem
Paket-Update, das Docker oder containerd anhebt, und nach jedem Neustart des
Servers blieben sie unten, bis jemand `docker compose up -d` fuhr
([PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md), § 4). Seit dem 2026-11-20 steht
die Regel in der Override (sie überlebt das Upgrade-Werkzeug). Ob danach
wirklich ALLES von selbst wiederkommt, zeigt nur ein Neustart — Davids
Entscheidung: im Fenster dieses Upgrades, nicht eigens davor.

**Ablauf** (nach dem Upgrade, mit demselben Ja):

1. `docker inspect` zeigt für jeden Container eine Regel (das Skript nennt in
   den Beweisen „Container ohne Neustart-Regel: keiner").
2. Server EINMAL neu starten: Ploi → Server → Verwalte → Allgemein → „Restart
   server". Nicht den Docker-Dienst neu starten.
3. NICHT eingreifen und mitschreiben: wann antwortet `/v1/health/version`
   wieder, wann gelingt der Realtime-Handshake (101), laufen alle Container?
   `appwrite-realtime` kann in einer Schleife hängen, wenn es vor Redis
   startet; der Wächter auf dem Server stellt es dann innerhalb von fünf
   Minuten selbst neu her — festhalten, ob das nötig war.
4. Kommt nach 90 Sekunden etwas nicht: das Handrezept (`cd /home/ploi/appwrite
   && docker compose up -d`, dann `docker restart appwrite-realtime`) und den
   Befund hier eintragen. Das Runbook § 4 bleibt dann, wie es ist.
5. Ist der Beweis grün: § 4 in PRODUKTIONS-ALARM.md anpassen (die Regel
   kommt aus der Override; das Handrezept bleibt als Rückfall).

**Ergebnis (2026-11-20, appwrite-prod): grün, ohne Eingriff.** Nach dem
Upgrade nannte das Skript „Container ohne Neustart-Regel: keiner". Neustart
über das Ploi-Panel; von außen mitgeschrieben:

| Zeit (UTC) | Beobachtung |
| --- | --- |
| 15:16:51 | letzter guter Abruf von `/v1/health/version` |
| 15:17:10 | keine Antwort mehr |
| 15:17:22 | der Server meldet seine neue Startzeit |
| 15:17:37 | 18 von 18 Containern laufen (erster SSH-Kontakt nach dem Start) |
| 15:17:45 | Realtime-Handshake 101; die API antwortet noch 404 (Traefik da, Appwrite startet) |
| 15:17:52 | API 200 und Handshake 101 — **42 s** nach dem ersten Ausfall-Abruf |

Kein Container wurde von Docker ein zweites Mal gestartet (alle
Neustart-Zähler 0), der Realtime-Wächter auf dem Server musste nicht
eingreifen, 0 Fehlerzeilen in API, Worker und Realtime, im Realtime-Log 82
gelungene Verbindungen in den ersten Minuten. `verify-health` und
`verify-realtime --handshake` danach grün. Zum Vergleich, am selben Tag VOR
der Regel: nach einem Neustart blieben vier Container unten, bis `docker
compose up -d` lief (55 s Ausfall mit einem Skript, das sofort eingriff).
**Nicht bewiesen:** dasselbe nach einem Paket-Update, das Docker oder
containerd anhebt (OPEN-ITEMS „AW30" e).

**Nach JEDEM späteren Appwrite-Upgrade:** die vier `restart`-Zeilen der
Override gegen das neue `docker-compose.yml` abgleichen (Dienstnamen) und die
Zeile „Container ohne Neustart-Regel" lesen.

### Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack, 2.7.3 → 2.7.4) | 2026-11-20 14:24–14:26 | 22,4 MB, 970 Tabellen | „Migration completed", 8,3 s (383 „already exists", 0 andere Fehlerzeilen) | **34 s** vom Werkzeug-Aufruf (14:25:22) bis zu den Beweisen; Images und Dump davor ohne Ausfall | Tabellen vorher gegen nachher: **940 / 940** · `.env`: nur `_APP_VERSION` · Compose: eine Image-Zeile (Executor) · `health/version` 2.7.4 · PHP 8.5.13 · Executor 1.3.7, Secret in appwrite und Executor gleich · Console weiter 1.2.181 · 7 Container auf 2.7.4, keiner auf 2.7.3, alle Up · trustedIPs 2 + mqtt 2 · Patch-Mounts 0 · Realtime 101 für `account`, `admin`, `portfolio`, `branding`, im Log zehnmal `realtime.success true` · 0 Fehlerzeilen in API, Worker, Realtime · „Container ohne Neustart-Regel" nennt auf dev die vier bekannten (die Override dort trägt die Regel nicht) · **nicht gefahren:** Unit-Tests und die E2E-Suite lokal — der Quelltext des Images unterscheidet sich nur in zwei Versionszeilen, den Live-Beweis führt der E2E-Lauf des Pull Requests gegen eine frische 2.7.4 |
| prod (`api.pukalani.app`, 2.7.3 → 2.7.4) | 2026-11-20 15:11–15:16 | 22,3 MB, 970 Tabellen | „Migration completed", 13,8 s (383 „already exists", 0 andere Fehlerzeilen) | **47 s** vom Werkzeug-Aufruf (15:15:23) bis zu den Beweisen (15:16:10); von außen fehlte die API von 15:15:29 bis 15:15:54 (rund 30 s). Images und Dump davor ohne Ausfall (15:11:21–15:11:48), dann das Warten auf die ruhige Stelle | Tabellen vorher gegen nachher: **940 / 940** · Compose-Diff genau eine Image-Zeile (Executor 1.3.5 → 1.3.7) · `health/version` 2.7.4 · PHP 8.5.13 · Executor 1.3.7, Secret in appwrite und Executor gleich · Console weiter 1.2.181 · 7 Container auf 2.7.4, keiner auf einer anderen Version, alle Up · trustedIPs 2 + mqtt 2 · Patch-Mounts 0 · Realtime 101 · 0 Fehlerzeilen in API, Worker, Realtime · **Container ohne Neustart-Regel: keiner** (die vier neu erstellten tragen sie aus der Override) · von außen: `verify-health` 10 von 10 Hosts gesund, `verify-tls` grün, `verify-realtime --handshake` 101 · Platte 60 % → 66 % (zwei neue Images neben den alten) · abgekoppelt gestartet (`nohup setsid`) · danach der Beweis-Neustart (oben): 42 s, alles von selbst · **nicht gefahren:** `ops:schema-parity`; **nicht geprüft:** Anmelden, Profilbild und OTP mit einem Konto auf Production (der Quelltext des Images unterscheidet sich von 2.7.3 nur in zwei Versionszeilen) |
