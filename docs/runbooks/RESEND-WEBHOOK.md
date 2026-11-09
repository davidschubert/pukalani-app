# Resend-Webhook: Bounces und Beschwerden zurückmelden (RS1 b)

**Wann.** Bei einem Schlüsseltausch, einer neuen Site mit Konten oder wenn das
Log `mail.webhook_signature_invalid` zeigt. **Eingerichtet am 2026-11-08 auf
allen vier Sites** (Davids Auftrag, ausgeführt über Resend-API + SSH, § 1).

**Was die Route tut.** `POST /api/mail/resend-webhook` (core-Layer, also in
jeder App mit Appwrite) nimmt drei Resend-Ereignisse an und handelt nur im
Appwrite-Projekt DIESES Deployments:

| Ereignis | Wirkung |
| --- | --- |
| `email.bounced` mit `bounce.type = Permanent` | Konto: `emailNotifications: 'off'` + Merker `emailUndeliverable` (Hinweis unter Einstellungen → Benachrichtigungen). Newsletter (nur wo `insights` läuft): Abonnent abgemeldet, nie bestätigter gelöscht |
| `email.complained` | dasselbe, Grund `complaint` (Davids Entscheidung 2026-11-06: nur Mails aus + Hinweis, keine Sanktion am Konto) |
| `email.suppressed` | dasselbe, Grund `suppressed` — Resend hat gar nicht erst verschickt, weil die Adresse schon gesperrt war (holt Sperren von VOR dem Webhook nach) |
| `email.bounced` mit `Temporary` | nur Log `mail.bounce_soft`, keine Sperre |
| alles andere | `200`, nichts |

Antworten: `404` ohne Secret · `401` ohne gültige Svix-Signatur (vor jedem
Datenzugriff) · `500` wenn ein Schreibvorgang scheitert (Resend wiederholt,
die Wirkung ist idempotent) · sonst `200`. Logs tragen nur `svix-id`,
Resends `email_id` und die DOMAIN der Adresse. Regeln:
`packages/core/shared/mailUndeliverable.ts`, Zuschnitt:
[MAIL-ZUSTELLBARKEIT.md](../archiv/MAIL-ZUSTELLBARKEIT.md) § 2 Stufe B.

**Warum ein Webhook je Deployment.** Resend schickt JEDES Ereignis des Teams an
JEDEN Webhook — alle Sites verschicken über `pukalani.app`. Jedes Deployment
schaut nur in sein eigenes Appwrite-Projekt; eine Adresse, die dort niemandem
gehört, ist ein `200` ohne Wirkung. Ein gemeinsamer Endpunkt könnte die
anderen Projekte gar nicht erreichen (kein Schlüssel dorthin).

---

## 1 · Stand (2026-11-08)

| Site (ploi-Ordner) | Endpunkt in Resend | pm2 / Ecosystem |
| --- | --- | --- |
| `branding.supply` | `https://branding.supply/api/mail/resend-webhook` | `ecosystem-branding` |
| `platform.pukalani.app` | `https://account.pukalani.app/api/mail/resend-webhook` | `ecosystem-platform` |
| `admin.pukalani.app` | `https://admin.pukalani.app/api/mail/resend-webhook` | `ecosystem-control` |
| `portfolio.pukalani.app` | `https://pukalani.studio/api/mail/resend-webhook` | `ecosystem-portfolio` |

Je Eintrag die drei Ereignisse, eigenes Secret. Der freie Tarif hat vier
Webhooks ohne Murren angenommen (Frage aus MAIL-ZUSTELLBARKEIT § 6). Echter
Bounce an `bounced@resend.dev` am 2026-11-08 17:42 UTC: auf allen vier Sites
`mail.undeliverable` im pm2-Log (`grep <email_id> ~/.pm2/logs/*-out*.log`).

Zwei Fallen beim Einrichten:
- **Portfolio antwortet unter `pukalani.studio`**: `portfolio.pukalani.app`
  leitet mit 308 dorthin, und Svix folgt keiner Weiterleitung eines POST —
  der Endpunkt muss der kanonische Host sein.
