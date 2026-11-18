#!/usr/bin/env bash
# Das Wächter-Tor gegen eine ATTRAPPE mit ECHTEM sshd beweisen (CI1 a/c,
# 2026-11-18).
#
# WOZU: ops/app-watch-gate.sh wird auf app-prod der feste Befehl des
# Wächter-Schlüssels. Ob die Prüf-Skripte mit freiem Schlüssel und mit festem
# Befehl dasselbe bekommen, ob sshd scp, rsync und freie Befehle wirklich
# abweist und ob die ganze Kette (scripts/ops/verify-*.mjs --ssh → sshd → Tor
# → Prüf-Skript auf dem Server) hält, zeigt nur ein echter sshd — der
# Schlüssel der CI hat keine lokale Kopie, und an Production übt man das nicht.
# Nach JEDER Änderung an ops/app-watch-gate.sh, an `sums` in
# ops/appwrite-cert-gate.sh oder am ssh-Weg der sechs Prüf-Skripte noch einmal
# laufen lassen.
#
# WIE: ein Wegwerf-Container (Ubuntu wie der Server) mit sshd, node, den
# Benutzern `ploi` (App-Server) und `awploi` (Stellvertreter des
# Datenbank-Servers, Tor ops/appwrite-cert-gate.sh als fester Befehl), zwei
# Wegwerf-Schlüsseln (eigener Zugang, CI) und einem Stellvertreter für pm2.
# Die `.env`-Dateien tragen einen erkennbaren Geheimnis-Wert; er darf in
# keiner Ausgabe stehen. api.pukalani.app zeigt im Container ins Leere — kein
# Aufruf verlässt ihn Richtung Production.
#   A  heutige Eintragung (`restrict`, kein fester Befehl): jedes Wort
#   B  fester Befehl: jedes Wort liefert dasselbe wie unter A; scp, rsync,
#      freie Befehle und eine Anmeldung ohne Befehl enden mit Exit 64 und
#      legen nichts an
#   C  die echten Prüf-Skripte (`--ssh`, PUKALANI_OPS_SSH) unter A und B:
#      gleiche Exit-Codes, kein Geheimnis in der Ausgabe
#   D  der Vergleich verify-server-scripts.mjs: altes Tor auf dem
#      Datenbank-Server („Wort unbekannt" ⇒ Warnung, kein Rot), neues Tor
#      (grün), eine abweichende Datei (rot)
# Der Rechner selbst wird nicht berührt; das Repo ist nur lesend eingehängt.
#
# AUFRUF (vom Rechner, braucht nur docker und Netz für die Pakete):
#   ops/app-watch-gate-attrappe.sh           baut auf, prüft, räumt ab
#   ops/app-watch-gate-attrappe.sh --keep    lässt den Container zum Nachsehen stehen
#
# Exit: 0 alles bestanden · 1 mindestens eine Prüfung gescheitert
set -euo pipefail

NAME='n12-app-watch-gate-attrappe'
IMAGE='ubuntu:24.04'

if [ "${1:-}" != '--inside' ]; then
  KEEP=0
  [ "${1:-}" = '--keep' ] && KEEP=1
  REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  cleanup() {
    if [ "$KEEP" = 1 ]; then
      echo "Container $NAME bleibt stehen. Abräumen: docker rm -f -v $NAME"
    else
      docker rm -f -v "$NAME" >/dev/null 2>&1 || true
    fi
  }
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  trap cleanup EXIT
  docker run -d --name "$NAME" -v "$REPO_DIR/ops":/repo/ops:ro -v "$REPO_DIR/scripts":/repo/scripts:ro "$IMAGE" sleep 3600 >/dev/null
  docker exec "$NAME" bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null && apt-get install -y -qq openssh-server openssh-client rsync nodejs >/dev/null 2>&1' \
    || { echo "Die Pakete für die Attrappe ließen sich nicht installieren (Netz?)."; exit 1; }
  docker exec "$NAME" bash /repo/ops/app-watch-gate-attrappe.sh --inside </dev/null
  exit $?
fi

# ── Ab hier: IM Container (als root) ────────────────────────────────────────
umask 022
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✖ $1"; }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
expect_exit() {
  local what="$1" want="$2" got=0; shift 2
  "$@" >/tmp/last.out 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$what"; else bad "$what (Exit $got statt $want: $(head -c 200 /tmp/last.out | tr '\n' ' '))"; fi
}

