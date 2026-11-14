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
# AUFRUF
#   aus der CI:      ssh appwrite-prod probe | renew | reset-account
#   von Hand (Mac):  ssh ploi@<server> '~/bin/pukalani-cert-gate.sh probe'
#
# EINSPIELEN (nur von Hand, es gibt bewusst keinen CI-Weg auf diesen Server):
#   docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, Abschnitt „Tor auf appwrite-prod"
#
# Exit: 0 ok · 3 Compose-Ordner fehlt · 4 Worker nicht gefunden ·
#       5 Voraussetzung fehlt · 64 Befehl nicht erlaubt
set -u

COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:-$HOME/appwrite}"
# Fest verdrahtet: der Aufrufer waehlt die Domain NICHT.
DOMAIN='api.pukalani.app'
CERT_LINES='certificate|certbot|acme|letsencrypt'
MASK_ADDRESSES='s/[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}/<adresse>/g'

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

  *)
    echo "Abgelehnt: erlaubt sind probe, renew, reset-account."
    exit 64
    ;;
esac
