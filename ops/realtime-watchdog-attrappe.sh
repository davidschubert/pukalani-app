#!/usr/bin/env bash
# Den Realtime-Wächter gegen eine ATTRAPPE beweisen (OPS-004, 2026-11-16).
#
# WOZU: ops/realtime-watchdog.sh erstellt auf appwrite-prod einen Container neu
# und hört nach drei Neustarts in Folge damit auf. Ob das mit echtem
# `docker compose` so geschieht, zeigt nur ein echter Container. Nach JEDER
# Änderung am Wächter oder am Wort `realtime-status` in
# ops/appwrite-cert-gate.sh noch einmal laufen lassen.
#
# WIE: ein Wegwerf-Container mit EIGENEM Docker-Dienst (docker:dind). Darin ein
# Compose-Stack mit genau einem Dienst `appwrite-realtime` — ein kleiner
# Python-Server, der auf einen Upgrade-Aufruf mit `HTTP/1.1 101 Switching
# Protocols` antwortet. Zwei Störungen:
#   A  /tmp/defekt im Container (flüchtiges Dateisystem): Neu-Erstellen HEILT
#   B  /state/defekt im Volume: Neu-Erstellen heilt NICHT
# Der Beweis für „neu erstellt" ist die Container-Id. Der Docker-Dienst des
# Rechners sieht davon nur diesen einen Container; eine Appwrite-Instanz auf
# dem Rechner wird weder gelesen noch berührt.
#
# AUFRUF (vom Rechner, braucht nur docker):
#   ops/realtime-watchdog-attrappe.sh           baut auf, prüft, räumt ab
#   ops/realtime-watchdog-attrappe.sh --keep    lässt den Container zum Nachsehen stehen
#
# Exit: 0 alles bestanden · 1 mindestens eine Prüfung gescheitert
set -euo pipefail

NAME='p22-attrappe'
IMAGE='docker:dind'

if [ "${1:-}" != '--inside' ]; then
  KEEP=0
  [ "${1:-}" = '--keep' ] && KEEP=1
  OPS_DIR="$(cd "$(dirname "$0")" && pwd)"
  cleanup() {
    if [ "$KEEP" = 1 ]; then
      echo "Container $NAME bleibt stehen. Abräumen: docker rm -f -v $NAME && docker volume rm $NAME-docker"
    else
      docker rm -f -v "$NAME" >/dev/null 2>&1 || true
      docker volume rm "$NAME-docker" >/dev/null 2>&1 || true
    fi
  }
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$NAME-docker" >/dev/null 2>&1 || true
  trap cleanup EXIT
  docker run -d --name "$NAME" --privileged -e DOCKER_TLS_CERTDIR= \
    -v "$NAME-docker":/var/lib/docker -v "$OPS_DIR":/ops:ro "$IMAGE" >/dev/null
  tries=0
  until docker exec "$NAME" docker info >/dev/null 2>&1; do
    tries=$(( tries + 1 ))
    [ "$tries" -lt 60 ] || { echo "Der Docker-Dienst in der Attrappe startet nicht."; exit 1; }
    sleep 1
  done
  docker exec "$NAME" apk add --no-cache bash curl coreutils grep >/dev/null
  docker exec "$NAME" bash /ops/realtime-watchdog-attrappe.sh --inside
  exit $?
fi

# ── Ab hier: IM Container ───────────────────────────────────────────────────
PASS=0
FAIL=0
ok() { echo "✔ $*"; PASS=$(( PASS + 1 )); }
bad() { echo "✗ $*"; FAIL=$(( FAIL + 1 )); }
check() { # <beschreibung> <befehl…>
  local what="$1"
  shift
  if "$@"; then ok "$what"; else bad "$what"; fi
}

SRC=/srv/prod/appwrite                    # der „Server": Compose-Ordner
STATE=/srv/prod/ops/state/realtime-watchdog
LOG=/srv/prod/ops/realtime-watchdog.log
URL='http://localhost:8080/v1/realtime?project=console'
mkdir -p "$SRC" "$(dirname "$STATE")"
# Dieselbe Form prüft der Produktions-Wächter.
LINE_RE='^realtime ergebnis=(ok|neustart-geholfen|neustart-erfolglos|aufgegeben) fehlschlaege=[0-9]+ neustarts_24h=[0-9]+ neustarts_7t=[0-9]+ alter_minuten=([0-9]+|nie)$'

