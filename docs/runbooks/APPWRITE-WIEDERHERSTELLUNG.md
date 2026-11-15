# Runbook: Appwrite aus dem Backup wiederherstellen

**Wann.** Der Appwrite-Server (`appwrite-prod`, dahinter `api.pukalani.app`) ist
weg oder seine Daten sind unbrauchbar. Dann hängt jede App: Anmeldung, Inhalte,
Dateien. Dieses Runbook bringt aus dem, was auf der Storage Box liegt, und EINEM
getrennt verwahrten Schlüssel eine lauffähige Instanz zurück.

**Für wen.** Geschrieben für jemanden, der den Server nie gesehen hat. Jeder
Schritt nennt, woher etwas kommt und woran man erkennt, dass er gelungen ist.

> **Regel.** Ein Backup, aus dem noch nie wiederhergestellt wurde, ist eine
> Hoffnung. Die Übung unten wird wiederholt: einmal im Jahr und nach jeder
> Änderung an `ops/appwrite-backup.sh`, `ops/appwrite-restore.sh` oder
> `ops/appwrite-volumes.conf`.

---

## 1 · Kurzfassung für den Ernstfall

1. Neuen Server mieten (Hetzner, Ubuntu 24.04), Docker installieren (§ 4.1).
2. Den jüngsten Lauf von der Storage Box holen (§ 4.2).
3. Den privaten Schlüssel aus dem Passwort-Manager in eine Datei legen (§ 4.3).
4. `ops/appwrite-restore.sh` erst ohne, dann mit `--apply` laufen lassen (§ 4.4).
5. Die Adresse `api.pukalani.app` auf den neuen Server zeigen lassen (§ 4.5).
6. Proben (§ 4.6), danach das Backup auf dem neuen Server wieder einrichten (§ 6).

Dauer: siehe das Protokoll der Übungen (§ 8).

## 2 · Was im Backup liegt — und was nicht

Jede Nacht um 03:30 UTC legt `ops/appwrite-backup.sh` einen Ordner an,
`runs/<JJJJ-MM-TT-HHMMSS>/`, erst auf dem Server, dann auf der Storage Box:

| Datei | Inhalt |
| --- | --- |
| `db.sql.gz.gpg` | Dump aller eigenen Datenbanken in einer Transaktion (heute: `appwrite`) |
| `volume-<name>.tar.gz.gpg` | je ein Archiv der Volumes aus der Tabelle unten |
| `config.tar.gz.gpg` | `.env`, `docker-compose.yml`, `docker-compose.override.yml`, `patches/`, die zwei ClickHouse-Dateien |
| `counts.tsv.gpg` | Zeilen je Tabelle, gezählt direkt vor dem Dump (der Maßstab beim Zurückspielen) |
| `backup.meta` | Kenndaten im Klartext: Zeitpunkt, Appwrite-Version, Zahl der Tabellen und Zeilen, Größen |
| `SHA256SUMS` | Prüfsummen aller Dateien des Ordners |

**Warum die `.env` dazugehört.** In ihr steht `_APP_OPENSSL_KEY_V1`. Mit diesem
Schlüssel verschlüsselt Appwrite einzelne Spalten (API-Schlüssel der Projekte,
Geheimnisse der Zwei-Faktor-Anmeldung) und die Dateien verschlüsselter Buckets.
Ein Dump ohne diese Zeile lässt sich einspielen, aber an genau diesen Stellen
nicht lesen — jede App verlöre ihren Zugang, jede verschlüsselte Datei wäre
Datenmüll. Die `.env` verlässt den Server deshalb nur verschlüsselt.

**Welche Volumes.** Die Liste steht an EINER Stelle, `ops/appwrite-volumes.conf`;
Backup, Wiederherstellung und Spiegel lesen dieselbe Datei.

