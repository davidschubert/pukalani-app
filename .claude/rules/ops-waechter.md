---
paths:
  - ".github/workflows/production-watch.yml"
  - "scripts/ops/verify-*.mjs"
  - "scripts/ops/alarm-issue.mjs"
  - "scripts/ops/app-signals-rules.mjs"
  - "scripts/ops/customer-hosts*.mjs"
  - "scripts/ops/uptimerobot-sync.mjs"
  - "ops/app-watch-counts.mjs"
  - "ops/timed-jobs.conf"
  - "ops/realtime-watchdog.sh"
  - "packages/control/shared/watchHosts.ts"
  - "packages/control/server/utils/watchHostsGate.ts"
  - "packages/control/server/api/control/watch/**"
  - "docs/runbooks/PRODUKTIONS-ALARM.md"
  - "docs/runbooks/SICHERHEITSVORFALL.md"
  - "docs/runbooks/ANFRAGEN-VON-AUSSEN.md"
  - ".github/workflows/buehne.yml"
  - ".github/workflows/secrets-watch.yml"
---

## Ops: Wächter und Alarm
Hosts und TLS: `.claude/rules/hosts-ops.md`.

- EIN WORKFLOW, EIN ALARMWEG: alle Produktions-Blicke stehen in
  `.github/workflows/production-watch.yml` — welcher Blick in welchem Job und
  Takt läuft, steht dort (Kopfkommentar und Jobs `tls`, `kundendomains`,
  `server`), nicht hier. Runbook mit Klickliste je rotem Befund:
  `docs/runbooks/PRODUKTIONS-ALARM.md`.
- EIN ROTER LAUF IST NUR EINE FARBE (MON1): der Job `alarm` macht daraus das
  Issue `produktions-alarm` (offen = Alarm), eine Mail bei jedem Wechsel und
  einen Heartbeat bei grün. JE ROTEM BEFUND steht im Issue ein Satz, was zu
  tun ist.
- WESHALB DAS ISSUE OFFEN IST, STEHT ALS LABEL DARAN (KM1 e): `alarm:tls`,
  `alarm:server`, `alarm:kundendomains`. Ein Lauf ändert nur, was er GEMESSEN
  hat (Job rot ⇒ Label dazu, grün ⇒ weg, `skipped` ⇒ bleibt); geschlossen
  wird mit dem letzten Label. `alarm:server` schließt also nur ein Lauf, in
  dem der tägliche Teil lief UND grün war (Tageslauf oder
  `gh workflow run production-watch.yml`). Der Heartbeat hängt am LAUF, nicht
  am Issue. Regel mit Tests: `scripts/ops/alarm-issue.mjs`
  (`packages/core/tests/alarmIssue.test.ts`). NEUER WÄCHTER-JOB ⇒ Zeile in
  `SOURCES` dort, sonst kennt der Alarmweg ihn nicht.
- PROBEALARM `gh workflow run production-watch.yml -f alarm_drill=true` —
  monatlich und nach JEDER Workflow-Änderung; nach einer Änderung am
  Alarmweg selbst beide Teile proben (`signals_drill`, dann `alarm_drill`).
  Jeder Blick hat seinen eigenen Schalter (`<name>_drill`, Liste unter
  `workflow_dispatch` im Workflow). EIN PROBEALARM WIRD VON HAND AUFGERÄUMT
  (Lauf ohne Schalter, dort laufen alle Jobs).
- ZEITPLAN: GitHub kennt keinen cron JE JOB (jeder cron löst den ganzen
  Workflow aus), die Takte trennt `github.event.schedule`. Zwei Sicherungen:
  der Schritt „Zeitplan bekannt?" wird bei unbekanntem cron ROT, und die
  Bedingung von `server` ist NEGATIV formuliert („alles außer dem
  Halbstunden-Takt") — so trägt genau EINE Zeichenkette Bedeutung.
- NEUE SCHWELLE ODER NEUER HOST: erst zählen, dann Alarm. Schalter
  `count`/`alarm` im Workflow (`PUKALANI_DELIVERY_MODE`,
  `PUKALANI_CUSTOMER_HOSTS_MODE`); ein Signal ohne Messung zählt nur — eine
  Schwelle ohne Messung ist geraten, und ein Blick, der zu oft rot ist, wird
  überlesen.
- „NICHT ERREICHBAR" IST KEINE AUSSAGE: Exit 2 bleibt grün (OpenRouter bei
  `scripts/ops/verify-ai-models.mjs`, Server/Tor-Wort unbekannt bei
  `scripts/ops/verify-node-version.mjs`; bei `scripts/ops/verify-server-scripts.mjs`
  ist dasselbe eine Warnzeile mit Exit 0). Eine unklare
  Antwort bekommt einen zweiten Versuch, bevor sie rot wird
  (`scripts/ops/verify-turnstile.mjs`, `unknown` bei `scripts/ops/verify-health.mjs`).
