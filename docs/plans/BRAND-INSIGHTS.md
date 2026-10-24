# Brand Insights — Redaktionskonzept (BI1)

Status: **Prototyp I0 FREIGEGEBEN 2026-09-08** (Davids Wort: „so bauen") — Phase 4
des Workflows ist durch. Der **Bau I1+ startet trotzdem noch nicht**: er hängt an
**DB1**, an der **Anwaltsantwort** und am **Google-API-Schlüssel** (die Gates aus
§11.3 und §9.9). **I1a (Beleg-Riegel nach `core`) läuft bereits** (§9.9).
Vorgeschichte:
Redaktionskonzept ENTSCHIEDEN 2026-09-07 (Davids zwölf Antworten, §1) ·
Konzeptrunde GESCHRIEBEN 2026-09-08 (§9 die Vorschläge, §10 die acht Fragen) ·
**am 2026-09-08 beantwortet — die acht Entscheidungen stehen in §11** ·
**Prototyp-Runde 1 am 2026-09-08 entschieden (fünf weitere Zeilen in §11.2)** ·
**Prototyp am 2026-09-08 freigegeben**. Nach
[referenz/WORKFLOW.md](../referenz/WORKFLOW.md) sind damit Phase 2 (Konzeption),
Phase 3 (Prototyp) und Phase 4 (Freigabe) abgeschlossen; die Freigabe ist die
Freigabe der FORM, kein Startschuss für den Bau — was I1+ noch aufhält, sind die
drei Gates oben. **I1a bleibt die Ausnahme**, ein
Fundament-Baustein im `core`-Layer, der von Brand Insights unabhängig
richtig ist. Dieses Dokument hält fest, WAS entschieden ist und welche
Leitplanken daran hängen — es ist keine Arbeitsliste. Was von BI1 offen ist,
steht ausschliesslich in [OPEN-ITEMS.md](../OPEN-ITEMS.md) (Zeile `BI1`).

## 0. Was das hier ist

„Brand Insights" ist der redaktionelle Bereich von branding.supply. Vorgemerkt
ist er seit dem 2026-08-29 im Phase-1-Plan, Abschnitt „Journal &
Content-Intelligence" ([BRAND-WIZARD-PHASE-1.md](BRAND-WIZARD-PHASE-1.md)); dort
stehen auch die Nav-Benennung vom 2026-08-30 (**„Brand Insights"** statt
„Journal", die Galerie daneben heisst **„Discover Brands"**), YouTube als
Research-Signal, der Content Opportunity Score, die Pipeline
Discover → Analyze → Research → Brief → Draft → Review → Publish → Update, die
Informationsarchitektur `/brands/<name>` · `/rankings/` · `/topics/` · `/journal/`
und der Positionierungs-Split (branding.supply = Datenautorität, Davids eigene
Site = Experte). Der [DECISION-LOG-Eintrag vom 2026-09-07](../DECISION-LOG.md)
hat DB1 und BI1 als eigene Vorhaben notiert und BI1 an ein Redaktionskonzept
gebunden — das ist dieses Dokument.

Der Klickdummy liegt im brand-Playground und ist die Vorlage für alles, was §2
beschreibt: `packages/brand/.playground/app/pages/brand/demo/{journal,artikel,
profil,duell,anatomie,discover}.vue`.

Die drei Bausteine, auf denen BI1 aufsetzt, EXISTIEREN bereits:

| Baustein | Was er liefert | Wo |
| --- | --- | --- |
| **Brand-Check** | Brand Score 0–100 mit Band, 8 Kategorien, 3 Befunde mit Beleg; Ranking nur mit `rankingOptIn`; Branche per KI + Korrekturvorschlag-Workflow | [archiv/BRAND-CHECK.md](../archiv/BRAND-CHECK.md) · [archiv/BRAND-CHECK-SEITE.md](../archiv/BRAND-CHECK-SEITE.md) |
| **Marktvergleich** | handgeprüfte Bibliothek echter Marken, Abruf mit robots/TDM, Zitatschranke ≤ 200 Zeichen, Bot-Seite, Rechts-Check mit sechs Anwaltsfragen (Anhang G) | [archiv/BRAND-MARKTVERGLEICH.md](../archiv/BRAND-MARKTVERGLEICH.md) |
| **Discover Brands (DB1)** | die öffentlichen Profil-Seiten EIGENER Kunden-Brands — Voraussetzung, s. §6 | [OPEN-ITEMS.md](../OPEN-ITEMS.md) Zeile 10 |

---

## 1. Das Redaktionskonzept — Davids zwölf Entscheidungen (2026-09-07)

Fragenrunde vom 2026-09-07. Die Spalte „Empfehlung war" ist bewusst mitgeführt:
wo David ANDERS entschieden hat, steht der Grund für die Leitplanke daneben.
**Fünf der zwölf Antworten weichen von der Empfehlung ab** (1, 3, 4, 6, 9) — vier
davon tragen ausdrückliche Leitplanken, die Sprach-Entscheidung (3) braucht keine.

| # | Frage | Entscheidung | Empfehlung war | Leitplanke |
| --- | --- | --- | --- | --- |
| 1 | Welche Formate zum Start? | **Alle vier**: Markenprofile (Entity-Seiten), Brand-Duelle, Artikel, Rankings | **abweichend** — Profile + Duelle zuerst, Artikel/Rankings nachziehen | Das Launch-Paket (#5) ist die Mengen-Bremse: vier Formate, aber gezählte Stücke. Kein Format geht live, bevor es EINEN vollständigen, redigierten Beispiel-Beitrag hat |
| 2 | Wer produziert? | **KI entwirft, David redigiert und veröffentlicht** — nichts geht ohne sein Zeichen live | nach Empfehlung (wie die Marktvergleichs-Bibliothek) | Freigabe ist ein ZUSTAND, kein Vorsatz (§3): der Entwurf ist ohne Davids Zeichen nicht veröffentlichbar |
| 3 | Sprache | **Grundfassung je Beitrag frei wählbar (Deutsch ODER Englisch)**, am Ende ein Knopf zur Übersetzung in die jeweils andere Sprache | **abweichend** — fest Deutsch als Grundfassung | Die Grundsprache wird je Beitrag GESPEICHERT (anders als beim UGC-Muster, wo es keine gespeicherte Ausgangssprache gibt) — sonst weiss niemand, welche Fassung die redigierte ist |
| 4 | Autor | **Wir-Stimme ohne Namen** | **abweichend** — David namentlich (Positionierungs-Split, E-E-A-T) | Keine erfundenen Autoren, nie. Das Beraterteam des Wizards (George, Vera, …) ist NIE Autor. Die Autorenprofil-Verknüpfung zu Davids Site aus dem Phase-1-Plan ENTFÄLLT; verantwortlich zeichnet ein Redaktions-Impressum (§4, Anwaltsfrage 4) |
| 5 | Rhythmus | **Launch-Paket ≈ 10 Profile · 3 Duelle · 5 Artikel · 1 Ranking**, danach **zwei Stücke je Woche** | nach Empfehlung | Der Wochentakt ist eine Zusage an die Redaktion, kein Automatismus: ohne Davids Zeichen erscheint auch in einer Woche nichts |
| 6 | Quellen | Eigene Websites der Marken · eigene Daten (Brand-Check, Bibliothek, Marktvergleich) · **YouTube-Data-API als Themenradar VON ANFANG AN** · Presse (z. B. bei Rebranding) · Wikipedia | **abweichend** — YouTube erst später, keine Presse, keine Wikipedia | Vier Leitplanken, ausformuliert in §4: (a) Fremdquellen mit Quelle + Datum und als „Fremdquelle" gekennzeichnet — nie als Eigenaussage der Marke; (b) Zitatschranke ≤ 200 Zeichen mit Belegpflicht (§ 51 UrhG); (c) Wikipedia nur mit CC-BY-SA-Namensnennung, keine Volltextübernahme; (d) YouTube nur Metadaten/Kommentare über die offizielle Data API, kein Transkript-Scraping, Quellvideo eingebettet — als Teilprojekt „Themenradar" mit eigenem Gate |
| 7 | Bewertung fremder Marken | **NUR der bestehende Brand-Check-Score**, Methodik offengelegt; der Text ist Einordnung im Kritik-/Meinungs-Stil | nach Empfehlung (deckungsgleich mit Marktvergleich §7.3) | Keine zweite Skala, kein „Insights-Score". Eine Zahl je Marke, dieselbe wie im Produkt, mit Link auf die Methodik-Seite |
| 8 | Technik | **Eigene Tabellen im brand-Layer, Redaktion im Dashboard** — `UEditor`, Sprachfassungen je Beitrag, Übersetzung per Knopf nach dem UGC-Muster, Freigabe als Zustand | nach Empfehlung | Der Werkzeug-Vorrat des `UEditor` ist an `core/shared/markdown.ts` gekoppelt (CLAUDE.md) — was der Parser nicht kann, steht als roher Text im Beitrag |
| 9 | Ziel und Messung | **Alle drei gleich gewichtet**: Umwandlung (Wizard/Brand-Check), Reichweite/Suchmaschinen, Newsletter | **abweichend** — Umwandlung zuerst, Reichweite als Folge, Newsletter später | Je Format trotzdem **EIN** klarer Einstieg: Profil → Brand-Check · Duell → Vergleich · Artikel → Wizard. Der Newsletter braucht Versand, Double-Opt-in und Rechtstexte und ist ein **eigenes Teilpaket, nicht im Launch** |
| 10 | Bilder | **Nur eigene Grafiken und Farbwelt-Kacheln** | nach Empfehlung | Keine fremden Logos, keine Screenshots fremder Websites — auch nicht als Favicon oder Thumbnail (dieselbe Erlaubnisliste wie im market-Layer, Anhang G (a)) |
| 11 | Reaktionen der Marken | **Korrekturweg wie im Brand-Check** (Vorschlag → Betreiber prüft → annehmen/ablehnen mit Begründung; Profil beanspruchen und mit bestätigten Feldern ergänzen) **plus öffentliche Methodik-Seite** | nach Empfehlung | „Entfernen auf Wunsch" ist der Notausgang und wird ohne Diskussion gewährt — dokumentiert mit Datum und Grund |
| 12 | Reihenfolge | **Erst Discover Brands (DB1), dann Insights (BI1)** | nach Empfehlung | DB1 liefert die Profil-Seiten, auf denen BI1 aufsetzt (§6) |

---

## 2. Die vier Formate

Jedes Format hat EINEN Zweck, EINEN Einstieg (Entscheidung 9) und einen Aufbau,
der schon im Klickdummy steht. Die Themen-Achse ist über alle Formate dieselbe
(Entscheidung 7: eine Zahl, eine Methodik).

**Themencluster** (aus dem Dummy `journal.vue`): Rebranding · Brand Psychology ·
Brand Analysis · Brand Strategy · Brand Language · SEO & GEO · Brand Experience
(die Filterzeile führt zusätzlich Visual Identity). Sie sind zugleich die
`/topics/`-Ebene der Informationsarchitektur.

### 2.1 Markenprofil (Entity-Seite einer externen Marke)

- **Zweck:** die Datenautorität — zu einer bekannten Marke steht hier mehr
  Struktur als irgendwo sonst: Score, Zeichen, Historie, Beziehungen.
- **Aufbau (Dummy `profil.vue`, Beispiel Nike):** Hero mit Farbwelt-Kachel,
  Score-Ring + Band, Steckbrief-Zeile (Branche · Land · seit · Archetyp) ·
  **Score v2 komplett** (die acht Dimensionen Eigenständigkeit, Visuelle
  Identität, Konsistenz, Markenerlebnis, Positionierung & Klarheit, Emotionale
  Wirkung, Anpassungsfähigkeit, Handwerk) · **eigenständige Markenzeichen**
  (Symbol, Claim, Typografie, Farbe — je ein Satz mit Beleg) · **Historie**
  (Jahr + ein Satz) · **Beziehungen** (Wettbewerber mit Score) · verknüpfte
  Artikel · Einstieg in den Vergleich.
- **Datenquelle:** Brand-Check-Score der öffentlichen Website (Entscheidung 7) ·
  handgeprüfte Bibliotheks-Einträge des Marktvergleichs (Zitat + Quelle +
  Prüfdatum) · Presse/Wikipedia für Historie und Fakten, gekennzeichnet (§4).
- **Einstieg:** „Wie schlägt sich deine Marke?" → **Brand-Check**.
- **Beispiele aus dem Dummy:** Nike, IKEA, Rolex, Adidas, On, Puma.

### 2.2 Brand-Duell

- **Zweck:** der Vergleich als Statistik-Tafel — zwei Marken, Dimension für
  Dimension, mit klarem Sieger je Zeile.
- **Aufbau (Dummy `duell.vue`, Nike vs. Adidas):** Aufstellung mit zwei
  Score-Ringen und „VS", Zwischenstand („5 Dimensionen an X · 3 an Y") ·
  **acht Dimensionen als gespiegelte Balken**, Sieger je Zeile im Akzent ·
  **Zahlen & Fakten** (Gegründet · Claim · Zeichen · Agentur-Beziehung ·
  Archetyp) · redaktionelle Einordnung im Meinungs-Stil · CTA.
- **Datenquelle:** zwei Markenprofile (2.1). Die Faktenzeile ist **redaktionell
  gepflegt**, nicht abgeleitet — „Agentur-Beziehung" steht auf keiner Website
  (offene Frage §8).
- **Einstieg:** „Wie schlägt sich deine Marke im Duell?" → **Vergleich**
  (Quartett/Marktvergleich).
- **Später:** eigene Brand gegen Referenz-Brand („Vergleiche deine Brand mit
  Nike") — nicht im Launch.

### 2.3 Artikel

- **Zweck:** die Suchmaschinen- und Verständnis-Ebene: eine Frage, die
  nachweislich gestellt wird, vollständig beantwortet.
- **Aufbau (Dummy `artikel.vue`, „Warum Luxusmarken ihre Serifen aufgeben"):**
  zentrierter Kopf (Datum · Topic · Lesezeit) mit zwei CTAs · Teilen-Zeile ·
  **sticky Inhaltsverzeichnis mit Scrollspy** · Fliesstext mit Zwischen-Kapiteln
  · **ein breites Chart** aus eigenen, redaktionell erhobenen Zahlen ·
  Abschnitt „Insight aus der Knowledge Base" · Abschnitt „Erwähnte Brands"
  (Profil-Verknüpfung mit Score) · **„Quellvideo" / Further watching** (§4 d) ·
  CTA-Banner · „Mehr lesen".
- **Datenquelle:** eigene Daten zuerst (Brand-Check-Auswertungen, Bibliothek,
  Marktvergleich), Fremdquellen als Beleg mit Datum.
- **Einstieg:** „Starte dein Branding" → **Wizard**.
- **Beispiel-Themen aus dem Dummy:** „Was kostet ein Rebranding wirklich?" ·
  „Warum Banken blau sind — und wann du es nicht sein solltest" · „IKEA: Wie ein
  Möbelhaus zur Weltmarke wurde" · „Der Content-Kompass: 3–5 Säulen statt
  Posting-Panik" · „Tagline vs. Slogan" · „llms.txt: Wie KI-Assistenten deine
  Marke zitieren" · „Unboxing als Markenmoment" · „Warum gute Namen unbequem sind".

### 2.4 Ranking

- **Zweck:** die kuratierte Liste nach Branding-Qualität — der Einstiegspunkt,
  der sich am besten teilen und verlinken lässt.
- **Aufbau:** Liste der Profile mit Score-Ring, Band und einem Satz Begründung;
  Filter nach Topic/Branche, Sortierung wie im Dummy (`journal.vue`:
  Neueste · Meistgelesen · Kürzeste Lesezeit; `discover.vue`: Brand Score · Am
  besten bewertet · Trending · Neueste); Grid/Liste über `?display=` (teilbare
  Ansicht); über der Liste die **Methodik-Zeile** mit Link (Entscheidung 7/11).
- **Datenquelle:** ausschliesslich Brand-Check-Scores der aufgeführten Profile.
- **Einstieg:** „Deine Marke in dieser Liste?" → **Brand-Check**.
- **Abgrenzung:** das Kunden-Ranking des Brand-Checks (mit `rankingOptIn`) und
  das redaktionelle Ranking sind ZWEI Listen — Kundendaten wandern nie ohne
  Opt-in in eine redaktionelle Liste.

---

## 3. Der Redaktionsprozess

### 3.1 Pipeline und Rollen

Die acht Stufen aus dem Phase-1-Plan, mit der Rollenaufteilung aus
Entscheidung 2 (**KI entwirft, David redigiert und veröffentlicht**):

| Stufe | Wer | Was dabei entsteht |
| --- | --- | --- |
| **Discover** | Themenradar (§3.3) + Redaktion | Kandidaten-Themen mit Content Opportunity Score |
| **Analyze** | KI | Was gibt es dazu schon, wo ist die Lücke, welches Format passt |
| **Research** | KI + Redaktion | Quellenliste mit Datum, Zitate ≤ 200 Zeichen, eigene Daten |
| **Brief** | Redaktion | Kernaussage, Gliederung, Einstieg/CTA — Davids Zeichen ist hier optional, aber üblich |
| **Draft** | KI | Entwurf in der gewählten Grundsprache (Entscheidung 3) |
| **Review** | **David** | redigiert im Dashboard, prüft jeden Beleg — das ist das Zeichen |
| **Publish** | **David** | Zustand `freigegeben`; erst danach ist der Beitrag öffentlich |
| **Update** | Redaktion | Score neu ermittelt, Fakten geändert, Korrekturvorschlag angenommen ⇒ Zustand `aktualisieren` |

### 3.2 Freigabe-Zustände

`entwurf` → `redaktion` → `freigegeben` → `übersetzt` → (`aktualisieren` →
`redaktion` → …). **Der Zustand ist die Sicherung, nicht die Disziplin**: die
öffentliche Route liest ausschliesslich `freigegeben`/`übersetzt` (dieselbe
Lehre wie das `status: 'verified'`-Tor der Marktvergleichs-Bibliothek, Anhang G).
`übersetzt` heisst: die zweite Sprachfassung liegt vor und ist redigiert — eine
maschinell erzeugte, unredigierte Fassung ist NIE öffentlich.

> **Nachtrag 2026-09-08 (§9.3):** die Konzeptrunde schlägt vor, `übersetzt` aus
> der Kette zu NEHMEN und zur Eigenschaft der zweiten Fassung zu machen. Grund:
> ein Beitrag kann auf Deutsch freigegeben sein, während die englische Fassung
> noch redigiert wird — „halb veröffentlicht" kann eine lineare Kette nicht
> ausdrücken. Das Versprechen im Satz darüber bleibt dabei wörtlich erfüllt.

### 3.3 Launch-Paket und Wochentakt

**Launch-Paket (Entscheidung 5):** ≈ 10 Markenprofile · 3 Duelle · 5 Artikel ·
1 Ranking. Danach **zwei Stücke je Woche** in freier Mischung der vier Formate.
Vor dem Launch steht je Format EIN vollständig redigierter Beispiel-Beitrag
(Leitplanke zu Entscheidung 1) — die Formate gehen erst danach in Serie.

### 3.4 Teilprojekt „Themenradar" (eigenes Gate)

YouTube ist **Research-Signal, nie Quelle zum Umformulieren** (Phase-1-Plan).
Der Radar liest über die offizielle **YouTube Data API** Metadaten und
Kommentare, rechnet einen normalisierten Popularity-Score (Views relativ zur
Kanalgrösse) und daraus den **Content Opportunity Score** (0–100 aus
Performance, Alter, Suchnachfrage, Konkurrenz, Relevanz) — Ergebnis ist eine
priorisierte Themenliste für die Stufe *Discover*.

Es ist ein **eigenes Teilpaket mit eigenem Gate**: es geht erst scharf, wenn
API-Schlüssel und Kontingent stehen (§6) und die Datenschutz-Leitplanke aus
§4 (d) umgesetzt ist. BI1 ist ohne Radar lieferbar — die Themen kommen dann von
Hand.

---

## 4. Quellen- und Rechtsrahmen

Der Rahmen des Marktvergleichs gilt weiter und wird hier nur ERWEITERT, nicht
gelockert. Grundlage: [archiv/BRAND-MARKTVERGLEICH.md](../archiv/BRAND-MARKTVERGLEICH.md)
§1.7 (Produktregeln) und **Anhang G** (Rechts-Check der Namensnennung mit sechs
Anwaltsfragen — **zum Stand dieser Zeile unbeantwortet**).

### 4.1 Die vier Quellen-Leitplanken (zu Entscheidung 6)

1. **Herkunft ist immer sichtbar.** Jede Fremdquelle trägt Quelle + Datum und
   ist als **„Fremdquelle"** gekennzeichnet — nie als Eigenaussage der Marke.
   Die Bibliotheksregel „nur die eigene Website" gilt unverändert für
   Marktprofil und Bibliothek; **Insights darf darüber hinaus zitieren**, und
   genau deshalb muss die Kennzeichnung tragen.
2. **Zitatschranke wie im Marktvergleich:** ≤ 200 Zeichen je Zitat, Belegpflicht,
   Zitatzweck nach § 51 UrhG (Beleg/Auseinandersetzung, nie Schmuck), Link auf
   die Originalseite.
3. **Wikipedia** nur unter **CC BY-SA mit Namensnennung** (Artikel + Lizenzlink),
   **keine Volltextübernahme** — Fakten und Daten, keine übernommenen Absätze.
4. **YouTube** nur **Metadaten über die offizielle Data API** als Signal;
   **kein Transkript-Scraping**. Das Quellvideo wird eingebettet
   („Further watching") — Traffic für den Creator statt Content-Klau.
   API-Quoten und Datenschutz sind Teil des Gates (§3.4).
   > **Der zweite Halbsatz dieser Leitplanke ist am 2026-09-08 GEFALLEN.**
   > Er lautete: „Kommentare sind personenbezogene Daten: sie werden nur
   > **aggregiert** ausgewertet und nie mit Nutzernamen gespeichert."
   > Genau dieses Aggregieren untersagen die YouTube API Services Developer
   > Policies in **III.E.2** — die Schutzmaßnahme war selbst regelwidrig. An
   > ihre Stelle treten die vier Leitplanken aus **§9.6** (§11 Frage 6):
   > **keine Kommentar-Texte und keine Nutzernamen**, bis die Anwaltsfrage
   > BI1-2 beantwortet ist.

### 4.2 Bewertung, Bilder, Reaktionen

- **Score (7):** ausschliesslich der bestehende Brand-Check-Score, mit
  offengelegter Methodik; der Text ist Einordnung im Kritik-/Meinungs-Stil,
  nominative Markennennung, keine Herabsetzung (UWG-Massstab wie M3).
- **Bilder (10):** nur eigene Grafiken und Farbwelt-Kacheln. Keine fremden
  Logos, Bildmarken, Favicons oder Screenshots — als **Erlaubnisliste** der
  erlaubten Felder gesichert, nicht als Sperrliste (Lehre aus M6b).
- **Reaktionen (11):** Korrekturvorschlag wie im Brand-Check (Vorschlag →
  Betreiber prüft → annehmen/ablehnen mit Begründung) · „Profil beanspruchen"
  mit bestätigten Feldern · **Entfernen auf Wunsch als Notausgang**, mit Datum
  und Grund dokumentiert.
- **Methodik-Seite:** **GEBAUT und live seit 2026-09-07** — vorgezogen als
  Paket **BS1 R2a**, weil auch der Datenschutz-Abschnitt §4c des Faktenblatts
  zweimal auf sie verweist. Sie steht unter **`/brand-check/methodik`**
  (`packages/brand/app/pages/brand-check/methodik.vue`), de + en, öffentlich,
  ohne Konto und ohne Produkt-Gate, verlinkt als vierter Reiter des
  Brand-Checks (damit von jeder Ergebnisseite) und im Lesefluss von Startseite,
  Ranking und Ergebnis. Sie erklärt die 40 Kriterien in 8 Kategorien, die
  Bänder, „nicht bewertbar", den Korrektur- und den Entfernungsweg — und ist
  damit die Antwort auf „warum dürft ihr das". **BI1 legt hier nichts Neues an,
  sondern ergänzt:** sobald ein Insights-Beitrag einen Score zeigt, verlinkt er
  dieselbe Seite. Details und die zwei Befunde daraus:
  [BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md)
  §7.4.

### 4.3 Neue Fragen an den Anwalt (zusätzlich zu Anhang G (a)–(f))

Die sechs Fragen aus Anhang G bleiben offen und gelten hier unverändert
(fremde Markennamen im bezahlten Produkt und im Marketing · Zitate ≤ 200 Zeichen ·
TDM-Vorbehalt § 44b UrhG · § 6 UWG · DSGVO/PII · Datenbank-Herstellerrecht
§ 87b UrhG). **Vier kommen durch BI1 hinzu:**

1. **Presse- und Wikipedia-Zitate.** Trägt der Zitatzweck (§ 51 UrhG) auch in
   einem redaktionellen Beitrag eines GEWERBLICHEN Anbieters, der am Ende auf
   das eigene kostenpflichtige Produkt führt? Und bei Wikipedia: genügen
   Namensnennung + Lizenzlink, oder färbt **CC BY-SA (Share-alike)** auf unseren
   Beitrag ab, sobald wir mehr als Fakten übernehmen?
2. **YouTube-Kommentare.** Ist die aggregierte Auswertung von Kommentaren über
   die Data API als Marktforschung zulässig (Art. 6 Abs. 1 lit. f DSGVO), wenn
   Nutzernamen nie gespeichert werden — und was verlangen die
   **YouTube-API-Nutzungsbedingungen** dazu (Speicherfristen, Verbot abgeleiteter
   Datensätze)? Zusatz: reicht die reguläre Einbettung des Quellvideos, oder
   braucht es eine Zwei-Klick-Lösung?
3. **Kritik/Meinung bei einem Score fremder Marken.** Darf ein Score 0–100 einer
   fremden Marke, erhoben und veröffentlicht OHNE deren Zustimmung, in einem
   gewerblichen Angebot stehen — Meinungsfreiheit (Art. 5 GG) gegen
   Unternehmenspersönlichkeitsrecht und § 824 BGB? Genügt die offengelegte
   Methodik plus Korrekturweg, oder braucht es eine Anhörung vor der
   Veröffentlichung?
4. **Wir-Stimme ohne verantwortlichen Autor.** Ein journalistisch-redaktionelles
   Angebot braucht nach § 18 Abs. 2 MStV einen Verantwortlichen mit Namen und
   Anschrift. Genügt ein **Redaktions-Impressum** („Verantwortlich i. S. d. § 18
   Abs. 2 MStV: …"), wenn unter den Beiträgen selbst nur die namenlose
   Wir-Stimme steht (Entscheidung 4)?

---

## 5. Datenmodell und Technik (Skizze — keine Migration)

Entscheidung 8: **eigene Tabellen im brand-Layer, Redaktion im Dashboard.** Das
Folgende ist eine SKIZZE für die Konzeptrunde, keine Schema-Zusage; ob BI1 im
brand-Layer oder in einem eigenen Layer wohnt, ist offen (§8).

> **Seit dem 2026-09-08 gilt hier §9.3.** Die Skizze bleibt als Ausgangspunkt
> stehen; **gebaut wird nach §9.3** (Spalten mit Typ und Größe, Indizes,
> Retention, Kaskaden) und nach §9.1 (Ort im Code). Wer aus diesem Abschnitt
> eine Migration ableitet, baut die verworfene Fassung.

### 5.1 `insights_posts` — der Beitrag

Server-only, Permissions `[]` wie alle brand-Tabellen. Ein Beitrag JEDES Formats
ist EINE Zeile — vier Formate mit einem Zustandsmodell statt vier Tabellen.

| Feld | Zweck |
| --- | --- |
| `format` | `profile` · `duel` · `article` · `ranking` |
| `slug`, `topics` | Adresse und Themencluster (`/topics/`) |
| `baseLocale` | **`de` oder `en`** — die redigierte Grundfassung (Entscheidung 3) |
| `titleDe/En`, `dekDe/En`, `bodyDe/En` | Sprachfassungen; Body als **MEDIUMTEXT** (`createMediumtextColumn` — das MariaDB-Zeilenbudget trägt keinen langen Artikel) |
| `state` | `entwurf` · `redaktion` · `freigegeben` · `übersetzt` · `aktualisieren` (§3.2) |
| `sources` | Quellenliste als JSON: `{url, publisher, date, kind: 'brand-site'\|'press'\|'wikipedia'\|'youtube'\|'own-data', quote ≤ 200}` |
| `brandRefs` | Marken-Bezug als JSON: Bibliotheks-Schlüssel und/oder `brand_checks.$id` je genannter Marke |
| `publishedAt`, `updatedAt`, `reviewedBy` | wer wann freigegeben hat |

**`insights_sources` als eigene Tabelle?** In Phase 1 **nein**: solange keine
Quelle über Beiträge hinweg gesucht oder gezählt wird, ist die JSON-Spalte die
billigere Wahrheit (kein Index, keine zweite Migration). Sie wird nötig, sobald
eine Quelle EIGENE Fristen bekommt (Auffrischung wie die 90-Tage-Regel der
Bibliothek) — das ist die Kippfrage, nicht der Geschmack.

### 5.2 Verknüpfungen

- **`brand_checks`** liefert Score, Band und die acht Kategoriewerte je genannter
  Marke (Entscheidung 7). Offen: wer den Check einer fremden Marke ANSTÖSST und
  auf wessen Deckel (§8).
- **Marktvergleichs-Bibliothek** (`packages/market/shared/library/index.ts`,
  Einträge mit `status: 'verified'`, Prüfdatum, Beleg) ist die Faktenquelle für
  Markenprofile — handgeprüft, nicht neu erhoben.
- **Discover-Profile (DB1)** für eigene Kunden-Brands: verlinkt, nie kopiert;
  ein Kunden-Profil erscheint in Insights nur mit demselben Opt-in wie im
  Ranking.

### 5.3 Redaktion im Dashboard

`UEditor` mit den Regeln aus CLAUDE.md (Werkzeug-Vorrat an
`core/shared/markdown.ts` gekoppelt, `gfm: false` beim Lesen, `bodyToSave`) ·
zwei Sprach-Reiter · Zustands-Umschalter mit Begründungsfeld · **Übersetzen-Knopf**
nach dem UGC-Muster (Cache-Treffer VOR jeder Drossel; Ergebnis landet als
Entwurf der zweiten Fassung, nie direkt öffentlich) · Vorschau-Link auf die
öffentliche Seite im Zustand `redaktion`.

### 5.4 Messung

Server-Ereignisse im bestehenden `brand_events`-Muster (`insights.view`,
`insights.cta_click` mit Format, `insights.share`, `insights.correction_submitted`),
dazu **Plausible-Ziele je Format** entlang der drei gleichgewichteten Ziele
(Entscheidung 9): Profil → Brand-Check gestartet · Duell → Vergleich geöffnet ·
Artikel → Wizard gestartet · alle → Newsletter-Eintrag (sobald das Teilpaket
steht).

---

## 6. Abhängigkeiten und Reihenfolge

1. **DB1 „Discover Brands" zuerst** (Entscheidung 12) — DB1 baut die
   öffentlichen Profil-Seiten und den Rechtsrahmen für öffentliche Marken-Daten;
   BI1 setzt beides fort.
2. **Anwalt** — die sechs Fragen aus Anhang G plus die vier neuen aus §4.3.
   Ohne Antwort auf Frage 3 (Score fremder Marken) und 4 (Verantwortlicher)
   geht kein Markenprofil live.
3. **YouTube-API-Zugang** — Projekt, Schlüssel, Kontingent. Gate des Teilprojekts
   „Themenradar" (§3.4); BI1 ist ohne den Radar lieferbar.
4. **Newsletter-Teilpaket** — Versand, Double-Opt-in, Rechtstexte. Eigenes Paket,
   **nicht im Launch** (Leitplanke zu Entscheidung 9); das Muster liegt in der
   Warteliste von branding.supply (brand-012/brand-015).
5. **Rechtstexte branding.supply** — Impressum/Datenschutz stehen dort noch aus
   (OPEN-ITEMS-Strang A1). Ein Redaktions-Impressum (§4.3 Frage 4) hängt daran.
6. **Bau-Gates wie bei jedem neuen Vorhaben:** `check:bilanz`, Schema-Parität,
   Manifest-Check, GDPR-Contributor bei neuen Tabellen; Prod-Migrationen nur mit
   Davids ausdrücklichem Ja.

---

## 7. Nicht-Ziele

Kein zweiter Score neben dem Brand-Check · keine automatische Veröffentlichung
ohne Davids Zeichen · kein Transkript-Scraping und keine Volltext-Übernahme aus
Presse oder Wikipedia · keine fremden Logos, Bildmarken, Favicons oder
Screenshots · keine erfundenen Autoren und kein Beraterteam als Autor · keine
Gastautoren · **kein Newsletter im Launch** · keine Kommentare oder
Community-Funktionen unter den Beiträgen · keine Leser-Auto-Übersetzung (Knopf
statt Automatik, wie beim UGC-Muster) · keine Bewertungsplattform- oder
Social-Quellen (Plattform-AGB, PII — wie im Marktvergleich) · kein CMS-Produkt
für Kunden (die Redaktion ist unsere, nicht ihre).

---

## 8. Offene Fragen für die Konzeptrunde

Die Runde findet nach DB1 statt (Entscheidung 12); dies sind die Fragen, die
sie beantworten muss. **Sie hat am 2026-09-08 stattgefunden** — dieser Abschnitt
bleibt als PROTOKOLL der Fragestellung stehen und wird nicht umgeschrieben; jede
Frage trägt jetzt den Zeiger auf ihren Vorschlag in §9, die davon übrigen
Entscheidungen liegen in §10.

1. **Wo wohnt BI1?** Eigener Layer `insights` (Silo-Regel „neues Produkt ⇒
   eigener Layer") oder Tabellen im brand-Layer wie in Entscheidung 8 skizziert
   — Brand Design hat 2026-09-07 den Gegen-Präzedenzfall gesetzt (Schicht 2
   derselben Werkstatt statt eigener Layer). → **Vorschlag in §9.1**, Entscheidung
   in §10 Frage 1.
2. **Adressen.** Die Informationsarchitektur nennt `/brands/<name>` ·
   `/rankings/` · `/topics/` · `/journal/`, die Navigation heisst „Brand
   Insights" — welche URL-Basis gilt, und wie trägt sie das i18n-Präfix
   (Muster: Slug oder Id)? → **Vorschlag in §9.2**, Entscheidung in §10 Frage 2.
3. **Profil (BI1) und Anatomie (DB1)** sind im Dummy zwei Seitenarten für
   dieselbe Frage („wie ist diese Marke gebaut?") — zwei Vorlagen oder eine mit
   zwei Datenquellen? → **Vorschlag in §9.3** (zwei Datensätze, eine Vorlage),
   Entscheidung in §10 Frage 2.
4. **Wer stösst den Brand-Check einer fremden Marke an**, auf wessen Deckel
   (Kosten, 7-Tage-Cache, Konto-Deckel 10/Tag) — und ist dieser Score öffentlich,
   obwohl `rankingOptIn` für Kundenschecks gilt? → **Vorschlag in §9.3**: die
   Redaktion stösst ihn an, auf unseren Deckel und im Zuge des Profils; der Score
   einer FREMDEN Website ist öffentlich, `rankingOptIn` bleibt die Regel für
   KUNDEN-Checks und für jede Kunden-Marke in einer redaktionellen Liste.
5. **Duell-Fakten** („Agentur-Beziehung", „Zeichen seit …") sind nicht aus einer
   Website ableitbar: von Hand gepflegt mit Belegpflicht, oder Format ohne diese
   Zeile? → **Vorschlag in §9.3** (`facts` mit Pflicht-Beleg): von Hand mit
   Beleg — und wo keiner zu finden ist, fehlt die ZEILE, nicht das Format.
6. **Ranking-Regeln:** wie viele Marken je Liste, welcher Auffrischungs-Rhythmus,
   und was passiert mit einer veröffentlichten Liste, wenn sich ein Score ändert?
   → **Vorschlag in §10 Frage 7**: zehn Plätze, eingefroren mit sichtbarem Stand,
   Auffrischung als neue Ausgabe.
7. **Farbwelt-Kacheln:** aus der Brand-Check-Extraktion gerechnet oder von Hand
   gesetzt (Entscheidung 10 erlaubt beides)? → **Vorschlag in §9.0/§9.3**:
   gerechnet aus der Marken-Id über die zwölf kuratierten Dreiklänge (wie
   Discover), von Hand nur als Ausnahme über `paletteId` — so sieht jedes Profil
   ohne Zutun richtig aus und keins zufällig.
8. **Übersetzen-Knopf:** eigener Redaktions-Endpunkt oder der bestehende
   UGC-Übersetzungs-Weg — und welche Drossel gilt für einen Betreiber?
   → **Vorschlag in §9.4**, Entscheidung in §10 Frage 4.
9. **Notausgang „Entfernen":** gilt er auch für ein Ranking, in dem die Marke
   steht — Platz löschen, Liste neu rechnen, oder Liste einfrieren?
   → **Vorschlag in §10 Frage 7**: Platz heraus, NICHT neu rechnen, die Lücke als
   „auf Wunsch entfernt" ausweisen.
10. **Newsletter:** Anbieter, wo die Adressen liegen (Warteliste weiternutzen?),
    und ob der Eintrag je Format oder nur zentral angeboten wird.
    → **Vorschlag in §9.3a**, Entscheidung in §10 Frage 5.

---

## 9. Konzept zur Entscheidung (2026-09-08)

Die Runde aus §8 — sie war an DB1 gebunden (Entscheidung 12), und DB1 ist seit
dem 2026-09-08 mit D0–D3 live. Dieser Abschnitt macht aus den zehn Fragen von
§8 **Vorschläge mit Begründung**; die Fragen, die David entscheiden muss, stehen
gebündelt in §10. §8 bleibt als Protokoll stehen und trägt je Frage den Zeiger
auf ihren Vorschlag.

### 9.0 Was DB1 auf `main` gebaut hat — und was BI1 davon erbt

Nachgesehen am Code-Stand vom 2026-09-08 (nicht am Plan):

| Baustein auf `main` | Wo | Was BI1 davon nimmt |
| --- | --- | --- |
| Migration **brand-020** (`brand_profiles.publicationVisibility`, `brand_publications`, `brand_publication_reports`) | `brand/scripts/migrations/020-brand-publications.ts` | die **Form** einer öffentlichen Marken-Zeile: `slug` unique, `status`, `decisionNote` ≤ 300, `featuredAt`, `reportCount`, `example` — BI1 baut dieselbe Tabelle für FREMDE Marken, nicht dieselbe Zeile |
| Zustandsmaschine + Slug-Regel, pur | `brand/shared/brandPublication.ts` (`brandPublicationSlug`, `brandPublicationSlugCandidate`, `decideBrandPublication`) | die **Slug-Funktion wird geteilt** (Umlaute, Diakritika, Deckel 80, Kandidaten `name`, `name-2`, …) — der Namensraum bleibt getrennt |
| Galerie-Rechnungen, pur | `brand/shared/brandDiscover.ts` (Facetten, `sortDiscoverItems`, `pickDiscoverFeatured`, `similarDiscoverEntries`, Fenster 500 / Seite 25 / Zahlen-Lookup 100) | die **Blätter- und Sortier-Mechanik** einer öffentlichen Liste, inkl. der ehrlichen Grenze „`total` zählt das Fenster, nicht die Tabelle" |
| Öffentliche Routen + Seiten | `brand/server/api/discover/index.get.ts`, `brand/server/api/discover/[slug].get.ts`, `brand/server/api/discover/[slug]/report.post.ts`, `brand/app/pages/discover/index.vue`, `brand/app/pages/discover/[slug].vue` | die **Anatomie-Form** (sticky Steckbrief + Dossier), der 404-als-Zustand, der Teilen-Knopf mit `navigator.share`, das Melden mit Honeypot + Drossel |
| Betreiber-Warteschlange | `brand/app/pages/dashboard/discover.vue` (`requiredCapability: 'users.manage'`), die Admin-Routen unter `/api/brand/admin/publications` | die **Freigabe VOR Veröffentlichung** als Muster — BI1 braucht sie nicht (die Redaktion IST der Betreiber), wohl aber den Melde- und Entscheidungs-Weg |
| Score-Regel | `brand/shared/brandDiscover.ts` (`pickDiscoverScores`, `discoverScoreOf`) + `brand_checks.source` (`website`\|`document`) | **Entscheidung 3 von DB1 gilt für BI1 unverändert**: Website-Score gewinnt den Ring, Fundament-Reife ist die Zweitzeile. Für eine FREMDE Marke gibt es nur den Website-Score — die Zweitzeile entfällt dort, sie wird nicht erfunden |
| Farbwelt | `brand/shared/brandPalette.ts` (12 Dreiklänge, `brandGradientFor`, `brandPaletteId`, `brandPaletteName`) | Kachel, Hero und og:image jedes Insights-Beitrags |
| Richtungen/Archetypen | `brand/shared/brandDirections.ts`, `brand/shared/brandChoiceOptions.ts` (`BRAND_ARCHETYPES`) | die Archetyp-Achse der Profile und Duelle |

**Ein Befund aus dem Abgleich, der BI1 betrifft.** DISCOVER-BRANDS.md §4.2 sagt
zum Slug: „Umbenennung ⇒ neuer Slug + 301 vom alten". Im Schema steht dafür
nichts — `brand_publications` trägt `slug` (unique) und keine Historie, und im
Code gibt es keine Weiterleitung. Für DB1 ist das heute folgenlos (es gibt eine
Veröffentlichung, und ihr Titel hat sich nicht geändert); für BI1 wäre es
teuer, weil ein Markenprofil genau die Seite ist, die verlinkt wird. BI1 nimmt
die Regel deshalb **mit Schema** (`slugHistory`, s. §9.3) und trägt den
DB1-Befund nach OPEN-ITEMS, statt ihn stillschweigend zu erben.

### 9.1 Ort im Code — Empfehlung: **eigener Layer `insights`**

**Vorschlag:** ein eigener Produkt-Layer mit `product.manifest.ts`
(`key: 'insights'`, `tier: 'optional'`, `requires: ['brand']`,
`apiPrefixes: ['/api/insights']`, `hasMigrations: true`), montiert in
`apps/branding/site.manifest.ts`, und **genau ein** expliziter Vertrag zum
brand-Layer nach dem Muster `market/server/contracts/brandContract.ts`.

Begründung, in der Reihenfolge ihres Gewichts:

1. **Der Gegen-Präzedenzfall trägt hier nicht.** Brand Design ist „Schicht 2
   derselben Werkstatt" ([DECISION-LOG](../DECISION-LOG.md) 2026-09-07,
   Entscheidung 4) — und die Begründung dort war eine SEHR bestimmte: „zwei
   Zustandsmaschinen für ein Dokument wären der teurere Fehler". Brand Design
   schreibt in dasselbe Dokument, dieselbe Werkstatt, denselben Zustand wie
   das Fundament. BI1 tut das Gegenteil: eigenes Dokument (Beitrag), eigene
   Zustandsmaschine (Entwurf → Redaktion → veröffentlicht), eigenes Publikum
   (anonyme Leser statt eingeloggter Eigentümer) und eigener Gegenstand
   (FREMDE Marken, nicht die des Kunden). Es gibt kein Dokument, das sich zwei
   Layer teilen würden.
2. **Der Präzedenzfall, der trägt, ist `market`.** Derselbe Zuschnitt, dieselbe
   Abhängigkeitsrichtung, dieselbe Naht: `requires: ['brand']`, ein Vertrag in
   `server/contracts/` und nicht in `server/utils/` (Nitro AUTO-IMPORTIERT
   `server/utils` — ein Re-Export dort stünde ZWEIMAL im Auto-Import und der
   spätere Layer gewönne; der Kopf von `market/server/contracts/brandContract.ts`
   erklärt die Falle ausführlich). Was der Vertrag für BI1 führen muss: der
   Lesezugriff auf `brand_checks` (Score, Band, acht Kategorien), die Farbwelt
   (`brandGradientFor`, `brandPaletteId`, `brandPaletteName`), der
   Archetyp-Katalog, die Slug-Funktion und der SSRF-feste Abruf samt
   `robots.txt`- und TDM-Prüfung (seit BS1 R2b in `brand/shared/brandRobots.ts`
   und `brand/shared/brandTdm.ts`).
3. **Die Notabschaltung kommt geschenkt.** Mit `apiPrefixes: ['/api/insights']`
   greift die Produkt-Middleware `core/server/middleware/04.product-gate.ts`:
   `app_config.products.insights.enabled = false` ⇒ 404 für die ganze
   Redaktion, ohne dass ein Handler davon weiß. Läge BI1 unter `/api/brand`,
   schaltete dieselbe Bewegung den Wizard mit ab.
4. **Die Silo-Regel wird eingehalten, nicht überdehnt.** „Neues Produkt ⇒ immer
   eigener Layer, aber standardmäßig KEINE eigene Site" (CLAUDE.md): BI1
   bekommt den Layer und **keine** neue Site — es lebt auf branding.supply.
5. **Was es kostet, und was davon Pflicht ist.** Ein neuer Layer heißt:
   `product.manifest.ts` + Eintrag in `apps/branding/site.manifest.ts` +
   `scripts/migrate.mjs`-`LAYER_ORDER` (`pnpm check:manifests`), ein Block in
   der Produkt-Bilanz (`pnpm check:bilanz`), das BRANDING-Soll in
   `scripts/ops/verify-schema-parity.mjs` (die Soll-Listen sind GEPFLEGT, nicht
   geparst — neue Tabelle ⇒ dort eintragen), ein benannter Block in der
   ESLint-Regel `pukalani/no-cross-layer-relative` (wie `packages/market/**`)
   und ein GDPR-Contributor, sobald eine Tabelle personenbezogene Daten trägt
   (hier: die Kontakt-Adresse eines Korrekturvorschlags, §9.3). Das ist die
   volle Rechnung — sie ist bekannt und wiederholbar, weil `market` sie schon
   einmal bezahlt hat.

**Die Gegenoption** (Entscheidung 8 skizzierte sie: „eigene Tabellen im
brand-Layer") bleibt vertretbar und ist billiger — kein Manifest, kein Vertrag,
keine Bilanz-Zeile. Ihr Preis ist, dass der brand-Layer dann BEIDES trägt: die
private Werkstatt eines Kunden und eine öffentliche Redaktion über fremde
Marken. Genau die Vermischung, wegen der `market` seinerzeit ausgezogen ist.
Weil Entscheidung 8 die Technik meinte („eigene Tabellen, Redaktion im
Dashboard") und §8 Frage 1 die Layer-Frage ausdrücklich offen gelassen hat,
gehört sie David — §10 Frage 1.

### 9.2 Adressen

**Vorschlag** (fünf Basen, alle unter dem i18n-Muster
`prefix_except_default`: `en` ohne Präfix, `de` unter `/de/…`):

| Adresse | Was | Anmerkung |
| --- | --- | --- |
| `/insights` | die Journal-Liste über alle vier Formate, Filter nach Format und Thema | der Nav-Punkt „Brand Insights" zeigt hierhin. **`/journal/` entfällt** — es wäre ein zweiter Name für dieselbe Liste, und zwar der ALTE (die Umbenennung „Journal" → „Brand Insights" fiel am 2026-08-30). Eine Adresse, die eine verworfene Benennung einzementiert, ist die teuerste Sorte Altlast |
| `/insights/<slug>` | der Artikel | |
| `/brands/<slug>` | das Markenprofil einer FREMDEN Marke | **von DB1 reserviert** (DISCOVER-BRANDS.md §9 Entscheidung 2) — die Reservierung wird hier eingelöst |
| `/duels/<a>-vs-<b>` | das Duell | eigene Basis, weil ein Duell ein BEITRAG ist und keine Marke. Der Slug entsteht aus den zwei Marken-Slugs in **alphabetischer Reihenfolge**, damit `nike-vs-adidas` und `adidas-vs-nike` nicht zwei Seiten mit demselben Inhalt werden; die andere Richtung antwortet 301 |
| `/rankings` · `/rankings/<slug>` | Ranking-Übersicht und Liste | |
| `/topics/<slug>` | ein Themencluster quer über alle Formate | die acht Cluster aus §2, als kuratierter Katalog im Code (wie `BRAND_ARCHETYPES`), nicht als Tabelle — sie ändern sich seltener als ein Deploy |

**Slugs bleiben einsprachig.** Ein Beitrag hat EINEN Slug, die Sprache trägt das
i18n-Präfix — dasselbe Muster wie Kategorien und Kurse (Memory-Notiz „Adressen:
Slug oder Id"; U16 entschieden 2026-08-20: so lassen). Zwei Slugs je Zeile
hießen zwei Unique-Indizes, zwei Kollisionsprüfungen und bei jeder Umbenennung
zwei Weiterleitungen.

**Kollision mit DB1: keine, aber Gleichnamigkeit ist möglich.** `/discover/<slug>`
und `/brands/<slug>` sind getrennte Namensräume mit je eigener Tabelle und
eigenem `uq_slug` — dieselbe Marke KANN unter beiden Adressen stehen (als
Kunden-Veröffentlichung und als redaktionelles Profil). Das ist kein Fehler,
sondern der Normalfall aus §9.3; welche Seite dann was zeigt, steht dort.
Geteilt wird nur die FUNKTION `brandPublicationSlug` über den Vertrag — nie der
Index.

**Umbenennung.** Beide Marken-Tabellen bekommen `slugHistory` (Liste alter
Slugs, ≤ 5), die Route schlägt bei einem Fehlschlag dort nach und antwortet
301. Das ist die Regel, die DB1 versprochen und nicht gebaut hat (§9.0).

**Abhängigkeit in die andere Richtung — der Befund DB1 (2026-09-08).**
[DISCOVER-BRANDS.md](../archiv/DISCOVER-BRANDS.md) §4.2 sagt zur Umbenennung „neuer Slug
+ 301 vom alten". Gebaut ist das nicht: `brand_publications` trägt `slug`
(unique) und **keine Slug-Historie**, und im Code gibt es **keine
Weiterleitung** — eine Umbenennung bricht heute jeden Link auf
`/discover/<slug>` still. Für DB1 ist das folgenlos, solange es eine einzige
Veröffentlichung gibt, deren Titel sich nicht geändert hat; es bleibt aber ein
Versprechen ohne Mechanik. **BI1 baut `slugHistory` für die eigenen Tabellen
(oben) — DB1 sollte nachziehen**, und zwar mit derselben Form (Liste ≤ 5,
Nachschlag bei 404, 301), damit nicht zwei Weiterleitungs-Mechaniken
nebeneinander stehen. Die Zeile dazu steht in
[OPEN-ITEMS.md](../OPEN-ITEMS.md) unter `BI1`; sie gehört fachlich zu DB1,
wird dort aber nicht eingetragen, solange DB1 in einer anderen Sitzung
bearbeitet wird.

### 9.3 Datenmodell — konkret

Alles server-only (`permissions: []`, `rowSecurity: false`) wie jede
brand-Tabelle; alle Texte über `createMediumtextColumn`, wo sie ein
MariaDB-Zeilenbudget sprengen könnten (Memory „MariaDB/utf8mb4-Zeilenbudget":
Varchar max 16.381, Zeile ~65 KB — ein Artikel passt dort nicht).
Migrationsnummer beim Anlegen gegen `origin/main` prüfen (im brand-Layer ist
`023` heute frei und `024` vergeben — ein Zeichen paralleler Sitzungen).

#### `insights_posts` — der Beitrag (alle vier Formate, eine Zeile)

| Spalte | Typ | Zweck |
| --- | --- | --- |
| `format` | varchar 16 | `profile` · `duel` · `article` · `ranking` |
| `slug` | varchar 160 | Adresse, einsprachig |
| `slugHistory` | varchar 1000 | alte Slugs für die 301 |
| `state` | varchar 16 | `draft` · `review` · `published` · `updated` |
| `baseLocale` | varchar 8 | `de` oder `en` — die REDIGIERTE Grundfassung (Entscheidung 3) |
| `titleDe` / `titleEn` | varchar 200 | |
| `dekDe` / `dekEn` | varchar 400 | Vorspann |
| `bodyDe` / `bodyEn` | MEDIUMTEXT | Markdown aus `UEditor` |
| `translatedAt` | datetime | wann die zweite Fassung entstand |
| `translationModel` / `translationPromptVersion` | varchar 120 / 64 | Herkunft der zweiten Fassung |
| `translationReviewed` | boolean, Default `false` | **erst `true` ist die zweite Fassung öffentlich** |
| `topics` | varchar 200 | kommagetrennte Schlüssel aus dem Cluster-Katalog |
| `sources` | MEDIUMTEXT (JSON) | s. u. |
| `brandRefs` | varchar 2000 (JSON) | `[{ brandId, checkId, libraryKey, publicationId }]` |
| `facts` | varchar 4000 (JSON) | Duell-Zeilen bzw. Ranking-Plätze, s. u. |
| `readingMinutes` | integer 0–120 | gerechnet aus der Grundfassung (Wörter ÷ 200, aufgerundet), beim Speichern, nicht beim Lesen |
| `publishedAt` · `reviewedAt` | datetime | |
| `reviewedBy` | varchar 64 | userId — wer das Zeichen gegeben hat |
| `noteInternal` | varchar 500 | Redaktionsnotiz, nie öffentlich |
| `draftModel` · `draftPromptVersion` | varchar 120 / 64 | Herkunft des KI-Entwurfs |

Indizes: `uq_slug` (Unique) · `idx_state_published` (`state`, `publishedAt`) ·
`idx_format` · `idx_slug_history` (Key, für die 301-Suche).

**Vier Zustände statt fünf — und warum das ein Vorschlag ist, keine
Vereinfachung.** §3.2 nennt die Kette `entwurf → redaktion → freigegeben →
übersetzt → aktualisieren`. Das trägt nicht: ein Beitrag kann auf Deutsch
freigegeben sein, während die englische Fassung noch redigiert wird — eine
lineare Kette kann „halb veröffentlicht" nicht ausdrücken, sie müsste den
Beitrag entweder zurücknehmen oder eine unredigierte Übersetzung öffentlich
machen. Deshalb: `übersetzt` ist **kein Zustand, sondern eine Eigenschaft der
zweiten Fassung** (`translationReviewed`). Die öffentliche Route liest
`state ∈ {published, updated}` UND — für die Nicht-Grundsprache —
`translationReviewed === true`; sonst zeigt sie die Grundfassung mit einem
Hinweis, dass diese Sprache noch fehlt. Das Versprechen aus §3.2 („eine
maschinell erzeugte, unredigierte Fassung ist NIE öffentlich") bleibt damit
wörtlich erfüllt und wird sogar prüfbarer.

**`sources` (JSON, Zitatschranke im Schema).** Je Eintrag:
`{ url, publisher, date: 'YYYY-MM-DD', kind: 'brand-site' | 'press' | 'wikipedia' | 'youtube' | 'own-data', quote (≤ 200 Zeichen), license? }`.
`kind !== 'own-data'` erzwingt `publisher` + `date`; `kind === 'wikipedia'`
erzwingt zusätzlich `license` (CC-BY-SA-Link, §4.1 (3)). Die Prüfung sitzt im
Zod-Schema UND im Übergang nach `review` (§9.4) — eine Regel, die nur im
Formular steht, ist keine.

**`insights_sources` als eigene Tabelle: weiterhin nein** (§5.1 bleibt gültig).
Die Kippfrage ist unverändert, ob eine Quelle EIGENE Fristen bekommt; das
passiert erstmals mit dem Themenradar — und der bekommt aus einem anderen Grund
eine eigene Tabelle (§9.6).

**`facts` (JSON), zwei Formen mit Belegpflicht.** Duell:
`[{ key, labelDe, labelEn, left, right, winner: 'left'|'right'|'tie', sourceIndex }]`.
Ranking: `[{ rank, brandId, checkId, score, reasonDe, reasonEn }]`.
`sourceIndex` zeigt in `sources` — eine Faktenzeile OHNE Beleg lässt sich nicht
speichern. Damit ist §8 Frage 5 („Agentur-Beziehung") beantwortet, ohne die
Zeile zu streichen: sie ist **von Hand gepflegt mit Belegpflicht**, und wo kein
Beleg zu finden ist, fehlt die Zeile — nicht das Format.

#### `insights_brands` — die Marken-Entität

`slug` (varchar 160, unique) · `slugHistory` (1000) · `name` (200) ·
`homepage` (512) · `libraryKey` (64, Schlüssel der Marktvergleichs-Bibliothek,
`''` wenn keiner) · `checkId` (64, jüngster Brand-Check DIESER Website) ·
`publicationId` (64, s. u.) · `industry` (40, aus dem 16er-Katalog des
Brand-Checks) · `country` (2) · `foundedYear` (integer) · `archetype` /
`archetypeSecondary` (40) · `paletteId` (40) · `marks` (varchar 4000, JSON:
Symbol/Claim/Typografie/Farbe, je ein Satz + `sourceIndex`) · `history` (4000,
JSON: Jahr + Satz + `sourceIndex`) · `relations` (2000, JSON: brandIds der
Wettbewerber) · `sources` (MEDIUMTEXT, dieselbe Form wie oben) · `state`
(`draft` · `published` · `removed`) · `removedAt` (datetime) · `removalReason`
(300) · `claimedBy` (64).
Indizes: `uq_slug` · `idx_state` · `idx_industry` · `idx_library_key` ·
`idx_slug_history`.

**§8 Frage 3 — Insights-Profil (fremd) und Discover-Anatomie (eigen):
ZWEI Datensätze, EINE Vorlage.** Der Vorschlag und seine drei Gründe:

1. **Die Rechtsgrundlage ist entgegengesetzt.** Eine Discover-Publikation steht
   dort, weil ihr Eigentümer ausdrücklich zugestimmt hat (Opt-in, eingefrorener
   Snapshot, Widerruf per Klick). Ein Insights-Profil steht dort, weil wir uns
   auf Zitatrecht und Meinungsfreiheit stützen — die Marke hat nie zugestimmt
   und wird nie gefragt. Eine Zeile mit zwei Rechtsgrundlagen hätte auf die
   Frage „darf das weg?" zwei Antworten.
2. **Der Notausgang ist entgegengesetzt.** Discover zurückziehen ist eine
   Kunden-Handlung; Insights entfernen ist eine Zusage von uns, „ohne
   Diskussion gewährt" (Entscheidung 11). Das eine ist ein Knopf, das andere
   ein protokollierter Vorgang mit Datum und Grund.
3. **Der Inhalt ist entgegengesetzt.** Die Discover-Anatomie zeigt Purpose,
   Werte, Stimme — Dinge, die eine Marke über sich selbst FESTGELEGT hat. Bei
   einer fremden Marke wissen wir das nicht und dürften es nicht behaupten;
   dort stehen stattdessen Zeichen, Historie und Beziehungen, jeweils mit
   Beleg. Dieselben Kapitel in einer Tabelle zu führen hieße, die eine Hälfte
   dauerhaft leer zu lassen.

**Die Vorlage ist trotzdem dieselbe** — das Dossier der Anatomie-Seite aus dem brand-Layer (sticky Steckbrief,
fliessendes Dokument rechts, 404 als Zustand, Farbwelt-Hero, Score-Ring). Sie wird in den blueprint-freien Teil
gehoben oder im Vertrag als Baustein geführt; abgeschrieben wird sie nicht.

**Und wenn eine Marke BEIDES ist?** Ein Kunde, über den wir auch redaktionell
schreiben: dann trägt `insights_brands.publicationId` die Verknüpfung, und die
Regel lautet **das Kundenprofil gewinnt** — `/brands/<slug>` zeigt die
redaktionelle Einordnung und verlinkt die Anatomie, wiederholt aber keine
Fundament-Kapitel. Umgekehrt gilt §2.4 unverändert: **eine Kunden-Marke
erscheint in einer redaktionellen Liste nur mit demselben Opt-in wie im
Ranking** (`brand_checks.rankingOptIn`).

#### `insights_corrections` — Korrekturvorschlag UND Entfernen-Wunsch

Eine Tabelle, zwei Anlässe (Muster: `brand_check_corrections`, Migration
brand-017): `targetKind` (`brand` | `post`) · `targetId` (64) · `kind`
(`correction` | `removal`) · `field` (32) · `proposed` (300) · `reason` (300) ·
`contactEmail` (254, freiwillig) · `status` (`open` · `accepted` · `declined`) ·
`decisionNote` (300) · `decidedAt` · `ipHash` (64). Indizes: `idx_status` ·
`idx_target` (`targetKind`, `targetId`).

**Retention und Kaskaden.** Der ENTSCHEIDUNGS-Eintrag bleibt dauerhaft — er ist
der Nachweis, dass der Korrekturweg funktioniert, und genau danach fragt
Anwaltsfrage 3. Was NICHT bleibt: `contactEmail` und `ipHash` werden nach
12 Monaten geleert (ein Sweep nach dem Muster `brand/server/utils/
brandEventsSweep.ts`, Frist als EINE Konstante). Ein Beitrag gelöscht ⇒ seine
Quellen gehen mit (sie stehen in der Zeile). Eine Marke entfernt ⇒ ihre Zeile
geht auf `state: 'removed'` und wird nirgends mehr gelesen, die BEITRÄGE
bleiben (der Text ist der Beitrag) und verlieren nur den Verweis — außer der
Entfernungs-Wunsch nennt den Beitrag selbst, dann geht der Beitrag.
**GDPR-Contributor:** `contactEmail` ist das einzige personenbezogene Feld des
Layers; sobald die Tabelle steht, registriert der Layer einen
`registerUserDataContributor` (Nitro-Plugin) — sonst fehlt sie in Export und
Löschung.

#### Zwei Tabellen hinter eigenen Gates

`insights_topics` (Themenradar, §9.6) und `insights_subscribers` (Newsletter,
§9.3a) entstehen erst mit ihren Paketen — sie stehen hier, damit die Form beim
ersten Schema-Wurf mitgedacht ist, nicht damit sie mitkommen.

#### 9.3a Newsletter — Vorschlag: eigene Liste, eigenes Double-Opt-in

`insights_subscribers`: `emailLower` (256, unique) · `email` (256) · `locale`
(8) · `tokenHash` (128) · `tokenExpiresAt` (32) · `confirmedAt` (32) ·
`unsubscribedAt` (32) · `source` (64) · `ipHash` (64). Das ist **wörtlich das
Muster der Warteliste** (`brand_waitlist`, Migrationen brand-012 und brand-015):
Adresse, Sprache, Token-HASH mit Frist, Bestätigungs-Stempel.

**Die Warteliste selbst wird NICHT weiterbenutzt** — und das ist keine
Bequemlichkeit, sondern dieselbe Regel, die DB1 für `marketVisibility` gezogen
hat: *eine Zustimmung gilt nur für das, wofür sie gegeben wurde.* „Sag mir
Bescheid, wenn das Produkt öffnet" ist keine Einwilligung in einen
redaktionellen Newsletter. Wer beides will, trägt sich zweimal ein.

**Anbieter** — drei belegte Optionen, Vorschlag: **Transport über den
bestehenden `sendMail()`-Weg (Resend als SMTP), Liste und Double-Opt-in bei
uns**, weil das DOI dann exakt so aussieht wie das der Warteliste (ein Muster
statt zwei) und keine Adresse das Haus verlässt, bevor sie bestätigt ist. Die
Alternativen stehen mit Quelle im Anhang und in §10 Frage 5.

### 9.4 Redaktions-Dashboard

**Seiten** unter `/dashboard/insights` (Liste, **`UTable`** nach der B6-Regel —
Sortierung, Auswahl und Blättern kommen mitgeliefert),
`/dashboard/insights/<id>` (Editor als Vollseite, Muster: der Themes-Editor und
`/dashboard/pages`), `/dashboard/insights/brands` (die Marken-Entitäten),
`/dashboard/insights/corrections` (Vorschläge und Entfernungs-Wünsche, Zähler
im Menü wie bei der Warteliste).

**Capability: `insights.manage`, nur admin** — eine neue Zeile in
`core/shared/authz.ts`, nach dem Muster `runner.manage` (bewusst NICHT in der
moderator-Liste). Die DB1-Seite nutzt `users.manage`; das ist dort eine
Dehnung (eine Freigabe-Warteschlange hat mit Nutzerverwaltung nichts zu tun)
und sollte sich nicht fortpflanzen. Kosten: eine Core-Änderung, also ein
eigener Commit (Git-Regel).

**Der Editor.** `UEditor` mit den Regeln aus CLAUDE.md — der Werkzeug-Vorrat
ist an `core/shared/markdown.ts` gekoppelt (fett/kursiv/`code`/Link/h2+h3/
Listen/Zitat/Codeblock, mehr kann der Parser nicht), `enableInputRules` und
`enablePasteRules` bleiben ERLAUBNISLISTEN, `gfm: false` beim Lesen,
`bodyToSave` aus `core/shared/editorBody.ts` (Öffnen und Speichern ohne
Tastendruck darf nichts ändern). Zwei Sprach-Reiter, die Grundfassung sichtbar
markiert; die zweite Fassung trägt über dem Feld den Stempel „maschinell
erzeugt am …, noch nicht redigiert", bis `translationReviewed` steht.

**Das Quellen-Panel** neben dem Text: je Quelle URL, Herausgeber, Datum, Art,
Zitat. Jede Zeile hat einen Knopf „Beleg prüfen", und der prüft
**deterministisch**, nicht mit KI: der Server holt die Seite über den
SSRF-festen Abruf des brand-Layers (inkl. `robots.txt` und TDM-Vorbehalt seit
BS1 R2b) und lässt `evidenceIsGrounded` aus `market/shared/marketExtractRules.ts`
entscheiden, ob das Zitat wörtlich in der Quelle steht. Das ist derselbe
Beleg-Riegel wie im Marktvergleich — kein zweiter, kein weicherer.

**Die Prüfregeln vor dem Übergang nach `review`** (alle blockierend, alle als
pure Funktion im Layer, alle mit Gegenprobe im Beweis):

1. jedes Zitat ≤ 200 Zeichen **und** wörtlich in seiner Quelle
   (`evidenceIsGrounded`);
2. jede Quelle mit `kind !== 'own-data'` trägt Herausgeber und Datum;
   `wikipedia` zusätzlich den Lizenz-Link;
3. jede Faktenzeile (`facts`) zeigt auf eine Quelle;
4. **Namens- und Herabsetzungsfilter** aus dem Marktvergleich —
   `createMarketDisparagementGuard` / `checkMarketTexts` aus
   `market/shared/marketDisparagement.ts`, angewandt auf Titel, Vorspann und
   Fliesstext; ein Treffer blockiert nicht stumm, sondern zeigt die Stelle;
5. jeder gezeigte Score verlinkt `/brand-check/methodik` (Entscheidung 7/11);
6. jede genannte Marke hat eine `insights_brands`-Zeile — sonst gibt es keinen
   Ort, an dem ein Korrekturvorschlag ankommen könnte.

**Der KI-Entwurf.** Brief → Entwurf über `aiCompleteJson`
(`core/server/utils/aiComplete.ts`), Modell über die bestehende Kette
(`app_config` schlägt `pukalani.ai`), Transport mit demselben ZDR-Filter, den
`core/server/utils/aiVision.ts` seit dem 2026-09-08 fest verdrahtet.
Prompt-Fassung als benannte Konstante `insights-d-1` (Muster:
`BRAND_CHECK_PROMPT_VERSION = 'check-judge-2'`, `ARCHETYPE_PROMPT_VERSION`),
gespeichert je Beitrag — ohne sie ist ein alter Entwurf nicht mehr einzuordnen.
Ereignisse im `brand_events`-Muster (`insights.draft.requested` /
`.completed` / `.failed` mit Slot, Modell, Dauer, Fehlercode — **nie Prompt,
nie Text**, Regel 1 aus `brand/server/utils/brandEvents.ts`). Der Entwurf
landet IMMER als `draft`; es gibt keinen Weg von der KI direkt nach `review`.

**Der Übersetzen-Knopf.** Vorschlag: **eigener Redaktions-Endpunkt**, nicht der
UGC-Weg. Der UGC-Weg (`core`, `translations`-Spalte, 10/10 min + 100/Tag,
Same-Language-Marker) ist für ein LESER-Publikum gebaut: Cache je Sprache auf
der Zeile, Knopf beim Leser, Drossel gegen Missbrauch. Hier übersetzt der
BETREIBER, das Ergebnis wird REDIGIERT und dann GESPEICHERT — es ist kein
Cache, sondern eine Fassung, und sie muss bearbeitbar sein. Ein Cache, den
jemand von Hand nachbessert, ist keiner mehr. Die Drossel bleibt trotzdem
(10/Stunde je Konto, Tages-Eimer 50 — dieselbe Bauart wie
`brand/shared/brandAiLimits.ts`), weil auch ein Betreiber einen Knopf
verklemmen kann. Der Same-Language-Fall entfällt: die Zielsprache ist immer die
andere.

### 9.5 Öffentliche Seiten

- **`/insights` (Journal-Liste):** Filterzeile nach Format und Thema,
  Sortierung **Neueste** (Default) · **Kürzeste Lesezeit**; „Meistgelesen"
  **nicht in Runde 1** (§9.7 sagt warum). Grid/Liste über `?display=` wie in
  der Discover-Galerie, Facetten und Seite als Query-Parameter (teilbar).
  Leerer Zustand über `CoreEmptyState`. Microcache 60 s auf der API — die Liste
  ist nutzer-agnostisch.
- **Artikel:** der Aufbau aus dem Dummy, mit stickyem Inhaltsverzeichnis nach
  dem `UContentToc`-Muster; die Überschriften kommen aus dem gerenderten
  Markdown (h2/h3 — mehr kennt der Parser nicht, das begrenzt die Tiefe
  automatisch auf zwei Ebenen).
- **Profil · Duell · Ranking:** nach dem Dummy, Dossier-Form aus §9.3.
- **Korrektur- und Entfernungsweg** auf jeder Profil-, Duell- und
  Ranking-Seite: ein Formular mit Honeypot und Drossel (3/Std je IP,
  Tages-Eimer) — dieselbe Bauart wie das Melden in
  `brand/server/api/discover/[slug]/report.post.ts`. Daneben die Methodik-Zeile
  mit Link auf `/brand-check/methodik`.
- **SEO.** `useLocaleSeoHead()` bleibt der EINZIGE Aufruf; og:image je Beitrag
  aus der Farbwelt-Kachel über das bestehende PNG-Rezept (`/og/<key>.png`,
  1200×630, gerastert aus dem committeten Zeichen-Atlas — **PNG, nicht SVG**,
  weil Facebook/WhatsApp/LinkedIn SVG als og:image nicht zeigen). DB1-Paket D4
  baut das gerade für die Anatomie; BI1 erbt es.
- **JSON-LD:** `Article` + `BreadcrumbList` für alle vier Formate, `ItemList`
  zusätzlich für Rankings. **Bewusst NICHT `Organization`** — DB1 hat das für
  die eigene Anatomie schon abgelehnt, und bei einer FREMDEN Marke wäre es
  ungleich schlimmer: wir würden Google gegenüber behaupten, strukturierte
  Stammdaten einer fremden Firma zu führen. Ebenso **nicht `Review` /
  `AggregateRating`** — genau die Auszeichnung, die aus einer Einordnung im
  Meinungs-Stil eine maschinenlesbare Bewertung machte, und damit die
  Zuspitzung von Anwaltsfrage 3.
- **`noindex`** auf jedem Entwurf und auf der Betreiber-Vorschau (`?preview=1`,
  DB1-Schnittstelle). **hreflang nur auf vorhandene Fassungen:** ein Beitrag
  ohne redigierte Übersetzung darf keine Alternate-Adresse melden, die 404
  antwortet.
- **Eine Falle aus der Hausordnung:** keine spitzen Klammern in
  Locale-Nachrichten. Platzhalter wie `/brands/adresse` schreiben, nie
  `/brands/<adresse>` — nuxt-i18n hält das für HTML, der Nachrichten-Compiler
  steigt im BROWSER aus, und die ganze Client-Seite wird unzuverlässig
  (2026-08-04 live erwischt).

### 9.6 Themenradar — ENTSCHIEDEN: **jetzt**, mit vier Leitplanken

**Davids Entscheidung vom 2026-09-08 (§11 Frage 6) weicht von der Empfehlung
ab:** der Radar wird JETZT gebaut, wie Entscheidung 6 vom 2026-09-07 es vorsah,
nicht nach dem Launch. Der Abschnitt hält deshalb fest, was beim Konkretisieren
gefunden wurde — die drei Tatsachen bleiben wahr, sie verschieben das Vorhaben
nur nicht mehr, sondern **formen es**.

Drei belegte Tatsachen (Quellen im Anhang):

1. **`search.list` hat einen eigenen, sehr kleinen Eimer.** Die
   Google-Dokumentation nennt für ein Projekt „100 `search.list` calls" pro Tag
   — getrennt von den 10.000 Einheiten, die sich alle anderen Endpunkte teilen.
   Ein Radar, der über Suche entdeckt, ist damit bei ~100 Abfragen am Tag
   gedeckelt.
2. **Gespeichert werden darf wenig, und nicht lange.** Die YouTube API
   Services Developer Policies begrenzen die Speicherung von API-Daten (außer
   Analytics/Statistiken) auf **30 Kalendertage** (III.E.4).
3. **Die Leitplanke aus §4.1 (d) traf genau auf ein Verbot.** Dieselben
   Policies sagen in **III.E.2**: API-Daten NICHT aggregieren, außer über
   Kanäle desselben Content Owners. Unsere Schutzmaßnahme — „Kommentare nur
   aggregiert auswerten" — ist also selbst regelwidrig. Das ist kein Detail:
   es dreht die Anwaltsfrage BI1-2 von „ist das DSGVO-konform?" zu „ist das
   nach den API-Bedingungen überhaupt erlaubt, und wenn ja, in welcher Form?".

#### Die vier Leitplanken des Radars (Davids Zuschnitt, 2026-09-08)

**(a) Kein abgeleiteter Datensatz — je Video nur die öffentlichen Zahlen der
API.** Gespeichert werden ausschliesslich die Werte, die die API zu EINEM Video
liefert: **Aufrufe, Likes, Kommentar-ZAHL, Veröffentlichungsdatum, Kanal**.
Keine Zusammenfassung über mehrere Kanäle, kein Verdichten zu einem eigenen
Bestand — das untersagt **III.E.2**. Für die Aufbewahrung gilt **III.E.4**:
**höchstens 30 Kalendertage**, oder der Lauf holt die Zahlen täglich neu und
überschreibt sie. Beides ist erlaubt, eines von beidem wird gebaut — die
Entscheidung fällt in I4, weil sie an der Lauf-Frequenz hängt, nicht am Recht.
**Entschieden in I4 (2026-09-09): täglich neu, mit 30-Tage-Netz** — der Lauf
überschreibt je Video, und was er nicht mehr erreicht, löscht das Netz als ganze
Zeile (Begründung im Kopf von Migration insights-004).
**Dazu seit 2026-09-10 ein Alters-Deckel je Video:** Videos, die älter als
**180 Tage** sind (zwei Halbwertszeiten des Alters-Signals), speichert der Lauf
nicht, und das Netz räumt sie auch über `publishedAt`. Anlass war der erste
Prod-Lauf: drei Kanäle der Liste laden seit Jahren nichts hoch, und die
Uploads-Playlist liefert dann Videos von 2020 oder 2012 — das 30-Tage-Netz
sieht nur, dass wir sie heute geholt haben. Der Deckel ist eine Redaktions-
Vorgabe je App (`pukalani.insights.radar.maxVideoAgeDays`, höchstens 365) und
ändert nichts an den Policies: gespeichert wird weniger, nicht anderes.
**Unsere Opportunity-Zahl ist UNSERE Zahl:** sie wird aus diesen Werten
gerechnet, ist ein eigenes Ergebnis und fällt damit nicht unter das
Aggregations-Verbot für API-Daten. Sie darf bleiben, auch wenn die Zahlen
darunter ablaufen — dann steht sie mit ihrem Stand da, wie jede andere Messung.

**(b) Keine Kommentar-Texte, keine Nutzernamen — bis die Anwaltsantwort da
ist.** Der Radar liest bis dahin **nur Metadaten** (Aufrufe, Alter,
Kanalgröße). Kommentare kommen erst wieder ins Spiel, wenn Block 3 der
BS1-Anwaltsfragen (§4.3 Frage 2, in der geschärften Form) beantwortet ist —
und dann in der Form, die die Antwort erlaubt, nicht in der, die wir uns
vorgestellt hatten. **Die Kommentar-ZAHL ist keine Kommentar-Auswertung**: sie
ist eine öffentliche Kennzahl des Videos und bleibt erlaubt.

**(c) Kuratierte Kanalliste statt `search.list`.** Entdeckt wird über eine von
Hand gepflegte Kanalliste: je Kanal die Uploads-Playlist
(`playlistItems.list`), dann `videos.list` — **beide je 1 Einheit**. Damit
reicht das Tagesbudget von **10.000 Einheiten für rund 50 Kanäle täglich** mit
großem Abstand; `search.list` (100 Einheiten je Aufruf, eigener Tages-Eimer)
bleibt die Ausnahme für gezielte Stichproben und ist im Normalbetrieb nicht
Teil des Laufs.

**(d) Der Radar blockiert den Launch nicht.** Paket **I4 rückt vor I3** oder
läuft parallel dazu (§9.9) — es hängt an einem eigenen Gate (Schlüssel,
Anwalt), und ein Gate, das nicht aufgeht, darf keine öffentliche Seite
aufhalten. **BI1 ist ohne Radar lieferbar**: die Themen des Launch-Pakets
stehen im Dummy und in §9.8, sie kommen von Hand. Geht das Gate zuerst auf,
liefert der Radar die Themen vom ersten Tag — das war der Zweck von
Entscheidung 6.

**Die Formel, konkretisiert.** Popularity = Aufrufe ÷ Abonnenten des Kanals,
über den Lauf normalisiert auf 0–100 (ein Video mit 50k Aufrufen auf einem
Kanal mit 20k Abonnenten schlägt eines mit 200k auf einem Kanal mit 5 Mio).
Content Opportunity Score = fünf Signale zu je 0–20: **Performance**
(Popularity) · **Alter** (jünger = höher, Halbwertszeit 90 Tage) ·
**Suchnachfrage** · **Konkurrenz** (wie viele gute Antworten gibt es schon) ·
**Relevanz** (Nähe zu unseren acht Themenclustern, per Schlagwortliste).
**Ehrlich dazu:** für **Suchnachfrage** und **Konkurrenz** gibt es heute keine
Datenquelle — kein Ahrefs, keine Search Console auf branding.supply. Bis es
eine gibt, rechnet der Score aus **drei** Signalen, und er heißt und zeigt
auch drei. Ein Score, der fünf behauptet und drei rechnet, ist die teurere
Variante — die zwei fehlenden Signale kommen dazu, wenn ihre Quelle da ist,
nicht vorher. (Plausible allein liefert sie NICHT: es misst unsere Seiten,
nicht die Suchnachfrage.)

**Gate bleibt:** Davids Ja (gegeben) + die Anwaltsantwort zu BI1-2 in der
geschärften Form — sie ist Gate für **alles über Metadaten hinaus**, nicht für
den Radar als solchen + ein **Google-Cloud-Projekt mit API-Schlüssel (David)**.

#### Fortsetzung: Kuration, Merkliste, Artikel aus Video (BI2)

Davids Blick auf den ersten Prod-Lauf (2026-09-09) hat sieben Wünsche ergeben,
die über den Zuschnitt von I4 hinausgehen: die Kanalliste einsehen und
bearbeiten, die Cluster erweitern, filtern und sortieren, eine eigene
Fundstück-Liste per YouTube-Link, ein Dreifach-Urteil je Video, und aus einem
Video einen Artikel. Sie stehen als eigener Plan in
**[BRAND-INSIGHTS-KURATION.md](BRAND-INSIGHTS-KURATION.md)** (Pakete K1–K7,
drei Entscheidungsfragen offen) — dieses Dokument bleibt der Stand von BI1.

### 9.7 Messung — drei Ziele, drei Zahlen

Entscheidung 9 gewichtet die drei Ziele gleich. Je Ziel EINE Kennzahl, und
jede muss aus etwas kommen, das es gibt:

| Ziel | Die eine Kennzahl | Woher |
| --- | --- | --- |
| **Umwandlung** | gestartete Brand-Checks und Wizard-Läufe **aus Insights heraus**, je Woche | `brand_events` — `insights.cta_click` mit Format und Ziel; server-seitig, kein Cookie, gedeckt von der 24-Monats-Frist |
| **Reichweite** | Seitenaufrufe der Insights-Seiten je Woche | **Plausible**, selbst gehostet — eingeschaltet mit BS1 R2/R2c (§11 Frage 3); bis dahin gibt es die Zahl nicht |
| **Newsletter** | **bestätigte** Eintragungen je Woche (`confirmedAt`) | `insights_subscribers`; die unbestätigte Zahl wird nie berichtet, sie ist keine |

**Die Lücke war echt, und sie wird geschlossen.** branding.supply hatte zum
Stand dieser Runde **keine Reichweitenmessung** — kein Plausible, kein Matomo,
`analytics.enabled: false` per Core-Default und die App setzte nichts
([BRANDING-SUPPLY-FAKTENBLATT.md](BRANDING-SUPPLY-FAKTENBLATT.md) Zeile 13,
[BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md)
§1.1). Damit war eines von Davids drei gleich gewichteten Zielen unmessbar.
**Davids Entscheidung vom 2026-09-08 (§11 Frage 3): Plausible wird
eingeschaltet** — selbst gehostet unter `plausible.hawaii.studio`, **cookielos
und ohne Banner**, genau wie pukalani.studio es fährt
(`apps/portfolio/app/app.config.ts`, `analytics.provider: 'plausible'`,
`snippet: 'v3'`).

**Was daran hängt, in der Reihenfolge, in der es passieren muss:**

1. **Erst der Text.** Der Datenschutz-Abschnitt „Reichweitenmessung" gehört in
   die Entwurfs-Fassung von branding.supply, BEVOR ein Script eingebunden wird
   — dieselbe Regel, die BS1 schon für `auth.termsUrl` fährt („erst Text, dann
   Schalter"). Die Texte sind heute Entwurf (BS1 **R2**), die Ergänzung ist
   also gerade jetzt billig; nach der Veröffentlichung wäre sie eine Änderung
   mit Ankündigung. **Drei Stellen ziehen mit** und sind am 2026-09-08
   nachgezogen: Faktenblatt Zeile 13 und §4c („findet nicht statt" wurde
   falsch), BS1 §1.1 (Ist-Stand) und §1.2 (Verarbeitungstabelle, Nr. 12).
2. **Dann der Schalter.** Er ist ein eigenes kleines Paket im BS1-Plan
   (**R2c**), nicht in BI1 — Begründung unten.
3. **Davids Handgriff:** eine **neue Plausible-Site für `branding.supply`**
   anlegen. Die CE-Ausgabe hat keine Sites-API (Memory-Notiz
   „Pukalani-Analytics/Plausible"), das klickt David; heraus kommt eine neue
   Script-Id `pa-…`, die in `apps/branding/app/app.config.ts` steht. Ohne sie
   gibt es nichts einzuschalten.

**Warum der Schalter zu BS1 gehört und nicht zu BI1** — drei Gründe, in der
Reihenfolge ihres Gewichts: (1) **Er misst die ganze Site**, nicht nur
Insights: Startseite, Wizard-Trichter, Brand-Check, Discover. Eine
seitenweite Änderung in einem Insights-Paket zu verstecken, wäre die falsche
Ablage. (2) **Text und Schalter dürfen nicht auseinanderlaufen**; sie stehen
dann in EINEM Plan, dessen Paket-Kette (R2 → R2c → R3) die Reihenfolge schon
erzwingt. (3) **BI1 kann ihn ohnehin nicht ziehen**: er hängt an Davids
Plausible-Site und an einem Text, den BI1 nicht schreibt. BI1 führt ihn
deshalb als **fremde Abhängigkeit** (§9.9) — nötig, wenn die öffentlichen
Seiten (I3) live gehen, nicht früher.

**Nicht gewählt** wurde ein eigener serverseitiger Zähler (`brand_events`-Zeile
je Aufruf): keine Rechtsänderung, aber ein Schreibvorgang je Aufruf inklusive
Bots — und eine Zahl, die Bots enthält, ist als „Reichweite" irreführender als
gar keine. Ebenso nicht: weiter nicht messen.

„Meistgelesen" als Sortierung bleibt in jedem Fall aus Runde 1 draußen: selbst
mit Plausible liegen die Zahlen nicht in unserer Datenbank, eine Sortierung
daraus bräuchte einen täglichen Abgleich über die Stats-API — ein eigenes
kleines Vorhaben, kein Nebenprodukt.

### 9.8 Launch-Paket — ein Vorschlag zum Streichen

Entscheidung 5: ≈ 10 Profile · 3 Duelle · 5 Artikel · 1 Ranking. Konkret, mit
Herkunft — David streicht und ergänzt:

**Zehn Markenprofile.** Vier davon sind **schon handgeprüft** und liegen in der
Marktvergleichs-Bibliothek (`market/shared/library/index.ts`, `status:
'verified'` mit Prüfdatum und Beleg): **Nike · Apple · Anthropic · The Barn**.
Sechs kommen dazu, alle aus dem Dummy und alle mit öffentlicher Website, die
der Brand-Check prüfen kann: **IKEA · Rolex · adidas · On · Puma · Patagonia**.
Reihenfolge des Baus: erst die vier belegten (sie brauchen keine neue
Recherche), dann die sechs.

**Drei Duelle**, alle aus vorhandenen Profilen, alle mit echtem
Erkenntniswert — nicht drei Varianten desselben Vergleichs:
**Nike vs. adidas** (der Klassiker aus dem Dummy, Aufsteiger gegen
Titelverteidiger) · **On vs. Puma** (junge Marke gegen Bestand, derselbe Markt)
· **Apple vs. IKEA** (zwei Wege zu „Konsistenz über Jahrzehnte", verschiedene
Branchen — das Duell, das die acht Dimensionen am besten erklärt).

**Fünf Artikel** aus der Themenliste des Dummys, je einer je Cluster und je
einer mit eigenem Datenbeleg: **„Was kostet ein Rebranding wirklich?"**
(Rebranding) · **„Warum Banken blau sind — und wann du es nicht sein solltest"**
(Brand Psychology) · **„Tagline vs. Slogan"** (Brand Language) ·
**„llms.txt: Wie KI-Assistenten deine Marke zitieren"** (SEO & GEO) ·
**„IKEA: Wie ein Möbelhaus zur Weltmarke wurde"** (Brand Analysis, zugleich der
Beweis, dass Profil und Artikel zusammenspielen).

**Ein Ranking:** **„Die zehn Marken mit dem stärksten Auftritt"** — genau die
zehn Profile, sortiert nach Brand Score, mit Methodik-Zeile und je einem Satz
Begründung. Es ist die Liste, die sich teilen lässt, und sie kostet keine
zusätzliche Recherche.

**Die Mengen-Bremse aus Entscheidung 1 bleibt:** kein Format geht live, bevor
es EINEN vollständig redigierten Beispiel-Beitrag hat. Der Launch beginnt also
mit vier Stücken — einem je Format —, nicht mit neunzehn.

### 9.9 Pakete I0–I6

| # | Paket | Inhalt | Gate |
| --- | --- | --- | --- |
| **I0** ✅ | **Prototyp mit echten Datenformen — GEBAUT 2026-09-08 (§9.10)** | die vier Formate im brand-Playground an das Konzept angeglichen: Journal-Liste mit Format-/Themenfilter, Artikel mit TOC, Profil als Dossier, Duell mit `facts`-Zeilen inkl. Belegspalte, Ranking mit Methodik-Zeile; Redaktions-Editor als Skizze (zwei Sprach-Reiter, Quellen-Panel, Prüfregeln als Liste). GEBAUT im EIGENEN Playground (`packages/insights/.playground`, Port 3013) statt im brand-Playground — dort baut eine andere Sitzung an Discover/Brand Design. **Nachbesserung aus Runde 1: Radar-Zahl auf 100 normiert + Fußnote (läuft)** | **FREIGEGEBEN 2026-09-08** (Davids Abnahme, Phase 4 des Workflows) |
| **I1a** ✅ | **Beleg-Riegel nach `core`** *(neu 2026-09-08, §11 Runde-1-Frage 1 — **ERLEDIGT 2026-09-09**, auf main)* | `evidenceIsGrounded` und der Herabsetzungs-/Namensfilter (`createMarketDisparagementGuard`) ziehen aus `packages/market/shared` nach `packages/core/shared`, **Namen ohne `market`-Präfix**; `market` re-exportiert (keine Aufrufstelle bricht), `insights` importiert später aus `core`. Fundament-Baustein, kein Insights-Bau | **kein Gate** — steht VOR I1 und ist auch ohne BI1 richtig; läuft parallel als eigenes Code-Paket |
| **I1** ✅ | **Layer + Schema + Vertrag — GEBAUT 2026-09-09, Prod-Migration mit Davids Ja gefahren (Details OPEN-ITEMS-COMPLETE „BI1 I1")** | Layer `insights` mit Manifest, Eintrag in `apps/branding/site.manifest.ts`, `LAYER_ORDER`, Bilanz-Block, ESLint-Block; Migration (`insights_posts`, `insights_brands`, `insights_corrections`); Vertrag zum brand-Layer; `insights.manage` in `core/shared/authz.ts` (eigener Commit); GDPR-Contributor; Schema-Parität-Soll | **Davids Ja GEGEBEN 2026-09-09** · Zuschnitt entschieden: §11 Frage 1 |
| **I2** ✅ | **Dashboard + KI-Entwurf — GEBAUT + LIVE 2026-09-09 (Details OPEN-ITEMS-COMPLETE „BI1 I2")** | Liste (`UTable`), Editor mit `UEditor` und zwei Sprach-Reitern, Quellen-Panel mit deterministischer Beleg-Prüfung, die sechs Prüfregeln vor `review` als Server-Gate mit Quellen-Abruf, Zustands-Umschalter, Vorschau, Übersetzen-Endpunkt mit Drossel, `aiCompleteJson`-Entwurf mit `insights-d-1`. Noch nicht: Marken-Seite, Korrekturen-Liste, Fakten-Zeilen-Editor (JSON mit Zod) | I1 · Zuschnitt entschieden: §11 Fragen 4 und 7 |
| **I4** ✅ | **Themenradar — GEBAUT 2026-09-09 (Details OPEN-ITEMS-COMPLETE „BI1 I4"), ohne Schlüssel stumm** | kuratierte Kanalliste (zwölf verifizierte Kanäle in `apps/branding`), `playlistItems.list` + `videos.list` + `channels.list`, `insights_topics` (insights-004, nur die API-Zahlen je Video, täglich neu + 30-Tage-Netz), Sweep 24 h + Knopf, Opportunity aus drei Signalen mit Fussnote, `/dashboard/insights/radar` mit Status-Karte; **keine Kommentar-Texte, keine Nutzernamen** — dafür gibt es keinen Adress-Bauer | **Gates GESCHLOSSEN 2026-09-10** (Schlüssel in der Server-.env, insights-004 auf Prod gefahren, erster Lauf 205 Videos) · **Alters-Deckel je Video seit 2026-09-10** (180 Tage, s. §9.6) · die Anwaltsantwort BI1-2 gilt weiter für **alles über Metadaten hinaus** (§9.6) |
| **I3** ✅ | **Öffentliche Seiten — GEBAUT 2026-09-10 (Details OPEN-ITEMS-COMPLETE „BI1 I3")** | `/insights`, `/insights/<slug>`, `/topics/<slug>`, `/brands/<slug>`, `/duels/<a>-vs-<b>`, `/rankings`, `/rankings/<slug>`; sieben Leserouten `/api/insights/public/**` mit Microcache 60 s und Betreiber-Vorschau; Korrektur-/Entfernungs-Formular (Honigtopf, 3/Std + 10/Tag); SEO (og:image `/og/insights/<slug>.png`, JSON-LD Article/Breadcrumb/ItemList, hreflang nur auf vorhandene Fassungen, `noindex` für alles ausser published/updated), Sitemap mit `lastmod` und Sprachen je Beitrag, Nav-Punkt, 301 aus `slugHistory` und für die Duell-Gegenrichtung, 410 für die entfernte Marke | I2 ✅ · **Anwaltsantworten BI1-3 und BI1-4 stehen weiter aus** — sie sind jetzt ein **Config-Riegel** statt eines Baustopps (s. unten) |

**Der Riegel `pukalani.insights.publicFormats` (I3, 2026-09-10).** Das Gate aus
§6 („ohne die Antworten zu 3 und 4 geht kein Markenprofil live") ist gebaut,
nicht umgangen: der Layer-Default ist `['article']`, und ein gesperrtes Format
antwortet **an beiden Türen 404** — Seite UND Leseroute, wie die Datentür, nie
nur in der Navigation. Die Sitemap bietet gesperrte Adressen nicht an, das
og-Bild eines gesperrten Beitrags ebenso wenig. Die pure Regel
`readInsightsPublicFormats` ist **fail-closed**: was kein Array bekannter
Format-Schlüssel ist, erlaubt nichts. **Davids Handgriff nach der
Anwaltsantwort ist damit EINE Zeile** in `packages/insights/app/app.config.ts`
(oder, enger, in `apps/branding/app/app.config.ts`) — kein Code, kein Deploy
von Neuem. Artikel und Themen-Seiten sind seit I3 live-fähig.
| **I5a** ✅ | **Newsletter — Sammeln, GEBAUT 2026-10-24 (Details OPEN-ITEMS-COMPLETE „BI1 I5a")** | `insights_subscribers` (Migration **insights-006**) mit Double-Opt-in wörtlich nach dem Warteliste-Muster, drei Routen (anmelden · bestätigen · abmelden), Formular zentral und am Ende jedes Beitrags, Fristen-Sweep mit zwei Regeln, GDPR-Contributor erweitert. Das Gate ist **gebaut statt abgewartet**: `pukalani.insights.newsletter.enabled` (Layer-Default `false`) schliesst an Seite UND Route | I3 ✅ · **Rechtstexte (A1/BS1 R2) stehen weiter aus** — jetzt ein Config-Riegel statt eines Baustopps (s. unten) |
| **I5b** | **Newsletter — Versenden** | eine Ausgabe verfassen und an alle Bestätigten schicken (Betreiber-Seite im Dashboard, Stapel-Versand, Abmelde-Link je Empfänger), dazu der `List-Unsubscribe`-Header — den kennt `sendMail()` heute nicht | I5a · dieselben Rechtstexte |

**Der Riegel `pukalani.insights.newsletter.enabled` (I5a, 2026-10-24)** — dieselbe
Mechanik wie `publicFormats` bei den Markenprofilen, und aus demselben Grund:
ohne Datenschutz-Abschnitt „Newsletter" darf keine Adresse erhoben werden
(„erst Text, dann Schalter", wie bei Plausible R2c). Zu heisst: kein Formular
auf der Seite, und alle drei Routen antworten 404 wie die Datentür — mit dem
NEUTRALEN Grund der übrigen öffentlichen Routen, nicht mit „Newsletter aus".
Die pure Regel ist fail-closed. **Davids Handgriff nach BS1 R2 ist EINE Zeile.**

**Das Versprechen steht fest (Davids Entscheidung 2026-10-24): KEIN Takt.**
Formular, Seite und Bestätigungsmail sagen „Wir schreiben, wenn ein neues Stück
erscheint" — nirgends „wöchentlich". Der Wochentakt aus §3.3 bleibt ein
Redaktionsziel und wird nicht zur Zusage an Fremde; ein Test hält die
verbotenen Wörter in beiden Sprachen fest.
| **I6** | **Launch-Paket** | die vier Beispiel-Beiträge (einer je Format), dann die restlichen fünfzehn Stücke aus §9.8; danach der Wochentakt | I3 · Davids Redaktionszeit |

**Die Freigabe des Prototyps ist kein Startschuss für I1.** David hat am
2026-09-08 die FORM abgenommen („so bauen"). Die drei Gates darüber bleiben
davon unberührt: **DB1** (BI1 erbt die öffentlichen Marken-Seiten, §6), die
**Anwaltsantworten BI1-3 und BI1-4** (ohne sie geht kein Markenprofil live) und
der **Google-API-Schlüssel** (Gate von I4). Eine freigegebene Form, die auf
Zuarbeit wartet, ist kein Widerspruch — sie ist der Normalfall dieses Workflows:
Phase 4 sagt „so und nicht anders", nicht „ab jetzt".

**Warum I1a schon läuft.** I1a verschiebt
zwei bestehende, getestete Funktionen des `market`-Layers in den Fundament-Layer
`core`. Das ist auch dann richtig, wenn Brand Insights nie gebaut würde: heute
kann nur `market` seinen eigenen Beleg-Riegel benutzen, und ein zweiter Layer
müsste ihn abschreiben (§9.10 Frage 1 nennt das den teuersten Weg — zwei Riegel
driften). Deshalb ist I1a **kein** vorgezogener Insights-Bau, sondern
Fundament-Arbeit, und es lief schon vor der Freigabe.

**Reihenfolge-Regel (geändert am 2026-09-08).** **I4 steht jetzt VOR I3** und
darf auch parallel dazu laufen: Davids Entscheidung ist, dass die Themen von
Anfang an aus Daten kommen (§9.6). Die Regel dahinter bleibt aber beidseitig —
**der Radar blockiert den Launch nicht, und der Launch blockiert den Radar
nicht.** I4 hängt an einem eigenen Gate (API-Schlüssel, Anwalt für alles über
Metadaten hinaus); geht es nicht auf, geht I3 trotzdem live und die Themen
kommen von Hand aus §9.8. Kein anderes Paket wartet auf I4.

**I5 (Newsletter) bleibt hinter I3** (§11 Frage 5): ein Newsletter ohne
Beiträge hat nichts zu versenden, und sein Gate sind die Rechtstexte (BS1 R2).

**Fremde Abhängigkeit, die kein BI1-Paket ist:** **Plausible einschalten**
(§11 Frage 3) liegt als Paket **R2c** im BS1-Plan
([BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md)
§7), weil es die ganze Site misst und an Davids neuer Plausible-Site hängt.
Es sollte stehen, wenn **I3** live geht — sonst ist Davids Reichweiten-Ziel ab
dem ersten öffentlichen Beitrag wieder unbeobachtet. Es ist aber **kein Gate**
von I3: eine Seite, die niemand zählt, ist immer noch eine Seite.

### 9.10 I0 gebaut — Davids Korrekturrunden (2026-09-08)

**Stand: der Prototyp läuft.** Eigener Layer `packages/insights` (Manifest,
Sprachkatalog de+en, `pukalani.insights.enabled` Default aus, ESLint-Topf
`PRODUCTS`, Bilanz-Block) plus ein eigener Playground auf **Port 3013**
(`pnpm --filter @pukalani/insights dev`). Sechs Bildschirme, alle zweisprachig
(`/…` englisch, `/de/…` deutsch):

| Adresse | Was zu beurteilen ist |
| --- | --- |
| `/de/insights/demo/journal` | Journal-Liste über alle vier Formate: Themen-Chips, Format-/Sprach-/Sortier-Auswahl, Raster ↔ Liste über `?display=`. „Meistgelesen" steht **sichtbar gesperrt** mit dem Grund daneben (Plausible, §11 Frage 3) |
| `/de/insights/demo/artikel` | Artikel mit `UContentToc` (Scrollspy kommt mitgeliefert — der handgebaute des Klickdummys ist weg), Quellenliste mit „Eigenaussage" ↔ „Fremdquelle", erwähnte Marken mit Score-Ring, **kein Autorenname** (Entscheidung 4) |
| `/de/insights/demo/profil` | Markenprofil einer FREMDEN Marke: Farbwelt-Hero mit der Wortmarke als Schrift, acht Score-Kategorien mit Methodik-Link, Zeichen und Historie je mit Beleg-Nummer, Korrekturweg — und darunter **dieselbe Seite im Zustand „auf Wunsch entfernt"** |
| `/de/insights/demo/duell` | Statistik-Tafel: acht Dimensionen gespiegelt, Sieger je Zeile, „Zahlen & Fakten" mit **Belegspalte**, alphabetischer Slug |
| `/de/insights/demo/ranking` | Zehn Plätze, Ausgabe-Nummer, Stand-Datum, Methodik-Zeile — und die **Lücke auf Platz 7** („auf Wunsch entfernt", ohne Neunummerierung) |
| `/de/insights/demo/redaktion` | Redaktion: Liste als `UTable`, Editor mit `UEditor` und zwei Sprach-Reitern, Quellen-Panel mit **deterministischer Beleg-Ampel**, die sechs Prüfregeln als Liste mit Fundstelle, Übersetzen-Knopf mit `translationReviewed`-Häkchen, Themenradar |

**Der Vertrag ist mitgebaut, nicht skizziert.** `packages/insights/shared/insightsPost.ts`
trägt die Formen aus §9.3 als Typen UND Zod-Schemas: Beitrag (vier Formate,
`baseLocale`, beide Fassungen, `translationReviewed`), Quelle (Art, Herausgeber,
Datum, Zitat ≤ 200, Lizenz), Duell-Fakt mit `sourceIndex`, eingefrorenes
Ranking (zehn Plätze, Lücke), Marken-Entität mit `removed`-Zustand,
Radar-Video (nur die erlaubten API-Zahlen) — dazu die puren Rechnungen
(`insightsPublicFassung`, `insightsReadingMinutes`, `insightsDuelSlug`,
`insightsOpportunity`) und die **sechs Prüfregeln** als eine Funktion.
48 Tests, jede rechtlich teure Regel mit Gegenprobe (Zitat > 200 fällt,
Fremdquelle ohne Datum fällt, elf Plätze fallen); die Demo-Daten des
Playgrounds gehen durch dasselbe Schema.

**Erfunden, und zwar absichtlich.** Der Prototyp zeigt die Kaffee-Welt des
Marktvergleichs (Upcountry Roast Co., Pacific Bean Supply, Kona Trading,
Island Grind, dazu weitere `.example`-Namen fürs Ranking). Keine reale Marke,
kein fremdes Logo — für eine echte Marke gäbe es hier nur erfundene Belege,
und genau das verbietet das Produkt sich selbst.

**Drei Dinge, die der Prototyp bewusst NICHT tut.** Er speichert nichts, ruft
kein Modell und hat keine Route; er ändert die echte `BwSiteNav` nicht (die
Navigations-Vorschau lebt als eigene Hülle im Playground, damit Davids
404-Audit vom 2026-09-03 nicht rückgängig gemacht wird); und er importiert
nichts aus `packages/brand` — Score-Ring, Farbwelt und Archetyp-Namen kommen
als Prop oder Slot herein, wie `MkBrandScore` es im market-Layer vormacht. Die
ESLint-Ausnahme `insights → brand` kommt deshalb erst mit I1, zusammen mit dem
Vertrag.

**Davids Runde 1 — beantwortet am 2026-09-08** (die Tabelle
Frage · Entscheidung · Empfehlung war · Leitplanke steht in **§11**; vier von
fünf folgen der Empfehlung, Frage 2 weicht ab):

1. **Wem gehört der Beleg-Riegel?** `evidenceIsGrounded` und
   `createMarketDisparagementGuard` liegen im **market**-Layer, und ein
   Produkt-Layer importiert keinen anderen (CONCEPT A14). Der Prototyp reicht
   beide als Funktion herein; I1/I2 muss entscheiden: nach `core` ziehen, über
   den brand-Vertrag führen — oder abschreiben (das wäre der teuerste Weg,
   zwei Riegel driften).
   → **Entschieden: nach `core` ziehen** (nach Empfehlung). Beide Funktionen
   wandern von `packages/market/shared` nach `packages/core/shared`, **die
   Namen verlieren dabei das `market`-Präfix** (im Fundament-Layer wäre es eine
   Lüge); `market` re-exportiert, damit keine Aufrufstelle bricht, `insights`
   importiert aus `core`. Das ist **eigenes Paket I1a** (§9.9) und **läuft
   bereits** — es geht vor I1 und ist auch ohne BI1 richtig.
2. **Heisst die Opportunity-Zahl „von 60"?** Drei Signale zu je 0–20, sichtbar
   als „44 von 60 · 3 von 5 Signalen". Die Alternative wäre eine auf 0–100
   normalisierte Zahl mit Fussnote — sie liest sich besser und verschweigt,
   dass zwei Summanden fehlen.
   → **Entschieden: auf 100 normiert, mit Fussnote** — **abweichend** von der
   Empfehlung „44 von 60". Drei Leitplanken kaufen die Ehrlichkeit zurück, die
   „von 60" mitbrachte: **(a)** die Fussnote nennt IMMER, aus wie vielen der
   fünf Signale gerechnet wurde („aus 3 von 5 Signalen") — sie ist Pflicht,
   nicht Zierde; **(b)** die Normierung ist eine **pure Funktion mit Test**
   (`insightsOpportunity`), kein Rechenweg in einer Vorlage; **(c)** kommen
   Signale dazu, **ändert sich die Skala nicht** — nur die Fussnote. Damit
   bleibt eine 44 über Monate dieselbe 44, während „von 60" bei jedem neuen
   Signal eine neue Bedeutung bekommen hätte.
3. **Gehört die Redaktion auf EINE Seite?** Der Prototyp zeigt Liste, Editor
   und Radar untereinander, damit der Zusammenhang sichtbar ist; §9.4 sieht
   drei Adressen vor.
   → **Entschieden: drei Adressen** — Liste, Editor, Radar (nach Empfehlung,
   §9.4 bleibt wie geschrieben). Die Untereinander-Ansicht war eine
   Prototyp-Hilfe, damit der Zusammenhang auf einem Bildschirm sichtbar wird;
   im Produkt sind es drei Seiten.
4. **Zeigt die Journal-Liste einen Beitrag, dessen Sprachfassung fehlt?** Der
   Prototyp tut es (mit dem Hinweis „Nur auf English") und blendet ihn erst
   aus, wenn der Sprachfilter gesetzt ist. Die Gegenoption wäre, ihn auf der
   deutschen Oberfläche gar nicht erst zu zeigen.
   → **Entschieden: er bleibt sichtbar, mit dem Hinweis „Nur auf English"**
   (nach Empfehlung). Ein vorhandener Beitrag, den die Liste verschweigt, ist
   für den Leser nicht von einem fehlenden zu unterscheiden. Ausgeblendet wird
   er weiterhin erst, wenn der Sprachfilter ausdrücklich gesetzt ist —
   „redigierte Zielsprache" heisst `translationReviewed === true` (§11 Frage 4).
5. **Reicht der Korrekturweg als Knopf am Seitenende?** Er steht heute auf der
   Profil-Seite; Duell und Ranking tragen ihn in I3 an derselben Stelle.
   → **Entschieden: ja, Knopf am Seitenende — auf Profil, Duell UND Ranking**
   (nach Empfehlung). Drei Seiten, eine Stelle, ein Formular: überall dort, wo
   über eine fremde Marke etwas behauptet wird, steht der Weg zum Widerspruch
   am selben Ort. Kein eigener Menüpunkt und kein aufdringliches Banner.

---

## 10. Entscheidungsfragen für David (2026-09-08)

> **Beantwortet am 2026-09-08 — die Entscheidungen stehen in [§11](#11-entscheidungen-david-2026-09-08).**
> Dieser Abschnitt bleibt als Protokoll stehen: hier stehen die Optionen und
> die Empfehlungen, dort steht, was gilt.

Acht Fragen. Bei jeder steht die Empfehlung zuerst; die Optionen sind das, was
sonst noch vertretbar ist, nicht eine Sammlung von Möglichkeiten.

### Frage 1 — Wo wohnt Brand Insights im Code?

**Empfehlung: A (eigener Layer `insights`).** Insights hat ein eigenes
Dokument, eine eigene Zustandsmaschine, ein eigenes Publikum und einen eigenen
Gegenstand (fremde Marken) — die Bedingung, unter der Brand Design bewusst
KEIN eigener Layer wurde („zwei Zustandsmaschinen für ein Dokument"), liegt
hier nicht vor. Der passende Präzedenzfall ist `market`.

- **A — eigener Layer `insights`, `requires: ['brand']`, ein Vertrag:** saubere
  Grenze, eigene Notabschaltung über `/api/insights`, der Wizard bleibt
  unberührt; kostet Manifest, Bilanz-Block, ESLint-Block und Schema-Parität-Soll.
- **B — Tabellen im brand-Layer (wie Entscheidung 8 skizziert):** heute
  schneller, kein neuer Layer; der brand-Layer trägt dann Kunden-Werkstatt und
  öffentliche Redaktion in einem, und eine Produkt-Abschaltung träfe beide.
- **C — Layer `insights`, aber ohne eigenen Produkt-Schalter** (im Manifest
  `tier: 'foundation'`): spart die Gate-Arbeit, nimmt uns aber die Möglichkeit,
  die Redaktion im Notfall in einer Zeile abzuschalten.

### Frage 2 — Adressen und das Verhältnis zu Discover

**Empfehlung: A (fünf Basen, zwei Datensätze, eine Vorlage).**
`/insights` als Journal-Hub, `/insights/<slug>` für Artikel, `/brands/<slug>`
für Profile fremder Marken (von DB1 reserviert), `/duels/<a>-vs-<b>`,
`/rankings`, `/topics/<slug>` — und ein Insights-Profil ist ein EIGENER
Datensatz neben einer Discover-Publikation, weil die beiden entgegengesetzte
Rechtsgrundlagen, Notausgänge und Inhalte haben (§9.3). Die Seitenvorlage
(Dossier) wird geteilt, nicht abgeschrieben.

- **A — getrennte Datensätze, geteilte Vorlage, `/brands/` für fremde Marken.**
- **B — ein Datensatz, zwei Sichten:** eine Tabelle für „Marke" mit einem Feld
  „eigen/fremd"; weniger Code, aber zwei Rechtsgrundlagen und zwei Löschregeln
  in einer Zeile.
- **C — gar keine eigene Profil-Adresse:** fremde Marken erscheinen nur
  INNERHALB von Artikeln und Duellen. Am wenigsten Angriffsfläche, aber die
  Datenautorität aus §2.1 fällt weg — und damit der Kern von Entscheidung 1.

*Nebenfrage, die keine Option braucht:* die 301 bei Umbenennung ist in
DISCOVER-BRANDS.md versprochen und nicht gebaut (kein `slugHistory` im Schema).
BI1 baut sie mit; für DB1 kommt eine Zeile nach OPEN-ITEMS.

### Frage 3 — Reichweitenmessung auf branding.supply

**Empfehlung: A (Plausible einschalten, jetzt).** Eines von Davids drei gleich
gewichteten Zielen (Entscheidung 9) ist heute unmessbar. Die Datenschutz-
erklärung von branding.supply ist gerade noch Entwurf (BS1 R2) — der Abschnitt
lässt sich jetzt ohne Ankündigung ergänzen, später nicht mehr.

- **A — selbst gehostetes Plausible einschalten** (cookielos, ohne Banner, wie
  pukalani.studio): ehrliche Zahlen inkl. Bot-Filter; Datenschutzerklärung und
  Faktenblatt-Zeile 13 müssen mit („findet nicht statt" wird falsch).
- **B — eigener serverseitiger Zähler** (`brand_events`): keine
  Rechtsänderung, aber ein Schreibvorgang je Aufruf und eine Zahl inklusive
  Bots.
- **C — weiterhin nicht messen:** null Aufwand, null Rechtsfläche; das
  Reichweiten-Ziel bleibt dann unbeobachtet und „Meistgelesen" fällt dauerhaft
  aus.

### Frage 4 — Der Übersetzen-Weg

**Empfehlung: A (eigener Redaktions-Endpunkt).** Der UGC-Weg cacht eine
Übersetzung für LESER; hier entsteht eine FASSUNG, die redigiert, gespeichert
und später bearbeitet wird. Ein Cache, den jemand von Hand nachbessert, ist
keiner mehr.

- **A — eigener Endpunkt**, Ergebnis als bearbeitbarer Entwurf der zweiten
  Fassung, Drossel 10/Stunde + 50/Tag je Konto, öffentlich erst mit
  `translationReviewed`.
- **B — der bestehende UGC-Weg** (`translations`-Spalte, Knopf, 10/10 min +
  100/Tag): kein neuer Code; aber die Fassung wäre ein Cache, den Redigieren
  bei der nächsten Änderung verwirft.
- **C — gar keine Maschinen-Übersetzung:** beide Fassungen von Hand. Höchste
  Qualität, halbe Geschwindigkeit — bei zwei Stücken je Woche sind das vier.

### Frage 5 — Newsletter: Liste, Anbieter, Zeitpunkt

**Empfehlung: A (eigene Liste, eigenes DOI, Versand über den bestehenden
Mail-Weg) — und erst nach dem Launch (Paket I5).** Das Double-Opt-in der
Warteliste (brand-015) ist gebaut, geprüft und passt eins zu eins; die
Warteliste SELBST wird nicht weiterbenutzt, weil eine Zustimmung nur für das
gilt, wofür sie gegeben wurde.

- **A — eigene Tabelle `insights_subscribers` nach dem Warteliste-Muster,**
  Versand über `sendMail()`: ein DOI-Muster im Haus, keine Adresse verlässt es
  vor der Bestätigung; Versandlisten und Abmelde-Verwaltung bauen wir selbst.
- **B — Resend Broadcasts** (die Adressen liegen dann bei Resend, es gibt eine
  API und Segmente): weniger Eigenbau; Double-Opt-in ist in der Dokumentation
  nicht beschrieben, wir müssten es trotzdem selbst davorsetzen.
- **C — listmonk selbst hosten** (AGPLv3, braucht Postgres, kennt
  Double-Opt-in-Listen von Haus aus): der Funktionsumfang eines echten
  Newsletter-Werkzeugs; dafür ein weiterer Dienst mit eigener Datenbank,
  eigenem Backup und eigenem Update-Pfad.

### Frage 6 — Themenradar: jetzt oder nach dem Launch?

**Empfehlung: B (nach dem Launch, und lesend-und-verwerfend).** Beim
Konkretisieren ist aufgefallen, dass die YouTube-Policies das AGGREGIEREN von
API-Daten untersagen (III.E.2) — also genau die Schutzmaßnahme, mit der §4.1 (d)
den Datenschutz auffangen wollte. Solange das nicht anwaltlich geklärt ist,
wäre der Radar eine Wette; und seine zwei besten Signale (Suchnachfrage,
Konkurrenz) haben ohnehin noch keine Datenquelle.

- **A — jetzt** (wie Entscheidung 6 es vorsah): Themen kommen vom ersten Tag
  aus Daten; Preis ist ein offenes Rechtsrisiko und ein Score, der drei von
  fünf Signalen erfindet.
- **B — nach dem Launch, lesend-und-verwerfend:** kuratierte Kanalliste statt
  Suche, gespeichert wird nur unsere eigene Zahl, Kommentare erst nach der
  Anwaltsantwort. Themen kommen bis dahin von Hand — BI1 ist ohne Radar
  lieferbar (§3.4 sagt das bereits).
- **C — ganz streichen** und die Themen dauerhaft redaktionell setzen: null
  Risiko, null Kontingent, null API-Abhängigkeit; dafür fehlt das Signal, das
  branding.supply von einem gewöhnlichen Blog unterscheiden sollte.

### Frage 7 — Ranking-Regeln

**Empfehlung: A (zehn Plätze, eingefrorene Liste, sichtbarer Stand,
vierteljährliche Auffrischung als neue Ausgabe).** Ein Ranking ist ein Beitrag
mit Datum, kein Live-Widget — sonst ändert sich unter einem geteilten Link der
Inhalt, und die Begründungssätze passen nicht mehr zu den Zahlen daneben.

- **A — eingefroren:** die Plätze und Scores stehen in `facts`, der Kopf trägt
  „Stand: …"; ändert sich ein Score, entsteht eine NEUE Ausgabe (neuer Slug),
  die alte bleibt mit Hinweis und Link. Ein Entfernen-Wunsch nimmt den Platz
  heraus und rechnet die Liste NICHT neu — die Lücke wird als „auf Wunsch
  entfernt" ausgewiesen (das ist ehrlicher als eine stille Neunummerierung,
  und es beantwortet §8 Frage 9).
- **B — lebend:** die Liste rechnet bei jedem Aufruf aus den aktuellen Scores.
  Immer richtig, nie zitierbar; die redaktionellen Begründungssätze müssten
  entfallen.
- **C — eingefroren, aber an Ort und Stelle aktualisiert** (ein Slug, Inhalt
  wird überschrieben): am einfachsten zu pflegen; ein Link von außen zeigt
  dann auf etwas anderes als das, worauf verwiesen wurde.

### Frage 8 — Launch-Inhalt

**Empfehlung: A (der Vorschlag aus §9.8, mit den vier belegten Marken zuerst).**
Nike, Apple, Anthropic und The Barn liegen schon handgeprüft in der
Bibliothek — sie kosten keine neue Recherche und beweisen trotzdem alle vier
Formate.

- **A — 10 Profile (4 belegt + 6 neu) · 3 Duelle · 5 Artikel · 1 Ranking,**
  begonnen mit EINEM Beispiel-Beitrag je Format (Bremse aus Entscheidung 1).
- **B — kleiner starten:** 4 Profile (nur die belegten) · 1 Duell · 3 Artikel ·
  1 Ranking. Schneller live, weniger Recherche; das Ranking wird dünn.
- **C — anders zuschneiden:** David streicht und ergänzt die Namen und Themen
  direkt in §9.8 — die Mengen bleiben, die Auswahl ist seine.

---

## 11. Entscheidungen (David, 2026-09-08)

Zwei Runden, zwei Tabellen. Zuerst die **acht Fragen aus §10** (Konzeptrunde),
darunter in **§11.2** die **fünf Fragen aus §9.10** (Prototyp-Runde 1). §10 und
§9.10 bleiben als Protokoll stehen — dort stehen die Optionen, hier steht, was
gilt. **Sieben von acht Antworten folgen
der Empfehlung; eine weicht ab (6, Themenradar) und trägt dafür vier
ausdrückliche Leitplanken.** Damit war Phase 2 (Konzeption) abgeschlossen:
**Prototyp I0 konnte starten** — er ist gebaut und seit dem 2026-09-08
**freigegeben** (§11.2); **der Bau I1+ wartet weiter auf DB1, den Anwalt (§6)
und den Google-API-Schlüssel.**

| # | Frage | Entscheidung | Empfehlung war | Leitplanke |
| --- | --- | --- | --- | --- |
| 1 | Ort im Code | **Eigener Layer `insights`**, `requires: ['brand']`, genau EIN Vertrag zum brand-Layer | nach Empfehlung (A) | Die volle Rechnung aus §9.1 (5) wird bezahlt, nicht abgekürzt: `product.manifest.ts` · `apps/branding/site.manifest.ts` · `LAYER_ORDER` · Bilanz-Block · ESLint-Block · Schema-Parität-Soll · GDPR-Contributor. Der Vertrag liegt in `server/contracts/`, **nie** in `server/utils/` (Nitro auto-importiert das Verzeichnis; ein Re-Export dort stünde zweimal im Auto-Import) |
| 2 | Adressen | **Getrennte Datensätze, geteilte Vorlage:** `/insights` · `/insights/<slug>` · `/brands/<slug>` · `/duels/<a>-vs-<b>` · `/rankings` · `/topics/<slug>` | nach Empfehlung (A) | `/journal/` entfällt (alte, verworfene Benennung) · Duell-Slug **alphabetisch**, die Gegenrichtung antwortet 301 · Slugs bleiben einsprachig, die Sprache trägt das i18n-Präfix · `slugHistory` (≤ 5) in BEIDEN Marken-Tabellen ⇒ 301 bei Umbenennung. **DB1-Befund:** dieselbe Regel fehlt in `brand_publications` — s. §9.2 |
| 3 | Reichweitenmessung | **Plausible einschalten**, selbst gehostet unter `plausible.hawaii.studio`, **cookielos und ohne Banner** — wie pukalani.studio | nach Empfehlung (A) | **Erst Text, dann Schalter.** Der Datenschutz-Abschnitt gehört in die Entwurfs-Fassung (BS1 **R2**), der Schalter ist BS1 **R2c**; Faktenblatt-Zeile 13 + §4c und BS1 §1.1/§1.2 sind am 2026-09-08 nachgezogen („findet nicht statt" war falsch geworden). **Davids Handgriff:** neue Plausible-Site für `branding.supply` anlegen (die CE hat keine Sites-API) ⇒ neue Script-Id. „Meistgelesen" bleibt aus Runde 1 draußen |
| 4 | Übersetzen-Weg | **Eigener Redaktions-Endpunkt**, Ergebnis als bearbeitbarer Entwurf der zweiten Fassung; Drossel **10/Stunde + 50/Tag je Konto** | nach Empfehlung (A) | Öffentlich wird die zweite Fassung erst mit `translationReviewed === true`. Bewusst **nicht** der UGC-Weg: dessen `translations`-Spalte ist ein Cache für LESER, und ein Cache, den jemand von Hand nachbessert, ist keiner mehr — die nächste Änderung verwürfe die Redaktion |
| 5 | Newsletter | **Eigene Liste `insights_subscribers`** nach dem Warteliste-Muster (brand-015), Versand über `sendMail()` — **erst nach dem Launch** (Paket I5) | nach Empfehlung (A) | Die Warteliste SELBST wird nicht weiterbenutzt: eine Einwilligung gilt nur für das, wofür sie gegeben wurde. Berichtet wird ausschliesslich die **bestätigte** Zahl (`confirmedAt`) — die unbestätigte ist keine. Gate: Rechtstexte (BS1 R2) |
| 6 | Themenradar | **JETZT** — wie Entscheidung 6 vom 2026-09-07 es vorsah, nicht nach dem Launch | **abweichend** — B (nach dem Launch, lesend-und-verwerfend) | Vier Leitplanken, ausformuliert in **§9.6**: **(a)** kein Aggregieren von API-Daten (Policies **III.E.2**) — gespeichert werden je Video nur die öffentlichen Zahlen der API (Aufrufe, Likes, Kommentar-Zahl, Datum, Kanal), höchstens **30 Tage** (**III.E.4**) oder täglich neu; **unsere** Opportunity-Zahl wird daraus gerechnet und ist unsere Zahl · **(b)** **keine Kommentar-Texte, keine Nutzernamen** bis zur Anwaltsantwort (Block 3 der BS1-Anwaltsfragen) · **(c)** kuratierte Kanalliste statt `search.list` (100 Einheiten je Aufruf gegen 1 für `videos.list`/`playlistItems.list` — 10.000/Tag reichen für ~50 Kanäle) · **(d)** **I4 rückt vor I3** oder läuft parallel, **blockiert den Launch aber nicht**: ohne Radar kommen die Themen aus §9.8 von Hand |
| 7 | Ranking-Regeln | **Zehn Plätze, eingefroren, mit sichtbarem Stand**; eine Auffrischung ist eine **neue Ausgabe** (neuer Slug), die alte bleibt mit Hinweis und Link | nach Empfehlung (A) | Ein **Entfernen-Wunsch** nimmt den Platz heraus und rechnet die Liste **nicht** neu — die Lücke wird als **„auf Wunsch entfernt"** ausgewiesen. Das ist ehrlicher als eine stille Neunummerierung und beantwortet §8 Frage 9 |
| 8 | Launch-Inhalt | **10 Profile · 3 Duelle · 5 Artikel · 1 Ranking** — die Namen aus §9.8, die vier belegten Marken zuerst | nach Empfehlung (A) | Die Mengen-Bremse aus Entscheidung 1 bleibt: **kein Format geht live, bevor es EINEN vollständig redigierten Beispiel-Beitrag hat.** Der Launch beginnt mit vier Stücken — einem je Format —, nicht mit neunzehn |

### 11.1 Die eine Abweichung, und was sie im Dokument ändert

**Frage 6 — Themenradar jetzt statt nach dem Launch.** Die Empfehlung wollte
warten, weil beim Konkretisieren zwei Dinge auffielen: das Aggregations-Verbot
der YouTube-Policies (III.E.2) traf ausgerechnet unsere eigene Schutzmaßnahme,
und zwei der fünf Signale des Opportunity-Scores haben noch keine Datenquelle.
David hat anders entschieden — mit der Begründung, dass genau dieses Signal
branding.supply von einem gewöhnlichen Blog unterscheiden soll. Was daraus
folgt, steht nicht als Vorsatz da, sondern als Zuschnitt:

1. **§4.1 (d) ist geändert.** Der Halbsatz „Kommentare … nur aggregiert
   ausgewertet" ist gefallen — er beschrieb genau das, was III.E.2 untersagt.
   An seiner Stelle steht: keine Kommentar-Texte, keine Nutzernamen, bis die
   Anwaltsantwort da ist. Die Kommentar-**Zahl** bleibt erlaubt; sie ist eine
   öffentliche Kennzahl des Videos, keine Auswertung von Kommentaren.
2. **Der Score rechnet drei Signale und heißt auch so.** Suchnachfrage und
   Konkurrenz kommen dazu, wenn ihre Quelle existiert — nicht vorher.
3. **§9.9 ist umsortiert.** I4 steht vor I3 und darf parallel laufen; die alte
   Regel „nie VOR I3" ist damit aufgehoben. Der Ersatz ist beidseitig: der
   Radar hält den Launch nicht auf, und der Launch hält den Radar nicht auf.
4. **Das Gate ist geschärft, nicht entfernt.** Die Anwaltsantwort BI1-2 gilt
   für **alles über Metadaten hinaus**. Der Metadaten-Radar darf davor laufen;
   was er nicht darf, steht in (a) und (b).

### 11.2 Prototyp-Runde 1 (David, 2026-09-08)

Die fünf Fragen aus §9.10, beantwortet. **Vier von fünf folgen der Empfehlung;
eine weicht ab (2, Opportunity-Zahl) und trägt dafür drei Leitplanken.** Das war
Runde 1 der Prototyp-Phase; David hat die sechs Bildschirme auf Port 3013 danach
selbst geklickt und den Prototyp am **2026-09-08 FREIGEGEBEN** („so bauen") —
**Phase 4 ist damit durch**. Was den Bau I1+ noch aufhält, sind die drei Gates
aus §11.3, nicht die Form.

| # | Frage | Entscheidung | Empfehlung war | Leitplanke |
| --- | --- | --- | --- | --- |
| 1 | Wem gehört der Beleg-Riegel? | **Nach `core` ziehen:** `evidenceIsGrounded` und der Herabsetzungs-/Namensfilter (`createMarketDisparagementGuard`) wandern von `packages/market/shared` nach `packages/core/shared` | nach Empfehlung | **Die Namen verlieren das `market`-Präfix** — im Fundament-Layer wäre es eine Lüge. `market` **re-exportiert**, damit keine Aufrufstelle bricht; `insights` importiert später aus `core`, nicht aus `market` (CONCEPT A14: ein Produkt-Layer importiert keinen anderen). Eigenes Paket **I1a** (§9.9), es **läuft** und steht VOR I1 — als Fundament-Baustein darf es vor Davids Prototyp-Abnahme laufen, weil es auch ohne BI1 richtig ist |
| 2 | Heisst die Opportunity-Zahl „von 60"? | **Auf 100 normiert, mit Fussnote** | **abweichend** — „44 von 60 · 3 von 5 Signalen" | Drei Leitplanken kaufen die Ehrlichkeit zurück, die „von 60" mitbrachte: **(a)** die Fussnote nennt **immer**, aus wie vielen der fünf Signale gerechnet wurde („aus 3 von 5 Signalen") — Pflicht, nicht Zierde; **(b)** die Normierung ist eine **pure Funktion mit Test** (`insightsOpportunity`), kein Rechenweg in einer Vorlage; **(c)** kommen Signale dazu, **ändert sich die Skala nicht**, nur die Fussnote. Eine 44 bleibt damit über Monate dieselbe 44 |
| 3 | Gehört die Redaktion auf EINE Seite? | **Drei Adressen:** Liste, Editor, Radar | nach Empfehlung | §9.4 bleibt wie geschrieben. Die Untereinander-Ansicht war eine Prototyp-Hilfe, damit der Zusammenhang auf einen Bildschirm passt — sie ist kein Entwurf der Redaktions-Oberfläche |
| 4 | Beitrag ohne redigierte Zielsprache in der Journal-Liste? | **Bleibt sichtbar**, mit dem Hinweis „Nur auf English" | nach Empfehlung | Ein vorhandener Beitrag, den die Liste verschweigt, ist für den Leser nicht von einem fehlenden zu unterscheiden. Ausgeblendet wird er erst, wenn der **Sprachfilter ausdrücklich gesetzt** ist. „Redigierte Zielsprache" heisst `translationReviewed === true` (§11 Frage 4 der Konzeptrunde) — eine unbestätigte Maschinenfassung zählt nicht als Fassung |
| 5 | Reicht der Korrekturweg als Knopf am Seitenende? | **Ja — auf Profil, Duell und Ranking**, jeweils am Seitenende | nach Empfehlung | Drei Seiten, eine Stelle, ein Formular (`insights_corrections`, §9.3): überall dort, wo über eine **fremde** Marke etwas behauptet wird, steht der Weg zum Widerspruch am selben Ort. Kein eigener Menüpunkt, kein Banner. Kommt mit **I3** |

### 11.3 Was jetzt bei David liegt

Der Prototyp ist freigegeben (2026-09-08). Was hier steht, hält die Form nicht
mehr auf, wohl aber den Code: **drei dieser Punkte sind die Gates des Baus I1+**
— der **API-Schlüssel** (I4), der **Anwaltstermin** (I3) und der **DB1-Rest**.

- **Google-Cloud-Projekt mit YouTube-Data-API-Schlüssel** — ERLEDIGT 2026-09-10:
  `NUXT_INSIGHTS_YOUTUBE_KEY` liegt in der Server-.env von branding.supply,
  die Prod-Migration insights-004 ist gefahren, der Radar läuft täglich.
  Offen ist nur Davids Blick auf die Kanalliste (Ogilvy und Harry Dry laden
  seit Jahren nichts hoch und liefern seit dem Alters-Deckel nichts mehr).
- **Neue Plausible-Site für `branding.supply`** — Gate von BS1 R2c (die CE-
  Ausgabe hat keine Sites-API, das ist ein Klick in der Oberfläche).
- **Anwaltstermin** — die sechs Fragen aus Marktvergleich Anhang G plus die
  vier aus §4.3; ohne die Antworten zu 3 (Score fremder Marken) und 4
  (Verantwortlicher) geht **kein Markenprofil live** (§6). Die YouTube-Frage
  (BI1-2) ist Gate nur für alles über Metadaten hinaus.
- **DB1-Rest** (D4/D5) — BI1 erbt von dort die öffentlichen Marken-Seiten.
- ~~**Prototyp-Abnahme I0**~~ — **ERLEDIGT 2026-09-08:** David hat die sechs
  Bildschirme auf Port 3013 geklickt und freigegeben („so bauen"). Phase 4 des
  Workflows ist durch; Runde 1 der Korrekturen steht in §11.2.
- **Products-Seite** — der Nav-Punkt „Products" zeigte im Klickdummy auf
  `/products` und ist seit dem 404-Audit ausgeblendet. Entschieden am
  2026-09-08: **eigenes kleines Vorhaben NACH Insights**, geparkt als **PS1**
  in [OPEN-ITEMS.md](../OPEN-ITEMS.md) — es gehört nicht in BI1.

---

## Anhang — Quellen dieser Runde

Nur Belege, keine Empfehlung ohne Quelle. Abgerufen am 2026-09-08.

| Aussage in diesem Dokument | Quelle |
| --- | --- |
| YouTube Data API v3: die genannten Endpunkte kosten je 1 Einheit; ein Projekt hat „100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints" | https://developers.google.com/youtube/v3/determine_quota_cost |
| Speicherfrist für API-Daten außer Analytics/Statistiken: höchstens 30 Kalendertage (III.E.4); **Aggregations-Verbot** außer über Kanäle desselben Content Owners (III.E.2) | https://developers.google.com/youtube/terms/developer-policies |
| Resend Broadcasts: Massen-Mails mit Segmenten und eigener API; Double-Opt-in in der Dokumentation nicht beschrieben | https://resend.com/docs/dashboard/broadcasts/introduction |
| listmonk: selbst gehostet, einzelne Binärdatei + Postgres, AGPLv3 | https://listmonk.app/docs/ |
| listmonk: Listen wahlweise Single- oder **Double-Opt-in**, Abonnenten-Zustände unconfirmed/confirmed/unsubscribed | https://listmonk.app/docs/concepts/ |
