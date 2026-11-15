#!/usr/bin/env bash
# Der Rückweg bei einem schlechten Stand (OPS-007, 2026-11-15).
#
# Jedes Ausliefern lässt die letzten Stände einer App auf dem Server liegen
# (/home/ploi/releases/<app>/<commit>). Dieses Skript stellt eine App auf
# einen davon zurück: Verweis `current` umlegen, den richtigen pm2-Prozess
# neu laden, danach die Seite fragen — dieselbe Probe wie beim Ausliefern
# (dreimal in Folge der erwartete Build UND `ok:true` auf /api/health).
#
#   ops/rollback.sh                       die Apps aus ops/apps.conf
#   ops/rollback.sh <app>                 zeigt die Stände auf dem Server
#   ops/rollback.sh <app> <commit>        zeigt, was passieren würde
#   ops/rollback.sh <app> <commit> --apply   stellt um
#
# OHNE `--apply` WIRD NICHTS GEÄNDERT. <commit> ist ein Stand aus der Liste
# (vollständig oder ab sieben Zeichen, wenn eindeutig). Was nicht auf dem
# Server liegt, unvollständig oder mehrdeutig ist, bricht ab, BEVOR
# irgendetwas angefasst wird.
#
# LÄUFT VOM EIGENEN RECHNER, OHNE GITHUB: über den eigenen SSH-Zugang
# (`ploi@…`, s. ROLLBACK_SSH). Genau dann braucht man es — wenn der Weg nach
# vorn (Fehler finden, beheben, pushen, eine Viertelstunde warten) zu lange
# dauert oder GitHub selbst klemmt.
#
# WAS ES NICHT KANN (ausführlich: docs/runbooks/DEPLOYMENT.md, Abschnitt
# „Schlechter Stand live"):
#   - Der nächste Push auf main liefert wieder den Stand von main aus, auch
#     ein reiner Doku-Push. Nach dem Zurückstellen deshalb SOFORT `git revert`.
#   - Die Datenbank geht nicht mit zurück. Ein alter Stand trifft auf den
#     heutigen Aufbau; Migrationen haben keinen Rückweg.
#   - Es stellt nur auf Stände zurück, die noch auf dem Server liegen.
#   - Der Neustart liest die `.env` der Site neu (wie jedes Ausliefern).
#
# Die Namen (App, Site, Prozess) kommen aus ops/apps.conf — derselben Liste,
# die das Ausliefern liest. Eine Umbenennung dort zieht den Rückweg mit.
#
# Für den Test gegen eine Attrappe (packages/core/tests/rollbackScript.test.ts):
#   ROLLBACK_REMOTE       Befehl, der das Server-Stück ausführt, statt ssh
#   ROLLBACK_ROOT         statt /home/ploi
#   ROLLBACK_APPS_FILE    statt ops/apps.conf
#   ROLLBACK_PROBE_SLEEP  Pause zwischen zwei Health-Abfragen (Sekunden)
#   ROLLBACK_PROBE_TRIES  Höchstzahl der Abfragen
#
# Exit: 0 gut · 2 falscher Aufruf · 3 Stand unbekannt/unvollständig (nichts
# geändert) · 4 Server nicht erreichbar oder Site unvollständig (nichts
# geändert) · 5 Neustart gescheitert (Verweis zurückgelegt) · 6 umgestellt,
# aber die Seite meldet nicht dreimal in Folge den Stand und `ok:true`.
#
# Läuft mit dem bash 3.2 von macOS: keine assoziativen Felder, kein mapfile.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APPS_FILE="${ROLLBACK_APPS_FILE:-$HERE/apps.conf}"
SSH_TARGET="${ROLLBACK_SSH:-ploi@49.13.211.173}"
ROOT="${ROLLBACK_ROOT:-/home/ploi}"
PROBE_SLEEP="${ROLLBACK_PROBE_SLEEP:-5}"
PROBE_TRIES="${ROLLBACK_PROBE_TRIES:-20}"

die() {
  code="$1"; shift
  echo "✖ $*" >&2
  exit "$code"
}

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
}

# ── Aufruf lesen ────────────────────────────────────────────────────────────
APP=""; WANT=""; APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die 2 "Unbekannte Angabe: $arg" ;;
    *)
      if [ -z "$APP" ]; then APP="$arg"
      elif [ -z "$WANT" ]; then WANT="$arg"
      else die 2 "Zu viele Angaben. Aufruf: ops/rollback.sh <app> [<commit>] [--apply]"
      fi ;;
  esac
done

[ -f "$APPS_FILE" ] || die 2 "App-Liste fehlt: $APPS_FILE"

# Die Liste: Kommentare weg, genau zwei Felder je Zeile.
apps() {
  awk '{ sub(/#.*/, "") } NF == 2 { print $1, $2 }' "$APPS_FILE"
}

