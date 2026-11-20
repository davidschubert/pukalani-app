# Runbook: Dienste des Docker-Servers aus dem Backup wiederherstellen

**Wann.** Der Docker-Server ist weg oder die Daten eines Dienstes dort sind
unbrauchbar. Auf ihm laufen Plausible (das Produkt Pukalani Analytics),
Chatwoot, Umami und Shlink. Dieses Runbook bringt aus dem, was auf der Storage
Box liegt, und EINEM getrennt verwahrten Schlüssel jeden dieser Dienste zurück.

**Für wen.** Geschrieben für jemanden, der den Server nie gesehen hat. Jeder
Schritt nennt, woher etwas kommt und woran man erkennt, dass er gelungen ist.

> **Regel.** Ein Backup, aus dem noch nie wiederhergestellt wurde, ist eine
> Hoffnung. Die Übung (§ 7) wird wiederholt: einmal im Jahr, nach jeder Änderung
> an `ops/docker-apps-backup.sh`, `ops/docker-apps-restore-clickhouse.sh` oder
> `ops/docker-apps.conf` — und nach jedem Versionssprung von Postgres oder
> ClickHouse in einem der Stacks.

Das Schwester-Runbook für die Appwrite-Instanz ist
[APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md). Schlüssel,
Storage Box und Aufbau eines Laufs sind dieselben; was dort ausführlich steht
(Schlüssel in eine Datei legen, Server mieten), wird hier nur genannt.

---

## 1 · Kurzfassung für den Ernstfall

1. Server mit Docker bereitstellen, dieselben Compose-Ordner anlegen (§ 4.1).
2. Den jüngsten Lauf von der Storage Box holen und die Prüfsummen vergleichen (§ 4.2).
3. Den privaten Schlüssel aus dem Passwort-Manager in eine Datei legen und den
   Lauf entschlüsseln (§ 4.3).
4. Je Dienst: Einstellungen auspacken, NUR die Datenbank starten, Abzug
   einspielen, Zeilen vergleichen, dann den Rest starten (§ 4.4 bis § 4.7).
5. Adressen der Dienste auf den neuen Server zeigen lassen, proben (§ 4.8).
6. Das Backup auf dem neuen Server wieder einrichten (§ 6).

Ein Dienst allein geht genauso: die Schritte 2 bis 4 nur für ihn.

## 2 · Was im Backup liegt — und was nicht

Jede Nacht legt `ops/docker-apps-backup.sh` einen Ordner an,
`runs/<JJJJ-MM-TT-HHMMSS>/`, erst auf dem Server, dann auf der Storage Box.
Welche Dateien es sind, bestimmt die Liste `ops/docker-apps.conf`:

| Datei | Inhalt |
| --- | --- |
| `<dienst>-postgres.sql.gz.gpg` | `pg_dumpall`: alle Datenbanken und Rollen des Postgres-Dienstes (Plausible, Chatwoot, Umami) |
| `plausible-clickhouse.tar.gz.gpg` | die Besuchs-Zahlen: je Tabelle die Bauanleitung (`schema/`) und die Daten (`data/`, Format Native), dazu `tables.tsv` |
| `shlink-sqlite.gz.gpg` | die SQLite-Datei von Shlink, über die Backup-Funktion von SQLite abgezogen |
| `chatwoot-dateien.tar.gz.gpg` | hochgeladene Dateien von Chatwoot (der Ordner `/app/storage` im Container) |
| `<dienst>-einstellungen.tar.gz.gpg` | `.env`, `docker-compose.yml` und was der Stack sonst aus seinem Ordner einbindet |
| `counts.tsv.gpg` | Zeilen je Tabelle, gezählt direkt vor dem Abzug (Dienst, Art, Tabelle, Zeilen) |
| `backup.meta` | Kenndaten im Klartext: Zahlen, Image je Datenbank — keine Inhalte |
| `SHA256SUMS` | Prüfsummen der Dateien dieses Ordners |

