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
Webhooks ohne Murren angenommen (Frage aus MAIL-ZUSTELLBARKEIT § 6).

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
