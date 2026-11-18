#!/usr/bin/env bash
# Das Ausliefer-Skript gegen eine ATTRAPPE mit ECHTEM sshd beweisen
# (CI1 b, 2026-11-18).
#
# WOZU: ops/app-release.sh ist auf app-prod der feste Befehl des
# Ausliefer-Schlüssels. Ob sshd einen fremden Befehl wirklich nicht ausführt,
# ob zwei Läufe aufeinander warten und was ein Abbruch mittendrin hinterlässt,
# zeigt nur ein echter sshd mit echten Prozessen — der Schlüssel der CI hat
# keine lokale Kopie, an Production lässt sich der schlechte Fall nicht üben.
# Nach JEDER Änderung an ops/app-release.sh, ops/rollback.sh oder am Schritt
# „Ausliefern" in .github/workflows/deploy.yml noch einmal laufen lassen.
#
# WIE: ein Wegwerf-Container (Ubuntu wie der Server) mit sshd, einem Benutzer
# `ploi`, zwei Wegwerf-Schlüsseln (eigener Zugang, CI) und Stellvertretern für
# pm2, node und curl. Geprüft wird mit DENSELBEN Befehlszeilen, die der
# Workflow schickt:
#   A  heutige Eintragung (`restrict`, kein fester Befehl): ein ganzes Ausliefern
#   B  fester Befehl: dasselbe Ausliefern; alles andere wird abgelehnt
#   C  Abbruch mitten im Empfangen: nichts bleibt liegen
#   D  Abbruch mitten im Umstellen: der Server bringt es zu Ende
#   E  zwei Läufe zur selben Zeit: der zweite wartet; ohne Geduld bricht er ab
#   F  fehlende Verzeichnisse (erste Auslieferung einer App)
#   G  der Rückweg ops/rollback.sh über den eigenen Zugang
# Der Rechner selbst wird nicht berührt; das Repo ist nur lesend eingehängt.
#
# AUFRUF (vom Rechner, braucht nur docker und Netz für die Pakete):
#   ops/app-release-attrappe.sh           baut auf, prüft, räumt ab
#   ops/app-release-attrappe.sh --keep    lässt den Container zum Nachsehen stehen
#
# Exit: 0 alles bestanden · 1 mindestens eine Prüfung gescheitert
set -euo pipefail

NAME='n12-app-release-attrappe'
IMAGE='ubuntu:24.04'

if [ "${1:-}" != '--inside' ]; then
  KEEP=0
  [ "${1:-}" = '--keep' ] && KEEP=1
  OPS_DIR="$(cd "$(dirname "$0")" && pwd)"
  cleanup() {
    if [ "$KEEP" = 1 ]; then
      echo "Container $NAME bleibt stehen. Abräumen: docker rm -f -v $NAME"
    else
      docker rm -f -v "$NAME" >/dev/null 2>&1 || true
    fi
  }
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  trap cleanup EXIT
  docker run -d --name "$NAME" -v "$OPS_DIR":/ops:ro "$IMAGE" sleep 3600 >/dev/null
  docker exec "$NAME" bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null && apt-get install -y -qq openssh-server openssh-client zstd rsync >/dev/null 2>&1' \
    || { echo "Die Pakete für die Attrappe ließen sich nicht installieren (Netz?)."; exit 1; }
  docker exec "$NAME" bash /ops/app-release-attrappe.sh --inside </dev/null
  exit $?
fi

# ── Ab hier: IM Container (als root) ────────────────────────────────────────
umask 022
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✖ $1"; }
# check <Beschreibung> <Befehl…>: bestanden, wenn der Befehl gelingt.
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
# expect_exit <Beschreibung> <Code> <Befehl…>
expect_exit() {
  local what="$1" want="$2" got=0; shift 2
  "$@" >/tmp/last.out 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$what"; else bad "$what (Exit $got statt $want: $(head -c 200 /tmp/last.out | tr '\n' ' '))"; fi
}

