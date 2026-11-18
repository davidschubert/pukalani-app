#!/usr/bin/env bash
# TOR FÜR DEN WÄCHTER-SCHLÜSSEL AUF DEM APP-SERVER (CI1 a, 2026-11-18).
#
# WOZU: der tägliche Job `server` in .github/workflows/production-watch.yml
# schaut über den Wächter-Schlüssel (`WATCH_SSH_KEY`) auf app-prod nach. Bis
# hierher schickten sechs Prüf-Skripte dafür freie Befehlszeilen (ein `awk`
# über eine `.env`, ein `grep` im pm2-Log, zwei kopierten sich per `scp`
# selbst hinüber) — der Schlüssel brauchte deshalb eine Shell. Jetzt gibt es
# genau diese Handgriffe als FESTE WORTE, und jedes Wort liest nur:
#
#   site-env <site>            je Variable der `.env` der Site NAME=1 (dahinter
#                              steht etwas) oder NAME=0 (leer) — nie ein Wert;
#                              ohne Datei `__NO_ENV_FILE__`
#   site-project <site>        die Projekt-Id der Site (NUXT_PUBLIC_…, steht in
#                              jeder ausgelieferten Seite); nur in fester Form,
#                              sonst `__INVALID__`
#   stale-keys [strict]        verify-stale-keys.mjs über /home/ploi
#   instance-admins [strict]   verify-instance-admins.mjs über /home/ploi
#   mail-breaker <zeitpunkt> [<ereignis>]
#                              Zeitpunkt und Ereignis der Notbremsen-Zeilen im
#                              pm2-Fehlerlog seit <zeitpunkt> (ISO, UTC);
#                              <ereignis> nur für den Probelauf
#   app-signals <app> <stunden>
#                              ops/app-watch-counts.mjs der Site dieser App
#   nginx-check                ops/nginx-check.mjs
#   cron-check                 ops/cron-check.sh app-prod
#   sums                       je von Hand eingespielter Datei unter ~/ops eine
#                              Zeile `sum <name> <sha256>` oder `sum <name> fehlt`
#
# App und Site kommen NUR aus der Liste auf dem Server (~/ops/apps.conf, von
# Hand eingespielt, dasselbe Format wie ops/apps.conf im Repo). Die beiden
# `verify-*.mjs` und die Zähl- und Prüf-Skripte legt das Ausliefern unter
# /home/ploi/<site>/ops/ ab (ops/app-release.sh, `OPS_FILES`); gefragt wird die
# Site `platform.pukalani.app`, steht sie nicht in der Liste, die erste — die
# Regel, nach der scripts/ops/verify-server-config.mjs bis dahin den Ordner
# wählte. Fehlt dort eine Datei, antwortet das Tor „Nicht geprüft" (Exit 6).
#
# ZWEI BETRIEBSARTEN, EINE BEFEHLSZEILE
#   Die Prüf-Skripte rufen `ssh <server> /home/ploi/ops/app-watch-gate.sh <wort> …`.
#   Solange der Schlüssel noch eine Shell hat (`restrict` allein), führt die
#   Shell das Skript mit Parametern aus. Mit festem Befehl
#
#     # ~/.ssh/authorized_keys auf app-prod (EINE Zeile)
#     command="/home/ploi/ops/app-watch-gate.sh",restrict ssh-ed25519 AAAA… pukalani-ci-watch
#
#   führt sshd IMMER dieses Skript aus; dieselbe Zeile steht dann in
#   SSH_ORIGINAL_COMMAND, und der eigene Pfad als erstes Wort wird übersprungen
#   (TOR-MODUS, dasselbe Muster wie ops/app-release.sh). Kein scp, kein rsync,
#   keine freie Befehlszeile.
#
# DAS PROTOKOLL DES WÄCHTERS IST ÖFFENTLICH: gefiltert wird HIER. Kein Wert aus
# einer `.env` (außer der öffentlichen Projekt-Id), keine Dateiliste, keine
# pm2-Tabelle, keine Log-Zeile — die Notbremsen-Zeilen werden auf Zeitpunkt
# und Ereignis gekürzt und gegen diese Form geprüft.
#
# EINSPIELEN (nur von Hand): docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, Abschnitt
# „Feste Befehle auf app-prod", „Das Wächter-Tor". Der tägliche Wächter
# vergleicht die Datei auf dem Server mit dieser (`sums`,
# scripts/ops/verify-server-scripts.mjs).
#
# Für Tests (packages/core/tests/appWatchGate.test.ts, ops/app-watch-gate-attrappe.sh):
#   APP_WATCH_ROOT   statt /home/ploi
#   APP_WATCH_APPS   statt <wurzel>/ops/apps.conf
#
# Exit: 0 gut · 6 ein Stück auf dem Server fehlt (Liste, Skript) — „nicht
# geprüft" · 64 Befehl oder Angabe nicht erlaubt · sonst der Exit-Code des
# ausgeführten Prüf-Skripts, unverändert.
#
# Läuft mit bash 3.2 und den Werkzeugen von macOS (für die Tests): keine
# assoziativen Felder.
set -u

