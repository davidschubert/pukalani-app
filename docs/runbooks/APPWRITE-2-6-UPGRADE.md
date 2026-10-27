# Runbook: Appwrite 2.0.0 / 2.2.0 → 2.6.1 → 2.6.2 (self-hosted, MariaDB)

Gilt für beide Instanzen: **dev** (`~/Developer/orbstack/appwrite-maria/`,
OrbStack, kam von 2.2.0) und **prod** (`ploi@188.245.61.155:~/appwrite/`,
`api.pukalani.app`, kommt von 2.0.0). Dev ist am 2026-10-23 nach genau diesem
Ablauf gelaufen; alles unten ist dort gemessen, nicht vermutet. Anlass: das
PHP-Notfall-Release vom 2026-10-21 (CVE-2026-109618 / CVE-2026-109619,
unauthentifizierte RCE in den PHP-Web-SAPIs). Appwrite nennt 2.6.1 selbst
„precautionary" — es spricht über Swoole, nicht über FPM/CGI — und bringt mit
`appwrite/base` 2.2.6 trotzdem **PHP 8.5.12**. Prod stand auf 2.0.0 mit
PHP 8.5.9, der Sprung auf 2.2 (AW22) wartete ohnehin auf Davids Freigabe.

Die Vorgänger gelten weiter und werden hier nicht wiederholt: Backup-Befehl,
Rückweg und die drei Fallen des Werkzeugs in
[APPWRITE-2-0-UPGRADE.md](APPWRITE-2-0-UPGRADE.md); Ein-Worker-Dienst
(`appwrite-worker`), Ein-Organisations-Limit und CI-Ableitung in
[APPWRITE-2-2-UPGRADE.md](APPWRITE-2-2-UPGRADE.md). Dieses Runbook nennt, was
in 2.3 bis 2.6.1 ANDERS ist — und was prod zusätzlich aus 2.1/2.2 nachholt.

## Was 2.3 – 2.6.1 mitbringen (für uns relevant)

- **Client-IP wird anders aufgelöst (2.4, `_APP_TRUSTED_PROXIES`).** Bisher
  nahm Appwrite das ERSTE Segment von `X-Forwarded-For`; jetzt gilt „der
  rechteste Eintrag, der KEIN vertrauter Proxy ist". Unsere Kette auf prod:
  Nuxt-Server (49.13.211.173) schreibt `XFF: <client>` → Traefik (vertraut der
  49.13.211.173) hängt sie an → Appwrite sieht `<client>, 49.13.211.173`. Mit
  dem Default (nur private Ranges) ist 49.13.211.173 „nicht vertraut" und wird
  zur Client-IP: **jede Session stünde wieder in „Deutschland" auf dem
  Web-Server** (der Vorfall vom 2026-08-22, nur von der anderen Seite). Auf dev
  gemessen: Kette `203.0.113.7, 49.13.211.173` ⇒ `ip: 49.13.211.173`; mit
  `49.13.211.173` in `_APP_TRUSTED_PROXIES` ⇒ `ip: 203.0.113.7`. Der Wert
  gehört deshalb VOR dem Werkzeug in die `.env` (das Werkzeug übernimmt
  gesetzte Werte, Beweis unten):
  `_APP_TRUSTED_PROXIES="127.0.0.1,::1,10.0.0.0/8,100.64.0.0/10,172.16.0.0/12,192.168.0.0/16,49.13.211.173"`.
- **MQTT-Broker (2.3): `appwrite-mqtt` + zwei Traefik-Ports 8883/8084.**
  Wir nutzen kein MQTT, und Docker-Ports umgehen die ufw — deshalb binden
  `_APP_MQTT_PORT="127.0.0.1:8883"` und `_APP_MQTT_WSS_PORT="127.0.0.1:8084"`
  die Ports an Loopback. Der Traefik-`command` in unserer Override ERSETZT die
  Basisliste und muss die zwei neuen Entrypoints
  (`--entrypoints.appwrite_mqtt.address=:8883`,
  `--entrypoints.appwrite_mqtt_ws.address=:8084`) spiegeln, sonst meldet
  Traefik die mqtt-Router als fehlerhaft.
- **Dev-Keys sind weg (2.3)** — wir hatten nie welche (Grep 0).
  `migrate` räumt die Collection und die Scopes. `_APP_CONSOLE_URL_SCHEME`
  entfällt, `_APP_CONSOLE_URL` kommt (leer lassen = wie bisher aus
  `_APP_DOMAIN`).
- **Ausgehende Anfragen prüfen die Zieladresse (2.4, SSRF-Schutz):** OAuth2-
  Provider, Webhooks, Avatar-Bilder dürfen nicht auf private Adressen zeigen
  (`_APP_ALLOWED_INTERNAL_ADDRESSES` für Ausnahmen). Bei uns: Google ist
  öffentlich, Appwrite-Webhooks haben wir keine, SMTP ist nicht betroffen
  (dev: Mailpit über `host.docker.internal` — Mail-Beweis unten grün).
  `appwrite-browser` bekommt ein eigenes Netz `browser` (nur öffentliche DNS).