| Volume | im Backup | Grund |
| --- | --- | --- |
| `appwrite-uploads` | ja | hochgeladene Dateien aller Buckets — nicht neu erzeugbar |
| `appwrite-functions`, `appwrite-sites` | ja | Code von Functions und Sites |
| `appwrite-builds` | ja | fertige Builds; ohne sie müsste nach dem Zurückspielen alles neu gebaut werden |
| `appwrite-certificates`, `appwrite-config` | ja | Zertifikat von `api.pukalani.app` samt Let's-Encrypt-Konto: der neue Server antwortet sofort per https |
| `appwrite-mariadb` | nein | die Datenbank kommt als Dump (in sich stimmig); das Volume einer laufenden Datenbank abzuziehen wäre es nicht |
| `appwrite-redis`, `appwrite-cache`, `appwrite-imports` | nein | Zwischenspeicher und Warteschlangen, entstehen neu |
| `appwrite-clickhouse` | nein | Nutzungs-Statistik für die Konsole; nach einer Wiederherstellung beginnen die Kurven neu |

Der echte Name eines Volumes kommt aus `docker compose config`, nie aus einer
geratenen Vorsilbe (`appwrite-builds` heißt auch als Volume so; daneben liegt auf
dem Server ein alter Rest `appwrite_appwrite-builds`). Nennt die Compose-Datei
ein Volume, das die Liste nicht kennt, bricht das Backup ab, bis jemand dort
`ja` oder `nein` eingetragen hat.

**Was NICHT im Backup liegt.**

- Die Nutzungs-Statistik (ClickHouse) und alles Flüchtige (Redis, Vorschaubilder).
- Die `.env`-Dateien der Apps auf dem App-Server. Sie tragen eigene Schlüssel
  der Apps, auch die, mit denen einzelne Einstellungen in der Datenbank
  versiegelt sind. Fällt nur der Appwrite-Server aus, sind sie nicht betroffen;
  fällt der App-Server aus, hilft dieses Backup dabei nicht.
- Alles, was nach 03:30 UTC geschah. Im schlimmsten Fall fehlt ein Tag.

**Verschlüsselung.** `gpg` mit einem öffentlichen Schlüssel
(`ops/appwrite-backup.pub.asc`, Fingerabdruck
`3724B4F1FE604CFD036F3F0D099D7563EA924920`). Der Server kann verschlüsseln, aber
seine eigenen Backups nicht lesen; auf der Storage Box liegt nichts im Klartext
außer `backup.meta` und `SHA256SUMS`. Die Verschlüsselung schützt den INHALT. Sie
beweist nicht, wer eine Datei geschrieben hat — wer Zugang zur Box hat, könnte
einen Lauf ersetzen. Dagegen stehen die Schnappschüsse (§ 6.4) und die Zählung
beim Zurückspielen.

## 3 · Wo was liegt

| Was | Wo |
| --- | --- |
| Die Backups | Hetzner Storage Box, Ordner `backups/appwrite/runs/`. Zugang über das Hetzner-Konto (Konsole → Storage Box). Benutzername und Adresse stehen dort; SSH läuft auf Port 23 |
| Der private Schlüssel | in Davids Passwort-Managern **NordPass** und **Apple Passwörter**, jeweils als Eintrag „Pukalani Appwrite Backup – privater Schlüssel“. Nicht auf dem Server, nicht auf der Storage Box, nicht im Repo |
| Zugang zum Hetzner-Konto und zu Cloudflare (für die Adresse) | Passwort-Manager |
| Die Skripte | dieses Repo, Ordner `ops/` (öffentlich lesbar, auch ohne Rechner mit Checkout) |
| Wer außer David an den Schlüssel kommt | **offen** — die Vertrauensperson ist noch nicht benannt (OPEN-ITEMS BK1) |

## 4 · Wiederherstellen, Schritt für Schritt

### 4.1 Neuer Server

- [ ] Hetzner Cloud: Server mit Ubuntu 24.04, mindestens die Größe des alten
      (4 GB RAM genügen zum Starten, der alte hat 8 GB), Standort Deutschland.
      Firewall: 22, 80, 443 offen.
- [ ] Einen Benutzer anlegen, der Docker bedienen darf (auf dem alten Server
      heißt er `ploi`), und als dieser anmelden.
