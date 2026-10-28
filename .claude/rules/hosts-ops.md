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
  1:1-Umzug per `scripts/ops/ah4c-project-transfer.mjs` (Runbook
  docs/runbooks/ADMIN-PROJEKT-CUTOVER.md); das Alt-Projekt `control` ist —
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
- SECHS WÄCHTER, EIN WORKFLOW, EIN ALARMWEG (`.github/workflows/
  production-watch.yml`, seit 2026-08-20; Alarmweg MON1 seit 2026-10-28): Job
  `tls` alle 30 min (`verify-tls.mjs` + `verify-health.mjs` — ok:true auf
  jedem Host, Appwrite-Version; weder ssh noch Secret), Job `server` täglich
  04:17 UTC mit `verify-site-env.mjs`, `verify-stale-keys.mjs --strict`,
  `verify-instance-admins.mjs`, `verify-mail-breaker.mjs` (Notbremse im
  pm2-Log, Resend-Zähler mit Secret). Alle decken dieselbe blinde Stelle ab —
  die Konfiguration ist falsch, aber nichts wird von selbst rot. EIN ROTER
  LAUF IST NUR EINE FARBE (Oktober 2026: der TLS-Wächter war 19 Tage und ~900
  Läufe rot, api.pukalani.app lief ab, niemand sah es): der Job `alarm` macht
  daraus ein Issue `produktions-alarm` (offen = Alarm, grün schließt es),
  eine Mail bei jedem Wechsel (Secret) und einen Heartbeat bei grün (Secret).
  Probealarm `gh workflow run production-watch.yml -f alarm_drill=true` —
  monatlich und nach JEDER Workflow-Änderung; Runbook + Klickliste
  docs/runbooks/PRODUKTIONS-ALARM.md. Appwrite-Health NIE über `doctor`
  (sendet SMTP-Testmail), nur `/v1/health/version`. GitHub kennt
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
- Neue Namen IMMER in RESERVED_SUBDOMAINS (packages/control/schemas/tenant.ts),
  sonst kann ein Selbstbedienungs-Kunde sie beantragen.
