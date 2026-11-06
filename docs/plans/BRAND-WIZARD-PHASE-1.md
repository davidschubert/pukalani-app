# Brand-Wizard — Phase 1 „Fundament"

Stand: 2026-08-28 · Status: **FINAL ABGENOMMEN UND BAUREIF** (Audit 6).
Reihenfolge: P0, P0b und P1a PARALLEL · P1b nach Abnahme von P0b UND
P1a · P1c nach P1b. Fünf code-geprüfte Audits eingearbeitet (§9c–§9f).
Autor: Claude, auf Davids Anweisung.

## Feststehende Entscheidungen (David, 2026-08-27)

Diese drei Punkte sind entschieden und werden hier NICHT neu verhandelt
(bei Merge ins DECISION-LOG übertragen):

1. **„Frei bauen, bezahlt anwenden."** Das Fundament (Purpose/Vision/Mission,
   Werte, Archetyp + Stimme, Manifest, optional Name) ist kostenlos und dient
   als Trichter zum Studio-Erstgespräch. Bezahlt wird die ABLEITUNG (Brand
   Book, Farb-/Typo-System, Theme, lebende Site — Phase 2). Die Bezahlschranke
   ist **von Tag eins sichtbar** (Vorschau der Ableitung am Fundament-Ende),
   damit „kostenlos" nicht zur Markterwartung wird.
2. **Beide Zielgruppen, per Weiche getrennt** — Gründer/junge Firmen UND
   Bestandsfirmen im Rebrand. Bewusst gegen den schmaleren Zuschnitt
   entschieden; der Preis (jede Frage in zwei Fassungen, neue Rebrand-Fragen)
   ist eingerechnet.
3. **Eigener Produkt-Layer** `packages/*` im Monorepo (Silo-Regel: eigener
   Layer, KEIN eigenes Deployment ohne kundenförmigen Grund). Erbt
   Themes-Engine und `aiComplete`-Naht, Manifest-Ordnung — **KEIN Billing
   in Phase 1** (Audit 3: für Vorschau + Gesprächs-CTA ungebraucht; kommt
   erst mit der Phase-2-Monetarisierung).

Grundlage: Analyse der 7 Hawaii-Studio-Formulare (Drive-Ordner „Formulare",
gelesen 2026-08-27) — Artefakt „Sieben Formulare, ein Produkt"
(claude.ai/code/artifact/c771cfba-25af-4adc-90bc-859f56744238). Kernbefunde:
287 Fragen / 86 Abschnitte, Zeitangaben Faktor ~3 zu knapp, ~1/3 der Fragen
mehrfach gestellt, ~3/5 aus Kontext vorbeantwortbar, Archetypen-Skalen ohne
Auswertung, keine Verzweigung, am Ende kein Ergebnis-Artefakt.

## 1. Zielbild Phase 1

Ein geführter, KI-gestützter Wizard: aus **URL + drei Sätzen + den scharfen
Menschen-Fragen** entsteht ein vollständiges **Brand-Foundation-Dokument** —
kostenlos, mit ~45 Minuten und ~40 menschlichen Eingaben als
**HYPOTHESEN** (Audit 2: unbelegt, bis der Nutzertest sie misst — allein
D hat 8–12 Paarvergleiche, E 23 Statements; §9b.1 „Vollständigkeit
gewinnt" macht sie ausdrücklich zu Richtwerten, das Produktziel der Beta
ist „Median aktive Zeit MESSEN". P0 liefert dafür die
**Interaktionsbilanz je Pfad**: minimale/erwartete/maximale Antwortzüge
für Gründer/Rebrand × mit/ohne Naming × Solo/Team × mit/ohne
Untermarken × normale/vertiefte Runde). **VOLLSTÄNDIGKEITS-VERTRAG
(David, 2026-08-28): Am Ende sind die 287 Fragen des Original-Katalogs
KONTEXTBEZOGEN BEANTWORTET — nicht nur die ~40 getippten.** Die ~40 sind
die Tipparbeit, nicht der Inhalt: Was der Mensch nicht selbst
beantwortet, leitet George aus dem Kontext ab und legt es als Entwurf
zur Bestätigung vor. Nachprüfbar über die **Abdeckungs-Matrix** (P0):
jede der 287 Original-Fragen erhält genau ein Schicksal — menschlich
beantwortet · KI-abgeleitet · als Duplikat verschmolzen · bewusst
gestrichen MIT dokumentiertem Grund (z. B. Projekt-Logistik aus
Formular 01). Kein Slot des Original-Katalogs geht stillschweigend
verloren. Und am Ende einer
**live gerenderten Vorschau der bezahlten Ableitung** (Themes-Engine) plus
Erstgespräch-CTA.

**Erfolgskriterien** (messbar, s. §7): Fundament-Fertigstellungsquote;
**Entwurf-Übernahmequote** (Anteil unverändert übernommener KI-Entwürfe vs.
umgeschrieben — DIE Kernmetrik, denn sie beantwortet die offene Frage, ob die
KI-Entwürfe gut genug für eine spätere Bezahlschranke sind); Klicks auf
Erstgespräch und auf die Ableitungs-Vorschau.

## 2. Nicht-Ziele Phase 1

- **Keine Ableitungs-Produktion** (Brand Book, Theme-Erzeugung, Site) — nur
  die VORSCHAU. Ableitung = Phase 2.
- **Kein Logo.** Bewusst nie: Design-RICHTUNG statt Logo (Qualität + Recht).
- **Keine Bezahlabwicklung.** Die Schranke ist sichtbar (Text + Vorschau),
  dahinter Erstgespräch/Warteliste — kein Stripe-Pfad in Phase 1.
- **Kein White-Label in Phase 1** — aber als SPÄTERER TIER fest vorgesehen
  (David, 2026-08-27): eine Agentur mit eigenem Host, Theme und
  Persona-Namen ist über die BESTEHENDE Mandantenfähigkeit eine Community
  mit aktiviertem Brand-Produkt — ein Preis-Tier, kein Umbau. Heutige
  Vorkehrungen dafür (mehr nicht): mehrere Profile je Konto +
  Persona-Token (§3b).
- **Formular 01 (Client Onboarding) bleibt außen vor** — das ist
  Projektaufnahme fürs Studio (Budget/Hosting/DSGVO), ein eigenes Werkzeug
  neben dem Wizard, kein Fundament-Baustein.
- **PDF-Export später.** Phase 1: Ergebnis als Seite + teilbarer Link.

## 3. Die Kernbewegung (jeder Baustein identisch)

Heute laufen über die 7 Formulare drei verschiedene Muster; der Wizard nutzt
EINE Bewegung, die der Nutzer nach dem ersten Baustein kennt:

1. **Kontext** (KI) — was aus URL/Branche/bisherigen Antworten ableitbar ist,
   wird geholt, nicht gefragt.
2. **Provokation** (Mensch) — 3–5 scharfe Fragen, die nur er beantworten kann.
3. **Entwurf** (KI) — ein vollständiges, benanntes Ergebnis. Bewusst noch
   falsch; Menschen korrigieren lieber, als von null zu formulieren.
