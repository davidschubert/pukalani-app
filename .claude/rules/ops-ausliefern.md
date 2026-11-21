---
paths:
  - ".github/workflows/*.yml"
  - "ops/*.sh"
  - "scripts/check-workflows.mjs"
  - "ops/app-release*.sh"
  - "ops/app-watch-gate*.sh"
  - "scripts/ops/app-watch-gate.mjs"
  - "ops/appwrite-cert-gate.sh"
  - "ops/app-env-bundle.sh"
  - "ops/apps.conf"
  - "ops/rollback.sh"
  - "ops/appwrite-backup*"
  - "ops/appwrite-restore.sh"
  - "ops/appwrite-volumes.conf"
  - "ops/docker-apps*"
  - "ops/realtime-watchdog*.sh"
  - "scripts/ops/verify-server-scripts.mjs"
  - "docs/runbooks/DEPLOYMENT.md"
  - "docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md"
  - "docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md"
  - "docs/runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md"
---

## Ops: Ausliefern, Schlüssel, Rückweg, Backup
Wächter und Alarm: `.claude/rules/ops-waechter.md`.

## CI-Schlüssel (GA1 P08, N12)
- ZWEI SSH-SCHLÜSSEL IN ZWEI GITHUB-UMGEBUNGEN, die nur den Zweig `main`
  zulassen: `production` (`DEPLOY_SSH_KEY`, nur `.github/workflows/deploy.yml`) und
  `production-watch` (`WATCH_SSH_KEY`, Mail-Zugang, Heartbeat; nur
  `.github/workflows/production-watch.yml`). Abweisung eines Laufs vom Arbeitszweig („not
  allowed to deploy … environment protection rules") ist die Sperre, kein
  Fehler; ein Job OHNE Umgebung bekommt kein Secret; `deployment: false` nimmt
  nur den Eintrag in der Deployment-Liste weg, die Zweig-Regel greift
  trotzdem.
- KEIN CI-SCHLÜSSEL HAT EINE SHELL: in `authorized_keys` `restrict` UND ein
  fester Befehl; der Wunsch steht in `SSH_ORIGINAL_COMMAND` und wird gegen
  feste Worte geprüft, alles andere (auch `rsync`, `scp`, `echo`) ⇒ Exit 64.
  app-prod: Ausliefer-Schlüssel nur `~/ops/app-release.sh` (Quelle
  `ops/app-release.sh`; App und Site nur aus `~/ops/apps.conf`, Dateien
  reisen als tar über die Standard-Eingabe), Wächter-Schlüssel nur
  `~/ops/app-watch-gate.sh` (Quelle `ops/app-watch-gate.sh`; jedes Wort liest
  nur, aufgerufen über `scripts/ops/app-watch-gate.mjs`). appwrite-prod: NUR
  der Wächter-Schlüssel, `~/bin/pukalani-cert-gate.sh` (Quelle
  `ops/appwrite-cert-gate.sh`). Die erlaubten Worte stehen im `case` jedes
  Skripts.
- DIE TOR-SKRIPTE LIEGEN VON HAND AUF DEN SERVERN (ebenso
  `~/ops/realtime-watchdog.sh`): Änderung im Repo ⇒ einspielen, davor die
  Attrappe (`ops/app-release-attrappe.sh`, `ops/app-watch-gate-attrappe.sh`:
  Wegwerf-Container mit echtem sshd; `ops/realtime-watchdog-attrappe.sh`).
  Netze: `scripts/ops/verify-server-scripts.mjs` vergleicht täglich über das Wort `sums`
  jede Datei aus `SERVER_FILES` dort mit dem Repo (neue von Hand eingespielte
  Datei ⇒ dort UND in die Liste des Tors); beide Workflows schicken eine
  harmlose freie Befehlszeile — führt der Server sie aus, ist der Lauf rot.
- DER AUFRUF NENNT DEN PFAD DES SKRIPTS (`ssh <server>
  /home/ploi/ops/<skript> <wort>`): dieselbe Zeile mit und ohne festen
  Befehl.
- NEUE DATEI FÜR `<site>/ops` ⇒ in die Listen von `.github/workflows/deploy.yml` (`OPS_FILES`
  aus `ops/`, `WATCH_FILES` aus `scripts/ops/`) UND in `OPS_FILES` von
  `ops/app-release.sh` (das ist die Summe beider; der Test
  `packages/core/tests/appReleaseScript.test.ts` hält sie zusammen), dann das
  Skript neu einspielen — sonst lehnt der Server die Lieferung ab.
- Vom App-Server führt KEIN SSH-Weg zum Appwrite-Server. In der Gegenrichtung
  GENAU EINER: `app-env-abholer` (verlässt den Appwrite-Server nie) mit
  `from=`, `restrict` und festem Befehl `~/ops/app-env-bundle.sh` (`bundle`,
  `list`). Skript, `ops/apps.conf` und der öffentliche Backup-Schlüssel liegen VON
  HAND in `~/ops/` des App-Servers, der Deploy aktualisiert sie nicht (neue App
  ⇒ `docs/runbooks/NEUE-SITE.md`, Schritt 7).
- DER SCHLÜSSEL LIEGT NIE NEBEN FREMDEM CODE: `.github/workflows/deploy.yml` baut im Job
  `build` ohne Secret und liefert im Job `deliver` ohne `pnpm` aus;
  `pnpm check:workflows` hält das (Job mit Secret ⇒ Umgebung; Job mit
  Umgebung ⇒ kein Installieren).
- DIE PROTOKOLLE DER LÄUFE SIND ÖFFENTLICH: kein Server-Protokoll, keine
  Dateiliste, keine Konfiguration, keine Mail-Adresse hinein — gefiltert wird
  im Tor-Skript auf dem Server, nicht im Workflow. Eine `vars.*`-Variable wird
  NICHT maskiert und GitHub druckt das `env:` JEDES Schritts ⇒
  `check:workflows` verbietet `vars.` ganz.
- Ploi schreibt eigene Schlüssel in dieselbe `authorized_keys`; die CI-Zeilen
  sind von Hand eingetragen (Ploi kennt keine Optionen) und nach jeder
  Schlüssel-Änderung im Panel zurückzulesen. Runbook:
  `docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md`.

## Rückweg bei einem schlechten Stand (GA1 P10)
- REIHENFOLGE: ZURÜCKSTELLEN → `git revert` → erst dann Ursache suchen.
- `ops/rollback.sh <app>` zeigt die Stände auf app-prod
  (`/home/ploi/releases/<app>/<commit>`), `… <commit> --apply` legt den
  Verweis um, lädt pm2 neu und prüft Build UND `ok` — vom eigenen Rechner,
  OHNE GitHub. Die Handgriffe stehen an EINER Stelle, `ops/app-release.sh`
  (der Rückweg schickt die Datei aus dem eigenen Checkout mit). Scheitert der
  Neustart, liegt der Verweis wieder auf dem Stand davor; ein laufender Stand
  wird nie überschrieben; zwei Läufe je App warten aufeinander; ohne
  `--apply` ändert es nichts; ein unbekannter Stand bricht vor jedem
  Handgriff ab.
- Über GitHub: `gh workflow run deploy.yml -f sha=<vollständiger Commit>`
  (Riegel „liegt auf main"; `ops/` und App-Liste kommen von der Spitze von
  `main`, nur das Programm vom alten Commit). Ein manueller Start, der hinter
  einem laufenden Ausliefern WARTET, kann vom nächsten verdrängt werden
  („cancelled") — nachsehen.
- DIE EINE APP-LISTE ist `ops/apps.conf` (App, Site; Stände-Verzeichnis =
  App, Prozess = Site ohne Punkte): `.github/workflows/deploy.yml` und `ops/rollback.sh` lesen sie,
  `packages/core/tests/deployApps.test.ts` hält Liste, Ecosystem-Dateien,
  Workflow und Health-Wächter zusammen.
- GRENZEN: der Rückweg hält nur bis zum nächsten Push auf `main` (auch ein
  reiner Doku-Push); die Datenbank geht nicht mit zurück; jedes Neuladen liest
  die `.env` neu; wie viele Stände bleiben, sagt `KEEP` in
  `ops/app-release.sh`. Etwas NEUES ausliefern geht praktisch nur über GitHub
  Actions — die alten Ploi-Deploy-Auslöser sind gelöscht und werden nicht neu
  erzeugt.
- Der Deploy prüft `ok`: Build falsch ⇒ Abbruch; Build richtig, `ok` nicht
  true ⇒ die übrigen Apps werden ausgeliefert, der Lauf endet rot. Von selbst
  zurückgestellt wird NIE (Davids Entscheidung). Runbook:
  `docs/runbooks/DEPLOYMENT.md`, A3.

## Backup der Appwrite-Instanz (GA1 P11)
- NEUER ZEITPLAN ⇒ erst `ops/cron.conf` (Regel: `ops-server.md`). Nachts aus
  dem crontab von `ploi` auf appwrite-prod:
  `~/ops/appwrite-backup.sh --run` (Quelle `ops/appwrite-backup.sh`). OHNE
  `--run` nur Vorschau — ein Zeitplan ohne den Schalter sichert nichts.
- Verschlüsselt mit dem ÖFFENTLICHEN Schlüssel `ops/appwrite-backup.pub.asc`;
  der private liegt nie auf dem Server, der Storage Box oder im Repo. Die
  `.env` gehört hinein (ohne `_APP_OPENSSL_KEY_V1` sind API-Schlüssel,
  Zwei-Faktor-Geheimnisse und verschlüsselte Buckets unlesbar).
- DIE EINE VOLUME-LISTE ist `ops/appwrite-volumes.conf` (Backup,
  Wiederherstellung, Spiegel). Volume-NAMEN aus `docker compose config`, nie
  aus einer Vorsilbe; ein unbekanntes Volume bricht das Backup ab.
- ABGEGLICHEN WIRD OHNE `--delete` (ein Test hält das); auf der Box wird nur
  nach dem NAMEN mit Unter- und Obergrenze aufgeräumt.
- Der Lauf prüft sich selbst und schreibt eine Stand-Datei (Tor-Wort
  `backup-status`). Das Bündel `app-env.tar.gz.gpg` holt er vom App-Server
  (`APP_ENV_SOURCE`); ein Ausfall dabei verhindert das Datenbank-Backup nicht,
  der Lauf endet danach rot im Schritt `app-einstellungen`.
- ZURÜCK: `ops/appwrite-restore.sh` nur auf einen Rechner OHNE Appwrite, es
  überschreibt nie — nie auf dem Mac mit der Entwicklungs-Instanz.
- Nach JEDER Änderung an Skript oder Liste: `ops/appwrite-backup-attrappe.sh`,
  dann von Hand auf den Server (kein CI-Weg).
- Compose-Ordner ist `/home/ploi/appwrite`; `/usr/src/code/appwrite` aus den
  Upgrade-Runbooks ist derselbe Ordner von INNEN. Jeder Container trägt eine
  Neustart-Regel aus der Override.
- ZWEI SHELL-FALLEN: `docker compose exec -T` liest die Standard-Eingabe leer
  (in einem Skript, das selbst von dort kommt ⇒ `</dev/null`); `… | head -1`
  oder `… | grep -q` schließt die Pipe früh — mit `pipefail` ein
  Scheinfehler (Exit 141), nur manchmal.
- Runbook: `docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md`.

## Backup des Docker-Servers
- `~/ops/docker-apps-backup.sh --run` aus dem crontab des Benutzers (Quelle
  `ops/docker-apps-backup.sh`; derselbe Schlüssel, dieselbe Box, Ordner
  `backups/docker-apps`, ohne `--delete`).
- DIE EINE LISTE ist `ops/docker-apps.conf` (je Abzug eine Zeile, je bewusst
  ausgelassenem Dienst `ohne`). NICHTS WIRD STILL AUSGELASSEN: ein unbekannter
  Compose-Ordner oder Dienst bricht den Lauf ab ⇒ NEUER DIENST DORT: am
  selben Tag die Liste nachziehen und von Hand auf den Server kopieren.
- ClickHouse NUR über `ops/docker-apps-restore-clickhouse.sh` zurückspielen
  (Wörterbücher und Quell-Tabellen zuerst; von Hand in falscher Reihenfolge
  rechnet ClickHouse still mit leeren Werten). Runbook:
  `docs/runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md`.
