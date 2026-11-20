#!/usr/bin/env bash
# Tägliches Backup der Dienste auf dem Docker-Server (Fassung 1 vom 2026-11-20).
# Schwester von ops/appwrite-backup.sh — derselbe Aufbau, derselbe Schlüssel,
# dieselben Zusagen; gesichert wird aber nicht EIN Stack, sondern jeder
# Compose-Ordner unter APPS_DIR nach der Liste ops/docker-apps.conf.
#
# WAS EIN LAUF ABLEGT — ein Ordner je Lauf, alles darin verschlüsselt:
#   runs/<JJJJ-MM-TT-HHMMSS>/
#     <dienst>-postgres.sql.gz.gpg        `pg_dumpall` (alle Datenbanken, Rollen)
#     <dienst>-clickhouse.tar.gz.gpg      je Tabelle Bauanleitung und Daten
#                                         (Format Native), dazu tables.tsv
#     <dienst>-sqlite.gz.gpg              Abzug über die Backup-Funktion von
#                                         SQLite (kein Kopieren der Datei)
#     <dienst>-dateien.tar.gz.gpg         ein Ordner aus einem Container
#     <dienst>-einstellungen.tar.gz.gpg   .env, Compose-Datei und was der Stack
#                                         sonst aus seinem Ordner einbindet
#     counts.tsv.gpg                      Zeilen je Tabelle, direkt vor dem Abzug
#     backup.meta                         Kenndaten im Klartext (Zahlen, keine Inhalte)
#     SHA256SUMS                          Prüfsummen der Dateien dieses Ordners
#
# Verschlüsselt wird mit einem ÖFFENTLICHEN Schlüssel (gpg, `--recipient-file`).
# Der private Schlüssel liegt nicht auf diesem Server und nicht auf der Storage
# Box — dieses Skript kann seine eigenen Backups nicht lesen. Klartext gibt es
# nur während des Laufs in einem Arbeitsordner (Recht 700), der am Ende und bei
# jedem Abbruch gelöscht wird.
#
# AUFRUF
#   docker-apps-backup.sh            Vorschau: zeigt, was ein Lauf täte. Ändert nichts.
#   docker-apps-backup.sh --run      Lauf (so steht es im Zeitplan)
#   docker-apps-backup.sh --status   Ergebnis des letzten Laufs
#
# ZEITPLAN (crontab des Benutzers, der in der docker-Gruppe ist; kein root):
#   15 3 * * * APPS_DIR=<ordner> BACKUP_DIR=<ordner> \
#     OFFSITE_TARGET='<ssh-ziel>:backups/docker-apps' \
#     <ordner>/docker-apps-backup.sh --run >> <ordner>/logs/docker-apps-backup.log 2>&1
#
# ZURÜCKSPIELEN: von Hand, Anleitung docs/runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md
#
# WAS DAS SKRIPT NICHT TUT: es startet und stoppt keinen Container, ändert
# nichts an einem Stack und braucht kein root. Ein gescheiterter Lauf lässt
# alle früheren Läufe liegen (lokal und auf der Box) und meldet den Schritt, an
# dem er scheiterte, in der Stand-Datei.
#
# NICHTS WIRD STILL AUSGELASSEN: jeder Compose-Ordner unter APPS_DIR und jeder
# Dienst darin braucht eine Zeile in der Liste — eine Daten-Zeile oder ein
# ausdrückliches `ohne`. Kommt ein Ordner oder ein Dienst dazu, den die Liste
# nicht kennt, bricht der Lauf ab, statt ihn zu übergehen.
#
# LÖSCHUNGEN SCHLAGEN NICHT DURCH: abgeglichen wird OHNE `--delete`. Auf der
# Box wird getrennt aufgeräumt — nur Ordner, deren NAME ein Zeitstempel ist und
# älter als OFFSITE_RETENTION_DAYS, nie die jüngsten OFFSITE_KEEP_MIN, höchstens
# OFFSITE_MAX_DELETE je Lauf. Zweites Netz: Schnappschüsse der Storage Box.
#
# Env:
#   APPS_DIR                 Pflicht — Ordner, unter dem die Compose-Ordner liegen
#   BACKUP_DIR               Default $HOME/backup
#   OFFSITE_TARGET           rsync-Ziel (`<ssh-ziel>:<pfad>` oder lokaler Pfad);
#                            leer = kein Abgleich (dann meldet der Lauf das laut)
#   RETENTION_DAYS           lokal, Default 14
#   OFFSITE_RETENTION_DAYS   auf der Box, Default 30 (nie kleiner als lokal)
#   OFFSITE_KEEP_MIN         Default 7 · OFFSITE_MAX_DELETE Default 5
#   BACKUP_PUBLIC_KEY        Default <skript-ordner>/appwrite-backup.pub.asc
#   BACKUP_KEY_FINGERPRINT   erwarteter Fingerabdruck (Default unten)
#   BACKUP_APPS_CONF         Default <skript-ordner>/docker-apps.conf
#   MIN_SIZE_PERCENT         Default 50 — eine Datei darf gegen den letzten
#                            guten Lauf höchstens so weit schrumpfen
#   MAX_TABLE_LOSS_PERCENT   Default 10
#   BACKUP_ACCEPT_SHRINK=1   EIN Lauf von Hand nach bewusstem Aufräumen
#   MIN_FREE_MB              Default 1024
#
# Exit: 0 ok · 1 Lauf gescheitert · 2 Aufruf falsch · 3 läuft schon
set -euo pipefail
umask 077

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
FORMAT=1

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
CONF="${BACKUP_APPS_CONF:-$SELF_DIR/docker-apps.conf}"
MIN_SIZE_PERCENT="${MIN_SIZE_PERCENT:-50}"
MAX_TABLE_LOSS_PERCENT="${MAX_TABLE_LOSS_PERCENT:-10}"
ACCEPT_SHRINK="${BACKUP_ACCEPT_SHRINK:-0}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
RUN_NAME='^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}$'
# Eine Datei unter dieser Größe wird nicht auf Schrumpfen geprüft — bei ein
# paar Kilobyte ist die Hälfte keine Aussage.
SHRINK_FLOOR_BYTES=16384
CLICKHOUSE_SYSTEM="'system','INFORMATION_SCHEMA','information_schema'"
# Tabellen-Arten ohne eigene Zeilen: nur die Bauanleitung wird gesichert.
CLICKHOUSE_NO_DATA='Dictionary View MaterializedView LiveView WindowView'

