---
paths:
  - "ops/nginx/**"
  - "ops/nginx-sites.conf"
  - "ops/nginx-check.mjs"
  - "ops/cron.conf"
  - "ops/cron-check.sh"
  - "scripts/ops/verify-site-env.mjs"
  - "scripts/ops/site-env-decisions.mjs"
  - "scripts/ops/verify-server-config.mjs"
  - "scripts/ops/verify-security-headers.mjs"
  - "packages/core/shared/securityHeaders.ts"
  - "packages/core/server/plugins/security-headers.ts"
  - "packages/core/shared/cspReport.ts"
  - "packages/core/server/api/telemetry/csp-report.post.ts"
  - "packages/core/server/utils/mailer.ts"
  - "apps/platform/server/plugins/tenant-resolver.ts"
  - "docs/runbooks/NEUE-SITE.md"
---

## Ops: Server-Dateien, Kopfzeilen, Env
Wächter und Alarm: `.claude/rules/ops-waechter.md`.

## Webserver-Vorlagen (GA1 P23, Davids Entscheidung)
- DIE SERVER-EINSTELLUNGEN STEHEN ALS VORLAGE IM REPO, nicht nur in Ploi:
  `ops/nginx/*.conf.template` (Einzel-Site, lange Routen, Pool-Site,
  Kundendomain), `ops/nginx-sites.conf` (Site, Art, Port, Zugriffs-Log),
  `ops/cron.conf` (erwartete Zeitpläne je Server, OHNE Werte).
- PFLICHT-ZEILEN je Block, der an die App weiterreicht: `Host $host`,
  `X-Real-IP`, `X-Forwarded-For $proxy_add_x_forwarded_for` (ohne sie bestimmt
  der Aufrufer seine Adresse selbst), `X-Forwarded-Proto`,
  `proxy_read_timeout` AUSDRÜCKLICH (60s; ein Block für lange Routen höchstens
  180s, und er WIEDERHOLT die vier Zeilen — sie werden aus `location /` nicht
  vererbt), der Port aus der Liste. Je Server-Block feste Namen (nie `_`),
  die Sperre für Punkt-Dateien und `access_log off` (sonst schreibt das
  GLOBALE Log des Servers Adresse und Anfragezeile mit).
