#!/usr/bin/env bash
# Appwrite 2.7.1 -> 2.7.3 (Sicherheits-Release 2.7.2 vom 2026-11-12 + Wartungs-Release 2.7.3 vom 2026-11-17)
# auf appwrite-prod. Ablauf = docs/runbooks/APPWRITE-2-7-UPGRADE.md, Abschnitt "2.7.1 -> 2.7.3".
#
# NUR NACH DAVIDS JA. Aufruf (von Davids Terminal):
#   scp ops/appwrite-upgrade-2.7.3.sh ploi@188.245.61.155:~/appwrite-upgrade-2.7.3.sh
#   ssh -t ploi@188.245.61.155 'bash ~/appwrite-upgrade-2.7.3.sh 2>&1 | tee ~/appwrite-upgrade-2.7.3.log'
#
# Probe auf der Entwicklungs-Instanz (dort steht die .env schon auf 2.7.3 — das Werkzeug ist wiederholbar):
#   OLD=2.7.3 APPWRITE_DIR=~/Developer/orbstack/appwrite-maria/appwrite bash ops/appwrite-upgrade-2.7.3.sh
#
# WAS SICH AENDERT: drei Images (appwrite/appwrite 2.7.3, Console appwrite/new 1.2.181, Executor 1.3.5) und in
# der .env genau EINE Zeile (_APP_VERSION). Keine neuen .env-Schluessel, kein neuer Dienst, kein Schema:
# `migrate` laeuft trotzdem (Hersteller-Vorgabe) und meldet nur "already exists". Die Override bleibt, wie sie
# ist — den SMTP-Patch gibt es seit AW28/AW29 nicht mehr, also wird hier keine Patchdatei gezogen oder gedreht.
#
# Schritt 0/1 (Images, Dump) laufen OHNE Ausfall; der Ausfall beginnt mit dem Werkzeug in Schritt 3 (es
# startet die Container selbst, --no-start wird ignoriert). BEWUSST KEIN `doctor` (sendet eine SMTP-Testmail)
# — Health nur ueber /v1/health/version.
set -euo pipefail
OLD="${OLD:-2.7.1}"
NEW=2.7.3
DIR="${APPWRITE_DIR:-$HOME/appwrite}"
IMAGES="appwrite/appwrite:$NEW appwrite/new:1.2.181-self-hosted openruntimes/executor:1.3.5"
[ "$(basename "$DIR")" = "appwrite" ] || { echo "ABBRUCH: der Compose-Ordner muss 'appwrite' heissen (das Werkzeug erwartet ihn so): $DIR"; exit 1; }
cd "$DIR"
TS=$(date -u +%Y%m%d-%H%M)
mkdir -p ../backups

echo "== [0/6] Vorbedingungen + Images vorziehen (ohne Ausfall) $(date -u +%T)"
grep -q "^_APP_VERSION=\"$OLD\"" .env || { echo "ABBRUCH: .env steht nicht auf $OLD"; exit 1; }
if grep -q "keepalive-off" docker-compose.override.yml; then echo "ABBRUCH: Override traegt noch den SMTP-Patch-Mount (AW28 nicht gelaufen?)"; exit 1; fi
docker compose config --quiet || { echo "ABBRUCH: Compose + Override sind schon VOR dem Upgrade rot"; exit 1; }
PROXIES_BEFORE=$(grep '^_APP_TRUSTED_PROXIES=' .env || true)
[ -n "$PROXIES_BEFORE" ] || { echo "ABBRUCH: _APP_TRUSTED_PROXIES fehlt in der .env"; exit 1; }
if pgrep -f 'appwrite-backup\.sh' >/dev/null; then echo "ABBRUCH: das naechtliche Backup laeuft gerade — danach neu starten"; exit 1; fi
ENV_KEYS_BEFORE=$(cut -d= -f1 .env | sort | cksum)
echo "   Platte vorher: $(df -h / | awk 'NR==2{print $5" belegt, "$4" frei"}')"
for i in $IMAGES; do docker pull -q "$i"; done
for i in $IMAGES; do docker image inspect "$i" >/dev/null || { echo "ABBRUCH: Image $i nicht gezogen"; exit 1; }; done
echo "   PHP im $NEW-Image: $(docker run --rm --entrypoint=php "appwrite/appwrite:$NEW" -r 'echo PHP_VERSION;')"