- [ ] Docker mit Compose, dazu `gpg`, `jq`, `rsync`:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 gnupg jq rsync
sudo usermod -aG docker "$USER"   # danach neu anmelden
docker compose version && gpg --version | head -1
```

Gelungen, wenn beide Befehle eine Version nennen und `docker ps` ohne `sudo`
eine leere Liste zeigt.

### 4.2 Den Lauf von der Storage Box holen

- [ ] Im Hetzner-Konto die Storage Box öffnen. Benutzername und Adresse
      ablesen. Kommt man mit keinem Schlüssel mehr hinein (der alte Server ist
      weg): dort ein neues Passwort setzen oder den eigenen öffentlichen
      SSH-Schlüssel hinterlegen.
- [ ] Die vorhandenen Läufe ansehen und den jüngsten holen:

```bash
BOX='<benutzer>@<adresse>'          # aus dem Hetzner-Konto
ssh -p 23 "$BOX" ls backups/appwrite/runs
mkdir -p ~/restore && cd ~/restore
rsync -a -e 'ssh -p 23' "$BOX:backups/appwrite/runs/<zeitstempel>/" ./lauf/
ls -la lauf/ && cat lauf/backup.meta
```

Gelungen, wenn in `lauf/` elf Dateien liegen (neun auf `.gpg`, dazu
`backup.meta` und `SHA256SUMS`) und `backup.meta` den erwarteten Tag nennt.
Ist der jüngste Lauf beschädigt (das Skript sagt es im nächsten Schritt), den
davor nehmen. Liegt der gesuchte Tag nicht mehr im Ordner: im Hetzner-Konto
einen Schnappschuss der Box öffnen (§ 6.4).

### 4.3 Den privaten Schlüssel bereitlegen

- [ ] Im Passwort-Manager den Eintrag „Pukalani Appwrite Backup – privater
      Schlüssel“ öffnen und den ganzen Text (von `-----BEGIN PGP PRIVATE KEY
      BLOCK-----` bis `-----END …-----`) in eine Datei auf dem neuen Server
      legen:

```bash
umask 077 && nano ~/restore/backup-schluessel.asc   # einfügen, speichern
```

Den Schlüssel nie per Mail oder Chat schicken. Die Datei wird am Ende gelöscht
(§ 4.7).

### 4.4 Zurückspielen

- [ ] Das Skript holen (ohne Checkout genügt die eine Datei):

```bash
curl -fsSLo ~/restore/appwrite-restore.sh https://raw.githubusercontent.com/davidschubert/pukalani-app/main/ops/appwrite-restore.sh
```

- [ ] Vorschau — ändert nichts, prüft Prüfsummen, Schlüssel und Rechner:

```bash
bash ~/restore/appwrite-restore.sh ~/restore/lauf --key ~/restore/backup-schluessel.asc --target ~/appwrite
```

Der Ordnername am Ende von `--target` wird der Name des Compose-Projekts und
damit die Vorsilbe der Volumes. Für einen Ersatz der Production: `appwrite`,
wie auf dem alten Server.

- [ ] Zurückspielen — dieselbe Zeile mit `--apply`:

```bash
bash ~/restore/appwrite-restore.sh ~/restore/lauf --key ~/restore/backup-schluessel.asc --target ~/appwrite --apply
```

Das Skript geht sechs Schritte: entschlüsseln, Einstellungen ablegen,
Datenbank starten und Dump einspielen, **zählen**, Volumes füllen, alles
starten. Gezählt wird, bevor Appwrite startet: jede Tabelle gegen die Zählung
aus dem Backup, dazu die Konten je Projekt. Abweichen dürfen nur Tabellen, in
die Appwrite laufend schreibt (Sitzungen, Statistik, Protokolle). Weicht etwas
anderes ab, startet die Instanz nicht.

Gelungen, wenn die letzte Zeile mit `✔ Zurückgespielt` beginnt.

### 4.5 Die Adresse umstellen

- [ ] Cloudflare → Zone `pukalani.app` → DNS: den A-Eintrag `api` auf die
      Adresse des neuen Servers setzen (nicht „proxied“, wie bisher).
- [ ] Das Zertifikat kommt aus dem Backup mit. Ist es inzwischen abgelaufen:
      `docs/runbooks/PRODUKTIONS-ALARM.md`, Abschnitt „Appwrite-Zertifikat“.

### 4.6 Proben

- [ ] `curl -s https://api.pukalani.app/v1/health/version` nennt die Version aus
      `backup.meta`.
- [ ] Alle Seiten melden sich gesund: `node scripts/ops/verify-health.mjs`
      (im Repo) oder je Seite `curl -s https://<host>/api/health` → `"ok":true`.
