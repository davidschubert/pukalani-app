# Deployment-Runbook — Prod-Sites

Stand: 2026-11-20. Zwei Teile:

- **Teil A — Betrieb heute:** was wo läuft, wie ausgeliefert wird, und was zu
  tun ist, wenn ein schlechter Stand live ist.
- **Teil B — Eine neue Silo-Site aufsetzen:** das Anlege-Rezept vom Juli 2026.
  Die Beispiele dort nennen `comments` — die Site gibt es seit dem 2026-08-18
  nicht mehr, das Muster gilt weiter (heute: portfolio, branding).

Ergänzt [CONCEPT.md](../CONCEPT.md) (A9 Deployment, A11 Env, A3 Session-Cookie).
Die Go-Live-Geschichte mit allen Lehren steht im Archiv:
[PHASE-17-PRODUCTION.md](../archiv/PHASE-17-PRODUCTION.md). Alarmweg und
erste Handgriffe bei einem Ausfall: [PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md).

---

# Teil A — Betrieb heute

## A1. Was wo läuft

EIN App-Server (`app-prod`, 49.13.211.173, ploi-verwaltet) mit sechs Apps;
Appwrite daneben auf `appwrite-prod` (188.245.61.155) unter `api.pukalani.app`,
self-hosted **2.7.4**, vier Projekte: `account` (Pool-Communities und Konten),
`admin` (Betreiber-Konsole), `portfolio`, `branding`.

| App (`apps/<app>`) | Site = Verzeichnis `/home/ploi/<site>` | antwortet auch auf | Port | pm2-Prozess |
| --- | --- | --- | --- | --- |
| `portfolio` | `portfolio.pukalani.app` | `pukalani.studio` (Kundendomain) | 3002 | `portfoliopukalaniapp` |
| `control` | `admin.pukalani.app` | — | 3003 | `adminpukalaniapp` |
| `platform` | `platform.pukalani.app` | `account.`, `demo.` und jede Kunden-Community (`*.pukalani.app`, Kundendomains) | 3004 | `platformpukalaniapp` |
| `marketing` | `pukalani.app` | `www.pukalani.app` | 3005 | `pukalaniapp` |
| `help` | `help.pukalani.app` | — | 3006 | `helppukalaniapp` |
| `branding` | `branding.supply` | `www.branding.supply` | 3007 | `brandingsupply` |

**Die eine Quelle dieser Namen ist [`ops/apps.conf`](../../ops/apps.conf)** (je
Zeile App und Site). Das Ausliefern und der Rückweg lesen beide diese Datei.
Zwei Regeln statt weiterer Spalten: Die Stände einer App liegen unter
`/home/ploi/releases/<app>/<commit>` (Verweis `current`), und der pm2-Prozess
heißt wie die Site ohne Punkte. Der Test
`packages/core/tests/deployApps.test.ts` wird rot, wenn Liste, Ecosystem-Datei
(`ops/ecosystem-<app>.config.cjs`), Workflow oder Health-Wächter
auseinanderlaufen. Alle Hosts, Altnamen und die Zertifikats-Regeln:
[Hosts & Ports](../content/2.architektur/6.hosts-und-ports.md).

Was jede App zur Laufzeit braucht, liegt in `/home/ploi/<site>/.env` (nie im
Repo). Nitro liest zur Laufzeit keine `.env`: Die Ecosystem-Datei hebt sie
beim `pm2 startOrReload … --update-env` in den Prozess. Eine Änderung dort
wirkt also erst mit dem nächsten Neuladen — und JEDES Neuladen (Ausliefern,
Rückweg) macht sie wirksam.

## A2. Ausliefern

Jeder Merge auf `main` wird ausgeliefert, wenn die vier Prüfungen (Test,
Lint, Typecheck, E2E) für genau diesen Commit grün sind
(`.github/workflows/deploy.yml`). Fünf Jobs auf getrennten Maschinen:

1. `plan` — liegt der Commit auf `main`? Gibt es etwas auszuliefern? Verglichen
   wird gegen den ÄLTESTEN Build, den eine der sechs Apps gerade meldet; ändert
   sich nur Doku, CI oder Meta, wird übersprungen.
2. `fonts` — holt den Font-Cache vom Server (mit Schlüssel, ohne Installieren).
3. `build` — installiert und baut alle sechs Apps, ohne jedes Secret.
4. `deliver` — schickt je App vier Worte an das feste Skript auf dem Server
   (`ops/app-release.sh`, seit 2026-11-18; vorher freie Befehle und `rsync`):
   `release-put` (das Build-Ergebnis als Archiv, in ein FRISCHES Verzeichnis
   `/home/ploi/releases/<app>/<commit>/`; ein Stand, der gerade läuft, wird
   nicht überschrieben), `ops-put` (die Dateien der Site nach
   `/home/ploi/<site>/ops/`: Ecosystem-Datei, `pm2-heal.sh`, die Zähl- und
   Vergleichs-Skripte des Wächters — nur Namen von der Liste des Skripts),
   `activate` (Verweis `current` atomar umlegen, `pm2 startOrReload`: der alte
   Prozess antwortet, bis der neue bereit ist; scheitert der Neustart, liegt
   der Verweis wieder auf dem Stand davor) und `prune` (es bleiben vier
   Stände je App, der aktive immer). Danach die Probe: dreimal in Folge der
   erwartete Commit auf `https://<site>/api/health`. Am Ende fragt der Job, ob
   der Schlüssel noch auf das Skript beschränkt ist.
5. `tls` — liefert jeder Host noch ein passendes Zertifikat?

**Ein Skript, zwei Aufrufer.** Das Ausliefern und der Rückweg (A3) benutzen
dieselbe Datei `ops/app-release.sh`: das Ausliefern die Kopie, die von Hand
auf dem Server liegt (sie ist der feste Befehl des Ausliefer-Schlüssels —
ohne sie scheitert jedes Ausliefern), der Rückweg schickt sie bei jedem Aufruf
aus dem eigenen Checkout mit. Je App wartet ein zweiter Lauf auf den ersten
(Sperre); ein Lauf, der mitten im Empfangen abbricht, hinterlässt nichts,
einer, der mitten im Umstellen abbricht, wird auf dem Server zu Ende
gebracht. Nach jeder Änderung an dem Skript:
`ops/app-release-attrappe.sh`, dann einspielen
([CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md), § 4) — der tägliche
Wächter meldet eine Abweichung zwischen Server und Repo.

Vom Merge bis live vergehen rund 15 Minuten. Der Server baut nichts.

