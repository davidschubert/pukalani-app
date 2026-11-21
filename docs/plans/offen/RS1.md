# RS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **RS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**RS1 — Resend besser nutzen: was offen ist.** Erledigt und in COMPLETE:
(a) Tarif und Bremse, (b) Webhook, (c) + (d) Wächter und Idempotenz,
(g) DMARC für `pukalani.app`, (h) engerer SMTP-Schlüssel. Die
Newsletter-Adresse **`mail.branding.supply` steht** (bei Resend verifiziert,
Region eu-west-1, Weg im Code gebaut); die alte Zeile nannte sie noch
„offen". Offen:

- **(e1) Eigener Sende-Schlüssel.** Erst nötig, wenn der Newsletter aufgeht:
  einen `sending_access`-Schlüssel für `mail.branding.supply` anlegen und
  auf der Site `branding.supply` eintragen
  (`NUXT_INSIGHTS_NEWSLETTER_SMTP_PASS`), dann die Adresse in
  `apps/branding/app/app.config.ts` setzen. Runbook
  [RESEND-WEBHOOK.md](../../runbooks/RESEND-WEBHOOK.md) § 7.3.
- **(e2) DMARC fehlt auf `branding.supply`** (gemessen 2026-11-09). Ein
  Klick für David: Cloudflare → branding.supply → Email → DMARC Management
  → „Enable DMARC Management".
- **(f) Rechtstexte.** Resend ist nach dem EU-US Data Privacy Framework
  zertifiziert, `pukalani.app` sendet aus eu-west-1. Der Satz dazu gehört in
  den Durchgang [DT1](DT1.md).
- **(g) Rest.** DMARC für `pukalani.app` nach ein paar Wochen sauberer
  Berichte auf `p=quarantine` stellen.

Zur Kenntnis, kein Bau: Resend sperrt öffentlich gewordene Schlüssel selbst.
Unser Repo ist öffentlich: landet der SMTP-Schlüssel dort, fallen alle Mails
sofort aus. One-Click-Abmeldung (RFC 8058) bleibt ein eigenes Vorhaben,
Begründung im Kopf von `packages/core/server/utils/mailer.ts`.
