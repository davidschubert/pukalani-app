# RS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **RS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**RS1 — Resend besser nutzen: was offen ist.** Erledigt und in COMPLETE:
(a) Tarif und Bremse, (b) Webhook, (c) + (d) Wächter und Idempotenz,
(e2) DMARC für `branding.supply`, (g) DMARC für `pukalani.app`, (h) engerer
SMTP-Schlüssel, und der Wechsel der Newsletter-Domain von `mail.` auf
**`newsletter.branding.supply`** (2026-11-24, Davids Wahl; bei Resend
verifiziert, Region eu-west-1). Offen:

- **(e1) Eigener Sende-Schlüssel — Davids zwei Klicks.**
  1. resend.com → API keys → Create API key → Name
     `branding-newsletter-send`, Permission **Sending access**, Domain
     **newsletter.branding.supply** → Add → Copy.
  2. ploi.io → app-prod → Site branding.supply → Environment → neue Zeile
     `NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS=<Schlüssel>` (nur einmal) → Save.

  Danach (Claude): `branding` neu laden, Probe-Mail von
  `insights@newsletter.branding.supply` an `delivered@resend.dev`, dann im
  selben Zug die Adresse in `apps/branding/app/app.config.ts` setzen
  (`Brand Insights by Branding Supply <insights@newsletter.branding.supply>`,
  Davids Wortlaut). Runbook [RESEND-WEBHOOK.md](../../runbooks/RESEND-WEBHOOK.md) § 7.3.
- **(f) Rechtstexte.** Resend ist nach dem EU-US Data Privacy Framework
  zertifiziert, beide Domains senden aus eu-west-1. Der Satz dazu gehört in
  den Durchgang [DT1](DT1.md).
- **(g) Rest.** DMARC für `pukalani.app` nach ein paar Wochen sauberer
  Berichte auf `p=quarantine` stellen.
- **Zur Klärung (David):** bei Resend liegen zwei Schlüssel vom 2026-11-21,
  die nirgends beschrieben sind: „Branding Supply" und „admin.pukalani".
  Spalte „Last used" ansehen; nie benutzt ⇒ widerrufen, sonst hier
  eintragen, wo sie stecken.

Zur Kenntnis, kein Bau: Resend sperrt öffentlich gewordene Schlüssel selbst.
Unser Repo ist öffentlich: landet der SMTP-Schlüssel dort, fallen alle Mails
sofort aus. One-Click-Abmeldung (RFC 8058) bleibt ein eigenes Vorhaben,
Begründung im Kopf von `packages/core/server/utils/mailer.ts`.