- [ ] Mit einem eigenen Konto anmelden. Ein Profilbild öffnen (liegt in einem
      verschlüsselten Bucket — sieht man es, passt der Schlüssel aus der `.env`).
- [ ] In der Appwrite-Konsole: vier Projekte, Zahl der Konten wie im Protokoll
      des Skripts.

### 4.7 Danach

- [ ] `rm -rf ~/restore` — dort liegen der private Schlüssel und der Lauf.
- [ ] Das nächtliche Backup auf dem neuen Server einrichten (§ 6.1) und einen
      Lauf von Hand machen.
- [ ] Die Stellen nachziehen, die die Adresse des Servers fest nennen: Adresse
      und Host-Key im Job `appwrite-cert` und im Schritt „Backup“ von
      `.github/workflows/production-watch.yml`, das Tor-Skript samt Eintrag des
      Wächter-Schlüssels (`docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md`),
      `MIRROR_PROD_SSH` im Spiegel-Skript.
- [ ] Vorfall in `docs/OPEN-ITEMS-COMPLETE.md` festhalten, mit Dauer.

### Der alte Server steht noch

Das Skript spielt nur auf einen Rechner OHNE Appwrite zurück und überschreibt
nie etwas, auch nicht mit einem Schalter. Sind nur die Daten unbrauchbar und
der Server ist in Ordnung, gibt es zwei Wege:

- **Sicherer:** trotzdem einen neuen Server nehmen (§ 4.1). Der alte bleibt
  als Beweisstück stehen, bis der neue läuft.
- **Auf demselben Server:** erst von Hand sichern, was da ist, dann die
  Instanz bewusst abräumen — das löscht alle Daten dieses Servers:

```bash
cd ~/appwrite && docker compose down          # stoppt alles
cd ~ && mv appwrite appwrite.kaputt-$(date +%F)
docker volume ls -q --filter label=com.docker.compose.project=appwrite   # ansehen, DANN:
docker volume ls -q --filter label=com.docker.compose.project=appwrite | xargs docker volume rm
```

Danach weiter bei § 4.2.

**Nur ein Teil fehlt** (eine Tabelle, eine Datei): nicht auf dem laufenden
Server zurückspielen. Den Lauf auf einem anderen Rechner zurückspielen (so wie
in der Übung, § 7) und das Fehlende von dort holen.

## 5 · Bekannte Fallen

- **Der Schlüssel im Passwort-Manager ist der einzige Weg in die Backups.**
  Geht er verloren, sind alle Läufe wertlos. Er liegt deshalb an zwei Orten.
  Wird er getauscht (§ 6.5), bleiben ältere Läufe nur mit dem ALTEN lesbar.
- **Gleiche Appwrite-Version.** Die Compose-Datei kommt aus dem Backup, also
  startet dieselbe Version, die den Dump geschrieben hat. Nicht „bei der
  Gelegenheit“ eine neuere einsetzen: ein Dump trägt das Schema seiner Version.
- **Der Compose-Ordner auf dem Server ist `/home/ploi/appwrite`.** Der Pfad
  `/usr/src/code/appwrite` aus den Upgrade-Runbooks ist derselbe Ordner von
  INNEN gesehen (im Container des Upgrade-Werkzeugs), auf dem Server gibt es
  ihn nicht.
- **`docker compose exec -T` liest die Standard-Eingabe leer.** In einem Skript,
  das selbst von der Standard-Eingabe kommt (`ssh … 'bash -s'`), verschluckt es
  den Rest des Skripts. Beide Skripte hängen deshalb `</dev/null` an.
- **Ein `… | head -1` oder `… | grep -q` hinter einem Befehl mit viel Ausgabe**
  schließt die Pipe früh; mit `pipefail` sieht das wie ein Fehler aus (Exit
  141) — und nur manchmal. Beim Bau des Backup-Skripts so erwischt.
- **Docker oder containerd auf dem Appwrite-Server nie neu starten.** Danach
  bleiben `appwrite`, `traefik` und `redis` unten; es heilt nur
  `docker compose up -d` im Compose-Ordner (Vorfall 2026-10-24).
- **Eine Kopie der Production verschickt Mails und erneuert Zertifikate,** wenn
  sie vollständig startet. Für eine Übung deshalb nur die Dienste starten, die
  man prüfen will (§ 7), und die Kopie danach löschen.

