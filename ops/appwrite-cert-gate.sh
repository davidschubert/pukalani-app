#!/usr/bin/env bash
# Tor fuer den Waechter-Schluessel auf appwrite-prod (SEC-042/SEC-043, 2026-11-14).
#
# WOZU: der Notfall-Job `appwrite-cert` (.github/workflows/production-watch.yml)
# muss auf dem Appwrite-Server drei Dinge koennen — nachsehen, das Zertifikat
# von api.pukalani.app erneuern, ein veraltetes Let's-Encrypt-Konto beiseite-
# legen. Der Benutzer `ploi` ist dort in der docker-Gruppe; wer als `ploi` eine
# freie Shell hat, hat praktisch alle Rechte. Der Schluessel aus der CI bekommt
# deshalb KEINE Shell, sondern genau dieses Skript als festen Befehl:
#
#   # ~/.ssh/authorized_keys auf appwrite-prod (EINE Zeile)
#   command="/home/ploi/bin/pukalani-cert-gate.sh",restrict ssh-ed25519 AAAA… pukalani-ci-watch
#
# sshd fuehrt dann IMMER dieses Skript aus, egal was der Aufrufer schickt; der
# gewuenschte Befehl steht in SSH_ORIGINAL_COMMAND und wird hier gegen eine
# feste Liste geprueft. `restrict` nimmt dem Schluessel dazu Weiterleitungen
# und Terminal.
#
# ZWEITER ZWECK: das Protokoll des Laufs ist OEFFENTLICH. Gefiltert wird
# deshalb HIER, auf dem Server — nicht im Workflow. Was dieses Skript nicht
# ausgibt, kann auch ein geaenderter Workflow nicht ins Protokoll schreiben.
# Seit Appwrite 2.2 schreibt EIN Worker alle Warteschlangen (Mails,
# Loeschungen, Functions): vom Worker kommen nur Zeilen des Zertifikats-
# Auftrags zurueck, Mail-Adressen sind maskiert, die Menge ist gedeckelt.
# Keine Dateilisten, keine Konfiguration, keine Pfade.
#
# VIERTES WORT (OPS-001, 2026-11-15): `backup-status` liest die Stand-Datei des
# nächtlichen Backups (ops/appwrite-backup.sh) und gibt GENAU EINE Zeile aus —
# Ergebnis, Schritt, Alter des letzten guten Laufs in Stunden, Größe, Zahl der
# Dateien. Nur lesend, kein docker. Ob das alt genug für einen Alarm ist,
# entscheidet der Wächter (die Schwelle steht im Workflow, an EINER Stelle).
# Jeder Wert wird hier auf seine Form geprüft, bevor er das Tor verlässt: was
# in der Stand-Datei nicht wie ein Wort oder eine Zahl aussieht, wird nicht
# durchgereicht.
#
# FÜNFTES WORT (OPS-004, 2026-11-16): `realtime-status` liest die Stand-Datei
# des Realtime-Wächters (ops/realtime-watchdog.sh, läuft alle 5 min) und gibt
# GENAU EINE Zeile aus — Ergebnis des letzten Laufs, Fehlschläge in Folge,
# Neustarts der letzten 24 Stunden und 7 Tage, Alter des letzten Laufs in
# Minuten (`nie`, wenn es keinen gibt). Nur lesend, kein docker; dieselbe
# Prüfung jedes Werts wie bei `backup-status`. Der Wächter startet den
# Container höchstens dreimal in Folge neu und meldet dann nur noch
# `aufgegeben` — gesehen wird es nur hier.
#
# SECHSTES WORT (OPS-003, 2026-11-16): `cron-status` vergleicht die Zeitpläne
# dieses Servers mit der Liste aus dem Repo (ops/cron.conf): es ruft das feste
# Skript ~/ops/cron-check.sh (Quelle ops/cron-check.sh, liegt mit cron.conf
# von Hand eingespielt daneben) und reicht dessen ZWEI Zeilen durch — je
# Quelle (crontab von ploi, /etc/crontab) Zahlen und die Kennungen der Liste.
# Nur lesend, kein docker. Jede Zeile wird hier noch einmal gegen ihre feste
# Form geprüft: eine Zeile aus einem crontab kommt so auch dann nicht hinaus,
# wenn das Skript daneben ausgetauscht würde.
#
# AUFRUF
#   aus der CI:      ssh appwrite-prod probe | renew | reset-account | backup-status | realtime-status | cron-status
#   von Hand (Mac):  ssh ploi@<server> '~/bin/pukalani-cert-gate.sh probe'
#
# EINSPIELEN (nur von Hand, es gibt bewusst keinen CI-Weg auf diesen Server):
#   docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, Abschnitt „Tor auf appwrite-prod"
#
# Exit: 0 ok · 3 Compose-Ordner fehlt · 4 Worker nicht gefunden ·
#       5 Voraussetzung fehlt · 6 kein lesbarer Backup-, Realtime- oder
#       Zeitplan-Stand · 64 Befehl nicht erlaubt
set -u

COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:-$HOME/appwrite}"
# Fest verdrahtet: der Aufrufer waehlt die Domain NICHT.
DOMAIN='api.pukalani.app'
CERT_LINES='certificate|certbot|acme|letsencrypt'
MASK_ADDRESSES='s/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}/<adresse>/g'

# Stand-Datei des Backups (BACKUP_DIR/state/last-run).
BACKUP_STATE_FILE="${BACKUP_STATE_FILE:-$HOME/backup/state/last-run}"
# Stand-Datei des Realtime-Wächters (gleicher Default wie dort).
REALTIME_STATE_FILE="${REALTIME_STATE_FILE:-$HOME/ops/state/realtime-watchdog}"
CRON_CHECK_SCRIPT="${CRON_CHECK_SCRIPT:-$HOME/ops/cron-check.sh}"
CRON_LINE='^cron server=appwrite-prod quelle=(benutzer|system) erwartet=[0-9]{1,3} gefunden=[0-9]{1,3} fehlt=[a-z0-9,-]{1,255} unbekannt=[0-9]{1,3} doppelt=[0-9]{1,3}$'

# Von Hand als $1; mit festem Befehl (kein Argument) in SSH_ORIGINAL_COMMAND.
REQUEST="${1:-${SSH_ORIGINAL_COMMAND:-}}"

# Nur Zeilen des Zertifikats-Auftrags, Adressen maskiert, hoechstens $1 Zeilen.
filtered() {
  grep -iE "$CERT_LINES" | sed -E "$MASK_ADDRESSES" | tail -n "$1"
}

worker_service() {
  docker compose ps --services 2>/dev/null | grep -E '^appwrite-worker(-certificates)?$' | head -1
}

enter_compose_dir() {
  cd "$COMPOSE_DIR" 2>/dev/null || { echo "Compose-Ordner nicht gefunden."; exit 3; }
}

require_worker() {
  SVC="$(worker_service)"
  [ -n "$SVC" ] || { echo "Worker-Dienst nicht gefunden."; exit 4; }
}

