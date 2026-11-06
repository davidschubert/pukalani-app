# MZ1 — Mail-Zustellbarkeit: Bounces und Spam-Beschwerden sehen

**Stand:** 2026-11-06 · **Phase:** Strategie + Konzeption (Skizze) — wartet auf
Davids Entscheidungen in § 5 · **Offener Punkt:** OPEN-ITEMS „MZ1"

## 1. Ausgangslage (gemessen, nicht geglaubt)

- Wir verschicken bereits über **Resend**, nur per **SMTP**, nicht über das
  Resend-SDK:
  - Unsere eigenen Mails laufen über `sendMail()` in
    `packages/core/server/utils/mailer.ts` (nodemailer, `NUXT_SMTP_*`; lokal
    Mailpit auf `localhost:1025`, leerer Host = aus).
  - Appwrites Mails (Verifizierung, OTP, Recovery) laufen über die SMTP-
    Einstellung der Appwrite-Instanz, mit demselben Resend-Team.
- Die Seite `resend.com/nuxt` ist reine Werbung: das `resend`-SDK in einer
  Server-Route, kein Nuxt-Modul. **Ein Umstieg auf das SDK bringt uns nichts**
  und kostet Mailpit lokal, eine neue Abhängigkeit in fünf `package.json` und
  den Umbau des Mail-Wächters. Diese Skizze bleibt deshalb beim SMTP-Weg.
- Resend führt eine **Sperrliste (Suppression List) für das ganze Team**: nach
  einem harten Bounce (`Permanent`) oder einer Spam-Beschwerde landet die
  Adresse dort automatisch, und Resend überspringt künftige Mails an sie,
  über alle Domains hinweg. Für die Zustellbarkeit selbst müssen wir also
  NICHTS nachbauen.
- **Was uns fehlt, ist die Sicht.** Den Spam-Vorfall vom 2026-10-25/27 (209
  Verifizierungs-Mails an fremde Adressen) bemerkten wir nur durch Resends
  Tageslimit-Mail. Fremde Opfer erzeugen typischerweise Bounces und
  Beschwerden; eine steigende Quote ist also ein FRÜHES Signal für Missbrauch
  und zugleich das, was ein Mail-Anbieter zuerst gegen den Absender verwendet.
- Heute zählt der Mail-Wächter (`scripts/ops/verify-mail-breaker.mjs`,
  Blick 2, täglich in `.github/workflows/production-watch.yml`) nur die MENGE
  der Mails in 24 Stunden (`GET /emails`), nicht ihr Schicksal.

## 2. Zwei Stufen — erst ziehen, dann (vielleicht) schieben

### Stufe A — Blick 3 im Mail-Wächter (Pull, keine App-Änderung) · Aufwand S

Der bestehende Wächter fragt Resend zusätzlich, was mit den Mails geschah:

- **Quelle 1:** `GET /emails` liefert je Mail `last_event`. Wir zählen im
  24-Stunden-Fenster `bounced` und `complained` (die möglichen Werte stehen
  nicht vollständig in der Doku → in der Probe messen, § 6).
- **Quelle 2 (falls ergiebiger):** die Suppressions-API (Liste der Sperrliste)
  — neue Einträge der letzten 24 Stunden mit Grund `bounce`/`complaint`.
- **Rot**, wenn eine der Schwellen überschritten ist (Vorschlag: ≥ 3 Bounces
  ODER ≥ 1 Beschwerde in 24 h — an einem normalen Tag gehen nur wenige Mails
  raus, die 234 Mails in 15 Tagen aus Blick 2 enthielten den Vorfall). Rot fließt über den vorhandenen Weg: Job `alarm` ⇒ Issue
  `produktions-alarm` (Runbook `docs/runbooks/PRODUKTIONS-ALARM.md`).
- Gleiche Regeln wie Blick 2: ohne `RESEND_API_KEY` übersprungen und GRÜN,
  Netzfehler = Exit 2 (kein Alarm), Probelauf über einen Schalter
  (`--bounce-alarm 0`), damit der rote Pfad ohne echten Vorfall beweisbar ist.
- **Keine Adresse im CI-Log** (öffentliches Repo!): ausgegeben werden nur
  Zahlen und höchstens die Empfänger-DOMAIN.

Warum zuerst: kein öffentlicher Endpunkt, kein neues Secret je Deployment,
keine Zuordnung zu Appwrite-Projekten — und sie deckt Appwrites eigene Mails
mit ab, die an unserem Code vorbeilaufen.

### Stufe B — Webhook-Route (Push) · Aufwand M · nur mit Davids Ja

Lohnt sich erst, wenn wir auf ein KONTO reagieren wollen, nicht nur auf die
Quote. Zuschnitt:

- **Route** im core-Layer: `server/api/mail/resend-webhook.post.ts`. Vorbild ist
  `packages/billing/server/api/stripe/webhook.post.ts`: ohne Secret **404**
  (eine bewusst nicht eingerichtete Route ist kein Ausfall), Signaturprüfung
  über den **rohen Body** (`readRawBody`), Event-Allowlist, generische 400/500,
  nie Resend-/Appwrite-Details in der Antwort.