- **Sessions-Routen brauchen `users.*`-Scope (2.4):** `sessions.*` allein
  reicht für `/v1/users/:id/sessions` nicht mehr. Unsere vier Runtime-Keys
  haben `users.write` (seit dem JWT-Umbau in 2.0 Pflicht) — kein Befund.
  API-Keys OHNE `users.write` bekommen leere Token-Secrets.
- **Realtime: Origin-Prüfung gilt jetzt auch für das `console`-Projekt (2.4).**
  Für Produkt-Projekte galt sie schon immer; prod hat je Projekt die Web-
  Plattformen (`*.pukalani.app`-Wildcard im `account`-Projekt, portfolio/
  admin/branding je Host). Geprüft in `_console_platforms` — nichts zu tun.
  Offene Sockets schließen jetzt mit 401, wenn die Session endet (passt zu
  unserer Sofort-Abmeldung).
- **Executor 0.29.0 → 1.1.2 (2.5).** Laufende Runtime-Container werden beim
  Start entfernt; wir führen keine Functions. **Der Executor 1.1.2 trägt
  weiterhin PHP 8.5.6** (`docker run --rm --entrypoint=php
  openruntimes/executor:1.1.2 -r 'echo PHP_VERSION;'`). Er ist nur im
  internen Netz `runtimes` erreichbar, spricht ebenfalls Swoole und ist für uns
  ohne Functions ohne Angriffsfläche — aber eben NICHT gepatcht; neueres Tag
  gibt es am 2026-10-23 nicht (Docker Hub: 1.1.2 ist `latest`).
- **Console 1.1.16 → 1.2.97-self-hosted:** Anmeldung an der self-hosted Console
  nur noch E-Mail + Passwort (2.5). Impersonation ist read-only (2.4).
- **ClickHouse (2.4/2.6):** das Werkzeug legt `clickhouse-config.xml` +
  `clickhouse-init.sh` ins `appwrite/`-Verzeichnis und mountet sie
  (Retention für `system.*`-Logs — upstreams Antwort auf genau unseren Vorfall
  vom 2026-09-28). Unsere `patches/clickhouse-logging.xml` (prod) bleibt
  zusätzlich drin: sie setzt auch den Datei-Logger auf `warning`; die beiden
  Dateien liegen in `config.d/` nebeneinander (`appwrite.xml`, `logging.xml`),
  kein Konflikt.
- **Neue Dienste:** `appwrite-mqtt`, `appwrite-exiftool` (Bild-Metadaten
  strippen, `_APP_EXIFTOOL_HOST` leer = aus; harte `depends_on` des
  `appwrite`-Dienstes wie autogravity), autogravity 0.0.11, orchestrator 2.2.4,
  geo 0.3.2, browser 0.3.6. Entfallen: `appwrite-assistant` (2.4) und
  `_APP_ASSISTANT_OPENAI_API_KEY`.
- **Neue `.env`-Schlüssel (17):** `_APP_ALLOWED_INTERNAL_ADDRESSES`,
  `_APP_CONSOLE_URL`, `_APP_DNS_EXTERNAL`, `_APP_EXIFTOOL_HOST`,
  `_APP_MAINTENANCE_INACTIVE_INTERVAL`, `_APP_MAINTENANCE_QUEUE_NAME`,
  `_APP_MQTT_*` (4), `_APP_PWNED_PASSWORDS_DSN`, `_APP_STORAGE_S3_PATH_STYLE`,
  `_APP_TRUSTED_PROXIES`, `_APP_VCS_ENTIRE_*` (4). Entfallen (2):
  `_APP_ASSISTANT_OPENAI_API_KEY`, `_APP_CONSOLE_URL_SCHEME`. Das Werkzeug
  schreibt beides selbst; eigene Werte bleiben (Diff dev: null Wertänderungen).
