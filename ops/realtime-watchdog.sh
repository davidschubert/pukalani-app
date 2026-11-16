#!/usr/bin/env bash
# Realtime-Wächter auf appwrite-prod (PHASE-17 A.9; Zähler seit OPS-004, 2026-11-16).
#
# WOZU: der Container `appwrite-realtime` kann nach einem Swoole-Absturz
# BESCHÄDIGT weiterlaufen — Docker meldet „running", aber es kommen keine
# Ereignisse mehr, und `restart: unless-stopped` greift nicht. Der Beweis ist
# deshalb ein echter WebSocket-Handshake (HTTP 101), kein docker-inspect. Ist
# er gescheitert, wird der Container neu ERSTELLT (geprüfte Hilfe:
# `up -d --no-deps --force-recreate`, 2026-07-01/16).
#
# WARUM DER ZÄHLER: liegt die Ursache woanders (Proxy, Zertifikat, Platte),
# hilft ein Neu-Erstellen nicht — früher geschah es trotzdem alle fünf
# Minuten, und jedes Mal brach jede offene Live-Verbindung ab. Seit OPS-004
# (Davids Entscheidung) gilt: höchstens DREI Neustarts in Folge. Ab dem
# vierten gescheiterten Lauf startet der Wächter nichts mehr neu, sondern
# schreibt nur noch den Stand `aufgegeben` — bis ein Handshake wieder gelingt,
# von selbst oder nach einem Eingriff. Gezählt werden Läufe IN FOLGE, die mit
# einem gescheiterten Handshake beginnen; ein Neustart, der hilft, setzt den
# Zähler NICHT zurück (sonst käme ein Container, der nach jedem Neustart binnen
# fünf Minuten wieder stirbt, nie bis drei). Zurück auf 0 geht er nur, wenn ein
# Lauf mit einem guten Handshake BEGINNT.
#
# GEMELDET wird über den Produktions-Wächter (.github/workflows/production-
# watch.yml): er liest den Stand über das Tor-Skript auf diesem Server
# (ops/appwrite-cert-gate.sh, Wort `realtime-status`) — eine Zeile mit
# Ergebnis, Fehlschlägen in Folge, Neustarts der letzten 24 Stunden und 7 Tage
# und dem Alter des letzten Laufs in Minuten (daran sieht er, ob der Zeitplan
# überhaupt noch läuft). Eine eigene Melde-Adresse gibt es nicht mehr.
#
# STAND (REALTIME_STATE_FILE, Schlüssel=Wert je Zeile, atomar geschrieben):
#   last_check_epoch  Beginn des letzten Laufs (Sekunden seit 1970)
#   last_result       ok | neustart-geholfen | neustart-erfolglos | aufgegeben
#   failures          Läufe in Folge, die mit gescheitertem Handshake begannen
#   last_ok_epoch     letzter gelungener Handshake
# Daneben <Stand-Datei>.restarts: je Neustart eine Zeile mit der Epoche (die
# letzten 500). Die Datei wird nur gelesen, nie ausgeführt; was keine Zahl
# ist, gilt als „noch kein Stand".
#
# CRON (crontab von `ploi` auf appwrite-prod, alle 5 min):
#   */5 * * * * APPWRITE_COMPOSE_DIR=/home/ploi/appwrite /home/ploi/ops/realtime-watchdog.sh >> /home/ploi/ops/logs/realtime-watchdog.log 2>&1
# (so steht die Zeile seit Juli dort; an ihr ändert der Zähler nichts)
#
# ENV:
#   APPWRITE_COMPOSE_DIR    Pflicht — Ordner mit der docker-compose.yml
#   REALTIME_URL            Default http://localhost/v1/realtime?project=console
#                           (lokal, unabhängig von TLS/DNS; `console` gibt es immer)
#   REALTIME_STATE_FILE     Default $HOME/ops/state/realtime-watchdog
#   REALTIME_RECHECK_SLEEP  Sekunden zwischen Neustart und zweitem Handshake (Default 15)
#
# EXIT: 0 Realtime gesund (auch: nach Neustart) · 1 gestört (Neustart erfolglos,
#       aufgegeben oder Compose-Ordner fehlt)
#
# Nach JEDER Änderung: `ops/realtime-watchdog-attrappe.sh`, dann von Hand auf
# den Server (kein CI-Weg).
set -u

COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:?APPWRITE_COMPOSE_DIR fehlt}"
REALTIME_URL="${REALTIME_URL:-http://localhost/v1/realtime?project=console}"
STATE_FILE="${REALTIME_STATE_FILE:-$HOME/ops/state/realtime-watchdog}"
RECHECK_SLEEP="${REALTIME_RECHECK_SLEEP:-15}"
MAX_RESTARTS=3
RESTARTS_KEEP=500

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