**Nicht im Backup, mit Absicht:**

- **Redis von Chatwoot** — Warteschlange und Zwischenspeicher. Nach dem
  Zurückspielen sind offene Hintergrund-Aufgaben weg (etwa eine Mail, die
  gerade verschickt werden sollte).
- **Die Geo-Datenbank von Shlink** und der Zwischenspeicher von Plausible —
  beide laden die Dienste selbst neu.
- **Images.** Die Version je Dienst steht in der gesicherten
  `docker-compose.yml`; das Image der Datenbank zusätzlich in `backup.meta`.

**Wie alt die Daten höchstens sind:** ein Tag. Die Tabellen werden
nacheinander abgezogen, nicht in einem gemeinsamen Augenblick — bei ClickHouse
kann eine Tabelle deshalb ein paar Sekunden mehr Besuche enthalten als die
davor. Für Auswertungen ist das ohne Belang.

## 3 · Wo was liegt

| Was | Wo |
| --- | --- |
| Läufe außer Haus | Storage Box, Ordner `backups/docker-apps/runs/` (dieselbe Box wie das Appwrite-Backup; Zugang und Schnappschüsse: Appwrite-Runbook § 3) |
| Läufe auf dem Server | `~/backup/runs/` (14 Tage), Stand in `~/backup/state/last-run` |
| Skript, Liste, öffentlicher Schlüssel | auf dem Server in `~/ops/`, Quelle `ops/` in diesem Repo |
| Privater Schlüssel | nur in Davids Passwort-Managern — nicht auf dem Server, nicht auf der Box, nicht im Repo |
| Compose-Ordner der Dienste | auf dem Server unter einem gemeinsamen Ordner (`APPS_DIR` in der crontab-Zeile), Namen wie in `ops/docker-apps.conf` |

## 4 · Wiederherstellen, Schritt für Schritt

### 4.1 Server und Ordner

Ein Server mit Docker und dem Compose-Plugin (Ubuntu 24.04, wie im
Appwrite-Runbook § 4.1). Darauf je Dienst ein Ordner mit dem Namen aus der
dritten Spalte von `ops/docker-apps.conf`. Der Ordnername gehört dazu: Compose
leitet daraus die Namen der Volumes ab.

### 4.2 Den Lauf holen

Vom Server aus (die Box ist nur aus dem Netz des Hosters erreichbar):

```bash
ssh <box-alias> ls backups/docker-apps/runs | tail -3
rsync -a -e 'ssh' <box-alias>:backups/docker-apps/runs/<lauf>/ ~/restore/<lauf>/
cd ~/restore/<lauf> && sha256sum -c SHA256SUMS
```

**Gelungen, wenn** jede Zeile mit `OK` endet.

### 4.3 Entschlüsseln

Den privaten Schlüssel wie im Appwrite-Runbook § 4.3 in ein eigenes,
vorübergehendes gpg-Verzeichnis laden. Dann:

```bash
mkdir -m 700 ~/restore/klar && cd ~/restore/<lauf>
for f in *.gpg; do gpg --homedir <gpg-ordner> --output ~/restore/klar/"${f%.gpg}" --decrypt "$f"; done
```

**Gelungen, wenn** in `~/restore/klar/` je `.gpg`-Datei eine Datei ohne die
Endung liegt. Ab hier liegt Klartext auf der Platte, darunter jede `.env` —
am Ende löschen (§ 4.9).

### 4.4 Einstellungen und Datenbank eines Dienstes (Postgres)

Gilt für Plausible, Chatwoot und Umami. `<ordner>` und `<db-dienst>` stehen in
`ops/docker-apps.conf` (Spalten 3 und 4 der Zeile `postgres`).

