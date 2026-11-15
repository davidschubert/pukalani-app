#!/usr/bin/env bash
# Nächtliches Backup der Appwrite-Instanz (OPS-001, Fassung 2 vom 2026-11-15).
#
# WAS EIN LAUF ABLEGT — ein Ordner je Lauf, alles darin verschlüsselt:
#   runs/<JJJJ-MM-TT-HHMMSS>/
#     db.sql.gz.gpg                 Dump aller eigenen Datenbanken (eine Transaktion)
#     volume-<schlüssel>.tar.gz.gpg je Volume mit `ja` in ops/appwrite-volumes.conf
#     config.tar.gz.gpg             .env (darin der Schlüssel, mit dem Appwrite
#                                   Spalten und Dateien verschlüsselt), Compose-
#                                   Datei, Override, patches/, ClickHouse-Dateien
#     counts.tsv.gpg                Zeilen je Tabelle, gezählt direkt vor dem Dump
#     backup.meta                   Kenndaten im Klartext (Zahlen, keine Inhalte)
#     SHA256SUMS                    Prüfsummen der Dateien dieses Ordners
#
# Verschlüsselt wird mit einem ÖFFENTLICHEN Schlüssel (gpg, `--recipient-file`).
# Der private Schlüssel liegt nicht auf diesem Server und nicht auf der Storage
# Box — dieses Skript kann seine eigenen Backups nicht lesen. Klartext gibt es
# nur während des Laufs in einem Arbeitsordner (Recht 700), der am Ende und bei
# jedem Abbruch gelöscht wird.
#
# AUFRUF
#   appwrite-backup.sh            Vorschau: zeigt, was ein Lauf täte. Ändert nichts.
#   appwrite-backup.sh --run      Lauf (so steht es im Zeitplan)
#   appwrite-backup.sh --status   Ergebnis des letzten Laufs
#
# ZEITPLAN (crontab des Benutzers, der in der docker-Gruppe ist; kein root):
#   30 3 * * * APPWRITE_COMPOSE_DIR=<ordner> BACKUP_DIR=<ordner> \
#     OFFSITE_TARGET='<ssh-ziel>:backups/appwrite' \
#     <ordner>/appwrite-backup.sh --run >> <ordner>/logs/appwrite-backup.log 2>&1
#
# ZURÜCKSPIELEN: ops/appwrite-restore.sh, Anleitung
# docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md
#
# WAS DAS SKRIPT NICHT TUT: es startet und stoppt keinen Container, ändert
# nichts am Stack und braucht kein root. Ein gescheiterter Lauf lässt alle
# früheren Läufe liegen (lokal und auf der Box) und meldet den Schritt, an dem
# er scheiterte, in der Stand-Datei — die liest der Produktions-Wächter über
# das Tor-Skript (ops/appwrite-cert-gate.sh, Wort `backup-status`).
#
# LÖSCHUNGEN SCHLAGEN NICHT DURCH: abgeglichen wird OHNE `--delete`. Auf der
# Box wird getrennt aufgeräumt — nur Ordner, deren NAME ein Zeitstempel ist und
# älter als OFFSITE_RETENTION_DAYS, nie die jüngsten OFFSITE_KEEP_MIN, höchstens
# OFFSITE_MAX_DELETE je Lauf. Zweites Netz: Schnappschüsse der Storage Box.
#
# Env:
#   APPWRITE_COMPOSE_DIR     Pflicht — Ordner mit docker-compose.yml und .env
#   BACKUP_DIR               Default $HOME/backup
#   OFFSITE_TARGET           rsync-Ziel (`<ssh-ziel>:<pfad>` oder lokaler Pfad);
#                            leer = kein Abgleich (dann meldet der Lauf das laut)
#   RETENTION_DAYS           lokal, Default 14
#   OFFSITE_RETENTION_DAYS   auf der Box, Default 30 (nie kleiner als lokal)
#   OFFSITE_KEEP_MIN         Default 7 · OFFSITE_MAX_DELETE Default 5
#   BACKUP_PUBLIC_KEY        Default <skript-ordner>/appwrite-backup.pub.asc
#   BACKUP_KEY_FINGERPRINT   erwarteter Fingerabdruck (Default unten)
#   BACKUP_VOLUMES_CONF      Default <skript-ordner>/appwrite-volumes.conf
#   BACKUP_CONFIG_FILES      was aus dem Compose-Ordner mitkommt (Default unten)
#   MIN_SIZE_PERCENT         Default 50 — Dump und große Volumes dürfen gegen
#                            den letzten guten Lauf höchstens so weit schrumpfen
#   MAX_TABLE_LOSS_PERCENT   Default 10
#   BACKUP_ACCEPT_SHRINK=1   EIN Lauf von Hand nach bewusstem Aufräumen
#   MIN_FREE_MB              Default 1024
#   BACKUP_HELPER_IMAGE      Default alpine (liest die Volumes, nur lesend gemountet)
#
# Exit: 0 ok · 1 Lauf gescheitert · 2 Aufruf falsch · 3 läuft schon
set -euo pipefail
umask 077

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
FORMAT=2

