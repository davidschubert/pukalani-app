# Runbook: Eintrittskarte je Seite einschalten (PK1, Etappe E1)

Stand 2026-11-22 (E1c). Gebaut sind E1a, E1b-1, E1b-2 und E1c; der Schalter
steht auf Production überall auf `off`. Dieses Runbook beschreibt, wie er auf
`read` und dann auf `write` kommt, wie man jeden Schritt prüft und wie man
zurückgeht. Was die Karte ist und warum: [PUKALANI-KONTO-E1.md](../plans/PUKALANI-KONTO-E1.md)
(§ 5 Variante A, § 8 Rückweg, § 13 Messungen). Jeder Schritt mit
Production-Wirkung braucht **Davids Ja in der Sitzung, die ihn ausführt**.

In diesem Dokument steht kein Schlüssel und kein Kundenname. Die Häkchen sind
echt — je Durchlauf abhaken und unten ins Protokoll schreiben.

## 1. Was je App gesetzt wird

Drei Einstellungen, je App **ein eigener Schlüssel** (Davids Entscheidung K3 —
nie derselbe Wert in zwei Apps):

| Variable | Wert | Wann |
| --- | --- | --- |
| `NUXT_SITE_CARD_KEY` | 32 Byte, base64: `openssl rand -base64 32` (am eigenen Rechner erzeugen, nicht in einen Chat, nicht in ein Ticket) | vor `read` |
| `NUXT_SITE_CARD_MODE` | `off` → `read` → `write` | je Schritt unten |
| `NUXT_SITE_CARD_PREVIOUS_KEY` | der vorige Schlüssel, nur während eines Tauschs (§ 6) | sonst leer bzw. nicht gesetzt |

Apps mit Anmeldung (aus `site.manifest.ts`/`ops/apps.conf`; Landing und Hilfe
haben keine Konten und bekommen nichts):

| App | Site | Hosts, auf denen Karten gelten |
| --- | --- | --- |
| platform | `platform.pukalani.app` | `account.`, `demo.`, jede Community unter `*.pukalani.app`, jede eigene Domain |
| control (Konsole) | `admin.pukalani.app` | die Konsole |
| portfolio | `portfolio.pukalani.app` | `pukalani.studio`, `portfolio.pukalani.app` |
| branding | `branding.supply` | `branding.supply` |