```bash
cd <apps-ordner>/<ordner>
tar xzf ~/restore/klar/<dienst>-einstellungen.tar.gz          # .env, docker-compose.yml, …
docker compose up -d <db-dienst>                                # NUR die Datenbank
docker compose exec -T <db-dienst> sh -c 'until pg_isready -q -U "${POSTGRES_USER:-postgres}"; do sleep 1; done'
gunzip -c ~/restore/klar/<dienst>-postgres.sql.gz \
  | docker compose exec -T <db-dienst> sh -c 'exec psql -X -q -U "${POSTGRES_USER:-postgres}" -d postgres' > /dev/null
```

Eine Fehlerzeile ist erwartet und harmlos: `role "…" already exists` — der
Abzug legt auch den Benutzer an, den der frische Container schon hat.

Wichtig: die Datenbank muss LEER starten. Liegt aus einem früheren Versuch
noch ein Volume da, erst mit `docker compose down -v` in DIESEM Ordner
entfernen — auf einem Server, auf dem der Dienst noch läuft, löscht das seine
Daten.

**Zeilen vergleichen** — je Datenbank aus `backup.meta`
(`<dienst>.postgres.databases`):

```bash
echo "SELECT format('SELECT %L, %L, count(*) FROM %I.%I', current_database(), schemaname || '.' || tablename, schemaname, tablename) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2 \gexec" \
  | docker compose exec -T <db-dienst> sh -c 'exec psql -X -At -U "${POSTGRES_USER:-postgres}" -d <datenbank>' \
  | awk -F'|' '{ print $1 "." $2 "\t" $3 }' | sort > /tmp/ist.tsv
awk -F'\t' '$1 == "<dienst>" && $2 == "postgres" && index($3, "<datenbank>.") == 1 { print $3 "\t" $4 }' ~/restore/klar/counts.tsv | sort > /tmp/soll.tsv
diff /tmp/soll.tsv /tmp/ist.tsv && echo gleich
```

**Gelungen, wenn** `gleich` erscheint.

### 4.5 ClickHouse (Plausible)

```bash
cd <apps-ordner>/plausible_analytics
docker compose up -d plausible_events_db                        # NUR ClickHouse, leer
mkdir ~/restore/klar/ch && tar xzf ~/restore/klar/plausible-clickhouse.tar.gz -C ~/restore/klar/ch
CLICKHOUSE_CLIENT='docker compose exec -T plausible_events_db clickhouse-client' \
  <repo>/ops/docker-apps-restore-clickhouse.sh ~/restore/klar/ch > /tmp/ist.tsv
awk -F'\t' '$2 == "clickhouse" { print $3 "\t" $4 }' ~/restore/klar/counts.tsv | sort > /tmp/soll.tsv
sort /tmp/ist.tsv | diff /tmp/soll.tsv - && echo gleich
```

Das Skript hält die Reihenfolge ein, an der ein Zurückspielen von Hand
scheitert (Wörterbücher vor den Tabellen, die über sie rechnen; Daten der
Quell-Tabellen zuerst), und es weigert sich, wenn in der Datenbank schon
Tabellen stehen. Plausible selbst darf dabei NICHT laufen: es legt beim Start
leere Tabellen an.

**Gelungen, wenn** `gleich` erscheint.

### 4.6 SQLite (Shlink)

```bash
cd <apps-ordner>/shlink_official && mkdir -p data
gunzip -c ~/restore/klar/shlink-sqlite.gz > data/database.sqlite
sqlite3 data/database.sqlite 'PRAGMA integrity_check;'           # → ok
sudo chown -R 1001:0 data                                        # der Benutzer im Shlink-Container
```

Die Zeilen je Tabelle stehen in `counts.tsv` (Zeilen mit `shlink`, `sqlite`).

### 4.7 Dateien (Chatwoot) und der Rest des Stacks

Die Compose-Datei von Chatwoot bindet ihre Daten über volle Pfade außerhalb
des Compose-Ordners ein; die Pfade stehen in der gesicherten
`docker-compose.yml`. Das Archiv der Dateien gehört in den Ordner, der dort
auf `/app/storage` zeigt:

