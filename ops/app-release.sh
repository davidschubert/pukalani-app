#!/usr/bin/env bash
# DIE HANDGRIFFE DES AUSLIEFERNS — ein Skript für Ausliefern UND Rückweg
# (CI1 b / RW1 c, 2026-11-18).
#
# Bis dahin standen sie zweimal da: als freie Befehle im Job `deliver` von
# .github/workflows/deploy.yml und als eingebettetes Stück in ops/rollback.sh.
# Jetzt gibt es sie genau hier:
#
#   list <app>                 Stände einer App und worauf der Verweis zeigt
#   activate <app> <commit>    Verweis `current` umlegen, pm2-Prozess neu laden;
#                              scheitert der Neustart, liegt der Verweis wieder
#                              auf dem Stand davor
#   prune <app>                alte Stände wegräumen (die vier neuesten bleiben,
#                              der aktive immer)
#   release-put <app> <commit> einen Stand empfangen (Standard-Eingabe: das
#                              `.output` der App als tar, zstd-gepackt) — in
#                              ein FRISCHES Verzeichnis, erst vollständig
#                              geprüft an seinen Platz. Ein Stand, der gerade
#                              AKTIV ist, wird nie angefasst (RW1 c: ein
#                              manueller Start mit dem laufenden Commit schrieb
#                              vorher in das Verzeichnis des laufenden Prozesses).
#   ops-put <app>              die Dateien der Site unter <site>/ops empfangen
#                              (Standard-Eingabe: tar, nur Namen aus der festen
#                              Liste unten)
#   fonts-get                  den Font-Cache als tar ausgeben
#   fonts-put                  Font-Cache empfangen (Dateien nur ergänzend, die
#                              Metadaten aktualisierend)
#
# ZWEI AUFRUFER, EINE DATEI
#   Ausliefern (GitHub Actions): das Skript liegt VON HAND eingespielt unter
#     /home/ploi/ops/app-release.sh und ist der FESTE BEFEHL des
#     Ausliefer-Schlüssels:
#
#       # ~/.ssh/authorized_keys auf app-prod (EINE Zeile)
#       command="/home/ploi/ops/app-release.sh",restrict ssh-ed25519 AAAA… pukalani-ci-deploy
#
#     sshd führt dann IMMER dieses Skript aus, egal was der Aufrufer schickt;
#     der gewünschte Befehl steht in SSH_ORIGINAL_COMMAND und wird hier gegen
#     die Worte oben geprüft (TOR-MODUS). Kein rsync, kein scp, keine Shell.
#     Die App-Liste ist dann die auf dem Server (~/ops/apps.conf, von Hand
#     eingespielt) — der Aufrufer wählt keine Site und kein Verzeichnis.
#   Rückweg (ops/rollback.sh, eigener Rechner, eigener SSH-Zugang): schickt
#     DIESE Datei aus dem Repo über die Standard-Eingabe (`bash -s -- …`) und
#     nennt Site und Wurzel selbst (`--site`, `--root`). Der Rückweg hängt
#     damit nicht an der Kopie auf dem Server.
#
# WAS DER FESTE BEFEHL NICHT IST: ein Schutz davor, dass der Schlüssel Code auf
# den Server bringt — genau das ist seine Aufgabe (ein Stand IST Programm, das
# pm2 startet). Er nimmt dem Schlüssel alles ANDERE: lesen, kopieren, löschen,
# beliebige Befehle.
#
# DAS PROTOKOLL DES AUSLIEFERNS IST ÖFFENTLICH: ausgegeben werden nur feste
# Sätze, App, Commit und Zahlen — keine Dateilisten, keine pm2-Tabelle (bei
# einem gescheiterten Neustart die Meldung ohne die Tabellenzeilen).
#
# MITTENDRIN ABGEBROCHEN (der Lauf bei GitHub wird gestoppt, die Verbindung
# reißt): `release-put` schreibt nur in ein eigenes `.incoming-…`-Verzeichnis,
# das beim Abbruch verschwindet; `activate` lässt sich zwischen Umlegen und
# Neuladen nicht mehr unterbrechen. ZWEI LÄUFE ZUR SELBEN ZEIT warten je App
# aufeinander (Sperre `releases/<app>/.lock`).
#
# EINSPIELEN (nur von Hand): docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md, Abschnitt
# „Feste Befehle auf app-prod". Der tägliche Wächter vergleicht die Datei auf
# dem Server mit dieser.
#
# Für Tests (packages/core/tests/appReleaseScript.test.ts, ops/app-release-attrappe.sh):
#   APP_RELEASE_ROOT        statt /home/ploi
#   APP_RELEASE_APPS        statt <wurzel>/ops/apps.conf
#   APP_RELEASE_LOCK_WAIT   Sekunden, die auf die Sperre gewartet wird
#   APP_RELEASE_HOLD        Sekunden Pause IN der Sperre (nur für den Test)
#
# Exit: 0 gut · 2 falscher Aufruf · 3 Stand unbekannt, unvollständig oder
# Eingabe unbrauchbar (nichts geändert) · 4 Site unvollständig oder Werkzeug
# fehlt (nichts geändert) · 5 Neustart gescheitert (Verweis zurückgelegt) ·
# 7 Sperre nicht bekommen (nichts geändert) · 64 Befehl nicht erlaubt.
#
# Läuft auch mit dem bash 3.2 und den Werkzeugen von macOS (nur `list` und
# `activate`, für den Test des Rückwegs): keine assoziativen Felder.
set -euo pipefail