- **Kontroll-Hosts lassen nur gelistete API-Pfade durch**
  (`pukalani.tenancy.controlApiPrefixes`, Middleware `01.control-center.ts`):
  `account.` antwortete trotz Secret 404, bis `/api/mail/resend-webhook` dort
  eingetragen war. `platform.pukalani.app` selbst ist kein brauchbarer
  Endpunkt (404 ohne Mandant).

## 2 · Einrichtung je Site (für eine neue Site oder einen Neuaufbau)

Über das Dashboard oder, wie am 2026-11-08, über die Resend-API (MCP
`create-webhook`, liefert das Secret direkt) und SSH statt ploi-Formular —
dann steht das Secret in keinem Formularfeld und in keiner Ausgabe.

- [ ] Resend → **Webhooks** → **Add Webhook**.
      Endpoint: `https://<host>/api/mail/resend-webhook`
      Events: **nur** `email.bounced`, `email.complained`, `email.suppressed`
      (keine Öffnungen/Klicks — die werten wir bewusst nicht aus).
- [ ] Den **Signing Secret** (`whsec_…`) des neuen Eintrags kopieren.
- [ ] Zeile `NUXT_RESEND_WEBHOOK_SECRET=whsec_…` an
      `/home/ploi/<site>/.env` anhängen (vorher Kopie
      `.env.bak-<datum>-resend`; danach doppelte Schlüssel prüfen — nur Namen,
      nie Werte).
- [ ] Neu laden wie der Deploy:
      `pm2 startOrReload /home/ploi/<site>/ops/ecosystem-<app>.config.cjs --update-env`.
      Erst der Reload beweist, dass die `.env` gelesen wurde
      (Server-.env-Reload-Zeitbombe).
- [ ] Probe ohne Signatur (darf jeder, auch Claude):
      `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/api/mail/resend-webhook`
      ⇒ **401**. Vorher war es **404** (kein Secret). Bleibt es 404, ist das
      Secret nicht angekommen.
- [ ] Probe mit Signatur: ein selbst signiertes, wirkungsloses
      `email.delivered` (Svix-Rechnung wie in `checkResendSignature`) ⇒
      **200** `{"received":true}`; dasselbe mit einem FREMDEN Secret ⇒
      **401** (Gegenprobe). Oder echt: eine Mail an `bounced@resend.dev` ⇒ im
      pm2-Log `mail.undeliverable` mit `domain: resend.dev`.
- [ ] Neue Site? Dann in `scripts/ops/verify-site-env.mjs` deren
      `required`-Block um `RESEND_WEBHOOK_SECRET` ergänzen — erst NACH dem
      Setzen (der Wächter läuft täglich und alarmiert sonst).

## 3 · Beweis von Ende zu Ende (branding.supply)

1. Auf branding.supply den Newsletter mit `bounced@resend.dev` eintragen
   (geht erst, wenn der Newsletter-Riegel offen ist).
2. Die Bestätigungs-Mail prallt ab ⇒ Webhook ⇒ die nie bestätigte Zeile in
   `insights_subscribers` ist **gelöscht** (`outcomes.insights: changed`).
3. Gegenprobe: ein zweiter Lauf desselben Ereignisses (Resend → Webhook →
   Event → **Resend**) liefert `outcomes.insights: none` und `200`.

## 4 · Schlüsseltausch

Resend → Webhook → **Rotate secret**, dann § 2 ab „ploi → Environment". Bis
zum Reload antwortet die Route `401`; Resend wiederholt die verpassten
Zustellungen selbst (Svix-Wiederholungen über ~1 Tag).

## 5 · Tagesbudget: der Resend-Schlüssel der Bremse (RS1 a) — ERLEDIGT 2026-11-08

Gehört nicht zum Webhook, aber in dieselbe Klick-Runde: derselbe Resend-Account,
dieselbe Server-`.env`.

**Warum.** Davids Entscheidung vom 2026-11-08 war, auf dem **freien Tarif** zu
bleiben (100 Mails/Tag für ALLES — OTP, Verifizierung, Benachrichtigungen und
den Insights-Newsletter) und stattdessen zu **bremsen**. Der Newsletter-Versand
fragt vor jedem Stapel `GET /usage`, wie viele Mails der Tag noch trägt, und
hält an, bevor er das Anmelde-Budget mitnimmt. Gemessen am 2026-11-08: 243
Mails im Monat, 0 bestätigte Abonnenten — eng wird es erst ab etwa 85
Empfängern je Ausgabe.

