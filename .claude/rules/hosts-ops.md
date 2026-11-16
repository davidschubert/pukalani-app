---
paths:
  - "ops/**"
  - ".github/**"
  - "scripts/ops/**"
  - "docs/runbooks/**"
  - "apps/platform/**"
  - "apps/control/**"
  - "packages/control/**"
  - "packages/core/shared/controlCenter.ts"
  - "packages/core/shared/legacyControlHosts.ts"
  - "packages/core/server/middleware/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Hosts (Umbenennung 2026-07-25, Cutover 2026-07-26 — Davids Entscheidung)
- `admin.pukalani.app` = Betreiber-Oberfläche (AH-4, Davids Entscheidung
  2026-08-11; Runbook docs/runbooks/ADMIN-CUTOVER.md). Seit **AH-4b
  (2026-08-18, Davids Panel-Klick)** ist auch die INFRA wirklich umbenannt:
  ploi-Site 392163, Server-Verzeichnis `/home/ploi/admin.pukalani.app/` (ploi
  benennt das Verzeichnis mit) und die certbot-Lineage heißen `admin` — SITE
  und PROBE in deploy.yml sind damit wieder identisch, der pm2-Prozess heißt
  `adminpukalaniapp` (den Vorgänger `controlpukalaniapp` räumt ops/pm2-heal.sh
  einmalig weg — pm2 findet Prozesse über den NAMEN und startet nach einem
  Rename sonst DANEBEN, die studio→control-Falle). Seit **AH-4c (2026-08-18,
  Davids Entscheidung)** läuft auch das APPWRITE-PROJEKT als `admin` (Cookie
  `a_session_admin`): Projekt-Ids sind unveränderlich, also Neuanlage +
  1:1-Umzug (Runbook docs/archiv/ADMIN-PROJEKT-CUTOVER.md; das Werkzeug
  `scripts/ops/ah4c-project-transfer.mjs` ist seit 2026-11-15 gelöscht,
  letzter Stand in Commit `9788e7ab`); das Alt-Projekt `control` ist —
  wie `pool` — am 2026-08-19 GELÖSCHT (Davids Entscheidung; Alt-Stände nur
  noch in den Offsite-Dumps). Den Namen `control`
  behalten NUR noch: Ordner apps/control, Workspace-Paketname, Release-Slot
  `releases/control` und die Ecosystem-DATEI `ecosystem-control.config.cjs`
  (Dateinamen bleiben; `admin` ist als Layer-Name packages/admin vergeben). Der ALTNAME
  `control.pukalani.app` ist seit AH-4b BEWUSST tot — Davids Entscheidung
  gegen eine 301: der Host war rein betreiber-intern, der Stripe-Webhook zeigt
  seit AH-4 auf admin. Er fällt in die Wildcard-Site `platform` und antwortet
  404 wie `studio.`/`app.`; die 301-Middleware
  (00.legacy-console-hosts.ts) und ihre adminConsole-Config sind entfernt,
  der Name bleibt in RESERVED_SUBDOMAINS gesperrt und der TLS-Wächter
  beobachtet ihn weiter (Wildcard-Deckung).
- Was der Cutover 2026-07-26 gebracht hat und weiterhin gilt: eigene ploi-Site
  392163 (nginx → Port 3003), Release-Slot `releases/control`, Appwrite-Projekt
  `control` (Session-Cookie a_session_control). Der Alias
  `studio.pukalani.app` ist am 2026-07-30 ENTFERNT (ploi → Site → Verwalte →
  Domain aliases; ploi pflegt `server_name` selbst und lädt nginx neu). Grund:
  der Stripe-Webhook zeigt seither auf `control`, damit hatte der Alias keine
  Aufgabe mehr — und „Studio" meint seit Davids Namensentscheidung das
  KUNDENANGEBOT, ein Kunde hätte sonst die Betreiber-Konsole vor sich. Der Host
  fällt jetzt in die Wildcard-Site `platform` und antwortet 404, wie
  `app.pukalani.app`. Zum Nachlesen: `pm2 jlist` war vorher auf ein
  cwd unter `/home/ploi/studio.pukalani.app` zu prüfen — genau daran starb
  portfolio beim Cutover-Aufräumen (ops/pm2-heal.sh); hier hing nichts.
  (Der damals überzählige SAN `studio` ist seit dem AH-4b-Zertifikat weg.)
  Die Site hat BEWUSST kein Repository: die CI rsynct .output UND
  ops/-Configs; ploi-Fallback-Deploy gibt es für control nicht (Fallback =
  Runbook docs/runbooks/CONTROL-CUTOVER.md).