# Nur Ziffern, höchstens zwölf (bash rechnet mit 64 Bit — Unsinn aus der
# Stand-Datei soll nicht überlaufen).
is_count() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "${#1}" -le 12 ]; }
is_count "$RECHECK_SLEEP" || RECHECK_SLEEP=15
RECHECK_SLEEP=$(( 10#$RECHECK_SLEEP ))

# Erster Wert zu einem Schlüssel; reines bash, die Datei wird nie ausgeführt.
state_value() {
  local line
  [ -r "$STATE_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "$1="*) printf '%s' "${line#*=}"; return 0 ;; esac
  done < "$STATE_FILE"
}

write_state() { # <ergebnis>
  local dir tmp
  dir="$(dirname "$STATE_FILE")"
  mkdir -p "$dir" || { log "Stand-Ordner $dir lässt sich nicht anlegen"; return 1; }
  tmp="$STATE_FILE.tmp.$$"
  printf 'last_check_epoch=%s\nlast_result=%s\nfailures=%s\nlast_ok_epoch=%s\n' \
    "$NOW" "$1" "$FAILURES" "$LAST_OK" > "$tmp" && mv -f "$tmp" "$STATE_FILE" \
    || { rm -f "$tmp"; log "Stand-Datei $STATE_FILE lässt sich nicht schreiben"; return 1; }
}

record_restart() {
  local file="$STATE_FILE.restarts" lines
  mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null
  printf '%s\n' "$(date +%s)" >> "$file" || return 0
  lines="$(wc -l < "$file")"
  lines="${lines//[!0-9]/}"
  if [ "${lines:-0}" -gt "$RESTARTS_KEEP" ]; then
    tail -n "$RESTARTS_KEEP" "$file" > "$file.tmp.$$" && mv -f "$file.tmp.$$" "$file"
  fi
}

handshake_ok() {
  # 101 Switching Protocols = Realtime lebt. curl bleibt nach dem Upgrade am
  # Socket hängen — der Timeout ist erwartet, entscheidend ist die erste Zeile.
  # Die Antwort landet in einer Variablen statt in `| head -1 | grep -q`: eine
  # früh geschlossene Pipe ist mit pipefail ein Scheinfehler (Exit 141).
  local response first
  response="$(curl -sS -i -m 8 --http1.1 \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: cGhhc2UxNy13YXRjaGRvZw==' \
    "$REALTIME_URL" 2>/dev/null)"
  first="${response%%$'\n'*}"
  first="${first%$'\r'}"
  case "$first" in
    HTTP/*' 101'|HTTP/*' 101 '*) return 0 ;;
    *) return 1 ;;
  esac
}

NOW="$(date +%s)"
FAILURES="$(state_value failures)"
is_count "$FAILURES" || FAILURES=0
FAILURES=$(( 10#$FAILURES ))   # führende Nullen nicht als Oktalzahl lesen
LAST_OK="$(state_value last_ok_epoch)"
is_count "$LAST_OK" || LAST_OK=''

if handshake_ok; then
  # Still bei Erfolg — das Log soll nur Vorfälle zeigen.
  [ "$FAILURES" -gt 0 ] && log "Realtime wieder gesund nach $FAILURES Fehlschlägen"
  FAILURES=0
  LAST_OK="$NOW"
  write_state ok
  exit 0
fi

FAILURES=$(( FAILURES + 1 ))
if [ "$FAILURES" -gt "$MAX_RESTARTS" ]; then
  log "Realtime-Handshake gegen $REALTIME_URL gescheitert — $FAILURES Fehlschläge in Folge, kein Neustart mehr, der Wächter meldet es"
  write_state aufgegeben
  exit 1
fi

log "Realtime-Handshake gegen $REALTIME_URL gescheitert ($FAILURES. Fehlschlag in Folge) — Container wird neu erstellt"
if ! cd "$COMPOSE_DIR" 2>/dev/null; then
  log "Compose-Ordner $COMPOSE_DIR fehlt — kein Neustart"
  write_state neustart-erfolglos
  exit 1
fi
# </dev/null: `docker compose` soll nichts von der Standard-Eingabe lesen.
docker compose up -d --no-deps --force-recreate appwrite-realtime < /dev/null 2>&1 \
  || log 'docker compose meldet einen Fehler beim Neu-Erstellen'
record_restart

sleep "$RECHECK_SLEEP"
if handshake_ok; then
  log 'Realtime erholt (Handshake 101 nach Neustart)'
  LAST_OK="$(date +%s)"
  write_state neustart-geholfen
  exit 0
fi
log "Realtime WEITER GESTÖRT nach Neustart ($FAILURES von höchstens $MAX_RESTARTS) — eingreifen"
write_state neustart-erfolglos
exit 1