- `scripts/ops/verify-ai-models.mjs` liest je Modell zwei Listen (weltweit und Europa) —
  Regel in `ki.md`.
- DATENBANK-STAND: `scripts/ops/verify-health.mjs` wird rot bei `schema: behind`, bei
  anhaltendem `unknown` und bei fehlendem Feld (nur Hosts mit `schema: true`
  in seiner Liste; Landing und Hilfe haben keine Datenbank). Die Probe des
  Deploys: `behind` ⇒ alle Apps werden ausgeliefert, der Lauf endet rot.
  Regel in `appwrite-migrationen.md`.
- NODE-VERSION (`scripts/ops/verify-node-version.mjs`, Tor-Wort `node-version`): rot bei
  JEDER anderen Version als `.nvmrc`, auch einer neueren ⇒ `.nvmrc` und
  Server am selben Tag heben (`docs/runbooks/DEPLOYMENT.md`, A4). Ein
  fehlender Prozess ist nur eine Warnzeile.
- AUSLIEFERUNG VON AUSSEN (`scripts/ops/verify-delivery.mjs`): DIE APP PACKT IHRE DATEIEN
  SELBST (`nitro.compressPublicAssets` in `packages/core/nuxt.config.ts`); die
  nginx-Vorlagen tragen dazu nichts und keinen Block für `/robots.txt` (Regel
  `eigene-robots` in `ops/nginx-check.mjs`).
- ANMELDE-REGELN: `scripts/ops/appwrite-auth-policies.mjs --ci` liest täglich nur
  (Schlüssel des Schema-Blicks mit `project.policies.read`): rot bei
  verstellter Regel UND wenn er nicht lesen kann.
- LIVE-VERBINDUNG (OPS-004): Handshake von außen (`scripts/ops/verify-realtime.mjs
  --handshake`) und der Stand des Wächters auf appwrite-prod (Tor-Wort
  `realtime-status`); `~/ops/realtime-watchdog.sh` startet höchstens
  `MAX_RESTARTS` Mal in Folge neu, dann `aufgegeben`, bis ein Handshake wieder
  gelingt.