H=/home/ploi
SCRIPT="$H/ops/app-release.sh"
REL="$H/releases/help"
STUB="$H/stub"
A="aaaaaaa$(printf '0%.0s' $(seq 1 33))"
B="bbbbbbb$(printf '1%.0s' $(seq 1 33))"
C="ccccccc$(printf '2%.0s' $(seq 1 33))"
D="ddddddd$(printf '3%.0s' $(seq 1 33))"

useradd -m -s /bin/bash ploi
mkdir -p /run/sshd "$H/.ssh" "$H/ops" "$H/help.pukalani.app" "$STUB" /root/.ssh /work
ssh-keygen -A >/dev/null
ssh-keygen -q -t ed25519 -N '' -C eigener-zugang -f /root/.ssh/own
ssh-keygen -q -t ed25519 -N '' -C ci-ausliefern -f /root/.ssh/ci
cat > /root/.ssh/config <<EOF
Host own
  HostName 127.0.0.1
  User ploi
  IdentityFile /root/.ssh/own
Host prod
  HostName 127.0.0.1
  User ploi
  IdentityFile /root/.ssh/ci
Host *
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  LogLevel ERROR
EOF
chmod 700 /root/.ssh && chmod 600 /root/.ssh/config
authorize() { # $1 = Optionen vor dem CI-Schlüssel
  { cat /root/.ssh/own.pub; printf '%s %s\n' "$1" "$(cat /root/.ssh/ci.pub)"; } > "$H/.ssh/authorized_keys"
  chown -R ploi:ploi "$H/.ssh"; chmod 700 "$H/.ssh"; chmod 600 "$H/.ssh/authorized_keys"
}

# Stellvertreter: pm2 „übernimmt" beim Neuladen den Stand, auf den der Verweis zeigt.
cat > /usr/local/bin/pm2 <<'EOF'
#!/usr/bin/env bash
S=/home/ploi/stub
echo "pm2 $*" >> "$S/log"
case "$1" in
  jlist) echo "[]" ;;
  describe) exit 1 ;;
  startOrReload)
    [ -f "$S/slow" ] && sleep "$(cat "$S/slow")"
    [ -f "$S/fail" ] && { echo "Error: Script not found"; exit 1; }
    basename "$(readlink /home/ploi/releases/help/current)" > "$S/live" ;;
esac
exit 0
EOF
# pm2-heal.sh fragt node nach dem Prozess — hier gibt es nie einen.
printf '#!/usr/bin/env bash\ncat >/dev/null\necho "absent -"\n' > /usr/local/bin/node
# Der Rückweg fragt die Seite: der Stellvertreter meldet den Stand des pm2-Stellvertreters.
printf '#!/usr/bin/env bash\nprintf \x27{"ok":true,"build":"%%s"}\x27 "$(cat /home/ploi/stub/live 2>/dev/null)"\n' > /usr/local/bin/curl
chmod 755 /usr/local/bin/pm2 /usr/local/bin/node /usr/local/bin/curl

install -m 755 /ops/app-release.sh "$SCRIPT"
printf 'help help.pukalani.app\nneu  neu.pukalani.app\n' > "$H/ops/apps.conf"
chown -R ploi:ploi "$H"
chown root:root /run/sshd && chmod 755 /run/sshd
/usr/sbin/sshd

# Ein Stand zum Verschicken: `.output/…`, mit Masse, damit ein Abbruch mittendrin möglich ist.
pack() { # $1 = Marke → /work/<marke>.tar.zst
  rm -rf /work/stage && mkdir -p /work/stage/.output/server /work/stage/.output/public
  echo "// $1" > /work/stage/.output/server/index.mjs
  head -c 6000000 /dev/urandom > /work/stage/.output/public/masse.bin
  tar -C /work/stage -cf - .output | zstd -q -3 -o "/work/$1.tar.zst" -f
}
pack eins; pack zwei; pack drei
mkdir -p /work/ops /work/watch && cp /ops/pm2-heal.sh /work/ops/ && echo 'module.exports = {}' > /work/ops/ecosystem-help.config.cjs
echo '// Stellvertreter' > /work/watch/verify-stale-keys.mjs && echo '// Stellvertreter' > /work/watch/verify-instance-admins.mjs
current() { basename "$(readlink "$REL/current" 2>/dev/null)" 2>/dev/null || true; }