STAMP="$(date '+%F-%H%M%S')"
STEP='start'
RUNNING=0
HAVE_LOCK=0
WORK=''
PARTIAL=''
GNUPG_TMP=''
TAB="$(printf '\t')"

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
    echo "Letzter guter Lauf: $(state_value last_ok_stamp), vor $age, $(state_value last_ok_files) Dateien, $(( ok_bytes / 1024 )) KB"
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
    # darf nicht wie „läuft schon" aussehen.
    code=1
  fi
  [ "$HAVE_LOCK" = 1 ] && rmdir "$LOCK" 2>/dev/null
  exit "$code"
}
trap finish EXIT

# ── Helfer ──────────────────────────────────────────────────────────────────
APPS_DIR="${APPS_DIR:?APPS_DIR fehlt}"
APPS_DIR="${APPS_DIR%/}"

# docker compose im Ordner eines Dienstes.
dc() { ( cd "$APPS_DIR/$1" && shift && docker compose "$@" ); }

# SQL von der Standard-Eingabe an eine Datenbank; -At ohne Rahmen, Trenner `|`.
# shellcheck disable=SC2016
PG_PSQL='exec psql -X -At -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "$1"'
pg() { dc "$1" exec -T "$2" sh -c "$PG_PSQL" sh "$3"; } # <ordner> <compose-dienst> <datenbank>
ch() { # <ordner> <compose-dienst> <abfrage>
  dc "$1" exec -T "$2" clickhouse-client -q "$3" </dev/null
}

# Datum (JJJJ-MM-TT) vor N Tagen — GNU date, sonst BSD date.
days_ago() { date -d "-$1 days" '+%F' 2>/dev/null || date -v-"$1"d '+%F'; }

