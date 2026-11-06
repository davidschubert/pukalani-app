# Marktvergleich — Strategie und Konzept (ausgeführt)

Status: **AUSGEFÜHRT — M0–M6b live (2026-09-06).** Dieses Dokument ist ein
PROTOKOLL, keine Arbeitsliste: es hält fest, was entschieden und warum es so
gebaut wurde. Was von MV1 noch offen ist, steht ausschliesslich in
[OPEN-ITEMS.md](../OPEN-ITEMS.md); der vollständige Erledigt-Eintrag samt
**Gelernt** steht in [OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md).

**Der Weg in Commits:** Strategie + Konzept freigegeben 2026-09-05 (§6, acht
Entscheidungen), Prototyp M0/M0b von David abgenommen 2026-09-05, §7 als
Erweiterung aus der Prototyp-Runde — dann

| Paket | Commit | Was |
| --- | --- | --- |
| M1 | `475aeabd` | Layer `market`, Vertrag zu `brand`, drei Tabellen (Anhang B) |
| M2 | `1bb5c55f` | Abruf, Extraktion, KI-Aussensicht mit Beleg-Riegel (Anhang C) |
| M3 | `11be1ef4` | Vergleich, Markt-Befunde, Brand-Check-Anbindung, § 6 UWG-Riegel (Anhang D) |
| M4 | `8e936691` + `0add6133` | Seite „Markt", Quellen-Wähler, Leiste, Schranke; Gate-Nachfix (Anhang E) |
| M5 | `ae3b70d7` | Betrieb: Frist-Sweep, `/market-bot`, Vertraulichkeit, Bewertung, Runbook (Anhang F) |
| M6 | `0c2070bc` | Bibliotheks-Werkzeug, Trockenlauf, Handprüfungs-Runbook, Rechts-Check-Memo (Anhang G) |
| M6b | `66377315` | Bibliothek scharf: erfundene Einträge raus, `the-barn` + `apple` nach Davids Handprüfung |

**In Betrieb:** Prod-Migrationen `brand-018/019` + `market-001…004` auf der
Instanz `branding` am 2026-09-06 mit Davids Ja gefahren, Gate-Flip `9e984253`
(auf `main` als Merge `f7bd9fe4`), Rauchtest in Produktion von David bestanden.
Erster bezahlter Bibliothekslauf ≈ $0,11 (fünf Extraktionen); Bibliothek in der
Fassung `lib-3`. Runbooks: [MARKTVERGLEICH-EINFUEHRUNG.md](../runbooks/MARKTVERGLEICH-EINFUEHRUNG.md)
(Durchlauf abgehakt) und [MARKTVERGLEICH-BIBLIOTHEK.md](../runbooks/MARKTVERGLEICH-BIBLIOTHEK.md).

