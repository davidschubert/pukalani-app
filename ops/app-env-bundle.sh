#!/usr/bin/env bash
# Die .env-Dateien der Apps als EIN verschlüsseltes Bündel (BU1 b, 2026-11-18).
#
# WO ES LÄUFT: auf dem App-Server, als Benutzer `ploi` (kein root). Der
# Appwrite-Server HOLT das Bündel jede Nacht ab (ops/appwrite-backup.sh,
# Env APP_ENV_SOURCE) und legt es neben das Backup der Datenbank. Vom
# App-Server führt damit weiter kein Weg zum Appwrite-Server oder zur Ablage.
# Den Zugang beschränkt eine Zeile in ~/.ssh/authorized_keys des App-Servers:
#   restrict,command="/home/ploi/ops/app-env-bundle.sh" ssh-ed25519 … backup-abholer
# Mit ihr kann der Schlüssel NUR dieses Skript starten; das Wort, das der
# Abholer schickt, kommt als SSH_ORIGINAL_COMMAND an und wird nur verglichen,
# nie ausgeführt. Einrichten: docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6.1.
#
# AUFRUF (ein Wort, als Angabe oder über SSH_ORIGINAL_COMMAND)
#   app-env-bundle.sh [bundle]   verschlüsseltes Bündel auf die Standard-Ausgabe
#   app-env-bundle.sh list       je Site eine Zeile: <site> vorhanden|fehlt|leer|unlesbar
#
# WAS IM BÜNDEL LIEGT: ein tar.gz mit `<site>/.env` für JEDE Site aus
# apps.conf, mit dem ÖFFENTLICHEN Schlüssel des Backups verschlüsselt (derselbe
# wie für die Datenbank). Fehlt eine .env oder ist sie leer, gibt es KEIN
# Bündel — ein halbes sähe aus wie ein ganzes. Der Klartext berührt nie die
# Platte: tar schreibt direkt in gpg, gpg direkt auf die Standard-Ausgabe.
# Meldungen gehen nur auf die Fehlerausgabe und nennen nie einen Wert oder
# einen Variablennamen aus einer .env.
#
# Env:
#   APP_ENV_APPS_CONF        Default <skript-ordner>/apps.conf (`<app> <site>` je Zeile)
#   APP_ENV_BASE             Default /home/ploi — die Datei je Site ist <base>/<site>/.env
#   BACKUP_PUBLIC_KEY        Default <skript-ordner>/appwrite-backup.pub.asc
#   BACKUP_KEY_FINGERPRINT   erwarteter Fingerabdruck (Default unten, derselbe
#                            wie in ops/appwrite-backup.sh — ein Test hält das)
#
# Exit: 0 ok · 1 gescheitert (nichts auf der Standard-Ausgabe) · 2 Aufruf falsch
set -euo pipefail
umask 077
# macOS-tar legt sonst Begleitdateien für erweiterte Attribute dazu.
export COPYFILE_DISABLE=1

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"

# Derselbe Schlüssel wie in ops/appwrite-backup.sh.
DEFAULT_FINGERPRINT='3724B4F1FE604CFD036F3F0D099D7563EA924920'

APPS_CONF="${APP_ENV_APPS_CONF:-$SELF_DIR/apps.conf}"
BASE="${APP_ENV_BASE:-/home/ploi}"
PUBKEY="${BACKUP_PUBLIC_KEY:-$SELF_DIR/appwrite-backup.pub.asc}"
FINGERPRINT="${BACKUP_KEY_FINGERPRINT:-$DEFAULT_FINGERPRINT}"
GNUPG_TMP=''

die() { echo "app-env-bundle: ✗ $*" >&2; exit 1; }

# Das Wort: als Angabe (von Hand, Tests) oder — mit erzwungenem Befehl in
# authorized_keys — aus SSH_ORIGINAL_COMMAND. Verglichen wird die GANZE
# Zeichenkette; Fremdes wird nicht wiederholt und schon gar nicht ausgeführt.
[ "$#" -le 1 ] || { echo "app-env-bundle: Aufruf: $(basename "$0") [bundle|list]" >&2; exit 2; }
WORD="${1:-${SSH_ORIGINAL_COMMAND:-}}"
case "$WORD" in
  ''|bundle) WORD=bundle ;;
  list) ;;
  *) echo "app-env-bundle: unbekanntes Wort. Erlaubt: bundle, list" >&2; exit 2 ;;
esac

finish() {
  local code=$?
  trap - EXIT
  [ -n "$GNUPG_TMP" ] && rm -rf "$GNUPG_TMP"
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT TERM HUP

[ -r "$APPS_CONF" ] || die "App-Liste fehlt: $APPS_CONF"
SITES="$(awk '!/^[[:space:]]*(#|$)/ { print $2 }' "$APPS_CONF")"
[ -n "$SITES" ] || die "In $APPS_CONF steht keine Site"
for site in $SITES; do
  case "$site" in
    .*|-*|*..*|*[!a-z0-9.-]*) die "Unerwarteter Site-Name in $(basename "$APPS_CONF")" ;;
  esac
done

state_of() { # <site> → vorhanden|fehlt|leer|unlesbar
  local file="$BASE/$1/.env"
  if [ ! -e "$file" ]; then echo fehlt
  elif [ ! -f "$file" ] || [ ! -r "$file" ]; then echo unlesbar
  elif [ ! -s "$file" ]; then echo leer
  else echo vorhanden
  fi
}

if [ "$WORD" = list ]; then
  for site in $SITES; do
    echo "$site $(state_of "$site")"
  done
  exit 0
fi

# ── bundle ──────────────────────────────────────────────────────────────────
for tool in gpg tar gzip awk; do
  command -v "$tool" >/dev/null 2>&1 || die "Programm fehlt: $tool"
done
[ ! -t 1 ] || die "Die Standard-Ausgabe ist ein Terminal — das Bündel gehört in eine Datei oder an den Abholer"

FILES=''
COUNT=0
for site in $SITES; do
  state="$(state_of "$site")"
  [ "$state" = vorhanden ] || die "Die .env von $site ist $state — kein Bündel (ein halbes sähe aus wie ein ganzes)"
  FILES="$FILES $site/.env"
  COUNT=$(( COUNT + 1 ))
done

[ -r "$PUBKEY" ] || die "Öffentlicher Schlüssel fehlt: $PUBKEY"
GNUPG_TMP="$(mktemp -d "${TMPDIR:-/tmp}/app-env-bundle-gpg.XXXXXX")"
found="$(gpg --batch --no-tty --homedir "$GNUPG_TMP" --show-keys --with-colons "$PUBKEY" 2>/dev/null | awk -F: '/^fpr:/ && !seen { print $10; seen = 1 }')"
[ -n "$found" ] || die "Die Datei $PUBKEY enthält keinen lesbaren öffentlichen Schlüssel"
[ "$found" = "$FINGERPRINT" ] \
  || die "Falscher Schlüssel: $PUBKEY trägt den Fingerabdruck $found, erwartet ist $FINGERPRINT. Nichts verschlüsselt."

# tar → gpg → Standard-Ausgabe. Scheitert einer der beiden, endet das Skript
# mit Fehler (pipefail), und der Abholer verwirft, was bis dahin kam.
# shellcheck disable=SC2086
tar czf - -C "$BASE" $FILES \
  | gpg --batch --quiet --no-tty --homedir "$GNUPG_TMP" --trust-model always --compress-algo none \
      --recipient-file "$PUBKEY" --encrypt

echo "app-env-bundle: $COUNT Sites verschlüsselt für $FINGERPRINT" >&2