cat > "$SRC/realtime.py" <<'EOF'
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_GET(self):
        broken = os.path.exists('/tmp/defekt') or os.path.exists('/state/defekt')
        if broken or self.headers.get('Upgrade', '').lower() != 'websocket':
            self.send_response(503)
            self.send_header('Content-Length', '0')
            self.send_header('Connection', 'close')
            self.end_headers()
            return
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.end_headers()
        self.close_connection = True

    def log_message(self, *args):
        pass

HTTPServer(('', 80), Handler).serve_forever()
EOF
cat > "$SRC/docker-compose.yml" <<'EOF'
services:
  appwrite-realtime:
    image: python:3.12-alpine
    command: ["python", "-u", "/app/realtime.py"]
    stop_grace_period: 1s
    ports:
      - "8080:80"
    volumes:
      - /srv/prod/appwrite/realtime.py:/app/realtime.py:ro
      - realtime-state:/state
volumes:
  realtime-state: ~
EOF

rt() { ( cd "$SRC" && docker compose "$@" </dev/null ); }
cid() { rt ps -q appwrite-realtime; }
answers_101() {
  local first
  first="$(curl -sS -i -m 3 --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: YXR0cmFwcGU=' "$URL" 2>/dev/null || true)"
  first="${first%%$'\n'*}"
  case "${first%$'\r'}" in HTTP/*' 101 '*) return 0 ;; *) return 1 ;; esac
}
state_of() { grep -m1 "^$1=" "$STATE" | cut -d= -f2-; }

echo "── Attrappe aufbauen ──"
rt up -d >/dev/null 2>&1
n=0
until answers_101; do
  n=$(( n + 1 )); [ "$n" -lt 120 ] || { echo "Der Stellvertreter für Realtime antwortet nicht"; exit 1; }
  sleep 1
done
ok "Stellvertreter antwortet mit 101"

# Ein Lauf des ECHTEN Wächters, Ausgabe ins Log wie aus dem crontab.
CODE=0
watch() {
  CODE=0
  env APPWRITE_COMPOSE_DIR="$SRC" REALTIME_URL="$URL" REALTIME_STATE_FILE="$STATE" \
    REALTIME_RECHECK_SLEEP=4 bash /ops/realtime-watchdog.sh >> "$LOG" 2>&1 || CODE=$?
}
gate() { env REALTIME_STATE_FILE="$STATE" bash /ops/appwrite-cert-gate.sh realtime-status 2>&1; }
break_a() { rt exec -T appwrite-realtime touch /tmp/defekt >/dev/null; }
break_b() { rt exec -T appwrite-realtime touch /state/defekt >/dev/null; }
fix_b() { rt exec -T appwrite-realtime rm -f /state/defekt >/dev/null; }
# <beschreibung> <exit> <ergebnis> <fehlschläge> <neue-id: ja|nein>
expect_run() {
  local before after
  before="$(cid)"
  watch
  after="$(cid)"
  local id_new=nein
  [ "$before" != "$after" ] && id_new=ja
  if [ "$CODE" = "$2" ] && [ "$(state_of last_result)" = "$3" ] && [ "$(state_of failures)" = "$4" ] && [ "$id_new" = "$5" ]; then
    ok "$1 (Exit $CODE, $3, failures=$4, neue Id: $id_new)"
  else
    bad "$1 — Exit $CODE, $(state_of last_result), failures=$(state_of failures), neue Id: $id_new; erwartet Exit $2, $3, failures=$4, neue Id: $5"
    tail -5 "$LOG" | sed 's/^/    /'
  fi
}

echo "── Gesund ──"
expect_run "Gesund: kein Neustart" 0 ok 0 nein
check "Gesund: das Log bleibt still" test ! -s "$LOG"
check "Gesund: keine Neustart-Liste" test ! -s "$STATE.restarts"

echo "── Störung A: Neu-Erstellen heilt ──"
break_a
expect_run "A: genau ein Neustart, danach gesund" 0 neustart-geholfen 1 ja
check "A: Neustart-Liste hat eine Zeile" test "$(wc -l < "$STATE.restarts" | tr -d ' ')" = 1
check "A: Ausgabe von docker compose steht im Log" grep -q 'appwrite-realtime' "$LOG"
expect_run "A: nächster Lauf beginnt gesund, Zähler zurück" 0 ok 0 nein
check "A: Log meldet „wieder gesund nach 1 Fehlschlägen“" grep -q 'Realtime wieder gesund nach 1 Fehlschlägen' "$LOG"

echo "── Störung B: Neu-Erstellen heilt nicht ──"
break_b
expect_run "B Lauf 1: Neustart, erfolglos" 1 neustart-erfolglos 1 ja
expect_run "B Lauf 2: Neustart, erfolglos" 1 neustart-erfolglos 2 ja
expect_run "B Lauf 3: Neustart, erfolglos" 1 neustart-erfolglos 3 ja
expect_run "B Lauf 4: KEIN Neustart" 1 aufgegeben 4 nein
expect_run "B Lauf 5: KEIN Neustart" 1 aufgegeben 5 nein
check "B: Log nennt „kein Neustart mehr“" grep -q 'kein Neustart mehr, der Wächter meldet es' "$LOG"
OUT="$(gate)" && GCODE=0 || GCODE=$?
if [ "$GCODE" = 0 ] && [ "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" = 1 ] && printf '%s\n' "$OUT" | grep -Eq "$LINE_RE" \
  && [ "$OUT" = 'realtime ergebnis=aufgegeben fehlschlaege=5 neustarts_24h=4 neustarts_7t=4 alter_minuten=0' ]; then
  ok "Tor meldet: $OUT"
else
  bad "Tor (Exit $GCODE): $OUT"
fi

echo "── B behoben ──"
fix_b
expect_run "B behoben: nächster Lauf ok, Zähler 0" 0 ok 0 nein
check "B behoben: Log meldet „wieder gesund nach 5 Fehlschlägen“" grep -q 'Realtime wieder gesund nach 5 Fehlschlägen' "$LOG"

echo "── Danach wieder Störung A ──"
break_a
expect_run "A nach der Pause: wieder ein Neustart" 0 neustart-geholfen 1 ja
OUT="$(gate)" && GCODE=0 || GCODE=$?
if [ "$GCODE" = 0 ] && printf '%s\n' "$OUT" | grep -Eq "$LINE_RE" \
  && [ "$OUT" = 'realtime ergebnis=neustart-geholfen fehlschlaege=1 neustarts_24h=5 neustarts_7t=5 alter_minuten=0' ]; then
  ok "Tor meldet: $OUT"
else
  bad "Tor (Exit $GCODE): $OUT"
fi

echo "── Tor: Gegenproben ──"
OUT="$(env REALTIME_STATE_FILE=/tmp/gibt-es-nicht bash /ops/appwrite-cert-gate.sh realtime-status 2>&1)" && GCODE=0 || GCODE=$?
[ "$GCODE" = 6 ] && [ "$OUT" = 'realtime ergebnis=unbekannt' ] && ok "Ohne Stand: unbekannt, Exit 6" || bad "Ohne Stand: Exit $GCODE, $OUT"
printf 'last_result=ok; rm -rf /\nfailures=1\n' > /tmp/boese
OUT="$(env REALTIME_STATE_FILE=/tmp/boese bash /ops/appwrite-cert-gate.sh realtime-status 2>&1)" && GCODE=0 || GCODE=$?
[ "$GCODE" = 6 ] && [ "$OUT" = 'realtime ergebnis=unbekannt' ] && ok "Eingeschleuster Text wird nicht durchgereicht" || bad "Eingeschleust: Exit $GCODE, $OUT"
OUT="$(bash /ops/appwrite-cert-gate.sh 'realtime-status; id' 2>&1)" && GCODE=0 || GCODE=$?
[ "$GCODE" = 64 ] && ok "Unbekanntes Wort: Exit 64" || bad "Unbekanntes Wort: Exit $GCODE"

echo
echo "Bestanden: $PASS · Gescheitert: $FAIL"
[ "$FAIL" = 0 ]