ROOT="${APP_WATCH_ROOT:-/home/ploi}"
APPS_FILE="${APP_WATCH_APPS:-$ROOT/ops/apps.conf}"
SCRIPT_SITE_FALLBACK='platform.pukalani.app'
WORDS='site-env, site-project, stale-keys, instance-admins, mail-breaker, app-signals, nginx-check, cron-check, sums'
# Was `sums` zeigt: von Hand eingespielte Dateien unter <wurzel>/ops.
SUM_FILES='app-release.sh app-watch-gate.sh apps.conf app-env-bundle.sh appwrite-backup.pub.asc'

# Dasselbe Programm wie ENV_STATE_AWK in scripts/ops/verify-site-env.mjs —
# WORTGLEICH (der Test appWatchGate.test.ts hält beide zusammen).
ENV_STATE_AWK='BEGIN { q = sprintf("%c", 39) }
{
  if (!match($0, /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=/)) next
  name = substr($0, RSTART, RLENGTH)
  gsub(/[ \t=]/, "", name)
  value = substr($0, RSTART + RLENGTH)
  gsub(/^[ \t]+/, "", value)
  gsub(/[ \t\r]+$/, "", value)
  first = substr(value, 1, 1)
  last = substr(value, length(value), 1)
  if (length(value) >= 2 && first == last && (first == "\"" || first == q)) value = substr(value, 2, length(value) - 2)
  print name "=" (value == "" ? "0" : "1")
}'

reject() { echo "Abgelehnt: $*"; exit 64; }
missing() { echo "Nicht geprüft: $*"; exit 6; }

# ── Aufruf lesen ────────────────────────────────────────────────────────────
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  REQUEST="$SSH_ORIGINAL_COMMAND"
else
  REQUEST="$*"
fi
case "$REQUEST" in
  *[!A-Za-z0-9\ ._:/-]*) reject "unerlaubte Zeichen im Befehl." ;;
esac
if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  set -f
  # shellcheck disable=SC2086
  set -- $SSH_ORIGINAL_COMMAND
  set +f
fi
# Die Prüf-Skripte rufen das Tor mit seinem Pfad auf; unter dem festen Befehl
# steht der Pfad dann als erstes Wort im gewünschten Befehl.
case "${1:-}" in */app-watch-gate.sh) shift ;; esac

WORD="${1:-}"
[ "$#" -gt 0 ] && shift
# Das Wort ZUERST: ein fremder Befehl (scp, rsync, eine Shell-Zeile) wird
# abgelehnt, bevor irgendeine seiner Angaben gelesen wird.
case "$WORD" in
  site-env|site-project|stale-keys|instance-admins|mail-breaker|app-signals|nginx-check|cron-check|sums) ;;
  *) reject "erlaubt sind $WORDS." ;;
esac

# ── Hilfen ──────────────────────────────────────────────────────────────────
need_count() { # $1 = so viele Angaben höchstens, $2 = mindestens
  [ "$ARGC" -le "$1" ] && [ "$ARGC" -ge "${2:-0}" ] || reject "falsche Zahl von Angaben für $WORD."
}
ARGC="$#"

need_list() {
  [ -r "$APPS_FILE" ] || missing "die App-Liste fehlt auf dem Server (ops/apps.conf)."
}
# Die Zeilen der Liste in fester Form: <app> <site>.
list_rows() {
  awk '{ sub(/#.*/, "") } NF == 2 && $1 ~ /^[a-z0-9-]+$/ && $2 ~ /^[a-z0-9][a-z0-9.-]*$/ { print $1, $2 }' "$APPS_FILE"
}
site_of_app() { list_rows | awk -v a="$1" '$1 == a { print $2; exit }'; }
known_site() { list_rows | awk -v s="$1" '$2 == s { print $2; exit }'; }
# Wo die Prüf-Skripte liegen (s. Kopf) — setzt DIR.
DIR=''
script_dir() {
  local site
  need_list
  site="$(known_site "$SCRIPT_SITE_FALLBACK")"
  [ -n "$site" ] || site="$(list_rows | awk 'NR == 1 { print $2 }')"
  [ -n "$site" ] || missing "die App-Liste auf dem Server nennt keine Site."
  DIR="$ROOT/$site/ops"
}
need_file() { # $1 = Datei, $2 = Name für die Meldung
  [ -f "$1" ] || missing "$2 liegt auf dem Server nicht unter <site>/ops (das Ausliefern legt es dort ab)."
}
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

