# Pukalani-Konto, Etappe 1 — die Eintrittskarte je Seite

> **Plan-Status (2026-11-22):** nicht gebaut ([OPEN-ITEMS](../OPEN-ITEMS.md) „PK1“).

**Sorte:** Plan (noch nicht gebaut). **Stand: 2026-11-22 · Status: Konzept der
ersten Etappe, wartet auf Davids Entscheidungen (§ 12).** Nichts hiervon ist
umgesetzt — keine Code-Änderung, keine Migration, nichts an Production.

Dieses Dokument vertieft **eine** Etappe des Gesamtkonzepts
[PUKALANI-KONTO.md](PUKALANI-KONTO.md). Dort sind der Weg (a) und Davids zehn
Antworten vom 2026-11-12 festgehalten; sie gelten hier unverändert und werden
nicht neu gestellt. Neu sind nur die Fragen, die erst beim Zuschnitt dieser
Etappe auftauchen. E1 löst den Audit-Befund SEC-022 (Gesamtaudit GA1).

---

## 1. Ziel in einfachen Worten

Wer sich auf einer Community anmeldet, bekommt dort eine **Eintrittskarte**.
Die Karte gilt nur auf dieser einen Adresse und nur für diese eine Community.
Nimmt jemand die Karte mit auf eine andere Adresse oder direkt zur Datenbank,
ist sie wertlos. Abmelden auf einer Seite beendet nur diese Karte.

Heute liegt im Browser der Schlüssel zum **ganzen Konto**. Auf einer Adresse,
die uns gehört (`*.pukalani.app`), ist das ein bekanntes Restrisiko. Auf einer
**Kundendomain** ist es ein echtes Loch: Die Adresse gehört dem Kunden, und wer
sie umleitet, bekommt den Konto-Schlüssel aller Mitglieder, die dort waren.

## 2. Was heute ist (am Code belegt)

