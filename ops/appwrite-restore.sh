#!/usr/bin/env bash
# Appwrite aus einem Backup-Lauf zurückspielen (OPS-001, 2026-11-15).
#
# FÜR DEN FALL „SERVER WEG": aus einem Lauf-Ordner, wie ihn
# ops/appwrite-backup.sh auf die Storage Box legt, und dem EINEN privaten
# Schlüssel entsteht auf einem Rechner OHNE Appwrite eine lauffähige Instanz.
# Braucht nur bash, docker (mit compose), gpg, jq, tar, gzip, sha256sum — kein
# Node, kein Repo, keinen Zugang zum alten Server.
#
# Anleitung Schritt für Schritt (woher die Dateien kommen, wo der Schlüssel
# liegt, was danach zu tun ist): docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md
#
# AUFRUF
#   appwrite-restore.sh <lauf-ordner> --key <privater-schluessel> --target <ordner>
#       Vorschau: prüft Prüfsummen, Schlüssel und Zielrechner. Ändert nichts.
#   … --apply
#       spielt zurück: Einstellungen → Datenbank → Zählung → Volumes → Start
#   … --apply --services "mariadb redis appwrite traefik"
#       startet am Ende nur diese Dienste (für eine Übung: ohne Worker und
#       ohne Zeitplan-Dienste verschickt die Kopie nichts und erneuert kein
#       Zertifikat). Ohne die Angabe startet alles.
#
#   <lauf-ordner>  ein Ordner runs/<JJJJ-MM-TT-HHMMSS> mit *.gpg, backup.meta, SHA256SUMS
#   --key          der private Schlüssel als Datei (ASCII, ohne Passwort)
#   --target       der neue Compose-Ordner; darf nicht existieren oder muss leer
#                  sein. Sein NAME wird der Name des Compose-Projekts und damit
#                  die Vorsilbe der Volumes — für einen Ersatz der Production:
#                  denselben Namen wählen wie auf dem alten Server.
#
# SICHERUNG: das Skript weigert sich, wenn auf dem Rechner schon ein Container
# oder ein Volume einer Appwrite-Instanz liegt. Es überschreibt nie etwas —
# auch nicht mit einem Schalter. Wer auf einen Rechner mit kaputter Instanz
# zurückspielen will, räumt sie vorher bewusst von Hand ab (Runbook).
#
# GEZÄHLT wird direkt nach dem Einspielen des Dumps, bevor Appwrite startet:
# jede Tabelle gegen die Zählung aus dem Backup. Abweichen dürfen nur Tabellen,
# in die Appwrite laufend schreibt (Sitzungen, Statistik, Protokolle) — die
# Zählung entsteht Sekunden vor dem Dump. Alles andere ist ein Abbruch.
#
# Exit: 0 ok · 1 gescheitert · 2 Aufruf falsch · 4 Zielrechner nicht leer
set -euo pipefail
umask 077

usage() {
  echo "Aufruf: $(basename "$0") <lauf-ordner> --key <privater-schluessel> --target <ordner> [--apply] [--services \"…\"]" >&2
  exit 2
}

RUN=''
KEY=''
TARGET=''
APPLY=0
SERVICES=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --key) [ "$#" -ge 2 ] || usage; KEY="$2"; shift 2 ;;
    --target) [ "$#" -ge 2 ] || usage; TARGET="$2"; shift 2 ;;
    --services) [ "$#" -ge 2 ] || usage; SERVICES="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    -*) usage ;;
    *) [ -z "$RUN" ] || usage; RUN="$1"; shift ;;
  esac
done
[ -n "$RUN" ] && [ -n "$KEY" ] && [ -n "$TARGET" ] || usage
case "$SERVICES" in *[!a-z0-9\ -]*) echo "--services: nur Dienstnamen, durch Leerzeichen getrennt." >&2; exit 2 ;; esac

HELPER_IMAGE="${RESTORE_HELPER_IMAGE:-alpine}"
WAIT_DB="${RESTORE_WAIT_DB:-180}"
WAIT_UP="${RESTORE_WAIT_UP:-600}"
# Tabellen, in die Appwrite laufend schreibt (samt ihrer Rechte-Tabellen).
VOLATILE='^_([0-9]+|console)_(audit|stats|cache|realtime|presenceLogs|abuse|schedules|sessions)(_perms)?$'
SYSTEM_SCHEMAS="'information_schema','performance_schema','mysql','sys'"

