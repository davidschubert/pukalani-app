#!/usr/bin/env bash
# AW28: den SMTP-keepAlive-Patch (registers.php mit keepAlive:false, seit 2026-07-19) auf appwrite-prod ENTFERNEN.
# Ablauf + Beweis = docs/runbooks/APPWRITE-2-7-UPGRADE.md, Abschnitt "AW28 — keepAlive-Patch entfernt" (maui-monorepo).
# Grund: Appwrite 2.7 hat einen neuen SMTP-Adapter (packages/messaging, ohne PHPMailer) mit NOOP-Ping vor jeder
# Wiederverwendung nach >30 s Leerlauf und EINEM Retry auf frischer Verbindung, wenn der gehaltene Socket tot ist
# (#14213). Auf dev 2026-11-08 bewiesen, inkl. Gegenprobe mit ausgeschaltetem Ping+Retry (Mail weg).
# Aufruf (von Davids Terminal, NUR nach Davids Ja):
#   scp ops/appwrite-aw28-drop-smtp-keepalive-patch.sh ploi@188.245.61.155:~/appwrite-aw28.sh
#   ssh -t ploi@188.245.61.155 'bash ~/appwrite-aw28.sh 2>&1 | tee ~/appwrite-aw28.log'
# Downtime: nur der Dienst appwrite-worker wird neu erzeugt (wenige Sekunden; Jobs warten in Redis).
# API, Realtime, Console laufen durch. Die Patchdateien unter patches/ bleiben liegen (Rueckweg).
# BEWUSST KEIN `doctor` (sendet eine SMTP-Testmail) — Health nur ueber /v1/health/version.
# Rueckweg: cp docker-compose.override.yml.bak-aw28-<TS> docker-compose.override.yml && docker compose up -d appwrite-worker
set -euo pipefail
VER=2.7.1
MOUNT="/home/ploi/appwrite/patches/registers-$VER-keepalive-off.php:/usr/src/code/app/init/registers.php:ro"
cd ~/appwrite
TS=$(date +%Y%m%d-%H%M)
echo "== [0/4] Vorbedingungen $(date -u +%T)"
grep -q "^_APP_VERSION=\"$VER\"" .env || { echo "ABBRUCH: .env steht nicht auf $VER"; exit 1; }
grep -qF -- "- $MOUNT" docker-compose.override.yml || { echo "ABBRUCH: Override traegt den $VER-Patch-Mount nicht (schon entfernt?)"; exit 1; }
[ "$(grep -c '^  appwrite-worker:$' docker-compose.override.yml)" = "1" ] || { echo "ABBRUCH: appwrite-worker-Block nicht eindeutig"; exit 1; }
echo "   keepAlive vorher: $(docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php)"
echo "== [1/4] Override sichern + Patch-Block entfernen $(date -u +%T)"
cp docker-compose.override.yml docker-compose.override.yml.bak-aw28-$TS
# Kopfkommentar (Zeilen vor `services:`) ersetzen, den Block `  appwrite-worker:` bis zum naechsten
# Eintrag auf Einrueckung 2 (Kommentar oder Dienst) entfernen. Alles andere (traefik, clickhouse) bleibt.
awk -v d="$(date +%F)" '
  !seen && /^services:$/ {
    print "# Der SMTP-keepAlive-Patch (2026-07-19 bis " d ", registers.php mit keepAlive:false im Worker) ist";
    print "# ENTFERNT (AW28): Appwrite 2.7 hat einen neuen SMTP-Adapter mit NOOP-Ping vor Wiederverwendung und";
    print "# einmaligem Retry auf einem toten Socket (#14213). Beweis: docs/runbooks/APPWRITE-2-7-UPGRADE.md (maui-monorepo).";
    print "# ABSOLUTE Pfade in allen Mounts: das Upgrade-Werkzeug laedt diese Override seit 2.5 mit und loest ./ im";
    print "# eigenen Container auf (Runbook APPWRITE-2-6-UPGRADE.md).";
    seen=1; print; next }
  !seen { next }
  /^  appwrite-worker:$/ { skip=1; next }
  skip && /^  [^ ]/ { skip=0 }
  skip { next }
  { print }
' docker-compose.override.yml.bak-aw28-$TS > docker-compose.override.yml
grep -q "keepalive-off" docker-compose.override.yml && { echo "ABBRUCH: Patch-Mount steht noch drin"; cp docker-compose.override.yml.bak-aw28-$TS docker-compose.override.yml; exit 1; }
grep -q "^  traefik:$" docker-compose.override.yml && grep -q "^  clickhouse:$" docker-compose.override.yml || { echo "ABBRUCH: traefik/clickhouse-Block verloren"; cp docker-compose.override.yml.bak-aw28-$TS docker-compose.override.yml; exit 1; }
diff docker-compose.override.yml.bak-aw28-$TS docker-compose.override.yml || true
docker compose config --quiet || { echo "ABBRUCH: Compose rot — Override zurueck"; cp docker-compose.override.yml.bak-aw28-$TS docker-compose.override.yml; exit 1; }
echo "== [2/4] Nur appwrite-worker neu erzeugen $(date -u +%T)"
docker compose up -d appwrite-worker
sleep 10
echo "== [3/4] Beweise $(date -u +%T)"
echo "   keepAlive nachher (soll true): $(docker exec appwrite-worker grep -n keepAlive /usr/src/code/app/init/registers.php)"
echo "   Patch-Mount im Worker (soll 0): $(docker inspect appwrite-worker --format '{{range .Mounts}}{{.Source}} {{end}}' | tr ' ' '\n' | grep -c keepalive || true)"
echo "   Retry im Adapter (soll 1): $(docker exec appwrite-worker grep -c 'return $this->deliver($message, false);' /usr/src/code/packages/messaging/src/Adapter/Email/SMTP.php)"
echo "   Version: $(curl -s -m 10 http://localhost/v1/health/version)"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -v "$(printf '\t')Up" || echo "   alle Container Up"
echo "   Worker-Fehler seit Start: $(docker logs --since 1m appwrite-worker 2>&1 | grep -ci 'level.*error' || true)"
echo "== [4/4] Mail-Beweis (OTP an die Resend-Testadresse, zaehlt als zugestellt) $(date -u +%T)"
PROBE="probe-aw28-$(date +%Y%m%d)"
T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s -m 15 -o /dev/null -w "   POST tokens/email -> %{http_code}\n" -X POST http://localhost/v1/account/tokens/email \
  -H 'Content-Type: application/json' -H 'X-Appwrite-Project: account' \
  -d "{\"userId\":\"$PROBE\",\"email\":\"delivered@resend.dev\"}"
sleep 20
docker logs --since "$T0" appwrite-worker 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | awk '/worker.v1-mails/{p=1} /^─+$/{p=0} p' | grep -E 'v1-mails|mail\.(status|error|template|smtp_type|recipient)' || echo "   KEIN v1-mails-Span — nachsehen!"
echo "   Probe-Nutzer $PROBE danach loeschen (Runtime-Key mit users.write liegt nur auf dem App-Server, Runbook 2.6 'ZWEI FALLEN')."
echo "   Den eigentlichen Leerlauf-Beweis (erste Mail nach >= 3 h Stille) mit demselben Aufruf spaeter wiederholen."
echo "== fertig $(date -u +%T)"