# Ein ganzes Ausliefern — die Zeilen aus dem Schritt „Ausliefern" von deploy.yml
# (Dateien der Site aus zwei Ordnern: ops/ und die Prüf-Skripte des Wächters).
deliver() { # $1 = Archiv, $2 = Commit
  ssh prod "$SCRIPT release-put help $2" < "/work/$1.tar.zst" \
    && tar -cf /work/ops-help.tar -C /work/ops ecosystem-help.config.cjs pm2-heal.sh -C /work/watch verify-stale-keys.mjs verify-instance-admins.mjs \
    && ssh prod "$SCRIPT ops-put help" < /work/ops-help.tar \
    && ssh prod "$SCRIPT activate help $2" </dev/null \
    && ssh prod "$SCRIPT prune help" </dev/null
}

echo "A — heutige Eintragung (restrict, kein fester Befehl)"
authorize 'restrict'
check "die Weiche des Workflows findet das Skript" ssh prod "test -x $SCRIPT"
check "ein ganzes Ausliefern läuft durch" deliver eins "$A"
[ "$(current)" = "$A" ] && ok "der Verweis zeigt auf den neuen Stand" || bad "der Verweis zeigt auf $(current)"
grep -q "startOrReload $H/help.pukalani.app/ops/ecosystem-help.config.cjs --update-env" "$STUB/log" && ok "pm2 lud mit der Ecosystem-Datei der Site neu" || bad "kein startOrReload im Protokoll"
check "der Stand liegt vollständig da" test -f "$REL/$A/public/masse.bin"
check "die Prüf-Skripte des Wächters liegen bei den Dateien der Site" test -f "$H/help.pukalani.app/ops/verify-stale-keys.mjs"
check "der Font-Cache kommt als lesbares tar" bash -c "ssh prod '$SCRIPT fonts-get' </dev/null | tar -tf - >/dev/null"

echo "B — fester Befehl"
authorize "command=\"$SCRIPT\",restrict"
check "dasselbe Ausliefern läuft mit denselben Befehlszeilen durch" deliver zwei "$B"
[ "$(current)" = "$B" ] && ok "der Verweis zeigt auf den neuen Stand" || bad "der Verweis zeigt auf $(current)"
expect_exit "eine freie Befehlszeile wird abgelehnt" 64 ssh prod 'echo frei'
grep -q frei /tmp/last.out && grep -q Abgelehnt /tmp/last.out || true
if ssh prod 'echo frei' 2>/dev/null </dev/null | grep -qx frei; then bad "die freie Befehlszeile wurde AUSGEFÜHRT"; else ok "… und nicht ausgeführt"; fi
expect_exit "die Weiche des Übergangs (test -x) wird abgelehnt" 64 ssh prod "test -x $SCRIPT"
expect_exit "eine Anmeldung ohne Befehl wird abgelehnt" 64 ssh prod
mkdir -p /work/rs && echo x > /work/rs/x
if rsync -a -e ssh /work/rs/ "prod:$H/rs-ziel/" >/dev/null 2>&1; then bad "rsync kam durch"; else ok "rsync wird abgelehnt"; fi
check "… und hat nichts angelegt" test ! -e "$H/rs-ziel"
if scp -q /work/rs/x "prod:$H/scp-ziel" >/dev/null 2>&1; then bad "scp kam durch"; else ok "scp wird abgelehnt"; fi
check "… und hat nichts angelegt" test ! -e "$H/scp-ziel"
expect_exit "ein angehängter zweiter Befehl wird abgelehnt" 64 ssh prod "$SCRIPT list help; id"
expect_exit "der Aufrufer wählt keine Wurzel" 64 ssh prod "$SCRIPT list help --root /tmp"
expect_exit "eine App außerhalb der Liste wird abgelehnt" 2 ssh prod "$SCRIPT list fremd"
check "der eigene Zugang ist unverändert frei" ssh own 'echo frei'
# RW1 (c): der aktive Stand wird nicht überschrieben.
INO="$(stat -c %i "$REL/$B/server/index.mjs")"
ssh prod "$SCRIPT release-put help $B" < /work/drei.tar.zst > /tmp/last.out 2>&1 || true
grep -q 'nicht überschrieben' /tmp/last.out && [ "$(stat -c %i "$REL/$B/server/index.mjs")" = "$INO" ] && grep -q '// zwei' "$REL/$B/server/index.mjs" \
  && ok "der aktive Stand wird nicht überschrieben" || bad "der aktive Stand wurde angefasst"

