# Sicherheitsvorfall: Verdacht auf fremden Zugriff

**Wann.** Eine Anmeldung, die niemand kennt; eine Mail „Passwort geändert",
die niemand ausgelöst hat; Inhalte ändern sich ohne Grund; ein Schlüssel stand
in einem Chat, einem Protokoll oder einem Commit; jemand droht oder fordert
Geld. Bei Spam über die Registrierung reicht
[PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md), § 4 „Mail-Missbrauch".

**Was dieses Runbook ist — und was nicht.** Es ordnet die Handgriffe, die es
an anderer Stelle schon gibt, in eine Reihenfolge. Geübt wurde der Fall als
Ganzes nie. Wo ein Rezept fehlt, steht das dabei (§ 5).

> **Regel.** Erst aufschreiben, dann eindämmen, dann tauschen — und nichts
> löschen. Eine gelöschte Spur fehlt später genau dort, wo die Frage „was
> wurde gelesen?" beantwortet werden muss.

---

## 1 · Sofort (Minuten)

- [ ] **Zeitpunkt festhalten:** wann der Verdacht aufkam, wer ihn hatte, was
      zu sehen war (Bildschirmfotos). Ab diesem Zeitpunkt können Fristen
      laufen (§ 4).
- [ ] **Nichts löschen, nichts „aufräumen".** Kein Konto, kein Log, kein
      Schlüssel, bevor § 2 und § 3 gegangen sind.
- [ ] **Auf keine Forderung antworten,** nichts bezahlen.
- [ ] Wer nicht David ist: David anrufen, danach den Anwalt. Nummern stehen
      auf dem Notfallblatt (PRODUKTIONS-ALARM.md, § 5).

## 2 · Eindämmen

Von eng nach weit. Der engste Griff, der den Zugriff sicher beendet, ist der
richtige.

