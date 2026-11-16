# Offene Punkte

**Stand: 39 offen · 2 geparkt/wartend · 16 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

Stand: **2026-11-16**. Hier steht **nur, was noch offen ist** — in der
Reihenfolge, in der es abgearbeitet wird. Alles Erledigte (mit Begründung,
Beweis und den gelernten Lektionen) steht final in
**[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)**.
**Pflege-Regel (David, 2026-07-30):** diese Datei kurz halten — pro Eintrag
höchstens drei Zeilen, Einzelheiten leben im verlinkten Plan oder im Anhang,
und Erledigtes zieht **sofort** nach COMPLETE um.

Legende — **Prio:** Hoch / Mittel / Niedrig ·
**Aufwand:** S (Stunden) · M (ein Tag) · L (mehrere Tage) · XL (Woche+) ·
**Braucht David?** Nein = ich mache es allein.
Jeder Eintrag hat ein **Kürzel**; Verweise nennen das Kürzel, keine Nummer.

## ✅ Jetzt dran — in dieser Reihenfolge

Sechs Schritte (Davids Ordnung vom 2026-11-16). Was zusammen gebaut wird,
steht zusammen; bei jedem Eintrag steht, **worauf er wartet**.

### Schritt 1 — Entscheidungen (getroffen am 2026-11-16)

Alle 16 stehen im [DECISION-LOG](DECISION-LOG.md) (2026-11-16) und in den
Einträgen unten; diese sagen jetzt, was zu bauen ist. Kurzfassung:
**AL1** Aktivitätsliste mit Konto-Ereignissen füllen · **KE3** Aufräum-Lauf
für Profilbilder ohne Profil · **KU1** „kostenlos" und „Mitglieder" werden
eine Zugangsart; Kurs-Vorschauen bleiben auffindbar (geschlossen) · **MM1**
Likes unter geschlossenen Themen sperren; Übersetzen nur für Mitglieder ·
**RW1** kein Notweg ohne GitHub, vier Stände reichen (beide geschlossen) ·
**BU1** Backup-Schlüssel bleibt in Davids zwei Passwort-Managern, keine zweite
Person (geschlossen); Einstellungs-Dateien ins Backup · **AR1** erledigte
Umzugs-Anleitungen ins Archiv · **IN1** Marken-Seiten durch dieselbe Prüfung
wie Artikel · **MG1** Datenbank-Rückstand melden, nicht aufhalten
(geschlossen) · **PB1** Migrations-Schlüssel dürfen Dateilisten lesen ·
**CI1** Dependabot 155 bis 157 übernehmen (erledigt) · **AB1** und **P29**
beide Server-Einstellungen einschalten.