conf_lines() { grep -Ev '^[[:space:]]*(#|$)' "$CONF"; }
# Angaben (ab Spalte 5) der Zeilen eines Ordners mit einer bestimmten Art.
conf_extras() { # <ordner> <art>
  conf_lines | awk -v f="$1" -v a="$2" '$3 == f && $2 == a { for (i = 5; i <= NF; i++) print $i }'
}
in_list() { # <wort> <liste…> — ohne Pipe (kein Scheinfehler 141)
  local needle="$1" item
  shift
  for item in "$@"; do [ "$item" = "$needle" ] && return 0; done
  return 1
}

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
  [ -d "$APPS_DIR" ] || die "Den Ordner $APPS_DIR gibt es nicht"
  [ -r "$CONF" ] || die "Liste der Dienste fehlt: $CONF"
  [ -r "$PUBKEY" ] || die "Öffentlicher Schlüssel fehlt: $PUBKEY"
  [ "$OFFSITE_RETENTION_DAYS" -ge "$RETENTION_DAYS" ] \
    || die "OFFSITE_RETENTION_DAYS ($OFFSITE_RETENTION_DAYS) ist kleiner als RETENTION_DAYS ($RETENTION_DAYS) — die Box soll länger halten als der Server"

  GNUPG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/docker-apps-backup-gpg.XXXXXX")"
  local found
  found="$(gpg --batch --no-tty --homedir "$GNUPG_TMP" --show-keys --with-colons "$PUBKEY" 2>/dev/null | awk -F: '/^fpr:/ && !seen { print $10; seen = 1 }')"
  [ -n "$found" ] || die "Die Datei $PUBKEY enthält keinen lesbaren öffentlichen Schlüssel"
  [ "$found" = "$FINGERPRINT" ] \
    || die "Falscher Schlüssel: $PUBKEY trägt den Fingerabdruck $found, erwartet ist $FINGERPRINT. Nichts verschlüsselt, nichts abgeglichen."

  # Die Liste: <name> <art> <ordner> <compose-dienst|-> [angaben…]
  local name art folder service extras seen_pairs='' line_no=0
  ENTRIES=''
  while read -r name art folder service extras; do
    [ -n "$name" ] || continue
    line_no=$(( line_no + 1 ))
    case "$name" in *[!a-z0-9-]*|'') die "Zeile $line_no der Liste: der Name „$name“ darf nur a–z, 0–9 und - enthalten" ;; esac
    case "$folder" in *[!A-Za-z0-9_.-]*|''|.|..) die "Zeile $line_no der Liste: Ordner „$folder“ mit unerwarteten Zeichen" ;; esac
    case "$service" in *[!A-Za-z0-9_.-]*|'') die "Zeile $line_no der Liste: Compose-Dienst „$service“ mit unerwarteten Zeichen" ;; esac
    case "$extras" in *[!A-Za-z0-9_./\ -]*|*..*) die "Zeile $line_no der Liste: Angaben mit unerwarteten Zeichen" ;; esac
    case "$art" in
      postgres|clickhouse) [ "$service" != - ] && [ -z "$extras" ] || die "Zeile $line_no der Liste: „$art“ braucht einen Compose-Dienst und keine weiteren Angaben" ;;
      dateien) [ "$service" != - ] || die "Zeile $line_no der Liste: „dateien“ braucht einen Compose-Dienst"
        case "$extras" in /*' '*|'') die "Zeile $line_no der Liste: „dateien“ braucht GENAU einen Pfad im Container" ;; /*) ;; *) die "Zeile $line_no der Liste: der Pfad im Container beginnt mit /" ;; esac ;;
      sqlite) case "$extras" in ''|*' '*|/*) die "Zeile $line_no der Liste: „sqlite“ braucht GENAU einen Pfad, vom Compose-Ordner aus" ;; esac ;;
      einstellungen|ohne) [ "$service" = - ] && [ -n "$extras" ] || die "Zeile $line_no der Liste: „$art“ trägt - als Compose-Dienst und danach mindestens eine Angabe" ;;
      *) die "Zeile $line_no der Liste: unbekannte Art „$art“" ;;
    esac
    if [ "$art" != ohne ]; then
      # shellcheck disable=SC2086
      if in_list "$name/$art" $seen_pairs; then die "Die Liste nennt „$name $art“ zweimal — die Datei im Lauf hieße gleich"; fi
      seen_pairs="$seen_pairs $name/$art"
      ENTRIES="$ENTRIES$name $art $folder $service $extras
"
    fi
  done <<EOF
$(conf_lines)
EOF
  [ -n "$ENTRIES" ] || die "Die Liste $(basename "$CONF") nennt nichts zum Sichern"
  FOLDERS="$(conf_lines | awk '{ print $3 }' | sort -u | tr '\n' ' ')"

  # Kein Compose-Ordner ohne Entscheidung.
  local dir
  for dir in "$APPS_DIR"/*/; do
    [ -e "${dir}docker-compose.yml" ] || [ -e "${dir}compose.yml" ] || continue
    dir="${dir%/}"
    # shellcheck disable=SC2086
    in_list "${dir##*/}" $FOLDERS \
      || die "Der Compose-Ordner „${dir##*/}“ liegt unter $APPS_DIR, steht aber nicht in $(basename "$CONF"). Dort eintragen, dann läuft das Backup wieder."
  done

  # Je Ordner: jeder Dienst hat eine Entscheidung, die Einstellungen sind
  # vollständig, und was der Stack aus seinem Ordner einbindet, kommt mit.
  local json services known files item source rel covered sqlite_paths
  IMAGES=''
  for folder in $FOLDERS; do
    [ -r "$APPS_DIR/$folder/docker-compose.yml" ] || die "Keine lesbare docker-compose.yml in $APPS_DIR/$folder"
    json="$(dc "$folder" config --format json </dev/null)" || die "docker compose config scheitert in $APPS_DIR/$folder"
    services="$(printf '%s' "$json" | jq -r '.services | keys[]')"
    [ -n "$services" ] || die "Die Compose-Datei in „$folder“ nennt keinen Dienst"
    known="$(conf_lines | awk -v f="$folder" '$3 == f { if ($4 != "-") print $4; if ($2 == "ohne") for (i = 5; i <= NF; i++) print $i }' | tr '\n' ' ')"
    for item in $services; do
      # shellcheck disable=SC2086
      in_list "$item" $known \
        || die "Der Dienst „$item“ im Ordner „$folder“ steht nicht in $(basename "$CONF"). Dort eintragen (eine Daten-Zeile oder „ohne“), dann läuft das Backup wieder."
    done
    for item in $known; do
      # shellcheck disable=SC2086
      in_list "$item" $services || die "Die Liste nennt im Ordner „$folder“ den Dienst „$item“, die Compose-Datei kennt ihn nicht"
    done
    files="$(conf_extras "$folder" einstellungen | tr '\n' ' ')"
    # shellcheck disable=SC2086
    in_list docker-compose.yml $files || die "Für den Ordner „$folder“ fehlt die Zeile „einstellungen“ mit docker-compose.yml"
    # shellcheck disable=SC2086
    in_list .env $files || die "Für den Ordner „$folder“ nennt die Zeile „einstellungen“ keine .env"
    for item in $files; do
      [ -r "$APPS_DIR/$folder/$item" ] || die "Im Ordner „$folder“ fehlt „$item“ (oder ist nicht lesbar) — es steht in der Zeile „einstellungen“"
    done
    sqlite_paths="$(conf_extras "$folder" sqlite | tr '\n' ' ')"
    while read -r source; do
      [ -n "$source" ] || continue
      case "$source" in "$APPS_DIR/$folder"/*) rel="${source#"$APPS_DIR/$folder"/}" ;; *) continue ;; esac
      covered=0
      for item in $files; do
        case "$rel" in "$item"|"$item"/*) covered=1 ;; esac
      done
      for item in $sqlite_paths; do
        case "$item" in "$rel"|"$rel"/*) covered=1 ;; esac
      done
      [ "$covered" = 1 ] || die "Der Stack in „$folder“ bindet „$rel“ aus seinem Ordner ein, es steht aber in keiner Zeile der Liste"
    done <<EOF
$(printf '%s' "$json" | jq -r '.services[]?.volumes[]? | select(.type == "bind") | .source')
EOF
    IMAGES="$IMAGES$(printf '%s' "$json" | jq -r --arg f "$folder" '.services | to_entries[] | "\($f) \(.key) \(.value.image // "unbekannt")"')
"
  done

  # Was gesichert wird, muss laufen (und die Quelle da sein).
  while read -r name art folder service extras; do
    [ -n "$name" ] || continue
    case "$art" in
      postgres|clickhouse|dateien)
        [ -n "$(dc "$folder" ps -q "$service" </dev/null)" ] || die "Der Dienst „$service“ im Ordner „$folder“ läuft nicht — kein Abzug für „$name $art“ möglich" ;;
      sqlite)
        command -v sqlite3 >/dev/null 2>&1 || die "Programm fehlt: sqlite3"
        [ -r "$APPS_DIR/$folder/$extras" ] || die "Die SQLite-Datei „$folder/$extras“ fehlt oder ist nicht lesbar" ;;
    esac
  done <<EOF
$ENTRIES
EOF
}

image_of() { printf '%s' "$IMAGES" | awk -v f="$1" -v s="$2" '$1 == f && $2 == s && !seen { print $3; seen = 1 }'; }

# ── Vorschau ────────────────────────────────────────────────────────────────
if [ "$MODE" = '' ]; then
  preflight
  echo "Vorschau — es wird NICHTS geändert."
  echo
  echo "Ordner der Dienste: $APPS_DIR"
  echo "Ein Lauf legt ab:"
  printf '%s' "$ENTRIES" | while read -r name art folder service extras; do
    case "$art" in
      einstellungen) echo "  $name-einstellungen  ←  $folder: $extras" ;;
      sqlite) echo "  $name-sqlite  ←  $folder/$extras" ;;
      dateien) echo "  $name-dateien  ←  $folder, Dienst $service, Ordner $extras" ;;
      *) echo "  $name-$art  ←  $folder, Dienst $service ($(image_of "$folder" "$service"))" ;;
    esac
  done
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
need_mb=$(( prev_bytes * 4 / 1048576 ))
[ "$need_mb" -ge "$MIN_FREE_MB" ] || need_mb="$MIN_FREE_MB"
[ "$free_mb" -ge "$need_mb" ] || die "Zu wenig Platz: $free_mb MB frei, gebraucht werden $need_mb MB"

WORK="$BACKUP_DIR/work-$STAMP"
PARTIAL="$RUNS_DIR/$STAMP.partial"
rm -rf "$WORK" "$PARTIAL"
mkdir "$WORK" "$WORK/out" "$PARTIAL"
: > "$WORK/out/counts.tsv"
META=''

prev() { [ -r "$LAST_OK_META" ] && grep -m1 "^$1=" "$LAST_OK_META" | cut -d= -f2- || true; }
shrunk() { # <jetzt> <vorher> <prozent> → wahr, wenn jetzt unter prozent % von vorher liegt
  case "$2" in ''|*[!0-9]*) return 1 ;; esac
  [ "$2" -gt 0 ] && [ $(( $1 * 100 )) -lt $(( $2 * $3 )) ]
}
refuse_shrink() { # <meldung>
  if [ "$ACCEPT_SHRINK" = 1 ]; then log "⚠ $1 — mit BACKUP_ACCEPT_SHRINK=1 angenommen"; else die "$1. Ist das gewollt (bewusst aufgeräumt), einmal von Hand mit BACKUP_ACCEPT_SHRINK=1 laufen lassen."; fi
}
# Trägt eine fertige Klartext-Datei aus $WORK/out ein und prüft sie gegen den
# letzten guten Lauf: Größe, und (wenn angegeben) die Zahl der Tabellen.
record() { # <datei> <name> <art> [tabellen zeilen]
  local file="$1" key="$2.$3" bytes old
  bytes="$(wc -c < "$WORK/out/$file" | tr -d ' ')"
  [ "$bytes" -gt 0 ] || die "Der Abzug „$file“ ist leer"
  old="$(prev "$key.bytes")"
  case "$old" in ''|*[!0-9]*) old=0 ;; esac
  if [ "$old" -ge "$SHRINK_FLOOR_BYTES" ] && shrunk "$bytes" "$old" "$MIN_SIZE_PERCENT"; then
    refuse_shrink "„$file“ hat $bytes Bytes, beim letzten guten Lauf waren es $old"
  fi
  META="$META$key.bytes=$bytes
"
  if [ "$#" -ge 5 ]; then
    if shrunk "$4" "$(prev "$key.tables")" $(( 100 - MAX_TABLE_LOSS_PERCENT )); then
      refuse_shrink "„$2 $3“ hat nur noch $4 Tabellen, beim letzten guten Lauf waren es $(prev "$key.tables")"
    fi
    META="$META$key.tables=$4
$key.rows=$5
"
    log "$2 $3: $4 Tabellen, $5 Zeilen, $(( bytes / 1024 )) KB"
  else
    log "$2 $3: $(( bytes / 1024 )) KB"
  fi
}

backup_postgres() { # <name> <ordner> <compose-dienst>
  local name="$1" folder="$2" service="$3" out="$1-postgres.sql.gz" dbs db expected got tables=0 rows dump_tables
  dbs="$(echo 'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1;' | pg "$folder" "$service" postgres | tr '\n' ' ')"
  [ -n "${dbs// /}" ] || die "$name: die Abfrage der Datenbanken kam leer zurück"
  case "$dbs" in *[!A-Za-z0-9_\ ]*) die "$name: Datenbank-Name mit unerwarteten Zeichen" ;; esac
  : > "$WORK/pg-counts.txt"
  for db in $dbs; do
    expected="$(echo "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');" | pg "$folder" "$service" "$db")"
    # Je Tabelle eine Zählung, in EINEM Aufruf: die Abfrage baut die
    # Zähl-Befehle, \gexec führt sie aus.
    echo "SELECT format('SELECT %L, %L, count(*) FROM %I.%I', current_database(), schemaname || '.' || tablename, schemaname, tablename) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename \\gexec" \
      | pg "$folder" "$service" "$db" > "$WORK/pg-db.txt"
    got="$(wc -l < "$WORK/pg-db.txt" | tr -d ' ')"
    [ "$got" = "$expected" ] || die "$name: Zählung unvollständig in „$db“: $expected Tabellen, aber $got gezählt"
    if [ "$(grep -Evc '^[A-Za-z0-9_]+\|[A-Za-z0-9_.]+\|[0-9]+$' "$WORK/pg-db.txt" || true)" != 0 ]; then
      die "$name: Tabellenname mit unerwarteten Zeichen in „$db“ — nicht gezählt, nicht geraten"
    fi
    cat "$WORK/pg-db.txt" >> "$WORK/pg-counts.txt"
    tables=$(( tables + got ))
  done
  [ "$tables" -gt 0 ] || die "$name: die Datenbank meldet keine einzige Tabelle"
  awk -F'|' -v n="$name" 'BEGIN { OFS = "\t" } { print n, "postgres", $1 "." $2, $3 }' "$WORK/pg-counts.txt" >> "$WORK/out/counts.tsv"
  rows="$(awk -F'|' '{ s += $3 } END { printf "%d", s }' "$WORK/pg-counts.txt")"
  # shellcheck disable=SC2016
  dc "$folder" exec -T "$service" sh -c 'exec pg_dumpall -U "${POSTGRES_USER:-postgres}"' </dev/null | gzip -6 > "$WORK/out/$out"
  gzip -t "$WORK/out/$out" || die "$name: der Dump ist kein gültiges gzip"
  gunzip -c "$WORK/out/$out" | tail -c 400 | grep -q 'database cluster dump complete' \
    || die "$name: der Dump ist unvollständig (die Schlusszeile „database cluster dump complete“ fehlt)"
  dump_tables="$(gunzip -c "$WORK/out/$out" | grep -Ec '^CREATE (UNLOGGED |FOREIGN )?TABLE ' || true)"
  [ "$dump_tables" -ge "$tables" ] || die "$name: der Dump enthält $dump_tables Tabellen, die Datenbank hat $tables"
  rm -f "$WORK/pg-db.txt" "$WORK/pg-counts.txt"
  META="${META}$name.postgres.image=$(image_of "$folder" "$service")
$name.postgres.databases=${dbs% }
"
  record "$out" "$name" postgres "$tables" "$rows"
}

backup_clickhouse() { # <name> <ordner> <compose-dienst>
  local name="$1" folder="$2" service="$3" out="$1-clickhouse.tar.gz" stage="$WORK/clickhouse-$1" db table engine n tables=0 rows=0
  mkdir "$stage" "$stage/schema" "$stage/data"
  ch "$folder" "$service" "SELECT database, name, engine FROM system.tables WHERE database NOT IN ($CLICKHOUSE_SYSTEM) AND NOT is_temporary ORDER BY database, name FORMAT TSV" > "$stage/tables.tsv"
  [ -s "$stage/tables.tsv" ] || die "$name: ClickHouse meldet keine einzige Tabelle"
  while IFS="$TAB" read -r db table engine <&3; do
    case "$db$table$engine" in *[!A-Za-z0-9_]*) die "$name: Tabellenname mit unerwarteten Zeichen — nicht gesichert, nicht geraten" ;; esac
    ch "$folder" "$service" "SHOW CREATE TABLE \`$db\`.\`$table\` FORMAT TSVRaw" > "$stage/schema/$db.$table.sql"
    [ -s "$stage/schema/$db.$table.sql" ] || die "$name: keine Bauanleitung für $db.$table"
    tables=$(( tables + 1 ))
    # shellcheck disable=SC2086
    if in_list "$engine" $CLICKHOUSE_NO_DATA; then continue; fi
    n="$(ch "$folder" "$service" "SELECT count() FROM \`$db\`.\`$table\`")"
    case "$n" in ''|*[!0-9]*) die "$name: die Zählung von $db.$table kam ohne Zahl zurück" ;; esac
    ch "$folder" "$service" "SELECT * FROM \`$db\`.\`$table\` FORMAT Native" > "$stage/data/$db.$table.native"
    if [ "$n" -gt 0 ] && [ ! -s "$stage/data/$db.$table.native" ]; then die "$name: $db.$table hat $n Zeilen, der Abzug ist leer"; fi
    printf '%s\tclickhouse\t%s.%s\t%s\n' "$name" "$db" "$table" "$n" >> "$WORK/out/counts.tsv"
    rows=$(( rows + n ))
  done 3< "$stage/tables.tsv"
  tar czf "$WORK/out/$out" -C "$stage" tables.tsv schema data
  [ "$(tar tzf "$WORK/out/$out" | grep -c '^schema/.')" = "$tables" ] || die "$name: im Archiv fehlen Bauanleitungen"
  rm -rf "$stage"
  META="${META}$name.clickhouse.image=$(image_of "$folder" "$service")
"
  record "$out" "$name" clickhouse "$tables" "$rows"
}

backup_sqlite() { # <name> <ordner> <pfad>
  local name="$1" source="$APPS_DIR/$2/$3" copy="$WORK/$1.sqlite" out="$1-sqlite.gz" table n tables=0 rows=0
  # Die Backup-Funktion von SQLite liest unter einer Lese-Sperre einen
  # zusammenhängenden Stand — ein `cp` der Datei könnte mitten in einen
  # Schreibvorgang fallen.
  sqlite3 -readonly "$source" '.timeout 20000' ".backup '$copy'" </dev/null
  [ -s "$copy" ] || die "$name: der Abzug der SQLite-Datei ist leer"
  [ "$(sqlite3 "$copy" 'PRAGMA integrity_check;' </dev/null)" = ok ] || die "$name: der Abzug der SQLite-Datei besteht die Prüfung nicht"
  sqlite3 "$copy" "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY 1;" </dev/null > "$WORK/sqlite-tables.txt"
  while read -r table <&3; do
    case "$table" in *[!A-Za-z0-9_]*|'') die "$name: Tabellenname mit unerwarteten Zeichen — nicht gezählt, nicht geraten" ;; esac
    n="$(sqlite3 "$copy" "SELECT count(*) FROM \"$table\";" </dev/null)"
    printf '%s\tsqlite\t%s\t%s\n' "$name" "$table" "$n" >> "$WORK/out/counts.tsv"
    tables=$(( tables + 1 ))
    rows=$(( rows + n ))
  done 3< "$WORK/sqlite-tables.txt"
  [ "$tables" -gt 0 ] || die "$name: die SQLite-Datei enthält keine einzige Tabelle"
  gzip -6 -c "$copy" > "$WORK/out/$out"
  rm -f "$copy" "$WORK/sqlite-tables.txt"
  record "$out" "$name" sqlite "$tables" "$rows"
}

backup_files() { # <name> <ordner> <compose-dienst> <pfad im container>
  local name="$1" out="$1-dateien.tar.gz" entries
  dc "$2" exec -T "$3" tar czf - -C "$4" . </dev/null > "$WORK/out/$out"
  entries="$(tar tzf "$WORK/out/$out" | wc -l | tr -d ' ')" || die "$name: das Archiv der Dateien ist nicht lesbar"
  [ "$entries" -gt 0 ] || die "$name: das Archiv der Dateien ist leer"
  META="${META}$name.dateien.entries=$entries
"
  record "$out" "$name" dateien
}

backup_settings() { # <name> <ordner> <dateien…>
  local name="$1" folder="$2" out="$1-einstellungen.tar.gz"
  shift 2
  tar czf "$WORK/out/$out" -C "$APPS_DIR/$folder" "$@"
  tar tzf "$WORK/out/$out" > "$WORK/settings.list"
  grep -qx '\.env' "$WORK/settings.list" || die "$name: die .env fehlt im Archiv der Einstellungen"
  rm -f "$WORK/settings.list"
  META="${META}$name.einstellungen.files=$*
"
  record "$out" "$name" einstellungen
}

# 1) Abzüge — in der Reihenfolge der Liste. Die .env verlässt den Server nur
#    verschlüsselt.
while read -r name art folder service extras <&4; do
  [ -n "$name" ] || continue
  STEP="$name-$art"
  case "$art" in
    postgres) backup_postgres "$name" "$folder" "$service" ;;
    clickhouse) backup_clickhouse "$name" "$folder" "$service" ;;
    sqlite) backup_sqlite "$name" "$folder" "$extras" ;;
    dateien) backup_files "$name" "$folder" "$service" "$extras" ;;
    # shellcheck disable=SC2086
    einstellungen) backup_settings "$name" "$folder" $extras ;;
  esac
done 4<<EOF
$ENTRIES
EOF
ARTIFACTS="$(printf '%s' "$ENTRIES" | grep -c . || true)"
ROWS="$(awk -F'\t' '{ s += $4 } END { printf "%d", s }' "$WORK/out/counts.tsv")"
TABLES="$(wc -l < "$WORK/out/counts.tsv" | tr -d ' ')"

# 2) Verschlüsseln — danach gibt es im Lauf-Ordner keinen Klartext.
STEP='verschluesseln'
for plain in "$WORK"/out/*; do
  gpg --batch --quiet --no-tty --homedir "$GNUPG_TMP" --trust-model always --compress-algo none \
    --recipient-file "$PUBKEY" --output "$PARTIAL/$(basename "$plain").gpg" --encrypt "$plain"
  [ -s "$PARTIAL/$(basename "$plain").gpg" ] || die "Verschlüsseln von $(basename "$plain") ergab eine leere Datei"
  rm -f "$plain"
done
[ "$(find "$PARTIAL" -name '*.gpg' | wc -l | tr -d ' ')" = $(( ARTIFACTS + 1 )) ] \
  || die "Im Lauf-Ordner liegen nicht $(( ARTIFACTS + 1 )) verschlüsselte Dateien"
{
  echo "format=$FORMAT"
  echo "stamp=$STAMP"
  echo "apps_dir=$APPS_DIR"
  echo "key_fingerprint=$FINGERPRINT"
  echo "artifacts=$ARTIFACTS"
  echo "tables=$TABLES"
  echo "rows=$ROWS"
  printf '%s' "$META"
} > "$PARTIAL/backup.meta"
( cd "$PARTIAL" && sha256sum -- *.gpg backup.meta > SHA256SUMS )
FILES="$(find "$PARTIAL" -type f | wc -l | tr -d ' ')"
BYTES="$(cat "$PARTIAL"/* | wc -c | tr -d ' ')"
mv "$PARTIAL" "$RUNS_DIR/$STAMP"
PARTIAL=''
log "Lauf-Ordner fertig: $FILES Dateien, $(( BYTES / 1024 )) KB, verschlüsselt für $FINGERPRINT"

# 3) Außer Haus — OHNE --delete. Was auf der Box liegt, bleibt dort, auch
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

# 4) Aufbewahrung — lokal und auf der Box getrennt, nur nach dem Namen.
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

# 5) Stand — erst jetzt gilt der Lauf als gut.
STEP='fertig'
cp "$RUNS_DIR/$STAMP/backup.meta" "$LAST_OK_META"
write_state ok fertig "$BYTES" "$FILES"
log "Backup fertig: $STAMP, $FILES Dateien, $(( BYTES / 1024 )) KB, $TABLES Tabellen, $ROWS Zeilen, $(ls "$RUNS_DIR" | grep -Ec "$RUN_NAME") Läufe lokal"