H=/home/ploi
AW=/home/awploi
GATE="$H/ops/app-watch-gate.sh"
MARKE='GEHEIM-ATTRAPPE-4c1d'
SITES="$(awk '{ sub(/#.*/, "") } NF == 2 { print $2 }' /repo/ops/apps.conf)"
: > /tmp/alles.out

useradd -m -s /bin/bash ploi
useradd -m -s /bin/bash awploi
mkdir -p /run/sshd "$H/.ssh" "$H/ops" "$H/.pm2/logs" "$AW/.ssh" "$AW/bin" "$AW/ops" /root/.ssh /work
ssh-keygen -A >/dev/null
ssh-keygen -q -t ed25519 -N '' -C eigener-zugang -f /root/.ssh/own
ssh-keygen -q -t ed25519 -N '' -C ci-waechter -f /root/.ssh/ci
cat > /root/.ssh/config <<EOF
Host own
  HostName 127.0.0.1
  User ploi
  IdentityFile /root/.ssh/own
Host prod
  HostName 127.0.0.1
  User ploi
  IdentityFile /root/.ssh/ci
Host awprod
  HostName 127.0.0.1
  User awploi
  IdentityFile /root/.ssh/ci
Host *
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  LogLevel ERROR
EOF
chmod 700 /root/.ssh && chmod 600 /root/.ssh/config
authorize() { # $1 = Optionen vor dem CI-Schlüssel auf dem App-Server
  { cat /root/.ssh/own.pub; printf '%s %s\n' "$1" "$(cat /root/.ssh/ci.pub)"; } > "$H/.ssh/authorized_keys"
  chown -R ploi:ploi "$H/.ssh"; chmod 700 "$H/.ssh"; chmod 600 "$H/.ssh/authorized_keys"
}
# Der Datenbank-Server: der Wächter-Schlüssel nur mit festem Befehl, wie dort.
printf 'command="%s/bin/pukalani-cert-gate.sh",restrict %s\n' "$AW" "$(cat /root/.ssh/ci.pub)" > "$AW/.ssh/authorized_keys"
chown -R awploi:awploi "$AW/.ssh"; chmod 700 "$AW/.ssh"; chmod 600 "$AW/.ssh/authorized_keys"

# Kein Aufruf Richtung Production: die Adresse der Datenbank zeigt ins Leere.
echo '127.0.0.1 api.pukalani.app' >> /etc/hosts
# Ein leerer Webserver-Ordner: nginx-check antwortet (mit Befunden, die hier nicht zählen).
mkdir -p /etc/nginx/sites-enabled

# Stellvertreter: pm2 kennt keinen Prozess.
printf '#!/usr/bin/env bash\ncase "$1" in jlist) echo "[]" ;; esac\nexit 0\n' > /usr/local/bin/pm2
chmod 755 /usr/local/bin/pm2

# Der App-Server: Tor und Liste von Hand eingespielt, die Dateien der Sites
# so, wie das Ausliefern sie ablegt (`OPS_FILES` in ops/app-release.sh).
install -m 755 /repo/ops/app-watch-gate.sh "$GATE"
install -m 644 /repo/ops/apps.conf "$H/ops/apps.conf"
for f in app-release.sh app-env-bundle.sh appwrite-backup.pub.asc; do install -m 644 "/repo/ops/$f" "$H/ops/$f"; done
for site in $SITES; do
  mkdir -p "$H/$site/ops"
  for f in app-watch-counts.mjs nginx-check.mjs nginx-sites.conf cron-check.sh cron.conf; do cp "/repo/ops/$f" "$H/$site/ops/"; done
  cp /repo/scripts/ops/verify-stale-keys.mjs /repo/scripts/ops/verify-instance-admins.mjs "$H/$site/ops/"
done
cat > "$H/platform.pukalani.app/.env" <<EOF
NUXT_PUBLIC_APPWRITE_ENDPOINT=http://127.0.0.1:9/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=account
NUXT_PUBLIC_APPWRITE_DATABASE_ID=main
NUXT_APPWRITE_KEY=$MARKE
NUXT_SMTP_PASS="$MARKE"
NUXT_SMTP_USER=
EOF
cat > "$H/admin.pukalani.app/.env" <<EOF
NUXT_PUBLIC_APPWRITE_ENDPOINT=http://127.0.0.1:9/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID='admin'
NUXT_APPWRITE_KEY=$MARKE
EOF
NOW_MINUS_1H="$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%S.000Z)"
printf '{"level":"warn","time":"%s","event":"auth.mail_route_breaker","route":"/api/auth/signup","ip":"%s"}\n' "$NOW_MINUS_1H" "$MARKE" > "$H/.pm2/logs/platformpukalaniapp-error-0.log"
chown -R ploi:ploi "$H"