```bash
sudo mkdir -p <pfad-aus-der-compose-datei> && sudo tar xzf ~/restore/klar/chatwoot-dateien.tar.gz -C <pfad-aus-der-compose-datei>
```

Danach je Ordner `docker compose up -d` — jetzt startet auch die Anwendung
und findet ihre Daten vor.

### 4.8 Proben

- Plausible: anmelden, eine Site öffnen, der Zeitraum „letzte 30 Tage" zeigt
  Besuche bis zum Tag des Backups.
- Chatwoot: anmelden, eine alte Unterhaltung mit Anhang öffnen.
- Umami: anmelden, eine Website zeigt Zahlen.
- Shlink: ein bekannter Kurzlink leitet weiter.

### 4.9 Aufräumen

`~/restore/klar/` und das vorübergehende gpg-Verzeichnis löschen. Der private
Schlüssel bleibt nicht auf dem Server.

## 5 · Bekannte Fallen

- **Die Reihenfolge bei ClickHouse.** Eine Tabelle, deren Spalten über ein
  Wörterbuch rechnen, lässt sich ohne das Wörterbuch nicht anlegen; füllt man
  sie vor der Quell-Tabelle des Wörterbuchs, rechnet ClickHouse mit leeren
  Werten und meldet keinen Fehler. Deshalb das Skript, nicht die Hand.
- **Die Anwendung zu früh gestartet.** Plausible und Chatwoot legen beim Start
  ihr Schema an. Ein Abzug, der danach eingespielt wird, trifft auf vorhandene
  Tabellen. Immer erst nur die Datenbank starten.
- **`pg_dumpall` und die Hauptversion.** Der Abzug wird in dieselbe
  Hauptversion zurückgespielt, mit der er entstand (`backup.meta`,
  `<dienst>.postgres.image`). Eine neuere geht meist, eine ältere nicht.
- **Ein neuer Dienst auf dem Server.** Das Backup bricht ab, sobald unter dem
  Ordner der Dienste ein Compose-Ordner oder in einem Stack ein Dienst
  auftaucht, den `ops/docker-apps.conf` nicht kennt. Das ist Absicht: erst
  entscheiden (Daten-Zeile oder `ohne`), dann läuft es wieder. Bis dahin ist
  KEIN Dienst gesichert — die Liste am selben Tag nachziehen.
- **Shell-Fallen** wie im Appwrite-Runbook § 5: `docker compose exec -T` liest
  die Standard-Eingabe leer (`</dev/null`), und `… | head -1` mit `pipefail`
  ist ein Scheinfehler.

## 6 · Betrieb des Backups

### 6.1 Einrichten

Auf dem Server, als der Benutzer, der in der docker-Gruppe ist (kein root):

1. `ops/docker-apps-backup.sh`, `ops/docker-apps.conf` und
   `ops/appwrite-backup.pub.asc` nach `~/ops/` kopieren (von Hand; es gibt
   keinen CI-Weg auf diesen Server). Das Skript ausführbar machen.
2. `~/ops/docker-apps-backup.sh` OHNE Angabe starten (mit `APPS_DIR=…` davor):
   die Vorschau nennt jeden Abzug und prüft Schlüssel und Liste. Sie ändert
   nichts.
3. Zugang zur Storage Box: ein eigenes Schlüsselpaar auf dem Server erzeugen,
   den öffentlichen Teil auf der Box eintragen, in `~/.ssh/config` einen Alias
   mit Port und Schlüssel anlegen. `ssh <box-alias> ls` muss ohne Rückfrage
   antworten.
4. Ein Lauf von Hand mit den Variablen der crontab-Zeile; er endet mit
   „Außer Haus angekommen und Prüfsummen gleich".
5. Die crontab-Zeile (steht im Kopf des Skripts). **Ohne `--run` sichert ein
   Zeitplan nichts** — dann läuft nur die Vorschau.

### 6.2 Nachsehen