echo "== [1/6] Dump + Config-Sicherung ($TS) $(date -u +%T)"
DUMP="../backups/appwrite-pre-$NEW-$TS.sql.gz"
# shellcheck disable=SC2016 # das Passwort loest die Shell IM Container auf, nicht hier
docker exec appwrite-mariadb sh -c 'mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --all-databases' </dev/null | gzip > "$DUMP"
TABLES=$(gzip -dc "$DUMP" | grep -c "^CREATE TABLE" || true)
gzip -dc "$DUMP" | tail -1 | grep -q "Dump completed" || { echo "ABBRUCH: Dump ohne Schlusszeile 'Dump completed'"; exit 1; }
echo "   Dump: $(wc -c < "$DUMP" | tr -d ' ') Bytes, $TABLES Tabellen"
if [ "$TABLES" -lt 100 ]; then echo "ABBRUCH: Dump zu klein"; exit 1; fi
TABLES_BEFORE=$(docker exec appwrite-mariadb sh -c 'mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "select count(*) from information_schema.tables where table_schema=\"appwrite\""' </dev/null)
tar czf "../backups/appwrite-config-pre-$NEW-$TS.tgz" docker-compose.yml docker-compose.override.yml .env
cp docker-compose.yml "docker-compose.yml.pre-$NEW"

echo "== [2/6] Auf eine ruhige Stelle im Fuenf-Minuten-Takt des Realtime-Waechters warten $(date -u +%T)"
# Der Waechter (crontab, */5) erstellt appwrite-realtime neu, wenn sein Handshake scheitert. Faellt sein Lauf
# in den Ausfall, greift er dem Werkzeug dazwischen. Gestartet wird deshalb 20 bis 60 s NACH einer vollen
# Fuenf-Minuten-Marke: bis zur naechsten bleiben mindestens vier Minuten (Ausfall bei 2.7.1: 99 s).
while :; do
  POS=$(( $(date +%s) % 300 ))
  if [ "$POS" -ge 20 ] && [ "$POS" -le 60 ]; then break; fi
  sleep 5
done

echo "== [3/6] Upgrade-Werkzeug $NEW (startet MIT Override, der Ausfall beginnt) $(date -u +%T)"
T0=$(date +%s)
cd ..
docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw --entrypoint="upgrade" "appwrite/appwrite:$NEW" --interactive=N </dev/null || echo "WERKZEUG rot — eigenes up folgt"
cd "$DIR"
grep -q "^_APP_VERSION=\"$NEW\"" .env || { echo "ABBRUCH: .env nicht auf $NEW"; exit 1; }
[ "$(grep '^_APP_TRUSTED_PROXIES=' .env)" = "$PROXIES_BEFORE" ] || { echo "ABBRUCH: das Werkzeug hat _APP_TRUSTED_PROXIES veraendert"; exit 1; }
[ "$(cut -d= -f1 .env | sort | cksum)" = "$ENV_KEYS_BEFORE" ] || echo "   HINWEIS: die Schluesselmenge der .env hat sich geaendert (auf dev: unveraendert) — diff gegen .env.*.backup lesen"
echo "   Compose-Diff (erwartet: genau zwei Image-Zeilen, Console und Executor):"
diff "docker-compose.yml.pre-$NEW" docker-compose.yml || true

echo "== [4/6] Eigenes up -d $(date -u +%T)"
docker compose up -d --remove-orphans