- `account.pukalani.app` = DER Kundenbereich (AH-1, Davids Entscheidung
  2026-08-11): Anmeldung, Konto, Communities UND der Wizard (`/start`). EIN
  Kontroll-Host derselben Platform-App, ohne DNS- oder Site-Bedarf (Wildcard
  `*.pukalani.app` zeigt schon dorthin, KEIN Zertifikat anfordern —
  Lineage-Falle). `wizardHosts` ist damit LEER: `/` zeigt die Übersicht, und
  wer keine Community hat, wird von ihr in den Wizard geschickt; ein `?code=`
  führt weiterhin direkt dorthin. Ein LINK auf den Wizard holt seinen Host über
  `resolveWizardHosts()` (core/shared/controlCenter.ts) — eigene Wizard-Hosts,
  sonst die Kontroll-Hosts; ohne diesen Rückfall wäre „Community anlegen" still
  aus dem Switcher verschwunden.
  DIE VORGÄNGER `my.` UND `start.` ANTWORTEN 301, NICHT 404 (Pfad + Query
  unverändert): sie wurden BEWORBEN, und eine Einladungs-Mail trägt ihren
  `?code=` sieben Tage. Regel `core/shared/legacyControlHosts.ts`, Middleware
  `core/server/middleware/00.legacy-control-hosts.ts` (liegt in core, weil sie
  VOR `00.tenant.ts` laufen muss — innerhalb EINES Verzeichnisses ist die
  Reihenfolge nachprüfbar, über Layer-Grenzen hinweg nicht), Liste in
  `apps/platform/app/app.config.ts` (`tenancy.legacyControlHosts`). Sie bleiben
  deshalb auch im TLS-Wächter: eine 301 wird erst NACH dem Handshake gesprochen.
  `app.pukalani.app` (Altname) ist am 2026-07-27 ENTFERNT — nie beworben, kein
  DNS-Eintrag, stand nur in controlHosts; antwortet jetzt 404. ALLE Altnamen
  bleiben in RESERVED_SUBDOMAINS gesperrt (Phishing), dazu `admin` (seit AH-4
  die Betreiber-Konsole, also vergeben statt nur gesperrt) und `master` (AH-5)
  vorreserviert.
- TLS-Fallen (beide live erwischt): (1) Port 80 antwortet nur für explizit
  konfigurierte Hosts — die HTTP-Prüfung von Let's Encrypt scheitert für
  Aliase/Wildcards, deshalb IMMER DNS-01 über Cloudflare. (2) ploi benennt die
  certbot-Lineage nach der Root-Domain DER SITE — es gibt also mehrere
  (Stand AH-4b/F3: `admin.pukalani.app` und `portfolio.pukalani.app` je
  eigen; die Lineages `control.pukalani.app` und `comments.pukalani.app`
  sind mit Site-Umbenennung bzw. Site-Löschung Geschichte, beide Altnamen
  leben von der Wildcard). GETEILT ist nur `pukalani.app`, und darin
  liegt das **Wildcard** `*.pukalani.app`: die Sites `pukalani.app` UND
  `platform.pukalani.app` binden dieselbe Lineage ein, und daran hängen platform,
  demo, help und JEDER Mandanten-Host. Eine Anforderung dort überschreibt sie
  für alle — das ist der Vorfall, der platform+demo 40 min lahmlegte, nicht eine
  zonenweite Regel. Ein gemeinsames Apex+Wildcard-Zertifikat ist über ploi NICHT herstellbar
  (ploi fordert nur die Domains DER SITE an und filtert Fremdnamen raus).
  Deshalb seit 2026-07-27: `pukalani.app` läuft als EINZIGER Host der Zone
  **proxied** über Cloudflare (Automatik AUS); alle anderen Hosts leben vom
  Wildcard `*.pukalani.app`. Zonen-Modus seit D4 (2026-08-03) **„Full
  (Strict)"** — davor „Full", weil der Ursprung für den Apex das Wildcard
  auslieferte und ein Wildcard die WURZEL nicht abdeckt (Strict hätte den Apex
  getötet). Jetzt liegt dort ein **Cloudflare-Origin-Zertifikat** (nur
  `pukalani.app`, `/home/ploi/certs/apex/`, gültig bis 2041), eingebunden
  AUSSCHLIESSLICH im Apex-Serverblock. `www` behält das Wildcard und MUSS es
  behalten: es ist grau (nicht proxied), Browser sprechen direkt mit dem
  Ursprung, und dem Origin-CA vertraut nur Cloudflare. VERBOTEN: „Add certificate"/„Force-renew" auf der
  ploi-Site `pukalani.app` — das überschreibt das Kunden-Wildcard. Neu
  anfordern nur auf der Site `platform.pukalani.app` mit `*.pukalani.app`.
  Wächter `node scripts/ops/verify-tls.mjs` (alle 30 min + nach jedem Deploy).
