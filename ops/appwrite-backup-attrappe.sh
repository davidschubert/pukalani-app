#!/usr/bin/env bash
# Backup und Wiederherstellung gegen eine ATTRAPPE beweisen (OPS-001, 2026-11-15).
#
# WOZU: ops/appwrite-backup.sh und ops/appwrite-restore.sh sollen einen Server
# erst sehen, wenn sie hier bestanden haben — mit echtem docker, echter
# MariaDB, echtem gpg und echtem rsync, aber ohne ein einziges echtes Datum.
# Nach JEDER Änderung an einem der beiden Skripte oder an
# ops/appwrite-volumes.conf noch einmal laufen lassen.
#
# WIE: ein Wegwerf-Container mit EIGENEM Docker-Dienst (docker:dind). Darin
# leben der Stellvertreter-Stack (MariaDB mit Testdaten, ein Platzhalter für
# Appwrite, dieselben Volume-Namen wie Production samt der Sonderform von
# `appwrite-builds`), die „Storage Box" (ein Ordner) und später die
# zurückgespielte Instanz. Der Docker-Dienst des Rechners sieht davon nur
# diesen einen Container; eine Appwrite-Instanz auf dem Rechner wird weder
# gelesen noch berührt.
#
# AUFRUF (vom Rechner, braucht nur docker):
#   ops/appwrite-backup-attrappe.sh           baut auf, prüft, räumt ab
#   ops/appwrite-backup-attrappe.sh --keep    lässt den Container zum Nachsehen stehen
#
# Geprüft wird: Vorschau ändert nichts · ein Lauf legt alles verschlüsselt ab
# und nichts im Klartext · Gegenproben (leerer und abgeschnittener Dump,
# fehlendes und unbekanntes Volume, Ablage nicht erreichbar, falscher
# Schlüssel, geschrumpfte Datenbank) enden mit Fehler, gleichen nichts ab und
# lassen frühere Läufe unberührt · Löschungen schlagen nicht durch · die
# Aufbewahrung löscht nur Altes, nie die jüngsten, nie mehr als erlaubt ·
# Zurückspielen aus der „Box" nach „Server weg" ergibt dieselben Zeilen,
# dieselben Dateien, dieselbe .env · Gegenproben dazu (falscher Schlüssel,
# beschädigte Datei, Ziel nicht leer, Rechner nicht leer).
#
# Exit: 0 alles bestanden · 1 mindestens eine Prüfung gescheitert
set -euo pipefail

NAME='p11-attrappe'
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
  docker exec "$NAME" apk add --no-cache bash coreutils gnupg jq rsync grep gawk sed tar findutils gzip openssh-client >/dev/null
  docker exec "$NAME" bash /ops/appwrite-backup-attrappe.sh --inside
  exit $?
fi

# ── Ab hier: IM Container ───────────────────────────────────────────────────
PASS=0
FAIL=0
ok() { echo "✔ $*"; PASS=$(( PASS + 1 )); }
bad() { echo "✗ $*"; FAIL=$(( FAIL + 1 )); }
# expect <beschreibung> <erwarteter-exit> <muster-in-der-ausgabe> <befehl…>
expect() {
  local what="$1" want="$2" pattern="$3" code=0
  shift 3
  "$@" > /tmp/out.txt 2>&1 || code=$?
  if [ "$code" = "$want" ] && grep -q -- "$pattern" /tmp/out.txt; then
    ok "$what (Exit $code)"
  else
    bad "$what — Exit $code statt $want, oder „$pattern“ fehlt:"
    sed 's/^/    /' /tmp/out.txt | tail -12
  fi
}

SRC=/srv/prod/appwrite        # der „Server": Compose-Ordner
BK=/srv/prod/backup           # BACKUP_DIR auf dem „Server"
BOX=/srv/box/backups/appwrite # die „Storage Box"
KEYS=/srv/keys
mkdir -p "$SRC/patches" "$BK" "$BOX" "$KEYS"