- Zeitpläne stehen an ZWEI Stellen: im crontab von `ploi` und in
  `/etc/crontab` (dorthin schreibt Ploi seine „Cronjobs"). NEUER ZEITPLAN ⇒
  erst `ops/cron.conf` und ausliefern, dann anlegen; ENTFERNEN umgekehrt.
  Termin-Erinnerungen haben KEINEN Server-Zeitplan: das ist der Zeit-Lauf
  `event-reminders` des events-Layers (stillgelegte/gesperrte Communities
  zählt er nur, nie rot).
- PRÜFUNG täglich: `scripts/ops/verify-server-config.mjs` (auf app-prod laufen
  `ops/nginx-check.mjs` und `ops/cron-check.sh`, der Deploy legt sie neben
  die Ecosystem-Datei; auf appwrite-prod das Tor-Wort `cron-status`, dafür
  liegen `ops/cron-check.sh` und `ops/cron.conf` VON HAND in `~/ops/`). Verglichen
  werden Pflicht-Zeilen, nicht Zeichen — Ploi schreibt eine Datei bei
  Zertifikat oder Alias um, das bleibt grün. Ausgabe nur Zahlen, Site-Namen
  aus der Liste und Regel-Namen (Kundendomains als Nummer, `--namen` nur von
  Hand).
- NEUE SITE ⇒ `docs/runbooks/NEUE-SITE.md`.

## Schutz-Kopfzeilen (SEC-006)
- SCHUTZ-KOPFZEILEN SETZT NUR DIE APP: `core/shared/securityHeaders.ts` +
  `core/server/plugins/security-headers.ts`, für JEDE Antwort `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS (ein Jahr, ohne
  `includeSubDomains`, ohne `preload`, nie auf lokalen Hosts), auf Seiten
  `frame-ancestors` (nur aus `core/server/utils/frameAncestors.ts`), eine
  Skript-CSP als Report-Only und kein `x-powered-by`.
- KEIN `add_header` für diese Namen in einer nginx-Datei (Ploi schreibt bei
  einer neuen Site drei hinein — löschen) und KEIN `X-Frame-Options`
  irgendwo: es kann die Erlaubnisliste von `/embed` nicht ausdrücken.
- Eine Seite, die strenger sein will, setzt ihren Wert per Middleware am
  Event (so `Referrer-Policy: no-referrer` auf den Token-Seiten des
  Newsletters).
- DATEIEN tragen die Kopfzeilen nur im BUILD: im Dev-Server liefert nicht
  Nitro `/_nuxt/*` und `public/` aus.
- CSP-BERICHTE (SE1 a) gehen an `/api/telemetry/csp-report`: gebremst je
  Anschluss, je Verstoß und Stunde EINE Zeile `csp.report` mit vier Wörtern
  (Anweisung, Herkunft der Quelle, Herkunft der Datei, erster Pfad-Abschnitt),
  nichts über Personen; Berichte aus Browser-Erweiterungen fallen heraus
  (`core/shared/cspReport.ts`). Der tägliche Blick zählt sie, rot wird davon
  nichts. Scharf stellen ist eine eigene Entscheidung (OPEN-ITEMS „SE1" a).
- `scripts/ops/verify-security-headers.mjs` prüft von außen, roh gezählt: jede
  Kopfzeile genau einmal. Eine Datei aus einem vorgeschalteten
  Zwischenspeicher (`cf-cache-status: HIT` auf `pukalani.app`) wird nicht
  bewertet — sie trägt die Kopfzeilen ihres ersten Abrufs.

## Env-Pflichtliste (F44)
- EINE FEHLENDE ENV-VARIABLE WIRD NICHT ROT — die App läuft, nur die
  Funktion bleibt still aus und sieht aus wie ein bewusst abgeschaltetes
  Produkt. Netz: `pnpm ops:site-env` (täglich in der CI) liest über ssh nur
  die SCHLÜSSELNAMEN jeder Server-`.env` und je Name „leer / nicht leer";
  `NAME=` ohne Wert ist ein Befund wie ein fehlender Name, Werte bleiben auf
  dem Server. Die Pflicht-Liste je Site IST `scripts/ops/verify-site-env.mjs`;
  neue Pflicht-Variable ⇒ dort eintragen.
- Zur Laufzeit schreibt `warnMailerMissingOnce()`
  (`core/server/utils/mailer.ts`) beim ERSTEN verworfenen Versand einmal ins
  Log. Warnungen gehören dorthin, wo etwas verworfen wird — NIE in ein
  Prädikat wie `mailerConfigured()`, das auch mail-lose Apps (help,
  marketing, portfolio) beim Start abfragen.
- ANDERS BEI DER TRENNUNG DER COMMUNITIES (SEC-025, Davids Entscheidung
  „Eine Sicherung, die nicht prüfen kann, lehnt ab"): fehlt auf `platform`
  eine der VIER `NUXT_PLATFORM_CONTROL_*` (Endpunkt, Projekt, Database-Id,
  Schlüssel), wird ABGELEHNT — jede Anfrage auf jedem Host 503, nur
  `/api/health` antwortet (HTTP 200, `ok:false`,
  `reason: tenant_resolver_missing`, `.build` bleibt lesbar). Die Namen der
  fehlenden Variablen stehen nur im pm2-Log, nie in einer Antwort. Alle vier
  stehen auf der Pflicht-Liste. Kein Schalter stellt das ab.
- `NUXT_REDIS_URL` ist Pflicht auf jeder Site mit Konten (ohne sie zählt
  jeder Prozess für sich und beginnt bei jedem Ausliefern neu); Landing und
  Hilfe brauchen sie nicht.
- REIHENFOLGE BEI EINER NEUEN VARIABLE: der Code läuft mit einem Rückfall,
  bis der Wert steht — erst ausliefern, dann den Wert auf dem Server setzen
  (Davids Ja; neu laden über die Ecosystem-Datei, zurücklesen), ERST DANN der
  Eintrag in die Pflicht-Liste. Ein Eintrag vor dem Setzen öffnet jeden Tag
  einen Alarm.
- JEDE EINSTELLUNG HAT EINE ENTSCHEIDUNG (P20): der Test
  `packages/core/tests/verifySiteEnv.test.ts` liest alle `NUXT_…`-Namen aus
  dem Code und verlangt je Name genau eine Antwort — Pflicht auf mindestens
  einer Site oder „keine Pflicht" mit Grund in
  `scripts/ops/site-env-decisions.mjs`; der Bestand „noch nicht bewertet"
  bleibt leer. Die Pflicht-Liste selbst bleibt von
  Hand.