if [ -z "$APP" ]; then
  echo "Apps (aus $(basename "$APPS_FILE")):"
  apps | while read -r a s; do
    printf '  %-10s %-26s Prozess %s\n' "$a" "$s" "$(printf '%s' "$s" | tr -d .)"
  done
  echo
  echo "Stände einer App zeigen: ops/rollback.sh <app>"
  exit 0
fi

printf '%s' "$APP" | grep -Eq '^[a-z0-9-]+$' || die 2 "Ungültiger App-Name: $APP"
SITE="$(apps | awk -v a="$APP" '$1 == a { print $2; exit }')"
[ -n "$SITE" ] || die 2 "Unbekannte App: $APP — bekannt sind: $(apps | awk '{ printf "%s%s", sep, $1; sep = ", " }')"
printf '%s' "$SITE" | grep -Eq '^[a-z0-9.-]+$' || die 2 "Ungültige Site in der App-Liste: $SITE"
printf '%s' "$ROOT" | grep -Eq '^/[A-Za-z0-9._/-]+$' || die 2 "Ungültiges Wurzelverzeichnis: $ROOT"
PROC="$(printf '%s' "$SITE" | tr -d .)"
HEALTH_URL="https://$SITE/api/health"

if [ -n "$WANT" ]; then
  printf '%s' "$WANT" | grep -Eq '^[0-9a-f]{7,40}$' \
    || die 3 "„$WANT“ ist kein Commit (erwartet: 7 bis 40 Zeichen aus 0-9 a-f) — nichts geändert."
fi
if [ "$APPLY" -eq 1 ] && [ -z "$WANT" ]; then
  die 2 "--apply braucht einen Stand: ops/rollback.sh $APP <commit> --apply"
fi

# ── Das Server-Stück ────────────────────────────────────────────────────────
# Reist über die Standard-Eingabe, die Angaben als Parameter. ssh setzt die
# Parameter zu EINER Befehlszeile zusammen, die der Server neu zerlegt —
# deshalb sind oben alle auf harmlose Zeichen geprüft.
remote() {
  if [ -n "${ROLLBACK_REMOTE:-}" ]; then
    # Absichtlich ohne Anführungszeichen: der Befehl darf Parameter tragen.
    $ROLLBACK_REMOTE "$@"
  else
    ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_TARGET" bash -s -- "$@"
  fi
}

# Nur lesen: welche Stände liegen da, worauf zeigt der Verweis?
read -r -d '' LIST_SCRIPT <<'EOF' || true
set -eu
RELEASES="$1/releases/$2"
if [ ! -d "$RELEASES" ]; then
  echo "missing"
  exit 0