# Der Schlüssel in BACKUP_PUBLIC_KEY muss GENAU diesen Fingerabdruck tragen.
# Eine vertauschte Datei verschlüsselt sonst für jemanden, dessen privaten
# Schlüssel niemand hat — das fiele erst bei der Wiederherstellung auf.
DEFAULT_FINGERPRINT='3724B4F1FE604CFD036F3F0D099D7563EA924920'

MODE="${1:-}"
case "$MODE" in
  ''|--run|--status) ;;
  *) echo "Aufruf: $(basename "$0") [--run|--status]   (ohne Angabe: Vorschau, ändert nichts)" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo "Zu viele Angaben." >&2; exit 2; }

BACKUP_DIR="${BACKUP_DIR:-$HOME/backup}"
RUNS_DIR="$BACKUP_DIR/runs"
STATE_DIR="$BACKUP_DIR/state"
STATE_FILE="$STATE_DIR/last-run"
LAST_OK_META="$STATE_DIR/last-ok.meta"
LOCK="$STATE_DIR/lock"

RETENTION_DAYS="${RETENTION_DAYS:-14}"
LOCAL_KEEP_MIN=3
OFFSITE_TARGET="${OFFSITE_TARGET:-}"
OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"
OFFSITE_KEEP_MIN="${OFFSITE_KEEP_MIN:-7}"
OFFSITE_MAX_DELETE="${OFFSITE_MAX_DELETE:-5}"
PUBKEY="${BACKUP_PUBLIC_KEY:-$SELF_DIR/appwrite-backup.pub.asc}"
FINGERPRINT="${BACKUP_KEY_FINGERPRINT:-$DEFAULT_FINGERPRINT}"
CONF="${BACKUP_VOLUMES_CONF:-$SELF_DIR/appwrite-volumes.conf}"
CONFIG_FILES="${BACKUP_CONFIG_FILES:-.env docker-compose.yml docker-compose.override.yml patches clickhouse-config.xml clickhouse-init.sh}"
MIN_SIZE_PERCENT="${MIN_SIZE_PERCENT:-50}"
MAX_TABLE_LOSS_PERCENT="${MAX_TABLE_LOSS_PERCENT:-10}"
ACCEPT_SHRINK="${BACKUP_ACCEPT_SHRINK:-0}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine}"
RUN_NAME='^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}$'
SYSTEM_SCHEMAS="'information_schema','performance_schema','mysql','sys'"

STAMP="$(date '+%F-%H%M%S')"
STEP='start'
RUNNING=0
HAVE_LOCK=0
WORK=''
PARTIAL=''
GNUPG_TMP=''

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "✗ $*"; exit 1; }

# ── Stand-Datei ─────────────────────────────────────────────────────────────
state_value() { [ -r "$STATE_FILE" ] && grep -m1 "^$1=" "$STATE_FILE" | cut -d= -f2- || true; }