**Ohne diesen Schlüssel geht keine Ausgabe raus** (`budget_unknown`, mit
Begründung im Kopf von `packages/core/shared/mailBudget.ts`): eine Bremse, die
ohne Schlüssel still durchlässt, wäre keine Bremse.

### 5.1 Stand

| | |
|---|---|
| Schlüssel | `pukalani-budget-read`, Resend-Id `0ba2e456-17fc-4e84-90c7-79fd12ed6a97` |
| Recht | `full_access` — **nur-lesend gibt es bei Resend nicht**, s. 5.2 |
| Gesetzt auf | **nur `branding.supply`** (`NUXT_RESEND_API_KEY`), Backup der alten Datei: `.env.bak-2026-11-08-budget` |
| Wirksam seit | `pm2 startOrReload .../ops/ecosystem-branding.config.cjs --update-env` am 2026-11-08 |
| Wächter | `scripts/ops/verify-site-env.mjs` führt ihn seit 2026-11-08 als Pflicht — **nur im branding-Block** |

**Nur branding**, weil nur `apps/branding` den `insights`-Layer hat und damit
überhaupt einen Newsletter. `platform`, `control` und `portfolio` fragen die
Bremse nie; eine Pflicht-Variable, die eine Site nicht braucht, erzieht zum
Weglesen. Kommt der Newsletter je in eine zweite App, gehört der Schlüssel dort
hin **und** in deren Block im Wächter.

### 5.2 Warum `full_access` — und was daraus folgt

Resend kennt genau **zwei** Rechte-Stufen. Gemessen am 2026-11-08, nicht
vermutet:

```
sending_access  → GET /usage  401 restricted_api_key
                  "This API key is restricted to only send emails"
full_access     → GET /usage  200
```

Die Bremse braucht also `full_access`. Die alte Fassung dieses Abschnitts
versprach einen „nur-lesenden Schlüssel" — das war falsch und ist
richtiggestellt (auch in `packages/core/nuxt.config.ts` und
`packages/core/shared/mailBudget.ts`).

Daraus folgt der Grund für einen **eigenen** Schlüssel statt des SMTP-Werts:
der Sende-Schlüssel kann später auf `sending_access` verengt werden, ohne die
Bremse mitzureißen. Dass heute auch `NUXT_SMTP_PASS` ein `full_access`-Schlüssel
ist (geprüft: er darf `GET /domains` und `GET /api-keys`), ist ein **offener
Punkt** in `docs/OPEN-ITEMS.md`, keine Rechtfertigung.

### 5.3 Rezept (für den nächsten Schlüssel oder eine Rotation)

1. Resend → **Create API Key**, `full_access` (ein `sending_access`-Schlüssel
   kann das Budget nicht lesen, s. 5.2).
2. In die Server-`.env` — nur über `stdin`, damit der Schlüssel nicht in der
   Shell-Historie landet, und mit Backup:

```bash
{ printf 'NUXT_RESEND_API_KEY='; cat /pfad/zum/schluessel.txt; printf '\n'; } \
  | ssh ploi@<host> 'cd /home/ploi/<site> && cp .env .env.bak-$(date +%F)-budget && cat >> .env'
```

3. **Wirksam wird er erst mit dem richtigen Reload.** Die `.env` wird von der
   pm2-Ecosystem-Datei beim (Re-)Load geparst — ein nacktes
   `pm2 reload <prozess> --update-env` liest sie daher **nicht** neu:

```bash
ssh ploi@<host> 'pm2 startOrReload /home/ploi/<site>/ops/ecosystem-<app>.config.cjs --update-env && pm2 save'
```

