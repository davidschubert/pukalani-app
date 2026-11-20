#!/usr/bin/env bash
# Spielt einen ClickHouse-Abzug aus ops/docker-apps-backup.sh in eine LEERE
# ClickHouse-Instanz zurück. Anleitung mit allen Schritten davor und danach:
# docs/runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md
#
# AUFRUF
#   CLICKHOUSE_CLIENT='docker exec -i <container> clickhouse-client' \
#     docker-apps-restore-clickhouse.sh <ordner>
#
# <ordner> ist das ENTPACKTE Archiv `<name>-clickhouse.tar.gz` (darin
# tables.tsv, schema/, data/). Das Skript überschreibt nichts: steht in einer
# der Datenbanken des Abzugs schon eine Tabelle, bricht es vor dem ersten
# Handgriff ab. Am Ende gibt es je Tabelle die Zeilenzahl aus — in der Form
# der Spalten 3 und 4 von counts.tsv, zum Vergleich mit `diff`.
#
# DIE REIHENFOLGE IST DER GRUND FÜR DIESES SKRIPT:
#   1. Wörterbücher — Tabellen rechnen Spalten über `dictGet` aus und lassen
#      sich ohne das Wörterbuch nicht anlegen. Ein Wörterbuch lädt erst beim
#      ersten Zugriff, seine Quell-Tabelle darf also noch fehlen.
#   2. Tabellen
#   3. Daten, zuerst in Tabellen OHNE `dictGet` (daraus lesen die
#      Wörterbücher), dann in die übrigen — sonst rechnete ClickHouse beim
#      Einfügen mit einem leeren Wörterbuch.
#   4. Sichten zuletzt — eine mitschreibende Sicht schriebe beim Füllen doppelt.
#
# Exit: 0 ok · 1 gescheitert · 2 Aufruf falsch
set -euo pipefail

[ "$#" = 1 ] || { echo "Aufruf: CLICKHOUSE_CLIENT='…' $(basename "$0") <entpackter-ordner>" >&2; exit 2; }
DIR="$1"
CLIENT="${CLICKHOUSE_CLIENT:?CLICKHOUSE_CLIENT fehlt — etwa: docker exec -i <container> clickhouse-client}"
[ -r "$DIR/tables.tsv" ] && [ -d "$DIR/schema" ] && [ -d "$DIR/data" ] \
  || { echo "✗ In $DIR liegen nicht tables.tsv, schema/ und data/ — ist das Archiv entpackt?" >&2; exit 2; }
cd "$DIR"

TAB="$(printf '\t')"
die() { echo "✗ $*" >&2; exit 1; }
# shellcheck disable=SC2086
query() { $CLIENT -q "$1" </dev/null; }
# shellcheck disable=SC2086
run_file() { $CLIENT --multiquery < "$1"; }

kind() { # <engine> → dict | view | table
  case "$1" in
    Dictionary) echo dict ;;
    View|MaterializedView|LiveView|WindowView) echo view ;;
    *) echo table ;;
  esac
}

while IFS="$TAB" read -r db table engine; do
  case "$db$table$engine" in *[!A-Za-z0-9_]*|'') die "tables.tsv nennt einen Namen mit unerwarteten Zeichen" ;; esac
  [ -s "schema/$db.$table.sql" ] || die "Die Bauanleitung schema/$db.$table.sql fehlt"
done < tables.tsv

DATABASES="$(cut -f1 tables.tsv | sort -u)"
[ "$(query 'SELECT 1')" = 1 ] || die "ClickHouse antwortet nicht über: $CLIENT"
for db in $DATABASES; do
  existing="$(query "SELECT count() FROM system.tables WHERE database = '$db'")"
  [ "$existing" = 0 ] || die "In der Datenbank „$db“ stehen schon $existing Tabellen — zurückgespielt wird nur in eine leere Instanz"
done
for db in $DATABASES; do query "CREATE DATABASE IF NOT EXISTS \`$db\`"; done

for want in dict table; do
  while IFS="$TAB" read -r db table engine <&3; do
    if [ "$(kind "$engine")" = "$want" ]; then run_file "schema/$db.$table.sql"; fi
  done 3< tables.tsv
done

for pass in ohne mit; do
  while IFS="$TAB" read -r db table engine <&3; do
    [ "$(kind "$engine")" = table ] || continue
    [ -s "data/$db.$table.native" ] || continue
    if grep -q dictGet "schema/$db.$table.sql"; then has=mit; else has=ohne; fi
    [ "$has" = "$pass" ] || continue
    # shellcheck disable=SC2086
    $CLIENT -q "INSERT INTO \`$db\`.\`$table\` FORMAT Native" < "data/$db.$table.native"
  done 3< tables.tsv
done

while IFS="$TAB" read -r db table engine <&3; do
  if [ "$(kind "$engine")" = view ]; then run_file "schema/$db.$table.sql"; fi
done 3< tables.tsv

while IFS="$TAB" read -r db table engine <&3; do
  [ "$(kind "$engine")" = table ] || continue
  printf '%s.%s\t%s\n' "$db" "$table" "$(query "SELECT count() FROM \`$db\`.\`$table\`")"
done 3< tables.tsv