**Die Probe liest seit dem 2026-11-15 auch `ok`.** Trägt eine App den neuen
Commit, meldet aber nicht `ok:true`, werden die übrigen Apps trotzdem
ausgeliefert und der Lauf endet rot („Ausgeliefert, aber nicht gesund“).
Zurückgestellt wird nicht von selbst — dann gilt Abschnitt A3.

**Der Beweis, dass etwas live ist,** ist nie der grüne Lauf, sondern
`curl https://<host>/api/health` → `.build` (der vollständige Commit) und
`ok`. Der Deploy startet je Push zweimal (einmal je Auslöser); einer der
Läufe endet „cancelled“ oder findet nichts mehr zu tun.

**Eine rote Prüfung neu starten löst das Ausliefern von selbst aus** — für
den Commit dieser Prüfung, nicht für die Spitze von `main`. Deshalb eine rote
Prüfung nur neu starten, solange ihr Commit die Spitze von `main` ist. Ist
`main` schon weiter, bringt der neuere Commit sein eigenes Ausliefern mit;
der ältere muss nicht mehr grün werden. Zwei Sperren im Schritt „Deploy
nötig?“ halten einen überholten Commit auf (seit dem 2026-11-20 und
2026-11-21, Test: `packages/core/tests/deployDecision.test.ts`):

- Läuft auf JEDER App schon ein neuerer Stand, endet der Lauf grün mit
  „Überholt“ und liefert nichts aus.
- Läuft nur auf EINIGEN Apps ein neuerer Stand (ein Ausliefern ist
  mittendrin abgebrochen), liefert er ebenfalls nichts aus und schreibt eine
  Warnung. Die zurückgebliebenen Apps brauchen dann den neuesten Stand:
  `gh workflow run deploy.yml`.

Was die Sperren nicht halten: antwortet eine App gar nicht, wird wie bisher
sicherheitshalber ausgeliefert — auch ein älterer Commit. Und der manuelle
Start liefert immer aus, was man ihm nennt (das ist der Rückweg). Nach jedem
Neustart einer Prüfung deshalb den Live-Build mit der Spitze von `main`
vergleichen.

**Manueller Start** (Notausgang, ohne die vier Prüfungen):

```bash
gh workflow run deploy.yml                                    # Spitze von main, liefert immer aus
gh workflow run deploy.yml -f sha="$(git rev-parse <commit>)" # genau dieser Commit von main
```

Schlüssel und Umgebungen (zwei SSH-Schlüssel, Secrets nur für `main`):
[CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md). Datenbank-Migrationen
sind NICHT Teil des Auslieferns: Sie laufen von Hand vor dem Merge (Teil B,
Schritt 2) und sind additiv — der Stand davor muss den neuen Aufbau vertragen.

## A3. Schlechter Stand live

Die Reihenfolge ist der Inhalt dieses Abschnitts: **erst zurückstellen, dann
`git revert`, erst danach die Ursache suchen.** Der Weg „Fehler finden,
beheben, pushen“ dauert mindestens eine Viertelstunde und setzt voraus, dass
man den Fehler schon versteht.

### Schritt 1 — Zurückstellen (Minuten, ohne GitHub)

Vom eigenen Rechner, im Repo, über den eigenen SSH-Zugang (`ploi@49.13.211.173`):

```bash
ops/rollback.sh                         # die sechs Apps
ops/rollback.sh <app>                   # die Stände auf dem Server, neuester zuerst; ändert nichts
ops/rollback.sh <app> <commit>          # zeigt, was passieren würde; ändert nichts
ops/rollback.sh <app> <commit> --apply  # stellt um
```

`--apply` legt den Verweis `current` auf den gewählten Stand, lädt den
pm2-Prozess der App neu und fragt die Seite, bis sie dreimal in Folge diesen
Commit UND `ok:true` meldet (dieselbe Probe wie beim Ausliefern). Die
Handgriffe auf dem Server sind seit dem 2026-11-18 dieselben wie beim
Ausliefern (`ops/app-release.sh`, Worte `list` und `activate`); das Skript
reist dabei aus dem eigenen Checkout mit und braucht nichts, was auf dem
Server liegt. Ein Stand,
der nicht oder nur unvollständig auf dem Server liegt, bricht ab, bevor etwas
angefasst wird. Scheitert der Neustart, geht der Verweis von selbst zurück.
Das Skript löscht nichts.

- **Welche App?** Ein Fehler in einem geteilten Layer (`packages/*`) steckt in
  allen Apps, die ihn einbinden. Jede betroffene App einzeln zurückstellen,
  die wichtigste zuerst (`platform` trägt alle Kunden-Communities).
- **Welcher Stand?** In der Regel der zweite in der Liste (der vor dem
  aktiven). Die Liste zeigt zu jedem Commit die erste Zeile der Commit-Nachricht.
- **Läuft gerade ein Ausliefern?** `gh run list --workflow deploy.yml --limit 3`.
  Ein laufender Lauf legt den Verweis wieder nach vorn — abwarten oder
  abbrechen (`gh run cancel <id>`), dann zurückstellen. Stellen beide zur
  selben Zeit um, wartet der zweite auf den ersten (bis zu zehn Minuten, dann
  bricht er ab, ohne etwas zu ändern).
- **Wie lange dauert es?** Gemessen am 2026-11-15 an der Hilfe-Seite: 12
  Sekunden vom Befehl bis zur dritten bestätigten Antwort.

**Alle sechs Apps auf einmal, oder der gute Stand liegt nicht mehr auf dem
Server:** der manuelle Start mit Eingabe (A2). Er baut den älteren Commit
neu und liefert ihn auf alle Apps aus; das dauert so lange wie jedes
Ausliefern und braucht GitHub Actions. `ops/` und die App-Liste kommen dabei
von der Spitze von `main`, nur das Programm vom alten Commit. Nach dem Start
nachsehen, dass der Lauf wirklich läuft (`gh run list --workflow deploy.yml
--limit 3`): GitHub hält je Warteschlange nur EINEN wartenden Lauf. Startet
man, während ein Ausliefern läuft, wartet der eigene Lauf — und der nächste
wartende (ein Push einer anderen Sitzung) verdrängt ihn ohne Meldung
(„cancelled“, am 2026-11-15 so gesehen).

### Schritt 2 — `git revert` auf `main`

```bash
git revert <schlechter-commit>     # bei einem Merge-Commit: git revert -m 1 <merge>
```

als Pull Request (fünf Prüfungen) oder, wenn es eilt, als direkter Push des
Besitzers. **Das ist kein Aufräumen, sondern Teil des Rückwegs:** Solange
`main` den schlechten Commit trägt, liefert der nächste Push ihn wieder aus.
Der Revert selbst wird normal ausgeliefert und bringt alle sechs Apps wieder
auf denselben Stand.