## 6 · Betrieb des Backups

### 6.1 Einrichten und aktualisieren

Auf dem Server liegen drei Dateien nebeneinander in `~/ops/`; sie kommen aus
diesem Repo. Es gibt bewusst keinen automatischen Weg auf diesen Server.

```bash
S='ploi@<appwrite-server>'
ssh "$S" 'cp -p ~/ops/appwrite-backup.sh ~/ops/appwrite-backup.sh.vorher 2>/dev/null; true'
scp ops/appwrite-backup.sh ops/appwrite-volumes.conf ops/appwrite-backup.pub.asc "$S":ops/
ssh "$S" 'chmod 755 ~/ops/appwrite-backup.sh && APPWRITE_COMPOSE_DIR=/home/ploi/appwrite OFFSITE_TARGET=storagebox:backups/appwrite ~/ops/appwrite-backup.sh'
```

Der letzte Befehl ist die Vorschau: Sie zeigt Datenbanken, Volumes, den
Fingerabdruck des Schlüssels und ob die Storage Box erreichbar ist, und ändert
nichts. Zurück zur vorigen Fassung: `mv ~/ops/appwrite-backup.sh.vorher
~/ops/appwrite-backup.sh`.

Ändert sich `ops/appwrite-cert-gate.sh`, gehört das Tor dazu
(`docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md`, Abschnitt „Tor auf appwrite-prod“).

### 6.2 Der Zeitplan

Im crontab des Benutzers `ploi` auf dem Appwrite-Server (`crontab -e`), eine
Zeile, kein root:

```cron
30 3 * * * APPWRITE_COMPOSE_DIR=/home/ploi/appwrite BACKUP_DIR=/home/ploi/backup OFFSITE_TARGET=storagebox:backups/appwrite /home/ploi/ops/appwrite-backup.sh --run >> /home/ploi/ops/logs/appwrite-backup.log 2>&1
```

`storagebox` ist ein Eintrag in `~/.ssh/config` des Servers (Adresse,
Benutzer, Port 23, eigener Schlüssel). Ohne `--run` zeigt das Skript nur die
Vorschau — ein Zeitplan ohne den Schalter sichert nichts.

### 6.3 Nachsehen, ob es lief

| Frage | Befehl auf dem Server |
| --- | --- |
| Ergebnis des letzten Laufs | `~/ops/appwrite-backup.sh --status` |
| Was der Wächter sieht | `~/bin/pukalani-cert-gate.sh backup-status` |
| Protokoll | `tail -30 ~/ops/logs/appwrite-backup.log` |
| Läufe auf dem Server / auf der Box | `ls ~/backup/runs` · `ssh storagebox ls backups/appwrite/runs` |

Der Produktions-Wächter fragt das Tor täglich und wird rot, wenn der letzte
gute Lauf älter als 26 Stunden ist oder der letzte Versuch gescheitert ist
(`docs/runbooks/PRODUKTIONS-ALARM.md`; der Schritt im Wächter wird
eingeschaltet, sobald das neue Skript auf dem Server läuft). Ein gescheiterter Lauf lässt alle
früheren Läufe liegen und nennt den Schritt, an dem er scheiterte:

| Schritt | Bedeutung | Was tun |
| --- | --- | --- |
| `vorpruefung` | Programm, Schlüssel-Datei oder Volume-Liste passt nicht; Datenbank läuft nicht; neues Volume in der Compose-Datei | Vorschau laufen lassen, sie nennt den Grund |
| `zaehlen`, `dump` | Datenbank antwortet nicht, Dump unvollständig, oder deutlich weniger Tabellen als beim letzten guten Lauf | Protokoll lesen. War das Schrumpfen gewollt: EIN Lauf von Hand mit `BACKUP_ACCEPT_SHRINK=1` |
| `volumes`, `einstellungen`, `verschluesseln` | Archiv nicht lesbar, Platte voll | `df -h /`, Protokoll |
| `abgleich`, `pruefung-box` | Storage Box nicht erreichbar oder dort liegt nicht dasselbe | Der Lauf liegt auf dem Server und wird beim nächsten Mal nachgereicht. Hält es an: Zugang zur Box prüfen |
| `aufbewahrung` | Löschen eines alten Laufs auf der Box scheiterte | von Hand ansehen; das Backup selbst ist vollständig |

