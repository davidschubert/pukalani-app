# Brand-Wizard — P0 Inhalts-Spezifikation

> **Archiviert am 2026-11-21 (Q19).** Format-Muster vom 2026-08-28 zum gebauten Plan [BRAND-WIZARD-PHASE-1.md](BRAND-WIZARD-PHASE-1.md); abgelöst durch [BRAND-WIZARD-CONTENT-SPEC.md](BRAND-WIZARD-CONTENT-SPEC.md).
> Dieses Dokument ist Protokoll, keine Arbeitsliste.

Stand: 2026-08-28 · Status: **IN ARBEIT — dies ist das FORMAT-MUSTER**
(Baustein C vollständig ausgearbeitet). Nach Davids Format-OK folgen alle
übrigen Bausteine im selben Format, dann Abdeckungs-Matrix-Gesamtstand und
Interaktionsbilanz. Grundlage: [BRAND-WIZARD-PHASE-1.md](BRAND-WIZARD-PHASE-1.md)
(§3b Slot-Modell, §3c Prinzipien, §3e Slot-Registry-Vertrag).

## 0. Konventionen

- **Slot-IDs**: `<baustein>.<name>` in camelCase, englisch, STABIL — nie
  übersetzt, nie umbenannt (§3e). Beispiel: `values.conflictRule`.
- **Zwei Slot-Sorten** (beide in der Registry, unterschieden über `type`):
  - **Antwort-Slots** (`type: answer.*`) — was der Mensch in der
    Provokation beantwortet. Rohmaterial für Generatoren, erscheint NICHT
    als eigenes Kapitel im Dokument.
  - **Dokument-Slots** (`type: doc.*`) — die Artefakte, die George
    entwirft und der Mensch bestätigt. NUR sie bilden das
    Foundation-Dokument.
- **Registry-Felder** je Slot (§3e): `id, stepId, type, required, schema,
  dependencies, questionKey, helpKey, editor, generator, maxLength`.
  Hier verkürzt notiert; der TypeScript-Katalog entsteht in P1b aus
  dieser Spez.
- **Fragetexte**: `en` zuerst (Hauptsprache), `de` darunter. Chips als
  Liste; Empfehlung-zuerst, wo es eine gibt. Der „Weiß ich nicht"-Chip
  ist ÜBERALL implizit (Interaktionsregel 5) und wird nicht je Frage
  wiederholt.
- **Abdeckung**: jede Zeile der Original-Formulare bekommt ein Schicksal
  (§1 Vollständigkeits-Vertrag): `MENSCH` (getippt) · `KI` (abgeleitet,
  als Entwurf bestätigt) · `DUP` (Duplikat, verschmolzen in →Slot) ·
  `WEICHE` (wird zur Verzweigung statt Frage) · `LEHR` (Lehrblock, keine
  Frage) · `STRICH` (bewusst gestrichen, mit Grund).

---

## FORMAT-MUSTER: Baustein C — Werte (aus Formular 03)

**Ziel des Bausteins:** 3–5 Werte mit je einer Eigendefinition, je einem
gelebten Beispiel und einer Konfliktregel — das Kapitel „Werte" im
Foundation-Dokument.
**Ehrliche Zeitangabe (Hypothese, wird gemessen):** 8–12 Minuten.
**Pfad-Varianten:** Solo/Team ändert Formulierungen (Ich/Wir); der
Rebrand-Pfad ersetzt eine Discovery-Frage (s. C-P3).

### C-Slots (Registry-Auszug)