fi
CUR=$(readlink "$RELEASES/current" 2>/dev/null || true)
if [ -n "$CUR" ]; then echo "current $(basename "$CUR")"; else echo "current -"; fi
for d in "$RELEASES"/*; do
  [ -d "$d" ] || continue
  [ -L "$d" ] && continue
  m=$(stat -c %Y "$d" 2>/dev/null || stat -f %m "$d")
  if [ -f "$d/server/index.mjs" ]; then c=1; else c=0; fi
  echo "release $(basename "$d") $m $c"
done
EOF

# Umstellen — dieselben Handgriffe wie im Job `deliver` von deploy.yml:
# Verweis atomar umlegen, Heiler, startOrReload, save. Geprüft wird VOR dem
# ersten Handgriff noch einmal auf dem Server selbst.
read -r -d '' APPLY_SCRIPT <<'EOF' || true
set -eu
ROOT="$1"; APP="$2"; SITE="$3"; PROC="$4"; SHA="$5"
RELEASES="$ROOT/releases/$APP"
RELEASE="$RELEASES/$SHA"
ECO="$ROOT/$SITE/ops/ecosystem-$APP.config.cjs"
HEAL="$ROOT/$SITE/ops/pm2-heal.sh"
case "$SHA" in
  ''|*[!0-9a-f]*) echo "ABBRUCH: „$SHA“ ist kein Commit — nichts geändert."; exit 3 ;;
esac
if [ "${#SHA}" -ne 40 ]; then
  echo "ABBRUCH: „$SHA“ ist kein vollständiger Commit — nichts geändert."; exit 3
fi
if [ ! -d "$RELEASE" ] || [ -L "$RELEASE" ] || [ ! -f "$RELEASE/server/index.mjs" ]; then
  echo "ABBRUCH: der Stand $SHA liegt nicht vollständig unter $RELEASES — nichts geändert."; exit 3
fi
if [ ! -f "$ECO" ] || [ ! -f "$HEAL" ]; then
  echo "ABBRUCH: unter $ROOT/$SITE/ops fehlt die Ecosystem-Datei oder pm2-heal.sh — nichts geändert."; exit 4
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "ABBRUCH: pm2 ist auf dem Server nicht im Pfad — nichts geändert."; exit 4
fi
PREV=$(readlink "$RELEASES/current" 2>/dev/null || true)
flip() {
  ln -sfn "$1" "$RELEASES/current.tmp"
  # GNU mv (Server) kennt -T, das mv von macOS (nur im Test) -h: beide
  # ersetzen den Verweis selbst, statt in das Ziel hinein zu verschieben.
  if mv --version >/dev/null 2>&1; then
    mv -Tf "$RELEASES/current.tmp" "$RELEASES/current"
  else
    mv -fh "$RELEASES/current.tmp" "$RELEASES/current"
  fi
}
flip "$RELEASE"
OUT=$(mktemp)
if ! { bash "$HEAL" "$PROC" && pm2 startOrReload "$ECO" --update-env; } >"$OUT" 2>&1; then
  # Ohne die Tabellenzeilen von pm2 — wie im Ausliefer-Protokoll.
  grep -v -e "│" -e "host metrics" "$OUT" || true
  rm -f "$OUT"
  if [ -n "$PREV" ]; then
    flip "$PREV"
    echo "ABBRUCH: der Neustart ist gescheitert — der Verweis steht wieder auf $(basename "$PREV"). Bitte 'pm2 ls' auf dem Server ansehen."
  else
    echo "ABBRUCH: der Neustart ist gescheitert, und es gab vorher keinen Verweis. Bitte 'pm2 ls' auf dem Server ansehen."
  fi
  exit 5
fi
rm -f "$OUT"
pm2 save >/dev/null 2>&1 || true
if [ -n "$PREV" ]; then echo "umgestellt: $APP von $(basename "$PREV") auf $SHA"; else echo "umgestellt: $APP auf $SHA"; fi
EOF

# ── Die Seite fragen ────────────────────────────────────────────────────────
# Ohne jq (liegt nicht auf jedem Rechner): die Antwort ist ein kleines JSON.
HEALTH_BUILD=""; HEALTH_OK="false"
health() {
  body="$(curl -fsS -m 15 "$HEALTH_URL" 2>/dev/null || true)"
  HEALTH_BUILD="$(printf '%s' "$body" | sed -n 's/.*"build"[[:space:]]*:[[:space:]]*"\([0-9a-f]*\)".*/\1/p' | head -n 1)"
  if printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then HEALTH_OK="true"; else HEALTH_OK="false"; fi
}

fmt_time() {
  # macOS: date -r <sekunden> · GNU: date -d @<sekunden>
  date -u -r "$1" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || date -u -d "@$1" '+%Y-%m-%d %H:%M UTC'
}

subject() {
  git -C "$HERE/.." log -1 --format=%s "$1" 2>/dev/null | cut -c1-70 || true
}

# ── Stände lesen ────────────────────────────────────────────────────────────
LISTING="$(printf '%s\n' "$LIST_SCRIPT" | remote "$ROOT" "$APP")" \
  || die 4 "Der Server ist nicht erreichbar (ssh $SSH_TARGET) — nichts geändert."
if [ "$LISTING" = "missing" ]; then
  die 4 "Auf dem Server gibt es $ROOT/releases/$APP nicht — nichts geändert."
fi
CURRENT="$(printf '%s\n' "$LISTING" | awk '$1 == "current" { print $2; exit }')"
# Nur vollständige Commit-Namen sind Stände; neuester zuerst.
RELEASES_SORTED="$(printf '%s\n' "$LISTING" | awk '$1 == "release" && $2 ~ /^[0-9a-f]+$/ && length($2) == 40 { print $2, $3, $4 }' | sort -k2,2nr)"

health
echo "App $APP → $SITE (Prozess $PROC)"
echo "Stände auf dem Server, neuester zuerst:"
if [ -z "$RELEASES_SORTED" ]; then
  echo "  (keine)"
else
  printf '%s\n' "$RELEASES_SORTED" | while read -r sha mtime complete; do
    mark="  "; note=""
    [ "$sha" = "$CURRENT" ] && { mark="▶ "; note=" ← aktiv"; }
    [ "$complete" = "1" ] || note="$note ← UNVOLLSTÄNDIG"
    printf '  %s%s  %s%s  %s\n' "$mark" "$sha" "$(fmt_time "$mtime")" "$note" "$(subject "$sha")"
  done
fi
echo "Die Seite meldet: Build ${HEALTH_BUILD:-unbekannt}, ok: $HEALTH_OK"
if [ -n "$HEALTH_BUILD" ] && [ "$CURRENT" != "-" ] && [ "$HEALTH_BUILD" != "$CURRENT" ]; then
  echo "ACHTUNG: der Verweis zeigt auf $CURRENT, die Seite meldet $HEALTH_BUILD."
fi