**Der Text unten steht im Stand vom 2026-09-05/06** und wird nicht auf heute
umgeschrieben — Zukunftsformen („als Nächstes M3") sind als Momentaufnahme zu
lesen.

## 0. Was das hier ist

Davids Produktgedanke vom 2026-09-04, gestellt am Ende des Gesprächs über die
Branding-Atome:

> „Wir könnten später mit Konkurrenzanalysen möglichst genau herausfinden, wo sich unsere
> Marke am Markt am besten positionieren sollte. Und dementsprechend in der Datenanalyse
> und im Markenvergleich zwischen meiner erstellten Marke und der am Markt am besten
> platzierten Marke sagen, was wir verändern, verbessern oder überdenken sollten. Das ist
> ein Produkt, mit dem man richtig Geld verdienen kann."

Und Davids Startwort vom 2026-09-05: „Marktvergleich planen — Strategie und Konzept
starten." Dieses Dokument ist die Strategie (Analyse, Zielbild, Grenzen) und das Konzept
(Produktform, Verträge, Ablauf, Datenmodell, Kosten, Recht), mit den offenen
Entscheidungen als Fragen mit Optionen und Empfehlung (§6). Es ist bewusst EIN Dokument,
wie der Workflow es verlangt; der Prototyp kommt erst nach der Freigabe.

---

## 1. Strategie

### 1.1 Wo kommen wir her

Der Brand-Wizard liefert seit BW2 (docs/archiv/BRAND-WIZARD-SESSIONS.md) eine Foundation
als **strukturierte Daten**: 68 Felder mit stabiler Id, Schema, Herkunft (Quellen-Slots),
Bestätigungs- und Abnahme-Zustand, Notizen und Befunden — kein PDF. Genau das macht einen
Vergleich überhaupt möglich: eine fremde Marke kann in DIESELBE Struktur übersetzt und
Feld für Feld nebeneinandergelegt werden.

Was der Wizard heute über den Markt weiss, stammt ausschliesslich vom Kunden:

- `a.competitors` — drei bis fünf Wettbewerber, je ein Satz Stärke/Schwäche, **nur aus
  den Eingaben** („every name appears literally in the inputs"), vertraulich (`internal`).
- `a.category` / `b.positioningCategory` — die Kategorie, in der die Marke spielt, als
  offener Kurztext.
- `b.positioningFirstChoice` — „Warum sollte ein Kunde euch zuerst wählen?" — die eigene
  Behauptung.
- `d.gapReveal` — „Selbstbild gegen Aussenbild": heute OHNE externe Daten, also aus dem
  Selbstbild abgeleitet.
- Die **URL-Analyse der eigenen Website** (brand-010, `brandSiteAnalysis.ts`,
  `brandSiteFetch.ts`): ein SSRF-fester Abruf EINER Seite, 2 MB / 20 000 Zeichen,
  Text bleibt am Server, Naht für bis zu fünf Same-Origin-Seiten vorbereitet, nicht gebaut.

### 1.2 Wo stehen wir

George hört nur die Gründerin oder den Gründer. Die **Aussensicht** — Kundeninterviews,
Marktforschung, der Blick von aussen — ist das, was Agenturen mitbringen und wir nicht
(Einschätzung vom 2026-09-04: „Agenturen bringen die Aussensicht mit. Wir hören heute nur
die Gründerin oder den Gründer.").

Gleichzeitig haben wir einen Vorteil, den Agenturen nicht haben: **Jede Aussage der
eigenen Marke hat eine Adresse** (Slot-Id), eine Herkunft und einen Zustand. Eine
Wettbewerber-Aussage, die in dieselbe Adresse übersetzt wird, ist damit VERGLEICHBAR — nicht
als Gefühl („die wirken moderner"), sondern als Gegenüberstellung derselben Frage:
„Welches Versprechen macht ihr / machen sie in der Kategorie X?"

### 1.3 Wo wollen wir hin — das Zielbild in einem Satz

> **„Wo steht meine Marke im Feld ihrer Wettbewerber — welche Versprechen sind besetzt,
> welche frei, wo klingen wir gleich — und was sollten wir deshalb ändern, schärfen oder
> überdenken?"**

Das Produkt beantwortet diese Frage aus **öffentlich gesagten Dingen** (Websites der
Wettbewerber), übersetzt in die Feldstruktur der Foundation, und liefert das Ergebnis als
(1) eine Gegenüberstellung je Dimension, (2) drei Listen — **Konventionen** (was alle
sagen, also Eintrittskarte, kein Unterscheidungsmerkmal), **Überschneidungen** (was wir
sagen und mindestens ein Wettbewerber auch) und **freie Stellen** (was niemand im Feld
besetzt) — und (3) **Befunde am eigenen Feld** („eure Positionierungs-Behauptung sagt
wörtlich, was zwei Wettbewerber auch sagen — hier ist der Satz, hier die Quelle"), als
Chips derselben Art wie die Konflikt-Befunde aus BW2, beratend, mit Annehmen/Ablehnen.

### 1.4 Was das Produkt BEWUSST NICHT behauptet

Das ist die wichtigste Strategie-Entscheidung, weil sie das Versprechen ehrlich hält
(Einschätzung 2026-09-04: „‚die am besten platzierte Marke' braucht ein Mass, und
Positionierung ist relativ"):

- **Kein Ranking „beste Marke".** Wir sehen, was Marken SAGEN, nicht, wie gut sie damit
  ankommen. Marktanteil, Bekanntheit, Werbedruck, Kundenzufriedenheit sind ohne teure
  Datenquellen nicht ehrlich messbar (§1.6). Das Produkt zeigt den **Behauptungs-Raum**
  (claim space) der Kategorie — nicht den Markterfolg.
- **Keine Aussage über Dritte als Urteil.** Jede Wettbewerber-Aussage erscheint als
  ZITAT mit Quelle („laut ihrer Startseite: …"), nie als unsere Bewertung („Wettbewerber
  X ist unklar"). Das ist rechtlich geboten (§1.7) und produktlich richtig: der Kunde
  urteilt, wir zeigen.
- **Keine automatische Suche nach Wettbewerbern.** Die Namen kommen aus `a.competitors`,
  die ADRESSEN gibt der Kunde. Eine geratene Adresse ist die erste Halluzination des
  Produkts; sie darf gar nicht entstehen (§6, Frage 4).
- **Kein Ersatz für Kundeninterviews.** Das Aussenbild aus Websites ist das Aussenbild,
  das die Wettbewerber ZEIGEN wollen — nicht das, was Kunden erleben. Das steht als
  Hinweis im Produkt, nicht im Kleingedruckten.

### 1.5 Zielgruppe und Nutzen

Die Beispielwelt der Session-Inhalte (Davids Entscheidung 2026-09-04) ist die Zielgruppe:
Software/SaaS, Agenturen, Kreativ-Studios, Gastronomie, Yoga-Studios, Interior Design,
Coaches, Freelancer und Personal Brands. Gemeinsam ist ihnen:

- Sie **kennen ihre drei bis fünf Wettbewerber** namentlich und haben deren Websites
  gesehen — aber nie systematisch nebeneinandergelegt.
- Sie formulieren ihre Positionierung **aus dem Bauch** und merken nicht, dass die halbe
  Kategorie denselben Satz sagt („individuell, persönlich, mit Leidenschaft").
- Eine Agentur-Wettbewerbsanalyse ist für sie unerschwinglich; die Frage „klingen wir wie
  alle?" ist trotzdem ihre dringendste.

Der Nutzen ist deshalb nicht „Marktforschung", sondern ein **Spiegel mit Beleg**: die
eigene Behauptung neben denen der Nachbarn, Satz für Satz, mit der Einladung, das eigene
Feld zu schärfen — genau dort, wo George im Gespräch nachfragt.

### 1.6 Datenquellen — was realistisch geht

| Quelle | Phase | Ehrlich lieferbar | Grenze |
| --- | --- | --- | --- |
| Website des Wettbewerbers (Start + bis 5 Same-Origin-Seiten: über uns, Leistungen, Preise) | **1** | Positionierung, Kategorie-Sprache, Versprechen, Tonalität, Tagline, Kernbotschaften, Zielgruppen-Ansprache | JS-gerenderte Seiten (SPA) liefern wenig Text; dünne Seiten liefern dünne Profile — dann steht das Feld LEER, nie erfunden |
| Meta-Tags, JSON-LD (Organization, description) | 1 | Selbstbeschreibung in einem Satz | oft leer oder generisch |
| Bewertungs-Snippets (Google, Trustpilot) | 2, nach Rechtsprüfung | Kunden-Wahrnehmung (das echte Aussenbild) | Nutzungsbedingungen der Plattformen, personenbezogene Daten |
| LinkedIn-/Social-Beschreibungen | 2, nach Rechtsprüfung | Tonalität, Selbstbild | Zugriffsschranken, AGB |
| Marktanteil, Bekanntheit, Werbedruck, Traffic | **nie in Phase 1** | — | nur über bezahlte APIs (Similarweb, Semrush, Brandwatch) mit Budget, das ein Freelancer nicht trägt; Recherche §1.8 |

Phase 1 = **nur die Website**, weil das der Ort ist, an dem eine Marke ihre Positionierung
öffentlich behauptet — und das ist genau die Ebene, auf der die Foundation formuliert ist.

### 1.7 Rechtlicher und ethischer Rahmen (Phase 1)

Grundsätze, die ins Konzept als Verträge einfliessen (§2.9) — die Rechtsrecherche mit
Quellen ergänzt §1.8; die Sätze hier sind die Produktregeln, unabhängig davon, was im
Detail noch zu klären ist:

1. **Nur öffentlich zugängliche Marketing-Texte** von Unternehmens-Websites; keine
   Login-Bereiche, keine Formulare, keine Downloads.
2. **robots.txt und maschinenlesbare Nutzungsvorbehalte werden RESPEKTIERT** (Text- und
   Data-Mining-Opt-out nach § 44b UrhG / DSM-Richtlinie Art. 4 — die Recherche klärt die
   heute übliche Form des Vorbehalts). Ein Vorbehalt heisst: dieser Wettbewerber wird
   nicht ausgewertet, mit ehrlicher Meldung an den Kunden.
3. **Keine personenbezogenen Daten.** Team-, Impressum- und Kontaktseiten werden gar nicht
   abgerufen (Pfad-Heuristik), und der extrahierte Text wird auf Namen/E-Mail/Telefon
   gefiltert, bevor er ein Modell sieht.
4. **Rohtext ist Zwischenprodukt**, kein Bestand: gespeichert höchstens 24 Stunden, danach
   bleibt nur das strukturierte Marktprofil mit KURZEN Belegzitaten (≤ 200 Zeichen je
   Feld, Zitatschranke) und der Quell-URL.
5. **Vergleichende Darstellung ohne Herabsetzung** (UWG-Massstab): wir zeigen, was eine
   Website sagt, und was unsere Marke sagt — nie „X ist schlechter". Formulierungen des
   Modells werden darauf geprüft (Prompt-Regel + Stichwort-Filter), Befunde richten sich
   IMMER an das eigene Feld („euer Satz klingt wie …"), nie an den Dritten.
6. **Vertraulich wie `a.competitors`**: Marktprofile und Berichte reisen nicht per
   Share-Link und nicht ins Dokument-Export (Sensitivity `internal`).
7. **Prompt-Injection-Grenze** (bestehende Regel des Wizards): fremder Website-Text ist
   DATEN, nie Anweisung — der Extraktions-Prompt sagt das ausdrücklich, und die Ausgabe ist
   Zod-geprüft, Felder ohne Beleg werden verworfen.

### 1.8 Konkurrenz-Werkzeuge und Praxis (Recherche 2026-09-05, Volltext mit Quellen: Anhang A)

**Werkzeuge im Feld** (Auszug; Preise laut Quellen, teils unsicher):

| Werkzeug | Vergleicht | Ausgabe | Preis | Für wen | Schwäche für unseren Fall |
| --- | --- | --- | --- | --- | --- |
| Crayon / Klue | Websites, Preisseiten, Stellen, Social (Competitive Intelligence) | Battlecards, Alerts | 16–40 k$/Jahr | B2B-SaaS-Vertrieb | Signalflut, kein Markenmodell, unbezahlbar für Kleinmarken |
| Kompyte | automatisiertes Tracking | Reports | ab ~300 $/Jahr | Mid-Market | flach |
| Semrush AI Visibility / Ahrefs Brand Radar | Nennung/Sentiment in KI-Antworten | Prompt-Tracking, Indizes | 99–699 $/Monat | SEO | misst Sichtbarkeit, nicht Positionierung |
| Similarweb | Traffic, Kanäle | Dashboards | ab 125 $/Monat, API Enterprise | Growth | keine Markeninhalte |
| Tracksuit / Latana | echte Wahrnehmung (Panel) | Awareness-Dashboards | ~20–50 k$/Jahr | Wachstumsmarken | Sample zu klein für Nischen |
| IdeaProof | Website → Strategie; Wettbewerb als Zusatzmodul | Archetyp, Mission, UVP, Voice-Achsen, Map | Credits (Strategie 50, Competitor 70) | Gründer | Tiefe unklar, keine Belegpflicht |
| ChatGPT direkt | alles und nichts | Prosa | ~20 $/Monat | jeder | halluziniert Preise, Logos, Fakten |

**Fünf Erkenntnisse, die die Strategie tragen:**

1. **Die Lücke ist echt.** CI-Tools vergleichen Features, AI-Visibility-Tools Nennungen,
   Panel-Tracker Wahrnehmung, Generatoren erzeugen Felder ohne Aussenblick — **niemand
   übersetzt Wettbewerber-Websites in dieselbe Feldstruktur einer Brand Foundation.**
2. **Der Zuschnitt „Foundation inklusive, Vergleich zusätzlich" existiert nebenan**
   (IdeaProof: 50 vs. 70 Credits) — als flacher Zusatz ohne Beleg. Das bestätigt §1.9 und
   zeigt, womit wir uns unterscheiden müssen: Tiefe und Beleg.
3. **Aus Website-Text entsteht eine Positioning Map, nie eine Perceptual Map.** Die
   Agentur-Praxis trennt das streng; Karten ohne Kundendaten gelten als Dekoration. Das
   ist der Grund für §1.4 und §6 Frage 5 (keine Achsen-Karte in Phase 1).
4. **Belegpflicht ist das Produkt.** Zitat + URL + Abrufdatum je Aussage schliesst
   Halluzinationen aus, erfüllt die Nachprüfbarkeit nach UWG und unterscheidet uns von
   „ChatGPT kann das auch". Genau das ist der Riegel aus §2.2.
5. **„Category Conventions" ist der bessere Rahmen** als eine Achsengrafik: überfüllte
   Claims, ungeschützte Stärken, für Regeln gehaltene Muster — das leistet der
   Feld-für-Feld-Vergleich aus §2.3 direkt.

**Drei Risiken, die in die Verträge eingeflossen sind (§1.7/§2.9):**

1. **§ 6 UWG — vergleichende Werbung.** Sobald das Produkt Formulierungen ZUM
   VERÖFFENTLICHEN vorschlägt („anders als X …"), führt es den Kunden ins Haftungsrisiko;
   ein Mitbewerber ist auch ohne Namen „erkennbar". Folge: **interne Analyse ja, fertige
   Vergleichs-Claims und Scores je Wettbewerber nein** — George entwirft aus einem
   Markt-Befund NIE einen Satz, der einen Dritten nennt oder erkennbar macht (neue
   Prompt-Regel + Filter, §2.9 Nr. 5 verschärft).
2. **TDM-Vorbehalte.** § 44b UrhG trägt nur, solange robots.txt und erkennbare Vorbehalte
   respektiert werden; ob ein Vorbehalt in natürlicher Sprache (AGB) „maschinenlesbar" ist,
   liegt beim BGH (I ZR 281/25, Verhandlung 2026-09-03, Ausgang offen). Bis zur Klärung:
   robots.txt UND gängige TDM-Signale (`TDM-Reservation`-Header, `tdmrep.json`,
   `noai`/`noimageai`-Meta) respektieren, und bei Zweifel ausschliessen (fail-closed).
   Personennamen von Team-/Impressumsseiten gehören gar nicht in die Pipeline (§1.7 Nr. 3).
3. **Halluzination frisst das Vertrauen.** Erfundene Preisstufen und falsch zugeordnete USPs
   sind der dokumentierte Standardfehler; bei einem Beratungsprodukt, das der Kunde einem
   NAMENTLICH genannten Nachbarn zuschreibt, ist ein einziger Fehler teurer als das Modul.
   Deshalb `evidence ⊂ rawText` deterministisch (§2.2), nicht als Prompt-Wunsch.

Einschränkung der Recherche: Praktikerstimmen stammen aus Anbieter- und Agenturblogs
(Bias), Reddit/HN liessen sich nicht belegen; Tracksuit-Preise widersprechen sich zwischen
Quellen.

### 1.9 Geschäftsmodell-Einordnung

„Frei bauen, bezahlt anwenden" (Davids Entscheidung 2026-08-27): Die Foundation ist frei
und Trichter, bezahlt wird die ANWENDUNG. Der Marktvergleich ist Anwendung — er nimmt die
fertige Foundation und hält sie gegen die Welt. Er ist deshalb **bezahlt**, und die
Schranke ist von Tag eins sichtbar (die Seite „Markt" existiert, zeigt was sie tut, und
nennt den Preis-Anker — heute „im Erstgespräch", mit branding.supply ein Preis). Kosten je
Lauf stehen in §2.8; sie sind klein genug für eine Flatrate im Pro-Tier und gross genug,
dass ein freier Lauf je Tag nicht sinnvoll ist (§6, Frage 3).

### 1.10 Risiken und Hypothesen (was die Beta klären muss)

| Risiko | Warum es real ist | Gegenmittel im Konzept |
| --- | --- | --- |
| **Dünne Profile** — Websites sagen wenig oder alles gleich | Ein Handwerker-Auftritt hat keinen Purpose-Satz | Leere Felder bleiben leer und werden als „nicht öffentlich formuliert" gezeigt — das IST eine Aussage über die Kategorie |
| **Halluzination** — das Modell erfindet ein Versprechen | Sprachmodelle vervollständigen | Beleg-Pflicht je Feld (Zitat + URL), Zitat muss WÖRTLICH im Rohtext vorkommen (deterministische Prüfung), sonst Feld verworfen |
| **Scheinpräzision** — „Whitespace" wird als Marktlücke gelesen | Ein freier Claim kann frei sein, weil ihn niemand glaubt | Sprache im Produkt: „niemand im Feld SAGT das", nie „hier ist eine Lücke"; George rahmt es als Frage |
| **Rechtliche Angriffsfläche** | Zitate aus Wettbewerber-Websites, TDM-Opt-out | §1.7 als Verträge, Rohtext-Retention 24 h, Vorbehalt respektieren, Zitatschranke |
| **Kosten** | N Abrufe + N Extraktionen + 1 Vergleich je Lauf | Eimer je Brand, Instanz-Deckel, Ergebnis-Cache je URL-Stand (§2.8) |
| **SPA-Websites** | Text erst nach JS | Phase 1 liest nur SSR-HTML + Meta/JSON-LD; ehrliche Meldung „diese Seite gibt ohne Browser nichts preis"; Headless-Browser ist Phase 2 |

**Hypothese H1 (Beta):** ≥ 60 % der Läufe erzeugen mindestens einen Befund, den der
Kunde ANNIMMT. **H2:** die Frage „hat euch das etwas gezeigt, das ihr nicht wusstet?"
(eine freiwillige Frage wie `result.rating`) ≥ 4/5.

---

## 2. Konzept

### 2.1 Produktform

Ein **eigener Produkt-Layer `market`** (`packages/market`, Tables `market_*`, productKey
`market`), nach der Silo-Regel (neues Produkt ⇒ eigener Layer, KEIN eigenes Deployment).
Er hängt am brand-Layer über EINEN expliziten Vertrag: er importiert die Slot-Registry und
den Befund-Vertrag aus `packages/brand/shared` (nur `import type` + die puren
Registry-Funktionen) und schreibt Befunde über den bestehenden Befund-Speicher des
brand-Layers (Art `market`, neu). Kein impliziter Auto-Import, keine gemeinsamen Tabellen
(CONCEPT A14: Cross-Layer-Abhängigkeiten als explizite Verträge). Alternative und
Begründung: §6, Frage 1.

Produkt-Manifest: `tier` = bezahlt, `requires: ['brand']`. Site-Manifest branding: `market`
ergänzen. Gate `pukalani.market.enabled` (Build) + `app_config.products.market.enabled`
(Runtime-Kill), wie beim brand-Layer.

### 2.2 Der Vergleichs-Vertrag: das Marktprofil

Ein **Marktprofil** ist die Untermenge der Foundation-Felder, die man von AUSSEN über eine
Marke sagen kann — jedes mit Beleg. Die Ids sind die Slot-Ids der Registry, damit der
Vergleich Feld gegen Feld läuft:

| Marktprofil-Feld | Eigenes Feld (Registry) | Woraus extrahiert | Form |
| --- | --- | --- | --- |
| Kategorie-Sprache | `a.category`, `b.positioningCategory` | Startseite, Meta-description, JSON-LD | Kurztext ≤ 5 Wörter |
| Was sie versprechen (Pitch) | `a.pitch` | Hero/Startseite | 1–2 Sätze |
| Für wen | `a.audienceSketch` | Startseite, Leistungen | Kurztext |
| Warum zuerst wählen (Behauptung) | `b.positioningFirstChoice` | Startseite, Über uns | 1 Satz |
| Purpose-Satz (falls formuliert) | `b.purpose` | Über uns | 1 Satz oder LEER |
| Behauptete Werte (Wörter) | `c.final` | Über uns, Leistungen | Liste ≤ 5 Wörter |
| Tonwörter | `d.toneWords` | Gesamttext (Stilanalyse) | Liste ≤ 5 |
| Tagline | `ep.taglines` | Hero, `<title>`, Meta | 1 Zeile oder LEER |
| Kernbotschaften | `ep.keyMessages` | Startseite (H1–H3) | Liste ≤ 3 |
| Markenzeichen (verbal) | `ep.distinctiveAsset` | wiederkehrende Formel/Slogan | 1 Zeile oder LEER |

Nicht im Marktprofil (weil von aussen nicht ehrlich ableitbar): Gründungsimpuls,
Beschwerden, Konfliktregel, Vision-Zehnjahres-Bild, Manifest.

Jedes Feld trägt: `value`, `evidence` (wörtliches Zitat ≤ 200 Zeichen), `sourceUrl`,
`confidence` (`stated` = wörtlich gesagt · `implied` = aus mehreren Stellen abgeleitet),
und die deterministische Prüfung `evidence ⊂ rawText` — ohne Treffer wird das Feld
VERWORFEN (das ist der Halluzinations-Riegel, kein Prompt-Wunsch).

Der Vertrag lebt pur in `packages/market/shared/marketProfile.ts` (Typen, `MARKET_FIELDS`
mit der Abbildung auf Slot-Ids, Zod-Schema) und wird gegen die brand-Registry getestet
(jede Abbildung zeigt auf einen existierenden, nicht deaktivierten Slot).

### 2.3 Der Ablauf eines Vergleichs

1. **Kandidaten.** Die Seite „Markt" zeigt die Namen aus `a.competitors` (falls bestätigt)
   als Vorschlag; der Kunde trägt je Name die **Adresse** ein (Pflicht, nie geraten),
   maximal fünf. Weitere Namen dürfen ergänzt werden.
2. **Abruf.** Je Wettbewerber: `robots.txt` + TDM-Vorbehalt prüfen ⇒ ggf. „ausgeschlossen,
   weil die Website die Auswertung untersagt". Sonst Startseite über den SSRF-festen
   Abruf des brand-Layers (Vertrag wiederverwenden, nicht kopieren: `brandSiteFetch` wird
   zu einer geteilten Funktion in `packages/brand/server/utils` mit explizitem Export —
   oder zieht als `core`-Baustein um, §6 Frage 1 entscheidet), dann bis zu vier
   Same-Origin-Unterseiten nach Pfad-Heuristik (`/about`, `/ueber-uns`, `/leistungen`,
   `/services`, `/angebot`, `/preise`, `/pricing`; NIE `/team`, `/impressum`, `/kontakt`,
   `/datenschutz`). PII-Filter über den Text. Rohtext mit `expiresAt` = jetzt + 24 h.
3. **Extraktion.** Je Wettbewerber EIN Modell-Aufruf (günstiges ZDR-Modell, JSON,
   `aiCompleteJson`) ⇒ Marktprofil nach §2.2, Beleg-Prüfung, Speicherung.
4. **Vergleich.** EIN Aufruf (George-Modell) über: eigenes Foundation-Profil (dieselben
   Felder, aus den BESTÄTIGTEN Werten) + N Marktprofile ⇒ **Bericht** mit vier Teilen:
   - **Gegenüberstellung** je Feld (Tabelle Wir × W1..W5, mit Zitaten),
   - **Konventionen** (Aussagen, die ≥ 60 % des Feldes machen — „Eintrittskarte"),
   - **Überschneidungen** (unsere Aussagen, die ≥ 1 Wettbewerber ebenso macht — mit
     Ähnlichkeitsgrad),
   - **Freie Stellen** (Aussagen, die im Feld niemand macht — als Frage formuliert).
   Dazu **Befunde** (`kind: 'market'`, ein eigenes Feld + Quelle) mit `why` und
   `suggestion`, über den Befund-Speicher des brand-Layers — sie erscheinen als Chips an
   den eigenen Feldern (Abnahme, Log, Session) wie Konflikte, sperren aber NICHTS.
5. **Idempotenz.** Bericht-Schlüssel = Hash über (Foundation-Revisionen der beteiligten
   Felder, URL-Liste, Abrufstände). Gleicher Stand ⇒ gespeicherter Bericht, kein Aufruf.

### 2.4 Wann im Weg

Freischaltung, wenn Kapitel **B (Purpose, Vision & Mission inkl. Positionierung)
abgenommen** ist — vorher gibt es keine eigene Behauptung, die man vergleichen könnte.
Voller Wert nach abgenommener Foundation (Werte, Tonwörter, Tagline). Der Bericht nennt,
welche Felder noch fehlen („Tonwörter stehen bei euch noch nicht — der Vergleich dort
kommt nach Kapitel D"). Eine Korrektur eines eigenen Feldes macht den Bericht mechanisch
`stale` (Schlüssel bewegt), wie in BW2. Alternative: §6, Frage 2.

### 2.5 Oberfläche

- **Leiste:** Eintrag „Markt" auf Ebene 1 unter „Euer Branding" (Buch-Glyphe für das
  Dokument, Kompass-Glyphe für den Markt), gesperrt bis §2.4, mit Zähler „N Befunde".
- **Seite „Markt"** im Werkstatt-Layout (kein George, kein Prompt, rechte Spalte = Stand):
  (1) Kopf mit Erklärsatz und der EHRLICHEN Grenze („Wir zeigen, was Marken sagen — nicht,
  wie erfolgreich sie damit sind"); (2) Wettbewerber-Liste: Name, Adresse, Status
  (ausstehend / gelesen N Seiten / ausgeschlossen mit Grund), zuletzt gelesen; (3) Knopf
  **„Markt vergleichen"** (Preis-Anker/Schranke davor, §1.9); (4) Ergebnis: die vier Teile
  aus §2.3 als Abschnitte — die Gegenüberstellung als UTable (Datenliste — Davids
  UTable-Regel), Konventionen/Überschneidungen/freie Stellen als Listen mit Zitat +
  Quell-Link, Befunde als Chips; (5) je Wettbewerber eine aufklappbare Profil-Karte
  (alle Felder mit Zitat und Link).
- **George** bekommt den Bericht als Block („Der Markt sagt …") in der nächsten Session
  der betroffenen Felder — einmal, wie bei Konflikten.
- Keine Zwei-Achsen-Karte in Phase 1 (die Achsen wählt sonst ein Modell — das ist
  Scheinpräzision, §6 Frage 5).

### 2.6 Datenmodell (server-only, Permissions `[]`, wie alle brand-Tabellen)

| Tabelle | Zweck | Spalten (Kern) |
| --- | --- | --- |
| `market_competitors` | die Kandidaten je Branding | profileId, name, url (normalisiert), status (pending/fetched/excluded/failed), excludedReason, pagesFetched (JSON URL-Liste), fetchedAt, rawText (MEDIUMTEXT, off-row), rawExpiresAt |
| `market_profiles` | das Marktprofil je Wettbewerber | competitorId, profileId, fields (JSON nach §2.2), extractedAt, model, promptVersion, inputHash (Rohtext-Stand) |
| `market_reports` | der Vergleich je Stand | profileId, revisionKey, ownProfile (JSON), matrix (JSON), conventions/overlaps/whitespace (JSON), findingIds (JSON), createdAt, model, promptVersion |

Indizes: `(profileId)`, `(profileId, status)`, `(profileId, revisionKey)`. Retention:
`rawText` wird per Sweep (Intervall-Plugin, wie Digest) nach `rawExpiresAt` geleert;
Profile und Berichte leben mit dem Branding und fallen mit ihm (Profil-Kaskade +
GDPR-Contributor des market-Layers). Schema-Parität: Soll-Block `market` mit drei Tabellen.

### 2.7 Verträge, die aus BW2 wiederverwendet werden (nichts zweimal bauen)

- SSRF-Vertrag + Abruf (`brandSiteAnalysis.ts`, `brandSiteFetch.ts`) — geteilt, nicht
  kopiert.
- Befund-Speicher + Chips (`brand_findings`, `BwFindingChip`) — neue Art `market`,
  ein Slot, `suggestion` Pflicht; sperrt die Abnahme NICHT (nur `conflict` tut das).
- Prüf-Aufruf-Muster (`aiCompleteJson`, ZDR-Routing, Zod, fail-soft, Stub im Dev per
  `MARKET_DEV_STUB=1`).
- Eimer-Vertrag (`brandAiLimits`-Muster) — neuer Eimer `market` (§2.8).
- Registry-Funktionen (`slotById`, Labels) für die Anzeige der eigenen Felder.

### 2.8 KI, Kosten, Drosseln

Je Lauf mit fünf Wettbewerbern: bis 25 Abrufe (kein Modell), 5 Extraktionen (günstiges
ZDR-Modell, je ≈ 6–8k Eingabe-Token), 1 Vergleich (George-Modell, ≈ 10–15k Eingabe-Token).
Grob 0,10–0,30 € je Lauf zu heutigen Preisen — die genaue Zahl liefert der Prototyp-Lauf.

Eimer `market`: **3 Läufe je Branding und Tag**, Instanz-Deckel zählt mit; ein erneuter
Lauf bei unverändertem Stand kostet nichts (Idempotenz §2.3). Abrufe: höchstens 5 Seiten
je Wettbewerber, 2 MB je Seite, 20 000 Zeichen Text je Seite, Gesamt-Deckel je Lauf
60 000 Zeichen an die Modelle. Ohne KI-Schlüssel oder mit `brandAiEnabled=false`: die Seite
zeigt Kandidaten und Abrufstand, der Vergleich meldet „KI ist aus" (Kill-Switch-Regel).

### 2.9 Sicherheits- und Rechts-Verträge (aus §1.7, prüfbar)

1. `robots.txt` wird geholt und respektiert (User-Agent `PukalaniMarketBot/1.0 (+URL zur
   Erklärseite)`); TDM-Vorbehalte in JEDER gängigen maschinenlesbaren Form
   (`TDM-Reservation: 1`-Header, `/.well-known/tdmrep.json`, `<meta name="robots"
   content="noai">`/`noimageai`) ⇒ `excluded`; bis zur BGH-Klärung (I ZR 281/25) gilt bei
   Zweifel fail-closed.
2. Pfad-Sperrliste (team, impressum, kontakt, datenschutz, agb, login, account, cart) —
   pur getestet.
3. PII-Filter vor dem Modell (E-Mail, Telefon, Namensmuster nahe „Geschäftsführer/CEO/
   Gründer") — pur getestet, mit Gegenprobe.
4. Beleg-Pflicht + Zitatschranke ≤ 200 Zeichen + `evidence ⊂ rawText` (deterministisch).
5. Herabsetzungs-Filter auf Bericht und Befunden (Wortliste + Prompt-Regel „describe, never
   judge the third party"); Befunde adressieren immer ein eigenes Feld. **Kein
   veröffentlichungsfähiger Vergleichs-Claim** (§ 6 UWG, Recherche §1.8): weder der Bericht
   noch George entwerfen einen Satz, der einen Wettbewerber nennt oder erkennbar macht —
   ein Markt-Befund sagt „euer Satz klingt wie zwei andere im Feld", nie „sagt: anders als
   X". Prompt-Regel + Namens-/Domain-Filter über jeden Vorschlag, mit Gegenprobe im Test.
6. Rohtext-Retention 24 h (Sweep), Logs ohne Inhalt (bestehende Log-Regel).
7. Sensitivity `internal`: nicht im Share-Snapshot, nicht im Export, nicht im Dokument.
8. Rate-Limit je IP auf den Abruf-Endpunkt; ein Branding kann höchstens 5 Wettbewerber
   führen; URL-Änderung setzt Status auf `pending`.

### 2.10 Messung

Server-Ereignisse (bestehendes `brand_events`-Muster oder eigenes `market_events`):
`market.run`, `market.competitor_excluded` (Grund), `market.finding_accepted/dismissed`,
`market.rating` (eine freiwillige Frage nach dem ersten Bericht). Plausible nur für den
Klick auf die Schranke. Beta-Kriterien §1.10.

### 2.11 Prototyp (Phase 3, nach Freigabe) — ein Screen je Interaktionstyp

In `packages/market/.playground`, echte Nuxt-UI-Komponenten, echter Inhalt (die
Kaffeerösterei aus dem Test-Branding gegen drei erfundene Wettbewerber-Websites, die im
Playground als statische Seiten liegen — so ist der Prototyp ohne Netz vorführbar):

1. Seite „Markt" mit Kandidaten-Liste, Adress-Eingabe und Schranke.
2. Lauf-Fortschritt (Abruf je Wettbewerber, ausgeschlossen mit Grund).
3. Ergebnis: Gegenüberstellung (UTable), die drei Listen, Profil-Karte aufgeklappt.
4. Ein Markt-Befund als Chip in der Werkstatt an `b.positioningFirstChoice`.

Davids Korrekturrunden am lebenden Prototyp, dann Freigabe, dann Pakete (§5).

---

## 3. Nicht-Ziele (Phase 1)

Ranking oder Score von Marken · Marktanteil/Bekanntheit/Traffic · automatische
Wettbewerber-Suche · Headless-Browser für SPAs · Bewertungsplattformen und Social ·
Zwei-Achsen-Positionierungskarte · Export/Teilen des Berichts · Beobachtung über die Zeit
(„Monitoring") · andere Sprachen als de/en beim Extrahieren (der Rohtext darf jede Sprache
haben, das Marktprofil steht in der Inhaltssprache der Marke).

## 4. Abhängigkeiten und Fallen

- **A1-AVV / ZDR:** fremde Website-Texte gehen an den Modell-Anbieter — dieselbe
  Datenschutz-Kette wie beim Wizard (OpenRouter, ZDR, data_collection deny).
- **Der Abruf-Vertrag gehört geteilt**, sonst gibt es zwei SSRF-Schutze, die
  auseinanderlaufen (§6, Frage 1 entscheidet, wo er wohnt).
- **Bilanz-Gate**: neue Routen/Tabellen ⇒ `check:bilanz`, Schema-Parität, GDPR-Contributor,
  Manifest-Check (`check:manifests`) — in JEDEN Paket-Auftrag.
- **Beispiel-Websites im Playground** müssen erfunden sein (keine realen Marken), wie die
  Session-Beispiele.

## 5. Pakete (Skizze — verbindlich erst nach Prototyp-Freigabe)

| # | Paket | Inhalt | Gate |
| --- | --- | --- | --- |
| M0 | Prototyp | §2.11 im Playground | **ABGENOMMEN** (David, 2026-09-05; M0b mit der §7-Erweiterung inbegriffen) |
| M1 | Layer + Vertrag | packages/market, Manifeste, `marketProfile.ts`, Schema-Anhang (3 Tabellen), Abruf-Vertrag geteilt | **GEBAUT** (2026-09-05) — Schema-Anhang B unten, David liest gegen |
| M2 | Abruf + Extraktion | robots/TDM, Pfad-Sperrliste, PII-Filter, Rohtext-Retention, Extraktions-Prompt `market-x-1`, Beleg-Riegel, Stub, KI-Aussensicht `market-ai-1` | **GEBAUT** (2026-09-05) — Vertrag Anhang C; `verify-market-fetch.mjs` 33/33 |
| M3 | Vergleich + Befunde | Bericht-Prompt `market-r-1`, Idempotenz + `stale`, Befund-Art `market`, § 6 UWG-Riegel, Bibliotheks-Mechanik, Brand-Check-Anbindung, George-Block | **GEBAUT** (2026-09-05) — Vertrag Anhang D; `verify-market-report.mjs` 43/43 |
| M4 | Oberfläche | Seite „Markt“, Leiste, Schranke, Chips, Quellen-Wähler, Opt-in, Relaunch-Ansicht | **GEBAUT** (2026-09-05) — Vertrag Anhang E; `verify-market-ui.mjs` 46/46; Klick-Beweis + Seiten-Abnahme durch David offen |
| M5 | Betrieb | ~~Eimer~~ (vorgezogen, s. u.), Rohtext-Sweep, Erklärseite `/market-bot`, Vertraulichkeits-Nachweis, Bewertung, Runbook, Doku | **GEBAUT** (2026-09-05) — Vertrag Anhang F; `verify-market-retention.mjs`; Prod-Migration + Gate-Flip offen (Davids Ja) |
| M6 | Bibliothek | Rechnen + Handprüfung der ersten Paare, Rechts-Check der Namensnennung (§7.6) | **WERKZEUG GEBAUT** (2026-09-05) — Vertrag Anhang G; Trockenlauf 9/10 auswertbar, `--compute --stub` 2 Entwürfe + 2 begründete Ausschlüsse, Entwurf fällt durch das Schema (206 Unit-Tests). **M6b (2026-09-06): bezahlter Lauf gelaufen, `the-barn` + `apple` von David handgeprüft und ÜBERNOMMEN, erfundene Einträge aus dem Produkt entfernt (Fassung `lib-3`, 213 Unit-Tests). Rechts-Check weiter OFFEN** |

**Abweichung von dieser Skizze (M2, 2026-09-05):** Der **Eimer** (§2.8, „3 Läufe je
Branding und Tag" plus Instanz-Deckel) war für M5 vorgesehen und ist mit M2 VORGEZOGEN —
`packages/market/shared/marketLimits.ts` + `server/utils/marketQuota.ts`, dazu zwei
IP-Zeilen in `05.rate-limit.ts` des Core. Grund: ab M2 gibt es echte Modell-Aufrufe (je
Wettbewerber eine Extraktion plus zwei Aussensicht-Antworten, also bis zu fünfzehn je
Lauf). Ein Kostendeckel, der erst NACH der ersten Rechnung eingebaut wird, ist keiner.
Bei M5 bleiben Sweep (Rohtext-Frist), Messung und die Wächter.

## 6. Entscheidungen (David, 2026-09-05 — alle nach Empfehlung)

0. **Strategie-Kern freigegeben:** Behauptungs-Raum der Kategorie mit Zitat und Quelle;
   KEIN Ranking, kein Score je Wettbewerber, keine Aussage über Markterfolg (§1.4).
1. **Ort:** eigener Layer `market` mit explizitem Vertrag zu `brand` (§2.1).
2. **Freischaltung:** nach abgenommenem Kapitel B (§2.4).
3. **Schranke:** bezahlt ab Tag eins, Beta-Konten frei geschaltet (§1.9).
4. **Adressen:** der Kunde trägt sie ein; Namen aus `a.competitors` nur als Vorschlag (§2.3).
5. **Ausgabe Phase 1:** Gegenüberstellung als Tabelle + drei Listen + Befunde; keine
   Achsen-Karte (§2.5).
6. **Datenquellen Phase 1:** nur Websites (§1.6).
7. **Abruf-Vertrag:** bleibt in `brand`, wird explizit exportiert, `market` importiert (§2.7).

Verworfen und warum: Score je Wettbewerber (misst nichts Belegbares, UWG-Grauzone) ·
Websuche nach Adressen (Kosten + Halluzinationsquelle) · Zwei-Achsen-Karte (Achsen vom
Modell = Scheinpräzision) · Bewertungs-/Social-Quellen (Plattform-AGB, PII) · Umzug des
Abrufs nach core (sauberer, aber ein Schritt mehr als nötig — bleibt Option).

## 7. Erweiterung aus der Prototyp-Runde 1 (David, 2026-09-05 abends)

Davids Fragen am Prototyp: „nicht nur die Website — auch ein fertiger Brand-Score oder eine
im Wizard entstandene Marke sollen Kandidat sein können"; „lesen wir auch SEO-/GEO-relevante
Dokumente, decken wir moderne KI-Suche ab, Startseite oder alle Seiten, wie wird der
Brand-Score über individuelle Websites vergleichbar"; „adidas vs. nike, anthropic vs. openai,
meta vs. apple als Beispiele auf der Startseite"; „sind Brand-Check, Brand-Score und
Marktvergleich verschiedene Produkte?"

### 7.1 Ein Motor, drei Ansichten (Entscheidung David, nach Empfehlung)

Die gemeinsame Währung ist das **Marktprofil** (§2.2): zehn Felder, je mit Beleg, Herkunft
und Häufigkeit. Es entsteht aus JEDER Quelle in derselben Form. Darauf drei Ansichten mit
gleichem Input und verschiedenem Output — KEINE drei Produkte:

| Ansicht | Input | Output |
| --- | --- | --- |
| **Brand-Check** | EIN Marktprofil (Website, eigene Marke oder Bibliothek) | Profil mit Belegen + **Brand-Score** + „was fehlt öffentlich" |
| **Brand-Score** | ein Marktprofil | eine Zahl 0–100 (§7.3) mit ihren Bausteinen |
| **Marktvergleich** | N Marktprofile | Gegenüberstellung, Konventionen, Überschneidungen, freie Stellen, Befunde (§2.3) |

**Korrektur nach Blick auf `main` (2026-09-05, abends, David bestätigt):** Der **Brand-Check
existiert bereits** — gebaut von einer parallelen Sitzung (docs/archiv/BRAND-CHECK.md,
docs/archiv/BRAND-CHECK-SEITE.md, Migrationen brand-016/017, Tabelle `brand_checks`,
`/brand-check` mit Start/Ranking/Quartett-Vergleich/„Meine Brands"/Dokument-Check).
Er misst mit 40 Kriterien in 8 Kategorien, **wie gut ein Auftritt gemacht ist** (Reifegrad,
Score 0–100, öffentliches Ranking mit Opt-in des Prüfers). Der Marktvergleich misst etwas
anderes: **was alle im Feld SAGEN und wo die eigene Marke steht.** Deshalb ist „ein Motor,
drei Ansichten" so zu lesen: der Brand-Check IST die Ansicht „Check + Score" und wird
WIEDERVERWENDET, nicht nachgebaut; der Marktvergleich ist die Ansicht „Feld", und gemeinsam
haben beide den Abruf (§7.4) und die Opt-in-Semantik (§7.2 Nr. 4). Der Marktvergleich lebt
in der **Werkstatt als Ebene-1-Seite „Markt"** (David, 2026-09-05), nicht als Reiter unter
`/brand-check`; die Ergebnisseiten verlinken sich gegenseitig („Diese Marke im Brand-Check"
/ „Dieses Feld im Marktvergleich").

### 7.2 Vier Quellen für Kandidaten (Entscheidung David)

1. **Website-Adresse** — wie §2.3, Abruf erweitert (§7.4).
2. **Eigene Marke aus dem Konto** — Abbildung der BESTÄTIGTEN Foundation-Felder auf das
   Marktprofil, kein Abruf. Der stärkste Relaunch-Fall: alte Website gegen neue Foundation;
   ebenso Sub-Marken gegeneinander.
3. **Kuratierte Bibliothek bekannter Marken** — von uns mit demselben Motor gerechnet und
   VON HAND GEPRÜFT, versioniert im Repo (`packages/market/library/*.json`), Namen ja, Logos
   nein, nur wörtliche Zitate, keine Herabsetzung. Erste Paare: adidas/Nike,
   Anthropic/OpenAI, Meta/Apple, dazu drei bis fünf kleinere bekannte Marken je Zielbranche
   (Studio, Coach, Café). Zweck: Beispiele auf der Brand-Check-Startseite UND Kalibrierung
   des Scores.
4. **Fremde Wizard-Marken anderer Kunden** — Davids Entscheidung GEGEN die Empfehlung
   (Phase 2). **Leitplanke, die nicht verhandelbar ist:** eine Marke eines anderen Kontos
   erscheint NUR, wenn ihre Eigentümerin sie ausdrücklich für den Marktvergleich freigegeben
   hat (Opt-in am Profil, jederzeit widerrufbar — DIESELBE Zustimmung wie das Brand-Check-Ranking
   (`rankingOptIn` / Dokument-Check „Opt-in des Besitzers", BRAND-CHECK-SEITE.md §5b/§8),
   keine zweite Schalter-Semantik; ob das Feld an `brand_checks` oder am Profil hängt,
   klärt M1 mit der anderen Sitzung). Sichtbar wird dann NUR das Marktprofil (die
   zehn Außen-Felder), nie Foundation-Interna, nie Notizen/Befunde/Wettbewerber. Ohne
   Opt-in gibt es keine Kandidatin — auch nicht per Name-Suche. Das ist Datenschutz und
   Vertrauen in einem: der Wizard ist ein privater Raum.

### 7.3 Der Brand-Score — der BESTEHENDE, kein zweiter (Entscheidung David, 2026-09-05 abends)

Der am Nachmittag skizzierte „Klarheits-Score" ist GESTRICHEN: er wäre eine zweite Zahl
neben dem Brand-Score des Brand-Checks (`brand_checks.score`, `scoreVersion`, Band). Der
Marktvergleich zeigt je Kandidat den **Brand-Check-Score** (Score-Ring + Band + Link auf
`/brand-check/<id>`), sofern für die Adresse ein Check vorliegt oder der Lauf einen anstösst
(derselbe 7-Tage-Cache, dieselben Deckel). Sichtbarkeit folgt dem Brand-Check (Ergebnis
`noindex`, teilbar; Ranking nur mit Opt-in) — eine eigene Vertraulichkeits-Regel für den
Score braucht der Marktvergleich damit nicht mehr; vertraulich bleibt das, was der
Marktvergleich SELBST erzeugt (Marktprofile fremder Marken, Bericht, Befunde: `internal`).
Die drei Bausteine des gestrichenen Scores (Vollständigkeit der öffentlichen Aussage,
Konsistenz über Seiten, Unterscheidbarkeit von den Konventionen) gehen als
KRITERIEN-VORSCHLÄGE an die Kategorie E „Positionierung & Klarheit" des Brand-Check-Katalogs
(Pflege der anderen Sitzung / Davids Gegenlesen des Katalogs) — nicht als eigene Zahl.

### 7.4 Erweiterter Abruf (Entscheidung David)

Statt Startseite + Pfad-Raterei: `robots.txt` (Erlaubnis) · **`sitemap.xml`** (Seitenauswahl:
5–8 Schlüsselseiten nach Relevanz — Start, Über uns, Leistungen/Produkte, Preise, Manifest/
Werte, FAQ) · **`llms.txt`** (die Selbstbeschreibung für KI-Suchen — wo vorhanden die
dichteste Quelle) · **schema.org JSON-LD** (Organization/description/sameAs) · **Meta/OG-Tags**
· `<h1>–<h3>`. Aggregation NICHT als Mittelwert, sondern als **Aussage mit Häufigkeit**: eine
Aussage, die auf mehreren Seiten wiederkehrt, ist zentral (Gewicht), eine einmalige ist
Rand. Vergleichbar wird das durch das feste Schema und die Häufigkeits-Angabe, nicht durch
die Websites. Deckel: 8 Seiten, 2 MB je Seite, 80 000 Zeichen je Marke an das Modell.
**Koordination:** der Brand-Check liest heute EINE Seite (`fetchBrandSite`, 20 000 Zeichen,
Meta/OG/JSON-LD-Signale, GEO-Readiness-Kriterium D4). Die Mehrseiten-/Sitemap-/llms.txt-
Erweiterung ist eine Verbesserung des GETEILTEN Abrufs im brand-Layer und nützt beiden —
sie wird EINMAL gebaut (M2), mit der Brand-Check-Sitzung abgestimmt, und der Check darf sie
danach nutzen (eigene Entscheidung dort).

### 7.5 KI-Suche als Quelle SCHON in Phase 1 (Entscheidung David, GEGEN die Empfehlung)

Zusätzlich zur Website wird gefragt, **was KI-Antworten über eine Marke sagen** („AI-
Außensicht"): dieselbe Frage an zwei bis drei Modelle über die bestehende ZDR-Naht („What
does <Marke> (<Domain>) stand for, whom does it serve, how does it describe itself?"),
Antworten in dieselben zehn Felder extrahiert. **Leitplanken, weil das Halluzinationsrisiko
hier am höchsten ist:** (a) eigene Herkunft `source: 'ai-search'`, in der Oberfläche IMMER
als „ungeprüfte Außensicht — so beschreiben KI-Antworten die Marke" beschriftet, nie mit
Website-Belegen vermischt; (b) nur Aussagen, die in ≥ 2 Modellantworten übereinstimmen,
werden übernommen (Konsens-Filter); (c) kein Einfluss auf den Brand-Score (der bleibt
belegbasiert); (d) fließt in den Vergleich nur als eigene Spalte/Sicht („Website sagt" vs.
„KI-Antworten sagen") — der Unterschied zwischen beiden IST der Befund („eure Website sagt
X, KI-Antworten beschreiben euch als Y"); (e) eigener Eimer-Anteil, weil es je Marke 2–3
Aufrufe kostet. Ein eigenes Experiment im Prototyp zeigt, ob die Ausgabe trägt; fällt es
durch, wird die Quelle in Phase 2 verschoben — mit Davids Wissen.

### 7.6 Folgen für Konzept und Pakete

- §2.2 bekommt je Feld `frequency` (Seiten) und `source` (`website` | `foundation` |
  `library` | `ai-search`); §2.6 bekommt `market_library` (versioniert im Repo, nicht in der
  DB) und `marketVisibility` am Profil (Migration im brand-Layer, additiv).
- §2.5: Seite „Markt" bekommt einen Quellen-Wähler je Kandidat (Adresse · eigene Marke ·
  Bibliothek · freigegebene Marke) und zeigt je Kandidat den Brand-Check-Score mit Link;
  KEINE eigene Brand-Check-Startseite (die gehört `/brand-check`, andere Sitzung) — die
  Bibliotheks-Paare erscheinen im Quellen-Wähler und im Marketing der Werkstatt-Schranke.
- §5 Pakete: M2 wächst um Sitemap/llms.txt/JSON-LD/Häufigkeit (geteilter Abruf, abgestimmt)
  und die AI-Außensicht mit Konsens-Filter; M3 um Brand-Check-Anbindung (Score lesen/anstoßen)
  + Bibliotheks-Import; M4 um Quellen-Wähler und die gegenseitigen Links; neues **M6
  Bibliothek** (Rechnen + Handprüfung der ersten Paare, Rechts-Check der Namensnennung).
- Prototyp **M0b** setzt die Erweiterung sichtbar um (Quellen-Wähler mit vier Quellen,
  Brand-Check-Score je Kandidat mit Link, erweiterter Lauf mit Sitemap/llms.txt/JSON-LD/
  KI-Außensicht, „Website sagt / KI-Antworten sagen"-Spalte, Häufigkeit je Aussage), dann
  Davids Prototyp-Abnahme.

**Gelernt (Prozess):** Der Blick auf `main` VOR dem Schreiben von §7 hätte den Brand-Check
gezeigt — die Regel „erst main prüfen" gilt auch für KONZEPT-Arbeit, nicht nur für Code.
Davids Fragen benutzten die Begriffe eines Produkts, das seit Stunden auf main lag.

---

## Anhang A — Recherche-Bericht (2026-09-05, mit Quellen)

## Marktvergleich als Zusatzprodukt zu branding.supply — Recherche

Stand: 2026-09-05. Alle Aussagen mit Quelle (URL + Abrufdatum 2026-09-05, Datumsangaben der Quelle wo erkennbar).
Unsicheres ist als **[unsicher]** markiert. Preise sind Listenpreise Dritter, nicht verhandelt.

---

### 1. Werkzeug-Landschaft

Die Landschaft zerfällt in **vier** Gruppen, die nur scheinbar dasselbe tun:

**(a) Klassische Competitive Intelligence (CI)** — Crayon, Klue, Kompyte. Sie beobachten
Wettbewerber-Websites, Preisseiten, Changelogs, Stellenanzeigen, Bewertungsportale und Social laufend
und erzeugen Battlecards für den Vertrieb. Preise 16–40 k$/Jahr (Klue), 20–100 k$/Jahr (Crayon),
Kompyte ab ~300 $/Jahr als Budget-Option
([parano.ai/blog/klue-vs-crayon](https://parano.ai/blog/klue-vs-crayon), 2026;
[analook.com Vendor Map](https://www.analook.com/research/competitive-intelligence-market-2026.html), 2026).
Zielgruppe ist B2B-SaaS-Vertrieb, nicht die Markenstrategie einer Zwei-Personen-Marke.

**(b) AI-Visibility / GEO** — die 2026 lauteste Kategorie: Wie beschreiben ChatGPT, Perplexity & Co.
die Marke im Vergleich zu Wettbewerbern? Semrush AI Visibility Toolkit 99 $/Monat pro Domain
(1 Domain, 25 Prompts, kein Trial — [semrush.com/pricing/ai](https://www.semrush.com/pricing/ai/);
Preisangabe zitiert bei [honeyb.ai](https://www.honeyb.ai/blog/semrush-ai-visibility-toolkit), 2026),
Ahrefs Brand Radar 199 $/Monat je Plattform bzw. 699 $/Monat gebündelt
([explodingtopics.com](https://explodingtopics.com/blog/ai-visibility-vs-brand-radar), 2026).
Das misst **Sichtbarkeit im Modell**, nicht Positionierung.

**(c) Brand Tracking per Panel** — Tracksuit, Latana. Echte Bekanntheits-/Erwägungswerte, aber
befragungsbasiert: Tracksuit ab ~25 k$/Jahr für Wachstumsmarken, Latana grob 20–50 k$/Jahr
([koji.so](https://www.koji.so/blog/best-brand-tracking-software-2026), 2026;
[latana.com/pricing](https://www.latana.com/pricing)). Es kursieren daneben Angaben von
99–299 $/Monat für Tracksuit-Einstiegsstufen ([tryanalyze.ai](https://www.tryanalyze.ai/blog/brand-tracking-software), 2026) —
die Spanne 99 $/Monat vs. 25 k$/Jahr ist widersprüchlich, **[unsicher]**.
Für Freelancer und Studios ist diese Gruppe schlicht unerreichbar.

**(d) KI-Markenstrategie-Generatoren** — das direkte Nachbarfeld von branding.supply. IdeaProof
erzeugt aus Geschäftsbeschreibung oder Website Archetyp (12 Jung), Mission/Vision, UVP-Formel,
Voice-Achsen, Namen/Taglines, Personas und eine Positionierungs-Map; die Wettbewerbsanalyse ist ein
**separates, extra bezahltes Werkzeug** (70 Credits) ([ideaproof.io/brand-strategy](https://ideaproof.io/brand-strategy), Abruf 2026-09-05).
Genau dieser Zuschnitt — Foundation frei/inklusive, Vergleich als Zusatz — existiert also bereits.

**Befund:** Es gibt kein sichtbares Produkt, das Wettbewerber-Websites in **dieselbe Feldstruktur**
einer eigenen Brand Foundation übersetzt. CI vergleicht Features und Preise, AI-Visibility vergleicht
Nennungen, Panel-Tracker vergleicht Wahrnehmung, Generatoren erzeugen Felder ohne Außenblick. Die
Lücke ist real — aber sie ist eine Lücke im *Nutzen*, nicht im *Angebot*: alle vier Gruppen könnten
den Schritt gehen, keine tut es prominent.

---

### 2. Wie Agenturen den Wettbewerbsteil klassisch machen

Standard ist die **Perceptual / Positioning Map**: zwei Achsen, Wettbewerber als Punkte, freie
Stellen als Zielräume. Üblich sind Preis × Qualität, dazu kategoriespezifische Achsen
(z. B. traditionell ↔ innovativ, spezialisiert ↔ breit)
([online.hbs.edu/blog/post/perceptual-map](https://online.hbs.edu/blog/post/perceptual-map);
[ramotion.com/blog/brand-positioning-map](https://www.ramotion.com/blog/brand-positioning-map/)).
Wichtige Unterscheidung: die **Positioning Map** zeigt, wie die Marke wahrgenommen werden *will*,
die **Perceptual Map** zeigt, wie Kunden sie tatsächlich sehen — nur letztere braucht Kundendaten
(ebd.). Ernstzunehmende Praktiker warnen ausdrücklich: eine Map verdient ihren Platz im Strategiedeck
nur, wenn sie aus echten Kundendaten gebaut, mit zwei klaren Achsen getestet und mindestens jährlich
erneuert wird ([michaelbell.co.uk/blog/brand-positioning-map](https://www.michaelbell.co.uk/blog/brand-positioning-map/)).
Ein Produkt, das eine Map allein aus Website-Texten baut, liefert per Definition eine Positioning Map,
**keine** Perceptual Map — das muss es sagen.

Der zweite Standardbaustein sind **Category Conventions**: Wettbewerber, Kategorie-Konventionen,
Suchsichtbarkeit und KI-Zusammenfassungen werden kartiert, um überfüllte Claims, ungeschützte Stärken
und „für Regeln gehaltene Muster" zu finden
([watsoncreative.com](https://www.watsoncreative.com/insights/how-brand-audit-reveals-whats-not-working/)).
Das ist inhaltlich exakt der Wert, den ein Feld-für-Feld-Vergleich liefern kann — und es ist der
bessere Rahmen als eine Zwei-Achsen-Grafik. Zum „Brand Key" (Unilever) fanden sich nur
Lehrmaterial-Quellen, keine belastbare aktuelle Praxisbeschreibung **[unsicher]**.

---

### 3. Recht (EU/DE)

**Urheberrecht / TDM.** § 44b UrhG erlaubt die automatisierte Auswertung; ein Nutzungsvorbehalt wirkt
bei online zugänglichen Werken nur **maschinenlesbar**
([dejure.org/gesetze/UrhG/44b](https://dejure.org/gesetze/UrhG/44b.html)). Das OLG Hamburg
(10.12.2025, 5 U 104/24, LAION) verlangt ein Signal, das „automatisiert so interpretiert werden kann,
dass die erfassten Inhalte nicht ausgewertet werden"; robots.txt ist im Praxiskodex genannt, die
rechtliche Wirksamkeit einzelner Formen ist **nicht abschließend geklärt**. Die Revision liegt beim
BGH, Verhandlung war für **03.09.2026** terminiert (I ZR 281/25) — der Ausgang ist zum Berichtsstand
offen **[unsicher]** ([itmr-legal.de](https://itmr-legal.de/blog/ki-training-widersprechen-tdm-vorbehalt), Seitenstand 2026-08-12;
[bundesgerichtshof.de PM 2026](https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2026/2026085.html)).
Praktische Folge: **robots.txt und erkennbare Nutzungsvorbehalte respektieren**, sonst entfällt die
Schranke — und speichern statt zitieren wird zum Risiko.

**Datenschutz.** Der EDSA hat mit den Leitlinien 3/2026 Scraping nicht verboten, aber die
Interessenabwägung (Art. 6 I f) an die **vernünftigen Erwartungen** der Betroffenen gebunden;
technische Signale wie robots.txt, ai.txt oder CAPTCHA wirken sich beim Ignorieren **negativ** aus
([delegedata.de](https://www.delegedata.de/2026/08/edsa-leitlinien-3-2026-scraping-bleibt-moeglich-die-vernuenftigen-erwartungen-werden-zum-zentralen-pruefstein/), 08/2026;
[datenschutzticker.de](https://www.datenschutzticker.de/2026/08/web-scraping-fuer-das-training-von-ki-modellen-neue-edsa-leitlinien-im-ueberblick/), 08/2026).
Namen auf Team- und Impressumsseiten sind personenbezogen — auch wenn ihre Veröffentlichung
gesetzlich verlangt ist ([computerweekly.com/de](https://www.computerweekly.com/de/ratgeber/KI-Scraping-und-die-Grenzen-durch-den-Datenschutz)).
Praktische Folge: Personennamen gar nicht erst in die Analyse ziehen.

**UWG.** § 6 UWG greift, sobald ein Mitbewerber **erkennbar** ist — auch ohne Namensnennung. Zulässig
ist der Vergleich nur, wenn er sich objektiv auf wesentliche, relevante, **nachprüfbare** und typische
Eigenschaften bezieht, keine Verwechslung erzeugt und den Ruf nicht unlauter ausnutzt oder
herabsetzt ([gesetze-im-internet.de/uwg_2004/__6.html](https://www.gesetze-im-internet.de/uwg_2004/__6.html);
[frankfurt-main.ihk.de](https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/wettbewerbsrecht/unlauterer-wettbewerb/vergleichende-werbung)).
Entscheidend für die Produktgestaltung: § 6 UWG betrifft **Werbung**, also das, was der Kunde
anschließend nach außen sagt — die interne Analyse ist davon nicht erfasst. Ein Produkt, das
Formulierungen *zum Veröffentlichen* vorschlägt („anders als X …"), führt den Kunden in dieses Risiko.
**Zeigen darf man** dem Kunden: wörtliche Zitate der Wettbewerber-Website als Beleg, neutrale
Einordnung („beide versprechen Geschwindigkeit"), freie Stellen. **Nicht produzieren** sollte man:
Werturteile über die Qualität des Wettbewerbers, Scores/Noten pro Wettbewerber, fertige
Vergleichs-Claims für die eigene Website.

---

### 4. Realistische Datenquellen

**Geht ohne Budget:** Website-Fließtext (Startseite, Über-uns, Leistungen, Preise), `<title>`,
Meta-Description, Open-Graph, JSON-LD/schema.org, Navigationslabels, Sitemap, Blog-Titel als
Themenprofil, App-Store-Beschreibungen. Das reicht für Versprechen, Tonalität, Zielgruppenansprache,
Preistransparenz, Kategorie-Konventionen — also für alles, was branding.supply als Feld führt.

**Geht nicht ohne Geld oder gar nicht:** Marktanteile, gestützte Bekanntheit, Werbedruck, echte
Wahrnehmung. Referenzpreise: Similarweb ab 125 $/Monat (jährlich) für Web Intelligence, API
faktisch nur im Enterprise-Vertrag ab ~1.000 $/Monat, kein Self-Serve-Tarif enthält API
([vendr.com/marketplace/similarweb](https://www.vendr.com/marketplace/similarweb);
[saaspricepulse.com](https://www.saaspricepulse.com/tools/similarweb)); Semrush Pro ab 139,95 $/Monat,
API erst im Business-Tarif 499,95 $/Monat ([getspike.ai](https://getspike.ai/blog/similarweb-vs-semrush/)).
Google Places: Felder mit Bewertungen kosten 40 $/1.000 Anfragen, das alte 200-$-Guthaben ist durch
SKU-Freikontingente ersetzt ([woosmap.com](https://www.woosmap.com/blog/google-places-api-pricing), 2026).
LinkedIn ist **ausgeschlossen**: die Nutzungsbedingungen verbieten Scraping und automatisiertes
Kopieren ausdrücklich ([linkedin.com/legal/l/service-terms](https://www.linkedin.com/legal/l/service-terms);
[linkedin.com/help/…/a1341387](https://www.linkedin.com/help/linkedin/answer/a1341387)).

---

### 5. Praktiker-Stimmen

Der Tenor ist konsistent und unfreundlich: Ohne interne Daten und ohne laufend aktualisierte
Datenschicht bleibt KI-Output **oberflächlich** und muss von Hand verifiziert werden; Preisstufen,
Paketgrenzen und Kundenlogos klingen überzeugend und sind teils **frei erfunden**
([contify.com](https://www.contify.com/resources/blog/competitive-intelligence-reports-with-ai/), 2026).
Klue selbst — also ein Anbieter, der davon lebt — schreibt, ChatGPT liefere zu Wettbewerbern häufig
„generisch, veraltet oder schlicht falsch" ([klue.com/blog/how-to-do-competitive-analysis-with-ai](https://klue.com/blog/how-to-do-competitive-analysis-with-ai)).
Typische Halluzinationen betreffen Gründungsjahr, Standort, Finanzierung, Partnerschaften; in
überfüllten Kategorien werden Alleinstellungsmerkmale dem falschen Anbieter zugeschrieben
([pagecrawl.io](https://pagecrawl.io/blog/ai-hallucination-brand-monitoring)).
Ein Gegenargument aus der Marktforschung ist bemerkenswert: eben diese „Halluzinationen" sind als
Messgröße für **Markenassoziationen** brauchbar — was das Modell falsch zusammenzieht, verrät, wie
schwach die Marke abgegrenzt ist (eMarketer, zitiert 2026 **[unsicher]**, Sekundärquelle).
Spezifische Reddit-/HN-Threads ließen sich über die Suche nicht belegen — die Praktikersicht stammt
hier aus Anbieter- und Agenturblogs, was ein Bias-Risiko trägt **[unsicher]**.

**Was daraus für den Zuschnitt folgt:** Der Wert entsteht nicht durch „mehr Daten", sondern durch
**Belegpflicht**. Jede Aussage über einen Wettbewerber muss ein wörtliches Zitat von dessen Website
plus URL plus Abrufdatum tragen. Was nicht belegbar ist, wird nicht behauptet. Das schließt
Halluzinationen strukturell aus, erfüllt die UWG-Nachprüfbarkeit und ist gleichzeitig das
Verkaufsargument gegenüber „ChatGPT kann das auch".

---

### Tool-Tabelle

| Tool | Vergleicht was | Ausgabe | Preis | Zielgruppe | Sichtbare Schwäche | Quelle |
|---|---|---|---|---|---|---|
| Crayon | Websites, Preisseiten, Changelogs, Stellen, Social | Battlecards, Alerts, Dashboards | 20–40 k$/J. Mid-Market, 50–100 k$+ Enterprise | B2B-SaaS Product/Sales | Signalflut, Vertriebsfokus, kein Markenmodell | [parano.ai](https://parano.ai/blog/klue-vs-crayon) |
| Klue | dito, plus Deal-Intel | Battlecards, CRM/Slack-Push | 16–30 k$/J., Enterprise 40 k$+ | B2B-SaaS Enablement | wie Crayon; Preis für Kleinmarken unmöglich | [parano.ai](https://parano.ai/blog/klue-vs-crayon) |
| Kompyte | automatisiertes Wettbewerber-Tracking | Reports, Alerts | ab ~300 $/J. | Mid-Market | flacher als Crayon/Klue **[unsicher]** | [analook.com](https://www.analook.com/research/competitive-intelligence-market-2026.html) |
| Semrush AI Visibility Toolkit | Nennung/Sentiment in LLM-Antworten vs. Wettbewerber | Prompt-Tracking, Sentiment, Empfehlungen | 99 $/Mon./Domain, 25 Prompts | SEO/Marketing | misst Sichtbarkeit, nicht Positionierung; kein Trial | [semrush.com/pricing/ai](https://www.semrush.com/pricing/ai/) |
| Ahrefs Brand Radar | Markenerwähnung über 6 KI-Plattformen, 260 M+ echte Prompts | Indizes, Vergleiche | 199 $/Mon./Plattform, 699 $ gebündelt | SEO | kein Sentiment-Report, teuer im Vollausbau | [explodingtopics.com](https://explodingtopics.com/blog/ai-visibility-vs-brand-radar) |
| Similarweb | Traffic, Kanäle, Zielgruppenüberschneidung | Dashboards, Reports | ab 125 $/Mon. (jährl.); API Enterprise ~1.000 $+ | Growth/Analytics | keine Markeninhalte; API self-serve nicht verfügbar | [vendr.com](https://www.vendr.com/marketplace/similarweb) |
| Tracksuit / Latana | echte Wahrnehmung per Panel-Befragung | Awareness/Consideration-Dashboards | ~25 k$/J. bzw. 20–50 k$/J. **[unsicher]** | Wachstumsmarken | Sample zu klein für Nischen, für Solo-Marken unbezahlbar | [koji.so](https://www.koji.so/blog/best-brand-tracking-software-2026) |
| IdeaProof | Website→Strategie; Wettbewerbsanalyse separat | Archetyp, Mission, UVP, Voice-Achsen, Taglines, Positioning-Map | Credit-basiert (Strategie 50, Competitor 70) | Gründer/Startups | Vergleich ist Zusatzmodul, Tiefe unklar **[unsicher]** | [ideaproof.io](https://ideaproof.io/brand-strategy) |
| ChatGPT/Perplexity direkt | alles und nichts | Prosa | ~20 $/Mon. | jeder | halluziniert Preise, Logos, Fakten; veraltet | [klue.com](https://klue.com/blog/how-to-do-competitive-analysis-with-ai) |

---

## Anhang B — Schema (M1, Stand 2026-09-05)

Gebaut in Paket **M1 „Layer + Vertrag"**. Drei Tabellen, alle **server-only**
(`permissions: []`, `rowSecurity: false`), alle **ohne `communityId`** — der
market-Layer ist wie `brand` ein Silo-Layer und läuft ausschliesslich auf der
`branding`-Instanz. Migrationen `packages/market/scripts/migrations/001…003`,
Aufruf `pnpm migrate --app branding --layer market`, idempotent (409 → skip),
Indizes nur über `createIndexSteps`. Lokal gegen die Dev-Appwrite gefahren
(2026-09-05, 40 Schritte; zweiter Lauf 40× „existiert bereits").

Die **Zugehörigkeit** ist überall `profileId` = `brand_profiles.$id`. Sie ist
zugleich die einzige Zugriffsgrenze: alle drei Tabellen sind server-only, es
gibt keine Row-Permission, die im Zweifel abfinge — jede spätere Route lädt
deshalb erst über den brand-Vertrag (`loadOwnedProfile`, 404 statt 403) und
filtert danach.

### `market_competitors` — die Kandidaten (market-001)

| Spalte | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `profileId` | varchar 64 | ja | `brand_profiles.$id` — die Zugriffsgrenze |
| `name` | varchar 200 | ja | Vorschlag aus `a.competitors`, eingetragen vom Menschen |
| `url` | varchar 512 | nein (`''`) | normalisiert; leer bei den drei Nicht-Website-Quellen |
| `status` | varchar 16 | nein (`pending`) | `pending · reading · fetched · excluded · failed` |
| `excludedReason` | varchar 32 | nein (`''`) | `robots · tdm · noText · unreachable` — aufzählbar, weil übersetzt |
| `sourceKind` | varchar 20 | nein (`website`) | die vier Quellen aus §7.2: `website · foundation · library · shared` |
| `sourceRef` | varchar 128 | nein (`''`) | Profil-Id, Bibliotheks-Schlüssel oder freigegebene Profil-Id |
| `brandCheckId` | varchar 64 | nein (`''`) | Adresse des Brand-Check-Ergebnisses (§7.3) — **nicht** der Score |
| `pagesFetched` | varchar 5000 | nein (`''`) | JSON-Liste der gelesenen Adressen (Deckel 8 Seiten, §7.4) |
| `fetchedAt` | datetime | nein | wann zuletzt gelesen |
| `rawText` | **MEDIUMTEXT** | nein | gefilterter Seitentext — Zwischenstand, kein Bestand |
| `rawExpiresAt` | datetime | nein | Ende der 24-h-Frist (§2.9 Nr. 6) |

Indizes: `idx_profile` (profileId) · `idx_profile_status` (profileId, status) ·
`idx_raw_expires` (rawExpiresAt). Der dritte steht **zusätzlich** zu §2.6: der
Aufräum-Lauf aus M5 filtert auf die Frist, und Appwrite verlangt für eine
Filter-Spalte einen Index — eine Aufbewahrungsfrist ohne Lesepfad wäre ein
Versprechen ohne Einlösung.

### `market_profiles` — das Marktprofil je Kandidat (market-002)

| Spalte | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `competitorId` | varchar 64 | ja | `market_competitors.$id` |
| `profileId` | varchar 64 | ja | redundant, damit Kaskade und Besitz-Prüfung nicht über zwei Tabellen springen |
| `fields` | **MEDIUMTEXT** | nein | die zehn Felder aus §2.2 als JSON (Wert, Beleg, Quelle, `source`, `frequency`) |
| `aiOutsideView` | **MEDIUMTEXT** | nein | die KI-Aussensicht (§7.5) — **eigene Spalte**, nie mit `fields` vermischt |
| `extractedAt` | datetime | nein | wann ausgewertet |
| `model` | varchar 120 | nein (`''`) | welches Modell geantwortet hat |
| `promptVersion` | varchar 64 | nein (`''`) | Fassung der Fragen (`market-x-1`) |
| `inputHash` | varchar 64 | nein (`''`) | Stand des Rohtexts — entscheidet über Neu-Rechnen |

Indizes: `idx_profile` (profileId) · `idx_competitor` (competitorId). Beide
KEY, nicht UNIQUE: ein neuer Abrufstand legt ein neues Profil an, die alten
sind der Verlauf.

### `market_reports` — der Vergleich je Stand (market-003)

| Spalte | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `profileId` | varchar 64 | ja | das Branding |
| `revisionKey` | varchar 64 | ja | Hash über Foundation-Revisionen + URL-Liste + Abrufstände (§2.3 Nr. 5) — der Kostendeckel |
| `ownProfile` | **MEDIUMTEXT** | nein | das eingefrorene eigene Profil (wie `brand_shares.snapshot`) |
| `matrix` | **MEDIUMTEXT** | nein | die Gegenüberstellung Wir × W1..W5 mit Zitaten |
| `conventions` | **MEDIUMTEXT** | nein | was alle sagen (Eintrittskarte) |
| `overlaps` | **MEDIUMTEXT** | nein | was wir sagen und mindestens ein anderer auch |
| `whitespace` | **MEDIUMTEXT** | nein | was niemand besetzt — als Frage formuliert |
| `findingIds` | varchar 2000 | nein (`''`) | JSON-Liste von `brand_findings.$id` (Art `market`) |
| `model` / `promptVersion` | varchar 120 / 64 | nein (`''`) | wer und mit welcher Fassung |

Indizes: `idx_profile_revision` (profileId, revisionKey) · `idx_profile`
(profileId). Ein Zeitstempel `createdAt` gibt es nicht als eigene Spalte —
`$createdAt` ist die Wahrheit, eine Kopie daneben wäre eine zweite.

**Warum so viele MEDIUMTEXT:** MariaDB zählt bei utf8mb4 vier Byte je Zeichen
gegen ein Zeilenbudget von ~65 KB; MEDIUMTEXT liegt off-row und zählt nicht
mit (CLAUDE.md, `createMediumtextColumn`). Die drei Listen tragen Zitate mit
Quell-Adresse und wachsen mit der Zahl der Kandidaten — sie gehören nicht in
das Budget.

### Was NICHT in M1 steckt

- **`brand_profiles.marketVisibility`** (§7.6, Opt-in fremder Wizard-Marken)
  ist bewusst **nicht** gebaut. Sie gehört zum Quellen-Wähler und kommt mit
  **M4**; ihre Semantik ist ausdrücklich die des Brand-Check-Ranking-Opt-ins
  (`rankingOptIn`, BRAND-CHECK-SEITE.md §5b/§8) — keine zweite
  Schalter-Semantik, und ob das Feld am Profil oder am Check hängt, wird mit
  der BC1-Sitzung abgestimmt. Eine Spalte, die vor ihrer Oberfläche in der
  Datenbank steht, ist ein Opt-in, das niemand geben kann.
- **`market_library`** bleibt versioniert im Repo (`packages/market/library/`)
  und geht nie in die Datenbank (§7.6) — M6.
- **Keine Route, kein KI-Aufruf, keine Oberfläche.** M1 legt Layer, Verträge
  und Schema; M2/M3/M4 füllen sie.

### Kaskade und Auskunft

Ein gelöschtes Branding nimmt seine market-Zeilen mit. Weil `brand` den
market-Layer nicht kennen darf (CONCEPT A14), läuft das über eine **Registry**:
`registerBrandProfileCascade` (`packages/brand/server/utils/brandProfileCascade.ts`),
in die sich `market` per Nitro-Plugin einträgt. Gerufen wird sie an beiden
Stellen, an denen ein Branding verschwindet — der Löschroute und dem
GDPR-Contributor von `brand` —, jeweils **nach** den eigenen Kindern und
**vor** dem Profil; fail-soft, damit ein Zusatzprodukt das Löschen nie
blockiert. Der eigene GDPR-Contributor des market-Layers
(`registerUserDataContributor`, id `market`) beantwortet die andere Frage
(„dieses Konto geht") über die Brandings des Kontos; `rawText` bleibt aus dem
Auskunftspaket heraus — es ist fremder Seitentext, kein Datum über den
Fragenden.

Schema-Parität: Soll-Block `MARKET_TABLES` in
`scripts/ops/verify-schema-parity.mjs`, aufgenommen in `BRANDING_SOLL`.

---

## Anhang C — Abruf- und Extraktions-Vertrag (M2, Stand 2026-09-05)

Gebaut in Paket **M2 „Abruf + Extraktion"**. Was hier steht, ist der Vertrag —
die Begründungen stehen im Kopf der jeweiligen Datei.

### Wo was liegt

| Sache | Ort |
| --- | --- |
| Geteilter Mehrseiten-Abruf (§7.4) | `packages/brand/server/utils/brandSiteCrawl.ts` + `packages/brand/shared/brandSiteCrawlParse.ts` |
| Generischer SSRF-fester Abruf | `packages/brand/server/utils/brandSiteFetch.ts` (`fetchBrandDocument`, additiv; `fetchBrandSite` ist seither eine Hülle darum) |
| robots.txt | `packages/market/shared/marketRobots.ts` |
| Sperrliste, Seitenwahl, TDM, Deckel, URL-Normalisierung | `packages/market/shared/marketCrawlRules.ts` |
| PII-Filter | `packages/market/shared/marketPii.ts` |
| Beleg-Riegel, Häufigkeit, Konsens | `packages/market/shared/marketExtractRules.ts` |
| Drossel | `packages/market/shared/marketLimits.ts` + `server/utils/marketQuota.ts` |
| Pipeline / Extraktion / Aussensicht | `packages/market/server/utils/marketFetch.ts`, `marketExtract.ts`, `marketAiView.ts` |
| Routen | `packages/market/server/api/market/profiles/[id]/**` |

Der market-Layer greift auf `brand` AUSSCHLIESSLICH über
`packages/market/server/contracts/brandContract.ts` zu (CONCEPT A14). Das rohe
HTML verlässt den brand-Layer NICHT: über die Grenze reisen ausgewertete Seiten
(Titel, Text, interne Adressen, Meta-Anweisungen, JSON-LD), nie Quelltext —
`fetchBrandDocument` steht deshalb bewusst nicht im Vertrag.

### Prompt-Versionen

| Version | Zweck | Datei |
| --- | --- | --- |
| `market-x-1` | Extraktion des Marktprofils aus dem Rohtext, EIN Aufruf je Wettbewerber | `server/prompts/marketExtractPrompt.ts` |
| `market-ai-1` | KI-Aussensicht (§7.5), je Modell EIN Aufruf, nur fünf Felder | `server/prompts/marketAiViewPrompt.ts` |

Beide stehen in `market_profiles.promptVersion`. Wer den Text ändert, hebt die
Nummer. Das Modell antwortet in der INHALTSSPRACHE der Website und übersetzt
nichts — ein übersetztes Zitat fiele durch den Beleg-Riegel.

### Absender und Erlaubnis

`PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)` — ein EIGENER
Absender neben dem des Wizards (`PukalaniBrandWizard/1.0`): wer uns in seiner
`robots.txt` etwas erlauben oder verbieten will, muss die zwei Vorgänge trennen
können. Geprüft wird gegen dasselbe Token, mit dem angefragt wird.

Der robots-Parser kennt `User-agent`, `Allow`, `Disallow`, `*` und `$`; die
eigene Gruppe schlägt `*` vollständig, die längste passende Regel gewinnt, bei
Gleichstand gewinnt `Allow` (RFC 9309 §2.2.2). Keine `robots.txt` ⇒ erlaubt.

### Nutzungsvorbehalt — die vier anerkannten Formen (§2.9 Nr. 1)

1. Kopfzeile `TDM-Reservation: 1`
2. `/.well-known/tdmrep.json` mit `"tdm-reservation": 1` (pfadgenau über `location`)
3. `<meta name="robots" content="noai">` / `noimageai` / `notrain` / `noml`
   (auch in `googlebot`/`bingbot`)
4. `<meta name="tdm-reservation" content="1">`

**Fail-closed bei Zweifel:** eine vorhandene, aber nicht parsebare
`tdmrep.json` gilt als Vorbehalt (BGH I ZR 281/25 ist offen). Ein Vorbehalt auf
IRGENDEINER gelesenen Seite schliesst den ganzen Wettbewerber aus — er ist eine
Willenserklärung des Betreibers, keine Eigenschaft einer Unterseite.

### Sperrliste und Seitenwahl

Gesperrt, segmentweise (deutsch + englisch): Personenbezug (`team`,
`impressum`, `kontakt`, `jobs`, `presse`, …), Rechtstexte (`datenschutz`,
`agb`, `terms`, `cookies`, …), Funktionsseiten (`login`, `account`, `cart`,
`checkout`, `search`, …) und Tagesaktuelles (`blog`, `news`, `magazin`,
`events`) — Blog/News, weil sie das Seiten-Budget mit Momentaufnahmen füllen
und die Häufigkeits-Rechnung verzerren. Dazu Nicht-Seiten (`.pdf`, Bilder,
Archive). Volle Liste: `MARKET_BLOCKED_PATH_SEGMENTS`.

Gewählt werden Startseite + bis zu sieben weitere, aus `sitemap.xml` (aus der
`Sitemap:`-Zeile der robots.txt, sonst `/sitemap.xml`; ein Index eine Ebene
tief) und den internen Links der Startseite, geordnet nach Pfad-Heuristik
(über-uns → werte/mission → leistungen/produkte → preise → faq → referenzen).
Sitemap vor Links: bei gleichem Rang gewinnt, was die Website selbst als
wichtig ausweist.

### Grenzen (§2.8)

| Grenze | Wert |
| --- | --- |
| Seiten je Wettbewerber | 8 (Startseite + 7) |
| Bytes je Seite | 2 MB (Draht UND entpackt) |
| Zeichen je Seite | 20 000 |
| Zeichen je LAUF an die Modelle | 60 000 (§2.8 schlägt §7.4s 80 000/Marke — die engere Zahl gilt) |
| Zeitgrenze je Abruf | 10 s |
| Rohtext-Aufbewahrung | 24 h (`rawExpiresAt`; der Sweep kommt mit M5) |

### Drossel (aus M5 vorgezogen)

3 Läufe je Branding und Tag, Instanz-Deckel 50/Tag
(`pukalani.market.runDailyInstanceCap`), rollierendes 24-h-Fenster. Dazu je IP
in `05.rate-limit.ts`: `market:run` 5/min, `market:competitors` 60/min.
Ablehnungs-Codes `market_run_limit` / `market_instance_limit` als `data.code`
in einer 429 mit `Retry-After`.

### Fehler- und Ablehnungscodes der Routen

| Code | Status | Wann |
| --- | --- | --- |
| `market_locked` | 409 | Kapitel B (`pvm`) noch nicht abgenommen — nur der Lauf |
| `competitor_limit` | 409 | mehr als fünf Kandidaten |
| `competitor_duplicate` | 409 | derselbe Host (inkl. abweichendem Port) schon eingetragen |
| `competitor_url_invalid` | 400 | keine brauchbare Website-Adresse |
| `market_run_limit` / `market_instance_limit` | 429 | Tages-Deckel |
| — | 404 | fremdes/unbekanntes Branding, fehlende Beta-Zulassung, keine Session |

### Extraktion und ihre drei deterministischen Riegel

1. **Zod** auf die Modell-Antwort, fail-soft JE FELD.
2. **Beleg-Riegel:** `evidence.quote` muss (whitespace- und typografie-
   normalisiert, **case-sensitiv**) wörtlich im Rohtext GENAU DER genannten
   Seite stehen. Sonst wird das Feld VERWORFEN. `sourceUrl` muss eine gelesene
   Seite sein.
3. **Häufigkeit** wird im Code gezählt (Kern des Zitats ab 25 Zeichen, über die
   Seiten des Rohtexts), nie vom Modell übernommen.

`inputHash` = sha256 über den Rohtext. Gleicher Hash ⇒ keine erneute
Extraktion (der Abruf läuft trotzdem — das Feststellen der Unverändertheit ist
sein Zweck).

### KI-Aussensicht (§7.5)

Fünf Felder (Kategorie, Pitch, Zielgruppe, Erste Wahl, Werte), ≥ 2
VERSCHIEDENE Modelle aus `pukalani.market.ai.outsideViewModels` (Default LEER =
keine Aussensicht — das ist die Leitplanke, nicht eine fehlende Einstellung).
Übernommen wird nur, was inhaltlich übereinstimmt (normalisierte Gleichheit
oder Token-Jaccard ≥ 0,5); der Wert ist die WÖRTLICHE Antwort des ersten
Modells der grössten übereinstimmenden Gruppe. Ablage in der EIGENEN Spalte
`market_profiles.aiOutsideView`, nie in `fields`; kein Einfluss auf irgendeinen
Score.

### Stub-Verhalten (`MARKET_DEV_STUB=1`)

Ersetzt den ANBIETER, nicht die Prüfung. Die Extraktion baut aus dem Rohtext
eine Modell-förmige Antwort (erster brauchbarer Satz je Seite als Beleg) und
schickt sie durch dieselbe Zod-Form, denselben Beleg-Riegel und dieselbe
Zählung. EIN Feld (`distinctiveAsset`) trägt absichtlich ein ERFUNDENES Zitat
und muss verworfen werden — das ist die Gegenprobe des Riegels ohne
Anbieter-Kosten. Die Aussensicht liefert zwei erfundene „Modelle", die in einem
Feld (`firstChoice`) uneinig sind, damit auch der Konsens-Filter beweisbar
etwas WEGLÄSST.

Dazu `BRAND_SITE_FETCH_ALLOW_LOOPBACK=1` (nur ausserhalb `production`): die
einzige Ausnahme im SSRF-Vertrag, ausschliesslich für Loopback, damit ein
Beweis gegen eigene Demo-Server überhaupt möglich ist.

### Beweise

- Unit (`pnpm --filter @pukalani/market test`, 101): robots-Parser,
  TDM-Erkennung, Sperrliste, Seitenwahl, URL-Normalisierung, PII-Filter,
  Beleg-Riegel, Häufigkeit, Konsens-Filter, Pipeline-Reihenfolge mit
  eingesetztem Abruf — jeder mit Gegenprobe.
- Unit brand (`tests/brandSiteCrawlParse.test.ts`): Links, Meta-Anweisungen,
  JSON-LD, Sitemap-Index.
- End-to-end: `packages/market/scripts/verify-market-fetch.mjs` — **33/33**
  gegen echte Route, echte Ablage und fünf erfundene Websites auf eigenen
  node:http-Servern (2026-09-05).

**Gelernt:** Zwei Regeln waren beim ersten Anlauf zu grob, und BEIDE fand erst
eine Gegenprobe. (1) Der Dubletten-Schlüssel liess den Port weg — im Beweis
lagen fünf Websites auf `127.0.0.1` und galten als EINE Marke; der Port gehört
dazu, sobald er abweicht. (2) Der Stub gab fertige Felder zurück und lief damit
am Beleg-Riegel VORBEI: der Beweis hätte eine Kette geprüft, deren teuerstes
Glied im Ersatz-Betrieb gar nicht mitlief. Ein Ersatz gehört durch dieselbe
Prüfung wie das Echte, sonst prüft er sich selbst.

---

## Anhang D — Vergleichs- und Befund-Vertrag (M3, Stand 2026-09-05)

Gebaut in Paket **M3 „Vergleich + Befunde"**. Was hier steht, ist der Vertrag —
die Begründungen stehen im Kopf der jeweiligen Datei.

### Wo was liegt

| Sache | Ort |
| --- | --- |
| Bericht-Prompt `market-r-1` | `packages/market/server/prompts/marketReportPrompt.ts` |
| Vergleich (Modell-Aufruf + die vier Prüfungen) | `packages/market/server/utils/marketReport.ts` |
| Stand laden, speichern, `stale`, Befunde schreiben | `packages/market/server/utils/marketReportService.ts` |
| Eigenes Marktprofil aus der Foundation | `packages/market/server/utils/marketOwnProfile.ts` |
| Brand-Check je Kandidat (nur lesen) | `packages/market/server/utils/marketBrandCheck.ts` |
| § 6 UWG-Riegel (pur) | `packages/market/shared/marketDisparagement.ts` |
| Matrix, Quote, Belegprüfung, Schlüssel-Zutaten (pur) | `packages/market/shared/marketReportRules.ts` |
| Bibliothek: Schema + Lader / die Datei | `packages/market/shared/marketLibrary.ts` / `shared/library/index.ts` |
| Routen | `packages/market/server/api/market/profiles/[id]/report.{post,get}.ts` |
| Brand-Naht (nur lesend ergänzt) | `packages/brand/server/utils/brandCheckLookup.ts` (NEU), Re-Exporte im Vertrag |

### Prompt-Versionen

| Version | Zweck | Datei |
| --- | --- | --- |
| `market-r-1` | Der Vergleich, EIN Aufruf über eigenes Profil + N Marktprofile | `server/prompts/marketReportPrompt.ts` |
| `converse-10` | Der George-Block „Der Markt sagt …" im Gespräch (war `converse-9`) | `packages/brand/server/utils/conversePrompt.ts` |

Modell: `pukalani.market.ai.reportModel` (Default LEER) > das **George-Modell**
(`getEffectiveAiConfig`, also `app_config.aiModel > pukalani.ai.model`) > das
Stufe-1-Modell des Spezialisten. Temperatur 0, ZDR-Routing wie überall.

### Was das Modell darf und was der Code entscheidet

Das Modell liefert **vier Listen** und sonst nichts: Konventionen,
Überschneidungen, freie Stellen, Befunde. Es liefert **keine Zahl**.

1. **Die Gegenüberstellung** (Matrix) baut der CODE aus den Profilen
   (`marketMatrixRows`) — Zeile Feld × Spalte Marke, die eigene zuerst. Jede
   Zelle ist buchstäblich ein Marktprofil-Feld; eine leere Zelle trägt ihren
   GRUND (`own` = bei euch noch nicht bestätigt · `field` = sagt öffentlich
   nichts · `excluded` = wir durften nicht nachsehen).
2. **Die Quote** einer Konvention rechnet der Code nach: `sharedBy / of ≥ 0,6`
   UND `sharedBy ≥ 2`. Nenner ist, wer in diesem Feld überhaupt etwas sagt —
   bei Konventionen INKLUSIVE der eigenen Marke, bei Überschneidungen ohne sie
   (Prototyp-Vertrag: 3 von 3 gegen 1 von 2).
3. **Jedes Zitat** muss ein BELEG des Marktprofils GENAU DER genannten Marke
   sein (`citationIsGrounded`): Gleichheit oder Kürzung, nie Erweiterung, nie
   Übersetzung, mindestens zwölf Zeichen. Eine Marke ohne gültigen Beleg fällt
   still weg und senkt die Quote.

### Der § 6 UWG-Riegel (§2.9 Nr. 5)

Drei Lagen, in dieser Reihenfolge wirksam:

1. **Anonymisierung im Prompt** — das Modell sieht die Wettbewerber nur als
   `c1 … c5`, nie mit Namen oder Adresse. Es KANN keinen Namen in einen
   Vorschlag schreiben. Das ist die stärkste Lage und kostet nichts.
2. **Prompt-Regel** — „describe, never judge the third party; never write a
   sentence that names or identifies another company".
3. **Filter im Code** (`marketDisparagement.ts`, pur + Gegenproben) über
   JEDES erzeugte Element (Befunde, Konventionen, Überschneidungen, freie
   Stellen): (a) Wettbewerber-Name inkl. Teil-Token ≥ 4 Zeichen,
   umlaut-normalisiert (`Müller` = `Mueller`), (b) Domain und Domain-Label,
   (c) Wortliste herabsetzender Ausdrücke de+en. Rechtsformen (`GmbH`, `Ltd`,
   `Company`) und Endungen (`com`, `de`, `example`) sind ausgenommen — sie
   identifizieren niemanden.

**Ein Treffer VERWIRFT das Element** (nicht umformulieren: das wäre dasselbe
Modell, das den Satz gerade falsch gebaut hat), und `market.report_filtered`
zählt — je Grund eine Zahl, nie ein Text.

### Befunde

`kind: 'market'` in `brand_findings` (Migration **brand-018** erweitert das
Enum `kind` um `market` — ADDITIV, mit Guard gegen Wegnahme). Genau EIN eigenes
Slot-Feld je Befund, `why` UND `suggestion` PFLICHT, höchstens drei je Bericht.
`stepKey` ist das Kapitel des betroffenen FELDES (`slotById(...).stepId`),
`sourceSession` der Marker `market:_own` — ein Markt-Befund hat keine
Quell-Session.

**Er sperrt NICHTS** (`blockingFindingSlots` fragt nach `conflict`) und löst
keine zweite Prüfstufe aus (`needsStageTwo`). `BRAND_REVIEW_FINDING_KINDS`
hält `market` aus der Menge heraus, die der Spezialist selbst antworten darf.

**ERSETZEN statt dazulegen:** ein neuer Bericht löscht die OFFENEN
`market`-Befunde des Profils (`purgeOpenBrandFindingsOfKind`); ENTSCHIEDENE
bleiben als Protokoll. Grund: ein Markt-Befund ist die Aussage EINES
Berichtsstandes, und zwei Chips am selben Feld mit anderen Zahlen sind für den
Menschen davor nicht auflösbar.

### `revisionKey` und `stale`

`sha256(brandGenerationHashInput('market.report', 'market-r-1', entries))` —
derselbe kanonische Bauer wie `sourcesHash` und der `inputHash` der
Generationen (er trägt die Registry-Fassung mit). Zutaten:

- die **Werte aller zehn eigenen Felder** (auch der leeren, in Registry-Folge),
- je Kandidat, **nach Id sortiert**: `sourceKind | sourceRef | url | inputHash`
  (der Stand seiner Auswertung),
- die **Bibliotheks-Fassung** (`MARKET_LIBRARY_VERSION`).

Gleicher Schlüssel ⇒ gespeicherter Bericht (`reused: true`), kein Modellaufruf,
keine Buchung. `stale` ist DIESELBE Rechnung, nicht eine zweite: die GET-Route
vergleicht den Schlüssel von JETZT mit dem in der Zeile. Bewegt haben ihn
entweder eine eigene Korrektur oder ein neuer Abrufstand. **Anzeige-Wort, kein
Löschen** — ein überholter Bericht bleibt vollständig lesbar.

### Bibliothek

`packages/market/shared/library/index.ts` (`MARKET_LIBRARY_VERSION` + Einträge),
Zod-Schema und Lader in `shared/marketLibrary.ts`, **fail-closed**: fällt die
Datei durch das Schema, ist die Bibliothek LEER. Je Eintrag Pflicht:
`key`, `name`, `homepage`, `verifiedAt`, `verifiedBy`; je Feld Pflicht:
`sourceUrl`, optional `quote` (≤ 200 Zeichen). Die Handprüfung ist damit ein
DATENFELD, nicht eine Zusage im Kopf — der Unterschied zur Website-Quelle ist
nicht die Beweislast, sondern WER geprüft hat (dort eine Maschine gegen den
Rohtext, hier ein Mensch mit Datum und Zeichen).

Ein `library`-Kandidat wird beim Lauf **nicht abgerufen**; sein Profil kommt
aus der Datei (`source: 'library'`, `fetchedAt` = Prüfdatum, keine
`frequency`). **Inhalt heute: nur erfundene Testeinträge** (`.example`) — die
echten Paare kommen mit **M6** nach Handprüfung und Rechts-Check.

### Brand-Check-Anbindung (§7.3)

Der Marktvergleich **liest** den bestehenden Score und rechnet keinen.
`findBrandCheckForUrl` (neu in `packages/brand/server/utils/brandCheckLookup.ts`)
sucht über `brandCheckUrlKey(origin)` — den indizierten Schlüssel, mit dem der
Check selbst seinen Zwischenspeicher findet. Ausgeblendete Checks (`hidden`)
zählen nicht. Ergebnis: `brandCheck: { score, band, checkId }` am Kandidaten,
`market_competitors.brandCheckId` als Adresse (nie der Score — der ändert sich).
Nur Website-Kandidaten; Foundation und Bibliothek haben keinen eigenen Auftritt.

**NICHT gebaut: das ANSTOSSEN eines fehlenden Checks.** Die Check-Mechanik liegt
vollständig im Handler von `packages/brand/server/api/brand/check.post.ts` und
ist nirgends als Funktion herausgezogen; von aussen zu rufen hiesse kopieren —
und dann hätte der Marktvergleich seinen eigenen, langsam abweichenden Score,
also genau die zweite Zahl, die §7.3 streicht. Ohne Check bleibt `brandCheck`
leer, die Oberfläche zeigt `market.score.pending`. **Für BC1:** eine
herausgezogene `runBrandCheck()` unter dem Konto-Deckel (10/Tag, `force`)
genügt, danach ist es hier ein zweiter Aufruf.
*Überholt seit 2026-09-06 (BC1-Nachzug): `runBrandCheck()` ist aus der Route
herausgezogen (`packages/brand/server/utils/brandCheckRun.ts`) und über den
Brand-Vertrag exportiert; der Lauf stösst für jeden GELESENEN Website-Kandidaten
ohne Check einen an — synchron vor dem Bericht (h3 1.15 hat kein `waitUntil`),
unter dem Konto-Deckel des Nutzers mit `quota: 'account'` (Cache bleibt, kein
`force`), fail-soft je Kandidat, Wanduhr 120 s über den ganzen Anstoss,
`rankingOptIn: false`. Ausgeblendete oder per robots.txt ausgeschlossene
Kandidaten bleiben ohne Score. Siehe OPEN-ITEMS-COMPLETE.*

### Routen und Codes

| Route | Was | Codes |
| --- | --- | --- |
| `POST /api/market/profiles/:id/report` | rechnet den Bericht auf dem aktuellen Stand | 409 `market_locked` (Kapitel B) · 409 `market_no_profiles` · 409 `ai_disabled` · 429 `market_run_limit`/`market_instance_limit` · 404 (fremd/ohne Session) |
| `GET /api/market/profiles/:id/report` | letzter Bericht + `stale` + Befunde + `brandCheck` | 404 (fremd/ohne Session) — **keine** Freischaltungs-Schranke: Ansehen kostet nichts |
| `POST …/run?report=1` (oder `{ withReport: true }`) | Lauf UND Bericht in einem Klick | wie der Lauf; der Bericht ist hier fail-soft (`report: null`) |

**Der Eimer:** eigener Tages-Eimer `market-report-day:<profileId>` (3/Tag) NEBEN
dem des Laufs, aber GETEILTER Instanz-Deckel. Grund: aus Kundensicht ist „Markt
vergleichen" EIN Knopf, technisch sind es zwei Schritte — ein gemeinsamer Eimer
legte den Deckel faktisch bei eineinhalb. Der Instanz-Deckel zählt dagegen
KOSTEN, und jeder Bericht ist ein Modell-Aufruf.

**Warum `run` den Bericht nicht automatisch anhängt:** ein Flag mit Default
`false`. So bleibt M2s Beweis unverändert gültig (der Lauf antwortet weiter in
seiner Form), ein reiner Abruf-Lauf kostet keinen Modell-Aufruf, und M4 hat
trotzdem den EINEN Knopf.

### Ereignisse (§2.10)

`market.report` (Dauer, Kandidatenzahl, Zähler je Teil, Befunde, gefiltert,
`reused`, Modell, Fassung, `failure`) · `market.report_filtered` (Zahl je Grund,
NIE der Text) · `market.finding_accepted` / `market.finding_dismissed` (EINE
Zeile in der bestehenden brand-Entscheidungs-Route, benannt nach der `kind` des
Befundes) · `market.run_report_failed` (nur der Status).

### Stub (`MARKET_DEV_STUB=1`)

Deterministisch aus den Profilen: eine Konvention, eine Überschneidung, eine
freie Stelle, ein SAUBERER Befund — und **zwei absichtlich verbotene**: einer
mit herabsetzender Formulierung, einer mit einem Wettbewerber-Namen im
Vorschlag. Beide MÜSSEN vom Riegel verworfen werden; das ist die Gegenprobe im
Beweis, ohne einen bezahlten Aufruf. Ein Ersatz, der nur Erlaubtes liefert,
prüfte sich selbst.

### Beweise

- Unit (`pnpm --filter @pukalani/market test`, **164**): Herabsetzungs-Filter
  mit Gegenprobe an jeder Stelle, Namens-/Domain-Filter inkl. Teil-Token und
  Umlaut, Matrix, Konventions-Quote, Belegprüfung, Schlüssel-Zutaten
  (stabil/beweglich), Bibliotheks-Schema.
- Unit brand: `tests/brandFindings.test.ts` (`market` sperrt nichts — mit
  Gegenprobe am `conflict`), `tests/conversePrompt.test.ts` (der George-Block).
- End-to-end: `packages/market/scripts/verify-market-report.mjs` — **43/43**
  (2026-09-05), Vorbedingungen wie bei `verify-market-fetch.mjs`.
  `verify-market-fetch.mjs` bleibt **33/33**.

**Gelernt (drei Dinge, alle erst im Beweis sichtbar):**
1. **Eine neue Enum-Wert braucht eine Migration, und fail-soft verschluckt den
   Beleg dafür.** Der Bericht war fertig, der Riegel hatte gearbeitet, und die
   Befund-Tabelle blieb leer — Appwrite lehnte `kind: 'market'` ab, das
   Schreiben ist fail-soft, und die einzige Spur stand als `warn` im Log. Ohne
   den E2E-Beweis wäre das erst einem Kunden aufgefallen.
2. **`updateEnumColumn` verlangt `xdefault`, obwohl der Typ es optional nennt**
   (node-appwrite 26.2): der Client wirft „Missing required parameter", bevor
   er die Anfrage stellt. Für ein Pflichtfeld ist `null` der richtige Wert.
3. **Ein Beweis darf nicht den ganzen Umschlag durchsuchen.** Die erste Fassung
   der UWG-Gegenprobe suchte den Wettbewerber-Namen im GESAMTEN Bericht und war
   rot — obwohl der Riegel richtig gearbeitet hatte: die Namen stehen
   selbstverständlich in den Spaltenköpfen und an jedem Beleg. Verboten ist,
   dass ein Satz, den WIR formulieren, einen Dritten nennt; genau das prüft die
   Fassung jetzt.

---

## Anhang E — Oberfläche (M4, Stand 2026-09-05)

Gebaut in Paket **M4 „Oberfläche"**. Was hier steht, ist der Vertrag — die
Begründungen stehen im Kopf der jeweiligen Datei. Die fünf abgenommenen
Prototyp-Screens (M0/M0b) sind übernommen: Optik, Wortwahl und Aufbau
unverändert, nur an echten Routen. Der Playground bleibt unangetastet.

### Wo was liegt

| Sache | Ort |
| --- | --- |
| Die Seite „Markt" (fünf Zustände) | `packages/market/app/pages/brand/[profileId]/market.vue` |
| Beschriftungen aus dem brand-Katalog | `packages/market/app/composables/useMarketBrandLabels.ts` |
| Der Oberflächen-Vertrag zu `brand` (nur Typen) | `packages/market/app/contracts/brandUi.ts` |
| Der Leisten-Eintrag (Anmeldung) | `packages/market/app/app.config.ts` |
| Der Erweiterungspunkt (Form + Rechnung) | `packages/brand/shared/brandWorkspaceNav.ts` |
| Der Erweiterungspunkt (Anwendung) | `packages/brand/app/composables/useBrandWorkspaceNavExtras.ts` |
| Das Produkt-Gate an den Routen | `packages/market/server/utils/marketAccess.ts` (`requireMarketEnabled`) |
| Die Schranke (pur) | `packages/market/shared/marketPaywall.ts` |
| Das Opt-in (lesen/schreiben/suchen) | `packages/brand/server/utils/brandMarketVisibility.ts` |
| Routen | `packages/market/server/api/market/profiles/[id]/{candidates.get,visibility.patch}.ts` |

### Die Seite und ihre fünf Zustände

`/brand/:profileId/market` — EINE Adresse, kein Reiter unter `/brand-check`
(Davids Entscheidung, §7.1). Nuxt sortiert statische Segmente vor dynamische,
`market` gewinnt also gegen `[stepKey]` des brand-Layers.

| Zustand | Wann | Was steht da |
| --- | --- | --- |
| **(a) gesperrt** | Kapitel B nicht abgenommen (§2.4) | 200 mit freundlicher Erklärung und Knopf ins Kapitel — **kein 404**: das ist der eigene Kunde, ihm fehlt ein Schritt |
| **(b) Kandidaten** | freigeschaltet | Liste, Quellen-Wähler, Schranke; Kandidaten darf man auch gesperrt pflegen |
| **(c) Lauf** | nach dem Klick | EIN synchroner `POST …/run?report=1`; während des Wartens der GESPEICHERTE Stand je Kandidat, danach die Kette aus der Antwort — **keine erfundenen Zwischenschritte** |
| **(d) Bericht** | ein Bericht liegt vor | Gegenüberstellung (UTable-Vorlage `MkComparisonTable`), drei Listen, Profil-Karten, KI-Aussensicht, Befund-Chips; `stale` als Hinweis mit „Erneut vergleichen" |
| **(e) Relaunch** | ein Kandidat mit `role: 'self'` hat ein Profil | `MkRelaunchCompare`: alte Website links, bestätigte Foundation rechts |

Datentür wie überall: fremdes oder unbekanntes Branding ⇒ 404, ohne Session
⇒ 404 (nie 403). Das Produkt-Gate `pukalani.market.enabled` wirft ebenfalls
404, bevor irgendetwas geladen wird.

**Das Gate schaltet ALLE DREI Flächen (Nachfix 2026-09-05).** Bis dahin las es
nur die Seite: die Leiste zeigte „Markt" auch bei ausgeschaltetem Produkt (Klick
⇒ 404), und vor `/api/market/**` stand allein die core-Middleware
`04.product-gate.ts` — die prüft aber den LAUFZEIT-Zustand
`app_config.products.market.enabled` und lässt ein fehlendes Eintrag-Feld
bewusst als „an" durch. Jetzt liest die LEISTE den Schalter über
`BrandWorkspaceNavExtra.productKey` (`resolveWorkspaceNavExtras` lässt Einträge
ohne eingeschaltetes Produkt WEG — anders als bei `lockedUntil`, wo der Eintrag
sichtbar-gesperrt bleibt), und die ROUTEN über `requireMarketEnabled()` in
`requireMarketProfile`, durch das alle zehn Handler gehen. Zwei Ebenen, zwei
Fragen, kein Doppel: der Core prüft den Notaus des Betreibers, der Layer das
Build-Gate des Deployments.

**`apps/branding` steht deshalb vorerst auf `market: { enabled: false }`** — an
geht der Schalter erst, wenn die Prod-Migrationen `market-001…004` und
`brand-018`/`brand-019` auf der Instanz `branding` gelaufen sind (Davids Ja;
Migration IMMER vor dem Code-Deploy). Bis dahin ist das Produkt auf der Live-Site
komplett dunkel — Seite, Leiste und Routen antworten, als gäbe es es nicht. Das
Umlegen ist eine Zeile und ein Commit.

### Der Leisten-Erweiterungspunkt

`brand` kennt kein Produkt, das auf ihm aufsetzt (CONCEPT A14) — es kennt nur
die FORM eines zusätzlichen Ebene-1-Eintrags:
`pukalani.brand.workspaceNavExtras: BrandWorkspaceNavExtra[]`
(`key`, `productKey`, `labelKey`, `icon`, `to` mit `:profileId`, `lockedUntil`,
`counterKind`), Default `[]`. defu verkettet Arrays über die Layer, das
Produkt meldet sich also SELBST an; eine Silo-App ohne `market` bekommt keinen
Menüpunkt ins Leere. Gerechnet wird in `resolveWorkspaceNavExtras` (pur,
getestet), angewandt über `useBrandWorkspaceNavExtras` in allen drei Seiten
(Werkstatt, Dokument, Markt). `BwRailStep.kind: 'extra'` trägt die eigene
Glyphe; gesperrt ist der Eintrag SICHTBAR und ohne `to` — eine unsichtbare
Schranke erklärt sich nie.

**Der Zähler** („2 Befunde offen") kommt aus den Befunden, die die jeweilige
Seite ohnehin geladen hat, gefiltert auf `kind: 'market'` und `status: 'open'`.
Das Feld `pukalani.brand.workspaceNavExtras[].labelKey` steht in der
`FIELDS`-Tabelle von `scripts/check-i18n-keys.mjs`.

**Eine Doppelung mit Grund:** `lockedUntil` steht in `app/app.config.ts`
WÖRTLICH als `'pvm'` und nicht als Import — `pnpm check:i18n-keys` lädt jede
`app.config.ts` mit Nodes Typ-Strippung, und die kann einen relativen Import
ohne Endung nicht auflösen. Bezahlt wird der Preis mit
`packages/market/tests/marketNavConfig.test.ts`, der beide Stellen
gegeneinander hält.

### Der Quellen-Wähler (§7.2)

`GET /api/market/profiles/:id/candidates?source=foundation|library|shared&q=`
liefert höchstens zehn `MarketSourceOption` (Id, Name, Kategorie-Feld als
Zweitzeile). Drei Zusagen:

1. **`foundation`** — die eigenen Brandings des Kontos, OHNE das aktuelle
   (es mit sich selbst zu vergleichen ergäbe zehn Zeilen „gleich").
2. **`library`** — die handgeprüften Repo-Einträge (bis M6 nur erfundene).
3. **`shared`** — freigegebene Marken FREMDER Konten: Opt-in gesetzt UND
   Kapitel B abgenommen UND nicht das eigene Konto. Zurück gehen Id, Name und
   Branche — **nie eine `ownerId`**.

Die Liste wird erst geholt, wenn eine Quelle gewählt ist; drei Listen im
Voraus wären drei Abfragen je Seitenaufbau, von denen der Kunde meistens keine
braucht.

### Das Opt-in (§7.2 Nr. 4)

Spalte `brand_profiles.marketVisibility` (`private` | `shared`, Default
`private`, Migration **brand-019**, Index `idx_market_visibility`). Semantik
ausdrücklich die des Brand-Check-Rankings (`rankingOptIn`) — keine zweite
Schalter-Semantik. Gesetzt wird sie an GENAU EINER Stelle: dem Schalter in der
rechten Spalte „Stand" der Markt-Seite, über
`PATCH /api/market/profiles/:id/visibility` (market-Route, die über den
Vertrag die brand-Zeile schreibt — so bleibt `brand` fast unberührt).

Text (de): „Meine Marke darf im Marktvergleich anderer Kunden erscheinen" ·
„Sichtbar wird dann nur das Marktprofil aus euren bestätigten Feldern — nie
Gespräche, Entwürfe, Notizen oder eure eigenen Wettbewerber. Jederzeit
widerrufbar: neue Läufe schliessen eure Marke danach aus, schon geschriebene
Berichte bleiben als Schnappschuss bestehen."

**Vertraulichkeit:** das Marktprofil einer fremden Marke entsteht über
denselben Motor wie die eigene Foundation, aber mit `publicOnly: true` — Slots
mit `sensitivity !== 'public'` (Wettbewerber, Beschwerden, Schmerzpunkt,
Zahlen) fallen raus. Zusätzlich nagelt
`packages/market/tests/marketBrandContract.test.ts` fest, dass KEIN
Marktprofil-Feld auf eine nicht-öffentliche Session zeigt — mit Gegenprobe.

**Widerruf:** die Freigabe wird bei JEDEM Lauf neu geprüft. Ist sie weg,
schliesst der Lauf den Kandidaten mit `excludedReason: 'withdrawn'` aus
(neuer Wert in `MarketExclusionReason`, keine Migration — die Spalte ist ein
varchar); ein bereits geschriebener Bericht bleibt vollständig lesbar.

### Die Rolle `self` (§7.2 Nr. 2)

Spalte `market_competitors.role` (`competitor` | `self`, Default
`competitor`, Migration **market-004**, kein Index). Sie ist eine ANDERE Frage
als `sourceKind`: der eine sagt, WOHER die Aussagen kommen, die andere, WESSEN
Aussagen es sind. Folgen, alle über die eine Funktion `marketFieldCandidates`:

- zählt NICHT gegen `MARKET_COMPETITORS_MAX` (die Kandidaten-Abfrage holt
  deshalb `MAX + 1` Zeilen), höchstens EINE je Branding (`self_limit`),
- geht dem Modell gar nicht erst zu (sonst zählte jede Quote uns selbst mit),
- steht nicht in der Matrix und in keiner der drei Listen,
- steht sehr wohl in `report.competitors` — die Relaunch-Gegenüberstellung
  braucht sie.

### Der Namensfilter, nachgeschärft (Befund aus M3, Anhang D)

Bis M3 sperrte der § 6 UWG-Riegel JEDES Namens-Token ab vier Zeichen. Bei
„Kailua Coffee" hiess das: `coffee` war in jedem Vorschlag verboten — in der
Kaffee-Kategorie also das Wort, um das es geht. Neue Regel in
`shared/marketDisparagement.ts`: gesperrt sind

  (a) der volle normalisierte Name (auch zusammengezogen),
  (b) Domain und Domain-Label,
  (c) UNTERSCHEIDENDE Tokens — Namens-Teile ab vier Zeichen, die weder in
      `MARKET_GENERIC_TOKENS` (Rechtsformen, Kategorie- und Branchenwörter
      de/en) noch in den eigenen bestätigten Texten des Kunden vorkommen
      (`categoryLanguage`, `pitch`, `audience`).

`MARKET_NAME_TOKEN_MIN` bleibt als Untergrenze. Fail-closed bleibt es
trotzdem: ohne eigene Texte greift nur die generische Liste, und der volle
Name ist IMMER gesperrt. Tests mit Gegenprobe: „Kailua Coffee" ⇒ `coffee`
erlaubt / `Kailua` gesperrt · „Nike" ⇒ gesperrt · `pacificbean.example` ⇒
`pacificbean` gesperrt · eigenes Wort im Pitch entschärft die Sperre.

### Die Schranke (§1.9) und ihre Messung

`resolveMarketPaywall({ betaAccess })` — pur, beide Zustände getestet. Heute
ist `betaAccess` immer wahr (der einzige Weg auf die Seite führt durch
`requireBrandAccess`), der gesperrte Zweig bleibt trotzdem eine TATSACHE und
kein toter Code; die Zuteilung je Branding aus §1.9 erweitert später die
EINGABE, nicht die Oberfläche. Der Prototyp-Schalter fällt weg — ein Kunde,
der seine eigene Schranke umlegen kann, hat keine.

Der Klick auf die Schranke meldet `studio_cta_erstgespraech` mit
`source: 'market_paywall'` über `useFunnelEvent()` (Plausible, §2.10). Kein
NEUES Ereignis: das Ziel IST das Erstgespräch, und ein zweiter Name für
denselben Klick hiesse zwei Goals zu pflegen, die dasselbe zählen. Das Ziel
kommt aus `pukalani.brand.completionCta.to`.

### Befund-Chips (§2.5)

Die Markt-Befunde werden mit `BwFindingChip` gerendert — demselben Chip wie in
Session, Log, Abnahme und Dokument (die Art `market` kennt er seit M3, Glyphe
Kompass, Bernstein, sperrt nichts). Die Seite holt sie über
`GET /api/brand/profiles/:id/findings` und filtert auf `kind: 'market'`: der
Chip entscheidet selbst per `$fetch`, und eine zweite Entscheidungs-Mechanik
wäre die zweite Stelle, an der ein 409 anders behandelt wird.

### Beweise

- Unit (`pnpm --filter @pukalani/market test`, **181**): Rolle `self` und der
  Feld-Filter mit Gegenproben, die Schranke in beiden Zuständen, der
  nachgeschärfte Namensfilter (vier neue Fälle), die Vertraulichkeits-Zusage
  gegen die Registry, der Leisten-Eintrag gegen den Produktvertrag.
- Unit brand (`pnpm --filter @pukalani/brand test`, **1784**):
  `tests/brandWorkspaceNavExtras.test.ts` — Adress-Vorlage, Sperre mit
  Gegenprobe, Zähler je Art, halb ausgefüllte Zeilen.
- End-to-end: `packages/market/scripts/verify-market-ui.mjs` — **46/46**
  (2026-09-05), Vorbedingungen wie bei `verify-market-report.mjs`; `KEEP=1`
  lässt das Test-Branding für den Klick-Beweis stehen.
  `verify-market-fetch.mjs` bleibt **33/33**, `verify-market-report.mjs`
  **43/43** (je frischer Serverprozess — die Eimer leben im Prozess).

**Gelernt (drei Dinge):**
1. **Ein Import in einer `app.config.ts` kostet einen Wächter.**
   `pnpm check:i18n-keys` lädt diese Dateien mit Nodes Typ-Strippung; ein
   relativer Import ohne Endung ist dort nicht auflösbar, und der Wächter wird
   ROT — nicht wegen eines fehlenden Schlüssels, sondern weil er die Datei
   nicht mehr lesen kann. Konstanten gehören dort wörtlich hinein, mit einem
   Test als Netz.
2. **Eine generische Funktion, die auf rohe Appwrite-Zeilen trifft, darf
   keinen Literal-Typ verlangen.** `marketFieldCandidates` hatte
   `role?: MarketCandidateRole`, und die Kandidaten-Route reicht ein
   `role?: string` aus der Zeile herein — ein `as`-Cast an der Aufrufstelle
   wäre eine Behauptung über genau den Wert gewesen, den die Funktion prüft.
3. **Der Beweis darf nicht das ganze HTML durchsuchen.** Der SSR-Payload
   trägt die rohen Antwort-Daten; ein Grep nach `market.` über die ganze
   Seite fände dort jeden Schlüssel, der irgendwo als Wert vorkommt. Geprüft
   wird der SICHTBARE Text — dieselbe Lehre wie bei der UWG-Gegenprobe in M3.

---

## Anhang F — Betrieb (M5, Stand 2026-09-05)

Gebaut in Paket **M5 „Betrieb"**. Der Eimer stand schon (aus M2 vorgezogen,
s. §5); hier kommen Frist, Erklärseite, Vertraulichkeits-Nachweis, Bewertung
und das Einführungs-Runbook dazu. **Keine neue Migration.**

### Wo was liegt

| Baustein | Ort |
| --- | --- |
| Frist-Regel (pur) | `packages/market/shared/marketRetention.ts` |
| Der Sweep | `packages/market/server/utils/marketRawSweep.ts` |
| Der Takt (30 min, erster Lauf +45 s) | `packages/market/server/plugins/raw-text-sweep.ts` |
| Betreiber-Knopf (`system.manage`) | `packages/market/server/api/market/ops/sweep.post.ts` |
| Erklärseite des Bots | `packages/market/app/pages/market-bot.vue` |
| Bewertung (Vertrag + Route) | `packages/market/shared/marketRating.ts` · `server/api/market/profiles/[id]/rating.post.ts` |
| Teilen-Filter (brand, additiv) | `packages/brand/shared/brandSharing.ts` |
| Produkt-Ereignis (brand, additiv) | `recordBrandProductEvent` in `packages/brand/server/utils/brandEvents.ts` |
| Runbook | `docs/runbooks/MARKTVERGLEICH-EINFUEHRUNG.md` |
| Interne Doku | `docs/content/3.features/7.marktvergleich.md` |

### Die Frist (§2.9 Nr. 6)

Gestempelt beim Abruf (`marketRawExpiresAt`, seit M2 — die 24 stand dort als
Rechnung mitten im Schreibvorgang und ist jetzt EINE Konstante), eingelöst vom
Sweep. Drei Entscheidungen, die man nicht „vereinfachen" darf:

1. **Der Takt hängt NICHT am Produkt-Gate**, sondern nur an
   `getProductRegistry().has('market')` — also an „ist der Layer
   einkompiliert?". Wer das Produkt abschaltet (Build-Schalter oder
   Notabschaltung), stellt das SAMMELN ein; er darf damit nicht die
   Lebensdauer des schon gesammelten fremden Seitentextes verlängern. Der
   Betreiber-Knopf daneben liegt unter `/api/market` und fällt sehr wohl mit
   der Notabschaltung — er ist der Handgriff, der Takt ist die Zusage.
2. **Die Fail-Richtung ist umgekehrt** zu allen anderen Sweeps des Repos: ein
   fehlender oder unlesbarer Stempel heisst „löschen". Sonst wäre fremder
   Seitentext ohne Ablaufdatum genau der Zustand, den §1.7 Nr. 4 ausschliesst.
   Ein zu früh geleerter Rohtext kostet dagegen nichts — das Marktprofil ist
   längst geschrieben.
3. **Der Sweep fasst `market_profiles` NIE an.** `marketRawSweepPatch()` gibt
   genau zwei Felder zurück (`rawText: ''`, `rawExpiresAt: null`), und der Test
   nagelt die Schlüssel-Liste fest. Ein Sweep, der auch die Belege nähme, würde
   die Zusage nicht einlösen, sondern das Produkt löschen.

30 Minuten und nicht stündlich, weil diese Frist in STUNDEN rechnet und nach
aussen genannt wird: bei stündlichem Takt stünde auf `/market-bot` faktisch
„bis zu 25 Stunden".

### Die Erklärseite `/market-bot` (§2.9 Nr. 1)

Der User-Agent verspricht sie (`PukalaniMarketBot/1.0
(+https://branding.supply/market-bot)`), also muss sie antworten. Vier
Auskünfte in dieser Reihenfolge: was gelesen wird, was gar nicht erst
abgerufen wird (die vollständige Pfad-Sperrliste als BELEG statt als
Behauptung), was mit dem Gelesenen passiert, wie man uns aussperrt (robots.txt
plus die vier TDM-Formen). Kein Marketing, kein CTA.

**Sie steht bewusst NICHT hinter dem Produkt-Gate.** Sobald ein einziger Lauf
passiert ist, steht der Name in einem fremden Log — und der wird nicht mit
unserem Schalter zurückgenommen. Eine Erklärseite, die nur existiert, solange
das Produkt an ist, wäre genau dann weg, wenn jemand sie am dringendsten sucht.

Alle Zahlen (Seiten, Zeichen, Bytes, Zitatschranke, Frist, Sperrliste) kommen
aus den Verträgen, nicht aus der Übersetzungsdatei: eine abgetippte Zahl wäre
beim ersten Ändern eine öffentliche Falschaussage über unser eigenes Verhalten.
Die Code-Beispiele stehen im MARKUP, weil Locale-Messages in diesem Repo keine
spitzen Klammern tragen dürfen (CLAUDE.md).

### Vertraulichkeit (§2.9 Nr. 7) — Befund und Fix

Der Nachweis hat einen echten Befund gebracht, und zwar nicht im market-Layer:

- **Markt-Daten reisen heute schon nicht.** `BrandShareSnapshot` trägt sieben
  Felder (Story, bestätigte Kapitel, Preset) und **überhaupt keine Befunde** —
  auch keine der Art `market`. Kandidaten, Marktprofile und Berichte haben
  keinen Weg dorthin. Ein Export existiert nicht (es gibt keine Route, keinen
  Renderer, kein `@media print`). Das ist als FORM festgenagelt
  (`packages/market/tests/marketConfidentiality.test.ts`): ein neues
  Pflichtfeld im Snapshot bricht den Typecheck genau dort, wo die Zusage
  gemacht wurde.
- **Der Massstab der Zusage reiste aber sehr wohl mit.** §2.9 Nr. 7 sagt
  „vertraulich wie `a.competitors`" — und `a.competitors` selbst stand im
  Teilen-Link. `BrandSessionConfig.sensitivity` trägt seit BF1 wörtlich den
  Satz „Was per Share-Link und Export standardmässig NICHT reist", vier
  Sessions stehen auf `internal` (`a.competitors`, `a.complaints`,
  `a.challenge`, `a.facts`), und GELESEN hat das Feld beim Veröffentlichen
  niemand: `confirmedSlotValues` lief über alle bestätigten Slots. Dreissig
  Tage lang lesbar für jeden mit dem Token — inklusive der Wettbewerber-NAMEN
  samt notierter Schwäche, also genau der Angabe, die der § 6 UWG-Riegel des
  Marktvergleichs aus jedem Vorschlag heraushält.
- **Fix (additiv, im brand-Layer):** `shared/brandSharing.ts` mit
  `isBrandSlotShareable` (fail-closed: unbekannt und `deactivated` reisen
  nicht) und `brandShareableSlotValues`; `share.post.ts` legt es über
  `confirmedSlotValues`. **Nicht** in `confirmedSlotValues` selbst — die
  beantwortet „was hat dieser Mensch bestätigt?", und diese Antwort schliesst
  die internen Sessions ein (Werkstatt, Abnahme, Dokument, und der market-Layer
  baut daraus das eigene Marktprofil mit seinem eigenen `publicOnly` obendrauf).
- **Der DOKUMENT-Verweis in §2.9 Nr. 7 meint den Dokument-EXPORT** (so steht es
  in §1.7 Nr. 6 ausführlich). Die Dokument-ANSICHT zeigt Markt-Befunde weiter,
  und das ist Anhang E so beschlossen („derselbe Chip wie in Session, Log,
  Abnahme und Dokument") — sie ist Eigentümer-Fläche. Wird ein Export gebaut,
  gehört derselbe Filter davor.

### Messung (§2.10)

Log-Ereignisse: `market.run` · `market.report` · `market.report_filtered` ·
`market.run_report_failed` · `market.competitor_excluded` (als
`excludedReason` in Zeile und Lauf-Schritt) · `market.raw_swept` ·
`market.raw_sweep_failed` · `market.rating`. Alle tragen Zahlen, keinen Inhalt.

**`market.rating` liegt in `brand_events`, NICHT in einer neuen Tabelle.**
§2.10 liess beides zu; den Ausschlag gab die Migration: `brand_events.type` ist
ein varchar, kein Enum (brand-007 begründet das ausdrücklich) — die neue
Ereignis-Art kostet also keine Prod-Migration, und Aufbewahrung (24 Monate) und
Löschkaskade gelten ohne Zutun. Damit `brand` dafür kein Produkt kennen muss
(A14), gibt es `recordBrandProductEvent`: es kennt die FORM `<produkt>.<name>`,
nicht den Namen `market`. Die geschlossene Aufzählung `BrandEventType` bleibt
geschlossen — sie zu einem Template-Literal zu öffnen hätte sie für alle
eigenen Ereignisse wertlos gemacht.

Zwei Dinge daran sind Vertrag: der Satz (≤ 200 Zeichen) wird mit demselben
`filterMarketPii` gefiltert, der vor jedem Modell-Aufruf läuft — er ist die eng
gefasste Ausnahme von „`payload` trägt nie Inhaltstext", dieselbe Sorte wie
`step.restarted`. Und „genau einmal je Branding" hält eine DETERMINISTISCHE
Zeilen-Id (`mkr-<profileId>`, 409 ⇒ `counted: false`), nicht der
`localStorage`-Marker der Seite: der lässt den Block nur sofort verschwinden.

### Kunden-Text

Ein kurzes „Was der Vergleich tut und was nicht" (fünf Zeilen: zeigt Aussagen
mit Beleg · misst keinen Erfolg · formuliert keinen Werbesatz mit fremdem Namen
· eigene Marke nur mit Opt-in · Rohtext 24 h, Profile fallen mit dem Branding)
steht **zugeklappt auf der Seite „Markt"** mit einem Verweis auf `/market-bot`.

Er liegt dort und nicht in einer Hilfe-Site, weil branding.supply keine hat:
`apps/help` ist die Kunden-Hilfe der Pukalani-Communities, ein anderes Produkt
mit anderer Zielgruppe. Bekommt branding.supply eine eigene Hilfe- oder
FAQ-Fläche, zieht dieser Text dorthin (und die Seite verlinkt ihn, statt ihn zu
tragen).

### Beweise

- Unit (`pnpm --filter @pukalani/market test`, **201**): die Frist-Regel mit
  Gegenprobe an jedem der vier Fälle (inkl. „Rohtext ohne Stempel ist fällig"
  und „eine Millisekunde vor Ablauf steht die Zeile noch"), der
  Vertraulichkeits-Nachweis gegen die Snapshot-FORM.
- Unit brand (`pnpm --filter @pukalani/brand test`, **1797**):
  `tests/brandSharing.test.ts` — die vier internen Sessions mit Gegenprobe,
  fail-closed bei unbekanntem und abgeschaltetem Slot.
- End-to-end: `packages/market/scripts/verify-market-retention.mjs` —
  Vorbedingungen wie bei `verify-market-ui.mjs`, plus ein zweiter Lauf mit
  `BOT_ONLY=1` gegen einen Server im COMMITTETEN Zustand (Gate aus): nur so
  lässt sich zeigen, dass die Erklärseite nicht am Produkt-Gate hängt.

**Gelernt (drei Dinge):**
1. **Eine Zusage, die nur im Typ steht, ist keine.** `sensitivity` trug seit
   BF1 den Satz „reist nicht per Share-Link" und wurde beim Veröffentlichen
   nie gelesen — vier interne Sessions gingen dreissig Tage lang an jeden mit
   dem Token. Gefunden hat das nicht ein brand-Audit, sondern der Versuch,
   einen SATZ AUS EINEM ANDEREN PLAN zu beweisen („vertraulich wie
   `a.competitors`"). Ein Beweis, der einen fremden Massstab benutzt, prüft
   auch den Massstab.
2. **Eine geschlossene Aufzählung öffnet man nicht, man stellt eine zweite Tür
   daneben.** `BrandEventType` um `` `${string}.${string}` `` zu erweitern
   hätte den Tippfehler-Schutz für ALLE brand-Ereignisse mit entfernt — bei
   einer Spalte, die ein varchar ist, wäre danach nichts mehr übrig, das den
   Namen prüft.
3. **Ein Sweep braucht die umgekehrte Fail-Richtung, wenn die Daten nicht uns
   gehören.** Alle anderen Sweeps dieses Repos löschen im Zweifel NICHT. Hier
   wäre das die teure Richtung: was stehen bleibt, ist fremder Seitentext ohne
   Ablaufdatum.

---

## Anhang G — Bibliothek und Namensnennung (M6, Stand 2026-09-05)

Gebaut in Paket **M6 „Bibliothek"**: das WERKZEUG und die VORLAGE. Der INHALT
(echte Marken) wartet auf zwei Dinge, die nicht im Code liegen — Davids Ja für
bezahlte Läufe und die Handprüfung. **Keine neue Migration, kein neuer
Modell-Aufruf in diesem Paket.**

> ### Stand 2026-09-06 (M6b): die ersten zwei Einträge sind LIVE, die
> ### Anwalts-Fragen sind OFFEN
>
> Der bezahlte Lauf ist gelaufen (≈ $0,11, fünf Entwürfe). David hat am
> 2026-09-06 zwei davon von Hand geprüft und beglaubigt — **`the-barn`** (alle
> neun belegten Felder) und **`apple`** (fünf; `purpose` gestrichen) —, und
> beide stehen seither in `shared/library/index.ts` (Fassung `lib-3`).
> `nike`, `anthropic`, `meta` bleiben Entwürfe.
>
> **Zugleich sind die zwei ERFUNDENEN Einträge aus dem Produkt heraus.** Sie
> waren als Platzhalter richtig, solange die Mechanik ohne Inhalt lief; mit dem
> Gate-Flip standen sie im Quellen-Wähler zahlender Kunden — zwei Marken, die
> es nicht gibt, mit einem Prüfsiegel, das niemand geleistet hat. Sie leben als
> Testvorlage weiter (`tests/fixtures/marketLibraryFixture.ts`), und die alte
> Test-Sperre („AUSSCHLIESSLICH erfundene Marken") ist UMGEDREHT: geprüft wird
> jetzt auf echten Host, Prüfdatum nicht in der Zukunft, Beleg vom Auftritt der
> Marke selbst — je Regel mit Gegenprobe.
>
> **Die Fragen unten an den Anwalt sind zum Stand dieser Zeile UNBEANTWORTET.**
> Die Übernahme geschah auf **Davids Entscheidung vom 2026-09-06** — bewusst
> und festgehalten, nicht umgangen. Was das Produkt zeigt, bleibt das Minimum
> aus (a): Wortname und Kategorie, keine Logos, keine Bildmarken, keine
> Favicons (im Beweis `verify-market-report.mjs` jetzt als ERLAUBNISLISTE der
> Felder gesichert, nicht als Sperrliste). Fällt die anwaltliche Antwort
> anders aus, ist die Rücknahme ein Diff: Runbook Abschnitt 6.

### Wo was liegt

| Baustein | Ort |
| --- | --- |
| Werkzeug (4 Modi) | `packages/market/scripts/market-library-compute.mjs` |
| Kandidatenliste | `packages/market/shared/library/candidates.json` |
| Machbarkeits-Bericht | `packages/market/shared/library/feasibility.2026-09-05.json` |
| Entwürfe (nicht im Repo) | `packages/market/shared/library/drafts/` (`.gitignore`) |
| Zustandsfeld + Entwurfs-Schema | `packages/market/shared/marketLibrary.ts` |
| Handprüfungs-Ablauf | `docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md` |

### Das Werkzeug — vier Modi, ein Tor

`--check` (Trockenlauf, kostenlos) · `--compute --stub` (Rechnen gegen die
Demo-Websites) · `--compute` (echter Lauf, verlangt
`MARKET_LIBRARY_ALLOW_PAID=1` und druckt vorher die Kostenschätzung) ·
`--promote <schlüssel>` (Übernahme eines geprüften Entwurfs).

**Es benutzt den KUNDENWEG, nicht eine eigene Pipeline.** Das Werkzeug legt ein
Wegwerf-Konto und ein Wegwerf-Branding an, trägt die Marken als Kandidaten ein
und ruft `POST /api/market/profiles/:id/run` — dieselbe Kette mit robots, TDM,
Sperrliste, PII-Filter, Beleg-Riegel und Drossel, die auch ein Kunde durchläuft.
Eine Betreiber-Route `/api/market/ops/library-compute` wäre eine dauerhafte
Produktionsfläche für einen Handgriff, den es eine Handvoll Mal gibt (der
Sweep-Knopf aus M5 hat seinen Platz, weil ihn der BETRIEB braucht, nicht die
Redaktion). Die REGELN importiert das Skript aus dem Produkt selbst
(`marketRobots.ts`, `marketCrawlRules.ts`, `brandSiteCrawlParse.ts`) — Node 22
entfernt die Typen beim Laden, die drei Module sind pur und importfrei. Eine
JS-Kopie des robots-Parsers wäre eine zweite Wahrheit über die Frage, ob wir
einen fremden Server anfassen dürfen.

**Das Tor ist ein Zustand, keine Zusage.** `marketLibraryEntrySchema` verlangt
seit M6 `status: 'verified'`; das Werkzeug schreibt `status: 'draft'`,
`verifiedAt: null`, `verifiedBy: null`. Ein Entwurf fällt damit durch das
Bibliotheks-Schema — auch dann, wenn jemand Datum und Zeichen nachträgt und den
Zustand vergisst. Vorher hingen `verifiedAt`/`verifiedBy` an der Disziplin: ein
Werkzeug, das sie mit dem heutigen Datum und seinem eigenen Namen füllt, hätte
das Schema bestanden.

### Der Trockenlauf (2026-09-05, 10 Marken)

Höchstens **drei Anfragen je Host** — `robots.txt`, `/.well-known/tdmrep.json`,
Startseite —, keine Unterseite, kein gespeicherter Seiteninhalt. `sitemap.xml`
kommt gratis aus der `Sitemap:`-Zeile der robots.txt; **`llms.txt` bleibt
ungeprüft**, weil das Budget den rechtlichen Fragen gehört und „was gäbe es zu
holen?" erst dran ist, wenn „dürfen wir?" mit ja beantwortet ist.

| Marke | robots (unser Agent) | TDM | sitemap | Urteil |
| --- | --- | --- | --- | --- |
| adidas | Bot-Abwehr (403 auf `robots.txt`) | ungeprüft | ungeprüft | **bot-abwehr** |
| Nike | erlaubt | kein Vorbehalt | 5× in robots.txt | erlaubt |
| Anthropic | erlaubt | kein Vorbehalt | 1× in robots.txt | erlaubt |
| OpenAI | erlaubt | kein Vorbehalt | 1× in robots.txt | erlaubt |
| Meta (`www.meta.com`) | erlaubt | kein Vorbehalt | 5× in robots.txt | erlaubt |
| Apple | erlaubt | kein Vorbehalt | 5× in robots.txt | erlaubt |
| The Barn (DE) | erlaubt | kein Vorbehalt | 1× in robots.txt | erlaubt |
| Counter Culture Coffee (US) | erlaubt | kein Vorbehalt | nicht in robots.txt | erlaubt |
| sevDesk (DE) | erlaubt | kein Vorbehalt | 1× in robots.txt | erlaubt |
| FreshBooks (US) | erlaubt | kein Vorbehalt | 1× in robots.txt | erlaubt |

**Neun von zehn sind auswertbar — die Erwartung „die Grossen sperren" hat sich
NICHT bestätigt.** Was sich stattdessen zeigte: gesperrt wird nicht per Regel,
sondern per Bot-Abwehr. `www.adidas.com` antwortet unserem Absender schon auf
die `robots.txt` mit 403; das Werkzeug behandelt das fail-closed als Nein und
stellt nach der ERSTEN Anfrage ein. Zweiter Befund: `about.meta.com` leitet auf
`www.meta.com` um — dort gilt eine andere `robots.txt`, deshalb meldet das
Werkzeug `erlaubt (Ursprung prüfen)` und die Kandidatenliste wurde auf den
Zielhost korrigiert und erneut geprüft.

### Der Stub-Lauf (Beweis, 2026-09-05)

Vier Demo-Websites des Playgrounds, `MARKET_DEV_STUB=1`, Dev-Server aus dem
Worktree auf 3016. Ergebnis: **zwei Entwürfe mit je neun belegten Feldern**
(`demo-upcountry-roast`, `demo-pacificbean`), **zwei Kandidaten ohne Entwurf**
(`demo-island-grind` ⇒ `excluded/tdm`, `demo-kona-trading` ⇒ `excluded/robots`).
Das zehnte Feld (`distinctiveAsset`) fehlt in beiden Entwürfen — es ist das
Feld, dem der Stub absichtlich ein erfundenes Zitat gibt, und der Beleg-Riegel
verwirft es. Der Beweis zeigt damit beides: dass das Werkzeug gültige Entwürfe
erzeugt UND dass es ausgeschlossene Kandidaten ohne Eintrag lässt.

### Kostenschätzung für den echten Lauf

Modell `anthropic/claude-haiku-4.5` (der Default der Extraktion), Preise Stand
2026-09-05: $1/M ein, $5/M aus. Je Marke ein eigener Lauf, also greift der
Lauf-Deckel je Marke: 60 000 Zeichen ≈ 15 000 Token plus ~1 500 Token Prompt,
Antwort ~1 200 Token ⇒ **~$0,023 je Marke**, für neun auswertbare Marken
**~$0,21**. Ohne KI-Aussensicht (§7.5, Default leer); sie käme mit 2–3 weiteren
Aufrufen je Marke dazu. Die Zahl steht als Konstante im Skript, damit sie
nachrechenbar ist — sie ist keine Zusage des Anbieters.

---

### Rechts-Check der Namensnennung — Stand, Laien-Einschätzung, Anwaltsfragen

**Das ist KEINE Rechtsberatung.** Was hier steht, ist der Stand des Produkts,
eine ausdrücklich als LAIENEINSCHÄTZUNG gekennzeichnete Risikoeinordnung und je
Punkt die Frage, die ein Anwalt beantworten soll. Quellen aus Anhang A.

#### (a) Fremde Markennamen in einem bezahlten Produkt

*Stand:* Die Bibliothek nennt **Wortnamen** (`adidas`, `Nike`) als Bezeichnung
für die Marke, über die etwas gesagt wird. **Keine Logos, keine Bildmarken,
keine Favicons** — geprüft: der market-Layer lädt in `app/**` kein einziges
Bild einer fremden Marke (Grep über `<img`, `NuxtImg`, `favicon`, `logo`,
Favicon-Dienste: null Treffer). Kein Herkunftsbezug: die Oberfläche sagt nie,
eine fremde Marke stehe mit uns in Verbindung.

*Laien-Einschätzung (kein Anwalt):* niedriges Risiko. Referenzierende
Benutzung eines fremden Zeichens ist nach § 23 Abs. 1 Nr. 2/3 MarkenG bzw.
Art. 14 UMV zulässig, soweit sie zur Bezeichnung erforderlich ist und den
anständigen Gepflogenheiten entspricht — genau das ist eine Aussage der Form
„diese Marke sagt auf ihrer Website X".

*Frage an den Anwalt:* Bleibt die referenzierende Benutzung zulässig, wenn die
Namen (1) in einem KOSTENPFLICHTIGEN Produkt erscheinen und (2) im MARKETING
dieses Produkts als Beispiel-Paare genannt würden? Siehe auch (d).

#### (b) Zitate ≤ 200 Zeichen mit Quelle

*Stand:* Je Feld ein wörtliches Zitat, hart auf `MARKET_EVIDENCE_MAX = 200`
Zeichen begrenzt, immer mit Quell-Adresse und Abruf- bzw. Prüfdatum, immer als
BELEG neben einer Aussage — nie als eigenständiger Inhalt und nie als Volltext.
`MkEvidence.vue` zeigt das Zitat ausschliesslich zusammen mit dem Link auf die
Originalseite.

*Laien-Einschätzung (kein Anwalt):* niedriges Risiko. § 51 UrhG verlangt einen
Zitatzweck (Beleg, Auseinandersetzung), nicht Schmuck — die UI ist genau so
gebaut: das Zitat begründet einen Eintrag im Marktprofil.

*Frage an den Anwalt:* Trägt der Zitatzweck auch dann, wenn dieselbe Seite
zehn Zitate DERSELBEN Quelle zeigt (ein Marktprofil hat zehn Felder)? Und
genügt der Link als Quellenangabe nach § 63 UrhG?

#### (c) TDM-Vorbehalt (§ 44b UrhG)

*Stand:* Vier maschinenlesbare Formen werden erkannt und respektiert
(`TDM-Reservation`-Kopfzeile, `/.well-known/tdmrep.json`, `noai`/`noimageai`/
`notrain`/`noml` in robots-Metas, `<meta name="tdm-reservation">`), dazu
robots.txt für unseren eigenen Absender. **Fail-closed:** eine vorhandene, aber
unlesbare `tdmrep.json` gilt als Vorbehalt, ein 401/403 auf die `robots.txt`
gilt als Nein. Ein Vorbehalt auf IRGENDEINER gelesenen Seite schliesst den
ganzen Wettbewerber aus. Rohtext lebt 24 Stunden.

*Laien-Einschätzung (kein Anwalt):* mittleres Risiko, weil die Rechtslage offen
ist. OLG Hamburg 5 U 104/24 (LAION) verlangt ein automatisiert interpretierbares
Signal; die Revision liegt beim BGH (I ZR 281/25, Verhandlung war für den
2026-09-03 terminiert, Ausgang zum Berichtsstand offen). Unsere Regel ist
strenger als das Urteil verlangt.

*Frage an den Anwalt:* Ist der BGH inzwischen entschieden — und wenn ja, ändert
sich etwas für einen Vorbehalt in NATÜRLICHER Sprache (AGB/Impressum), den wir
heute NICHT auswerten? Zweitens: Greift § 44b überhaupt, wenn wir gar kein
Modell trainieren, sondern nur einmalig auswerten und zitieren?

#### (d) § 6 UWG — vergleichende Werbung

*Stand im PRODUKT:* Wir vergleichen nicht uns mit ihnen. Der Kunde sieht
Aussagen Dritter neben seinen eigenen; es gibt kein Ranking, keinen Score je
Wettbewerber und keine Wertung. Der Herabsetzungs-Filter (M3) und der
Namens-/Domain-Filter über jeden Vorschlag verhindern, dass ein Satz, den WIR
formulieren, einen Dritten nennt oder erkennbar macht.

*Stand im MARKETING:* Der Prototyp nannte „adidas vs. Nike" als Beispiel-Paar.
**Geprüft: heute steht kein realer Markenname in einem Kunden-Text des
market-Layers** — nicht in `MkPaywall.vue`, nicht in `market.paywall.*`, nicht
im Quellen-Wähler (`market.source.libraryHint` sagt „Bibliothek", nicht
„adidas"). Reale Namen stehen ausschliesslich in `candidates.json` (einer
Redaktions-Datei, die keine Oberfläche liest) und in Code-Kommentaren.

*Laien-Einschätzung (kein Anwalt):* im Produkt niedrig, im Marketing spürbar
höher. Ein Werbetext, der fremde Marken als Aufhänger nennt, ist Werbung MIT
fremden Namen und nicht mehr nur Beleg.

***Empfehlung, die daraus folgt:*** **im Marketing nur Kategorien nennen**
(„zwei Sportartikel-Marken", „zwei KI-Labore"), Namen erst im Produkt nach der
Freischaltung. Diese Regel gilt ab sofort für jeden Schranken-, Landing- und
Katalog-Text.

*Frage an den Anwalt:* Wäre die Nennung realer Marken im Marketing („Beispiel:
adidas gegen Nike") als vergleichende Werbung nach § 6 UWG einzuordnen, obwohl
wir mit keiner der beiden im Wettbewerb stehen — und ändert das etwas an der
Zulässigkeit?

#### (e) DSGVO

*Stand:* Gelesen werden Firmen-Websites, nicht Personen-Websites (Regel in
`candidates.json`). Team-, Impressum-, Kontakt- und Presseseiten werden gar
nicht erst abgerufen (Pfad-Sperrliste), und der Text läuft vor jedem
Modell-Aufruf durch `filterMarketPii` (E-Mail, Telefon, Namensmuster nahe
„Geschäftsführer/CEO/Gründer"). Rohtext wird nach 24 Stunden gelöscht (Sweep,
M5). Die Handprüfung hat „keine PII" als eigenes Häkchen.

*Laien-Einschätzung (kein Anwalt):* niedriges Risiko. Der EDSA hat mit den
Leitlinien 3/2026 Scraping nicht verboten, wertet aber das IGNORIEREN
technischer Signale in der Interessenabwägung negativ — wir ignorieren keines.

*Frage an den Anwalt:* Reicht der PII-Filter, oder braucht ein
Bibliotheks-Eintrag (der dauerhaft und für alle Kunden sichtbar ist) eine
zusätzliche Zusage gegenüber dem Website-Betreiber — etwa eine
Widerspruchsmöglichkeit, die über „schreibt uns an" hinausgeht?

#### (f) Datenbank-Herstellerrecht (§ 87b UrhG)

*Stand:* Je Marke höchstens **8 Seiten** und 20 000 Zeichen je Seite, einmalig,
ohne systematische Wiederholung; gespeichert bleiben zehn Felder mit je einem
Zitat von höchstens 200 Zeichen. Das ist nach jedem Massstab ein unwesentlicher
Teil einer Website, und es entsteht keine Sammlung, die den Ursprung ersetzt.

*Laien-Einschätzung (kein Anwalt):* niedriges Risiko. § 87b verbietet die
Vervielfältigung wesentlicher Teile sowie die wiederholte Entnahme
unwesentlicher Teile, die einer normalen Auswertung zuwiderläuft — beides
liegt hier fern.

*Frage an den Anwalt:* Kippt die Einordnung, wenn wir denselben Kandidaten
regelmässig auffrischen (etwa vierteljährlich) und die Bibliothek dadurch zu
einer laufend gepflegten Sammlung wird?

---

### Was M6 NICHT gebaut hat

- **Keinen einzigen bezahlten Modell-Aufruf.** Der `--compute`-Modus bricht ohne
  `MARKET_LIBRARY_ALLOW_PAID=1` ab; Davids Ja steht aus.
- **Keinen echten Bibliotheks-Eintrag.** `index.ts` enthielt weiter genau die
  zwei erfundenen Testeinträge (jetzt mit `status: 'verified'`).
  *Überholt seit M6b (2026-09-06): zwei echte Einträge sind drin, die
  erfundenen draussen — siehe der Kasten oben.*
- **Keine Auffrischungs-Automatik.** Ein Eintrag altert, und die 90-Tage-Regel
  steht heute im Runbook, nicht im Code. Sobald echte Einträge liegen, gehört
  sie in einen Wächter.
  *Überholt seit 2026-09-06: die Regel ist im Code
  (`shared/marketLibraryAge.ts`, `now` immer als Parameter), das Werkzeug zeigt
  das Alter je Eintrag (`--check`, Warnung) und listet die Überfälligen mit
  Exit 1 (`--stale`), und der Quellen-Wähler nennt „Handgeprüft am …" samt
  Hinweis bei über 90 Tagen. Was weiter FEHLT, ist der Zeitplan, der `--stale`
  von selbst fährt — siehe COMPLETE.*

### Beweise

- Unit (`pnpm --filter @pukalani/market test`, **206**, vorher 201): fünf neue
  Zusagen um den Entwurf — er ist ein gültiger Entwurf (Gegenprobe), fällt durch
  das Bibliotheks-Schema, kommt auch mit nachgetragenem Datum und Zeichen nicht
  durch, wird mit `status: 'verified'` zum Eintrag (Gegenprobe), und ein
  geprüfter Eintrag ist umgekehrt kein Entwurf.
- Trockenlauf gegen zehn echte Hosts (2026-09-05), Bericht im Repo.
- `--compute --stub` gegen vier Demo-Websites: 2 Entwürfe, 2 begründete
  Ausschlüsse.
- `--promote` beidseitig: ein Entwurf wird ABGELEHNT (`status: 'draft'`), ein
  beglaubigter Entwurf wird übernommen und der Schema-Test läuft grün.
- `verify-market-report.mjs` bleibt **43/43**.

**Gelernt (zwei Dinge, beide erst beim Ausprobieren sichtbar):**

1. **Ein Werkzeug, das Quelltext schreibt, braucht einen echten
   Serialisierer.** Die erste Fassung von `--promote` setzte den Eintrag mit
   `JSON.stringify` plus Ersetzungen zusammen und hängte ihn hinter das
   Trailing-Komma des letzten Eintrags — ein **Loch im Array**. Die Bibliothek
   fiel fail-closed auf leer zurück, und zwar lautlos; sichtbar wurde es nur,
   weil `--promote` den Schema-Test SELBST laufen lässt und zurückrollt. Die
   zweite Falle stand daneben und wäre erst bei einem echten Zitat
   aufgeschlagen: `We're` hätte die Datei zerrissen. Wer fremde Zitate in
   Quelltext schreibt, maskiert sie.
2. **Die Erwartung „die Grossen sperren" war falsch — und der Befund ist
   trotzdem derselbe.** Acht von neun Konzern-Websites erlauben unserem
   Absender alles. Wer sperrt, tut es nicht mit einer Regel, sondern mit einer
   Bot-Abwehr, die schon die `robots.txt` mit 403 beantwortet. Ein Werkzeug,
   das nur `Disallow` liest, hielte das für einen Netzwerkfehler und würde es
   beim nächsten Lauf erneut versuchen.