- **Signatur:** Resend signiert über Svix (Kopfzeilen `svix-id`,
  `svix-timestamp`, `svix-signature`). Entweder Paket `svix` oder die
  HMAC-SHA256-Prüfung selbst (~20 Zeilen, `node:crypto`, Zeitfenster gegen
  Replays). Empfehlung: selbst, eine Abhängigkeit weniger und kein
  `check:single-copy`-Thema; Verhalten mit den Svix-Testvektoren belegen.
- **Allowlist:** `email.bounced` (nur `bounce.type === 'Permanent'`),
  `email.complained`, `suppression.added`. Alles andere: 200, nichts tun.
- **Wirkung:** Empfänger-Adresse im Appwrite-Projekt DIESES Deployments
  suchen (`users.list` mit `Query.equal('email', …)`). Gefunden ⇒ Prefs
  ZUSAMMENFÜHREN (nie überschreiben — Falle aus dem Nav-Paket) mit
  `emailUndeliverable: { reason, at }` und `emailNotifications: 'off'`.
  Nicht gefunden ⇒ 200, nichts tun (die Adresse gehört einem anderen Projekt
  oder einem Spam-Opfer ohne Konto).
- **Idempotent statt Dedup-Speicher:** Resend wiederholt mit derselben
  `svix-id`; die Wirkung ist ohnehin wiederholbar, also braucht es keine
  Tabelle (core besitzt keine Tables).
- **Log:** `logEvent('mail.bounced' | 'mail.complained')` OHNE Adresse
  (PII-Regel), mit Projekt und Bounce-Untertyp.
- **UI (klein):** unter Einstellungen → Benachrichtigungen ein Hinweis
  „Deine Adresse ist nicht zustellbar", solange `emailUndeliverable` gesetzt
  ist; das Ändern der E-Mail-Adresse räumt den Merker. i18n de+en.
- **Mehrere Projekte, ein Resend-Team:** jedes Deployment bekommt einen
  eigenen Webhook-Eintrag in Resend (eigenes Secret) und schaut nur in sein
  Projekt. Wie viele Webhooks unser Resend-Tarif erlaubt, ist offen (§ 6).

## 3. Was bewusst NICHT kommt

- Kein Umstieg auf das `resend`-SDK und keine Vue-Email-Vorlagen (s. § 1).
- Keine eigene Sperrliste: Resends Liste gilt teamweit und genügt.
- Keine Öffnungs-/Klick-Auswertung (`email.opened`/`clicked`): Tracking ohne
  Zweck, dazu Datenschutzthema.

## 4. Wo es andockt

| Teil | Datei |
| --- | --- |
| Stufe A | `scripts/ops/verify-mail-breaker.mjs` (Blick 3), `.github/workflows/production-watch.yml` (Aufruf + Secret `PRODUCTION_WATCH_RESEND_KEY`, schon da) |
| Stufe B Route | `packages/core/server/api/mail/resend-webhook.post.ts` (neu) |
| Stufe B Prefs | `packages/core/server/utils/notificationEmail.ts` (`resolveEmailPrefs`), Digest-Sweep in `emailDigest.ts` überspringt ohnehin alles außer `digest` |
| Stufe B Env | `NUXT_RESEND_WEBHOOK_SECRET` je Site (ops:site-env, Pflichtliste in `.claude/rules/hosts-ops.md`) |

## 5. Entscheidungen für David

1. **Umfang:** nur Stufe A (Empfehlung für den Anfang) — oder A und B?
2. **Schwellen für Stufe A:** ≥ 3 Bounces oder ≥ 1 Beschwerde in 24 h, oder
   andere Werte?
3. **Bei einer Beschwerde (nur Stufe B):** nur Benachrichtigungs-Mails
   abschalten — oder das Konto zusätzlich zur Prüfung markieren (Hinweis auf
   Missbrauch wie im Oktober)?

## 6. Vor dem Bau zu messen

- Welche Werte `last_event` wirklich annimmt und ob die Suppressions-API
  einen Zeitstempel und Grund je Eintrag liefert (Probeaufruf mit dem
  Wächter-Schlüssel).
- Ob Mails an gesperrte Adressen in Resends Tages-/Monatskontingent zählen.
- Nur Stufe B: Webhook-Anzahl im Resend-Tarif; Zeitfenster der Svix-Prüfung.

## 7. Beweise (Definition von „fertig")

- **Stufe A:** grüner Lauf gegen das echte Konto (Zahlen im Log, keine
  Adressen); roter Probelauf mit `--bounce-alarm 0` ⇒ Issue
  `produktions-alarm`; `pnpm lint:scripts` grün.
- **Stufe B:** Unit-Tests für Signatur (gültig, falsch, zu alt, fehlende
  Kopfzeile) und Allowlist; lokal über Resends CLI-Weiterleitung ein echter
  Test-Bounce an `bounced@resend.dev` ⇒ Prefs gesetzt, Hinweis sichtbar;
  ohne Secret 404.
