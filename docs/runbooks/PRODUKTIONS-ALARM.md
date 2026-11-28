# Produktions-Alarm: Wächter, Alarmweg, Klickliste

**Wann.** Wenn ein Issue mit dem Label `produktions-alarm` aufgeht, wenn eine
Alarm-Mail kommt, wenn UptimeRobot meldet — und einmal zum Einrichten (die
Klickliste unten, nur David). Wer David vertritt, beginnt bei § 5.

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
| Mail-Missbrauch | `scripts/ops/verify-mail-breaker.mjs` | täglich | Notbremse `auth.mail_route_breaker` in den Log-Dateien der LAUFENDEN Prozesse, letzte 25 h (je App gezählt vom Zähl-Skript `ops/app-watch-counts.mjs`, seit 2026-11-18 nicht mehr per `grep` über den ganzen Log-Ordner); mit Resend-Secret zusätzlich ≥ 80 % der Tagesgrenze in 24 h (heute 80 von 100, Grenze aus `GET /usage`) und ≥ 3 Bounces / ≥ 1 Beschwerde (`GET /emails/metrics`) |
| KI-Modelle | `scripts/ops/verify-ai-models.mjs` | alle 30 Minuten (seit 2026-11-19, vorher täglich; Quelle `alarm:tls`) | ein konfiguriertes Modell steht nicht mehr in OpenRouters Liste ohne Datenspeicherung, oder es hat keinen der Endpunkte mehr, auf die der Code es festlegt (Text: zwei EU-Endpunkte · Bild- und Videolesen: `google-vertex/eu` · Bild-Erzeugen: `google-vertex/global`). Gelesen werden je Modell zwei Listen, die weltweite und die der Europa-Adresse. Ohne ssh, ohne Secret. Ist OpenRouter nicht erreichbar, bleibt der Blick grün und schreibt eine Warnung (Exit 2) |
| Bot-Prüfung | `scripts/ops/verify-turnstile.mjs` | täglich | auf einer Site antwortet die Passwort-vergessen-Route ohne Token nicht mit 403 `bot_check_required` (Bot-Prüfung aus oder Cloudflare nicht erreichbar), oder die Seite trägt das Widget nicht (Gäste ausgesperrt); eine unklare Antwort bekommt nach 20 s einen zweiten Versuch |
| Datenbank-Stand (gründlich) | `scripts/ops/verify-schema-parity.mjs --ci` | täglich | in einem der vier Projekte fehlt eine Soll-Tabelle, eine Spalte, die eine Migration ihrer Layer anlegt, oder die Probe eines Layers (dann nennt die Zeile die Migration, z. B. `brand-026`); oder dort steht eine Spalte, die keine Migration anlegt; oder einer der vier nur lesenden Schlüssel fehlt oder liest nicht mehr |
| In die App hinein | `scripts/ops/verify-app-signals.mjs` (zählt auf dem App-Server mit `ops/app-watch-counts.mjs`) | täglich | ein Zeit-Lauf hatte seit mehr als zwei Takten plus 30 Minuten keinen guten Lauf; ein Tages-Lauf ist zuletzt gescheitert; ein erwarteter Lauf hat sich nie gemeldet; ein KI-Aufruf wurde mit Status 402 (kein Guthaben) oder 404 (kein Endpunkt) abgelehnt; auf `platform` ab 25 Server-Fehlern (5xx) in 25 Stunden; ein Prozess läuft nicht oder das Zähl-Skript antwortet nicht. **Zählt nur** (wird berichtet, nicht rot): Server-Fehler der fünf anderen Apps, Fehler aus dem Browser, Berichte der Skript-Regel, übrige KI-Ausfälle, Zeit-Läufe, die nach einem Start noch auf ihren ersten Lauf warten, und eine Zählung, die nicht über die vollen 25 Stunden zurückreicht |
| Live-Verbindung von außen | `scripts/ops/verify-realtime.mjs --handshake` | alle 30 min | drei WebSocket-Handshakes gegen `api.pukalani.app` in Folge gescheitert (der dritte erst nach 5½ Minuten). Ohne ssh, ohne Secret |
| Realtime-Wächter | Tor-Wort `realtime-status` (`ops/appwrite-cert-gate.sh`), ausgewertet von `verify-realtime.mjs` | täglich | der Wächter auf dem Appwrite-Server hat aufgegeben; sein letzter Neustart half nicht; drei oder mehr Neustarts in 24 Stunden; sein letzter Lauf ist älter als 20 Minuten; kein lesbarer Stand |
| Nächtliches Backup | Tor-Wort `backup-status` (`ops/appwrite-cert-gate.sh`) | täglich | der letzte Backup-Lauf der Appwrite-Instanz ist gescheitert, oder der letzte gute Lauf ist zu alt: im täglichen Lauf älter als 6 Stunden (verlangt wird der Lauf DIESER Nacht, 03:30 UTC), bei einem Start von Hand älter als 26 Stunden |
| Server-Einstellungen | `scripts/ops/verify-server-config.mjs` (vergleicht auf den Servern mit `ops/nginx-check.mjs`, `ops/cron-check.sh` und dem Tor-Wort `cron-status`) | täglich | einer Site fehlt eine Pflicht-Zeile der Webserver-Vorlage (`ops/nginx/`), oder der Webserver setzt eine Schutz-Kopfzeile selbst oder beantwortet `/robots.txt` in einem eigenen Block (Regel `eigene-robots`, seit 2026-11-20); auf dem App-Server liegt eine Site, die `ops/nginx-sites.conf` nicht kennt; ein Zeitplan aus `ops/cron.conf` fehlt, steht doppelt, oder es gibt einen unbekannten. Verglichen werden Pflicht-Zeilen, nicht Zeichen — ein Handgriff in Ploi (Zertifikat, Alias) macht den Blick nicht rot |
| Anmelde-Wege der Datenbank | `scripts/ops/verify-auth-methods.mjs` | täglich | in einem der vier Projekte nimmt die Datenbank eine Anmeldung ohne Schlüssel wieder an (Antwort 401 statt 501), oder die Probe bekommt eine unerwartete Antwort. Je Projekt ein Aufruf von außen mit erfundenen Zugangsdaten; legt nichts an. Störung (429, 5xx) ist „keine Aussage" |
| Anmelde-Regeln der Datenbank | `scripts/ops/appwrite-auth-policies.mjs --ci` | täglich | in einem der vier Projekte weicht eine Passwort-, Adress- oder Sitzungs-Regel vom Soll im Skript ab, oder der Blick kann die Regeln nicht lesen (Schlüssel oder Leserecht fehlt). Nur lesend, mit den vier Schlüsseln des Schema-Blicks |
| Schutz-Kopfzeilen | `scripts/ops/verify-security-headers.mjs` | täglich | auf einem Host kommt eine Schutz-Kopfzeile (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) nicht genau einmal an — auf einer Seite, auf `/api/health` oder auf einer Datei unter `/_nuxt/` —, oder es kommt eine, die niemand mehr senden soll (`X-Frame-Options`, `X-XSS-Protection`, `x-powered-by`). Ohne ssh, ohne Secret. Ein Host, der gerade nicht antwortet, sagt hier nichts aus |
| Auslieferung | `scripts/ops/verify-delivery.mjs` | täglich | Je öffentlichem Host von außen (scharf seit 2026-11-20, `PUKALANI_DELIVERY_MODE: alarm` im Workflow): ein Skript unter `/_nuxt/` kommt ohne `content-encoding` an; `/robots.txt` antwortet nicht mit 200, enthält keine Regel oder nennt (wo der Host eine hat) keine Sitemap des eigenen Hosts; die Seite trägt nicht genau ein `og:image`, oder das Bild antwortet nicht mit 200; die Symbol-Route der App reicht ein fehlendes Symbol an einen fremden Dienst weiter. Ohne ssh, ohne Secret. Ein Host, der gerade nicht antwortet, sagt hier nichts aus |
| Node-Version des App-Servers | `scripts/ops/verify-node-version.mjs` (fragt das Tor-Wort `node-version` von `ops/app-watch-gate.sh`) | täglich | das Programm `/usr/bin/node` oder ein pm2-Prozess einer App läuft mit einer anderen Node-Version als `.nvmrc` — auch mit einer neueren. Ein Prozess, der fehlt, ist nur eine Warnzeile. Ist der Server nicht erreichbar oder kennt sein Tor das Wort noch nicht, bleibt der Blick grün und schreibt eine Warnung (Exit 2) |

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
- `audit.write_failed` (seit 2026-11-16, BE-021), wenn ein Eintrag ins
  Betreiber-Protokoll `audit_logs` scheitert — Zeile `protokoll ausfaelle=<n>`,
  rot ab 3 in 25 Stunden (Abschnitt 4, „Betreiber-Protokoll fällt aus").
- `soft_fail` (seit 2026-11-21, Q13), wenn eine Stelle im Server einen Fehler
  abfängt und mit ihrem Ersatzwert weitermacht (`.catch(softFail(…))`,
  `packages/core/server/utils/softFail.ts`) — Zeile
  `stillefehler zeilen=<n> stellen=<m>`, zählt nur (Abschnitt 4, „Still
  abgefangene Fehler").

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
  Tabellen- und Spaltenliste und nennt, was fehlt; die Spalten vergleicht er
  mit dem, was die Migrationen der Layer der App anlegen (fehlt eine, oder
  steht eine ohne Migration da, ist er rot). Dafür liegen in der
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

**Bot-Prüfung (seit 2026-11-16, OPS-012).** Ein roter Blick heißt: auf der
genannten Site fehlt eine der zwei Turnstile-Variablen, oder der Prozess hat
sie nach einer Änderung nicht neu geladen. „AUS" (200 ohne Token) ist der
dringende Fall: Registrierung, Passwort-vergessen und die öffentlichen
Formulare laufen dann ohne Hürde. „403, aber kein Widget" sperrt Gäste aus.
Rezept: [DEPLOYMENT.md](DEPLOYMENT.md), Abschnitt Turnstile; nachprüfen mit
`pnpm ops:turnstile <site>`. Der Blick ruft je Site einmal am Tag die
Passwort-vergessen-Route mit einer Probe-Adresse auf — keine Mail, kein Konto.

**Server-Einstellungen (seit 2026-11-16, OPS-003).** Webserver-Einstellungen
und Zeitpläne standen bis dahin nur auf den Servern. Jetzt stehen im Repo:
die Vorlagen je Site-Art (`ops/nginx/`), die Liste der Sites mit Port und
Zugriffs-Log (`ops/nginx-sites.conf`) und die Liste der Zeitpläne je Server
(`ops/cron.conf`). Verglichen wird AUF den Servern, von zwei festen Skripten,
die nur lesen und nur Zahlen, Site-Namen aus der Liste und Regel-Namen
ausgeben — nie eine Zeile aus einer nginx-Datei oder einem crontab (das
Protokoll des Laufs ist öffentlich; Kundendomains erscheinen nur als Nummer):
`ops/nginx-check.mjs` und `ops/cron-check.sh` auf dem App-Server (der Deploy
legt sie neben die Ecosystem-Datei), auf dem Appwrite-Server das Tor-Wort
`cron-status`. Gelesen werden beide Quellen für Zeitpläne: der crontab von
`ploi` und `/etc/crontab` (dorthin schreibt Ploi seine „Cronjobs").
Probealarm: `gh workflow run production-watch.yml -f config_drill=true`
(täuscht eine fehlende Pflicht-Zeile vor, auf dem Server fehlt nichts).
Neue Site, Kundendomain, neuer Zeitplan: [NEUE-SITE.md](NEUE-SITE.md).

**Node-Version des App-Servers (seit 2026-11-19).** `.nvmrc` nennt eine
exakte Node-Version für den eigenen Rechner, die CI und den App-Server; auf
dem Server hebt sie niemand von selbst. Das Wächter-Tor antwortet auf das
Wort `node-version` mit der Version des Programms `/usr/bin/node` und je
pm2-Prozess einer App mit der Version, mit der er läuft — nur Versionsnummern,
Zahlen und Prozess-Namen aus der App-Liste. Von Hand:
`node scripts/ops/verify-node-version.mjs`. Probealarm:
`gh workflow run production-watch.yml -f node_drill=true` (tut so, als liefe
der Prozess der ersten App mit einer anderen Version; auf dem Server ändert
das nichts).

**Schutz-Kopfzeilen (seit 2026-11-16, SEC-006).** Die Kopfzeilen setzt die
App selbst, für jede Antwort gleich
(`packages/core/server/plugins/security-headers.ts`): `nosniff`,
`Referrer-Policy`, `Permissions-Policy` und HSTS überall, auf Seiten dazu
die Regel zum Einbetten (`frame-ancestors`) und eine Skript-CSP, die nur
beobachtet (Report-Only). Seit 2026-11-17 schickt der Browser jeden Verstoß
an `/api/telemetry/csp-report`; die App schreibt je Verstoß und Stunde eine
Zeile `csp.report`, und der Blick „In die App hinein" nennt die Zahl je App
unter „Skript-Regel" (zählt nur). Welche Quelle auf welcher Seite:
`grep '"event":"csp.report"' ~/.pm2/logs/<prozess>-error-*.log | tail -20`. Im Webserver steht dazu NICHTS mehr; die Vorlagen verbieten
`add_header` für diese Namen. Der Blick zählt von außen roh nach, weil ein
Test im Repo den Webserver davor nicht sieht. Von Hand:
`node scripts/ops/verify-security-headers.mjs [host]`.

**Auslieferung (seit 2026-11-20).** Tests im Repo prüfen, was die App
erzeugt — nicht, was beim Browser ankommt. Vier Dinge waren deshalb lange
falsch, ohne dass etwas rot wurde: Skripte kamen ungepackt an (der Webserver
kannte ihren Dateityp nicht), die `robots.txt` der Landing beantwortete der
Webserver selbst, zwei Sites hatten kein Vorschaubild für geteilte Links, und
ein Symbol, das der Server nicht kennt, fragte der Browser bei einem fremden
Dienst an. Seitdem packt die App ihre Dateien beim Bauen selbst
(`nitro.compressPublicAssets` in `packages/core/nuxt.config.ts`; der
Webserver reicht sie durch), der Abruf fehlender Symbole ist aus
(`icon.fallbackToApi: false`, Wächter `pnpm check:icons`), und der Blick
prüft je öffentlichem Host von außen vier Dinge: `gepackt`, `robots`,
`vorschau`, `symbole`. Welcher Host was schuldet, steht in `HOSTS` des
Skripts (die Betreiber-Oberfläche hat keine Sitemap und kein Vorschaubild,
der Kundenbereich keine Sitemap). Im Workflow steht
`PUKALANI_DELIVERY_MODE: alarm` (seit 2026-11-20 besteht jeder Host);
`count` macht aus einem Befund nur eine Zeile „Nur gezählt" — der Weg, einen
neuen Host oder eine neue Prüfung einzuführen, ohne dass der Blick vorher
rot wird. Die Symbol-Route hält ihre Antworten eine Woche vor: eine
vorgehaltene Ablehnung kommt mit Status 200 und dem Text
`{"statusCode":404}` zurück, deshalb wertet der Blick den Inhalt aus, nicht
den Status. Von Hand: `node scripts/ops/verify-delivery.mjs [host]`.
Probealarm: `gh workflow run production-watch.yml -f delivery_drill=true`.

**Erinnerungen in nicht erreichbaren Communities (seit 2026-11-19, SE1 d —
zählt nur).** Der stündliche Lauf `event-reminders` der Platform-App erkennt
Termine stillgelegter oder wegen Missbrauchs gesperrter Communities. Heute
erinnert er dort noch weiter und zählt nur. Der Blick „In die App hinein"
nennt in der Übersicht „Termine nicht erreichbar" und unter „Nur gezählt"
einen Satz: so viele Takte gemeldet, so viele davon mit Frage ans Control
Plane, so viele ohne Antwort, so viele Termine (und wie viele Erinnerungen
im Zähl-Modus trotzdem gesendet wurden). Rot wird davon nichts. So liest man
ihn: „0 mit Frage" heißt nur, dass kein Termin fällig war — das sagt nichts
über die Erkennung. „Ohne Antwort" über mehrere Tage heißt, die Platform-App
erreicht das Control Plane für diese Frage nicht (erinnert wird dann wie
früher). Woran das Scharfstellen hängt: OPEN-ITEMS „SE1" d.

**KI-Modelle (seit 2026-11-14, BE-004; seit 2026-11-19 alle 30 Minuten im
Job `tls`, ein Befund trägt also `alarm:tls` und schließt sich mit dem
nächsten grünen Halbstunden-Lauf).** Ein roter Blick heißt: in den
öffentlichen Listen des Vermittlers fehlt ein Endpunkt, auf den der Code ein
Modell festlegt. Meist scheitert dann JEDER Aufruf dieser Funktion, obwohl
sie eingeschaltet ist (der Aufruf endet beim Vermittler mit 404, die
Oberfläche zeigt „KI gerade nicht verfügbar"). ERST MESSEN, DANN TAUSCHEN:
am 2026-11-18 war der Blick für fünf Modell-Wahlen rot, und kein Aufruf
scheiterte — der Vermittler hatte die Europa-Endpunkte nur aus der Liste
seiner weltweiten Adresse genommen und führt sie seitdem auf
`eu.openrouter.ai` (der Blick liest seither beide Listen). Zwei schnelle
Proben: der tägliche Blick „In die App hinein" zählt die KI-Ausfälle je App
(0 heißt: nichts ist gescheitert, oder niemand hat es benutzt), und die
Endpunkt-Liste des Modells auf der Europa-Adresse zeigt, ob es die Namen
noch gibt. Die Ausgabe nennt Modell, Konfigurationsdatei und Feld, die
verlangten und die vorhandenen Endpunkte (mit „(Europa-Liste)", wenn ein
Endpunkt nur dort steht). Reparatur, wenn wirklich etwas fehlt: entweder ein Modell
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

**Kundendomains (seit 2026-11-18, WA1 d).** Die Host-Listen des TLS- und des
Health-Blicks sind von Hand gepflegt. Der Job `kundendomains` liest alle 30
Minuten zusätzlich die live geschalteten Kundendomains aus dem Control Plane
(`GET /api/control/watch/hosts` auf `admin.pukalani.app`, nur mit Geheimnis,
nur Host-Namen) und prüft sie mit denselben zwei Skripten
(`--nur-kundendomains`). Die feste Liste bleibt; der Job `tls` läuft weiter
ohne Secret.

- **Ohne Geheimnis** (Secret `PRODUCTION_WATCH_HOSTS_SECRET` in der Umgebung
  `production-watch`, derselbe Wert als `NUXT_CONTROL_WATCH_HOSTS_SECRET` auf
  der Site `admin.pukalani.app`) oder ohne Antwort der Route steht im Lauf
  eine Zeile „Kundendomains: nicht gelesen — …", und der Job ist grün.
- **Kein Name im Protokoll.** Die Protokolle der Läufe und das Alarm-Issue
  sind öffentlich. Eine Kundendomain heißt dort „Kundendomain 3/5" (ihre
  Stelle in der nach Name sortierten Liste). Den Namen gibt es an zwei
  privaten Stellen: in einer eigenen Mail „Betroffene Kundendomains" an die
  Alarm-Adresse, wenn ein Alarm neu aufgeht (Job `kundendomains-namen`), und
  von Hand am eigenen Rechner (`--namen`, siehe „Kundendomain rot").
- **Scharf seit 2026-11-28.** Im Job steht `PUKALANI_CUSTOMER_HOSTS_MODE:
  alarm`: geprüft wird nur, was die feste Liste nicht schon kennt, und ein
  Befund ist rot. Davor lief der Job eine Woche mit `count` (alle Hosts der
  Route, ein Befund nur eine Zeile „Nur gezählt") ohne einen einzigen Befund
  (COMPLETE „WA1"). Wird er ohne echten Grund rot: dort zurück auf `count`.
- **Probealarm:** `gh workflow run production-watch.yml -f kunden_drill=true`
  — tut so, als wäre das Zertifikat der ersten Kundendomain abgelaufen, und
  prüft die Kette samt der Mail mit dem Namen. Braucht das Geheimnis; ohne es
  bleibt der Lauf grün.
- **Das Geheimnis tauschen:** neuen Wert erzeugen, zuerst auf der Site setzen
  und die App neu laden, dann das Secret bei GitHub ersetzen. Dazwischen
  meldet der Job „nicht gelesen — das Control Plane hat das Geheimnis
  abgelehnt (401)" und bleibt grün.

## 1b · Der zweite Alarm: die Bühne (`.github/workflows/buehne.yml`, seit 2026-11-17)

Kein Blick auf Production, sondern auf das PROGRAMM: der Lauf „Bühne
(Kundenpfad)" baut auf einer Wegwerf-Datenbank zwei Probe-Communities auf und
fährt die Beweis-Skripte dagegen (bei jedem Pull Request und auf `main` die
kurzen, jede Nacht um 01:41 UTC auch die langen). Rot auf `main` oder nachts
⇒ der Job `alarm` DIESES Workflows öffnet ein Issue mit dem Label
`buehne-alarm` (eines, solange es offen ist; jeder weitere rote Lauf
kommentiert; der nächste grüne Lauf schließt es — war ein NACHT-Lauf rot,
trägt das Issue zusätzlich `buehne-alarm-nacht`, und nur ein grüner
Nacht-Lauf schließt es: der kurze Lauf auf `main` fährt die Nacht-Skripte
nicht, ein grüner kurzer Lauf kommentiert nur). Ohne Secret, ohne Mail,
ohne Heartbeat — das Issue ist dem Repo-Besitzer zugewiesen. Ein roter Lauf
an einem Pull Request öffnet nichts; ein verdrängter Lauf („cancelled") auch
nicht.

**Was zu tun ist, wenn `buehne-alarm` offen ist:** den verlinkten Lauf
öffnen. Die Zusammenfassung zeigt je Beweis-Skript „bestanden" oder
„fehlgeschlagen" mit Zählung; der rote Schritt nennt die letzten Zeilen des
Skripts. Dann eines von zwei: (1) das Skript ist veraltet (eine Regel hat sich
bewusst geändert) ⇒ Skript anpassen; (2) eine Zusage des Kundenpfads hält
nicht mehr ⇒ das ist ein Fehler im Programm, der letzte Merge ist der erste
Verdächtige. Von Hand nachstellen: `pnpm buehne up`, `pnpm buehne run --only
<name>`, `pnpm buehne down` (docs/referenz/LIVE-BEWEISE.md, Abschnitt „Die
Bühne"). Production ist davon nicht berührt — ob dort etwas kaputt ist, sagt
weiter nur `produktions-alarm`.

**Probealarm:** `gh workflow run buehne.yml -f alarm_drill=true` öffnet das
Issue mit dem Zusatz „PROBEALARM"; ein zweiter Lauf ohne den Schalter
schließt es wieder. Nach jeder Änderung an `buehne.yml` einmal fahren.

## 1c · Der dritte Alarm: Geheimnisse in einem Zweig (`.github/workflows/secrets-watch.yml`, seit 2026-11-18)

Die Pflicht-Prüfung `secrets` liest je Pull Request nur noch den eigenen
Zweig (Davids Entscheidung 2026-11-18; vorher hielt ein Fund in irgendeinem
Zweig jeden Pull Request und jedes Ausliefern auf). Damit ein Zweig, der nie
ein Pull Request wird, trotzdem gelesen wird, liest dieser Lauf jeden Tag um
02:23 UTC ALLE Zweige und Tags. Rot ⇒ der Job `alarm` DIESES Workflows öffnet
ein Issue mit dem Label `geheimnis-alarm` (eines, solange es offen ist; jeder
weitere rote Lauf kommentiert; der nächste grüne Lauf schließt es). Ohne
Secret, ohne Mail — das Issue ist dem Repo-Besitzer zugewiesen. Der Lauf hält
weder das Zusammenführen noch das Ausliefern auf.

**Was zu tun ist, wenn `geheimnis-alarm` offen ist:** den verlinkten Lauf
öffnen. Er nennt Datei, Zeile, Regel und Commit; der Wert ist geschwärzt.
Zuerst klären, ob es ein echtes Geheimnis ist. **Ein echtes wird rotiert** —
das Repo ist öffentlich, der Wert gilt als bekannt
([CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md),
[SICHERHEITSVORFALL.md](SICHERHEITSVORFALL.md)); erst danach wird aufgeräumt.
Ein erfundener Testwert: den Zweig auf origin löschen und sauber neu
aufsetzen (ein Commit ohne den Wert).

**Probealarm:** `gh workflow run secrets-watch.yml -f alarm_drill=true` öffnet
das Issue mit dem Zusatz „PROBEALARM"; ein zweiter Lauf ohne den Schalter
schließt es wieder. Nach jeder Änderung an `secrets-watch.yml` einmal fahren.

## 2 · Der Alarmweg (Job `alarm`, läuft nach jedem Wächter-Lauf)

1. **Issue.** Ist irgendein Wächter rot, öffnet der Job EIN Issue mit Label
   `produktions-alarm` (kein zweites, solange es offen ist; alle 12 h ein
   Kommentar „weiterhin rot"). Ist alles wieder grün, kommentiert er
   „Entwarnung" und schließt es. **Offenes Issue = Alarm aktiv.** Braucht
   kein Secret — nur `issues: write` des Workflow-Tokens.
   **Weshalb es offen ist, steht als Label am Issue** (seit 2026-11-19): je
   Quelle eines — `alarm:tls` und `alarm:kundendomains` (alle 30 Minuten
   geprüft), `alarm:server` (der tägliche Teil). Ein Lauf ändert nur, was er
   gemessen hat: Job rot ⇒ Label dazu, Job grün ⇒ Label weg, Job nicht
   gelaufen ⇒ Label bleibt. Geschlossen wird mit dem letzten Label.
   **Ein Issue mit `alarm:server` schließt deshalb nur ein Lauf, in dem der
   tägliche Teil gelaufen UND grün ist** — der Tageslauf um 04:17 UTC oder
   ein Lauf von Hand (`gh workflow run production-watch.yml`). Der
   Halbstunden-Lauf lässt es offen und schreibt keine Entwarnung; im
   Protokoll steht dann „bleibt offen: 'server' ist in diesem Lauf nicht
   geprüft worden". Waren beide Teile rot, nimmt jeder Lauf seinen Teil weg
   und schreibt einen Kommentar, was grün wurde und was offen bleibt. Wer
   einen Befund aus dem täglichen Teil behoben hat, startet also einen Lauf
   von Hand, statt auf den nächsten Morgen zu warten. Ein offenes Issue ohne
   eines dieser Labels (von Hand geöffnet) schließt der erste Lauf ohne
   roten Job. Die Regel mit ihren Tests: `scripts/ops/alarm-issue.mjs`. Seit 2026-11-16
   steht im Issue unter „Was zu tun ist" je rotem Befund der Blicke „In die
   App hinein" und „Live-Verbindung" EIN Satz mit dem Handgriff und dem
   Abschnitt in diesem Runbook; die älteren Blicke nennt weiter nur der Lauf.
2. **Mail bei jedem Wechsel** (Alarm / Entwarnung, nie im Takt) über Resend —
   sobald die Secrets `PRODUCTION_ALARM_RESEND_KEY` und
   `PRODUCTION_ALARM_MAIL_TO` gesetzt sind (Klickliste). Vorher steht im Lauf
   eine gelbe Warnung „Mail-Alarm nicht eingerichtet". Das Secret darf seit
   dem 2026-11-17 eine Kommaliste sein (mehrere Empfänger, § 5).
3. **Heartbeat bei jedem grünen Lauf** an `PRODUCTION_WATCH_HEARTBEAT_URL`
   (Klickliste). Das ist der einzige Weg, der auch meldet, wenn der Workflow
   GAR NICHT mehr läuft (GitHub schaltet Zeitpläne nach 60 Tagen ohne Commit
   ab; eine kaputte cron-Zeile; ein Runner-Ausfall). „Grün" meint den LAUF,
   nicht das Issue: ein Halbstunden-Lauf ohne roten Job schickt den Heartbeat
   auch, während ein Issue aus dem täglichen Teil offen ist.

**Probealarm — monatlich, und nach jeder Änderung am Workflow:**

```bash
gh workflow run production-watch.yml -f alarm_drill=true
```

Das macht den Health-Blick sicher rot (Host `probealarm.invalid`) und muss ein
Issue „🔴 Produktions-Alarm (Probealarm)" mit dem Label `alarm:tls` + (wenn
eingerichtet) die Mail erzeugen. Danach von Hand ohne Haken laufen lassen —
das Issue muss von selbst zugehen:

```bash
gh workflow run production-watch.yml
```

**„Der nächste Lauf ohne Haken räumt auf" heißt in diesem Runbook immer:
dieser Lauf von Hand.** In ihm laufen alle drei Jobs, er schließt also jeden
Probealarm sofort. Der Halbstunden-Takt räumt nur Probealarme auf, die den
täglichen Teil nicht betreffen (`alarm_drill`, `schema_drill`,
`kunden_drill`); ein Probealarm des täglichen Teils (`backup_drill`,
`signals_drill`, `config_drill`, auch `realtime_drill`, der beide Teile rot
macht) bleibt sonst bis zum Tageslauf um 04:17 UTC offen.

**Nach einer Änderung am Alarmweg selbst** (Job `alarm`,
`scripts/ops/alarm-issue.mjs`) beide Teile proben: erst
`-f signals_drill=true`, einen Halbstunden-Lauf abwarten (das Issue muss
OFFEN bleiben, ohne Entwarnung), dann der Lauf von Hand ohne Haken (schließt);
danach `-f alarm_drill=true` und wieder der Lauf von Hand.

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
  (Rezept mit allen Fallen: OPEN-ITEMS-COMPLETE „Vorfall appwrite-prod —
  TLS-Zertifikat", 2026-10-24; der Container heißt seit Appwrite 2.2
  `appwrite-worker`).
- Instanz steht (kein `version`): `docker compose ps` dort; Platte voll?
  (`df -h`, ClickHouse-Vorfall 2026-09-28) — `docker compose up -d`. Beide
  Fälle haben unten einen eigenen Absatz.

**Appwrite steht nach einem Server-Update oder Neustart.** Der häufigste
Grund für „alle Apps `ok:false`", der kein Zertifikat ist. Ein Paket-Update
auf dem Appwrite-Server (Ploi → Server → Verwalte → Updates → „Run updates
now"), das `containerd` oder `docker` anhebt, hält ALLE Container an. Bis zum
2026-11-20 hatten `appwrite`, `appwrite-traefik`, `appwrite-redis` und
`appwrite-browser` keine Neustart-Regel und blieben danach unten (Vorfall
2026-10-24, `containerd.io` 2.2.6 → 2.4.2; die übrigen Dienste drehten in
einer Neustart-Schleife, weil Redis fehlte), ebenso nach jedem Neustart des
Servers.

**Seit dem 2026-11-20 kommen sie von selbst wieder:** die vier tragen
`restart: unless-stopped` aus `docker-compose.override.yml` (die Override
überlebt das Upgrade-Werkzeug). Bewiesen mit einem Neustart des Servers am
selben Tag: alle 18 Container liefen ohne Eingriff, die API antwortete 42
Sekunden nach dem letzten guten Abruf wieder, die Live-Verbindung ebenso
([APPWRITE-2-7-UPGRADE.md](APPWRITE-2-7-UPGRADE.md), „Beweis-Neustart"). Für
ein Paket-Update, das Docker anhebt, gilt dieselbe Regel; ein eigener Lauf
damit steht noch aus. Die Schritte unten sind seitdem der RÜCKFALL — für den
Fall, dass die Regel fehlt (nach einem Appwrite-Upgrade nachsehen:
`docker compose config` nennt für jeden Dienst `restart`) oder ein Container
trotzdem unten bleibt.

1. Auf `ploi@188.245.61.155` in `~/appwrite` (das ist `/home/ploi/appwrite`;
   den Pfad `/usr/src/code/appwrite` gibt es auf dem Server nicht):
   `docker compose ps` — steht einer der vier oben auf „Exited"?
2. `docker compose up -d`, als `ploi`, ohne `sudo`. Am 2026-10-24 antwortete
   die API danach in rund 15 Sekunden.
3. Beweis: `curl -s https://api.pukalani.app/v1/health/version` nennt die
   Version; ein Wächter-Lauf von Hand schließt das Issue.
4. Die Live-Verbindung kommt zuletzt: `appwrite-realtime` kann in der
   Schleife hängen bleiben, wenn es vor Redis angelegt wurde. Der Wächter auf
   dem Server stellt den Container innerhalb von fünf Minuten selbst neu her
   (Absatz „Live-Verbindung" unten).

NIE den Docker-Dienst oder containerd neu starten — das ist derselbe Ausfall
noch einmal. Vorbeugen: vor „Run updates now" auf diesem Server
`apt list --upgradable | grep -E 'containerd|docker'`; steht eines der beiden
an, das Update nur fahren, wenn jemand danach nachsehen und notfalls Schritt 2
gehen kann. Der Auftrag kann lange in Plois Warteschlange liegen (gemessen am
2026-11-20: 16 Minuten bis zwei Stunden) — nicht ein zweites Mal klicken,
sondern `/var/log/apt/history.log` beobachten. Der
App-Server braucht nach einem Neustart nichts (pm2 holt die sechs Prozesse
selbst zurück, so gesehen am 2026-10-24). **Ohne Zugang zum Server geht hier
nur Nachsehen** (Haken `appwrite_probe`): Das Tor kennt kein Wort, das
Container startet.

**Platte voll** (Appwrite-Server; Vorfall 2026-09-28, Eintrag in
[OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md) „Platte voll durch
ClickHouse-Diagnose-Logs"). Zeichen: UptimeRobot meldet `api.pukalani.app`
als DOWN (Zeitüberschreitung), während `/v1/health/version` noch `200`
antwortet; hohe Last; Redis lehnt jeden Schreibbefehl ab (`MISCONF … unable
to persist to disk`). Ohne Zugang zeigt der Haken `appwrite_probe` den
Füllstand.

1. Messen: `df -h /` und `docker system df -v` — was ist gewachsen?
2. War es wieder ClickHouse (Diagnose-Tabellen `system.*_log`, damals 31 GB
   in 20 Tagen): ZUERST die Logdateien im ClickHouse-Container leeren, denn
   `TRUNCATE` braucht 1 MiB freien Platz und scheitert bei 0 Byte mit
   `NOT_ENOUGH_SPACE` (Containername aus `docker compose ps`):
   `docker exec <clickhouse-container> sh -c ': > /var/log/clickhouse-server/*.log; rm -f /var/log/clickhouse-server/*.gz'`
3. Dann je Diagnose-Tabelle (`text_log`, `trace_log`, `query_log`,
   `processors_profile_log`, `part_log`, `metric_log` …):
   `clickhouse-client --query "TRUNCATE TABLE system.<name>_log"` im
   Container. Das ist reine Diagnose; die Nutzungs-Statistik
   (`appwrite.projects_usage_events`) bleibt.
4. Redis prüfen: `redis-cli bgsave`, dann `redis-cli info persistence` →
   `rdb_last_bgsave_status:ok`.
5. Verwaiste Images: `docker image prune` (damals 9,4 GB).

Die Ursache von damals ist seit dem 2026-09-28 abgestellt
(`~/appwrite/patches/clickhouse-logging.xml`, eingebunden über
`docker-compose.override.yml`) — nach JEDEM Appwrite-Upgrade nachsehen, dass
der Mount noch dasteht (und die vier `restart`-Zeilen, s. oben). NIE ein Volume löschen: darin liegen die Datenbank und
jede hochgeladene Datei (`ops/appwrite-volumes.conf`); und nichts unter
`~/backup/runs` von Hand wegräumen, die Aufbewahrung räumt selbst (14 Tage).
Auf dem App-Server gab es den Fall noch nicht; die pm2-Logs haben dort keinen
Umlauf (OPEN-ITEMS „SE1" c) — `du -sh ~/.pm2/logs` zeigt, ob sie es sind.

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

**Täglicher Schema-Abgleich rot, Health-Blick grün.** Dann weicht etwas ab, das
die Proben nicht sehen, oder ein Schlüssel fehlt:

- „SPALTE FEHLT" nennt Projekt, Tabelle, Spalte und Layer: eine ältere
  Migration dieses Layers ist dort nicht gelaufen. Am Mac
  `pnpm ops:schema-parity`, dann wie oben ab Schritt 2 — welche Nummer die
  Spalte anlegt, zeigt `git grep "key: '<spalte>'" packages/<layer>/scripts/migrations`.
- „SPALTE OHNE SOLL" heißt: in der Datenbank steht eine Spalte, die keine
  Migration anlegt (von Hand in der Konsole?). Im öffentlichen Protokoll steht
  nur die Anzahl; den Namen nennt `pnpm ops:schema-parity` am Mac. Mit Davids
  Ja entweder eine Migration schreiben, die sie anlegt (wird sie gebraucht),
  oder die Spalte in der Konsole löschen.
- „Schlüssel … fehlt" bzw. „nicht lesbar" heißt, dass einer der vier
  `SCHEMA_WATCH_KEY_*` fehlt, gelöscht wurde oder seine Rechte verloren hat
  (siehe Abschnitt 1).

**TLS auf einem ploi-Host.** Hinweis am Ende des Wächter-Laufs; Regeln in
`.claude/rules/hosts-ops.md` (Lineage-Falle: NIE auf `pukalani.app` oder
`platform.pukalani.app` anfordern, außer `*.pukalani.app` auf platform).

**Kundendomain rot.** Der Satz im Issue nennt nur die Nummer („Kundendomain
3/5"). Den Namen nennt die Mail „Betroffene Kundendomains"; ohne die Mail am
eigenen Rechner, mit dem Geheimnis in der Umgebung:
`PUKALANI_WATCH_HOSTS_SECRET=… node scripts/ops/verify-tls.mjs --nur-kundendomains --namen`
(bzw. `verify-health.mjs`). Dann:

1. *Zertifikat läuft ab oder deckt den Host nicht.* Die Domain hängt als
   ploi-Tenant an der Site `platform.pukalani.app` (Pool) oder an der Site der
   Einzel-Instanz. NICHT blind neu anfordern — erst
   `docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md` lesen. Zeigt die Domain
   nicht mehr auf unseren Server (der Kunde ist umgezogen), kann ploi nicht
   erneuern: dann die Domain im Dashboard entfernen oder mit dem Kunden
   klären.
2. *Antwortet nicht gesund.* Wie „Ein einzelner Host `ok:false`" weiter oben —
   die Kundendomain einer Pool-Community bedient die Platform-App.
3. *Die Domain gibt es mit Absicht nicht mehr.* Im Dashboard entfernen oder
   abschalten; aus der Liste der Route fällt sie damit von selbst.

**Mail-Missbrauch.** Resend → Emails: die To-Spalte zeigt den Spam-Namen, der
Betreff das Appwrite-Projekt. Angreifer-IP in `audit_logs` der Instanz (nicht
in Appwrites `_audit`); Konten aufräumen mit `scripts/ops/purge-spam-accounts.mjs`
(läuft auf app-prod mit der Site-`.env`). Vorfall und Diagnose-Rezept:
OPEN-ITEMS-COMPLETE „Resend-Spam" (2026-10-27). Hält die Notbremse eine ECHTE
Anmeldewelle auf, Schwelle `MAIL_GLOBAL_HOUR_MAX` erhöhen — nicht die
Notbremse entfernen. Neue Konten sofort stoppen: Absatz „Not-Aus".

**Mails kommen nicht an** (Kunden melden: kein Code, keine Bestätigung, keine
Benachrichtigung). Kein Blick wird davon sicher rot — in dieser Reihenfolge
prüfen:

1. *Welche Mail?* Anmelde-Code, Bestätigung und Passwort-Mail verschickt
   Appwrite selbst (`_APP_SMTP_*` in `~/appwrite/.env`). Benachrichtigung,
   Tages-Mail, Einladung und Newsletter verschickt die App (`NUXT_SMTP_*` der
   Site; `platform` liest sie aus der Ablage `instance_secrets`). Fehlt nur
   eine Sorte, liegt es an genau dieser Stelle.
2. *Tagesgrenze erreicht?* Der freie Tarif von Resend trägt 100 Mails am Tag
   für ALLES. Der tägliche Wächter-Lauf zeigt „Resend: n Mails in 24 h" und
   wird ab 80 rot; Resend selbst mailt dem Konto-Inhaber. Ist die Grenze
   voll, hilft nur warten oder der Tarif — nach der Ursache sehen (Absatz
   „Mail-Missbrauch").
3. *Notbremse gezogen?* Zeile `auth.mail_route_breaker` im pm2-Log: mehr als
   60 Mails je Stunde auf einer Route; für den Rest der Stunde wartet auf
   dieser Route auch der echte Mensch. Weiter unter „Mail-Missbrauch".
4. *Fehlt eine Einstellung?* `pnpm ops:site-env` (liest nur die Namen). Im
   pm2-Log steht beim ersten verworfenen Versand einmal
   `NUXT_SMTP_HOST fehlt — … wurde NICHT verschickt`. Eine fehlende Variable
   wird sonst nirgends rot (Regel F44 in `.claude/rules/ops-server.md`).
5. *Schlüssel getauscht oder widerrufen?* Der Sende-Schlüssel steckt an fünf
   Stellen, und jede wird anders wirksam:
   [RESEND-WEBHOOK.md](RESEND-WEBHOOK.md), § 6.1.
6. *Domain bei Resend noch verifiziert?* Resend → Domains (`pukalani.app`).

Appwrites eigenen Mail-Versand NIE mit `doctor` prüfen — der Befehl schickt
eine Testmail.

**Zeit-Lauf überfällig oder gescheitert.** Der Satz im Issue nennt App und
Kennung. Ein Zeit-Lauf ist eine Arbeit, die die App von selbst im Takt
erledigt; an einigen hängt etwas, das ein Kunde merkt:

| Kennung | App | Takt | Was daran hängt | Von Hand |
| --- | --- | --- | --- | --- |
| `trial-sweep`, `past-due-sweep` | control | 1 h | Ende der Testphase, Sperre bei Zahlungsverzug | `POST /api/control/sweeps/past-due` (nur der zweite) |
| `invite-request-prune`, `reporter-email-prune` | control | 1 h | Aufräumen, Frist 90 Tage für Melder-Adressen | – |
| `custom-domain-sweep` | control (nicht bei Schalter `off`) | 1 h | Frist der eigenen Domain beginnen, nach 14 Tagen abschalten, Einträge ohne Nachweis verfallen lassen; bei `dry-run` nur zählen | Zahlen: `GET /api/control/sweeps/custom-domain` (zählt nur) |
| `health-sweep` | control | 5 min | Prüft Kunden-Sites, mailt den Betreiber | – |
| `run-retention` | control | 1 h | Runner-Protokolle 30 / 90 Tage | `POST /api/runner/retention/run` |
| `label-reconcile` | platform | 1 h | Entzogene Lese-Rechte nachziehen | `POST /api/community/members/run-label-reconcile` |
| `past-due-notice` | platform | 1 h | Zahlungswarnung an Inhaber | `POST /api/community/billing/run-past-due-notice` |
| `custom-domain-notice` | platform | 1 h | Zwei Hinweise an Inhaber zur Frist der eigenen Domain (erster Tag, drei Tage vorher) — findet nur etwas, wenn `custom-domain-sweep` scharf ist | – |
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
Health-Blick rot. Schwellen (seit 2026-11-28 auf allen Apps scharf):
platform 25, die übrigen fünf 10 in 25 Stunden — Messung und Begründung in
`scripts/ops/app-signals-rules.mjs`. Darunter steht die Zahl als Zeile mit
der Schwelle. Unter „Nur gezählt" stehen die Fehler aus dem Browser: kein
Alarm, aber die Zahl, an der sich eine Schwelle später ausrichten kann.

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

**Not-Aus** — vier Schalter, die ohne Ausliefern wirken. Die ersten drei
stehen im Dashboard JEDER Site mit Anmeldung (angemeldet mit der Rolle
`admin`); sie gelten nur für diese Site.

| Was | Wo | Wirkung |
| --- | --- | --- |
| Neue Konten stoppen | `/dashboard/admin/config` → „Registrierung offen" aus | Registrierung wird abgelehnt, ein Anmelde-Code geht nur noch an bestehende Konten; diese melden sich weiter an. Wo Einladungen zulassen (branding.supply), kommt eine eingeladene Adresse weiter durch. Der erste Handgriff bei Spam über die Registrierung |
| Schreiben einfrieren | dieselbe Seite → „Wartungsmodus" an | blockiert Registrierung (auch mit Einladung) und Kommentare. KEINE Wartungsseite: alles andere läuft weiter |
| Ein Produkt abschalten | `/dashboard/admin/products` → Schalter des Produkts | schreibt `app_config.products.<key>.enabled = false`; jede Route unter den `apiPrefixes` des Produkts antwortet 404, die Seiten ebenso. Daten bleiben liegen; Zeit-Läufe des Produkts können weiterlaufen (so der Aufräum-Lauf des Marktvergleichs: eine Frist ist kein Produktmerkmal). Beispiel mit allen Folgen: [MARKTVERGLEICH-EINFUEHRUNG.md](MARKTVERGLEICH-EINFUEHRUNG.md), § 5 |
| Alle bezahlten KI-Aufrufe auf branding.supply stoppen | Appwrite-Konsole, Projekt `branding`, Tabelle `app_config`, Zeile `global`, Spalte `brandAiEnabled` auf `false` | jeder der fünf KI-Wege fragt die Spalte vor dem Senden; eine unlesbare Zeile zählt als „aus". Die Stände bleiben bearbeitbar, es kommen keine neuen Entwürfe. Dafür gibt es KEINEN Schalter im Dashboard |

Eine einzelne Kunden-Community vom Netz nehmen (Host antwortet 404, nichts
wird gelöscht) geht über die Betreiber-Konsole: als Entscheidung „gesperrt" an
einer Missbrauchs-Meldung (`/dashboard/abuse`,
[ANFRAGEN-VON-AUSSEN.md](ANFRAGEN-VON-AUSSEN.md)) oder durch Stilllegen
(`.claude/rules/onboarding.md`, „Stilllegen statt Vernichten"). Verdacht auf
fremden Zugriff: [SICHERHEITSVORFALL.md](SICHERHEITSVORFALL.md).

**Still abgefangene Fehler.** Kein Alarm, nur ein Hinweis im täglichen Blick:
die App hat an so vielen Stellen einen Fehler abgefangen und mit „leer",
„nichts" oder „0" weitergemacht (Zeile `soft_fail`, eine Hilfe für alle:
`packages/core/server/utils/softFail.ts`). Der Mensch vor der Seite hat davon
keinen Fehler gesehen — eine Liste war kürzer, ein Zähler stand auf 0, eine
Nebensache fiel aus. Nicht gezählt wird der erwartete Fehlgriff (eine Zeile,
die es nicht gibt; der Blick auf die Sitzung eines Gastes). Nachsehen auf dem
App-Server:
`grep '"event":"soft_fail"' ~/.pm2/logs/<prozess>-error-*.log | tail -40` —
die Zeile nennt nur die Stelle (`where`: Layer, Datei, Aufruf), Status,
Appwrite-`type`, Fehlerklasse und `repeated` (so viele gleiche Fehler hat die
Bremse in der Minute davor zusammengefasst); nie eine Meldung, nie eine Id.
Lesen wie beim Betreiber-Protokoll: Status 400 `general_query_invalid` oder
404 `table_not_found` / `column_not_found` ⇒ eine Migration fehlt
(`/api/health` → `schema.state`); 401 ⇒ dem Laufzeit-Schlüssel fehlt ein
Recht; 429 ⇒ Appwrite bremst; 5xx oder ohne Status ⇒ Appwrite oder ein fremder
Dienst war nicht erreichbar. Viele Zeilen an EINER Stelle über Tage sind ein
Fehler im Programm und gehören in OPEN-ITEMS; viele Stellen in derselben
Stunde sind eine Störung dahinter. Eine Schwelle gibt es bewusst noch nicht —
erst die Zahlen einer Woche ansehen. „Nicht gezählt" in der Übersicht heißt:
auf dem Server liegt noch das Zähl-Skript von vor dem 2026-11-21.

**Betreiber-Protokoll fällt aus.** Der Satz nennt App und Zahl der
gescheiterten Einträge in `audit_logs` (Zeile `audit.write_failed`, ein
Schreiber für alle: `packages/core/server/utils/auditLog.ts`). Was es heißt:
Anmeldungen und Betreiber-Aktionen laufen weiter, stehen aber nicht im
Protokoll — und jede HERAUSGABE von Personendaten (Export einer Person,
CSV-Liste, Lösch-Kopie) wird mit 503 `audit_unavailable` abgelehnt, weil dort
erst der Eintrag und dann die Daten kommen. Nachsehen auf `ploi@49.13.211.173`:
`grep '"event":"audit.write_failed"' ~/.pm2/logs/<prozess>-error-*.log | tail -20`
— die Zeile nennt nur Aktion, Zielart, `strict`, Status und Appwrite-`type`.
Typische Ursachen: `type` `document_invalid_structure` / Status 400 ⇒ eine
Spalte fehlt oder ist zu klein (Migrationen des `system`-Layers, `/api/health`
→ `schema.state`); Status 401 / `general_unauthorized_scope` ⇒ dem
Laufzeit-Schlüssel fehlt `rows.write`; Status 404 `table_not_found` ⇒
`audit_logs` fehlt in diesem Projekt; ohne Status ⇒ Appwrite war nicht
erreichbar (dann ist meist mehr rot). Ein einzelner Wackler heilt sich, unter
3 wird nur berichtet. „Nicht gezählt" im Lauf heißt: auf dem Server liegt noch
das Zähl-Skript von vorher — nach dem nächsten Ausliefern kommt die Zahl.

**In die App hinein — keine Zahlen.** Der Blick konnte für eine App nicht
zählen. „Prozess läuft nicht" / „pm2 kennt den Prozess nicht": auf dem Server
`pm2 ls`, dann `pm2 startOrReload /home/ploi/<site>/ops/ecosystem-<app>.config.cjs --update-env`.
„Andere Version": Zähl-Skript und Auswertung passen nicht zusammen — ein
Ausliefern steht aus oder ist gescheitert (`deploy.yml`-Lauf lesen). „Nicht
erreichbar" oder „nicht in der festen Form": den Lauf von Hand wiederholen;
bleibt es, am Mac `node scripts/ops/verify-app-signals.mjs --ssh` und
`ssh ploi@49.13.211.173 'node /home/ploi/<site>/ops/app-watch-counts.mjs <prozess>'`.

**In die App hinein — die Zählung reicht nicht zurück.** Kein Alarm, nur ein
Hinweis unter „Nur gezählt": die älteste Zeile, die das Zähl-Skript für diese
App gelesen hat, ist jünger als das Fenster von 25 Stunden. Was davor war
(Server-Fehler, KI-Ausfälle, gescheiterte Läufe), steht in keiner Zahl dieses
Laufs. Der übliche Grund ist `pm2 update` (nach dem Heben von Node,
[DEPLOYMENT.md](DEPLOYMENT.md), A4) oder ein gelöschter und neu angelegter
Prozess: der Prozess bekommt eine neue pm2-Nummer, die Nummer steht im Namen
der Log-Datei, und das Zähl-Skript liest nur die zwei Dateien, in die der
Prozess gerade schreibt (und ihre umgelaufenen Geschwister). In den Minuten
danach nennt die Übersicht außerdem weniger „gute" Zeit-Läufe und sagt in
Klammern, warum („noch ohne guten Lauf"): jeder Lauf wartet nach einem Start
seine erste Verzögerung ab, die längste beträgt 14 Minuten. Gemessen am
2026-11-19: `pm2 update` um 17:57 UTC, der Blick um 18:04 UTC zählte 28 von
39 Läufen als gut, der nächste Lauf um 23:42 UTC wieder alle 39. Zu tun
ist nichts; der Hinweis verschwindet von selbst, sobald die Dateien 25
Stunden alt sind. Wer wissen will, was VOR dem Neustart war, liest die Datei
der früheren Nummer von Hand:
`ls -t ~/.pm2/logs/<prozess>-error-*.log | head -3`.

**Umlauf der pm2-Logs (eingeschaltet am 2026-11-17, mit Davids Ja).** pm2
dreht seine Logs nicht selbst; die zwei Dateien je Prozess wuchsen ohne
Grenze. Der Umlauf steht als zweiter Block in
`ops/logrotate-admin-access.conf` (täglich, 14 Tage, `copytruncate`, die
gestrige Datei ungepackt). Diese Datei liefert das Ausliefern aus, und der
vorhandene Zeitplan `admin-log-umlauf` (täglich 03:12, Benutzer `ploi`) fährt
sie — kein neuer Zeitplan, kein neues Paket. Das Zähl-Skript liest die
umgelaufenen Dateien mit (`<datei>.1`, `<datei>.2.gz`); vorher hätte der Blick
„In die App hinein" nach dem ersten Umlauf Tages-Läufe als fehlend gemeldet.
Vor dem Einschalten gemessen: 66 MB Logs, 24 GB frei, alle sechs Sites mit dem
neuen Zähl-Skript.

- *Nachsehen:* `ls -la ~/.pm2/logs/ | head -30` zeigt je Log eine Datei `.1`
  (eine Nacht später dazu `.2.gz`). Der Blick „In die App hinein" bleibt
  grün und nennt weiter jeden Zeit-Lauf. DIE ERSTE NACHT DREHT NOCH NICHTS:
  `logrotate` merkt sich eine Datei, die es zum ersten Mal sieht, nur in
  seiner Zustands-Datei und dreht sie ab der folgenden Nacht (gemessen im
  Probe-Modus am 2026-11-17: „Handling 2 logs", beide Muster gelesen, kein
  Fehler).
- *Der Blick meldet nach einer Nacht einen Zeit-Lauf als fehlend:* auf der
  betroffenen Site liegt ein altes Zähl-Skript
  (`grep -c rotatedFiles /home/ploi/*/ops/app-watch-counts.mjs` — jede Zeile
  muss eine Zahl über 0 zeigen). Die App neu ausliefern.
- *Zurück:* den zweiten Block aus `ops/logrotate-admin-access.conf` nehmen
  (Pull Request). Die umgelaufenen Dateien bleiben liegen — von Hand löschen.
- *Dateien früherer Prozess-Nummern* laufen einmal um; ihre Kopie `.1` bleibt
  liegen und kann von Hand weg.
- *Der erste Umlauf, nachgesehen am 2026-11-19 (nur gelesen, mit Davids Ja):*
  gelaufen um 03:12; im Ordner liegen 33 Dateien `.1`, die laufenden Dateien
  sind geleert und werden weiter beschrieben, zusammen 66 MB. Eine seit Juli
  leere Datei hat keine `.1` (leere Dateien dreht `logrotate` nicht). Der
  tägliche Wächter am Morgen danach war grün und zählte alle 39 erwarteten
  Zeit-Läufe als gut.

**Server-Einstellungen.** Der Satz im Issue nennt Site und Pflicht-Zeile
oder den Zeitplan.

- *Eine Pflicht-Zeile fehlt* (meist nach einem Handgriff an der Site, der die
  Datei durch Plois eigene Schablone ersetzt hat): Ploi → Site → Manage →
  NGINX configuration, die Zeile aus der Vorlage der Site-Art nachtragen
  (`ops/nginx/`, die Zeilen unter `PFLICHT`), speichern, **Reload** (nie
  Restart). Welche Zeile wo fehlt, zeigt auf dem Server
  `node /home/ploi/platform.pukalani.app/ops/nginx-check.mjs --namen`.
- *Der Webserver setzt eine Schutz-Kopfzeile selbst* (`zuviel`): die
  `add_header`-Zeile löschen — Ploi schreibt bei einer neuen Site drei davon
  hinein. Sie käme sonst doppelt.
- *Unbekannte Site-Datei:* jemand hat eine Site angelegt. In
  `ops/nginx-sites.conf` eintragen ([NEUE-SITE.md](NEUE-SITE.md)) oder die
  Site entfernen.
- *Zeitplan fehlt:* auf dem Server nachsehen (`crontab -l` als `ploi` bzw.
  Ploi → Server → Cronjobs für `/etc/crontab`) und wieder anlegen, wie
  `ops/cron.conf` ihn nennt. Fehlt `appwrite-backup`, läuft das nächtliche
  Backup nicht (der Backup-Blick wird am selben Morgen ebenfalls rot).
- *Unbekannter Zeitplan:* den Eintrag auf dem Server ansehen (der Blick nennt
  ihn mit Absicht nicht). Gewollt ⇒ in `ops/cron.conf` eintragen; sonst
  entfernen.
- *„Antwortet nicht in der erwarteten Form":* die Skripte liegen nicht auf dem
  Server oder passen nicht zur Auswertung. App-Server: ein Ausliefern steht
  aus (`deploy.yml`-Lauf lesen). Appwrite-Server: Tor-Skript, `cron-check.sh`
  und `cron.conf` von Hand einspielen
  ([CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md), § 3). Am Mac:
  `PUKALANI_APPWRITE_SSH=ploi@188.245.61.155 PUKALANI_APPWRITE_CRON_COMMAND='~/bin/pukalani-cert-gate.sh cron-status' node scripts/ops/verify-server-config.mjs --ssh`
  (der eigene Zugang hat eine Shell, deshalb ruft man das Tor dort ausdrücklich).

**Schutz-Kopfzeilen.** „Kommt 2-mal" oder „wird gesendet": der Webserver des
Hosts setzt die Kopfzeile selbst — die `add_header`-Zeile in der nginx-Datei
der Site entfernen, Reload; der Blick „Server-Einstellungen" nennt dieselbe
Site als `zuviel`. Für `pukalani.app` zusätzlich bei Cloudflare nachsehen
(dort lässt sich HSTS ebenfalls einschalten — nicht einschalten). „Fehlt":
die App sendet sie nicht; den letzten Stand von
`packages/core/server/plugins/security-headers.ts` und den Build des Hosts
(`/api/health` → `.build`) prüfen.

**Auslieferung.** Der Satz im Issue nennt Host und Sorte. „gepackt": die
App legt beim Bauen neben jede Datei eine `.br` und eine `.gz`
(`nitro.compressPublicAssets` im Core) — steht das noch dort, entfernt etwas
davor die Kopfzeile; mit `curl -sI -H 'Accept-Encoding: br, gzip'
https://<host>/_nuxt/<datei>.js` nachsehen. „robots": antwortet die App
(`curl -s https://<host>/robots.txt`)? Kommt statt ihrer Datei eine
Fehlerseite des Webservers, hat die nginx-Datei der Site einen eigenen Block
für `/robots.txt` (Ploi legt ihn bei einer neuen Site an) — entfernen,
Reload. „vorschau": das Bild trägt die `app.vue` der App über
`useBrandOgImage()` ein. „symbole": `pnpm check:icons` fahren; der Schalter
steht in `packages/core/nuxt.config.ts`.

**Anmelde-Wege.** Der Satz im Issue nennt das Projekt. „Wieder offen": in der
Verwaltung der Datenbank das Projekt öffnen, Auth → Settings → Auth methods,
und alle Schalter ausschalten (seit dem 2026-11-18 auch „JWT")
([ANMELDE-REGELN.md](ANMELDE-REGELN.md), „Anmelde-Wege für Aufrufe ohne
Schlüssel"); danach `node scripts/ops/verify-auth-methods.mjs <projekt>` — es
muss „zu (501)" melden. „Unerwartete Antwort": die Probe selbst passt nicht
mehr (Projekt umbenannt, Schnittstelle geändert) — das Skript anpassen, nicht
den Blick abschalten. Ein NEUES Projekt gehört in `PROJECTS` im Skript; ein
Test hält die Liste gegen die Site-Manifeste.

**Anmelde-Regeln.** Der Satz im Issue nennt Projekt und Regel. „Weicht ab":
jemand hat in der Verwaltung eine Regel verstellt (Auth → Policies) — dort auf
das Soll zurückstellen, das in `scripts/ops/appwrite-auth-policies.mjs` steht
([ANMELDE-REGELN.md](ANMELDE-REGELN.md), „Was gilt"). War die Änderung
gewollt, zuerst das Soll im Skript ändern. „Leserecht fehlt": der Schlüssel
`watch-schema-readonly` des Projekts braucht `project.policies.read`
(Verwaltung → API keys). „Schlüssel fehlt": das Secret `SCHEMA_WATCH_KEY_…`
in der GitHub-Umgebung `production-watch` — dann ist auch der Schema-Blick rot.

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

**Node-Version rot.** Der Satz im Issue nennt, WAS abweicht. „Das Programm
/usr/bin/node nennt …“: auf dem Server liegt ein anderes Paket als in
`.nvmrc` — entweder wurde `.nvmrc` gehoben und der Server noch nicht, oder
ein Paket-Update hat den Server gehoben. „Der Prozess … läuft mit Node …“
bei richtigem Programm: das Paket ist gehoben, der pm2-Dienst aber nicht neu
gestartet. Beide Handgriffe und ihre Reihenfolge:
[DEPLOYMENT.md](DEPLOYMENT.md), Abschnitt A4. Es eilt nicht — die Apps
laufen; nur beweisen die Prüfungen bis dahin nicht genau das, was live läuft.

**Env / Zugänge rot.** `docs/runbooks/ZUGAENGE-AUFRAEUMEN.md`
bzw. die Pflichtliste in `scripts/ops/verify-site-env.mjs`.

**Admin-Konto rot** (eine Instanz hat kein Konto mit Label `admin` mehr).
[ADMIN-KONTO-WIEDERHERSTELLEN.md](ADMIN-KONTO-WIEDERHERSTELLEN.md): Konto neu
anlegen, Label in der Appwrite-Konsole setzen, Lauf von Hand. Lehre aus dem
Vorfall vom 2026-11-22: vor jedem Löschen im Browser prüfen, welches Konto
angemeldet ist.

**Probealarm vergessen aufzuräumen?** Ein Lauf von Hand ohne Haken
(`gh workflow run production-watch.yml`) schließt das Issue. Von selbst geht
es nur zu, wenn es den täglichen Teil nicht betrifft (nächster
Halbstunden-Lauf), sonst erst mit dem Tageslauf um 04:17 UTC.

**Befund aus dem täglichen Teil behoben, das Issue ist noch offen?** Das ist
so gewollt: der Halbstunden-Lauf prüft den täglichen Teil nicht und darf
deshalb nicht entwarnen (§ 2). Ein Lauf von Hand ohne Haken prüft alles und
schließt das Issue, wenn der Befund wirklich weg ist.

## 5 · Vertretung: wenn David nicht erreichbar ist

Stand 2026-11-17 (OPS-010): Jeder Alarmweg aus § 2 und § 3 endet bei einer
Person. Vorbereitet ist, dass eine zweite sie mitbekommt; eingetragen ist
noch niemand (OPEN-ITEMS „VT1"). Davids Entscheidung vom selben Tag: Die
Vertretung soll zuerst nur Bescheid wissen (Alarme mitbekommen, nachsehen,
anrufen, Kunden antworten); über eigene Zugänge wird entschieden, wenn die
Person feststeht.

**Das Notfallblatt.** Für die Vertretung gibt es ein Blatt mit den ersten
Handgriffen: woran man eine Störung erkennt, wie man nachsieht, wen man
anruft, was man Kunden sagt, was man nie tut — danach je Störfall ein
Absatz, der auf dieses Runbook zeigt. Es liegt bewusst NICHT im Repo (das
Repo ist öffentlich, das Blatt nennt Menschen und Telefonnummern), sondern
privat bei David: als Ausdruck bei der Vertretung und als Notiz in seinem
Passwort-Tresor, auf Deutsch und auf Englisch. Es enthält keine Passwörter
und keine Schlüssel.

**Was jede und jeder ohne Konto sieht.** `https://status.pukalani.app` (die
Statusseite von UptimeRobot), `https://<host>/api/health` je Host (`"ok":true`
heißt gesund), die Liste der Alarm-Issues
(`https://github.com/davidschubert/pukalani-app/issues?q=label%3Aproduktions-alarm`,
offen = Alarm aktiv) und die Protokolle der Wächter-Läufe. Reparieren lässt
sich ohne Konto nichts.

**Eine zweite Person bekommt die Alarme mit.** Je Quelle ein Handgriff; jeder
ist eine Einstellung bei einem Dienst und braucht Davids Ja.

| Quelle | Heute | Zweite Adresse |
| --- | --- | --- |
| Alarm-Mail des Wächters (§ 2, Schritt 2) und die Mail „Betroffene Kundendomains" (§ 1, „Kundendomains" — sie nennt Host-Namen von Kunden) | Secret `PRODUCTION_ALARM_MAIL_TO`, eine Adresse | Das Secret neu setzen, beide Adressen mit Komma getrennt: `gh secret set PRODUCTION_ALARM_MAIL_TO --env production-watch --repo davidschubert/pukalani-app` (der Wert nur als Eingabe). Danach Probealarm |
| UptimeRobot (§ 3) | zwei Alert Contacts: Mail und Push | Neuen Alert Contact (Mail) anlegen, die Person bestätigt ihn; dann an JEDEN der zehn Monitore hängen. `scripts/ops/uptimerobot-sync.mjs` trägt Kontakte nur bei neuen oder umgebogenen Monitoren ein — ein Monitor, der „passt", bekommt den neuen Kontakt nicht |
| Heartbeat bei healthchecks.io (§ 2, Schritt 3) | Kanäle des Checks `pukalani-production-watch` | Dort einen weiteren Mail-Kanal anlegen und dem Check zuordnen |
| Alarm-Issue (§ 2, Schritt 1) | dem Repo-Besitzer zugewiesen | Nur für eine Mitarbeiterin im Repo möglich (Änderung an `ALARM_ASSIGNEE` im Workflow). Nicht nötig, wenn die Mail oben steht |
| Issues `buehne-alarm` (§ 1b) und `geheimnis-alarm` (§ 1c) | dem Repo-Besitzer zugewiesen, ohne Mail | Wie beim Alarm-Issue: nur für eine Mitarbeiterin im Repo (Zuweisung im jeweiligen Workflow) |
| GitHub-Mails „Run failed" | Konto des Besitzers | Nur mit eigenem GitHub-Konto und eigenen Benachrichtigungen |
| Betreiber-Mail der Konsole (`NUXT_ALERT_EMAIL` auf `admin.pukalani.app`): Störungen der Kunden-Sites, Missbrauchs-Meldungen, Anfragen | **David** (gesetzt am 2026-11-22, Probe-Meldung zugestellt; Pflicht-Liste `scripts/ops/verify-site-env.mjs`). Dazu der Hinweis in der Glocke jedes Kontos mit der Rolle `admin` | **Keine zweite Adresse:** Davids Entscheidung vom 2026-11-24 — diese Mail geht nur an den Betreiber, nicht an die Vertretung (OPEN-ITEMS-COMPLETE „VT1 (b)") |
| Konto-Mails der Dienste (Resend-Tageslimit, Hetzner, Ploi, Cloudflare, Stripe, OpenRouter) | Konto-Inhaber | In keinem Runbook beschrieben; im jeweiligen Konto nachsehen |

**Wenn die Vertretung selbst eingreifen soll,** bekommt sie eigene Konten —
nie ein geteiltes Passwort:

- *GitHub, Mitarbeiterin im Repo:* Wächter von Hand, Probealarm, die drei
  Notfall-Haken für das Appwrite-Zertifikat (§ 4), alles im Browser. Das Repo
  eines Einzelkontos kennt für Mitarbeitende nur EINE Stufe: wer Läufe starten
  darf, darf auch zusammenführen und `deploy.yml` von Hand starten. Vorher die
  Ausnahme für den Besitzer neu bewerten und für die Umgebung `production`
  eine Freigabe verlangen (DECISION-LOG 2026-11-14, „Wieder prüfen").
- *Betreiber-Konto mit der Rolle `admin`* (je Site ein eigenes): die Schalter
  aus „Not-Aus", Konten blockieren, Sitzungen beenden, Missbrauchs-Meldungen.
  Es gibt nur `moderator` und `admin`; `admin` darf auch löschen und
  exportieren.
- *Server, Ploi, Appwrite-Konsole:* nur für jemanden mit Technik-Wissen; das
  ist voller Zugriff auf alle Daten.
- *Nie:* der private Schlüssel der Backups (DECISION-LOG 2026-11-16, Nr. 9 —
  dort steht auch, wann das wieder zu prüfen ist). Eine Wiederherstellung
  kann deshalb nur David.

**Die Probe.** Die Vertretung gilt erst als eingerichtet, wenn ein Probealarm
(§ 2) BEI IHR angekommen ist, sie mit dem Blatt die acht Hosts nachgesehen und
David unter der Nummer auf dem Blatt erreicht hat, und der Lauf ohne Haken
das Issue wieder geschlossen hat. Wiederholen: jährlich und bei jeder neuen
Adresse oder Nummer.

