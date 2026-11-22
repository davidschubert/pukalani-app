---
paths:
  - "packages/core/shared/controlCenter.ts"
  - "packages/core/shared/legacyControlHosts.ts"
  - "packages/core/server/middleware/**"
  - "packages/core/server/utils/csrfOrigin.ts"
  - "packages/core/shared/csrfOriginExempt.ts"
  - "packages/core/server/utils/trustedOrigin.ts"
  - "packages/core/shared/trustedOrigin.ts"
  - "packages/core/server/utils/siteOrigin.ts"
  - "packages/control/schemas/tenant.ts"
  - "apps/platform/app/app.config.ts"
  - "apps/control/app/app.config.ts"
  - "scripts/ops/verify-tls.mjs"
  - "ops/pm2-heal.sh"
  - "ops/ecosystem-*.config.cjs"
  - "ops/nginx-sites.conf"
  - "docs/runbooks/NEUE-SITE.md"
  - "docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md"
  - "docs/runbooks/EIGENE-DOMAIN-FREIGABE.md"
  - "packages/core/tests/ssr-write-fetch.test.ts"
  - "packages/core/tests/csrf-origin-routes.test.ts"
  - "packages/core/tests/csrfOriginExempt.test.ts"
---

## Hosts, Namen, TLS
Weitere Ops-Regeln: Wächter und Alarm `.claude/rules/ops-waechter.md`,
Server-Dateien und Env `.claude/rules/ops-server.md`, Ausliefern, Rückweg,
Backup `.claude/rules/ops-ausliefern.md`.

- BETREIBER-KONSOLE = `admin.pukalani.app` (AH-4, AH-4b, AH-4c). ploi-Site,
  Server-Verzeichnis, certbot-Lineage und Appwrite-Projekt heißen `admin`
  (Cookie `a_session_admin`); nginx → Port 3003 (`ops/nginx-sites.conf`).
  Projekt-Ids sind unveränderlich: „umbenennen" heißt Neuanlage + Umzug. Die
  Alt-Projekte `control` und `pool` sind GELÖSCHT.
- PM2 FINDET PROZESSE ÜBER DEN NAMEN: nach einem Rename startet er sonst
  DANEBEN. Der Prozess heißt `adminpukalaniapp`; den Vorgänger
  `controlpukalaniapp` räumt `ops/pm2-heal.sh` weg. Vor dem Aufräumen eines
  alten Site-Verzeichnisses `pm2 jlist` auf ein `cwd` darunter prüfen
  (portfolio starb einmal genau daran).
- DEN NAMEN `control` BEHALTEN NUR: Ordner `apps/control`, Workspace-
  Paketname, Release-Slot `releases/control`, Ecosystem-Datei
  `ops/ecosystem-control.config.cjs` (`admin` ist als Layer `packages/admin`
  vergeben).
- Die Konsolen-Site hat BEWUSST kein Repository: die CI liefert Programm und
  `ops/`-Dateien; einen ploi-Fallback-Deploy gibt es nicht (Fallback =
  `docs/archiv/CONTROL-CUTOVER.md`).