- BACKUP-STAND: Tor-Wort `backup-status`, rot bei gescheitertem Lauf oder
  wenn der Lauf dieser Nacht fehlt. Den Stand des Docker-Server-Backups liest
  noch KEIN Wächter (OPEN-ITEMS „DS1").
- IN DIE APP HINEIN (OPS-011): jeder Zeit-Lauf meldet sich über
  `defineTimedJob` an (`core/server/utils/timedJob.ts`; Test
  `packages/core/tests/timedJobGuard.test.ts` rot bei `setInterval(` in einem Server-Plugin) und
  schreibt `job.run`; KI-Ausfälle `ai.failed`; 5xx über
  `pukalani.observability`. GEZÄHLT wird AUF dem App-Server vom festen
  Skript `ops/app-watch-counts.mjs` (der Deploy legt es neben die
  Ecosystem-Datei; liest nur, Ausgabe in fester Form) — nur die AKTUELLEN
  Log-Dateien aus `pm2 jlist`, nie `*-error*.log` (dort liegen alte Dateien
  früherer pm2-Nummern). GERECHNET wird im Repo: `scripts/ops/verify-app-signals.mjs`;
  was rot macht und was nur zählt, IST `scripts/ops/app-signals-rules.mjs`.
  NEUER ZEIT-LAUF ⇒ Zeile in `ops/timed-jobs.conf` für jede App, in der er
  fährt (das hängt am Tor des Servers, nicht am Code — an Production ablesen).
- NACH `pm2 update` BEGINNT DIE ZÄHLUNG NEU: neue pm2-Nummer, neue
  Log-Dateien; der Blick nennt die Reichweite selbst (Zeile `reichweite`).
- `pnpm ops:stale-keys` findet Zugänge zu GELÖSCHTEN Projekten (`--ssh` auf
  dem Server, `--strict` als Tor): NUR 404 beweist „tot", ein 401 heißt oft nur
  „anderer Wirkungsbereich" — den Umfang nie am Variablen-NAMEN raten.
  Runbook `docs/runbooks/ZUGAENGE-AUFRAEUMEN.md`.
- Appwrite-Health NIE über `doctor` (sendet eine SMTP-Testmail), nur
  `/v1/health/version`. UptimeRobot-Monitore pflegt
  `scripts/ops/uptimerobot-sync.mjs`.

## Kundendomains im Wächter (WA1 d)
- Die festen Host-Listen von `scripts/ops/verify-tls.mjs`/`scripts/ops/verify-health.mjs` bleiben;
  der Job `kundendomains` liest dazu die live geschalteten Kundendomains aus
  `GET /api/control/watch/hosts` (Regel pur in
  `packages/control/shared/watchHosts.ts`: nur Namen, nur `active`,
  sortiert), geöffnet NUR vom eigenen Geheimnis
  `NUXT_CONTROL_WATCH_HOSTS_SECRET` (leer oder kürzer als
  `WATCH_SECRET_MIN_LENGTH` ⇒ 404; nie das Naht-Geheimnis, keine Sitzung).
- OHNE GEHEIMNIS ODER OHNE ANTWORT WIRD NICHTS ROT: Zeile „nicht gelesen",
  die feste Liste läuft weiter (`scripts/ops/customer-hosts.mjs`).
- EIN HOST-NAME EINES KUNDEN STEHT IN KEINEM PROTOKOLL UND KEINEM ISSUE:
  dort heißt er „Kundendomain <n>/<m>", ohne SAN-Einträge, ohne Fehlertext.
  Den Namen bekommt nur die Alarm-Adresse (Job `kundendomains-namen`) oder
  man liest ihn von Hand mit `--namen` (wirkt in keinem CI-Lauf). Ein Name
  reist NIE über einen Job-Ausgang — GitHub druckt das `env:` jedes Schritts.
- Eine neue Kundendomain braucht keinen Skript-Eintrag; eine eigene Zone des
  Betreibers (wie `branding.supply`) schon (`HOSTS` in `scripts/ops/verify-tls.mjs` UND die Liste in
  `scripts/ops/verify-health.mjs`).

## Vertretung (GA1 P24)
- Jeder Alarmweg endet bei EINER Person; eine zweite Adresse ist
  vorbereitet, eingetragen ist niemand (OPEN-ITEMS „VT1").
  `PRODUCTION_ALARM_MAIL_TO` darf eine Kommaliste sein.
- Das NOTFALLBLATT liegt NICHT im Repo. NIE Namen, Telefonnummern oder
  private Adressen einer Vertretung in Repo, Commit oder Lauf-Protokoll.
- NEUE ALARM-QUELLE ⇒ Zeile in der Tabelle „je Quelle der Handgriff für eine
  zweite Adresse" (`docs/runbooks/PRODUKTIONS-ALARM.md`, § 5).
- Eine Vertretung, die eingreifen soll, bekommt EIGENE Konten (nie ein
  geteiltes Passwort); ein Repo eines Einzelkontos kennt nur eine Stufe — wer
  Läufe starten darf, darf auch zusammenführen und ausliefern. Den privaten
  Backup-Schlüssel bekommt sie nicht.
- `NUXT_ALERT_EMAIL` ist auf keiner Site gesetzt: Missbrauchs-Meldungen,
  Anfragen und Statuswechsel erreichen nur die Glocke im Dashboard.
- OHNE SERVER-ZUGANG geht nicht: Appwrite von Hand starten (`docker compose
  up -d` in `/home/ploi/appwrite`; das Tor kennt dafür kein Wort, Runbook
  § 4). Störfälle ohne eigenes Runbook: `docs/runbooks/SICHERHEITSVORFALL.md`,
  `docs/runbooks/ANFRAGEN-VON-AUSSEN.md`.
