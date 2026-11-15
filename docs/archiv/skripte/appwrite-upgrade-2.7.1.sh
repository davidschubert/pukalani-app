#!/usr/bin/env bash
# Appwrite 2.6.2 -> 2.7.1 (2.7.0 vom 2026-11-03 + Security-Release 2.7.1 vom 2026-11-04) auf appwrite-prod.
# Ablauf = docs/runbooks/APPWRITE-2-7-UPGRADE.md, Abschnitt "2.6.2 -> 2.7.1" (maui-monorepo).
# Aufruf (von Davids Terminal, nach Freigabe):
#   scp ops/appwrite-upgrade-2.7.1.sh ploi@188.245.61.155:~/appwrite-upgrade-2.7.1.sh
#   ssh -t ploi@188.245.61.155 'bash ~/appwrite-upgrade-2.7.1.sh 2>&1 | tee ~/appwrite-upgrade-2.7.1.log'
# Mit Rotation von _APP_EXECUTOR_SECRET (Davids Entscheidung, s. Runbook — kostet KEINE extra Downtime, weil
# der neue Wert VOR dem Werkzeug in der .env steht und das Werkzeug gesetzte Werte uebernimmt):
#   ssh -t ploi@188.245.61.155 'ROTATE_EXECUTOR_SECRET=1 bash ~/appwrite-upgrade-2.7.1.sh 2>&1 | tee ~/appwrite-upgrade-2.7.1.log'
# Schritt 0/1 (Images, Patchdatei, Dump) laufen OHNE Downtime; die Downtime beginnt mit dem Werkzeug in
# Schritt 4 (es startet die Container selbst, --no-start wird weiter ignoriert). 2.7.0 BRAUCHT `migrate`
# (V25 bekommt neue Schritte: Attribute, Indizes, die Collections transfers/monitors/monitorAlerts/reviews);
# 2.7.1 tauscht nur Images (Executor 1.1.2 -> 1.3.1). Die Override behaelt Dienstname, absolute Pfade und
# MQTT-Entrypoints — neu ist nur die Patchdatei aus dem 2.7.1-Image (registers.php hat sich geaendert:
# Redis-Timeouts, keepAlive steht jetzt in Zeile 372 statt 367).
# BEWUSST KEIN `doctor` (sendet eine SMTP-Testmail) — Health nur ueber /v1/health/version.
set -euo pipefail
OLD=2.6.2
NEW=2.7.1
IMAGES="appwrite/appwrite:$NEW appwrite/new:1.2.138-self-hosted appwrite/browser:0.3.10 openruntimes/executor:1.3.1 ghcr.io/open-runtimes/orchestrator/orchestrator:4.0.0"
cd ~/appwrite
TS=$(date +%Y%m%d-%H%M)
mkdir -p ../backups
echo "== [0/7] Vorbedingungen + Images vorziehen + Patchdatei (ohne Downtime) $(date -u +%T)"
grep -q "^_APP_VERSION=\"$OLD\"" .env || { echo "ABBRUCH: .env steht nicht auf $OLD"; exit 1; }
grep -q "registers-$OLD-keepalive-off.php" docker-compose.override.yml || { echo "ABBRUCH: Override zeigt nicht auf die $OLD-Patchdatei"; exit 1; }
grep -q '^_APP_TRUSTED_PROXIES=.*49\.13\.211\.173' .env || { echo "ABBRUCH: _APP_TRUSTED_PROXIES ohne Nuxt-Server"; exit 1; }
echo "   Platte vorher: $(df -h / | awk 'NR==2{print $5" belegt, "$4" frei"}')"
for i in $IMAGES; do docker pull -q "$i"; done
echo "   PHP im $NEW-Image: $(docker run --rm --entrypoint=php appwrite/appwrite:$NEW -r 'echo PHP_VERSION;')"
docker run --rm --entrypoint=cat appwrite/appwrite:$NEW /usr/src/code/app/init/registers.php > patches/registers-$NEW.orig.php
sed 's/keepAlive: true,/keepAlive: false,/' patches/registers-$NEW.orig.php > patches/registers-$NEW-keepalive-off.php
diff patches/registers-$NEW.orig.php patches/registers-$NEW-keepalive-off.php || true   # erwartet: genau Zeile 372
CHANGED=$(diff patches/registers-$NEW.orig.php patches/registers-$NEW-keepalive-off.php | grep -c '^[<>]' || true)
[ "$CHANGED" = "2" ] || { echo "ABBRUCH: Patch aendert nicht genau EINE Zeile ($CHANGED Diff-Zeilen) — registers.php im $NEW-Image pruefen"; exit 1; }
grep -q "keepAlive: false" patches/registers-$NEW-keepalive-off.php || { echo "ABBRUCH: Patchdatei ohne keepAlive:false"; exit 1; }
echo "== [1/7] Dump + Config-Backup ($TS) $(date -u +%T)"
docker exec appwrite-mariadb sh -c 'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --all-databases' | gzip > ../backups/appwrite-prod-pre-$NEW-$TS.sql.gz
TABLES=$(gzip -dc ../backups/appwrite-prod-pre-$NEW-$TS.sql.gz | grep -c "^CREATE TABLE" || true)
SIZE=$(stat -c %s ../backups/appwrite-prod-pre-$NEW-$TS.sql.gz)
echo "   Dump: $SIZE Bytes, $TABLES Tabellen"
if [ "$TABLES" -lt 100 ]; then echo "ABBRUCH: Dump zu klein"; exit 1; fi
tar czf ../backups/appwrite-prod-config-pre-$NEW-$TS.tgz docker-compose.yml docker-compose.override.yml .env patches
for i in $IMAGES; do docker image inspect "$i" >/dev/null || { echo "ABBRUCH: Image $i nicht gepullt"; exit 1; }; done
echo "== [2/7] .env pruefen (optional: _APP_EXECUTOR_SECRET rotieren)"
if [ "${ROTATE_EXECUTOR_SECRET:-0}" = "1" ]; then
  NEWSECRET=$(openssl rand -hex 32)
  sed -i "s|^_APP_EXECUTOR_SECRET=.*|_APP_EXECUTOR_SECRET=\"$NEWSECRET\"|" .env
  grep -q "^_APP_EXECUTOR_SECRET=\"$NEWSECRET\"" .env || { echo "ABBRUCH: Executor-Secret nicht geschrieben"; exit 1; }
  echo "   _APP_EXECUTOR_SECRET rotiert (neuer Wert nur in .env; der alte liegt im Config-Tar von Schritt 1)"
