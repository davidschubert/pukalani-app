#!/usr/bin/env bash
# Appwrite 2.6.1 -> 2.6.2 (Security-Release vom 2026-10-24) auf appwrite-prod.
# Ablauf = docs/runbooks/APPWRITE-2-6-UPGRADE.md, Abschnitt "2.6.1 -> 2.6.2" (maui-monorepo).
# Aufruf (von Davids Terminal, nach Freigabe):
#   scp ops/appwrite-upgrade-2.6.2.sh ploi@188.245.61.155:~/appwrite-upgrade-2.6.2.sh
#   ssh -t ploi@188.245.61.155 'bash ~/appwrite-upgrade-2.6.2.sh 2>&1 | tee ~/appwrite-upgrade-2.6.2.log'
# Schritt 0/1 (Images, Patchdatei, Dump) laufen OHNE Downtime; die Downtime beginnt mit dem Werkzeug in
# Schritt 4 (es startet die Container selbst, --no-start wird weiter ignoriert). 2.6.1 -> 2.6.2 aendert KEIN
# Schema (Migration V25 bleibt), die Override behaelt Dienstname, absolute Pfade und MQTT-Entrypoints —
# neu ist nur die Patchdatei aus dem 2.6.2-Image (registers.php ist zu 2.6.1 byte-gleich, keepAlive Zeile 367).
set -euo pipefail
OLD=2.6.1
NEW=2.6.2
cd ~/appwrite
TS=$(date +%Y%m%d-%H%M)
mkdir -p ../backups
echo "== [0/7] Vorbedingungen + Images vorziehen + Patchdatei (ohne Downtime) $(date -u +%T)"
grep -q "^_APP_VERSION=\"$OLD\"" .env || { echo "ABBRUCH: .env steht nicht auf $OLD"; exit 1; }
grep -q "registers-$OLD-keepalive-off.php" docker-compose.override.yml || { echo "ABBRUCH: Override zeigt nicht auf die $OLD-Patchdatei"; exit 1; }
grep -q '^_APP_TRUSTED_PROXIES=.*49\.13\.211\.173' .env || { echo "ABBRUCH: _APP_TRUSTED_PROXIES ohne Nuxt-Server"; exit 1; }
for i in appwrite/appwrite:$NEW appwrite/new:1.2.108-self-hosted appwrite/browser:0.3.8 ghcr.io/appwrite/exiftool:0.1.1; do docker pull -q "$i"; done
echo "   PHP im $NEW-Image: $(docker run --rm --entrypoint=php appwrite/appwrite:$NEW -r 'echo PHP_VERSION;')"
echo "   Brotli im $NEW-Image: $(docker run --rm --entrypoint=sh appwrite/appwrite:$NEW -c 'apk info -v brotli-libs 2>/dev/null | head -1')   (erwartet: brotli-libs-1.2.1-r0, CVE-2026-111497)"
docker run --rm --entrypoint=cat appwrite/appwrite:$NEW /usr/src/code/app/init/registers.php > patches/registers-$NEW.orig.php
sed 's/keepAlive: true,/keepAlive: false,/' patches/registers-$NEW.orig.php > patches/registers-$NEW-keepalive-off.php
diff patches/registers-$NEW.orig.php patches/registers-$NEW-keepalive-off.php || true   # erwartet: genau Zeile 367
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
docker image inspect appwrite/appwrite:$NEW >/dev/null || { echo "ABBRUCH: Image $NEW nicht gepullt"; exit 1; }
echo "== [2/7] .env pruefen (2.6.2 weist leeres/Platzhalter-_APP_JOBS_SECRET ab — das Werkzeug erzeugt dann selbst eines)"
if grep -qE '^_APP_JOBS_SECRET=("?)(your-secret-key)?\1$' .env; then echo "   _APP_JOBS_SECRET ist leer/Platzhalter — das Werkzeug ersetzt es (wir fuehren keine Functions)"; else echo "   _APP_JOBS_SECRET gesetzt"; fi
grep -q '^_APP_MEMORY_LIMIT=' .env && echo "   _APP_MEMORY_LIMIT schon gesetzt: $(grep '^_APP_MEMORY_LIMIT=' .env)" || echo "   _APP_MEMORY_LIMIT fehlt noch — das Werkzeug schreibt den Default 512M"
echo "== [3/7] Override auf $NEW (nur die Patchdatei wechselt) $(date -u +%T)"
cp docker-compose.override.yml docker-compose.override.yml.bak-$OLD-$TS
sed -i "s#/home/ploi/appwrite/patches/registers-$OLD-keepalive-off\.php:#/home/ploi/appwrite/patches/registers-$NEW-keepalive-off.php:#" docker-compose.override.yml
sed -i "1s|fuer 2.6.1)|fuer 2.6.1, $(date +%F) fuer $NEW)|" docker-compose.override.yml
grep -q "/home/ploi/appwrite/patches/registers-$NEW-keepalive-off.php:" docker-compose.override.yml || { echo "ABBRUCH: Override-Mount nicht auf $NEW"; exit 1; }
grep -n "registers-\|clickhouse-logging\|appwrite_mqtt" docker-compose.override.yml
docker compose config --quiet || { echo "ABBRUCH: Override gegen die $OLD-Basis rot"; exit 1; }
echo "== [4/7] Upgrade-Werkzeug $NEW (startet MIT Override, Downtime beginnt) $(date -u +%T)"
cd ~
docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw --entrypoint="upgrade" appwrite/appwrite:$NEW --interactive=N || echo "WERKZEUG rot — eigenes up folgt"
cd ~/appwrite
grep -q "^_APP_VERSION=\"$NEW\"" .env || { echo "ABBRUCH: .env nicht auf $NEW"; exit 1; }
grep -E '^_APP_(TRUSTED_PROXIES|MQTT_PORT|MQTT_WSS_PORT|MEMORY_LIMIT)=' .env
grep -qE '^_APP_JOBS_SECRET=("?)(your-secret-key)?\1$' .env && { echo "ABBRUCH: _APP_JOBS_SECRET nach dem Werkzeug noch unsicher"; exit 1; } || true
echo "== [5/7] Eigenes up -d $(date -u +%T)"
docker compose up -d --remove-orphans
echo "== [6/7] Migration (V25 bleibt — erwartet: nichts zu tun) $(date -u +%T)"
docker compose exec -T appwrite migrate | tail -3
echo "== [7/7] Beweise $(date -u +%T)"
echo "   trustedIPs: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs)  mqtt-Entrypoints: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c mqtt)"
echo "   Ports: $(docker port appwrite-traefik | tr '\n' ' ')"
echo "   keepAlive: $(docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php)"
echo "   clickhouse config.d: $(docker exec appwrite-clickhouse-1 ls /etc/clickhouse-server/config.d/ | tr '\n' ' ')"
echo "   PHP: $(docker exec appwrite php -r 'echo PHP_VERSION;')   Brotli: $(docker exec appwrite sh -c 'apk info -v brotli-libs | head -1')"
echo "   memory_limit: $(docker exec appwrite php -r 'echo ini_get("memory_limit");')"
echo "   Version: $(curl -s -m 10 http://localhost/v1/health/version)"
echo "   Container $NEW: $(docker ps --format '{{.Image}}' | grep -c "appwrite:$NEW")  noch auf $OLD: $(docker ps --format '{{.Image}}' | grep -c "appwrite:$OLD" || true)  Console: $(docker ps --format '{{.Image}}' | grep 'appwrite/new' || true)"
echo "   doctor: $(docker compose exec -T appwrite doctor 2>/dev/null | grep -i 'jobs callbacks' || echo '(doctor ohne Zeile zu jobs)')"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v ' Up' || echo "   alle Container Up"