# Der Datenbank-Server: zuerst ein Tor, das `sums` noch nicht kennt.
sed 's/^  sums)$/  sums-noch-nicht)/' /repo/ops/appwrite-cert-gate.sh > "$AW/bin/pukalani-cert-gate.sh"
chmod 755 "$AW/bin/pukalani-cert-gate.sh"
for f in cron-check.sh cron.conf realtime-watchdog.sh appwrite-backup.sh appwrite-volumes.conf appwrite-backup.pub.asc; do install -m 644 "/repo/ops/$f" "$AW/ops/$f"; done
chown -R awploi:awploi "$AW"

chown root:root /run/sshd && chmod 755 /run/sshd
/usr/sbin/sshd

SINCE="$(date -u -d '-25 hours' +%Y-%m-%dT%H:%M:%S.000Z)"
WORDS=(
  "site-env platform.pukalani.app"
  "site-env help.pukalani.app"
  "site-project platform.pukalani.app"
  "site-project admin.pukalani.app"
  "stale-keys"
  "stale-keys strict"
  "instance-admins strict"
  "mail-breaker $SINCE"
  "app-signals platform 25"
  "app-signals branding 25"
  "nginx-check"
  "cron-check"
  "sums"
)
# Jedes Wort mit DERSELBEN Befehlszeile, die die Prüf-Skripte schicken; Ausgabe und Exit getrennt festhalten.
record() { # $1 = Ordner
  local i=0 w code
  mkdir -p "$1"
  for w in "${WORDS[@]}"; do
    code=0
    ssh prod "$GATE $w" </dev/null >"$1/$i.out" 2>"$1/$i.err" || code=$?
    echo "$code" > "$1/$i.code"
    cat "$1/$i.out" "$1/$i.err" >> /tmp/alles.out
    i=$((i + 1))
  done
}
# Die echten Prüf-Skripte über ssh, wie im Workflow (nur das Ziel ist die Attrappe).
CHAIN=(
  "verify-site-env.mjs"
  "verify-stale-keys.mjs --ssh --strict"
  "verify-instance-admins.mjs --ssh --strict"
  "verify-mail-breaker.mjs --ssh --strict"
  "verify-app-signals.mjs --ssh"
  "verify-server-config.mjs --ssh"
)
chain() { # $1 = Ordner
  local i=0 c code
  mkdir -p "$1"
  for c in "${CHAIN[@]}"; do
    code=0
    # shellcheck disable=SC2086
    (cd /repo && PUKALANI_OPS_SSH=prod PUKALANI_APPWRITE_SSH=awprod GITHUB_ACTIONS='' node scripts/ops/$c) </dev/null >"$1/$i.out" 2>&1 || code=$?
    echo "$code" > "$1/$i.code"
    cat "$1/$i.out" >> /tmp/alles.out
    i=$((i + 1))
  done
}

echo "A — heutige Eintragung (restrict, kein fester Befehl)"
authorize 'restrict'
record /work/a
for i in "${!WORDS[@]}"; do
  echo "    ${WORDS[$i]}  → Exit $(cat "/work/a/$i.code"), $(wc -l < "/work/a/$i.out" | tr -d ' ') Zeilen"