### Schritt 2 — Davids Klick-Runde auf den echten Seiten

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| KR1 | **Eine Sitzung, ein Test-Konto: alle offenen Klick-Proben am Stück.** Acht Proben aus AB1, PB1, MM1, SI1, SR1, KI1, RU1 und die Anmelde-Mail aus P29. Die Einzel-Einträge verweisen hierher. **Wartet auf:** nichts, nur auf Davids Zeit. | Mittel | S (eine Sitzung) | **Ja: selbst klicken** | [Liste](#kr1) |

### Schritt 3 — Baut Claude allein

**Zuerst (vor Stripe live):**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| SC2 | **Den Stripe-Test-Treiber auf die heutigen Projekte umstellen.** `a2a-checkout-driver.mjs` spricht noch die gelöschten Projekte `pool`/`control`; umstellen auf `account`/`admin` und über Env auch lokal fahrbar machen. Derselbe Treiber stand auch in MG1 (c). **Wartet auf:** nichts; muss vor A2 fertig sein. | Mittel | S | Nein (Prod-Probe nur mit Davids Ja) | [STRIPE-TEST-WALKTHROUGH.md § Durchlauf 2026-11-12](runbooks/STRIPE-TEST-WALKTHROUGH.md) |

**Bündel „Ausliefern und Rückweg":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| CI1 | **Ausliefer-Weg: Nacharbeiten.** (a) Wächter-Zugang auf dem App-Server auf feste Befehle begrenzen, (b) Ausliefern über ein festes Skript, (c) Kleinigkeiten. **Wartet auf:** nichts. | Niedrig | M je Teil, (c) S | Nein (außer ein Klick je Site in Ploi) | [Einzelheiten](#ci1) |
| RW1 | **Rückweg: Nacharbeiten.** Nur noch Kleinigkeiten: ein manueller Start mit dem laufenden Stand, die Übung an einer App mit Datenbank wiederholen. **Wartet auf:** CI1 (b), weil das feste Skript beide Wege zusammenführt. | Niedrig | S | Nein | [Einzelheiten](#rw1) |
| MG1 | **Migrationen: Nacharbeiten.** (b) Ein Test des Rückweg-Skripts war auf `main` einmal ohne Grund rot (beobachten), (c) drei Kleinigkeiten. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#mg1) |

**Bündel „Mails und Bremsen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| AB1 | **Anmelde-Bremse: Nacharbeiten.** (b) gemeinsamer Zähler für branding.supply einschalten (entschieden) und in die Pflichtliste des Wächters, (c) Uploads prüfen die Größe vor dem Einlesen, (d) zwei Fehlerwege trennen, (e) Mails je Empfänger begrenzen, (f) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** (b) Davids Ja am Tag der Umsetzung. | Mittel | S je Teil | **Ja: (b) Server-Einstellung** | [Einzelheiten](#ab1) |
| SR1 | **Kleine Sicherheitsriegel: Nacharbeiten.** (c) dieselbe Grenze je Empfänger für Code- und Reset-Mails (zusammen mit AB1 e), (d) Kleinigkeiten. Klick-Probe (a): KR1; Datenschutztext (b): DT1. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#sr1) |

**Bündel „Fristen und Löschen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| EL1 | **Export und Löschung: Nacharbeiten.** (c) Fristen für Einträge ohne Konto bauen (entschieden 2026-11-15: Warteliste 30/90 Tage/12 Monate, Erstgespräch und Protokoll 12 Monate), (d) Kleinigkeiten. Datenschutztexte (b): DT1. **Wartet auf:** nichts. | Niedrig | (c) M, (d) S | Nein | [Einzelheiten](#el1) |
| WH1 | **Gelöschte Marke zurückholen (Papierkorb)** auf branding.supply: Knopf „Marke löschen", 90 Tage unter „Gelöschte Marken", danach endgültig weg. Konten bleiben vorerst nicht zurückholbar (kommt mit PK1). **Wartet auf:** Davids Freigabe des Prototyps. | Mittel | M | **Ja: Prototyp freigeben, Lauf scharf schalten** | [Plan](plans/WIEDERHERSTELLUNG.md) |
| RU1 | **Runner: Nacharbeiten.** (b) Den Auftragstext baut weiter der Browser, (c) Lauf-Zeilen und Anhänge haben keine Frist, (d) alte Tickets bleiben „ungeprüft", (e) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#ru1) |

**Umsetzung der Entscheidungen aus Schritt 1:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| AL1 | **Aktivitätsliste in der Admin-Nutzeransicht füllen** (entschieden: nicht entfernen). Quelle sind die vorhandenen Konto-Ereignisse (`readAccountEvents`, Core); für die Betreiber-Sicht die Aktionsliste erweitern. **Wartet auf:** nichts. | Niedrig | S | Nein | `packages/admin/server/api/admin/users/[id]/index.get.ts` |
| KE3 | **Aufräum-Lauf für Profilbilder ohne Profil** (entschieden). Heute bleibt ein hochgeladenes Bild liegen, wenn das Speichern danach scheitert. Kein Leck, aber Ablage-Müll. **Wartet auf:** nichts. | Niedrig | S | Nein | `packages/core/server/api/storage/[bucket]/index.post.ts` |
| KU1 | **Kurse: Nacharbeiten.** (b) „kostenlos" und „Mitglieder" zu einer Zugangsart zusammenlegen (entschieden), (c) Hinweis am Übersetzen-Knopf für Nicht-Mitglieder (zusammen mit MM1 d), (e) Kleinigkeiten. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#ku1) |
| MM1 | **Mitmachen nur für Mitglieder: Nacharbeiten.** (b) Benachrichtigungen an entfernte Personen prüfen, (c) Likes unter geschlossenen Themen sperren (entschieden), (d) Übersetzen nur für Mitglieder (entschieden), (e) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#mm1) |
| IN1 | **Insights-Redaktion: Nacharbeiten.** (c) Marken-Seiten laufen durch dieselbe Prüfung wie Artikel (entschieden), (a) KI-Prüfung als eigener Knopf (Davids Wunsch, bewusst später), (d) Kleinigkeiten. Klick-Probe (b) nach BI5. **Wartet auf:** (a) Davids Startwort. | Niedrig | S bis M je Teil | **Ja: (a) Startwort** | [Einzelheiten](#in1) |
| PB1 | **Profilbild-Ablage: Nacharbeiten.** (b) Migrations-Schlüssel angleichen und Dateilisten lesen lassen (entschieden: nur lesen), (c) ein voller Lauf des Migrations-Runners baut an drei Tabellen um, (d) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** (b) Davids Ja am Tag der Schlüssel-Änderung. | Mittel | S je Teil, (c) M | **Ja: (b) Schlüssel auf Production** | [Einzelheiten](#pb1) |
| BU1 | **Backup der Datenbank: Nacharbeiten** (hieß bis 2026-11-16 ebenfalls BK1). (b) Einstellungs-Dateien der Apps verschlüsselt ins nächtliche Backup (entschieden), (c) Übung jährlich wiederholen, (d) Kleinigkeiten. **Wartet auf:** nichts. | Mittel | je Teil S | Nein | [Einzelheiten](#bu1) |
| P29 | **Anmelde-Regeln auf Production: Reste.** Prüfung auf gestohlene Passwörter am Appwrite-Server einschalten (entschieden), je Projekt ein Schlüssel mit `policies`-Recht für den Skript-Lauf. Anmelde-Mail ansehen: KR1; Cookie-Satz: DT1. **Wartet auf:** Davids Ja am Tag der Umsetzung. | Mittel | S | **Ja: Server-Einstellung, Schlüssel** | [ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md) |

**Weitere Nacharbeiten:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| WA1 | **Alarm in die App hinein: Nacharbeiten.** Seit 2026-11-16 zählt der tägliche Wächter Fehler, Zeit-Läufe und KI-Ausfälle (COMPLETE „GA1 P22"). (a) Nach einer Woche Zahlen die Schwellen scharf stellen, die heute nur zählen, (b) `NUXT_REDIS_URL` auf branding.supply setzen, (c) Speichergrenze je Prozess, (d) Kundendomains aus dem Control Plane lesen, (e) Kleinigkeiten. **Wartet auf:** (a) und (c) auf die Zahlen ab 2026-11-23. | Niedrig | S je Teil, (d) M | **Ja: (b) ein Ja für die Server-Datei** | [Einzelheiten](#wa1) |
| SE1 | **Server-Einstellungen und Schutz-Kopfzeilen: Nacharbeiten.** Seit 2026-11-16 stehen Webserver-Vorlagen und Zeitpläne im Repo, ein täglicher Blick vergleicht sie mit den Servern, und die App sendet die Schutz-Kopfzeilen selbst (COMPLETE „GA1 P23"). Offen: (a) Berichte der Skript-Regel einsammeln und sie scharf stellen, (b) „nur verschlüsselt" auch für Unter-Adressen, (c) Umlauf der pm2-Logs, (d) der Erinnerungs-Lauf kennt gesperrte Communities nicht, (e) Kleinigkeiten und Sicherungen löschen, (f) eigene Domain einer Einzel-Site: einmal an einer echten Mail prüfen. **Wartet auf:** (e) die Sicherungen ab 2026-11-30. | Niedrig | S je Teil, (a) M | Nein | [Einzelheiten](#se1) |
| LL1 | **Lange Läufe: Nacharbeiten.** (a) Der Radar-Knopf hält die Wartezeit des Webservers nur bei kleiner Kanal-Liste ein, (b) weitere lange Wege (Brand-Check, Dokument-Prüfung, Zeichen-Entwürfe) rechnen noch in der Anfrage, (c) Kleinigkeiten. **Wartet auf:** nichts. | Niedrig | S bis M je Teil | Nein | [Einzelheiten](#ll1) |
| WL1 | **Wächter mit eigenen Listen: Nacharbeiten.** Seit 2026-11-16 lesen die Prüfungen ihre Listen aus dem Code (COMPLETE „GA1 P20"). Offen: (a) 37 Einstellungen sind noch nicht bewertet (Pflicht auf dem Server oder nicht?), (b) Vorschaubilder und Sitemap der Galerie folgen dem Not-Aus nicht, (c) eine Adresse des Control Plane liegt außerhalb seines Not-Aus, (d) Kleinigkeiten. **Wartet auf:** (a) ein Ja für den Blick auf die Server-Einstellungen. | Niedrig | S je Teil | **Ja: (a)** | [Einzelheiten](#wl1) |
| SI1 | **Sicherungen: Nacharbeiten.** (b) Was der stündliche Label-Abgleich nicht findet, (c) Lint-Lauf schneller machen, (d) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#si1) |
| KI1 | **KI-Schutz: Nacharbeiten.** (c) Ein per Konsole eingetragenes Modell wird erst beim Aufruf geprüft, (d) Kleinigkeiten. Klick-Probe (a): KR1; Datenschutztexte (b): DT1. **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#ki1) |
| AR1 | **Aufräumen: Nacharbeiten.** (a) Die Adresse `changelog.pukalani.app` bei Cloudflare löschen, (b) Ticket-Kauf: zwei kleine Lücken vor einem Ausrollen, (c) die drei übrigen Umzugs-Anleitungen prüfen, (d) Kleinigkeiten. **Wartet auf:** (a) David. | Niedrig | S je Teil | **Ja: (a) ein Klick bei Cloudflare** | [Einzelheiten](#ar1) |

### Schritt 4 — Ein Anwaltstermin für alles

In EINEN Termin gehören: A1 (Studio und Plattform), BS1 R3, die Namensnennung
aus MV1, die Anwaltsliste aus F7, die Fragen BI1-3/BI1-4 aus BI1, A27 und die
Datenschutz-Sätze, die DT1 sammelt.

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| A1 | **Echte Rechtstexte** für Impressum, Datenschutz und AGB. pukalani.studio ist veröffentlicht; dort offen sind fünf Fragen an den Anwalt. Für pukalani.app stehen die Texte aus (branding.supply: BS1). Direkt danach `pukalani.auth.termsUrl` in `apps/platform` setzen. **Wartet auf:** Anwalt. Schaltet A2 frei. | Hoch | S — Anwalt lesen lassen | **Ja: nur David (Anwalt)** | [Agenda: Studio](#a1-anwalt) · [Agenda: Plattform](#a1-plattform) |
| A27 | **EU-Vertreter nach Art. 27 DSGVO** für branding.supply und pukalani.studio: ob nötig, entscheidet die Anwaltsantwort; die Anbieterliste mit Vergleich liegt vor. **Wartet auf:** Anwalt (BS1 R3). | Mittel | S | **Ja: Wahl + Beauftragung** | [ART-27-VERTRETER-ANBIETER.md](referenz/ART-27-VERTRETER-ANBIETER.md) |
| MV1 | **Marktvergleich — gebaut und live; offen sind Davids Punkte.** (1) Rechts-Check der Namensnennung (sechs Fragen, Archiv Anhang G), (2) Handprüfung der Entwürfe `meta`, (3) alle vier Bibliotheks-Einträge werden um den 2026-12-05 überfällig: neu rechnen und von Hand prüfen. **Wartet auf:** Anwalt (1), David (2). | Mittel | S–M | **Ja: Rechts-Check, Handprüfung** | [archiv/BRAND-MARKTVERGLEICH.md](archiv/BRAND-MARKTVERGLEICH.md) · [Bibliothek](runbooks/MARKTVERGLEICH-BIBLIOTHEK.md) |
| DT1 | **Datenschutztexte nachziehen — ein Durchgang nach dem Termin.** Sammelt die Sätze aus KI1 (b), EL1 (b), SR1 (b), RS1 (Resend, EU-Region), den Cookie-Satz aus P29 und drei alte Text-Stellen, die dem Code widersprechen. **Wartet auf:** Anwalt. | Mittel | S–M | **Ja: Texte freigeben** | [Liste](#dt1) |

### Schritt 5 — Geld-Kette in fester Reihenfolge

**A1 → A2 → BS1 Bezahlweg → Preis für Brand Book & Kit → F7.**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| A2 | **Stripe auf echtes Geld umstellen — über die F55-Seite.** Bei David: Bank-Aktivierung, Steuer-Registrierung, Live-Key eintragen, Portal-Konfiguration; alles andere klickt die Seite. **Wartet auf:** A1 und SC2. Vorbedingung für BS1 Z1. | Hoch | S | **Ja: Bank, Konto, Portal** | [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) · [Notiz](#a2a) |
| BS1 | **branding.supply: Rechtstexte + Bezahlweg.** Offen: R2 (Davids Generator-Texte, dazu der Abschnitt „Reichweitenmessung"), R2c (Plausible einschalten; David legt die Site an, Text vor Schalter), R3 (Anwalt), Z1 (Stripe-Checkout). Impressum und AGB sind noch Gerüst. **Wartet auf:** R3 Anwalt, Z1 nach A2. Vorbedingung fürs Öffnen der Beta. | **Hoch** | M | **Ja: Texte, Anwalt, Preis** | [BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) · [Notiz](#bs1) |
| BK1 | **Brand Book & Kit (Produkt 03).** K0 bis K6 sind gebaut. Offen: K7 (Beispiel + Copy), K8 (Abnahme, Persona-Audit), Davids Blicke auf `brand.md`, Leseansicht und Lieferseite, die Verify-Zusagen 31 bis 33 gegen Production. Der Preis (149 € netto) wird erst mit BS1 Z1 sichtbar. **Wartet auf:** Davids Gates; Preis nach BS1 Z1. | Mittel | L | **Ja: Gates, Abnahme** | [BRAND-BOOK-KIT.md](plans/BRAND-BOOK-KIT.md) |
| F7 | **Bezahlte Communities** — der Owner nimmt Geld von seinen Mitgliedern. Konzept steht, alle vier Entscheidungen sind gefallen (2026-08-15). Offen: die Anwaltsliste (§ 9) und der Bau. **Wartet auf:** Anwalt, dann A2. | Mittel | XL | **Ja: Anwalt (§ 9)** | [F7-PAID-COMMUNITIES-KONZEPT.md](plans/F7-PAID-COMMUNITIES-KONZEPT.md) |

### Schritt 6 — Erster Insights-Artikel

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| BI5 | **Den ersten Insights-Artikel veröffentlichen.** Zu entscheiden: die vier Launch-Entwürfe oder der Video-Entwurf, und ob das Fundstück aus dem Beweis vom 2026-11-09 stehen bleibt. Vorher alle Entwürfe einmal durch „In die Redaktion geben" schicken (IN1 d). Danach fahre ich die Klick-Beweise aus BI2, BI1 und IN1 (b). **Wartet auf:** David. | Mittel | S | **Ja: freigeben + entscheiden** | [KURATION § 20](plans/BRAND-INSIGHTS-KURATION.md) |
| BI2 | **Brand Insights: Kuration.** Alles gebaut und live (K2 bis K7). Offen ist nur der Klick-Beweis der Kommentare unter einem öffentlichen Artikel (Gast mit Bot-Prüfung, Antwort, Meldung, Glocke bei einem Konto ohne Label). **Wartet auf:** BI5. | Mittel | S | Ja: Test-Konto auf Production | [BRAND-INSIGHTS-KURATION.md](plans/BRAND-INSIGHTS-KURATION.md) |
| BI1 | **Brand Insights — redaktioneller Bereich.** I0 bis I5 und I6 Stufe 1 sind gebaut. Offen: Davids Blick auf die Redaktion und die vier Entwürfe, I6 Stufe 2 (fünfzehn weitere Stücke im Wochentakt), Anwaltsantworten BI1-3/BI1-4 (danach Profil, Duell und Ranking freischalten), Newsletter-Schalter nach dem Datenschutztext. **Wartet auf:** BI5, Anwalt, BS1 R2c. | Mittel | L | **Ja: Anwalt, Blick, Plausible-Site** | [BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) · [Notiz](#bi1) |

### Daneben — läuft unabhängig von den sechs Schritten

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| GA1 | **Gesamtaudit 2026-11 läuft.** Die Audit-Sessions arbeiten im privaten Ordner außerhalb des Repos (das Repo ist öffentlich). Danach Synthese, Review mit David, Umsetzung paketweise. **Wartet auf:** Davids Review je Paket. | Mittel | L (viele Sessions) | **Ja: Review der Pakete** | [GESAMTAUDIT.md](runbooks/GESAMTAUDIT.md) |
| BW1 | **Brand-Wizard Phase 1 „Fundament".** Gebaut und live auf branding.supply. Offen: Davids eigener Durchgang (ein Solo-Branding in der Werkstatt), sein Gegenlesen der Solo-Fassungen, und eine Liste kleinerer Reste. **Wartet auf:** David. | Mittel | M (Reste) | **Ja: Durchgang, Gegenlesen** | [BRAND-WIZARD-PHASE-1.md](plans/BRAND-WIZARD-PHASE-1.md) · [Reste](#bw1) |
| W2–W4 | **Studio-Funnel ausbauen.** (a) Die fünf `studio_*`-Goals in Plausible anlegen (nur David), (b) W3 Startseiten-Ausbau (Problem-Spiegel, Vergleichstabelle, Selbst-Selektion), (c) W4 echte Kennzahlen in die Cases. **Wartet auf:** David (Goals, Zahlen). | Mittel | S–M je Paket | **Ja: Goals, Texte, Zahlen** | [STUDIO-ERSTGESPRAECH-FUNNEL.md](plans/STUDIO-ERSTGESPRAECH-FUNNEL.md) |
| RS1 | **Resend besser nutzen.** Die Newsletter-Adresse `mail.branding.supply` steht. Offen: ein eigener Sende-Schlüssel dafür und die Adresse in der Config (erst nötig, wenn der Newsletter aufgeht), DMARC für `branding.supply` (ein Klick bei Cloudflare), später DMARC auf `p=quarantine`. Rechtstext-Satz: DT1. **Wartet auf:** David (Klick, Schlüssel). | Mittel | S | **Ja: Cloudflare, Schlüssel** | [Notiz RS1](#rs1) |

## ⏸️ Geparkt / wartet

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Wartet auf … |
| --- | --- | --- | --- | --- | --- |
| PK1 | **Pukalani-Konto: ein Konto für alle Seiten.** Konzept geschrieben, Davids zehn Entscheidungen sind gefallen (2026-11-12). Fünf Etappen, nichts gebaut; erster Schritt ist der Beweis E0. Daran hängt auch, ob gelöschte **Konten** zurückholbar werden (WH1). | Hoch | XL (5 Etappen) | Ja: Freigabe je Etappe | **das Ende des Gesamtaudits (GA1)** — [PUKALANI-KONTO.md](plans/PUKALANI-KONTO.md) |
| VDB1 | **Semantische Suche mit Appwrite VectorsDB — geprüft 2026-11-06, lohnt jetzt nicht.** Self-hosted braucht es ein zweites Postgres und einen Embedding-Container, die eingebauten Modelle können nur Englisch. [Notiz](#vdb1) | Niedrig | M | Ja: Strategie-Freigabe | ein mehrsprachiges Modell in Appwrite + eine Insights-Basis mit einigen hundert Einträgen |

Die bewusst zurückgestellten Punkte stehen am Ende des Anhangs.

---

<a id="notizen"></a>

## 📎 Anhang: Notizen

Hier steht, was zu einem offenen Punkt gehört, aber in kein Plan-Dokument
passt. Nichts davon ist eine zusätzliche Aufgabenliste — die eine Liste steht
oben.

### So arbeiten wir

Ein Durchgang, immer gleich — das ist die Arbeitsweise, die sich in den
Audit-Wochen bewährt hat:

1. **Griff wählen** — aus der Reihenfolge oben, nicht nach Lust. Ein Paket,
   nicht drei.
2. **Bauen** — bei mehreren unabhängigen Paketen je ein Agent in eigenem
   Worktree; sie committen dort, aber mergen NICHT.
3. **Prüfen, nicht glauben** — jeden Agenten-Befund am Code nachlesen, bevor
   er gemerged wird. Erfahrung: einzelne Meldungen halten der Prüfung nicht
   stand, und ein Agent hat schon Dinge „gefixt", die keine Fehler waren.
4. **Grün herstellen** — `pnpm lint`, `pnpm -r test`, `pnpm typecheck` der
   betroffenen Apps, `pnpm check:manifests`. **Und CI ansehen**
   (`gh run list --branch main --limit 8`), nicht nur die lokale Konsole: der
   E2E-Job war über einen Tag rot, ohne dass es jemand merkte.
5. **Deployen + live nachmessen** — Build-SHA je Host, der konkrete Beweis für
   das Gefixte, `node scripts/ops/verify-tls.mjs`.
6. **Nachtragen** — erledigte Punkte nach
   [OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md) (mit der Zeile
   **Gelernt:**, wenn etwas nicht auf Anhieb ging), bei
   Architektur-Entscheidungen eine Zeile in
   [DECISION-LOG.md](DECISION-LOG.md) und ggf. CLAUDE.md. Dann melden und auf
   David warten (paketweise, kein Dauerlauf).
7. **Entscheidungen als strukturierte Fragen** (Davids Regel, 2026-08-04):
   Braucht ein Punkt eine Entscheidung von David, wird sie NIE als
   Fließtext-Frage versteckt und NIE still defaultet — sondern als
   Auswahl-Frage gestellt: konkrete Optionen, je mit ehrlichem Trade-off,
   die Empfehlung als erste Option und als solche markiert. Mehrere offene
   Entscheidungen werden gesammelt und in einem Rutsch gefragt; die
   Antworten wandern SOFORT ins betroffene Plan-Dokument, ins
   [DECISION-LOG.md](DECISION-LOG.md) und in die Zeile hier. Bewährt bei den
   sieben Discussions-Entscheidungen (§ 3.8): Minuten statt Pendeln.

### Was gerade live ist

**7 Hosts:** **pukalani.app** (Landing, seit 2026-07-27 — Apex proxied über
Cloudflare, braucht am Ursprung KEIN Zertifikat mehr und kann das
Kunden-Wildcard damit nicht mehr überschreiben; TLS-Wächter alle 30 min),
**admin** (Betreiber; `control.pukalani.app` leitet seit AH-4 per 301 weiter,
ploi-Site und Server-Verzeichnis behalten den Altnamen) + **account**
(Kundenbereich + Wizard; my/start leiten seit AH-1 am 2026-08-11 per 301 weiter),
portfolio (comments ist seit F3 am 2026-08-12 eine Pool-Community), **platform** (Multi-Tenant, `*.pukalani.app`-Wildcard —
demo.pukalani.app als erster Pool-Tenant, neue Kundensite = ein Klick im
Control, kein Build), **help.pukalani.app** (Hilfe-Site, seit 2026-07-27) und
die interne Doku unter `admin.pukalani.app/docs`. Auto-Deploy (6 Sites),
Zero-Downtime Stufe 2, Alerting, GDPR, pages-Layer
(/imprint,/terms,/privacy editierbar + Footer-Links). M1–M9 komplett,
Self-Service-Onboarding komplett, **alle sechs Kundenprodukte durch die
Datentür** (comments, posts, pages, moderation, events, courses).
Letztes Release **v4.0.0** (2026-11-07) — seit 2026-11-13 gibt es keinen
Release-Automaten mehr (P07, DECISION-LOG 2026-11-12).

**Dazu seit der Woche 2026-08-04..09:** **eigene Kundendomains** (Pool ab Pro,
Silo je Site) mit `www.pukalani.studio` als erstem echten Fall, **private Nachrichten** (Layer `messages`, ab Personal, ab Werk
ausgeschaltet), **Vertrauensstufen + 22 Abzeichen** in den Diskussionen,
**Handles/Erwähnungen** und die **Stripe-Verwaltung im Control-Dashboard**
(F55). **Seit 2026-08-18 sind freelancer.supply, Morgenlicht und Comments
Demo-Spielwiesen** — 8 Demo-Konten mit Rollen und Inhalte über alle Produkte,
alles über die echten Routen (Werkzeug in `~/.appwrite-secrets/freelancer-demo/`,
Protokoll in [OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)).
**Als Betriebssystem für eigene Sites: ~98 %. Als verkaufbares SaaS: ~85 %.**

### Einzelheiten zu den offenen Punkten

In der Reihenfolge der Schritte oben.

<a id="kr1"></a>

**KR1 — Davids Klick-Runde auf den echten Seiten.** Eine Sitzung, ein
Test-Konto. Was genau zu klicken ist, steht beim jeweiligen Eintrag:

1. **Anmelde-Bremse** — sechsmal ein falsches Passwort, Meldung und Wartezeit
   ansehen ([AB1 a](#ab1)).
2. **Profilbild** — je einmal hochladen auf `admin.pukalani.app`,
   `portfolio.pukalani.app` und `branding.supply` ([PB1 a](#pb1)).
3. **Entferntes Mitglied** — Test-Konto einladen, entfernen, Hinweisseite und
   Nachricht an die Leitung ansehen ([MM1 a](#mm1)).
4. **Einladung und Entziehen** — Einladungslink aus einem Webmail-Fenster
   öffnen; „Zugang entziehen" mit dem Test-Konto ([SI1 a](#si1)).
5. **Formulare von branding.supply** — Erstgespräch und Warteliste je einmal
   abschicken ([SR1 a](#sr1)).
6. **KI-Einschätzung** — als Moderator die Einschätzung zu einer Meldung
   holen ([KI1 a](#ki1)).
7. **Runner** — ein echter Lauf über das Formular mit einem Testbefehl aus
   der Auswahl ([RU1 a](#ru1)).
8. **Anmelde-Mail** — Sprache und Adresse der Mail ansehen (P29,
   [ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md)).

Nicht Teil der Runde, weil sie auf den ersten Artikel warten: die Proben aus
BI2 und IN1 (b), siehe BI5.

<a id="ci1"></a>

**CI1 — Ausliefer-Weg: Nacharbeiten (aus dem Gesamtaudit, Paket P08).**

- **(a) Wächter-Zugang auf dem App-Server enger fassen.** Der
  Wächter-Schlüssel hat dort eine Shell (ohne Terminal und Weiterleitung),
  weil zwei Prüf-Skripte sich selbst hinüberkopieren. Enger ginge es wie auf
  dem Appwrite-Server: feste Worte über ein Tor-Skript, die Prüf-Skripte
  liefert der Deploy mit. Ändert vier Skripte in `scripts/ops/`.
- **(b) Ausliefern über ein festes Skript.** Dasselbe für den
  Ausliefer-Schlüssel: Symlink-Wechsel und `pm2` als ein Skript auf dem
  Server statt freier Befehle. Passt zum Vorhaben „Rückweg bei einer
  schlechten Version".
- **(c) Kleinigkeiten.** Die alten Deploy-Auslöser in Ploi neu erzeugen (die
  Adressen standen nur in den gelöschten Einträgen; ein Klick je Site im
  Panel). Ob die zwei Mails des Probealarms im Postfach lagen, ist nicht
  nachgesehen. Das Tor-Skript auf dem
  Appwrite-Server wird von Hand eingespielt; ein Wächter, der die Datei dort
  mit `ops/appwrite-cert-gate.sh` vergleicht, fehlt.

<a id="rw1"></a>

**RW1 — Rückweg: Nacharbeiten (aus dem Gesamtaudit, Paket P10).**

- **(c) Kleinigkeiten.** Ein manueller Start mit dem Commit, der gerade live
  ist, schreibt in das Verzeichnis des laufenden Prozesses (besser: in ein
  frisches Verzeichnis oder überspringen). Die Übung wiederholen, sobald
  sich am Ausliefer-Weg etwas ändert, und einmal an einer App mit Datenbank
  (`platform`). Der Punkt CI1 (b) „Ausliefern über ein festes Skript" würde
  die Handgriffe von Ausliefern und Rückweg an einer Stelle zusammenführen;
  heute stehen sie zweimal da (Workflow und `ops/rollback.sh`).

<a id="mg1"></a>

**MG1 — Migrationen: Nacharbeiten (aus dem Gesamtaudit, Paket P21).**

- **(b) Ein fremder Test war einmal rot.** Nach dem ersten Merge von P21
  scheiterte auf `main` `packages/core/tests/rollbackScript.test.ts` („legt den
  Verweis um …") mit leerer Ausgabe; im Pull Request und im zweiten Versuch
  war er grün, lokal in 22 Läufen nicht nachstellbar. Das Ausliefern hat
  deshalb einmal nicht gestartet. Verdacht: Last auf dem Runner (P21 bringt
  Tests mit, die viele Prozesse starten). Kommt es wieder: Ausgabe UND
  Exit-Code des Skripts im Test mit ausgeben, dann die Ursache suchen. Gehört
  zu [RW1](#rw1).
- **(c) Kleinigkeiten.** Der veraltete Stripe-Test-Treiber steht in SC2. Die `migrate`-Skripte in den
  `package.json` der Layer rufen den Runner ohne `--app` und scheitern (schon
  vorher). Die Probe je Layer sieht nur Tabellen und Spalten, keine Indizes,
  Rechte oder Daten, und je Layer nur die jüngste ablesbare Stelle; die volle
  Spaltenliste als Soll gehört zu Paket P20 (Wächter erzeugen ihre Listen
  selbst). Die lesenden Schlüssel haben kein Ablaufdatum.

<a id="ab1"></a>

**AB1 — Anmelde-Bremse: Nacharbeiten (aus dem Gesamtaudit, Paket P02).**
Abgeglichen am 2026-11-13 mit dieser Liste, den Audit-Paketen und den laufenden
Sitzungen. Schon woanders eingeplant und deshalb NICHT hier: die Ausnahme für
bekannte Geräte bei einer Konto-Pause (Audit-Paket P29, zugeschnitten), die
Pflicht-Prüfungen vor dem Zusammenführen auf GitHub (Paket P08, erledigt am
2026-11-14) und Laufzeit-Tests über einen echten Community-Host (Paket P27).

- **(a) Klick-Probe auf Live.** Steht in der Klick-Runde ([KR1](#kr1)).
- **(b) Redis für branding.supply — entschieden am 2026-11-16: einschalten.**
  `platform`, `admin` und `portfolio` zählen geteilt in Redis,
  `branding.supply` hat `NUXT_REDIS_URL` nicht; die Zähler beginnen dort bei
  jedem Deploy neu. Eintragen (Server-Einstellung, Davids Ja am Tag der
  Umsetzung) und die Variable in die Pflichtliste von
  `scripts/ops/verify-site-env.mjs` aufnehmen, für alle Sites mit Konten.
- **(c) Größe vor dem Einlesen prüfen.** Favicon-Upload und Event-Titelbild
  lesen die ganze Datei, bevor ihre Grenze greift; der Medien-Upload prüft
  vorher `Content-Length`. Dasselbe Muster übernehmen.
- **(d) Zwei Fehlerwege trennen.** Die Reset-Anforderung antwortet bewusst immer
  gleich, schreibt aber auch dann nichts ins Log, wenn Appwrite die Anfrage aus
  einem Konfigurationsgrund ablehnt (lokal so gesehen: keine Mail, keine Zeile).
  Und Anmeldung und Code-Prüfung werten einen Ausfall von Appwrite wie einen
  Fehlversuch. Beides: den Grund unterscheiden, ins Log schreiben, einen
  Ausfall nicht zählen.
- **(e) Mails je Empfänger.** Code- und Reset-Mails sind je Absender-Adresse und
  insgesamt je Stunde begrenzt, nicht je Empfänger. Eine Grenze je Empfänger
  ergänzen (das Muster steht in `packages/core/server/utils/accountAttempts.ts`).
- **(f) Kleinigkeiten.** `verify-control-exit.mjs` bekommt je Lauf eine eigene
  Absender-Adresse wie `verify-site-authz.mjs` (seit P02 wird die Route gezählt,
  ein zweiter Lauf in derselben Minute kann 429 sehen). Zwei verrutschte
  Kommentare in `05.rate-limit.ts` und ein Testtitel. Der Dev-Server warnt bei
  Node 22.18 (verlangt 22.21 oder neuer).

<a id="sr1"></a>

**SR1 — Kleine Sicherheitsriegel: Nacharbeiten (aus dem Gesamtaudit, Paket P25).**

- **(a) Klick-Probe auf Live.** Auf branding.supply einmal das
  Erstgespräch-Formular und einmal die Warteliste abschicken (eigene Adresse).
  Erwartet: das Feld der Bot-Prüfung erscheint, die Anfrage geht durch, die
  Bestätigung kommt ohne den eigenen Text. Lokal ist beides mit eingeschalteter
  Bot-Prüfung geklickt und gezählt; auf Production wurde nichts abgeschickt.
- **(b) Datenschutztext.** Der Text von branding.supply nennt die Bot-Prüfung
  für Registrierung, Passwort zurücksetzen und Kommentare. Seit 2026-11-15
  steht sie auch am Erstgespräch und an der Warteliste. Zu tun: die zwei
  Formulare im Text ergänzen (`apps/branding/scripts/legalPrivacyInterim.ts`,
  de und en) — Rechtstext, deshalb Davids Freigabe.
- **(c) Dieselbe Grenze für Code- und Reset-Mails.** Der Baustein
  `allowRecipientMail` passt an der Reset-Anforderung in eine Zeile (die
  Antwort ist dort schon für jede Adresse gleich); bei der Code-Anmeldung
  trägt die Antwort Angaben aus dem Vorgang, das ist mehr als eine Zeile.
  Gehört zu [AB1 (e)](#ab1).
- **(d) Kleinigkeiten.** Das Korrektur-Formular der Insights hat weiter nur
  Honigtopf und Drossel (kein Mailversand; Nachbarschaft zum Paket P19). Die
  Redaktions-Formulare der Insights zeigen bei einem abgelehnten Link nur
  die Fehlermeldung des Servers, keinen Hinweis am Feld. Die Liste der
  offenen Einladungen zeigt höchstens 100 und sagt nichts, wenn es mehr sind.
  Die Hinweise der Bot-Prüfung sprechen mit „du", die Formulare von
  branding.supply mit „ihr". Das Prüfskript
  `packages/onboarding/scripts/verify-member-invites.mjs` ist an die neue
  Antwort angepasst, aber nicht gelaufen. Die Meldung an den Betreiber beim
  Erstgespräch hat keine eigene Grenze je Tag (davor stehen Bot-Prüfung und
  Drossel). `packages/core/scripts/verify-session-ip.mjs` ist mit der neuen
  zweiten Adresse nicht gelaufen. Eine Kennung im PFAD einer Adresse bleibt
  im Protokoll stehen (gekürzt werden Query und Fragment).

<a id="el1"></a>

**EL1 — Export und Löschung: Nacharbeiten (aus dem Gesamtaudit, Paket P14).**

- **(b) Datenschutztexte.** Neu und für die Erklärungen wichtig: Die Kopie der
  Daten eines gelöschten Kontos liegt 30 Tage beim Betreiber. Prüfergebnisse
  (Brand Checks) sind nach dem Löschen sofort unsichtbar und werden nach 90
  Tagen endgültig gelöscht; Ergebnisse über öffentliche Websites bleiben ohne
  Bezug zur Person. Die Adresse eines Melders bleibt bis zu 90 Tage, eine
  gemeldete private Nachricht bis zu 90 Tage als Beleg. Im Protokoll
  (`audit_logs`) bleibt die Konto-Id ohne Namen stehen. Ob und wie die
  Erklärungen das sagen, entscheidet David mit dem Anwalt (A1 und BS1;
  gesammelt in [DT1](#dt1)). **Schon nachgezogen (2026-11-15, Davids Auftrag):** der vorläufige
  Text von branding.supply, der Entwurf auf pukalani.app und die Vorlage für
  Communities nennen diese Fristen; die anwaltliche Prüfung steht aus.
  pukalani.studio brauchte keine Änderung (keine Konten, keine Prüfergebnisse).
  Auf branding.supply gibt es KEINE Sicherungskopie (kein Bucket eingetragen),
  der Text nennt dort deshalb keine.
- **(c) Fristen für Einträge ohne Konto bauen.** Entschieden am 2026-11-15
  (DECISION-LOG): Warteliste nie bestätigt 30 Tage, eingeladen oder abgelehnt
  90 Tage, noch wartend spätestens 12 Monate; Erstgespräch-Anfragen
  (branding.supply und pukalani.studio) 12 Monate; Konto-Protokoll 12 Monate.
  Noch zu bauen: je ein stündlicher Lauf nach dem Muster der vorhandenen
  (erst zählen, dann löschen), danach die Datenschutztexte nachziehen.
- **(d) Kleinigkeiten.** Benachrichtigungen zu Kommentaren, die VOR dem
  2026-11-15 entstanden, behalten ihren Textauszug, auch wenn der Kommentar
  gelöscht wird (neue werden mit aufgeräumt); Erinnerungen an einen Termin
  nennen dessen alten Titel. Ein Ausfall eines Laufs steht nur im Log der App
  (der Alarm ist ein eigenes Paket). Die KI-Einordnung von Tickets wertet
  nicht aus, ob die Antwort abgeschnitten wurde. Die Datei-Auslieferung der
  Tickets reicht den gespeicherten Dateityp durch. Wie viele alte Kopien in
  den Projekten `admin`, `branding` und `portfolio` liegen, ließ sich von
  außen nicht zählen (der Lauf der jeweiligen App räumt sie). Das Aufräumen
  fremder Benachrichtigungen gehört als eine Funktion in den Core statt in
  zwei Layer. Referenz: [EXPORT-UND-LOESCHUNG.md](referenz/EXPORT-UND-LOESCHUNG.md).

<a id="ru1"></a>

**RU1 — Runner: Nacharbeiten (aus dem Gesamtaudit, Paket P03).**

- **(a) Ein echter Lauf über das Formular.** Geprüft ist lokal mit einer
  Test-Instanz und einer Agenten-Attrappe, auf Production die Ablehnung am
  echten Dienst. Noch nicht gelaufen: ein Lauf mit echtem Agenten, gestartet im
  Formular, mit einem Testbefehl aus der Auswahl. Dabei auch ansehen: ein
  älteres Ticket zeigt „Ungeprüfter Auftrag" und bietet nur zwei Arbeitsweisen.
- **(b) Den Auftragstext baut der Browser.** Der Server bestimmt aus dem
  Ticket, ob ein Lauf als geprüft gilt; den Text selbst (Titel, Beschreibung,
  offene Checkliste) setzt weiter die Seite zusammen und schickt ihn mit.
  Sauberer wäre, der Server baute ihn aus der Ticket-Zeile.
- **(c) Was keine Frist hat.** Die Zeilen der Läufe (Auftragstext, Bericht)
  und Anhänge von Läufen bleiben liegen; es gibt keinen Löschen-Knopf je Lauf,
  und der Layer hat keinen Beitrag zu Auskunft und Löschung eines Kontos
  (`runs.createdBy`, nur Betreiber-Konten). Auf dem Rechner bleiben die
  Arbeits-Zweige alter Läufe und das Log des Dienstes.
- **(d) Alte Tickets.** Tickets von vor dem 2026-11-14 haben keine Herkunft
  und gelten als ungeprüft (auf Production acht, alle geschlossen). Einen
  Knopf „als geprüft übernehmen" gibt es nicht; der Weg ist ein neues Ticket.
- **(e) Kleinigkeiten.** Ein ungeprüfter Lauf wird vom Dienst weiter
  committet (nur die Testbefehle entfallen). Die Herkunft wird beim Bearbeiten
  gelesen und dann geschrieben, ohne Sperre dazwischen. `extraPath` in der
  Einstellungs-Datei des Dienstes verwirft ungültige Einträge still. Zwei alte
  Läufe mit Rückfrage tragen Testbefehle, die heute nicht in der Liste stehen;
  ihre Fortsetzung wird abgelehnt. Der Schlüssel der Migrations-Ablage für
  `admin` kann weder Dateien noch Konten lesen (siehe PB1).

<a id="ku1"></a>

**KU1 — Kurse: Nacharbeiten (aus dem Gesamtaudit, Paket P04).**
Davids weitere Wünsche zur Kurs-Übersicht (Kategorien, Filter, Sortierung,
„Best seller", einzelne bezahlte Kurse) sind ein eigenes Vorhaben und stehen
NICHT hier.

- **(b) Zugangsarten — entschieden am 2026-11-16: zusammenlegen.**
  „Kostenlos" und „Mitglieder" verlangen beide die Mitgliedschaft und werden
  zu EINER Zugangsart.
- **(c) Übersetzen-Knopf.** Er erscheint für jedes angemeldete Konto; wer kein
  Mitglied ist, bekommt nach dem Klick nur die allgemeine Fehlermeldung.
- **(e) Kleinigkeiten.** `POST /api/lessons/:id/complete` prüft den Status des
  Kurses nicht (Abschluss in einem zurückgezogenen Kurs möglich, Testfall
  übersprungen); ein Kommentar in `packages/courses/tests/redaction-actor.test.ts`
  und der Satz „nur Eingeloggte" oben in
  `docs/content/3.features/6.uebersetzungen.md` sind überholt.

<a id="mm1"></a>

**MM1 — Mitmachen nur für Mitglieder: Nacharbeiten (aus dem Gesamtaudit, Paket P05).**

- **(a) Klick-Probe auf Live, zweiter Teil.** Geklickt ist seit dem
  2026-11-15 das Schreiben als Mitglied (Kommentar, Stimme; zusagen ging
  nicht, die Demo hat keine kommenden Termine). Offen: auf einer Community ein
  Test-Konto einladen, wieder entfernen und mit ihm die Community öffnen:
  Hinweisseite, eine Nachricht an die Leitung (Mail und Glocke beim Owner),
  neue Einladung annehmen. Das braucht Owner und Test-Konto zugleich.
- **(b) Benachrichtigungen an entfernte Personen.** Nicht geprüft ist, ob eine
  entfernte Person weiter Glocken-Einträge und Mails aus dieser Community
  bekommt (Antworten auf alte Kommentare, Sammel-Mail). Die Links führten sie
  nur auf die Hinweisseite.
- **(c) Stimmen unter geschlossenen Themen — entschieden am 2026-11-16:
  sperren.** Kommentieren ist dort zu, Likes und Reaktionen an vorhandenen
  Kommentaren gehen heute weiter; sie werden mit gesperrt.
- **(d) Übersetzen — entschieden am 2026-11-16: nur für Mitglieder der
  Community.** Heute kann jedes angemeldete Konto übersetzen, und die
  Aufrufe zählen auf das Tages-Kontingent der Community. Der Knopf
  verschwindet für Nicht-Mitglieder (dazu KU1 c).
- **(e) Kleinigkeiten.** Eine Zusage zu einem inzwischen ausgeblendeten Termin
  lässt sich nicht mehr zurücknehmen (404). `verify-site-authz.mjs` scheitert
  ab dem dritten Lauf je Stunde an der Stunden-Bremse der Registrierung (eigene
  Test-Adresse je Probe fehlt dort). Der Link in der Mail an die Leitung trägt
  kein Sprach-Präfix. Der E2E-Test `community-removed.spec.ts` läuft nur
  gegen eine lokale Pool-Bühne (Vorhaben „Tests über den echten Kundenpfad").
  Der Kopf von `packages/messages/server/utils/messageGate.ts` sagt, jede
  Schreib-Route rufe eine seiner Funktionen; für Löschen und Gelesen-Markieren
  stimmt das nicht.

<a id="in1"></a>

**IN1 — Insights-Redaktion: Nacharbeiten (aus dem Gesamtaudit, Paket P19).**

- **(a) KI-Prüfung als eigener Knopf.** Davids Wunsch vom 2026-11-12, am
  2026-11-16 bewusst auf später gelegt. Der Knopf liest die aktuelle Fassung
  und meldet, was unstimmig wirkt, was inhaltlich fehlt und wie der Artikel
  für Leser und Suche besser wird. Er sperrt nichts und darf falsch warnen;
  die festen Regeln bleiben die Sperre. Kosten je Klick etwa 1 bis 5 Cent.
  Vorschlag für den Zuschnitt: eigene Route wie der Vorschlag für den
  Änderungshinweis (eigenes Kontingent, schreibt nichts, Ergebnis nur
  angezeigt), langer Lauf ⇒ die Frist am Proxy mitdenken.
- **(b) Klick-Probe auf Live.** Auf Production ist noch kein Artikel
  veröffentlicht (BI5). Danach einmal: einen veröffentlichten Artikel
  regelwidrig ändern (erwartet: „nicht gespeichert", die Seite bleibt), einen
  Hinweis von Hand anlegen, einmal „Vorschlag holen (KI)" klicken. Der Klick
  auf den Vorschlags-Knopf ist auch lokal nicht geklickt, nur die Route
  dahinter gefahren.
- **(c) Marken-Seiten — entschieden am 2026-11-16: dieselbe Prüfung wie
  bei Artikeln.** Eine Marken-Zeile (`insights_brands`) lässt sich heute im
  Formular direkt auf „veröffentlicht" stellen und danach ändern; ihre
  Quellen und Zitate laufen durch keine der Regeln
  (`server/api/insights/brands/[id].patch.ts`). Zu bauen, bevor Profil,
  Duell und Ranking über `publicFormats` freigeschaltet werden.
- **(d) Kleinigkeiten.** Der Kasten der Prüfregeln sagt auch an einem
  veröffentlichten Artikel „der Übergang in die Redaktion ist gesperrt". Die
  drei KI-Wege der Redaktion (Entwurf, Übersetzen, Vorschlag) stehen nicht in
  der Bremsen-Liste des Core, sie bremst nur das Kontingent im Layer. Das
  Datum eines Hinweises ist der Kalendertag in UTC. Ein Artikel, der eine
  heute geltende Regel verletzt (etwa vor Regel 7 veröffentlicht), lässt sich
  erst wieder speichern, wenn er sie erfüllt oder zurückgezogen ist — vor dem
  ersten Veröffentlichen auf Production also einmal alle Entwürfe durch
  „In die Redaktion geben" schicken.

<a id="pb1"></a>

**PB1 — Profilbild-Ablage: Nacharbeiten (aus dem Gesamtaudit, Paket P01).**
Abgeglichen am 2026-11-13 mit dieser Liste, den Audit-Paketen und den laufenden
Sitzungen: an keinem der Punkte unten wird gerade gearbeitet. Schon woanders
eingeplant und deshalb NICHT hier: der Wächter für Rechte an TABELLEN (Paket
P13, „Schreiben nur noch über den Server") und hochgeladene Bilder, die
ohne gespeichertes Profil liegen bleiben (Punkt KE3 oben). Beim Abgleich erledigt: der echte
Upload auf `account.pukalani.app` ist gemessen (COMPLETE „GA1 P01", Beweis h),
und die 9 in der CI übersprungenen E2E-Tests sind die neun Themes aus
`apps/comments/e2e/themes-visual.spec.ts`, die mit Absicht nur lokal laufen.

- **(a) Upload auf den drei anderen Seiten.** Die Upload-Route schreibt seit
  P01 mit dem Laufzeit-Schlüssel der jeweiligen Site. Gemessen ist das im
  Projekt `account`. Auf `admin.pukalani.app`, `portfolio.pukalani.app` und
  `branding.supply` je einmal ein Profilbild hochladen (wo die Seite eines
  anbietet). Scheitert es, fehlt dem Schlüssel dort das Schreibrecht für
  Dateien ([APPWRITE-KEYS.md](runbooks/APPWRITE-KEYS.md)).
- **(b) Schlüssel der Migrations-Envs — entschieden am 2026-11-16: sie
  dürfen Dateilisten lesen (nur lesen).** In drei der vier Dateien steht der
  Schlüssel unter `NUXT_APPWRITE_KEY` statt unter
  `NUXT_APPWRITE_MIGRATIONS_KEY`; jeder Lauf warnt deshalb „Fallback". Und
  drei der vier Schlüssel dürfen keine Dateilisten lesen (`admin`,
  `portfolio`, `branding`). Zu tun: Namen angleichen, das Leserecht
  ergänzen. Das Ändern der Schlüssel auf Production ist ein eigener Schritt
  mit Davids Ja am Tag der Umsetzung.
- **(c) Ein voller Lauf des Runners baut um.** `scripts/migrate.mjs` führt kein
  Register und fährt ohne `--only` jede Migration der App jedes Mal. Im Layer
  `system` legen ältere Migrationen Spalten an, die spätere wieder entfernen
  (`app_config.features`, `app_config.entitlements`, `activities.tenantId`,
  `notifications.tenantId` samt Index) — bei JEDEM vollen Lauf, lokal in allen
  vier Projekten gesehen. Seit GA1 P21 (2026-11-16) gibt es den geprüften Weg
  für EINE Migration: `pnpm migrate --app <app> --env <datei> --only
  <layer>-<NNN> --prod`; damit baut ein Production-Lauf nichts mehr um. Offen
  bleibt der volle Lauf (neues Projekt, lokaler Spiegel). Abhilfe: die
  Anlege-Migrationen prüfen, ob eine spätere die Spalte entfernt hat, oder ein
  Register.
- **(d) Kleinigkeiten.** Die Upload-Route fängt einen Fehler von Appwrite nicht
  ab; er wird zu einer allgemeinen 500 statt zu einer verständlichen Meldung
  (`packages/core/server/api/storage/[bucket]/index.post.ts`). In
  `.claude/rules/tests.md` fehlt der Hinweis, dass `platform.pukalani.app` nur
  `/api/health` beantwortet: eine Live-Probe einer Route gehört auf einen
  Kontroll- oder Community-Host. Und lokal tragen alle vier Projekte die neue
  Ablage: ein Checkout, der älter ist als `8b658900`, kann lokal kein
  Profilbild mehr hochladen (Haupt-Checkout aktualisieren).

<a id="bu1"></a>

**BU1 — Backup der Datenbank: Nacharbeiten (aus dem Gesamtaudit, Paket P11).**

- **(b) Die `.env`-Dateien der Apps — entschieden am 2026-11-16:
  verschlüsselt ins nächtliche Backup.** Sie liegen heute nur auf dem
  App-Server. Darin stehen eigene Schlüssel der Apps, auch die, mit denen
  einzelne Einstellungen in der Datenbank versiegelt sind. Zu bauen: mit
  demselben Schlüssel verschlüsselt mitsichern, dieselbe Box.
- **(c) Übung wiederholen.** Einmal im Jahr und nach jeder Änderung an den
  Skripten (Runbook `APPWRITE-WIEDERHERSTELLUNG.md`, § 7). Noch nie geübt:
  ein voller Start mit allen Diensten, ein echter Ersatz-Server mit Umstellen
  der Adresse, der Abruf von der Storage Box ohne den alten Server.
- **(d) Kleinigkeiten.** Der nächtliche Zeitplan steht nur im crontab auf dem
  Server und als Zeile im Runbook (als Vorlage ins Repo: eigener Punkt des
  Gesamtaudits). Die Backups sind verschlüsselt, aber nicht signiert — wer
  Zugang zur Box hat, könnte einen Lauf ersetzen; dagegen stehen die
  Schnappschüsse und die Zählung beim Zurückspielen. Auf dem Appwrite-Server
  liegen alte Sicherungskopien im Appwrite-Ordner und zwei Volume-Reste ohne
  Eintrag in der Compose-Datei; beides aufräumen. Der Zugang zum Konto beim
  Hoster gehört gehärtet (Einzelheiten privat). Ein Probealarm über
  `backup_drill` trägt im Titel des Issues nicht „(Probealarm)“ — das
  Kennzeichen hängt nur am Schalter `alarm_drill`. Auf dem Appwrite-Server
  liegen die Vorgänger-Fassungen der Skripte als Weg zurück
  (`*.vorher-p11*`); nach zwei ruhigen Wochen löschen.

<a id="wl1"></a>

**WL1 — Wächter mit eigenen Listen: Nacharbeiten (aus dem Gesamtaudit, Paket P20).**

- **(a) 37 Einstellungen ohne Bewertung.** Der Code liest 71 `NUXT_…`-Namen;
  31 sind auf mindestens einer Site Pflicht, vier mit Grund „keine Pflicht",
  37 stehen als Bestand in `ENV_UNDECIDED`
  (`scripts/ops/site-env-decisions.mjs`). Für jeden entscheiden: Pflicht auf
  welcher Site, oder warum nicht. Braucht einen Blick auf die Namen in den
  Server-Dateien (nur Namen, wie der tägliche Wächter) — Davids Ja. Die
  Liste darf nur kürzer werden; der Test hält die Zahl fest.
- **(b) Galerie neben dem Not-Aus.** Die Routen unter `/api/discover` folgen
  seit P20 dem Abschalter von `brand`. Die Vorschaubilder (`/og/…`) und die
  Sitemap von `apps/branding` lesen dieselben Daten direkt und antworten
  weiter. Zu tun: in beiden Routen `isProductEnabled(event, 'brand')` fragen.
- **(c) `/api/platform/entitlements/<projectId>`** gehört dem Control Plane,
  liegt aber im selben Ordner wie eine Core-Route und steht deshalb als
  begründete Ausnahme in `scripts/lib/manifest-routes.mjs`. Zu tun: unter
  `/api/control/…` umziehen — alle Sites rufen die Adresse ab, also erst die
  neue Adresse ausliefern, dann die Abrufer umstellen, dann die alte löschen.
- **(d) Kleinigkeiten.** `check:permissions` hat keinen Test (nur Lauf und
  Gegenprobe); die KI-Aufrufstellen stehen in zwei Scannern
  (`scripts/check-ai-routing.mjs`, `packages/brand/tests/brandAiCallSites.test.ts`);
  der Env-Wächter prüft, ob ein Name in der Server-Datei steht, nicht, ob
  dahinter ein Wert steht; `onboarding` nennt ein `apiPrefixes`-Präfix, das
  nichts bewirkt (Stufe `foundation` ist nicht abschaltbar); das Dashboard
  fragt die Moderations-Liste auch dann ab, wenn `comments` abgeschaltet ist
  (antwortet dann 404, das Feld bleibt leer).

<a id="wa1"></a>

**WA1 — Alarm in die App hinein: Nacharbeiten (aus dem Gesamtaudit, Paket P22).**

- **(a) Schwellen scharf stellen.** Rot wird heute nur, was eindeutig ist
  (Zeit-Lauf überfällig, KI ohne Guthaben oder ohne Endpunkt, Server-Fehler
  auf `platform` ab 25 in 25 Stunden). Nur gezählt werden: Server-Fehler auf
  admin, branding, portfolio, Landing und Hilfe (das Protokoll ist dort erst
  seit dem 2026-11-16 an), Fehler aus dem Browser und übrige KI-Ausfälle. Ab
  dem 2026-11-23 die Zeilen „Nur gezählt" der täglichen Läufe ansehen und in
  `scripts/ops/app-signals-rules.mjs` (`RULES`) je App eine Zahl eintragen.
- **(b) `NUXT_REDIS_URL` auf branding.supply.** Dort liegen die Tages-Deckel
  der KI im Speicher des Prozesses und beginnen bei jedem Ausliefern neu
  (gemessen 2026-11-16: gesetzt auf platform, admin, portfolio; Redis läuft
  auf dem Server). Setzen heißt: eine Zeile in der `.env` der Site, neu laden,
  zurücklesen — danach die Site in die Pflicht-Liste von
  `scripts/ops/verify-site-env.mjs` aufnehmen.
- **(c) Speichergrenze je Prozess.** Die pm2-Dateien kennen keine
  (`max_memory_restart`). Ein zu knapper Wert startete eine Seite im Kreis
  neu, deshalb erst mit Messwerten: der tägliche Lauf berichtet den Speicher je
  Prozess. Gemessen am 2026-11-16: fünf Apps 99 bis 182 MB, `platform` 291 MB
  kurz nach dem Start und 555 MB nach gut einer Stunde (Rechner: 3,8 GB).
- **(d) Kundendomains aus dem Control Plane lesen.** Die Host-Listen des TLS-
  und des Health-Wächters sind von Hand gepflegt; eine neue Kundendomain steht
  dort erst, wenn jemand sie einträgt. Braucht eine lesende Route mit
  Geheimnis und ein Secret bei GitHub.
- **(e) Kleinigkeiten.** Das Fehler-Log von `platform` besteht fast nur aus
  Zeilen „[Icon] failed to load" (19.789 in acht Tagen); die pm2-Logs laufen
  nicht um. Fehler außerhalb einer Anfrage fängt niemand. Das Guthaben bei
  OpenRouter lässt sich nicht im Voraus prüfen (nur mit einem
  Verwaltungs-Schlüssel) — gemeldet wird der erste abgelehnte Aufruf. Der Lauf
  `past-due-notice` meldet „schon im Gange" als gut statt als übersprungen. Der
  Mail-Blick liest im Log-Ordner auch Dateien früherer Prozess-Nummern mit (das
  Zeitfenster hält ihn richtig). Auf dem Appwrite-Server liegen die
  Sicherungen `*.vorher-p22` (nach zwei Wochen löschen).

<a id="se1"></a>

**SE1 — Server-Einstellungen und Schutz-Kopfzeilen: Nacharbeiten (aus dem Gesamtaudit, Paket P23).**

- **(a) Skript-Regel (CSP) scharf stellen.** Heute sendet jede Seite eine
  Regel, die nur beobachtet (`Content-Security-Policy-Report-Only`), und
  niemand sammelt die Berichte ein: ein Verstoß steht nur in der
  Browser-Konsole. Nächste Schritte: eine eigene, gebremste Annahme-Route für
  Berichte (nicht der Eingang für Browser-Fehler — Browser-Erweiterungen
  würden ihn fluten), dann Nonces statt `'unsafe-inline'`, dann scharf.
- **(b) HSTS auch für Unter-Adressen.** Gesendet wird ein Jahr, je Host, ohne
  `includeSubDomains`. Für `pukalani.app` ginge der Zusatz erst, wenn JEDE
  Unter-Adresse der Zone sicher per HTTPS antwortet (auch die, die nicht diese
  App bedient). Kundendomains bleiben ohne.
- **(c) Umlauf der pm2-Logs.** Sie wachsen ohne Grenze, und je Prozess liegen
  alte Dateien früherer Nummern daneben. Ein Umlauf ist erst sauber, wenn das
  Zähl-Skript (`ops/app-watch-counts.mjs`) auch die umgelaufene Datei liest —
  sonst meldet der tägliche Blick Zeit-Läufe als fehlend.
- **(d) Erinnerungs-Lauf.** Der Zeit-Lauf `event-reminders` geht alle
  Communities durch, kennt aber weder den Plan einer Community noch eine
  Sperre wegen Missbrauchs (beides weiß nur das Control Plane). Die Route
  `POST /api/events/reminder-sweep` und `NUXT_EVENTS_SWEEP_KEY` ruft niemand
  mehr; sie können weg, ebenso die Datei `~/events-sweep.log` auf dem Server.
- **(e) Kleinigkeiten.** Sicherungen nach zwei Wochen löschen (ab 2026-11-30):
  auf dem App-Server `/home/ploi/logs/nginx/*.vorher-p23*` und
  `/home/ploi/portfolio.pukalani.app/.env.vorher-p23`, auf dem Appwrite-Server
  `~/bin/pukalani-cert-gate.sh.vorher-p23` und `~/ops/crontab.vorher-p23`; im
  Ploi-Panel das Skript „P23: nginx-Zugriffs-Log 14 Tage". Auf `pukalani.app`
  liefert Cloudflare unveränderte Dateien noch mit den Kopfzeilen des alten
  Webservers aus (löst sich mit dem nächsten Build der Landing). Auf `admin`
  beantwortet der Webserver `/robots.txt` und `/favicon.ico` selbst mit 404
  (zwei leere Blöcke aus Plois Schablone). Zwei Sites senden
  `Connection 'upgrade'` fest. Die Umleitungs-Blöcke des Webservers schreiben
  weiter ins allgemeine Zugriffs-Log (jetzt 14 Tage). Der Vergleich der
  Webserver-Einstellung läuft nur auf dem App-Server (der Appwrite-Server hat
  seinen Webserver im Container). Rückkehr-Adressen von Stripe fallen ohne
  `i18n.baseUrl` weiter auf den Namen der Anfrage zurück (Nachtrag zu
  SEC-010).

- **(f) Eigene Domain einer Einzel-Site.** Mails, Digest und Rückwege nehmen
  seit 2026-11-16 die im Dashboard aktive Domain (COMPLETE „GA1 P23", Punkt 8).
  Bewiesen ist das mit Tests, nicht an einer echten Mail: auf pukalani.studio
  einmal „Passwort vergessen" mit der eigenen Adresse auslösen — der Link muss
  mit `https://pukalani.studio` beginnen. Die Variable `NUXT_PUBLIC_APP_URL`
  dieser Site steht seit dem 2026-11-16 von Hand auf der eigenen Domain; sauber
  ist die Standard-Adresse (`https://portfolio.pukalani.app`) als Rückfall —
  zurückstellen, sobald die Probe-Mail stimmt (Davids Ja für die Server-Datei).
  Nicht umgestellt: der Link in `CommentSection.vue` (nur die Test-App mit
  eigener Domain) und die Rückkehr-Adressen von Stripe.

<a id="ll1"></a>

**LL1 — Lange Läufe: Nacharbeiten (aus dem Gesamtaudit, Paket P18).**

- **(a) Radar-Knopf.** „Jetzt laufen lassen" beginnt nach 30 Sekunden keine
  neuen Abrufe mehr und meldet ein Teil-Ergebnis. Das hält die 60 Sekunden des
  Webservers nur, solange die Kanal-Liste klein ist (heute rund zwölf): der
  erste Abruf der Kanal-Daten und das Schreiben der Videos sind nicht
  befristet, und bei 50 Kanälen sind das bis zu 2.500 Schreibzugriffe. Sauber
  wäre derselbe Weg wie beim Marktvergleich: Lauf-Sperre in `insights_runs`,
  `202`, Hintergrund, die Seite fragt den Stand ab. Die Tabelle steht schon.
- **(b) Weitere lange Wege in der Anfrage** (gemessen am 2026-11-16, eigene
  Fristen im Code zusammengezählt): öffentlicher Brand-Check rund 120 s,
  Dokument-Check 90 s, Bild lesen 120 s, Zeichen-Entwürfe 120 s,
  Dokument-Prüfung bis 660 s (hat eine eigene Sperre), Entwurf und Übersetzung
  eines Artikels je 120 s (für beide gilt auf branding.supply die Ausnahme von
  180 s). Üblich sind sie viel schneller; die Obergrenze liegt über der
  Wartezeit des Webservers. Ein Wächter, der je Route die Summe ihrer Fristen
  gegen die 60 s hält, gehört zu Paket P20. Die zwei Streams des Markenberaters
  senden keinen Herzschlag.
- **(c) Kleinigkeiten.** Der Video-Brief hält seinen Start weiter mit „erst
  lesen, dann Stempel schreiben" fest: zwei Klicks im SELBEN Augenblick
  könnten dort zwei bezahlte Läufe starten (nur die Redaktion, rund 5 Cent).
  Mit `insights_runs` ist das eine kleine Umstellung auf die Lauf-Sperre. Die
  Lauf-Zeilen (`market_runs`, `insights_runs`)
  werden nicht nach Alter geräumt; sie sind klein (höchstens drei je Marke und
  Tag, eine je Newsletter-Stapel) und verschwinden mit der Marke. Der Hinweis
  „Quelle in der Zeit nicht gelesen" erscheint nur beim Zustandswechsel, nicht
  beim Speichern eines veröffentlichten Artikels (dort steht weiter „Zitat
  nicht belegt"). Ein Artikel mit sehr vielen langsamen Quellen lässt sich
  wegen der 45 Sekunden unter Umständen nicht freigeben — dann die Quellen
  einzeln über die Ampel prüfen und die langsamen ersetzen. Stirbt der Prozess
  mitten in einem Newsletter-Stapel, bekommt beim Fortsetzen höchstens dieser
  eine Stapel die Ausgabe doppelt (bekannte Grenze, unverändert). Der
  Newsletter ist auf Production ausgeschaltet; die Sperre ist dort nur durch
  Tests belegt. Vier Beweis-Skripte des Marktvergleichs brauchen 70 Sekunden
  Abstand, weil die Läufe jetzt schneller antworten als die Minuten-Bremse
  (5 Starts je Minute) erlaubt. Der spätere Alarm (Paket P22) kann
  abgebrochene Läufe an Lauf-Zeilen ohne Ende mit altem Herzschlag erkennen.
  Auf Production ist ein Lauf ÜBER 60 Sekunden nicht gezeigt (der Probe-Lauf
  vom 2026-11-16 brauchte 22 s) und die Seite dort nicht im Browser geklickt;
  beides ist lokal gezeigt (Lauf 75 s, zwei Reiter).

<a id="si1"></a>

**SI1 — Sicherungen: Nacharbeiten (aus dem Gesamtaudit, Paket P06).**

- **(a) Klick-Probe auf Live.** Geprüft ist lokal. Auf einer Community: eine
  Einladung an eine Test-Adresse schicken und den Link aus einem
  Webmail-Fenster öffnen (die Seite muss die Einladung zeigen). Ein Test-Konto
  entfernen und sehen, dass die Liste „entfernt" zeigt und kein Hinweis auf
  einen offenen Lese-Zugang kommt.
- **(b) Was der Abgleich nicht findet.** Ein Moderations-Label nach einer
  Herabstufung (die Zeile bleibt aktiv; es fällt erst beim nächsten Besuch der
  Person). Mitglieder, deren Umstellung beim Stilllegen einer Community im
  Control Plane scheiterte. Der Lauf merkt sich seine Lesestelle nur im
  Prozess. Die Reihenfolge je Konto gilt nur innerhalb eines Prozesses;
  Platform-App und Betreiber-Konsole sind zwei.
- **(c) Lint-Lauf.** Mit der typisierten Regel dauert `pnpm -r lint` lokal
  etwa 43 s statt 18 s (in der CI rund 2,5 Minuten für den ganzen Job). Ein
  eigener Durchgang mit einem TypeScript-Programm je App käme zusammen auf
  etwa 28 s, nimmt die Regel aber aus dem Lint des einzelnen Pakets.
- **(d) Kleinigkeiten.** Die Ops-Route `run-label-reconcile` steht nicht in
  der Bremsen-Liste (wie die der Zahlungswarnung). Eine 503 trägt im Umschlag
  den Code `INTERNAL_ERROR` (es gibt keinen eigenen für 503). Die Seite
  `/invite` von branding.supply ist nach der Umstellung nur per Test und
  Quelltext geprüft, nicht im Browser. README und DECISION-LOG nennen in
  datierten Zeilen noch den entfernten Schalter `csrfOriginCheck`.

<a id="ki1"></a>

**KI1 — KI-Schutz: Nacharbeiten (aus dem Gesamtaudit, Paket P17).**

- **(a) Klick-Probe auf Live, zweiter Teil.** Das Übersetzen eines Kommentars
  ist am 2026-11-15 auf einer Community geklickt und ging (echter Aufruf).
  Offen: als Moderator die KI-Einschätzung zu einer Meldung holen. Erwartet:
  geht wie vorher.
- **(b) Datenschutztexte.** Übersetzung, Moderations-Hilfe, Ticket-Einordnung
  und Seiten-Übersetzung laufen jetzt wie der Markenberater: der Anbieter
  speichert nichts, trainiert nicht damit, und gerechnet wird in Europa
  (Amazon Bedrock in Irland oder Google Vertex in Europa, vermittelt über
  OpenRouter). Die EINE Ausnahme bleibt das Erzeugen der Zeichen-Entwürfe
  (kein fester Ort, steht schon im Text von branding.supply). Ob und wie die
  Datenschutzerklärungen das sagen, entscheidet David mit dem Anwalt
  (BS1 und A1; gesammelt in [DT1](#dt1)).
- **(c) Modell aus der Konsole.** Wer auf der Admin-Config-Seite ein Modell
  einträgt, das keinen der zwei Europa-Endpunkte hat, bekommt keinen Hinweis
  beim Speichern. Der erste Aufruf scheitert dann mit einem klaren Satz („KI
  gerade nicht verfügbar"), es wird nichts woanders gerechnet. Besser wäre
  die Prüfung schon beim Speichern. Der tägliche Wächter prüft nur die
  Modelle aus dem Code.
- **(d) Kleinigkeiten.** Bei einem Modell ohne Europa-Endpunkt zeigen
  Markenberater und Marktvergleich weiter ihren allgemeinen Satz („gerade
  nicht verfügbar"), nicht den neuen genauen. Der Feldwert eines
  abgeschnittenen Entwurfs trägt kein Kennzeichen, nur die Sprechblase
  darüber. Das Prüfskript `verify-brand-context.mjs` hat als Voreinstellung
  ein Modell, das es unter unseren Bedingungen nicht mehr gibt. Ein
  englisches Bildschirmfoto der neuen Hinweise fehlt. Die Kosten je Lauf und
  der Anbieter stehen weiter nicht im Protokoll (gehört zum Paket „Alarm für
  KI-Ausfälle und Ausgaben" des Gesamtaudits).

<a id="ar1"></a>

**AR1 — Aufräumen: Nacharbeiten (aus dem Gesamtaudit, Paket P26).**

- **(a) Die Adresse `changelog.pukalani.app` löschen.** Sie zeigt noch auf den
  Datenbank-Server, dahinter ist nichts mehr (die Function und der Webhook
  sind weg). David hat das Löschen am 2026-11-15 freigegeben; im Browser war
  Cloudflare nicht angemeldet. Zu tun: bei Cloudflare in der Zone
  `pukalani.app` den A-Eintrag `changelog` löschen. Der Name bleibt für
  Kunden gesperrt (`RESERVED_SUBDOMAINS`). Danach die Zeile in
  `docs/content/2.architektur/6.hosts-und-ports.md` streichen.
- **(b) Ticket-Kauf vor einem Ausrollen.** Der Kauf eines Event-Tickets lebt
  nur in der Test-App. Seit P26 bekommt derselbe Kauf dieselbe Stripe-Sitzung
  (kein doppeltes Bezahlen aus zwei Tabs). Zwei Reste: Beim allerersten Kauf
  eines Kontos können zwei gleichzeitige Aufrufe zwei Stripe-Kunden anlegen
  (dann greift der Schutz nicht); und zwischen Bezahlen und Ausstellen des
  Tickets antwortet ein erneuter Klick mit einem Fehler statt mit „schon
  bezahlt". Die Rückkehr-Adressen kommen weiter aus dem Host der Anfrage
  (Audit-Paket P23).
- **(c) Übrige Umzugs-Anleitungen.** Entschieden am 2026-11-16: erledigte
  Umzugs-Anleitungen wandern ins Archiv. `F3-CUTOVER.md` und
  `ADMIN-PROJEKT-CUTOVER.md` liegen seit dem 2026-11-16 unter
  `docs/archiv/`. Noch zu prüfen: `ACCOUNT-CUTOVER.md`, `ADMIN-CUTOVER.md`
  und `CONTROL-CUTOVER.md` (sind die Umzüge ganz gelaufen und wird nichts
  daraus mehr gebraucht, ziehen sie nach). Zwei Kommentare im Code nennen
  noch den alten Pfad (`apps/control/nuxt.config.ts`,
  `scripts/ops/verify-schema-parity.mjs`), und der Verweis-Wächter trägt
  zwei Ausnahmen, die jetzt leer laufen; beim nächsten Griff mitnehmen.
- **(d) Kleinigkeiten.** Die READMEs von `apps/photos` und `apps/control`
  sind Kopien der Vorlage und tragen noch deren Überschrift. Der Zähler der
  Kontakt-Route von `apps/photos` liegt im Speicher des Prozesses. Auf dem
  Datenbank-Server liegen fünf Upgrade-Protokolle im Heimatordner (bewusst
  behalten) und vier Sicherheitskopien aus dem Backup-Paket (`*.vorher-p11*`,
  gehören zu BU1 d). Der lokale Lauf der Playwright-Suite braucht einen
  Browser-Download.

<a id="a1-anwalt"></a>

**A1 — Rechtstexte: Stand und Agenda für den Anwaltstermin.**

**Fertig (2026-08-12):** `pukalani.studio` hat Impressum und
Datenschutzerklärung in de+en, veröffentlicht, mit ladungsfähiger Anschrift.
Die Texte nennen ausschließlich Belegbares — was eine Bewertung oder eine
Willenserklärung braucht, wurde WEGGELASSEN statt geraten. Sie sind live
lesbar (`/de/imprint`, `/de/privacy` und die en-Fassungen) und damit die beste
Vorlage für das Gespräch.

**Offen ist keine Datenlücke mehr, sondern fünf Bewertungen.** Die Fragen sind
so gestellt, dass sie in einem Termin beantwortbar sind — sie sind FRAGEN, keine
Rechtsauffassungen:

1. **Vertreter in der Union (Art. 27 DSGVO)?** Der Verantwortliche sitzt in den
   USA, das Angebot richtet sich deutschsprachig und in Euro an DACH — das
   Marktortprinzip (Art. 3 Abs. 2) greift also. Verarbeitet werden nur
   Server-Protokolle, ein Sprach-Cookie, cookielose Reichweitenmessung und
   Kontaktanfragen; es gibt keine Besucherkonten, keine Profilbildung, keine
   besonderen Kategorien. **Frage:** Greift die Ausnahme nach Art. 27 Abs. 2
   lit. a (gelegentlich, geringes Risiko) — oder ist ein Vertreter zu benennen?
   Falls ja: Name und Anschrift, sie gehören dann in beide Dokumente.
2. **Drittland-Grundlage.** Die Server stehen in Deutschland, der
   Verantwortliche greift aus den USA darauf zu. **Frage:** Ist das eine
   Übermittlung im Sinne von Kapitel V, und was ist im Abschnitt „Zugriff aus
   dem Ausland" konkret zu nennen?
3. **Gilt § 5 DDG überhaupt?** Er verpflichtet in Deutschland niedergelassene
   Anbieter. **Frage:** Welche Pflichten treffen einen US-Anbieter mit
   DACH-Ausrichtung stattdessen (Marktortprinzip, UWG), reicht die jetzige
   Fassung — und ist der Block „Verantwortlich für den Inhalt" wegen der
   redaktionellen Wissen-Artikel (§ 18 Abs. 2 MStV) richtig besetzt?
4. **Verbraucherstreitbeilegung (§ 36 VSBG).** Das Angebot richtet sich an
   Unternehmen, die Guides sind öffentlich. **Frage:** Ist eine Erklärung nötig,
   und wie soll sie lauten? (Der Abschnitt fehlt derzeit bewusst — eine
   Willenserklärung kann niemand außer David abgeben.)
5. **Umsatzsteuer.** Dienstleistungen eines US-Anbieters an Unternehmen in der
   EU. **Frage:** Reverse-Charge-Hinweis nötig, USt-IdNr. erforderlich? Das
   betrifft Rechnungen ebenso wie den Impressums-Abschnitt.

**Mitnehmen zum Termin** (alles steht in der veröffentlichten
Datenschutzerklärung, hier als Kurzfassung): Einzelunternehmen, Sitz Makawao
(Hawaii, USA) · Zielgruppe Unternehmen und Agenturen in DACH · verarbeitet
werden Server-Protokolle, ein Sprach-Cookie (`i18n_redirected`), cookielose
Reichweitenmessung mit **selbst gehostetem** Plausible auf einem Server in
Deutschland sowie Kontaktanfragen per E-Mail/Telefon · Terminbuchung über
cal.com ist nur VERLINKT, nicht eingebettet · keine Besucherkonten, kein
Newsletter, keine Werbenetzwerke, keine eingebetteten Drittinhalte, Schriften
vom eigenen Server · Hosting in Deutschland.

**Danach umzusetzen** (Claude, je Antwort eine Textstelle): Vertreter →
eigener Abschnitt in der Datenschutzerklärung de+en · Drittland-Grundlage →
Abschnitt „Zugriff aus dem Ausland" · Verbraucherstreitbeilegung und
USt-IdNr. → je ein Abschnitt im Impressum de+en. Rechnen: rund eine halbe
Stunde, danach live nachgemessen.

<a id="a1-plattform"></a>

**A1b — pukalani.app: eigener Block im selben Termin.** Die Plattform ist ein
anderer Fall als die Studio-Site: dort sind es Davids eigene Daten, hier sind
es die Daten FREMDER Leute in fremden Communities, dazu Geld und
nutzergenerierte Inhalte. Stand: Impressum, Datenschutz und AGB existieren als
Platzhalter mit sichtbarem Entwurfs-Hinweis und `noindex` — ehrlich, aber leer;
auf Mandanten- und Kontroll-Hosts gibt es gar keine Rechtsseiten (der Fuß
verlinkt auf `pukalani.app`).

**Die Kernfrage, an der alles hängt: Auftragsverarbeiter oder gemeinsam
verantwortlich?** Das eigene Strategiepapier hält beides für möglich und
verlangt eine Einzelfallprüfung. Vier gebaute Tatsachen gehören dem Anwalt
dafür auf den Tisch, weil sie gegen die reine Auftragsverarbeitung sprechen
könnten: (a) **ein Konto gilt plattformweit** — alle Pool-Communities und alle
Nutzer liegen in EINEM Appwrite-Projekt, man registriert sich bei Pukalani,
nicht bei der Community; (b) der Betreiber hat einen **protokollierten
Break-Glass-Zugriff** auf Kunden-Communities; (c) der Betreiber kann eine
Community **sperren** (`suspension: 'abuse'` ⇒ Host 404); (d) der
**Auto-Hide-Schwellwert** (3 offene Meldungen) ist vom Betreiber gesetzt, nicht
vom Owner. Von der Antwort hängen AVV, Rollen-Formulierung in ALLEN Texten und
die Kunden-Vorlagen im `pages`-Layer ab.

**Weitere Fragen, beantwortbar formuliert:**

1. **Anbieter-Identität.** Ist Anbieter von `pukalani.app` dieselbe Person und
   Rechtsform wie bei der Studio-Site (Einzelunternehmen, Sitz USA)? Falls ja,
   gelten die fünf Studio-Fragen (Art. 27, Drittland, § 5 DDG, VSBG, USt) hier
   **erneut und schärfer**, weil es um fremde Nutzerdaten geht.
2. **Verbraucher oder Unternehmer?** Pläne 29 €/149 € im Monat, Brutto-Preise
   „inkl. 19 % MwSt.", Selbstbedienung ohne USt-IdNr.-Abfrage. Richten sie sich
   auch an Verbraucher? Falls ja: **Widerrufsrecht** (im Code und in allen
   Texten bisher nirgends behandelt), Button-Lösung, Preisangaben.
3. **Umsatzsteuer.** US-Anbieter verkauft digital an EU-Kunden, Stripe Tax ist
   an, Rechnungsadresse Pflicht, USt-IdNr. wird **nicht** erfasst, OSS ist ein
   manueller Schritt. Was ist nötig — Reverse Charge, OSS, USt-IdNr.-Erfassung?
4. **DSA-Pflichten.** Die Plattform hostet fremde Inhalte und hat ein
   Meldesystem — aber **kein Beschwerdeverfahren** gegen Moderations-
   entscheidungen, **keine Benachrichtigung des Autors** beim Ausblenden und
   **keinen Transparenzbericht**. Frage: Welche Pflichten treffen einen
   Hosting-Dienst dieser Größe (Art. 16/17/20 DSA), und was davon muss vor dem
   Go-Live gebaut sein?
5. **Mindestalter.** Es gibt keine Altersgrenze, keine Abfrage, keinen Hinweis.
   Ab welchem Alter dürfen Konten entstehen (Art. 8 DSGVO), und wie ist das
   nachzuweisen?
6. **Aufbewahrung.** `audit_logs` enthalten **IP-Adressen ohne Löschfrist**
   (bei Kontolöschung wird pseudonymisiert, nicht gelöscht); Server-Protokolle
   haben kein logrotate. Welche Fristen sind vertretbar, was muss in die Texte?

**Was danach GEBAUT/GESCHRIEBEN werden muss — unabhängig vom Ausgang:**
ein **AVV/DPA für Kunden** (existiert nicht, ist aber auf `/gdpr` öffentlich
zugesagt: „sprich uns an, wir klären das vor dem Start deiner Community" — ein
Versprechen ohne Deckung), eine **Subprozessoren-Liste** (nach dieser Erhebung
mindestens Hetzner, ploi.io, Cloudflare, Resend, Stripe, OpenRouter,
UptimeRobot), die drei echten Texte, ein Zustimmungsschritt im Onboarding und
`pukalani.auth.termsUrl` in `apps/platform` (fehlt genau dort, wo Kunden sich
registrieren).

**Faktenblatt zum Mitnehmen** (alles am Code erhoben, Stand 2026-08-14):
Konten mit E-Mail/Name/Bio/Avatar in **einem** Appwrite-Projekt · Inhalte immer
mit Autor-Id UND Autorname · private Nachrichten (bei Meldung wird eine
Beweiskopie 90 Tage eingefroren) · Meldungen, zweiphasiges Ausblenden statt
Löschen, Auto-Hide ab 3 Meldungen (nur Kommentare, nicht KI-basiert) ·
KI-Assist ist **rein beratend** und bekommt Kommentar-/Beitragstexte samt
Autorname (OpenRouter, in `apps/platform` freigeschaltet) · Zahlungen über
gehostetes Stripe Checkout, **Vertragspartner ist die Community, nicht das
Konto**, Kündigung/Rechnungen laufen über das Stripe-Portal, 14 Tage Testphase
ohne Zahlungsdaten, danach nur-lesend statt Löschung · Stripe Connect ist
**nicht** gebaut · Server bei Hetzner in Deutschland, Appwrite self-hosted auf
eigenem Server, Backups 14 Tage lokal + offsite auf eine Hetzner Storage Box ·
Cookies: Session (nur eingeloggt), Sprache, Darstellung, aufgeklappte Threads —
**kein Consent-Banner aktiv** · Google-Login gebaut, aber nirgends
eingeschaltet · Gast-Kommentare in `apps/platform` bewusst aus.

<a id="dt1"></a>

**DT1 — Datenschutztexte nachziehen (ein Durchgang nach dem Anwaltstermin).**
Jede Zeile ist ein Satz oder Abschnitt, der in die Erklärungen gehört;
freigegeben wird von David, nach der Antwort des Anwalts.

- **KI** — was die Texte über Speicherung, Training und den Ort der
  Verarbeitung sagen dürfen ([KI1 b](#ki1)).
- **Fristen** — Kopie gelöschter Konten, Prüfergebnisse, Melder-Adresse,
  Protokoll ([EL1 b](#el1)); dazu die Fristen für Einträge ohne Konto,
  sobald EL1 (c) gebaut ist.
- **Bot-Prüfung** — Erstgespräch und Warteliste von branding.supply im Text
  ergänzen ([SR1 b](#sr1)).
- **Resend** — der Mail-Dienst ist nach dem EU-US Data Privacy Framework
  zertifiziert und sendet aus der EU-Region ([RS1](#rs1)).
- **Cookie-Satz** — die Anmelde-Regeln aus P29
  ([ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md)).
- **Drei alte Stellen, an denen die Aussage dem Code widerspricht** (Stand
  der Erhebung 2026-08-14, gehören mir, nicht dem Anwalt): (1) „Plausible
  speichert keine personenbezogenen Daten" stand in Kunden-Vorlage,
  Entwurfs-Datenschutzseite und `/gdpr`, der Analytics-Proxy leitet aber IP
  und User-Agent weiter. (2) `/gdpr` wirbt mit „Community starten –
  kostenlos", seit F49 ist eine Community ohne Abo nach 14 Tagen nur-lesend.
  (3) Die Hilfeseite führte Basic als Plan mit „0 €". **Nachgesehen am
  2026-11-16:** (2) steht noch so in `apps/marketing/i18n/locales/de.json`;
  (1) und (3) habe ich im Wortlaut nicht mehr gefunden — **unklar, prüfen**.

<a id="a2a"></a>

**A2 — Stripe-Live scharfschalten.** Fünf Schritte laut
[Runbook](runbooks/STRIPE-GO-LIVE-RUNBOOK.md): 2.1 Bank-Aktivierung [David] ·
2.2 Live-Webhook [David] · 2.3 Keys in Server-.env [David] · 2.4 Live-Portal
konfigurieren (braucht A1) [Claude] · 2.5 Minimal-Verifikation [beide].
Der Testmodus-Durchlauf ist am 2026-11-12 gefahren und aufgeschrieben
([STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md)); der
Treiber dazu ist veraltet (SC2). **Rest aus A3 (Brutto-Preise):** Stripe
legt die Prices ohne `tax_behavior` an und die Checkouts laufen mit
`automatic_tax` — steht das Konto-Default auf „exclusive", rechnet Stripe
19 % oben drauf und widerspricht der Landing. Prüfung vor dem Live-Gang:
Runbook § 2.4.

<a id="bs1"></a>

**BS1 — branding.supply: was gebaut ist und was offen bleibt.** Gebaut und
live (Verlauf in COMPLETE): R0, R1, R1b, R1c, R2a, R2b, Z0 und die
vorläufige Datenschutz-Fassung. Die Production-Migrationen `pages-001…006`
und `brand-021` sind gefahren (die Tabelle der Erstgespräch-Anfragen ist in
Gebrauch), und `introCallNotify` ist in `apps/branding/app/app.config.ts`
gesetzt. Die alte Zeile nannte beides zugleich „gefahren" und „wartet auf
Davids Ja"; das Zweite war ein überholter Rest.

- **Unklar, prüfen:** Die alte Zeile sagte „Geo-Env gesetzt" und zugleich
  „David setzt die zwei `GEO_*`-Pfade in der Server-`.env`". Am Repo lässt
  sich das nicht entscheiden; der Beweis ist ein grüner Lauf von
  `pnpm ops:site-env` für branding.
- **Entschieden am 2026-09-08 (Plan § 9):** Kundenkreis nur B2B · Generator
  activeMind für die Erstfassung, später eRecht24 Premium · der
  Art.-27-Vertreter ist der eigene Punkt A27.

<a id="bi1"></a>

**BI1 — Brand Insights: offene Reste.** Der Verlauf (I0 bis I6 Stufe 1, K7)
steht in COMPLETE. Offen:

- **Davids Blick:** die Redaktion auf branding.supply einmal durchklicken;
  die vier Entwürfe redigieren; Brand-Checks für Nike, Apple, Anthropic und
  The Barn laufen lassen und danach den Seed EINMAL wiederholen (trägt die
  Scores ins Ranking nach); die Marken nike und adidas veröffentlichen
  (sonst zeigt die Duell-Vorschau 404); dann freigeben.
- **Zwei Config-Zeilen, die David umlegt:** `publicFormats` erweitern, sobald
  die Anwaltsantworten BI1-3/BI1-4 da sind (Profil, Duell, Ranking; das
  Ranking zusätzlich erst mit Stufe 2, der Titel verspricht zehn Plätze);
  `pukalani.insights.newsletter.enabled`, sobald der Datenschutz-Abschnitt
  „Newsletter" steht (BS1 R2/R3).
- **I6 Stufe 2:** die restlichen fünfzehn Stücke aus Plan § 9.8 im Wochentakt.
- **Plausible-Site** (BS1 R2c), sobald öffentliche Seiten gemessen werden.
- **Klein:** Fakten-Zeilen-Editor statt JSON (erst mit dem ersten echten
  Duell oder Ranking); der DB1-Befund „Slug-Umbenennung ohne 301 und
  Historie" (Plan § 9.2).

<a id="bw1"></a>

**BW1 — Brand-Wizard: offene Reste.** Der ganze Verlauf (Pakete P0 bis P4,
Testläufe, Befunde) steht in COMPLETE („Verlauf aus OPEN-ITEMS ausgelagert
2026-11-16"). Aus der alten Zeile noch offen:

- **Davids Durchgang:** ein Solo-Branding in der Werkstatt durchsehen (gilt
  zugleich als P3-Abnahme) und die Solo-Fassungen gegenlesen (Tabelle
  Team/Solo in `docs/referenz/BRAND-WIZARD-SESSION-INHALTE.md`).
- **Brand-Check:** Report-Anhang der Mail (Phase 2); Kriterien-Wortlaut
  nach echten Checks nachschärfen.
- **Seiten:** Porträts T1/T2 als Foto extern, das Beispiel-Branding „Kailua
  Coffee Co." als echte Seite, Funnel-Kennzahlen (CTA/Warteliste als
  `brand_events`), OG-Bilder je Seite.
- **Aus dem Komplett-Test:** Rückfragen zeigen auf Felder fertiger Kapitel
  ohne Weg dorthin; die Frage `d.voiceSamples` setzt eine Auswahl voraus,
  die es nicht gibt (Davids Zuschnitt).
- **Später, bewusst:** Mobil-Feinschliff als eigene Runde (Davids
  Entscheidung 2026-09-03: primär eine Desktop-Anwendung).
- **Unklar, prüfen** (die alte Zeile nannte sie offen, spätere Stände
  sprechen dagegen): die drei P0-Gates (Fragen gegenlesen, „George"
  absegnen, Bilanz-Befund); die Ergebnis-Seite P5 bis P7 als Konzept-Gate;
  mehrteilige Katalog-Fragen (`a.facts`) einzeln nacheinander; die
  Launch-Gates AVV (hängt an A1), Interaktionsbilanz und P0b-Abnahme.

<a id="rs1"></a>

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
  [RESEND-WEBHOOK.md](runbooks/RESEND-WEBHOOK.md) § 7.3.
- **(e2) DMARC fehlt auf `branding.supply`** (gemessen 2026-11-09). Ein
  Klick für David: Cloudflare → branding.supply → Email → DMARC Management
  → „Enable DMARC Management".
- **(f) Rechtstexte.** Resend ist nach dem EU-US Data Privacy Framework
  zertifiziert, `pukalani.app` sendet aus eu-west-1. Der Satz dazu gehört in
  den Durchgang [DT1](#dt1).
- **(g) Rest.** DMARC für `pukalani.app` nach ein paar Wochen sauberer
  Berichte auf `p=quarantine` stellen.

Zur Kenntnis, kein Bau: Resend sperrt öffentlich gewordene Schlüssel selbst.
Unser Repo ist öffentlich: landet der SMTP-Schlüssel dort, fallen alle Mails
sofort aus. One-Click-Abmeldung (RFC 8058) bleibt ein eigenes Vorhaben,
Begründung im Kopf von `packages/core/server/utils/mailer.ts`.

<a id="vdb1"></a>

**VDB1 — Appwrite VectorsDB für semantische Suche.** Geprüft am 2026-11-06
anhand der Doku, des 2.6.2-Quellcodes (`app/init/registers.php`,
`docker-compose.yml`, `.env`) und von node-appwrite 29. Live probiert wurde
nichts, OrbStack war aus.

- **Was passt:** `VectorsDB` und `Embeddings.createTextEmbeddings` sind seit
  node-appwrite 29.0.0 im SDK, also kein Bump nötig. Suche per
  `Query.vectorCosine` mit `$distance`, beliebige `metadata` je Eintrag,
  Berechtigungen je Eintrag, Dimension der Sammlung frei wählbar.
- **Server:** VectorsDB läuft nicht auf MariaDB. Es braucht ein eigenes
  Postgres (`appwrite/postgres:0.1.0`, `_APP_DB_*_VECTORSDB`, Standard-Host
  `postgresql:5432`), dazu für die eingebauten Embeddings den Container
  `appwrite/embedding:0.3.1` (Profil `embedding`, CPU-Rechnung, Volume
  `appwrite-models`) und `_APP_EMBEDDING=enabled` (Standard aus). Das ist eine
  zweite Datenbank im Backup, mehr RAM auf appwrite-prod und mehr Fläche für
  das Upgrade-Werkzeug. Den Alt-Container haben wir am 2026-09-08 bewusst
  entfernt (APPWRITE-2-0-UPGRADE).
- **Sprache:** eingebaut sind `nomic-embed-text` (768) und `all-minilm` (384),
  beide nur Englisch. Das mehrsprachige `embedding-gemma` steht auf „coming
  soon" und antwortet bis dahin mit 400. Vektoren selbst rechnen ginge, dann
  stellt sich aber die ZDR-ist-nicht-EU-Frage wie bei OpenRouter (AI1).
- **Mandanten-Trennung:** `tenantDb` deckt nur TablesDB. Im Pool bräuchte
  jeder Eintrag `tenantId` in `metadata` plus eine eigene Datentür,
  ESLint-Wächter und VectorsDB-Schritte im Migrations-Runner, also ein
  Eingriff nach CONCEPT A14.
- **Bedarf heute:** Volltext über MariaDB trägt `posts`, `comments`, `events`
  und `admin`. Der eine echte Kandidat ist George-RAG über die
  Insights-Basis (BRAND-WIZARD-PHASE-1, „RAG + Embeddings"), und die hat erst
  eine Handvoll Beiträge.

Wieder anfassen, wenn BEIDES zutrifft: ein mehrsprachiges Modell ist in
Appwrite verfügbar, und die Insights-Basis ist so groß, dass Volltext nicht
mehr reicht (grob einige hundert Einträge). Dann in derselben Strategie-Runde
VectorsDB gegen pgvector im eigenen Postgres und gegen einen externen
Embedding-Dienst abwägen.

### Bewusst zurückgestellt (kein Aufgabenpunkt)

- **Brand Design, zwei Nebenbefunde aus dem Audit (2026-09-09):** `aiComplete`
  loggt bei Anbieter-Fehlern weiter 300 Zeichen Rumpf (Text-Weg, nicht Teil des
  Audits; `aiVision`/`aiImage` schweigen); die 413-Antwort `reading_too_large` hat
  keinen eigenen UI-Satz (unter den Produkt-Deckeln 16 Bilder × 5 MB unerreichbar).
  Beim nächsten Griff an `aiComplete` mitnehmen.
- **Nuxt-UI `UDashboardSearchButton` rendert das Kürzel `⌘k` erst im Client**
  (SSR „ k") — ein Hydration-Mismatch auf JEDER Dashboard-Seite, Bestand der
  Bibliothek (gefunden 2026-09-08 bei DB1). Beobachten, beim nächsten Nuxt-UI-Bump
  prüfen; kein eigener Umbau.
- **„Taxes"-Seite** (U15-Runde 2026-08-13): Stripe `automatic_tax` rechnet die
  Steuer im Checkout — eine eigene Seite wäre eine Attrappe. Der Rest ist
  Runbook A2 § 2.4 (Konto-Default „inclusive" prüfen).
- **„Bulk-Logs"-Seite** (U15-Runde 2026-08-13): Aktivitäts- und
  Audit-Protokolle existieren; eine dritte Log-Ansicht ohne neuen Inhalt
  wäre Doppelpflege.
- **Geparkt mit Bedingung** (U15-Runde 2026-08-13): Bio/öffentliches Profil
  (erst wenn öffentliche Profile gewollt sind — heute bewusst nicht) ·
  API-Tokens (erst mit einer öffentlichen API-Story) · SSO (Enterprise-/
  Studio-Angebot) · E-Mail-Einstellungen je Community (erst mit eigenem
  Absender/SMTP je Kunde).

- **Flag-Registry statt `commentsEnabled`** — mittlerer Refactor der
  AppConfig-Typen, lohnt erst mit dem nächsten neuen Flag.
- **`useFormatCurrency`** bleibt als Baukasten-Vorhaltung (billing nutzt sie).
- **targetType-LOW-Residual** — kommt mit dem `comment_reports`-Modell.
- **Entwurfs-DATEIEN im Medien-Bucket** tragen nur den globalen Operator-Read:
  im Pool könnte die Redaktion einer Kunden-Site ihre eigenen Entwürfe nicht
  vorschauen. Kein Leck; Richtung (server-seitige Vorschau-Route) steht in
  `media/server/utils/mediaPermissions.ts`.
- **Eigenes og:image hochladen** — bewusst nicht gebaut, die Karte wird
  generiert.
- **Glocke auf `my.pukalani.app`** — dort gibt es heute nichts zu zeigen;
  kommt Pool-Billing (D1), braucht das Onboarding-Layout eine.
- **Gast-Kommentar in einer geschlossenen Community** bekommt `read(label:…)`
  und ist damit für seinen eigenen Verfasser unsichtbar — die ehrliche Folge
  daraus, dass Gast-Kommentare und „nur für Mitglieder" einander
  widersprechen. Wer es sauber will, schaltet `pukalani.comments.embed.guests`
  ab. (Aus dem C18-Abschluss übernommen.)
- **Inline-Embed ohne iframe** (eigener Sanitizer + CORS-Allowlist) und eine
  dedizierte `apps/embed-comments` — bewusst später, supervised.
- **Gebühr auf die Einnahmen der Kunden, Preis pro Mitglied, ein dritter
  „Köder"-Plan** — der Wettbewerbsvergleich rät von allen dreien ab: die
  Gebühr ist der meistkritisierte Mechanismus im ganzen Feld (8–14 % des
  Umsatzes gehen anderswo an die Plattform), und 0 % ist der eine Satz, der
  Pukalani unterscheidet.
- **Produkttour mit Sprechblasen und Kreditkarte in der Testphase** — für die
  Tour ist belegt, dass sie nichts verbessert (die Startliste aus U4 ist die
  Alternative, nicht ihre Vorstufe); auf die Karte verzichtet das ganze Feld
  außer einem Anbieter, und der wird dafür kritisiert.
- **Strang „Brand System" nach dem Brand-Check (Davids Entscheidung
  2026-09-05, DECISION-LOG):** sobald BC1 P6 (Ergebnisseite v2) steht, kommt
  NICHT das nächste Analyse-Feature, sondern in dieser Reihenfolge **BF1
  Foundation-Leseansicht (✅ 2026-09-07, COMPLETE) → Produkt 02 Brand Design
  (✅ 2026-09-09, COMPLETE) → Produkt 03 Book & Kit inkl.
  „Brand Context" (brand.md/brand.json/Tokens) — Strategie freigegeben
  2026-09-09, Eintrag `BK1`** → danach „Brand Extract" (URL-/Asset-Extraktion
  als Relaunch-Einstieg, Davids Entscheidung 2026-09-09: eigener Baustein NACH
  Book & Kit). Bewusst KEINE eigenen P-Nummern für den
  Strang — jedes Glied hat seinen Plan (BF1: archiv/BRAND-FOUNDATION-
  LESEANSICHT.md; 02: archiv/BRAND-DESIGN.md; 03: plans/BRAND-BOOK-KIT.md). Fünf Ebenen
  Discover → Audit → Compare → Build → Supply sind die Karte darüber.