```bash
~/ops/docker-apps-backup.sh --status
tail -30 ~/ops/logs/docker-apps-backup.log
```

Die Stand-Datei nennt bei einem gescheiterten Lauf den Schritt
(`<dienst>-<art>`, `verschluesseln`, `abgleich`, `pruefung-box`,
`aufbewahrung`). Ein gescheiterter Lauf lässt alle früheren liegen.

**Noch offen:** diesen Stand liest bisher kein Wächter. Ein roter oder
ausgebliebener Lauf fällt erst auf, wenn jemand nachsieht (OPEN-ITEMS „DS1").

### 6.3 Aufbewahrung

14 Tage auf dem Server (mindestens drei Läufe), 30 Tage auf der Box
(mindestens sieben). Abgeglichen wird ohne Löschungen; aufgeräumt wird auf der
Box nur nach dem Namen des Ordners, höchstens fünf je Lauf. Zweites Netz: die
Schnappschüsse der Box.

### 6.4 Nach einer Änderung

- **Neuer Dienst oder neuer Stack:** Zeilen in `ops/docker-apps.conf`, Datei
  auf den Server kopieren, Vorschau, ein Lauf von Hand.
- **Skript geändert:** `pnpm --filter @pukalani/core exec vitest run tests/dockerAppsBackupScript.test.ts`,
  auf den Server kopieren, Vorschau, ein Lauf von Hand, und die Übung (§ 7)
  für mindestens einen Dienst.
- **Bewusst aufgeräumt** (deutlich weniger Daten als beim letzten Lauf): der
  Lauf verweigert das. Einmal von Hand mit `BACKUP_ACCEPT_SHRINK=1`.

## 7 · Die Übung

Nie auf dem Server mit den laufenden Diensten. Auf einem anderen Rechner mit
Docker:

1. Einen Lauf holen und entschlüsseln (§ 4.2, § 4.3).
2. Für den Dienst Wegwerf-Container mit dem Image aus `backup.meta` starten —
   OHNE Compose-Datei, ohne veröffentlichte Ports:
   `docker run -d --name uebung-pg -e POSTGRES_PASSWORD=<irgendwas> <image>` und
   für ClickHouse
   `docker run -d --name uebung-ch --ulimit nofile=262144:262144 -e CLICKHOUSE_SKIP_USER_SETUP=1 <image>`.
3. Einspielen und Zeilen vergleichen wie in § 4.4 und § 4.5, mit
   `docker exec -i uebung-…` an Stelle von `docker compose exec -T …`.
4. Eine Abfrage, die über die Zeilenzahl hinausgeht (bei Plausible: die Zahl
   der Sites, der Zeitraum der Besuche, ein Ländername aus dem Wörterbuch).
5. Container mit `docker rm -f -v` entfernen, Klartext löschen, Ergebnis in
   § 8 eintragen.

## 8 · Protokoll der Übungen

| Datum | Was | Ergebnis |
| --- | --- | --- |
| 2026-11-20 | Erster Lauf auf dem Server (zehn Abzüge, rund 30 Sekunden, rund 6 MB). Danach Plausible zurückgespielt in zwei Wegwerf-Container auf einem anderen Rechner: Postgres und ClickHouse. | Postgres: 51 Tabellen, jede Zeilenzahl gleich. ClickHouse: 20 Tabellen mit Daten und drei Wörterbücher, jede Zeilenzahl gleich; Besuche bis zum Tag des Laufs, Ländernamen kommen aus dem Wörterbuch. Der erste Versuch von Hand scheiterte an der Reihenfolge (§ 5) — daraus entstand `ops/docker-apps-restore-clickhouse.sh`. **Einschränkung:** verschlüsselt war dieser Übungs-Lauf für einen Wegwerf-Schlüssel, nicht für den echten; mit dem echten privaten Schlüssel wurde noch kein Lauf dieses Servers geöffnet. Chatwoot, Umami und Shlink sind abgezogen und geprüft, aber noch nicht zurückgespielt. |