4. **Korrektur** (Mensch) — Entwurf editieren, nicht Leerfelder füllen.
5. **Festlegung** — Artefakt entsteht; die bestehende Konfidenz-Skala („Wie
   sicher fühlst du dich?") wird zur **Weiche**: ≤2 ⇒ Vertiefungsrunde
   (weitere Provokationen + neuer Entwurf), ≥4 ⇒ weiter.

Die **Lehrblöcke mit Gegenbeispiel** („Was Werte SIND / NICHT sind",
„Manifest vs. Mission" mit Vorher/Nachher, die Marken-Beispiele) bleiben
erhalten — als eingeschobene, überspringbare Inhalte vor der Provokation.
Sie sind der Teil, den ein Sprachmodell nicht liefert, und der Beleg der
Studio-Kompetenz mitten im Trichter.

## 3b. Bedienkonzept: George, das Slot-Modell und drei Zonen (David, 2026-08-27)

Davids Vorgabe, gemeinsam geschärft — das ist die FORM der Kernbewegung:

- **Persona:** Der Wizard tritt als benannter **digitaler Markenberater**
  auf (Arbeitsname „George" — Name wird in P0 geprüft: Markenrecht, Wirkung
  de/en, Passung zum Pukalani-Archetyp; unser eigener Naming-Baustein ist der
  Testlauf). Der Name ist von Tag eins ein **konfigurierbares Persona-Token**
  (app.config + i18n-Parameter), NIE hartkodiert in Texten — Voraussetzung
  für den späteren White-Label-Tier.
- **Drei Zonen:** links der **Fortschritt** (je Schicht prozentual + was als
  Nächstes ansteht) · in der Mitte das **wachsende Brand-Dokument als Bühne**
  (immer sichtbar, direkt editierbar — man hat etwas zu verlieren) · rechts
  **George** als Chat. George führt und kommentiert; redigiert und verglichen
  wird auf der Bühne, nicht im Chatfenster.
- **Slot-Modell:** Jede Schicht ist eine definierte Menge FELDER (Slots).
  George füllt Slots — durch Fragen ODER durch Ableitung aus schon
  Gesagtem. Die nächste Frage wählt er adaptiv nach höchstem
  Informationswert für die offenen Slots; wer viel erzählt, wird weniger
  gefragt. Der Fortschritt ist ehrlich: gefüllte Slots ÷ alle Slots der
  Schicht, nicht „Frage 12 von 40".
- **Antwortformen:** strukturierte Antwort-Chips — Einzelwahl mit
  Empfehlung-zuerst, Mehrfachwahl, oder Präzisions-Freitext; Paarvergleich
  (D) und Konfidenz-Weichen sind Spezialfälle davon. Freie Rückfragen an
  George sind jederzeit möglich („Was heißt Positionierung?").
- **Gestaffelte Wizards:** Phase 1 (Foundation + verbale Identität) →
  Phase 2 (Brand Design, Book, Kit) → Phase 3 (Experience) — jeder Wizard
  setzt den Abschluss des vorigen voraus; Rücksprünge nach oben propagieren
  versioniert nach unten.
- **Leitplanke für P0:** „Branded Interactions" (Marco Spies, Verlag Hermann
  Schmidt) — unsere Slot-Struktur gegen den BIxD-Prozess prüfen (Business/
  Marke/Nutzer verstehen → digitale Markenerlebnisse gestalten). Leitplanke,
  nicht Kopiervorlage.

**Interaktions-Regeln (David, 2026-08-27 — acht Fragen + eine Bestätigung ⇒ neun Regeln):**

1. **Einstieg — Hybrid:** George begrüßt in 2–3 Sätzen und legt EINE
   kompakte Startkarte in den Chat (URL optional, Branche, „was macht ihr",
   für wen); ein Absenden, danach stellt George die Weiche konversationell.
2. **Navigation — linear vorwärts, frei zurück:** vorwärts nur sequenziell
   (Abhängigkeiten), jeder ABGESCHLOSSENE Baustein im Fortschritt klickbar
   und änderbar; Änderungen propagieren versioniert nach unten, George sagt
   an, was sich neu berechnet.
3. **Korrektur — Bühnen-Edit + Neu-Entwurf:** Entwürfe sind auf der Bühne
   direkt editierbar; je Slot ein „George, versuch's nochmal" mit optionalem
   Hinweis („wärmer", „kürzer"), das den GANZEN Slot neu entwirft.
   Feingranulares Chat-Editing mit Diffs ist bewusst Phase 2. Entwürfe sind
   bis zur Bestätigung SICHTBAR als George-Entwurf markiert — auch technisch
   nötig, weil die Übernahmequote den Bestätigungs-Moment braucht.
4. **Mobile — Chat-first:** George ist mobil der Vollbild-Standard, die
   Bühne ein hochziehbares Sheet, der Fortschritt eine schmale Leiste;
   längeres Redigieren empfiehlt George ehrlich für den Desktop (Stand ist
   gespeichert).
5. **„Weiß ich nicht"-Chip an JEDER Frage:** George entwirft dann selbst aus
   dem Kontext („Ich versuche es mal: … — trifft das?") und markiert den
   Slot intern als unsicher für die Vertiefungsrunde. Niemand bleibt
   stecken, nichts geht verloren.
6. **Lehrblöcke — Kurzfassung + Abruf:** 2–3 Sätze Kernaussage vor der
   Provokation, der volle Block (Beispiele, Gegenüberstellungen) hinter
   „Zeig mir mehr" und jederzeit per Rückfrage.
7. **George-Ton — warm, aber knapp:** max. 2–3 Sätze pro Zug, gelegentlich
   ein Augenzwinkern, JEDER Zug endet in einer Frage oder einem nächsten
   Schritt; kein Smalltalk, keine Wiederholungen. (Prompt-Regel in P0.)
8. **Konfidenz — drei natürliche Chips** statt 1–5-Skala: „Passt" ⇒ weiter ·
   „Fast — eine Sache stört" ⇒ gezielte Nachbesserung · „Nochmal von vorn" ⇒
   Vertiefungsrunde. Mappt 1:1 auf die Weiche, fühlt sich nicht nach
   Prüfung an.
9. **Alle fünf Schichten von Anfang an SICHTBAR, sequenziell
   freigeschaltet** (Davids Bestätigung 2026-08-27): der Fortschritt links
   zeigt das komplette Schichtenmodell inkl. der Phase-2/3-Schichten —
   die künftigen als sichtbar-GESPERRT mit dem Grund („baut auf … auf").
   Eine Schicht wird abgeschlossen, bevor die nächste startet; ZURÜCK in
   Abgeschlossenes ist jederzeit erlaubt (Regel 2). Nebeneffekt: die
   gesperrten bezahlten Schichten im Fortschritt SIND die sichtbare
   Bezahlschranke — der Nutzer sieht von Minute eins, wohin die Reise geht.

Bewusst NICHT in Phase 1: Sprach-Eingabe (OS-Diktat der Geräte reicht;
eigene Voice-Integration ggf. Phase 2) und Chat-Diff-Editing (s. Regel 3).

## 3c. Ton- und Erlebnis-Prinzipien (David, 2026-08-27)

Davids Vorgaben, verbindlich für P0 (jede Frage wird dagegen geprüft):

- **Professionell UND einfach** — die Hürde zur Nutzung so niedrig wie
  möglich. Einfache, verständliche Sprache, nie kindlich; Fachbegriffe
  benutzt George nur, wenn er sie in einem Halbsatz erklärt oder auf
  Rückfrage erklären kann.
- **Kompakt gefragt:** eine Frage pro Schritt, kurz formuliert, mit
  Antwort-Chips wo möglich. Niemand soll sich überfordert fühlen — im
  Zweifel fällt eine Frage weg oder wird ableitbar (Slot-Modell).
- **Spielerisch, mit Freude** — aber ohne Gamification-Attrappen (keine
  Punkte, keine Abzeichen: das unterliefe „professionell"). Die Freude
  kommt aus dem DING selbst: das Dokument wächst sichtbar auf der Bühne,
  jeder Baustein-Abschluss ist ein kleiner Moment (das Artefakt „klappt zu"
  und reiht sich ein), und eingebaute Erkenntnis-Momente tragen — allen
  voran der Außenbild-Reveal in D („so wirkt ihr heute — so seht ihr euch")
  und die Naming-Prüf-Tabelle in F.
- **Ehrliche Zeitangaben** je Baustein (die Formulare lagen Faktor 3
  daneben — genau das erzeugt Überforderungsgefühl), Pausieren jederzeit,
  Stand bleibt gespeichert.
- **Mehrsprachigkeit** (DREHT die frühere „Deutsch zuerst"-Zeile, Davids
  Entscheidung): Hauptsprache **Englisch**, zweite Sprache **Deutsch**;
  die Architektur plant WEITERE Sprachen fest ein (z. B. Spanisch,
  Koreanisch) — Sprachliste ist Konfiguration, nie Annahme „genau zwei";
  keine Sprach-Hartkodierung in Prompts, Slots oder Registry (George
  antwortet in der Wizard-Sprache; RTL bleibt außen vor, bis eine
  RTL-Sprache ansteht). Das Monorepo ist heute de+en — neue Sprachen sind
  ein i18n-Ausbau, kein Umbau.

### Visuals je Fragetyp (Empfehlung, von David angefragt)

Regel: **Eine Infografik dort, wo sie eine ENTSCHEIDUNG erklärt — nie als
Dekoration. Tabellen nur als ERGEBNIS, nie als Eingabeformular. Metriken
bleiben intern** (Slots, Übernahmequote), der Kunde sieht sie nicht.

| Stelle | Visual | Warum |
| --- | --- | --- |
| **B2 Architektur** | Diagramm der 4 Modelle mit bekannten Beispielen (Apple vs. P&G) | DER Fall für eine Infografik: abstraktes Konzept, eine Entscheidung — ohne Bild überfordert genau diese Frage |
| **D Paarvergleich** | Bild-Karten je Archetyp-Paar (Stimmung + 2 Beispielmarken) statt Textwüste | Persönlichkeit entscheidet man visuell, nicht über Adjektivlisten |
| **D/Ergebnis Richtungswahl** | LIVE gerenderte Theme-Vorschauen (Themes-Engine) | Farbwelt wählt man am Original, nie an Hex-Codes |
| **F Prüf-Ergebnis** | Häkchen-Tabelle je Namenskandidat (Domain, Handles, Marke, Sprachen) | Ergebnis-Tabelle = Belohnung; die einzige gute Tabelle im Wizard |
| **Fortschritt links** | Das Schichtenmodell selbst als Grafik | Der Kunde versteht nebenbei, WO er im Prozess steht |
| Skalen (Konfidenz u. a.) | Benannte Chips statt nackter 1–5-Zahlen | Zahlen ohne Anker fühlen sich nach Prüfung an |
| Werte-Auswahl (C) | Gruppierte Wort-Chips | Keine Tabelle, kein Formular-Gefühl |
| Wettbewerbs-Landkarte (A) | BEWUSST NICHT in Phase 1 (2×2-Map wäre hübsch, ist aber Beratungs-Optik und lädt zum Verzetteln ein) | Steckbriefe reichen; Map ggf. Phase 2 |

## 3d. UI-/UX-Vertrag (David + Claude, 2026-08-28 — verbindlich;
Abnahme des P0b-Prototyps vor P1b (Audit 6 vereinheitlicht die
Reihenfolge). P0b-ORT: der Prototyp entsteht IM minimalen
`packages/brand`-Gerüst mit statischen Daten — so stimmt „nichts wird
zweimal gebaut" wörtlich; P1c übernimmt ihn, statt ihn zu ersetzen)

**Leitbild:** Der Wizard sieht weder wie ein langes Formular noch wie ein
gewöhnlicher Chatbot aus — er fühlt sich an wie eine **ruhige, hochwertige
Strategiewerkstatt**: Das entstehende Brand-Dokument ist der Mittelpunkt,
George begleitet, Erklärung erscheint genau dann, wenn sie gebraucht wird.
Grundsatz: **minimalistisch an der Oberfläche, informativ in der Tiefe**
(drei Ebenen: Frage+Antwort → kurze Erklärung → voller Lehrblock).

### Visuelle Grundidee

Editoriale, warme Premium-Ästhetik: viel Weißraum · sehr gute Typografie ·
ruhige natürliche Grundfarben · EINE prägnante Akzentfarbe für Aktionen ·
dünne Linien für TRENNER · **Karten dagegen im modernen
Soft-Look (präzisiert Runde 8, Davids Referenz): stark gerundet
(30 px als **Squircle** — natives `corner-shape: superellipse(2)` mit
border-radius-Fallback, Runde 8b), randlos — **Trennung TONAL statt
per Schatten (Runde 9, Davids Referenz): der Grund ist helles Grau, die
Karten sind heller als der Grund, Schatten nur ein Hauch Ambient**. Dazu
als Signature: **Dot-Matrix-Ziffern** (Runde 10: SCHRIFT-TRIAS fest = **Geist Sans**
für UI, **Geist Mono** für technische Werte, **Geist Pixel** für
Zahlen-Signature — nur diese drei; Doto bleibt Fallback) für Prozent,
Zähler und Scores, ein **Acid-Pop-Token** für Mikro-Chips (Empfehlung),
Rail-Einträge als Pills, und Farbe lebt später NUR in den
Grain-Gradient-Inhaltskarten (Ergebnis/Vorschau)** ·
wenige hochwertige Illustrationen. VERBOTEN: futuristische KI-Verläufe, übermäßige
Chatblasen, Punkte/Abzeichen/Erfolgsfeuerwerke. Wirkung: hochwertiges
digitales Arbeitsbuch mit persönlicher Beratung, kein SaaS-Dashboard.

**FÄRBUNGS-ENTSCHEID (2026-08-28, REVIDIERT die frühere „progressive
Markenfärbung"):** Der Wizard behält durchgehend ein **stabiles
Pukalani-Erscheinungsbild** — Brand-Farben erscheinen während der
Bausteine NUR in den isolierten Vorschau-iframes (Orientierung geht nie
verloren). Der emotionale Payoff sitzt am Ende: Das **ERGEBNIS-Dokument**
(Leseansicht + Share-Ansicht, nach der Design-Wahl) rendert in der
gewählten Marken-Richtung — dort ist es kein Werkzeug mehr, sondern die
Markenunterlage selbst.

**ILLUSTRATIONS-ENTSCHEID:** abstrakte geometrische LINIEN-Illustration
(keine Figuren/Maskottchen, ~1,5-px-Strich, Farben aus UI-Tokens) — als
**parametrische SVGs gebaut, nicht per Bild-KI generiert** (Konsistenz,
Dark Mode gratis, White-Label-umfärbbar, kein KI-Grafik-Look in einem
Marken-Glaubwürdigkeits-Produkt; Diffusions-KI höchstens fürs Moodboard).
Genau DREI Orte: Leerzustand „Meine Brands", Kapitelabschluss,
Fehler-/Offline-Zustand. Basis-Set entsteht im P0b-Prototyp (Claude),
Feinschliff David.

### Desktop-Layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Brandname   Gespeichert ✓   Inhaltssprache   Hilfe          Konto  │
├───────────────┬──────────────────────────────────┬──────────────────┤
│ Fortschritt   │ Das Brand-Dokument               │ George           │
│ ● Kontext     │ Purpose                          │ kurze Einordnung │
│ ● Purpose     │ ┌──────────────────────────────┐ │ EINE Frage       │
│ ◐ Werte       │ │ Entwurf von George           │ │ pro Zug          │
│ ○ Stimme      │ │ direkt editierbarer Text     │ │ Antwort-Chips    │
│ ○ Manifest    │ └──────────────────────────────┘ │ Freitext         │
│ ───────────   │ [Neu versuchen] [Bestätigen]     │ „Weiß ich nicht" │
│ 🔒 Design     │                                  │                  │
│ 🔒 Experience │                                  │ (einklappbar)    │
└───────────────┴──────────────────────────────────┴──────────────────┘
```

Links Orientierung/Fortschritt · **Mitte das wachsende Ergebnis — die
wichtigste Zone**, breit genug für echte redaktionelle Arbeit · rechts
führt George durch genau EINE Entscheidung, Panel einklappbar. Bearbeitet
wird DIREKT im Dokument, nie über umständliche Chat-Anweisungen.
**Responsive:** kleine Laptops — Fortschritts-Leiste klappt zu Icons ·
Tablet — „Dokument" und „George" als zwei klar erkennbare Ansichten ·
Mobile — George ist der Einstieg, aber NIE chat-only: das Dokument öffnet
als Vollbild-Sheet und ist dort VOLLSTÄNDIG bearbeitbar. „Für längeres
Redigieren empfehlen wir Desktop" ist erlaubt — **Mobile ist nie eine
Sackgasse**: jede Aufgabe ist dort grundsätzlich abschließbar.

### Hauptansichten

1. **„Meine Brands":** ruhige Brand-KARTEN (kein Datengrid): Name +
   optionale URL, Pfad (Gründung/Rebrand), aktueller Baustein, Fortschritt
   + realistische Restzeit, zuletzt bearbeitet, „Weiterarbeiten";
   sekundär: umbenennen/löschen/teilen. Leerzustand als Einladung:
   „Lass uns deine erste Brand aufbauen. Du kannst jederzeit pausieren —
   dein Stand bleibt gespeichert."
2. **Neue Brand:** sehr kurzer Start — Arbeitstitel, Inhaltssprache, URL
   optional, Gründung/Rebrand, Name vorhanden?, Solo/Team; Datenschutz +
   Zweck in einem Satz. KEIN mehrseitiges Tutorial vor dem Start.
3. **URL-Analyse SICHTBAR, nicht heimlich:** „Wir lesen gerade deine
   öffentliche Website" mit sichtbaren Phasen und Abbrechen; gefundene
   Aussagen nach Quelle gekennzeichnet („Von deiner Website übernommen"),
   je akzeptieren/bearbeiten/verwerfen; bei Fehlern immer manuell weiter.
   Vertrauen entsteht, indem Ableitungen nie als Tatsachen auftreten.
4. **Wizard-Arbeitsbereich** (Kernscreen, drei Zonen): pro Interaktion
   sichtbar NUR — kurze Frage · optional ein Satz „Warum wir das fragen" ·
   Chips/Textfeld · „Weiß ich nicht" · „Beispiel zeigen"/„Mehr erfahren".
   Lange Lehrinhalte in aufklappbarem Panel, nie zwischen Frage und
   Antwort.
5. **Kapitelabschluss:** komprimierte Zusammenfassung · offene/unsichere
   Punkte · geschätzte Auswirkung auf spätere Kapitel · „Kapitel
   bestätigen" / „Noch etwas ändern". Keine künstliche Feier — EINE kurze,
   subtile Animation: das Kapitel ordnet sich sichtbar ins Dokument ein.
6. **Ergebnis + Brand Story:** wie eine veröffentlichbare Markenunterlage,
   nicht wie ein Wizard — Inhaltsverzeichnis, Story als Einstieg, klare
   Kapitel, ruhige Leseansicht OHNE George, „Bearbeiten"/„Teilen"/„Nächste
   Phase", gesonderter Bereich für unsichere Aussagen; NIE interne Chats,
   KI-Metadaten oder technische Statuswerte.
7. **Design-Vorschau:** 2–3 Richtungen als echte ANWENDUNGS-Ausschnitte
   (Website-Hero, Überschrift+Fließtext, Button, Zitat, Farbrampe) — nicht
   nur Farbfelder. Jede Richtung: verständlicher Name, kurze strategische
   Begründung („Passt zu deiner Brand, weil …"), wählbar, transparent als
   Phase-2-Vorschau gekennzeichnet.
8. **Share-Dialog:** Vorschau „So sehen Empfänger das Dokument",
   Ablaufdatum, Link kopieren/widerrufen, klarer Hinweis was geteilt wird
   + Bestätigung, dass Chats und Entwürfe NICHT enthalten sind.

### Zustandsmatrix je Inhalts-Slot

| Zustand | Darstellung und Aktion |
| --- | --- |
| Leer | dezenter Platzhalter, George stellt die nächste Frage |
| Wird erstellt | Skeleton/Streaming mit stabiler Höhe, Abbrechen möglich |
| KI-Entwurf | sichtbar „Entwurf von George" (Kennzeichen + Icon + Text — nie nur Farbe) |
| Vom Nutzer geändert | „Von dir bearbeitet" |
| Bestätigt | ruhiger Haken, keine laute Erfolgsfarbe |
| Veraltet | Hinweis, WELCHE frühere Änderung diesen Inhalt betrifft |
| Fehler | verständliche Erklärung; erneut versuchen ODER manuell schreiben |

### Pflicht-Funktionen

Durchgängiges Autosave mit Status · **Undo/frühere Fassung wiederherstellen
bereits in Phase 1** (die Generations-Historie §6 trägt das; Chat-Diffs
bleiben Phase 2) · Regeneration mit Richtungs-Chips („kürzer", „mutiger",
„konkreter") + optionalem eigenem Hinweis · manuelle Bearbeitung immer
unabhängig von George · Fortsetzen auf anderem Gerät · Wiederherstellung
nach Verbindungsabbruch · laufende KI-Generierung abbrechbar · manueller
Weg bei KI-Ausfall · Warnung vor Auswirkungen beim Ändern bestätigter
Kapitel · Review-Liste vor dem Endergebnis · Tastaturbedienung für Chips
und Navigation, vollständig mauslos bedienbar · Read-only-Empfängeransicht
für Share-Links.

### Fortschritt menschlich, nicht technisch

Hauptbotschaft: **„Werte · 4 von 6 Grundlagen geklärt · ungefähr
8 Minuten"** — ein Prozentwert nur ergänzend (adaptive Fragen machen
„63 %" präziser wirkend, als der Prozess ist; präzisiert die frühere
„prozentuale Anzeige"-Vorgabe). Die gesperrten bezahlten Schichten bleiben
sichtbar, treten aber visuell zurück: Zukunftsausblick, keine
Dauerwerbefläche.

### George als Interface-Figur

Abstraktes SIGNET/Monogramm statt menschlichem KI-Porträt · keine
künstlichen Tippverzögerungen · keine wiederholten Begrüßungen · kein
Lob-Spam („Großartige Antwort!") · benennt Unsicherheit offen ·
widerspricht gelegentlich begründet · max. 2–3 Sätze · erklärt, WARUM er
etwas ableitet · fachliche Hilfe kontextbezogen abrufbar. Grundsatz:
**George moderiert, aber das Brand-Dokument besitzt die Bühne.**

### KI-Vertrauen im UI

Bei jeder abgeleiteten Aussage erkennbar: aus welcher Eingabe sie
entstand · ob sie von der Website stammt · ob sie Vermutung ist
(`observed | inferred`, §6) · wann eine spätere Änderung sie veraltet hat.

### Barrierefreiheit (Mindeststandard)

**WCAG 2.2 AA** · sichtbarer Tastaturfokus · ausreichende Kontraste ·
keine reine Farbkommunikation · Screenreader-Beschriftungen · 200 %-Zoom
ohne Funktionsverlust · `prefers-reduced-motion` · ausreichend große
Touch-Ziele.

### Paywall-Ethik

Attraktiv, nie manipulativ: klar erklären, was Vorschau ist · KEINE
künstliche Unschärfe über erarbeiteten Ergebnissen · Foundation bleibt
vollständig nutzbar · CTA und Rahmen transparent · gesperrte Schritte
erklären ihren Mehrwert.

### Kollaborations-Grenze Phase 1 (explizit)

EIN aktiver Bearbeiter · Share-Link nur lesend · keine Kommentare · kein
gleichzeitiges Editing — sonst entsteht unbeabsichtigt ein deutlich
größeres Produkt.

### Ergänzungen (Claude, 2026-08-28)

- **Share-Empfänger-Erlebnis:** der Link braucht og:title/og:description
  (Messenger-Vorschau) trotz `noindex` — die erste Sekunde beim Empfänger
  gehört zum Produkt.
- **Print-CSS der Leseansicht:** die Markenunterlage muss sauber
  druck-/PDF-fähig sein (Browser-Print reicht in Phase 1).
- **Skeleton- und Fehler-Design der Vorschau-iframes selbst** (ladende
  oder scheiternde Richtungen dürfen die Ergebnis-Seite nicht brechen).

### P0b — UX-Prototyp (eigenes Arbeitspaket; Abnahme VOR P1b)

Weg (entschieden): **klickbarer HTML-Prototyp von Claude mit echten
Nuxt-UI-Komponenten, David verfeinert am lebenden Objekt** — der Prototyp
ist die komponententreue Vorlage für P1b, nichts wird zweimal gebaut.
Liefergegenstände: (1) Screen-/Routenübersicht · (2) Low-Fi-Wireframes
Desktop/Tablet/Mobile · (3) kompletter klickbarer Ablauf „Neue Brand" →
Baustein-Bestätigung · (4) Komponentenliste + Zustandsmatrix ·
(5) Regeln für Typo/Farben/Abstände/Animation/Icons · (6) Fehler-/Lade-/
Offline-/Wiederaufnahme-Zustände · (7) Accessibility-Anforderungen ·
(8) Empfängeransicht des Share-Links · (9) Usability-Test mit ~5 Personen
aus der Beta-Einladungsliste · (10) Abnahme durch David.
**Der Test misst Verständnis, nicht Schönheit:** Wo antworte ich? Wo
bearbeite ich? Was ist Entwurf, was bestätigt? Wie komme ich zurück? Was
passiert, wenn ich Früheres ändere? Was erhalte ich am Ende?

## 3e. Frontend-/API-Vertrag (2026-08-28 — die drei Entscheidungen sind
gefallen: eigener Vollbild-Workspace · kein Offline-Editing in Phase 1 ·
Marken-Optik über gescopte Preset-Tokens)

### Routen & Layout (ENTSCHIEDEN: eigener Vollbild-Workspace)

`/dashboard/brands` (Meine Brands — als Modul in der Dashboard-Shell) ·
`/dashboard/brands/new` (Anlage) · `/brand/:profileId/:stepKey`
(**eigener Vollbild-Workspace mit eigenem Layout** — die Dashboard-Sidebar
würde sonst mit Fortschritt, Bühne und George vier konkurrierende Spalten
bilden) · `/brand/share/:token` (öffentliche Leseansicht) ·
`/brand/preview/:presetId` (isolierte Theme-Vorschau) · APIs vollständig
unter `/api/brand/**`.

### Slot-Registry (Code-Vertrag des P0-Slot-Katalogs)

Jeder Slot ist EIN stabiler Registry-Eintrag:
`{ id, stepId, type, required, schema, dependencies, questionKey,
helpKey, editor, generator, maxLength }`.
Slot-IDs werden NIE übersetzt oder umbenannt. Navigation, Fortschritt,
Validierung, Abhängigkeiten und Prompt-Aufbau entstehen aus DIESER einen
Registry — nicht aus fünf getrennten Regelwerken.

### Serverseitige Zustandsmaschine (Audit 5 — die UI erzwingt NICHTS allein)

PURE, getestete Regeln in `shared/` (Muster resolveThemeSelection):
`resolveBrandJourney(profile, steps)` · `canEnterBrandStep(…)` ·
`transitionBrandStep(…)` · `resolveNextQuestion(…)`. Der SERVER erzwingt
sie an jeder Route: kein Überspringen gesperrter Kapitel · kein
Bestätigen unvollständiger Pflicht-Slots · keine Manipulation von
Fortschritt/Konfidenz über den Client · kein Generieren für nicht
freigeschaltete Steps · keine widersprüchlichen optionalen Pfade.
**Weichen-Änderung:** entfallene Daten werden INAKTIV, nie gelöscht —
wer Naming später wieder aktiviert, findet seinen Stand vor.

### Beta-Zugang operativ (Audit 5 vervollständigt)

Route **`/brand/invite/:token`** (Token ≥128 Bit): leitet zu
Login/Registrierung, kehrt nach E-Mail-Verifizierung zurück, hat einen
Zweig für bereits eingeloggte Konten; Code-Prüfung UND Einlösung
rate-limitiert. **Laufzeitkonfiguration als VERTRAG (Audit 6 —
P1a liefert die System-Migrationen ausdrücklich mit):**
`app_config.brandAdmissionMode` (Audit-6-Umbenennung von „accessMode" —
`closed` = keine NEUEN Zugänge, bestehende bleiben gültig · `invite` =
neue nur per Einladung · `open` = jedes verifizierte eingeloggte Konto;
Default **`closed`**) und `app_config.brandAiEnabled` (Kill-Switch,
Default **`false`** beim ersten Rollout) — je mit Typ, Default, Parsing
und Instanz-Parität (schema-parity-SOLL); Migration läuft auf ALLEN
Instanzen, BEVOR der Layer aktiviert wird. `pukalani.brand.enabled` ist der
BUILD-/Kompositionsschalter; der RUNTIME-Kill-Switch fürs ganze Produkt
ist `app_config.products.brand.enabled = false` (Audit-7-Korrektur) —
Zulassung, Produkt-Notabschaltung und Build-Komposition sind damit drei
getrennte Hebel. Fehlende Laufzeitkonfiguration
fällt FAIL-CLOSED zurück (wie `closed` + `false`). Operator-Werkzeug
Phase 1 als SKRIPTE (keine Admin-UI nötig): `pnpm brand:invite` ·
`brand:revoke` · `brand:access` (listen + sperren + Modus wechseln) —
sie ändern genau diese app_config-Werte. ADMIN-SPERRE EINES ZUGANGS:
bei Missbrauchssperren werden aktive Share-Links AUTOMATISCH mit
widerrufen (Audit 6).

### Registry- und Daten-Migration (Audit 5 — vor der Beta)

`registryVersion` je Brand/Step · Upcaster für alte Slot-Daten bei neuem
Katalog · Slot-IDs werden DEAKTIVIERT, nie gelöscht · definiertes
Verhalten bei neu hinzukommenden Pflicht-Slots (Bestands-Brands gelten
weiter als vollständig, der neue Slot erscheint als „offen") ·
Theme-Presets VERSIONIERT · Rollback-Kompatibilität mindestens zur
Vorversion.

### Editor- & Inhaltsformat

Kurze Slots = Plain Text / strukturierte Werte · Markdown NUR für
Manifest, Brand Story und andere Langtexte · kein HTML als kanonisches
Speicherformat · keine Bilder/Embeds/Mentions in Phase 1 · `maxLength` je
Slot · das Foundation-Dokument wird aus Slots KOMPONIERT — es gibt kein
zweites, parallel gepflegtes Gesamtdokument.

### Autosave-Client-Regel (ENTSCHIEDEN: kein echtes Offline-Editing)

Autosave ~750 ms nach letzter Änderung, zusätzlich bei Blur und vor
interner Navigation · nur GEÄNDERTE Slots übertragen · Request trägt die
gelesene `revision`, Response liefert neue `revision` + normalisierte
Daten · sichtbare Zustände `saving / saved / offline / error / conflict` ·
**bei 409 NIE automatisch überschreiben**: lokale Eingabe bleibt erhalten,
UI bietet „Serverfassung laden" oder „Meine Fassung kopieren" · bei
Verbindungsverlust bleibt die Eingabe im offenen Tab erhalten und wird
nach Wiederverbindung erneut gespeichert — mehr Offline gibt es in
Phase 1 bewusst nicht.

### Streaming-Protokoll

Authentifizierter `POST`, Antwort `text/event-stream`, konsumiert über
fetch/ReadableStream. Ereignisse: `generation.started` · `message.delta` ·
`slot.ready` · `generation.completed` · `generation.failed`.
Regeln: jede Generierung hat `generationId` + Idempotenzschlüssel · NUR
der vollständig empfangene, Zod-validierte Slot wird gespeichert —
partielles JSON erreicht `brand_steps` nie · Abbruch lässt den bisherigen
Entwurf unangetastet · max. EINE aktive Generierung je Brand × Step ·
Chat-Nachricht und Slot-Generation referenzieren dieselbe `generationId` ·
gerendertes Chat-Markdown wird sanitisiert.

### Theme-Scope (ENTSCHIEDEN — kein „beziehungsweise" mehr)

Die editierbare Bühne/das Ergebnis-Dokument bleibt normales Vue-DOM; der
Themes-Layer liefert einen validierten **`BrandPreviewPreset`**
(ausschließlich erlaubte CSS-Variablen + Font-IDs), dessen Tokens auf den
DOKUMENT-Container gescopet werden — nie auf `:root`, nie aufs
Wizard-Chrome (Stabilitäts-Entscheid §3d bleibt unberührt). Die
parallelen Richtungs-Vorschauen bleiben iframes und erhalten NUR eine
Preset-ID — nie KI-generiertes CSS oder HTML; `light`/`dark` wird in der
Vorschau explizit gewählt, nicht vom Host-Cookie übernommen.

### Responsive-Zustände (präzisiert)

≥1280 px: drei Zonen · 768–1279 px: kompakter Fortschritt, Bühne +
einblendbares George-Panel · <768 px: George/Dokument als zwei
Vollbild-Modi · Eingaben bleiben beim Modus-Wechsel GEMOUNTET · `100dvh`,
Safe Areas und mobile Bildschirmtastatur berücksichtigt ·
Scroll-Verantwortung: Bühne und Chat scrollen, der äußere Workspace nie.

### App-Konfigurations-Form (White-Label-fähig ab Tag eins)

```ts
pukalani: {
  brand: {
    enabled: true,
    persona: { name: 'George', mark: '…' },   // Signet/Monogramm-Token
    contentLocales: ['en', 'de'],
    completionCta: {
      type: 'route', to: '/erstgespraech', labelKey: 'brand.cta.book',
    },
  },
}
```
Keine hartkodierten Pukalani-, George- oder Erstgespräch-Annahmen im
Layer — alles über diese Form.

## 4. Die Weiche (Schritt 0)

Drei Weichen-Informationen, alle heute schon in den Formularen erhoben, nur
nie genutzt:

| Weiche | Quelle heute | Wirkung |
| --- | --- | --- |
| **Gründung vs. Bestand/Rebrand** | 02 §2 „How established is your brand?" | Fragenfassung ALLER Bausteine; Rebrand bekommt 3 NEUE Fragen (s. u.) |
| **Name vorhanden?** | 07 §2 „Where are you in the naming process?" | Baustein F (Naming) nur ohne Namen |
| **Solo vs. Team** | 03 §2 „How many people are involved?" | Kultur-/Team-Fragen (aus 06 §8) nur ab 2+; Solo bekommt die Ich-Fassung. „Team" passt NUR die Fragen an — es lädt in Phase 1 KEINE Mitbearbeiter ein (Ein-Bearbeiter-Regel §3d) |

Schritt 0 erhebt außerdem den KI-Rohstoff: **URL (optional), Branche,
2–3 Sätze „was wir machen", für wen.** Mehr nicht — alles Weitere holt oder
fragt der jeweilige Baustein.

**Neue Fragen für den Rebrand-Pfad** (existieren in keinem Formular):
1. Was am bestehenden Auftritt MUSS bleiben (Wiedererkennung, Bestandskunden)?
2. Was geht bewusst weg — und warum?
3. Warum jetzt? (Anlass: Wachstum, Zielgruppenwechsel, Fusion, Peinlichkeit)
Dazu aus dem Bestand: „Was gefällt dir am jetzigen Auftritt NICHT?" (06 §7).
Gründer-Pfad behält stattdessen die Ursprungsfragen (02 §5, 06 §3).

## 5. Bausteine und Fragen-Mapping

Reihenfolge folgt der Abhängigkeit, nicht der Formular-Nummer:
**A Kontext → B Purpose/Vision/Mission → (B2 Architektur, nur per Weiche) →
C Werte → D Archetyp & Stimme → E Manifest → E+ Verbale Identität →
(F Name, nur per Weiche) → Ergebnis.** (B2 und E+ kamen über den
Soll-Ist-Abgleich §5b dazu.)
Alle Mehrfach-Fragen (Persönlichkeit 3×, Zielgruppe 4×, USP 4×, Vorbilder 4×,
Tonalität 3× …) werden EINMAL erhoben und leben im gemeinsamen
Marken-Profil; spätere Bausteine referenzieren, statt neu zu fragen.

### A — Kontext (aus 06, radikal gekürzt: 71 → ~8 menschliche Eingaben)

- **KI holt** (aus URL + Branche): Elevator-Pitch-Entwurf, Kategorie,
  3–5 Wettbewerber samt Einschätzung stark/schwach, Zielgruppen-Skizze,
  Tonalitäts-Analyse vorhandener Texte. Mensch korrigiert die Steckbriefe.
- **Mensch (Provokation):** Ursprungsgeschichte (Gründer) bzw. die drei
  Rebrand-Fragen (§4); „Was sagen deine glücklichsten Kunden?" (06 §12);
  „Welche Beschwerden bekommst du?" (06 §12 — Negativraum, bleibt Pflicht);
  „Das eine, das jeder Kunde wissen sollte" (06 §12); größte Herausforderung
  (06 §10). Zahlen (Team, Alter, Märkte) als schnelle Auswahlfelder.
- **Entfällt ersatzlos:** Doppelungen zu späteren Bausteinen (Werte in 06 §8,
  Persönlichkeit in 06 §7, Tonalität in 06 §9 als Freitext), Projekt-Logistik
  (06 §13 gehört zu Formular 01), Tool-Inventar (06 §11 — erst Phase 2
  relevant, dann gezielt).

### B — Purpose / Vision / Mission (aus 02) + Positionierung (NEU)

- **Provokation:** „Warum hast du angefangen?" · „Was ginge der Welt
  verloren?" · „Welche Überzeugung treibt euch?" (02 §5) — Vision: das
  10-Jahre-Bild und die Vermächtnis-Frage (02 §7). Rebrand-Fassung fragt
  „Warum gibt es euch HEUTE noch?" statt der Gründungs-Erinnerung.
- **KI-Entwurf:** alle drei Statements nach den vorhandenen Templates
  (02 §6/§8/§10), gespeist aus A + Provokation. Konfidenz-Skala je Statement
  (existiert schon) wird zur Vertiefungs-Weiche.
- **NEU (Lücken-Befund):** zwei Positionierungs-Fragen am Ende — „In welcher
  Kategorie spielst du?" (KI schlägt vor) und „Für wen bist du dort die erste
  Wahl?". Kein eigener Baustein; zwei Fragen, großes Loch gestopft.

### B2 — Markenarchitektur (NEU per §5b; nur per Weiche „plant Untermarken")

Fehlt in ALLEN sieben Formularen — und ist für Davids eigenen Anwendungsfall
(Produktmarken, die sich dem Markenkern unterordnen) essenziell. Kurzmodul:

- **Weiche** (in Schritt 0 oder am Ende von B): „Planst du Produkt- oder
  Untermarken unter dieser Marke?" Nein ⇒ Modul entfällt komplett.
- **Provokation (3 Fragen):** Sollen die Untermarken sichtbar zur Hauptmarke
  gehören oder eigenständig auftreten? · Zahlt die Hauptmarke auf sie ein
  (Vertrauen) oder sollen sie eigene Publika erreichen dürfen? · Wie sollen
  sie HEISSEN dürfen (Namensmuster: `<Marke> <Produkt>` vs. eigene Namen)?
- **KI-Entwurf:** Empfehlung **Branded House / Sub-Brands / Endorsed /
  House of Brands** mit Begründung und 2–3 Nomenklatur-Beispielen aus dem
  eigenen Kontext. Mensch legt Modell + Namensregel fest.
- Das volle Nomenklatur-System (Regelwerk je Produkttyp) ist Phase-2-Inhalt
  des Brand Books; hier wird nur das MODELL entschieden — die eine
  Entscheidung, die alle späteren Produktnamen bindet.

### C — Werte (aus 03)

- **Provokation:** KI wählt 3 der 7 Discovery-Fragen (03 §5) passend zum
  Pfad — Kandidaten: bester Moment · zutiefst falscher Moment · „Welches
  Verhalten würdest du nie dulden, auch nicht vom bestzahlenden Kunden?" ·
  Gemeinsamkeit der Lieblingskunden · Feuer-Prinzip.
- **KI:** Wertewort-KANDIDATEN aus den Antworten (ersetzt die statische
  Wortliste in 03 §6) → Mensch grenzt auf 3–5 ein (Regel „3–5" bleibt).
- **Aktivierung (bleibt Pflicht, ist die Substanz):** je Wert ein GELEBTES
  Beispiel (03 §8) und die Konflikt-Frage „Wo geraten zwei deiner Werte in
  Konflikt — welcher gewinnt?" (03 §8, schärfste Frage im ganzen Satz).
- **Festlegung:** 3–5 Werte mit je einem Satz Eigendefinition („Wert → was
  er bei UNS heißt", Format aus 03 §7).

### D — Archetyp & Stimme (aus 04 — Instrument wird ERSETZT)

- **Die 12 unabhängigen 1–5-Skalen entfallen** (messen nichts, Befund).
  Ersatz: **Paarvergleich** („Welche der beiden Beschreibungen ist eher
  ihr?", ~8–12 Paare, adaptiv) ⇒ BERECHNETES Primär-/Sekundär-Ergebnis.
  Die KI stellt vorab eine Hypothese aus dem bestehenden Auftritt (A) und
  sagt danach ehrlich, ob Selbstbild und Außenbild auseinanderliegen — das
  ist ein Aha-Moment, den das Formular nie liefern konnte.
- **Menschen-Fragen bleiben** (04 §8): die Party-Frage · „Welche Eigenschaft
  NIEMALS?" · bewunderte Marke + warum · gewünschte Emotion.
- **Stimme** (04 §9): KI generiert 3 Beispielsätze im ermittelten Archetyp,
  Mensch wählt/korrigiert; Ton-Wörter als Auswahl. **NEU (§5b): dazu die
  Vokabular-Frage im Negativraum-Muster** — „Welche Wörter würdet ihr NIE
  benutzen?" plus KI-Vorschlag einer Benutzen/Meiden-Liste. Ergebnis:
  Stimmprofil inkl. Vokabular.
- **Die Visual-Fragen (04 §10) wandern in die Ergebnis-Seite** — dort wird
  aus Freitext-Hex eine strukturierte Richtungs-Auswahl, die die
  Themes-Engine live rendert (s. §6 Ergebnis + Schranke).

### E — Manifest (aus 05)

- **Warmup bleibt menschliche Pflicht VOR jedem Entwurf** (05 §6): „Was regt
  dich an deiner Branche auf?" · „Auf welchem Hügel würdest du sterben?" ·
  das unausgesprochene Versprechen. (2 von 5, KI wählt.)
- **Die 23 Satzanfänge bleiben das Instrument** (05 §7–11) — aber die KI
  befüllt ALLE 23 als Entwurf aus A–D; der Mensch schreibt um, streicht,
  markiert die stärksten. Korrektur-Modus statt 23 Leerfelder — hier zahlt
  sich das Muster am deutlichsten aus.
- **Komposition:** Ton/Länge/Einsatzort (05 §12) als Auswahl ⇒ KI komponiert
  das Manifest aus den MARKIERTEN Statements; Lieblingszeile (05 §14) wird
  Anker. Mensch macht den Feinschliff im Editor.

### E+ — Verbale Identität (NEU per §5b; fast reine KI-Ableitung)

Die Messaging-Hierarchie war im Erst-Entwurf auf Phase 2 verschoben — der
Abgleich zeigt: sie gehört zum Fundament (Kern jeder verbalen Identität),
und sie ist hier fast GRATIS, weil sie sich aus B–E ableitet statt neue
Fragen zu stellen. Menschlicher Aufwand: auswählen und korrigieren.

- **KI entwirft aus B–E:** 3 Tagline-Kandidaten · Boilerplate in drei Längen
  (Bio-Zeile ≤ 160 Zeichen / Kurzabsatz / Absatz — Social-Bios, Signaturen,
  Pressetext) · 3 Key Messages je Kern-Zielgruppe · Benutzen/Meiden-Liste
  (aus D übernommen und ergänzt).
- **Mensch:** wählt je Kategorie, korrigiert; die Manifest-Lieblingszeile
  (05 §14) ist als verbales Erkennungszeichen (distinctive asset) markiert.
- Ergebnis: Messaging-Blatt im Foundation-Dokument — die direkte Vorlage für
  jede Ableitung (Site-Hero, Social-Bio, Newsletter-Kopf).

### F — Name (NUR Pfad „kein Name"; aus 07)

- **KI übernimmt alle 5 Brainstorming-Übungen** (07 §9–13: freie Assoziation,
  Mashups, Metaphern, fremdsprachige Wurzeln, Wortspiele) und liefert
  Kandidaten je Namenstyp; die Typologie (07 §5) wird vorab als Auswahl
  gezeigt („welche Sorte Name passt zu euch?", 07 §6).
- **Mensch: Geschmack** (07 §8) — 3–5 geliebte Namen + warum, No-Go-Wörter,
  Längen-/Sprachpräferenz. Dann Auswahl der Top-Kandidaten.
- **Prüfung GESTUFT — „begleitete Vorprüfung"** (§9b.3, entschärft den
  kritischen Pfad): Domain-Check automatisch via RDAP/DNS — als
  **REGISTRIERUNGSINDIKATOR** beschriftet, nicht als Kauf-Garantie
  (Audit 2: „nicht registriert" heißt weder kaufbar noch nicht-reserviert
  noch nicht-Premium) · Social-Handles als direkte SUCHLINKS je Plattform
  + Nutzer-Bestätigung (Audit 3: „best effort" liefe auf fragiles
  Scraping hinaus) · MARKEN-Recherche als
  geführte Links (DPMA/EUIPO/WIPO) mit Studio-Assist statt API-Automatik ·
  Fremdsprachen-Check per KI. Als Ergebnis-Tabelle je Finalist, mit dem
  bestehenden Disclaimer (keine Rechtsberatung). Vollautomatische
  Markenprüfung erst mit vertraglich erlaubten Datenquellen (Phase 2).
- Kriterien-Test (07 §15) kompakt nur für die 2–3 Finalisten.

### Ergebnis-Seite (das Artefakt — füllt den Befund „am Ende steht kein Ergebnis")

1. **Brand-Foundation-Dokument** (vollständige Liste per Audit 2 — alles,
   was erzeugt wird, steht auch drin): Kontext + **Zielgruppen-Segmente**,
   Positionierung, Purpose/Vision/Mission, Werte mit Definitionen +
   Konfliktregel, **Markenarchitektur** (falls B2 lief), Archetyp-Profil +
   Stimmprofil mit Beispielsätzen + Vokabular, Manifest, **komplette
   verbale Identität** (Tagline, Boilerplates, Key Messages), (Name mit
   Prüf-Tabelle). Teilbarer Link (Snapshot, §6).
2. **Ableitungs-VORSCHAU = die sichtbare Bezahlschranke:** aus Archetyp +
   Richtungs-Auswahl rendert die Themes-Engine 2–3 Farb-/Typo-Richtungen —
   **TECHNIK-VERTRAG (Audit 3): Themes wirken global auf `:root` (auch
   die Draft-Vorschau), drei parallele Richtungen brauchen deshalb je ein
   lokales Preview-`iframe` mit eigenem `:root`.** Der explizite
   Themes-Vertrag (A14) liefert NUR validierte
   Theme-/Variant-/Font-PRESETS; die Engine bleibt unverändert. Vorschau-
   Richtungen — „so würde deine Site aussehen". Klar beschriftet als
   bezahlte Phase 2; CTA **Erstgespräch buchen** (Studio-Funnel W2-Ziel)
   daneben, nicht dahinter versteckt.

## 5b. Soll-Ist-Abgleich (Internetrecherche 2026-08-27)

Anlass: Davids Frage, ob die sieben Formulare noch abbilden, was eine moderne
digitale Marke braucht — ausgelöst durch die selbst gefundene Lücke
Markenarchitektur. Abgeglichen gegen aktuelle Brand-Book-/Guideline-Praxis,
Markenstrategie-Checklisten und 2026-Trends (Quellen unten).

### Das Schichtenmodell (professionelle Begriffe — beantwortet Davids Frage)

1. **Brand Strategy / Brand Foundation** (Markenstrategie) — das WARUM/WAS:
   Purpose, Vision, Mission, Werte, Positionierung, Persönlichkeit/Archetyp,
   Zielgruppen, **Markenarchitektur**. ⇒ Phase 1 dieses Plans.
2. **Brand Identity** — das WIE, in zwei Hälften: **Verbale Identität**
   (Stimme, Ton, Vokabular, Naming, Tagline, Messaging-Hierarchie, Manifest)
   und **Visuelle Identität** — das, was umgangssprachlich „Brand Design"
   heißt (Logo, Farbe, Typo, Bildsprache, Ikonografie, Motion).
3. **Brand Guidelines / Brand Book** — die DOKUMENTATION von 1+2 (Regelwerk).
4. **Brand Kit / Design System** — die WERKZEUGE: anwendbare Assets, Design
   Tokens, Templates. (Kit ≠ Book: das Book erklärt, das Kit arbeitet.)
5. **Brand Experience** (Markenerlebnis) — die ABLEITUNGEN: Website,
   Landingpages, Social-Auftritte, Content, Newsletter.

Wichtig fürs Produktversprechen: die Ableitungen (5) hängen an Foundation
UND Identity — „welche Social-Inhalte sind sinnvoll" ist eine
FOUNDATION-Frage (Archetyp + Zielgruppe + Positionierung), keine Kit-Frage.
Phase 1 = Schicht 1 + verbale Hälfte von 2 · Phase 2 = visuelle Hälfte von
2 + 3 + 4 · Phase 3 = 5.

### In Phase 1 AUFGENOMMEN (Plan oben bereits angepasst)

| Delta | Warum | Wo |
| --- | --- | --- |
| **Markenarchitektur** (Branded House / Sub-Brands / Endorsed / House of Brands + Namensmuster) | In keinem Formular; für Produktmarken-Ableitung zwingend — die eine Entscheidung, die alle späteren Produktnamen bindet | Neues Kurzmodul **B2**, per Weiche |
| **Messaging-Hierarchie** (Tagline, Boilerplate 3 Längen, Key Messages) | Kern jeder verbalen Identität; war fälschlich auf Phase 2 verschoben — ist aus B–E fast gratis ableitbar | Neues Modul **E+** |
| **Vokabular** (Benutzen/Meiden, „Welche Wörter nie?") | Standard-Bestandteil verbaler Identität, billig, Negativraum-Muster | In **D** (Stimme) |
| **Außenbild-Check** explizit (Rebrand: „beschreiben Leute euch so, wie ihr euch selbst?") | Meistübersehene Strategie-Frage; die KI kann das Außenbild aus Site/Reviews spiegeln | War in **D** angelegt, jetzt ausdrücklich |

### In PHASE 2 aufgenommen (Brand-Book-/Kit-Scope, heute nur vorgemerkt)

- **Brand Kit als Design Tokens**, nicht als PDF: light/dark, geprüfte
  Kontrast-Paare (a11y), gleiche Token-Namen in beiden Modi — die
  Themes-Engine liefert genau das nativ (Ramp aus einer Basisfarbe,
  Kontrast-Gate). Der größte Wettbewerbsvorsprung des ganzen Vorhabens.
- **Motion-Richtlinien** (kinetische Logos, Micro-Interactions, 150–250 ms,
  `prefers-reduced-motion`) — 2026-Standard, heute in keinem Formular.
- **Bildsprache-System** (Fotografie-Stil, Illustration, Ikonografie) —
  heute eine einzige Frage (04 §10); fürs Kit zu wenig.
- **Social-Template-Set + Content-Kompass**: 3–5 Content-Säulen mit
  Format und Taktung je Plattform (bewährter Mix: erklären · erzählen ·
  Haltung zeigen · einladen), Templates mit festen Wiedererkennungs-Ankern.
  Beantwortet Davids Frage „welche Inhalte für meine Brand" — als BEZAHLTE
  Ableitung, mit einem Teaser in der Phase-1-Vorschau.
- **AI-Guidelines im Brand Book** (was darf KI im Namen der Marke erzeugen,
  Ton-Parameter, Tabus) — laut aktueller Praxis inzwischen Kernbestandteil
  neben Logo und Farbe.
- **Maschinenlesbares Brand-Book-Modul**: Stimme + Vokabular + Tabus als
  exportierbarer System-Prompt / `brand.json`. Doppelt wertvoll: für Davids
  Designer-Arbeit UND perspektivisch für die KI-Produkte der Plattform
  (eine Community-KI, die in der Marken-Stimme antwortet).
- **Nomenklatur-Regelwerk** je Produkttyp (Ausbau von B2).
- **Discover-Seite** (Davids Idee 2026-08-27, ausgebaut 2026-08-29 mit
  Brand Score): abgeschlossene Brands optional öffentlich (separates
  `publicationVisibility`-Feld, Opt-in — kommt ERST mit Discover,
  Audit 6). SORTIERUNGEN/FILTER: Weiche (Neugründung/Rebrand), Branche,
  Brand Score, Nutzer-Bewertung, Trending/Popular (Aufruf-Metriken),
  Neueste — plus die Filter, die NUR wir haben: **Archetyp** und
  **Farbwelt** (strukturierte Strategie-Daten als Browsing-Achsen).
  FORMATE: **Vorher/Nachher-Slider bei Rebrands** (das teilbarste
  Format der Branche), **Anatomie-Ansicht** je Brand (Purpose, Werte,
  Archetyp, Score — jede öffentliche Brand = indexierbare Seite, die
  SEO/GEO-Maschine für branding.supply), kuratierte **Collections**
  und **Brand of the Day**/Featured (Betreiber-Kuration =
  awwwards-Jury). NUTZER-BEWERTUNG in 2–3 Dimensionen (z. B. Klarheit /
  Mut / Handwerk) statt 5 Sternen, nur eingeloggt. **Creator-Profile**:
  veröffentlichte Brandings, Ø-Score, Auszeichnungen, perspektivisch
  „Creator beauftragen" (Marktplatz-Keim; Nähe zu freelancer.supply
  prüfen). ACHTUNG, bewusste KEHRTWENDE: öffentliche Profile
  widersprechen der bisherigen Handle-Regel („keine öffentlichen
  Profile", AH-7) — nur per Opt-in und als eigene Entscheidung bei
  Discover-Bau. AGGREGIERTE INSIGHTS („meistgewählte Werte",
  Archetyp-Verteilung je Branche) anonymisiert als Content-Marketing.
  GRENZE: KEIN „Remix"/„Als Vorlage nutzen" an fremden Brandings —
  Marken sind keine Templates; der CTA heißt immer „Starte deine
  eigene". Bewusst NICHT Phase 1: zum Launch wäre die Seite
  leer, und öffentliche Nutzerinhalte brauchen den Moderations-Pfad
  (moderation-Layer existiert, muss aber verdrahtet werden). Vorbereitet
  in Phase 1 durch das Snapshot-Share-Modell (§6). Doppelnutzen: Social Proof
  + SEO für branding.supply.

### Schritt-Schnitt der Phasen 2+3 (2026-08-29, mit David am Dummy entschieden)

Die Schritt-Listen der drei späteren Schichten — im UI schon heute in den
Info-Layern der gesperrten Gruppen sichtbar. Charakter-Unterschied bewusst:
**Design = entscheiden · Book & Kit = kuratieren/exportieren · Experience =
anwenden.** Gesamtrechnung über alle Schichten ≈ 60 Entscheidungen mit
abnehmender Last nach hinten („je weiter, desto mehr entsteht von selbst").

**Brand Design** (~15 Entscheidungen, ~35 Min): Farbwelt (Basisfarbe aus
Archetyp + Werten, Hell-/Dunkel-Rampe mit Kontrast-Paaren — die
Themes-Engine nativ) · Typografie (Rollen, Grade, Hierarchie) · Logo &
Zeichen (Wort-/Bildmarke, Varianten, Schutzraum) · Bildsprache &
Ikonografie · Motion (Tempo, kinetisches Logo, reduced-motion).

**Brand Book & Kit** (~8, meist Bestätigungen, ~15 Min): Brand Book
(Kapitel aus den Schichten, Do/Don't, AI-Guidelines) · Kit & Design Tokens
(light/dark, Exporte CSS/Tailwind/Figma, maschinenlesbares brand.json) ·
Templates (Social-Set mit Wiedererkennungs-Ankern).

**Brand Experience** (~16, ~32 Min): Website (Seitentypen,
Theme-Anwendung, Hero) · Social (Profile + Content-Kompass: 3–5 Säulen
mit Taktung; inkl. Interaktions-Stimme — wie die Marke ANTWORTET) ·
**SEO & GEO** (Keyword-Set abgeleitet aus Positionierung + Vokabular,
Entitäten-Konsistenz, zitierfähige Markenfakten + llms.txt — GEO dockt
direkt am maschinenlesbaren brand.json aus dem Kit an; deckt fachlich
auch AEO und LLMO ab — im UI bewusst NUR "SEO & GEO", zwei Anker statt
vier Akronyme) · Newsletter &
E-Mail · Content-Vorlagen · **Geschäftsausstattung** (Davids Ergänzung
2026-08-29 — braucht JEDE Marke, auch rein digitale: Visitenkarte,
Briefbogen/Rechnungsvorlage, E-Mail-Signatur) · **Vor Ort** (per Weiche, nur Marken mit
physischem Ort: Google Business Profile, Bewertungs-Antworten in der
Markenstimme, Print-Basics wie Schild/Karte/Verpackung) · **Launch &
Ankündigung** (Marketing-Audit 2026-08-29: Warum-Story aus Purpose +
Manifest, Kanal-Plan aus dem Content-Kompass, bei Rebrands INTERN
ZUERST — ein Rebrand ohne Ankündigung verwirrt Bestandskunden). BEWUSST
EIN Layer, keine Digital/Analog-Teilung (2026-08-29, David): die
Trennlinie ist der ORT, nicht das Medium — Google Maps ist digital UND
vor Ort. Book-&-Kit-Ergänzung aus demselben Audit: **Pressekit** im
Templates-Schritt (Logos, Boilerplate 3 Längen, Fakten — fast gratis
aus Book + Kit) sowie Positionierung + Markenarchitektur als SICHTBARE
Kontext-Entscheidungen ausgewiesen. Gesamtrechnung ≈ 63 Entscheidungen.

**Sechste Schicht (Phase 4, vorgemerkt): Brand Monitoring** — nach dem
Launch als DAUERBETRIEB: Außenbild-Check (beschreiben Leute euch so,
wie ihr euch selbst?), KI-Antwort-Radar („Was sagen ChatGPT/Perplexity
über euch?" — die GEO-Messung zur GEO-Arbeit) und Konsistenz-Radar
über die Kanäle. Kein Wizard-Durchlauf, sondern wiederkehrend — das
natürliche ABO-Argument der Plattform (Schichten 1–5 kauft man einmal,
Monitoring bindet monatlich). Im Dummy als gesperrte sechste Gruppe
sichtbar.

### Brand Score (Davids Idee 2026-08-29, Runde 94 — Lighthouse-Prinzip)

Jede Brand bekommt einen FUNDIERT GERECHNETEN Score (nie „gefühlt" —
dieselbe Regel wie bei Georges Empfehlungen), sichtbar als Ring auf den
Brands-verwalten-Karten und als Fünf-Ringe-Block auf der
Ergebnis-Seite. Dimensionen: **Vollständigkeit** (Entscheidungs-
Zustände, exakt messbar) · **Konsistenz** (passen die Entscheidungen
zusammen — George-geprüft mit Begründung) · **Differenzierung**
(Abstand zum Marktumfeld aus dem Kontext) · **Klarheit** (messbare
Text-Kriterien am Purpose-Satz) · **Auffindbarkeit** (SEO-/GEO-
Readiness; steigt erst mit Brand Experience — ehrlich niedrig davor).
Framing ist REIFEGRAD, nie Zeugnis: jeder Wert unter 100 verlinkt auf
seinen nächsten Schritt (der Score verkauft die To-dos — das macht
Lighthouse groß).

**Bewertungsmodell v2 (2026-08-29, aus Davids Recherche geformt —
branchenneutral, stufen-bewusst):** ACHT Kategorien mit 100 Punkten:
Eigenständigkeit 15 · Visuelle Identität 15 · Konsistenz 15 ·
Markenerlebnis 15 · Positionierung & Klarheit 10 · Emotionale Wirkung
10 · Anpassungsfähigkeit 10 · Handwerk 10. Jede Kategorie hat 5
PRÜFKRITERIEN à 0–2 Punkte mit ausformulierten Bewertungsregeln (40
Kriterien gesamt, Rohwert 0–10 → aufs Gewicht normalisiert) — die
Operationalisierung von „fundiert statt gefühlt", jedes Kriterium mit
Georges Begründung. DREI Grundsätze: (1) FORTSCHRITT ≠ QUALITÄT — die
frühere Vollständigkeits-Dimension ist raus, Fortschritt lebt im Fuß;
(2) STUFEN-BEWUSST: Kategorien nicht gebauter Schichten zeigen SCHLOSS
statt 0 (Visuelle Identität ab Brand Design, Markenerlebnis +
Anpassungsfähigkeit ab Experience/Kit); der Gesamtwert normalisiert
über die freigeschalteten Gewichte und trägt sein „Stand:"-Etikett;
(3) AUSSCHLÜSSE: kein Umsatz/Marktanteil/Bekanntheit (Markenerfolg ≠
Branding-Qualität — sonst schlägt Coca-Cola jede exzellent gestaltete
kleine Marke), kein Heritage-Bonus, kein Innovations-Bonus (Rolex darf
kontinuierlich sein). Auffindbarkeit (SEO/GEO) = unser
Alleinstellungs-PRÜFKRITERIUM im Markenerlebnis. BÄNDER: 94+
Außergewöhnlich · 88–93 Herausragend · 80–87 Exzellent · 70–79 Stark ·
60–69 Durchschnittlich · 50–59 Schwach · <50 Mangelhaft (Ringfarben:
90+ accent, 50–89 draft, <50 stale). CONTENT-PLAY (vorgemerkt,
branding.supply-Redaktion): kuratierte Rankings mit genau diesem
System („Die 30 besten Tech-Brands 2026 — nach Branding-Qualität, nicht
Unternehmenswert") — Referenz-Vorbilder: Brand New/UnderConsideration
(Kritiken), Kantar BrandZ + Brand Finance (Wert-Rankings, bewusst
NICHT unsere Achse), The Brand Identity, BP&O. Nächster Schritt in
Phase 2: die 40 Prüfkriterien ausformulieren (je 0/1/2-Regel). Zertifikats-/Badge-Gedanke: teilbares
„Brand-geprüft"-Badge über das Snapshot-Share-Modell (§6) — Werbung
für branding.supply auf Kundenseiten. RANKING gegeneinander bewusst
VERSCHOBEN auf Discover: nur als Perzentil in der eigenen Kategorie
(„besser als 78 % der Gastronomie-Brands") und nur bei Opt-in-
Öffentlichkeit — ein Café gegen ein SaaS zu ranken wäre unfair und
angreifbar. Score-VERLAUF über die Zeit gehört zu Brand Monitoring
(Schicht 6) und ist dort Teil des Abo-Arguments. Referenz-Vorbild
(David, 2026-08-29): **awwwards.com** — Dimensionen statt Schulnote,
Reifegrad statt Scham trotz Geschmacks-Thema; daraus übernommen:
AUSZEICHNUNGS-MOMENTE statt Dauer-Ranking („Brand of the Day" /
Featured als Betreiber-Kuration im Discover = strukturell die
awwwards-Jury).

### Journal & Content-Intelligence (branding.supply-Redaktion — vorgemerkt 2026-08-29)

NAV-BENENNUNG (David, 2026-08-30): der Bereich heißt in Navigation
und Seitenkopf **„Brand Insights"** (nicht „Journal" — klang nach Blog;
Insights deckt Artikel UND Profile/Rankings/Duelle und verweist auf
die Knowledge-Base-Einheit gleichen Namens). Die Galerie heißt
**„Discover Brands"** (spiegelt „Meine Brands").

Davids Idee, geformt: YouTube ist RESEARCH-SIGNAL, nie Quelle zum
Umformulieren. Kein Transkript-Scraping als Content-Grundlage
(urheberrechtlich und strategisch falsch); stattdessen Metadaten und
Kommentare über die offizielle Data API als MARKTFORSCHUNG: welche
Branding-Fragen erzeugen nachweislich Aufmerksamkeit? Kommentare sind
Long-Tail-Intents („Why did they remove the serif?" → eigener
Artikel). Normalisierter Popularity-Score (Views relativ zur
Kanalgröße) + **Content Opportunity Score** (0–100: Performance,
Alter, Suchnachfrage, Konkurrenz, Relevanz) ⇒ priorisierte
Redaktions-Pipeline Discover → Analyze → Research → Brief → Draft →
Review → Publish → Update. TRANSPARENZ: maßgeblich angestoßene
Artikel nennen und betten das Quellvideo ein („Further watching") —
Traffic für den Creator statt Content-Klau.

INFORMATIONSARCHITEKTUR (Brand Knowledge Graph statt Blog):
`/brands/<name>` (Entity-Seiten externer Marken mit Score-v2-Bewertung
— das redaktionelle Gegenstück zur Discover-Anatomie eigener Brands) ·
`/rankings/` (kuratierte Listen nach Branding-Qualität) · `/topics/`
(Themencluster: Strategy, Visual Identity, Rebranding, Psychology,
Analysis) · `/journal/` (Einzelartikel) — alles untereinander
verknüpft. RECHTSRAHMEN externer Bewertungen: Kritik-/Meinungs-Framing
wie Brand New, Methodik offengelegt, nominative Markennennung, keine
fremden Logos als eigene Assets. POSITIONIERUNGS-SPLIT: branding.supply
= Daten-/Informationsautorität, Davids persönliche Site = Experte;
Verknüpfung über Autorenprofil (David → author → branding.supply) statt
zweier Sites auf denselben Keywords.

### Produkt-Suite: sieben Produkte, ein System (David, 2026-08-30)

Branding Supply ist eine SaaS-SUITE, deren Produkte aufeinander
aufbauen — Namen aus der Brand-X-Familie (deckungsgleich mit den
Layern; der durch die Plattform-Umbenennung freie Name „Brand Wizard"
wird Produkt 1):
**Aufbau-Pfad:** 01 **Brand Wizard** (Gespräch mit George, neue Marke
oder Marken-Relaunch ⇒ Foundation + Language) → 02 **Brand Design**
(aus der Foundation DREI Moodboards; iterative Verfeinerung nach
Agentur-Art: Haken an Gefallendes, Kommentar/Edit an den Rest,
MIX & MATCH über Boards — „Farbwelt aus 1, Typografie aus 3";
Grundlage ist die Visual DNA) → 03 **Brand Book & Kit** (Book, Tokens,
brand.json, Pressekit + **Strategy Playbook**: Positionierung,
Content-Säulen, Plattform-Taktiken, 90-Tage-Plan — ready to execute)
→ 04 **Brand Experience** (Assets, Templates, Ideen, Quick Wins
entlang des 90-Tage-Plans).
**Dauerhaft mitlaufend:** 05 **Brand Monitoring** (Monitor & Alert,
wöchentlich) · 06 **Brand Score** · 07 **Brand Benchmark**
(Konkurrenzanalyse — Wettbewerber im selben Raster).
**Plattform-Fähigkeiten** (produktübergreifend): Remember & Refine
(Gedächtnis über Sitzungen) · Connect Your Tools (Docs, Sheets,
Figma — Phase 3+).

**TEAM statt anonymer Agenten:** die spezialisierten Agenten sind
PERSONEN — je Produkt ein Teammitglied mit Vor-/Nachname, Jobtitel,
Beschreibung MIT Abgrenzung zu den anderen, Skills, Persönlichem
(Wohnort, Hobbys) und Profilbild (Hunde, wie George): George Wuffwuff
(Wizard) · Frida Fellini (Design) · Rex Setter (Book & Kit) · Kira
Apport (Experience) · Wanda Wachsam (Monitoring) · Ada Prüfstein
(Score) · Scout Schnüffler (Benchmark). Eigene Team-Seite; intern =
„break your project into tasks, match each to the best model".
Dummies: /products (Pfad 01–04 + laufende 05–07 + Plattform +
Team-Teaser), /team (7 Persona-Karten); Nav-Punkt „Products" (Team
im Footer). Profilbilder folgen (Platzhalter: Initialen).

> **NACHTRAG 2026-09-02 — die Hunde-Welt ist verworfen** (Davids
> Entscheidung, DECISION-LOG). Der Absatz oben ist das Protokoll der
> Runde 163 und bleibt stehen; GÜLTIG sind heute professionelle
> Beraterinnen und Berater ohne Rassen und Tier-Gags: George **Winter**
> (Wizard) · Frida **Martens** (Design) · Rex **Weber** (Book & Kit) ·
> Kira **Hoffmann** (Experience) · Wanda **Nowak** (Monitoring) · Ada
> **Sander** (Score) · Scout **Krüger** (Benchmark), dazu die
> Wizard-Crew Vera **Stein** · Milo **Berger** · Nika **Sommer** · Otto
> **Kessler**. „Persönliches" ist eine Kurzzeile über die Arbeitsweise,
> kein Wohnort-und-Hobby-Steckbrief; Profilbilder gibt es keine
> (Monogramme), und wenn, dann für alle. Stand: `apps/branding/app/
> pages/team.vue` + `packages/brand/shared/brandAdvisors.ts`.

> **NACHTRAG 2026-09-05 — fünf Ebenen als KARTE über den sieben Produkten
> (David, Fragenrunde; Anlass: seine Auswertung der Guidelines-Referenzen
> Frontify/Corebook°/standards.site/Brandkit/Lovable, Quellen in
> docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md Anhang A).** Die Produkte 01–07
> und ihre Namen bleiben; die Ebenen sagen, WOFÜR ein Produkt da ist, und
> ordnen auch das, was kein eigenes Produkt ist:
> **Discover** (Insights/Artikel, Brand Library, Rankings — die SEO-Maschine)
> → **Audit** (Brand-Check: 40 Kriterien · 8 Kategorien · Score ·
> Markenabdruck · Stärke/Chance/Nächster Schritt; Produkt 06)
> → **Compare** (Quartett, Marktvergleich, Ranking, später Perzentile;
> Produkt 07) → **Build** (Brand Wizard 01 + Brand Design 02 — der
> Wizard schliesst die Lücken, die der Audit zeigt) → **Supply** (Brand
> Foundation als Leseansicht/BF1, Brand Book & Kit 03, Brand Experience 04;
> Monitoring 05 läuft dauerhaft neben allem). Die Differenzierung gegenüber
> den Containern (Frontify „manage", Corebook° „publish", standards.site
> „build guidelines", Brandkit „manage assets", Lovable „extract") ist die
> Reihenfolge: **Brand Intelligence → Brand Development → Brand
> Infrastructure** — verstehen, verbessern, bauen, bereitstellen. Der Satz
> **„Understand. Improve. Build. Supply your brand."** ist als
> POSITIONIERUNGS-KANDIDAT vermerkt, NICHT auf der Startseite (die ist
> abgenommen; Copy-Regel „Markenberater" gilt weiter). BEWUSST NICHT:
> DAM (30.000 Fotos, Freigabe-Workflows, Rechte, Download-Analytics),
> Template-Editor, Enterprise-Asset-Analytics — Assets existieren bei uns,
> WEIL sie die Marke definieren, nicht um Dropbox zu ersetzen.
>
> **Produkt 03 bekommt einen benannten Export „Brand Context":** neben PDF,
> Assets.zip und Design-Tokens (JSON/CSS/Tailwind) liefert das Kit
> `brand.json` (bestand schon oben) UND `brand.md` — der Markenkern als
> Kontext-Datei für Coding-/Schreib-Agenten (Claude Code, Cursor, Custom
> GPTs); die Lovable-Vorlage exportiert genau so ein `design.md`, Frontify
> und Corebook° hängen ihre Guidelines per MCP an Agenten. „Connect"
> (MCP/API, Figma, CMS) bleibt Phase 3+ („Connect Your Tools" oben). Die
> Foundation-Leseansicht (BF1) zeigt diese Exporte im Export-Menü sichtbar
> GESPERRT, wie die visuellen Kapitel.
>
> **Discover, zwei Ergänzungen (kein Vorhaben jetzt):** (1) „Ähnliche
> Marken" je Case über Archetyp/Branche/Farbwelt — die Filter, die nur wir
> haben; (2) Cases sind zugleich REFERENZMATERIAL für den Judge (Brand-Check
> und Marktvergleich lesen sie als Beispiele mit Beleg), nicht nur Galerie.
> Weiter gilt: keine Galerie zum Launch (leer), Moderationspfad zuerst.
>
> **Reihenfolge nach dem Brand-Check (BC1 P6), Strang „Brand System":**
> BF1 Foundation-Leseansicht → Produkt 02 Brand Design (die
> URL-/Asset-Extraktion aus Brand-Check und brand-010 als Relaunch-
> Einstieg: Website → verstehen → bewerten → verbessern, nicht nur
> extrahieren wie Lovable) → Produkt 03 Book & Kit + Brand Context. KEINE
> neuen P-Nummern (sie kollidieren mit BC1 P1–P6 und diesem Plan); die
> Notiz steht in OPEN-ITEMS.

### Weiche: „Neue Marke" / „Marken-Relaunch" (Produktentscheidung David, 2026-08-30)

BENENNUNG (bestätigt nach Fachbegriffs-Recherche): die Weiche heißt
kundenseitig **„Neue Marke"** („Ihr startet bei null — Name und Marke
entstehen im Gespräch.") und **„Marken-Relaunch"** („Ihr habt schon
eine Marke — vom Feinschliff bis zum Neuschnitt."). Begründung:
„Neugründung" ist Gesellschaftsrecht (und schließt neue Marken
bestehender Unternehmen aus); „Marken-Relaunch" ist der etablierte
deutsche Agentur-/Fachbegriff (Esch: „Markenrelaunch"), der das
Spektrum evolutionär→revolutionär (Muzellec/Lambkin; Refresh bis
Rebranding, Aaker: Brand Revitalization) OHNE „bzw."-Krücke abdeckt.
„Rebranding" bleibt als Journal-Topic/redaktioneller Begriff bestehen.
Alt-Absatz (Vorstufe „Rebrand bzw. Brandoptimierung"):

Der zweite Weiche-Pfad heißt kundenseitig **„Rebrand bzw.
Brandoptimierung"** und deckt ZWEI Unterfälle: (a) **Brandoptimierung**
— die Marke bleibt, sie wird geschärft (Kern-Assets bestehen, Lücken
und Inkonsistenzen werden geschlossen; der sanfte, häufige Fall);
(b) **Rebrand** — bewusster Neuschnitt der Identität. Die Weiche
selbst bleibt ZWEIARMIG (Neugründung vs. Bestand) — die
Unterscheidung Optimierung/Rebrand trifft nicht der Nutzer im Modal,
sondern GEORGE im Gespräch der Rebrand-Strecke (nach Kontext +
Brand-Check-Befunden: „viel Eigenständigkeit vorhanden ⇒ Evolution
statt Revolution" — dieselbe Logik wie im Serifen-Artikel). Folgen:
Start-Modal-Label + Startseiten-Button tragen die Doppel-Benennung;
der Brand-Check ist der Lead-Magnet GENAU dieses Pfads; P0 braucht
in der Rebrand-Strecke die Verzweigungs-Frage samt George-Empfehlung.

### Startseite + Perplexity-Analyse (2026-08-30)

Analyse der Perplexity-Computer-Landing (personal-brand-strategy,
Lead-Magnet): Was wir ÜBERNEHMEN — (1) **AUDIT-FIRST-AKQUISE**: der
Einstieg ist nicht „bau eine Marke", sondern „lass deine prüfen" —
unser Brand Score wird damit vom Ergebnis-Metrik zum
AKQUISE-WERKZEUG: kostenloser **Brand-Check** (Website angeben ⇒
George analysiert den Außenauftritt mit den 40 Prüfkriterien ⇒ Score
+ 3 Befunde, ohne Anmeldung) — zugleich der natürliche Einstieg in
die Rebrand-Weiche und später in Monitoring. (2) Hero =
ERGEBNIS+ZEIT-Versprechen (bei uns: Foundation in ~45 Min statt
„in minutes"). (3) PROZESS-THEATER: den Agenten bei der Arbeit
zeigen (4 Mono-Zeilen mit Status). (4) ARTEFAKTE KONKRET benennen
(Brand Book, brand.json, Tokens, Pressekit, Content-Kompass +
NEU: **90-Tage-Plan** als Brand-Experience-Artefakt, vorgemerkt).
(5) Memory + Monitoring als VERKAUFBARE Capabilities auf der
Landing (validiert Knowledge Base und Monitoring). Was wir NICHT
übernehmen: Tool-Push (Notion/Canva-Export = Phase 3+),
Personal-Brand-Fokus (wir bauen Unternehmens-Marken im Gespräch).
KORREKTUR (David, 2026-08-30): der Brand-Check prüft den
BESTEHENDEN Außenauftritt und ergibt nur auf der REBRAND-Seite der
Weiche Sinn — für Neugründungen ist ein Audit-Feld eine Sackgasse.
Deshalb ist die WEICHE selbst der Hero: „Es gibt noch nichts —
Neugründung" ⇒ Split-Control in den Wizard; „Es gibt schon eine
Marke — Rebrand" ⇒ Brand-Check-Feld. Vorgemerkt: ein erfolgreicher
Check mündet direkt in die Rebrand-Weiche („George kennt euren
Auftritt schon"), der Check-Score wird Ausgangspunkt der
Rebrand-Story. Dummy: `/start` — Hero, Prozess-Theater, Artefakte-Grid,
6 Capability-Karten, Brand-Check-Block, Beispiel-Brand-Beweis,
UPageCTA, Footer. Im echten Bau ist das die ausgeloggte `/`.

### Squircle-Exponent (Systementscheidung David, 2026-08-30)

- `corner-shape: superellipse(1.7)` ist DER Eckenverlauf des Produkts —
  nach Live-Proben mit 2 (zu straff) und 1.5 (zu bauchig/iOS). Gilt für
  ALLE gerundeten Flächen gleich (bw-card, bw-grain-hero, bw-tile);
  Bild-Kacheln laufen über `.bw-tile` auf dem Karten-Radius
  (`--bw-radius-card`, 44px im Squircle-Modus), die große
  Carousel-Karte +8px. Rohes `rounded-[…]` auf Flächen ist damit tabu —
  neue Kachel ⇒ `.bw-tile`. `border-radius` bleibt als Fallback für
  Browser ohne corner-shape.

### Beispiel-Brand, Brand-Duell, Site-Navigation (Davids Wünsche 2026-08-29)

- BEISPIEL-BRAND (Pflicht, Phase 1): mindestens EINE vollständige, wirklich
  ausführliche Muster-Brand als ERGEBNIS-Referenz für alle User-Brands —
  festgelegt auf Kailua Coffee Co. (der rote Faden des Wizards). Dummy:
  `/brand/demo/beispiel` — alle sechs Schichten ausformuliert (Purpose inkl.
  Anti-Purpose, Werte mit Regeln, Archetyp/Stimme mit Vokabular, Manifest,
  Tagline/Pitch/Namens-Prüfung, Farbwelt mit Hex+Rollen, Typo/Logo/Bild/
  Motion, Book & Kit-Artefakte, Content-Kompass, zitierfähige Fakten,
  Bewertungs-Stimme, Score alle 8 Dimensionen, Monitoring aktiv). Rollen:
  (a) Onboarding-Schaufenster („so sieht fertig aus"), (b) P0-Content-Anker
  (die Beispiel-Antworten, die George zeigt, kommen aus dieser Brand),
  (c) Anatomie-Referenz. Nike bleibt dagegen das EXTERNE Maximal-Profil
  (von außen bewertbar); die Beispiel-Brand ist das INTERNE Maximal-Ergebnis.
- BRAND-DUELL (Phase 2, Journal-Format): zwei Marken im Direktvergleich wie
  die Statistik-Tafel nach einem Spiel — Dummy `/brand/demo/duell`
  (Nike vs. Adidas): Aufstellung mit Ringen + VS, acht Dimensionen als
  gespiegelte Balken (Sieger je Zeile in Akzent), Zahlen & Fakten
  (Gegründet/Claim/Zeichen/Agentur/Archetyp), redaktionelle Einordnung,
  CTA „Wie schlägt sich deine Marke im Duell?". Später auch
  User-Brand vs. Referenz-Brand („Vergleiche deine Brand mit Nike").
- SITE-NAVIGATION: die öffentlichen Seiten haben eine übergeordnete
  Header-Navigation (`BwSiteNav`): Wortmarke (Pfoten-Icon = George) +
  Meine Brands / Discover / Journal + „Neue Brand"-CTA; aktiver Punkt als
  Ink-Pille, Detailseiten zählen zu ihrem Hauptpunkt (Artikel/Profil/Duell
  → Journal, Anatomie → Discover, Beispiel → Meine Brands). Die Werkstatt
  behält ihre eigene Topbar (BwWorkspace) — zwei Welten, zwei Köpfe.

### Marken-Taxonomie: 6 getrennte Achsen (Davids Notiz, 2026-08-30)

KANON: die 12 Archetypen nach Mark/Pearson (auf Jung zurückgeführt),
bei uns DEUTSCH benannt (Regel aus Runde ~101): Der Unschuldige · Der
Entdecker · Der Weise · Der Held · Der Rebell · Der Magier · Der
Jedermann · Der Liebende · Der Narr · Der Fürsorgliche · Der Schöpfer
· Der Herrscher. Marken tragen PRIMARY + optional SECONDARY (unser
„viel vom Weisen, ein Rest Schöpfer"-Muster aus dem Archetyp-Schritt).

KERNREGEL — Achsen NIE vermischen: ein Archetyp ist Persönlichkeit/
Motivation, KEIN visueller Stil (ein Entdecker kann minimalistisch,
brutalistisch, retro oder luxuriös auftreten). Sechs getrennte
Klassifikationen je Brand:
1. **Brand Archetype** (wer ist sie?) — 12er-Kanon, primary/secondary
2. **Visual Style** (wie sieht sie aus?) — Minimal, Swiss, Editorial,
   Brutalist, Corporate, Luxury, Retro, Playful, Organic, Futuristic …
3. **Brand Personality** (wie verhält sie sich?) — bold, sophisticated,
   friendly, rebellious, technical …
4. **Positioning** (wo steht sie?) — Premium, Mass Market, Accessible
   Luxury, Disruptive …
5. **Tone of Voice** (wie spricht sie?) — authoritative,
   conversational, witty, provocative …
6. **Design Characteristics** (konkrete Umsetzung) — Serif/Sans,
   monochrom/bunt, geometrisch/organisch, dicht/minimal …

WIZARD-MAPPING (die Achsen entstehen bei uns als NEBENPRODUKT der
Schritte, kein Extra-Formular): Archetyp & Stimme ⇒ Achse 1+3+5;
Kontext/Positionierung ⇒ 4; Farbwelt/Typo/Logo/Bildsprache ⇒ 2+6.
VERWENDUNG: Discover-Facetten-Suche („Entdecker → Outdoor → Premium →
Minimal"), Brand-Profile-Steckbriefe (Nike: Hero primary/Rebel
secondary · Bold/Minimal/Athletic · Confident/Energetic/Progressive ·
Premium Mass Market), KB-Queries („Creator-Brands mit brutalistischer
Identität"), und Georges Empfehlungs-Begründungen („für euren
Archetyp untypisch, DESHALB eigenständig"). Die Taxonomie ist damit
Discover-Filter, Profil-Schema UND KB-Abfragesprache in einem.

### Visual Brand DNA: die Generierungs-Taxonomie (Davids Notiz 2, 2026-08-30)

Archetypen beschreiben Psyche, NICHT Optik — für Moodboards und
Design-Ableitung braucht es eine EIGENE Taxonomie. Das Modell:
**~10 orthogonale Dimensionen mit kontrollierten Vokabularen**
(bewusst KEIN 50-Stile-Zoo — „Swiss", „Minimal", „Luxury" beschreiben
verschiedene Dinge und überlappen):
1. Visual Style (Minimalist … Experimental) · 2. Aesthetic Era
(Heritage … Futuristic) · 3. Form Language (Geometric … Fluid) ·
4. Typography (Grotesk … Handwritten) · 5. Color Character
(Monochrome … High-Contrast) · 6. Imagery (Editorial … Generative) ·
7. Composition (Grid-based … Layered) · 8. Materiality
(Digital-clean … Natural) · 9. Motion Character (Calm … Experimental)
· 10. Overall Mood (Sophisticated … Optimistic).

KERNPRINZIPIEN: (a) **Ein Moodboard ist eine KOMBINATION dieser
Eigenschaften, keine Kategorie** („Luxury Editorial" = Minimal+
Editorial+Luxury / Didone+Grotesk / Monochrome+Neutral / Spacious /
Paper+Metal / Sophisticated+Calm). (b) DNA ist ORTHOGONAL zum
Archetyp — zwei Schöpfer-Marken können völlig verschiedene DNA
tragen. (c) Die PIPELINE ist der eigentliche Wert:
**Brand Psychology → Visual DNA → Design Direction → Design System**
— aus den DNA-Parametern werden Moodboard, Logo-Direction, Typo,
Farben, Photography, Shapes, UI, Packaging, Motion und am Ende die
DESIGN TOKENS abgeleitet (Anschluss an unser Token-Artefakt).

EINORDNUNG ZUR 6-ACHSEN-TAXONOMIE: die dortige Achse „Visual Style"
bleibt als GROBE Discover-Facette (Suchsprache, eine Handvoll Chips);
die Visual DNA ist die FEINE Ebene darunter (Profil-/KB-/
Generierungs-Schema). Achse 6 „Design Characteristics" geht in den
DNA-Dimensionen 3–9 auf.

WIZARD-MAPPING: George schlägt die DNA aus der Foundation vor
(Archetyp + Personality + Positionierung ⇒ DNA-Vorschlag mit
Begründung), der Nutzer bestätigt/verschiebt einzelne Dimensionen —
danach parametrisieren die Brand-Design-Schritte (Farbwelt,
Typografie, Logo & Zeichen, Bildsprache, Motion) GENAU diese
Dimensionen. VORGEMERKT (P2): eigener Schritt „Moodboard" am Anfang
von Brand Design (Generate aus DNA, Auswahl aus 2–3 Richtungen);
die DNA wandert maschinenlesbar in brand.json und wird
KB-Abfragesprache („Creator-Brands mit brutalistischer DNA").

### Knowledge Base / Brand Intelligence Layer (Phase 3+, vorgemerkt 2026-08-29)

Der strategische Überbau von Journal + Score + Discover (aus Davids
Recherche geformt): eine wachsende, STRUKTURIERTE Wissensbasis —
Sources → Extracted Knowledge → Entities → Relationships → Evidence →
Content, von Anfang an GETRENNT modelliert. Kern-Objekt ist der
**Insight** (Claim + Topic + Evidence-Quellen + betroffene Brands +
Confidence + review_status mit MENSCHLICHER Verifikation) — ein
Artikel ist nur eine Präsentationsschicht dieser Basis, dieselbe
Erkenntnis speist Artikel, Rankings, Analysen, Audits und Georges
Empfehlungen. ARCHITEKTUR-GRUNDSATZ: kein Fine-Tuning des
Basismodells — RAG + strukturierte Daten + Knowledge Graph +
Embeddings; das LLM bleibt Reasoning-/Interface-Schicht (passt zu
aiComplete als policy-freiem Transport). DER MOAT ist die proprietäre
Wissens-/Datenschicht (Brands + Cases + kuratierte Quellen +
Beziehungen + Rating-Historie), nicht das Modell — Ziel-Bild
„Morningstar/IMDb für Brands". RÜCKFLUSS IN DEN WIZARD: Georges
Empfehlungen zitieren perspektivisch Insight-IDs statt Bauchgefühl
(die Vollendung von „fundiert statt gefühlt"); Nutzer-Fragen wie
„Compare my brand with Nike" kombinieren Entity-Daten + Rating +
Prinzipien. ZWEI HARTE GRENZEN: (1) Nutzer-Brands fließen NUR
anonymisiert/aggregiert oder per Publikations-Opt-in in die Basis
(Datenschutz vor Flywheel); (2) Confidence ersetzt keine Redaktion —
verified-Status bleibt menschlich. JETZT-BAUSTEIN für Phase 1/2:
Georges Begründungen als STRUKTURIERTE DATEN am Entscheidungs-
Datensatz speichern (eigenes Feld, nicht nur Chat-Text) — der billige
Steckplatz für die spätere Evidence-Verknüpfung.

### BEWUSST NICHT aufgenommen

- **Sonic Branding / Audio-Identität** — 2026 real, aber für die Zielgruppe
  (Gründer, kleine Firmen, Freelancer) Nische; nicht mal Phase 2.
- **Stakeholder-Mapping und Ethik-/Nachhaltigkeits-Modul als Pflicht** —
  für Konzern-Markenstrategie Standard, hier Ballast; höchstens je EINE
  optionale Frage. Der Wizard lebt davon, kürzer zu sein als die Formulare.
- **Metriken-Modul** („Top-3-KPIs der Marke") — die 12-Monats-Ziele in A
  reichen; mehr wäre Beratungs-, nicht Fundament-Arbeit.

Quellen (alle abgerufen 2026-08-27):
- „15 Questions Every Brand Strategy Must Answer" — thebrandingjournal.com/2025/09/15-questions-every-brand-strategy-must-answer/
- „What is Brand Architecture?" — thebrandingjournal.com/2022/01/brand-architecture/
- „Brand Book: Core Elements" — designrush.com/agency/logo-branding/trends/brand-book (inkl. AI-Guidelines-Abschnitt); ergänzend lingoapp.com/blog/the-ultimate-brand-book-guide, frontify.com/en/guide/brand-guidelines-examples
- „What is verbal identity" + „Message hierarchy" — fabrikbrands.com/branding-matters/brand-strategy/
- „Dark Mode Design Systems" — muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/
- „8 shifts defining brand identity 2026" — threerooms.com/blog/8-design-trends-shaping-brand-identity-in-2026
- „Content Pillars for Social Media" — postiz.com/blog/content-pillars-for-social-media
- „AI Brand Voice Governance" — the-brand-algorithm.com/ai-brand-voice-and-governance/
Sicherheits-Referenzen (§6, abgerufen 2026-08-28): OWASP SSRF Prevention
Cheat Sheet und OWASP LLM Prompt Injection Prevention Cheat Sheet
(cheatsheetseries.owasp.org); OpenRouter Privacy/Data-Collection-Doku
(openrouter.ai/docs/guides/privacy/data-collection); ICANN-RDAP-Grundlagen
(icann.org). Das Analyse-Artefakt „Sieben Formulare, ein Produkt" ist
Sitzungs-Referenz, keine dauerhafte Projektquelle — die Befunde stehen
in diesem Plan.

## 6. Technik (Layer-Zuschnitt)

- **Layer** `packages/<key>` — Arbeitstitel **`brand`** (Name = Davids
  Entscheidung, §9). `product.manifest.ts` (nur `import type`), Aufnahme in
  `check:manifests`, extends-Reihenfolge, migrate-LAYER_ORDER.
- **Wo er läuft — ZWEI HORIZONTE (Davids Entscheidung 2026-08-27, ersetzt
  die frühere account.-Empfehlung):** Phase 1 auf **pukalani.studio** (für
  David + eigene Kunden, Wizard-Ende mündet auf derselben Domain ins
  Erstgespräch); später zusätzlich **branding.supply** als eigenständige
  SaaS-Domain für den breiten Markt (Freelancer, Agenturen, Mittelstand,
  Personal Brands, Sportler, Influencer, Start-ups). Der Layer ist
  host-agnostisch — beide Horizonte sind Komposition, kein Umbau.
  STAND DER APP (Audit-2-Korrektur): portfolio ist NICHT kontenlos —
  sie erbt Auth über core+admin (Dashboard-Login existiert), und Realtime
  läuft auf dem Core-Default AN (kein eigenes Flag). Der Wizard fügt
  hinzu: den brand-Layer, die KI-Naht und die Theme-Vorschau — das ist
  der P1-Aufwand.
  APPWRITE-PROJEKT — ENTSCHIEDEN NACH DAVIDS EINWAND (2026-08-27, ersetzt
  die „neues Projekt"-Empfehlung): pukalani.studio IST die portfolio-App,
  und die hat bereits eine LOGIN-WELT (admin/pages-Dashboard, Projekt
  `portfolio`, Cookie `a_session_portfolio`). Regel: EINE Site = EINE
  Login-Welt — zwei parallele Auth-Welten auf einer Domain wären zwei
  Cookies + doppelte Konten. Deshalb KEIN zweites Projekt: die
  `brand_*`-Tabellen ziehen per normalem Runner (`pnpm migrate --app
  portfolio`) ins BESTEHENDE Projekt `portfolio`, Wizard-Nutzer = Nutzer
  der Site (Davids Konto existiert dort, Beta per Code sofort möglich),
  Core-Auth bekommt genau EINE generische Naht (Admission-Provider,
  s. Zugang) und bleibt brand-unwissend; kein zweiter Client. George-Streaming braucht
  kein Appwrite-Realtime (SSE über den eigenen Server).
  BASIS FÜR BEIDES bleibt gesichert: die spätere branding.supply-Trennung
  läuft entweder als SELEKTIVER TRANSFER (brand_*-Tabellen + Konten mit
  Brand-Profil in ein eigenes Projekt — erprobtes Werkzeug:
  AH-4c-Projekt-Transfer inkl. Passwort-Hashes) oder als ZWEITE ORIGIN am
  selben Projekt (weitere Web-Platform; das Session-Cookie setzt ohnehin
  unser Server je Domain) — entschieden, wenn es real wird. Dazu:
  (b) Persona-Token (§3b); (c) Sprachliste als Konfiguration (§3c);
  (d) **branding.supply: REGISTRIERT (2026-08-27)**, Cloudflare-Zone in
  Aktivierung. Der vorhandene DNS-Token (`~/.appwrite-secrets/
  cloudflare-dns.token`, TLS-Wächter) ist zonen-gescopet auf pukalani.app —
  für Automatisierung an der neuen Zone Scope erweitern oder eigenen Token
  anlegen (David, unkritisch: Phase 1 braucht die Domain nicht, sie parkt).
  `brand` in `RESERVED_SUBDOMAINS` **EINTRAGEN** (Audit 2 geprüft: steht
  dort noch NICHT — P1-Aufgabe).
- **Repo-Pflichten bei Layer-Anlage** (per Audit 2 ergänzt, P1): neue
  `brand`-Zeile in der **A14-Layer-Grenzen-Matrix** (CONCEPT.md) samt
  EXPLIZITEM Vertrag für die Themes-Vorschau (brand konsumiert die
  Themes-Engine — keine implizite Kopplung); **`PORTFOLIO_SOLL` in
  `scripts/ops/verify-schema-parity.mjs` um die brand_*-Tabellen
  erweitern** (die Soll-Listen sind gepflegt, nicht geparst — sonst
  meldet der Wächter die neuen Tabellen als unbekannt).
- **Database: die BESTEHENDE `main` des Site-Projekts, KEINE eigene
  „branding"-Database** (Davids Frage 2026-08-27, geklärt): die Trennung
  leistet das Tabellen-Präfix `brand_*` — exakt das Muster aller Layer
  (der Pool fährt sämtliche Produkt-Tabellen in EINER Database). Eine
  zweite Database bräche die Eine-DATABASE_ID-Annahme von Migrations-
  Runner, indexStep-Fabrik, Realtime-Gate und Paritäts-Wächter für rein
  kosmetischen Gewinn; für den späteren branding.supply-Transfer ist das
  Präfix ein ebenso scharfes Auswahlkriterium wie eine Database-Grenze.
- **Datenmodell** (Tables gehören dem Layer): `brand_profiles` — eine Row je
  Profil. **Besitzer ist ein Benutzer ODER eine Community** (Audit 4 löst
  den früheren Widerspruch); Berechtigungen werden zentral aus
  `ownerType`/`ownerId` abgeleitet, Phase 1 aktiviert nur den
  User-Zweig. **MEHRERE Profile je
  Konto sind ausdrücklich Erste-Klasse** (David selbst braucht eigene Marke +
  Kundenmarken + Produktmarken; zugleich die Vorkehrung für den
  White-Label-Tier). Besitz von Tag eins als **`ownerType + ownerId`** mit
  den Werten **`'user' | 'community'`** (Repo-Vokabular statt „org" —
  Audit 2: der White-Label-Tier IST eine Community; Phase 1 aktiviert nur
  `'user'`, EIGENTUMS-ÜBERTRAGUNG an Kunden ist im Modell vorgesehen, UI
  später — §9b.6/7). **ZUGRIFFSGRENZE (Audit 5, ersetzt die Row-Permission-Idee): ALLE
  `brand_*`-Tabellen sind SERVER-ONLY** — Tabellen- und Row-Permissions
  `[]` (dasselbe Muster wie der favicons-Bucket), der Browser spricht
  AUSSCHLIESSLICH `/api/brand/**`. Grund: `user:<id>`-Row-Permissions
  wären ein Umgehungspfad an `requireBrandAccess()` vorbei (z. B. nach
  Beta-Widerruf), und Zugangsentzug müsste sonst sämtliche Rows
  umschreiben. **`assertBrandOwnerAccess()`** (Audit-6-Umbenennung des früheren
  brandPermissionsForOwner — die Funktion erzeugt nach der Server-only-
  Wende keine Appwrite-Permissions mehr) ist die zentrale
  SERVER-Autorisierungsfunktion (Eigentümer-/Zugangsprüfung je Route;
  community-Zweig implementiert + getestet, nicht aktiviert). KEIN
  Appwrite-Realtime für Brand-Daten (SSE ist ohnehin der Kanal);
  `brand_shares` ist nie direkt lesbar — Zugriff nur über die Token-Route.
  **KEIN `visibility`-Feld in Phase 1** (Audit 6 räumt den Rest auf):
  Profile sind grundsätzlich privat, „geteilt" ist ausschließlich
  abgeleitet (`hasActiveShare` aus `brand_shares`); Discover ergänzt
  später ein SEPARATES `publicationVisibility` (§9b.24 bleibt: nie ohne
  Moderations-Pfad). Baustein-Stände als JSON-Spalten (MEDIUMTEXT via
  `createMediumtextColumn` — liegt OFF-ROW und umgeht damit gerade das
  MariaDB-65-KB-Zeilenbudget; Audit-5-Korrektur der früheren Formulierung.
  Ein eigenes Zod-Größenlimit je Feld bleibt trotzdem Pflicht), additiv
  erweiterbar wie custom_themes-config. Indizes über `indexStep` aus `indexRetry.mts`
  (ESLint-Wächter greift nur dort). GDPR: `registerUserDataContributor`
  PFLICHT (Export + Löschung der Profile).
- **Chat-UI:** die Nuxt-UI-v4-Chat-Komponenten (`UChatMessages`,
  `UChatPrompt` …) — bereits in unserer Nuxt-UI-4.10-Abhängigkeit enthalten;
  Antwort-Chips/Paarvergleichs-Karten als eigene Message-Parts in deren
  Slots. Das offizielle Template `nuxt-ui-templates/chat` ist REFERENZ
  (Streaming-Muster, Markdown-im-Stream, Scroll-/Tastatur-Ergonomie),
  NICHT Grundlage (geprüft 2026-08-27): Auth nuxt-auth-utils/GitHub-OAuth,
  DB Drizzle/SQLite, KI Vercel AI Gateway, Storage NuxtHub Blob — jedes
  tragende Teil widerspricht unserem Stack, und es ist eine App, kein
  Layer. George ist zudem kein freier Chatbot, sondern ein Slot-Füller
  mit Chat-Oberfläche.
- **Speicher-Fluss (2026-08-28, per Audit 3 vollständig): SIEBEN
  Tabellen** — `brand_profiles`, `brand_steps`, `brand_messages`,
  `brand_shares`, `brand_invites`, `brand_access` und **`brand_events`**
  (append-only Funnel-Ereignisse, §7). **Vor P1-Baubeginn liefert P1a
  einen SCHEMA-ANHANG** (Spalten, Unique-Indizes, Retention, Pagination,
  Löschkaskade) zur Durchsicht — er verortet AUSDRÜCKLICH auch die
  **Brand Story** (Speicherung, Revision, Cache-Invalidierung) und die
  **gewählte Design-Richtung** (Preset-Referenz am Profil), die bisher
  keiner Tabelle zugeordnet waren (Audit 4). `brand_profiles`
  (Kopf: `createdByUserId` + `ownerType`/`ownerId`, Titel, Weichen-Flags,
  Fortschritt — KEIN visibility-Feld, s. u.),
  **`brand_steps`** (eine Row je Profil × Baustein; VERSIONS-VERTRAG per
  Audit 2: je Slot **`firstDraft` + `latestDraft` + `confirmed`** — ein
  einzelnes draft/final kann die zwei beschlossenen Übernahmequoten nach
  Regenerationen nicht mehr rechnen —, je GENERATION Metadaten
  (`schemaVersion`, `promptVersion`, Modell, Sprache, `inputHash` der
  Abhängigkeits-Stände — ersetzt das nackte `stale`-Flag: veraltet =
  inputHash der Quelle geändert), plus Konfidenz und Aktivitäts-Zeiten.
  **`revision`-Zähler je Step für optimistische Nebenläufigkeit** (Autosave
  sendet die gelesene revision mit, veraltete ⇒ 409 — der
  Mehr-Tab-/Stream-vs.-Editor-Konflikt wird abgewiesen statt still
  überschrieben) und No-op-Regel nach dem bodyToSave-Prinzip (Speichern
  ohne Änderung schreibt nicht). Dazu **`brand_messages`**
  (Gesprächsverlauf je Profil × Baustein, DAUERHAFT — Davids Entscheidung
  2026-08-27: echter Wiedereinstieg mit Kontext, George referenziert
  frühere Aussagen, Rohmaterial für Qualitätsanalyse; GDPR-Contributor
  exportiert/löscht mit). Autosave nach JEDER George-Runde und jedem
  Bühnen-Edit (client-debounced) über Zod-validierte Server-Routen mit
  Besitz-Prüfung — kein Speichern-Knopf, kein verlierbarer Stand. VERALTET ist
  ABGELEITET, kein gespeichertes Flag (Audit-3-Konsistenz): ein Step gilt
  als veraltet, wenn der `inputHash` seiner letzten Generation nicht mehr
  zum aktuellen Stand der Quell-Slots passt — George sagt an, was neu
  gerechnet wird. Je Step eine BEGRENZTE Generations-Historie (letzte
  ~10 Generationen mit Metadaten, ältere nur als Zähler) — first/latest/
  confirmed allein bewahrt keine Zwischenstände.
- **Ausgabe-Pipeline (Charakter entschieden 2026-08-27): BEIDES.** Das
  Foundation-DOKUMENT zeigt die Festlegungen WÖRTLICH (Nutzerworte,
  kapitelweise — das Referenzwerk für alle Ableitungen), darüber GEORGES
  „BRAND STORY" — eine verdichtete Erzählung aus allen Slots, klar als
  Synthese gekennzeichnet, editierbar; am Profil gecacht und NUR bei
  echter Slot-Änderung invalidiert (UGC-Übersetzungs-Cache-Regel: echte
  Änderung leert, No-op nicht). Die Story ist zugleich das
  Share-/Discover-Artefakt. **Teilen in Phase 1: eigene Tabelle
  `brand_shares`** (per Audit 2 als Vertrag): je Veröffentlichung EINE Row
  mit EINGEFRORENEM Snapshot-Inhalt (Momentaufnahme — spätere Änderungen
  erst nach erneutem „Veröffentlichen"), Token NUR als Hash gespeichert,
  `publishedAt` + `expiresAt` + `revokedAt`, Rotation = neue Row + alte
  widerrufen. Erzeugt nur nach BESTÄTIGUNGS-Dialog, der auflistet, was
  sichtbar wird; auch vor Abschluss erlaubt (Passwort später).
  **INHALT (Audit 3 festgelegt):** Brand Story als Einstieg + alle
  BESTÄTIGTEN Foundation-Kapitel — NIE Chats, Entwürfe oder Metriken.
  **Routen-Härtung:** Token ≥128 Bit Zufall, serverseitige Ablauf-/
  Widerrufs-Prüfung bei jedem Abruf, `noindex`, restriktive
  Referrer-Policy, keine Aufnahme in Analytics oder Sitemap.
  ERGÄNZT (Audit 5): `Cache-Control: no-store` (Widerruf wirkt sofort) ·
  rohe Tokens raus aus Nuxt-/nginx-/Proxy-Logs · strikte CSP — Share-Seite `frame-ancestors 'none'`, Preview-Seite
  `frame-ancestors 'self'` (Audit 6) · Markdown-Sanitizer auch für Dokument und Share
  (nicht nur Chat) · nur sichere URL-Protokolle in Links ·
  Preview-iframes mit `sandbox` + `title` + `loading="lazy"` · die
  Share-Route ist die AUSDRÜCKLICHE Ausnahme von `requireBrandAccess`,
  die Preview-Route bleibt authentifiziert · Standard-Ablauf **30 Tage**.
  Der eingefrorene Snapshot enthält `presetId + presetVersion` (bzw. die
  validierten Preset-Tokens) — sonst verändert eine spätere
  Theme-Anpassung rückwirkend das „eingefrorene" Dokument.
  **`visibility` entkoppelt (Audit 5):** in Phase 1 ist das Profil
  grundsätzlich PRIVAT; „geteilt" ist KEIN Profil-Feld, sondern
  abgeleitet (`hasActiveShare` aus `brand_shares`) — Share abgelaufen/
  widerrufen und Profil-Status können so nie auseinanderlaufen. Ein
  echtes `public` für Discover bleibt eine ANDERE, spätere Eigenschaft. Bearbeiten bleibt beim Besitzer,
  Mitbearbeiter sind Phase 2. Analyse-Ebene (Dauern, Übernahme, Konfidenz
  je Step) per P8-Skript.
- **KI:** `aiComplete()/aiCompleteJson()` — Transport bleibt policy-frei,
  Klemmung + Prompts beim Konsumenten. NEU für George: eine
  STREAMING-Variante der KI-Naht (eigene SSE-Route, gleiche Gates/Drosseln/
  Override-Kette, keine Gateway-Abhängigkeit) — P1. Override-Kette in Phase 1 VEREINFACHT (Audit 4: `brandAiModel`
  existiert nicht und bräuchte System-Migration + Instanz-Parität):
  `app_config.aiModel > pukalani.brand.ai > pukalani.ai` — ein eigenes
  brand-Feld erst, wenn ein realer Bedarf es rechtfertigt. **EIN Limit-Vertrag (Audit 5 vereinheitlicht — ersetzt die frühere
  generische Drossel-Passage):** §9b.5 gilt technisch — **200
  Generierungen/Tag je KONTO + 10/Tag je Brand × Slot-Typ**, dazu ein
  KURZFRIST-Burst-Limit (max. 2 parallele Generierungen je Konto —
  Audit 6), IP-Buckets in 05.rate-limit als Netz. ALS GENERIERUNG ZÄHLT: Erst-Entwurf,
  Regeneration, „Weiß ich nicht"-Vorschlag und freie George-Rückfrage;
  NICHT erneut zählen: Cache-Treffer und automatische Schema-Reparatur.
  Dazu: INSTANZWEITER Tages-/Kosten-Deckel (Gesamtkosten-Netz) und ein
  **brand-spezifischer AI-Kill-Switch** (Laufzeit). Persistenz-Regel: der
  Server speichert validiertes Ergebnis + Nachricht, BEVOR
  `generation.completed` gesendet wird. LOGS enthalten nur generationId,
  Modell, Provider, Dauer, Tokens, Cache-Hit, Fehlercode — NIE Prompt
  oder Inhalt. Entwurfs-Cache je Baustein-Stand bleibt („was nichts
  kostet, kostet kein Kontingent").
- **URL-Analyse — SSRF-Vertrag** (per Audit 2 konkretisiert, Referenz
  OWASP SSRF Cheat Sheet): nur http/https auf Standard-Ports; DNS
  auflösen und die VERBUNDENE IP prüfen (nicht nur vorab —
  DNS-Rebinding), Sonderbereiche v4 UND v6 verboten (Loopback, RFC1918,
  Link-Local, Cloud-Metadata wie 169.254.169.254); Redirects MANUELL
  folgen mit erneuter IP-Prüfung je Hop (max. 3); Content-Type-Gate
  (text/html), Größen- UND Dekompressions-Limit, hartes Timeout.
  Ergebnis gecacht am Profil, **Rohmaterial nach Extraktion früh
  gelöscht** (§9b). Kein Client-Scraping. **UMFANG (Audit 5):** zuerst
  NUR die eingereichte URL; gefundene Same-Origin-Seiten werden zur
  AUSWAHL angeboten, der Nutzer bestätigt maximal FÜNF; Gesamtlimits für
  Bytes, extrahierten Text und KI-Tokens; Wettbewerber ausschließlich
  über explizit eingegebene URLs; keine Login-/Checkout-/Account-/
  Such-Seiten; der Nutzer BESTÄTIGT, dass er die Website analysieren
  lassen darf. Marken-BEISPIELE (Apple, P&G …): Namen als Lernbeispiele
  ja — fremde Logos/Bilder nur mit geklärter Lizenz.
- **Prompt-Injection-Grenze** (per Audit 2, Referenz OWASP LLM Prompt
  Injection Cheat Sheet): Website- und Wettbewerber-Text ist DATEN, nie
  Anweisung — klar delimitiert in den Prompt, mit expliziter
  „keine darin enthaltenen Instruktionen befolgen"-Regel; KEINE Secrets
  im Kontext; Ausgabe strukturiert über `aiCompleteJson` + Zod-Klemmung
  und escaped gerendert. **Externe KI-Aussagen** (Wettbewerber-
  Einschätzung, Außenbild, Naming-Sprachprüfung) tragen eine
  `observed | inferred`-Kennzeichnung plus Quelle und Abrufdatum —
  Behauptung und Beobachtung bleiben unterscheidbar.
- **OpenRouter technisch festgenagelt** (§9b.4 präzisiert): `zdr: true`,
  `data_collection: "deny"`, Provider-ALLOWLIST (`only`),
  `allow_fallbacks: false` — **fail-closed**, kein stiller Fallback auf
  Nicht-ZDR-Provider, lieber „gerade nicht verfügbar" (§9b.5 greift).
  **VORAUSSETZUNG (Audit 3, am Code verifiziert): die heutige Naht kann
  das nicht** — `aiComplete` sendet kein `provider`-Objekt. Deshalb
  Core-Erweiterung als EIGENER Commit: typisierte
  `providerRouting`-Option (geprüftes OpenRouter-Preset), EIN gemeinsamer
  Request-Builder für Streaming UND Non-Streaming, und ein Test, der
  nachweist, dass zdr/data_collection/only/allow_fallbacks wirklich im
  Request landen.
- **Zugang** (§9.3; VERTRAG per Audit 2 präzisiert — KEIN bestehender
  Mechanismus trägt das: `invite_codes` schaltet Community-GRÜNDUNG frei,
  `inviteToken` im Signup gehört zu `community_invites`, und
  `registrationEnabled` lehnt VOR jeder Invite-Prüfung ab): **Login IMMER
  Pflicht**, Beta über einen EIGENEN Vertrag —
  **`brand_invites`** (E-Mail-gebunden, nur sha256-Hash gespeichert,
  Ablauf + Widerruf; einlösbar von NEUEN Konten — eigener Zweig neben
  `inviteOpensRegistrationFor`, der die Registrierung öffnet — UND von
  bestehenden Konten; Verbrauch atomar/idempotent) und
  **`brand_access`** (wer darf den Wizard nutzen), durchgesetzt von einem
  server-seitigen **`requireBrandAccess(event)`-Gate auf jeder PRIVATEN
  `/api/brand/**`-Route** — nie nur UI. AUSNAHMEN sind AUSSCHLIESSLICH
  die Invite-Prüfung/-Einlösung vor dem Login und der öffentliche,
  token-geschützte Share-GET; die Preview-Route bleibt privat (Audit 6). Die Öffnung ist ein Laufzeitflag, das das
  Gate auf „jedes eingeloggte Konto" stellt; die Konto-Pflicht bleibt
  immer. KEIN Anonym-Start (gestrichen). Startfläche nach Login:
  **„Meine Brands"** — Profile mit Fortschritts-% und „Neue Brand".
  **LAYER-GRENZE (Audit 3): der Core darf `brand` nicht kennen.** Deshalb
  eine GENERISCHE Core-Naht **`registerSignupAdmissionProvider()`**
  (Registry-Muster wie `registerCommunityJoinHandler`): der brand-Layer
  registriert seinen Provider per Nitro-Plugin; OHNE Provider bleibt der
  Signup exakt wie heute (fail-closed). Falsche/abgelaufene/widerrufene
  Codes liefern DIESELBE neutrale Ablehnung (keine Enumeration). Ein
  NEUES Konto erhält `brand_access` erst NACH E-Mail-Verifizierung;
  bestehende Konten lösen denselben Code über eine brand-Route ein.
  ZWEI SICHERHEITSREGELN (Audit 4, ausdrücklich): (1) `maintenanceMode`
  ist durch KEINE Einladung umgehbar; (2) eine Brand-Einladung
  übersteuert AUSSCHLIESSLICH `registrationEnabled` bzw. das
  Brand-Beta-Gate — nie andere Sperren. ABLAUF: Code prüfen (neutral) →
  Konto anlegen → E-Mail-Verifizierung → ERST DANN wird die Einladung
  endgültig verbraucht und `brand_access` geschrieben (ein unverifiziertes
  Konto hat den Code nicht verbrannt).
- **`contentLocale` je Brand** (Audit 4): die INHALTSSPRACHE einer Brand
  wird bei Anlage fixiert und am Profil gespeichert — ein UI-Wechsel von
  `/` zu `/de` generiert NIE bestehende Inhalte plötzlich in anderer
  Sprache weiter. Spätere Änderung der Inhaltssprache = expliziter
  Übersetzungs-/Regenerierungs-Prozess, kein Nebeneffekt.
- **i18n: ENGLISCH Hauptsprache, Deutsch zweite** (Davids Entscheidung
  2026-08-27, dreht die frühere „Deutsch zuerst"-Zeile) — weitere Sprachen
  fest eingeplant, Sprachliste als Konfiguration (§3c). Markenarbeit ist
  Spracharbeit; die KI antwortet in der Wizard-Sprache. Alle Fragen beider
  Pfade als i18n-Keys (keine spitzen Klammern in Messages!).
  **Wir-Stimme Pukalani Studio**; sämtliche „Hawaii Studio"-Signaturen der
  Formulare entfallen.
- Zod-Schemas als `create*Schema(t)`-Factories je Baustein; Antwort-Typen in
  `shared/types/`, an beiden Enden verlangt (Nitro-Routen-Typisierung ist aus).
- **KEIN `notify()` in Phase 1** (Audit 3): der Abschluss ist unmittelbar
  sichtbar. Ein späterer `brand.completed`-Typ bräuchte messageKey-Zweig,
  de/en-Texte und `accountBell` — erst bauen, wenn es einen echten
  Abwesenheits-Empfangsmoment gibt.

## 7. Messung (die Qualitäts-Evidenz — der Grund für „frei zuerst")

**AUFGABENTEILUNG (per Audit 2 korrigiert — Goal-Differenzen sind KEINE
saubere Absprungrate:** optionale Module haben verschiedene Nenner,
Rückkehrer und Mehrfach-Brands je Konto verschmieren die Kohorte)**:**

**Plausible misst nur Akquisition, Start und CTA** (analog `studio_*`; CE
hat keine Goals-API, David klickt die Goals in der UI — zusammen mit den
offenen `studio_*`-Goals, W2): `brand_start`, `brand_result`,
`brand_preview_click`, `brand_erstgespraech_click`, Custom Property `path`.
KEINE Baustein-Goals in Plausible.

**Der Produkt-Funnel läuft über profilgebundene SERVER-Ereignisse in der
eigenen DB:** **`brand_steps` hält den AKTUELLEN Zustand, `brand_events` die
append-only HISTORIE** (Audit 4 — klare Rollenteilung): jede
Step-Transition (begonnen/festgelegt, mit Pfad, Zeitstempel, Brand-Id)
wird als Ereignis-Row angehängt — Kohorte = Brand, nicht Session.
Rückkehr und optionale Module sind damit sauber auswertbar (P8-Skript).
**ABBRUCH ist definiert, nicht „erkannt"** (kein System weiß, ob jemand
endgültig wegbleibt): Abbruch = ≥7 Tage unvollständig ohne weiteres
Wizard-Ereignis.

**Aktive Zeit statt Start/Ende** (Audit 2: eine Nacht Pause wäre sonst
„8 Stunden Bearbeitung"): je Step **`accumulatedActiveMs`** aus
Aktivitätsfenstern (Interaktions-Heartbeat, Fenster schließt nach
Inaktivität). RÜCKKOPPLUNG: die angezeigten „ehrlichen Zeitangaben" (§3c)
werden aus den gemessenen AKTIVEN Zeiten kalibriert.

**Übernahmequote:** primär über STRUKTURIERTE Slot-Änderungen
(firstDraft/latestDraft/confirmed aus §6 — welche Felder unverändert,
welche ersetzt) plus Davids Stichproben-Review (§9b.30); Levenshtein
über Volltexte nur als Hilfsmetrik. Übernahmequote + Konfidenz
entscheiden später über die Phase-2-Bezahlschranke — kein Nice-to-have.

## 8. Arbeitspakete

| # | Paket | Aufwand | Braucht David? |
| --- | --- | --- | --- |
| P0 | **Inhalts-Spez** (AUSGEFÜHRT 2026-08-30 → [BRAND-WIZARD-CONTENT-SPEC.md](BRAND-WIZARD-CONTENT-SPEC.md); offen: die drei David-Gates im Kopf der Spez)**:** Slot-Katalog je Schicht, **Abdeckungs-Matrix 287 → Slot/Ableitung/Duplikat/gestrichen-mit-Grund** (Vollständigkeits-Vertrag §1), **Interaktionsbilanz je Pfad** (min/erwartete/max Antwortzüge über alle Weichen — prüft die 40/45-Hypothese VOR dem Bau, §1), alle Fragen beider Pfade (en+de, geprüft gegen §3c), Lehrblöcke übernommen/übersetzt, George-Prompts + DREI Persönlichkeits-Beispielantworten (§9b), Paarvergleichs-Paare + Visual-Spez für D/B2, **Persona-Namens-Prüfung („George")**, BIxD-Abgleich | M | **Ja:** Provokations-/Rebrand-Fragen gegenlesen, Persona-Name absegnen |
| P0b | **UX-Prototyp** (§3d): klickbarer HTML-Ablauf, Zustandsmatrix, Wireframes, Usability-Test (~5 Beta-Personen) | M | **Ja:** verfeinern + abnehmen |
| P1a | **Schema-Anhang + Kernverträge** (CODE FERTIG 2026-08-31 — Schema-Anhang [BRAND-WIZARD-SCHEMA.md](BRAND-WIZARD-SCHEMA.md) wartet auf Abnahme; system-038 geschrieben, läuft erst mit P1b-Deploy)**:** Tabellen-Spezifikation (Spalten/Indizes/Retention/Löschkaskade) zur Durchsicht, `registerSignupAdmissionProvider` (Core, eigener Commit), `requireBrandAccess`-Gate, `assertBrandOwnerAccess`, **System-Migrationen für `brandAdmissionMode` (Default closed) + `brandAiEnabled` (Default false) inkl. Paritäts-SOLL**, `providerRouting` in aiComplete (Core, eigener Commit) | M–L | **Ja:** Schema-Anhang absegnen |
| P1b | Layer, Migrationen, API-Grundgerüst, Slot-Registry (AUSGEFÜHRT 2026-08-31: brand-001–008 lokal verifiziert, 14 Routen live-fail-closed auf portfolio, 68-Slot-Registry + Zustandsmaschine mit 152 Tests; PROD-Migrationen system-038 + brand-001–008 warten auf Davids Freigabe) | M–L | **Ja: Prod-Migrationslauf freigeben** |
| P1c | Workspace-Layout, Client-State, Autosave/409-UI, Fassungs-Wiederherstellung, Streaming-Protokoll (AUSGEFÜHRT 2026-08-31: echte Seiten + Store + Autosave/409 + i18n-Kataloge; SSE-Route/-Client mit Dev-Stub, Persistenz-vor-completed per Gegenprobe belegt, Fassungs-Historie je Slot. LAUNCH-GATE-NOTIZ: die §6-KI-Drosseln sind PFLICHT, bevor brandAiEnabled irgendwo true wird — P2) | L | Nein |
| P1d | **Vertikaler UI-Durchstich:** Meine Brands → Anlage → EIN kompletter Baustein → Ergebnisrumpf — prüft die drei Zonen am echten Ablauf, BEVOR alle Bausteine gebaut werden | M | **Ja:** Durchstich abnehmen |
| P2 | Baustein A inkl. URL-Analyse-Endpoint + Drosseln | M–L | Nein |
| P3 | Bausteine B + B2 + C (Kernbewegung steht damit komplett) | M | Nein |
| P4 | Baustein D: Paarvergleich + Berechnung + Stimmprofil | M | Nein |
| P5 | Bausteine E + E+: 23-Statements-Korrekturmodus, Komposition, verbale Identität | M | Nein |
| P6 | Baustein F: Naming als begleitete Vorprüfung (§9b.3 — Domain via RDAP/DNS, Rest geführt; KEINE externen Vertrags-Dienste mehr) | M–L | Nein (Quellen-Frage durch §9b.3 erledigt) |
| P7 | Ergebnis-Seite: Dokument, Theme-Vorschau (Schranke), Erstgespräch-CTA | M | **Ja:** Schranken-Text + Preisanker |
| P8 | Messung + Beweis-Skript `verify-brand-wizard.mjs` (inkl. Sicherheits-/Integrationsbeweise, §10) | M | Nein |
| P9 | **Beta-Betrieb & Rollout:** Invite-/Revoke-/Access-Skripte, AI-Kill-Switch, Ablauf Migration → deaktivierter Deploy → Smoke-Test → Freischaltung, Rollback-Weg, Supportweg | S–M | **Ja:** Rollout-Zeitpunkt |

**Meilensteine (angepasst an §9.4 — Launch MIT Naming):** nach P3 intern
durchspielbar (A→B→C mit Ergebnis-Rumpf) · nach P5+P7 intern KOMPLETT ohne
Naming (Beta-Kandidat für erste eigene Kunden per Code) · **Beta-Launch
nach P6** — Naming liegt damit auf dem kritischen Pfad vor dem Launch
(Davids Entscheidung; durch §9b.3 „begleitete Vorprüfung" ohne externe
Vertrags-Dienste deutlich leichter geworden). Empfohlene Bau-Reihenfolge
bleibt P6 vor P7-Feinschliff, damit die Ergebnis-Seite die
Naming-Prüf-Tabelle von Anfang an kennt. **ZUSÄTZLICHE
LAUNCH-ABHÄNGIGKEIT (Audit 2): der A1-Anwaltsbaustein —
Datenschutzerklärungs-Passus + AVV/ZDR-Prüfung (§9b.4) — muss VOR dem
ersten externen Beta-Nutzer stehen.** Das ist eine Abhängigkeit in
dieser Tabelle, keine Begleitnotiz.

## 9. Entscheidungen — ALLE GETROFFEN (David, 2026-08-27)

1. **Produkt-/Layer-Name: `brand`** — packages/brand, productKey `brand`,
   Tables `brand_*`. Der Vermarktungs-Name (branding.supply, George) hängt
   nicht daran.
2. **Host: Zwei Horizonte** — Phase 1 pukalani.studio, später
   branding.supply (Details §6).
3. **Zugang: Beta per Einladungs-Code, danach öffnen — LOGIN IMMER
   PFLICHT** (Davids Entscheidung 2026-08-27 abends, STREICHT den zuvor
   beschlossenen Anonym-Start ersatzlos): registriert + eingeloggt vor
   jeder Wizard-Nutzung, in jeder Phase. Die Öffnung heißt „freie
   Registrierung statt Code", nie „ohne Konto". Jeder Wizard-Lauf startet
   eine NEUE Brand am Konto; Startfläche nach Login ist **„Meine Brands"**
   (alle Profile als Karten mit Fortschritts-% aus dem Slot-Modell,
   „Neue Brand" = neuer Lauf).
4. **Launch-Umfang: MIT Naming** (Davids Entscheidung GEGEN die
   Empfehlung „ohne", bewusst): das vollständige Erlebnis ab Tag eins —
   P6 rückt damit VOR den Launch auf den kritischen Pfad (s. §8).
5. **Schranke: „Im Erstgespräch" als Anker** — kein öffentlicher Preis vor
   der Phase-2-Kalkulation; der konkrete Preis kommt mit branding.supply.

**branding.supply ist registriert** (2026-08-27, Zone in Aktivierung).
Die Appwrite-Projekt-Frage ist nach Davids Einwand entschieden: KEIN neues
Projekt — der Wizard zieht ins bestehende `portfolio` ein (Begründung +
Trenn-Pfad für branding.supply: §6). **Produktentscheidungen abgeschlossen; als LAUNCH-GATES verbleiben:**
A1-AVV/ZDR (§8) · P0-Interaktionsbilanz · P1a-Schema-Abnahme ·
P0b-Prototyp-Abnahme · P1d-Durchstich-Abnahme · P6+P7 fertig ·
P9-Rollout-Checkliste durchlaufen.

## 9b. Review-Runde (2026-08-27, 30 Punkte — Ergebnisse)

Externe Review-Runde von David eingebracht; Triage: ~ein Drittel war schon
entschieden und wurde bestätigt (#4, #8, #16, #18, #20), ein Drittel fachlich
übernommen, sechs Punkte von David entschieden. NEU FESTGELEGT:

1. **Vollständigkeit gewinnt** (GEGEN die Empfehlung „45 min hart"): ~45 min
   bleiben Richtwert, kein Abschneide-Kriterium. Konsequenz: die gemessenen,
   ehrlichen Zeitangaben je Baustein (§7) sind der Schutz gegen die
   Formular-Falle — sie MÜSSEN prominent stehen.
2. **Beta sofort BREIT — Studio-Kunden UND Gründer** (GEGEN „erst 5–10
   Studio-Kunden"): beide Pfade werden ab Tag eins real getestet;
   Einladungs-Code + Login-Pflicht bleiben. Konsequenz: mehr
   Betreuungsaufwand, Messwerte nach Pfad getrennt auswerten.
3. **Naming = „begleitete Vorprüfung"** (Empfehlung): Baustein voll da,
   Prüfung gestuft (Domain automatisch via RDAP/DNS als
   Registrierungsindikator, Handles als Suchlinks + Nutzer-Bestätigung,
   Marken als geführte Links + Studio-Assist, Sprachen per KI). Nimmt die
   Markendaten-Vertragsfrage vom kritischen Pfad; Vollautomatik Phase 2.
4. **KI-Datenschutz** (Empfehlung): OpenRouter bleibt, Routing beschränkt
   auf Anbieter mit **Zero-Data-Retention/No-Training**; AVV +
   Datenschutzerklärungs-Passus wandern ins BESTEHENDE Anwaltspaket A1;
   klarer Nutzer-Hinweis, was gesendet wird. Dazu EINGABE-LEITPLANKEN
   (#11): UI bittet ausdrücklich, KEINE Kundennamen, Mitarbeiterdaten,
   unveröffentlichten Zahlen oder fremde PII einzugeben. Direktvertrag
   (DPA) bleibt Go-Live-Option.
5. **KI-Budget** (Empfehlung): Beta großzügig — 200 Generierungen/Tag je
   KONTO plus max. 10 Neu-Entwürfe/Tag je Brand × Slot-Typ (Doppel-Limit,
   weil ein reines Profil-Limit per Neuanlage umgehbar wäre). Öffnungs-
   Limits werden aus den Beta-Messwerten kalibriert. Bei leerem Budget
   oder Anbieter-Ausfall (#15): Stand bleibt VOLL bearbeitbar, George
   erklärt knapp, wann neue Entwürfe möglich sind.
6. **CTA-Ökonomie** (Empfehlung): Hinter der Schranke steht in Horizont 1
   das **Erstgespräch für ein individuelles Studio-Projekt** (Brand
   Design/Book/Theme/Site als beauftragte, werkzeuggestützte Arbeit).
   Das standardisierte Selbstbedienungs-Produkt entsteht mit
   branding.supply aus den Beta-Daten.

FACHLICH ÜBERNOMMEN (ohne eigene Frage): `ownerType+ownerId`
(`'user' | 'community'`) + vorgesehene Eigentums-Übertragung (§6) ·
E-Mail-GEBUNDENE Beta-Einladung über den EIGENEN `brand_invites`/
`brand_access`-Vertrag (§6 — Audit 2: die bestehenden Mechanismen
`invite_codes`/`inviteToken` tragen das nicht) ·
URL-Rohmaterial wird nach Extraktion FRÜH gelöscht, jede Brand jederzeit
vollständig löschbar, Transkript-Speicherung mit klarer Erklärung im UI ·
URL-Analyse NUR eigene Website + ausdrücklich benannte Wettbewerber, kein
autonomes Crawling · BEIDE Übernahmequoten gemessen (Erstentwurf↔Endfassung
= Modellqualität; letzter Entwurf↔Bestätigung = Zusammenarbeits-Wirksamkeit)
· George-Persönlichkeit wird in P0 über DREI konkrete Beispielantworten
definiert (inkl. „darf widersprechen und Schwaches benennen") · Share =
Momentaufnahme + Bestätigungs-Dialog + Widerruf/Ablauf (§6) · ~~`visibility`
Phase 1 nur `private`/`shared`~~ (DURCH AUDIT 6 ERSETZT: kein
visibility-Feld in Phase 1, „geteilt" ist abgeleitet — §6/§9f) · Design-Vorschau = KURATIERTE
Archetyp-Presets aus der Themes-Engine, Auswahl speicherbar, ehrlich als
„Designrichtung" beschriftet — keine vorgetäuschte Individual-Gestaltung.

**Beta-Erfolgskriterien (§9b.29, Ausgangswerte — nach erster Kohorte
kalibrieren):** ≥60 % vollständige Foundations · ≥70 % der Slots höchstens
leicht überarbeitet · qualitative Bewertung ≥4/5 · Median aktive Zeit wird
GEMESSEN und kalibriert die Zeitangaben (kein hartes Kriterium, §9b.1).
**Bewertung durch BEIDE** (#30): Nutzerzufriedenheit + Davids fachliches
Stichproben-Review — eine hohe Übernahmequote allein kann auch unkritische
Nutzer bedeuten. **ERHEBUNGSWEG der 4/5 (Audit 5):** nach Abschluss GENAU
EINE freiwillige Frage („Wie hilfreich war das Ergebnis?", 1–5) als
`brand_events`-Ereignis; kein Freitext — Qualitatives kommt aus
Interviews und Stichproben.

## 9c. Audit 2 (2026-08-28, code-geprüft) — wo die fünf Blocker gelandet sind

Zweites externes Audit, diesmal auf Code-Ebene; Kernbehauptungen von mir
gegen den Code verifiziert (RESERVED_SUBDOMAINS, signup.post.ts,
inviteCodes.ts, portfolio-Config, verify-schema-parity.mjs) — alle fünf
Blocker bestätigt und ALS VERTRÄGE eingearbeitet:

1. **Zugang** ⇒ eigener `brand_invites`/`brand_access`-Vertrag +
   `requireBrandAccess`-Gate (§6 Zugang; die M9-Behauptung war falsch).
2. **Datenmodell** ⇒ firstDraft/latestDraft/confirmed, Generations-
   Metadaten mit inputHash statt `stale`, `revision`-Nebenläufigkeit,
   `brand_shares`-Snapshot-Tabelle (§6 Speicher-Fluss + Ausgabe).
3. **Security** ⇒ SSRF-Vertrag nach OWASP, Prompt-Injection-Grenze,
   OpenRouter zdr/deny/Allowlist/fail-closed; A1-AVV als
   LAUNCH-Abhängigkeit (§6 + §8).
4. **Zeit-/Eingabeversprechen** ⇒ als Hypothese gekennzeichnet;
   P0 liefert die Interaktionsbilanz je Pfad (§1 + P0).
5. **Messung** ⇒ Plausible nur Akquisition/Start/CTA; Produkt-Funnel über
   profilgebundene Server-Ereignisse; `accumulatedActiveMs` statt
   Start/Ende; strukturierte Slot-Änderungen vor Levenshtein (§7).

Korrekturliste ebenfalls eingearbeitet: portfolio-Beschreibung (hat Auth,
Realtime an) · `brand` in RESERVED_SUBDOMAINS EINTRAGEN · A14-Zeile +
Themes-Vorschau-Vertrag · PORTFOLIO_SOLL erweitern · Ergebnis-Liste
vervollständigt · RDAP als Registrierungsindikator · P6 ohne
David-Abhängigkeit · Pairwise-Beweismatrix · ownerType
`'user' | 'community'` · Quellen mit URLs + Abrufdatum · Tippfehler.

## 9d. Audit 3 (2026-08-28, code-geprüft) — die vier Bau-Verträge

Drittes Audit; Urteil dort: „Produktentscheidung freigabefähig, vier
technische Verträge fehlen für den Baustart." Alle vier verifiziert
(aiComplete-Body selbst geprüft: kein `provider`-Objekt) und eingearbeitet:

1. **Signup-Naht ohne Layer-Bruch** ⇒ generisches
   `registerSignupAdmissionProvider()` im Core, brand registriert per
   Nitro-Plugin; fail-closed, neutrale Ablehnung, brand_access erst nach
   E-Mail-Verifizierung (§6 Zugang).
2. **Schema vollständig** ⇒ SIEBEN Tabellen (+`brand_events`),
   `createdByUserId` + ownerType/ownerId, zentrale
   `brandPermissionsForOwner()` (community-Zweig getestet), begrenzte
   Generations-Historie, VERALTET als abgeleiteter Zustand; P1a liefert
   den Schema-Anhang zur Durchsicht (§6).
3. **providerRouting in der KI-Naht** ⇒ Core-Erweiterung als eigener
   Commit, ein Request-Builder für Stream/Non-Stream, Request-Inhalt
   getestet, Fehler statt Fallback (§6 KI).
4. **Themes-Vorschau via iframe** ⇒ Themes wirken global auf `:root`;
   je Richtung ein Preview-iframe, Vertrag liefert nur validierte
   Presets (§5 Ergebnis).

Nachbesserungen ebenfalls drin: Share-Inhalt festgelegt (Story +
bestätigte Kapitel, nie Chats/Entwürfe/Metriken) + Routen-Härtung ·
Handles als Suchlinks + Bestätigung · **kein Billing und kein notify()
in Phase 1** · observed|inferred-Kennzeichnung externer KI-Aussagen ·
§10 beweist die Kernverträge einzeln · P1 in P1a/P1b geteilt, P8 auf M ·
OPEN-ITEMS aktualisiert · Status heißt „Produktentscheidungen
abgeschlossen; Launch-Gates verbleiben".

## 9e. Audit 5 (2026-08-28) — Betriebsreife

Fünftes Audit; alle Punkte übernommen, KEINE neue David-Entscheidung nötig:

**Vor P1b (Verträge, eingearbeitet):** (1) **Zugriffsgrenze**: alle
brand_*-Tabellen server-only (Permissions `[]`), Browser nur über
/api/brand/**, kein Appwrite-Realtime für Brand-Daten,
brandPermissionsForOwner wird Server-Autorisierungsfunktion (§6).
(2) **Serverseitige Zustandsmaschine** als pure Regeln
(resolveBrandJourney & Co.), Weichen-Änderung deaktiviert Daten statt zu
löschen (§3e). (3) **Beta operativ**: /brand/invite/:token, Access-Modus
closed|invite|open als Laufzeit-Wert in app_config, Operator-SKRIPTE
brand:invite/revoke/access (§3e). (4) **EIN AI-Limit-Vertrag** (200/Tag
Konto + 10/Tag Brand×Slot-Typ, Zähl-Definitionen, Instanz-Deckel,
Kill-Switch, Persist-vor-completed, inhaltsfreie Logs — §6).

**Vor der Beta:** Share-/iframe-Härtung erweitert (no-store, Token nie in
Logs, CSP/frame-ancestors, sandbox-iframes, 30-Tage-Default, Snapshot
trägt presetVersion) · Registry-Migration (registryVersion, Upcaster,
deaktivierte Slot-IDs, Rollback zur Vorversion) · visibility entkoppelt
(hasActiveShare abgeleitet, kein Profil-Feld „shared") ·
URL-Analyse-Umfang (max. 5 bestätigte Same-Origin-Seiten, Limits,
Eigentums-Bestätigung; Markenbeispiele nur Namen, keine fremden Logos) ·
4/5-Erhebung als eine freiwillige Frage in brand_events.

**Korrekturen:** Status/P0b-Gate (vor P1c) · Launch-Gates vollständig ·
MEDIUMTEXT-Formulierung (off-row, umgeht das Budget; Zod-Limit bleibt) ·
Solo/Team = nur Fragen-Anpassung · P0b-Ort = minimales
packages/brand-Gerüst · neues Paket **P9 Beta-Betrieb & Rollout**.

## 9f. Audit 6 (2026-08-28) — Schlussabnahme

Sechstes Audit; Urteil: **inhaltlich freigegeben, final abgenommen und
baureif** — kein weiterer Produkt-, UI- oder Funktionsbereich fehlt.
Eingearbeitet: der Laufzeitkonfigurations-VERTRAG
(`brandAdmissionMode` closed|invite|open mit Default `closed`, getrennt
von der Produktsperre; `brandAiEnabled` Default `false`; System-
Migrationen + Paritäts-SOLL als ausdrückliche P1a-Lieferung; fail-closed
bei fehlender Konfiguration) · `visibility` in Phase 1 VOLLSTÄNDIG
entfernt (nur abgeleitetes hasActiveShare; Discover bekommt später ein
separates `publicationVisibility`) · requireBrandAccess präzisiert
(Ausnahmen NUR Invite-vor-Login + öffentlicher Share-GET; Preview
privat) · Reihenfolge vereinheitlicht (P0/P0b/P1a parallel → P1b nach
BEIDEN Abnahmen → P1c) · `brandPermissionsForOwner` umbenannt in
**`assertBrandOwnerAccess`** (erzeugt nach der Server-only-Wende keine
Permissions mehr; historische Nennungen in §9c–§9e gelten als dadurch
ersetzt) · Sicherheitsnachschärfungen (Share `frame-ancestors 'none'`,
Preview `'self'`; Burst-Limit 2 parallele Generierungen je Konto;
Missbrauchssperre widerruft aktive Shares automatisch) · fünf neue
Gegenproben in §10. Weitere Details werden INNERHALB der Arbeitspakete
entschieden — das Gesamtkonzept wird dafür nicht mehr geöffnet.

## 10. Beweise

- `packages/<key>/scripts/verify-brand-wizard.mjs`: Weichen-Abdeckung als
  **PAIRWISE-Matrix + gezielte Grenzfälle** (Audit 2: vier binäre Weichen ×
  zwei Sprachen sind bis zu 32 Kombinationen — „alle Pfade" wäre gelogen
  oder teuer; pairwise deckt jede Zweier-Wechselwirkung, dazu die
  Grenzfälle leerster/vollster Pfad) — geprüft wird je Kombination die
  richtige Baustein-Folge. **Kernverträge einzeln bewiesen (Audit 3):**
  Invite-Ablauf inkl. E-Mail-Bindung, Ablauf/Widerruf und neutraler
  Ablehnung · brand_access erst nach E-Mail-Verifizierung · idempotenter
  Code-Verbrauch · Revision-Konflikt ⇒ 409 · Generations-Historie bleibt
  über Regenerationen erhalten · Share-Snapshot friert ein + Rotation
  widerruft · SSRF-Bypässe (Redirect auf interne IP, DNS-Rebinding,
  Metadata-Adresse, Dekompressions-Bombe) werden ABGEWIESEN ·
  OpenRouter-Request enthält zdr/deny/only/allow_fallbacks.
  **Playwright-Szenarien (§3e-Verträge):** Autosave + Reload · zwei Tabs
  erzeugen kontrollierten 409 (beide Auswege) · Stream abbrechen und neu
  starten · Anbieter-/Budget-Ausfall ohne Datenverlust · komplette
  Tastaturbedienung · Mobile mit geöffneter Bildschirmtastatur ·
  Theme-Vorschau verändert NIE das Wizard-Chrome · Share-Ansicht ohne
  Login erreichbar, private Routen nicht · Screenshots bei ~390/768/1280/
  1440 px · keine Chats oder Brand-Inhalte in Analytics oder technischen
  Logs · **vollständige Brand-Löschung** (alle sieben Tabellen,
  Generierungen; Share-Links sofort unwirksam) · Zustandsmaschine weist
  Step-Übersprünge und Fortschritts-Manipulation ab · GEGENPROBEN
  (Audit 6): direkter Appwrite-Client-Zugriff auf brand_* scheitert ·
  gesperrter Nutzer verliert trotz Eigentümerschaft den API-Zugriff ·
  alle drei Admission-Modi verhalten sich wie definiert · AI-Kill-Switch
  greift · fehlende Laufzeitkonfiguration fällt fail-closed zurück;
  Drosseln greifen (Mensch-Bucket, Tages-Eimer, IP); Entwurfs-Cache trifft
  bei unverändertem Input; Übernahme-Metrik wird geschrieben; fremdes Profil
  nicht lesbar (RBAC mit label-losem User testen). **Jede Prüfung mit
  GEGENPROBE** — fail-soft-Pfade sind sonst immer grün (Mail-Links-Lektion).
- Unit: Weichen-Regel und Archetyp-Berechnung als pure Funktionen in
  `shared/` mit Tests (Muster resolveThemeSelection).

## Benennung: „Branding" ist das Wort fürs eigene Projekt (2026-08-30, David)

Das eigene Vorhaben eines Users heißt durchgängig **„Branding"** (Neutrum):
„Brandings" (Übersicht, vorher „Meine Brands"), „Neues Branding",
„Beispiel-Branding", „Starte dein Branding", „Brandings verwalten".
UNANGETASTET bleiben englische Produktnamen (Brand Wizard, Brand Design,
Brand Book & Kit, Brand Experience, Brand Monitoring, Brand Score, Brand
Benchmark, Brand Foundation, Brand Insights, Discover Brands, Brand-Check)
und echte Fremdmarken in Insights (Erwähnte Brands, Brand-Profil, Brand-Duell).
Außerdem: „Brandings" + „Neues Branding" leben als erste Gruppe im
Avatar-Menü (das Split-Control im Header ist entfallen); „Tastaturkürzel"
und „Support kontaktieren" sind aus dem Menü raus, weil es beides noch
nicht gibt.

## Werkstatt-Zonen ziehbar via USplitter (2026-08-30, David)

Nuxt UI 4.11.0 (Katalog-Bump, repo-weit) bringt `USplitter` — die zwei
Nähte Rail|Bühne und Bühne|George sind auf Desktop (>=1280px) ziehbar:
1px-Linie als Handle (Akzent bei Hover/Drag), min/max je Zone (Rail
16–34 %, Bühne min 32 %, George 20–42 %), `autoSaveId="bw-workspace"`
persistiert die Aufteilung je Browser. SSR + erster Client-Paint rendern
weiter das CSS-Grid (kein Hydration-Mismatch), der Splitter mountet per
matchMedia; unter 1280px unverändert Mini-Rail/Modusschalter. Rail-Fuß
extrahiert nach `BwRailFooter.vue` (eine Quelle für beide Zweige).
Bump-Fallen dokumentiert: unhead-Doppelung per `pnpm dedupe` auf 3.4.0
geeint; pnpm update zerstörte die Katalog-Kommentare der
pnpm-workspace.yaml (restauriert).
