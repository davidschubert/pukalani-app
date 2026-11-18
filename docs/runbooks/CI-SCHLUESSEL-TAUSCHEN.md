# CI-Schlüssel tauschen: Ausliefern und Wächter

Zwei SSH-Schlüssel verbinden GitHub Actions mit den Servern. Dieses Runbook
sagt, welcher wo liegt, was er darf und wie man ihn tauscht, ohne das
Ausliefern anzuhalten. Stand: 2026-11-14 (GA1 P08, SEC-041/SEC-042).

## 1 · Was es gibt

| Schlüssel | Secret | Umgebung bei GitHub | Liegt auf | Darf dort |
| --- | --- | --- | --- | --- |
| Ausliefern | `DEPLOY_SSH_KEY` | `production` | app-prod, Benutzer `ploi` | Befehle und rsync, ohne Weiterleitungen und Terminal (`restrict`) |
| Wächter | `WATCH_SSH_KEY` | `production-watch` | app-prod, Benutzer `ploi` | wie oben (`restrict`) |
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

**Warum der Ausliefer-Schlüssel nicht enger ist:** Er führt auf dem Server
den Symlink-Wechsel und `pm2` aus und braucht dafür eine Shell. Enger ginge
es nur mit einem festen Ausliefer-Skript auf dem Server. Der
Wächter-Schlüssel auf app-prod kopiert zwei Prüf-Skripte hinüber und führt
sie aus; auch das braucht eine Shell.

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
      # app-prod: beide Schlüssel
      ssh ploi@49.13.211.173 'cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%F)'
      { printf 'restrict '; cat "$D/deploy.pub"; printf 'restrict '; cat "$D/watch.pub"; } \
        | ssh ploi@49.13.211.173 'cat >> ~/.ssh/authorized_keys'

      # appwrite-prod: nur der Wächter, mit festem Befehl
      ssh ploi@188.245.61.155 'cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%F)'
      { printf 'command="/home/ploi/bin/pukalani-cert-gate.sh",restrict '; cat "$D/watch.pub"; } \
        | ssh ploi@188.245.61.155 'cat >> ~/.ssh/authorized_keys'
      ```

      Vorher prüfen, dass die Datei mit einem Zeilenumbruch endet, sonst
      klebt die neue Zeile an der letzten.
- [ ] **3. Mit dem neuen Schlüssel prüfen**, bevor irgendetwas umgestellt
      wird: `ssh -i "$D/deploy" -o IdentitiesOnly=yes ploi@49.13.211.173 true`
      (Exit 0), dasselbe mit `watch`. Auf appwrite-prod:
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

Für `cron-status` liegen zwei weitere Dateien von Hand auf dem Server. Ändert
sich `ops/cron.conf` oder `ops/cron-check.sh`, gehören sie mit hinüber — sonst
vergleicht der Server mit einer alten Liste:

```bash
scp ops/cron-check.sh ops/cron.conf ploi@188.245.61.155:ops/
ssh ploi@188.245.61.155 'chmod 755 ~/ops/cron-check.sh && ~/bin/pukalani-cert-gate.sh cron-status'
```

## 4 · Feste Befehle auf app-prod

**Stand 2026-11-18: Übergang.** Die Handgriffe des Auslieferns (Stand
empfangen, Verweis umlegen, `pm2` neu laden, alte Stände wegräumen) stehen in
EINER Datei, `ops/app-release.sh`. Der Rückweg `ops/rollback.sh` schickt sie
bei jedem Aufruf selbst mit; für das Ausliefern liegt sie von Hand eingespielt
auf dem Server. Liegt sie dort, läuft `deploy.yml` über sie; liegt sie nicht
dort, nimmt der Workflow die freien Befehle wie bisher. Erst wenn ein echtes
Ausliefern über das Skript grün war, fällt der alte Weg aus dem Workflow, und
erst danach wird der Schlüssel auf das Skript beschränkt.

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

## 5 · Fallen

- **Ploi verwaltet `authorized_keys` mit.** Ein Schlüssel, der im Ploi-Panel
  angelegt wird, hat keine Optionen. Die CI-Schlüssel deshalb von Hand
  eintragen, und nach jeder Änderung an den SSH-Schlüsseln im Panel die
  Liste zurücklesen (`ssh-keygen -lf ~/.ssh/authorized_keys`).
- **Eine Änderung an `deploy.yml` wirkt erst nach dem Merge.** Der Workflow
  läuft per `workflow_run` immer in der Fassung von `main`. Ein grüner Lauf
  ohne App-Änderung liefert nicht aus und beweist nichts; der Beweis ist
  der Build-SHA auf den Hosts.
- **`scp` und ein fester Befehl vertragen sich nicht.** Ein Schlüssel mit
  `command=` kann keine Dateien kopieren. Das ist auf appwrite-prod
  gewollt.
- **Umgebung und Zweig.** Ein Lauf von Hand von einem Arbeitszweig scheitert
  an der Umgebung. Das ist die Sperre, kein Fehler.
- **GitHub gibt ein gespeichertes Secret nicht heraus.** Ein Secret zieht
  man nicht um, man setzt es neu: Wert neu erzeugen oder an der Quelle neu
  kopieren, mit `--env <umgebung>` setzen, erst nach einem grünen Lauf den
  alten Eintrag löschen.
- **zsh.** `ssh $OPTIONEN …` reicht die Optionen als EIN Wort durch (Array
  nehmen), und `$commit:refs/…` liest `:r` als Kürzel (`${commit}:refs/…`).