4. **Beweis — und die Falle dabei.** `tr '\0' '\n' < /proc/<pid>/environ`
   beweist **nichts**: pm2 setzt die App-Env im Cluster-Modus erst NACH dem
   Start in `process.env`, im OS-Environ stehen nur 11 Variablen und **keine**
   `NUXT_*` (am 2026-11-08 erst als Fehlschlag gelesen — auch das längst
   gesetzte Webhook-Secret „fehlte" dort). Gefragt wird pm2 selbst, ohne den
   Wert zu drucken:

```bash
ssh ploi@<host> 'pm2 jlist' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  for (const a of JSON.parse(s)) {
    const k = (a.pm2_env||{}).NUXT_RESEND_API_KEY
    console.log(a.name.padEnd(24), k ? `gesetzt, ${k.length} Zeichen` : "FEHLT")
  }})'
```

Die Gegenprobe ist eingebaut: die Prozesse der anderen Sites müssen `FEHLT`
zeigen (sonst hat man ihn versehentlich überall gesetzt).

5. Danach `node scripts/ops/verify-site-env.mjs` — alle sechs Sites grün, und
   nur `branding` zählt eine Variable mehr.
6. Der Beweis IN DER OBERFLÄCHE („Wir können das Mail-Budget gerade nicht
   abfragen" verschwindet) ist erst möglich, wenn der Riegel
   `pukalani.insights.newsletter.enabled` offen ist — solange er zu ist,
   antwortet die Versand-Route ohnehin 404.

**Pflicht-Variable immer ERST eintragen, wenn der Wert steht** — dieselbe
Lehre wie beim Webhook-Secret (§ 2, letzter Schritt): der Wächter läuft täglich
in `production-watch.yml`, und ein Eintrag vorher öffnet jeden Tag einen
bestellten `produktions-alarm`.

---

## 6 · Der SENDE-Schlüssel (SMTP) — `sending_access`, an `pukalani.app` gebunden (seit 2026-11-08)

Bis zum 2026-11-08 war das SMTP-Passwort der `full_access`-Schlüssel
„Pukalani App" — er durfte Domains und API-Keys lesen. Ersetzt durch
**`pukalani-smtp-send`** (`sending_access`, nur Domain `pukalani.app`):
`GET /domains` antwortet damit `401`, SMTP-Versand `250`. Der alte Schlüssel
ist gelöscht. Die beiden anderen Pukalani-Schlüssel bleiben bewusst
`full_access` und GETRENNT: `pukalani-budget-read` (§ 5, `GET /usage`) und
`produktions-waechter` (GitHub-Secret von `production-watch.yml`).

### 6.1 Wo der Schlüssel steckt — FÜNF Stellen, nicht vier

| Stelle | Quelle, die wirklich gilt | Tausch | Wirksam |
| --- | --- | --- | --- |
| `branding.supply` | `.env` → `NUXT_SMTP_PASS` | Zeile ersetzen, Backup `.env.bak-<datum>-smtp` | `pm2 startOrReload …/ecosystem-branding.config.cjs --update-env` |
| `admin.pukalani.app` | `.env` → `NUXT_SMTP_PASS` | dto. | `…/ecosystem-control.config.cjs` |
| `portfolio.pukalani.app` | `.env` → `NUXT_SMTP_PASS` | dto. | `…/ecosystem-portfolio.config.cjs` |
| `platform.pukalani.app` | **Ablage** `instance_secrets`, Zeile `smtp`, Projekt `account` — die `.env` hat seit 2026-08-19 KEIN `NUXT_SMTP_*` | Block entschlüsseln, nur `pass` tauschen, neu verschlüsseln (alter Umschlag als `instance_secrets-smtp.bak-<datum>-smtp.json` im Site-Ordner) — oder in der Konsole unter Instanz → Integrationen | ohne Reload, binnen 30 s (Mailer-Puffer) |
| Appwrite-Instanz (`188.245.61.155`, `~/appwrite/.env`) | `_APP_SMTP_PASSWORD` (in Anführungszeichen) — OTP, Verifizierung, Passwort-Mails aller Projekte | Zeile ersetzen, Backup `.env.bak-<datum>-smtp` | `docker compose up -d` in `~/appwrite` — baut genau `appwrite` + `appwrite-worker` neu (vorher `--dry-run`), API ~11 s weg |

Die Appwrite-PROJEKTE haben keine eigene SMTP (Feld `smtp` in
`_console_projects` ist bei allen vier ein leerer Umschlag); geprüft
2026-11-08.

### 6.2 Beweis

- **Wert, nicht Behauptung:** je Stelle Länge + `sha256`-Präfix des wirksamen
  Werts vergleichen — Sites über `pm2 jlist` (`pm2_env.NUXT_SMTP_PASS`) bzw.
  die entschlüsselte Ablage, Appwrite über
  `docker exec appwrite printenv _APP_SMTP_PASSWORD` (und `appwrite-worker`).
  NIE den Wert drucken.
- **Echte Mail je Site:** mit genau den Einstellungen, die der Prozess
  auflöst (Ablage mit `host` schlägt Env, wie `resolveMailerSettings`), über
  das `nodemailer` aus dem Release-Ordner des Prozesses
  (`dirname(pm2_env.pm_exec_path)/node_modules/nodemailer/dist/esm/…` — das
  Nitro-Bündel enthält nur den ESM-Zweig, `require` scheitert) an
  `delivered@resend.dev` → `250`.
- **Appwrite:** Gast-`POST /v1/account/tokens/email` (Projekt `account`,
  `userId` `probe-mail-<datum>`, `delivered@resend.dev`) → `201`, Worker-Log
  `v1-mails` · `otp` · `success`; Probe-Nutzer danach löschen (`204`,
  Gegenprobe `404`).
- **Alter Schlüssel tot:** ein Wert aus einem `.env.bak-…-smtp` → SMTP
  `535 Authentication credentials invalid`, `GET https://api.resend.com/domains`
  `400` (ein GELÖSCHTER Schlüssel ist bei Resend `400`, ein zu schwacher `401`).
- `pnpm ops:site-env` grün.

### 6.3 Fallen

- **Die `.env` ist nicht die Wahrheit.** `platform` liest aus der Ablage;
  seine `.env` hat gar kein SMTP. Wer nur die vier `.env` tauscht, lässt die
  Pool-App (alle Kunden-Communities) auf dem alten Schlüssel — und merkt es
  erst, wenn der alte gelöscht ist.
- **pm2 merkt sich alte Variablen.** `--update-env` fügt hinzu, entfernt aber
  nichts: der platform-Prozess trug bis 2026-11-09 `NUXT_SMTP_*` aus einer
  Zeit, als sie in der `.env` standen. Entfernt wird eine Variable nur mit
  `pm2 delete <name>` + `pm2 startOrReload <ecosystem> --update-env` +
  `pm2 save` (gemessen ~2 s ohne Antwort) — danach `pm2 jlist` prüfen.
- **Start-Rauschen nach `compose up`:** der neue `appwrite-worker` meldete
  einmal „ClickHouse insert failed: Broken pipe" und lehnte danach ~1 Minute
  `v1-stats-usage`-Nachrichten ab („Usage events are not being written"),
  dann 0. Nur Nutzungsstatistik, kein Mail- oder Datenpfad — abwarten und in
  30-s-Fenstern zählen, nicht eingreifen.
- **`pm_cwd` kann veraltet sein** (reload übernimmt das `cwd` der
  Ecosystem-Datei nicht; `pm2-heal.sh` greift nur, wenn der Ordner fehlt) —
  den Code-Pfad aus `pm_exec_path` nehmen; geheilt wird es wie oben.


## 7 · Die Newsletter-Subdomain `mail.branding.supply` (RS1 e, 2026-11-09)

**Warum eine eigene Domain.** Massenmail und Einzelmail teilen sich sonst
EINEN Ruf. Eine Beschwerde über den Newsletter beschädigt dann die Zustellung
der Anmelde-, OTP- und Benachrichtigungs-Mails — und das sind die Mails, die
ankommen müssen. Der Newsletter von branding.supply bekommt deshalb eine
eigene, eigens verifizierte Versand-Subdomain; alles andere bleibt auf
`pukalani.app`.

### 7.1 Stand

| | |
| --- | --- |
| Domain | `mail.branding.supply` |
| Region | **eu-west-1** (wie `pukalani.app` — die EU-Frage aus (f)) |
| Status | **verified** (alle vier Einträge) |
| Versand / Empfang | sending `enabled` · receiving `disabled` |
| Open- / Click-Tracking | beides **aus** — der datenschonende Default, bewusst nicht eingeschaltet |

Die vier DNS-Einträge liegen in der Cloudflare-Zone `branding.supply`, alle
**DNS-only** (nicht proxied — ein proxied CNAME bricht den Return-Path):

| Typ | Name | Inhalt |
| --- | --- | --- |
| TXT | `resend._domainkey.mail` | DKIM-Schlüssel |
| MX (10) | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `rsend.mail` | `send.forge.rmta.net` |

Angelegt per BIND-Import (Cloudflare → DNS → Import), Haken „Proxy imported
DNS records" AUS. Gegenprobe von aussen über `1.1.1.1` **und** `8.8.8.8`; der
CNAME löst auf `send.forge.rmta.net` auf, nicht auf eine Cloudflare-IP — der
Beweis, dass er wirklich DNS-only ist.

### 7.2 Der Weg im Code

`MailInput.from` (Core) überschreibt `NUXT_SMTP_FROM` für genau eine Mail;
`pukalani.insights.newsletter.from` ist der Schlüssel, aus dem der
Insights-Layer ihn liest (pure Regel `insightsNewsletterFrom`, Leser
`insightsNewsletterSender()`). Beide Newsletter-Mails nennen ihn: die
**Ausgabe** und die **Bestätigung der Anmeldung** — die Bestätigung ist zwar
eine Einzelmail, gehört aber zum Newsletter-Strom, denn sie wird durch die
Eintragung ins Formular ausgelöst, also durch genau das, was auch Beschwerden
auslöst.

Dazu der ZUGANG: `MailInput.auth` (Core) nimmt Zugangsdaten je Mail,
`NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS` ist die Env-Zeile, aus der der
insights-Layer sie liest (`insightsNewsletterAuth()`). HOST und PORT bleiben
in jedem Fall die der Mailer-Einstellung — ein eigener Zugang heisst „anderes
Konto beim selben Anbieter", nicht „anderer Anbieter"; alles andere wäre eine
Hintertür an der Konfiguration vorbei.

Der Transporter-Puffer hält seither MEHRERE Zugänge nebeneinander (vorher ein
einziger Platz). Ohne das hätten sich zwei Schlüssel auf einem Platz
abgewechselt und jede Mail eine neue SMTP-Verbindung aufgebaut — kein
sichtbarer Fehler, nur langsamer Versand und unnötig viele Anmeldungen.

Leer heisst unverändert `NUXT_SMTP_FROM` und die normalen Zugangsdaten. Ohne
Eintrag ändert sich also nichts — das war die Bedingung dafür, den Core
anzufassen.

### 7.3 WAS NOCH FEHLT

**1. Der Schlüssel — EINE Stelle, nicht fünf (Davids Entscheidung
2026-11-09: Variante B).** In Resend einen `sending_access`-Schlüssel
anlegen, der an `mail.branding.supply` gebunden ist, und ihn auf der Site
`branding.supply` als `NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS` eintragen.
`pukalani-smtp-send` bleibt dabei **unangetastet** — die Verengung aus § 6
gilt weiter, und jeder Schlüssel darf nur von SEINER Domain senden. Danach
die Adresse in `apps/branding/app/app.config.ts` setzen
(`newsletter: { from: '…' }`); beides gehört zusammen, einzeln bringt keines
von beiden etwas.

Warum nicht Variante A (ein Schlüssel ohne Domain-Bindung): die wäre eine
Rotation über alle fünf Stellen aus § 6.1 — darunter die Ablage
`instance_secrets` und die `~/appwrite/.env` auf der Appwrite-Maschine —, und
ein geleakter Schlüssel könnte dann als JEDE verifizierte Domain senden.

**2. `branding.supply` hat gar kein DMARC** (gemessen 2026-11-09:
`_dmarc.branding.supply` leer; nur `pukalani.app` hat einen Eintrag). Gmail
und Yahoo verlangen für Massenversand mindestens `p=none`. Ein Klick, genau
wie bei RS1 (g): Cloudflare → `branding.supply` → Email → DMARC Management →
**Enable DMARC Management**. Cloudflare legt den `_dmarc`-Eintrag mit eigener
Berichts-Adresse selbst an.

**Die Reihenfolge ist wichtig:** solange `newsletter.enabled` auf `false`
steht, geht ohnehin nichts raus. Wer den Riegel nach den Rechtstexten öffnet,
erledigt vorher diese beiden Punkte — sonst fällt der Newsletter beim ersten
Versand aus, ohne dass jemand eine Zeile angefasst hätte.