### 6.4 Aufbewahrung und Löschungen

- Auf dem Server bleiben die Läufe 14 Tage, auf der Storage Box 30 Tage.
- Abgeglichen wird **ohne** Löschen. Was auf der Box liegt, bleibt dort, auch
  wenn es auf dem Server fehlt. Ein Lauf, der wegen einer nicht erreichbaren
  Box liegen blieb, wird beim nächsten Mal nachgereicht.
- Auf der Box räumt das Skript getrennt auf, und nur nach dem NAMEN des
  Ordners: älter als 30 Tage, nie die jüngsten sieben, höchstens fünf je Lauf.
  Was nicht wie ein Lauf heißt, fasst es nicht an.
- Zweites Netz: tägliche Schnappschüsse der Storage Box (Hetzner-Konto →
  Storage Box → Snapshots). Ein Schnappschuss lässt sich vom Server aus nicht
  löschen. Im Ernstfall dort einen Stand öffnen, wenn auf der Box selbst
  etwas fehlt.

### 6.5 Den Schlüssel tauschen

Nötig, wenn der private Schlüssel jemandem in die Hände gefallen sein könnte.

1. Neues Schlüsselpaar erzeugen (ohne Passwort, Ablauf „nie“), den privaten
   Teil sofort an die zwei Orte aus § 3 legen.
2. `ops/appwrite-backup.pub.asc` ersetzen und `DEFAULT_FINGERPRINT` in
   `ops/appwrite-backup.sh` auf den neuen Fingerabdruck setzen (der Test
   `packages/core/tests/appwriteBackupScript.test.ts` hält beides zusammen).
3. Einspielen (§ 6.1), ein Lauf von Hand, die Übung (§ 7) mit dem neuen Lauf.
4. Den alten privaten Schlüssel erst löschen, wenn kein Lauf mehr auf der Box
   liegt, der für ihn verschlüsselt ist (30 Tage und die Schnappschüsse).

## 7 · Die Übung

Zwei Stufen. Die erste braucht keine echten Daten und gehört zu jeder Änderung
an den Skripten; die zweite ist der Beweis mit dem echten Backup.

**Attrappe (ohne echte Daten, rund fünf Minuten):**

```bash
ops/appwrite-backup-attrappe.sh
```

Baut in einem Wegwerf-Container mit eigenem Docker-Dienst einen Stellvertreter-
Stack, lässt Backup und Wiederherstellung samt allen Gegenproben laufen und
räumt wieder ab. Eine Appwrite-Instanz auf dem Rechner wird dabei weder gelesen
noch berührt. Muss mit „Gescheitert: 0“ enden.

**Mit dem Backup der letzten Nacht (braucht Davids Ja: echte Kundendaten):**

- [ ] Einen eigenen, leeren Rechner nehmen — nie den mit der Entwicklungs-
      Instanz (das Skript weigert sich dort ohnehin). Bewährt: eine
      Linux-Maschine in OrbStack, die danach gelöscht wird.
- [ ] § 4.1 bis § 4.4, mit einem Zusatz am letzten Befehl, damit die Kopie
      nichts verschickt und kein Zertifikat erneuert:
      `--services "mariadb redis clickhouse appwrite traefik"`
- [ ] Proben: die Zählung des Skripts, eine Anmeldung mit einem Demo-Konto,
      eine Datei aus einem verschlüsselten Bucket.
- [ ] Gegenprobe: in der `.env` der Kopie `_APP_OPENSSL_KEY_V1` durch einen
      anderen Wert ersetzen, `docker compose up -d appwrite` — die Datei darf
      sich jetzt nicht mehr lesen lassen.
- [ ] Alles löschen: die Maschine, den heruntergeladenen Lauf, die Datei mit
      dem privaten Schlüssel. Datum und Dauer unten eintragen.

## 8 · Protokoll der Übungen

| Datum | Was | Dauer | Ergebnis |
| --- | --- | --- | --- |
| 2026-11-15 | Attrappe (`ops/appwrite-backup-attrappe.sh`) | rund 5 min | bestanden, alle Gegenproben rot wie erwartet |