if [ -z "$WANT" ]; then
  echo
  echo "Nichts geändert. Zurückstellen:"
  echo "  ops/rollback.sh $APP <commit>           zeigt, was passieren würde"
  echo "  ops/rollback.sh $APP <commit> --apply   stellt um"
  exit 0
fi

# ── Den gewünschten Stand finden ────────────────────────────────────────────
MATCHES="$(printf '%s\n' "$RELEASES_SORTED" | awk -v w="$WANT" 'NF && index($1, w) == 1 { print $1, $3 }')"
COUNT="$(printf '%s\n' "$MATCHES" | awk 'NF' | wc -l | tr -d ' ')"
echo
if [ "$COUNT" -eq 0 ]; then
  die 3 "Der Stand „$WANT“ liegt für $APP nicht auf dem Server — nichts geändert."
fi
if [ "$COUNT" -gt 1 ]; then
  die 3 "„$WANT“ passt auf $COUNT Stände — nichts geändert. Bitte mehr Zeichen angeben."
fi
TARGET="$(printf '%s\n' "$MATCHES" | awk 'NF { print $1; exit }')"
TARGET_COMPLETE="$(printf '%s\n' "$MATCHES" | awk 'NF { print $2; exit }')"
[ "$TARGET_COMPLETE" = "1" ] \
  || die 3 "Der Stand $TARGET ist auf dem Server unvollständig (server/index.mjs fehlt) — nichts geändert."

if [ "$TARGET" = "$CURRENT" ] && [ "$HEALTH_BUILD" = "$TARGET" ] && [ "$HEALTH_OK" = "true" ]; then
  echo "✔ $APP läuft schon auf $TARGET und meldet ok:true — nichts zu tun."
  exit 0
fi

if [ "$APPLY" -ne 1 ]; then
  echo "Würde umstellen: $APP von $CURRENT auf $TARGET, danach $PROC neu laden und die Seite fragen."
  echo "Nichts geändert. Ausführen: ops/rollback.sh $APP $TARGET --apply"
  exit 0
fi

# ── Umstellen ───────────────────────────────────────────────────────────────
START="$(date +%s)"
echo "Stelle $APP um: $CURRENT → $TARGET …"
set +e
printf '%s\n' "$APPLY_SCRIPT" | remote "$ROOT" "$APP" "$SITE" "$PROC" "$TARGET"
code=$?
set -e
if [ "$code" -ne 0 ]; then
  case "$code" in
    3|4|5) exit "$code" ;;
    *) die 4 "Die Verbindung zum Server ist beim Umstellen abgebrochen (Exit $code). Stand prüfen: ops/rollback.sh $APP" ;;
  esac
fi

echo "Erwarte $TARGET und ok:true auf $HEALTH_URL (dreimal in Folge) …"
streak=0; i=0
while [ "$i" -lt "$PROBE_TRIES" ]; do
  i=$((i + 1))
  health
  if [ "$HEALTH_BUILD" = "$TARGET" ] && [ "$HEALTH_OK" = "true" ]; then
    streak=$((streak + 1))
    echo "  ($i/$PROBE_TRIES) Treffer $streak/3"
    [ "$streak" -ge 3 ] && break
  else
    streak=0
    echo "  ($i/$PROBE_TRIES) die Seite meldet Build ${HEALTH_BUILD:-unbekannt}, ok: $HEALTH_OK — warte …"
  fi
  sleep "$PROBE_SLEEP"
done
DAUER=$(( $(date +%s) - START ))

if [ "$streak" -lt 3 ]; then
  echo "✖ $APP ist umgestellt (Verweis auf $TARGET), aber die Seite meldet nicht dreimal in Folge diesen Stand mit ok:true." >&2
  if [ "$HEALTH_BUILD" = "$TARGET" ]; then
    echo "  Der Stand stimmt, die Seite meldet aber nicht gesund (ok: $HEALTH_OK)." >&2
  else
    echo "  Zuletzt gemeldet: Build ${HEALTH_BUILD:-unbekannt}. Läuft ein zweiter Prozess am selben Port? ('pm2 ls' auf dem Server)" >&2
  fi
  [ "$CURRENT" != "-" ] && echo "  Zurück auf den Stand davor: ops/rollback.sh $APP $CURRENT --apply" >&2
  exit 6
fi

echo "✔ $APP läuft durchgängig auf $TARGET und meldet ok:true (Dauer: ${DAUER} s, $(date -u '+%Y-%m-%d %H:%M UTC'))."
echo
echo "Jetzt: Der nächste Push auf main liefert wieder den Stand von main aus."
echo "       War der Stand von main der schlechte, als Nächstes 'git revert' — erst dann die Ursache suchen."
echo "       (docs/runbooks/DEPLOYMENT.md, Abschnitt „Schlechter Stand live“)"