### Schritt 3 — Ursache suchen

Erst jetzt. Die Seite läuft, `main` ist sauber, es eilt nicht mehr.

### Was der Rückweg NICHT kann

- **Er hält nur bis zum nächsten Push auf `main`.** Auch ein reiner
  Doku-Push reicht: Der Job `plan` vergleicht gegen den ältesten Build, den
  eine App meldet — das ist nach dem Zurückstellen der alte Stand, also sieht
  er App-Änderungen und liefert `main` wieder aus. Hier laufen mehrere
  Sitzungen gegen dasselbe `main`; deshalb Schritt 2 sofort.
- **Die Datenbank geht nicht mit zurück.** Ein alter Stand trifft auf den
  heutigen Aufbau der Tabellen; Migrationen haben keinen Rückweg. Solange
  Migrationen additiv sind, verträgt der Stand davor den neuen Aufbau. Hat
  eine Migration etwas entfernt oder umgedeutet, kann der alte Stand
  schlechter laufen als der neue — dann vor dem Zurückstellen die Migration
  lesen. Daten, die der schlechte Stand geschrieben hat, bleiben.
- **Nur was noch auf dem Server liegt.** Jedes Ausliefern stutzt die älteren
  Stände je App; es bleiben die letzten VIER (gezählt am 2026-11-15, der
  aktive eingeschlossen). Bei mehreren Merges am Tag reicht das nur Stunden
  zurück. Für alles davor: der manuelle Start mit Eingabe.
- **Die `.env` wird neu gelesen.** Wer seit dem letzten Neuladen etwas in der
  `.env` der Site geändert hat, macht es mit dem Rückweg wirksam.
- **`ops/` bleibt, wie es zuletzt ausgeliefert wurde.** Das Skript nimmt die
  Ecosystem-Datei, die auf dem Server liegt. Ein Fehler dort (Port, Pfad,
  Prozessname) geht mit einem älteren Stand nicht weg.
- **Kein Fehler außerhalb der App.** Appwrite, Zertifikate, nginx, DNS:
  [PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md), Abschnitt 4. Melden alle Apps
  `ok:false`, ist es fast immer Appwrite und kein schlechter Stand.

### Wenn GitHub selbst ausfällt

| Was ausfällt | Zurück auf einen Stand, der auf dem Server liegt | Etwas Neues ausliefern |
| --- | --- | --- |
| nur GitHub Actions | `ops/rollback.sh`, alle sechs Apps | Auf dem Papier nur für `portfolio` und `platform`: Nur diese zwei Sites haben auf dem Server noch einen Checkout des Repos (Deploy-Knopf im ploi-Panel, der Server baut selbst — nacheinander, nie zwei Builds zugleich, sonst geht dem Server der Speicher aus). Für `control`, `marketing`, `help` und `branding` gibt es diesen Weg nicht. |
| GitHub ganz (auch `git pull`) | `ops/rollback.sh`, alle sechs Apps | Für keine App. Auch der Deploy-Knopf in ploi holt den Code von GitHub. |

Das Skript braucht nur das lokale Repo (für `ops/apps.conf`) und den eigenen
SSH-Zugang. **Der Deploy-Knopf in ploi ist kein geprüfter Weg:** Die zwei
Checkouts stehen auf dem Stand vom 2026-07-26 (nachgesehen am 2026-11-15),
seit der Umstellung auf das Bauen bei GitHub hat ihn niemand gedrückt. Wer
sich im Ernstfall darauf verlässt, übt zum ersten Mal. Verlässlich ohne
GitHub Actions ist heute nur der Weg ZURÜCK.

### Protokoll der Übungen

Ein Rückweg, der nie gegangen wurde, ist keiner. Jede Übung und jeder
Ernstfall bekommt hier eine Zeile.

| Datum (UTC) | Was | Dauer | Ergebnis |
| --- | --- | --- | --- |
| 2026-11-15 02:19 | Übung: `ops/rollback.sh help 1b833864… --apply` — `help.pukalani.app` vom Stand `90b797e1` auf den vorigen `1b833864` | 12 s | dreimal in Folge `1b833864` und `ok:true`; die sieben anderen Hosts unverändert auf `90b797e1` |
| 2026-11-15 02:20 | Übung: wieder vor — `ops/rollback.sh help 90b797e1… --apply` | 12 s | alle acht Hosts auf `90b797e1`, `ok:true`; kein Stand gelöscht |
| 2026-11-15 02:19 | Gegenprobe: ein Commit, der nicht auf dem Server liegt, mit `--apply` | sofort | Abbruch (Exit 3), Verweis und Prozess unverändert |
| 2026-11-15 02:21 | Über GitHub: `gh workflow run deploy.yml -f sha=1b833864…` — der vorige Commit auf alle sechs Apps (erster manueller Start auf dem Weg mit fünf Jobs) | 12 min 22 s | alle acht Hosts auf `1b833864`, `ok:true`; Programm vom alten Commit, `ops/` von der Spitze von `main` |
| 2026-11-15 02:34 | Über GitHub: `gh workflow run deploy.yml` ohne Eingabe — zurück auf die Spitze von `main` | 12 min 44 s | alle acht Hosts auf `90b797e1`, `ok:true`; `help` dabei jede Sekunde gefragt: 674 Antworten, keine ohne 200 und `ok:true` |
| 2026-11-15 02:20 | Gegenproben am manuellen Start: Eingabe `abc123`; ein Commit, der nicht auf `main` liegt | je unter 1 min | beide im Job `plan` rot, nichts gebaut, nichts ausgeliefert |

| 2026-11-18 10:17 | Übung nach dem Umbau des Ausliefer-Wegs (gemeinsames Skript, Schlüssel beschränkt): `ops/rollback.sh platform fd42b8b6… --apply` — `platform.pukalani.app`, `account.` und `demo.` vom Stand `1bc7cb3d` auf den vorigen | 13 s | dreimal in Folge `fd42b8b6`, `ok:true`, `schema: ok`; die fünf anderen Hosts unverändert auf `1bc7cb3d` |
| 2026-11-18 10:17 | Übung: wieder vor — `ops/rollback.sh platform 1bc7cb3d… --apply` | 14 s | alle acht Hosts auf `1bc7cb3d`, `ok:true`; die drei Hosts der App dabei jede Sekunde gefragt: 75 Antworten, keine ohne 200 und `ok:true` |
| 2026-11-18 10:18 | Gegenprobe: ein Commit, der nicht auf dem Server liegt, mit `--apply` | sofort | Abbruch (Exit 3), Verweis und Prozess unverändert |