case "$REQUEST" in
  probe)
    enter_compose_dir
    echo "Erreichbar. Last: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '?')"
    echo "Platte belegt: $(df -h / | tail -1 | awk '{print $5}')"
    PS_OUT="$(docker compose ps -a --format '{{.Name}} {{.State}}' 2>/dev/null)" || { echo "docker compose antwortet nicht."; exit 5; }
    echo "Container: $(printf '%s\n' "$PS_OUT" | grep -c ' running$') laufen, $(printf '%s\n' "$PS_OUT" | grep -vc ' running$') nicht"
    printf '%s\n' "$PS_OUT" | grep -v ' running$' || true
    require_worker
    echo "--- Zertifikats-Auftrag im Worker (gefiltert, letzte 40 Zeilen) ---"
    docker compose logs --no-log-prefix --tail 2000 "$SVC" 2>&1 | filtered 40 || true
    ;;

  renew)
    enter_compose_dir
    require_worker
    echo "Erneuere das Zertifikat fuer $DOMAIN"
    docker compose exec -T appwrite ssl --domain="$DOMAIN" >/dev/null 2>&1 || echo "ssl-Kommando endete mit Fehler"
    echo "warte 60 s auf den Worker"
    sleep 60
    echo "--- Zertifikats-Auftrag im Worker (gefiltert, letzte 3 Minuten) ---"
    docker compose logs --no-log-prefix --since 3m "$SVC" 2>&1 | filtered 60 || true
    ;;

  reset-account)
    enter_compose_dir
    require_worker
    # Ohne Kontakt-Adresse kann certbot kein neues Konto anlegen. Geprueft wird
    # nur, OB sie gesetzt ist — der Wert bleibt hier.
    grep -q '^_APP_SYSTEM_SECURITY_EMAIL_ADDRESS=.\+' .env \
      || { echo "_APP_SYSTEM_SECURITY_EMAIL_ADDRESS fehlt in der .env — ohne Adresse kein neues Konto."; exit 5; }
    DIRS="$(docker compose exec -T "$SVC" sh -c 'find / -maxdepth 8 -type d -name acme-v02.api.letsencrypt.org -path "*accounts*" 2>/dev/null')"
    if [ -z "$DIRS" ]; then
      echo "Kein gespeichertes ACME-Konto gefunden — nichts beiseitezulegen."
      exit 0
    fi
    STAMP="$(date +%Y%m%d%H%M)"
    COUNT=0
    for DIR in $DIRS; do
      docker compose exec -T "$SVC" sh -c "mv \"$DIR\" \"$DIR.alt-$STAMP\"" && COUNT=$((COUNT + 1))
    done
    echo "Beiseitegelegt: $COUNT gespeicherte(s) ACME-Konto/Konten."
    ;;

  backup-status)
    # ÖFFENTLICHES PROTOKOLL: eine Zeile, nur Wörter aus einer festen Form und
    # Zahlen. Kein Pfad, kein Dateiname, kein Zeitstempel eines Laufs.
    state_value() { grep -m1 "^$1=" "$BACKUP_STATE_FILE" 2>/dev/null | cut -d= -f2-; }
    is_number() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }
    RESULT="$(state_value last_result)"
    STEP="$(state_value last_step)"
    OK_EPOCH="$(state_value last_ok_epoch)"
    OK_BYTES="$(state_value last_ok_bytes)"
    OK_FILES="$(state_value last_ok_files)"
    case "$RESULT" in ok|fehler) ;; *) RESULT='' ;; esac
    printf '%s' "$STEP" | grep -Eq '^[a-z-]{1,24}$' || STEP=''
    if [ -z "$RESULT" ] || [ -z "$STEP" ]; then
      echo "backup ergebnis=unbekannt"
      exit 6
    fi
    # Noch nie ein guter Lauf: Alter „nie", damit der Wächter rot wird.
    if is_number "$OK_EPOCH" && is_number "$OK_BYTES" && is_number "$OK_FILES"; then
      AGE=$(( ($(date +%s) - OK_EPOCH) / 3600 ))
      [ "$AGE" -ge 0 ] || AGE=0
      echo "backup ergebnis=$RESULT schritt=$STEP alter_stunden=$AGE groesse_mb=$(( OK_BYTES / 1048576 )) dateien=$OK_FILES"
    else
      echo "backup ergebnis=$RESULT schritt=$STEP alter_stunden=nie groesse_mb=0 dateien=0"
    fi
    ;;

  realtime-status)
    # ÖFFENTLICHES PROTOKOLL: eine Zeile, nur Wörter aus einer festen Form und
    # Zahlen. Die Datei wird zeilenweise gelesen, nie ausgeführt.
    rt_value() {
      local line
      [ -r "$REALTIME_STATE_FILE" ] || return 0
      while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in "$1="*) printf '%s' "${line#*=}"; return 0 ;; esac
      done < "$REALTIME_STATE_FILE"
    }
    # Nur Ziffern, höchstens zwölf (kein Überlauf beim Rechnen).
    is_count() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "${#1}" -le 12 ]; }
    RESULT="$(rt_value last_result)"
    FAILS="$(rt_value failures)"
    CHECK_EPOCH="$(rt_value last_check_epoch)"
    case "$RESULT" in ok|neustart-geholfen|neustart-erfolglos|aufgegeben) ;; *) RESULT='' ;; esac
    is_count "$FAILS" || RESULT=''
    if [ -z "$RESULT" ]; then
      echo "realtime ergebnis=unbekannt"
      exit 6
    fi
    NOW="$(date +%s)"
    R24=0
    R7=0
    if [ -r "$REALTIME_STATE_FILE.restarts" ]; then
      while IFS= read -r line || [ -n "$line" ]; do
        is_count "$line" || continue
        # 10#: führende Nullen nicht als Oktalzahl lesen.
        [ $(( NOW - 10#$line )) -lt 86400 ] && R24=$(( R24 + 1 ))
        [ $(( NOW - 10#$line )) -lt 604800 ] && R7=$(( R7 + 1 ))
      done < "$REALTIME_STATE_FILE.restarts"
    fi
    if is_count "$CHECK_EPOCH"; then
      AGE=$(( (NOW - 10#$CHECK_EPOCH) / 60 ))
      [ "$AGE" -ge 0 ] || AGE=0
    else
      AGE='nie'
    fi
    echo "realtime ergebnis=$RESULT fehlschlaege=$(( 10#$FAILS )) neustarts_24h=$R24 neustarts_7t=$R7 alter_minuten=$AGE"
    ;;

  cron-status)
    if [ ! -r "$CRON_CHECK_SCRIPT" ]; then
      echo "cron ergebnis=unbekannt"
      exit 6
    fi
    # Höchstens zwei Zeilen (je Quelle eine), und nur in der festen Form.
    CRON_OUT="$(bash "$CRON_CHECK_SCRIPT" appwrite-prod 2>/dev/null </dev/null | grep -E "$CRON_LINE" | sed -n '1,2p')"
    CRON_COUNT="$(printf '%s\n' "$CRON_OUT" | grep -cE "$CRON_LINE" || true)"
    if [ "${CRON_COUNT:-0}" != "2" ]; then
      echo "cron ergebnis=unbekannt"
      exit 6
    fi
    printf '%s\n' "$CRON_OUT"
    ;;

  *)
    echo "Abgelehnt: erlaubt sind probe, renew, reset-account, backup-status, realtime-status, cron-status."
    exit 64
    ;;
esac
