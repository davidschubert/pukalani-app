#!/usr/bin/env bash
# Appwrite 2.0.0 -> 2.6.1 auf appwrite-prod. Ablauf = docs/runbooks/APPWRITE-2-6-UPGRADE.md (maui-monorepo).
# Aufruf (von Davids Terminal, Freigabe 2026-10-24 "ja, jetzt"):
#   scp ops/appwrite-upgrade-2.6.sh ploi@188.245.61.155:~/appwrite-upgrade-2.6.sh
#   ssh -t ploi@188.245.61.155 'bash ~/appwrite-upgrade-2.6.sh 2>&1 | tee ~/appwrite-upgrade-2.6.log'
# Schritt 0 (Images, Patchdatei) laeuft OHNE Downtime; die Downtime beginnt mit dem Werkzeug in Schritt 4.
set -euo pipefail
cd ~/appwrite
TS=$(date +%Y%m%d-%H%M)
mkdir -p ../backups
echo "== [0/7] Images vorziehen + Patchdatei (ohne Downtime) $(date -u +%T)"
for i in appwrite/appwrite:2.6.1 appwrite/new:1.2.97-self-hosted ghcr.io/appwrite/autogravity:0.0.11 ghcr.io/appwrite/exiftool:0.1.0 ghcr.io/open-runtimes/orchestrator/orchestrator:2.2.4 openruntimes/executor:1.1.2 appwrite/geo:0.3.2 appwrite/browser:0.3.6; do docker pull -q "$i"; done
echo "   PHP im 2.6.1-Image: $(docker run --rm --entrypoint=php appwrite/appwrite:2.6.1 -r 'echo PHP_VERSION;')"
docker run --rm --entrypoint=cat appwrite/appwrite:2.6.1 /usr/src/code/app/init/registers.php > patches/registers-2.6.1.orig.php
sed 's/keepAlive: true,/keepAlive: false,/' patches/registers-2.6.1.orig.php > patches/registers-2.6.1-keepalive-off.php
diff patches/registers-2.6.1.orig.php patches/registers-2.6.1-keepalive-off.php || true   # erwartet: genau Zeile 367
echo "== [1/7] Dump + Config-Backup ($TS) $(date -u +%T)"
docker exec appwrite-mariadb sh -c 'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --all-databases' | gzip > ../backups/appwrite-prod-pre-2.6.1-$TS.sql.gz
TABLES=$(gzip -dc ../backups/appwrite-prod-pre-2.6.1-$TS.sql.gz | grep -c "^CREATE TABLE" || true)
SIZE=$(stat -c %s ../backups/appwrite-prod-pre-2.6.1-$TS.sql.gz)
echo "   Dump: $SIZE Bytes, $TABLES Tabellen"
if [ "$TABLES" -lt 100 ]; then echo "ABBRUCH: Dump zu klein"; exit 1; fi
tar czf ../backups/appwrite-prod-config-pre-2.6.1-$TS.tgz docker-compose.yml docker-compose.override.yml .env patches
test -f patches/registers-2.6.1-keepalive-off.php || { echo "ABBRUCH: Patchdatei fehlt"; exit 1; }
grep -q "keepAlive: false" patches/registers-2.6.1-keepalive-off.php || { echo "ABBRUCH: Patchdatei ohne keepAlive:false"; exit 1; }
docker image inspect appwrite/appwrite:2.6.1 >/dev/null || { echo "ABBRUCH: Image 2.6.1 nicht gepullt"; exit 1; }
echo "== [2/7] .env vorbelegen (Trusted Proxies MIT Nuxt-Server, MQTT an Loopback)"
grep -q '^_APP_TRUSTED_PROXIES=' .env || printf '_APP_TRUSTED_PROXIES="127.0.0.1,::1,10.0.0.0/8,100.64.0.0/10,172.16.0.0/12,192.168.0.0/16,49.13.211.173"\n' >> .env
grep -q '^_APP_MQTT_PORT=' .env || printf '_APP_MQTT_PORT="127.0.0.1:8883"\n' >> .env
grep -q '^_APP_MQTT_WSS_PORT=' .env || printf '_APP_MQTT_WSS_PORT="127.0.0.1:8084"\n' >> .env
grep -E '^_APP_(TRUSTED_PROXIES|MQTT_PORT|MQTT_WSS_PORT)=' .env
echo "== [3/7] Override auf 2.6.1 (Dienstname, Patchdatei, ABSOLUTE Pfade, MQTT-Entrypoints)"
cp docker-compose.override.yml docker-compose.override.yml.bak-2.0.0-$TS
sed -i 's#^  appwrite-worker-mails:#  appwrite-worker:#' docker-compose.override.yml
sed -i 's#- \./patches/registers-2\.0\.0-keepalive-off\.php:#- /home/ploi/appwrite/patches/registers-2.6.1-keepalive-off.php:#' docker-compose.override.yml
sed -i 's#- \./patches/clickhouse-logging\.xml:#- /home/ploi/appwrite/patches/clickhouse-logging.xml:#' docker-compose.override.yml
sed -i 's#^\(      - --entrypoints\.appwrite_websecure\.address=:443\)$#\1\n      - --entrypoints.appwrite_mqtt.address=:8883\n      - --entrypoints.appwrite_mqtt_ws.address=:8084#' docker-compose.override.yml
sed -i '1s|^# PATCH (maui, 2026-07-19): SMTP-KeepAlive im mails-Worker deaktivieren\.$|# PATCH (maui, 2026-07-19, erneuert 2026-10-23 fuer 2.6.1): SMTP-KeepAlive im Worker deaktivieren (Zeile 367).\n# Seit 2.2 EIN Dienst `appwrite-worker` fuer alle Queues. ABSOLUTE Pfade: das Upgrade-Werkzeug laedt diese\n# Override seit 2.5 mit und loest ./ im eigenen Container auf (Runbook APPWRITE-2-6-UPGRADE.md).|' docker-compose.override.yml
grep -nE "appwrite-worker|registers-|clickhouse-logging|mqtt" docker-compose.override.yml
grep -q "appwrite-worker-mails" docker-compose.override.yml && { echo "ABBRUCH: alter Dienstname noch drin"; exit 1; }
grep -q "\./patches" docker-compose.override.yml && { echo "ABBRUCH: relativer Pfad noch drin"; exit 1; }
echo "== [4/7] Upgrade-Werkzeug (startet MIT Override) $(date -u +%T)"
cd ~
docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw --entrypoint="upgrade" appwrite/appwrite:2.6.1 --interactive=N || echo "WERKZEUG rot — eigenes up folgt"
cd ~/appwrite
grep -q '^_APP_VERSION="2.6.1"' .env || { echo "ABBRUCH: .env nicht auf 2.6.1"; exit 1; }
echo "== [5/7] Eigenes up -d $(date -u +%T)"
docker compose up -d --remove-orphans
echo "== [6/7] Migration $(date -u +%T)"
docker compose exec -T appwrite migrate | tail -3
echo "== [7/7] Beweise $(date -u +%T)"
echo "   trustedIPs: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs)  mqtt-Entrypoints: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c mqtt)"
echo "   Ports: $(docker port appwrite-traefik | tr '\n' ' ')"
echo "   keepAlive: $(docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php)"
echo "   clickhouse config.d: $(docker exec appwrite-clickhouse-1 ls /etc/clickhouse-server/config.d/ | tr '\n' ' ')"
echo "   PHP: $(docker exec appwrite php -r 'echo PHP_VERSION;')"
echo "   Version: $(curl -s -m 10 http://localhost/v1/health/version)"
echo "   Container 2.6.1: $(docker ps --format '{{.Image}}' | grep -c 'appwrite:2.6.1')  alte Worker: $(docker ps -a --format '{{.Names}}' | grep -c 'appwrite-worker-' || true)"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v ' Up' || echo "   alle Container Up"
