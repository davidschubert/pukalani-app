# Resend-Webhook: Bounces und Beschwerden zurückmelden (RS1 b)

**Wann.** Einmal je Deployment zum Einrichten (nur mit Davids Ja, Klickliste
in § 2), danach bei einem Schlüsseltausch oder wenn das Log
`mail.webhook_signature_invalid` zeigt.

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

## 1 · Reihenfolge

1. **branding.supply** — zuerst: hier lebt der Newsletter (BI1 I5), und (b)
   soll vor dem Newsletter-Schalter wirken.
2. **account.pukalani.app** (Site `platform`) — die meisten Konten (Projekt
   `account`). Der Kontroll-Host, nicht ein Mandanten-Host: der löst sicher
   auf, ein Community-Host könnte gesperrt oder umgezogen sein.
3. **admin.pukalani.app** (control) und **portfolio.pukalani.app**.

Erlaubt der Resend-Tarif weniger Webhooks als vier (Frage aus
MAIL-ZUSTELLBARKEIT § 6, offen), nach dieser Reihenfolge abschneiden.

## 2 · Klickliste je Deployment (David)

- [ ] Resend → **Webhooks** → **Add Webhook**.
      Endpoint: `https://<host>/api/mail/resend-webhook`
      Events: **nur** `email.bounced`, `email.complained`, `email.suppressed`
      (keine Öffnungen/Klicks — die werten wir bewusst nicht aus).
- [ ] Den **Signing Secret** (`whsec_…`) des neuen Eintrags kopieren.
- [ ] ploi → Site `<host>` → **Environment** → Zeile
      `NUXT_RESEND_WEBHOOK_SECRET=whsec_…` ergänzen und speichern.
- [ ] Neu laden: per SSH `pm2 reload <pm2-name>` (so auch beim Turnstile-
      Secret 2026-10-27; ein ploi-„Deploy" gibt es für CI-rsync-Sites wie
      `admin` nicht). Erst der Reload beweist, dass die `.env` gelesen wurde
      (Server-.env-Reload-Zeitbombe).
- [ ] Probe ohne Signatur (darf jeder, auch Claude):
      `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/api/mail/resend-webhook`
      ⇒ **401**. Vorher war es **404** (kein Secret). Bleibt es 404, ist das
      Secret nicht angekommen.
- [ ] Probe mit Signatur: Resend → Webhook → **Send test event** bzw. eine Mail
      an `bounced@resend.dev` schicken. Im pm2-Log der Site steht danach
      `mail.undeliverable` mit `domain: resend.dev` und `outcomes`
      (`account: none` — die Testadresse hat kein Konto). Ein
      `mail.webhook_signature_invalid` heißt: Secret gehört zu einem anderen
      Webhook-Eintrag.
- [ ] Erst JETZT `NUXT_RESEND_WEBHOOK_SECRET` in den `required`-Block dieser
      Site in `scripts/ops/verify-site-env.mjs` eintragen (Commit). Vorher
      nicht: der Wächter läuft täglich in `production-watch.yml` und hätte
      bis zu Davids Klick jeden Tag einen `produktions-alarm` geöffnet.

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

## 5 · Tagesbudget: der nur-lesende Schlüssel (RS1 a)

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
ohne Schlüssel still durchlässt, wäre keine Bremse. Solange der
Newsletter-Riegel `pukalani.insights.newsletter.enabled` zu ist, fehlt dadurch
nichts.

**Klickliste (David).**

1. [resend.com/api-keys](https://resend.com/api-keys) → **Create API Key**,
   Name `pukalani-usage-read`, Permission **Sending access** ist NICHT nötig —
   `Full access` vermeiden, wenn die Oberfläche eine nur-lesende Wahl anbietet.
   Der Schlüssel wird nur für `GET /usage` benutzt, nie zum Versenden
   (verschickt wird weiter über SMTP).
2. In der Server-`.env` der Site setzen und neu laden — nur über `stdin`, damit
   der Schlüssel nicht in der Shell-Historie landet:

```bash
ssh ploi@<host> 'cat >> /home/ploi/<site>/.env' <<< 'NUXT_RESEND_API_KEY=re_…'
```

3. `pm2 reload <site>` (die `.env` wird beim Start gelesen — ohne Reload wirkt
   sie nicht, s. Memory „Server-.env-Reload-Zeitbombe").
4. Beweis: im Dashboard unter einem freigegebenen Beitrag auf „Newsletter
   verschicken" — bei fehlendem Schlüssel erscheint der Satz „Wir können das
   Mail-Budget gerade nicht abfragen", danach nicht mehr.

**Erst danach** gehört `NUXT_RESEND_API_KEY` in die Pflichtliste von
`scripts/ops/verify-site-env.mjs` — dieselbe Lehre wie beim Webhook-Secret
(§ 2, letzter Schritt): eine Pflicht-Variable, die noch nicht gesetzt ist,
öffnet im täglichen `production-watch.yml` jeden Tag einen bestellten
`produktions-alarm`.
