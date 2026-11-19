# CI-Schlüssel tauschen: Ausliefern und Wächter

Zwei SSH-Schlüssel verbinden GitHub Actions mit den Servern. Dieses Runbook
sagt, welcher wo liegt, was er darf und wie man ihn tauscht, ohne das
Ausliefern anzuhalten. Stand: 2026-11-18 (GA1 P08, SEC-041/SEC-042; seit
N12 tragen beide Schlüssel auf app-prod einen festen Befehl).

## 1 · Was es gibt

| Schlüssel | Secret | Umgebung bei GitHub | Liegt auf | Darf dort |
| --- | --- | --- | --- | --- |
| Ausliefern | `DEPLOY_SSH_KEY` | `production` | app-prod, Benutzer `ploi` | nur `ops/app-release.sh` (`command=…`, `restrict`): die Worte des Auslieferns, kein rsync, keine freie Befehlszeile (§ 4) |
| Wächter | `WATCH_SSH_KEY` | `production-watch` | app-prod, Benutzer `ploi` | nur `ops/app-watch-gate.sh` (`command=…`, `restrict`): feste, nur lesende Worte (§ 4) |
| Wächter | derselbe | `production-watch` | appwrite-prod, Benutzer `ploi` | nur das Tor-Skript (`command=…`, `restrict`) |

Dazu in `production-watch`: `PRODUCTION_WATCH_HEARTBEAT_URL`,
`PRODUCTION_WATCH_RESEND_KEY`, `PRODUCTION_ALARM_RESEND_KEY` (seit
2026-11-15 ein neuer Resend-Schlüssel `produktions-waechter-2026-11`) und
`PRODUCTION_ALARM_MAIL_TO` (Klickliste:
[PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md)). Auf Repo-Ebene liegt kein
Secret und keine Variable mehr.

**Fingerabdrücke der Schlüssel vom 2026-11-14** (zum Vergleichen beim
Zurücklesen; `ssh-keygen -lf ~/.ssh/authorized_keys` zeigt je Zeile einen):

| Schlüssel | Kommentar | Fingerabdruck |
| --- | --- | --- |
| Ausliefern | `pukalani-ci-deploy-2026-11` | `SHA256:vRl1AXpGZaZ72cINl+vE1tfpE+Kro4xSl6AU+t2VeK0` |
| Wächter | `pukalani-ci-watch-2026-11` | `SHA256:nXN3MAVRQJGHJluwLakPsdcg9vSuGiotFSirwX/mDSo` |

Eine lokale Kopie der privaten Schlüssel gibt es nicht. Wer einen braucht,
tauscht ihn (§ 2).

**Drei Regeln, die der Wächter `pnpm check:workflows` hält:**

1. Ein Job, der ein Secret liest, nennt eine Umgebung. Beide Umgebungen
   lassen nur den Zweig `main` zu; ein Lauf von einem anderen Zweig bekommt
   kein Secret. Auf Repo-Ebene liegt kein Secret mehr.
2. Ein Job mit Umgebung installiert und baut nichts. Im Deploy heißt das:
   `fonts` und `deliver` haben den Schlüssel, `build` hat ihn nicht.
3. Jede fremde Action ist über einen Commit eingebunden.

**Kein CI-Schlüssel hat eine Shell (seit 2026-11-18).** Bis dahin führten
beide auf app-prod freie Befehle aus: der Ausliefer-Schlüssel für
Symlink-Wechsel und `pm2`, der Wächter-Schlüssel, weil zwei Prüf-Skripte sich
selbst hinüberkopierten. Jetzt führt sshd für jeden der beiden genau EIN
Skript aus (§ 4). Was das beim Ausliefer-Schlüssel NICHT ist: ein Schutz
davor, dass er Programm auf den Server bringt — das ist seine Aufgabe.

## 2 · Tauschen (beide Schlüssel, gleiches Verfahren)

Reihenfolge einhalten. Bis Schritt 6 gilt der alte Schlüssel weiter, ein
Fehler kostet bis dahin nichts.