Bei beiden Übungen unterschieden sich der vorige und der heutige Stand nur
in Betriebs-Dateien und Tests, nicht im Programm der Apps, und zwischen ihnen
lag keine Datenbank-Änderung. Seit dem 2026-11-18 ist der Rückweg an einer
App mit Datenbank geübt (`platform`, im laufenden Betrieb). Nicht geübt ist
ein Rückweg über eine Datenbank-Änderung hinweg.

## A4. Node: eine Version an drei Orten

Die Node-Version steht als EXAKTE Zahl in [`.nvmrc`](../../.nvmrc). Sie gilt
lokal (`nvm use`), in jedem GitHub-Lauf (`node-version-file`) und auf dem
App-Server. Gebaut wird in der CI, betrieben auf dem Server: nur mit
derselben Version beweisen die Prüfungen das, was live läuft. Bis zum
2026-11-18 stand in `.nvmrc` nur die Linie `22`, der Server lief auf 24, und
die CI nahm, was der Runner gerade vorrätig hatte.

Auf dem App-Server kommt Node aus dem Paket `nodejs` (Paketquelle NodeSource,
Linie 24). **Von selbst wird es dort nicht gehoben** (nachgesehen 2026-11-18).
pm2 startet jede App mit `/usr/bin/node`.

**Ein neuer Patch-Stand — in dieser Reihenfolge:**

1. `.nvmrc` heben, als Pull Request. Alle Prüfungen und der Bau fahren damit
   schon die neue Version. Lokal holt `nvm install` im Repo-Ordner sie.
2. Auf dem Server das Paket auf GENAU diese Version heben. Das braucht
   `sudo` (der Zugang `ploi` hat es nicht ohne Passwort):

   ```bash
   sudo apt-get update
   sudo apt-get install nodejs=<Version aus .nvmrc>-1nodesource1
   ```

   Der Knopf „Run updates now" in Ploi (Server → Verwalte → Updates) hebt
   das Paket auch, aber zusammen mit ALLEN wartenden Paketen und auf den
   neuesten Stand der Linie statt auf eine genannte Zahl. Der Auftrag kam am
   2026-11-19 erst 28 Minuten nach dem Klick auf dem Server an.
3. Als `ploi` den pm2-Dienst mit der neuen Version neu starten, NICHT
   während eines Ausliefer-Laufs:

   ```bash
   pm2 update
   ```

   Das startet ALLE Apps neu (gemessen 2026-11-19: rund zwei Sekunden, alle
   sechs kamen aus dem gespeicherten Stand zurück). Eine App, die nach
   Schritt 2 neu geladen wird — jedes Ausliefern tut das —, läuft schon mit
   dem neuen Programm. Der pm2-Dienst selbst läuft bis zu `pm2 update` aus
   der alten, ersetzten Datei weiter, und im Cluster-Modus nimmt er die
   Verbindungen an. `pm2 jlist` zeigt ihn nicht, der Wächter unten sieht ihn
   deshalb auch nicht: `readlink /proc/$(cat ~/.pm2/pm2.pid)/exe` endet auf `(deleted)`, solange
   er noch aus der alten Datei läuft.
4. Beweis: `pm2 jlist` nennt je Prozess die Node-Version (`node_version`) —
   sie ist die aus `.nvmrc`; danach `node scripts/ops/verify-health.mjs`.
   Vom eigenen Rechner fragt beides in einem Zug
   `node scripts/ops/verify-node-version.mjs` (Programm und jeder Prozess
   gegen `.nvmrc`).
5. Der AI-Runner auf dem Rechner zieht mit. Er liest `.nvmrc` NICHT: seine
   Start-Datei (LaunchAgent) und `claudeBin` in seiner Config nennen den
   Node-Pfad fest, und der Ordner von `claudeBin` bestimmt auch das Node der
   Testbefehle eines Laufs. Beide Zeilen heben, mit `--dry-config` prüfen,
   dann den Dienst mit `launchctl bootout` und `launchctl bootstrap` neu
   laden — `kickstart -k` liest die Start-Datei nicht neu
   ([AI-RUNNER-BETRIEB.md](AI-RUNNER-BETRIEB.md), Abschnitt 4).

**Protokoll.** 2026-11-19: erstes Heben nach diesem Weg, 24.22.1 → 24.22.3
(Paket über Ploi, `pm2 update` 17:57 UTC, danach jeder Prozess auf 24.22.3
und alle Hosts `ok`; der Runner am selben Tag).

Ein Sprung auf eine neue LINIE (24 → 26) ist dasselbe mit einem Schritt
davor: die Paketquelle auf dem Server zeigt auf eine Linie
(`/etc/apt/sources.list.d/nodesource.sources`), und `@types/node` im Katalog
zieht mit (die Typen folgen der Laufzeit, nie darüber).