echo "== [5/6] Migration (dev: 7 s, 383 'already exists', 0 andere Fehlerzeilen) $(date -u +%T)"
MIG=$(docker compose exec -T appwrite migrate </dev/null 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$MIG" | grep -E 'Migration completed|task\.migrate' || { echo "$MIG" | tail -15; echo "ABBRUCH: migrate ohne 'Migration completed'"; exit 1; }
echo "   already-exists-Warnungen: $(echo "$MIG" | grep -c 'already exists' || true)   andere Fehlerzeilen: $(echo "$MIG" | grep -i 'error\|exception\|failed' | grep -vc 'already exists' || true)"

echo "== [6/6] Beweise $(date -u +%T)  (Werkzeug-Aufruf bis hier: $(( $(date +%s) - T0 )) s)"
for _ in 1 2 3 4 5 6; do
  VERSION=$(curl -s -m 10 http://localhost/v1/health/version || true)
  case "$VERSION" in *"\"$NEW\""*) break ;; esac
  sleep 5
done
echo "   Version: $VERSION"
echo "   Tabellen vorher/nachher: $TABLES_BEFORE / $(docker exec appwrite-mariadb sh -c 'mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "select count(*) from information_schema.tables where table_schema=\"appwrite\""' </dev/null)"
echo "   trustedIPs: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c trustedIPs || true)  mqtt-Entrypoints: $(docker inspect appwrite-traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -c 'entrypoints.appwrite_mqtt' || true)"
echo "   Ports: $(docker port appwrite-traefik | tr '\n' ' ')"
echo "   Patch-Mounts im Worker (erwartet 0): $(docker inspect appwrite-worker --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}' | grep -c 'registers.php' || true)"
echo "   PHP: $(docker exec appwrite php -r 'echo PHP_VERSION;')"
EXEC=$(docker ps --format '{{.Names}}' | grep -E '^exc[0-9]+$' | sort | sed -n 1p)
# shellcheck disable=SC2016 # beide Variablen loest die Shell IM Container auf
echo "   Executor: $(docker exec "$EXEC" sh -c 'echo $OPR_EXECUTOR_VERSION')   Secret gleich in appwrite+executor: $([ "$(docker exec appwrite sh -c 'echo $_APP_EXECUTOR_SECRET' | cksum)" = "$(docker exec "$EXEC" sh -c 'echo $OPR_EXECUTOR_SECRET' | cksum)" ] && echo ja || echo NEIN)"
echo "   Container $NEW: $(docker ps --format '{{.Image}}' | grep -c "appwrite:$NEW" || true)  noch auf anderer Version: $(docker ps --format '{{.Image}}' | grep 'appwrite/appwrite:' | grep -vc ":$NEW" || true)  Console: $(docker ps --format '{{.Image}}' | grep 'appwrite/new' || true)"
# Der Nonce des Handshakes wird je Lauf erzeugt (16 Zufalls-Bytes, wie RFC 6455 es verlangt).
echo "   Realtime-Handshake: $(curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" 'http://localhost/v1/realtime?project=console&channels[]=account') (erwartet 101)"
echo "   Fehlerzeilen seit dem Start: api $(docker logs appwrite --since 3m 2>&1 | grep -ci 'fatal\|\[error\]' || true)  worker $(docker logs appwrite-worker --since 3m 2>&1 | grep -ci 'fatal\|\[error\]' || true)  realtime $(docker logs appwrite-realtime --since 3m 2>&1 | grep -ci 'fatal\|\[error\]' || true)"
docker compose ps -a --format '{{.Name}}\t{{.Status}}' | grep -v "$(printf '\t')Up" || echo "   alle Container Up"
echo "   Platte nachher: $(df -h / | awk 'NR==2{print $5" belegt, "$4" frei"}')"
echo "FERTIG — danach von aussen: Runbook, Abschnitt '2.7.1 -> 2.7.3', 'Nach dem Lauf'."
