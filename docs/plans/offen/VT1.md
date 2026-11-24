# VT1 — Einzelheiten

> Einzelheiten zum offenen Punkt **VT1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**VT1 — Vertretung benennen (aus dem Gesamtaudit, Paket P24, OPS-010).**

- **(a) Die Person.** Sobald David jemanden hat: Namen und Nummern ins
  Notfallblatt (liegt privat bei David, nicht im Repo; entschieden am
  2026-11-17: Ausdruck bei der Vertretung, Notiz im Passwort-Tresor), dann
  die Handgriffe aus [PRODUKTIONS-ALARM.md](../../runbooks/PRODUKTIONS-ALARM.md),
  § 5 (Alarm-Mail, UptimeRobot, healthchecks.io), dann die Probe mit einem
  Probealarm. Entschieden: Die Vertretung soll zuerst nur Bescheid wissen;
  eigene Zugänge erst, wenn die Person feststeht.
  **Stand 2026-11-24:** Person benannt (Angaben nur im privaten Blatt).
  Erledigt: Blatt ausgefüllt und gedruckt, `PRODUCTION_ALARM_MAIL_TO` trägt
  beide Adressen, healthchecks.io hat eine zweite Mail-Integration (die
  Person muss sie noch bestätigen). **UptimeRobot bewusst weggelassen:** der
  Gratis-Plan nimmt nur die Mail des Kontos, eine zweite Adresse kostet einen
  bezahlten „Notify-only seat" (Davids Entscheidung). Offen: die Probe mit
  der Person, danach schließt VT1.
- **(b) Mail für Meldungen von außen — erledigt** (2026-11-22, nur an David;
  OPEN-ITEMS-COMPLETE „VT1 (b)").
- **(c) Vorschlag, nicht entschieden:** ein Wort am Tor des Appwrite-Servers,
  das `docker compose up -d` fährt. Heute kann eine Vertretung ohne
  Server-Zugang den häufigsten Ausfall (Appwrite steht nach einem Update)
  nur ansehen, nicht beheben.
- **(d) Lücken in den neuen Runbooks:** kein Tausch-Rezept für den
  Laufzeit-Schlüssel einer Site und für `_APP_OPENSSL_KEY_V1`, keine Übung
  eines Sicherheitsvorfalls, keine `security.txt`
  ([SICHERHEITSVORFALL.md](../../runbooks/SICHERHEITSVORFALL.md), § 5); Fristen
  für Anfragen von außen gehören in den Anwaltstermin, und die Kunden-Hilfe
  beschreibt „Konto löschen" nicht
  ([ANFRAGEN-VON-AUSSEN.md](../../runbooks/ANFRAGEN-VON-AUSSEN.md), § 6).
- **(e) Kleinigkeiten:** `scripts/ops/uptimerobot-sync.mjs` trägt neue
  Kontakte an bestehende Monitore nicht nach; die Stripe-Runbooks brauchen
  mit A2 einen Abschnitt „Zahlung kommt nicht an" für den Echtbetrieb.