| id | type | req | dependencies | generator | Anmerkung |
|---|---|---|---|---|---|
| `values.discovery1..3` | answer.longtext | ja (3 von 6 Kandidaten) | context.* | — | George wählt 3 Kandidaten-Fragen nach Pfad/Kontext |
| `values.candidates` | doc.wordlist | ja | values.discovery*, context.summary | `gen.valueCandidates` | 8–12 Wertewort-Kandidaten MIT je 1 Satz Herleitung („weil du sagtest …") |
| `values.final` | doc.wordlist(3–5) | ja | values.candidates | — (reine Auswahl) | Mensch grenzt ein; George warnt bei >5 („Werte wirken nur zu wenigen") |
| `values.definitions` | doc.structured | ja | values.final | `gen.valueDefinitions` | je Wert: „Wert → was er bei UNS heißt" (Format 03 §7), max 200 Z./Wert |
| `values.livedExamples` | doc.structured | ja | values.final | `gen.livedExampleStubs` | je Wert 1 ECHTES Beispiel — George schlägt Stubs aus Discovery-Antworten vor, Mensch macht sie konkret |
| `values.conflictRule` | doc.text | ja | values.final | `gen.conflictScenario` | George KONSTRUIERT das wahrscheinlichste Konfliktpaar und fragt, welcher Wert gewinnt |
| `values.neverList` | answer.shorttext | nein | — | — | „nie dulden"-Antwort; fließt zusätzlich in E (Manifest) und D (Vokabular) |

### C-Ablauf in der Kernbewegung

1. **Kontext (KI):** George fasst zusammen, was aus A/B schon nach Werten
   klingt („Du hast zweimal Verlässlichkeit betont …"). Kein neuer Input.
2. **Lehr-Kurzfassung (2 Sätze + „Zeig mir mehr"):**
   - en: *Core values are what you'd lose money over — not words on a
     wall. We're looking for who you are, not who you'd like to be.*
   - de: *Werte sind das, wofür ihr Geld verlieren würdet — keine Wörter
     an der Wand. Wir suchen, wer ihr seid, nicht wer ihr gern wärt.*
   - „Mehr dazu" öffnet den vollen Lehrblock aus 03 §3+§4 (Was Werte
     sind/nicht sind; Patagonia/Basecamp/Mailchimp) — übernommen,
     übersetzt, gekürzt um Wiederholungen.
3. **Provokation (3 von 6 Kandidaten, George wählt nach Pfad):** s. C-P1–C-P6.
4. **Entwurf:** `values.candidates` — Kandidaten MIT Herleitung.
5. **Korrektur/Auswahl:** Mensch grenzt auf `values.final` ein
   (Chips, Mehrfachwahl, eigene Wörter per Freitext zulässig).
6. **Aktivierung:** `values.definitions` (KI-Entwurf je Wert) →
   `values.livedExamples` (Stubs → konkretisieren) →
   `values.conflictRule` (konstruiertes Szenario).
7. **Festlegung:** Kapitel-Zusammenfassung, Konfidenz-Chips
   (Passt / Fast / Nochmal).

### C-Provokationsfragen (Kandidaten-Pool; George stellt 3)

**C-P1** · `values.discoveryBest` · aus 03 §5 Q1
- en: *Think of a moment when your business was at its best. What was
  happening?*
- de: *Denk an einen Moment, in dem dein Geschäft am besten war. Was ist
  da passiert?*
- Nachsatz (help): en *A project or decision that made you think: THIS is
  why I do this.* · de *Ein Projekt oder eine Entscheidung, bei der du
  dachtest: GENAU dafür mache ich das.*

**C-P2** · `values.discoveryWrong` · aus 03 §5 Q2
- en: *And the opposite — when did something feel deeply wrong?*
- de: *Und das Gegenteil — wann hat sich etwas zutiefst falsch angefühlt?*

**C-P3** · `values.discoveryNever` · aus 03 §5 Q3 (SETZT im Rebrand-Pfad
C-P1, weil Bestandsfirmen hier am schnellsten konkret werden)
- en: *What would you never tolerate — even from your best-paying client?*
- de: *Welches Verhalten würdest du nie dulden — auch nicht vom
  bestzahlenden Kunden?*
- speichert zusätzlich `values.neverList`

**C-P4** · `values.discoveryPeople` · aus 03 §5 Q4
- en: *What do your favorite clients or collaborators have in common?*
- de: *Was haben deine Lieblingskunden oder -mitstreiter gemeinsam?*

**C-P5** · `values.discoveryFire` · aus 03 §5 Q5
- en: *If you had to fire a client over a principle — which principle?*
- de: *Wenn du einen Kunden wegen eines Prinzips feuern müsstest —
  welches Prinzip wäre das?*

**C-P6** · `values.discoveryPraise` · aus 03 §5 Q6
- en: *What do people praise you for, again and again?*
- de: *Wofür loben dich Leute — immer und immer wieder?*

*(03 §5 Q7 „Wie soll dein Team ohne dich entscheiden?" → nur Team-Pfad,
ersetzt dort C-P6.)*

### C-Generatoren (Prompt-Skizzen — Ton-Regeln aus §3b gelten global)

- **`gen.valueCandidates`**: Eingabe = 3 Discovery-Antworten +
  Kontext-Zusammenfassung (A) + PVM (B). Auftrag: 8–12 Wertewort-
  Kandidaten in Nutzersprache, JE Kandidat ein Halbsatz Herleitung mit
  wörtlichem Bezug („weil du sagtest: ‚…'"). VERBOTEN: Allerwelts-Wörter
  ohne Beleg in den Antworten (Integrität, Exzellenz, Innovation nur,
  wenn die Antworten sie tragen). Ausgabe: Zod-Array {word, because}.
- **`gen.valueDefinitions`**: je gewähltem Wert EIN Satz im Format
  „Wert → was es bei uns heißt", konkret, erste Person Plural/Singular
  nach Pfad, Beispiel-Anker aus 03 §7 („Craftsmanship → lieber eine
  außergewöhnliche Website als fünf mittelmäßige").
- **`gen.livedExampleStubs`**: je Wert 1 Stub AUS den Discovery-Antworten
  („Das klingt nach deinem Moment mit … — stimmt das als Beispiel?");
  nie erfinden, `observed`-Kennzeichnung, Mensch konkretisiert.
- **`gen.conflictScenario`**: konstruiert aus `values.final` das
  wahrscheinlichste Konfliktpaar als EIN konkretes Szenario („Ein guter
  Kunde will es bis Freitag — Qualität oder Tempo?") und fragt, welcher
  Wert gewinnt. Ausgabe wird `values.conflictRule`-Entwurf.

### C-Abdeckung (alle 26 Zeilen aus Formular 03)

| # | Original (03) | Schicksal |
|---|---|---|
| §1 E-Mail-Pflichtfeld | STRICH — Konto ersetzt das Feld |
| §2 Your name / Company | DUP → Schritt 0 (`context.title`, Konto) |
| §2 „Defined core values?" | WEICHE → George fragt es konversationell als Einstieg, steuert Lehr-Tiefe |
| §2 „How many people involved?" | DUP → Weiche Solo/Team (Schritt 0) |
| §3 Why Values Matter (Lehrblock) | LEHR → Kurzfassung + „Mehr dazu" (C-Ablauf 2) |
| §4 Real-World Examples | LEHR → im „Mehr dazu"-Panel |
| §5 Q1 bester Moment | MENSCH → C-P1 |
| §5 Q2 falscher Moment | MENSCH → C-P2 |
| §5 Q3 nie dulden | MENSCH → C-P3 (+`values.neverList`) |
| §5 Q4 Lieblingskunden | MENSCH → C-P4 |
| §5 Q5 Feuer-Prinzip | MENSCH → C-P5 |
| §5 Q6 wiederkehrendes Lob | MENSCH → C-P6 |
| §5 Q7 Team-Entscheidungen | MENSCH (nur Team-Pfad) |
| §6 Wortlisten 7 Kategorien | KI → `values.candidates` ersetzt die statische Liste (kontextbezogene Kandidaten statt 80 Wörter) |
| §6 „fehlende Wörter?" | MENSCH → Freitext-Zusatz bei der Auswahl (C-Ablauf 5) |
| §7 Narrow-Down-Lehrtext | LEHR → George-Hinweis bei >5 Auswahl |
| §7 Top 3–5 | MENSCH → `values.final` (Auswahl statt Tippen) |
| §7 je Wert 1 Satz | KI → `values.definitions` (Entwurf, Mensch korrigiert) |
| §8 gelebtes Beispiel je Wert | MENSCH+KI → `values.livedExamples` (Stub aus Antworten, Mensch konkretisiert) |
| §8 Einfluss auf Kommunikation | KI → fließt in D-Stimmprofil (`voice.*`), dort bestätigt — DUP-Auflösung statt Doppelfrage |
| §8 Einstellungs-Filter | STRICH — Personal-Perspektive, für Zielgruppe (Solo/Kleinst) ohne Träger; Konfliktregel deckt die Hierarchie-Erkenntnis |
| §8 Werte-Konflikt | MENSCH → C-Ablauf 6, `values.conflictRule` (Georges konstruiertes Szenario statt „fällt dir was ein?") |
| §9 finales Statement | KI → das KAPITEL selbst ist das Statement (komponiert aus final+definitions) |
| §9 Konfidenz 1–5 | ERSETZT → Konfidenz-Chips (Interaktionsregel 8) |
| §9 „How to proceed?" | STRICH — der Wizard IST das Weiter |
| §9 Anmerkungen | DUP → freie George-Rückfrage jederzeit |

**C-Bilanz:** 26 Original-Zeilen → 6–7 menschliche Antworten (3 Discovery
+ Auswahl + Beispiele konkretisieren + Konfliktentscheid; +1 im
Team-Pfad) · 5 KI-Entwürfe · 4 Lehr/Weiche · 4 gestrichen mit Grund ·
Rest Duplikate. **Kein Inhalt verloren.**

---

## Ausstehend in dieser Spez (nach Format-OK)

Bausteine 0/A/B/B2/D/E/E+/F im selben Format · Abdeckungs-Matrix
GESAMT (287 Zeilen, je Formular ein Abschnitt wie oben) ·
Interaktionsbilanz je Pfad (min/erwartet/max) · George-Systemprompt +
DREI Persönlichkeits-Beispielantworten · Persona-Namensprüfung „George" ·
BIxD-Abgleich · Visual-Spez B2-Diagramm + D-Bildkarten.