- ALTNAMEN DER KONSOLE SIND TOT (Davids Entscheidung, keine 301):
  `control.pukalani.app` und `studio.pukalani.app` (kein Alias mehr —
  „Studio" ist das Kundenangebot) fallen in die Wildcard-Site `platform` und
  antworten 404, wie `app.pukalani.app`. `control.` bleibt im TLS-Wächter
  (Wildcard-Deckung).
- `account.pukalani.app` = DER Kundenbereich (AH-1): Anmeldung, Konto,
  Communities, Wizard (`/start`). Ein Kontroll-Host der Platform-App ohne DNS-
  oder Site-Bedarf — KEIN Zertifikat anfordern (Lineage-Falle, unten).
  `wizardHosts` ist LEER: `/` zeigt die Übersicht, ohne Community geht es in
  den Wizard, ein `?code=` direkt dorthin. Ein LINK auf den Wizard holt seinen
  Host über `resolveWizardHosts()` (`core/shared/controlCenter.ts`; Rückfall
  auf die Kontroll-Hosts — sonst verschwindet „Community anlegen" still).
- DIE VORGÄNGER `my.` UND `start.` ANTWORTEN 301, NICHT 404 (Pfad + Query
  unverändert): sie wurden beworben, Einladungs-Mails tragen ihren `?code=`
  sieben Tage. Regel `core/shared/legacyControlHosts.ts`, Middleware
  `core/server/middleware/00.legacy-control-hosts.ts` (liegt in core, weil
  sie VOR `core/server/middleware/00.tenant.ts` laufen muss — die Reihenfolge ist nur innerhalb EINES
  Verzeichnisses nachprüfbar), Liste `tenancy.legacyControlHosts` in
  `apps/platform/app/app.config.ts`. Sie bleiben im TLS-Wächter: eine 301
  kommt erst nach dem Handshake.
- RESERVED_SUBDOMAINS (`packages/control/schemas/tenant.ts`): JEDER neue Name
  und ALLE Altnamen gehören hinein (Phishing, sonst beantragt ein Kunde sie);
  `admin` ist vergeben, `master` vorreserviert.

## TLS-Fallen
- PORT 80 antwortet nur für explizit konfigurierte Hosts — die HTTP-Prüfung
  von Let's Encrypt scheitert für Aliase/Wildcards ⇒ IMMER DNS-01 über
  Cloudflare.
- PLOI BENENNT DIE CERTBOT-LINEAGE NACH DER ROOT-DOMAIN DER SITE — es gibt
  mehrere (welche Hosts welches Zertifikat tragen: `HOSTS` in
  `scripts/ops/verify-tls.mjs`). GETEILT ist `pukalani.app` mit dem
  **Wildcard** `*.pukalani.app`: die Sites `pukalani.app` UND
  `platform.pukalani.app` binden sie ein, daran hängen platform, demo, help
  und JEDER Mandanten-Host. Eine Anforderung dort überschreibt sie für alle.
  Ein Apex+Wildcard-Zertifikat ist über ploi NICHT herstellbar.
- `pukalani.app` läuft als EINZIGER Host der Zone **proxied** über Cloudflare,
  Zonen-Modus „Full (Strict)", am Ursprung ein Cloudflare-Origin-Zertifikat
  (`/home/ploi/certs/apex/`) NUR im Apex-Serverblock. Alle anderen Hosts leben
  vom Wildcard; `www` MUSS es behalten (grau, Browser sprechen direkt mit dem
  Ursprung, dem Origin-CA vertraut nur Cloudflare).
- VERBOTEN: „Add certificate"/„Force-renew" auf der ploi-Site `pukalani.app`
  — überschreibt das Kunden-Wildcard. Neu anfordern nur auf der Site
  `platform.pukalani.app` mit `*.pukalani.app`. Wächter
  `scripts/ops/verify-tls.mjs` (halbstündlich + nach jedem Deploy).
- Details: `docs/content/2.architektur/6.hosts-und-ports.md`.

## Herkunft und Links
- HERKUNFTSPRÜFUNG (SEC-004): alle Hosts unter `*.pukalani.app` sind
  same-site, `SameSite=Lax` trennt sie nicht. Regel
  `core/server/utils/csrfOrigin.ts`, Middleware `core/server/middleware/03.csrf-origin.ts`:
  schreibende `/api`-Aufrufe mit `Sec-Fetch-Site: cross-site` ⇒ 403;
  `same-site` oder fehlender `Sec-Fetch-Site` MIT `Origin` ⇒ Origin-Host samt
  Port muss der Request-Host sein; ohne beide Kopfzeilen (Server, Webhooks,
  Runner) ⇒ durch. Gilt in JEDER App, KEIN Schalter (Davids Entscheidung;
  `pukalani.security.csrfOriginCheck` darf in keine `app.config.ts`
  zurück). AUSNAHMEN nur als einzelne Route mit Grund in
  `core/shared/csrfOriginExempt.ts` (`CSRF_ORIGIN_EXEMPT_ROUTES`), NIE für
  Routen mit Sitzungs-Cookie; `CSRF_ORIGINLESS_CALLERS` sagt, warum Naht,
  Webhooks und Runner durchgehen.
- SSR-FALLE: beim Server-Rendern reicht Nuxt die Kopfzeilen der Navigation
  (auch `sec-fetch-site`, ohne `Origin`) an interne Aufrufe weiter — ein
  schreibender Aufruf scheitert, sobald die Seite über einen fremden Link kam.
  KEINE schreibenden Aufrufe beim Server-Rendern: `server: false`,
  `onMounted` oder Handler. Wächter:
  `packages/core/tests/ssr-write-fetch.test.ts`, `packages/core/tests/csrf-origin-routes.test.ts` (rot auch bei einem
  Config-Gate in der Middleware oder `csrfOriginCheck` in einer
  `app.config.ts`), `packages/core/tests/csrfOriginExempt.test.ts`.
- MAIL-LINKS (SEC-010): Reset-Mail und OAuth-Rückweg nehmen in Apps OHNE
  Mandanten-Auflösung `public.appUrl` (`resolveTrustedOrigin`,
  `core/server/utils/trustedOrigin.ts`), den Namen der Anfrage nur, wo
  `core/server/middleware/00.tenant.ts` ihn geprüft hat; fehlt `appUrl` ⇒ `auth.app_url_missing` und
  Rückfall. `NUXT_PUBLIC_APP_URL` ist Pflicht auf platform, admin, portfolio
  und branding.
- EIGENE DOMAIN EINER EINZEL-SITE: ist sie im Dashboard `active`, nehmen
  Reset-, Bestätigungs-, Benachrichtigungs-Mails, Digest und OAuth-Rückweg
  DIESE Adresse — Vertrag `registerSiteOriginResolver`
  (`core/server/utils/siteOrigin.ts`), bedient vom `domains`-Layer;
  unerreichbar ⇒ `appUrl`. Der Name kommt aus der `websites`-Zeile, NIE aus
  der Anfrage. `NUXT_PUBLIC_APP_URL` BLEIBT die Standard-Adresse — niemand
  stellt für eine eigene Domain eine Server-Datei um. NEUE STELLE, die einen
  Link in eine Mail legt ⇒ `resolveSiteLinkBase(event)` statt
  `config.public.appUrl`.
- EIGENE DOMAIN EINER POOL-COMMUNITY (BE-014/SEC-022): nicht in der
  Testphase; Freigabe des Betreibers, bis die Eintrittskarte samt E1d auf
  Platform UND Konsole bestätigt live ist (PK1 K6, `docs/runbooks/PK1-EINSCHALTEN.md`); 14 Tage nach Plan-Ende ⇒ `paused`
  (ploi-Eintrag und Zertifikat BLEIBEN, für Weiterleitung und Wieder-
  Einschalten). Läufe `custom-domain-sweep` (Konsole; `dry-run` zählt nur)
  und `custom-domain-notice` (Platform) stehen in `ops/timed-jobs.conf`.
  Regel: `.claude/rules/plans-products.md`, Handgriffe:
  `docs/runbooks/EIGENE-DOMAIN-FREIGABE.md`.