| Lage | Handgriff | Fundstelle |
| --- | --- | --- |
| EIN Konto verhält sich verdächtig | Im Dashboard der Site `/dashboard/users` → Konto → „Blockieren" und „Sessions beenden". Löscht nichts, lässt sich zurücknehmen | Nutzerverwaltung (`packages/admin`) |
| Ein Konto mit der Rolle `admin` oder `moderator` ist betroffen | Zusätzlich die Rolle entziehen („Rollen verwalten", verlangt eine frische Anmeldung). Den letzten Admin einer Instanz schützt die Oberfläche — dann zuerst ein zweites Admin-Konto | [RBAC-CONCEPT.md](../referenz/RBAC-CONCEPT.md) |
| Viele Konten eines Projekts, oder unklar welche | Appwrite-Konsole → Auth → Settings → Security actions, JE PROJEKT (`account`, `admin`, `portfolio`, `branding`): „Alle abmelden" UND „Alle Passwörter zurücksetzen" — beide, weil der zweite Knopf Sitzungen bestehen lässt | [ANMELDE-REGELN.md](ANMELDE-REGELN.md), „Notfall" |
| Jemand bittet, die Zwei-Faktor-Anmeldung eines Kontos zurückzusetzen | Nur nach echter Identitätsprüfung; eine Antwort von der hinterlegten Adresse reicht nicht | [MFA-NOTAUSGANG.md](MFA-NOTAUSGANG.md) |
| Neue Konten sollen sofort aufhören | Not-Aus „Registrierung offen" | PRODUKTIONS-ALARM.md, § 4 „Not-Aus" |
| Ein Produkt wird missbraucht | Produkt abschalten (404 auf allen seinen Routen) | ebenda |
| Bezahlte KI-Aufrufe laufen aus dem Ruder | `brandAiEnabled` auf `false` | ebenda |

## 3 · Schlüssel tauschen

Ein Schlüssel, der gesehen worden sein KÖNNTE, gilt als gesehen. Reihenfolge
überall: neuen anlegen → eintragen → beweisen → alten löschen (nie umgekehrt).

| Schlüssel | Tausch-Rezept |
| --- | --- |
| Die zwei SSH-Schlüssel von GitHub Actions (Ausliefern, Wächter) | [CI-SCHLUESSEL-TAUSCHEN.md](CI-SCHLUESSEL-TAUSCHEN.md), § 2 |
| Sende-Schlüssel für Mails (SMTP, fünf Stellen) und der Budget-Schlüssel | [RESEND-WEBHOOK.md](RESEND-WEBHOOK.md), § 6 und § 5.3 |
| Webhook-Geheimnis von Resend | [RESEND-WEBHOOK.md](RESEND-WEBHOOK.md), § 4 |
| Schlüssel des Alarm-Wegs (`produktions-waechter` bei Resend) | bei Resend neu anlegen, dann die zwei Secrets der Umgebung `production-watch` neu setzen (PRODUKTIONS-ALARM.md, § 3), Probealarm |
| Die vier nur lesenden Schema-Schlüssel des Wächters | in der Appwrite-Konsole neu anlegen, bei GitHub überschreiben, den alten löschen (PRODUKTIONS-ALARM.md, § 1 „Datenbank-Stand") |
| Stripe: Webhook-Geheimnis, Verschlüsselungs-Schlüssel der Bezahl-Einstellungen | [STRIPE-GO-LIVE-RUNBOOK.md](STRIPE-GO-LIVE-RUNBOOK.md) („Den Verschlüsselungs-Schlüssel rotieren", „whsec-Rotation") |
| Geheimnis der Abmelde-Links (branding.supply) | [NEWSLETTER-ABMELDE-LINKS.md](NEWSLETTER-ABMELDE-LINKS.md) |
| Schlüssel der Backups | [APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md), § 6.5 — ältere Läufe bleiben nur mit dem ALTEN lesbar |
| Zugänge zu gelöschten Projekten, die noch irgendwo stehen | [ZUGAENGE-AUFRAEUMEN.md](ZUGAENGE-AUFRAEUMEN.md) (`pnpm ops:stale-keys`) |

Dazu die Konten der Dienste selbst (GitHub, Ploi, Hetzner, Cloudflare,
Resend, Stripe, OpenRouter, UptimeRobot, healthchecks.io, die
Appwrite-Konsole): Passwort ändern, alle Sitzungen dort beenden,
Zwei-Faktor-Anmeldung prüfen, die Liste der Schlüssel und Mitglieder im Konto
lesen.

## 4 · Spuren sichern und melden

- **Betreiber-Protokoll** `audit_logs` der betroffenen Instanz (Anmeldungen,
  Betreiber-Aktionen, Herausgaben; dort steht die Adresse des Aufrufers —
  nicht in Appwrites eigenem `_audit`). Dazu in der Appwrite-Konsole das
  Aktivitäts-Protokoll des Kontos.
- **pm2-Logs** auf dem App-Server (`~/.pm2/logs/`): die Zeilen `server.error`,
  `audit.write_failed`, `auth.mail_route_breaker`. Sie haben keinen Umlauf,
  alte Dateien früherer Prozess-Nummern liegen daneben.
- **Zugriffs-Log des Webservers:** nur für die Betreiber-Seite, 14 Tage. Für
  alle anderen Sites ist es bewusst aus (`ops/nginx-sites.conf`).
- **GitHub:** die Protokolle der Läufe (öffentlich, 90 Tage) und das
  Sicherheits-Protokoll des Kontos.
- Kopien der Spuren außerhalb des betroffenen Systems ablegen, bevor
  irgendetwas neu gestartet oder getauscht wird, das sie überschreibt.

**Melden.** Ob eine Behörde oder die betroffenen Personen zu benachrichtigen
sind, entscheidet David mit dem Anwalt — nicht die Vertretung und nicht eine
Sitzung. Wo die DSGVO gilt, läuft für die Meldung an die Aufsicht eine Frist
von 72 Stunden ab Kenntnis (Art. 33); deshalb steht der Zeitpunkt in § 1 an
erster Stelle. Welche Regeln am Sitz des Betreibers und in den übrigen
Märkten gelten, ist nicht aufgeschrieben (OPEN-ITEMS, „Ein Anwaltstermin für
alles").

**Danach.** Ein Eintrag im Lern-Gedächtnis
([OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md)) nach dem Muster der
Vorfälle vom Herbst 2026: Auslöser, Ursache, Behebung, **Gelernt**.

## 5 · Was fehlt

- **Kein Tausch-Rezept für den Laufzeit-Schlüssel einer Site**
  (`NUXT_APPWRITE_KEY`) und für die Schlüssel zwischen Platform und Control
  Plane (`NUXT_PLATFORM_CONTROL_*`). Der Weg ist derselbe wie bei jedem
  anderen (Konsole: neu anlegen mit denselben Rechten → `.env` der Site →
  neu laden über die Ecosystem-Datei → `/api/health` → alten löschen), aber
  nie aufgeschrieben und nie geübt.
- **Kein Rezept für `_APP_OPENSSL_KEY_V1`** der Appwrite-Instanz. Mit ihm
  sind die API-Schlüssel der Projekte, die Zwei-Faktor-Geheimnisse und die
  verschlüsselten Buckets versiegelt; Appwrite 2.7 bringt Variablen für einen
  Wechsel mit (`_APP_OPENSSL_KEY_CURRENT`), benutzt hat sie hier niemand.
  Dieser Schlüssel liegt auch in jedem Backup.
- **Keine Übung.** Kein Schritt dieses Runbooks ist im Zusammenhang gegangen
  worden; die einzelnen Rezepte in § 3 sind es je für sich.
- **Keine Stelle, an der Außenstehende eine Lücke melden können**
  (`security.txt` gibt es nicht).