else
  echo "   _APP_EXECUTOR_SECRET bleibt (ROTATE_EXECUTOR_SECRET=1 rotiert)"
fi
grep -qE '^_APP_JOBS_SECRET=("?)(your-secret-key)?\1$' .env && { echo "ABBRUCH: _APP_JOBS_SECRET leer/Platzhalter (seit 2.6.2 Pflicht)"; exit 1; } || true
echo "== [3/7] Override auf $NEW (nur die Patchdatei wechselt) $(date -u +%T)"
cp docker-compose.override.yml docker-compose.override.yml.bak-$OLD-$TS
sed -i "s#/home/ploi/appwrite/patches/registers-$OLD-keepalive-off\.php:#/home/ploi/appwrite/patches/registers-$NEW-keepalive-off.php:#" docker-compose.override.yml
sed -i "1s|fuer $OLD)|fuer $OLD, $(date +%F) fuer $NEW)|" docker-compose.override.yml
grep -q "/home/ploi/appwrite/patches/registers-$NEW-keepalive-off.php:" docker-compose.override.yml || { echo "ABBRUCH: Override-Mount nicht auf $NEW"; exit 1; }
grep -n "registers-\|clickhouse-logging\|appwrite_mqtt" docker-compose.override.yml
docker compose config --quiet || { echo "ABBRUCH: Override gegen die $OLD-Basis rot"; exit 1; }
echo "== [4/7] Upgrade-Werkzeug $NEW (startet MIT Override, Downtime beginnt) $(date -u +%T)"
cd ~
docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw --entrypoint="upgrade" appwrite/appwrite:$NEW --interactive=N || echo "WERKZEUG rot — eigenes up folgt"
cd ~/appwrite
grep -q "^_APP_VERSION=\"$NEW\"" .env || { echo "ABBRUCH: .env nicht auf $NEW"; exit 1; }
grep -E '^_APP_(TRUSTED_PROXIES|MQTT_PORT|MQTT_WSS_PORT|MEMORY_LIMIT|OPENSSL_KEY_CURRENT|OPENSSL_KEY_OLDEST|LIMIT_REALTIME_[A-Z]+)=' .env
if [ "${ROTATE_EXECUTOR_SECRET:-0}" = "1" ]; then grep -q "^_APP_EXECUTOR_SECRET=\"$NEWSECRET\"" .env || { echo "ABBRUCH: Werkzeug hat das rotierte Executor-Secret ueberschrieben"; exit 1; }; fi
echo "== [5/7] Eigenes up -d $(date -u +%T)"
docker compose up -d --remove-orphans
echo "== [6/7] Migration (2.7.0 hat NEUE V25-Schritte — dev 9,2 s, 334 'already exists', 0 Fehler) $(date -u +%T)"
MIG=$(docker compose exec -T appwrite migrate 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$MIG" | grep -E 'Migration completed|task\.migrate' || { echo "$MIG" | tail -15; echo "ABBRUCH: migrate ohne 'Migration completed'"; exit 1; }
echo "   already-exists-Warnungen: $(echo "$MIG" | grep -c 'already exists')   andere Fehlerzeilen: $(echo "$MIG" | grep -ci 'error\|exception' || true)"
echo "== [7/7] Beweise $(date -u +%T)"
echo "   trustedIPs: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs)  mqtt-Entrypoints: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c mqtt)"
echo "   Ports: $(docker port appwrite-traefik | tr '\n' ' ')"
echo "   keepAlive: $(docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php)"
echo "   clickhouse config.d: $(docker exec appwrite-clickhouse-1 ls /etc/clickhouse-server/config.d/ | tr '\n' ' ')"
echo "   PHP: $(docker exec appwrite php -r 'echo PHP_VERSION;')   Brotli: $(docker exec appwrite sh -c 'apk info -v | grep ^brotli-libs')"
echo "   memory_limit-Env: $(docker exec appwrite-realtime sh -c 'echo $_APP_MEMORY_LIMIT')   Realtime-Limits: $(docker exec appwrite-realtime sh -c 'echo $_APP_LIMIT_REALTIME_SUBSCRIPTIONS/$_APP_LIMIT_REALTIME_CHANNELS/$_APP_LIMIT_REALTIME_QUERIES')"
EXEC=$(docker ps --format '{{.Names}}' | grep -E '^exc[0-9]+$' | head -1)
echo "   Executor: $(docker exec "$EXEC" sh -c 'echo $OPR_EXECUTOR_VERSION')   Secret gleich in appwrite+executor: $([ "$(docker exec appwrite sh -c 'echo $_APP_EXECUTOR_SECRET')" = "$(docker exec "$EXEC" sh -c 'echo $OPR_EXECUTOR_SECRET')" ] && echo ja || echo NEIN)"
echo "   Version: $(curl -s -m 10 http://localhost/v1/health/version)"
echo "   Container $NEW: $(docker ps --format '{{.Image}}' | grep -c "appwrite:$NEW")  noch auf $OLD: $(docker ps --format '{{.Image}}' | grep -c "appwrite:$OLD" || true)  Console: $(docker ps --format '{{.Image}}' | grep 'appwrite/new' || true)"
echo "   Realtime-Handshake: $(curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' 'http://localhost/v1/realtime?project=account&channels[]=account') (erwartet 101)"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v "$(printf '\t')Up" || echo "   alle Container Up"
echo "   Platte nachher: $(df -h / | awk 'NR==2{print $5" belegt, "$4" frei"}')"