# Alles in EINER Funktion: bash liest ein Skript von der Standard-Eingabe
# stückweise — ein Kindprozess, der dieselbe Eingabe liest, verschluckte sonst
# den Rest (der Rückweg schickt die Datei genau so).
main() {
  local ROOT="${APP_RELEASE_ROOT:-/home/ploi}"
  local APPS_FILE="${APP_RELEASE_APPS:-}"
  local LOCK_WAIT="${APP_RELEASE_LOCK_WAIT:-600}"
  local KEEP=4
  # Was `ops-put` annimmt — neben `ecosystem-<app>.config.cjs`. NEUE DATEI ⇒
  # hier eintragen UND das Skript neu einspielen (der Test
  # packages/core/tests/deployApps.test.ts hält Workflow und Liste zusammen).
  local OPS_FILES="pm2-heal.sh app-watch-counts.mjs nginx-check.mjs nginx-sites.conf cron-check.sh cron.conf logrotate-admin-access.conf verify-stale-keys.mjs verify-instance-admins.mjs"
  # Obergrenzen für das, was über die Leitung kommt (Bytes).
  local MAX_RELEASE=$((1024 * 1024 * 1024))
  local MAX_OPS=$((8 * 1024 * 1024))
  local MAX_FONTS=$((512 * 1024 * 1024))

  local GATE=0 SITE_ARG="" WORD="" APP="" SHA=""

  die() {
    local code="$1"; shift
    echo "ABBRUCH: $*" >&2
    exit "$code"
  }
  # Nach dem Umlegen darf eine geschlossene Leitung das Skript nicht mehr beenden.
  say() { echo "$@" 2>/dev/null || true; }

  # ── Aufruf lesen ──────────────────────────────────────────────────────────
  if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
    GATE=1
    case "$SSH_ORIGINAL_COMMAND" in
      *[!A-Za-z0-9\ ._/-]*) echo "Abgelehnt: unerlaubte Zeichen im Befehl."; exit 64 ;;
    esac
    set -f
    # shellcheck disable=SC2086
    set -- $SSH_ORIGINAL_COMMAND
    set +f
    # Der Workflow ruft das Skript mit seinem Pfad auf; unter dem festen Befehl
    # steht der Pfad dann als erstes Wort im gewünschten Befehl.
    case "${1:-}" in */app-release.sh) shift ;; esac
  fi

  WORD="${1:-}"
  [ "$#" -gt 0 ] && shift
  # Das Wort ZUERST: ein fremder Befehl (rsync, scp, eine Shell-Zeile) wird
  # abgelehnt, bevor irgendeine seiner Angaben gelesen wird.
  case "$WORD" in
    list|activate|prune|release-put|ops-put|fonts-get|fonts-put) ;;
    *)
      echo "Abgelehnt: erlaubt sind list, activate, prune, release-put, ops-put, fonts-get, fonts-put."
      exit 64 ;;
  esac
  local positional=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --site|--root)
        if [ "$GATE" -eq 1 ]; then echo "Abgelehnt: $1 ist unter dem festen Befehl nicht erlaubt."; exit 64; fi
        [ "$#" -ge 2 ] || die 2 "$1 braucht eine Angabe."
        if [ "$1" = "--site" ]; then SITE_ARG="$2"; else ROOT="$2"; fi
        shift 2 ;;
      -*) die 2 "Unbekannte Angabe: $1" ;;
      *)
        positional=$((positional + 1))
        case "$positional" in
          1) APP="$1" ;;
          2) SHA="$1" ;;
          *) die 2 "Zu viele Angaben." ;;
        esac
        shift ;;
    esac
  done

  printf '%s' "$ROOT" | grep -Eq '^/[A-Za-z0-9._/-]+$' || die 2 "Ungültiges Wurzelverzeichnis."
  [ -n "$APPS_FILE" ] || APPS_FILE="$ROOT/ops/apps.conf"

  # ── Hilfen ────────────────────────────────────────────────────────────────
  need_app() {
    printf '%s' "$APP" | grep -Eq '^[a-z0-9-]+$' || die 2 "Ungültiger oder fehlender App-Name."
  }
  need_sha() {
    case "$SHA" in
      ''|*[!0-9a-f]*) die 3 "„$SHA“ ist kein Commit — nichts geändert." ;;
    esac
    [ "${#SHA}" -eq 40 ] || die 3 "„$SHA“ ist kein vollständiger Commit — nichts geändert."
  }
  # Die Site einer App: vom Rückweg genannt (`--site`), sonst aus der Liste
  # auf dem Server. Im Tor-Modus gibt es nur die Liste.
  SITE=""
  need_site() {
    if [ -n "$SITE_ARG" ]; then
      SITE="$SITE_ARG"
    else
      [ -f "$APPS_FILE" ] || die 4 "die App-Liste fehlt auf dem Server (ops/apps.conf) — nichts geändert."
      SITE="$(awk -v a="$APP" '{ sub(/#.*/, "") } NF == 2 && $1 == a { print $2; exit }' "$APPS_FILE")"
      [ -n "$SITE" ] || die 2 "Unbekannte App: $APP (steht nicht in der App-Liste auf dem Server)."
    fi
    printf '%s' "$SITE" | grep -Eq '^[a-z0-9][a-z0-9.-]*$' || die 2 "Ungültige Site."
  }
  # Im Tor-Modus muss JEDE App in der Liste stehen — auch für Worte, die die
  # Site nicht brauchen: der Aufrufer legt kein Verzeichnis frei an.
  need_known_app() {
    need_app
    if [ "$GATE" -eq 1 ]; then need_site; fi
  }

  lock() {
    # macOS (nur im Test) kennt kein flock; auf dem Server ist es Pflicht.
    if ! command -v flock >/dev/null 2>&1; then
      [ "$(uname -s)" != "Linux" ] || die 4 "flock fehlt auf dem Server — nichts geändert."
      return 0
    fi
    exec 9>"$1"
    flock -w "$LOCK_WAIT" 9 || die 7 "ein anderer Lauf hält die Sperre seit über $LOCK_WAIT s — nichts geändert."
    if [ -n "${APP_RELEASE_HOLD:-}" ]; then sleep "$APP_RELEASE_HOLD"; fi
  }

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

  mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }

  # Was beim Abbruch verschwinden muss (ein Verzeichnis je Lauf).
  TMP=""
  cleanup() { if [ -n "$TMP" ]; then rm -rf "$TMP"; fi; }
  trap cleanup EXIT
  trap 'exit 130' HUP INT TERM

  local RELEASES="$ROOT/releases/$APP"

  case "$WORD" in
    # ── Nur lesen ───────────────────────────────────────────────────────────
    list)
      need_known_app
      if [ ! -d "$RELEASES" ]; then
        echo "missing"
        exit 0
      fi
      local cur d c
      cur=$(readlink "$RELEASES/current" 2>/dev/null || true)
      if [ -n "$cur" ]; then echo "current $(basename "$cur")"; else echo "current -"; fi
      for d in "$RELEASES"/*; do
        [ -d "$d" ] || continue
        [ -L "$d" ] && continue
        if [ -f "$d/server/index.mjs" ]; then c=1; else c=0; fi
        echo "release $(basename "$d") $(mtime "$d") $c"
      done
      ;;

    # ── Umstellen ───────────────────────────────────────────────────────────
    activate)
      need_app
      need_sha
      need_site
      local RELEASE="$RELEASES/$SHA"
      local PROC ECO HEAL PREV OUT
      PROC="$(printf '%s' "$SITE" | tr -d .)"
      ECO="$ROOT/$SITE/ops/ecosystem-$APP.config.cjs"
      HEAL="$ROOT/$SITE/ops/pm2-heal.sh"
      if [ ! -d "$RELEASE" ] || [ -L "$RELEASE" ] || [ ! -f "$RELEASE/server/index.mjs" ]; then
        die 3 "der Stand $SHA liegt nicht vollständig unter $RELEASES — nichts geändert."
      fi
      if [ ! -f "$ECO" ] || [ ! -f "$HEAL" ]; then
        die 4 "unter $ROOT/$SITE/ops fehlt die Ecosystem-Datei oder pm2-heal.sh — nichts geändert."
      fi
      command -v pm2 >/dev/null 2>&1 || die 4 "pm2 ist auf dem Server nicht im Pfad — nichts geändert."
      lock "$RELEASES/.lock"
      # certbot-Webroot sicherstellen (2026-08-13, erster Pool-Tenant):
      # Tenant-/Alias-Zertifikate legen ihre ACME-Prüfdatei in <site>/public —
      # das Verzeichnis existiert bei CI-ausgelieferten Sites sonst nie.
      mkdir -p "$ROOT/$SITE/public"
      PREV=$(readlink "$RELEASES/current" 2>/dev/null || true)
      OUT=$(mktemp)
      # AB HIER NICHT MEHR UNTERBRECHBAR: zwischen Umlegen und Neuladen darf
      # weder ein gestoppter Lauf noch eine gerissene Verbindung das Skript
      # beenden — sonst zeigt der Verweis auf einen Stand, den kein Prozess trägt.
      trap '' HUP INT TERM PIPE
      flip "$RELEASE"
      # pm2 startOrReload findet den Prozess über den NAMEN in der
      # Ecosystem-Datei; pm2-heal.sh räumt davor einen gescheiterten Prozess
      # oder einen umbenannten Vorgänger weg (Begründung dort).
      if ! { bash "$HEAL" "$PROC" && pm2 startOrReload "$ECO" --update-env; } >"$OUT" 2>&1 </dev/null; then
        # Ohne die Tabellenzeilen von pm2 (Prozess-Nummern, Speicher, Last).
        { grep -v -e "│" -e "host metrics" "$OUT" || true; } 2>/dev/null
        rm -f "$OUT"
        if [ -n "$PREV" ]; then
          flip "$PREV"
          say "ABBRUCH: der Neustart ist gescheitert — der Verweis steht wieder auf $(basename "$PREV"). Bitte 'pm2 ls' auf dem Server ansehen."
        else
          say "ABBRUCH: der Neustart ist gescheitert, und es gab vorher keinen Verweis. Bitte 'pm2 ls' auf dem Server ansehen."
        fi
        exit 5
      fi
      rm -f "$OUT"
      pm2 save >/dev/null 2>&1 </dev/null || true
      if [ -n "$PREV" ]; then say "umgestellt: $APP von $(basename "$PREV") auf $SHA"; else say "umgestellt: $APP auf $SHA"; fi
      ;;

    # ── Alte Stände wegräumen ───────────────────────────────────────────────
    prune)
      need_known_app
      [ -d "$RELEASES" ] || { echo "aufgeräumt: $APP hat keine Stände"; exit 0; }
      lock "$RELEASES/.lock"
      local active n=0 removed=0 line sha d
      active="$(basename "$(readlink "$RELEASES/current" 2>/dev/null || true)")"
      # Neuester zuerst; nur vollständige Commit-Namen sind Stände.
      for d in "$RELEASES"/*; do
        [ -d "$d" ] || continue
        [ -L "$d" ] && continue
        sha="$(basename "$d")"
        case "$sha" in *[!0-9a-f]*) continue ;; esac
        [ "${#sha}" -eq 40 ] || continue
        echo "$(mtime "$d") $sha"
      done | sort -k1,1nr > "$RELEASES/.prune.$$" || true
      while read -r line; do
        sha="${line#* }"
        n=$((n + 1))
        if [ "$n" -gt "$KEEP" ] && [ "$sha" != "$active" ]; then
          rm -rf "${RELEASES:?}/$sha"
          removed=$((removed + 1))
        fi
      done < "$RELEASES/.prune.$$"
      rm -f "$RELEASES/.prune.$$"
      # Reste abgebrochener Läufe, älter als eine Stunde.
      find "$RELEASES" -maxdepth 1 \( -name '.incoming-*' -o -name '.alt-*' -o -name '.prune.*' \) -mmin +60 -exec rm -rf {} + 2>/dev/null || true
      echo "aufgeräumt: $APP, $removed alte Stände entfernt"
      ;;

    # ── Einen Stand empfangen ───────────────────────────────────────────────
    release-put)
      need_known_app
      need_sha
      command -v zstd >/dev/null 2>&1 || die 4 "zstd fehlt auf dem Server — nichts geändert."
      mkdir -p "$RELEASES"
      lock "$RELEASES/.lock"
      local RELEASE="$RELEASES/$SHA" cur
      cur=$(readlink "$RELEASES/current" 2>/dev/null || true)
      if [ -n "$cur" ] && [ "$(basename "$cur")" = "$SHA" ] && [ -f "$RELEASE/server/index.mjs" ]; then
        # RW1 (c): der Stand, aus dem der Prozess gerade läuft, wird nicht
        # überschrieben. Die Eingabe wird trotzdem ganz gelesen, sonst sieht
        # der Absender eine gerissene Leitung.
        cat >/dev/null
        echo "empfangen: $APP $SHA liegt schon und ist aktiv — nicht überschrieben"
        exit 0
      fi
      TMP="$RELEASES/.incoming-$SHA.$$"
      rm -rf "$TMP"
      mkdir "$TMP"
      # Das Archiv trägt `.output/…`; die erste Ebene fällt weg. GNU tar lehnt
      # absolute Pfade und `..` von sich aus ab.
      if ! head -c "$MAX_RELEASE" | zstd -dc 2>/dev/null | tar -x -C "$TMP" --strip-components=1 --no-same-owner 2>/dev/null; then
        die 3 "das Archiv für $APP ist nicht lesbar oder unvollständig — nichts geändert."
      fi
      [ -f "$TMP/server/index.mjs" ] || die 3 "im Archiv für $APP fehlt server/index.mjs — nichts geändert."
      if [ -e "$RELEASE" ] || [ -L "$RELEASE" ]; then
        # Liegt schon, ist aber nicht aktiv: ersetzen, nicht hineinschreiben.
        mv "$RELEASE" "$RELEASES/.alt-$SHA.$$"
        mv "$TMP" "$RELEASE"
        rm -rf "$RELEASES/.alt-$SHA.$$"
      else
        mv "$TMP" "$RELEASE"
      fi
      TMP=""
      touch "$RELEASE"
      echo "empfangen: $APP $SHA"
      ;;

    # ── Die Dateien der Site empfangen ──────────────────────────────────────
    ops-put)
      need_app
      need_site
      [ -d "$ROOT/$SITE" ] || die 4 "das Verzeichnis der Site gibt es auf dem Server nicht — nichts geändert."
      lock "$ROOT/$SITE/.ops.lock"
      TMP="$(mktemp -d "$ROOT/$SITE/.ops-incoming.XXXXXX")"
      if ! head -c "$MAX_OPS" | tar -x -C "$TMP" --no-same-owner 2>/dev/null; then
        die 3 "das Archiv mit den Dateien der Site ist nicht lesbar — nichts geändert."
      fi
      local f name count=0 allowed
      # ERST alles prüfen, DANN kopieren: eine fremde Datei verwirft die ganze Lieferung.
      for f in "$TMP"/* "$TMP"/.[!.]*; do
        [ -e "$f" ] || [ -L "$f" ] || continue
        name="$(basename "$f")"
        if [ -L "$f" ] || [ ! -f "$f" ]; then die 3 "die Lieferung enthält etwas, das keine einfache Datei ist — nichts geändert."; fi
        allowed=0
        [ "$name" = "ecosystem-$APP.config.cjs" ] && allowed=1
        case " $OPS_FILES " in *" $name "*) allowed=1 ;; esac
        [ "$allowed" -eq 1 ] || die 3 "die Lieferung enthält eine Datei, die nicht auf der Liste steht — nichts geändert."
        count=$((count + 1))
      done
      [ "$count" -gt 0 ] || die 3 "die Lieferung ist leer — nichts geändert."
      mkdir -p "$ROOT/$SITE/ops"
      for f in "$TMP"/*; do
        name="$(basename "$f")"
        case "$name" in *.sh) chmod 755 "$f" ;; *) chmod 644 "$f" ;; esac
        mv -f "$f" "$ROOT/$SITE/ops/$name"
      done
      echo "empfangen: $count Dateien für $APP"
      ;;

    # ── Font-Cache ──────────────────────────────────────────────────────────
    fonts-get)
      [ -z "$APP" ] || die 2 "fonts-get nimmt keine Angabe."
      if [ -d "$ROOT/fonts-cache" ]; then
        tar -C "$ROOT/fonts-cache" -cf - .
      else
        tar -cf - -T /dev/null
      fi
      ;;

    fonts-put)
      [ -z "$APP" ] || die 2 "fonts-put nimmt keine Angabe."
      command -v rsync >/dev/null 2>&1 || die 4 "rsync fehlt auf dem Server — nichts geändert."
      mkdir -p "$ROOT/fonts-cache" "$ROOT/releases"
      lock "$ROOT/releases/.fonts.lock"
      TMP="$(mktemp -d "$ROOT/releases/.fonts-incoming.XXXXXX")"
      # Das Archiv trägt `fonts/…`; die erste Ebene fällt weg.
      if ! head -c "$MAX_FONTS" | tar -x -C "$TMP" --strip-components=1 --no-same-owner 2>/dev/null; then
        die 3 "das Archiv mit dem Font-Cache ist nicht lesbar — nichts geändert."
      fi
      # Nur Dateien und Verzeichnisse.
      find "$TMP" ! -type f ! -type d -delete
      # ZWEI Durchgänge mit Grund (Krümel vom 2026-08-12): die Metadaten
      # tragen eine 7-Tage-Frist und müssen sich erneuern dürfen; die
      # Schrift-Dateien bleiben strikt ergänzend — eine schlechte Auflösung
      # eines Runners ersetzt nie eine gute Datei.
      rsync -a --ignore-existing "$TMP/" "$ROOT/fonts-cache/"
      rsync -a --include='meta/' --include='meta/**' --exclude='*' "$TMP/" "$ROOT/fonts-cache/"
      echo "empfangen: Font-Cache"
      ;;

  esac
}

main "$@"; exit $?