write_state() { # <ergebnis> <schritt> [bytes dateien]
  local tmp="$STATE_FILE.tmp"
  {
    echo "last_result=$1"
    echo "last_step=$2"
    echo "last_attempt_epoch=$(date +%s)"
    echo "last_attempt_stamp=$STAMP"
    if [ "$1" = ok ]; then
      echo "last_ok_epoch=$(date +%s)"
      echo "last_ok_stamp=$STAMP"
      echo "last_ok_bytes=$3"
      echo "last_ok_files=$4"
    elif [ -r "$STATE_FILE" ]; then
      grep '^last_ok_' "$STATE_FILE" || true
    fi
  } > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

print_status() {
  if [ ! -r "$STATE_FILE" ]; then
    echo "Noch kein Lauf verzeichnet ($STATE_FILE fehlt)."
    return 0
  fi
  local ok_epoch ok_bytes age='-'
  ok_epoch="$(state_value last_ok_epoch)"
  ok_bytes="$(state_value last_ok_bytes)"
  case "$ok_epoch" in ''|*[!0-9]*) ;; *) age="$(( ($(date +%s) - ok_epoch) / 3600 )) h" ;; esac
  case "$ok_bytes" in ''|*[!0-9]*) ok_bytes=0 ;; esac
  echo "Letzter Versuch:    $(state_value last_attempt_stamp) → $(state_value last_result) (Schritt: $(state_value last_step))"
  if [ -n "$(state_value last_ok_stamp)" ]; then
    echo "Letzter guter Lauf: $(state_value last_ok_stamp), vor $age, $(state_value last_ok_files) Dateien, $(( ok_bytes / 1048576 )) MB"
  else
    echo "Letzter guter Lauf: noch keiner"
  fi
}

if [ "$MODE" = '--status' ]; then
  print_status
  exit 0
fi

# ── Aufräumen bei jedem Ende ────────────────────────────────────────────────
finish() {
  local code=$?
  trap - EXIT
  [ -n "$WORK" ] && rm -rf "$WORK"
  [ -n "$PARTIAL" ] && rm -rf "$PARTIAL"
  [ -n "$GNUPG_TMP" ] && rm -rf "$GNUPG_TMP"
  if [ "$RUNNING" = 1 ] && [ "$code" -ne 0 ]; then
    write_state fehler "$STEP" || true
    log "✗ Backup GESCHEITERT im Schritt „$STEP“ (Exit $code). Frühere Läufe sind unberührt."
    # Nach außen EIN Fehler-Code — der Exit eines gescheiterten Teilbefehls
    # (etwa 3 vom Dump) darf nicht wie „läuft schon" aussehen.
    code=1
  fi
  [ "$HAVE_LOCK" = 1 ] && rmdir "$LOCK" 2>/dev/null
  exit "$code"
}
trap finish EXIT

# ── Helfer ──────────────────────────────────────────────────────────────────
COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:?APPWRITE_COMPOSE_DIR fehlt}"

dc() { ( cd "$COMPOSE_DIR" && docker compose "$@" ); }

# SQL von der Standard-Eingabe; -N ohne Kopfzeile, -r ohne Backslash-Verdopplung.
sql() { dc exec -T mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r'; }

# Datum (JJJJ-MM-TT) vor N Tagen — GNU date, sonst BSD date.
days_ago() { date -d "-$1 days" '+%F' 2>/dev/null || date -v-"$1"d '+%F'; }

conf_lines() { grep -Ev '^[[:space:]]*(#|$)' "$CONF"; }
conf_backup_flag() { conf_lines | awk -v k="$1" '$1 == k && !seen { print $2; seen = 1 }'; }

target_is_remote() { case "$OFFSITE_TARGET" in *:*) return 0 ;; *) return 1 ;; esac; }
remote_host() { printf '%s' "${OFFSITE_TARGET%%:*}"; }
remote_path() { printf '%s' "${OFFSITE_TARGET#*:}"; }
SSH_OPTS='-o BatchMode=yes -o ConnectTimeout=30'

offsite_ls_runs() {
  if target_is_remote; then
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$(remote_host)" ls "$(remote_path)/runs" </dev/null
  else
    ls "$OFFSITE_TARGET/runs"
  fi
}
offsite_rm_run() {
  if target_is_remote; then
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$(remote_host)" rm -rf "$(remote_path)/runs/$1" </dev/null
  else
    rm -rf "${OFFSITE_TARGET:?}/runs/$1"
  fi
}
# Der eine Weg zur Ablage außer Haus: feste ssh-Schalter, und nie mit dem
# Schalter, der Löschungen überträgt.
offsite_rsync() {
  if target_is_remote; then rsync -e "ssh $SSH_OPTS" "$@"; else rsync "$@"; fi
}

