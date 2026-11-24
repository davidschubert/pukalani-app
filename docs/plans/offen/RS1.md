# RS1 — Einzelheiten

> Einzelheiten zum offenen Punkt **RS1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**RS1 — Resend besser nutzen: was offen ist.** Erledigt und in COMPLETE:
(a) Tarif und Bremse, (b) Webhook, (c) + (d) Wächter und Idempotenz,
(e1) eigener Sende-Schlüssel für den Newsletter, (e2) DMARC für
`branding.supply`, (g) DMARC für `pukalani.app`, (h) engerer SMTP-Schlüssel,
und der Wechsel der Newsletter-Domain auf `newsletter.branding.supply`.
Offen:

- **(f) Rechtstexte.** Resend ist nach dem EU-US Data Privacy Framework
  zertifiziert, beide Domains senden aus eu-west-1. Der Satz dazu gehört in
  den Durchgang [DT1](DT1.md).
- **(g) Rest.** DMARC für `pukalani.app` nach ein paar Wochen sauberer
  Berichte auf `p=quarantine` stellen.
- **Zur Klärung (David):** bei Resend liegen zwei Schlüssel vom 2026-11-21,
  die nirgends beschrieben sind: „Branding Supply" und „admin.pukalani".
  Spalte „Last used" ansehen; nie benutzt ⇒ widerrufen, sonst im Runbook
  eintragen, wo sie stecken.

Zur Kenntnis, kein Bau: Resend sperrt öffentlich gewordene Schlüssel selbst.
Unser Repo ist öffentlich: landet der SMTP-Schlüssel dort, fallen alle Mails
sofort aus. One-Click-Abmeldung (RFC 8058) bleibt ein eigenes Vorhaben,
Begründung im Kopf von `packages/core/server/utils/mailer.ts`.
