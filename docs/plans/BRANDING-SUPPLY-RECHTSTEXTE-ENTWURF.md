# Rechtstexte branding.supply — Erstfassung aus dem Generator (ENTWURF)

Stand: **2026-09-08** · Paket **BS1 R2** ·
Quellen: [BRANDING-SUPPLY-FAKTENBLATT.md](BRANDING-SUPPLY-FAKTENBLATT.md) (Antworten)
und [BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) §9
(Entscheidungen).

> **STATUS: ENTWURF, UNGEPRÜFT.** Dieser Text ist **nicht veröffentlichungsreif**
> und darf nicht ungeprüft auf branding.supply gestellt werden. Er ist die
> **Erstfassung für den Anwaltstermin (Paket R3)** und die Arbeitsgrundlage für
> den späteren Wechsel auf **eRecht24 Premium**. Jede Aussage darin ist entweder
> ein Generator-Baustein oder ein Absatz aus dem Faktenblatt — **keine
> Rechtsberatung**.

**Womit erzeugt.**

| | Generator | Version | Fragen im Formular | davon auf unserem Weg beantwortet |
| --- | --- | --- | --- | --- |
| Datenschutzerklärung | activeMind AG, `activemind.de/generatoren/datenschutzerklaerung/` | **#2024-10-25** | 82 | **36** |
| Impressum | activeMind AG, `activemind.de/generatoren/impressum/` | **2024-07-21** | 31 | **19** |