# Wählt aus einer Liste von Lauf-Namen (Standard-Eingabe) die, die weg dürfen:
# älter als <tage>, nicht unter den jüngsten <behalten>, höchstens <maximal>.
pick_expired() { # <tage> <behalten> <maximal>
  local cutoff total keep_from
  cutoff="$(days_ago "$1")"
  grep -E "$RUN_NAME" | sort > "$WORK/rotation.txt" || true
  total="$(wc -l < "$WORK/rotation.txt" | tr -d ' ')"
  keep_from=$(( total - $2 ))
  [ "$keep_from" -gt 0 ] || return 0
  # Die Obergrenze zählt awk selbst — ein `head` dahinter würde die Pipe früh
  # schließen (SIGPIPE, mit pipefail ein Scheinfehler).
  head -n "$keep_from" "$WORK/rotation.txt" | awk -v c="$cutoff" -v max="$3" 'substr($0, 1, 10) < c && n < max { print; n++ }'
}

# ── Vorprüfung (nur lesend; läuft auch in der Vorschau) ─────────────────────
preflight() {
  local tool
  for tool in docker gpg gzip tar jq sha256sum awk; do
    command -v "$tool" >/dev/null 2>&1 || die "Programm fehlt: $tool"
  done
  if [ -n "$OFFSITE_TARGET" ]; then
    command -v rsync >/dev/null 2>&1 || die "Programm fehlt: rsync"
  fi
  [ -r "$COMPOSE_DIR/docker-compose.yml" ] || die "Keine docker-compose.yml in $COMPOSE_DIR"
  [ -r "$COMPOSE_DIR/.env" ] || die "Keine lesbare .env in $COMPOSE_DIR"
  grep -Eq '^_APP_OPENSSL_KEY_V1=.+' "$COMPOSE_DIR/.env" \
    || die "In der .env fehlt die Zeile _APP_OPENSSL_KEY_V1 — ohne sie ist das Backup an verschlüsselten Stellen wertlos"
  [ -r "$CONF" ] || die "Volume-Liste fehlt: $CONF"
  [ -r "$PUBKEY" ] || die "Öffentlicher Schlüssel fehlt: $PUBKEY"
  [ "$OFFSITE_RETENTION_DAYS" -ge "$RETENTION_DAYS" ] \
    || die "OFFSITE_RETENTION_DAYS ($OFFSITE_RETENTION_DAYS) ist kleiner als RETENTION_DAYS ($RETENTION_DAYS) — die Box soll länger halten als der Server"

  GNUPG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/appwrite-backup-gpg.XXXXXX")"
  local found
  found="$(gpg --batch --no-tty --homedir "$GNUPG_TMP" --show-keys --with-colons "$PUBKEY" 2>/dev/null | awk -F: '/^fpr:/ && !seen { print $10; seen = 1 }')"
  [ -n "$found" ] || die "Die Datei $PUBKEY enthält keinen lesbaren öffentlichen Schlüssel"
  [ "$found" = "$FINGERPRINT" ] \
    || die "Falscher Schlüssel: $PUBKEY trägt den Fingerabdruck $found, erwartet ist $FINGERPRINT. Nichts verschlüsselt, nichts abgeglichen."

  CONFIG_JSON="$(dc config --format json </dev/null)" || die "docker compose config scheitert in $COMPOSE_DIR"
  PROJECT="$(printf '%s' "$CONFIG_JSON" | jq -r '.name // empty')"
  [ -n "$PROJECT" ] || die "Compose-Projekt nicht ermittelbar"
  APPWRITE_IMAGE="$(printf '%s' "$CONFIG_JSON" | jq -r '.services.appwrite.image // "unbekannt"')"
  [ -n "$(dc ps -q mariadb </dev/null)" ] || die "Der Dienst mariadb läuft nicht — kein Dump möglich"

  # Volumes: Schlüssel → echter Name, aus der Compose-Datei (nie geraten).
  VOLMAP="$(printf '%s' "$CONFIG_JSON" | jq -r '(.volumes // {}) | to_entries[] | "\(.key) \(.value.name)"')"
  local key name flag
  while read -r key name; do
    [ -n "$key" ] || continue
    flag="$(conf_backup_flag "$key")"
    case "$flag" in
      ja|nein) ;;
      '') die "Das Volume „$key“ steht in der Compose-Datei, aber nicht in $(basename "$CONF"). Dort eintragen (ja oder nein), dann läuft das Backup wieder." ;;
      *) die "In $(basename "$CONF") steht für „$key“ weder ja noch nein" ;;
    esac
  done <<EOF