- **`keepAlive: true` steht weiterhin** in `registers.php`, jetzt Zeile
  **367** (392 Zeilen). 2.3 gibt jedem parallelen Versand eine eigene SMTP-
  Session, 2.6 wiederholt transiente SMTP-Fehler — den stillen Verlust nach
  Leerlauf (PHPMailer `false`, Worker loggt `success`) fixt davon nichts
  (PR #14544 pinnt nur die Urteile). **Der Patch bleibt Pflicht.**
- **Zertifikate (2.3/2.4) — trifft den Vorfall vom 2026-10-24:** eine per API
  verifizierte Domain wird vom Zertifikats-Worker nicht erneut geprüft (ein
  DNS-Schluckauf kippt die Regel nicht mehr auf `unverified`), Wiederholungen
  setzen den Versuchszähler zurück und hängende Ausstellungen werden neu
  eingereiht. Genau an dieser Stelle lief `api.pukalani.app` acht Tage
  abgelaufen (OPEN-ITEMS-COMPLETE, MON1). Nach dem Prod-Sprung deshalb
  zusätzlich prüfen: `openssl s_client -connect api.pukalani.app:443 </dev/null 2>/dev/null | openssl x509 -noout -enddate`
  und die Domain-Regel in der Console auf `verified`. Der Zertifikats-Worker
  ist seit 2.2 Teil des einen `appwrite-worker`.
- **Redis-Cache wechselt auf igbinary (2.3):** alte Einträge gelten als Miss
  und füllen sich nach — ein kurzer Schub Datenbankzugriffe nach dem Start,
  kein Befund. TRIFFT ABER DEN F19-BEWEIS (`verify-index-nudge.mjs`, CI-Schritt
  nach der Playwright-Suite): er vergiftete den Cache per `redis-cli` als
  JSON — seit 2.3 unlesbar, und das Dokument steckt in einem Umschlag
  (`data.document`). Die Vergiftung läuft jetzt als PHP im API-Container
  (igbinary + Redis-Erweiterung sind nur dort). Und: **seit 2.4 (#14104) liest
  der Index-Endpunkt bei nicht-`available` das Attribut-Dokument nach** — das
  Rennen, das `tableCacheNudge` absichert, ist upstream geschlossen; der Beweis
  prüft versionsbewusst (ab 2.4: vergifteter Cache darf NICHT mehr aufhalten),
  die Fabrik bleibt. Dev 9/9. Queue-Client 2.2 → 6.0: ein Rückweg auf 2.2.0 müsste die
  Worker erst leerlaufen lassen; unser Rückweg geht ohnehin über den Dump.
- **SDKs:** `node-appwrite` 29 und `appwrite` 27 bleiben (Response-Format
  `2.0.0` wird weiter bedient; Unit + E2E unten grün). Neuer wäre
  `node-appwrite` 31.0.0 (`updateEmail/updateSms/updatePush` haben seit 2.4
  eine andere Parameter-Reihenfolge — nutzen wir nicht). Kein Hub in diesem
  Vorhaben.

## 2.6.1 → 2.6.2 — Security-Release (erschienen 2026-10-24 13:41 UTC)

Appwrite hat 2.6.2 **fünf Stunden nach unserem Prod-Sprung** auf 2.6.1
veröffentlicht (prod 08:56–08:59 UTC). Es ist ein reines Härtungs-Release der
2.6-Linie: **kein Schema** (Migration V25 bleibt, `migrate` hat nichts zu tun),
dieselbe Topologie, dieselbe Override. Geprüft am 2026-10-27 gegen die
Release-Notes und den Quelltext (Tag `2.6.2`: `docker-compose.yml`,
`app/config/variables.php`, `Install.php`, `Auth/JobsSecret.php`).

**Was 2.6.2 bringt (für uns relevant):**

- **Basis-Image `appwrite/base` 2.2.7 — CVE-2026-111497 (Brotli):**
  `brotli-libs` 1.2.0-r1 → 1.2.1-r0 schließt einen Out-of-bounds-Write im
  Brotli-Decoder. Appwrites AUSGEHENDER HTTP-Client dekodiert `br`, wenn der
  Aufrufer kein `Accept-Encoding` setzt — und die Avatar-/Favicon-Endpunkte
  holen nutzergelieferte URLs genau so; Swoole linkt die Bibliothek ebenfalls.
  Das ist der Grund, das Release nicht liegen zu lassen. PHP bleibt laut
  Release-Notes **8.5.12** (das Skript druckt die Version aus dem Image).
- **Images:** Console `appwrite/new` 1.2.97 → **1.2.108-self-hosted**
  (DOMPurify-Fixes), `appwrite/browser` 0.3.6 → **0.3.8**,
  `ghcr.io/appwrite/exiftool` 0.1.0 → **0.1.1**. Unverändert: autogravity
  0.0.11, orchestrator 2.2.4, executor 1.1.2 (weiterhin PHP 8.5.6, s. oben),
  geo 0.3.2, mariadb 10.11, redis 7.4.7, traefik 3.6, clickhouse 26.4.3.
- **`_APP_JOBS_SECRET` darf nicht mehr leer oder `your-secret-key` sein** —
  `/v1/jobs/event` weist Signaturen damit ab (Function-Job-Callbacks). Das
  Werkzeug ersetzt einen unsicheren Wert selbst (`JobsSecret::resolve`
  erzeugt ein Token), eine selbst gepflegte `.env` braucht einen Zufallswert.
  Wir führen keine Functions; das Skript prüft vor UND nach dem Werkzeug.
  `doctor` meldet dazu 🔴/🟢 „unique secret key for jobs callbacks".
- **`_APP_MEMORY_LIMIT` (neu, Default `512M`):** PHP-Speichergrenze JEDES
  Appwrite-Prozesses (API, Realtime, Worker, Tasks). Das Werkzeug schreibt den
  Default in die `.env`, das Compose reicht ihn in jeden PHP-Dienst. Heben,
  „wenn ein Realtime-Container tausende Verbindungen hält" — nicht unser Maß.
  Im CI-Compose steht er in den sieben PHP-Diensten (`appwrite`, `-realtime`,
  `-mqtt`, `-worker`, drei `-task-*`), `ci.env` setzt `512M`.
- **Ausgehende Verbindungen:** Projekt-SMTP, Messaging-SMTP, Migrationsquellen
  und Zertifikatsprüfungen verweigern private/reservierte Adressen, außer sie
  stehen in `_APP_ALLOWED_INTERNAL_ADDRESSES`. **Betreiber-`_APP_SMTP_*` ist
  ausdrücklich NICHT betroffen** — dev (Mailpit über `host.docker.internal`)
  und prod (Cloud-SMTP) bleiben, wie sie sind.
- **API-Keys und JWTs:** Keys können keine Keys mit fremden Scopes oder
  längerer Laufzeit anlegen, JWTs verwalten keine Keys, Account-Keys gelten
  nur in der Console, ephemere Keys sind an ihr Projekt gebunden.
  `scripts/create-site.mjs` und `scripts/ci/appwrite-setup.mjs` legen
  Projekt-Keys mit einer **Console-SESSION** an — erlaubt. Unser JWT dient nur
  der Realtime (`ensureRealtimeJwt`), nie der Key-Verwaltung.
- **Realtime/GraphQL:** Realtime-Verbindungen durchlaufen dieselben
  Session-Prüfungen wie HTTP; Admin-Mode nur noch aus Console-Origins (wir
  setzen nirgends `X-Appwrite-Mode`, Grep 0). Realtime-Beweis bleibt der
  101-Handshake (`curl --http1.1`) und die E2E `realtime`-Spec.
- **Rate-Limits:** Token-Session-Versuche sind je KONTO begrenzt (OTP-Login);
  der Limit-Schlüssel ist jetzt der Routen-Pfad statt der Request-Host
  (unsere Pool-Hosts teilen sich damit je Client-IP einen Eimer — die IP
  kommt über `_APP_TRUSTED_PROXIES` korrekt an, s. oben). Avatar-/Favicon-
  Abrufe sind begrenzt und größengedeckelt (wir holen keine, Grep 0 außer
  `probe-key-scopes.mjs`). CI: `_APP_OPTIONS_ABUSE="disabled"`, unverändert.
- **Storage:** Dateinamen werden validiert, `Content-Disposition` folgt
  RFC 6266, unvollständige Uploads sind nicht lesbar — Medien-Uploads
  (`packages/media`) beweist die CI-E2E.
- **Compose-Diff 2.6.1 → 2.6.2 (upstream, 2000 Zeilen):** nur
  `_APP_MEMORY_LIMIT` in jedem PHP-Dienst, die drei Image-Tags, beim
  migrations-Worker `appwrite-imports`-Volume + `_APP_DNS*`/
  `_APP_ALLOWED_INTERNAL_ADDRESSES` (unser EIN `appwrite-worker` hat beides
  seit 2.6.1 als Vereinigung), `init: true` am Postgres-Dienst (nicht unserer).
  `registers.php` ist zu 2.6.1 **byte-gleich** (392 Zeilen, `keepAlive`
  Zeile 367) — die Patchdatei wird trotzdem je Version aus dem Image gezogen.

**Dev (OrbStack, `~/Developer/orbstack/appwrite-maria/`) — dieselben Schritte
wie oben, nur kürzer:** Images pullen (`appwrite/appwrite:2.6.2`,
`appwrite/new:1.2.108-self-hosted`, `appwrite/browser:0.3.8`,
`ghcr.io/appwrite/exiftool:0.1.1`), Patchdatei `registers-2.6.2-keepalive-off.php`
aus dem 2.6.2-Image (Zeile 367), in der Override NUR den Mount auf die neue
Patchdatei drehen (absoluter Pfad bleibt), Werkzeug 2.6.2 `--interactive=N`
im Elternverzeichnis, `docker compose up -d --remove-orphans`, `migrate`
(„Migration completed", nichts zu tun). Beweise: `health/version` → `2.6.2`,
`docker exec appwrite sh -c 'apk info -v brotli-libs'` → `brotli-libs-1.2.1-r0`,
PHP 8.5.12, `php -r 'echo ini_get("memory_limit");'` → `512M`, keepAlive 367
`false`, `doctor` 🟢 jobs, Mail-OTP über Mailpit, `pnpm -r test`, Playwright
`apps/comments`.

**Prod:** Skript [`ops/appwrite-upgrade-2.6.2.sh`](../../ops/appwrite-upgrade-2.6.2.sh)
(Aufruf im Kopf des Skripts: `scp` + `ssh -t … | tee ~/appwrite-upgrade-2.6.2.log`).
Es prüft die Vorbedingungen (`.env` auf 2.6.1, Override auf der 2.6.1-Patchdatei,
Trusted-Proxy-Eintrag), zieht Images und Patchdatei OHNE Downtime, dumpt,
dreht in der Override nur den Patch-Mount, prüft sie mit `docker compose
config --quiet` (gegen die 2.6.1-Basis jetzt GRÜN zu erwarten — sie kennt
`appwrite-worker`), ruft das Werkzeug, fährt `up`, `migrate`, Beweise. Fenster:
nur der Container-Neustart durch das Werkzeug — kein Migrationslauf, also
unter dem 71-s-Fenster von 2.6.1 zu erwarten. **Danach wie bei 2.6.1:** alle
zwölf Hosts `/api/health ok:true`, SSR-Seite mit Session 200, Realtime 101
(`--http1.1`), OTP-Mail nach Leerlauf, `node scripts/ops/verify-tls.mjs`,
`pnpm ops:schema-parity` (Soll unverändert). Rückweg: `.env` +
`docker-compose.yml` aus `*.<epoch>.backup`, Override-Mount zurück auf
`registers-2.6.1-keepalive-off.php`, `docker compose up -d --remove-orphans`
— der Dump liegt bereit, ist aber ohne Schema-Änderung nicht nötig.

**CI (`ci/appwrite/`):** `ci.env` `_APP_VERSION="2.6.2"` + `_APP_MEMORY_LIMIT`,
Compose: drei Image-Tags + `_APP_MEMORY_LIMIT` in den sieben PHP-Diensten —
exakt der Upstream-Diff, erneut von Hand auf die abgeleitete Datei übertragen
(das Rezept „Vorlage neu ableiten" gilt weiter, der Diff ist hier klein genug,
um ihn zu lesen). Live-Beweis ist der E2E-Lauf auf dem Zweig.

## Die Fallen des Werkzeugs in 2.6.1 — zwei alte kippen, eine neue kommt

1. **`--no-start` wird weiter ignoriert** (Falle 1 aus 2.0): das Werkzeug
   startet die Container selbst; Downtime beginnt mit dem Aufruf.
2. **Das Werkzeug lädt die Override jetzt MIT** (`Appwrite\Docker\Compose\Files`
   seit 2.5: `-f docker-compose.yml -f docker-compose.override.yml`). Falle 2
   aus 2.0 (Start OHNE Override) gibt es nicht mehr — dafür kippt Falle 3:
   die Override muss **VOR dem Werkzeug** stimmen (Patchdatei 2.6.1,
   Dienstname `appwrite-worker`, MQTT-Entrypoints), denn das Werkzeug fährt
   damit hoch. Das Werkzeug prüft sie vorher mit `docker compose config`.
3. **NEU: relative Mount-Pfade in der Override werden IM WERKZEUG-CONTAINER
   aufgelöst.** `./patches/registers-….php` wird zu
   `/usr/src/code/appwrite/patches/…` — ein Pfad, den der Docker-Daemon auf dem
   HOST nicht kennt. Docker legt dort ein leeres VERZEICHNIS an und der Worker
   stirbt mit „mount … not a directory: Are you trying to mount a directory
   onto a file"; `compose up` bricht ab, Traefik und Worker bleiben in
   `Created`, das Werkzeug meldet **„Failed to start containers"** (Dateien
   sind da schon geschrieben). Das Werkzeug selbst schreibt seine eigenen
   Mounts (`clickhouse-config.xml`) als ABSOLUTE Host-Pfade in die Basis —
   genau so gehört es auch in die Override: `/home/ploi/appwrite/patches/…`
   (prod) bzw. `/Users/…/appwrite-maria/appwrite/patches/…` (dev). Mit
   absoluten Pfaden läuft das Werkzeug in 20 s bis „Appwrite installed
   successfully" durch (dev, dritter Lauf). Ein Werkzeug-Lauf ist
   WIEDERHOLBAR (2.6.1 → 2.6.1 schreibt dieselben Dateien, legt ein weiteres
   `*.backup` ab) — scheitert er, Override korrigieren und erneut aufrufen
   oder direkt `docker compose up -d --remove-orphans`.

Und: `migrate` läuft NICHT automatisch (Flag `--migrate` ist false).

## Ablauf (dev, gelaufen am 2026-10-23)

- [x] **Backup** — Befehl aus dem 2.0-Runbook. Dev: 10,9 MB, 847 Tabellen,
  dazu das Config-Tar (`docker-compose.yml`, Override, `.env`, `patches/`).
- [x] **Patchdatei aus dem 2.6.1-Image ziehen** (auf dem jeweiligen Host,
  nicht kopieren):
  ```bash
  docker run --rm --entrypoint=cat appwrite/appwrite:2.6.1 /usr/src/code/app/init/registers.php > patches/registers-2.6.1.orig.php
  sed 's/keepAlive: true,/keepAlive: false,/' patches/registers-2.6.1.orig.php > patches/registers-2.6.1-keepalive-off.php
  diff patches/registers-2.6.1.orig.php patches/registers-2.6.1-keepalive-off.php   # genau Zeile 367
  ```
- [x] **Images vorziehen:** `appwrite/appwrite:2.6.1` (521 MB),
  `appwrite/new:1.2.97-self-hosted` (2 GB), `ghcr.io/appwrite/autogravity:0.0.11`,
  `ghcr.io/appwrite/exiftool:0.1.0`,
  `ghcr.io/open-runtimes/orchestrator/orchestrator:2.2.4`,
  `openruntimes/executor:1.1.2`, `appwrite/geo:0.3.2`, `appwrite/browser:0.3.6`.
  Unverändert: mariadb 10.11, redis 7.4.7-alpine, traefik 3.6,
  clickhouse 26.4.3-alpine. (Ein `docker pull` direkt nach dem OrbStack-Start
  bricht gern mit `EOF` ab — Liste danach gegen `docker images` prüfen.)
- [x] **`.env` vorbelegen** (das Werkzeug übernimmt gesetzte Werte — dev-Beweis:
  `_APP_MQTT_PORT="127.0.0.1:8883"` stand nach dem Lauf unverändert drin):
  ```bash
  printf '_APP_TRUSTED_PROXIES="127.0.0.1,::1,10.0.0.0/8,100.64.0.0/10,172.16.0.0/12,192.168.0.0/16,49.13.211.173"\n_APP_MQTT_PORT="127.0.0.1:8883"\n_APP_MQTT_WSS_PORT="127.0.0.1:8084"\n' >> .env
  ```
  (dev ohne `,49.13.211.173` möglich; steht dort trotzdem drin, damit die
  Konfiguration prod spiegelt — in dev ist die IP nie Peer.)
- [x] **Override VOR dem Werkzeug auf 2.6.1 ziehen** — vier Dinge: Patchdatei
  `registers-2.6.1-keepalive-off.php`, **absoluter Host-Pfad** am Mount,
  Dienstname `appwrite-worker` (prod kommt von 2.0 und hat noch
  `appwrite-worker-mails`), die zwei MQTT-Entrypoints im Traefik-`command`.
  Danach `docker compose config --quiet` (gegen die noch alte Basis: prüft
  nur die Syntax, der Dienstname `appwrite-worker` ist dort unbekannt und
  würde mit „has neither an image nor a build context" rot — DAS ist auf prod
  erwartet und kein Grund zur Umkehr, erst die neue Basis kennt ihn).
- [x] **Upgrade-Werkzeug** im ELTERN-Verzeichnis (das mit dem Ordner `appwrite/`):
  ```bash
  docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock \
    --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw \
    --entrypoint="upgrade" appwrite/appwrite:2.6.1 --interactive=N
  ```
  Erwartet: „Appwrite installed successfully" nach ~20 s (dev). Es schreibt
  `docker-compose.yml` + `.env` neu (Backups `*.<epoch>.backup`), legt
  `clickhouse-config.xml` + `clickhouse-init.sh` ab und startet den Stack MIT
  Override. Das `--publish 20080:20080` aus den Release-Notes gehört zum Web-
  Installer und ist mit `--interactive=N` nicht nötig.
- [x] **Eigenes `up` + Beweise der Override:**
  ```bash
  cd appwrite && docker compose up -d --remove-orphans      # idempotent, wenn das Werkzeug durch ist
  docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs   # 2
  docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c mqtt         # 2
  docker port appwrite-traefik | grep 88                                                                 # 127.0.0.1:8883 / :8084
  docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php                    # 367: false
  docker exec appwrite-clickhouse-1 ls /etc/clickhouse-server/config.d/                                  # appwrite.xml (+ logging.xml auf prod)
  ```
- [x] **Migration:** `docker compose exec -T appwrite migrate` → „Migration
  completed", dev in **13 s** (2.3: `devKeys` weg, `providerIdToken` +
  `passwordPwned`; 2.4: Passkeys/Profilfotos; 2.5: `interval`/`fingerprints`;
  2.6: Beschreibungen, `stripMetadata`, `presenceLogs` — je Projekt, also
  wächst die Zeit mit der Projektzahl: dev 5, prod 4 Projekte).
- [x] **Beweise dev:** `health/version` → `2.6.1` ·
  `docker exec appwrite php -r 'echo PHP_VERSION;'` → **8.5.12** (Swoole 6.2.3) ·
  `health`, `health/db` (Console.DB + Projects.DB), `health/cache`,
  `health/storage`, `health/time` (diff 0) je `pass` · `users?limit=1` → 85,
  `tablesdb/main/tables` → 55 (Bestände unverändert) · Console `/console` → 302
  · Realtime-Handshake `HTTP/1.1 101` · **Mail-Beweis:** E-Mail-OTP an eine
  Probe-Adresse → Mailpit „OTP for reddit-comments Login", Worker
  `mail.template otp · mail.status success` (Probe-Nutzer danach gelöscht) ·
  **XFF-Beweis** wie oben (anonyme Sessions, danach gelöscht) ·
  `pnpm -r test` grün (alle Pakete) · Playwright `apps/comments`: **16 bestanden**
  (smoke, auth-guard, auth-layout, embed, embed-write, realtime), die 9 Fälle von
  `themes-visual` rot — ein Vorbefund, kein Appwrite-Befund: die macOS-
  Baselines stammen vom 2026-08-06, seither hat sich die Container-Breite
  (Davids Tailwind-Original-Maße, 2026-08-20) und die Navigation geändert, das
  Diff-Bild zeigt die ganze Seite horizontal verschoben; die CI überspringt
  diese neun ohnehin (Linux). Worktree-Falle dabei: ohne den Symlink für
  `/engine-oniguruma` antwortet jede Seite 500, und Playwrights
  `webServer` läuft in die 120-s-Grenze — Server vorher selbst starten.

## CI (`ci/appwrite/`) — erneut abgeleitet

Rezept aus dem 2.2-Runbook, Probe zuerst: die Ableitung auf das ALTE Dev-
Compose (2.2.0, `docker-compose.yml.1792818054.backup`) angewandt reproduziert
die committete Datei exakt — mit einer FÜNFTEN Abweichung, die im Dateikopf
fehlte: der `doctor`-Hinweis am `appwrite`-Healthcheck (zwei Kommentarzeilen).
Dann dieselbe Ableitung auf das neue Compose: 1012 Zeilen (vorher 903), neues
Netz `browser` → `browser-ci`. `ci.env`: `_APP_VERSION="2.6.1"`, zwei Schlüssel
raus, 17 rein (Schlüsselmenge deckungsgleich mit der Dev-`.env` bis auf
`_APP_OPENSSL_KEY_V1`); MQTT auf `127.0.0.1:18883` / `:18084`, damit der
CI-Stack weiter neben der Dev-Instanz laufen kann (die hält 8883/8084). Die
Dienstliste in `e2e.yml` bleibt — `appwrite-exiftool` startet als `depends_on`
von `appwrite` mit, wie autogravity. `docker compose config` grün; der
Live-Beweis ist der E2E-Lauf der CI auf dem PR.

## Prod — Ablauf (nach Davids Freigabe)

Kommt von **2.0.0**, holt also 2.1/2.2 mit nach (ein Worker, eine
Organisation — `create-site` kann das seit 0506d121) UND 2.3–2.6.1. Fenster
ohne Deploy, Seiten mit Session antworten 5xx (`/api/health` bleibt 200).
Dev brauchte vom Werkzeug-Aufruf bis „Migration completed" unter zwei Minuten
mit vorgezogenen Images; prod hat 4 Projekte, 22 MB Dump (2026-09-08),
42 GB frei, 7,6 GB RAM (28 Container heute, 18 danach).

1. **Vorziehen (ohne Downtime):** Images pullen (~5 GB), Patchdatei
   `registers-2.6.1-keepalive-off.php` aus dem Image auf dem Prod-Host
   erzeugen (Zeile 367).
2. **Backup:** Dump + Config-Tar wie 2.0 (`MYSQL_ROOT_PASSWORD`, nicht
   `MARIADB_…`; Tabellenzahl > 100 prüfen). Der nächtliche
   `~/ops/appwrite-backup.sh` (03:30, Offsite StorageBox) läuft davon
   unabhängig weiter — er spricht `mariadb`/Volumes an, keine Worker-Namen.
3. **`.env` vorbelegen:** `_APP_TRUSTED_PROXIES` MIT `49.13.211.173`,
   `_APP_MQTT_PORT="127.0.0.1:8883"`, `_APP_MQTT_WSS_PORT="127.0.0.1:8084"`.
   Ports 8883/8084 sind auf prod frei (`ss -tln`, 2026-10-23).
4. **Override umschreiben** (prod-Fassung: drei Blöcke — SMTP-Patch, Traefik-
   XFF mit `49.13.211.173/32`, ClickHouse-Logging): `appwrite-worker-mails:` →
   `appwrite-worker:`, Patchdatei 2.6.1, **beide** Mounts (`registers`,
   `clickhouse-logging.xml`) auf `/home/ploi/appwrite/patches/…`, die zwei
   MQTT-Entrypoints in den Traefik-`command`. NICHT früher als unmittelbar vor
   dem Werkzeug: die laufende 2.0-Instanz würde bei einem Container-Neustart
   die 2.6.1-Patchdatei in das 2.0-Image mounten.
5. **Werkzeug** (`--interactive=N`, Elternverzeichnis `~`), dann
   `cd ~/appwrite && docker compose up -d --remove-orphans`, dann `migrate`.
6. **Beweise:** `docker exec appwrite php -r 'echo PHP_VERSION;'` → 8.5.12 ·
   `curl -s https://api.pukalani.app/v1/health/version` → 2.6.1 · mit Projekt-
   Key je Projekt (account, admin, portfolio, branding) `health/db`,
   `health/cache`, `health/storage` → `pass` · `docker ps`: genau EIN
   `appwrite-worker`, kein `appwrite-worker-*`, `appwrite-mqtt` healthy,
   `appwrite-exiftool` healthy, kein `appwrite-assistant` · Override-Beweise
   wie dev (trustedIPs 2, mqtt 2, Ports auf 127.0.0.1, keepAlive 367 false,
   `config.d/` mit `appwrite.xml` UND `logging.xml`) · alle Pukalani-Hosts
   `/api/health ok:true` und eine SSR-Seite mit Session 200 · Realtime-
   Handshake 101 (der Watchdog `~/ops/realtime-watchdog.sh` prüft das alle
   5 min selbst) · **Mail-Beweis:** OTP-Anmeldung auf `account.pukalani.app`
   (erste Instanz-Mail nach Leerlauf = der KeepAlive-Fall) · **Standort-
   Beweis:** Sessions-Seite zeigt den eigenen Ort, nicht „Deutschland/Falkenstein"
   · `pnpm ops:schema-parity` (vier Prod-Projekte) · `node scripts/ops/verify-tls.mjs`.
**Nachweise prod (2026-10-24, lesend gegengeprüft):** `_APP_VERSION` 2.6.1 ·
`docker exec appwrite php -r …` → **8.5.12** · `health/version` 2.6.1 · 18 Container
Up (mqtt/exiftool/autogravity/geo/clickhouse/console/exc1 healthy), kein
`appwrite-worker-*`, kein `appwrite-assistant` · Override: Mount absolut,
keepAlive 367 false, trustedIPs 2 + mqtt 2, 8883/8084 auf 127.0.0.1,
`config.d/` mit `appwrite.xml` + `logging.xml` · `_APP_TRUSTED_PROXIES` mit
49.13.211.173 · `health/db`, `/cache`, `/storage` je Projekt `pass` (Elternsitzung)
· **alle zwölf Hosts** `/api/health ok:true` (Build 79cdcdbc), SSR demo/
branding.supply 200, account 302 → Login · Zertifikat `api.pukalani.app` bis
2027-01-22 · Realtime-Handshake 101 — **nur mit `curl --http1.1`**: über HTTP/2
antwortet Swoole mit 400, das ist kein Befund (der Watchdog spricht HTTP/1.1) ·
`node scripts/ops/verify-tls.mjs` 6/6 · `pnpm ops:schema-parity` 69/42/41/39
Soll-Tabellen, Spalten deckungsgleich · Worker: 0 Fehler nach dem Start-Rauschen,
stats-usage verarbeitet (396 Jobs in 4 min) · **Mail-Beweis** (Elternsitzung,
2026-10-24 10:35 UTC): OTP-Login über Davids Chrome auf `account.pukalani.app`
— Token in `_10_tokens` 10:35:11, Worker `worker.v1-mails` template otp,
smtp_type cloud, `mail.status success` in 1,61 s, Mail 10:35:13 in Davids
Postfach („Account Anmeldung", noreply@pukalani.app) — die ERSTE Instanz-Mail
nach Leerlauf, also genau der KeepAlive-Fall · **Standort-Beweis**
(Elternsitzung): Session 10:38:40 mit `ip` 72.234.42.6 (Davids Mac, US),
NICHT 49.13.211.173 — der Trusted-Proxy-Eintrag wirkt; `/de/settings/sessions`
(SSR mit Session, 200) zeigt „Pukalani, Hawaii · Vereinigte Staaten" für die
Google-Sitzung von 10:44:48 (factors email, oauth2). Diese beiden Beweise hat
die Elternsitzung erbracht; ein eigenes Nachlesen der Sessions-Tabelle hat der
Auto-Modus dieser Sitzung abgelehnt.

**Nebenbefund, NICHT vom Upgrade (2026-10-24):** Davids Konto hat `mfa=1`
(TOTP seit 2026-09-08); eine OTP-Session trägt nur `factors ["email"]`,
Appwrite antwortet auf `account.get` mit „More factors are required…" und der
SSR-Guard leitet auf `/de/login`. `server/api/auth/otp/verify.post.ts` und
`OtpLoginForm.vue` haben keine MFA-Weiche (anders als `login.post.ts` /
`LoginForm.vue` seit 52f98760). Liegt als Karte bei David — hier nur der
Hinweis, keine Reparatur in diesem Vorhaben.

7. **Aufräumen** erst nach einer stabilen Woche: alte Images
   (`appwrite/appwrite:1.9.5/1.9.6/2.0.0`, `appwrite/new:1.1.16`,
   `appwrite/console:*`, `openruntimes/executor:0.25.*/0.29.0`,
   `orchestrator:1.9.2`, `appwrite/embedding:0.3.1`), `*.backup`-Dateien
   behalten.

## Rückweg

`.env` und `docker-compose.yml` aus `*.<epoch>.backup` zurück
(`_APP_VERSION` der alten Version), Override auf die alte Patchdatei und den
alten Dienstnamen (prod: `appwrite-worker-mails`, relativer Pfad ist dann wieder
in Ordnung, weil nur noch unser eigenes `up` sie liest), `docker compose up -d
--remove-orphans`, Dump zurückspielen (`mariadb < dump.sql` im mariadb-
Container). Die Migration ist nicht rückwärts lauffähig — der Dump IST der
Rückweg. Das Werkzeug lässt Waisen (`appwrite-assistant`, 14 alte Worker)
selbst verschwinden (`--remove-orphans`); beim Rückweg legt das alte Compose
sie wieder an.

## Durchläufe

| Instanz | Datum (UTC) | Dump | Migration | Fenster | Besonderheiten |
| --- | --- | --- | --- | --- | --- |
| dev (OrbStack, von 2.2.0) | 2026-10-24 ~05:00 | 10,9 MB, 847 Tabellen | „Migration completed", 13 s | Werkzeug 19 s (Abbruch) + `up` + 20 s (Gegenprobe) | relativer Mount-Pfad ⇒ „Failed to start containers"; mit absolutem Pfad 20 s sauber durch; Unit grün, E2E 16/16 funktional grün (themes-visual: Baselines veraltet) |
| prod (`api.pukalani.app`, von 2.0.0) | 2026-10-24 08:56–08:59 | 22,2 MB, 800 Tabellen | „Migration completed", 16,6 s (gelbe „already exists"-Warnungen je Projekt, 0 Fehler) | Werkzeug 38 s „installed successfully", Werkzeug-Aufruf bis Beweise **71 s** | Skript `ops/appwrite-upgrade-2.6.sh` (Lauf durch die Elternsitzung nach Davids „ja, jetzt"; Log `~/appwrite-upgrade-2.6.log`); Start-Rauschen: 36× „Usage schema is not ready" im stats-usage-Worker in den ersten 4 s, danach 0 |
| CI (`ci/appwrite/`, 2.6.1 → 2.6.2) | 2026-10-27 | — | — | — | Compose/`ci.env` auf 2.6.2 (drei Image-Tags, `_APP_MEMORY_LIMIT`); Beweis = E2E-Lauf des Zweigs `claude/appwrite-2-6-2-security` |

2.6.2 auf **dev** und **prod** steht am 2026-10-27 noch aus (braucht Davids
Terminal: dev-Schritte oben, prod über `ops/appwrite-upgrade-2.6.2.sh`) — die
Zeilen hier nach dem Lauf mit den gemessenen Werten ergänzen.