echo "C — Abbruch mitten im Empfangen"
{ head -c 300000 /work/drei.tar.zst; sleep 20; } | ssh prod "$SCRIPT release-put help $C" >/dev/null 2>&1 &
PID=$!
sleep 2
check "währenddessen liegt nur ein Eingangs-Verzeichnis da" bash -c "ls -d $REL/.incoming-$C.* && test ! -e $REL/$C"
pkill -P "$PID" ssh 2>/dev/null || true; kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true
sleep 3
check "danach ist das Eingangs-Verzeichnis weg" bash -c "! ls -d $REL/.incoming-* 2>/dev/null | grep -q ."
check "der halbe Stand wurde kein Stand" test ! -e "$REL/$C"
[ "$(current)" = "$B" ] && ok "der Verweis ist unverändert" || bad "der Verweis zeigt auf $(current)"
check "ein neuer Versuch gelingt danach" bash -c "ssh prod '$SCRIPT release-put help $C' < /work/drei.tar.zst"

echo "D — Abbruch mitten im Umstellen"
echo 4 > "$STUB/slow"; : > "$STUB/log"
ssh prod "$SCRIPT activate help $C" </dev/null >/dev/null 2>&1 &
PID=$!
sleep 1.5
kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true
[ "$(current)" = "$C" ] && ok "der Verweis war beim Abbruch schon umgelegt" || bad "der Verweis zeigt auf $(current)"
sleep 6
grep -q '^pm2 save' "$STUB/log" && [ "$(cat "$STUB/live")" = "$C" ] && ok "der Server hat Neuladen und Sichern zu Ende gebracht" || bad "das Umstellen blieb halb stehen"
rm -f "$STUB/slow"

echo "E — zwei Läufe zur selben Zeit"
: > "$STUB/log"
su ploi -c "APP_RELEASE_HOLD=3 $SCRIPT activate help $A" >/tmp/e1.out 2>&1 &
P1=$!
sleep 1
START=$(date +%s)
su ploi -c "$SCRIPT activate help $B" >/tmp/e2.out 2>&1; E2=$?
WAITED=$(( $(date +%s) - START ))
wait "$P1"; E1=$?
[ "$E1" = 0 ] && [ "$E2" = 0 ] && ok "beide Läufe enden gut" || bad "Exit $E1 und $E2"
[ "$WAITED" -ge 1 ] && ok "der zweite hat gewartet ($WAITED s)" || bad "der zweite hat nicht gewartet"
[ "$(current)" = "$B" ] && grep -q "von $A auf $B" /tmp/e2.out && ok "der zweite stellte NACH dem ersten um" || bad "Reihenfolge stimmt nicht: $(cat /tmp/e2.out)"
su ploi -c "APP_RELEASE_HOLD=4 $SCRIPT activate help $A" >/dev/null 2>&1 &
P1=$!
sleep 1
: > "$STUB/log.before"; cp "$STUB/log" "$STUB/log.before"
expect_exit "ohne Geduld bricht der zweite mit Exit 7 ab" 7 su ploi -c "APP_RELEASE_LOCK_WAIT=1 $SCRIPT activate help $C"
grep -q 'nichts geändert' /tmp/last.out && ok "… und sagt, dass nichts geändert ist" || bad "Meldung fehlt"
wait "$P1" || true
[ "$(current)" = "$A" ] && ok "… und hat den Verweis nicht angefasst" || bad "der Verweis zeigt auf $(current)"