done
[ "$(cat /work/a/0.code)" = 0 ] && grep -qx 'NUXT_APPWRITE_KEY=1' /work/a/0.out && grep -qx 'NUXT_SMTP_USER=0' /work/a/0.out && ok "site-env: Namen und leer/nicht leer" || bad "site-env: $(cat /work/a/0.out)"
grep -qx '__NO_ENV_FILE__' /work/a/1.out && ok "site-env ohne .env: die feste Marke" || bad "site-env ohne .env"
grep -qx 'account' /work/a/2.out && grep -qx 'admin' /work/a/3.out && ok "site-project: die Projekt-Id, ohne Anführungszeichen" || bad "site-project"
[ "$(cat /work/a/5.code)" = 0 ] && grep -q 'Zugangs-Wächter' /work/a/5.out && ok "stale-keys: das ausgelieferte Skript lief auf dem Server" || bad "stale-keys: Exit $(cat /work/a/5.code)"
grep -q 'Aussperr-Wächter' /work/a/6.out && ok "instance-admins: das ausgelieferte Skript lief auf dem Server" || bad "instance-admins"
[ "$(cat /work/a/7.out)" = "$NOW_MINUS_1H auth.mail_route_breaker" ] && ok "mail-breaker: genau eine Zeile „Zeitpunkt Ereignis“" || bad "mail-breaker: $(cat /work/a/7.out)"
grep -q '^sum app-watch-gate.sh [0-9a-f]\{64\}$' /work/a/12.out && ok "sums: das Tor meldet sich selbst" || bad "sums: $(cat /work/a/12.out)"

echo "B — fester Befehl"
authorize "command=\"$GATE\",restrict"
record /work/b
same=1
for i in "${!WORDS[@]}"; do
  if ! cmp -s "/work/a/$i.out" "/work/b/$i.out" || ! cmp -s "/work/a/$i.code" "/work/b/$i.code"; then
    same=0
    bad "„${WORDS[$i]}“ liefert unter dem festen Befehl etwas anderes"
  fi
done
[ "$same" = 1 ] && ok "alle ${#WORDS[@]} Worte liefern Wort für Wort dasselbe wie unter A (Ausgabe und Exit-Code)"
expect_exit "eine freie Befehlszeile wird abgelehnt" 64 ssh prod 'echo frei'
grep -q '^Abgelehnt: erlaubt sind' /tmp/last.out && ok "… mit der Zeile „Abgelehnt: erlaubt sind …“" || bad "Meldung: $(cat /tmp/last.out)"
if ssh prod 'echo frei' 2>/dev/null </dev/null | grep -qx frei; then bad "die freie Befehlszeile wurde AUSGEFÜHRT"; else ok "… und nicht ausgeführt"; fi
expect_exit "die alte Zeile von verify-site-env (awk über die .env) wird abgelehnt" 64 ssh prod "test -f $H/platform.pukalani.app/.env && awk '{print}' $H/platform.pukalani.app/.env || echo __NO_ENV_FILE__"
grep -q "$MARKE" /tmp/last.out && bad "… und hat die .env ausgegeben" || ok "… und gibt nichts aus der .env aus"
expect_exit "eine Anmeldung ohne Befehl wird abgelehnt" 64 ssh prod
expect_exit "ein angehängter zweiter Befehl wird abgelehnt" 64 ssh prod "$GATE sums; id"
expect_exit "eine Site außerhalb der Liste wird abgelehnt" 64 ssh prod "$GATE site-env fremd.example.org"
if scp -q /repo/scripts/ops/verify-stale-keys.mjs prod:/tmp/pukalani-stale-keys.mjs >/dev/null 2>&1; then bad "scp kam durch"; else ok "scp (der alte Weg der beiden Prüf-Skripte) wird abgelehnt"; fi
check "… und hat nichts angelegt" test ! -e /tmp/pukalani-stale-keys.mjs
mkdir -p /work/rs && echo x > /work/rs/x
if rsync -a -e ssh /work/rs/ "prod:$H/rs-ziel/" >/dev/null 2>&1; then bad "rsync kam durch"; else ok "rsync wird abgelehnt"; fi
check "… und hat nichts angelegt" test ! -e "$H/rs-ziel"
check "der eigene Zugang ist unverändert frei" ssh own 'echo frei'

echo "C — die echten Prüf-Skripte über ssh (PUKALANI_OPS_SSH), unter A und unter B"
authorize 'restrict'
chain /work/ca
authorize "command=\"$GATE\",restrict"
chain /work/cb
for i in "${!CHAIN[@]}"; do
  a="$(cat "/work/ca/$i.code")"; b="$(cat "/work/cb/$i.code")"
  if [ "$a" = "$b" ]; then ok "${CHAIN[$i]}: Exit $b unter A und B"; else bad "${CHAIN[$i]}: Exit $a unter A, $b unter B"; fi
