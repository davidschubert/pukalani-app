# Produktions-Alarm: Wächter, Alarmweg, Klickliste

**Wann.** Wenn ein Issue mit dem Label `produktions-alarm` aufgeht, wenn eine
Alarm-Mail kommt, wenn UptimeRobot meldet — und einmal zum Einrichten (die
Klickliste unten, nur David).

**Warum.** Zwei stille Vorfälle im Oktober 2026. (1) Das Zertifikat von
`api.pukalani.app` lief am 2026-10-16 ab; **alle** Apps antworteten acht Tage
auf `/api/health` mit `ok:false`, kein Alarm. Und das Schlimmste daran: der
TLS-Wächter hatte es GESEHEN — vom 2026-10-05 („läuft in 11 Tagen ab") bis zur
Reparatur am 2026-10-24 war jeder Lauf von `production-watch.yml` rot, rund
900 Stück, alle 30 Minuten. Niemand hat es bemerkt. (2) Vom 2026-10-25 bis
2026-10-27 missbrauchte ein Angreifer die Registrierung als Mail-Relais; bemerkt
wurde das nur, weil Resend das Tageslimit per Mail an David meldete.

> **Regel.** Ein roter Lauf ist nur eine Farbe. Ein Alarm ist erst, was jemanden
> ERREICHT — und ein Alarmweg, der nie geprobt wurde, ist keiner.

---

## 1 · Was automatisch läuft (`.github/workflows/production-watch.yml`)

| Blick | Skript | Takt | Rot bei |
| --- | --- | --- | --- |
| Zertifikate | `scripts/ops/verify-tls.mjs` | alle 30 min | SAN passt nicht, Restlaufzeit < 14 Tage, kein Handshake — auch `api.pukalani.app` (Appwrite, nicht ploi) |
| Erreichbarkeit | `scripts/ops/verify-health.mjs` | alle 30 min | ein Host antwortet nicht `200` + `ok:true` (Appwrite: keine `version`); ein zweiter Versuch nach 15 s filtert Schluckauf |
| Datenbank-Stand (schnell) | `scripts/ops/verify-health.mjs` (Feld `schema` in `/api/health`) | alle 30 min | eine App mit Appwrite meldet `schema: behind` (eine Migration fehlt), nach dem zweiten Versuch noch `unknown` (sie kann es nicht prüfen) oder gar kein Feld. Ohne ssh, ohne Secret |
| Env-Variablen | `scripts/ops/verify-site-env.mjs` | täglich 04:17 UTC | Pflicht-Variable fehlt auf einer Site |
| Tote Zugänge | `scripts/ops/verify-stale-keys.mjs` | täglich | Schlüssel auf ein gelöschtes Projekt |
| Admin-Konto | `scripts/ops/verify-instance-admins.mjs` | täglich | Instanz ohne Admin |
| Mail-Missbrauch | `scripts/ops/verify-mail-breaker.mjs` | täglich | Notbremse `auth.mail_route_breaker` im pm2-Log der letzten 25 h; mit Resend-Secret zusätzlich ≥ 80 % der Tagesgrenze in 24 h (heute 80 von 100, Grenze aus `GET /usage`) und ≥ 3 Bounces / ≥ 1 Beschwerde (`GET /emails/metrics`) |
| KI-Modelle | `scripts/ops/verify-ai-models.mjs` | täglich | ein konfiguriertes Modell steht nicht mehr in OpenRouters Liste ohne Datenspeicherung, oder es hat keinen der Endpunkte mehr, auf die der Code es festlegt (Text: zwei EU-Endpunkte · Bild- und Videolesen: `google-vertex/eu` · Bild-Erzeugen: `google-vertex/global`). Ohne ssh, ohne Secret. Ist OpenRouter nicht erreichbar, bleibt der Blick grün und schreibt eine Warnung (Exit 2) |
| Datenbank-Stand (gründlich) | `scripts/ops/verify-schema-parity.mjs --ci` | täglich | in einem der vier Projekte fehlt eine Soll-Tabelle, eine Spalte der gemeinsam gepflegten Tabellen oder die Probe eines Layers (dann nennt die Zeile die Migration, z. B. `brand-026`); oder einer der vier nur lesenden Schlüssel fehlt oder liest nicht mehr |
| In die App hinein | `scripts/ops/verify-app-signals.mjs` (zählt auf dem App-Server mit `ops/app-watch-counts.mjs`) | täglich | ein Zeit-Lauf hatte seit mehr als zwei Takten plus 30 Minuten keinen guten Lauf; ein Tages-Lauf ist zuletzt gescheitert; ein erwarteter Lauf hat sich nie gemeldet; ein KI-Aufruf wurde mit Status 402 (kein Guthaben) oder 404 (kein Endpunkt) abgelehnt; auf `platform` ab 25 Server-Fehlern (5xx) in 25 Stunden; ein Prozess läuft nicht oder das Zähl-Skript antwortet nicht. **Zählt nur** (wird berichtet, nicht rot): Server-Fehler der fünf anderen Apps, Fehler aus dem Browser, übrige KI-Ausfälle |
| Live-Verbindung von außen | `scripts/ops/verify-realtime.mjs --handshake` | alle 30 min | drei WebSocket-Handshakes gegen `api.pukalani.app` in Folge gescheitert (der dritte erst nach 5½ Minuten). Ohne ssh, ohne Secret |
| Realtime-Wächter | Tor-Wort `realtime-status` (`ops/appwrite-cert-gate.sh`), ausgewertet von `verify-realtime.mjs` | täglich | der Wächter auf dem Appwrite-Server hat aufgegeben; sein letzter Neustart half nicht; drei oder mehr Neustarts in 24 Stunden; sein letzter Lauf ist älter als 20 Minuten; kein lesbarer Stand |
| Nächtliches Backup | Tor-Wort `backup-status` (`ops/appwrite-cert-gate.sh`) | täglich | der letzte Backup-Lauf der Appwrite-Instanz ist gescheitert, oder der letzte gute Lauf ist zu alt: im täglichen Lauf älter als 6 Stunden (verlangt wird der Lauf DIESER Nacht, 03:30 UTC), bei einem Start von Hand älter als 26 Stunden |

**In die App hinein (seit 2026-11-16, OPS-011).** Bis dahin sah der Alarm, ob
ein Host antwortet, aber nicht, ob die App darin Fehler macht. Jetzt schreibt
jede ausgerollte App drei Arten von Zeilen mit Zeitstempel in ihr pm2-Log:

- `job.run` nach JEDEM Takt eines Zeit-Laufs (Kennung, Ergebnis `ok`,
  `failed` oder `skipped`, Dauer, Takt) und `job.registered` beim Start. Alle
  Zeit-Läufe melden sich über EINE Hilfe an (`defineTimedJob`,
  `packages/core/server/utils/timedJob.ts`); welche es je App geben muss,
  steht in `ops/timed-jobs.conf`.
- `ai.failed` bei jedem Ausfall eines bezahlten KI-Aufrufs (Art, Status,
  Modell, Lauf-Kennung) und `ai.disabled`, wenn der Abschalter greift.
- `server.error` bei jedem 5xx und, auf den vier Apps mit Anmeldung,
  `client.error` für Fehler aus dem Browser (`pukalani.observability`; die
  Annahme ist je Prozess auf 120 Zeilen je Stunde gedeckelt).

Gezählt wird auf dem App-Server: neben jeder Ecosystem-Datei liegt das feste
Skript `ops/app-watch-counts.mjs` (der Deploy legt es dorthin). Es liest die
zwei Log-Dateien, in die der Prozess gerade schreibt, und gibt nur Zahlen und
Kennungen in fester Form zurück — keine Log-Zeile, keine Meldung, keinen Pfad;
das Protokoll des Wächter-Laufs ist öffentlich. Gerechnet wird im Repo
(`scripts/ops/app-signals-rules.mjs`): dort steht jede Schwelle mit ihrer
Messung. Von Hand, vom eigenen Rechner:

```bash
node scripts/ops/verify-app-signals.mjs --ssh
```

*Was scharf ist und was nur zählt.* Rot wird nur, was eindeutig ist und wofür
es einen Handgriff gibt (Tabelle oben). Für Server-Fehler gibt es nur auf
`platform` eine Messung (0 Zeilen an 16 Tagen im November, über 2.000 am Tag
beim Ausfall im Oktober) — dort ist die Schwelle 25 scharf. Auf den fünf
anderen Apps ist das Protokoll erst seit dem 2026-11-16 an; dort, bei Fehlern
aus dem Browser und bei den übrigen KI-Ausfällen wird gezählt und im Lauf
unter „Nur gezählt" berichtet. Scharf stellen heißt: nach einer Woche die
Zahlen aus den täglichen Läufen ansehen und in `RULES` eine Zahl eintragen
(OPEN-ITEMS „WA1").

Eigener Probealarm: `gh workflow run production-watch.yml -f signals_drill=true`
tut so, als wäre ein Zeit-Lauf der ersten App überfällig (an Production ändert
das nichts); der nächste Lauf ohne Haken räumt auf.

**Live-Verbindung (seit 2026-11-16, OPS-004).** Auf dem Appwrite-Server prüft
`~/ops/realtime-watchdog.sh` alle fünf Minuten den WebSocket-Handshake und
erstellt den Container `appwrite-realtime` neu, wenn er scheitert. Bis dahin
tat er das bei jedem Fehlschlag, ohne zu zählen, und niemand erfuhr davon.
Jetzt zählt er die Läufe in Folge, die mit einem gescheiterten Handshake
beginnen: höchstens drei Neustarts, danach schreibt er nur noch den Stand
`aufgegeben`, bis ein Handshake wieder gelingt. Ein Neustart, der hilft, setzt
den Zähler nicht zurück — nur ein Lauf, der gesund BEGINNT. Zwei Blicke machen
daraus einen Alarm: alle 30 Minuten ein Handshake von außen (drei Versuche,
der dritte erst nach 5½ Minuten — was der Server in fünf Minuten selbst
heilt, ist kein Alarm) und täglich der Stand des Wächters über das Tor-Wort
`realtime-status`. Gemessen am 2026-11-16: in vier Monaten zwei Neustarts,
beide am 2026-10-24 und beide ohne Erfolg; normal sind null am Tag.

Eigener Probealarm: `gh workflow run production-watch.yml -f realtime_drill=true`
macht beide Blicke rot (Handshake gegen einen Host, den es nicht gibt; eine
Altersgrenze, die kein Stand erfüllt); der nächste Lauf ohne Haken räumt auf.
Nach JEDER Änderung an `ops/realtime-watchdog.sh` oder am Tor-Skript:
`ops/realtime-watchdog-attrappe.sh` (echtes `docker compose` in einem
Wegwerf-Container), dann von Hand auf den Server
([CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md), „Tor auf
appwrite-prod").

**Datenbank-Stand (seit 2026-11-16, OPS-008).** Das Ausliefern läuft von
selbst, Migrationen fährt David von Hand — die Reihenfolge „erst die
Migration, dann der Merge" stand nur als Satz da, und zweimal ging neues
Programm vor seiner Migration live. Jetzt sagt es die Plattform selbst, in zwei
Stufen:

- *Schnell, alle 30 Minuten.* Jeder Layer nennt in seinem
  `product.manifest.ts` unter `schema.probe` eine Tabelle oder Spalte, die es
  nach seiner jüngsten Migration geben muss. Die App fragt diese Proben mit
  ihrem eigenen Zugang ab und meldet in `/api/health` neben `ok` das Feld
  `schema`: `ok`, `behind` (mindestens eine Probe fehlt) oder `unknown` (sie
  konnte nicht prüfen), dazu zwei Zahlen. Öffentlich sind nur dieses Wort und
  die Zahlen. `ok` der Seite bleibt davon unberührt. Die Probe sieht Tabellen
  und Spalten, keine Indizes, Rechte oder Daten, und je Layer nur die jüngste
  ablesbare Stelle. Landing und Hilfe haben keine Datenbank und kein Feld.
- *Gründlich, täglich.* `verify-schema-parity.mjs --ci` liest je Projekt die
  Tabellen- und Spaltenliste und nennt, was fehlt. Dafür liegen in der
  GitHub-Umgebung `production-watch` vier Schlüssel
  (`SCHEMA_WATCH_KEY_ACCOUNT`, `…_ADMIN`, `…_PORTFOLIO`, `…_BRANDING`), je
  einer pro Appwrite-Projekt, jeweils nur mit den Rechten `tables.read` und
  `columns.read` (Name in der Konsole: `watch-schema-readonly`). Es gibt keine
  lokale Kopie; tauschen heißt: in der Konsole neu anlegen, bei GitHub
  überschreiben, den alten löschen. Am Mac läuft derselbe Abgleich weiter mit
  `pnpm ops:schema-parity`.

Auch das Ausliefern liest das Feld: Meldet eine App nach dem Ausliefern
`behind`, werden die übrigen Apps trotzdem ausgeliefert und der Lauf endet rot
(„Ausgeliefert, aber die Datenbank passt nicht zum Programm"). Aufgehalten
oder zurückgestellt wird nichts von selbst. Probealarm:
`gh workflow run production-watch.yml -f schema_drill=true` täuscht für einen
Host `behind` vor (an Production fehlt dabei nichts); der nächste Lauf ohne
Haken räumt auf. NEUE MIGRATION ⇒ `schema.latest` im Manifest des Layers
nachziehen, und legt sie eine Tabelle oder Spalte an, auch `schema.probe` —
der Test `packages/core/tests/schemaProbeManifests.test.ts` wird sonst rot.

**Nächtliches Backup (seit 2026-11-15, OPS-001).** Das Backup schreibt nach
jedem Lauf sein Ergebnis in eine Stand-Datei auf dem Appwrite-Server; der
Wächter liest sie über das Tor-Skript und bekommt genau eine Zeile zurück
(Ergebnis, Schritt, Alter des letzten guten Laufs in Stunden, Größe, Zahl der
Dateien). Die Schwelle steht im Workflow, nicht auf dem Server. Eigener
Probealarm: `gh workflow run production-watch.yml -f backup_drill=true` verlangt
ein Backup, das es nicht geben kann, und macht damit genau diesen Blick rot;
der nächste Lauf ohne Haken räumt auf. Was die Schritte bedeuten und was zu
tun ist: [APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md), § 6.3.

**KI-Modelle (seit 2026-11-14, BE-004).** Ein roter Blick heißt: eine
KI-Funktion scheitert gerade bei JEDEM Aufruf, obwohl sie eingeschaltet ist
(der Aufruf endet beim Vermittler mit 404, die Oberfläche sagt nur „hat nicht
geklappt"). Die Ausgabe nennt Modell, Konfigurationsdatei und Feld, die
verlangten und die vorhandenen Endpunkte. Reparatur: entweder ein Modell
wählen, das den verlangten Endpunkt hat, oder die Anbieter-Liste in
`packages/brand/server/utils/brandProviderRouting.ts` anpassen — dann aber
auch die Tabelle `scripts/ops/ai-model-endpoints.mjs` (ein Test hält beide
zusammen), den Hinweis vor dem Bild-Erzeugen und den Datenschutztext von
branding.supply, denn alle drei nennen den Ort. Lokal: `pnpm ops:ai-models`.
Die Zeile „ℹ EU-Endpunkt vorhanden" ist kein Alarm, sondern die Nachricht,
dass das Bildmodell inzwischen auch in der EU zu haben ist — dann lohnt der
Wechsel der Liste.

Die Mail-Notbremse selbst (60 je Stunde und Route über alle IPs) lebt in
`packages/core/server/middleware/05.rate-limit.ts`; sie STOPPT den Versand und
schreibt eine Zeile — der Wächter liest diese Zeile.

## 2 · Der Alarmweg (Job `alarm`, läuft nach jedem Wächter-Lauf)

1. **Issue.** Ist irgendein Wächter rot, öffnet der Job EIN Issue mit Label
   `produktions-alarm` (kein zweites, solange es offen ist; alle 12 h ein
   Kommentar „weiterhin rot"). Ist alles wieder grün, kommentiert er
   „Entwarnung" und schließt es. **Offenes Issue = Alarm aktiv.** Braucht
   kein Secret — nur `issues: write` des Workflow-Tokens. Seit 2026-11-16
   steht im Issue unter „Was zu tun ist" je rotem Befund der Blicke „In die
   App hinein" und „Live-Verbindung" EIN Satz mit dem Handgriff und dem
   Abschnitt in diesem Runbook; die älteren Blicke nennt weiter nur der Lauf.
2. **Mail bei jedem Wechsel** (Alarm / Entwarnung, nie im Takt) über Resend —
   sobald die Secrets `PRODUCTION_ALARM_RESEND_KEY` und
   `PRODUCTION_ALARM_MAIL_TO` gesetzt sind (Klickliste). Vorher steht im Lauf
   eine gelbe Warnung „Mail-Alarm nicht eingerichtet".
3. **Heartbeat bei jedem grünen Lauf** an `PRODUCTION_WATCH_HEARTBEAT_URL`
   (Klickliste). Das ist der einzige Weg, der auch meldet, wenn der Workflow
   GAR NICHT mehr läuft (GitHub schaltet Zeitpläne nach 60 Tagen ohne Commit
   ab; eine kaputte cron-Zeile; ein Runner-Ausfall).

**Probealarm — monatlich, und nach jeder Änderung am Workflow:**

```bash
gh workflow run production-watch.yml -f alarm_drill=true
```

Das macht den Health-Blick sicher rot (Host `probealarm.invalid`) und muss ein
Issue „🔴 Produktions-Alarm (Probealarm)" + (wenn eingerichtet) die Mail
erzeugen. Danach ohne Haken laufen lassen — das Issue muss von selbst zugehen:

```bash
gh workflow run production-watch.yml
```

Lokal, ohne CI (der zweite Befehl MUSS mit Exit 1 enden):

```bash
node scripts/ops/verify-health.mjs
```

```bash
PUKALANI_HEALTH_DRILL=1 node scripts/ops/verify-health.mjs
```

## 3 · Klickliste — nur David (Logins: GitHub, Resend, UptimeRobot)

**Befunde vom 2026-10-28 (Postfach und GitHub gelesen, bevor jemand klickt):**

- **Die ~900 roten Läufe KAMEN als Mail an — jeder einzelne.** GitHub
  schickt je Lauf „Run failed: Produktions-Wächter" (allein am 23./24.10.
  55 Mails in einem Thread, alle 30 min). Ein Gmail-Filter legt sie ohne
  Posteingang im Label „Newsletter/Web Development/GitHub" ab (3 132 Mails,
  2 150 ungelesen). Die Benachrichtigung war an; sie hieß „Newsletter".
- **Issue-Mails kommen NICHT an.** Für Issue #57 (Probealarm vom
  2026-10-28) gibt es keine Mail, und in 60 Tagen keine einzige Issue- oder
  PR-Mail zu `pukalani.app` — Actions-Mails ja, Issues nein. Der
  Issue-Alarm (§ 2, Schritt 1) erreicht heute also niemanden per Mail.
- **UptimeRobot HAT alarmiert.** Am 2026-10-16 um 11:47–11:51 UTC vier
  DOWN-Mails (demo „HTTP 502", comments, control, portfolio), Entwarnung am
  2026-10-24 — alle ungelesen im Posteingang. Der HTTP-Monitor auf
  `api.pukalani.app` blieb die ganze Zeit „UP" (99,95 % in der Woche
  18.–24.10.): der Gratis-Tarif prüft kein Zertifikat, und ein HTTP-Monitor
  liest keinen Rumpf — `200` mit `{"ok":false}` ist für ihn gesund. Der
  Alert Contact „Mail" funktioniert; gelesen hat ihn niemand.
- **SSL-Ablauf-Erinnerung gibt es nur in bezahlten Tarifen** (die DOWN-Mail
  vom 24.10. sagt es wörtlich: „Paid plans watch it and warn you 30, 14 and 7
  days"). Häkchen 4 ist damit eine Tarif-Entscheidung, kein Klick.
- Bestand laut Wochenbericht (7 Monitore): `api.pukalani.app/v1/health/
  version` (HTTP), `control.pukalani.app/api/health` (zeigt seit AH-4b auf
  die Wildcard), `Keyword on comments.pukalani.app/api/health`,
  `demo.pukalani.app`, `portfolio.pukalani.app`, `help.pukalani.app`,
  `pukalani.app` (alle `/api/health`). Fehlen: platform, account, admin,
  pukalani.studio, branding.supply.

Reihenfolge nach Wirkung. Jede Zeile ist unabhängig von den anderen.

- [x] **GitHub-Benachrichtigungen reparieren** (die eigentliche Lücke).
      ✅ 2026-11-08: Gmail-Filter lässt „Run failed"/„Produktions-Alarm" im
      Posteingang, Repo auf *Watch*, Mail-Haken bei *Watching* gesetzt —
      und trotzdem kam für die Probealarme #72 und #73 KEINE Mail (nur
      github.com/notifications). Ein Bot-Issue erreicht den Besitzer nur
      über „Watching", und das lieferte hier nicht. Deshalb WEIST der
      Workflow das Issue seitdem dem Repo-Besitzer ZU (`--assignee`,
      Commit `28ca655f`): Zuweisung zählt als „Participating" und kommt an
      wie jeder Review-Ruf. Beweis: Probealarm Lauf 42431586394 ⇒ Issue
      #75 ⇒ Mail im Posteingang um 00:51:39 UTC. Ursprüngliche Klickliste:
      (a) Gmail → Einstellungen → Filter: den Filter auf
      `notifications@github.com` so ändern, dass Mails mit Betreff
      „Run failed" oder „Produktions-Alarm" NICHT archiviert werden
      (Posteingang + als wichtig markieren); der Rest darf ins Label.
      (b) github.com → Settings → Notifications → „Subscriptions":
      *Watching* und *Participating, @mentions and custom* → E-Mail AN
      (heute kommt keine Issue-Mail); Repo → Watch → *All Activity* oder
      *Custom → Issues*. Beweis: ein Probealarm (§ 2) erzeugt eine Mail
      „[davidschubert/pukalani-app] 🔴 Produktions-Alarm (Probealarm) …
      (Issue #n)" IM POSTEINGANG.
- [x] **Resend → Alarm-Mail.** ✅ 2026-11-06: alle drei Einträge gesetzt,
      Probealarm (Lauf 42139629230, Issue #66) ⇒ Mail kam an, Mail-Wächter
      Blick 2 + 3 zählten im CI. Resend → API Keys → *Create* → Name
      `produktions-waechter`, Permission *Full access* (Sending reicht für die
      Alarm-Mail, aber der Mail-Zähler liest `GET /usage` und
      `GET /emails/metrics` und braucht Full access; EIN Schlüssel darf in beiden Secrets stehen). GitHub → Repo →
      Settings → Secrets and variables → Actions:
      Secret `PRODUCTION_ALARM_RESEND_KEY` = der Schlüssel,
      Secret `PRODUCTION_WATCH_RESEND_KEY` = derselbe Schlüssel,
      Secret `PRODUCTION_ALARM_MAIL_TO` (bis 2026-11-15 eine Variable) = deine
      Adresse. Absender ist `noreply@pukalani.app` (Domain bei Resend
      verifiziert). Beweis: Probealarm ⇒ Mail „🔴 Produktions-Alarm";
      täglicher Lauf zeigt „Resend: n Mails in 24 h". Im Terminal statt im
      Browser (Schlüssel nur als Eingabe, nie in Chat, Datei oder Commit):

      ```bash
      gh secret set PRODUCTION_ALARM_RESEND_KEY --env production-watch --repo davidschubert/pukalani-app
      gh secret set PRODUCTION_WATCH_RESEND_KEY --env production-watch --repo davidschubert/pukalani-app
      gh secret set PRODUCTION_ALARM_MAIL_TO --env production-watch --repo davidschubert/pukalani-app
      ```

      **Seit 2026-11-14 (GA1 P08) gehören alle Secrets des Wächters in die
      Umgebung `production-watch`** (`--env production-watch`; im Browser:
      Settings → Environments → production-watch), nicht mehr auf
      Repo-Ebene. Die Umgebung lässt nur den Zweig `main` zu. Auch die
      Empfänger-Adresse `PRODUCTION_ALARM_MAIL_TO` ist seit dem 2026-11-15
      ein SECRET dort und keine Variable mehr: GitHub druckt das `env:` eines
      Schritts in das öffentliche Protokoll, ein Secret als `***`, eine
      Variable im Klartext.
- [x] **UptimeRobot → Keyword-Monitore** (externer Poller, unabhängig von
      GitHub). ✅ 2026-11-08: zehn Keyword-Monitore, alle mit den Kontakten
      #8632224 (Mail) und #8862802 (iPhone-Push): platform #804590660,
      account #804590661, demo #804590662, admin #804590663,
      pukalani.studio #804590664, portfolio #804590665, branding.supply
      #804590666, pukalani.app #804590667, help #804590679,
      api.pukalani.app (Appwrite, Keyword `"version"`) #804590680.
      Gelöscht: api-HTTP, control, help-HTTP, comments. Die drei alten
      HTTP-Doppel `demo`/`portfolio`/`pukalani.app …/api/health`
      (#803598269, #803548618, #803598266) sind PAUSIERT, nicht gelöscht —
      David löscht sie, wenn er will. Dashboard: 10 Up · 3 Paused.
      Drei Fallen unterwegs (alle im Skript behoben, `34ab0130`,
      `808496cf`): die v2-API meldet AKTIVE Kontakte als „pausiert"
      (Status 1) — ohne `--contacts` wären die Monitore stumm angelegt
      worden; ein ungültiger Schlüssel kommt als `passed_value` in der
      Fehlerantwort zurück (das Skript tilgt ihn jetzt und prüft die Form
      vorab); der Gratis-Tarif bremst bei ~10 Aufrufen/min
      (`rate_limit_exceeded`, das Skript wartet und wiederholt).
      Per API mit dem *Main API key* (UptimeRobot → Integrations & API) —
      Schlüssel nur verdeckt eingeben (`read -rs`, zsh), nie in Chat oder
      Datei; erst der Plan, dann das Schreiben:

      ```bash
      read -rs "UPTIMEROBOT_API_KEY?UptimeRobot Main API key: " && export UPTIMEROBOT_API_KEY && echo && node scripts/ops/uptimerobot-sync.mjs
      ```

      ```bash
      node scripts/ops/uptimerobot-sync.mjs --apply --prune --contacts 8632224,8862802
      ```

      Das Skript zeigt je Alert Contact und Monitor, warum er schweigen
      könnte (unbestätigt, pausiert, ohne Kontakt, HTTP statt Keyword), legt
      je Host einen Keyword-Monitor an (Keyword `"ok":true`, Alarm wenn es
      FEHLT, 5 min, alle aktiven Kontakte; Appwrite: `/v1/health/version`,
      Keyword `"version"`), biegt vorhandene Keyword-Monitore um und ersetzt
      HTTP-Monitore; `--prune` löscht, was nicht im Soll steht (`control`,
      `comments`). Von Hand: je Host *Add New Monitor* → Type *Keyword* →
      URL `https://<host>/api/health` → Keyword `"ok":true` → Alert when
      keyword *not exists* → Interval 5 min. Dazu in der UptimeRobot-App
      einen zweiten Alert Contact *Push* anlegen — Mail allein lag am 16.10.
      acht Tage ungelesen.
- [x] **SSL-Ablauf — Entscheidung.** ✅ 2026-11-08: kein Bezahltarif —
      der eigene TLS-Wächter (Issue + Zuweisungs-Mail + Resend-Mail) ist
      der Weg; nachweislich angekommen beim Probealarm #75. Bucht David
      später „Solo", gilt die Alternative unten. UptimeRobot warnt vor dem Zertifikat-
      Ablauf nur im Bezahltarif (Solo). Entweder Tarif buchen und beim
      Monitor `api.pukalani.app (Appwrite)` *SSL expiry reminders* (30/14/7
      Tage) einschalten — oder bewusst beim eigenen TLS-Wächter bleiben, der
      seit MON1 ein Issue öffnet und (nach Häkchen 2) mailt. Zwei Wege
      bleiben Pflicht; der zweite ist dann die Mail über Resend, nicht
      UptimeRobot.
- [x] **Heartbeat.** ✅ 2026-11-08: Check `pukalani-production-watch`
      (Period 1 h, Grace 1 h, Kanäle E-Mail + Discord), Secret gesetzt um
      13:20 UTC; Lauf 42484572852 ⇒ „Heartbeat gesendet." (13:22:10 UTC),
      healthchecks.io zeigt den Ping unter „Last Ping". Die Gegenprobe
      (Ping bleibt aus ⇒ healthchecks meldet) ist NICHT gefahren — sie
      dauert Period + Grace = 2 h. https://healthchecks.io (kostenlos, 20 Checks): Check
      `production-watch`, Period 1 h, Grace 1 h, Mail + App als Kanal; die
      Ping-URL als Secret `PRODUCTION_WATCH_HEARTBEAT_URL` eintragen
      (`gh secret set PRODUCTION_WATCH_HEARTBEAT_URL --env production-watch
      --repo davidschubert/pukalani-app` oder Repo → Settings →
      Environments → production-watch; seit 2026-11-14 dort, s. o.). UptimeRobot-Heartbeats sind im
      Gratis-Tarif nicht bestätigt; `uptimerobot-sync.mjs --heartbeat`
      versucht es und zeigt die Antwort. Beweis: der nächste grüne Lauf zeigt
      „Heartbeat gesendet"; ein Probealarm lässt den Ping aus, nach dem
      Fenster meldet der Monitor.

Alle fünf Häkchen stehen seit 2026-11-08 — MON2 ist nach
[OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md) gezogen (Beweise dort).

## 4 · Wenn ein Alarm kommt

Zuerst den Lauf öffnen (Link im Issue) und lesen, WELCHER Blick rot ist.

**Alle Apps `ok:false` (oder `api.pukalani.app` rot im TLS-Blick).** Es ist
fast immer Appwrite. Prüfen:

```bash
curl -s https://api.pukalani.app/v1/health/version; echo; node scripts/ops/verify-tls.mjs api.pukalani.app
```

- Zertifikat abgelaufen/kurz davor: Appwrite erneuert NICHT von selbst, sobald
  die Domain-Regel einmal `unverified` ist (Vorfall 2026-10-16). Weg A ohne
  Mac: Actions → Produktions-Wächter → *Run workflow* (Zweig `main` — von
  einem anderen Zweig weist die Umgebung den Lauf ab) → Haken
  `appwrite_probe` (nur lesen), dann `appwrite_renew`; scheitert es an „Account
  not found", `appwrite_reset_account`. Der Job schickt seit 2026-11-14 nur
  noch das Wort; auf dem Server führt sshd dafür das Tor-Skript aus
  (`ops/appwrite-cert-gate.sh`), und das Protokoll zeigt bewusst wenig:
  erreichbar, Last, Platte, Container gezählt, vom Worker nur Zeilen des
  Zertifikats-Auftrags. Mehr sieht man nur am Server selbst (Weg B). Der Weg
  ist seit dem 2026-11-14 erstmals bewiesen (Lauf 43626911256); davor war der
  CI-Schlüssel auf diesem Server nie eingetragen. Weg B auf `ploi@188.245.61.155` in
  `~/appwrite`: Regel in `_console_rules` auf `verified`, Redis-Schlüssel der
  Regel löschen, `docker compose restart appwrite-worker`, dann
  `docker exec appwrite php app/cli.php ssl --domain=api.pukalani.app --skip-check=true`
  (Rezept mit allen Fallen: Memory `appwrite-prod-tls-cert-expired`,
  OPEN-ITEMS-COMPLETE „Vorfall appwrite-prod — TLS-Zertifikat", 2026-10-24).
- Instanz steht (kein `version`): `docker compose ps` dort; Platte voll?
  (`df -h`, ClickHouse-Vorfall 2026-09-28) — `docker compose up -d`.

**Ein einzelner Host `ok:false` / HTTP ≠ 200.** Auf `ploi@49.13.211.173`:
`pm2 ls`, `pm2 logs <prozess> --lines 50` (Namen: `platformpukalaniapp`,
`adminpukalaniapp`, `portfoliopukalaniapp`, `brandingsupply`, `pukalaniapp`,
`helppukalaniapp`; die Quelle der Namen ist `ops/apps.conf`). Letzter
Deploy rot? → `deploy.yml`-Lauf lesen;
`pm2 startOrReload ops/ecosystem-<app>.config.cjs --update-env`.

**Seit einem Ausliefern kaputt (Deploy rot mit „Ausgeliefert, aber nicht
gesund“, oder die Seite läuft, aber falsch).** Nicht zuerst die Ursache
suchen: zurückstellen mit `ops/rollback.sh <app>`, dann `git revert`. Die
Reihenfolge, die Grenzen und was ohne GitHub geht:
[DEPLOYMENT.md](DEPLOYMENT.md), Abschnitt A3 „Schlechter Stand live“.

**Datenbank passt nicht zum Programm** (Health-Blick: „schema: behind", oder
der Deploy endet rot mit diesem Satz). Die Seite läuft, aber ein Teil davon
kann kaputt sein: eine Route antwortet mit einem Fehler, oder eine Funktion
bleibt still aus. Fast immer ist neues Programm live gegangen, bevor seine
Migration gelaufen ist.

1. Herausfinden, was fehlt: am Mac `pnpm ops:schema-parity` — die Zeile
   „MIGRATION FEHLT" nennt Projekt und Migration (z. B. `branding …
   brand-027`). Ohne Mac: der tägliche Wächter-Lauf zeigt dieselbe Zeile, und
   im pm2-Log der App steht `schema.behind` mit derselben Angabe.
2. Ansehen, was der Runner tun würde (schreibt nichts):
   `pnpm migrate --app <app> --env ~/.appwrite-secrets/migrations/<projekt>.env --only <layer>-<NNN> --dry-run`
3. Mit Davids Ja nachholen: derselbe Aufruf mit `--prod` statt `--dry-run`.
   Die Apps und ihre Projekte: `platform` → `account`, `control` → `admin`,
   `portfolio` → `portfolio`, `branding` → `branding`. Der Runner bricht ab,
   wenn App und Datei nicht zusammenpassen.
4. Die App merkt es selbst: nach spätestens 30 Sekunden meldet `/api/health`
   wieder `schema: ok`, der nächste Halbstunden-Lauf schließt das Issue.

Meldet der Blick `unknown`, obwohl die Seite sonst gesund ist (`ok:true`),
konnte die App ihre Proben nicht abfragen: pm2-Log ansehen, und ob der
Laufzeit-Schlüssel der Site noch Zeilen lesen darf. Ist die Probe selbst
falsch (ein Tippfehler im Manifest sieht aus wie eine fehlende Migration),
zeigt das schon der lokale Lauf — Manifest korrigieren, ausliefern.

**Täglicher Schema-Abgleich rot, Health-Blick grün.** Dann fehlt etwas, das die
Proben nicht sehen (eine ältere Tabelle, eine Spalte der gemeinsam gepflegten
Tabellen), oder ein Schlüssel: „Schlüssel … fehlt" bzw. „nicht lesbar" heißt,
dass einer der vier `SCHEMA_WATCH_KEY_*` fehlt, gelöscht wurde oder seine
Rechte verloren hat (siehe Abschnitt 1).

**TLS auf einem ploi-Host.** Hinweis am Ende des Wächter-Laufs; Regeln in
`.claude/rules/hosts-ops.md` (Lineage-Falle: NIE auf `pukalani.app` oder
`platform.pukalani.app` anfordern, außer `*.pukalani.app` auf platform).

**Mail-Missbrauch.** Resend → Emails: die To-Spalte zeigt den Spam-Namen, der
Betreff das Appwrite-Projekt. Angreifer-IP in `audit_logs` der Instanz (nicht
in Appwrites `_audit`); Konten aufräumen mit `scripts/ops/purge-spam-accounts.mjs`
(läuft auf app-prod mit der Site-`.env`). Vorfall und Diagnose-Rezept:
OPEN-ITEMS-COMPLETE „Resend-Spam" (2026-10-27). Hält die Notbremse eine ECHTE
Anmeldewelle auf, Schwelle `MAIL_GLOBAL_HOUR_MAX` erhöhen — nicht die
Notbremse entfernen.

**Zeit-Lauf überfällig oder gescheitert.** Der Satz im Issue nennt App und
Kennung. Ein Zeit-Lauf ist eine Arbeit, die die App von selbst im Takt
erledigt; an einigen hängt etwas, das ein Kunde merkt:

| Kennung | App | Takt | Was daran hängt | Von Hand |
| --- | --- | --- | --- | --- |
| `trial-sweep`, `past-due-sweep` | control | 1 h | Ende der Testphase, Sperre bei Zahlungsverzug | `POST /api/control/sweeps/past-due` (nur der zweite) |
| `invite-request-prune`, `reporter-email-prune` | control | 1 h | Aufräumen, Frist 90 Tage für Melder-Adressen | – |
| `health-sweep` | control | 5 min | Prüft Kunden-Sites, mailt den Betreiber | – |
| `run-retention` | control | 1 h | Runner-Protokolle 30 / 90 Tage | `POST /api/runner/retention/run` |
| `label-reconcile` | platform | 1 h | Entzogene Lese-Rechte nachziehen | `POST /api/community/members/run-label-reconcile` |
| `past-due-notice` | platform | 1 h | Zahlungswarnung an Inhaber | `POST /api/community/billing/run-past-due-notice` |
| `guest-author-prune` | platform, branding | 1 h | Frist für Gast-Kontaktdaten | – |
| `email-digest` | control, platform, branding, portfolio (jede App mit Mail) | 30 min | Tages-Mail | `POST /api/notifications/run-digest` |
| `gdpr-export-prune` | control, platform, portfolio (jede App mit Ablage) | 1 h | Kopien gelöschter Konten nach 30 Tagen | `POST /api/admin/gdpr-exports/prune` |
| `entitlements-pull` | heute nirgends (die Adresse dafür ist auf keiner Site gesetzt) | 15 min | Plan-Funktionen | `POST /api/platform/entitlements/refresh` |
| `brand-check-erasure` | branding | 1 h | Prüfergebnisse nach 90 Tagen | `POST /api/brand/admin/check-erasure/run` |
| `brand-events-sweep` | branding | 24 h | Ereignisse nach 24 Monaten | `POST /api/brand/ops/events-sweep` |
| `market-raw-text-sweep` | branding | 30 min | Rohtexte nach 24 Stunden (Zusage) | `POST /api/market/ops/sweep` |
| `insights-radar` | branding | 24 h | Themenradar | `POST /api/insights/radar/run` |
| `insights-corrections-sweep`, `insights-subscribers-sweep` | branding | 24 h | Fristen für Korrekturen und Newsletter | – |

1. Den Grund lesen. Auf `ploi@49.13.211.173` steht er im Fehler-Log der App
   als Zeile `job.run` mit `"result":"failed"`, dem Namen des Fehlers und einer
   kurzen Meldung:
   `grep '"event":"job.run"' ~/.pm2/logs/<prozess>-error-*.log | grep '"job":"<kennung>"' | tail -3`
2. Scheitern MEHRERE Läufe derselben App zugleich, ist es fast nie der Lauf,
   sondern die Datenbank oder ein Schlüssel — dann ist meist auch der
   Health-Blick rot; dort weitermachen.
3. „Hat sich nie gemeldet": der Lauf meldet sich beim Start nur an, wenn sein
   Tor offen ist (Mailer eingerichtet, Ablage gesetzt, Schalter auf `apply`,
   die vier `NUXT_PLATFORM_CONTROL_*`). Fehlt eine Variable, sagt es der
   Env-Blick. Läuft er in dieser App bewusst nicht mehr, die Zeile aus
   `ops/timed-jobs.conf` nehmen.
4. „Der Lauf hängt": ein Takt ist nie zu Ende gegangen (meist ein Aufruf ohne
   Frist). Die App über ihre Ecosystem-Datei neu laden; der Lauf beginnt neu.
5. Ist die Ursache behoben, läuft der nächste Takt von selbst; wer nicht
   warten will, stößt den Lauf über die Route in der Tabelle an (angemeldet
   als Betreiber). Der nächste tägliche Lauf schließt das Issue, ein Lauf von
   Hand (`gh workflow run production-watch.yml`) sofort.

**Fehler in der App.** Der Satz nennt App und Zahl der Server-Fehler (5xx) in
25 Stunden. Auf dem Server:
`grep '"event":"server.error"' ~/.pm2/logs/<prozess>-error-*.log | tail -20` —
jede Zeile trägt Pfad, Methode und Status. Häuft sich EIN Pfad, ist es eine
Route (zuletzt ausgeliefert? dann zurückstellen, s. o.); sind es viele Pfade,
darunter `/api/health` mit 502, ist es die Datenbank — dann ist auch der
Health-Blick rot. Unter „Nur gezählt" stehen die Apps ohne scharfe Schwelle
und die Fehler aus dem Browser: kein Alarm, aber die Zahl, an der sich die
Schwelle später ausrichtet.

**KI fällt aus.** Status 402: bei OpenRouter ist das Guthaben aufgebraucht
oder das Monats-Limit eines Schlüssels erreicht — jeder bezahlte Aufruf
scheitert, bis aufgeladen oder das Limit angehoben ist (openrouter.ai →
Credits bzw. Keys; das Guthaben lädt sich nicht von selbst auf). Status 404:
ein Modell hat unter unseren Bedingungen keinen Endpunkt mehr —
`pnpm ops:ai-models` nennt es, weiter unter „KI-Modelle" in Abschnitt 1. Wer
KI-Kosten sofort stoppen will: der Abschalter `app_config.brandAiEnabled`
(Zeile `ai.disabled` zählt dann mit). Ein Blick auf das Guthaben im Voraus
ist bewusst nicht gebaut: OpenRouter gibt es nur einem Verwaltungs-Schlüssel
heraus, und der kann auch Schlüssel anlegen und löschen.

**In die App hinein — keine Zahlen.** Der Blick konnte für eine App nicht
zählen. „Prozess läuft nicht" / „pm2 kennt den Prozess nicht": auf dem Server
`pm2 ls`, dann `pm2 startOrReload /home/ploi/<site>/ops/ecosystem-<app>.config.cjs --update-env`.
„Andere Version": Zähl-Skript und Auswertung passen nicht zusammen — ein
Ausliefern steht aus oder ist gescheitert (`deploy.yml`-Lauf lesen). „Nicht
erreichbar" oder „nicht in der festen Form": den Lauf von Hand wiederholen;
bleibt es, am Mac `node scripts/ops/verify-app-signals.mjs --ssh` und
`ssh ploi@49.13.211.173 'node /home/ploi/<site>/ops/app-watch-counts.mjs <prozess>'`.

**Live-Verbindung (Realtime).** Kommentare, Anwesenheit und Benachrichtigungen
kommen nicht mehr live an; die Seiten selbst laufen.

1. Stand lesen, ohne Mac: Actions → Produktions-Wächter → *Run workflow* mit
   Haken `appwrite_probe` (Container, Platte, Last). Am Mac:
   `ssh ploi@188.245.61.155 '~/bin/pukalani-cert-gate.sh realtime-status'`
   und `tail -20 ~/ops/logs/realtime-watchdog.log` dort.
2. `aufgegeben` oder „Neustart hat nicht geholfen": die Ursache liegt nicht am
   Container. Reihenfolge: Platte voll (`df -h`, ClickHouse-Vorfall
   2026-09-28)? Laufen `appwrite`, `traefik`, `redis` (`docker compose ps` in
   `~/appwrite`; am 2026-10-24 hatte ein Paket-Update sie angehalten —
   `docker compose up -d`, nie den Docker-Dienst neu starten)? Zertifikat von
   `api.pukalani.app` (TLS-Blick)? Sobald ein Handshake wieder gelingt, setzt
   der Wächter seinen Zähler selbst zurück.
3. „Zeitplan läuft nicht": `crontab -l` dort — die Zeile mit
   `realtime-watchdog.sh` muss stehen (Wortlaut im Kopf des Skripts).
4. Wiederholte Neustarts, die helfen: der Container stirbt immer wieder
   (`docker compose logs --tail 200 appwrite-realtime`). Jeder Neustart trennt
   alle offenen Verbindungen; die Browser verbinden sich neu.
5. Nur der Blick von außen ist rot, der Wächter meldet `ok`: der Weg von außen
   ist gestört (Zertifikat, Proxy), nicht Realtime selbst — der Wächter prüft
   lokal, ohne TLS.

**Backup rot.** Die Fehlerzeile im Lauf nennt den Grund: „GESCHEITERT (Schritt:
…)“ oder „… h alt“. Auf dem Appwrite-Server `~/ops/appwrite-backup.sh --status`
und `tail -30 ~/ops/logs/appwrite-backup.log`; die Tabelle der Schritte steht in
[APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md), § 6.3. Ein
gescheiterter Lauf lässt alle früheren liegen — es eilt, aber es brennt nicht.
Ist der Lauf nur zu alt und das Protokoll endet mit dem Vortag, lief der
Zeitplan nicht: `crontab -l` dort ansehen, dann EIN Lauf von Hand
(`… appwrite-backup.sh --run`, mit den Variablen aus der crontab-Zeile).

**Env / Zugänge / Admin-Konto rot.** `docs/runbooks/ZUGAENGE-AUFRAEUMEN.md`
bzw. die Pflichtliste in `scripts/ops/verify-site-env.mjs`.

**Probealarm vergessen aufzuräumen?** Ein Lauf ohne Haken schließt das Issue.