echo "F — fehlende Verzeichnisse"
expect_exit "eine App ohne Stände-Verzeichnis: list meldet es" 0 ssh prod "$SCRIPT list neu"
grep -qx missing /tmp/last.out && ok "… als „missing“" || bad "list sagte: $(cat /tmp/last.out)"
check "der erste Stand einer neuen App legt das Verzeichnis an" bash -c "ssh prod '$SCRIPT release-put neu $A' < /work/eins.tar.zst && test -f $H/releases/neu/$A/server/index.mjs"
expect_exit "ohne Verzeichnis der Site: ops-put bricht ab" 4 bash -c "tar -C /work/ops -cf - pm2-heal.sh | ssh prod '$SCRIPT ops-put neu'"
expect_exit "ohne Ecosystem-Datei: activate bricht ab" 4 ssh prod "$SCRIPT activate neu $A"
check "… und hat keinen Verweis angelegt" test ! -e "$H/releases/neu/current"
rm -rf "$H/fonts-cache"
check "ohne Font-Cache: fonts-get liefert ein leeres, lesbares tar" bash -c "ssh prod '$SCRIPT fonts-get' </dev/null | tar -tf - >/dev/null"
mkdir -p /work/f/fonts/meta && echo neu > /work/f/fonts/a.woff2 && echo m > /work/f/fonts/meta/a-data.json
check "fonts-put legt den Cache an" bash -c "tar -C /work/f -cf - fonts | ssh prod '$SCRIPT fonts-put' && test -f $H/fonts-cache/a.woff2 && test -f $H/fonts-cache/meta/a-data.json"

echo "G — der Rückweg (ops/rollback.sh, eigener Zugang, Skript reist mit)"
cp -r /ops /work/repo-ops
printf 'help help.pukalani.app\n' > /work/repo-ops/apps.conf
# Die Kopie auf dem Server wird für den Rückweg nicht gebraucht: beiseite.
mv "$SCRIPT" "$SCRIPT.weg"
expect_exit "zurück auf den vorigen Stand" 0 env ROLLBACK_SSH=own ROLLBACK_PROBE_SLEEP=0 bash /work/repo-ops/rollback.sh help "$B" --apply
[ "$(current)" = "$B" ] && ok "der Verweis zeigt auf den vorigen Stand" || bad "der Verweis zeigt auf $(current)"
expect_exit "und wieder nach vorn" 0 env ROLLBACK_SSH=own ROLLBACK_PROBE_SLEEP=0 bash /work/repo-ops/rollback.sh help "$C" --apply
[ "$(current)" = "$C" ] && ok "der Verweis zeigt auf den neueren Stand" || bad "der Verweis zeigt auf $(current)"
touch "$STUB/fail"
expect_exit "scheitert der Neustart, liegt der Verweis wieder zurück" 5 env ROLLBACK_SSH=own ROLLBACK_PROBE_SLEEP=0 bash /work/repo-ops/rollback.sh help "$B" --apply
[ "$(current)" = "$C" ] && ok "… auf dem Stand davor" || bad "der Verweis zeigt auf $(current)"
rm -f "$STUB/fail"; mv "$SCRIPT.weg" "$SCRIPT"

echo
echo "Bestanden: $PASS · Gescheitert: $FAIL"
[ "$FAIL" -eq 0 ]