| Was | Heute | Beleg |
| --- | --- | --- |
| Inhalt des Cookies | das Appwrite-Sitzungs-Geheimnis selbst, im Klartext | `packages/core/server/lib/appwrite.ts` (`setSessionCookie`) |
| Wo das Cookie gilt | nur auf dem Host, der es setzt (kein `Domain`) | dieselbe Stelle |
| Was das Geheimnis darf | alles, was das Konto darf: jede Community, Kundenbereich, Export, Löschung — und direkt bei der Appwrite-API | `site-session.get.ts`, `02.auth.ts` |
| Host-Wechsel | dasselbe Geheimnis wird 60 s versiegelt mitgegeben und am Ziel wieder als Klartext-Cookie gesetzt (Kopie) | `communityHandoff.ts` (`sealCommunityHandoff`), `embedHandoff.ts` (`sealHandoffToken`, AES-GCM, Schlüssel aus dem Server-Schlüssel abgeleitet) |
| Abmelden | `deleteSession('current')` beendet die eine Sitzung **überall**, wohin sie kopiert wurde | `logout.post.ts` |
| Wo das Cookie gelesen wird | sieben Stellen: `lib/appwrite.ts` (Sitzungs-Client), `02.auth.ts`, `utils/sessionAccount.ts` (Anmelde-Merker), `communityHandoff.ts` (zweimal), `embed-handoff.post.ts`, `apps/control/server/middleware/docs-guard.ts` | `git grep sessionCookieName` |
| Wo es geschrieben wird | sechs Stellen: Anmelden, Registrieren, Code, Google, Host-Wechsel, Einbettung | dieselbe Suche, `setSessionCookie(` |
| Live-Verbindung | der Browser holt ein Appwrite-Token für 15 Minuten; es gilt fürs ganze Konto | `realtime-token.get.ts` |
| Kundendomain | ein Host wie jeder andere; die Pukalani-Adresse leitet vollständig dorthin um | `00.tenant.ts` (kanonischer Host), [EIGENE-DOMAIN.md](../referenz/EIGENE-DOMAIN.md) |
| Übergangsregel | eigene Domains nur mit Freigabe des Betreibers und nicht in der Testphase; nach Plan-Ende 14 Tage Frist | EIGENE-DOMAIN.md („Übergang bis zum Vorhaben Pukalani-Konto"), `customDomainService.ts` |
| Kontoweite Routen | Passwort, Zwei-Faktor, Sitzungen, Export, Löschung, `/api/admin/**`, Community-Wechsel antworten auch auf einer Kundendomain | PUKALANI-KONTO.md § 2.6 |

Heute ist kein Kunde betroffen: Die einzige aktive eigene Domain gehört dem
Betreiber, und neue Domains gehen nur über die Freigabe. Mit der ersten
freigegebenen Kundendomain wird der Fund scharf.

## 3. Was sich ändert

**Für Mitglieder**

- Einmal neu anmelden, wenn E1 live geht (Davids Entscheidung, Gesamtkonzept
  § 8: „Einmalige Abmeldung aller").
- Die Formulare bleiben, wo sie sind — die Anmeldung zieht erst in E2 an die
  zentrale Stelle.
- „Abmelden" auf Community X beendet nur X. Wer auf Y angemeldet ist, bleibt
  es. „Überall abmelden" gibt es im Kundenbereich (`account.pukalani.app`,
  Geräte-Liste).
- Der Wechsel aus dem Kundenbereich in eine Community bleibt ein Klick; dabei
  entsteht eine **neue** Karte statt einer Kopie.
- **Unter einer Kundendomain:** lesen, schreiben, moderieren wie bisher. Konto-
  Einstellungen, Geräte, Export, Löschung und der Wechsel in andere Communities
  sind dort nicht mehr zu sehen; ein Hinweis verlinkt auf
  `account.pukalani.app`.
- Die Live-Verbindung unter einer Kundendomain ändert sich je nach
  Entscheidung 4 (§ 12): Neues kommt dann im Takt statt sofort.

**Für Owner**

- Verwalten (Dashboard, Team, Einstellungen, Plan) geht nur noch unter der
  Pukalani-Adresse der Community (`<name>.pukalani.app`). Die Umleitung auf die
  Kundendomain bekommt für das Dashboard eine Ausnahme.
- Der Weg dorthin führt über den Kundenbereich („Meine Communities" →
  „Öffnen"), **nicht** über einen Sprung von der Kundendomain aus. Sonst
  könnte eine abgegriffene Karte der Kundendomain sich selbst zur
  Verwaltungs-Karte machen.
- Ist die Übergangsregel aufgehoben (Entscheidung 6), braucht eine eigene
  Domain keine Betreiber-Freigabe mehr.

**Für den Betreiber:** nichts Sichtbares. Die Konsole (`admin`) behält ihre
eigenen Konten (Davids Entscheidung Nr. 10); ob ihr Cookie ebenfalls den
Umschlag bekommt, ist Entscheidung 2.

## 4. Der Schnitt der fünf Etappen — und warum diese die erste ist

| # | Etappe | Kurz |
| --- | --- | --- |
| E0 | Beweis im Kleinen | lokal zeigen, dass die Karte trägt; offene Technik-Fragen klären (§ 7) |
| **E1** | **Eintrittskarte je Seite (Pool)** | **dieses Dokument** |
| E2 | Zentrale Anmeldung | Formulare nur noch auf `account.pukalani.app`; Heikles nur dort |
| E3 | Beitritt mit Zustimmung, „Verbunden mit", Vorlieben je Seite | sichtbares Ja, Liste aller Verbindungen |
| E4 | Verbundene Dienste | branding.supply, dann pukalani.studio |
| E5 | Aufräumen | alte Wege weg, Doku, Hilfe |

**Warum E1 zuerst:**

1. **Sie schließt das einzige Sicherheitsloch** des Vorhabens (SEC-022). Alle
   anderen Etappen bringen Komfort und Ordnung; diese bringt Schutz.
2. **Sie ist die Grundlage für E2.** Die zentrale Anmeldung stellt am Ende
   eine Karte für die Seite aus — dafür muss es die Karte geben.
3. **Sie ändert nur, was im Cookie liegt.** Formulare, Wege und Texte bleiben.
   Das macht sie einzeln ausrollbar und einzeln rückholbar.
4. **Sie hebt die Übergangsregel auf**, die heute jede eigene Domain an eine
   Hand-Freigabe bindet — und macht die eigene Domain damit als Leistung des
   Plans Pro erst richtig verkaufbar.

E0 läuft **innerhalb** dieser Etappe als erster Schritt: Der Beweis klärt die
Fragen aus § 7, bevor eine Zeile am echten Anmeldeweg geändert wird.

## 5. Die Lösung — drei Varianten

Alle drei teilen den Grundsatz aus SEC-022: **Auf einem Host, dessen Adresse
nicht uns gehört, liegt nie ein Wert, der woanders gilt.**

### Variante A — Versiegelter Umschlag um eine eigene Sitzung je Seite (Empfehlung)

- **Was im Cookie liegt:** ein Umschlag, den nur unser Server öffnen kann
  (AES-GCM, wie das Siegel beim Host-Wechsel, aber ohne 60-s-Frist). Darin:
  das Appwrite-Geheimnis, die Sitzungs-Id, der Host, die Community-Id, das
  Ablaufdatum.
- **Was der Server prüft, bei jeder Anfrage:** Host im Umschlag = Host der
  Anfrage, und Community im Umschlag = Community, zu der der Host **jetzt**
  gehört (die Auflösung in `00.tenant.ts` gibt es schon). Passt eins nicht, ist
  die Karte ungültig. Damit verfällt jede Karte einer Kundendomain von selbst,
  sobald die Domain nicht mehr zur Community gehört — ohne Lauf und ohne
  Tabelle.
- **Eigene Sitzung je Seite:** Beim Host-Wechsel entsteht eine neue
  Appwrite-Sitzung (`users.createToken` → `account.createSession`) statt einer
  Kopie. Abmelden löscht genau diese Sitzung.
- **Ein Lesepunkt:** Die sieben Lese-Stellen gehen über **eine** neue Hilfe
  („Geheimnis der Anfrage"), die sechs Schreib-Stellen über `setSessionCookie`,
  das den Umschlag baut. Ein Wächter-Test verbietet `getCookie` auf den
  Sitzungs-Namen außerhalb dieser Hilfe.
- **Unter Kundendomains** zusätzlich eine Sperrliste: kontoweite Routen
  (Passwort, E-Mail, Zwei-Faktor, Sitzungen, Export, Löschung), `/api/admin/**`,
  Community-Wechsel und die Sprünge zu Kontroll-Hosts antworten dort `404`.
  Das Token der Live-Verbindung siehe Entscheidung 4.
- **Datenbank:** keine neue Tabelle, keine Migration.
- **Aufwand:** L (drei Sessions, § 11).

### Variante B — Kartennummer und Kartei auf dem Server

- Im Cookie liegt nur eine Zufallsnummer. Eine Tabelle hält Nummer, Konto,
  Host, Community und das (verschlüsselte) Appwrite-Geheimnis.
- **Vorteil:** Jede Karte lässt sich einzeln und sofort sperren, auch ohne
  Appwrite; eine Liste „wo bin ich angemeldet" je Seite ist geschenkt.
- **Nachteile:** Eine neue Tabelle mit den heikelsten Werten des Hauses. Der
  Core besitzt keine Tabellen (CLAUDE.md, A14) — der Lesepunkt jeder Anfrage
  hinge an einem Produkt-Layer. Eine Datenbank-Abfrage mehr je Anfrage, eine
  Migration auf Production, ein Fristen-Lauf zum Aufräumen. Fällt die Tabelle
  aus, ist niemand mehr angemeldet.
- **Aufwand:** L–XL.

### Variante C — Nur Kundendomains versiegeln, sonst alles wie heute

- Der Umschlag aus A, aber nur auf Kundendomains; dort auch die Sperrliste.
  Die Sitzung wird weiter kopiert, Abmelden wirkt weiter überall.
- **Vorteil:** klein (S–M), schließt SEC-022 allein.
- **Nachteile:** Erfüllt die Anforderung „eine Seite, eine Sitzung" nicht und
  auch nicht „Abmelden wirkt je Seite". E2 müsste den Rest von A ohnehin
  nachbauen — zwei Formate im Cookie für längere Zeit.
- **Wann sinnvoll:** nur als Notbremse, falls ein Kunde eine eigene Domain
  braucht, bevor A fertig ist. Die Übergangsregel deckt diesen Fall heute ab.

**Empfehlung: Variante A.** Sie trifft das Ziel der Etappe ganz, braucht keine
Tabelle und keine Migration und baut auf einem Siegel auf, das seit Monaten
läuft. B kauft die Einzelsperre teuer ein; dieselbe Wirkung hat A über das
Löschen der Appwrite-Sitzung. C ist eine Teilmenge von A.

## 6. Was an Datenbank, Env und Server nötig wäre

Jeder Punkt mit „**Klick**" braucht Davids ausdrückliches Ja in der bauenden
Session.

| # | Was | Wo | Klick? |
| --- | --- | --- | --- |
| 1 | **Keine Migration** (Variante A). Bei Variante B: eine neue Tabelle samt Migration auf Production. | — | bei B **Klick** |
| 2 | **Eigener Schlüssel für den Umschlag** als Env-Wert (Name im Bau festgelegt, z. B. `NUXT_SITE_CARD_KEY`), je App, die den Umschlag nutzt — alternativ abgeleitet vom Server-Schlüssel (Entscheidung 3). | `.env` der Apps auf Production und in der CI | **Klick** (Env auf Production) |
| 3 | **Sitzungs-Obergrenze** im Projekt `account` prüfen und ggf. anheben (Appwrite: Standard 10, höchstens 100). Mit einer Sitzung je Seite reichen 10 bei Menschen mit vielen Communities nicht; Appwrite löscht dann die älteste — der Mensch fliegt woanders raus. Zahl aus E0. | Appwrite-Konsole, Projekt `account` | **Klick** (Projekt-Einstellung) |
| 4 | **Einmal alle abmelden** — passiert von selbst, wenn das neue Format scharf geschaltet wird; zusätzlich die alten, kopierten Sitzungen beenden, damit kein altes Geheimnis weiter gilt (Lauf über alle Konten, `users.deleteSessions`). | Production, Projekt `account` | **Klick** (Daten auf Production) |
| 5 | **Schalter für das Schreib-Format** (Rückweg, § 8) als Wert in `app.config.ts` — kein Env, kein Server. | Code | nein |
| 6 | **nginx, TLS, DNS:** nichts. | — | nein |
| 7 | **Übergangsregel aufheben** (Freigabe-Pflicht für eigene Domains) — eine Code-Änderung, aber mit Wirkung auf Kundschaft. | Code + EIGENE-DOMAIN.md | **Klick** (Entscheidung 6) |

Die lokale Appwrite und die der CI bekommen dieselben Werte über die bekannten
Wege; das Anheben der Obergrenze dort ist lokal und ohne Klick.

## 7. Was der Beweis E0 vorher klären muss

E0 ist der erste Schritt dieser Etappe und ändert nichts am echten
Anmeldeweg. Er beantwortet:

1. **Eigene Sitzung je Seite:** Liefert `users.createToken` →
   `account.createSession` eine Sitzung, die `account.get()` besteht — auch
   bei Konten mit Zwei-Faktor? Gilt sie für `requireRecentAuth` als frisch?
2. **Obergrenze:** Was tut Appwrite 2.7.4 genau bei der elften Sitzung, und
   welche Zahl brauchen wir (heute: Anzahl Communities je Konto zählen, lokal
   im Spiegel)?
3. **Kosten je Anfrage:** Bleibt es bei einem Appwrite-Aufruf je Anfrage
   (Anmelde-Merker Q12), wenn Host und Community aus dem Umschlag kommen?
4. **Live-Verbindung unter einer Kundendomain:** Taktabfrage (wie die
   Anwesenheit, 20 s) gegen kurzes Token messen — Last und Gefühl.
5. **Einbettung:** Der Popup-Weg (`embed-handoff`, `embed-session`, Cookie
   `partitioned`) mit Umschlag — trägt er weiter?
6. **Gegenprobe aus SEC-022:** Der Wert des Cookies einer (lokal gestellten)
   Kundendomain, an die Appwrite-API oder als Cookie an einen anderen Host
   geschickt, wird abgewiesen — vorher angenommen.

Ergebnis von E0: eine kurze Notiz im Abschnitt § 13 dieses Dokuments und die
Zahl für die Obergrenze.

**Nicht Teil von E1:** das direkte Lesen mit dem Token der Live-Verbindung auf
Adressen, die uns gehören (SV1 (c), Gesamtkonzept § 9 Punkt 1). Unter
Kundendomains löst E1 es über Entscheidung 4; auf `*.pukalani.app` bleibt es
das bekannte Restrisiko und gehört zu E2/E3.

## 8. Wie man zurückgeht

Ausgerollt wird in **zwei** Schritten, damit der Rückweg ein Schalter ist:

1. **Lesen beider Formate** (ohne sichtbare Wirkung): Der Lesepunkt versteht
   Umschlag **und** Klartext. Ausnahme: Auf einer Kundendomain gilt nur der
   Umschlag. Geschrieben wird weiter Klartext.
2. **Schreiben im Umschlag** über den Schalter in `app.config.ts`. Ab hier
   bekommt jede neue Anmeldung eine Karte; alte Klartext-Cookies laufen beim
   nächsten Anmelden aus. Dann der einmalige Abmelde-Lauf (§ 6, Punkt 4).

**Rückweg nach Schritt 2:** Schalter zurück, ausliefern. Der Lesepunkt versteht
die Karten weiter — niemand fliegt raus. **Rückweg nach dem Abmelde-Lauf:**
wie oben; abgemeldet ist abgemeldet, das lässt sich nicht zurückholen und ist
auch nicht nötig. **Ganz zurück** (Code zurücksetzen): Karten sind dann
unlesbar, alle müssen sich einmal neu anmelden. Kein Datenverlust.

Der Klartext-Leser fällt in E5 weg.

## 9. Wie man es beweist

**Lokal (Worktree, eigene Ports):**

- Unit-Tests für Umschlag (falscher Host, falsche Community, abgelaufen,
  manipuliert ⇒ ungültig), Lesepunkt und Wächter-Test („kein `getCookie` auf
  den Sitzungs-Namen außerhalb des Lesepunkts").
- Rollen-Tests (OPS-009) für die Sperrliste: auf einem Kundendomain-Host
  antworten die kontoweiten Routen `404`, auf `*.pukalani.app` wie bisher.
- Gegenprobe aus SEC-022 mit zwei lokalen Hosts (§ 7 Punkt 6).

**Auf der Bühne** (`pnpm buehne up`, Communities kunde-a und kunde-b, eine
davon mit gestellter eigener Domain):

- Anmelden auf kunde-a, Wechsel nach kunde-b über den Kundenbereich ⇒ zwei
  verschiedene Sitzungen in der Geräte-Liste.
- Abmelden auf kunde-a ⇒ kunde-b bleibt angemeldet.
- Cookie von kunde-a auf kunde-b gesetzt ⇒ nicht angemeldet.
- Domain von kunde-b abgeschaltet ⇒ die Karte dieser Domain ist sofort
  ungültig.
- Playwright-Lauf der Anmelde- und Dashboard-Pfade (`--reporter=dot`).

**Live (nach dem Ausliefern, von außen):**

- `curl https://<host>/api/health` → `.build` = Spitze von `main`, `ok`.
- Klick-Probe in Davids Browser (neu in KR1): auf `demo.pukalani.app`
  anmelden, den Cookie-Wert in den Entwickler-Werkzeugen ansehen (Umschlag
  statt Appwrite-Geheimnis), auf einer zweiten Community anmelden, auf der
  ersten abmelden ⇒ die zweite bleibt.
- Auf Davids eigener Community mit eigener Domain: Konto-Einstellungen sind
  dort nicht zu sehen; das Dashboard öffnet sich unter der Pukalani-Adresse.

## 10. Risiken

| Risiko | Gegenmittel |
| --- | --- |
| Die Anmeldung ist das Tor für alles — ein Fehler sperrt alle aus. | Zwei Schritte mit Schalter (§ 8); Bühne vor Production; Klick-Probe direkt nach dem Ausliefern. |
| Die Sitzungs-Obergrenze wirft Menschen mit vielen Communities raus. | Zahl aus E0; Obergrenze vor Schritt 2 anheben (Klick). |
| Schlüssel des Umschlags geht verloren oder wird getauscht ⇒ alle abgemeldet. | Eigener Env-Wert, im Backup der App-Einstellungen (N11); Tausch ist ein bewusster Schritt, kein Nebeneffekt. |
| Ein vergessener Lesepunkt liest weiter Klartext. | Wächter-Test über alle `getCookie`-Aufrufe auf den Sitzungs-Namen. |
| Die Sperrliste unter Kundendomains vergisst eine kontoweite Route. | Umgekehrt bauen: unter Kundendomains nur die Präfixe der Community-Produkte erlaubt (aus den Manifesten), alles andere `404`; Wächter-Test über alle Routen. |
| Owner suchen das Dashboard auf der Kundendomain. | Knopf „Verwalten" führt zum Kundenbereich; Hilfe-Text in E5, Kurzhinweis schon in E1. |
| Live-Verbindung unter Kundendomains fühlt sich langsamer an. | Entscheidung 4; Messung in E0. |
| Einbettung (Kommentare auf fremden Seiten) bricht. | eigener Punkt in E0; Einbettungs-E2E vor dem Ausliefern. |

## 11. Grobe Größe

| Schritt | Inhalt | Sessions |
| --- | --- | --- |
| E0 | Beweis lokal, Zahlen, Notiz | 1 |
| E1a | Umschlag, Lesepunkt, Wächter, Lesen beider Formate (Schritt 1) | 1 |
| E1b | neue Karte beim Host-Wechsel, Abmelden je Seite, Sperrliste und Dashboard-Ausnahme unter Kundendomains, Rollen-Tests | 1 |
| E1c | Bühne, Schreib-Schalter, Klicks (Schlüssel, Obergrenze, Abmelde-Lauf), Live-Beweis, Doku | 1 |

**Zusammen etwa 4 Sessions** (Größe L), jede mit eigenem Pull Request.

## 12. Entscheidungen für David

Bereits entschieden und hier nicht neu gefragt: der Weg (a), die einmalige
Abmeldung aller, „mitmachen ja, verwalten nein" unter Kundendomains, die
Konsole mit eigenen Konten (Gesamtkonzept § 10).

| # | Frage | Empfehlung | Folge |
| --- | --- | --- | --- |
| 1 | Welche Variante für die Karte? | **A — Umschlag um eine eigene Sitzung je Seite.** | Keine Tabelle, keine Migration; Einzelsperre über das Löschen der Appwrite-Sitzung. B kostet eine Tabelle mit Geheimnissen, C nur einen Teil des Ziels. |
| 2 | Gilt der Umschlag nur im Pool oder in allen Apps (auch branding.supply, pukalani.studio, Konsole)? | **In allen Apps** — ein Weg im Core, ein Wächter. | Auch auf branding.supply und in der Konsole einmal neu anmelden. Die eigene Sitzung je Seite gibt es trotzdem nur im Pool; die Silos haben je nur eine Seite. |
| 3 | Woher kommt der Schlüssel des Umschlags? | **Eigener Env-Wert je App.** | Ein Klick je App auf Production; dafür kann der Appwrite-Schlüssel getauscht werden, ohne alle abzumelden. Abgeleitet vom Server-Schlüssel wäre ohne Klick, koppelt aber beides. |
| 4 | Live-Verbindung unter einer Kundendomain? | **Dort aus, Neues im Takt (20 s) über unseren Server.** | Kein kontoweites Token unter einer fremden Adresse. Unter `*.pukalani.app` bleibt sie live. Endgültig nach der Messung in E0. |
| 5 | Darf die bauende Session die Sitzungs-Obergrenze im Projekt `account` anheben, sobald E0 die Zahl liefert? | **Ja, auf die gemessene Zahl mit Abstand (Vorschlag 50).** | Ein Klick in der Appwrite-Konsole; ohne ihn fliegen Menschen mit vielen Communities raus. |
| 6 | Fällt die Freigabe-Pflicht für eigene Domains, wenn E1 live ist? | **Ja; die Sperre in der Testphase bleibt.** | Owner mit Plan Pro schalten eigene Domains selbst frei; die Hand-Freigabe des Betreibers entfällt. EIGENE-DOMAIN.md wird angepasst. |

## 13. Ergebnis von E0

Noch nicht gelaufen.