**Wie der Wert auf den Server kommt** — der vorhandene Weg
([DEPLOYMENT.md](DEPLOYMENT.md) A1, Regel `.claude/rules/ops-server.md`
„Env-Pflichtliste"): in der `.env` der Site (`/home/ploi/<site>/.env`, im
ploi-Panel unter „Environment" oder per SSH) eintragen. **Die App liest die
`.env` erst beim nächsten Neuladen** (`pm2 startOrReload
/home/ploi/<site>/ops/ecosystem-<app>.config.cjs --update-env`, dann `pm2
save`) — ein Eintrag ohne Neuladen wirkt nicht, und das nächste Ausliefern
macht ihn dann unangekündigt wirksam. Darum: eintragen, sofort neu laden,
sofort prüfen (§ 3). Erst wenn ein Wert dauerhaft steht, kommt er in die
Pflicht-Liste `scripts/ops/verify-site-env.mjs` (sonst öffnet der tägliche
Lauf einen Alarm, Reihenfolge in `ops-server.md`).

**Sicherung:** die `.env` jeder Site landet nachts verschlüsselt im Backup der
App-Einstellungen (N11, [APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md)
§ 6.1). Nach dem Eintragen am nächsten Morgen nachsehen, dass der Lauf grün
war — ein verlorener Schlüssel meldet alle mit Karte ab (kein Datenverlust).

## 2. Vorher prüfen (nur lesend, Appwrite-Konsole)

- [ ] **Sitzungs-Obergrenze** im Projekt `account`: Auth → Security →
  Sessions limit. `0` heißt in Appwrite 2.7.4 „ohne Grenze" ⇒ nichts tun.
  Steht dort eine Zahl (Standard neuer Projekte: 10), wird sie vor `write` auf
  **50** gesetzt (Davids K5, ein eigener Klick mit eigenem Ja). Die Grenze
  trimmt nur echte Anmeldungen (`account.createSession`); die Sitzungen aus dem
  Host-Wechsel (`users.createSession`) zählt sie nicht — die räumt der Code
  selbst weg (§ 13 im Plan, OPEN-ITEMS-COMPLETE „PK1 E1b-1").
- [ ] **Laufzeit-Schlüssel** der Platform (Projekt `account`, der Schlüssel
  aus `NUXT_APPWRITE_KEY`): trägt `users.write` und `sessions.write`. Fehlt
  eins, fällt der Host-Wechsel still auf die Kopie zurück (Log
  `auth.site_session_copy_fallback`) — niemand wird ausgesperrt, aber „Abmelden
  je Seite" gilt dann nicht.
- [ ] **Abgeschaltete Anmelde-Wege** (auch JWT, [ANMELDE-REGELN.md](ANMELDE-REGELN.md))
  bleiben aus. Sie treffen `users.createSession` und `users.createJWT` mit
  Schlüssel nicht (Appwrite 2.7.4: die Prüfung steht nur in der Gruppe `auth`
  und wird mit Schlüssel übersprungen) — nichts umstellen.
- [ ] Die **Konsole läuft mit einem Stand ≥ E1b-2** (strenger Rumpf der
  Einladungs-Annahme): `curl -s https://admin.pukalani.app/api/health` → `.build`
  ist ein Commit ab E1b-2 und `.siteCard` ist vorhanden (≥ E1c).

## 3. Reihenfolge

Nach JEDEM Schritt dieselbe Prüfung:

- [ ] `/api/health` aller acht Hosts aus `scripts/ops/verify-health.mjs`
  (`node scripts/ops/verify-health.mjs`): `ok: true`, `.build` = Spitze von
  `main`, `.siteCard.mode` = der eben gesetzte Wert, `cards: true`,
  `previous: false`.
- [ ] Kein offenes Issue `produktions-alarm`, kein neues `buehne-alarm`.
- [ ] Log-Zeilen zählen (pm2-Log der App): `site_card.config_invalid` muss
  **0** sein; `auth.site_session_*` (Host-Wechsel) und
  `auth.site_session_copy_fallback` (Rückfall auf die Kopie) nur zur Kenntnis.

### Schritt A — `read` auf allen vier Apps

Niemand merkt etwas: Karten werden gelesen, aber noch nicht geschrieben.

- [ ] platform, control, portfolio, branding: Schlüssel + `read`, je App neu
  laden, prüfen.
- [ ] Klick-Probe in Davids Browser: auf `demo.pukalani.app` an- und abmelden
  wie vorher; in `account.pukalani.app` eine Community öffnen.

### Schritt B — `write`, Ziel-Apps vor Quellen, Konsole zuletzt

1. - [ ] **platform** auf `write`, neu laden, prüfen (`.siteCard.mode:
   write`). Klick-Probe:
   - auf `demo.pukalani.app` anmelden; in den Entwickler-Werkzeugen
     (Anwendung → Cookies) beginnt der Wert von `a_session_account` mit `c1.`;
   - eine zweite Community öffnen (über `account.pukalani.app` → „Öffnen");
   - auf der ersten abmelden ⇒ die zweite bleibt angemeldet;
   - auf der Community mit eigener Domain: Konto-Seiten führen zum
     Kundenbereich, das Dashboard öffnet sich unter der Pukalani-Adresse.
2. - [ ] **portfolio** und **branding** auf `write` (je eine Seite, kein
   Host-Wechsel): anmelden, Cookie beginnt mit `c1.`, abmelden.
3. - [ ] **control (Konsole) zuletzt** auf `write`. Erst damit entfällt die
   Freigabe-Pflicht für eigene Domains (K6): die Konsole fragt dafür
   `/api/health` der Platform und lässt die Pflicht nur fallen, wenn die
   Platform `write` mit Karten bestätigt (`customDomainApprovalWaiver.ts`,
   fail-closed). Prüfen: im pm2-Log der Konsole steht einmal
   `community.custom_domain_approval_waiver` mit `waived: true`; die Seite
   „Eigene Domain" einer bezahlten Pro-Community ohne Freigabe zeigt das
   Eingabefeld. Die Sperre in der Testphase bleibt.

### Schritt C — der einmalige Abmelde-Lauf (§ 6 Punkt 4 im Plan)

Im Modus `write` gilt Klartext auf `*.pukalani.app` weiter (nur auf eigenen
Domains nicht); die vor dem Einschalten KOPIERTEN Sitzungen leben also weiter.
Der Lauf beendet sie: für jedes Konto im Projekt `account`
`users.deleteSessions` — danach meldet sich jede Person einmal neu an
(Davids Entscheidung „Einmalige Abmeldung aller").

- **Ein Werkzeug dafür gibt es noch nicht** (gesucht: kein Skript im Repo ruft
  `deleteSessions` über alle Konten). Es wird erst mit Davids Ja gebaut, als
  Fristen-Lauf-artiges Werkzeug mit `count` zuerst (gezählte Konten und
  Sitzungen, nichts geschrieben), dann `apply` nur mit Davids Ja zur
  gezählten Zahl, Ziel-Prüfung über `scripts/lib/target.mjs`.
- Erst nach Schritt B 1 und nach mindestens einem Tag ohne Befund.

## 4. Rückweg

Zwei Stufen, beide ohne Ausliefern:

1. **`write` → `read`**, neu laden: niemand fliegt raus — der Lesepunkt
   versteht Karten weiter, neue Anmeldungen bekommen wieder Klartext. Die
   Konsole nimmt die Freigabe-Pflicht nach höchstens einer Minute von selbst
   wieder auf.
2. **`read` → `off`**, neu laden: alle mit Karte sind abgemeldet (bewusst —
   ohne Lesepunkt ist eine Karte nur Text). Kein Datenverlust.

**Nie den Schlüssel tauschen ohne Übergang** (§ 6) — ein neuer Schlüssel ohne
`PREVIOUS_KEY` meldet alle mit Karte ab.

## 5. Was erst nach dem Einschalten beweisbar ist

- Der echte Webserver davor (nginx, TLS, `Secure`-Cookie) — die Bühne läuft
  ohne. Beweis: die Klick-Probe in Schritt B 1.
- Eine echte eigene Domain (DNS, Zertifikat, fremde Adresse im Browser) — die
  Bühne stellt sie nur als `.localhost` (`packages/core/scripts/verify-site-card.mjs`).
- Die Sitzungs-Obergrenze auf Production (Wert nur in der Konsole lesbar).
- Zwei-Faktor-Konten beim Host-Wechsel bekommen eine Kopie in der Karte
  (§ 13.4 (a)) — mit einem eigenen Konto mit Zwei-Faktor einmal durchklicken.

## 6. Schlüssel tauschen

1. Neuen Wert erzeugen. Den bisherigen Wert nach `NUXT_SITE_CARD_PREVIOUS_KEY`,
   den neuen nach `NUXT_SITE_CARD_KEY`, neu laden. Karten beider Schlüssel
   gelten; neue Karten bekommen den neuen.
2. Nach der Laufzeit einer Sitzung (Appwrite-Sitzungsdauer des Projekts)
   `NUXT_SITE_CARD_PREVIOUS_KEY` entfernen, neu laden.
3. Bleibt der vorige Schlüssel stehen, meldet `/api/health` `siteCard.previous:
   true`, und der Erreichbarkeits-Wächter (`scripts/ops/verify-health.mjs`)
   schreibt bei jedem Lauf eine Warnung (nicht rot) — dann Schritt 2 nachholen.

## 7. Offene Grenzen

- **Live-Verbindung unter einer eigenen Domain** kommt erst mit E1d (Weg 3,
  Plan § 13.3): bis dahin läuft der Socket dort als Gast, persönliche
  Meldungen und die Anwesenheit kommen über den 20-s-Takt.
- **Das Siegel des Host-Wechsels ist nur einmal einlösbar — gemerkt je
  Prozess.** pm2 fährt je App genau eine Instanz; wer das ändert, braucht
  einen geteilten Merker (Redis), sonst lässt sich ein Siegel je Instanz
  einmal einlösen.
- Der einmalige Abmelde-Lauf hat noch kein Werkzeug (Schritt C).

## Protokoll

| Datum | Schritt | Wer | Ergebnis |
| --- | --- | --- | --- |
| — | noch kein Durchlauf | — | — |