done
grep -q '✔ platform .*Pflicht-Variablen gesetzt\|FEHLT\|LEER' /work/cb/0.out && ! grep -q 'ssh/Lesen fehlgeschlagen' /work/cb/0.out && ok "verify-site-env liest jede Site über das Tor" || bad "verify-site-env: $(grep -m3 'fehlgeschlagen' /work/cb/0.out)"
[ "$(cat /work/cb/1.code)" = 0 ] && grep -q 'Zugangs-Wächter' /work/cb/1.out && ok "verify-stale-keys --ssh: Bericht vom Server, Exit 0 (nur „unklar“)" || bad "verify-stale-keys: Exit $(cat /work/cb/1.code)"
[ "$(cat /work/cb/3.code)" = 1 ] && grep -q '1 Mal ausgelöst' /work/cb/3.out && ok "verify-mail-breaker --ssh --strict: die Notbremse wird gesehen (Exit 1)" || bad "verify-mail-breaker: Exit $(cat /work/cb/3.code)"
! grep -q 'nicht erreichbar' /work/cb/4.out && ok "verify-app-signals: jede App hat geantwortet" || bad "verify-app-signals: $(grep -m2 'nicht erreichbar' /work/cb/4.out)"
grep -q 'Webserver (app-prod): ' /work/cb/5.out && ! grep -q '(app-prod): keine lesbare Antwort' /work/cb/5.out && ok "verify-server-config: Antwort von nginx-check und cron-check über das Tor" || bad "verify-server-config: $(head -c 400 /work/cb/5.out)"
rm -f "$H/platform.pukalani.app/ops/verify-stale-keys.mjs"
expect_exit "fehlt das Prüf-Skript auf dem Server: „nicht geprüft“, Exit 2 (nie grün)" 2 bash -c "cd /repo && PUKALANI_OPS_SSH=prod node scripts/ops/verify-stale-keys.mjs --ssh --strict"
grep -q 'Nicht geprüft' /tmp/last.out && ok "… mit einem klaren Satz" || bad "Meldung: $(cat /tmp/last.out)"
cp /repo/scripts/ops/verify-stale-keys.mjs "$H/platform.pukalani.app/ops/"

echo "D — der Vergleich „liegt auf dem Server, was im Repo steht?“"
sums() { (cd /repo && PUKALANI_OPS_SSH=prod PUKALANI_APPWRITE_SSH=awprod GITHUB_ACTIONS='' node scripts/ops/verify-server-scripts.mjs --strict) </dev/null; }
expect_exit "altes Tor auf dem Datenbank-Server: kein Rot" 0 sums
cat /tmp/last.out >> /tmp/alles.out
grep -q 'appwrite-prod: das Tor kennt das Wort „sums“ noch nicht — NICHT GEPRÜFT' /tmp/last.out && ok "… aber die Warnzeile „nicht geprüft“" || bad "Warnzeile fehlt: $(cat /tmp/last.out)"
install -m 755 -o awploi /repo/ops/appwrite-cert-gate.sh "$AW/bin/pukalani-cert-gate.sh"
expect_exit "neues Tor, alles wie im Repo: grün" 0 sums
cat /tmp/last.out >> /tmp/alles.out
[ "$(grep -c '^✔ app' /tmp/last.out)" = 12 ] && ok "… zwölf Dateien wie im Repo" || bad "$(cat /tmp/last.out)"
echo '# von Hand geändert' >> "$AW/ops/cron.conf"
rm -f "$H/ops/app-env-bundle.sh"
expect_exit "eine abweichende und eine fehlende Datei: rot mit --strict" 1 sums
cat /tmp/last.out >> /tmp/alles.out
grep -q 'appwrite-prod: cron.conf weicht von ops/cron.conf ab' /tmp/last.out && grep -q 'app-prod: app-env-bundle.sh fehlt auf dem Server' /tmp/last.out && ok "… je Befund ein Satz mit Handgriff" || bad "$(cat /tmp/last.out)"

echo "Kein Geheimnis in irgendeiner Ausgabe"
if grep -q "$MARKE" /tmp/alles.out; then bad "der Geheimnis-Wert steht in einer Ausgabe"; else ok "der Geheimnis-Wert aus den .env steht in keiner Ausgabe ($(wc -l < /tmp/alles.out | tr -d ' ') Zeilen geprüft)"; fi

echo
echo "Bestanden: $PASS · Gescheitert: $FAIL"
[ "$FAIL" -eq 0 ]