**Der Wächter (seit 2026-11-19).** Täglich vergleicht der Produktions-Wächter
die Version des Servers mit `.nvmrc` (`scripts/ops/verify-node-version.mjs`,
Schritt „Läuft auf dem App-Server das Node aus .nvmrc?"). Er fragt das
Wächter-Tor nach dem Wort `node-version`: die Version des Programms
`/usr/bin/node` und je pm2-Prozess die Version, mit der er gerade läuft. Rot
ist jede ANDERE Version, auch eine neuere — am Programm (Schritt 2 fehlt)
oder an einem Prozess (Schritt 3 fehlt: das Paket ist gehoben, der pm2-Dienst
läuft noch mit dem alten Stand). Zwei Dinge folgen daraus:

- Zwischen dem Merge von Schritt 1 und Schritt 3 ist der Blick zu Recht rot.
  Wer beides am selben Tag vor 04:17 UTC erledigt, sieht keinen Alarm.
- Hebt jemand das Paket auf dem Server, ohne `.nvmrc` zu ändern (ein
  `apt upgrade`, „Run updates now" in Ploi), wird der Blick ebenfalls rot.
  Dann entweder das Paket auf die Version aus `.nvmrc` zurücksetzen (Schritt
  2 mit dieser Zahl) oder `.nvmrc` per Pull Request nachziehen.

Nicht erreichbar ist keine Aussage und bleibt grün (eine Warnzeile im Lauf).
Probealarm: `gh workflow run production-watch.yml -f node_drill=true`.

## A5. Server neu starten (app-prod)

Nötig, wenn ein Paket-Update einen neuen Kernel gebracht hat: Ploi zeigt dann
unter „Insights" den Hinweis „reboot this server to load the new kernel", und
auf dem Server liegt `/var/run/reboot-required`. Der Abschnitt gilt NUR für
den App-Server. Auf dem Appwrite-Server kommen einige Container nach einem
Neustart nicht von selbst zurück
([PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md), § 4).

**Was von selbst wiederkommt** (nachgesehen und am 2026-11-20 gemessen):

- nginx, Redis, cron, die Firewall und fail2ban starten über systemd
  (`systemctl is-enabled` sagt bei allen `enabled`; der SSH-Zugang hängt an
  `ssh.socket`, nicht an `ssh.service`).
- Die sechs Apps startet der crontab von `ploi`:
  `@reboot sleep 10 && /usr/bin/pm2 resurrect`. Einen pm2-Systemdienst gibt
  es nicht. `pm2 resurrect` liest den gespeicherten Stand `~/.pm2/dump.pm2`;
  den schreibt jedes Ausliefern neu (`pm2 save`).
- Der gespeicherte Stand nennt je App den Verweis `…/releases/<app>/current`
  und das Programm `/usr/bin/node`, dazu die UMGEBUNG vom letzten Neuladen.
  Ein Neustart des Servers liest die `.env`-Dateien also NICHT neu — die Apps
  kommen mit denselben Einstellungen zurück, mit denen sie vorher liefen.
- cron kennt nur den knappen Suchpfad `/usr/bin:/bin`. Das trägt, weil `pm2`
  und `node` beide unter `/usr/bin` liegen (Paket `nodejs`, A4). Zieht Node
  einmal an einen anderen Ort, braucht die Zeile im crontab den Pfad.

**Vorher prüfen** (als `ploi`, alles nur lesend):

```bash
cat /var/run/reboot-required; uname -r; readlink /boot/vmlinuz   # wartet ein Neustart, und auf welchen Kernel?
crontab -l | grep resurrect                                      # die Zeile steht da
env -i PATH=/usr/bin:/bin sh -c 'command -v pm2; node -v'        # cron fände pm2 und das richtige Node
ls -l ~/.pm2/dump.pm2; pm2 ls                                    # Stand jünger als der letzte Prozess-Start, alle sechs online
systemctl is-enabled nginx redis-server cron ssh.socket ufw
```

Dazu von außen: alle Hosts `ok` (`node scripts/ops/verify-health.mjs`), kein
offenes Issue `produktions-alarm`, kein laufender Ausliefer-Lauf und kein
Lauf auf `main`, aus dem gleich einer wird (`gh run list`). Ein Neustart
bricht jede lange Arbeit ab, die gerade im Hintergrund einer App rechnet
(Marktvergleich, Entwürfe, Radar) — ein Zeitpunkt ohne Betrieb ist besser.
Der Halbstunden-Wächter sollte gerade durch sein.

**Auslösen:** Ploi → Server `app-prod` → „Verwalte" → Knopf „Restart server"
→ Rückfrage bestätigen. GENAU EINMAL: Plois Aufträge können in einer
Warteschlange liegen. Der Ploi-MCP hat dafür keinen Befehl, und `sudo reboot`
verlangt ein Passwort.

**Nachher belegen:**

```bash
uptime -s; uname -r; ls /var/run/reboot-required   # frisch, neuer Kernel, die Datei ist weg
pm2 ls                                             # sechs Prozesse online, 0 Neustarts
```

Dann von außen: jeder Host `ok` mit demselben Build und Datenbank-Stand wie
vorher, und einmal `gh workflow run production-watch.yml` (dort laufen alle
Blicke, auch die Node-Version und die Live-Verbindung). Plois Hinweis
verschwindet von selbst.

**Kommen die Apps nicht von selbst** (nginx antwortet dann mit 502):

```bash
pm2 resurrect          # der Handgriff, den cron hätte machen sollen
pm2 ls
```

Ist der gespeicherte Stand leer oder beschädigt, startet jede App aus ihrer
Ecosystem-Datei (das liest auch die `.env` neu), danach sichern:

```bash
for s in portfolio.pukalani.app:portfolio admin.pukalani.app:control platform.pukalani.app:platform pukalani.app:marketing help.pukalani.app:help branding.supply:branding; do
  pm2 startOrReload /home/ploi/${s%%:*}/ops/ecosystem-${s##*:}.config.cjs --update-env; done; pm2 save
```

**Protokoll.** 2026-11-20, Kernel 6.8.0-147 → 6.8.0-151 (das Paket-Update
lief am 2026-11-19). Zeiten in UTC, von außen alle zwei Sekunden gemessen:

| Zeit | Was |
| --- | --- |
| 00:19:43 | Klick bestätigt; Ploi führte den Auftrag sofort aus |
| 00:19:44 | erste Anfrage ohne Antwort |
| 00:19:52 | der Server ist wieder hochgefahren (`uptime -s`) |
| 00:20:10 | nginx antwortet wieder, die Apps noch nicht (502) |
| 00:20:20 | cron startet den pm2-Dienst; eine Sekunde später sind alle sechs Apps `online` |
| 00:20:23 | erste gesunde Antwort — **39 Sekunden Ausfall** |

Nichts musste von Hand gestartet werden. Alle acht Hosts meldeten danach
denselben Build und denselben Datenbank-Stand wie vorher, jeder Prozess lief
auf dem Node aus `.nvmrc`. Eine einzelne Anfrage an eine App lief 25 Sekunden
nach dem Start noch einmal in die Zeitgrenze der Messung (4 Sekunden), danach
keine mehr. Der Neustart davor (2026-10-24) lief genauso: pm2 kam 22
Sekunden nach dem Hochfahren.

---

# Teil B — Eine neue Silo-Site aufsetzen (Rezept, Juli 2026)

> Die Schritte unten sind das Anlege-Rezept aus der Zeit, als `comments` die
> erste Site war. Namen, Ports und Projekt-Ids in den Beispielen sind die von
> damals; die Site `comments.pukalani.app` (Port 3001, Prozess
> `commentspukalaniapp`) ist seit dem 2026-08-18 gelöscht. Das Muster gilt
> weiter: pm2 im Cluster-Modus über `ops/ecosystem-<app>.config.cjs`, corepack
> pnpm, HSTS als eigene Include-Datei `/etc/nginx/ploi/<site>/server/hsts.conf`.
> Eine neue App kommt zusätzlich in `ops/apps.conf`.
>
> **RAM-Regel, nur wenn der Server selbst baut (Notweg aus A3):** 2 Kerne,
> 3,7 GB RAM. Ein Nuxt-Build braucht rund 3,4 GB — nie zwei Builds parallel
> (beobachteter Abbruch mit Exit 137); `platform` braucht
> `--max-old-space-size=3584`.
>
> **Architektur:** Nuxt 4 (SSR) → Nitro Node-Server, Einstieg
> `.output/server/index.mjs`. Backend = eigene self-hosted Appwrite-Instanz.

---

## 0. Vorab sammeln (deine Checkliste)

Bevor wir starten, brauchst du:

- [ ] **Server** (Hetzner o.ä.), von ploi.io verwaltbar (SSH-Zugang an ploi.io)
- [ ] **ploi.io-Account** mit dem Server verbunden
- [ ] **Domain** + die Möglichkeit, DNS zu setzen. **Wichtig (A3):** App und
      Appwrite müssen auf **derselben Root-Domain** liegen, z.B.
      App `comments.example.com`, Appwrite `api.example.com` → Cookie-Domain
      `.example.com`. Sonst läuft das authentifizierte Realtime nicht.
- [ ] **Prod-Appwrite** (self-hosted, ≥1.9.0) auf dem Server (Docker) erreichbar
      unter der Appwrite-Subdomain mit TLS
- [ ] **SMTP-Zugang** für Appwrite (Verifizierungs-/Recovery-/OTP-Mails) —
      z.B. ein Transaktions-Mail-Anbieter

Sag mir, sobald das steht — dann gehen wir die Schritte gemeinsam durch.

---

## 1. Prod-Appwrite einrichten (Console)

1. **Projekt** anlegen → Project ID notieren.
2. **Database** anlegen → Database ID notieren.
3. **Platforms / Domains** (CORS + OAuth + Cookie): die App-Domain UND die
   Appwrite-Domain als Web-Platform registrieren. Bei self-hosted 1.9.0:
   *Multiple Application Domains* nutzen.
4. **Zwei API-Keys** (Konzept A2; Scope-Liste 2026-07-18 präzisiert):
   - **Runtime-Key** (`nuxt-ssr-prod`): `sessions.write`, `users.read`,
     `users.write`, `rows.read`, `rows.write`, `health.read` **plus**
     `files.read`, `files.write` (Avatar-Upload + GDPR-Snapshot laufen über
     den Admin-Client) und `presences.read`, `presences.write`
     (Presence-Heartbeat/Reader) — 10 Scopes.
   - **Migrations-Key** (`migrations-prod`): `databases.*`, `tables.*`,
     `columns.*`, `indexes.*` **plus** `buckets.*` (der Bootstrap legt die
     Buckets an) **plus** `rows.read`, `rows.write` (Migrationen seeden
     Default-Rows und machen Row-Backfills — Prod-Learning 2026-07-19) —
     12 Scopes. **Nur für den Migrationslauf** — kommt NIE auf den
     App-Server.
5. **SMTP** in der Appwrite-Installation (`.env` der Instanz, nicht in der
   Console) konfigurieren, sonst keine Auth-Mails.
   **Kein SMTP-Patch mehr ab Appwrite 2.7 (AW28, 2026-11-08).** Von 1.9.5
   bis 2.7.1 mountete `docker-compose.override.yml` eine gepatchte
   `registers.php` (`keepAlive: false`) in den Worker, weil der alte Adapter
   die ERSTE Mail nach Leerlauf still verlor (PHPMailer-`false` verschluckt,
   Worker loggte „success"). 2.7 hat einen neuen Adapter mit NOOP-Ping vor
   Wiederverwendung und einmaligem Retry auf frischer Verbindung (#14213).
   Neue Instanzen bekommen den Patch NICHT. Beweis mit Gegenprobe und
   Prod-Skript: APPWRITE-2-7-UPGRADE.md, Abschnitt „AW28"; Geschichte:
   PHASE-17-PRODUCTION.md Block 7.
6. **TLS** für die Appwrite-Subdomain (ploi.io/Caddy/Traefik) — Cookie braucht `secure`.

## 2. Migrationen gegen Prod laufen lassen

Migrationen laufen **von einer vertrauenswürdigen Maschine** (lokal/CI) gegen den
Prod-Endpoint — mit dem **Migrations-Key**, nicht vom App-Server aus.

```bash
# Prod-Werte in eine separate Datei (NICHT committen; .gitignore deckt .env*):
cp apps/comments/.env.example apps/comments/.env.production
#   → NUXT_PUBLIC_APPWRITE_ENDPOINT = https://api.pukalani.app/v1
#   → NUXT_PUBLIC_APPWRITE_PROJECT_ID = comments · _DATABASE_ID = main
#   → NUXT_APPWRITE_MIGRATIONS_KEY = Prod-Migrations-Key

# EIN Befehl: Datenbank + Buckets + alle Migrationen
# (system→comments→moderation→admin), idempotent (409→skip).
nvm use   # liest .nvmrc
node --env-file=apps/comments/.env.production \
  scripts/bootstrap.mjs --app comments      # OHNE --seed (Prod!)
```

> Tabellen-Owner: **system** (audit_logs, app_config, notifications) ·
> **comments** (comments, comment_votes) · **moderation** (reports) ·
> **admin** (changelog). `core`/`themes` haben keine Tables. Der Bootstrap
> legt auch den `avatars`-Bucket an (daher braucht der Migrations-Key
> `buckets.*`).

**Bootstrap-Admin:** der erste Owner braucht das `admin`-Label. In der Appwrite
Console beim eigenen User unter *Labels* `admin` setzen (Self-Lockout-Schutz greift
danach).

### 2b. Wellen-Migrationen (H3-4.2 — Multi-Tenant-Schema-Rollouts)

Sobald FREMDE Silo-Projekte existieren, rollen Schema-Änderungen in **drei
Wellen** aus; der **Pool migriert immer genau einmal** (ein geteiltes Projekt,
`pnpm migrate --app platform --env <pool-migrations.env> --prod`). Die Welle eines Tenants
steht im tenants-Register (`wave`: internal → canary → stable, Control-UI
„Update-Welle", nur für Silos wirksam; Bestand = stable).

```bash
# VORHER: Verzeichnis der Silo-Communities + ihrer Schlüsseldateien (read-only,
# druckt NIE einen Schlüsselwert). Exit 1 = der Wellen-Lauf würde abbrechen.
node --experimental-strip-types --env-file="$HOME/.appwrite-secrets/migrations/control.env" \
  packages/control/scripts/list-silo-keys.ts        # [--wave <welle>] [--keys-dir <ordner>]

# Silo-Projekte einer Welle migrieren (Reihenfolge: internal → canary → stable)
# (erst ansehen: `--dry-run` statt `--prod` — zeigt Projekte und Dateien, schreibt nichts)
pnpm migrate --wave internal --control-env ~/.appwrite-secrets/migrations/control.env --prod
pnpm migrate --wave canary   --control-env ~/.appwrite-secrets/migrations/control.env --prod
pnpm migrate --wave stable   --control-env ~/.appwrite-secrets/migrations/control.env --prod
```

- **Ziel-Prüfung (seit 2026-11-16, GA1 P21):** jede Datei `<projectId>.env`
  muss GENAU auf ihr Projekt zeigen, und ein Endpunkt, der nicht lokal ist,
  braucht `--prod`. Stimmt eine Datei nicht, bricht der Lauf ab, bevor
  irgendein Projekt migriert wird.

- `--control-env` = Env der **Control-Plane-Instanz** (`control`) — daraus
  kommen die Silo-Projekte der Welle. Nie raten, immer explizit. Der Pfad ist
  seit dem Cutover `~/.appwrite-secrets/migrations/control.env`. Lokal steht
  dieselbe Instanz in `apps/control/.env`. (Bis zum 2026-08-03 lag daneben ein
  `apps/control/.env.production`, das noch auf das gelöschte Projekt `studio`
  zeigte — es ist gelöscht; taucht es wieder auf, ist es falsch.)
- Je Silo-Projekt braucht der Runner eine Migrations-Env-Datei
  `~/.appwrite-secrets/migrations/<projectId>.env` (Format wie jede App-.env:
  `NUXT_PUBLIC_APPWRITE_*` + `NUXT_APPWRITE_MIGRATIONS_KEY`; `--keys-dir`
  überschreibt den Ordner). Fehlt eine, bricht der Lauf ab, BEVOR irgendein
  Projekt migriert wird (keine halbe Welle).
- **Disziplin:** Migrationen sind ADDITIV (Code n-1 verträgt Schema n) —
  erst die Spalte überall, dann der Code-Deploy, Aufräumen später. Beispiel
  2026-07-23: `tenants.wave` (control-012) lief auf Prod, BEVOR der Code
  deployt wurde, der das Feld schreibt.
- disabled-Tenants migrieren mit (ein reaktivierter Host braucht aktuelles
  Schema); mehrere Hosts pro Projekt werden dedupliziert.

## 3. ploi.io-Site konfigurieren (so läuft es in Prod)

| Feld | Wert (pukalani-Ist-Stand) |
|---|---|
| Site-Typ | NodeJS — ploi vergibt den Port (hier **3001**); nginx-vHost proxied NICHT automatisch → `location /` manuell auf `proxy_pass http://127.0.0.1:3001` + WebSocket-Header umstellen. **Robuster Weg (Learning 2026-07-23): die ploi-API statt des Panel-Editors** — `GET/PATCH /api/servers/{srv}/sites/{site}/nginx-configuration` (JSON `{"content": …}`) + `POST /api/servers/{srv}/services/nginx/restart`; der Monaco-Editor im Panel lässt sich nicht zuverlässig automatisiert befüllen. Auch Deploy-Script (`…/deploy/script`) und Deploy-Trigger (`POST …/deploy`) gehen per API |
| NodeJS-Service | pm2 **Cluster-Mode** via [`ops/ecosystem-platform.config.cjs`](../../ops/ecosystem-platform.config.cjs) (je App eine gleichnamige Config; das comments-Exemplar fiel mit F3, das Muster ist unverändert; seit 2026-07-19, Zero-Downtime Stufe 2). „Restart process after deployment" **AUS** — den Prozesswechsel macht `pm2 reload` im Deploy-Script. ploi-Start-command `bash start-prod.sh` ist nur noch historischer Rest (ploi startet nichts mehr) |
| Deploy-Script | `git pull` → corepack-Install/Build wie gehabt → **dann Release-Flow**: `.output` nach `/home/ploi/releases/comments/<sha>/` kopieren, `current`-Symlink atomar flippen (`ln -s` + `mv -Tf`), `pm2 startOrReload ops/ecosystem-comments.config.cjs --update-env`, `pm2 save`, alte Releases auf 5 stutzen. Der alte Worker serviert bis der neue `listening` ist → **kein 502**, und der laufende Prozess liest nie aus einem halb überschriebenen `.output` |
| Reboot-Festigkeit | `pm2 save` macht das Deploy-Script; `@reboot sleep 10 && /usr/bin/pm2 resurrect` im ploi-Crontab (kein sudo nötig) — geprüft und gemessen in Abschnitt A5 |
| HSTS | eigene Include-Datei `server/hsts.conf` mit `add_header Strict-Transport-Security "max-age=15768000" always;` |

**Runtime-Env** liegt in `/home/ploi/<site>/.env` (chmod 600) und wird von
`ops/ecosystem-platform.config.cjs` beim `pm2 startOrReload … --update-env`
geparst und in die Prozess-Umgebung gehoben — Nitro liest zur Laufzeit keine
.env-Datei:
```
NUXT_APPWRITE_KEY=<Runtime-Key>                     # server-only
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.pukalani.app/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=comments
NUXT_PUBLIC_APPWRITE_DATABASE_ID=main
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars
NUXT_PUBLIC_APP_URL=https://comments.pukalani.app
NUXT_PUBLIC_I18N_BASE_URL=https://comments.pukalani.app
NUXT_SMTP_HOST=smtp.resend.com                      # + PORT/USER/PASS/FROM
NUXT_REDIS_URL=redis://127.0.0.1:6379               # geteilter Rate-Limit-Store
NUXT_TURNSTILE_SECRET=<Cloudflare-Turnstile-Secret> # server-only, Bot-Beweis an signup/otp/recovery
NUXT_PUBLIC_TURNSTILE_SITE_KEY=<Turnstile-Site-Key> # IMMER zusammen mit dem Secret setzen
```
> **Turnstile (seit 2026-10-27, Vorfall „Resend-Spam über die Registrierung"):**
> beide Variablen gesetzt = Registrierung, Code-Login und Passwort-Zurücksetzen
> verlangen einen Cloudflare-Turnstile-Token, den der Server bei Cloudflare
> prüft (fail-closed: ist Cloudflare nicht erreichbar, antwortet die Route 503
> und das Formular sagt „gerade nicht möglich"). Beide leer = aus, exakt das
> Verhalten von vorher (Dev, CI, E2E). NUR EINE gesetzt = Fehlkonfiguration,
> der Server schreibt sie beim Start ins Log (`auth.turnstile_misconfigured`);
> ein Secret ohne Site-Key sperrt alle Gäste aus, ein Site-Key ohne Secret zeigt
> ein nutzloses Widget. Das Widget EXISTIERT seit 2026-10-27: „Pukalani Apps"
> im Cloudflare-Konto Hawaii Studio (Turnstile → Widgets), Hostnames
> `pukalani.app` + `branding.supply` (Subdomains sind automatisch gedeckt),
> Modus „Managed"; EIN Schlüsselpaar für alle Pukalani-Sites, gesetzt auf
> platform, admin, portfolio, branding — und dort PFLICHT im Wächter
> `verify-site-env.mjs`. Nach dem Eintragen reicht `pm2 startOrReload
> … --update-env` (kein Build nötig, auch der `NUXT_PUBLIC_`-Site-Key kommt
> zur Laufzeit aus der Env). Neue Site mit Konten ⇒ beide Variablen mitgeben;
> neue Root-Domain ⇒ als Hostname am Widget nachtragen.
> **NEU LADEN NICHT VERGESSEN:** Nitro liest zur Laufzeit keine `.env`, die
> Ecosystem-Config hebt sie nur beim `pm2 startOrReload … --update-env` in
> den Prozess — und ein Deploy ohne App-Änderung überspringt. Nach dem
> Eintragen (ploi-Panel oder direkt in der Site-`.env`) also einmal auf app-prod:
> ```bash
> for s in platform.pukalani.app:platform admin.pukalani.app:control portfolio.pukalani.app:portfolio branding.supply:branding; do
>   pm2 startOrReload /home/ploi/${s%%:*}/ops/ecosystem-${s##*:}.config.cjs --update-env; done; pm2 save
> ```
> **Beweis:** `pnpm ops:turnstile` (scripts/ops/verify-turnstile.mjs) fragt
> jede der vier Sites: `POST /api/auth/recovery` ohne Token ⇒ 403
> `bot_check_required` (Server prüft) UND `/forgot-password` trägt
> `data-turnstile` (Site-Key kam an) — recovery statt signup, weil die Route
> für eine unbekannte Adresse im AUS-Fall weder Konto noch Mail erzeugt.
> Dazu im pm2-Log der Site KEIN `auth.turnstile_misconfigured_at_boot`, und
> eine echte Registrierung im Browser (die meisten sehen das Widget gar
> nicht, `interaction-only`).
> **Rate-Limit-Store (seit 2026-07-23):** mit `NUXT_REDIS_URL` zählen alle
> Instanzen/Cluster-Worker einer App ihre Rate-Limits GETEILT in Redis
> (läuft auf app-prod lokal auf 6379, bei der Server-Einrichtung
> mitinstalliert); Keys sind pro Appwrite-Projekt gescoped (`rl:<projekt>:…`),
> mehrere Sites teilen also gefahrlos EINE Redis-Instanz. Leer = In-Memory
> pro Instanz (Dev). Fail-open: stirbt Redis, drosselt der In-Memory-Fallback
> weiter (lautes Log) — nie 500er wegen Redis. Ohne Redis zählt jeder PROZESS
> für sich: das trägt, solange pm2 je App `instances: 1` fährt
> (`ops/ecosystem-*.config.cjs`). Wer `instances` erhöht, braucht
> `NUXT_REDIS_URL`, sonst gilt jeder Deckel je Worker — auch die Konto-Pause
> nach Fehlversuchen (SEC-003, `.claude/rules/appwrite.md` „Bremsen").
> **NICHT** auf den Server: `NUXT_APPWRITE_MIGRATIONS_KEY`. Der gehört nur zum
> Migrationslauf (Schritt 2). Nach Env-Änderungen: `pm2 startOrReload
> /home/ploi/<site>/ops/ecosystem-<app>.config.cjs
> --update-env` (Site und App aus `ops/apps.conf`; das Beispiel von damals
> nannte die gelöschte Site `comments`) (downtime-frei; ein `pm2 restart` ginge auch, reißt aber
> eine Lücke).

## 4. Deploy auslösen

Steht in Teil A: Ausliefern in A2, der Rückweg in A3. (Bis 2026-11-15 stand
hier der Weg über die ploi-Webhooks vom Juli und ein Satz zum Rückweg, der
einen gelöschten Prozess nannte.) Für die Probe gilt bei `platform`:
`/api/health` ist bei aktiver Mandanten-Trennung bewusst von der
Tenant-Pflicht ausgenommen, sonst könnte das Ausliefern den Site-Host nicht
fragen.

## 5. Verifikation nach dem Deploy

- [ ] `GET https://<app-domain>/api/health` → ok
- [ ] Registrierung + Login (Session-Cookie `a_session_<PROJECT_ID>`, httpOnly+secure)
- [ ] **E-Mail-Verifizierung** (seit 2026-07-19, `pukalani.auth.verification`):
      Signup verschickt die Bestätigungs-Mail (Instanz-SMTP), Banner erscheint
      eingeloggt, `/verify`-Link bestätigt. Mails an Notifications
      (instant/digest) gehen NUR an verifizierte Adressen.
- [ ] Kommentar erstellen / voten / antworten
- [ ] **Realtime:** zweiter Browser sieht neuen Kommentar live (bestätigt die
      Same-Root-Domain-Cookie-Konfiguration aus A3)
- [ ] Melden → Moderations-Queue im Dashboard (als `admin`/`moderator`)
- [ ] Reply-Notification verlinkt auf die richtige Seite (`targetUrl`)
- [ ] Öffentliche `/changelog`-Seite rendert
- [ ] Browser-Bundle enthält **keine** Secrets (DevTools → Sources nach `NUXT_APPWRITE_KEY` suchen → nichts)

---

## Env-Var-Referenz

| Variable | Ort | Geheim? | Zweck |
|---|---|---|---|
| `NUXT_APPWRITE_KEY` | App-Server (ploi.io) | **ja** | Runtime-Key (SSR/Auth/CRUD) |
| `NUXT_APPWRITE_MIGRATIONS_KEY` | nur Migrationslauf | **ja** | Schema-Migrationen — **nie** auf den App-Server |
| `NUXT_PUBLIC_APPWRITE_ENDPOINT` | App-Server + Build | nein | Appwrite-URL |
| `NUXT_PUBLIC_APPWRITE_PROJECT_ID` | App-Server + Build | nein | Projekt |
| `NUXT_PUBLIC_APPWRITE_DATABASE_ID` | App-Server + Build | nein | Datenbank |
| `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET` | App-Server + Build | nein | Profilfoto-Bucket |
| `NUXT_PUBLIC_APP_URL` | App-Server + Build | nein | öffentliche App-URL |

`NUXT_PUBLIC_*` landen bewusst im Client-Bundle. Alles ohne `PUBLIC_` bleibt server-seitig.
