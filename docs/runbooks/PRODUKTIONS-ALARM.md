# Produktions-Alarm: Wächter, Alarmweg, Klickliste

**Wann.** Wenn ein Issue mit dem Label `produktions-alarm` aufgeht, wenn eine
Alarm-Mail kommt, wenn UptimeRobot meldet — und einmal zum Einrichten (die
Klickliste unten, nur David).

**Warum.** Zwei stille Vorfälle im Oktober 2026. (1) Das Zertifikat von
`api.pukalani.app` lief am 2026-10-16 ab; **alle** Apps antworteten acht Tage
auf `/api/health` mit `ok:false`, kein Alarm. Und das Schlimmste daran: der
TLS-Wächter hatte es GESEHEN — vom 2026-10-05 („läuft in 11 Tagen ab") bis zur
Reparatur am 2026-10-24 war jeder Lauf von `production-watch.yml` rot, rund
900 Stück, alle 30 Minuten. Niemand hat es bemerkt. (2) Vom 2026-10-25 bis
2026-10-27 missbrauchte ein Angreifer die Registrierung als Mail-Relais; bemerkt
wurde das nur, weil Resend das Tageslimit per Mail an David meldete.

> **Regel.** Ein roter Lauf ist nur eine Farbe. Ein Alarm ist erst, was jemanden
> ERREICHT — und ein Alarmweg, der nie geprobt wurde, ist keiner.

---

## 1 · Was automatisch läuft (`.github/workflows/production-watch.yml`)

| Blick | Skript | Takt | Rot bei |
| --- | --- | --- | --- |
| Zertifikate | `scripts/ops/verify-tls.mjs` | alle 30 min | SAN passt nicht, Restlaufzeit < 14 Tage, kein Handshake — auch `api.pukalani.app` (Appwrite, nicht ploi) |
| Erreichbarkeit | `scripts/ops/verify-health.mjs` | alle 30 min | ein Host antwortet nicht `200` + `ok:true` (Appwrite: keine `version`); ein zweiter Versuch nach 15 s filtert Schluckauf |
| Env-Variablen | `scripts/ops/verify-site-env.mjs` | täglich 04:17 UTC | Pflicht-Variable fehlt auf einer Site |
| Tote Zugänge | `scripts/ops/verify-stale-keys.mjs` | täglich | Schlüssel auf ein gelöschtes Projekt |
| Admin-Konto | `scripts/ops/verify-instance-admins.mjs` | täglich | Instanz ohne Admin |
| Mail-Missbrauch | `scripts/ops/verify-mail-breaker.mjs` | täglich | Notbremse `auth.mail_route_breaker` im pm2-Log der letzten 25 h; mit Resend-Secret zusätzlich ≥ 80 Mails in 24 h (vor dem 100er-Limit) |

Die Mail-Notbremse selbst (60 je Stunde und Route über alle IPs) lebt in
`packages/core/server/middleware/05.rate-limit.ts`; sie STOPPT den Versand und
schreibt eine Zeile — der Wächter liest diese Zeile.

## 2 · Der Alarmweg (Job `alarm`, läuft nach jedem Wächter-Lauf)

1. **Issue.** Ist irgendein Wächter rot, öffnet der Job EIN Issue mit Label
   `produktions-alarm` (kein zweites, solange es offen ist; alle 12 h ein
   Kommentar „weiterhin rot"). Ist alles wieder grün, kommentiert er
   „Entwarnung" und schließt es. **Offenes Issue = Alarm aktiv.** Braucht
   kein Secret — nur `issues: write` des Workflow-Tokens.
2. **Mail bei jedem Wechsel** (Alarm / Entwarnung, nie im Takt) über Resend —
   sobald Secret `PRODUCTION_ALARM_RESEND_KEY` und Variable
   `PRODUCTION_ALARM_MAIL_TO` gesetzt sind (Klickliste). Vorher steht im Lauf
   eine gelbe Warnung „Mail-Alarm nicht eingerichtet".
3. **Heartbeat bei jedem grünen Lauf** an `PRODUCTION_WATCH_HEARTBEAT_URL`
   (Klickliste). Das ist der einzige Weg, der auch meldet, wenn der Workflow
   GAR NICHT mehr läuft (GitHub schaltet Zeitpläne nach 60 Tagen ohne Commit
   ab; eine kaputte cron-Zeile; ein Runner-Ausfall).

**Probealarm — monatlich, und nach jeder Änderung am Workflow:**

```bash
gh workflow run production-watch.yml -f alarm_drill=true
```

Das macht den Health-Blick sicher rot (Host `probealarm.invalid`) und muss ein
Issue „🔴 Produktions-Alarm (Probealarm)" + (wenn eingerichtet) die Mail
erzeugen. Danach ohne Haken laufen lassen — das Issue muss von selbst zugehen:

```bash
gh workflow run production-watch.yml
```

Lokal, ohne CI (der zweite Befehl MUSS mit Exit 1 enden):

```bash
node scripts/ops/verify-health.mjs
```

```bash
PUKALANI_HEALTH_DRILL=1 node scripts/ops/verify-health.mjs
```

## 3 · Klickliste — nur David (Logins: GitHub, Resend, UptimeRobot)

Reihenfolge nach Wirkung. Jede Zeile ist unabhängig von den anderen.

- [ ] **GitHub-Benachrichtigungen prüfen** (die eigentliche Lücke der 900
      roten Läufe): github.com → Settings → Notifications → „Actions":
      *Failed workflows only* + E-Mail AN; darunter „Participating, @mentions
      and custom" → E-Mail AN (das deckt die Alarm-Issues; als Owner bist du
      automatisch Beobachter des Repos — prüfen unter Repo → Watch →
      *All Activity* oder *Custom → Issues*). Dann im Mail-Postfach nach
      `notifications@github.com` suchen: landen die Mails in einem Filter?
      Beweis: ein Probealarm (oben) erzeugt eine Issue-Mail.
- [ ] **Resend → Alarm-Mail.** Resend → API Keys → *Create* → Name
      `produktions-waechter`, Permission *Full access* (Sending reicht für die
      Alarm-Mail, aber der Mail-Zähler liest `GET /emails` und braucht Full
      access; EIN Schlüssel darf in beiden Secrets stehen). GitHub → Repo →
      Settings → Secrets and variables → Actions:
      Secret `PRODUCTION_ALARM_RESEND_KEY` = der Schlüssel,
      Secret `PRODUCTION_WATCH_RESEND_KEY` = derselbe Schlüssel,
      Variable (Reiter *Variables*) `PRODUCTION_ALARM_MAIL_TO` = deine
      Adresse. Absender ist `noreply@pukalani.app` (Domain bei Resend
      verifiziert). Beweis: Probealarm ⇒ Mail „🔴 Produktions-Alarm";
      täglicher Lauf zeigt „Resend: n Mails in 24 h".
- [ ] **UptimeRobot → Keyword-Monitore** (externer Poller, unabhängig von
      GitHub): je Host *Add New Monitor* → Type *Keyword* → URL
      `https://<host>/api/health` → Keyword `"ok":true` → Alert when keyword
      *not exists* → Interval 5 min → Alert Contacts: Mail + App-Push. Hosts:
      `platform.pukalani.app`, `account.pukalani.app`, `demo.pukalani.app`,
      `admin.pukalani.app`, `pukalani.studio`, `branding.supply`,
      `pukalani.app`, `help.pukalani.app`. Für Appwrite:
      `https://api.pukalani.app/v1/health/version`, Keyword `"version"`.
      Die alten HTTP-Monitore (`api`, `control`, `comments`, `portfolio`,
      `demo`, `pukalani.app`) dabei durchsehen: **warum hat der 500 vom
      Oktober keinen Alarm ausgelöst?** (Monitor pausiert? Alert Contact
      ohne Bestätigung? `control` zeigt seit AH-4b auf einen 404-Host.)
- [ ] **UptimeRobot → SSL-Ablauf.** Beim Monitor für `api.pukalani.app`
      (HTTPS) *SSL expiry reminders* einschalten (30/14/7 Tage). Der
      TLS-Wächter sieht das auch — aber ein zweiter, fremder Weg ist genau
      das, was im Oktober fehlte.
- [ ] **Heartbeat.** UptimeRobot → *Add New Monitor* → Type *Heartbeat*
      (falls im Tarif; sonst kostenlos https://healthchecks.io, 20 Checks),
      Name `production-watch`, Interval 60 min, Grace 60 min → die Ping-URL
      als Secret `PRODUCTION_WATCH_HEARTBEAT_URL` eintragen. Beweis: der
      nächste grüne Lauf zeigt „Heartbeat gesendet"; ein Probealarm lässt den
      Ping aus, nach dem Fenster meldet der Monitor.

Wenn alle fünf Häkchen stehen: die Zeile MON2 in `docs/OPEN-ITEMS.md` nach
COMPLETE ziehen.

## 4 · Wenn ein Alarm kommt

Zuerst den Lauf öffnen (Link im Issue) und lesen, WELCHER Blick rot ist.

**Alle Apps `ok:false` (oder `api.pukalani.app` rot im TLS-Blick).** Es ist
fast immer Appwrite. Prüfen:

```bash
curl -s https://api.pukalani.app/v1/health/version; echo; node scripts/ops/verify-tls.mjs api.pukalani.app
```

- Zertifikat abgelaufen/kurz davor: Appwrite erneuert NICHT von selbst, sobald
  die Domain-Regel einmal `unverified` ist (Vorfall 2026-10-16). Weg A ohne
  Mac: Actions → Produktions-Wächter → *Run workflow* → Haken
  `appwrite_probe` (nur lesen), dann `appwrite_renew`; scheitert es an „Account
  not found", `appwrite_reset_account`. Weg B auf `ploi@188.245.61.155` in
  `~/appwrite`: Regel in `_console_rules` auf `verified`, Redis-Schlüssel der
  Regel löschen, `docker compose restart appwrite-worker`, dann
  `docker exec appwrite php app/cli.php ssl --domain=api.pukalani.app --skip-check=true`
  (Rezept mit allen Fallen: Memory `appwrite-prod-tls-cert-expired`,
  OPEN-ITEMS-COMPLETE „Vorfall appwrite-prod — TLS-Zertifikat", 2026-10-24).
- Instanz steht (kein `version`): `docker compose ps` dort; Platte voll?
  (`df -h`, ClickHouse-Vorfall 2026-09-28) — `docker compose up -d`.

**Ein einzelner Host `ok:false` / HTTP ≠ 200.** Auf `ploi@49.13.211.173`:
`pm2 ls`, `pm2 logs <prozess> --lines 50` (Namen: `platformpukalaniapp`,
`adminpukalaniapp`, `portfoliopukalaniapp`, `brandingsupply`, `pukalaniapp`,
`helppukalaniapp`). Letzter Deploy rot? → `deploy.yml`-Lauf lesen;
`pm2 startOrReload ops/ecosystem-<app>.config.cjs --update-env`.

**TLS auf einem ploi-Host.** Hinweis am Ende des Wächter-Laufs; Regeln in
`.claude/rules/hosts-ops.md` (Lineage-Falle: NIE auf `pukalani.app` oder
`platform.pukalani.app` anfordern, außer `*.pukalani.app` auf platform).

**Mail-Missbrauch.** Resend → Emails: die To-Spalte zeigt den Spam-Namen, der
Betreff das Appwrite-Projekt. Angreifer-IP in `audit_logs` der Instanz (nicht
in Appwrites `_audit`); Konten aufräumen mit `scripts/ops/purge-spam-accounts.mjs`
(läuft auf app-prod mit der Site-`.env`). Vorfall und Diagnose-Rezept:
OPEN-ITEMS-COMPLETE „Resend-Spam" (2026-10-27). Hält die Notbremse eine ECHTE
Anmeldewelle auf, Schwelle `MAIL_GLOBAL_HOUR_MAX` erhöhen — nicht die
Notbremse entfernen.

**Env / Zugänge / Admin-Konto rot.** `docs/runbooks/ZUGAENGE-AUFRAEUMEN.md`
bzw. die Pflichtliste in `scripts/ops/verify-site-env.mjs`.

**Probealarm vergessen aufzuräumen?** Ein Lauf ohne Haken schließt das Issue.