- [ ] **1. Erzeugen**, in einem Wegwerf-Ordner außerhalb jedes Repos, ohne
      Passphrase (die CI kann keine eingeben):

      ```bash
      D=$(mktemp -d) && chmod 700 "$D"
      ssh-keygen -q -t ed25519 -N '' -C "pukalani-ci-deploy-$(date +%Y-%m)" -f "$D/deploy"
      ssh-keygen -q -t ed25519 -N '' -C "pukalani-ci-watch-$(date +%Y-%m)" -f "$D/watch"
      ssh-keygen -lf "$D/deploy.pub"; ssh-keygen -lf "$D/watch.pub"
      ```

      Die Fingerabdrücke notieren. Der private Teil wird nie ausgegeben.
- [ ] **2. Zusätzlich eintragen.** Vorher eine Kopie der Liste anlegen. Die
      Optionen stehen VOR dem Schlüssel, alles in EINER Zeile.

      ```bash
      # app-prod: beide Schlüssel, jeder mit seinem festen Befehl
      ssh ploi@49.13.211.173 'cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%F)'
      { printf 'command="/home/ploi/ops/app-release.sh",restrict '; cat "$D/deploy.pub";
        printf 'command="/home/ploi/ops/app-watch-gate.sh",restrict '; cat "$D/watch.pub"; } \
        | ssh ploi@49.13.211.173 'cat >> ~/.ssh/authorized_keys'

      # appwrite-prod: nur der Wächter, mit festem Befehl
      ssh ploi@188.245.61.155 'cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%F)'
      { printf 'command="/home/ploi/bin/pukalani-cert-gate.sh",restrict '; cat "$D/watch.pub"; } \
        | ssh ploi@188.245.61.155 'cat >> ~/.ssh/authorized_keys'
      ```

      Vorher prüfen, dass die Datei mit einem Zeilenumbruch endet, sonst
      klebt die neue Zeile an der letzten.
- [ ] **3. Mit dem neuen Schlüssel prüfen**, bevor irgendetwas umgestellt
      wird: `ssh -i "$D/deploy" -o IdentitiesOnly=yes ploi@49.13.211.173
      /home/ploi/ops/app-release.sh list help` zeigt die Stände, `… 'echo frei'`
      endet mit Exit 64; mit `watch`: `… /home/ploi/ops/app-watch-gate.sh sums`
      zeigt die Summen, `… 'echo frei'` endet mit Exit 64. Auf appwrite-prod:
      `ssh -i "$D/watch" -o IdentitiesOnly=yes ploi@188.245.61.155 probe`
      zeigt die Probe, ein anderes Wort wird mit Exit 64 abgelehnt.
- [ ] **4. Secrets setzen** (der Wert kommt aus der Datei, nie aus der
      Zwischenablage oder dem Chat):

      ```bash
      gh secret set DEPLOY_SSH_KEY --env production       --repo davidschubert/pukalani-app < "$D/deploy"
      gh secret set WATCH_SSH_KEY  --env production-watch --repo davidschubert/pukalani-app < "$D/watch"
      ```
- [ ] **5. Beweisen.** Ein echter Ausliefer-Lauf (`gh workflow run
      deploy.yml`; danach `.build` und `ok:true` auf allen Hosts), ein
      Wächter-Lauf (`gh workflow run production-watch.yml`, Job `server`
      grün) und die Probe des Notfall-Jobs (`-f appwrite_probe=true`).
- [ ] **6. Alten Schlüssel austragen**, erst jetzt. Die Zeile über ihren
      Kommentar oder Fingerabdruck finden (`ssh-keygen -lf
      ~/.ssh/authorized_keys` listet je Zeile einen), entfernen, die Liste
      zurücklesen. Der Beweis ist die zurückgelesene Liste, kein
      Anmeldeversuch mit dem alten Schlüssel.
- [ ] **7. Lokale Kopien löschen** und nachsehen: `rm -rf "$D"; ls "$D"`
      muss „No such file" melden.
- [ ] **8. Probealarm** nach jeder Änderung am Wächter
      ([PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md), § 2).