Die übrigen Fragen hat der Generator selbst übersprungen, weil eine
vorangehende Antwort sie gegenstandslos machte (z. B. alle Drittland-Folgefragen
nach einem „nein").

**Bedingung des kostenlosen Wegs — nicht entfernen.** Die Nutzungshinweise von
activeMind verlangen wörtlich: „Wenn Sie die Datenschutzerklärung oder Teile
davon auf Ihrer Website verwenden, ist der Hinweis auf die activeMind AG und der
Link zu unserer Website auf jeden Fall in der Erklärung zu belassen." Der Hinweis
steht deshalb am Ende von Teil A und Teil C **mit Link** und bleibt dort, solange
diese Erstfassung gilt. Er entfällt erst mit dem Wechsel auf eRecht24 Premium —
dann aber gemeinsam mit dem gesamten Generator-Text, nicht einzeln.

**Was hier NICHT geraten wurde.** Der Anbieterblock (Name, Rechtsform, Anschrift,
Telefon, Register, USt-IdNr.) ist im Repo nicht belegbar (Faktenblatt §7 Lücke 1)
und steht deshalb überall als `[ANBIETER — von David einzusetzen: …]`. Ebenso
sind zwei Speicherfristen offen. Vollständige Liste in **Teil E**.

---

## 0. Der Generator-Lauf — Frage für Frage

Damit David denselben Lauf später mit eRecht24 wiederholen kann, steht hier, was
gefragt wurde und was geantwortet wurde. Die Begründung steht jeweils im
Faktenblatt §3.

### 0.1 Datenschutzerklärung (activeMind #2024-10-25)

| # | Frage des Generators | Antwort | Grundlage |
| --- | --- | --- | --- |
| 1 | Wer ist der Verantwortliche für Ihre Website? | Platzhalterblock `[ANBIETER …]` + `hello@branding.supply` + `https://branding.supply` | Faktenblatt §1, §7 Lücke 1 |
| 2 | Haben Sie einen Datenschutzbeauftragten bestellt? | **nein** | im Faktenblatt nicht erwähnt; ein DSB wäre eine Erfindung — s. Teil F Frage 29 |
| 3 | Erheben Sie bzw. Ihr Provider Zugriffsdaten / Logfiles? | **ja** | §2 Zeile 15 (nginx/ploi) |
| 4 | Zu welchen Zwecken? | Verbindungsaufbau · reibungslose Nutzung · Systemsicherheit und Missbrauchserkennung (**nicht** „Optimierung") | §2 Zeile 15 („Betrieb, Sicherheit") |
| 5 | Wie lange speichern Sie die Daten? | `[FRIST — Server-Protokolle]` | §7 Lücke 7 — kein logrotate |
| 6 | Findet dabei eine Übermittlung in ein Drittland statt? | **nein** | Hetzner/ploi; s. Generator-Grenze G1 |
| 7 | Stehen Kontaktmöglichkeiten zur Verfügung? | **ja** | |
| 8 | Steht ein Kontaktformular zur Verfügung? | **ja** | seit Paket Z0 `/erstgespraech` im brand-Layer (`packages/brand/server/api/brand/intro-call.post.ts`, Migration `021-brand-intro-requests.ts`) — **das Faktenblatt §3 sagt hier noch „derzeit keines", der Code ist weiter** |
| 9 | Welche zusätzlichen Daten erheben Sie im Kontaktformular? | **Datum und Uhrzeit** (`$createdAt`) · **URL, von der die Anfrage erfolgte** (`source`) — **nicht** die IP-Adresse | `021-brand-intro-requests.ts` (Spaltenliste) · `intro-call.post.ts` („was nicht ins Log geht") |
| 10 | Haben Sie eine E-Mailadresse veröffentlicht? | **ja** (`hello@branding.supply`) | Entscheidung 2026-09-08 |
| 11 | Haben Sie eine Telefonnummer veröffentlicht? | **nein** | Telefon ist Lücke 1; im Impressum als Platzhalter |
| 12 | Wie lange speichern Sie die Daten (Kontakt)? | `[FRIST — Erstgesprächs-Anfragen]` | keine automatische Löschung gebaut |
| 13 | Drittland bei der Kontaktaufnahme? | **nein** | s. Generator-Grenze G1 (SMTP/Resend ist ungeprüft) |
| 14 | Können Nutzer Kommentare hinterlassen? | **nein** | |
| 15 | Newsletter oder vergleichbare E-Mailing-Dienste? | **nein** | Warteliste ≠ Newsletter — s. G2 |
| 16 | Erbringen Sie kostenpflichtige Leistungen? | **nein** | heute kein Stripe — s. G3 |
| 17 | Können Nutzer ein Kundenkonto anlegen? | **ja** | §2 Zeile 1 |
| 18 | Welche Daten zusätzlich zu den sichtbaren Feldern? | IP-Adresse · Datum und Uhrzeit · Webbrowser | §2 Zeile 2 (Appwrite-Session: IP, User-Agent, Land) |
| 19 | Drittland beim Kundenkonto? | **nein** | Google-Login ist vorbereitet, aber **nicht live** (Faktenblatt §3) |
| 20 | Social-Plugin via Shariff? | **nein** | |
| 21 | Nehmen Sie eine Reichweitenmessung vor? | **ja** | beschlossen 2026-09-08 (BRAND-INSIGHTS §11 Frage 3), Einschaltung als Paket R2c |
| 22 | Drittland bei der Reichweitenmessung? | **nein** | selbst gehostetes Plausible auf eigenem Server |
| 23 | Matomo / etracker / WiredMinds (ohne Cookies)? | **nein / nein / nein** | |
| 24 | Ein **anderes** Tool ohne Cookies? | **ja** | Plausible — der Generator lässt keinen Namen zu, s. G4 |
| 25 | Setzen Sie Tracking-Tools ein? | **nein** | |
| 26 | Matomo (mit Cookies) / etracker (mit Cookies) / Google Analytics? | **nein / nein / nein** | |
| 27 | Setzen Sie Cookies ein? | **ja** | |
| 28 | Technisch notwendige Cookies? | **ja** | |
| 29 | Welche Anwendungen? | Übernahme von Spracheinstellungen · Warenkorb oder Login (**nicht** „Einwilligungsmanagement", es gibt kein Consent-Tool) | Faktenblatt §3 Cookie-Liste |
| 30 | Drittland bei Cookies? | **nein** | |
| 31 | Technisch **nicht** notwendige Cookies? | **nein** | Farbwelt/Grundton sind Komforteinstellungen, keine Analyse — s. Teil F Frage 26 |
| 32 | Gegenüber wem können Betroffene ihr Widerspruchsrecht geltend machen? | „Gegenüber dem oben genannten Verantwortlichen, per E-Mail an hello@branding.supply" | |

*(36 Fragen: die Tabelle bündelt drei Dreier-Blöcke — Zeilen 23 und 26 — zu je einer Zeile.)*

### 0.2 Impressum (activeMind 2024-07-21)

| # | Frage | Antwort |
| --- | --- | --- |
| 1 | Unternehmen oder selbstständige Person? | **Unternehmen** — erzwungene Wahl, s. G13 |
| 2 | Name des Unternehmens inkl. Rechtsform | `[ANBIETER …]` |
| 3 | Gesetzliche Berufsbezeichnung? | nein |
| 4 | Adresse | `[ANBIETER …]` |
| 5 | E-Mailadresse | `hello@branding.supply` |
| 6 | Telefonnummer | `[ANBIETER …]` |
| 7 | Vertretungsberechtigte Personen | `[ANBIETER …]` |
| 8 | Registernummer? | **ja** → Nummer + Gericht als Platzhalter |
| 9 | Umsatzsteuer-Identifikationsnummer? | **ja** → Platzhalter |
| 10 | Wirtschafts-Identifikationsnummer? | nein |
| 11 | Behördliche Zulassung nötig? | nein |
| 12 | Kammer-Zulassung? | nein |
| 13 | Berufshaftpflichtversicherung? | nein |
| 14 | AG/KGaA/GmbH in Liquidation? | nein |
| 15 | Urheberrechtliche Hinweise | leer gelassen → der Generator setzt selbst `[Bitte Informationen ergänzen]` |
| 16 | Hinweis für redaktionelle Inhalte | „Verantwortlich i. S. d. § 18 Abs. 2 MStV für die redaktionellen Inhalte (Brand Insights): `[ANBIETER …]`" |
| 17 | Bieten Sie (auch) Leistungen für **Verbraucher** an? | **nein** — Davids Entscheidung 2026-09-08 (Kundenkreis B2B) |
| 18 | Streitbeilegungsverfahren / zuständige Stelle | entfällt durch Antwort 17 — s. G14 |

### 0.3 Generator-Grenzen (was der Generator nicht konnte)

Jede Grenze ist der Grund für einen eingefügten Abschnitt oder eine Korrektur in
Teil A. Sie sind durchnummeriert, damit Teil A darauf zeigen kann.

| # | Grenze | Folge im Entwurf |
| --- | --- | --- |
| **G1** | Bei jeder Drittland-Frage lässt der Generator nur **drei Garantien** zu (Angemessenheitsbeschluss, SCC, BCR) — „ungeprüft" gibt es nicht. Für **OpenRouter** (USA) und den **SMTP-Anbieter** ist die Grundlage im Faktenblatt eine LÜCKE (§7 Nr. 4/5). Eine der drei anzuklicken hätte eine Tatsache erfunden. | Alle Drittland-Fragen mit **nein** beantwortet; der Drittlandsbezug steht stattdessen in den eingefügten Abschnitten **A-KI** und **A-Subprozessoren** — dort mit Platzhalter statt Behauptung. **Das ist die wichtigste Stelle für den Anwalt.** |
| **G2** | Kennt nur „Newsletter". Eine **Warteliste mit Double-Opt-in**, die keine Werbung verschickt, sondern Beta-Zugänge vergibt, hat keine Frage. | Abschnitt **A-Warteliste** eingefügt. |
| **G3** | Fragt nach kostenpflichtigen Leistungen — heute gibt es keine, künftig Stripe (Paket Z1). | Abschnitt **A-Zahlung** als *benannter leerer Platz* eingefügt (Entscheidung 3). |
| **G4** | Reichweitenmessung: kennt nur Matomo, etracker, WiredMinds und „ein anderes Tool" — **ohne Namensfeld**. Das Ergebnis enthält wörtlich „PLATZHALTER FÜR TOOL ZUR REICHWEITENMESSUNG · Bitte beschreiben Sie das Tool." | Ersetzt durch **A-Plausible**. |
| **G5** | Der Standardtext zur Reichweitenmessung behauptet „Verhalten, Interessen oder demographische Informationen …, wie z.B. das Alter oder das Geschlecht, als pseudonyme Werte". Für cookieloses Plausible ist das **falsch**. | Der Absatz ist in Teil A durchgestrichen markiert und ersetzt. |
| **G6** | Der Cookie-Teil verweist zweimal auf ein **Cookie-Consent-Tool** bzw. „Cookie-Einstellungen". branding.supply hat **kein Banner und kein Consent-Tool** (`consent.enabled: false`). | Ersetzt durch die **Cookie-Tabelle** aus Faktenblatt §3. |
| **G7** | Die angekreuzten Cookie-Anwendungen erscheinen im Ergebnis als **leere Aufzählung**; die vierte Auswahlmöglichkeit heißt im Generator wörtlich „PLATZHATLER für weitere Anwendungen" (Tippfehler im Original). | Liste von Hand ergänzt. |
| **G8** | Beim Kundenkonto erscheinen die drei angekreuzten Datenarten als **drei leere `<li>`**; die Rechtsgrundlage lautet im Ergebnis **Art. 6 Abs. 1 lit. a (Einwilligung)**, das Faktenblatt sagt **lit. b**; der Text spricht von „getätigten Einkäufen" und „als Gast Bestellungen tätigen" (Shop-Wortwahl). | Liste ergänzt, Rechtsgrundlage und Shop-Sätze markiert — **Anwaltsfrage 24**. |
| **G9** | „Kontaktaufnahme" behauptet pauschal, bei E-Mail-Kontakt würden **IP-Adressen** gespeichert. Unser Formular speichert **keine IP** (nur Datum/Uhrzeit und die anfragende Seite). | Satz markiert und korrigiert. |
| **G10** | **Keine Frage zu KI/Sprachmodellen**, keine zum **Abruf fremder Websites**, keine zur **öffentlichen Bewertung fremder Marken**. | Die drei Sonderabschnitte aus Faktenblatt §4 eingefügt (**A-KI**, **A-Abruf**, **A-Score**). |
| **G11** | **Keine Frage zum Hosting** — Hetzner und ploi tauchen im Ergebnis nirgends auf, nur „ggf. technische Dienstleister". | Abschnitt **A-Subprozessoren** eingefügt. |
| **G12** | Kein Feld für einen **Vertreter in der Union (Art. 27 DSGVO)**. | Abschnitt **A-Art27** als benannter leerer Platz eingefügt. |
| **G13** | Der Impressums-Generator **erzwingt** die Wahl „Unternehmen" oder „selbstständige Person", bevor er weitergeht. Die Rechtsform ist Lücke 1. | „Unternehmen" gewählt; David korrigiert, falls es eine selbstständige Person ohne Firmierung ist — die Gliederung des Ergebnisses ändert sich dann. |
| **G14** | Antwortet man „keine Leistungen für Verbraucher", **entfällt der § 36 VSBG-Block ersatzlos**. Ein ausdrücklicher Satz „wir nehmen an einem Streitbeilegungsverfahren nicht teil" ist nicht vorgesehen. | **Anwaltsfrage 28**. |
| **G15** | activeMind ist **ausschließlich deutsch** (kein `hreflang`, keine EN-Seiten, geprüft am 2026-09-08). Eine englische Gesamtfassung liefert der Generator nicht. | Teil B enthält nur die drei Sonderabschnitte auf Englisch; die englische **Gesamt**fassung kommt mit eRecht24 Premium. |

---

# TEIL A — Datenschutzerklärung (Deutsch)

> Grundtext = Ergebnis des activeMind-Generators, **wörtlich übernommen**.
> Alles, was mit `[EINGEFÜGT — …]` beginnt, ist **nicht** vom Generator und
> stammt aus dem Faktenblatt. Alles, was mit `[KORREKTUR — …]` beginnt, ist ein
> Generator-Satz, der so **nicht stimmt**.

## Datenschutzhinweise

### Verantwortlicher

Verantwortlicher im Sinne der Datenschutzgesetze, insbesondere der
EU-Datenschutz-Grundverordnung (DSGVO), ist:

> [ANBIETER — von David einzusetzen: Firmenname, Rechtsform, vertretungsberechtigte Person, vollständige ladungsfähige Anschrift]
> E-Mail: hello@branding.supply
> Website: https://branding.supply
> [ANBIETER — von David einzusetzen: Telefon, Registergericht und Registernummer, USt-IdNr., ggf. Vertreter nach Art. 27 DSGVO]

### [EINGEFÜGT — Generator-Grenze G12] Vertreter in der Union (Art. 27 DSGVO)

> *Benannter leerer Abschnitt (Entscheidung 3 vom 2026-09-08). Er steht hier,
> damit er später ein eingesetzter Satz ist und kein Umbau.*
>
> **[nach Anwaltsantwort / Paket A27 — Faktenblatt §6 Frage 1 und §7 Lücke 8:
> Name und Anschrift des Vertreters nach Art. 27 DSGVO, oder die begründete
> Feststellung, dass keiner erforderlich ist.]**

### Ihre Betroffenenrechte

Unter den angegebenen Kontaktdaten können Sie gemäß EU-Datenschutz-Grundverordnung
(DSGVO) jederzeit folgende Rechte ausüben:

- Auskunft über Ihre bei uns gespeicherten Daten und deren Verarbeitung (Art. 15 DSGVO),
- Berichtigung unrichtiger personenbezogener Daten (Art. 16 DSGVO),
- Löschung Ihrer bei uns gespeicherten Daten (Art. 17 DSGVO),
- Einschränkung der Datenverarbeitung, sofern wir Ihre Daten aufgrund gesetzlicher
  Pflichten noch nicht löschen dürfen (Art. 18 DSGVO),
- Widerspruch gegen die Verarbeitung Ihrer Daten bei uns (Art. 21 DSGVO) und
- Datenübertragbarkeit, sofern Sie in die Datenverarbeitung eingewilligt haben
  oder einen Vertrag mit uns abgeschlossen haben (Art. 20 DSGVO).

Sofern Sie uns eine Einwilligung erteilt haben, können Sie diese jederzeit mit
Wirkung für die Zukunft widerrufen.

Sie können sich jederzeit mit einer Beschwerde an eine Aufsichtsbehörde wenden,
z. B. an die zuständige Aufsichtsbehörde des Bundeslands Ihres Wohnsitzes oder an
die für uns als verantwortliche Stelle zuständige Behörde.

Eine Liste der Aufsichtsbehörden (für den nichtöffentlichen Bereich) mit Anschrift
finden Sie unter:
https://www.bfdi.bund.de/DE/Infothek/Anschriften_Links/anschriften_links-node.html.

#### [EINGEFÜGT — Faktenblatt §2, Absatz „Zwei Eigenheiten"] Wie Auskunft und Löschung bei uns praktisch ablaufen

> Löschen Sie Ihr Konto, entfernen wir damit Ihre Brandings, Schritte,
> Nachrichten, Share-Links, Trichter-Ereignisse und die Marktvergleichs-Daten,
> die daran hängen. Zwei Dinge laufen bewusst anders, und wir sagen es lieber,
> als es zu verschweigen:
>
> - **Einträge ohne Konto** — die Warteliste und die Ergebnisse des Brand-Checks
>   hängen an keiner Nutzerkennung. Sie werden auf Ihre Anfrage **von Hand**
>   entfernt; schreiben Sie uns dafür an hello@branding.supply.
> - **Einladungen werden anonymisiert, nicht gelöscht.** Die Zeile ist der
>   Nachweis, dass ein Zugangscode ausgegeben wurde; aus der Adresse wird ein
>   Platzhalterwert.

### Verarbeitungstätigkeiten

#### Erfassung allgemeiner Informationen beim Besuch unserer Website

**Art und Zweck der Verarbeitung**

Wenn Sie auf unsere Website zugreifen, d.h., wenn Sie sich nicht registrieren oder
anderweitig Informationen übermitteln, werden automatisch Informationen
allgemeiner Natur erfasst. Diese Informationen (Server-Logfiles) beinhalten etwa
die Art des Webbrowsers, das verwendete Betriebssystem, den Domainnamen Ihres
Internet-Service-Providers, Ihre IP-Adresse und ähnliches.

Sie werden insbesondere zu folgenden Zwecken verarbeitet:

- Sicherstellung eines problemlosen Verbindungsaufbaus der Website
- Sicherstellung einer reibungslosen Nutzung der Website
- Sicherstellung und Auswertung der Systemsicherheit und -stabilität,
  insbesondere zur Missbrauchserkennung

Wir verwenden Ihre Daten nicht, um Rückschlüsse auf Ihre Person zu ziehen.
Allerdings behalten wir uns vor, die Server-Logfiles nachträglich zu überprüfen,
sollten konkrete Anhaltspunkte auf eine rechtswidrige Nutzung hinweisen.

**Rechtsgrundlage und berechtigtes Interesse**

Die Verarbeitung erfolgt gemäß Art. 6 Abs. 1 lit. f DSGVO auf Basis unseres
berechtigten Interesses an der Verbesserung der Stabilität und Funktionalität
unserer Website sowie der Sicherstellung der Systemsicherheit und
Missbrauchserkennung.

**Empfänger**

Empfänger der Daten sind ggf. technische Dienstleister, die für den Betrieb und
die Wartung unserer Webseite als Auftragsverarbeiter tätig werden.

**Speicherdauer**

Daten werden in Server-Log-Dateien in einer Form, die die Identifizierung der
betroffenen Personen ermöglicht, maximal für
**[FRIST — von David festzulegen und technisch umzusetzen: Aufbewahrungsdauer der
Server-Protokolle; eine automatische Löschung (logrotate) ist derzeit nicht
eingerichtet]** gespeichert; es sei denn, dass ein sicherheitsrelevantes Ereignis
auftritt (z.B. ein DDoS-Angriff).

Im Falle eines solchen Ereignisses werden Server-Log-Dateien bis zur Beseitigung
und vollständigen Aufklärung des sicherheitsrelevanten Ereignisses gespeichert.

**Bereitstellung vorgeschrieben oder erforderlich**

Die Bereitstellung der vorgenannten personenbezogenen Daten ist weder gesetzlich
noch vertraglich vorgeschrieben. Ohne die IP-Adresse ist jedoch der Dienst und die
Funktionsfähigkeit unserer Website nicht gewährleistet. Zudem können einzelne
Dienste und Services nicht verfügbar oder eingeschränkt sein.

**Widerspruch**

Lesen Sie dazu die Informationen über Ihr Widerspruchsrecht nach Art. 21 DSGVO
weiter unten.

#### [EINGEFÜGT — Generator-Grenze G11 · Faktenblatt §2 Zeilen 15/16 und §3] Hosting und weitere Auftragsverarbeiter

> **Wo diese Website läuft**
>
> branding.supply läuft auf **eigenen Servern bei der Hetzner Online GmbH**,
> verwaltet über den Dienst **ploi.io**. Ein Content-Delivery-Network oder einen
> vorgelagerten Proxy setzen wir **nicht** ein — Ihr Browser spricht direkt mit
> unserem Server.
> **[LÜCKE — von David einzusetzen: Standort des Rechenzentrums (Hetzner betreibt
> Standorte in Deutschland und Finnland) sowie Registrar und DNS-Anbieter der
> Domain `branding.supply`.]**
>
> **Wer sonst noch Daten für uns verarbeitet**
>
> | Dienstleister | Wofür | Anmerkung |
> | --- | --- | --- |
> | Hetzner Online GmbH | Server, Datenbank, Sicherungskopien | Sicherungskopien liegen auf einer Hetzner Storage Box. **[LÜCKE — Standort und Aufbewahrungsdauer der Sicherungskopien]** |
> | ploi.io | Server-Verwaltung | |
> | **[LÜCKE — SMTP-Anbieter bestätigen]** | Versand unserer E-Mails (Bestätigung, Einladung, Benachrichtigung) | **[LÜCKE — Auftragsverarbeitungsvertrag und Drittlandsbezug ungeprüft]** |
> | OpenRouter, Inc. sowie die dahinter zugelassenen Modellanbieter | Verarbeitung durch ein Sprachmodell (siehe eigenen Abschnitt) | Sitz in den **USA**. **[LÜCKE — Vertragsstand und Grundlage der Übermittlung]** |
> | Google Ireland Ltd. / Google LLC | **nur**, wenn Sie sich mit „Anmelden mit Google" registrieren | Diese Anmeldeart ist heute **nicht aktiv**; der Absatz gilt erst, wenn sie eingeschaltet wird. |
> | Stripe | Zahlungsabwicklung | **geplant**, heute nicht im Einsatz — siehe Abschnitt „Zahlungsabwicklung". |
>
> *Anmerkung für die Anwaltsprüfung: Diese Tabelle ersetzt die Angabe „ggf.
> technische Dienstleister" aus dem Generator-Text. Die Übermittlung in die USA
> (OpenRouter, ggf. SMTP) ist im Generator bewusst mit „nein" beantwortet worden,
> weil er nur zwischen drei Garantien wählen lässt und keine davon belegt ist
> (Generator-Grenze G1).*

#### Kontaktaufnahme

**Art und Zweck der Verarbeitung**

Auf unserer Website ist ein Kontaktformular vorhanden, welches für die
elektronische Kontaktaufnahme genutzt werden kann. Nimmt ein Nutzer diese
Möglichkeit wahr, so werden die in der Eingabemaske eingegeben Daten an uns
übermittelt und gespeichert.

Zum Zeitpunkt der Absendung der Nachricht werden zudem folgende Daten gespeichert:

- Datum und Uhrzeit der Anfrage
- URL, von der die Anfrage erfolgte

Eine Kontaktaufnahme ist über die bereitgestellten E-Mail-Adressen möglich. In
diesem Fall werden die mit der E-Mail übermittelten personenbezogenen Daten des
Nutzers gespeichert. Hierzu zählen Datum und Uhrzeit des E-Mailversands,
E-Mailadresse, ~~IP-Adressen~~ sowie Informationen zu den an der
E-Mail-Kommunikation beteiligten Servern.

> **[KORREKTUR — Generator-Grenze G9]** Der Generator behauptet pauschal die
> Speicherung von IP-Adressen. Unser Formular speichert **keine IP-Adresse**: die
> Zeile trägt Name, E-Mail, Unternehmen, Anliegen, optional Telefon, dazu Sprache
> und die anfragende Seite (`packages/brand/scripts/migrations/021-brand-intro-requests.ts`).
> Die IP wird nur flüchtig für die Missbrauchsbremse ausgewertet und **nie
> geschrieben und nie protokolliert** (`intro-call.post.ts`, Abschnitt „Was nicht
> ins Log geht"). Der Satz gehört entsprechend gekürzt.

Unabhängig von der gewählten Kommunikationsart erheben wir den Inhalt Ihrer
Anfrage. Ihre Daten werden zum Zweck der individuellen Kommunikation mit Ihnen
gespeichert.

> **[EINGEFÜGT — Paket Z0 · `packages/brand/app/pages/erstgespraech.vue`]**
> Unser Formular unter `/erstgespraech` fragt **fünf Felder**: **Name**,
> **E-Mail-Adresse**, **Unternehmen**, **Ihr Anliegen** und — **freiwillig** —
> eine **Telefonnummer**. Wir speichern zusätzlich die Sprache der Seite, von der
> aus Sie gefragt haben, und, falls Sie angemeldet sind, die Zuordnung zu Ihrem
> Konto und Ihrem Branding — damit wir Ihre Anfrage beantworten können, ohne
> nachzufragen, worum es geht.

**Rechtsgrundlage**

Die Verarbeitung der Daten erfolgt auf der Grundlage eines berechtigten Interesses
(Art. 6 Abs. 1 lit. f DSGVO).

Unser berechtigtes Interesse an der Verarbeitung Ihrer Daten ist die Ermöglichung
einer unkomplizierten Kontaktaufnahme.

Sofern Sie mit uns Kontakt aufnehmen, um ein Angebot zu erfragen, erfolgt die
Verarbeitung der Daten zur Durchführung vorvertraglicher Maßnahmen
(Art. 6 Abs. 1 lit. b DSGVO).

**Empfänger**

Empfänger der Daten sind ggf. technische Dienstleister, die für den Betrieb und
die Wartung unserer Webseite als Auftragsverarbeiter tätig werden.

**Speicherdauer**

Daten werden spätestens **[FRIST — von David festzulegen: Aufbewahrung der
Anfragen aus dem Erstgesprächs-Formular; eine automatische Löschung ist nicht
gebaut, die Zeile wird auf Wunsch von Hand entfernt]** nach Bearbeitung der
Kontaktaufnahme gelöscht.

Sofern es zu einem Vertragsverhältnis kommt, unterliegen wir den gesetzlichen
Aufbewahrungsfristen. Diese betragen grundsätzlich 6 oder 10 Jahre aus Gründen der
ordnungsmäßigen Buchführung und steuerrechtlichen Anforderungen.

**Bereitstellung vorgeschrieben oder erforderlich**

Die Bereitstellung Ihrer personenbezogenen Daten erfolgt freiwillig. Wir können
Ihre Anfrage jedoch nur bearbeiten, sofern Sie uns die erforderlichen Daten und
den Grund der Anfrage mitteilen.

**Widerspruch**

Lesen Sie dazu die Informationen über Ihr Widerspruchsrecht nach Art. 21 DSGVO
weiter unten.

#### [EINGEFÜGT — Generator-Grenze G2 · Faktenblatt §2 Zeile 11] Warteliste für die Beta

> **Art und Zweck der Verarbeitung**
>
> branding.supply ist eine Beta, der Zugang wird auf Einladung vergeben. Wer
> teilnehmen möchte, trägt seine **E-Mail-Adresse** in unsere Warteliste ein. Wir
> versenden darüber **keine Werbung und keinen Newsletter** — die Liste dient
> ausschließlich dazu, Einladungen zu vergeben.
>
> **Doppelte Bestätigung („Double-Opt-in")**
>
> Nach dem Eintrag senden wir Ihnen eine E-Mail mit einem Bestätigungslink. Erst
> wenn Sie ihn anklicken, gilt Ihr Eintrag als bestätigt. Der Link ist **24
> Stunden** gültig. Wir speichern dafür Ihre Adresse in der Schreibweise Ihrer
> Eingabe, dieselbe Adresse in Kleinschreibung (zum Abgleich), einen
> Prüfwert des Bestätigungslinks (nicht den Link selbst) und den Zeitpunkt der
> Bestätigung.
>
> **Rechtsgrundlage**
>
> Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Sie können sie jederzeit
> widerrufen; schreiben Sie uns dafür an hello@branding.supply.
>
> **Speicherdauer**
>
> Bis zur Einladung oder bis Sie die Löschung verlangen. **Unbestätigte Einträge
> bleiben bestehen**, ihr Bestätigungslink ist nach 24 Stunden jedoch wertlos.
> Die Löschung nehmen wir von Hand vor, weil diese Einträge an kein Konto
> gebunden sind.

#### Anlegen eines Kundenkontos

**Art und Zweck der Verarbeitung**

Auf unserer Website haben Sie die Möglichkeit ein Kundenkonto anzulegen. Hierzu
erfassen wir Ihre Kontaktdaten ~~und verknüpfen Ihre getätigten Einkäufe mit Ihrem
Konto~~.

> **[KORREKTUR — Generator-Grenze G8]** Der Generator liefert hier Shop-Wortlaut.
> Richtig ist: *Über Ihr Konto erhalten Sie Zugang zur Werkstatt; Ihre Brandings
> und Ergebnisse sind Ihrem Konto zugeordnet.* Erfasst werden **E-Mail-Adresse,
> Anzeigename und ein Passwort-Prüfwert** (bzw. Ihre Google-Kennung, wenn diese
> Anmeldeart aktiv ist) sowie der Zeitpunkt der Registrierung.

Zusätzlich zu den von Ihnen angegebenen Daten werden zum Zeitpunkt des Anlegens
des Kundenkontos folgende Daten gespeichert:

> **[KORREKTUR — Generator-Grenze G8]** Der Generator gibt hier **drei leere
> Aufzählungspunkte** aus, obwohl die Angaben angekreuzt waren. Sie lauten:

- IP-Adresse
- Datum und Uhrzeit
- Webbrowser

> **[EINGEFÜGT — Faktenblatt §2 Zeile 2]** Solange Sie angemeldet sind, führen wir
> eine Liste Ihrer aktiven Sitzungen (unter *Einstellungen → Sitzungen*
> einsehbar). Sie enthält IP-Adresse, Browserkennung und das **Land** des
> Zugriffs; eine genauere Ortsangabe zeigen wir nur, wenn die dafür nötige lokale
> Datenbank eingerichtet ist — ein Abruf bei einem fremden Dienst findet dabei
> **nicht** statt. Sie können jede Sitzung dort selbst beenden.

**Rechtsgrundlage**

Die Verarbeitung der bei der Registrierung eingegebenen Daten erfolgt auf
Grundlage einer Einwilligung des Nutzers (Art. 6 Abs. 1 lit. a DSGVO).

> **[PRÜFPUNKT ANWALT — Generator-Grenze G8 · Teil F Frage 24]** Das Faktenblatt
> ordnet das Konto **Art. 6 Abs. 1 lit. b** (Vertragserfüllung) zu, der Generator
> **lit. a** (Einwilligung). Das ist kein Formulierungsunterschied: an ihm hängen
> Widerruf, Löschpflicht und die Frage, ob das Konto ohne Einwilligung überhaupt
> bestehen darf.

**Empfänger**

Empfänger der Daten sind ggf. technische Dienstleister, die für den Betrieb und
die Wartung unserer Website als Auftragsverarbeiter tätig werden.

**Speicherdauer**

Daten werden in diesem Zusammenhang nur verarbeitet, solange die entsprechende
Einwilligung vorliegt.

**Bereitstellung vorgeschrieben oder erforderlich**

Die Anlage eines Kundenkontos ist freiwillig. Sie ist zur Erfüllung eines Vertrages
mit Ihnen oder zur Durchführung vorvertraglicher Maßnahmen vorteilhaft, aber nicht
notwendig. ~~Sie haben jederzeit die Möglichkeit als Gast Bestellungen zu tätigen.~~

> **[KORREKTUR — Generator-Grenze G8]** Der letzte Satz ist Shop-Wortlaut und
> **falsch**: Die Werkstatt setzt ein Konto voraus. Ohne Konto zugänglich sind
> Startseite, Über uns, Team, Beispielseite, der **Brand-Check samt Ranking** und
> die Seite `/market-bot`.

**Widerruf der Einwilligung**

Die Löschung Ihres Kundenkontos ist jederzeit möglich und kann bei den unten
aufgeführten Kontaktinformationen beantragt werden.

#### [EINGEFÜGT — Faktenblatt §4a · Generator-Grenze G10] Verarbeitung durch ein Sprachmodell

> Was Sie in der Werkstatt schreiben — Antworten im Gespräch, Notizen, Entwürfe —,
> wird zur Erzeugung Ihrer Ergebnisse an ein Sprachmodell übermittelt. Der Weg
> dorthin führt über den Vermittlungsdienst OpenRouter mit Sitz in den USA, der
> die Anfrage an einen Modellanbieter weiterreicht.
>
> Wir haben diesen Weg technisch eingeschränkt, und zwar bei jeder einzelnen
> Anfrage: Es werden ausschließlich Anbieter zugelassen, die sich zur
> **Nichtspeicherung der Anfrage verpflichtet haben** („Zero Data Retention"),
> und die Verwendung Ihrer Inhalte **zu Trainingszwecken ist untersagt**. Steht
> kein solcher Anbieter zur Verfügung, wird die Anfrage **nicht** an einen anderen
> weitergereicht, sondern schlägt fehl — die Funktion ist dann vorübergehend nicht
> verfügbar.
>
> Das Ergebnis der Verarbeitung (Ihr Entwurf, Ihre Bewertung) speichern wir bei
> uns, damit Sie damit weiterarbeiten können. Die Verarbeitung ist zur Erfüllung
> unseres Vertrags mit Ihnen erforderlich (Art. 6 Abs. 1 lit. b DSGVO). Bitte
> geben Sie in der Werkstatt keine besonderen Kategorien personenbezogener Daten
> und keine Daten Dritter ein, die dort nicht hingehören.
>
> **[LÜCKE — von David einzusetzen: Grundlage der Übermittlung in die USA
> (Angemessenheitsbeschluss, Standardvertragsklauseln oder anderes) sowie der
> Vertragsstand mit OpenRouter.]**
>
> *[PRÜFPUNKT ANWALT: Rolle bei dieser Verarbeitung (Verantwortlicher oder
> Auftragsverarbeitung), Grundlage der Drittlandsübermittlung, Notwendigkeit eines
> AVV mit Firmenkunden.]*

#### [EINGEFÜGT — Faktenblatt §4b · Generator-Grenze G10] Abruf öffentlich zugänglicher Websites

> Für den Brand-Check und den Marktvergleich rufen unsere Server öffentlich
> zugängliche Seiten der angegebenen Adresse ab. Dabei sieht der Server der
> abgerufenen Website — wie bei jedem Seitenaufruf — unsere IP-Adresse und unsere
> Absenderkennung. Es sind **zwei**, weil es zwei Vorgänge sind:
> `PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)` für den
> Brand-Check (eine Seite) und
> `PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)` für den
> Marktvergleich (mehrere Seiten). Unter beiden Adressen erklären wir dauerhaft,
> was wir lesen, was wir nicht lesen, wie lange wir es behalten und wie man uns
> aussperrt — jeden Vorgang einzeln.
>
> Wir halten uns dabei an folgende Regeln:
>
> - Wir lesen nur **öffentlich zugängliche Marketing-Seiten**. Keine
>   Login-Bereiche, keine Formulare, keine Downloads.
> - Wir werten **`robots.txt`** aus und halten uns daran — bei **beiden**
>   Vorgängen, und je Absenderkennung getrennt.
> - Wir respektieren maschinenlesbare **Nutzungsvorbehalte** für Text- und
>   Data-Mining (§ 44b UrhG) in den gängigen Formen: `TDM-Reservation`-Header,
>   `/.well-known/tdmrep.json`, `tdm-reservation`-Meta sowie `noai`/`noimageai`
>   in den robots-Metas. Liegt ein Vorbehalt vor, wird die Seite **nicht**
>   ausgewertet; der Nutzer erhält eine ehrliche Meldung.
> - **Seiten mit Personenbezug rufen wir gar nicht erst ab**: Team-, Impressums-,
>   Kontakt-, Datenschutz-, AGB-, Login-, Konto- und Warenkorbseiten sind gesperrt.
> - Was auf den übrigen Seiten steht, durchläuft vor jeder weiteren Verarbeitung
>   einen **Filter für E-Mail-Adressen, Telefonnummern und Personennamen**.
> - Der abgerufene **Rohtext wird höchstens 24 Stunden gespeichert** und danach
>   automatisch gelöscht. Was bleibt, ist eine strukturierte Zusammenfassung mit
>   **kurzen Belegzitaten (höchstens 200 Zeichen)** und der Quelladresse.
>
> Rechtsgrundlage ist unser berechtigtes Interesse an einer belegten
> Marktbetrachtung (Art. 6 Abs. 1 lit. f DSGVO). Betreiber, die nicht gelesen
> werden möchten, sperren uns über `robots.txt` aus oder schreiben uns an.
>
> *[PRÜFPUNKT ANWALT: Bindungswirkung der Bot-Seite; Reichweite von § 44b UrhG bei
> einmaliger Auswertung ohne Training; Zitatzweck bei mehreren Zitaten derselben
> Quelle.]*

#### [EINGEFÜGT — Faktenblatt §4c · Generator-Grenze G10] Brand Score, Ranking und Bibliothek

> Der Brand-Check misst einen öffentlich zugänglichen Webauftritt anhand eines
> festen Kriterienkatalogs und vergibt einen **Brand Score zwischen 0 und 100**
> sowie acht Kategoriewerte. Jeder Wert stützt sich auf einen **Beleg aus dem
> Auftritt selbst**; die vollständige **Methodik ist öffentlich einsehbar**
> (`/brand-check/methodik`) und von jedem Ergebnis aus verlinkt.
>
> Ein Ergebnis ist zunächst **privat**. Es erscheint nur dann in unserem
> öffentlichen Ranking, wenn die prüfende Person dies beim Start ausdrücklich
> gewählt hat. Uns ist bewusst, dass die prüfende Person nicht immer der
> Markeninhaber ist. Deshalb gilt:
>
> - **Korrekturweg:** Zu jedem Ergebnis kann **ohne Konto und kostenlos** ein
>   Korrekturvorschlag eingereicht werden — mit Angabe des betroffenen Feldes, des
>   Vorschlags und einer Begründung. Eine Kontaktadresse ist freiwillig.
> - **Entfernungsweg:** Auf begründete Anfrage entfernen wir ein Ergebnis aus dem
>   öffentlichen Ranking. Diese Entfernung ist dauerhaft und wird nicht dadurch
>   aufgehoben, dass jemand anderes dieselbe Adresse erneut prüft.
> - **Kein Werturteil über den Anbieter:** Der Score beschreibt, wie klar ein
>   Auftritt seine Marke ausdrückt. Er ist keine Aussage über Qualität,
>   Zahlungsfähigkeit oder Seriosität eines Unternehmens; Vergleiche werden
>   **beschreibend** dargestellt, nicht herabsetzend.
> - In unserer **Bibliothek** zeigen wir Wortnamen und Kategorie bekannter Marken
>   sowie kurze Belegzitate von deren eigenen Auftritten — **keine Logos, keine
>   Bildmarken, keine Favicons**. Jeder Eintrag ist von Hand geprüft und mit
>   Prüfdatum versehen.
>
> Zur Begrenzung von Missbrauch merken wir uns bei einem Brand-Check einen
> **Prüfwert Ihrer IP-Adresse** (gebildet mit einem täglich wechselnden Zusatz),
> ausschließlich um die Zahl der Prüfungen pro Tag zu begrenzen. Die IP-Adresse
> selbst wird dabei **nicht gespeichert und nicht protokolliert**. Das Ergebnis zu
> einer Adresse halten wir **sieben Tage** als Zwischenspeicher vor.
>
> Rechtsgrundlage ist unser berechtigtes Interesse an einer nachvollziehbar
> belegten, öffentlich überprüfbaren Einordnung (Art. 6 Abs. 1 lit. f DSGVO).
>
> *[PRÜFPUNKT ANWALT: Genügen offengelegte Methodik + Korrekturweg + freiwilliges
> Opt-in des Prüfenden, oder braucht es eine Anhörung des Bewerteten bzw. eine
> Beschränkung auf die eigene Marke? § 824 BGB, § 6 UWG,
> Unternehmenspersönlichkeitsrecht.]*

#### Reichweitenmessung

**Art und Zweck der Verarbeitung**

Die Reichweitenmessung dient der Auswertung der Besucherströme unseres
Onlineangebotes ~~und kann Verhalten, Interessen oder demographische Informationen
zu den Besuchern, wie z.B. das Alter oder das Geschlecht, als pseudonyme Werte
umfassen~~. Mit Hilfe der Reichweitenanalyse können wir z.B. erkennen, zu welcher
Zeit unser Onlineangebot oder dessen Funktionen oder Inhalte am häufigsten genutzt
werden oder zur Wiederverwendung einladen. Ebenso können wir nachvollziehen,
welche Bereiche der Anpassung bedürfen.

> **[KORREKTUR — Generator-Grenze G5]** Der durchgestrichene Halbsatz ist für uns
> **falsch**: Wir erheben weder Alter noch Geschlecht, weder Interessen noch
> Verhalten über einen Besuch hinaus. Er ist ersatzlos zu streichen.

**Rechtsgrundlage**

Die Verarbeitung erfolgt gemäß Art. 6 Abs. 1 lit. f DSGVO auf Basis unseres
berechtigten Interesses. Die Messung der Reichweite und die sich daraus ergebenden
Informationen sind geeignet, um das Webangebot anzupassen.

**Empfänger**

~~Wir setzen für Betrieb und Wartung unserer Webseite technische Dienstleister
ein, die als unsere Auftragsverarbeiter tätig werden.~~
**[KORREKTUR]** Ein Dritter ist hier nicht beteiligt: Die Messung läuft auf einem
Server, den wir selbst betreiben.

**Bereitstellung vorgeschrieben oder erforderlich**

Die Bereitstellung der Daten ist weder gesetzlich noch vertraglich vorgeschrieben.

**Widerspruch**

Lesen Sie dazu die Informationen über Ihr Widerspruchsrecht nach Art. 21 DSGVO
weiter unten.

#### Eingesetzte Tools zur Reichweitenmessung

> **[ERSETZT — Generator-Grenze G4.** Der Generator gibt hier wörtlich
> „PLATZHALTER FÜR TOOL ZUR REICHWEITENMESSUNG · Bitte beschreiben Sie das Tool."
> aus, weil er nur Matomo, etracker und WiredMinds namentlich kennt. An diese
> Stelle gehört: **]**
>
> **Plausible Analytics (selbst gehostet)**
>
> Wir zählen Seitenaufrufe mit **Plausible Analytics**. Die Software läuft auf
> einem Server, den wir selbst betreiben (`plausible.hawaii.studio`); die Daten
> verlassen unseren Bereich nicht und werden an keinen Dritten übermittelt.
>
> Erfasst werden: der **Seitenaufruf**, die **aufgerufene Adresse**, die
> **Verweisquelle**, eine **grobe Herkunft** (Land) und der **Gerätetyp**.
>
> Nicht erfasst werden: **keine Cookies**, **keine gespeicherte IP-Adresse**,
> **keine Wiedererkennung über einzelne Besuche hinaus**, kein
> geräteübergreifendes Profil und keine Weitergabe an Werbenetzwerke. Aus diesem
> Grund fragen wir dafür auch keine Einwilligung ab und zeigen kein Cookie-Banner.
>
> Rechtsgrundlage ist unser berechtigtes Interesse an einer schlichten
> Besucherzählung (Art. 6 Abs. 1 lit. f DSGVO). Sie können der Messung
> widersprechen — schreiben Sie uns an hello@branding.supply.
>
> **[HINWEIS ZUR REIHENFOLGE — Paket R2c:** Dieser Abschnitt geht **vor** der
> Einbindung des Zählskripts live. Solange das Skript nicht eingebunden ist, wird
> gar nichts gemessen. **LÜCKE — David: Plausible-Site für `branding.supply`
> anlegen ⇒ Script-Id.]**

### Cookies

Ein Cookie ist ein kleiner Datensatz, der beim Besuch einer Website erstellt und
auf dem System Websitebesuchers zwischengespeichert wird. Wird der Server dieser
Website erneut vom Nutzer der Website aufgerufen, sendet der Browser des Nutzers
der Website das zuvor empfangenen Cookie wieder zurück an den Server. Der Server
kann die durch dieses Verfahren erhaltenen Informationen auswerten. Durch Cookies
kann insbesondere das Navigieren auf einer Website erleichtert werden.

~~Ausführliche Informationen zum Thema Cookies, und welche Cookies auf dieser
Website zu welchem Zweck im Einsatz sind, können Sie jederzeit in den
Cookie-Einstellungen aufrufen.~~

> **[KORREKTUR — Generator-Grenze G6]** Es gibt bei uns **keine
> Cookie-Einstellungen und kein Consent-Tool**, weil es nichts einzuwilligen gibt.
> An die Stelle des Verweises gehört die folgende Liste.

#### [EINGEFÜGT — Faktenblatt §3] Welche Cookies wir setzen

| Cookie | Wofür | Laufzeit |
| --- | --- | --- |
| `a_session_branding` | Ihre Anmeldung. Ohne dieses Cookie können Sie sich nicht anmelden. | Dauer Ihrer Sitzung |
| `i18n_redirected` | merkt sich die gewählte Sprache | dauerhaft, bis Sie es löschen |
| `pukalani-theme`, `pukalani-theme-variant`, `pukalani-neutral` | Farbwelt, Variante und Grundton der Oberfläche | 365 Tage |
| Hell-/Dunkel-Einstellung | merkt sich, ob Sie hell oder dunkel lesen | Voreinstellung des eingesetzten Moduls — **[kleine LÜCKE — vor Veröffentlichung im Browser nachsehen]** |

Alle genannten Cookies sind **notwendig oder reine Komforteinstellungen**. Keines
dient der Analyse oder der Werbung, keines wird an Dritte übermittelt.

#### Löschen von Cookies

Sie können einzelne Cookies oder den gesamten Cookie-Bestand löschen. Darüber
hinaus erhalten Sie Informationen und Anleitungen, wie diese Cookies gelöscht oder
deren Speicherung vorab blockiert werden können. Je nach Anbieter Ihres Browsers
finden Sie die notwendigen Informationen unter den nachfolgenden Links:

- Mozilla Firefox: https://support.mozilla.org/de/kb/cookies-loeschen-daten-von-websites-entfernen
- Microsoft Edge: https://support.microsoft.com/de-de/windows/verwalten-von-cookies-in-microsoft-edge-anzeigen-zulassen-blockieren-l%C3%B6schen-und-verwenden-168dab11-0753-043d-7c16-ede5947fc64d
- Google Chrome: https://support.google.com/accounts/answer/61416?hl=de
- Opera: http://www.opera.com/de/help
- Safari: https://support.apple.com/kb/PH17191?locale=de_DE&viewlocale=de_DE

Zusätzlich können Sie standardmäßig das Laden sog. Scripts verhindern. NoScript
erlaubt das Ausführen von JavaScript, Java und anderen Plugins nur bei
vertrauenswürdigen Domains Ihrer Wahl.

Informationen und Anleitungen, wie Sie diese Funktion bearbeiten können, erhalten
Sie über den Anbieter Ihres Browsers (z.B. für Mozilla Firefox:
https://addons.mozilla.org/de/firefox/addon/noscript/).

#### Technisch notwendige Cookies

**Art und Zweck der Verarbeitung**

Wir setzen Cookies ein, um unsere Website nutzerfreundlicher zu gestalten. Einige
Elemente unserer Website erfordern es, dass der aufrufende Browser auch nach einem
Seitenwechsel identifiziert werden kann.

Der Zweck der Verwendung technisch notwendiger Cookies ist, die Nutzung von
Websites für die Nutzer zu vereinfachen. Einige Funktionen unserer Website können
ohne den Einsatz von Cookies nicht angeboten werden. Für diese ist es
erforderlich, dass der Browser auch nach einem Seitenwechsel wiedererkannt wird.

Für folgende Anwendungen benötigen wir Cookies:

> **[KORREKTUR — Generator-Grenze G7]** Der Generator gibt die angekreuzten
> Anwendungen **nicht** aus (leere Aufzählung). Sie lauten:

- Übernahme Ihrer Spracheinstellung
- Anmeldung (Login)
- Übernahme Ihrer Anzeige-Einstellungen (Farbwelt, Grundton, hell/dunkel)

~~Eine Übersicht finden über die eingesetzten Cookies finden Sie in unserem
Cookie-Consent-Tool.~~ **[KORREKTUR — G6:** Die Übersicht steht oben in der
Tabelle; ein Consent-Tool gibt es nicht.**]**

**Rechtsgrundlage und berechtigtes Interesse**

Die Datenverarbeitung erfolgt insoweit allein auf Basis unseres berechtigten
Interesses an einer nutzerfreundlichen Gestaltung unserer Website und an der
Dokumentation der Einwilligung gem. Art. 6 Abs. 1 lit. f DSGVO in Verbindung mit
einer Abwägung nach § 25 Abs. 2 TDDDG.

**Empfänger**

Empfänger der Daten sind ggf. technische Dienstleister, die für den Betrieb und
die Wartung unserer Website als Auftragsverarbeiter tätig werden.

**Speicherdauer**

~~Die jeweilige Speicherdauer der Cookies entnehmen Sie bitte dem
Cookie-Consent-Tool.~~ **[KORREKTUR — G6:** siehe Tabelle oben.**]**

**Bereitstellung vorgeschrieben oder erforderlich**

Die Bereitstellung der vorgenannten personenbezogenen Daten ist weder gesetzlich
noch vertraglich vorgeschrieben. Ohne diese Daten sind jedoch der Dienst und die
Funktionsfähigkeit unserer Website nicht gewährleistet. Zudem können einzelne
Dienste und Services nicht verfügbar oder eingeschränkt sein.

**Widerspruch**

Lesen Sie dazu die Informationen über Ihr Widerspruchsrecht nach Art. 21 DSGVO
weiter unten.

### [EINGEFÜGT — Generator-Grenze G3 · Entscheidung 3] Zahlungsabwicklung

> *Benannter leerer Abschnitt. Heute findet auf branding.supply **keine
> Zahlungsabwicklung** statt: Es gibt keinen Preis, keinen Kauf und keinen
> Zahlungsdienstleister.*
>
> **[bei Paket Z1 einzusetzen: Stripe als Zahlungsdienstleister, verarbeitete
> Daten, Drittlandsbezug USA und dessen Grundlage, Rechnungs- und
> Aufbewahrungsfristen.]**

### [EINGEFÜGT — Faktenblatt §2] Speicherfristen im Überblick

> | Was | Wie lange |
> | --- | --- |
> | Konto und Inhalte der Werkstatt | bis Sie das Konto oder das Branding löschen |
> | Abgerufener **Rohtext** fremder Websites | höchstens **24 Stunden**, danach automatisch gelöscht |
> | Ergebnis eines **Brand-Checks** (Zwischenspeicher je Adresse) | **7 Tage**; ein Ranking-Eintrag bis zur Entfernung |
> | **Share-Links** auf ein Ergebnis | **30 Tage**, Widerruf jederzeit möglich |
> | Interne **Nutzungs-Ereignisse** (Zählwerte des Trichters, nie Ihr Text) | **24 Monate**, danach automatisch gelöscht |
> | Warteliste | bis zur Einladung oder bis Sie die Löschung verlangen |
> | Anfragen aus dem Erstgesprächs-Formular | **[FRIST — von David festzulegen]** |
> | Server-Protokolle | **[FRIST — von David festzulegen und technisch umzusetzen]** |
> | Sicherungskopien | **[LÜCKE — Aufbewahrungsdauer]** |

### [EINGEFÜGT — Faktenblatt §2, „Was NICHT stattfindet"] Was auf dieser Website nicht stattfindet

> - **Kein Werbenetzwerk, kein Retargeting, kein Profiling zu Werbezwecken.**
> - **Kein eingebetteter Fremdinhalt** — keine Videos, keine Karten, keine
>   Social-Buttons, keine fremden Kommentar-Werkzeuge.
> - **Keine fremden Schriften** — alle Schriften liefern wir von unserem eigenen
>   Server aus; eine Verbindung zu Google Fonts oder einem Schrift-Netzwerk
>   entsteht nicht.
> - **Kein Cookie-Banner**, weil es nichts einzuwilligen gibt.
> - **Kein Training fremder Modelle mit Ihren Texten.**
> - **Keine Fehler-Telemetrie** — auch keine automatisch übermittelten
>   Fehlerberichte aus Ihrem Browser.

### Information über Ihr Widerspruchsrecht nach Art. 21 DSGVO

**Einzelfallbezogenes Widerspruchsrecht**

Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
jederzeit gegen die Verarbeitung Sie betreffender personenbezogener Daten, die
aufgrund Art. 6 Abs. 1 lit. f DSGVO (Datenverarbeitung auf der Grundlage einer
Interessenabwägung) erfolgt, Widerspruch einzulegen; dies gilt auch für ein auf
diese Bestimmung gestütztes Profiling im Sinne von Art. 4 Nr. 4 DSGVO.

Legen Sie Widerspruch ein, werden wir Ihre personenbezogenen Daten nicht mehr
verarbeiten, es sei denn, wir können zwingende schutzwürdige Gründe für die
Verarbeitung nachweisen, die Ihre Interessen, Rechte und Freiheiten überwiegen,
oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von
Rechtsansprüchen.

**Empfänger eines Widerspruchs**

Gegenüber dem oben genannten Verantwortlichen, per E-Mail an hello@branding.supply

### Änderung unserer Datenschutzerklärung

Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie stets den
aktuellen rechtlichen Anforderungen entspricht oder um Änderungen unserer
Leistungen in der Datenschutzerklärung umzusetzen, z.B. bei der Einführung neuer
Services. Für Ihren erneuten Besuch gilt dann die neue Datenschutzerklärung.

### Fragen zum Datenschutz

Wenn Sie Fragen zum Datenschutz haben, schreiben Sie uns bitte eine E-Mail an den
oben genannten Verantwortlichen.

### Urheberrechtliche Hinweise

*Diese Datenschutzerklärung wurde mit Hilfe der activeMind AG erstellt – den
Experten für [externe Datenschutzbeauftragte](https://www.activemind.de/datenschutz/datenschutzbeauftragter/)
(Version #2024-10-25).*

> **NICHT ENTFERNEN**, solange dieser Generator-Text verwendet wird — Bedingung
> der kostenlosen Nutzung (Nutzungshinweise activeMind).

---

# TEIL B — Datenschutzerklärung (Englisch)

> **activeMind liefert keine englische Fassung** (Generator-Grenze G15: die Site
> ist rein deutsch, kein `hreflang`, keine EN-Seiten — geprüft 2026-09-08). Die
> **englische Gesamtfassung kommt mit eRecht24 Premium**; bis dahin stehen hier
> nur die drei Sonderabschnitte, die ohnehin kein Generator liefert. Sie sind
> Übersetzungen unserer eigenen Absätze, keine Generator-Bausteine — sie dürfen
> also übernommen werden, ohne dass ein fremdes Nutzungsrecht berührt wird.
>
> `branding.supply` fährt Englisch **ohne Präfix** und Deutsch unter `/de/*`
> (Monorepo-Konvention `prefix_except_default`). Englisch ist damit die
> **Standardsprache der Site** — eine englische Fassung ist deshalb kein
> Zusatz, sondern Pflicht vor dem Live-Gang.

## Privacy notice (excerpts — special sections only)

### Processing by a language model

> What you write in the workshop — answers in the conversation, notes, drafts —
> is sent to a language model in order to produce your results. It travels via the
> routing service OpenRouter, based in the USA, which forwards the request to a
> model provider.
>
> We have restricted this path technically, on every single request: only
> providers that commit to **not retaining the request** ("zero data retention")
> are permitted, and the use of your content **for training is denied**. If no
> such provider is available, the request is **not** handed to another one — it
> fails, and the feature is temporarily unavailable.
>
> We store the result of the processing (your draft, your score) so that you can
> keep working with it. The processing is necessary to perform our contract with
> you (Art. 6(1)(b) GDPR). Please do not enter special categories of personal
> data, or third-party data that does not belong there.
>
> **[GAP — to be supplied: the basis for the transfer to the USA and the
> contractual status with OpenRouter.]**
>
> *[LAWYER CHECKPOINT: controller vs. processor, basis for the transfer, DPA for
> business customers.]*

### Retrieval of publicly available websites

> For the brand check and the market comparison, our servers retrieve publicly
> available pages of the address you provide. In doing so, the website's server
> sees — as with any page view — our IP address and our user agent. There are
> **two**, because there are two operations:
> `PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)` for the
> brand check (one page) and
> `PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)` for the market
> comparison (several pages). Both pages permanently explain what we read, what we
> do not read, how long we keep it and how to block us — for each operation
> separately.
>
> We follow these rules: we read only **publicly available marketing pages** (no
> login areas, no forms, no downloads); we fetch and **honour `robots.txt`** for
> both operations, per user agent; we respect machine-readable **text and data
> mining reservations** (§ 44b UrhG) in their common forms (`TDM-Reservation`
> header, `/.well-known/tdmrep.json`, `tdm-reservation` meta, `noai`/`noimageai`)
> and exclude the site if one is present; we **never fetch** team, imprint,
> contact, privacy, terms, login, account or cart pages; everything else passes a
> **filter for e-mail addresses, phone numbers and personal names** before any
> further processing; and the retrieved **raw text is stored for at most 24 hours**
> and then deleted automatically, leaving only a structured summary with **short
> supporting quotes (max. 200 characters)** and the source URL.
>
> The legal basis is our legitimate interest in an evidence-based market view
> (Art. 6(1)(f) GDPR). Operators who prefer not to be read can block us via
> `robots.txt` or contact us.

### Brand score, ranking and library

> The brand check measures a publicly available web presence against a fixed
> catalogue of criteria and assigns a **brand score between 0 and 100** plus eight
> category values. Every value is backed by **evidence taken from the presence
> itself**; the full **methodology is public** and linked from every result.
>
> A result is **private by default**. It appears in our public ranking only if the
> person running the check explicitly chose so. We are aware that this person is
> not always the brand owner. Therefore: anyone can submit a **correction — free
> of charge and without an account**; on a substantiated request we **remove** a
> result from the public ranking permanently, and that removal is not undone by
> someone else checking the same address again; the score describes **how clearly
> a presence expresses its brand** and is not a statement about a company's
> quality, solvency or integrity; and our **library** shows word marks, categories
> and short supporting quotes from the brands' own presences — **no logos, no
> figurative marks, no favicons** — each entry verified by hand and dated.
>
> The legal basis is our legitimate interest in a transparent, evidence-based
> classification (Art. 6(1)(f) GDPR).

### [to be written with eRecht24 Premium] Everything else

> Controller · your rights · server log files · hosting and processors · contact
> form · waiting list (double opt-in) · account · reach measurement (self-hosted
> Plausible, cookieless) · cookies · payment (planned) · retention periods ·
> right to object · representative in the Union (Art. 27 GDPR).

---

# TEIL C — Impressum

## C.1 Deutsch (Ergebnis des activeMind-Impressums-Generators, Version 2024-07-21)

### Impressum

**Verantwortliche(r)**

> [ANBIETER — von David einzusetzen: Name des Unternehmens inkl. Rechtsform]

**Postanschrift**

> [ANBIETER — von David einzusetzen: vollständige ladungsfähige Anschrift]

**Kontakt**

> E-Mail: hello@branding.supply
>
> Telefon: [ANBIETER — von David einzusetzen: Telefonnummer oder andere schnelle Kontaktmöglichkeit]

**Vertreten durch**

> [ANBIETER — von David einzusetzen: vertretungsberechtigte Person(en) mit Position]

**Eintragung**

> Registernummer: [ANBIETER — von David einzusetzen: Registernummer, falls vorhanden]
>
> Gericht: [ANBIETER — von David einzusetzen: Registergericht, falls vorhanden]

**Umsatzsteuer-Identifikationsnummer**

> [ANBIETER — von David einzusetzen: USt-IdNr., falls vorhanden]

### Hinweise zur Website

**Urheberrechtliche Hinweise**

> [Bitte Informationen ergänzen] — *Platzhalter des Generators. Er greift nur,
> wenn auf der Website Bilder Dritter verwendet werden; branding.supply verwendet
> heute keine. **David prüft, ob der Block entfällt.***

**Verantwortlich für journalistisch-redaktionelle Inhalte**

> Verantwortlich i. S. d. § 18 Abs. 2 MStV für die redaktionellen Inhalte
> (Brand Insights): [ANBIETER — von David einzusetzen: Name und Anschrift]

*Dieses Impressum wurde mit Hilfe des Impressums-Generators der
[activeMind AG](https://www.activemind.de/) erstellt (Version 2024-07-21).*

> **NICHT ENTFERNEN**, solange dieser Generator-Text verwendet wird.

**Zwei bewusste Auslassungen**

- **§ 36 VSBG** (Verbraucherstreitbeilegung): Der Generator lässt den Block
  ersatzlos weg, sobald man „keine Leistungen für Verbraucher" wählt. Weil
  branding.supply seit dem 2026-09-08 **nur an Unternehmen und Selbstständige**
  verkauft, ist das folgerichtig — ob ein ausdrücklicher Satz trotzdem
  hineingehört, ist **Anwaltsfrage 28**.
- **Vertreter nach Art. 27 DSGVO**: kein Feld im Generator
  (Generator-Grenze G12) — steht als benannter leerer Abschnitt in Teil A und
  gehört nach Anwaltsantwort ggf. auch hierher.

## C.2 Englisch (Gerüst, mit denselben Platzhaltern)

### Legal notice

**Provider**

> [PROVIDER — to be supplied: company name incl. legal form]

**Postal address**

> [PROVIDER — to be supplied: full address at which legal service can be effected]

**Contact**

> E-mail: hello@branding.supply
>
> Phone: [PROVIDER — to be supplied]

**Represented by**

> [PROVIDER — to be supplied: authorised representative(s) and position]

**Register entry**

> Register number: [PROVIDER — to be supplied]
>
> Court: [PROVIDER — to be supplied]

**VAT identification number**

> [PROVIDER — to be supplied]

**Responsible for editorial content (§ 18 (2) MStV)**

> [PROVIDER — to be supplied: name and address]

> *Note: this English version is a working scaffold, not a translation approved by
> a lawyer. § 5 DDG and § 18 MStV are German provisions; whether an English legal
> notice must mirror them word for word is part of **question 3** in the fact
> sheet's block 1.*

---

# TEIL D — AGB: Gliederung (B2B)

> **Nur Gliederung und Stichworte — bewusst kein ausformulierter Rechtstext.**
> Den schreibt der Anwalt (Paket R3) bzw. eRecht24 Premium. Grundlage:
> Faktenblatt §5, angepasst an Davids Entscheidung vom **2026-09-08**: Kunden sind
> **nur Unternehmen und Selbstständige**; Verbraucher sind kein Kundenkreis.

| § | Überschrift | Stichworte |
| --- | --- | --- |
| **1** | **Geltungsbereich und Kundenkreis** | Angebot richtet sich **ausschließlich an Unternehmer i. S. d. § 14 BGB und Selbstständige**; Verbraucher sind ausgeschlossen · **Unternehmer-Bestätigung bei der Registrierung** ist Vertragsvoraussetzung (Pflicht-Häkchen „Ich handle als Unternehmer/in oder Selbstständige/r", de+en, in allen Anmeldewegen; am Konto gespeichert wie die AGB-Fassung — Paket R1c) · abweichende Bedingungen des Kunden gelten nicht |
| **2** | **Vertragsgegenstand** | **Fundament frei, Ableitung bezahlt** (Entscheidung 2026-08-27): Brand Foundation (Purpose, Werte, Archetyp, Positionierung, Stimme) im Gespräch mit einem KI-Markenberater · kostenloser **Brand-Check** · **Marktvergleich** und spätere Ableitungen als bezahlte Leistung · was **nicht** geschuldet ist: Markenrecherche, Rechtsberatung, Designleistung |
| **3** | **Beta-Betrieb** | Software in Erprobung · Funktionen können sich ändern oder entfallen · **keine Verfügbarkeitszusage**, keine Reaktionszeiten · Empfehlung, Ergebnisse zu sichern · Zugang nur auf Einladung |
| **4** | **Beta-Konten dauerhaft frei** | Zusage gilt **je Konto**, nicht als unbegrenzte Zahl von Brandings · bestehende Nutzungsgrenzen bleiben (u. a. drei Läufe je Tag und Branding) · **Widerruf je Konto bei Missbrauch** · Übergang in ein bezahltes Angebot berührt bestehende Beta-Konten nicht (Entscheidung 6) |
| **5** | **Registrierung, Konto, Zugangsdaten** | ein Konto je Person · richtige Angaben · Geheimhaltung der Zugangsdaten · Sperrung bei Verstoß |
| **6** | **KI-Ergebnisse ohne Gewähr** | Entwürfe eines Sprachmodells können falsch, unvollständig oder unpassend sein · **keine Rechts-, Marken- oder Steuerberatung** · Prüfpflicht des Kunden **vor Verwendung**, insbesondere auf **Markenrechte Dritter** · keine Zusicherung von Schutzfähigkeit, Verfügbarkeit oder Eintragbarkeit eines Namens |
| **7** | **Nutzungsrechte an den Ergebnissen** | dem Kunden ein **umfassendes, zeitlich und räumlich unbeschränktes** Nutzungsrecht an seinem Fundament · im Gegenzug Recht des Anbieters, Ergebnisse **anonymisiert** zur Verbesserung des Dienstes zu nutzen · **öffentliche Anzeige nur mit ausdrücklicher Freigabe je Marke** (`publicationVisibility`, `marketVisibility`, Default privat) — *eine Zustimmung gilt nur für das, wofür sie gegeben wurde* |
| **8** | **Pflichten des Kunden** | keine rechtswidrigen Inhalte · keine Daten Dritter ohne Grundlage · keine Umgehung der Nutzungsgrenzen · keine automatisierte Massennutzung · keine Weitergabe des Zugangs |
| **9** | **Abruf fremder Websites auf Veranlassung des Kunden** | der Kunde benennt die Adresse, wir rufen ab · Grenzen wie im Datenschutz-Abschnitt (robots.txt, TDM-Vorbehalt, Pfad-Sperrliste, PII-Filter, Rohtext ≤ 24 h) · der Kunde sichert zu, keine Adressen einzutragen, zu deren Abruf er offensichtlich nicht berechtigt ist |
| **10** | **Öffentliche Bewertung und Ranking** | Ergebnis privat, Veröffentlichung nur mit Häkchen des Prüfenden · Methodik öffentlich · **Korrekturweg und Entfernungsweg** auch für Nicht-Kunden · kein Werturteil über das Unternehmen |
| **11** | **Preise, Steuern, Rechnung** *(gilt ab Paket Z1)* | **Preise netto zzgl. gesetzlicher Umsatzsteuer** — B2B-Folge: im Preis-Katalog `tax_behavior: 'exclusive'`, **nicht** das `'inclusive'` der Community-Preise · Rechnung mit B2B-Angaben (Firma, Anschrift, USt-IdNr.) · **[LÜCKE — Name des Kaufgegenstands und Betrag]** · Fälligkeit, Zahlungsverzug |
| **12** | **Kein Verbraucher-Widerrufsrecht** | Digitale Leistungen an Unternehmer: das gesetzliche Widerrufsrecht für Verbraucher (§ 355, § 356 Abs. 5 BGB) **findet keine Anwendung** · Stelle, an der bei einem Verbraucher-Angebot die Widerrufsbelehrung stünde — hier bewusst ein Satz zur Klarstellung statt einer Belehrung |
| **13** | **Laufzeit, Kündigung, Löschung** | Konto jederzeit kündbar · was bei Kündigung mit Inhalten geschieht · Frist bis zur Löschung · Export der Ergebnisse vor der Löschung |
| **14** | **Änderungen dieser Bedingungen** | Ankündigung, Zustimmungsweg, Widerspruchsfolge · **Baubefund:** die Zustimmung wird heute **nicht** am Konto gespeichert (`terms` ist reiner UI-Belang, `packages/core/schemas/auth.ts`) — Fassungsnummer und Zeitpunkt am Konto sind Paket R1, weil das Häkchen zunächst auf einen **Entwurf** gesetzt wird |
| **15** | **Haftung** | Einschränkung im gesetzlich zulässigen Rahmen · Vorsatz und grobe Fahrlässigkeit, Kardinalpflichten, Leben/Körper/Gesundheit unberührt · **Datenverlust in der Beta ausdrücklich ansprechen** · keine Haftung für Entscheidungen, die auf KI-Entwürfen beruhen |
| **16** | **Anwendbares Recht und Gerichtsstand** | **[benannter leerer Abschnitt — Entscheidung 3]**: anwendbares Recht und Gerichtsstand hängen am Sitz des Anbieters (USA, Faktenblatt §1) und sind **[LÜCKE — nach Anwaltsantwort]** · **§ 36 VSBG entfällt** mit dem B2B-Zuschnitt (s. Anwaltsfrage 28) |
| **17** | **Schlussbestimmungen** | Schriftform, salvatorische Klausel, Fassung und Datum |

---

# TEIL E — Was David einsetzen muss

Ohne diese Angaben bleibt jede Stelle unten ein Platzhalter. Die Nummern in
Klammern verweisen auf Faktenblatt §7.

| # | Platzhalter im Entwurf | Wo er steht | Faktenblatt |
| --- | --- | --- | --- |
| E1 | **Firmenname inkl. Rechtsform** | Teil A „Verantwortlicher", Teil C | §7 Nr. 1 |
| E2 | **Vollständige ladungsfähige Anschrift** | Teil A, Teil C | §7 Nr. 1 |
| E3 | **Telefonnummer** (oder andere schnelle Kontaktmöglichkeit) | Teil C | §7 Nr. 1 |
| E4 | **Vertretungsberechtigte Person(en) mit Position** | Teil C | §7 Nr. 1 |
| E5 | **Registernummer und Registergericht** (falls vorhanden) | Teil C | §7 Nr. 1 |
| E6 | **USt-IdNr.** (falls vorhanden) | Teil C | §7 Nr. 1, Nr. 12 |
| E7 | **Name und Anschrift für § 18 Abs. 2 MStV** (Redaktion Brand Insights) | Teil C | §6 Frage 23 |
| E8 | **Frist für Server-Protokolle** — festlegen **und** technisch umsetzen (logrotate) | Teil A „Erfassung allgemeiner Informationen", Speicherfristen-Tabelle | §7 Nr. 7 |
| E9 | **Frist für Anfragen aus dem Erstgesprächs-Formular** | Teil A „Kontaktaufnahme", Speicherfristen-Tabelle | neu (Paket Z0) |
| E10 | **Standort des Hetzner-Rechenzentrums** (app-prod und appwrite-prod) | Teil A „Hosting" | §7 Nr. 2 |
| E11 | **Registrar und DNS-Anbieter der Zone `branding.supply`** | Teil A „Hosting" | §7 Nr. 3 |
| E12 | **SMTP-Anbieter bestätigen** (voraussichtlich Resend) **+ AVV** | Teil A „Hosting", Subprozessoren-Tabelle | §7 Nr. 4 |
| E13 | **OpenRouter: Vertragsstand** und die faktisch zugelassenen Modellanbieter | Teil A „Sprachmodell", Subprozessoren-Tabelle | §7 Nr. 5 |
| E14 | **Grundlage der Übermittlung in die USA** (OpenRouter, ggf. SMTP) | Teil A „Sprachmodell", „Hosting" | §7 Nr. 5, Frage 2 |
| E15 | **Aufbewahrung der Sicherungskopien** (Frist, Standort, Verschlüsselung) | Teil A „Hosting", Speicherfristen-Tabelle | §7 Nr. 6 |
| E16 | **Vertreter nach Art. 27 DSGVO** — beauftragen oder begründet verneinen | Teil A „Vertreter in der Union", ggf. Teil C | §7 Nr. 8, Frage 1 |
| E17 | **Plausible-Site für `branding.supply` anlegen** ⇒ Script-Id | Teil A „Eingesetzte Tools" (und Paket R2c) | §7 Nr. 13 |
| E18 | **Speicherort der Hell-/Dunkel-Einstellung** im Browser nachsehen | Teil A Cookie-Tabelle | §3 Cookie-Zeile 4 |
| E19 | **Name des Kaufgegenstands und Betrag** | Teil D §11 | §7 Nr. 10 |
| E20 | **Anwendbares Recht und Gerichtsstand** | Teil D §16 | §7 Nr. 12, Frage 5 |
| E21 | **Urheberrechtliche Hinweise im Impressum** — Block streichen oder füllen | Teil C.1 | Generator-Platzhalter |

---

# TEIL F — Neue Anwaltsfragen aus dem Generator-Lauf

> Die Fragen **1–23** stehen bereits im Faktenblatt §6 (drei Blöcke, ein Termin).
> Die folgenden sind **neu** und **erst durch diesen Lauf entstanden**. Nummerierung
> setzt fort, damit im Termin nicht zwei Listen nebeneinanderliegen.

**24. Rechtsgrundlage des Kundenkontos.** Der Generator stützt das Konto auf
**Einwilligung** (Art. 6 Abs. 1 lit. a), das Faktenblatt auf **Vertragserfüllung**
(lit. b). Welche gilt für ein Konto, das die Vertragsleistung überhaupt erst
zugänglich macht — und was folgt daraus für Widerruf und Löschpflicht?

**25. Eine Frist, die es technisch nicht gibt.** Für die Server-Protokolle ist
heute **kein logrotate** eingerichtet, die Aufbewahrung also faktisch unbefristet.
Darf eine Frist im Text stehen, bevor sie technisch greift — oder ist der Satz
dann eine unrichtige Angabe? (Dieselbe Frage stellt sich für die Anfragen aus dem
Erstgesprächs-Formular, die von Hand gelöscht werden.)

**26. Cookies ohne Consent-Tool.** Der Generator verweist für die Cookie-Übersicht
zweimal auf ein Consent-Tool, das wir bewusst nicht haben. Genügt eine schlichte
Tabelle im Text? Und sind die Anzeige-Cookies (`pukalani-theme`,
`pukalani-theme-variant`, `pukalani-neutral`, Hell/Dunkel) „unbedingt
erforderlich" i. S. d. § 25 Abs. 2 TDDDG, oder wären sie einwilligungspflichtig,
weil sie reine Komforteinstellungen sind?

**27. Warteliste und § 7 UWG.** Die Warteliste verschickt keine Werbung, sondern
Einladungen — sie hat aber ein Double-Opt-in wie ein Newsletter. Ist die Einladung
eine geschäftliche Ansprache i. S. d. § 7 UWG, und braucht der
Einwilligungstext dann eine eigene Formulierung?

**28. § 36 VSBG bei reinem B2B.** Der Impressums-Generator lässt den VSBG-Block
**ersatzlos weg**, sobald man „keine Leistungen für Verbraucher" wählt. Genügt das
Weglassen, oder gehört ein ausdrücklicher Satz („wir nehmen an einem
Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle nicht teil")
auch dann ins Impressum, wenn keine Verbraucher bedient werden? *(Verschärft Frage
4 aus Block 1, die noch von einem gemischten Kundenkreis ausging.)*

**29. Datenschutzbeauftragter.** Der Generator fragt danach; im Repo ist keiner
belegt, deshalb wurde „nein" geantwortet. Besteht bei diesem Zuschnitt
(KI-Verarbeitung von Kundentexten, systematischer Abruf und Bewertung fremder
Auftritte) eine Bestellpflicht nach Art. 37 DSGVO / § 38 BDSG — und braucht es
eine **Datenschutz-Folgenabschätzung** nach Art. 35 DSGVO?

**30. Wo gehört der Art.-27-Vertreter hin?** Der Generator kennt ihn weder im
Datenschutztext noch im Impressum. Gehört die Angabe in die Datenschutzerklärung,
ins Impressum oder in beides?

**31. Darf der Generator-Text geändert werden?** Die Nutzungshinweise von
activeMind verlangen, den Herkunftshinweis „auf jeden Fall zu belassen". Wir
**ändern** Sätze (Reichweitenmessung, Kundenkonto, Cookies) und **fügen eigene
Abschnitte ein**. Ist der Hinweis dann noch zutreffend — oder erweckt er den
Eindruck, activeMind habe auch die eingefügten Abschnitte verantwortet? *(Das ist
kein Formalismus: der Hinweis ist die Gegenleistung für die kostenlose Nutzung.)*

**32. Trägt die Unternehmer-Bestätigung?** Der Ausschluss von Verbrauchern beruht
auf einer **Selbstauskunft beim Registrieren** (Paket R1c). Genügt sie, um das
Verbraucherrecht (Widerruf, Preisangaben, VSBG) auszuschließen — und was passiert,
wenn jemand falsch ankreuzt? *(Vertieft Frage 13 aus Block 2, die noch offen
ließ, ob überhaupt auf Unternehmer beschränkt wird.)*

**33. Reichweitenmessung als „berechtigtes Interesse".** Cookielos und ohne
IP-Speicherung — genügt Art. 6 Abs. 1 lit. f, und ist § 25 TDDDG mangels Zugriff
auf Endgeräte-Informationen wirklich nicht berührt?

---

## Nächste Schritte

1. **David füllt Teil E** (mindestens E1–E7, sonst ist nichts veröffentlichungsfähig).
2. **David liest Teil A–D gegen** — vor allem die mit `[KORREKTUR]` markierten
   Stellen: dort widerspricht der Generator-Text unserem Code.
3. **Anwaltstermin R3** mit Faktenblatt §6 (Fragen 1–23) **und** Teil F (24–33).
4. Danach: **eRecht24 Premium** für die Gesamtfassung **de + en**; dieser Entwurf
   wird dann zur Vergleichsvorlage und zieht nach `docs/archiv/`.
5. **Erst Text, dann Schalter**: Der Plausible-Abschnitt steht, **bevor** das
   Zählskript eingebunden wird (Paket R2c).