- DIE WÄCHTER, EIN WORKFLOW, EIN ALARMWEG (`.github/workflows/
  production-watch.yml`, seit 2026-08-20; Alarmweg MON1 seit 2026-10-28): Job
  `tls` alle 30 min (`verify-tls.mjs` + `verify-health.mjs` — ok:true auf
  jedem Host, Appwrite-Version; weder ssh noch Secret), Job `server` täglich
  04:17 UTC mit `verify-site-env.mjs`, `verify-stale-keys.mjs --strict`,
  `verify-instance-admins.mjs`, `verify-mail-breaker.mjs` (Notbremse im
  pm2-Log, Resend-Zähler mit Secret) und seit 2026-11-14 `verify-ai-models.mjs`
  (BE-004: hat jedes konfigurierte KI-Modell noch den Endpunkt, auf den der
  Code es festlegt? öffentliche Liste, kein Secret; „OpenRouter nicht
  erreichbar" ist Exit 2 und bleibt grün), seit 2026-11-16 `verify-turnstile.mjs`
  (OPS-012: ist die Bot-Prüfung auf jeder Site scharf? je Site ein Aufruf ohne
  Token und ein Seitenabruf, kein Secret; eine unklare Antwort bekommt nach
  20 s einen zweiten Versuch) und seit 2026-11-15 der Blick aufs
  nächtliche Backup (OPS-001: Tor-Wort `backup-status` auf appwrite-prod, rot
  bei gescheitertem Lauf oder wenn der Lauf dieser Nacht fehlt; eigener
  Probealarm `-f backup_drill=true`). Seit 2026-11-16 (OPS-008) liest der
  Health-Blick im Halbstunden-Takt außerdem den DATENBANK-STAND: jede App mit
  Appwrite meldet in `/api/health` das Feld `schema` (ok | behind | unknown —
  passt die Datenbank zum ausgerollten Programm? Regel in `appwrite.md`),
  und `verify-health.mjs` wird rot bei `behind`, bei `unknown` nach dem
  zweiten Versuch und wenn das Feld fehlt (Hosts mit `schema: true` in der
  Liste; Landing und Hilfe haben keine Datenbank). Auch die Probe des Deploys
  liest es: `behind` ⇒ alle Apps werden ausgeliefert, der Lauf endet rot.
  Eigener Probealarm `-f schema_drill=true` (täuscht für EINEN Host `behind`
  vor, an Production fehlt nichts). Seit 2026-11-16 (OPS-011, GA1 P22) sieht
  der Alarm auch IN DIE APP HINEIN: jeder Zeit-Lauf meldet sich über EINE
  Hilfe an (`defineTimedJob`, `core/server/utils/timedJob.ts` — ein Test wird
  rot bei `setInterval(` in einem Server-Plugin) und schreibt nach jedem Takt
  eine Zeile `job.run`; jeder KI-Ausfall schreibt `ai.failed`; alle sechs
  ausgerollten Apps schreiben ihre 5xx (`pukalani.observability`). Gezählt
  wird AUF dem App-Server vom festen Skript `ops/app-watch-counts.mjs` (der
  Deploy legt es neben die Ecosystem-Datei; liest nur, gibt nur Zahlen und
  Kennungen in fester Form aus — die AKTUELLEN zwei Log-Dateien aus
  `pm2 jlist`, nie `*-error*.log`: dort liegen alte Dateien früherer
  pm2-Nummern daneben). Gerechnet wird im Repo: `verify-app-signals.mjs`
  täglich, Regeln und Messwerte in `scripts/ops/app-signals-rules.mjs`,
  erwartete Läufe je App in `ops/timed-jobs.conf` (NEUER ZEIT-LAUF ⇒ dort
  eintragen; die Liste ist an Production abgelesen, weil die Tore nur der
  Server kennt). Rot: kein guter Lauf seit zwei Takten plus 30 Minuten, ein
  Tages-Lauf zuletzt gescheitert, ein erwarteter Lauf nie gemeldet, KI mit
  Status 402 oder 404, auf `platform` ab 25 Server-Fehlern in 25 h. ALLES
  ANDERE ZÄHLT NUR (Server-Fehler der fünf anderen Apps, Browser-Fehler,
  übrige KI-Ausfälle), bis die Zahlen einer Woche vorliegen — eine Schwelle
  ohne Messung ist geraten, und ein Blick, der zu oft rot ist, wird
  überlesen. Probealarm `-f signals_drill=true`. Dazu die LIVE-VERBINDUNG
  (OPS-004): alle 30 min ein WebSocket-Handshake von außen
  (`verify-realtime.mjs --handshake`, drei Versuche, der dritte nach 5½
  Minuten — länger als der Takt des Wächters auf dem Server), täglich der
  Stand dieses Wächters über das Tor-Wort `realtime-status`
  (`~/ops/realtime-watchdog.sh` auf appwrite-prod: höchstens DREI Neustarts
  in Folge, dann `aufgegeben`, bis ein Handshake wieder gelingt; gemessen
  zwei Neustarts in vier Monaten, beide ohne Erfolg). Probealarm
  `-f realtime_drill=true`. JE ROTEM BEFUND dieser Blicke steht im Issue ein
  Satz, was zu tun ist. Alle decken dieselbe blinde Stelle ab —
  die Konfiguration ist falsch, aber nichts wird von selbst rot. EIN ROTER
  LAUF IST NUR EINE FARBE (Oktober 2026: der TLS-Wächter war 19 Tage und ~900
  Läufe rot, api.pukalani.app lief ab, niemand sah es): der Job `alarm` macht
  daraus ein Issue `produktions-alarm` (offen = Alarm, grün schließt es),
  eine Mail bei jedem Wechsel (Secret) und einen Heartbeat bei grün (Secret).
  Probealarm `gh workflow run production-watch.yml -f alarm_drill=true` —
  monatlich und nach JEDER Workflow-Änderung; Runbook + Klickliste
  docs/runbooks/PRODUKTIONS-ALARM.md (Befunde 2026-10-28 dort in § 3: die
  ~900 Actions-Mails KAMEN, ein Gmail-Filter nannte sie „Newsletter“;
  Issue-Mails kommen gar nicht; UptimeRobot-Keyword-Monitore per
  `scripts/ops/uptimerobot-sync.mjs`, SSL-Erinnerung dort nur im Bezahltarif).
  Appwrite-Health NIE über `doctor` (sendet SMTP-Testmail), nur
  `/v1/health/version`. GitHub kennt
  keinen Zeitplan JE JOB (jeder cron löst den ganzen Workflow aus), die Takte
  trennt daher `github.event.schedule`. ZWEI SICHERUNGEN dagegen, dass eine
  cron-Änderung den täglichen Teil lautlos abschaltet: der Schritt „Zeitplan
  bekannt?" wird bei unbekanntem cron ROT, und die Bedingung von `server` ist
  NEGATIV formuliert („alles ausser dem Halbstunden-Takt") — so trägt genau EINE
  Zeichenkette Bedeutung. `pnpm ops:stale-keys` findet Zugänge zu GELÖSCHTEN
  Projekten (`--ssh` läuft auf dem Server, `--strict` macht daraus ein Tor):
  NUR 404 beweist „tot", ein 401 heisst oft nur „anderer Wirkungsbereich" —
  und den Umfang rät man auch nicht am Variablen-NAMEN ab. Runbook
  docs/runbooks/ZUGAENGE-AUFRAEUMEN.md.
  Details: docs/content/2.architektur/6.hosts-und-ports.md
- SERVER-EINSTELLUNGEN STEHEN ALS VORLAGE IM REPO (GA1 P23, seit 2026-11-16,
  Davids Entscheidung): die nginx-Dateien lagen nur in Ploi und waren von Hand
  gewachsen — zwei Sites reichten monatelang die Adresse des Aufrufers nicht
  an die App weiter, zwei setzten Schutz-Kopfzeilen, sechs keine. Jetzt:
  `ops/nginx/*.conf.template` (Einzel-Site, mit langen Routen, Pool-Site,
  Kundendomain), `ops/nginx-sites.conf` (Site, Art, Port, Zugriffs-Log) und
  `ops/cron.conf` (erwartete Zeitpläne je Server, OHNE Werte). PFLICHT-ZEILEN
  je Block, der an die App weiterreicht: `Host $host`, `X-Real-IP`,
  `X-Forwarded-For $proxy_add_x_forwarded_for` (ohne sie bestimmt der Aufrufer
  seine Adresse selbst), `X-Forwarded-Proto`, `proxy_read_timeout`
  AUSDRÜCKLICH (60s; ein Block für lange Routen höchstens 180s, und er
  WIEDERHOLT die vier Zeilen — sie werden aus `location /` nicht vererbt), der
  Port aus der Liste; je Server-Block feste Namen (nie `_`), die Sperre für
  Punkt-Dateien und `access_log off` (ohne die Zeile schreibt das GLOBALE Log
  des Servers mit: Adresse, ganze Anfragezeile, 52 Tage). SCHUTZ-KOPFZEILEN
  SETZT NUR DIE APP (SEC-006): `core/shared/securityHeaders.ts` +
  `core/server/plugins/security-headers.ts`, für JEDE Antwort `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS (ein Jahr, ohne
  `includeSubDomains`, ohne `preload`, nie auf lokalen Hosts), auf Seiten `frame-ancestors`
  (weiter nur aus `frameAncestors.ts`), eine Skript-CSP im Modus Report-Only
  und kein `x-powered-by`. KEIN `add_header` für diese Namen in einer
  nginx-Datei (Ploi schreibt bei einer neuen Site drei hinein — löschen) und
  KEIN `X-Frame-Options` irgendwo: es kann die Erlaubnisliste von `/embed`
  nicht ausdrücken. Eine Seite, die strenger sein will, setzt ihren Wert per
  Middleware am Event (so `Referrer-Policy: no-referrer` auf den Token-Seiten
  des Newsletters). DATEIEN tragen die Kopfzeilen nur im BUILD: im Dev-Server
  liefert nicht Nitro `/_nuxt/*` und `public/` aus. ZWEI TÄGLICHE BLICKE:
  `verify-server-config.mjs` (auf app-prod laufen `ops/nginx-check.mjs` und
  `ops/cron-check.sh`, der Deploy legt sie neben die Ecosystem-Datei; auf
  appwrite-prod das Tor-Wort `cron-status`, dafür liegen `cron-check.sh` und
  `cron.conf` VON HAND in `~/ops/`) und `verify-security-headers.mjs` (von
  außen, roh gezählt: jede Kopfzeile genau einmal; eine Datei, die ein
  vorgeschalteter Zwischenspeicher ausliefert — `cf-cache-status: HIT` auf
  pukalani.app —, wird nicht bewertet, sie trägt die Kopfzeilen ihres ersten
  Abrufs). Verglichen werden
  Pflicht-Zeilen, nicht Zeichen — Ploi schreibt eine Datei bei Zertifikat
  oder Alias um, das bleibt grün. Die Skripte geben nur Zahlen, Site-Namen aus
  der Liste und Regel-Namen aus (Kundendomains als Nummer; `--namen` nur von
  Hand). Zeitpläne stehen an ZWEI Stellen: im crontab von `ploi` und in
  `/etc/crontab` (dorthin schreibt Ploi seine „Cronjobs") — derselbe Eintrag
  stand so monatelang doppelt. NEUER ZEITPLAN ⇒ erst `ops/cron.conf` und
  ausliefern, dann anlegen; ENTFERNEN umgekehrt. NEUE SITE ⇒
  docs/runbooks/NEUE-SITE.md. Probealarm `-f config_drill=true`.
  MAIL-LINKS (SEC-010): Reset-Mail und OAuth-Rückweg nehmen in Apps OHNE
  Mandanten-Auflösung `public.appUrl` (`resolveTrustedOrigin`,
  `core/server/utils/trustedOrigin.ts`), den Namen der Anfrage nur, wo
  `00.tenant.ts` ihn geprüft hat; fehlt `appUrl`, schreibt die App
  `auth.app_url_missing` und fällt zurück. `NUXT_PUBLIC_APP_URL` ist Pflicht
  auf platform, admin, portfolio und branding. TERMIN-ERINNERUNGEN fährt die
  App selbst (Zeit-Lauf `event-reminders` im events-Layer, stündlich, alle
  Communities, der Mandant kommt aus dem Stempel der Termin-Zeile) — auf dem
  Server gibt es dafür KEINEN Zeitplan mehr.
- ZWEI CI-SCHLÜSSEL, ZWEI UMGEBUNGEN (GA1 P08, seit 2026-11-14): GitHub
  Actions erreicht die Server über ZWEI getrennte SSH-Schlüssel, und beide
  liegen nicht mehr auf Repo-Ebene, sondern in GitHub-Umgebungen, die nur den
  Zweig `main` zulassen — `production` (`DEPLOY_SSH_KEY`, nur `deploy.yml`) und
  `production-watch` (`WATCH_SSH_KEY`, Mail-Zugang, Heartbeat; nur
  `production-watch.yml`). Ein Lauf von einem Arbeitszweig wird von der
  Umgebung abgewiesen („not allowed to deploy to … due to environment
  protection rules") — das ist die Sperre, kein Fehler; ein Job OHNE Umgebung
  bekommt auf keinem Zweig ein Secret. `deployment: false` an einem Job nimmt
  nur den Eintrag in der Deployment-Liste weg, die Zweig-Regel greift
  trotzdem (gemessen). Auf app-prod stehen beide Schlüssel mit `restrict` in
  `authorized_keys` (kein Terminal, keine Weiterleitung), auf appwrite-prod
  NUR der Wächter-Schlüssel und nur mit festem Befehl: sshd führt dafür immer
  `~/bin/pukalani-cert-gate.sh` aus (Quelle `ops/appwrite-cert-gate.sh`,
  erlaubt `probe`, `renew`, `reset-account`, `backup-status`,
  `realtime-status`, `cron-status`; Einspielen nur von Hand — ebenso
  `~/ops/realtime-watchdog.sh`, vorher `ops/realtime-watchdog-attrappe.sh`).
  Vom
  App-Server führt KEIN SSH-Weg zum Appwrite-Server. DER SCHLÜSSEL LIEGT NIE
  NEBEN FREMDEM CODE: `deploy.yml` baut im Job `build` ohne jedes Secret und
  liefert im Job `deliver` ohne `pnpm` aus; `pnpm check:workflows` hält das
  (Job mit Secret ⇒ Umgebung; Job mit Umgebung ⇒ kein Installieren). DIE
  PROTOKOLLE DER LÄUFE SIND ÖFFENTLICH (jedes GitHub-Konto, 90 Tage): kein
  Server-Protokoll, keine Dateiliste, keine Konfiguration, keine Mail-Adresse
  hinein — gefiltert wird dort, wo die Ausgabe entsteht (im Tor-Skript auf dem
  Server), nicht im Workflow. Eine `vars.*`-Variable wird NICHT maskiert,
  und GitHub druckt das `env:` JEDES Schritts in den Kopf des Protokolls — die
  Empfänger-Adresse des Alarms stand so noch nach dem ersten Fix im Lauf
  (2026-11-15 bemerkt). `check:workflows` verbietet `vars.` deshalb ganz.
  Ploi schreibt eigene Schlüssel mit einer Kommentarzeile in dieselbe
  `authorized_keys`; die CI-Zeilen sind von Hand eingetragen (Ploi kennt keine
  Optionen) und nach jeder Schlüssel-Änderung im Panel zurückzulesen.
  Tauschen, Tor aktualisieren, Fallen: docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md
- RÜCKWEG BEI EINEM SCHLECHTEN STAND (GA1 P10, seit 2026-11-15): die
  Reihenfolge ist ZURÜCKSTELLEN → `git revert` → erst dann Ursache suchen.
  `ops/rollback.sh <app>` zeigt die Stände, die auf app-prod liegen
  (`/home/ploi/releases/<app>/<commit>`), `… <commit> --apply` legt den
  Verweis um, lädt den pm2-Prozess neu und prüft dreimal Build UND `ok` — vom
  eigenen Rechner über den eigenen SSH-Zugang, OHNE GitHub; ohne `--apply`
  ändert es nichts, ein unbekannter Stand bricht vor jedem Handgriff ab.
  Über GitHub: `gh workflow run deploy.yml -f sha=<vollständiger Commit>`
  liefert einen älteren Commit von `main` auf alle Apps (Riegel „liegt auf
  main" bleibt; `ops/` und die App-Liste kommen dabei von der Spitze von
  `main`, nur das Programm vom alten Commit — ein alter Commit kennt
  womöglich einen Prozess, den es nicht mehr gibt). DIE EINE APP-LISTE ist
  `ops/apps.conf` (App, Site; Stände-Verzeichnis = App, Prozess = Site ohne
  Punkte): `deploy.yml` und `rollback.sh` lesen beide sie, der Test
  `packages/core/tests/deployApps.test.ts` hält Liste, Ecosystem-Dateien,
  Workflow und Health-Wächter zusammen — eine Umbenennung, die nur die halbe
  Kette nachzieht, wird dort rot (der Rückweg nannte drei Monate lang einen
  gelöschten Prozess). DER RÜCKWEG HÄLT NUR BIS ZUM NÄCHSTEN PUSH AUF `main`
  (auch ein reiner Doku-Push: die Diff-Basis ist der älteste lebende Build),
  die Datenbank geht nicht mit zurück (Migrationen haben keinen Rückweg), und
  jedes Neuladen liest die `.env` neu. Auf dem Server liegen je App nur VIER
  Stände (gezählt 2026-11-15; das Stutzen zählt den Verweis mit). ETWAS NEUES
  ausliefern ohne GitHub Actions geht praktisch nicht: einen Checkout für den
  ploi-Knopf haben nur noch `portfolio` und `platform` (Stand Juli, nie
  geübt). Ein manueller Start, der hinter einem laufenden Ausliefern WARTET,
  wird vom nächsten wartenden Lauf verdrängt („cancelled") — nach dem Start
  nachsehen. Der Deploy prüft seitdem auch `ok`:
  Build falsch ⇒ Abbruch wie bisher; Build richtig, `ok` nicht true ⇒ die
  übrigen Apps werden trotzdem ausgeliefert und der Lauf endet rot. Von
  selbst zurückgestellt wird nie (Davids Entscheidung 2026-11-15,
  DECISION-LOG). Geübt am 2026-11-15: `help` zurück und vor je 12 s, ein
  älterer Commit über GitHub auf alle sechs Apps 12 min. Runbook mit Grenzen,
  Notweg ohne GitHub und dem Protokoll der Übungen:
  docs/runbooks/DEPLOYMENT.md, Abschnitt A3.
- BACKUP DER APPWRITE-INSTANZ (GA1 P11, seit 2026-11-15): jede Nacht 03:30 UTC
  aus dem crontab von `ploi` auf appwrite-prod, `~/ops/appwrite-backup.sh
  --run` (Quelle `ops/appwrite-backup.sh`; OHNE `--run` zeigt es nur die
  Vorschau — ein Zeitplan ohne den Schalter sichert nichts). Ein Lauf ist ein
  Ordner `runs/<Zeitstempel>/`: Dump, sechs Volumes, die Einstellungen und die
  Zählung je Tabelle, alles mit dem ÖFFENTLICHEN Schlüssel
  `ops/appwrite-backup.pub.asc` verschlüsselt. Der private Schlüssel liegt nur
  in Davids Passwort-Managern — nie auf dem Server, der Storage Box oder im
  Repo; der Server kann seine eigenen Backups nicht lesen. Die `.env` gehört
  hinein: ohne `_APP_OPENSSL_KEY_V1` sind in einem Dump die API-Schlüssel der
  Projekte, die Zwei-Faktor-Geheimnisse und alle verschlüsselten Buckets
  unlesbar. DIE EINE VOLUME-LISTE ist `ops/appwrite-volumes.conf` (Backup,
  Wiederherstellung UND Spiegel lesen sie); Volume-NAMEN kommen aus `docker
  compose config`, nie aus einer Vorsilbe (`appwrite-builds` heißt auch als
  Volume so, daneben liegt ein alter Rest `appwrite_appwrite-builds`). Ein
  Volume in der Compose-Datei, das die Liste nicht kennt, bricht das Backup
  ab. ABGEGLICHEN WIRD OHNE `--delete` (ein Test hält das); die Box hält 30
  Tage, der Server 14, aufgeräumt wird auf der Box nur nach dem NAMEN mit
  Unter- und Obergrenze, dazu tägliche Schnappschüsse der Box. Der Lauf prüft
  sich selbst und schreibt eine Stand-Datei; der Wächter liest sie über das
  Tor (`backup-status`). ZURÜCK: `ops/appwrite-restore.sh` spielt nur auf einen
  Rechner OHNE Appwrite und überschreibt nie etwas — nie auf dem Mac mit der
  Entwicklungs-Instanz laufen lassen (es weigert sich dort). Nach JEDER
  Änderung an einem der Skripte oder der Liste: `ops/appwrite-backup-attrappe.sh`
  (Wegwerf-Container mit eigenem Docker-Dienst, Gegenproben inklusive), dann
  von Hand auf den Server (kein CI-Weg). Der Compose-Ordner dort ist
  `/home/ploi/appwrite`; `/usr/src/code/appwrite` aus den Upgrade-Runbooks
  ist derselbe Ordner von INNEN (Container des Upgrade-Werkzeugs). ZWEI
  SHELL-FALLEN, beide hier erwischt: `docker compose exec -T` liest die
  Standard-Eingabe leer (in einem Skript, das selbst von dort kommt,
  verschluckt es den Rest ⇒ `</dev/null`), und `… | head -1` oder `… | grep
  -q` schließt die Pipe früh — mit `pipefail` ein Scheinfehler (Exit 141),
  und nur manchmal. Runbook mit Ernstfall, Betrieb und dem Protokoll der
  Übung: docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md.
- EINE FEHLENDE ENV-VARIABLE WIRD NICHT ROT (F44, 2026-08-02): `platform`
  hatte kein `NUXT_SMTP_*`, also ging für JEDE Kunden-Community nie eine
  Benachrichtigungs-Mail raus — die App lief, die Seiten antworteten, nur die
  Mail blieb aus, und das sieht aus wie ein bewusst abgeschaltetes Produkt.
  Zwei Netze: `pnpm ops:site-env` (liest über ssh nur die SCHLÜSSELNAMEN jeder
  Server-`.env`, Werte bleiben dort; Pflicht-Liste gepflegt IM Skript, neue
  Pflicht-Variable ⇒ dort eintragen — läuft seit 2026-08-20 TÄGLICH in der CI,
  s. Wächter-Absatz unten) und zur Laufzeit
  `warnMailerMissingOnce()` in core/server/utils/mailer.ts, das beim ERSTEN
  verworfenen Versand einmal ins Log schreibt. Warnungen gehören dorthin, wo
  etwas verworfen wird — NIE in ein Prädikat wie `isMailerConfigured()`, das
  auch mail-lose Apps (help, marketing, portfolio) beim Start abfragen.
  ANDERS BEI DER TRENNUNG DER COMMUNITIES (SEC-025, seit 2026-11-13 — Davids
  Entscheidung „Eine Sicherung, die nicht prüfen kann, lehnt ab"): fehlt auf
  `platform` eine der VIER `NUXT_PLATFORM_CONTROL_*` (Endpunkt, Projekt,
  Database-Id, Schlüssel), wird nicht gewarnt und weitergelaufen, sondern
  ABGELEHNT — jede Anfrage auf jedem Host 503, nur `/api/health` antwortet
  mit `ok:false` und `reason: tenant_resolver_missing` (HTTP 200, `.build`
  bleibt für den Deploy lesbar; `verify-health` und UptimeRobot werden rot).
  Die Namen der fehlenden Variablen stehen beim Start als Fehlerzeile im
  pm2-Log, nie in einer Antwort. Alle vier stehen seitdem auf der
  Pflicht-Liste (vorher nur der Schlüssel). Kein Schalter stellt das ab.
  `NUXT_REDIS_URL` steht seit 2026-11-16 auf der Pflicht-Liste von platform,
  admin und portfolio (ohne sie zählt jeder Prozess für sich und beginnt bei
  jedem Ausliefern neu); auf `branding.supply` ist sie noch NICHT gesetzt
  (OPEN-ITEMS „WA1").
  REIHENFOLGE BEI EINER NEUEN VARIABLE (zuletzt
  `NUXT_INSIGHTS_NEWSLETTER_SECRET`, SEC-020, 2026-11-15): der Code läuft mit
  einem Rückfall, bis der Wert steht — erst ausliefern, dann den Wert auf dem
  Server setzen (Davids Ja; neu laden über die Ecosystem-Datei, zurücklesen),
  und ERST DANN der Eintrag in die Pflicht-Liste. Der Wächter läuft täglich:
  ein Eintrag vor dem Setzen öffnet jeden Tag einen Alarm.
  JEDE EINSTELLUNG HAT EINE ENTSCHEIDUNG (P20, seit 2026-11-16): der Test
  `packages/core/tests/verifySiteEnv.test.ts` liest alle `NUXT_…`-Namen aus
  dem Code (`runtimeConfig` aller Layer und Apps, jedes `process.env.NUXT_…`)
  und verlangt je Name genau eine Antwort — Pflicht auf mindestens einer Site,
  „keine Pflicht" mit Grund oder (Bestand) „noch nicht bewertet"
  (`scripts/ops/site-env-decisions.mjs`). Eine neue Einstellung ohne Antwort
  ist rot; die Pflicht-Liste selbst bleibt von Hand.
- Neue Namen IMMER in RESERVED_SUBDOMAINS (packages/control/schemas/tenant.ts),
  sonst kann ein Selbstbedienungs-Kunde sie beantragen.
- HERKUNFTSPRÜFUNG (SEC-004, seit 2026-11-13 ÜBERALL AN): alle Hosts unter
  `*.pukalani.app` sind same-site zueinander, `SameSite=Lax` trennt sie nicht.
  Regel (`core/server/utils/csrfOrigin.ts`, Middleware `03.csrf-origin.ts`):
  schreibende `/api`-Aufrufe mit `Sec-Fetch-Site: cross-site` ⇒ 403; `same-site`
  oder fehlender `Sec-Fetch-Site` MIT `Origin` ⇒ Origin-Host samt Port muss der
  Request-Host sein; ohne beide Kopfzeilen (Server, Webhooks, Runner) ⇒ durch.
  Gilt in JEDER App, die den Core erweitert — KEIN Schalter (Davids
  Entscheidung; der frühere `pukalani.security.csrfOriginCheck` ist mit Stufe 2
  entfernt und darf in keiner `app.config.ts` zurückkehren). AUSNAHMEN nur als
  einzelne Route mit Grund in `core/shared/csrfOriginExempt.ts`
  (`CSRF_ORIGIN_EXEMPT_ROUTES`, heute leer; NIE für Routen mit Sitzungs-Cookie);
  daneben `CSRF_ORIGINLESS_CALLERS` = warum Naht, Webhooks und Runner ohne
  Browser-Kopfzeilen durchgehen. SSR-FALLE: beim Server-Rendern reicht Nuxt die
  Kopfzeilen der Navigation (auch `sec-fetch-site`, ohne `Origin`) an interne
  Aufrufe weiter — ein schreibender Aufruf beim Rendern scheitert, sobald die
  Seite über einen fremden Link kam (so `/join` aus Webmail). KEINE schreibenden
  Aufrufe beim Server-Rendern: `server: false`, `onMounted` oder Handler, die
  Seite zeigt bis dahin ihren Ladezustand. Wächter in `packages/core/tests/`:
  `ssr-write-fetch.test.ts` (SSR-Schreibaufrufe, TS-Parser),
  `csrf-origin-routes.test.ts` (origin-lose Aufrufer je Klasse gezählt; Teil B
  wird rot bei einem Config-Gate in der Middleware oder dem Schlüssel
  `csrfOriginCheck` in irgendeiner `app.config.ts`), `csrfOriginExempt.test.ts`.