**Rückweg:** Solange Schritt 6 nicht getan ist, das alte Secret wieder
setzen. Danach: einen neuen Schlüssel erzeugen und ab Schritt 1 gehen; der
eigene Zugang vom Mac ist von alldem nicht berührt.

## 3 · Tor auf appwrite-prod

Der Wächter-Schlüssel bekommt auf dem Appwrite-Server keine Shell. sshd
führt für ihn immer `ops/appwrite-cert-gate.sh` aus; erlaubt sind die Worte
`probe`, `renew`, `reset-account`, (seit 2026-11-15) `backup-status` und
(seit 2026-11-16) `realtime-status` und `cron-status`. Die letzten drei lesen
nur: je eine Zeile mit Ergebnis, Alter und Größe des letzten nächtlichen Backups
(`docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md`, § 6.3) bzw. mit dem Stand des
Realtime-Wächters (`docs/runbooks/PRODUKTIONS-ALARM.md`, „Live-Verbindung");
`cron-status` vergleicht die Zeitpläne des Servers mit `ops/cron.conf` und
gibt je Quelle (crontab von `ploi`, `/etc/crontab`) eine Zeile mit Zahlen und
Kennungen aus — dafür ruft das Tor `~/ops/cron-check.sh`, das mit der Liste
daneben liegt (`docs/runbooks/NEUE-SITE.md`, „Neuer oder entfernter
Zeitplan").
Das Skript filtert auch die Ausgabe:
Das Protokoll eines Laufs ist öffentlich, und der Worker schreibt seit
Appwrite 2.2 alle Warteschlangen in ein Protokoll.

Einspielen und Aktualisieren geht nur von Hand, es gibt bewusst keinen
CI-Weg auf diesen Server:

```bash
ssh ploi@188.245.61.155 'mkdir -p ~/bin'
scp ops/appwrite-cert-gate.sh ploi@188.245.61.155:bin/pukalani-cert-gate.sh
ssh ploi@188.245.61.155 'chmod 755 ~/bin/pukalani-cert-gate.sh && ~/bin/pukalani-cert-gate.sh probe'
```

Ändert sich `ops/appwrite-cert-gate.sh` im Repo, gehört dieser Schritt dazu.
Der Deploy kopiert `ops/` nur auf app-prod.

Seit 2026-11-18 kennt das Tor das Wort `sums`: je von Hand eingespielter
Datei eine Zeile `sum <name> <sha256>` (oder `sum <name> fehlt`) — für das Tor
selbst und für `cron-check.sh`, `cron.conf`, `realtime-watchdog.sh`,
`appwrite-backup.sh`, `appwrite-volumes.conf` und `appwrite-backup.pub.asc`
unter `~/ops`. Der tägliche Wächter (`scripts/ops/verify-server-scripts.mjs`)
vergleicht sie mit dem Repo und wird rot, wenn eine Datei abweicht oder fehlt.
Solange hier noch ein Tor ohne `sums` liegt, antwortet es mit Exit 64; der
Wächter schreibt dann „nicht geprüft" als Warnung, kein Rot. Von Hand
nachsehen: `ssh ploi@188.245.61.155 '~/bin/pukalani-cert-gate.sh sums'` und
`shasum -a 256 ops/<datei>` im Repo.

Für `cron-status` liegen zwei weitere Dateien von Hand auf dem Server. Ändert
sich `ops/cron.conf` oder `ops/cron-check.sh`, gehören sie mit hinüber — sonst
vergleicht der Server mit einer alten Liste:

```bash
scp ops/cron-check.sh ops/cron.conf ploi@188.245.61.155:ops/
ssh ploi@188.245.61.155 'chmod 755 ~/ops/cron-check.sh && ~/bin/pukalani-cert-gate.sh cron-status'
```

## 4 · Feste Befehle auf app-prod

Die Handgriffe des Auslieferns (Stand empfangen, Verweis umlegen, `pm2` neu
laden, alte Stände wegräumen) stehen in EINER Datei, `ops/app-release.sh`.
Der Rückweg `ops/rollback.sh` schickt sie bei jedem Aufruf selbst mit; für das
Ausliefern liegt sie von Hand eingespielt auf dem Server und ist seit dem
2026-11-18 der feste Befehl des Ausliefer-Schlüssels. `deploy.yml` kennt
keinen anderen Weg mehr: fehlt die Datei auf dem Server, scheitert jedes
Ausliefern (der Rückweg nicht). Der Schritt „Ist der Ausliefer-Schlüssel auf
das Skript beschränkt?" am Ende des Jobs `deliver` schickt bei jedem
Ausliefern eine harmlose freie Befehlszeile und wird rot, wenn der Server sie
ausführt.

Einspielen und Aktualisieren (von Hand, über den eigenen Zugang):

```bash
ssh ploi@49.13.211.173 'test ! -e ~/ops/app-release.sh || cp -p ~/ops/app-release.sh ~/ops/app-release.sh.vorher-$(date +%F)'
scp ops/app-release.sh ops/apps.conf ploi@49.13.211.173:ops/
ssh ploi@49.13.211.173 'chmod 755 ~/ops/app-release.sh && sha256sum ~/ops/app-release.sh ~/ops/apps.conf && ~/ops/app-release.sh list help'
shasum -a 256 ops/app-release.sh ops/apps.conf   # muss dieselben zwei Summen zeigen
```

`~/ops/apps.conf` ist dieselbe Liste, die dort schon für das Backup der
App-Einstellungen liegt. Unter dem festen Befehl ist sie die EINZIGE Quelle
für App und Site — eine neue App gehört deshalb zuerst dorthin
([NEUE-SITE.md](NEUE-SITE.md), Schritt 7). Das Skript nimmt für `<site>/ops`
nur Dateinamen von seiner eigenen Liste an (`OPS_FILES`); eine neue Datei im
Workflow heißt: Liste ergänzen, Skript neu einspielen.

Der feste Befehl (eine Zeile in `~/.ssh/authorized_keys`, Optionen VOR dem
Schlüssel; vorher eine Kopie der Datei daneben legen):

```text
command="/home/ploi/ops/app-release.sh",restrict ssh-ed25519 AAAA… pukalani-ci-deploy-…
```

Danach führt sshd für diesen Schlüssel nur noch das Skript aus. Erlaubt sind
die Worte `list`, `activate`, `prune`, `release-put`, `ops-put`, `fonts-get`,
`fonts-put`; `rsync`, `scp` und jede freie Befehlszeile enden mit Exit 64.
Was der feste Befehl NICHT ist: ein Schutz davor, dass der Schlüssel Programm
auf den Server bringt — das ist seine Aufgabe. Er nimmt ihm alles andere.

Nach JEDER Änderung an `ops/app-release.sh`, `ops/rollback.sh` oder am
Schritt „Ausliefern" in `deploy.yml`: `ops/app-release-attrappe.sh` (ein
Wegwerf-Container mit echtem sshd: das ganze Ausliefern mit und ohne festen
Befehl, die Ablehnungen, Abbruch mittendrin, zwei Läufe zur selben Zeit, der
Rückweg), dann einspielen.

**Rückweg:** die Kopie `…vorher-<Datum>` zurücklegen bzw. die Zeile in
`authorized_keys` wieder auf `restrict` allein stellen. Der eigene Zugang
`ploi@…` ist von alldem nicht berührt.

### Das Wächter-Tor

Die Prüf-Skripte des Wächters
(`verify-site-env`, `verify-stale-keys`, `verify-instance-admins`,
`verify-mail-breaker`, `verify-app-signals`, `verify-server-config`, seit
2026-11-19 `verify-node-version`) schicken
auf app-prod nur noch feste Worte an `ops/app-watch-gate.sh`, das von Hand
unter `/home/ploi/ops/app-watch-gate.sh` liegt und seit dem 2026-11-18 der
feste Befehl des Wächter-Schlüssels ist. Die Befehlszeile ist
`ssh <server> /home/ploi/ops/app-watch-gate.sh <wort> …` — dieselbe, ob ein
Schlüssel frei ist (der eigene Zugang) oder den festen Befehl trägt. Jedes
Wort liest nur:

| Wort | führt auf dem Server aus |
| --- | --- |
| `site-env <site>` | `awk` über `<site>/.env`: je Variable `NAME=1` oder `NAME=0`, nie ein Wert |
| `site-project <site>` | die Projekt-Id aus `<site>/.env` (öffentlich), nur in fester Form |
| `stale-keys [strict]` | `node <site>/ops/verify-stale-keys.mjs --dir /home/ploi [--strict]` |
| `instance-admins [strict]` | `node <site>/ops/verify-instance-admins.mjs --dir /home/ploi [--strict]` |
| `mail-breaker <zeitpunkt>` | `grep` der Notbremsen-Zeile in `~/.pm2/logs/*-error*.log`, nur „Zeitpunkt Ereignis" — seit 2026-11-18 nur noch für den Probelauf (`verify-mail-breaker.mjs --pattern …`); der tägliche Mail-Blick fragt `app-signals` |
| `app-signals <app> <stunden>` | `node <site der app>/ops/app-watch-counts.mjs <prozess> <stunden>` |
| `nginx-check` | `node <site>/ops/nginx-check.mjs` |
| `cron-check` | `bash <site>/ops/cron-check.sh app-prod` |
| `sums` | je von Hand eingespielter Datei unter `~/ops` eine Zeile `sum <name> <sha256>` |
| `node-version` | `/usr/bin/node --version` und `pm2 jlist`: eine Zeile `program <version>`, je pm2-Prozess einer Site der Liste `proc <prozess> <version>` (oder `fehlt`), dazu `fremd <n>` — kein Pfad, kein Name außerhalb der Liste |

App und Site kommen nur aus `~/ops/apps.conf`. `<site>` bei den Prüf-Skripten
ist `platform.pukalani.app` (sonst die erste Site der Liste); dort legt das
Ausliefern die Dateien ab (`OPS_FILES` in `ops/app-release.sh`). Fehlt eine,
antwortet das Tor „Nicht geprüft" mit Exit 6, und der Wächter wird rot, nicht
grün. Alles andere, auch `scp`, `rsync` und jede freie Befehlszeile, endet
mit „Abgelehnt: erlaubt sind …" und Exit 64.

Einspielen und Aktualisieren (von Hand, über den eigenen Zugang; die beiden
`verify-*.mjs` legt das Ausliefern unter `<site>/ops/` ab):

```bash
ssh ploi@49.13.211.173 'test ! -e ~/ops/app-watch-gate.sh || cp -p ~/ops/app-watch-gate.sh ~/ops/app-watch-gate.sh.vorher-$(date +%F)'
scp ops/app-watch-gate.sh ops/apps.conf ploi@49.13.211.173:ops/
ssh ploi@49.13.211.173 'chmod 755 ~/ops/app-watch-gate.sh && ~/ops/app-watch-gate.sh sums && ~/ops/app-watch-gate.sh stale-keys && ~/ops/app-watch-gate.sh node-version'
shasum -a 256 ops/app-watch-gate.sh ops/apps.conf   # dieselben Summen wie in der Zeile `sums`
```

Danach ein Wächter-Lauf (`gh workflow run production-watch.yml --ref main`,
Job `server` grün). Die Zeile des Wächter-Schlüssels in
`~/.ssh/authorized_keys`:

```text
command="/home/ploi/ops/app-watch-gate.sh",restrict ssh-ed25519 AAAA… pukalani-ci-watch-…
```

Der Schritt „Ist der Wächter-Schlüssel beschränkt?" im Job `server` schickt
täglich eine harmlose freie Befehlszeile und wird rot, wenn der Server sie
ausführt.

Nach JEDER Änderung an `ops/app-watch-gate.sh` oder am ssh-Weg der
Prüf-Skripte: `ops/app-watch-gate-attrappe.sh` (Wegwerf-Container mit echtem
sshd: jedes Wort mit und ohne festen Befehl, die Ablehnungen, die echten
Prüf-Skripte, die Vergleiche `sums` und `node-version`), dann einspielen.
ZWISCHEN MERGE UND EINSPIELEN meldet der Blick „Liegen auf den Servern die
Dateien aus dem Repo?" die Abweichung — beides direkt hintereinander
erledigen, sonst geht ein Alarm auf: im Tageslauf um 04:17 UTC und in JEDEM
Lauf von Hand davor (2026-11-19: Issue 423 stand so knapp sechs Stunden
offen). Ein Wort, das das Tor auf dem Server
noch nicht kennt, beantwortet es mit Exit 64; der Blick dazu bleibt dann
grün und schreibt „nicht geprüft". Ob die Datei auf dem
Server der im Repo entspricht, sagt der tägliche Blick „Liegen auf den
Servern die Dateien aus dem Repo?".

**Rückweg:** die Zeile in `authorized_keys` wieder auf `restrict` allein
stellen und, falls nötig, die Kopie `…vorher-<Datum>` zurücklegen. Die
Prüf-Skripte bleiben auf dem Tor; ohne Tor auf dem Server ist der Wächter rot,
bis es wieder liegt.

### Was von Hand auf den Servern liegt (Stand 2026-11-18) — und der Weg zurück

| Server | Datei | Quelle im Repo | Seit N12 | Zurück |
| --- | --- | --- | --- | --- |
| app-prod | `~/ops/app-release.sh` | `ops/app-release.sh` | neu; Kopie der ersten Fassung `app-release.sh.vorher-n12` | NICHT löschen, solange der Workflow nur diesen Weg kennt: erst die Änderung am Workflow zurücknehmen (`git revert`), dann die Zeile in `authorized_keys` |
| app-prod | `~/ops/app-watch-gate.sh` | `ops/app-watch-gate.sh` | neu; seit 2026-11-19 mit dem Wort `node-version`, Kopie der Fassung davor `app-watch-gate.sh.vorher-2026-11-19` | wie oben: erst die Prüf-Skripte zurück auf freie Befehle, dann die Zeile |
| app-prod | `~/.ssh/authorized_keys` | — | zwei Zeilen mit `command=…`; Kopie `authorized_keys.vorher-n12` | die zwei Zeilen wieder auf `restrict` allein (oder die Kopie zurücklegen, wenn seither kein Schlüssel dazukam) — beide Skripte laufen auch mit freiem Schlüssel |
| app-prod | `~/ops/apps.conf`, `app-env-bundle.sh`, `appwrite-backup.pub.asc` | gleichnamig unter `ops/` | unverändert (seit N11) | — |
| appwrite-prod | `~/bin/pukalani-cert-gate.sh` | `ops/appwrite-cert-gate.sh` | Wort `sums`; Kopie `pukalani-cert-gate.sh.vorher-n12` | Kopie zurücklegen (der Vergleich meldet dann „nicht geprüft") |
| appwrite-prod | `~/ops/cron.conf` | `ops/cron.conf` | auf den Stand des Repos; Kopie `cron.conf.vorher-n12` | Kopie zurücklegen |

Der eigene Zugang `ploi@…` steht in keiner dieser Zeilen und ist der Weg
zurück, wenn sich ein beschränkter Schlüssel aussperrt.

### Wie umgestellt wurde (2026-11-18, zum Nachmachen bei einem dritten Schlüssel)

Jede Stufe für sich, dazwischen ein echter, grüner Lauf:

1. Das Skript ins Repo, der Workflow mit einer Weiche (liegt das Skript auf
   dem Server? sonst der alte Weg) — ein Ausliefern über den ALTEN Weg mit dem
   neuen Workflow.
2. Skript von Hand auf den Server — das nächste Ausliefern lief darüber.
3. Der alte Weg aus dem Workflow — wieder ein Ausliefern.
4. Erst dann die Zeile in `authorized_keys` (Kopie `authorized_keys.vorher-n12`
   daneben; geändert per `awk` in eine neue Datei, vor dem Umbenennen
   gegengeprüft: gleiche Zeilenzahl, dieselben Fingerabdrücke, genau zwei
   Zeilen anders) — und noch ein Ausliefern und ein Wächter-Lauf.

Der Aufruf MIT dem Pfad des Skripts ist der Kniff, der Stufe 4 ohne Änderung
am Workflow möglich macht: unter dem festen Befehl steht dieselbe Zeile in
`SSH_ORIGINAL_COMMAND`, und das Skript überspringt seinen eigenen Pfad.

## 5 · Fallen

- **Eine von Hand eingespielte Datei veraltet still — außer jemand
  vergleicht.** Ändert sich `ops/app-release.sh`, `ops/app-watch-gate.sh`,
  `ops/apps.conf` oder eine der Dateien auf appwrite-prod im Repo, gehört das
  Einspielen dazu; der tägliche Blick „Liegen auf den Servern die Dateien aus
  dem Repo?" (`scripts/ops/verify-server-scripts.mjs`, Worte `sums` in beiden
  Toren) wird sonst am nächsten Morgen rot. Das ist gewollt.
- **Ein Zweig mit einem erfundenen Testwert machte `secrets` für ALLE rot.**
  Bis zum 2026-11-18 las die Prüfung jeden Zweig auf origin; seitdem liest
  sie je Pull Request nur den eigenen Zweig, und alle Zweige liest einmal am
  Tag `secrets-watch.yml` (Issue `geheimnis-alarm`). Ein Wert, der wie ein Schlüssel
  aussieht, in einer Variable namens `SECRET`, `TOKEN` oder `KEY` hielt am
  2026-11-18 dreizehn Minuten lang jedes Ausliefern und jeden Pull Request
  auf. Vor dem ersten Push eines Zweigs: `gitleaks git --no-banner --redact
  --exit-code 1 --log-opts="origin/main..HEAD" .`
- **`/dev/stderr` ist unter Linux kein Pfad, wenn die Fehlerausgabe ein
  Socket ist** (so startet Node Kindprozesse, also jeder vitest-Test eines
  Shell-Skripts). `2>>/dev/stderr` scheitert dort mit „No such device or
  address"; am Mac und in einem Container ohne Node fällt es nicht auf. Eine
  eigene Nummer nehmen (`exec 8>&2`, dann `2>&8`).

- **Ploi verwaltet `authorized_keys` mit.** Ein Schlüssel, der im Ploi-Panel
  angelegt wird, hat keine Optionen. Die CI-Schlüssel deshalb von Hand
  eintragen, und nach jeder Änderung an den SSH-Schlüsseln im Panel die
  Liste zurücklesen (`ssh-keygen -lf ~/.ssh/authorized_keys`).
- **Eine Änderung an `deploy.yml` wirkt erst nach dem Merge.** Der Workflow
  läuft per `workflow_run` immer in der Fassung von `main`. Ein grüner Lauf
  ohne App-Änderung liefert nicht aus und beweist nichts; der Beweis ist
  der Build-SHA auf den Hosts.
- **`scp` und ein fester Befehl vertragen sich nicht.** Ein Schlüssel mit
  `command=` kann keine Dateien kopieren. Das ist auf beiden Servern
  gewollt; Dateien reisen als tar über die Standard-Eingabe eines Wortes
  (`release-put`, `ops-put`, `fonts-put`).
- **Umgebung und Zweig.** Ein Lauf von Hand von einem Arbeitszweig scheitert
  an der Umgebung. Das ist die Sperre, kein Fehler.
- **GitHub gibt ein gespeichertes Secret nicht heraus.** Ein Secret zieht
  man nicht um, man setzt es neu: Wert neu erzeugen oder an der Quelle neu
  kopieren, mit `--env <umgebung>` setzen, erst nach einem grünen Lauf den
  alten Eintrag löschen.
- **zsh.** `ssh $OPTIONEN …` reicht die Optionen als EIN Wort durch (Array
  nehmen), und `$commit:refs/…` liest `:r` als Kürzel (`${commit}:refs/…`).