case "$WORD" in
  site-env|site-project)
    need_count 1 1
    printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9.-]{0,80}$' || reject "ungültige Site."
    need_list
    SITE="$(known_site "$1")"
    [ -n "$SITE" ] || reject "$1 steht nicht in der App-Liste auf dem Server."
    ENV_FILE="$ROOT/$SITE/.env"
    if [ ! -f "$ENV_FILE" ]; then echo '__NO_ENV_FILE__'; exit 0; fi
    if [ "$WORD" = site-env ]; then
      awk "$ENV_STATE_AWK" "$ENV_FILE"
      exit 0
    fi
    # Die EINE öffentliche Angabe — wie die Zeile, die Nitro liest (die erste).
    VALUE="$(grep -m1 -E '^NUXT_PUBLIC_APPWRITE_PROJECT_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
    [ -n "$VALUE" ] || exit 0
    if printf '%s' "$VALUE" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'; then echo "$VALUE"; else echo '__INVALID__'; fi
    ;;

  stale-keys|instance-admins)
    need_count 1
    STRICT=''
    if [ "$ARGC" -eq 1 ]; then
      [ "$1" = strict ] || reject "$WORD nimmt nur „strict“."
      STRICT='--strict'
    fi
    script_dir
    FILE="$DIR/verify-$WORD.mjs"
    need_file "$FILE" "verify-$WORD.mjs"
    # shellcheck disable=SC2086
    node "$FILE" --dir "$ROOT" $STRICT </dev/null
    exit $?
    ;;

  mail-breaker)
    need_count 2 1
    printf '%s' "$1" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$' || reject "der Zeitpunkt hat nicht die Form JJJJ-MM-TTThh:mm:ss.mmmZ."
    EVENT='auth.mail_route_breaker'
    if [ "$ARGC" -eq 2 ]; then
      printf '%s' "$2" | grep -Eq '^[a-z][a-z0-9_]{0,40}(\.[a-z][a-z0-9_]{0,40}){1,3}$' || reject "ungültiger Ereignis-Name."
      EVENT="$2"
    fi
    # ISO-Zeitstempel vergleichen sich als Zeichenketten korrekt; `-F` sucht
    # die Event-Zeile wörtlich. Keine Datei (frische Instanz) ⇒ leer, kein
    # Fehler. Hinaus geht nur, was danach wie „Zeitpunkt Ereignis" aussieht.
    { grep -h -F "\"event\":\"$EVENT\"" "$ROOT"/.pm2/logs/*-error*.log 2>/dev/null || true; } \
      | awk -F'"time":"' -v seit="$1" '{ split($2, t, "\""); if (t[1] >= seit) print }' \
      | sed -E 's/.*"time":"([^"]*)".*"event":"([^"]*)".*/\1 \2/' \
      | { grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{8,12}Z [a-z0-9_.]{1,170}$' || true; } \
      | sort | tail -200
    exit 0
    ;;

  app-signals)
    need_count 2 2
    printf '%s' "$1" | grep -Eq '^[a-z0-9-]{1,40}$' || reject "ungültiger App-Name."
    printf '%s' "$2" | grep -Eq '^[0-9]{1,4}$' || reject "die Stunden sind keine Zahl."
    need_list
    SITE="$(site_of_app "$1")"
    [ -n "$SITE" ] || reject "$1 steht nicht in der App-Liste auf dem Server."
    FILE="$ROOT/$SITE/ops/app-watch-counts.mjs"
    need_file "$FILE" "app-watch-counts.mjs"
    node "$FILE" "$(printf '%s' "$SITE" | tr -d .)" "$((10#$2))" </dev/null
    exit $?
    ;;

  nginx-check)
    need_count 0
    script_dir
    need_file "$DIR/nginx-check.mjs" "nginx-check.mjs"
    node "$DIR/nginx-check.mjs" </dev/null
    exit $?
    ;;

  cron-check)
    need_count 0
    script_dir
    need_file "$DIR/cron-check.sh" "cron-check.sh"
    bash "$DIR/cron-check.sh" app-prod </dev/null
    exit $?
    ;;

  sums)
    need_count 0
    for NAME in $SUM_FILES; do
      FILE="$ROOT/ops/$NAME"
      SUM=''
      [ -f "$FILE" ] && SUM="$(sha256 "$FILE" 2>/dev/null)"
      if printf '%s' "$SUM" | grep -Eq '^[0-9a-f]{64}$'; then echo "sum $NAME $SUM"; else echo "sum $NAME fehlt"; fi
    done
    ;;
esac
exit 0
