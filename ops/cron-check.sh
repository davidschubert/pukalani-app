#!/usr/bin/env bash
# Vergleicht die Zeitpläne eines Servers mit der Liste ops/cron.conf
# (OPS-003, 2026-11-16).
#
# WOZU: jeder erwartete Zeitplan ist da, kein unbekannter dazu. Gelesen werden
# die zwei Quellen, aus denen auf diesen Servern etwas nach Plan läuft: der
# crontab des Benutzers (`crontab -l`) und /etc/crontab (dorthin schreibt Ploi
# seine „Cronjobs").
#
# DAS PROTOKOLL DES AUFRUFERS IST ÖFFENTLICH. Dieses Skript gibt je Quelle
# GENAU EINE Zeile aus — Zahlen und die Kennungen aus cron.conf (stehen im
# Repo). NIE eine Zeile aus einem crontab: dort stehen Pfade, Ziele einer
# Sicherung, und es könnten Geheimnisse stehen. Einen unbekannten Eintrag
# zählt es nur; ansehen muss ihn ein Mensch auf dem Server (`crontab -l`).
# Es liest nur.
#
# WIE ES AUF DIE SERVER KOMMT
#   app-prod:       der Deploy legt es mit cron.conf neben die Ecosystem-Datei.
#   appwrite-prod:  von Hand nach ~/ops/ (dort gibt es keinen CI-Weg); der
#                   Wächter-Schlüssel erreicht es nur über das Tor-Wort
#                   `cron-status` (ops/appwrite-cert-gate.sh).
#
# AUFRUF
#   cron-check.sh <server>        server = app-prod | appwrite-prod
#   Für Tests: CRON_CONF, CRON_SYSTEM_FILE und CRON_USER_FILE (statt `crontab -l`).
#
# AUSGABE (je Quelle eine Zeile)
#   cron server=<s> quelle=<q> erwartet=<n> gefunden=<n> fehlt=<kennungen|-> unbekannt=<n> doppelt=<n>
#
# Exit: 0 verglichen · 5 Liste nicht lesbar · 64 Aufruf nicht erlaubt
# Läuft auch mit bash 3.2 (kein assoziatives Feld, kein mapfile).
set -u

SERVER="${1:-}"
case "$SERVER" in
  app-prod|appwrite-prod) ;;
  *) echo "Aufruf: cron-check.sh app-prod|appwrite-prod"; exit 64 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="${CRON_CONF:-$HERE/cron.conf}"
SYSTEM_FILE="${CRON_SYSTEM_FILE:-/etc/crontab}"
USER_FILE="${CRON_USER_FILE:-}"

[ -r "$CONF" ] || { echo "cron liste=nicht-lesbar"; exit 5; }

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

# Erwartete Einträge dieses Servers in drei gleich langen Feldern je Quelle.
E_SOURCE=()
E_ID=()
E_SCHEDULE=()
E_PATTERN=()
BAD_LINES=0
while IFS= read -r raw || [ -n "$raw" ]; do
  case "$raw" in ''|'#'*) continue ;; esac
  # Trennzeichen ist ` | ` (mit Leerzeichen): ein `\|` im Muster bleibt ganz.
  rest="$raw"
  f_server="$(trim "${rest%% | *}")"; rest="${rest#* | }"
  f_source="$(trim "${rest%% | *}")"; rest="${rest#* | }"
  f_id="$(trim "${rest%% | *}")"; rest="${rest#* | }"
  f_schedule="$(trim "${rest%% | *}")"; f_pattern="$(trim "${rest#* | }")"
  case "$f_server" in app-prod|appwrite-prod) ;; *) BAD_LINES=$((BAD_LINES + 1)); continue ;; esac
  case "$f_source" in benutzer|system) ;; *) BAD_LINES=$((BAD_LINES + 1)); continue ;; esac
  printf '%s' "$f_id" | grep -Eq '^[a-z][a-z0-9-]{1,39}$' || { BAD_LINES=$((BAD_LINES + 1)); continue; }
  [ -n "$f_schedule" ] && [ -n "$f_pattern" ] && [ "$f_pattern" != "$raw" ] || { BAD_LINES=$((BAD_LINES + 1)); continue; }
  [ "$f_server" = "$SERVER" ] || continue
  E_SOURCE+=("$f_source")
  E_ID+=("$f_id")
  E_SCHEDULE+=("$f_schedule")
  E_PATTERN+=("$f_pattern")
done < "$CONF"

if [ "$BAD_LINES" -gt 0 ] || [ "${#E_ID[@]}" -eq 0 ]; then
  echo "cron liste=nicht-lesbar"
  exit 5
fi

# Vergleicht den Text einer Quelle (Standard-Eingabe) mit den Erwartungen.
check_source() {
  local source="$1" line schedule command i expected=0 found=0 unknown=0 double=0 missing='' matched
  local hits=()
  for i in "${!E_ID[@]}"; do
    hits[$i]=0
    [ "${E_SOURCE[$i]}" = "$source" ] && expected=$((expected + 1))
  done
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(printf '%s' "$line" | tr '\t' ' ' | tr -s ' ')"
    line="$(trim "$line")"
    case "$line" in ''|'#'*) continue ;; esac
    # Zuweisung am Zeilenanfang (SHELL=, PATH=, MAILTO=) ist kein Zeitplan.
    printf '%s' "$line" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' && continue
    case "$line" in
      @*) schedule="${line%% *}"; command="${line#* }" ;;
      *)
        schedule="$(printf '%s' "$line" | cut -d' ' -f1-5)"
        command="$(printf '%s' "$line" | cut -d' ' -f6-)"
        ;;
    esac
    matched=0
    for i in "${!E_ID[@]}"; do
      [ "${E_SOURCE[$i]}" = "$source" ] || continue
      [ "${E_SCHEDULE[$i]}" = 'beliebig' ] || [ "${E_SCHEDULE[$i]}" = "$schedule" ] || continue
      if [[ "$command" =~ ${E_PATTERN[$i]} ]]; then
        hits[$i]=$(( ${hits[$i]} + 1 ))
        matched=1
        break
      fi
    done
    [ "$matched" -eq 1 ] || unknown=$((unknown + 1))
  done
  for i in "${!E_ID[@]}"; do
    [ "${E_SOURCE[$i]}" = "$source" ] || continue
    if [ "${hits[$i]}" -eq 0 ]; then
      missing="${missing:+$missing,}${E_ID[$i]}"
    else
      found=$((found + 1))
      [ "${hits[$i]}" -gt 1 ] && double=$((double + 1))
    fi
  done
  echo "cron server=$SERVER quelle=$source erwartet=$expected gefunden=$found fehlt=${missing:--} unbekannt=$unknown doppelt=$double"
}

if [ -n "$USER_FILE" ]; then
  check_source benutzer < "$USER_FILE"
else
  # Ohne crontab endet `crontab -l` mit Fehler — das ist „leer", kein Abbruch.
  { crontab -l 2>/dev/null || true; } | check_source benutzer
fi

if [ -r "$SYSTEM_FILE" ]; then
  check_source system < "$SYSTEM_FILE"
else
  echo "cron server=$SERVER quelle=system erwartet=0 gefunden=0 fehlt=nicht-lesbar unbekannt=0 doppelt=0"
fi