WORK=''
GNUPG_TMP=''
STARTED="$(date +%s)"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "✗ $*"; exit 1; }
finish() {
  local code=$?
  trap - EXIT
  [ -n "$WORK" ] && rm -rf "$WORK"
  [ -n "$GNUPG_TMP" ] && rm -rf "$GNUPG_TMP"
  exit "$code"
}
trap finish EXIT

meta() { grep -m1 "^$1=" "$RUN/backup.meta" | cut -d= -f2- || true; }
dc() { ( cd "$TARGET" && docker compose "$@" ); }
sql() { dc exec -T mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r'; }
decrypt() { # <quelle.gpg> <ziel>
  gpg --batch --quiet --no-tty --homedir "$GNUPG_TMP" --pinentry-mode loopback --passphrase '' \
    --output "$2" --decrypt "$1" 2>/dev/null
}

# ── Prüfen (läuft auch in der Vorschau, ändert nichts) ──────────────────────
for tool in docker gpg gzip tar jq sha256sum awk; do
  command -v "$tool" >/dev/null 2>&1 || die "Programm fehlt: $tool"
done
[ -d "$RUN" ] || die "Lauf-Ordner nicht gefunden: $RUN"
RUN="$(cd "$RUN" && pwd)"
[ -r "$RUN/SHA256SUMS" ] && [ -r "$RUN/backup.meta" ] || die "In $RUN fehlen SHA256SUMS oder backup.meta — das ist kein vollständiger Lauf"
[ "$(meta format)" = 2 ] || die "Unbekanntes Format „$(meta format)“ in backup.meta (dieses Skript kennt 2)"
( cd "$RUN" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) \
  || die "Prüfsummen stimmen nicht: mindestens eine Datei in $RUN ist beschädigt oder fehlt. Einen anderen Lauf nehmen."
for needed in db.sql.gz.gpg config.tar.gz.gpg counts.tsv.gpg; do
  [ -s "$RUN/$needed" ] || die "Im Lauf fehlt $needed"
done

[ -r "$KEY" ] || die "Schlüssel-Datei nicht lesbar: $KEY"
GNUPG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/appwrite-restore-gpg.XXXXXX")"
gpg --batch --quiet --no-tty --homedir "$GNUPG_TMP" --import "$KEY" 2>/dev/null \
  || die "Die Datei $KEY ist kein lesbarer privater Schlüssel"
have="$(gpg --batch --no-tty --homedir "$GNUPG_TMP" --list-secret-keys --with-colons 2>/dev/null | awk -F: '/^fpr:/ && !seen { print $10; seen = 1 }')"
want="$(meta key_fingerprint)"
[ -n "$have" ] || die "Die Datei $KEY enthält keinen privaten Schlüssel"
[ "$have" = "$want" ] || die "Falscher Schlüssel: das Backup ist für $want verschlüsselt, die Datei enthält $have"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/appwrite-restore.XXXXXX")"
decrypt "$RUN/counts.tsv.gpg" "$WORK/counts.tsv" || die "Der Schlüssel öffnet das Backup nicht (Probe an counts.tsv.gpg)"
BACKUP_TABLES="$(wc -l < "$WORK/counts.tsv" | tr -d ' ')"
[ "$BACKUP_TABLES" = "$(meta tables)" ] || die "Die Zählung im Backup hat $BACKUP_TABLES Zeilen, backup.meta nennt $(meta tables) Tabellen"

case "$TARGET" in /*) ;; *) TARGET="$PWD/$TARGET" ;; esac
if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  log "✗ Der Zielordner $TARGET ist nicht leer. Nichts geändert."
  exit 4
fi
PROJECT="$(basename "$TARGET")"
docker info >/dev/null 2>&1 || die "docker antwortet nicht (läuft der Dienst, darf dieser Benutzer ihn nutzen?)"
existing="$(docker ps -a --format '{{.Names}}' | grep -E '^(appwrite|appwrite-mariadb|appwrite-redis|appwrite-traefik)$' || true)"
existing_project="$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT")"
existing_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
if [ -n "$existing" ] || [ -n "$existing_project" ] || [ -n "$existing_volumes" ]; then
  log "✗ Auf diesem Rechner liegt schon eine Appwrite-Instanz (Container oder Volumes des Projekts „$PROJECT“)."
  log "  Dieses Skript überschreibt nichts. Auf einem leeren Rechner zurückspielen — oder die alte Instanz"
  log "  vorher bewusst von Hand abräumen (Runbook, Abschnitt „Der alte Server steht noch“)."
  exit 4
fi

echo
echo "Lauf:            $(meta stamp)  ($(meta appwrite_image))"
echo "Inhalt:          $(meta databases) Datenbank(en), $(meta tables) Tabellen, $(meta rows) Zeilen, Dump $(( $(meta dump_bytes) / 1048576 )) MB"
echo "Volumes:         $(ls "$RUN" | sed -n 's/^volume-\(.*\)\.tar\.gz\.gpg$/\1/p' | tr '\n' ' ')"
echo "Einstellungen:   $(meta config_files)"
echo "Prüfsummen:      stimmen"
echo "Schlüssel:       passt ($want)"
echo "Ziel:            $TARGET (Compose-Projekt „$PROJECT“), Rechner ohne Appwrite"
[ -z "$SERVICES" ] || echo "Start am Ende:   nur $SERVICES"
echo
if [ "$APPLY" != 1 ]; then
  echo "Vorschau — nichts geändert. Zurückspielen: dieselbe Zeile mit --apply"
  exit 0
fi

# ── Zurückspielen ───────────────────────────────────────────────────────────
log "1/6 Entschlüsseln"
for enc in "$RUN"/*.gpg; do
  plain="$WORK/$(basename "${enc%.gpg}")"
  [ -e "$plain" ] || decrypt "$enc" "$plain" || die "Entschlüsseln von $(basename "$enc") ist gescheitert"
done
gzip -t "$WORK/db.sql.gz" || die "Der Dump ist kein gültiges gzip"
gunzip -c "$WORK/db.sql.gz" | tail -c 400 | grep -q 'Dump completed' || die "Der Dump ist unvollständig"

log "2/6 Einstellungen nach $TARGET"
mkdir -p "$TARGET"
tar xzpf "$WORK/config.tar.gz" -C "$TARGET"
[ -r "$TARGET/.env" ] && [ -r "$TARGET/docker-compose.yml" ] || die "Im Archiv der Einstellungen fehlen .env oder docker-compose.yml"
grep -Eq '^_APP_OPENSSL_KEY_V1=.+' "$TARGET/.env" || die "In der zurückgespielten .env fehlt _APP_OPENSSL_KEY_V1"
CONFIG_JSON="$(dc config --format json </dev/null)" || die "docker compose config scheitert im Zielordner"

log "3/6 Datenbank starten und Dump einspielen"
dc up -d mariadb </dev/null
waited=0
until echo 'SELECT 1;' | sql >/dev/null 2>&1; do
  [ "$waited" -lt "$WAIT_DB" ] || die "Die Datenbank antwortet nach $WAIT_DB s nicht"
  sleep 3
  waited=$(( waited + 3 ))
done
# shellcheck disable=SC2016
gunzip -c "$WORK/db.sql.gz" | dc exec -T mariadb sh -c 'exec mariadb --max-allowed-packet=1G -uroot -p"$MYSQL_ROOT_PASSWORD"' \
  || die "Das Einspielen des Dumps ist gescheitert"

log "4/6 Zählen gegen das Backup"
echo "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ($SYSTEM_SCHEMAS) ORDER BY 1, 2;" | sql > "$WORK/tables.tsv"
: > "$WORK/now.tsv"
chunk=''
n=0
while IFS="$(printf '\t')" read -r db table; do
  case "$db$table" in *[!A-Za-z0-9_]*) die "Tabellenname mit unerwarteten Zeichen" ;; esac
  part="SELECT '$db', '$table', COUNT(*) FROM \`$db\`.\`$table\`"
  if [ -z "$chunk" ]; then chunk="$part"; else chunk="$chunk UNION ALL $part"; fi
  n=$(( n + 1 ))
  if [ "$n" -ge 150 ]; then
    printf '%s;\n' "$chunk" | sql >> "$WORK/now.tsv"
    chunk=''
    n=0
  fi
done < "$WORK/tables.tsv"
[ -z "$chunk" ] || printf '%s;\n' "$chunk" | sql >> "$WORK/now.tsv"
# Vergleich: Schlüssel „datenbank<TAB>tabelle", Wert Zeilenzahl.
awk -F'\t' -v volatile="$VOLATILE" '
  NR == FNR { want[$1 FS $2] = $3; next }
  { have[$1 FS $2] = $3 }
  END {
    for (k in want) {
      total++
      split(k, p, FS)
      if (!(k in have)) { missing++; print "  FEHLT: " p[2]; continue }
      if (have[k] == want[k]) { same++; continue }
      if (p[2] ~ volatile) { drift++; continue }
      bad++; print "  WEICHT AB: " p[2] " (Backup " want[k] ", jetzt " have[k] ")"
    }
    for (k in have) if (!(k in want)) { extra++ }
    printf "SUMME %d %d %d %d %d %d\n", total, same, drift, bad + 0, missing + 0, extra + 0
  }' "$WORK/counts.tsv" "$WORK/now.tsv" > "$WORK/compare.txt"
grep -v '^SUMME ' "$WORK/compare.txt" | head -40 || true
# shellcheck disable=SC2046
set -- $(grep '^SUMME ' "$WORK/compare.txt")
log "Tabellen im Backup: $2 · zählgleich: $3 · abweichend, weil flüchtig: $4 · abweichend sonst: $5 · fehlend: $6 · zusätzlich: $7"
[ "$5" = 0 ] && [ "$6" = 0 ] || die "Die Zählung stimmt nicht mit dem Backup überein — Instanz NICHT gestartet"
# Konten je Projekt (nur Zahlen): _console_projects nennt die interne Nummer.
echo "SELECT _uid, _id FROM appwrite._console_projects ORDER BY _id;" | sql 2>/dev/null > "$WORK/projects.tsv" || true
while IFS="$(printf '\t')" read -r uid internal; do
  [ -n "$uid" ] || continue
  was="$(awk -F'\t' -v t="_${internal}_users" '$2 == t { print $3 }' "$WORK/counts.tsv")"
  now="$(awk -F'\t' -v t="_${internal}_users" '$2 == t { print $3 }' "$WORK/now.tsv")"
  log "Projekt $uid: $now Konten (Backup: $was)"
done < "$WORK/projects.tsv"

log "5/6 Volumes anlegen und füllen"
dc up --no-start </dev/null
for archive in "$WORK"/volume-*.tar.gz; do
  [ -e "$archive" ] || continue
  key="$(basename "$archive" .tar.gz)"
  key="${key#volume-}"
  name="$(printf '%s' "$CONFIG_JSON" | jq -r --arg k "$key" '.volumes[$k].name // empty')"
  [ -n "$name" ] || die "Das Volume „$key“ aus dem Backup kennt die Compose-Datei nicht"
  docker volume inspect "$name" >/dev/null 2>&1 || die "Das Volume $name wurde nicht angelegt"
  docker run --rm -i -v "$name":/data "$HELPER_IMAGE" tar xzf - -C /data < "$archive" \
    || die "Das Füllen von $name ist gescheitert"
  log "  $key → $name ($(tar tzf "$archive" | wc -l | tr -d ' ') Einträge)"
done

log "6/6 Starten"
# shellcheck disable=SC2086
dc up -d $SERVICES </dev/null
container="$(dc ps -q appwrite </dev/null | sed -n 1p)"
[ -n "$container" ] || die "Der Dienst appwrite wurde nicht gestartet"
waited=0
while :; do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo fehlt)"
  case "$health" in healthy|running) break ;; esac
  [ "$waited" -lt "$WAIT_UP" ] || die "Appwrite ist nach $WAIT_UP s nicht gesund (Zustand: $health). Protokoll: docker compose logs appwrite"
  sleep 5
  waited=$(( waited + 5 ))
done

log "✔ Zurückgespielt: Lauf $(meta stamp), Appwrite $health, Dauer $(( $(date +%s) - STARTED )) s"
echo
echo "Als Nächstes (Runbook, Abschnitt „Nach dem Zurückspielen“):"
echo "  1. Antwortet die Instanz?  curl -s http://localhost/v1/health/version"
echo "  2. Adresse der API auf den neuen Server zeigen lassen, dann von außen prüfen."
echo "  3. Ein Konto anmelden, eine hochgeladene Datei öffnen."
echo "  4. Das nächtliche Backup auf dem neuen Server wieder einrichten."