# Zwei Schlüsselpaare: das richtige und ein fremdes (für die Gegenproben).
make_key() { # <name>
  local home="$KEYS/$1.home"
  mkdir -m 700 "$home"
  gpg --batch --quiet --homedir "$home" --pinentry-mode loopback --passphrase '' \
    --quick-generate-key "Attrappe $1" future-default default never 2>/dev/null
  gpg --batch --quiet --homedir "$home" --armor --export > "$KEYS/$1.pub.asc"
  gpg --batch --quiet --homedir "$home" --armor --export-secret-keys > "$KEYS/$1.private.asc"
  gpg --batch --homedir "$home" --with-colons --fingerprint | awk -F: '/^fpr:/ && !seen { print $10; seen = 1 }' > "$KEYS/$1.fpr"
}
make_key richtig
make_key fremd
FPR="$(cat "$KEYS/richtig.fpr")"

cat > "$SRC/.env" <<'EOF'
_APP_OPENSSL_KEY_V1=KLARTEXT-MARKER-ENV-0123456789abcdef
_APP_DB_ROOT_PASS=attrappe-root
EOF
echo '<logging>attrappe</logging>' > "$SRC/patches/logging.xml"
cat > "$SRC/docker-compose.yml" <<'EOF'
services:
  mariadb:
    image: mariadb:10.11
    environment:
      - MYSQL_ROOT_PASSWORD=${_APP_DB_ROOT_PASS}
      - MYSQL_DATABASE=appwrite
    volumes:
      - appwrite-mariadb:/var/lib/mysql
  appwrite:
    image: alpine
    command: sleep infinity
    stop_grace_period: 1s
    healthcheck:
      test: ["CMD", "true"]
      interval: 2s
    volumes:
      - appwrite-uploads:/storage/uploads
      - appwrite-functions:/storage/functions
      - appwrite-sites:/storage/sites
      - appwrite-builds:/storage/builds
      - appwrite-certificates:/storage/certificates
      - appwrite-config:/storage/config
      - appwrite-cache:/storage/cache
      - ./patches/logging.xml:/etc/logging.xml:ro
  redis:
    image: alpine
    command: sleep infinity
    stop_grace_period: 1s
    volumes:
      - appwrite-redis:/data
volumes:
  appwrite-mariadb: ~
  appwrite-redis: ~
  appwrite-cache: ~
  appwrite-uploads: ~
  appwrite-functions: ~
  appwrite-sites: ~
  appwrite-builds:
    name: appwrite-builds
  appwrite-certificates: ~
  appwrite-config: ~
EOF