$VOLMAP
EOF
  BACKUP_VOLUMES=''
  while read -r key flag _; do
    [ "$flag" = ja ] || continue
    name="$(printf '%s\n' "$VOLMAP" | awk -v k="$key" '$1 == k && !seen { print $2; seen = 1 }')"
    [ -n "$name" ] || die "Das Volume „$key“ soll gesichert werden, steht aber nicht in der Compose-Datei"
    docker volume inspect "$name" >/dev/null 2>&1 || die "Das Volume „$key“ ($name) gibt es nicht — Backup abgebrochen statt es zu überspringen"
    BACKUP_VOLUMES="$BACKUP_VOLUMES$key $name
"
  done <<EOF
$(conf_lines)
EOF
  [ -n "$BACKUP_VOLUMES" ] || die "Kein Volume zum Sichern in $(basename "$CONF")"

  # Was der Stack aus dem Compose-Ordner einbindet, muss im Archiv der
  # Einstellungen liegen — sonst startet die wiederhergestellte Instanz nicht.
  local source rel covered item
  while read -r source; do
    [ -n "$source" ] || continue
    case "$source" in "$COMPOSE_DIR"/*) rel="${source#"$COMPOSE_DIR"/}" ;; *) continue ;; esac
    covered=0
    for item in $CONFIG_FILES; do
      case "$rel" in "$item"|"$item"/*) covered=1 ;; esac
    done
    [ "$covered" = 1 ] || die "Der Stack bindet „$rel“ aus dem Compose-Ordner ein, es steht aber nicht in BACKUP_CONFIG_FILES"
  done <<EOF
$(printf '%s' "$CONFIG_JSON" | jq -r '.services[]?.volumes[]? | select(.type == "bind") | .source')
EOF
  PRESENT_CONFIG=''
  for item in $CONFIG_FILES; do
    [ -e "$COMPOSE_DIR/$item" ] && PRESENT_CONFIG="$PRESENT_CONFIG $item"
  done

  DATABASES="$(echo "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ($SYSTEM_SCHEMAS) ORDER BY 1;" | sql | tr '\n' ' ' | sed 's/ *$//')"
  [ -n "$DATABASES" ] || die "Keine eigene Datenbank gefunden — die Abfrage kam leer zurück"
  case "$DATABASES" in *[!A-Za-z0-9_\ ]*) die "Datenbank-Name mit unerwarteten Zeichen" ;; esac
  DATABASE_COUNT="$(printf '%s\n' "$DATABASES" | wc -w | tr -d ' ')"
}

# ── Vorschau ────────────────────────────────────────────────────────────────
if [ "$MODE" = '' ]; then
  preflight
  echo "Vorschau — es wird NICHTS geändert."
  echo
  echo "Compose-Ordner:   $COMPOSE_DIR (Projekt $PROJECT, $APPWRITE_IMAGE)"
  echo "Datenbanken:      $DATABASES"
  echo "Einstellungen:   $PRESENT_CONFIG"
  echo "Volumes (sichern):"
  printf '%s' "$BACKUP_VOLUMES" | while read -r key name; do echo "  $key  ←  $name"; done
  echo "Schlüssel:        $FINGERPRINT (stimmt mit $(basename "$PUBKEY") überein)"
  echo "Ablage lokal:     $RUNS_DIR ($RETENTION_DAYS Tage, mindestens $LOCAL_KEEP_MIN Läufe)"
  if [ -n "$OFFSITE_TARGET" ]; then
    if target_is_remote; then shown="<ssh-ziel>:$(remote_path)"; else shown="$OFFSITE_TARGET"; fi
    echo "Ablage außer Haus: $shown/runs ($OFFSITE_RETENTION_DAYS Tage, mindestens $OFFSITE_KEEP_MIN Läufe, höchstens $OFFSITE_MAX_DELETE Löschungen je Lauf)"
    if offsite_ls_runs >/dev/null 2>&1; then echo "                  erreichbar"; else echo "                  NICHT erreichbar oder noch kein Ordner runs/ (der erste Lauf legt ihn an)"; fi
  else
    echo "Ablage außer Haus: KEINE (OFFSITE_TARGET ist leer)"
  fi
  echo
  print_status
  echo
  echo "Lauf starten: $(basename "$0") --run"
  exit 0
fi

# ── Lauf ────────────────────────────────────────────────────────────────────
mkdir -p "$RUNS_DIR" "$STATE_DIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +360 2>/dev/null)" ]; then
    log "Alte Sperre (über 6 Stunden) entfernt"
    rmdir "$LOCK" && mkdir "$LOCK"
  else
    log "Ein anderer Lauf ist unterwegs ($LOCK) — nichts getan"
    exit 3
  fi
fi
HAVE_LOCK=1
RUNNING=1

STEP='vorpruefung'
log "Backup $STAMP beginnt"
preflight
[ -e "$RUNS_DIR/$STAMP" ] && die "Den Lauf $STAMP gibt es schon — gleich noch einmal starten"

free_mb="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print int($4 / 1024) }')"
prev_bytes="$(state_value last_ok_bytes)"
case "$prev_bytes" in ''|*[!0-9]*) prev_bytes=0 ;; esac
need_mb=$(( prev_bytes * 3 / 1048576 ))
[ "$need_mb" -ge "$MIN_FREE_MB" ] || need_mb="$MIN_FREE_MB"
[ "$free_mb" -ge "$need_mb" ] || die "Zu wenig Platz: $free_mb MB frei, gebraucht werden $need_mb MB"

WORK="$BACKUP_DIR/work-$STAMP"
PARTIAL="$RUNS_DIR/$STAMP.partial"
rm -rf "$WORK" "$PARTIAL"
mkdir "$WORK" "$PARTIAL"

prev() { [ -r "$LAST_OK_META" ] && grep -m1 "^$1=" "$LAST_OK_META" | cut -d= -f2- || true; }
shrunk() { # <jetzt> <vorher> <prozent> → wahr, wenn jetzt unter prozent % von vorher liegt
  case "$2" in ''|*[!0-9]*) return 1 ;; esac
  [ "$2" -gt 0 ] && [ $(( $1 * 100 )) -lt $(( $2 * $3 )) ]
}
refuse_shrink() { # <meldung>
  if [ "$ACCEPT_SHRINK" = 1 ]; then log "⚠ $1 — mit BACKUP_ACCEPT_SHRINK=1 angenommen"; else die "$1. Ist das gewollt (bewusst aufgeräumt), einmal von Hand mit BACKUP_ACCEPT_SHRINK=1 laufen lassen."; fi
}

# 1) Zählen — direkt vor dem Dump, mit derselben Verbindung wie der Dump.
STEP='zaehlen'
echo "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ($SYSTEM_SCHEMAS) ORDER BY 1, 2;" | sql > "$WORK/tables.tsv"
TABLES="$(wc -l < "$WORK/tables.tsv" | tr -d ' ')"
[ "$TABLES" -gt 0 ] || die "Die Datenbank meldet keine einzige Tabelle"
: > "$WORK/counts.tsv"
chunk=''
n=0
while IFS="$(printf '\t')" read -r db table; do
  case "$db$table" in *[!A-Za-z0-9_]*) die "Tabellenname mit unerwarteten Zeichen — nicht gezählt, nicht geraten" ;; esac
  part="SELECT '$db', '$table', COUNT(*) FROM \`$db\`.\`$table\`"
  if [ -z "$chunk" ]; then chunk="$part"; else chunk="$chunk UNION ALL $part"; fi
  n=$(( n + 1 ))
  if [ "$n" -ge 150 ]; then
    printf '%s;\n' "$chunk" | sql >> "$WORK/counts.tsv"
    chunk=''
    n=0
  fi
done < "$WORK/tables.tsv"
[ -z "$chunk" ] || printf '%s;\n' "$chunk" | sql >> "$WORK/counts.tsv"
[ "$(wc -l < "$WORK/counts.tsv" | tr -d ' ')" = "$TABLES" ] || die "Zählung unvollständig: $TABLES Tabellen, aber $(wc -l < "$WORK/counts.tsv" | tr -d ' ') gezählt"
ROWS="$(awk -F'\t' '{ s += $3 } END { printf "%d", s }' "$WORK/counts.tsv")"
log "Gezählt: $DATABASE_COUNT Datenbank(en), $TABLES Tabellen, $ROWS Zeilen"

prev_tables="$(prev tables)"
prev_databases="$(prev databases)"
case "$prev_databases" in ''|*[!0-9]*) ;; *)
  [ "$DATABASE_COUNT" -ge "$prev_databases" ] || refuse_shrink "Nur noch $DATABASE_COUNT Datenbank(en), beim letzten guten Lauf waren es $prev_databases" ;;
esac
if shrunk "$TABLES" "$prev_tables" $(( 100 - MAX_TABLE_LOSS_PERCENT )); then
  refuse_shrink "Nur noch $TABLES Tabellen, beim letzten guten Lauf waren es $prev_tables"
fi

# 2) Dump — eine Transaktion, alle eigenen Datenbanken.
STEP='dump'
# shellcheck disable=SC2016
dc exec -T mariadb sh -c 'exec mariadb-dump --single-transaction --quick --hex-blob --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" --databases '"$DATABASES" </dev/null \
  | gzip -6 > "$WORK/db.sql.gz"
gzip -t "$WORK/db.sql.gz" || die "Der Dump ist kein gültiges gzip"
gunzip -c "$WORK/db.sql.gz" | tail -c 400 | grep -q 'Dump completed' \
  || die "Der Dump ist unvollständig (die Schlusszeile „Dump completed“ fehlt)"
DUMP_TABLES="$(gunzip -c "$WORK/db.sql.gz" | grep -c '^CREATE TABLE ' || true)"
[ $(( DUMP_TABLES + 2 )) -ge "$TABLES" ] \
  || die "Der Dump enthält $DUMP_TABLES Tabellen, die Datenbank hat $TABLES"
DUMP_BYTES="$(wc -c < "$WORK/db.sql.gz" | tr -d ' ')"
if shrunk "$DUMP_BYTES" "$(prev dump_bytes)" "$MIN_SIZE_PERCENT"; then
  refuse_shrink "Der Dump hat $DUMP_BYTES Bytes, beim letzten guten Lauf waren es $(prev dump_bytes)"
fi
log "Dump: $DUMP_TABLES Tabellen, $(( DUMP_BYTES / 1048576 )) MB"

# 3) Volumes — nur lesend gemountet, das Archiv gehört dem aufrufenden Benutzer.
STEP='volumes'
VOLUME_META=''
while read -r key name; do
  [ -n "$key" ] || continue
  archive="$WORK/volume-$key.tar.gz"
  docker run --rm -v "$name":/data:ro "$HELPER_IMAGE" tar czf - -C /data . </dev/null > "$archive"
  entries="$(tar tzf "$archive" | wc -l | tr -d ' ')" || die "Das Archiv von „$key“ ist nicht lesbar"
  [ "$entries" -gt 0 ] || die "Das Archiv von „$key“ ist leer"
  bytes="$(wc -c < "$archive" | tr -d ' ')"
  prev_entries="$(prev "volume.$key.entries")"
  case "$prev_entries" in ''|*[!0-9]*) prev_entries=0 ;; esac
  if [ "$prev_entries" -ge 20 ] && shrunk "$entries" "$prev_entries" "$MIN_SIZE_PERCENT"; then
    refuse_shrink "Das Volume „$key“ hat nur noch $entries Einträge, beim letzten guten Lauf waren es $prev_entries"
  fi
  VOLUME_META="${VOLUME_META}volume.$key.entries=$entries
volume.$key.bytes=$bytes
"
  log "Volume $key: $entries Einträge, $(( bytes / 1024 )) KB"
done <<EOF
$BACKUP_VOLUMES
EOF

# 4) Einstellungen — die .env verlässt den Server nur verschlüsselt.
STEP='einstellungen'
# shellcheck disable=SC2086
tar czf "$WORK/config.tar.gz" -C "$COMPOSE_DIR" $PRESENT_CONFIG
tar tzf "$WORK/config.tar.gz" > "$WORK/config.list"
grep -qx '\.env' "$WORK/config.list" || die "Die .env fehlt im Archiv der Einstellungen"
rm -f "$WORK/config.list"
log "Einstellungen:$PRESENT_CONFIG"

# 5) Verschlüsseln — danach gibt es im Lauf-Ordner keinen Klartext.
STEP='verschluesseln'
for plain in "$WORK"/db.sql.gz "$WORK"/volume-*.tar.gz "$WORK"/config.tar.gz "$WORK"/counts.tsv; do
  gpg --batch --quiet --no-tty --homedir "$GNUPG_TMP" --trust-model always --compress-algo none \
    --recipient-file "$PUBKEY" --output "$PARTIAL/$(basename "$plain").gpg" --encrypt "$plain"
  [ -s "$PARTIAL/$(basename "$plain").gpg" ] || die "Verschlüsseln von $(basename "$plain") ergab eine leere Datei"
  rm -f "$plain"
done
{
  echo "format=$FORMAT"
  echo "stamp=$STAMP"
  echo "appwrite_image=$APPWRITE_IMAGE"
  echo "key_fingerprint=$FINGERPRINT"
  echo "databases=$DATABASE_COUNT"
  echo "database_names=$DATABASES"
  echo "tables=$TABLES"
  echo "rows=$ROWS"
  echo "dump_tables=$DUMP_TABLES"
  echo "dump_bytes=$DUMP_BYTES"
  printf '%s' "$VOLUME_META"
  echo "config_files=${PRESENT_CONFIG# }"
} > "$PARTIAL/backup.meta"
( cd "$PARTIAL" && sha256sum -- *.gpg backup.meta > SHA256SUMS )
FILES="$(find "$PARTIAL" -type f | wc -l | tr -d ' ')"
BYTES="$(cat "$PARTIAL"/* | wc -c | tr -d ' ')"
mv "$PARTIAL" "$RUNS_DIR/$STAMP"
PARTIAL=''
log "Lauf-Ordner fertig: $FILES Dateien, $(( BYTES / 1048576 )) MB, verschlüsselt für $FINGERPRINT"

# 6) Außer Haus — OHNE --delete. Was auf der Box liegt, bleibt dort, auch
#    wenn es hier fehlt; ein früher gescheiterter Abgleich wird nachgeholt.
if [ -n "$OFFSITE_TARGET" ]; then
  STEP='abgleich'
  offsite_rsync -a --exclude '*.partial' "$RUNS_DIR/" "$OFFSITE_TARGET/runs/" \
    || die "Der Abgleich mit der Ablage außer Haus ist gescheitert (nicht erreichbar?). Der Lauf liegt lokal und wird beim nächsten Mal nachgereicht."
  STEP='pruefung-box'
  drift="$(offsite_rsync -a --checksum --dry-run --itemize-changes "$RUNS_DIR/$STAMP/" "$OFFSITE_TARGET/runs/$STAMP/")" \
    || die "Die Prüfung der Ablage außer Haus ist gescheitert"
  [ -z "$drift" ] || die "Auf der Ablage außer Haus liegt nicht dasselbe wie hier ($(printf '%s\n' "$drift" | wc -l | tr -d ' ') Abweichungen)"
  log "Außer Haus angekommen und Prüfsummen gleich"
else
  log "⚠ OFFSITE_TARGET ist leer — dieser Lauf liegt NUR auf diesem Server"
fi

# 7) Aufbewahrung — lokal und auf der Box getrennt, nur nach dem Namen.
STEP='aufbewahrung'
for old in $(ls "$RUNS_DIR" | pick_expired "$RETENTION_DAYS" "$LOCAL_KEEP_MIN" "$OFFSITE_MAX_DELETE"); do
  rm -rf "${RUNS_DIR:?}/$old"
  log "Lokal gelöscht (älter als $RETENTION_DAYS Tage): $old"
done
if [ -n "$OFFSITE_TARGET" ]; then
  for old in $(offsite_ls_runs | pick_expired "$OFFSITE_RETENTION_DAYS" "$OFFSITE_KEEP_MIN" "$OFFSITE_MAX_DELETE"); do
    offsite_rm_run "$old" || die "Löschen von $old auf der Ablage außer Haus ist gescheitert"
    remaining="$(offsite_ls_runs)"
    if printf '%s\n' "$remaining" | grep -cx "$old" >/dev/null; then die "Der Lauf $old liegt nach dem Löschen noch auf der Ablage außer Haus"; fi
    log "Außer Haus gelöscht (älter als $OFFSITE_RETENTION_DAYS Tage): $old"
  done
fi

# 8) Stand — erst jetzt gilt der Lauf als gut.
STEP='fertig'
cp "$RUNS_DIR/$STAMP/backup.meta" "$LAST_OK_META"
write_state ok fertig "$BYTES" "$FILES"
log "Backup fertig: $STAMP, $FILES Dateien, $(( BYTES / 1048576 )) MB, $TABLES Tabellen, $(ls "$RUNS_DIR" | grep -Ec "$RUN_NAME") Läufe lokal"
