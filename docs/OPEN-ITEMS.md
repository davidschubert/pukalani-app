# Offene Punkte

**Stand: 46 offen · 2 geparkt/wartend · 15 bewusst zurückgestellt** (Zahlen bei JEDEM Umzug nach COMPLETE mitführen)

Stand: **2026-11-21**. Hier steht **nur, was noch offen ist** — in der
Reihenfolge, in der es abgearbeitet wird. Alles Erledigte (mit Begründung,
Beweis und den gelernten Lektionen) steht final in
**[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)**.
**Pflege-Regel (David, 2026-07-30):** diese Datei kurz halten — pro Eintrag
höchstens drei Zeilen, Einzelheiten leben im verlinkten Plan oder je Kürzel
unter [plans/offen/](plans/offen/README.md) (seit 2026-11-21, nicht mehr im Anhang),
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
Person (geschlossen); Einstellungs-Dateien ins Backup (eingerichtet,
COMPLETE „N11") · **AR1** erledigte
Umzugs-Anleitungen ins Archiv · **IN1** Marken-Seiten durch dieselbe Prüfung
wie Artikel (gebaut, COMPLETE „N05") · **MG1** Datenbank-Rückstand melden, nicht aufhalten
(geschlossen) · **PB1** Migrations-Schlüssel dürfen Dateilisten lesen
(umgesetzt, COMPLETE „N11") ·
**CI1** Dependabot 155 bis 157 übernehmen (erledigt) · **AB1** (erledigt am
2026-11-17) und **P29** beide Server-Einstellungen einschalten (eingeschaltet
am 2026-11-18, COMPLETE „N11").

### Schritt 2 — Davids Klick-Runde auf den echten Seiten

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| KR1 | **Eine Sitzung, ein Test-Konto: alle offenen Klick-Proben am Stück.** Die Proben aus AB1, PB1, MM1, SI1, SR1, SV1, zwei aus P29 (Anmelde-Mail, gestohlenes Passwort) seit dem 2026-11-18 das Erstgespräch auf pukalani.studio, dazu Beispiel-Kit (F), Marktvergleich-Entwürfe (G) und seit dem 2026-11-23 alles, was seit dem 2026-11-22 neu und hinter der Anmeldung noch ungesehen ist (H). Zwei Sitzungen, zusammen gut zwei Stunden. Die Einzel-Einträge verweisen hierher. KI-Einschätzung und Runner-Lauf sind seit dem 2026-11-21 geklickt (COMPLETE „KR1 — Teil 1"); der Rest braucht Passwort, Mail-Code oder die Bot-Prüfung und damit David selbst. **Wartet auf:** nichts, nur auf Davids Zeit. | Mittel | S (eine Sitzung) | **Ja: selbst klicken** | [Liste](plans/offen/KR1.md) |

### Schritt 3 — Baut Claude allein

**Zuerst (vor Stripe live):**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |

**Bündel „Ausliefern und Rückweg":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| MG1 | **Tests von Shell-Skripten, die ohne erkennbaren Grund rot waren.** Der Test des Rückweg-Skripts mit Exit 141 (2026-11-16 in der CI, 2026-11-22 lokal unter zwei parallelen Suiten); zwei Fälle des Ausliefer-Skripts fünfmal in einer halben Stunde (2026-11-18), seit einer Härtung nicht mehr. Nachstellen ließ sich keiner, auch nicht am 2026-11-23 mit über 1.800 Läufen unter Last (COMPLETE „FL2"). **Wartet auf:** den nächsten roten Lauf — in der CI steht dann die bash-Spur dabei. | Niedrig | S | Nein | [Einzelheiten](plans/offen/MG1.md) |

**Bündel „Mails und Bremsen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| AB1 | **Anmelde-Bremse: Rest.** (a) Klick-Probe auf den echten Seiten: KR1. Alles andere ist erledigt (COMPLETE „N02", „N08", „N11"). **Wartet auf:** Davids Zeit. | Niedrig | S | (a) Ja: selbst klicken | [Einzelheiten](plans/offen/AB1.md) |
| SR1 | **Kleine Sicherheitsriegel: Reste.** (a) Klick-Probe: KR1. (b) Datenschutztext: DT1. Alles andere ist seit 2026-11-17 erledigt (COMPLETE „N02" und „N08"). **Wartet auf:** Davids Zeit (KR1) und seine Freigabe (DT1). | Niedrig | S | **Ja** | [Einzelheiten](plans/offen/SR1.md) |

**Bündel „Fristen und Löschen":**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| EL1 | **Export und Löschung: Rest.** (b) Datenschutztexte: DT1. Die alten Textauszüge sind seit dem 2026-11-18 geleert (COMPLETE „N11"). **Wartet auf:** Davids Freigabe der Texte. | Niedrig | S | **Ja** | [Einzelheiten](plans/offen/EL1.md) |
| WH1 | **Gelöschte Marke zurückholen (Papierkorb)** auf branding.supply: Knopf „Marke löschen", 90 Tage unter „Gelöschte Marken", danach endgültig weg. Konten bleiben vorerst nicht zurückholbar (kommt mit PK1). **Wartet auf:** Davids Freigabe des Prototyps. | Mittel | M | **Ja: Prototyp freigeben, Lauf scharf schalten** | [Plan](plans/WIEDERHERSTELLUNG.md) |
| RU1 | **Runner: Reste nach der Klick-Probe.** Der echte Lauf über das Formular ist seit dem 2026-11-21 gelaufen (COMPLETE „KR1 — Teil 1"). Dabei gefunden und offen: (c) der Editor macht aus einem Dateinamen wie `README.md` einen Link. Das Budget-Feld (b) ist seit dem 2026-11-21 behoben (COMPLETE „RU1 (b)"). **Wartet auf:** nichts. | Niedrig | S | Nein | [Einzelheiten](plans/offen/RU1.md) |

**Umsetzung der Entscheidungen aus Schritt 1:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| MM1 | **Mitmachen nur für Mitglieder: Rest.** (a) Klick-Probe auf den echten Seiten: KR1. Alles andere ist erledigt oder bewusst so entschieden (COMPLETE „N03" und „N08"). **Wartet auf:** Davids Zeit. | Niedrig | S | **Ja: selbst klicken** | [Einzelheiten](plans/offen/MM1.md) |
| IN1 | **Insights-Redaktion: Nacharbeiten.** (a) Der Knopf „KI-Prüfung" ist gebaut und lokal geklickt (COMPLETE „IN1 (a)"); offen ein erster Lauf mit echtem Modell auf Live. (c) vorhandene Marken-Seiten einmal öffnen und speichern (Handgriff im Dashboard, vor dem Freischalten von Profil, Duell und Ranking), (d) Kleinigkeiten. Klick-Probe (b) nach BI5. **Wartet auf:** (a) Davids ersten Klick auf Live. | Niedrig | S bis M je Teil | **Ja: (a) ein Klick** | [Einzelheiten](plans/offen/IN1.md) |
| PB1 | **Profilbild-Ablage: Rest.** Offen ist nur die Klick-Probe (a): KR1. Ein voller Lauf des Migrations-Runners baut seit dem 2026-11-18 nichts mehr um (COMPLETE „N15"), Schlüssel und Kleinigkeiten sind erledigt (COMPLETE „N11"). **Wartet auf:** Davids Zeit. | Niedrig | S | (a) Ja: selbst klicken | [Einzelheiten](plans/offen/PB1.md) |
| BU1 | **Backup der Datenbank: Nacharbeiten** (hieß bis 2026-11-16 ebenfalls BK1). (c) Übung jährlich wiederholen — dabei zum ersten Mal auch das Bündel der App-Einstellungen mit dem privaten Schlüssel öffnen. (d) Kleinigkeiten, darunter Kopien auf den Servern löschen (ab dem 2026-12-02). (e) Das Hilfs-Image des Backups festlegen. Die Einstellungs-Dateien der Apps liegen seit dem 2026-11-18 im nächtlichen Backup (COMPLETE „N11"). **Wartet auf:** (c) Davids privaten Schlüssel, (d) den Termin. | Mittel | je Teil S | (c) Ja | [Einzelheiten](plans/offen/BU1.md) |

**Weitere Nacharbeiten:**

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| WA1 | **Alarm in die App hinein: Nacharbeiten.** Seit 2026-11-16 zählt der tägliche Wächter Fehler, Zeit-Läufe und KI-Ausfälle (COMPLETE „GA1 P22"). (a) Nach einer Woche Zahlen die Schwellen scharf stellen, die heute nur zählen, (c) Speichergrenze je Prozess, (d) der neue Blick auf Kundendomains zählt erst nur — scharf stellen, (e) Kleinigkeiten. Seit 2026-11-18 lesen die Wächter die Kundendomains aus dem Control Plane, und der Mail-Blick liest nur noch die Dateien des laufenden Prozesses (COMPLETE „N16"). **Wartet auf:** (a), (c) und (d) auf die Zahlen ab 2026-11-23. | Niedrig | S je Teil | Nein | [Einzelheiten](plans/offen/WA1.md) |
| SE1 | **Server-Einstellungen und Schutz-Kopfzeilen: Reste.** Seit 2026-11-17 sammelt jede App die Berichte der Skript-Regel ein, der tägliche Blick nennt die Zahl (COMPLETE „N07"). Offen: (a) eine Woche Zahlen ansehen, dann Nonces und scharf stellen, (b) „nur verschlüsselt" auch für Unter-Adressen, (c) alte Log-Kopien am Server-Termin löschen, (d) Reste der alten Erinnerungs-Route auf dem Server, (e) Kleinigkeiten am Server. Der Log-Umlauf ist angesehen; der Erinnerungs-Lauf erkennt stillgelegte und gesperrte Communities seit dem 2026-11-19, zählt aber erst nur (COMPLETE „N17") — (d) scharf stellen, sobald der tägliche Blick eine echte Antwort gezählt hat. **Wartet auf:** (a) eine Woche Berichte, (d) den ersten fälligen Termin auf Production, (c), (d) und (e) den Server-Termin ab 2026-11-30 (Davids Entscheidung vom 2026-11-17: die alte Einstellung und die alte Log-Datei gehen dann mit weg). | Niedrig | S je Teil | Nein | [Einzelheiten](plans/offen/SE1.md) |
| LL1 | **Lange Läufe: Reste.** (c) Kleinigkeiten. Kein Weg rechnet mehr länger, als der Webserver wartet: auch die Übersetzung einer ganzen Seite läuft seit dem 2026-11-18 im Hintergrund (COMPLETE „N15"). Offen bleibt, einen echten Lauf über 60 Sekunden einmal zu sehen. **Wartet auf:** nichts. | Niedrig | S | Nein | [Einzelheiten](plans/offen/LL1.md) |
| SV1 | **Schreiben nur über den Server: Reste.** Offen: (a) eine Klick-Probe auf den echten Seiten, (c) das direkte Lesen, (d) Kleinigkeiten. Der Schalter „JWT" ist seit dem 2026-11-18 in allen vier Projekten aus (COMPLETE „N11"). **Wartet auf:** (a) auf Davids Zeit (KR1), (c) auf das Pukalani-Konto. | Mittel | S je Teil | (a) Ja: selbst klicken | [Einzelheiten](plans/offen/SV1.md) |
| BP1 | **Betreiber-Dashboard und gemeldete Nachrichten: Reste.** (a) Ein Klick auf der echten Seite, (b) Zahlen des Protokoll-Zählers nach einer Woche ansehen, (d) Kleinigkeiten. Die eigene Spalte für den Zeitpunkt der Erledigung wartet nach Davids Entscheidung vom 2026-11-18, bis eine Route erledigte Meldungen beschreibt. Löschen im Speicher, die Schalter und die Konfig-Seite sind seit 2026-11-17 erledigt (COMPLETE „N06" und „N08"). **Wartet auf:** (a) Davids Klick. | Niedrig | S je Teil | **Ja: (a)** | [Einzelheiten](plans/offen/BP1.md) |
| PD1 | **Plan, Testphase und eigene Domain: Reste.** (a) Den Stripe-Endpunkt beim Wechsel auf echtes Geld neu anlegen, (b) Klicks auf den echten Seiten, (c) drei Grundsatzfragen mit Empfehlung und Kleinigkeiten. Namen der Alt-Pläne und „Mail erneut senden" im Wizard sind seit 2026-11-17 gebaut (COMPLETE „N06"). **Wartet auf:** (a) auf A2, (b) auf Davids Zeit. | Niedrig | S je Teil | **Ja: (b) selbst klicken** | [Einzelheiten](plans/offen/PD1.md) |
| KK1 | **Kleine Korrekturen in Events, Seiten, Statistik: Reste.** (b) Die Statistik an einer echten Community mit eigener Zähl-Seite klicken; schon gespeicherte Kennungen sind nie geprüft worden. (c) Kontingent-Zahlen im Katalog: seit 2026-11-22 gebaut und auf Production (COMPLETE „KK1 (c) — Kontingent-Zahlen"); die Kommentar-Grenze von Pro steht seit demselben Tag auf 5000/250.000. Ein halb gescheitertes Ausblenden lässt sich in der Oberfläche nicht nachholen. Alles andere ist seit 2026-11-17 erledigt (COMPLETE „N03" und „N08"). **Wartet auf:** (b) Davids Zeit. | Niedrig | S je Teil | Nein | [Einzelheiten](plans/offen/KK1.md) |
| SI1 | **Sicherungen: Reste.** (b) Der zweite Lauf (`disabled-member-sweep`) zählt seit dem 2026-11-22 live nur, wie viele aktive Zeilen in stillgelegten Communities stehen (COMPLETE „SI1 (b)"). Offen: die Zahl im Log lesen und scharf schalten. Klick-Probe (a): KR1. **Wartet auf:** Davids Ja zur gezählten Zahl. | Niedrig | S | Ja: Ja zur Zahl | [Einzelheiten](plans/offen/SI1.md) |
| KI1 | **KI-Schutz: Nacharbeiten.** (d) Kleinigkeiten (englische Hinweise hinter der Anmeldung nicht im Browser gesehen, Kosten je Lauf im Protokoll). Datenschutztexte (b): DT1. Die Klick-Probe ist seit dem 2026-11-21 erledigt (COMPLETE „KR1 — Teil 1"). Der Klick auf der Config-Seite ist seit dem 2026-11-18 lokal gezeigt (COMPLETE „N15"). **Wartet auf:** nichts. | Niedrig | S je Teil | Nein | [Einzelheiten](plans/offen/KI1.md) |
| KM1 | **Günstigeres Textmodell — Davids Ja (2026-11-24), Schritt 1 gebaut.** Der Transport schickt Haiku 5.5 „Denken aus" mit (COMPLETE „KM1 c1"); auf Production läuft weiter Haiku 4.5. Offen: (2) größere Probe lokal, unter 2 $, (3) Davids Lese-Probe, (4) Modell auf der Config-Seite umstellen. **Wartet auf:** David startet die Probe (Befehle im Plan) und klickt danach um. | Niedrig | S | Ja: Probe starten, lesen, umstellen | [Einzelheiten](plans/offen/KM1.md) |
| AR1 | **Aufräumen: Reste.** (d) Kleinigkeiten, (e) Abhängigkeiten: drei Hinweise und zwei kleine Updates bleiben offen (Stand 2026-11-21, COMPLETE „N19" und „N23"). **Wartet auf:** (e) auf neue Ausgaben fremder Pakete (MariaDB-Image 10.11.20, `archiver`/`nitropack` für minimatch; die Issues 373 und 374 dazu sind geschlossen, der Punkt lebt hier). | Niedrig | S | Nein | [Einzelheiten](plans/offen/AR1.md) |
| BT1 | **Tests über den echten Kundenpfad: Nacharbeiten.** Von den Beweis-Skripten laufen 73 von 84 von selbst; nachts steht auch branding.supply als vierter Server, elf seiner zwölf Skripte laufen mit (COMPLETE „N16" und „N17"). Offen: (a) die fünf E2E-Dateien der Studio-Site und ein Skript brauchen einen fünften Server, (c) ab dem 2026-12-01 neu entscheiden, ob der Bühnen-Lauf Pflicht wird, (d) Kleinigkeiten, (f) Reste aus dem roten Nacht-Lauf vom 2026-11-21 (COMPLETE „N21"): die Browser-Tests der Bühne laufen nur nachts, eine neue Datei dort zeigt sich am Pull Request nicht, (g) der Seitenlauf gegen Abweichungen zwischen Server und Browser kennt die Dashboards der Betreiber-App und von branding.supply noch nicht. **Wartet auf:** (c) zwei Wochen Beobachtung; (e) Davids Antwort; (f) nichts. | Niedrig | S bis M je Teil | Ja: (c) im Dezember eine Entscheidung, (e) eine Antwort | [Einzelheiten](plans/offen/BT1.md) |
| CW1 | **Wackler in CI und Ausliefern (beobachtet am 2026-11-18).** (a) Sieben E2E-Läufe, in denen der Test-Server gar nicht startete — Ursache offen, beim nächsten steht sie im Log. (c) Dichte Merges schieben das Ausliefern vor sich her. (d) Antwortet eine App nicht, liefert der Workflow auch einen älteren Commit aus. (e) Die zwei Sperren gegen überholte Commits sind nur im Test gelaufen, noch in keinem echten Lauf. Die Geheimnis-Prüfung liest seit dem 2026-11-18 je Pull Request nur noch den eigenen Zweig (COMPLETE „N15"). Die zwei wackelnden Anwesenheits-Fälle im E2E vom 2026-11-22 waren ein Mess-Fehler der Tests, behoben (COMPLETE „FL2"). **Wartet auf:** (a) den nächsten roten Lauf. | Niedrig | S je Teil | Nein | [Einzelheiten](plans/offen/CW1.md) |
| TK1 | **Textkatalog nach Bereich schneiden (Rest von PERF-006).** Der Browser lädt vor dem Start jeder Seite den ganzen Textkatalog seiner Sprache, auch die Texte von Dashboard und Wizard: branding.supply 102 KB gepackt, Community 54 KB, Landing und Studio je 27 KB. Das Modul bietet in der eingesetzten Fassung keinen Weg, das zu teilen (gemessen 2026-11-21, COMPLETE „GW1"); ein eigener Lader wäre ein Umbau im Core. | Mittel | M | Nein | COMPLETE „GW1" |
| WS1 | **Werkstatt-Seite in Teile schneiden: Rest nach Bahn C.** Die Seite hat noch 3.325 Zeilen (vorher 5.119); Antwort-, Options-, Entwurfs-Modul und Korrektur-Regel sind seit Bahn C eigene Bausteine der Rauch-Test hat acht Fälle. Offen: Session/Verlauf und Warteschlange — gemessener Grund im Plan. | Niedrig | L | Nein | [Einzelheiten](plans/offen/WS1.md) |
| AW30 | **Reste nach den Appwrite-Upgrades (2.7.3, 2.7.4).** Production läuft seit dem 2026-11-20 auf 2.7.4 (COMPLETE „AW31"). Offen: (b) eine ehrlichere Meldung, wenn Appwrite Code-Versuche bremst (die SDKs sind seit dem 2026-11-20 gehoben, COMPLETE „N19"); (c) ein Kommentar und eine Stimme mit einem Konto auf Production; (e) die Neustart-Regel der Container beim nächsten Paket-Update von Docker beobachten. Alle alten Dateien auf dem Server sind seit dem 2026-11-21 weg (COMPLETE „AW30 (d)"). **Wartet auf:** (e) ein solches Update. | Niedrig | S | (c): **Ja** (öffentlicher Beitrag) | [Einzelheiten](plans/offen/AW30.md) · [Runbook](runbooks/APPWRITE-2-7-UPGRADE.md) |

### Schritt 4 — Ein Anwaltstermin für alles

In EINEN Termin gehören: A1 (Studio und Plattform), BS1 R3, die Namensnennung
aus MV1, die Anwaltsliste aus F7, die Fragen BI1-3/BI1-4 aus BI1, A27 und die
Datenschutz-Sätze, die DT1 sammelt.

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| A1 | **Echte Rechtstexte** für Impressum, Datenschutz und AGB. pukalani.studio ist veröffentlicht; dort offen sind fünf Fragen an den Anwalt. Für pukalani.app stehen die Texte aus (branding.supply: BS1). Direkt danach `pukalani.auth.termsUrl` in `apps/platform` setzen. **Wartet auf:** Anwalt. Schaltet A2 frei. | Hoch | S — Anwalt lesen lassen | **Ja: nur David (Anwalt)** | [Agenda: Studio](plans/offen/A1.md#a1-anwalt) · [Agenda: Plattform](plans/offen/A1.md#a1-plattform) |
| A27 | **EU-Vertreter nach Art. 27 DSGVO** für branding.supply und pukalani.studio: ob nötig, entscheidet die Anwaltsantwort; die Anbieterliste mit Vergleich liegt vor. **Wartet auf:** Anwalt (BS1 R3). | Mittel | S | **Ja: Wahl + Beauftragung** | [ART-27-VERTRETER-ANBIETER.md](referenz/ART-27-VERTRETER-ANBIETER.md) |
| MV1 | **Marktvergleich — gebaut und live; offen sind Davids Punkte.** (1) Rechts-Check der Namensnennung (sechs Fragen, Archiv Anhang G), (2) Entwürfe für nike und anthropic (neu gerechnet 2026-11-22) warten auf die Handprüfung — ohne Übernahme öffnet der Montags-Wächter ab dem 2026-12-07 ein Issue für beide. apple und the-barn bleiben stehen (Davids Entscheidung, Vermerk bis 2027-02-21, COMPLETE „MV1-S"), meta bleibt draußen ([KR1 Block G](plans/offen/KR1.md)). **Wartet auf:** Anwalt (1), David (2). | Mittel | S–M | **Ja: Rechts-Check, Handprüfung** | [archiv/BRAND-MARKTVERGLEICH.md](archiv/BRAND-MARKTVERGLEICH.md) · [Bibliothek](runbooks/MARKTVERGLEICH-BIBLIOTHEK.md) |
| DT1 | **Datenschutztexte nachziehen — ein Durchgang nach dem Termin.** Sammelt die Sätze aus KI1 (b), EL1 (b), SR1 (b), RS1 (Resend, EU-Region), den Cookie-Satz aus P29 und drei alte Text-Stellen, die dem Code widersprechen. **Wartet auf:** Anwalt. | Mittel | S–M | **Ja: Texte freigeben** | [Liste](plans/offen/DT1.md) |
| KC2 | **Anbieter in den maschinenlesbaren Angaben** von pukalani.app und branding.supply (Name, Rechtsform, Sitz, Anschrift, Kontakt) und eine Steuer-Angabe an den Preisen — seit Q11 stehen dort nur die Preise (COMPLETE „Q11“). **Wartet auf:** Anwalt (A1, BRD-011). | Niedrig | S | **Ja: Angaben freigeben** | `packages/marketing/shared/pricing.ts` |

### Schritt 5 — Geld-Kette in fester Reihenfolge

**A1 → A2 → BS1 Bezahlweg → Preis für Brand Book & Kit → F7.** VT1 gehört vor
den ersten zahlenden Kunden, also vor A2.

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| VT1 | **Vertretung benennen.** Heute landet jeder Alarm nur bei David. Das Notfallblatt (deutsch und englisch) und die Handgriffe für eine zweite Alarm-Adresse sind vorbereitet (COMPLETE „GA1 P24"); seit 2026-11-24 ist eine Person benannt, das Blatt ausgefüllt (privat), Alarm-Mail und healthchecks.io gehen auch an sie. Offen: die Probe mit ihr; dazu (b) `NUXT_ALERT_EMAIL` setzen (entschieden: nur an David). **Wartet auf:** David (Termin für die Probe). | Hoch | S | **Ja: Person, Ja je Einstellung** | [PRODUKTIONS-ALARM.md § 5](runbooks/PRODUKTIONS-ALARM.md) · [Einzelheiten](plans/offen/VT1.md) |
| A2 | **Stripe auf echtes Geld umstellen — über die F55-Seite.** Bei David: Bank-Aktivierung, Steuer-Registrierung, Live-Key eintragen, Portal-Konfiguration; alles andere klickt die Seite. **Wartet auf:** A1. Vorbedingung für BS1 Z1. | Hoch | S | **Ja: Bank, Konto, Portal** | [STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) · [Notiz](plans/offen/A2.md) |
| BS1 | **branding.supply: Rechtstexte + Bezahlweg.** Offen: R2 (Davids Generator-Texte, dazu der Abschnitt „Reichweitenmessung"), R2c (Plausible einschalten; David legt die Site an, Text vor Schalter), R3 (Anwalt), Z1 (Stripe-Checkout). Impressum und AGB sind noch Gerüst. **Wartet auf:** R3 Anwalt, Z1 nach A2. Vorbedingung fürs Öffnen der Beta. | **Hoch** | M | **Ja: Texte, Anwalt, Preis** | [BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) · [Notiz](plans/offen/BS1.md) |
| BK1 | **Brand Book & Kit (Produkt 03).** K0 bis K7 sind gebaut (K7 2026-11-22; Davids Wort zur Copy in KR1 Block F). Offen: K8 (Abnahme, Persona-Audit), Davids Blicke auf `brand.md`, Leseansicht und Lieferseite, die Verify-Zusagen 31 bis 33 gegen Production. Der Preis (149 € netto) wird erst mit BS1 Z1 sichtbar. **Wartet auf:** Davids Gates; Preis nach BS1 Z1. | Mittel | L | **Ja: Gates, Abnahme** | [BRAND-BOOK-KIT.md](plans/BRAND-BOOK-KIT.md) |
| F7 | **Bezahlte Communities** — der Owner nimmt Geld von seinen Mitgliedern. Konzept steht, alle vier Entscheidungen sind gefallen (2026-08-15). Offen: die Anwaltsliste (§ 9) und der Bau. **Wartet auf:** Anwalt, dann A2. | Mittel | XL | **Ja: Anwalt (§ 9)** | [F7-PAID-COMMUNITIES-KONZEPT.md](plans/F7-PAID-COMMUNITIES-KONZEPT.md) |

### Schritt 6 — Erster Insights-Artikel

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| BI5 | **Den ersten Insights-Artikel veröffentlichen.** Zu entscheiden: die vier Launch-Entwürfe oder der Video-Entwurf, und ob das Fundstück aus dem Beweis vom 2026-11-09 stehen bleibt. Vorher alle Entwürfe einmal durch „In die Redaktion geben" schicken (IN1 d). Danach fahre ich die Klick-Beweise aus BI2, BI1 und IN1 (b). **Wartet auf:** David. | Mittel | S | **Ja: freigeben + entscheiden** | [KURATION § 20](archiv/BRAND-INSIGHTS-KURATION.md) |
| BI2 | **Brand Insights: Kuration.** Alles gebaut und live (K2 bis K7). Offen ist nur der Klick-Beweis der Kommentare unter einem öffentlichen Artikel (Gast mit Bot-Prüfung, Antwort, Meldung, Glocke bei einem Konto ohne Label). **Wartet auf:** BI5. | Mittel | S | Ja: Test-Konto auf Production | [BRAND-INSIGHTS-KURATION.md](archiv/BRAND-INSIGHTS-KURATION.md) |
| BI1 | **Brand Insights — redaktioneller Bereich.** I0 bis I5 und I6 Stufe 1 sind gebaut. Offen: Davids Blick auf die Redaktion und die vier Entwürfe, I6 Stufe 2 (fünfzehn weitere Stücke im Wochentakt), Anwaltsantworten BI1-3/BI1-4 (danach Profil, Duell und Ranking freischalten), Newsletter-Schalter nach dem Datenschutztext. **Wartet auf:** BI5, Anwalt, BS1 R2c. | Mittel | L | **Ja: Anwalt, Blick, Plausible-Site** | [BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) · [Notiz](plans/offen/BI1.md) |

### Daneben — läuft unabhängig von den sechs Schritten

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Details |
| --- | --- | --- | --- | --- | --- |
| BW1 | **Brand-Wizard Phase 1 „Fundament".** Gebaut und live auf branding.supply. Offen: Davids eigener Durchgang (ein Solo-Branding in der Werkstatt), sein Gegenlesen der Solo-Fassungen, und eine Liste kleinerer Reste. **Wartet auf:** David. | Mittel | M (Reste) | **Ja: Durchgang, Gegenlesen** | [BRAND-WIZARD-PHASE-1.md](archiv/BRAND-WIZARD-PHASE-1.md) · [Reste](plans/offen/BW1.md) |
| W2–W4 | **Studio-Funnel ausbauen.** (a) Die fünf `studio_*`-Goals in Plausible anlegen (nur David), (b) W3 ist gebaut (2026-11-22), die Texte liest David noch gegen, (c) W4 echte Kennzahlen in die Cases. **Wartet auf:** David (Goals, Zahlen). | Mittel | S–M je Paket | **Ja: Goals, Texte, Zahlen** | [STUDIO-ERSTGESPRAECH-FUNNEL.md](plans/STUDIO-ERSTGESPRAECH-FUNNEL.md) |
| RS1 | **Resend besser nutzen.** Die Newsletter-Domain `newsletter.branding.supply` steht (seit 2026-11-24, verifiziert), DMARC für `branding.supply` auch. Offen: der eigene Sende-Schlüssel dafür auf der Site und danach die Adresse in der Config, später DMARC auf `p=quarantine`. Rechtstext-Satz: DT1. **Wartet auf:** David (zwei Klicks: Schlüssel bei Resend anlegen, in Ploi eintragen). | Mittel | S | **Ja: Schlüssel** | [Notiz RS1](plans/offen/RS1.md) |
| DS1 | **Backup des Docker-Servers: Nacharbeiten.** Das tägliche Backup läuft seit dem 2026-11-20, mit Ablage außer Haus (Runbook `DOCKER-APPS-WIEDERHERSTELLUNG.md`). Offen: (a) kein Wächter liest den Stand — ein roter oder ausgebliebener Lauf fällt erst beim Nachsehen auf; (b) ein Lauf mit dem echten privaten Schlüssel öffnen und Chatwoot, Umami, Shlink einmal zurückspielen (zusammen mit der Übung aus BU1 c); (c) danach die alten Hand-Abzüge auf dem Server aufräumen; (d) die Rechte der Compose-Dateien dort durchsehen. **Wartet auf:** (b) Davids privaten Schlüssel, (c) Davids Ja. | Mittel | je Teil S | (b), (c) Ja | [Runbook](runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md) |
| PA1 | **Server-Audit 2026-11-20: Reste.** Die fünf Server wurden geprüft, fast alles ist umgesetzt. Die Einzelheiten stehen im privaten Audit-Ordner (das Repo ist öffentlich), Abschnitt 7 des Berichts. Offen: (a) die Lizenz für ein Bezahl-Plugin klären, erst danach lassen sich die Erweiterungen der drei alten WordPress-Seiten heben; (b) nach ein paar ruhigen Tagen die Rückweg-Regeln aus dem Umbau aufräumen; (c) Anfang Dezember nachsehen, ob sich ein Zertifikat einer Staging-Seite von selbst erneuert hat; (d) auf einem Server scheitert der nächtliche Lauf, der alte Protokolle wegräumt — die Ursache steht nur im System-Protokoll, das David lesen muss (gesehen am 2026-11-21); (e) bei Cloudflare zeigen drei weitere Adressen auf einen Server, auf dem es die Seite dazu nicht gibt — entscheiden, ob sie weg sollen (die Adresse der gelöschten Seite ist seit dem 2026-11-21 entfernt); (f) eine Staging-Seite zeigt noch auf die gelöschte Schnittstelle — entscheiden, was mit ihr wird. **Wartet auf:** (a) Davids Lizenz; (d) eine Ausgabe von David; (e) und (f) je eine Entscheidung. | Niedrig | je Teil S | (a), (d), (e), (f) Ja | privater Audit-Ordner, wie [GA1](runbooks/GESAMTAUDIT.md) |
| LA2 | **Verwaister Inhaber-Platz einer Community.** Löscht der einzige Inhaber sein Konto, bleibt die Community ohne Inhaber; „Besitz übertragen“ kann nur ein Inhaber. Gesucht: ein Weg in der Konsole, den Platz einem neuen Konto zu geben (mit Protokoll-Eintrag). Heute betroffen: zwei Communities von David (gelöscht am 2026-11-22). Seit LA1 warnt die Seite vorher. | Mittel | M | Nein (Ja nur zum Anwenden) | [LA1 im Archiv](OPEN-ITEMS-COMPLETE.md) |

## ⏸️ Geparkt / wartet

| # | Was (einfach erklärt) | Prio | Aufwand | Braucht David? | Wartet auf … |
| --- | --- | --- | --- | --- | --- |
| PK1 | **Pukalani-Konto: ein Konto für alle Seiten.** E1 gebaut, Production `read`, offen: Einschalten (PK1-EIN). E2 (zentrale Anmeldung): entschieden 2026-11-23 (Variante A, Konto löschen mit 30 Tagen Bedenkzeit = E2d, WH1), Prototyp gebaut (Schalter aus), wartet auf Davids Freigabe; der Bau wartet auf Schritt B. | Hoch | XL (5 Etappen) | Ja: Freigabe je Etappe | **das Ende des Gesamtaudits (GA1)** — [PUKALANI-KONTO.md](plans/PUKALANI-KONTO.md), E1: [PUKALANI-KONTO-E1.md](plans/PUKALANI-KONTO-E1.md), E2: [PUKALANI-KONTO-E2.md](plans/PUKALANI-KONTO-E2.md) |
| PK1-EIN | **Eintrittskarte einschalten (Production).** Je App eigener Schlüssel, erst `read`, dann `write` (Platform zuerst, Konsole zuletzt); die Freigabe-Pflicht eigener Domains fällt erst, wenn die Platform `liveRelay: true` meldet und die Live-Klick-Probe bestanden ist; danach der einmalige Abmelde-Lauf (Werkzeug fehlt noch). Offen aus dem Review vor Schritt B: Nachrichten und „Meine Beiträge" unter eigener Domain nur über die Pukalani-Adresse (Mitglieder-Bereich außerhalb `/dashboard` fehlt); verwaiste Seiten-Sitzungen räumt nichts weg (zählen zur Sitzungs-Obergrenze). | Hoch | M | **Ja: Werte setzen, jeder Schritt, Abmelde-Lauf** | [Runbook](runbooks/PK1-EINSCHALTEN.md) |
| VDB1 | **Semantische Suche — neu geprüft 2026-11-22: jetzt nicht bauen.** Appwrite 2.7.4 kann weiter nur Englisch und bräuchte ein zweites Postgres; besser später ein Vektor als Spalte mit EU-Embeddings, das hält die Mandanten-Grenze von selbst. [Plan](plans/SEMANTISCHE-SUCHE.md) · [Notiz](plans/offen/VDB1.md) | Niedrig | M | Ja: Strategie-Freigabe (erster Schritt: eine Mess-Session) | Insights-Basis mit einigen hundert Einträgen oder Nachfrage der Kundschaft |

Die bewusst zurückgestellten Punkte stehen am Ende des Anhangs.

---

<a id="notizen"></a>

## 📎 Anhang: Notizen

Hier steht, wie wir arbeiten und was bewusst zurückgestellt ist. Nichts davon
ist eine zusätzliche Aufgabenliste — die eine Liste steht oben.

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

Steht nicht mehr hier (der Absatz veraltete mit jeder Umbenennung). Hosts, Ports
und Projekte: [Hosts & Ports](content/2.architektur/6.hosts-und-ports.md) der
internen Doku. Was zuletzt fertig wurde: [OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md).

### Einzelheiten zu den offenen Punkten

Liegen seit dem 2026-11-21 nicht mehr in dieser Datei, sondern je Kürzel unter
[plans/offen/](plans/offen/README.md) — oder im Plan-Dokument, das die Zeile
oben verlinkt. Jede Zeile nennt in der Spalte „Details“, wo ihre Einzelheiten
stehen.

### Bewusst zurückgestellt (kein Aufgabenpunkt)

- **Reste nach gescheiterter Anlage oder Austragung** (Bahn 2, 2026-11-21):
  Entitlements ohne Register-Eintrag und halbe Marken-Anlagen werden seit
  Bahn 2 gemeldet statt verschwiegen, aber nicht automatisch gelöscht. Was ein
  Aufräumen bräuchte, steht in COMPLETE „Bahn 2 / Paket 1"; erst angehen, wenn
  die Protokoll-Zeilen dort je auftauchen.
- **Brand Design, zwei Nebenbefunde aus dem Audit (2026-09-09):** `aiComplete`
  loggt bei Anbieter-Fehlern weiter 300 Zeichen Rumpf (Text-Weg, nicht Teil des
  Audits; `aiVision`/`aiImage` schweigen); die 413-Antwort `reading_too_large` hat
  keinen eigenen UI-Satz (unter den Produkt-Deckeln 16 Bilder × 5 MB unerreichbar).
  Beim nächsten Griff an `aiComplete` mitnehmen.
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