sql_src() { ( cd "$SRC" && docker compose exec -T mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r' ); }
wait_db() { # <compose-ordner>
  local n=0
  until ( cd "$1" && echo 'SELECT 1;' | docker compose exec -T mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N' ) >/dev/null 2>&1; do
    n=$(( n + 1 )); [ "$n" -lt 90 ] || { echo "MariaDB der Attrappe antwortet nicht"; exit 1; }
    sleep 2
  done
}

echo "── Attrappe aufbauen ──"
( cd "$SRC" && docker compose up -d >/dev/null 2>&1 )
wait_db "$SRC"
{
  echo "USE appwrite;"
  echo "CREATE TABLE _console_projects (_id INT PRIMARY KEY, _uid VARCHAR(64));"
  echo "INSERT INTO _console_projects VALUES (1, 'account'), (2, 'admin');"
  echo "CREATE TABLE _1_users (_id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(64), secret BLOB);"
  echo "CREATE TABLE _2_users (_id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(64), secret BLOB);"
  echo "CREATE TABLE _1_sessions (_id INT PRIMARY KEY AUTO_INCREMENT, note VARCHAR(64));"
  echo "CREATE TABLE _1_messages (_id INT PRIMARY KEY AUTO_INCREMENT, body TEXT);"
  i=0; while [ "$i" -lt 34 ]; do echo "INSERT INTO _1_users (name, secret) VALUES ('KLARTEXT-MARKER-DB-$i', UNHEX('00FF10')); "; i=$(( i + 1 )); done
  echo "INSERT INTO _2_users (name, secret) VALUES ('KLARTEXT-MARKER-DB-admin', UNHEX('AA'));"
  echo "INSERT INTO _1_sessions (note) VALUES ('a'), ('b'), ('c');"
  i=0; while [ "$i" -lt 12 ]; do echo "CREATE TABLE _1_collection_$i (_id INT PRIMARY KEY, v VARCHAR(8)); INSERT INTO _1_collection_$i VALUES (1, 'x'), (2, 'y\\\\z');"; i=$(( i + 1 )); done
  i=0; while [ "$i" -lt 200 ]; do echo "INSERT INTO _1_messages (body) VALUES (REPEAT('KLARTEXT-MARKER-DB-nachricht ', 40));"; i=$(( i + 1 )); done
} | sql_src
fill() { # <volume> <shell-stück>
  docker run --rm -i -v "$1":/d alpine sh -c "$2" </dev/null
}
fill appwrite_appwrite-uploads 'mkdir -p /d/app-1/a && i=0; while [ $i -lt 30 ]; do echo "KLARTEXT-MARKER-DATEI $i" > /d/app-1/a/f$i.txt; i=$((i+1)); done; head -c 300000 /dev/urandom > /d/app-1/a/bild.bin'
fill appwrite-builds 'echo build-eins > /d/build.tar'
fill appwrite_appwrite-certificates 'echo KLARTEXT-MARKER-ZERT > /d/privkey.pem'
fill appwrite_appwrite-config 'echo tls > /d/tls.yml'
# Der Rest, den es auf Production neben dem echten builds-Volume gibt:
docker volume create --label com.docker.compose.project=appwrite --label com.docker.compose.volume=appwrite-builds appwrite_appwrite-builds >/dev/null
fill appwrite_appwrite-builds 'echo ALTER-REST > /d/alt.txt'
sums_of() { docker run --rm -v "$1":/d:ro alpine sh -c 'cd /d && find . -type f | sort | xargs sha256sum' </dev/null; }
sums_of appwrite_appwrite-uploads > /tmp/uploads.before
sums_of appwrite-builds > /tmp/builds.before
sha256sum < "$SRC/.env" > /tmp/env.before
echo "SELECT table_name FROM information_schema.tables WHERE table_schema='appwrite' ORDER BY 1;" | sql_src > /tmp/tables.before

backup() { # [env…] -- [schalter]
  env APPWRITE_COMPOSE_DIR="$SRC" BACKUP_DIR="$BK" OFFSITE_TARGET="$BOX" \
    BACKUP_PUBLIC_KEY="$KEYS/richtig.pub.asc" BACKUP_KEY_FINGERPRINT="$FPR" \
    BACKUP_VOLUMES_CONF=/ops/appwrite-volumes.conf MIN_FREE_MB=50 "$@"
}
runs_local() { ls "$BK/runs" 2>/dev/null | wc -l | tr -d ' '; }
runs_box() { ls "$BOX/runs" 2>/dev/null | wc -l | tr -d ' '; }
tree_sum() { ( cd "$1" && find . -type f | sort | xargs sha256sum 2>/dev/null | sha256sum ); }

echo "── Vorschau ──"
expect "Vorschau zeigt den Plan" 0 'es wird NICHTS geändert' backup bash /ops/appwrite-backup.sh
grep -q 'appwrite-builds  ←  appwrite-builds$' /tmp/out.txt && ok "Vorschau nimmt das echte builds-Volume, nicht den Rest" || bad "builds-Volume falsch aufgelöst"
[ "$(runs_local)" = 0 ] && [ ! -e "$BK/state" ] && [ "$(runs_box)" = 0 ] && ok "Vorschau hat nichts angelegt" || bad "Vorschau hat etwas angelegt"
expect "Unbekannter Schalter wird abgelehnt" 2 'Aufruf:' backup bash /ops/appwrite-backup.sh --apply

echo "── Erster Lauf ──"
expect "Lauf endet gut" 0 'Backup fertig' backup bash /ops/appwrite-backup.sh --run
FIRST="$(ls "$BK/runs" | sed -n 1p)"
want_files='SHA256SUMS backup.meta config.tar.gz.gpg counts.tsv.gpg db.sql.gz.gpg volume-appwrite-builds.tar.gz.gpg volume-appwrite-certificates.tar.gz.gpg volume-appwrite-config.tar.gz.gpg volume-appwrite-functions.tar.gz.gpg volume-appwrite-sites.tar.gz.gpg volume-appwrite-uploads.tar.gz.gpg'
[ "$(ls "$BK/runs/$FIRST" | tr '\n' ' ' | sed 's/ $//')" = "$want_files" ] && ok "Lauf-Ordner enthält genau die erwarteten Dateien" || bad "Lauf-Ordner: $(ls "$BK/runs/$FIRST" | tr '\n' ' ')"
[ "$(tree_sum "$BK/runs/$FIRST")" = "$(tree_sum "$BOX/runs/$FIRST")" ] && ok "Auf der Box liegt dasselbe wie lokal" || bad "Box weicht ab"
if grep -rl 'KLARTEXT-MARKER' "$BK" "$BOX" >/dev/null 2>&1; then bad "Klartext gefunden in: $(grep -rl 'KLARTEXT-MARKER' "$BK" "$BOX" | head -3)"; else ok "Kein Klartext in Ablage lokal und Box (.env, Datenbank, Dateien, Zertifikat)"; fi
[ -z "$(ls -d "$BK"/work-* 2>/dev/null)" ] && ok "Arbeitsordner mit Klartext ist gelöscht" || bad "Arbeitsordner liegt noch da"
( cd "$BOX/runs/$FIRST" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) && ok "Prüfsummen auf der Box stimmen" || bad "Prüfsummen auf der Box"
grep -q '^tables=17$' "$BK/runs/$FIRST/backup.meta" && grep -q '^databases=1$' "$BK/runs/$FIRST/backup.meta" && ok "Kenndaten: 1 Datenbank, 17 Tabellen" || bad "Kenndaten: $(grep -E '^(tables|databases)=' "$BK/runs/$FIRST/backup.meta" | tr '\n' ' ')"
grep -q '^last_result=ok$' "$BK/state/last-run" && ok "Stand-Datei meldet ok" || bad "Stand-Datei"
[ "$(stat -c '%U' "$BK/runs/$FIRST/db.sql.gz.gpg")" = "$(id -un)" ] && [ "$(stat -c '%a' "$BK/runs/$FIRST/db.sql.gz.gpg")" = 600 ] && ok "Dateien gehören dem Aufrufer, Recht 600" || bad "Besitzer oder Recht falsch"
mkdir -m 700 /tmp/gserver
if gpg --batch --quiet --homedir /tmp/gserver --decrypt "$BK/runs/$FIRST/counts.tsv.gpg" >/dev/null 2>&1; then bad "Der Server kann sein eigenes Backup lesen"; else ok "Ohne privaten Schlüssel lässt sich das Backup nicht öffnen"; fi
expect "--status nennt den guten Lauf" 0 "$FIRST" backup bash /ops/appwrite-backup.sh --status

echo "── Gegenproben: jeder Fehler endet rot, gleicht nichts ab, lässt Früheres liegen ──"
before_local="$(tree_sum "$BK/runs")"
before_box="$(tree_sum "$BOX/runs")"
untouched() { # <was>
  if [ "$(tree_sum "$BK/runs")" = "$before_local" ] && [ "$(tree_sum "$BOX/runs")" = "$before_box" ] && [ "$(runs_local)" = 1 ] && [ "$(runs_box)" = 1 ]; then
    ok "$1: kein neuer Lauf, früherer Lauf unberührt (lokal und Box)"
  else
    bad "$1: Ablage hat sich verändert (lokal $(runs_local), Box $(runs_box))"
  fi
  grep -q '^last_result=fehler$' "$BK/state/last-run" && grep -q "^last_ok_stamp=$FIRST$" "$BK/state/last-run" \
    && ok "$1: Stand-Datei meldet fehler und kennt den letzten guten Lauf weiter" || bad "$1: Stand-Datei falsch"
  [ -z "$(ls -d "$BK"/work-* "$BK"/runs/*.partial 2>/dev/null)" ] || bad "$1: Reste liegen herum"
}
sleep 1
# Dump leer: ein Stellvertreter, der nichts ausgibt und trotzdem 0 meldet.
( cd "$SRC" && docker compose exec -T mariadb sh -c 'mv /usr/bin/mariadb-dump /usr/bin/mariadb-dump.echt && printf "#!/bin/sh\nexit 0\n" > /usr/bin/mariadb-dump && chmod +x /usr/bin/mariadb-dump' )
expect "Leerer Dump" 1 'Dump ist unvollständig' backup bash /ops/appwrite-backup.sh --run
untouched "Leerer Dump"
grep -q '^last_step=dump$' "$BK/state/last-run" && ok "Leerer Dump: Schritt „dump“ gemeldet" || bad "Schritt falsch: $(grep last_step "$BK/state/last-run")"
sleep 1
# Dump abgeschnitten: bricht mitten im Strom ab, Exit 0.
( cd "$SRC" && docker compose exec -T mariadb sh -c 'printf "#!/bin/sh\n/usr/bin/mariadb-dump.echt \"\$@\" | head -c 20000\nexit 0\n" > /usr/bin/mariadb-dump' )
expect "Abgeschnittener Dump" 1 'Dump ist unvollständig' backup bash /ops/appwrite-backup.sh --run
untouched "Abgeschnittener Dump"
sleep 1
# Dump scheitert laut (Exit ≠ 0).
( cd "$SRC" && docker compose exec -T mariadb sh -c 'printf "#!/bin/sh\necho kaputt >&2\nexit 3\n" > /usr/bin/mariadb-dump' )
expect "Dump mit Fehler-Exit" 1 'GESCHEITERT im Schritt „dump“' backup bash /ops/appwrite-backup.sh --run
untouched "Dump mit Fehler-Exit"
( cd "$SRC" && docker compose exec -T mariadb sh -c 'mv /usr/bin/mariadb-dump.echt /usr/bin/mariadb-dump' )
sleep 1
# Volume fehlt: die Liste verlangt eines, das die Compose-Datei nicht (mehr) nennt.
sed '/^  appwrite-sites: ~$/d; /appwrite-sites:\/storage\/sites/d' "$SRC/docker-compose.yml" > /tmp/compose.ohne-sites
cp "$SRC/docker-compose.yml" /tmp/compose.gut
cp /tmp/compose.ohne-sites "$SRC/docker-compose.yml"
expect "Volume aus der Liste fehlt in der Compose-Datei" 1 'soll gesichert werden' backup bash /ops/appwrite-backup.sh --run
untouched "Fehlendes Volume"
cp /tmp/compose.gut "$SRC/docker-compose.yml"
sleep 1
# Unbekanntes Volume: die Compose-Datei nennt eines, das die Liste nicht kennt.
# (Ein Volume, das kein Dienst nutzt, lässt `docker compose config` weg — deshalb auch einbinden.)
sed 's/^  appwrite-config: ~$/  appwrite-config: ~\n  appwrite-neu: ~/; s/^      - appwrite-cache:\/storage\/cache$/      - appwrite-cache:\/storage\/cache\n      - appwrite-neu:\/storage\/neu/' /tmp/compose.gut > "$SRC/docker-compose.yml"
expect "Volume in der Compose-Datei, das die Liste nicht kennt" 1 'aber nicht in appwrite-volumes.conf' backup bash /ops/appwrite-backup.sh --run
untouched "Unbekanntes Volume"
cp /tmp/compose.gut "$SRC/docker-compose.yml"
sleep 1
# Falscher Schlüssel: fremde Datei, erwarteter Fingerabdruck bleibt.
expect "Falscher öffentlicher Schlüssel" 1 'Falscher Schlüssel' backup BACKUP_PUBLIC_KEY="$KEYS/fremd.pub.asc" bash /ops/appwrite-backup.sh --run
untouched "Falscher Schlüssel"
sleep 1
# .env ohne den Schlüssel.
cp "$SRC/.env" /tmp/env.gut
grep -v '^_APP_OPENSSL_KEY_V1=' /tmp/env.gut > "$SRC/.env"
expect ".env ohne Schlüssel-Zeile" 1 '_APP_OPENSSL_KEY_V1' backup bash /ops/appwrite-backup.sh --run
untouched ".env ohne Schlüssel"
cp /tmp/env.gut "$SRC/.env"
sleep 1
# Eingebundene Datei, die nicht im Archiv der Einstellungen stünde.
expect "Eingebundene Datei außerhalb der Liste" 1 'steht aber nicht in BACKUP_CONFIG_FILES' backup BACKUP_CONFIG_FILES='.env docker-compose.yml' bash /ops/appwrite-backup.sh --run
untouched "Eingebundene Datei"
sleep 1
# Ablage nicht erreichbar: der Lauf liegt lokal, die Box bleibt, Ergebnis rot.
expect "Ablage außer Haus nicht erreichbar" 1 'Abgleich mit der Ablage außer Haus ist gescheitert' backup OFFSITE_TARGET='box.invalid:backups/appwrite' bash /ops/appwrite-backup.sh --run
[ "$(runs_local)" = 2 ] && [ "$(runs_box)" = 1 ] && [ "$(tree_sum "$BOX/runs")" = "$before_box" ] && ok "Box nicht erreichbar: Lauf liegt lokal, Box unverändert" || bad "Box nicht erreichbar: lokal $(runs_local), Box $(runs_box)"
grep -q '^last_result=fehler$' "$BK/state/last-run" && grep -q '^last_step=abgleich$' "$BK/state/last-run" && ok "Box nicht erreichbar: Stand-Datei meldet fehler im Schritt „abgleich“" || bad "Stand-Datei: $(tr '\n' ' ' < "$BK/state/last-run")"
STRANDED="$(ls "$BK/runs" | tail -1)"

echo "── Zweiter guter Lauf: holt den liegengebliebenen nach, löscht nichts ──"
sleep 1
expect "Lauf endet gut" 0 'Außer Haus angekommen und Prüfsummen gleich' backup bash /ops/appwrite-backup.sh --run
[ "$(runs_box)" = 3 ] && [ -d "$BOX/runs/$STRANDED" ] && ok "Der liegengebliebene Lauf ist nachgereicht (Box: 3 Läufe)" || bad "Box hat $(runs_box) Läufe"
# Löschung lokal schlägt nicht durch.
rm -rf "$BK/runs/$FIRST"
sleep 1
expect "Lauf nach lokaler Löschung endet gut" 0 'Backup fertig' backup bash /ops/appwrite-backup.sh --run
[ -d "$BOX/runs/$FIRST" ] && ( cd "$BOX/runs/$FIRST" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) && ok "Lokal gelöschter Lauf liegt weiter unversehrt auf der Box" || bad "Löschung ist durchgeschlagen"

echo "── Schrumpfen wird nicht stillschweigend gesichert ──"
{ i=0; while [ "$i" -lt 12 ]; do echo "DROP TABLE appwrite._1_collection_$i;"; i=$(( i + 1 )); done; } | sql_src
sleep 1
n_before="$(runs_box)"
expect "Zwei Drittel der Tabellen weg" 1 'Nur noch 5 Tabellen' backup bash /ops/appwrite-backup.sh --run
[ "$(runs_box)" = "$n_before" ] && ok "Geschrumpfte Datenbank: nichts abgeglichen" || bad "Geschrumpfte Datenbank wurde abgeglichen"
sleep 1
expect "Mit BACKUP_ACCEPT_SHRINK=1 angenommen" 0 'angenommen' backup BACKUP_ACCEPT_SHRINK=1 bash /ops/appwrite-backup.sh --run
LAST="$(ls "$BK/runs" | tail -1)"

echo "── Aufbewahrung auf der Box ──"
# 9 alte Läufe (40 bis 48 Tage), dazu Fremdes, das nie angefasst werden darf.
d=40; while [ "$d" -le 48 ]; do mkdir -p "$BOX/runs/$(date -d "-$d days" '+%F')-033000"; echo x > "$BOX/runs/$(date -d "-$d days" '+%F')-033000/x"; d=$(( d + 1 )); done
mkdir -p "$BOX/runs/nicht-von-uns" "$BOX/runs/2020-01-01-0330" && echo y > "$BOX/db-2026-11-15-0330.sql.gz"
sleep 1
expect "Lauf mit alten Läufen auf der Box" 0 'Außer Haus gelöscht' backup bash /ops/appwrite-backup.sh --run
old_left="$(ls "$BOX/runs" | grep -c -- '-033000$' || true)"
[ "$old_left" = 4 ] && ok "Höchstens 5 Löschungen je Lauf (von 9 alten bleiben 4)" || bad "Alte Läufe übrig: $old_left"
[ -d "$BOX/runs/$(date -d '-48 days' '+%F')-033000" ] && bad "Der älteste wurde nicht zuerst gelöscht" || ok "Gelöscht wurde vom ältesten her"
[ -d "$BOX/runs/nicht-von-uns" ] && [ -d "$BOX/runs/2020-01-01-0330" ] && [ -e "$BOX/db-2026-11-15-0330.sql.gz" ] && ok "Fremde Namen und alte, flach abgelegte Dateien bleiben unberührt" || bad "Fremdes wurde gelöscht"
sleep 1
expect "Box soll kürzer halten als der Server" 1 'kleiner als RETENTION_DAYS' backup OFFSITE_RETENTION_DAYS=7 bash /ops/appwrite-backup.sh --run
sleep 1
expect "Mit OFFSITE_KEEP_MIN über dem Bestand" 0 'Backup fertig' backup OFFSITE_KEEP_MIN=50 bash /ops/appwrite-backup.sh --run
[ "$(ls "$BOX/runs" | grep -c -- '-033000$' || true)" = 4 ] && ok "Untergrenze hält: nichts gelöscht, solange zu wenige Läufe da sind" || bad "Untergrenze nicht gehalten"
LAST="$(ls "$BK/runs" | tail -1)"

echo "── Tor-Skript: Wort backup-status ──"
gate() { env BACKUP_STATE_FILE="$BK/state/last-run" "$@" bash /ops/appwrite-cert-gate.sh backup-status; }
expect "Stand nach gutem Lauf" 0 '^backup ergebnis=ok schritt=fertig alter_stunden=0 groesse_mb=[0-9]* dateien=11$' gate
[ "$(wc -l < /tmp/out.txt | tr -d ' ')" = 1 ] && ok "Das Tor gibt genau eine Zeile aus" || bad "Das Tor gibt mehr aus: $(cat /tmp/out.txt)"
cp "$BK/state/last-run" /tmp/state.gut
sed "s/^last_ok_epoch=.*/last_ok_epoch=$(( $(date +%s) - 30 * 3600 ))/" /tmp/state.gut > /tmp/state.alt
expect "Veralteter Stand (30 Stunden)" 0 'alter_stunden=30 ' gate BACKUP_STATE_FILE=/tmp/state.alt
printf 'last_result=fehler\nlast_step=dump\nlast_ok_epoch=%s\nlast_ok_bytes=1048576\nlast_ok_files=11\n' "$(date +%s)" > /tmp/state.rot
expect "Gescheiterter Lauf" 0 'ergebnis=fehler schritt=dump' gate BACKUP_STATE_FILE=/tmp/state.rot
expect "Keine Stand-Datei" 6 'ergebnis=unbekannt' gate BACKUP_STATE_FILE=/tmp/gibt-es-nicht
printf 'last_result=ok; rm -rf /\nlast_step=$(id)\nlast_ok_epoch=abc\n' > /tmp/state.boese
expect "Stand-Datei mit fremdem Inhalt wird nicht durchgereicht" 6 '^backup ergebnis=unbekannt$' gate BACKUP_STATE_FILE=/tmp/state.boese

echo "── Server weg: zurückspielen aus der Box ──"
( cd "$SRC" && docker compose down -v >/dev/null 2>&1 )
docker volume rm appwrite_appwrite-builds >/dev/null 2>&1 || true
rm -rf /srv/prod
RUN="$BOX/runs/$LAST"
# Zurückgespielt wird in DENSELBEN Ordner wie auf dem „alten Server" — die
# Compose-Datei bindet Dateien über ihren vollen Pfad ein.
NEW="$SRC"
restore() { bash /ops/appwrite-restore.sh "$@"; }
expect "Vorschau des Zurückspielens" 0 'Vorschau — nichts geändert' restore "$RUN" --key "$KEYS/richtig.private.asc" --target "$NEW"
[ ! -e "$NEW" ] && [ -z "$(docker ps -aq)" ] && ok "Vorschau hat nichts angelegt" || bad "Vorschau hat etwas angelegt"
expect "Falscher privater Schlüssel" 1 'Falscher Schlüssel' restore "$RUN" --key "$KEYS/fremd.private.asc" --target "$NEW" --apply
expect "Anderer Ordner als auf dem alten Server" 2 "gehört in den Ordner $SRC" restore "$RUN" --key "$KEYS/richtig.private.asc" --target /srv/neu/appwrite --apply
# Ein Lauf ohne compose_dir (ältere Fassung des Backup-Skripts): die zweite Sicherung greift.
cp -r "$RUN" /tmp/alt && grep -v '^compose_dir=' "$RUN/backup.meta" > /tmp/alt/backup.meta && ( cd /tmp/alt && sha256sum -- *.gpg backup.meta > SHA256SUMS )
expect "Anderer Ordner, Lauf ohne compose_dir: eingebundene Datei fehlt" 1 'das gibt es auf diesem Rechner nicht' restore /tmp/alt --key "$KEYS/richtig.private.asc" --target /srv/neu/appwrite --apply
[ -z "$(docker ps -q)" ] && ok "… und kein Dienst wurde gestartet" || bad "Dienste laufen nach dem Abbruch"
rm -rf /srv/neu
cp -r "$RUN" /tmp/kaputt && printf 'x' >> /tmp/kaputt/db.sql.gz.gpg
expect "Beschädigte Datei" 1 'Prüfsummen stimmen nicht' restore /tmp/kaputt --key "$KEYS/richtig.private.asc" --target "$NEW" --apply
cp -r "$RUN" /tmp/halb && rm /tmp/halb/config.tar.gz.gpg
expect "Lauf ohne das Archiv der Einstellungen" 1 'Prüfsummen stimmen nicht' restore /tmp/halb --key "$KEYS/richtig.private.asc" --target "$NEW" --apply
mkdir -p /srv/voll && echo x > /srv/voll/x
expect "Zielordner nicht leer" 4 'ist nicht leer' restore "$RUN" --key "$KEYS/richtig.private.asc" --target /srv/voll --apply
[ -z "$(docker ps -aq)" ] && [ -z "$(docker volume ls -q)" ] && ok "Gegenproben haben nichts angelegt" || bad "Gegenproben haben etwas angelegt"

expect "Zurückspielen" 0 '✔ Zurückgespielt' restore "$RUN" --key "$KEYS/richtig.private.asc" --target "$NEW" --apply --services "mariadb appwrite"
grep -q 'zählgleich: 5 · abweichend, weil flüchtig: 0 · abweichend sonst: 0 · fehlend: 0' /tmp/out.txt && ok "Alle 5 Tabellen zählgleich mit dem Backup" || bad "Zählung: $(grep 'Tabellen im Backup' /tmp/out.txt)"
grep -q 'Projekt account: 34 Konten (Backup: 34)' /tmp/out.txt && grep -q 'Projekt admin: 1 Konten (Backup: 1)' /tmp/out.txt && ok "Konten je Projekt: account 34, admin 1" || bad "Konten je Projekt fehlen"
[ "$(sha256sum < "$NEW/.env")" = "$(cat /tmp/env.before)" ] && ok ".env ist byte-gleich zurück (samt Schlüssel)" || bad ".env weicht ab"
[ -r "$NEW/patches/logging.xml" ] && ok "patches/ ist zurück" || bad "patches/ fehlt"
sums_of appwrite_appwrite-uploads > /tmp/uploads.after
sums_of appwrite-builds > /tmp/builds.after
cmp -s /tmp/uploads.before /tmp/uploads.after && ok "Uploads byte-gleich (31 Dateien)" || bad "Uploads weichen ab"
cmp -s /tmp/builds.before /tmp/builds.after && ok "Builds im richtigen Volume, byte-gleich" || bad "Builds weichen ab"
[ "$(docker run --rm -v appwrite_appwrite-certificates:/d:ro alpine cat /d/privkey.pem </dev/null)" = 'KLARTEXT-MARKER-ZERT' ] && ok "Zertifikats-Volume ist zurück" || bad "Zertifikats-Volume fehlt"
back="$( cd "$NEW" && echo "SELECT HEX(secret), name FROM appwrite._1_users WHERE _id = 1; SELECT v FROM appwrite._1_collection_0;" | docker compose exec -T mariadb sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -N -r' 2>&1 || true )"
case "$back" in *"00FF10"*"KLARTEXT-MARKER-DB-0"*) ok "Binärspalte und Text kommen unverändert zurück" ;; *) bad "Inhalt weicht ab: $back" ;; esac
running="$( cd "$NEW" && docker compose ps --services --status running | sort | tr '\n' ' ' )"
[ "$running" = 'appwrite mariadb ' ] && ok "Gestartet sind nur die genannten Dienste (appwrite, mariadb)" || bad "Laufende Dienste: $running"
rm -rf /tmp/zweit && cp -r "$RUN" /tmp/zweit && sed -i 's#^compose_dir=.*#compose_dir=/srv/neu2/appwrite#' /tmp/zweit/backup.meta && ( cd /tmp/zweit && sha256sum -- *.gpg backup.meta > SHA256SUMS )
expect "Zweites Zurückspielen auf denselben Rechner" 4 'liegt schon eine Appwrite-Instanz' restore /tmp/zweit --key "$KEYS/richtig.private.asc" --target /srv/neu2/appwrite --apply

echo
echo "Bestanden: $PASS · Gescheitert: $FAIL"
[ "$FAIL" = 0 ]
