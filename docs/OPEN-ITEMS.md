# Offene Punkte

**Stand: 40 offen · 2 geparkt/wartend · 16 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

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
**AL1** Aktivitätsliste mit Konto-Ereignissen füllen (gebaut, COMPLETE „N06") · **KE3** Aufräum-Lauf
für Profilbilder ohne Profil (gebaut, COMPLETE „N04") · **KU1** „kostenlos" und „Mitglieder" werden
eine Zugangsart (gebaut, COMPLETE „N03"); Kurs-Vorschauen bleiben auffindbar
(geschlossen) · **MM1** Likes unter geschlossenen Themen sperren; Übersetzen
nur für Mitglieder (beides gebaut, COMPLETE „N03") ·
**RW1** kein Notweg ohne GitHub, vier Stände reichen (beide geschlossen) ·
**BU1** Backup-Schlüssel bleibt in Davids zwei Passwort-Managern, keine zweite
Person (geschlossen); Einstellungs-Dateien ins Backup · **AR1** erledigte
Umzugs-Anleitungen ins Archiv · **IN1** Marken-Seiten durch dieselbe Prüfung
wie Artikel (gebaut, COMPLETE „N05") · **MG1** Datenbank-Rückstand melden, nicht aufhalten
(geschlossen) · **PB1** Migrations-Schlüssel dürfen Dateilisten lesen ·
**CI1** Dependabot 155 bis 157 übernehmen (erledigt) · **AB1** (erledigt am
2026-11-17) und **P29** beide Server-Einstellungen einschalten.

### Schritt 2 — Davids Klick-Runde auf den echten Seiten

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| KR1 | **Eine Sitzung, ein Test-Konto: alle offenen Klick-Proben am Stück.** Neun Proben aus AB1, PB1, MM1, SI1, SR1, KI1, RU1, SV1 und die Anmelde-Mail aus P29. Die Einzel-Einträge verweisen hierher. **Wartet auf:** nichts, nur auf Davids Zeit. | Mittel | S (eine Sitzung) | **Ja: selbst klicken** | [Liste](#kr1) |

### Schritt 3 — Baut Claude allein

**Zuerst (vor Stripe live):**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |

**Bündel „Ausliefern und Rückweg":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| CI1 | **Ausliefer-Weg: Nacharbeiten.** (a) Wächter-Zugang auf dem App-Server auf feste Befehle begrenzen, (b) Ausliefern über ein festes Skript, (c) Kleinigkeiten. **Wartet auf:** nichts. | Niedrig | M je Teil, (c) S | Nein (außer ein Klick je Site in Ploi) | [Einzelheiten](#ci1) |
| RW1 | **Rückweg: Nacharbeiten.** Nur noch Kleinigkeiten: ein manueller Start mit dem laufenden Stand, die Übung an einer App mit Datenbank wiederholen. **Wartet auf:** CI1 (b), weil das feste Skript beide Wege zusammenführt. | Niedrig | S | Nein | [Einzelheiten](#rw1) |
| MG1 | **Migrationen: Nacharbeiten.** (b) Ein Test des Rückweg-Skripts war auf `main` einmal ohne Grund rot — er zeigt jetzt Ausgabe und Exit-Code, die Ursache ist weiter offen (beobachten). (c) Zwei Reste: der tägliche Blick prüft je Layer nur eine Stelle; die lesenden Schlüssel laufen nie ab. **Wartet auf:** (b) den nächsten roten Lauf, (c) ein Ja. | Niedrig | S je Teil | **Ja: (c)** | [Einzelheiten](#mg1) |

**Bündel „Mails und Bremsen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| AB1 | **Anmelde-Bremse: Reste.** (a) Klick-Probe auf den echten Seiten: KR1. (f) Der Dev-Server warnt bei Node 22.18 (verlangt 22.21 oder neuer). Alles andere ist seit 2026-11-17 erledigt (COMPLETE „N02" und „N08"). **Wartet auf:** (a) Davids Zeit, (f) Davids Ja für ein neues Node auf dem Mac. | Niedrig | S je Teil | **Ja: (f)** | [Einzelheiten](#ab1) |
| SR1 | **Kleine Sicherheitsriegel: Reste.** (a) Klick-Probe: KR1. (b) Datenschutztext: DT1. Alles andere ist seit 2026-11-17 erledigt (COMPLETE „N02" und „N08"). **Wartet auf:** Davids Zeit (KR1) und seine Freigabe (DT1). | Niedrig | S | **Ja** | [Einzelheiten](#sr1) |

**Bündel „Fristen und Löschen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| EL1 | **Export und Löschung: Reste.** (b) Datenschutztexte: DT1. (d) Benachrichtigungen von vor dem 2026-11-15 behalten ihren Textauszug — ein einmaliger Lauf könnte ihn leeren (rund 50 Zeilen, nur im Projekt `account`). **Wartet auf:** (b) Davids Freigabe, (d) Davids Ja zu einem Lauf auf Production. | Niedrig | S | **Ja** | [Einzelheiten](#el1) |
| WH1 | **Gelöschte Marke zurückholen (Papierkorb)** auf branding.supply: Knopf „Marke löschen", 90 Tage unter „Gelöschte Marken", danach endgültig weg. Konten bleiben vorerst nicht zurückholbar (kommt mit PK1). **Wartet auf:** Davids Freigabe des Prototyps. | Mittel | M | **Ja: Prototyp freigeben, Lauf scharf schalten** | [Plan](plans/WIEDERHERSTELLUNG.md) |
| RU1 | **Runner: Reste.** (b) Den Auftragstext baut weiter der Browser (eingeschätzt: mittlerer Umbau, kein kleiner). (c) Der neue Lauf für nie beendete Läufe zählt nur — nach den ersten Zahlen scharf schalten. Klick-Probe (a): KR1. **Wartet auf:** (b) nichts, (c) Davids Ja zur gezählten Zahl. | Niedrig | (b) M, Rest S | **Ja: (c)** | [Einzelheiten](#ru1) |

**Umsetzung der Entscheidungen aus Schritt 1:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| MM1 | **Mitmachen nur für Mitglieder: Rest.** (a) Klick-Probe auf den echten Seiten: KR1. Alles andere ist erledigt oder bewusst so entschieden (COMPLETE „N03" und „N08"). **Wartet auf:** Davids Zeit. | Niedrig | S | **Ja: selbst klicken** | [Einzelheiten](#mm1) |
| IN1 | **Insights-Redaktion: Nacharbeiten.** (a) KI-Prüfung als eigener Knopf (Davids Wunsch, bewusst später), (c) vorhandene Marken-Seiten einmal öffnen und speichern (Handgriff im Dashboard, vor dem Freischalten von Profil, Duell und Ranking), (d) Kleinigkeiten. Klick-Probe (b) nach BI5. Die Prüfung der Marken-Seiten ist gebaut (COMPLETE „N05"), der Seed prüft sie mit (COMPLETE „N08"). **Wartet auf:** (a) Davids Startwort. | Niedrig | S bis M je Teil | **Ja: (a) Startwort** | [Einzelheiten](#in1) |
| PB1 | **Profilbild-Ablage: Nacharbeiten.** (b) Migrations-Schlüssel angleichen und Dateilisten lesen lassen (entschieden: nur lesen), (c) ein voller Lauf des Migrations-Runners baut an drei Tabellen um, (d) Kleinigkeiten. Klick-Probe (a): KR1. **Wartet auf:** (b) Davids Ja am Tag der Schlüssel-Änderung. | Mittel | S je Teil, (c) M | **Ja: (b) Schlüssel auf Production** | [Einzelheiten](#pb1) |
| BU1 | **Backup der Datenbank: Nacharbeiten** (hieß bis 2026-11-16 ebenfalls BK1). (b) Einstellungs-Dateien der Apps verschlüsselt ins nächtliche Backup (entschieden), (c) Übung jährlich wiederholen, (d) Kleinigkeiten. **Wartet auf:** nichts. | Mittel | je Teil S | Nein | [Einzelheiten](#bu1) |
| P29 | **Anmelde-Regeln auf Production: Reste.** Prüfung auf gestohlene Passwörter am Appwrite-Server einschalten (entschieden), je Projekt ein Schlüssel mit `policies`-Recht für den Skript-Lauf. Anmelde-Mail ansehen: KR1; Cookie-Satz: DT1. **Wartet auf:** Davids Ja am Tag der Umsetzung. | Mittel | S | **Ja: Server-Einstellung, Schlüssel** | [ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md) |

**Weitere Nacharbeiten:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| WA1 | **Alarm in die App hinein: Nacharbeiten.** Seit 2026-11-16 zählt der tägliche Wächter Fehler, Zeit-Läufe und KI-Ausfälle (COMPLETE „GA1 P22"). (a) Nach einer Woche Zahlen die Schwellen scharf stellen, die heute nur zählen, (c) Speichergrenze je Prozess, (d) Kundendomains aus dem Control Plane lesen, (e) Kleinigkeiten. Die Icon-Zeilen, Fehler außerhalb einer Anfrage und der Zahlungswarn-Lauf sind seit 2026-11-17 erledigt (COMPLETE „N09"). **Wartet auf:** (a) und (c) auf die Zahlen ab 2026-11-23. | Niedrig | S je Teil, (d) M | Nein | [Einzelheiten](#wa1) |
| SE1 | **Server-Einstellungen und Schutz-Kopfzeilen: Reste.** Seit 2026-11-17 sammelt jede App die Berichte der Skript-Regel ein, der tägliche Blick nennt die Zahl (COMPLETE „N07"). Offen: (a) eine Woche Zahlen ansehen, dann Nonces und scharf stellen, (b) „nur verschlüsselt" auch für Unter-Adressen, (c) den Umlauf der pm2-Logs nach dem ersten Umlauf ansehen, (d) Erinnerungen gesperrter Communities und Reste der alten Route, (e) Kleinigkeiten am Server. **Wartet auf:** (a) eine Woche Berichte, (c) den ersten Umlauf am 2026-11-19, (d) und (e) den Server-Termin ab 2026-11-30 (Davids Entscheidung vom 2026-11-17: die alte Einstellung und die alte Log-Datei gehen dann mit weg). | Niedrig | S je Teil | Nein | [Einzelheiten](#se1) |
| LL1 | **Lange Läufe: Reste.** (b) Der öffentliche Brand-Check rechnet noch in der Anfrage, (c) Kleinigkeiten, (d) fünf weitere Wege über der Wartezeit des Webservers, die der neue Fristen-Wächter kennt. Zeichen-Entwürfe, Vorbilder lesen und Fundament-Check laufen im Hintergrund (COMPLETE „N10"). **Wartet auf:** nichts. | Niedrig | M je Weg | Nein | [Einzelheiten](#ll1) |
| SV1 | **Schreiben nur über den Server: Reste.** Der tägliche Wächter prüft seit 2026-11-17 die Anmelde-Wege der vier Projekte von außen (COMPLETE „N07"). Offen: (a) eine Klick-Probe auf den echten Seiten, (b) den Schalter „JWT" ausschalten, (c) das direkte Lesen, (d) Kleinigkeiten. **Wartet auf:** (a) auf Davids Zeit (KR1), (b) ein Klick je Projekt, (c) auf das Pukalani-Konto. | Mittel | S je Teil | (a) Ja: selbst klicken · (b) Ja | [Einzelheiten](#sv1) |
| BP1 | **Betreiber-Dashboard und gemeldete Nachrichten: Reste.** (a) Ein Klick auf der echten Seite, (b) Zahlen des Protokoll-Zählers nach einer Woche ansehen, (d) Kleinigkeiten (eigene Spalte für den Zeitpunkt der Erledigung). Löschen im Speicher, die Schalter und die Konfig-Seite sind seit 2026-11-17 erledigt (COMPLETE „N06" und „N08"). **Wartet auf:** (a) Davids Klick. | Niedrig | S je Teil | **Ja: (a)** | [Einzelheiten](#bp1) |
| PD1 | **Plan, Testphase und eigene Domain: Reste.** (a) Den Stripe-Endpunkt beim Wechsel auf echtes Geld neu anlegen, (b) Klicks auf den echten Seiten, (c) drei Grundsatzfragen mit Empfehlung und Kleinigkeiten. Namen der Alt-Pläne und „Mail erneut senden" im Wizard sind seit 2026-11-17 gebaut (COMPLETE „N06"). **Wartet auf:** (a) auf A2, (b) auf Davids Zeit. | Niedrig | S je Teil | **Ja: (b) selbst klicken** | [Einzelheiten](#pd1) |
| KK1 | **Kleine Korrekturen in Events, Seiten, Statistik: Reste.** (b) Die Statistik an einer echten Community mit eigener Zähl-Seite klicken; schon gespeicherte Kennungen sind nie geprüft worden. (c) Die Zahlen des Seiten-Kontingents stehen nicht im Katalog des Control Plane (bewertet: braucht einen Umbau der Plan-Route und Zahlen in der echten Datenbank), ein halb gescheitertes Ausblenden lässt sich in der Oberfläche nicht nachholen. Alles andere ist seit 2026-11-17 erledigt (COMPLETE „N03" und „N08"). **Wartet auf:** (b) Davids Zeit, (c) ein Ja, falls die Zahlen in den Katalog sollen. | Niedrig | S je Teil | Nein | [Einzelheiten](#kk1) |
| SI1 | **Sicherungen: Reste.** (b) Bekannte Grenzen des Label-Abgleichs, (c) Lint-Lauf schneller machen, (d) Kleinigkeiten. Klick-Probe (a): KR1. Der Abgleich findet seit 2026-11-17 auch stillgelegte Communities und Herabstufungen (COMPLETE „N06"). **Wartet auf:** (c) auf CI1. | Niedrig | S je Teil | Nein | [Einzelheiten](#si1) |
| KI1 | **KI-Schutz: Nacharbeiten.** (d) Kleinigkeiten, darunter das Kennzeichen am Feldwert eines abgeschnittenen Entwurfs (liegt in der Seite des Markenberaters, baubar nach N10). Klick-Probe (a): KR1; Datenschutztexte (b): DT1. Die Modell-Prüfung beim Speichern ist gebaut (COMPLETE „N05"). **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](#ki1) |
| AR1 | **Aufräumen: Reste.** (a) Die Adresse `changelog.pukalani.app` bei Cloudflare löschen, (d) Kleinigkeiten, (e) vier Hinweise zu Abhängigkeiten bleiben offen (einer ist seit 2026-11-17 geschlossen, COMPLETE „N09"). **Wartet auf:** (a) David; (e) auf neue Ausgaben der Pakete, ein kleines Update ab dem 2026-11-20. | Niedrig | S | **Ja: (a) ein Klick bei Cloudflare** | [Einzelheiten](#ar1) |
| BT1 | **Tests über den echten Kundenpfad: Nacharbeiten.** Seit 2026-11-17 laufen 61 von 83 Beweis-Skripten von selbst, und acht weitere Layer haben Rollen-Tests für jede Route (COMPLETE „N09"). Offen: (a) 12 Skripte brauchen branding.supply als laufenden Server, drei E2E-Dateien passen noch in den Nacht-Lauf, (b) 85 Routen stehen noch ohne Rollen-Test im Bestand, (c) ab dem 2026-12-01 neu entscheiden, ob der Bühnen-Lauf Pflicht wird, (d) Kleinigkeiten und vier Stellen zum Bewerten. **Wartet auf:** (c) zwei Wochen Beobachtung. | Niedrig | M je Teil | Ja: (c) im Dezember eine Entscheidung | [Einzelheiten](#bt1) |

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

**A1 → A2 → BS1 Bezahlweg → Preis für Brand Book & Kit → F7.** VT1 gehört vor
den ersten zahlenden Kunden, also vor A2.

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| VT1 | **Vertretung benennen.** Heute landet jeder Alarm nur bei David. Das Notfallblatt (deutsch und englisch) und die Handgriffe für eine zweite Alarm-Adresse sind vorbereitet (COMPLETE „GA1 P24"); eingetragen ist niemand. Offen: eine Person benennen, die Handgriffe erledigen, einmal mit ihr proben; dazu (b) die Mail für Meldungen von außen. **Wartet auf:** David (wer). | Hoch | S | **Ja: Person, Ja je Einstellung** | [PRODUKTIONS-ALARM.md § 5](runbooks/PRODUKTIONS-ALARM.md) · [Einzelheiten](#vt1) |
| A2 | **Stripe auf echtes Geld umstellen — über die F55-Seite.** Bei David: Bank-Aktivierung, Steuer-Registrierung, Live-Key eintragen, Portal-Konfiguration; alles andere klickt die Seite. **Wartet auf:** A1. Vorbedingung für BS1 Z1. | Hoch | S | **Ja: Bank, Konto, Portal** | [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) · [Notiz](#a2a) |
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
9. **Anmeldung per Code und neue Community** — auf `account.pukalani.app`
   einen Code anfordern und damit anmelden; beim Anlegen einer Community das
   Kästchen der Betreiber-Bedingungen ansehen ([SV1 a](#sv1)).

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
  war er grün, lokal nicht nachstellbar. Die Ursache ist NICHT gefunden. Seit
  dem 2026-11-17 schreibt der Test bei einem Fehlschlag je Skript-Lauf
  Exit-Code, Signal, Dauer, ob der Prozess überhaupt startete, und die Ausgabe
  ins Protokoll. Kommt es wieder: dort lesen, dann die Ursache suchen. Gehört
  zu [RW1](#rw1).
- **(c) Zwei Reste.** (1) Die Probe je Layer sieht nur Tabellen und Spalten,
  keine Indizes, Rechte oder Daten, und je Layer nur die jüngste ablesbare
  Stelle. Der Baustein für mehr ist da: seit P20 liest
  `scripts/lib/migration-inventory.mjs` alle Spalten aus den Migrationen.
  Angeschlossen ist er an den täglichen Blick NICHT — der vergleicht Spalten
  bewusst nur für wenige Tabellen, weil ältere Instanzen erklärbar abweichen.
  Zu tun: einmal auf Production zählen, wie viele Spalten vom Soll abweichen
  (nur lesen, Davids Ja), dann entscheiden, ob der Blick spaltengenau prüft.
  (2) Die vier lesenden Schlüssel `watch-schema-readonly` (je Projekt einer,
  in der GitHub-Umgebung `production-watch`) haben kein Ablaufdatum. Zu tun,
  falls gewünscht: je Projekt einen neuen Schlüssel mit Ablauf anlegen, das
  Secret tauschen (`gh secret set --env production-watch`), den alten
  löschen, den Termin notieren. Ein abgelaufener Schlüssel macht den Blick rot,
  nicht blind. Braucht Davids Ja und seinen Klick in der Appwrite-Verwaltung.
- **(d) Nebenbei gefunden (2026-11-17).** `.claude/rules/appwrite.md` sagt
  noch „lokal heißt das Dev-Projekt weiterhin `pool`"; seit dem Spiegel vom
  2026-11-09 heißen die lokalen Projekte `account` und `admin`. Satz
  anpassen und die Rückfälle auf `pool` in den Beweis-Skripten prüfen.

<a id="ab1"></a>

**AB1 — Anmelde-Bremse: Reste (aus dem Gesamtaudit, Paket P02).**
Die Teile (b) bis (e), (g) und die Kleinigkeiten aus (f) sind am 2026-11-17
erledigt (COMPLETE „N02" und „N08"). Übrig:

- **(a) Klick-Probe auf Live.** Steht in der Klick-Runde ([KR1](#kr1)).
- **(f) Node auf dem Mac.** Der Dev-Server warnt bei Node 22.18 (verlangt 22.21
  oder neuer); die Prüfungen laufen damit trotzdem grün. Ein neues Node ist
  eine Änderung auf Davids Mac — deshalb sein Ja.

<a id="sr1"></a>

**SR1 — Kleine Sicherheitsriegel: Reste (aus dem Gesamtaudit, Paket P25).**
Teil (c) und (d) sind am 2026-11-17 erledigt bzw. entschieden (COMPLETE „N02"
und „N08"). Übrig:

- **(a) Klick-Probe auf Live.** Auf branding.supply einmal das
  Erstgespräch-Formular und einmal die Warteliste abschicken (eigene Adresse).
  Erwartet: das Feld der Bot-Prüfung erscheint, die Anfrage geht durch, die
  Bestätigung kommt ohne den eigenen Text. Lokal ist beides mit eingeschalteter
  Bot-Prüfung geklickt und gezählt; auf Production wurde nichts abgeschickt.
  Steht in der Klick-Runde ([KR1](#kr1)).
- **(b) Datenschutztext.** Der Text von branding.supply nennt die Bot-Prüfung
  für Registrierung, Passwort zurücksetzen und Kommentare. Seit 2026-11-15
  steht sie auch am Erstgespräch und an der Warteliste. Zu tun: die zwei
  Formulare im Text ergänzen (`apps/branding/scripts/legalPrivacyInterim.ts`,
  de und en) — Rechtstext, deshalb Davids Freigabe ([DT1](#dt1)).

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
- **(d) Alte Textauszüge.** Benachrichtigungen zu Kommentaren und Erwähnungen,
  die VOR dem 2026-11-15 entstanden, behalten ihren Textauszug, auch wenn der
  Kommentar gelöscht wird (neue werden mit aufgeräumt; die Funktion dafür
  liegt seit 2026-11-17 im Core, COMPLETE „N08"). Sie tragen eine zufällige
  Kennung und lassen sich keinem Kommentar zuordnen. Gezählt im lokalen
  Spiegel (Stand 2026-11-09): 52 solche Zeilen im Projekt `account`, keine in
  `admin`, `branding` und `portfolio`. **Empfehlung:** ein einmaliger Lauf, der
  bei genau diesen Zeilen den Auszug leert (die Meldung selbst bleibt, „X hat
  geantwortet" steht weiter da) — erst zählen, dann leeren. Das ändert echte
  Daten und braucht Davids Ja; ohne den Lauf verschwinden die Auszüge erst,
  wenn der Empfänger die Meldung löscht oder sein Konto geht. Erinnerungen an
  einen Termin nennen dessen alten Titel (so belassen: der Titel war zum
  Zeitpunkt der Erinnerung richtig).
  Referenz: [EXPORT-UND-LOESCHUNG.md](referenz/EXPORT-UND-LOESCHUNG.md).

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
  Sauberer wäre, der Server baute ihn aus der Ticket-Zeile. Eingeschätzt am
  2026-11-17: kein kleiner Umbau. Der Zusammenbau (`TicketModalRunner.vue`)
  und der Checklisten-Leser (heute nur im Browser, eine zweite Fassung in
  `ticketTriage.ts`) müssten nach `packages/tickets/shared/` ziehen, der
  Vertrag `resolveRunSubjectTrust` den Text mitliefern (nur `apps/control`
  kennt beide Layer), die Anlege-Route ihn nicht mehr aus der Anfrage nehmen;
  dazu ein Rollen-Test für die Anlege-Route. Rund sechs Dateien plus Tests.
- **(c) Nie beendete Läufe: scharf schalten.** Seit dem 2026-11-17 gibt es
  den Lauf `stale-run-retention` (COMPLETE „N08"): ein Lauf, der 7 Tage kein
  Lebenszeichen zeigt und nie endete, wird wie mit dem Abbrechen-Knopf
  beendet. Er steht in `apps/control` auf `count` und ZÄHLT NUR. Zu tun: die
  Zahl in der Log-Zeile `retention.run` (job `stale-run-retention`) ansehen,
  dann mit Davids Ja `staleRunRetention: 'apply'` setzen. Im lokalen Spiegel
  (Stand 2026-11-09) gab es keinen solchen Lauf. Ohne Frist bleiben auf dem
  Rechner die Arbeits-Zweige alter Läufe und das Log des Dienstes (Davids
  Mac, kein Auftrag).

<a id="mm1"></a>

**MM1 — Mitmachen nur für Mitglieder: Reste (aus dem Gesamtaudit, Paket P05).**
Erledigt seit 2026-11-17 (COMPLETE „N03"): Übersetzen nur für Mitglieder,
Likes und Reaktionen unter geschlossenen Themen gesperrt, keine
Benachrichtigungen mehr an entfernte Personen.

Bewusst so entschieden am 2026-11-17 (COMPLETE „N08"): die Kleinigkeiten aus
(e).

- **(a) Klick-Probe auf Live, zweiter Teil.** Geklickt ist seit dem
  2026-11-15 das Schreiben als Mitglied (Kommentar, Stimme; zusagen ging
  nicht, die Demo hat keine kommenden Termine). Offen: auf einer Community ein
  Test-Konto einladen, wieder entfernen und mit ihm die Community öffnen:
  Hinweisseite, eine Nachricht an die Leitung (Mail und Glocke beim Owner),
  neue Einladung annehmen. Das braucht Owner und Test-Konto zugleich. Seit
  N03 gehört dazu: nach dem Entfernen auf einen alten Kommentar des
  Test-Kontos antworten — es darf keine Mail mehr bekommen.

<a id="in1"></a>

**IN1 — Insights-Redaktion: Nacharbeiten (aus dem Gesamtaudit, Paket P19).**
Gebaut am 2026-11-17 (COMPLETE „N05"): Marken-Seiten laufen durch dieselbe
Prüfung wie Artikel, die KI-Wege der Redaktion stehen in der Bremsen-Liste,
der Kasten der Prüfregeln sagt an einem öffentlichen Artikel das Richtige.

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
  dahinter gefahren. Dazu seit N05: eine Marke mit einem unbelegten Zitat auf
  „Veröffentlicht" stellen (erwartet: „Nicht gespeichert", der Punkt steht in
  der Liste) — lokal geklickt, auf Live nicht.
- **(c) Vorhandene Marken-Seiten.** Marken, die schon vor der neuen Prüfung
  auf „veröffentlicht" standen, sind nicht nachgeprüft. Eine davon lässt sich
  erst wieder als „veröffentlicht" speichern, wenn sie die Regeln erfüllt (als
  Entwurf und „entfernt" geht immer). Vor dem Freischalten von Profil, Duell
  und Ranking deshalb jede veröffentlichte Marke einmal öffnen und speichern.
  Das Skript `seed-launch.mjs` schreibt Marken als Entwurf und prüft sie
  seit dem 2026-11-17 vorher mit denselben Regeln (COMPLETE „N08").
- **(d) Kleinigkeiten.** Das Datum eines Hinweises ist der Kalendertag in
  UTC. Ein Artikel, der eine heute geltende Regel verletzt (etwa vor Regel 7
  veröffentlicht), lässt sich erst wieder speichern, wenn er sie erfüllt oder
  zurückgezogen ist — vor dem ersten Veröffentlichen auf Production also
  einmal alle Entwürfe durch „In die Redaktion geben" schicken. Die zwei
  lesenden Marken-Routen haben noch keinen Rollen-Test (stehen im Bestand).

<a id="pb1"></a>

**PB1 — Profilbild-Ablage: Nacharbeiten (aus dem Gesamtaudit, Paket P01).**
Abgeglichen am 2026-11-13 mit dieser Liste, den Audit-Paketen und den laufenden
Sitzungen: an keinem der Punkte unten wird gerade gearbeitet. Schon woanders
eingeplant und deshalb NICHT hier: der Wächter für Rechte an TABELLEN (Paket
P13, „Schreiben nur noch über den Server") und hochgeladene Bilder, die
ohne gespeichertes Profil liegen bleiben (KE3, gebaut am 2026-11-17 — COMPLETE „N04"). Beim Abgleich erledigt: der echte
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

<a id="pd1"></a>

**PD1 — Plan, Testphase und eigene Domain: Reste (aus dem Gesamtaudit, Paket P15).**
Gebaut am 2026-11-17 (COMPLETE „N06"): die zwei Alt-Pläne im Kasten „Pläne &
Limits" haben Namen, und der letzte Schritt des Wizards zeigt bei einer
unbestätigten Adresse den Kasten mit „Mail erneut senden".

- **(a) Stripe-Endpunkt neu anlegen.** Der vorhandene Endpunkt (Testbetrieb)
  sendet in der Standard-Version des Stripe-Kontos; die feste Version bekommt
  ein Endpunkt nur beim Anlegen. Davids Entscheidung vom 2026-11-17: beim
  Wechsel auf echtes Geld (A2) — dort wird der Endpunkt für den echten Betrieb
  ohnehin über `admin.pukalani.app` → Stripe neu angelegt und bekommt die
  Version von selbst; die Karte zeigt, ob sie stimmt. Danach können die zwei
  Stellen fallen, die beide Formen eines Ereignisses lesen
  (`current_period_end`, Abo-Verweis der Rechnung).
- **(b) Klicks auf den echten Seiten.** Lokal belegt, auf Production nicht
  geklickt: der Wizard mit einem Konto, das seine Testphase schon hatte
  („Ohne Testphase"); der Schalter „freigegeben" in der Betreiber-Tabelle; die
  Domain-Seite eines Owners ohne Freigabe. Neu dazu: der Wizard mit einem
  Konto ohne bestätigte Adresse (Kasten und Knopf erscheinen).
- **(c) Drei Grundsatzfragen, je mit Empfehlung.**
  (1) Der Hinweis zur Domain steht in der Glocke unter „Zahlungsproblem" (Art
  `billing`). Empfehlung: so lassen, bis der erste echte Fall zeigt, dass der
  Titel verwirrt; eine eigene Art kostet einen Text je Sprache im Core.
  (2) Beitritt und Annahme einer Einladung sind unter gleichzeitigen Anfragen
  nicht geprüft. Empfehlung: die Sperre `team` nehmen (`withControlLock`),
  sobald Beitritte in Zahl kommen; doppelte Zeilen verhindert heute schon der
  Unique-Index. (3) Die Kontolöschung im Control Plane nimmt die Team-Sperre
  nicht. Empfehlung: beim nächsten Griff an die Kontolöschung mitnehmen.
- **(c) Kleinigkeiten.** Der Schonfrist-Lauf ist seit 2026-11-17 scharf
  (Runbook: [EIGENE-DOMAIN-FREIGABE.md](runbooks/EIGENE-DOMAIN-FREIGABE.md));
  die erste echte Frist und die ersten echten Hinweis-Mails stehen noch aus —
  beim ersten Fall die Mail im Postfach ansehen. Ein Eintrag im Zustand
  „Fehler", der schon einmal einen Nachweis hatte, verfällt nie. Die eigene
  Domain der Einzel-Sites (`websites`) behält die alte Regel: jeder Eintrag
  blockiert, auch ohne Nachweis. Der Schalter „freigegeben" kann fallen,
  sobald das Pukalani-Konto je Seite eine eigene Sitzung ausstellt (Etappe E1).

<a id="kk1"></a>

**KK1 — Kleine Korrekturen in Events, Seiten, Statistik: Reste (aus dem Gesamtaudit, Paket P28).**
Erledigt seit 2026-11-17 (COMPLETE „N03"): zweite Erinnerung nach dem
Verschieben, „bezahlt" an einem Termin prüft auch der Server, die Zahlen
fragen die Adresse aus der Zähl-Datei ab, ein Zeitpunkt wird nur noch bei
Erinnerungen gelesen, eine Liste der Betreiber-Ziele.

- **(b) Statistik.** Die Prüfung der Zähl-Kennung und das neue Ziel der
  Zahlen sind mit Tests am echten Handler belegt, aber noch an keiner echten
  Community mit eigener Zähl-Seite geklickt (Kennung speichern, Zahlen-Seite
  öffnen — am besten mit einer Seite, die in Plausible unter der `www`-Adresse
  liegt). Schon gespeicherte Kennungen werden nicht nachträglich geprüft; eine
  fremde Kennung aus der Zeit davor zeigt keine fremden Zahlen (gefragt wird
  dann die eigene Adresse), zählt aber weiter dorthin.
- **(c) Kleinigkeiten.** Das Nachholen eines halb gescheiterten Ausblendens
  (Termine) geht über die Route, die Oberfläche bietet es an einem schon
  ausgeblendeten Termin nicht an — sie kann den halben Zustand nicht erkennen.
  Die Zahlen des Seiten-Kontingents stehen nur in der Konfiguration der
  Platform-App, nicht im Katalog des Control Plane. Bewertet am 2026-11-17:
  das wirkt heute richtig (fehlt eine Art im Katalog, gilt die Zahl aus der
  Konfiguration). Für den Katalog bräuchte es zweierlei: die Plan-Route
  (`plans/[key].patch.ts`) schreibt heute die ganze Grenzen-Zeile neu und
  löschte einen Seiten-Eintrag beim nächsten Speichern der Kommentar-Grenzen
  — sie müsste zusammenführen, und die Seite bräuchte Felder je Art; dazu die
  Zahlen einmal in die drei Plan-Zeilen der echten Datenbank (Davids Ja).
  Empfehlung: erst bauen, wenn die Zahl je Plan verschieden sein soll. Die
  drei Verwaltungs-Routen der Seiten haben noch keinen Rollen-Test (stehen im
  Bestand, BT1 b); ein solcher Test belegt dann auch den Hinweis der Liste
  und den Fehler beim unvollständigen Löschen.

<a id="bp1"></a>

**BP1 — Betreiber-Dashboard und gemeldete Nachrichten: Reste (aus dem Gesamtaudit, Paket P16).**
Erledigt am 2026-11-17 (COMPLETE „N06"): die Speicher-Seite löscht nur noch
Profilbilder, Produkt-Schalter und Theme-Einstellungen überschreiben einander
nicht mehr, das Beweis-Skript der Nachrichten läuft gegen den lokalen Spiegel.

- **(a) Klick auf der echten Seite.** Als Betreiber im Dashboard unter
  „Personen": die Liste exportieren (kommt als Datei), nach mehr als zehn
  Minuten noch einmal — dann erscheint „Zur Sicherheit neu anmelden", und nach
  der Anmeldung geht es auf derselben Seite weiter. Lokal belegt, auf
  Production noch nicht geklickt. Dazu einmal ein Konto öffnen: die Karte
  „Aktivität" zeigt jetzt Einträge.
- **(b) Zähler des Protokolls.** Der tägliche Kontroll-Lauf berichtet
  `protokoll ausfaelle` je App und wird ab 3 in 25 Stunden rot. Die Schwelle
  ist gesetzt, nicht gemessen: nach einer Woche die berichteten Zahlen ansehen
  (zusammen mit WA1).
- **(d) Kleinigkeiten.** Der Zeitpunkt der Erledigung einer Meldung ist das
  `$updatedAt` ihrer Zeile: ein späterer Schreibvorgang an einer erledigten
  Meldung lässt die 90 Tage neu beginnen. Eine eigene Spalte machte es genau,
  braucht aber eine Migration auf Production. Empfehlung: erst bauen, wenn
  eine Route erledigte Meldungen beschreibt (heute hält der Fehler Daten nur
  länger, nie kürzer). Der Lösch-Lauf liest je Takt höchstens 2.000 gemeldete
  Nachrichten. Die Schreib-Kette für `app_config` gilt je Prozess. Betreiber-Routen sind weiter an keinen Host
  gebunden — das gehört zum Pukalani-Konto (PK1).

<a id="vt1"></a>
**VT1 — Vertretung benennen (aus dem Gesamtaudit, Paket P24, OPS-010).**

- **(a) Die Person.** Sobald David jemanden hat: Namen und Nummern ins
  Notfallblatt (liegt privat bei David, nicht im Repo; entschieden am
  2026-11-17: Ausdruck bei der Vertretung, Notiz im Passwort-Tresor), dann
  die Handgriffe aus [PRODUKTIONS-ALARM.md](runbooks/PRODUKTIONS-ALARM.md),
  § 5 (Alarm-Mail, UptimeRobot, healthchecks.io), dann die Probe mit einem
  Probealarm. Entschieden: Die Vertretung soll zuerst nur Bescheid wissen;
  eigene Zugänge erst, wenn die Person feststeht.
- **(b) Mail für Meldungen von außen — braucht Davids Ja.**
  `NUXT_ALERT_EMAIL` ist auf keiner Site gesetzt (nachgesehen am 2026-11-17).
  Missbrauchs-Meldungen, Zugangs-Anfragen und Statuswechsel der Kunden-Sites
  erreichen deshalb heute niemanden per Mail, nur die Glocke im Dashboard.
  Setzen heißt: eine Zeile in der Server-Datei der Betreiber-Seite, neu
  laden, eine Probe-Meldung.
- **(c) Vorschlag, nicht entschieden:** ein Wort am Tor des Appwrite-Servers,
  das `docker compose up -d` fährt. Heute kann eine Vertretung ohne
  Server-Zugang den häufigsten Ausfall (Appwrite steht nach einem Update)
  nur ansehen, nicht beheben.
- **(d) Lücken in den neuen Runbooks:** kein Tausch-Rezept für den
  Laufzeit-Schlüssel einer Site und für `_APP_OPENSSL_KEY_V1`, keine Übung
  eines Sicherheitsvorfalls, keine `security.txt`
  ([SICHERHEITSVORFALL.md](runbooks/SICHERHEITSVORFALL.md), § 5); Fristen
  für Anfragen von außen gehören in den Anwaltstermin, und die Kunden-Hilfe
  beschreibt „Konto löschen" nicht
  ([ANFRAGEN-VON-AUSSEN.md](runbooks/ANFRAGEN-VON-AUSSEN.md), § 6).
- **(e) Kleinigkeiten:** `scripts/ops/uptimerobot-sync.mjs` trägt neue
  Kontakte an bestehende Monitore nicht nach; die Stripe-Runbooks brauchen
  mit A2 einen Abschnitt „Zahlung kommt nicht an" für den Echtbetrieb.

<a id="wa1"></a>

**WA1 — Alarm in die App hinein: Nacharbeiten (aus dem Gesamtaudit, Paket P22).**

- **(a) Schwellen scharf stellen.** Rot wird heute nur, was eindeutig ist
  (Zeit-Lauf überfällig, KI ohne Guthaben oder ohne Endpunkt, Server-Fehler
  auf `platform` ab 25 in 25 Stunden). Nur gezählt werden: Server-Fehler auf
  admin, branding, portfolio, Landing und Hilfe (das Protokoll ist dort erst
  seit dem 2026-11-16 an), Fehler aus dem Browser und übrige KI-Ausfälle. Ab
  dem 2026-11-23 die Zeilen „Nur gezählt" der täglichen Läufe ansehen und in
  `scripts/ops/app-signals-rules.mjs` (`RULES`) je App eine Zahl eintragen.
- **(b) erledigt am 2026-11-17** (`NUXT_REDIS_URL` auf branding.supply, COMPLETE
  „N02").
- **(c) Speichergrenze je Prozess.** Die pm2-Dateien kennen keine
  (`max_memory_restart`). Ein zu knapper Wert startete eine Seite im Kreis
  neu, deshalb erst mit Messwerten: der tägliche Lauf berichtet den Speicher je
  Prozess. Gemessen am 2026-11-16: fünf Apps 99 bis 182 MB, `platform` 291 MB
  kurz nach dem Start und 555 MB nach gut einer Stunde (Rechner: 3,8 GB).
- **(d) Kundendomains aus dem Control Plane lesen.** Die Host-Listen des TLS-
  und des Health-Wächters sind von Hand gepflegt; eine neue Kundendomain steht
  dort erst, wenn jemand sie einträgt. Braucht eine lesende Route mit
  Geheimnis und ein Secret bei GitHub.
- **(e) Kleinigkeiten.** Erledigt am 2026-11-17 (COMPLETE „N09"): die Zeilen
  „[Icon] failed to load" (Ursache behoben), Fehler außerhalb einer Anfrage
  (zählbare Zeile `server.error` mit `source: process`), der Lauf
  `past-due-notice` meldet „schon im Gange" als übersprungen. Offen: Das
  Guthaben bei OpenRouter lässt sich nicht im Voraus prüfen (nur mit einem
  Verwaltungs-Schlüssel) — gemeldet wird der erste abgelehnte Aufruf. Der
  Mail-Blick liest im Log-Ordner auch Dateien früherer Prozess-Nummern mit (das
  Zeitfenster hält ihn richtig). Auf dem Appwrite-Server liegen die
  Sicherungen `*.vorher-p22` (nach zwei Wochen löschen). Im Log-Ordner der
  Platform-App liegt noch die Datei einer früheren Prozess-Nummer mit rund
  263.000 Icon-Zeilen (nur Platz; mit dem Aufräumen am 2026-11-30 löschen).
  Fehler außerhalb einer Anfrage zählen als Server-Fehler mit — wenn die
  Schwellen in (a) gesetzt werden, die Zeilen mit `source: process` einmal
  getrennt ansehen.

<a id="se1"></a>

**SE1 — Server-Einstellungen und Schutz-Kopfzeilen: Reste (aus dem Gesamtaudit, Paket P23).**
Erledigt am 2026-11-17 (COMPLETE „N07"): die Annahme-Route für die Berichte
der Skript-Regel samt Zahl im täglichen Blick, die tote Erinnerungs-Route,
das Zähl-Skript für umgelaufene Logs, die eigene Domain für Stripe-Rückwege
und den Link im Kommentar-Bereich.

- **(a) Skript-Regel (CSP) scharf stellen.** Die Regel beobachtet weiter nur.
  Nächste Schritte, in dieser Reihenfolge: (1) eine Woche lang im täglichen
  Blick die Zahl „Skript-Regel" je App lesen und jeden Bericht ansehen
  (`grep '"event":"csp.report"'` im Fehler-Log der App) — jede bekannte
  fremde Quelle gehört in `knownScriptOrigins()`; (2) Nonces statt
  `'unsafe-inline'`, weiter beobachtend — mit Absicht erst danach: mit Nonces
  meldet der Browser auch jedes Skript, das eine Erweiterung direkt in die
  Seite schreibt, als `inline` ohne erkennbare Quelle, und das begrübe die
  erste Messung; (3) scharf stellen, wenn eine Woche keinen echten Verstoß
  zeigt (Davids Entscheidung). Nicht geprüft: Firefox und Safari.
- **(b) HSTS auch für Unter-Adressen.** Gesendet wird ein Jahr, je Host, ohne
  `includeSubDomains`. Für `pukalani.app` ginge der Zusatz erst, wenn JEDE
  Unter-Adresse der Zone sicher per HTTPS antwortet (auch die, die nicht diese
  App bedient). Kundendomains bleiben ohne. Lässt sich nicht zurücknehmen
  (Browser merken es sich ein Jahr) — nur mit Davids Entscheidung.
- **(c) Umlauf der pm2-Logs: nach dem ersten Umlauf nachsehen.** Eingeschaltet
  am 2026-11-17 mit Davids Ja (zweiter Block in
  `ops/logrotate-admin-access.conf`, gefahren vom vorhandenen Zeitplan um
  03:12). Die erste Nacht merkt sich die Dateien nur, gedreht wird ab der
  zweiten (2026-11-19). Offen ist nur der Blick danach: der tägliche Wächter
  am Morgen muss grün bleiben und jeden Zeit-Lauf nennen; auf dem Server liegt
  je Log eine Datei `.1` ([PRODUKTIONS-ALARM.md](runbooks/PRODUKTIONS-ALARM.md), „Umlauf
  der pm2-Logs"). Die 59 MB große Alt-Datei einer früheren Prozess-Nummer
  läuft einmal um; ihre Kopie kann von Hand weg.
- **(d) Erinnerungs-Lauf.** Die Route ist aus dem Code. Auf dem Server liegen
  noch die Einstellung `NUXT_EVENTS_SWEEP_KEY` und die Datei
  `~/events-sweep.log` — sie gehen am Server-Termin ab 2026-11-30 mit weg
  (Davids Entscheidung vom 2026-11-17, zusammen mit den Sicherungen aus e). Auswahl, Text und
  Schlüssel-Sorte `events-sweep` sind seit 2026-11-17 aus dem Code (COMPLETE
  „N08"); in der Tabelle `instance_secrets` des Projekts kann noch eine Zeile
  dieser Sorte liegen — niemand liest sie mehr, sie kann am selben Termin mit
  weg. Der Zeit-Lauf `event-reminders`
  erinnert auch in einer Community, die wegen Missbrauchs vom Netz genommen
  ist (der Link in der Erinnerung führt dann auf eine Seite, die es nicht
  gibt). Bewertet: der PLAN spielt keine Rolle (eine Erinnerung ist kein neuer
  Inhalt, und eine Zahlungs-Sperre soll sie laut Code-Kommentar nicht
  verschlucken) — nur die Sperre wegen Missbrauchs und das Stilllegen.
  Empfehlung: ein Vertrag im Core wie `resolveCommunityHosts`, der für eine
  Liste von Communities die NICHT erreichbaren nennt (stillgelegt oder wegen
  Missbrauchs gesperrt), bedient vom Control Plane mit derselben Abfrage;
  ohne Antwort wird erinnert. Der vorhandene Vertrag reicht dafür nicht: er
  unterscheidet „nicht erreichbar" nicht von „keine Antwort".
- **(e) Kleinigkeiten.** Sicherungen nach zwei Wochen löschen (ab 2026-11-30):
  auf dem App-Server `/home/ploi/logs/nginx/*.vorher-p23*` und
  `/home/ploi/portfolio.pukalani.app/.env.vorher-p23*`, auf dem Appwrite-Server
  `~/bin/pukalani-cert-gate.sh.vorher-p23` und `~/ops/crontab.vorher-p23`; im
  Ploi-Panel das Skript „P23: nginx-Zugriffs-Log 14 Tage". Auf `pukalani.app`
  liefert Cloudflare unveränderte Dateien noch mit den Kopfzeilen des alten
  Webservers aus (löst sich mit dem nächsten Build der Landing). Auf `admin`
  beantwortet der Webserver `/robots.txt` und `/favicon.ico` selbst mit 404
  (zwei leere Blöcke aus Plois Schablone). Zwei Sites senden
  `Connection 'upgrade'` fest. Die Umleitungs-Blöcke des Webservers schreiben
  weiter ins allgemeine Zugriffs-Log (jetzt 14 Tage). Der Vergleich der
  Webserver-Einstellung läuft nur auf dem App-Server (der Appwrite-Server hat
  seinen Webserver im Container).
- **(f) Eigene Domain einer Einzel-Site.** Offen, wer mag: auf pukalani.studio
  einmal „Passwort vergessen" mit der eigenen Adresse auslösen — der Link muss
  mit `https://pukalani.studio` beginnen. Die Stripe-Rückwege sind nur mit
  gestellten Stripe-Antworten geprüft.

<a id="ll1"></a>

**LL1 — Lange Läufe: Reste (aus dem Gesamtaudit, Paket P18).**
Gebaut am 2026-11-17 (COMPLETE „N05"): Radar-Knopf im Hintergrund,
Video-Brief unter der Lauf-Sperre, Lebenszeichen der zwei Berater-Streams.
Gebaut am 2026-11-18 (COMPLETE „N10"): Zeichen-Entwürfe, Vorbilder lesen und
Fundament-Check rechnen im Hintergrund (Lauf-Tabelle `brand_runs`); ein
Wächter hält je Route die Summe ihrer Fristen gegen die Wartezeit des
Webservers (`packages/core/tests/routeDeadlineBudget.test.ts`).

- **(b) Der öffentliche Brand-Check rechnet noch in der Anfrage** (Website
  lesen und urteilen, zusammen bis rund 120 s; üblich viel schneller). Er ist
  der Trichter von branding.supply und läuft ohne Konto. Empfehlung für den
  Umbau, in dieser Reihenfolge: (1) die Mechanik in `brandCheckRun.ts` in
  drei Schritte teilen (Zwischenspeicher und Vorprüfung, Buchung, Ausführung)
  — der Marktvergleich ruft weiter alle drei in einem Zug; (2) die Route
  nimmt die Lauf-Sperre (Art `check` in `brand_runs`, Gegenstand = Hash der
  Adresse) VOR der Buchung und antwortet `202` mit einem Kennzeichen, das nur
  der Starter bekommt (an der Zeile steht nur dessen Hash); (3) eine lesende
  Route liefert den Stand zu diesem Kennzeichen — die Minuten-Bremse des
  Checks darf das Abfragen nicht mitzählen; (4) drei Aufrufer umstellen:
  das öffentliche Formular (das Kennzeichen im Browser merken, damit ein
  zweiter Reiter und ein Neuladen denselben Lauf sehen), die Score-Seite und
  die Übersicht aller Marken; (5) Lauf-Zeilen dieser Art hängen an keiner
  Marke — sie brauchen eine Frist (zuerst nur zählen, Muster aus „N04").
  Ein Treffer im Zwischenspeicher antwortet weiter sofort.
- **(c) Kleinigkeiten.** Ein abgebrochener Knopf-Lauf des Radars verbraucht
  einen der drei Starts je Stunde (bekannte Grenze: nur ein Ausliefern mitten
  im Lauf bricht ihn ab). `market-library-compute.mjs` fragt den Stand jetzt
  ab, ist aber nicht gelaufen (es bezahlt echte Läufe). Die Lesung der
  Vorbilder bucht bei einem gescheiterten oder abgebrochenen Lauf nicht
  zurück (nur die Entwürfe tun das). Die Übersicht aller Marken zeigt nach
  dem Neuladen nicht, dass ein Fundament-Check läuft — ein Klick antwortet
  dann „läuft schon" und wartet mit. Die Lauf-Zeilen (`market_runs`,
  `insights_runs`, `brand_runs`) werden nicht nach Alter geräumt; sie sind
  klein und verschwinden mit der Marke.
  Der Hinweis „Quelle in der Zeit nicht gelesen" erscheint nur beim
  Zustandswechsel, nicht beim Speichern eines veröffentlichten Artikels (dort
  steht weiter „Zitat nicht belegt"). Ein Artikel mit sehr vielen langsamen
  Quellen lässt sich wegen der 45 Sekunden unter Umständen nicht freigeben —
  dann die Quellen einzeln über die Ampel prüfen und die langsamen ersetzen.
  Stirbt der Prozess mitten in einem Newsletter-Stapel, bekommt beim
  Fortsetzen höchstens dieser eine Stapel die Ausgabe doppelt (bekannte
  Grenze, unverändert). Der Newsletter ist auf Production ausgeschaltet; die
  Sperre ist dort nur durch Tests belegt. Der Alarm (Paket P22) kann
  abgebrochene Läufe an Lauf-Zeilen ohne Ende mit altem Herzschlag erkennen.
  Auf Production ist ein Lauf ÜBER 60 Sekunden weiter nicht gezeigt, weder
  beim Marktvergleich noch beim Radar noch bei den drei Wegen des
  Markenberaters; alles ist lokal gezeigt (75 bis 87 s, je zwei Reiter).
- **(d) Bestand des Fristen-Wächters** (`packages/core/tests/support/routeDeadlines.ts`,
  Bauform `over` — die Liste darf nur schrumpfen): neben dem öffentlichen
  Brand-Check stehen dort die Dokument-Prüfung des Markenberaters (bis
  1.320 s: zehn Nachholungen und die Prüfung, je zwei Stufen; sie hat eine
  eigene Sperre im Prozess), die Kapitel-Prüfung und das Schließen einer
  Sitzung (je bis 120 s, üblich wenige Sekunden), der Marktbericht (90 s) und
  die Übersetzung einer ganzen Seite (120 s). Nicht gezählt sind Aufrufe an
  ploi, Stripe, Mail und das Control Plane.

<a id="sv1"></a>

**SV1 — Schreiben nur über den Server: Reste (aus dem Gesamtaudit, Paket P13).**
Erledigt am 2026-11-17 (COMPLETE „N07"): der tägliche Blick von außen auf die
Anmelde-Wege der vier Projekte.

- **(a) Eine Klick-Probe** (KR1, Nummer 9). Auf den echten Seiten ist am
  2026-11-16 gezeigt: Beitrag, Kommentar und Stimme anlegen, ändern und
  löschen und die Glocke als gelesen markieren (über die Routen der Seite, in
  Davids angemeldetem Browser, als Owner); die Anmeldung per Code auf
  `admin.pukalani.app` (David) und die Anmeldung mit Passwort auf
  `demo.pukalani.app`. Nicht auf den echten Seiten gezeigt: die Anmeldung per
  Code im Projekt der Communities und auf branding.supply, das Kästchen der
  Betreiber-Bedingungen im Assistenten (nur lokal geklickt), Reaktionen und
  Meldungen, und das Schreiben als Mitglied ohne Rolle (lokal je Rolle
  geprüft). Antwortet eine Anmeldeseite mit „hier gerade nicht verfügbar":
  Schalter „Email OTP" im Projekt wieder einschalten
  ([ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md)) und hier melden.
- **(b) Anmelde-Wege.** Der Wächter sieht von außen nur den Schalter
  „Email/Password" (die fünf anderen würden bei offenem Weg ein Konto anlegen
  oder eine Mail schicken). Der erste Lauf gegen die echten Projekte war am
  2026-11-17 (von Hand gestartet, mit Davids Ja): alle vier „zu". Der Schalter
  „JWT" ist bewertet: nichts im Code hängt
  daran — er kann aus (ein Klick je Projekt in der Verwaltung, danach die
  Live-Verbindung auf einer Seite ansehen). Die lokale Datenbank und die der
  CI haben die Schalter AN, Tests laufen dort also unter anderen Bedingungen
  als Production.
- **(c) Das direkte Lesen.** Ein Konto liest direkt bei der Datenbank weiter
  jede Zeile, für die es ein Leserecht trägt, und immer die ganze Zeile. Das
  hängt an der Live-Verbindung und gehört zum Pukalani-Konto
  ([PUKALANI-KONTO.md](plans/PUKALANI-KONTO.md), § 9, Punkt 1).
- **(d) Kleinigkeiten.** Die Nachfrage nach der Zustimmung gibt es nur, wo
  eine App Bedingungen hat (branding.supply, Betreiber-Seite); die Communities
  bekommen sie mit den AGB aus A1. Für Konten von vor dem 2026-11-18 wird der
  alte Vermerk einmal übernommen und als übernommen gekennzeichnet; ein Konto
  ohne Vermerk wird gefragt. Die sechs unbenutzten Alt-Tabellen im Projekt
  `portfolio` sind verschlossen, aber noch da (der Migrations-Runner fährt
  ihre Layer dort nicht; löschen wäre ein eigener Schritt mit Davids Ja).
  Anwesenheit und Datei-Ablagen sind nach der neuen Grundregel („der Server
  schreibt") noch nicht bewertet. Die Rückwege der Rechte-Migrationen liegen
  unter `packages/<layer>/scripts/rollback/` und sind nur lokal geprobt.

<a id="si1"></a>

**SI1 — Sicherungen: Reste (aus dem Gesamtaudit, Paket P06).**
Gebaut am 2026-11-17 (COMPLETE „N06"): der stündliche Label-Abgleich findet
auch aktive Mitgliedschaften in stillgelegten Communities und das
Moderations-Label nach einer Herabstufung; seine Ops-Route ist gebremst.

- **(a) Klick-Probe auf Live.** Geprüft ist lokal. Auf einer Community: eine
  Einladung an eine Test-Adresse schicken und den Link aus einem
  Webmail-Fenster öffnen (die Seite muss die Einladung zeigen). Ein Test-Konto
  entfernen und sehen, dass die Liste „entfernt" zeigt und kein Hinweis auf
  einen offenen Lese-Zugang kommt.
- **(b) Bekannte Grenzen des Abgleichs (bewertet, kein Auftrag).** Eine
  Herabstufung, die älter ist als 26 Stunden und in der Zeit keinen Lauf sah,
  heilt weiter erst der nächste Besuch. Die zwei neuen Listen haben einen
  Deckel von 1.000 Zeilen ohne Lesestelle (steht im Log, wenn er greift). Die
  gescheiterte Zeile im Control Plane bleibt `active`; steht `disabledStale`
  über 0 im Log, gehört sie von Hand auf `removed`. Die Lesestelle der
  entfernten Zeilen lebt nur im Prozess — das zählt erst ab 1.000 entfernten
  Zeilen. Die Reihenfolge je Konto gilt nur innerhalb eines Prozesses; der
  Schreiber liest nach und wiederholt, einen Entzug holt der Lauf nach.
  Ein ganzer Lauf gegen eine Bühne mit stillgelegter Community steht noch aus.
  Runbook: [LABEL-ABGLEICH.md](runbooks/LABEL-ABGLEICH.md).
- **(c) Lint-Lauf.** Mit der typisierten Regel dauert `pnpm -r lint` lokal
  etwa 43 s statt 18 s (in der CI rund 2,5 Minuten für den ganzen Job). Ein
  eigener Durchgang mit einem TypeScript-Programm je App käme zusammen auf
  etwa 28 s, nimmt die Regel aber aus dem Lint des einzelnen Pakets. Kommt
  mit dem Ausliefer-Weg (CI1), damit sich die Prüfungen nur einmal ändern.
- **(d) Kleinigkeit.** Eine 503 trägt im Umschlag den Code `INTERNAL_ERROR`
  (es gibt keinen eigenen für 503).

<a id="ki1"></a>

**KI1 — KI-Schutz: Nacharbeiten (aus dem Gesamtaudit, Paket P17).**
Gebaut am 2026-11-17 (COMPLETE „N05"): ein neu eingetragenes Modell wird beim
Speichern geprüft (Admin-Config-Seite und Ticket-Einstellungen), und
Markenberater und Marktvergleich zeigen den genauen Satz, wenn das Modell
keinen Europa-Endpunkt hat.

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
- **(d) Kleinigkeiten.** Beim Speichern eines Modells wird nur der Ort
  geprüft; ob der Anbieter nichts speichert, prüft weiter nur der tägliche
  Wächter. Der Klick auf der Config-Seite ist nicht gezeigt (lokal und auf
  Live), nur die Route dahinter. Der Feldwert eines abgeschnittenen Entwurfs
  trägt kein Kennzeichen, nur die Sprechblase darüber — die Stelle liegt in
  der Seite des Markenberaters (`packages/brand`, `[stepKey].vue`), an der am
  2026-11-17 die Gruppe N10 baute; ohne neue Spalte ginge es als Anzeige (der
  letzte Zug zu diesem Feld war abgeschnitten). Ein englisches
  Bildschirmfoto der Hinweise fehlt. Die Kosten je Lauf und der Anbieter
  stehen weiter nicht im Protokoll (gehört zum Paket „Alarm für KI-Ausfälle
  und Ausgaben" des Gesamtaudits).

<a id="ar1"></a>

**AR1 — Aufräumen: Reste (aus dem Gesamtaudit, Paket P26).**
Erledigt am 2026-11-17 (COMPLETE „N06"): die zwei Lücken am Ticket-Kauf, die
drei übrigen Umzugs-Anleitungen liegen im Archiv, die READMEs von
`apps/photos` und `apps/control` beschreiben ihre App, `CLAUDE.md` nennt die
SDK-Versionen aus dem Katalog.

- **(a) Die Adresse `changelog.pukalani.app` löschen.** Sie zeigt noch auf den
  Datenbank-Server, dahinter ist nichts mehr (die Function und der Webhook
  sind weg). David hat das Löschen am 2026-11-15 freigegeben; im Browser war
  Cloudflare nicht angemeldet. Zu tun: bei Cloudflare in der Zone
  `pukalani.app` den A-Eintrag `changelog` löschen. Der Name bleibt für
  Kunden gesperrt (`RESERVED_SUBDOMAINS`). Danach die Zeile in
  `docs/content/2.architektur/6.hosts-und-ports.md` streichen.
- **(d) Kleinigkeiten.** Ticket-Kauf (lebt nur in der Test-App): die
  Rückkehr-Adressen kommen weiter aus dem Host der Anfrage; die Prüfung
  „schon bezahlt" liest die 100 jüngsten Sitzungen und braucht ein
  Zeitfenster, sobald es eine Erstattung mit Rücknahme des Tickets gibt. Der
  Zähler der Kontakt-Route von `apps/photos` liegt im Speicher des Prozesses.
  Auf dem Datenbank-Server liegen fünf Upgrade-Protokolle im Heimatordner
  (bewusst behalten) und vier Sicherheitskopien aus dem Backup-Paket
  (`*.vorher-p11*`, gehören zu BU1 d). Der lokale Lauf der Playwright-Suite
  braucht einen Browser-Download. Ein UptimeRobot-Monitor heißt vielleicht
  noch „studio…" (nur der Name, nicht nachgesehen).
- **(e) Vier Hinweise zu Abhängigkeiten bleiben offen** (gemessen am
  2026-11-17 mit `pnpm audit` und den Hinweisen des Repos; der Hinweis zu
  `glob` ist geschlossen). Keine davon ist eine direkte Abhängigkeit:
  - `minimatch` (mittel): schließt, sobald `@typescript-eslint` ≥ 8.73.0 und
    `@nuxt/content` ≥ 3.17.0 im Lockfile stehen. Beide Ausgaben waren am
    2026-11-17 erst Stunden bis einen Tag alt und sind deshalb nicht
    genommen. **Empfehlung:** ab dem 2026-11-20 ein kleines Update
    (`pnpm update` für genau diese Pakete, Lockfile-Diff lesen, alle fünf
    Prüfungen, Live-Build) — Patch und Minor innerhalb des Katalogs.
  - `zod` 3 (hoch): kommt nur über `@nuxt/content`; unser eigenes `zod` ist
    aktuell. Behoben ist es erst ab zod 4.6.6, und `@nuxt/content` verlangt
    auch in der neuesten Ausgabe zod 3. **Empfehlung:** warten, bis
    `@nuxt/content` umstellt; kein erzwungener Sprung (ein Override auf eine
    andere Hauptversion wäre ein Umbau, kein Update).
  - `picomatch` (hoch): es gibt noch keine Ausgabe mit der Korrektur. Kommt
    über die Lint-Werkzeuge und über `@nuxt/fonts`. **Empfehlung:** warten.
  - `esbuild` 0.27 (niedrig): kommt über `@nuxt/fonts` 0.14, das `@nuxt/ui`
    mitbringt; schließt mit `@nuxt/fonts` 1.x — ein großer Sprung, den
    `@nuxt/ui` vorgeben muss. **Empfehlung:** warten.

<a id="bt1"></a>

**BT1 — Tests über den echten Kundenpfad: Nacharbeiten (aus dem Gesamtaudit, Paket P27).**
Erledigt am 2026-11-17 (COMPLETE „N09"): der dritte Server im nächtlichen
Lauf (zwölf Skripte der Einzel-Instanz), Rollen-Tests für `onboarding`,
`control`, `core`, `admin`, `tickets`, `runner`, `domains` und `billing`, die
zwei Skripte mit dem Programm-Fehler, die Probe-Hosts der Isolations-Tests
und die Tabellen in `docs/referenz/LIVE-BEWEISE.md`.

- **(a) Skripte, die noch von Hand laufen (22 von 83).** 12 brauchen
  branding.supply mit eigenem Projekt: nötig wären ein viertes Projekt
  `branding` im Bühnen-Setup, `bootstrap --app branding`, ein vierter Server
  (nur nachts) und Einträge `env: 'branding'` im Läufer, nach dem Muster der
  Einzel-Instanz (`env: 'einzel'`). Vorher je Skript prüfen, ob es echte KI,
  Stripe oder eine fremde Website anfasst (der Umbau in `brand`, `market`
  und `insights` aus N10 ist seit dem 2026-11-18 auf `main`). Zwei Skripte der
  Einzel-Instanz brauchen eigens eingestellte Server (`verify-silo-domain`,
  `verify-domain-settle`). Bewusst von Hand bleiben sechs mit Fremddiensten.
  **Passt noch in den Nacht-Lauf, ohne neuen Server:**
  `apps/comments/e2e/community-removed.spec.ts` (das entfernte Konto steht
  auf der Bühne; es fehlen die Variablen `PW_POOL_*` aus dem Stand der Bühne
  und ein Playwright-Schritt) und die eine E2E-Datei von `apps/control` (die
  Betreiber-App läuft dort schon). Die fünf E2E-Dateien von `apps/portfolio`
  brauchen einen eigenen Server und ein eigenes Projekt.
- **(b) Rollen-Tests: 85 Routen im Bestand** (`support/routeRoleBacklog.ts`):
  brand 30, insights 26, market 10 (dort hat N10 umgebaut — jetzt möglich), pages 8,
  `apps/control` 8, je eine in `apps/comments`, `apps/photos`,
  `apps/portfolio`. `apps/control` hat noch keine Test-Einrichtung (kein
  `test`-Skript, keine `vitest.config.ts`): Tests dort führte `pnpm -r test`
  nie aus. Erst die Einrichtung nach dem Muster von `apps/portfolio`, dann
  die acht Routen (fünf passen auf
  `packages/control/tests/support/controlRouteHarness.ts`, dazu der Webhook
  mit Signatur). Layer ohne Rest nach `ZERO_BACKLOG_LAYERS`.
- **(c) Bühnen-Lauf als Pflicht: im Dezember neu entscheiden.** Entschieden
  am 2026-11-17 (DECISION-LOG): Der Lauf „Bühne (Kundenpfad)" bleibt vorerst
  ein Hinweis — er hält weder das Zusammenführen noch das Ausliefern auf und
  öffnet auf `main` und nachts ein Issue, wenn er rot ist. Ab dem 2026-12-01
  nachsehen: Wie oft war er rot, und wie oft lag es am Skript statt am
  Programm? Danach David erneut fragen. Ebenfalls entschieden: GitHub
  erzwingt nicht, dass ein Zweig vor dem Zusammenführen aktuell ist; die
  Sitzungen testen selbst gegen den neuesten Stand (CLAUDE.md, Abschnitt Git).
  Der nächtliche Lauf dauert seit dem dritten Server rund 23 statt 16 Minuten.
- **(d) Kleinigkeiten.** `verify-custom-domain` braucht eine Betreiber-App im
  Trockenlauf mit eigenem Namens-Server und kennt die Freigabe durch den
  Betreiber noch nicht. `verify-notification-mail-links` stößt den
  Sammel-Lauf für alle Konten der Instanz an und gehört deshalb nur auf eine
  leere Datenbank. Der Test `packages/core/tests/rollbackScript.test.ts`
  scheiterte am 2026-11-17 einmal in der CI mit Exit 141 („geht denselben Weg
  wieder nach vorn"; eine Pipe schließt früh, bekannte Falle bei
  `pipefail`), bei der Wiederholung und in 15 lokalen Läufen grün — die
  Stelle in `ops/rollback.sh` ist nicht gefunden. `verify-trust-perks`
  rechnet mit dem Kalendertag: ein Lauf, der über Mitternacht UTC geht, wird
  rot (so ein von Hand gestarteter Nacht-Lauf am 2026-11-18, 00:00 UTC; der
  Zeitplan um 01:41 UTC liegt nicht dort).
- **(e) Vier Stellen zum Bewerten.** Die neuen Rollen-Tests halten sie fest,
  wie sie heute sind. Nach heutiger Messung gibt keine etwas heraus; bei
  jeder greift eine zweite Sicherung. Einzelheiten stehen in der
  Übergabe-Notiz der Gruppe N09 (nicht im Repo). (1) Mitglieder-Verwaltung,
  drei lesende Routen: die Rechte-Wache soll die Entzugs-Notiz selbst mit
  abfragen. (2) Anwesenheit: dieselbe Wache wie beim Übersetzen. (3) Übersicht
  des Dashboards im Pool: soll die Instanz-Rolle „Moderator" hinein dürfen,
  oder nur der Betreiber? (4) Nutzer löschen: Reihenfolge zweier Prüfungen.

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
registrieren). Seit 2026-11-16 (GA1 P13) gibt es einen Entwurf der
„Bedingungen für Community-Betreiber" (`/de/betreiber-bedingungen`) und das
Pflicht-Kästchen beim Anlegen einer Community mit Nachweis in
`consent_records` — offen bleiben die anwaltliche Prüfung, die markierten
[OFFEN]-Stellen, die Besitz-Übergabe ohne Bestätigung, der Kauf ohne Hinweis auf
die Bedingungen und die allgemeinen AGB samt `termsUrl`. Den AVV nennt auch der
Betreiber-Entwurf nur „auf Anfrage"; der Vertrag selbst fehlt weiterhin.

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
  Protokoll ([EL1 b](#el1)). Dazu, seit dem 2026-11-17 gebaut und
  eingeschaltet, aber noch in keinem Text: Warteliste (nie bestätigt 30
  Tage, eingeladen oder abgelehnt 90 Tage, wartend höchstens 12 Monate),
  Gesprächsanfragen 12 Monate (branding.supply und pukalani.studio),
  Konto-Protokoll 12 Monate (der Satz „die Konto-Kennung bleibt als Nachweis
  stehen" gilt dann nur noch für diese Zeit), hochgeladene Profilbilder ohne
  Profil 7 Tage.
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
Treiber dazu ist seit dem 2026-11-17 umgestellt und lokal ganz gefahren
(gegen Production nicht — was er dort braucht, steht im Runbook). **Rest aus A3 (Brutto-Preise):** Stripe
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
