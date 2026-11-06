# Branding-Atome: eine Session je Feld — das Designsystem der Foundation

Stand 2026-09-05 · Status: **AUSGEFÜHRT — Pakete 1–8 live auf branding.supply (2026-09-04/05)**; offen nur Davids Abnahme der Dokument-Seite und die Reste in OPEN-ITEMS (BW2). Archiviert als Begründung und Rezept, keine Arbeitsliste.
Ursprünglich: Gesamtbild von David freigegeben 2026-09-04, Ausführung als Opus-Läufe je Paket (§15), Verifikation im Fable-Hauptloop.

## 0. Was das hier ist

Davids Idee vom 2026-09-04, in drei Runden geschärft:

> „Wir dröseln alles bis ins letzte Detail auf … jeder Einzelpunkt bekommt
> seine eigene Session mit dem KI-Markenberater und seinem Spezialisten im
> Hintergrund. Jede Session bekommt ihre eigene vorher definierte Config:
> welches Ziel, welche Infos, wie verarbeiten, wie mit Antworten umgehen, was
> ist der finale Output, der zurück in den Log gespeichert wird. Am Ende haben
> wir ein fertiges Dokument, das noch einmal von KI analysiert wird. Und wenn
> man am finalen Dokument etwas ändert, prüfen Regeln vorher die
> Abhängigkeiten — annehmen oder abbrechen. Das ist wie ein Designsystem, das
> auf Atomen aufgebaut ist, nur die Branding-Variante davon."

**Die fünf Entscheidungen (David, 2026-09-04):**

1. **Session je Feld**, nicht je Kapitel und nicht je Abschnitt. Eine Session
   ist eine **konfigurierte Arbeitseinheit**, kein Chat-Faden: Ableitungen
   ohne Frage sind ein gültiger Session-Typ.
2. **Auto-Weiter:** ist der Output einer Session bestätigt, öffnet die nächste
   von selbst und George spricht schon. Der Mensch sieht EIN Gespräch, das
   System sieht 68 Sessions.
3. **Ein Spezialisten-Aufruf beim Schliessen** jeder Session (nicht je Zug):
   prüft den Output gegen das Ziel, ordnet ein, prüft gegen das bestätigte
   Dokument auf Konflikte, schreibt den Log-Eintrag.
4. **Korrektur-Regel:** vor jeder Korrektur eines bestätigten Feldes zeigt der
   Server, welche bestätigten Felder davon abhängen — annehmen oder abbrechen.
5. **Schlussanalyse:** das fertige Dokument wird einmal als Ganzes geprüft
   (Widersprüche, Lücken, Schärfung). Das ist das Konzept der bisher offenen
   Ergebnis-Seite.
6. **Finale Abnahme je Kapitel (2026-09-04, zweite Runde):** jedes Kapitel
   endet mit einem eigenen Punkt „Finale Abnahme", der ALLE Ergebnisse seiner
   Sessions untereinander zeigt, losgelöst von der Bühne. Erst wenn dort
   alles abgenommen ist, öffnet das nächste Kapitel. Damit hat JEDE Ebene
   ihren Abschluss: Session → bestätigen, Kapitel → Finale Abnahme,
   Foundation → Dokument-Prüfblick (§10). Drei Ebenen, drei Abnahmen.

**Unverändert bleiben** die Eine-Stimme-Entscheidung (DECISION-LOG
2026-09-02: George spricht, das Team liest mit), der Marker-Vertrag des
Chat-Zugs (`georgeTurn.ts`), die Bühne mit Bestätigen als ZUSTAND
(Werkstatt-Feinschliff 2026-09-02) und der Grundsatz „Registry ist die EINE
Quelle" (Phase-1-Plan §3e).

## 1. Leitbild: das Designsystem der Marke

| Designsystem | Foundation | Im Code |
| --- | --- | --- |
| Atom | **Session** = ein Feld mit Config, Ziel und Output | `BrandSessionConfig` je Slot (§3) |
| Molekül | **Kapitel** = Sessions, die einen Bogen bilden | `stepKey`, Zustand ABGELEITET aus den Sessions (§5) |
| Organismus | **Der Weg** = Kapitel in Reihenfolge, Weichen | `brandJourney.ts` (bleibt) |
| Token | **Bestätigter Wert** = die eine Wahrheit, aus der alles Weitere schöpft | `brand_steps.slots[id].value` + `sourcesHash` (§9) |
| Dokument | **Der Log** = alle bestätigten Werte, Notizen und Befunde, chronologisch | rechte Spalte heute, `brand_findings` neu (§4) |

Wie in einem Designsystem gilt: ein Atom weiss, woraus es gebaut ist
(`dependencies`) und wer es benutzt (die Umkehrung, §9). Ändert sich ein
Token, sieht man, welche Komponenten es trifft, BEVOR man es ändert.

## 2. Ist-Stand — was schon da ist und NICHT neu gebaut wird

- **Die sortierte Liste existiert.** `packages/brand/shared/slotRegistry.ts`
  ordnet 68 Felder in 9 Bausteinen; jede `dependencies`-Liste zeigt nur
  rückwärts, das Array ist die topologische Ordnung. Anhang A ist daraus
  mechanisch erzeugt — nichts davon ist handgeschrieben.
- **Session-Config zu vier Fünfteln.** Je Feld gibt es Typ, Pflicht, Quellen,
  Generator, Editor, Fragetext, Lehrblock, Zeichen-Deckel, Pfad-Varianten
  (Registry) sowie je Kapitel die Interviewtechnik der Kollegin
  (`brandAdvisors.ts`, `techniqueForStep`). Feld-spezifische Anweisungen
  liegen VERSTREUT in `georgePrompt.ts`, `veraPrompt.ts`, `miloPrompt.ts` —
  die ziehen in die Config (§3).
- **Der Verlauf hängt schon am Kapitel** (`brand_messages.stepKey`,
  Migration brand-003), Fenster 6 Züge (`BRAND_CONVERSE_HISTORY_MAX`). Neu
  ist nur der Session-Schlüssel daneben (§12).
- **Der Entwurfs-Generator ist schon ein zweiter Aufruf** mit Quellen aus allen
  Kapiteln (P3, `brandGenerators.ts`). Er bleibt der Entwurfs-Weg der
  Sessions vom Typ `derive`/`draft`/`candidates`.
- **„Veraltet" ist abgeleitet, nicht geflaggt** (`inputHash` je Generation) —
  aber nur für GENERIERTE Felder. Ein Frage-Feld wie `c.livedExamples` hängt
  von `c.final` ab und merkt eine Änderung heute nicht. §9 schliesst das.
- **Wiederöffnen propagiert bewusst nicht** (`brandJourney.ts`, Kopf). Bleibt
  so; die Korrektur-Regel setzt den Menschen an die Stelle des Automatismus.
- **Die adaptive nächste Frage ist als Platzhalter vorgesehen**
  (`resolveNextQuestion`: „die adaptive Wahl kommt später und ersetzt genau
  diesen Rumpf"). §6 füllt ihn, ohne die Regel „Reihenfolge gehört der
  Registry" zu brechen.
- **Archetyp-Interim** (DECISION-LOG 2026-09-04, `george-archetype-1` auf
  main): George leitet die Archetyp-Kette im Gespräch her, bis das
  Paarvergleich-Instrument gebaut ist. Für diesen Plan heisst das: die
  Session `d.pairs` ist vom Typ `instrument`, läuft interim aber als `derive`
  — die Config trägt beide Wege, der Rückbau-Pfad bleibt der aus dem
  DECISION-LOG.

**Die Zahlen aus der Registry (2026-09-04):**

| Kapitel | Sessions | Frage | Auswahl | Ableitung | Entwurf | Instrument |
| --- | --- | --- | --- | --- | --- | --- |
| A Kontext | 11 | 5 | 1 | 3 | 2 | — |
| B PVM | 10 | 6 | 1 | — | 3 | — |
| B2 Architektur | 5 | 3 | 1 | — | 1 | — |
| C Werte | 9 | 6 | 1 | 1 | 1 | — |
| D Archetyp | 12 | 5 | 2 | 4 | — | 1 |
| E Manifest | 6 | 2 | 2 | — | 2 | — |
| EP Sprache | 5 | — | 2 | 1 | 2 | — |
| F Naming | 8 | 2 | 4 | 2 | — | — |
| Ergebnis | 2 | — | 2 | — | — | — |
| **Summe** | **68** | 29 | 16 | 11 | 11 | 1 |

39 Sessions haben kein Gespräch mit dem Menschen als Kern (Auswahl,
Ableitung, Entwurf, Instrument). Genau deshalb ist „Session" eine
Arbeitseinheit und kein Chat.

## 3. Der Session-Vertrag: `BrandSessionConfig`

EINE deklarative Beschreibung je Feld, in der Registry, PUR (kein i18n, kein
H3, kein Appwrite). `defineSlot` wird zu `defineSession`; die bestehenden
Slot-Felder gehen darin auf, **die Ids bleiben unverändert** (Registry-Kopf:
„Slot-Ids sind unveränderlich" — sie stehen in jeder Bestands-Zeile).

```ts
export type BrandSessionKind =
  | 'ask'        // F: eine Menschenfrage, George fragt, hört, spiegelt
  | 'collect'    // F, mehrteilig: sammelt N Teile nacheinander (a.facts)
  | 'choose'     // A: Auswahl aus Registry-Optionen, ggf. mit Empfehlung
  | 'derive'     // K: George leitet ab, der Mensch bestätigt/korrigiert
  | 'draft'      // K→B: George entwirft, redigiert wird auf der Bühne
  | 'instrument' // eigenes Werkzeug (d.pairs); interim 'derive'

export interface BrandSessionConfig {
  readonly id: string                 // = Slot-Id, unveränderlich
  readonly stepId: BrandStepKey
  readonly kind: BrandSessionKind
  readonly required: boolean

  /** ZIEL — ein Satz, was am Ende feststehen muss (Prompt-Text, englisch). */
  readonly goal: string

  /** EINGABEN — was die Session lesen darf. */
  readonly inputs: {
    /** bestätigte Werte anderer Sessions (heute `dependencies`, Pflichtangabe). */
    readonly slots: readonly string[]
    /** Startkarte, Website-Analyse — die Nicht-Slot-Quellen (heute implizit). */
    readonly startCard: boolean
    readonly siteAnalysis: boolean
    /** Notizen früherer Sessions dieses Kapitels (§4) mitlesen? */
    readonly notes: 'chapter' | 'none'
  }

  /** VERARBEITUNG — wie Antworten eingeordnet werden (Prompt-Text, englisch). */
  readonly processing: {
    /** normalisieren/kategorisieren: z. B. „Werte-Kandidaten NUR mit Moment-Beleg". */
    readonly rules: readonly string[]
    /** Welche Kollegin steht hinter George (heute `techniqueForStep`, jetzt je Session). */
    readonly technique: BrandAdvisorKey
  }

  /** ANTWORT-REGELN — was bei dünn / zu viel / „weiss nicht" passiert. */
  readonly answers: {
    /** Mindest-Substanz, unter der George kleiner fragt (Zeichen oder 'none'). */
    readonly minSubstance: number | 'none'
    /** Wie oft George nachfragt, bevor er den Stand annimmt. */
    readonly maxProbes: 0 | 1 | 2
    /** „Weiss ich nicht" ist eine gültige Antwort? (dann: Hypothese anbieten) */
    readonly allowUnknown: boolean
  }

  /** OUTPUT — der Feldwert nach Schema, plus was in den Log geht (§4). */
  readonly output: {
    readonly schema: { kind: BrandSlotKind, maxLength: number }
    readonly editor: BrandSlotEditor
    readonly generator: BrandSlotGenerator
    /** Muss der Spezialist beim Schliessen gegen das Dokument prüfen? (§7) */
    readonly review: 'full' | 'light'
  }

  // unverändert aus der Registry: questionKey, helpKey, pathVariants, deactivated
}
```

**Regeln, die der Test nagelt** (`slotRegistry.test.ts` erweitert):

- `inputs.slots` zeigt nur rückwärts (wie heute `dependencies`).
- Jede Session hat ein `goal` (nicht leer) und genau eine `technique`.
- `kind` passt zum `type`-Erbe: `question`→`ask`/`collect`, `choice`→`choose`,
  `derivation`→`derive`, `stage-edit`→`draft`, `special`→`instrument`.
- `collect` ist der EINZIGE Typ mit Teilen: die Config nennt sie
  (`parts: readonly string[]`, Locale-Schlüssel `brand.q.<id>.<part>`). Das
  löst den offenen Punkt „mehrteilige Katalog-Fragen (a.facts) einzeln
  nacheinander = Antwort-Akkumulation" — die Session sammelt die Teile
  SELBST und schreibt EINEN strukturierten Wert.

**Was Inhalt ist und was Code:** `goal`, `processing.rules` und die
`answers`-Werte sind INHALT — 68 Zielsätze plus Regeln. Sie kommen als Anhang
zur Content-Spec (`BRAND-WIZARD-CONTENT-SPEC.md`, neuer §14 „Session-Ziele")
und sind **Davids Gate** wie der Fragenkatalog. Der Code-Vertrag hier ist
davon unabhängig fertigbar (Paket 1 mit Platzhalter-Zielen aus den heutigen
Prompt-Anweisungen; Paket 2 tauscht sie gegen die abgenommenen).

**Prompt-Aufbau aus der Config:** `georgePrompt.ts` behält das
Regel-Fundament (Quellen-Ehrlichkeit, Leitplanken, Form, Zug-Vertrag). Die
FELD-Anweisungen (`instructionForContextSlot` und die Pendants in vera/milo)
werden durch EINEN Bauer `sessionInstruction(config, facts, locale)` ersetzt,
der Ziel, Eingaben, Verarbeitung und Antwort-Regeln in fester Reihenfolge
setzt. Die drei Prompt-Dateien schrumpfen auf Persönlichkeit + Fundament.
Die bestehenden Prompt-Tests (`georgePrompt.test.ts`, `advisorPrompts.test.ts`)
prüfen danach den Bauer statt drei Dateien.

## 3a. Was eine Session sonst noch vorher wissen sollte (ENTSCHIEDEN, David 2026-09-04: alle acht plus die zwei mechanischen)

Config, Ziel und Output sagen, WAS die Session tut. Für das bestmögliche
Ergebnis fehlt noch, WORAN man ein gutes Ergebnis erkennt und WIE man den
Menschen dorthin führt. Acht Ergänzungen, sortiert nach Wirkung; die ersten
sechs sind Inhalt (Davids Gate mit den Zielsätzen), die letzten zwei sind
mechanisch ableitbar und kosten keinen Text. **David hat am 2026-09-04 alle
acht angenommen** (Nr. 1, 2, 4, 5 als Inhalt; Nr. 6, 7, 8 und Vertagen als
Struktur; Nr. 3 war durch §5a schon Pflicht). Paket 1 baut den Vertrag damit
VOLLSTÄNDIG; `answers.minSubstance` kommt in drei Stufen
(`'short' | 'medium' | 'long'`, Stillschweigende Annahme, s. §16).

```ts
export interface BrandSessionConfig {
  // … §3 …

  /** 1 · QUALITÄTSKRITERIEN — 3–5 prüfbare Merkmale eines GUTEN Werts. */
  readonly quality: readonly string[]
  //   Beispiel b.purpose: 'one sentence' · 'names why the world is better,
  //   not what the company sells' · 'could not be said by a competitor' ·
  //   'no product or feature mentioned'
  //   Ohne sie ist `goalReached` (§7) eine Stimmung; mit ihnen ist es eine
  //   Liste mit Ja/Nein je Punkt, die George dem Menschen auch SAGEN kann.

  /** 2 · ANTI-MUSTER — was der Spezialist zurückweist, je Feld. */
  readonly antiPatterns: readonly string[]
  //   'generic claims (quality, passion, customer focus)' · 'a feature list'
  //   · 'a sentence the competitor could sign'. Heute gibt es `neverDo` nur
  //   je Beraterin; die scharfen Muster sind je FELD verschieden.

  /** 3 · BEISPIELE — 1–2 erfundene starke Werte, je Pfad, FREMDE Branche. PFLICHT seit §5a (Abnahme-Seite zeigt sie). */
  readonly examples: { new: readonly string[], relaunch: readonly string[] }
  //   Für die FORM, nie für den Inhalt — sonst schreibt das Modell das Beispiel
  //   ab. Wo es keine gibt: leer. Die neun KAPITEL-Geschichten sind dafür
  //   bewusst weit gestreut (Zuordnung im Kopf von `sessionContent.ts`): ein
  //   Kunde sieht seine eigene Branche in höchstens EINEM Kapitel. Hier stand
  //   bis 2026-09-04 „die Route wählt gegen `startCard.industry`" — eine Zusage
  //   ohne Deckung: es gibt je Session GENAU EIN Beispielpaar, die Route hatte
  //   nie etwas zu wählen (Inhalts-Audit Punkt 10, Davids Entscheidung: Zusage
  //   streichen, Streuung dafür bewusst machen).

  /** 4 · FRAGE-LEITER — die Interviewführung dieser einen Session. */
  readonly ladder: {
    /** Womit George öffnet (Registry-Frage bleibt der Wortlaut, das hier ist die Absicht). */
    readonly opening: string
    /** Nachfrage 1 und 2 — je nachdem, WIE dünn die Antwort war. */
    readonly probes: readonly string[]
    /** Umdeutung, wenn die Antwort in ein bekanntes Anti-Muster fällt. */
    readonly reframes: readonly string[]
  }
  //   Beispiel a.customerPraise: opening 'the one sentence a customer said,
  //   verbatim' · probe 'when did you last hear it — what had just happened?'
  //   · reframe 'if the answer is a feature, ask for the moment it mattered'.
  //   `answers.maxProbes` deckelt die Leiter; die Leiter sagt, WAS gefragt wird.

  /** 5 · FORM DES WERTS — Regeln, die der Wert selbst einhalten muss. */
  readonly form: {
    /** 'we' | 'I' | 'brand' | 'none' — Person; folgt der Weiche W3 (Solo/Team), wo nicht fest. */
    readonly person: 'we' | 'I' | 'brand' | 'none' | 'fromTeam'
    readonly tense: 'present' | 'future' | 'any'
    /** Wortdeckel (enger als `maxLength` in Zeichen), z. B. Purpose ≤ 20 Wörter. */
    readonly maxWords: number | null
    /** Was im Wert nie vorkommen darf: Markenname im Purpose, Zahlen in der Vision … */
    readonly forbidden: readonly string[]
  }

  /** 6 · INVARIANTEN — deterministische Prüfungen, im CODE, nicht im Modell. */
  readonly invariants: readonly BrandInvariant[]
  //   c.conflictRule nennt nur Werte aus c.final · e.anchorLine ist ein Satz
  //   aus e.manifesto · f.decision ∈ f.shortlist · c.final hat 3–5 Einträge.
  //   Eine Regel, die ein Test prüfen kann, wird nicht der KI überlassen —
  //   sie ist billiger, schneller und lügt nie. Prüfung beim Bestätigen
  //   (`transitionBrandStep`), Verstoss = 409 mit `data.code`, wie
  //   `required_slots_missing`.

  /** 7 · VERTRAULICHKEIT — was per Share-Link und Export standardmässig NICHT reist. */
  readonly sensitivity: 'public' | 'internal' | 'private'
  //   a.complaints, a.challenge, a.facts (Umsatz, Team) sind `internal`;
  //   der Share-Link (brand_shares) zeigt heute alles. Ein Kunde, der seine
  //   Marke teilt, teilt nicht seine Beschwerden.

  /** 8 · UMFANG — was der Mensch vorher erfährt. */
  readonly effort: { minutes: 1 | 2 | 3 | 5 | 10, turns: number }
  //   Steht in der Seitenleiste („~3 Min") und am Kapitel („11 Sessions,
  //   ~25 Min"); George hört auf zu bohren, wenn `turns` erreicht ist.
  //   Nimmt dem Menschen die Frage „wie lange geht das noch".
}

export interface BrandInvariant {
  readonly kind: 'subsetOf' | 'memberOf' | 'sentenceOf' | 'count' | 'mentionsNone'
  readonly of?: string           // Quell-Slot
  readonly min?: number
  readonly max?: number
  readonly terms?: readonly string[]
}
```

**Mechanisch, ohne Text:**

- **„Wofür brauchen wir das?"** — je Session der Satz „Das fliesst später in
  Mission, Manifest und Taglines" kommt aus `sessionsAffectedBy(id)` (§9),
  nicht aus einer gepflegten Liste. Der Mensch sieht, warum George fragt;
  die Antwort wird besser, wenn man weiss, wozu sie dient. Steht im
  Info-Modal der Session und in Georges Eröffnungszug, wenn er will.
- **Vertagen** als vierter Ausgang neben Antwort, „weiss nicht" und
  Bestätigen: `answers.allowDefer`. Manche Sessions brauchen jemanden, der
  gerade nicht am Tisch sitzt (Zahlen in `a.facts`, die Konfliktregel im
  Team). Vertagt = Session bleibt `open`, bekommt ein Merkzeichen, das
  Kapitel kann ohne sie nicht abgenommen werden, Auto-Weiter überspringt sie
  einmal. Ohne Vertagen erfindet der Mensch eine Antwort, um weiterzukommen.

**Bewusst NICHT vorgeschlagen:** Tonregler je Session (kommt später als
EIN Regler auf George, DECISION-LOG 2026-09-02), branchenspezifische
Fragefassungen (verfünffacht die Pflege; die Startkarte trägt die Branche in
den Prompt, das reicht), Wiedereinstiegs-Texte je Session (generisch aus
Notizen + letztem Wert, keine 68 Fassungen).

**Was es kostet:** je Session 3–5 Qualitätskriterien, 2–3 Anti-Muster,
1–2 Beispiele, eine Leiter mit 3–4 Zeilen, vier Form-Werte — grob 15 Zeilen
Inhalt × 68. Das ist die Content-Spec §14 (Paket 2), nicht mehr und nicht
weniger; die Registry-Tests prüfen Vollständigkeit (kein leeres `quality`,
Beispiele nie leer bei `draft`/`derive`, jede Invariante zeigt auf einen
Slot, der VOR ihr steht).

## 4. Output-Vertrag und Log

Jede Session endet mit GENAU EINEM Output-Objekt, das der Schliess-Aufruf (§7)
validiert und schreibt:

```ts
export interface BrandSessionOutput {
  /** Der Feldwert — was heute `brand_steps.slots[id].value` ist. */
  value: unknown
  /** Gelerntes, das in kein Feld passt: 0–3 kurze Sätze, Inhaltssprache. */
  notes: readonly string[]
  /** Befunde: Konflikte, betroffene Felder, Lücken (§8/§9). */
  findings: readonly BrandFinding[]
}

export interface BrandFinding {
  kind: 'conflict' | 'affected' | 'gap'
  /** Beteiligte Felder — bei `conflict` immer ZWEI, damit die UI beide verlinkt. */
  slots: readonly string[]
  /** Warum (Chat-Sprache, ein Satz). */
  why: string
  /** Vorschlag (optional, ein Satz). */
  suggestion?: string
}
```

**Der Log** ist das Dokument: die rechte Spalte der Werkstatt zeigt heute den
Stand chronologisch (Umbau-Plan §2 „Rechte Spalte"). Neu darin:

- je Session ein Eintrag „bestätigt" mit Wert (wie heute),
- darunter die Notizen der Session (grau, einklappbar),
- Befunde als Chips mit Feld-Links (bernstein), Status `open` /
  `accepted` / `dismissed`.

Die **Notizen** fangen ab, was heute nach sechs Zügen verloren geht: eine
spätere Session desselben Kapitels liest sie mit (`inputs.notes:
'chapter'`), der Spezialist liest ALLE Notizen des Brandings beim Prüfblick
(§10). Sie werden nie automatisch zu Feldwerten.

**Persistenz:** Wert wie heute in `brand_steps.slots`; Notizen als
`slots[id].notes` (additiv, JSON in der bestehenden Spalte); Befunde in einer
neuen Tabelle `brand_findings` (§12), weil sie einen STATUS haben und
kapitelübergreifend sind — ein Konflikt zwischen `b.purpose` und
`c.conflictRule` gehört keiner Zeile allein.

## 5. Zustandsmaschine je Session

Heute rechnet `resolveBrandJourney` den Zustand je KAPITEL (locked / open /
active / done / skipped) und `transitionBrandStep` schreibt ihn. Neu:

- **Session-Zustand ist ABGELEITET**, keine neue Spalte: `locked`, solange
  eine Eingabe aus `inputs.slots` unbestätigt ist; `open`, wenn alle
  Eingaben bestätigt sind; `active` = die eine Session, die der Mensch gerade
  offen hat (Client-Zustand + `brand_messages`); `done` = Wert bestätigt und
  `sourcesHash` aktuell (§9); `stale` = bestätigt, aber `sourcesHash` weicht
  ab. Pure Funktion `resolveSessionStates(config[], slotFacts)` neben
  `resolveBrandJourney`.
- **Kapitel-Zustand wird daraus abgeleitet**, nicht mehr gespeichert
  gerechnet: `done`, wenn alle Pflicht-Sessions `done`; `open`, wenn der
  Vorgänger `done`; die Weichen (`architecture`, `naming`) bleiben exakt wie
  heute. Die gespeicherte Spalte `brand_steps.state` bleibt für Bestand und
  Migrationsvertrag („ein gespeichertes `done` wird nicht neu berechnet") —
  die Ableitung darf ein gespeichertes `done` NIE herabstufen, sie darf es
  nur als `stale` ANZEIGEN.
- **Betreten:** eine `locked`-Session ist nicht erreichbar, auch nicht über
  die Adresszeile (Muster `canEnterBrandStep`). Innerhalb eines Kapitels sind
  meist mehrere Sessions gleichzeitig `open` (die Fragen in A haben keine
  Slot-Eingaben) — welche George als nächste vorschlägt, sagt §6; der Mensch
  darf jede offene wählen.
- **Auto-Weiter (Entscheidung 2):** nach dem Schliess-Aufruf antwortet die
  Route mit `next: sessionKey | null`; der Client öffnet sie und ruft den
  Eröffnungszug ab. Kein Klick nötig, aber jederzeit ein anderer Klick möglich.

`transitionBrandStep` bleibt der Schreibweg für `confirmSlot` /
`setConfidence` / `complete` / `reopen`; die Konfidenz-Weiche bleibt je
Kapitel (sie ist kein Slot, Registry-Kopf). Neu sind `acceptSlot` (§5a),
`correct` (§9) und `restart` (§5a — der einzige löschende Weg, mit
Schnappschuss).

## 5a. Finale Abnahme je Kapitel (Ablauf von David festgelegt, 2026-09-04)

Der Abschluss eines Kapitels ist heute eine WEICHE im Gespräch: sobald alle
Pflicht-Slots bestätigt sind, zeigt die Bühne „Passt dieses Kapitel?" mit den
drei Konfidenz-Chips, und `transitionBrandStep(…, 'complete')` verlangt beide
(Slots bestätigt UND Konfidenz gesetzt). Der SCHREIBWEG bleibt. Neu ist der
ORT und der ABLAUF: eine eigene Seite je Kapitel, letzter Eintrag in der
Seitenleiste unter den Sessions, Glyphe wie heute das Ergebnis (Funken).

### Der Ablauf, in Reihenfolge

**1 · Die Liste.** Jede Session des Kapitels als Block in Registry-Reihenfolge,
untereinander, je Block drei Dinge:

- **Bereich** — der Feldname aus dem Locale-Katalog und die Kapitel-Zuordnung,
  dazu der mechanische Satz „fliesst später in …" (§3a, aus der
  Abhängigkeits-Hülle).
- **Beispiel** — das Beispiel aus der Session-Config (§3a Nr. 3), immer aus
  einer FREMDEN Branche, je Pfad (neu/Relaunch). Damit ist Nr. 3 keine
  Vorschlagsoption mehr, sondern Pflicht: die Abnahme-Seite zeigt es dem
  Kunden. Optionale Sessions ohne Wert stehen grau mit Beispiel und leerer
  Eingabe dabei.
- **Eigene Eingabe** — der bestätigte Wert, vollständig, nicht gekürzt;
  Notizen der Session eingeklappt darunter; offene Befunde als Chips.

Je Block zwei Handlungen: **Abnehmen** und **Bearbeiten**. Abnehmen setzt
`slots[id].accepted = true` (additiv, JSON in der bestehenden Spalte) — ein
ZWEITER Zustand neben `confirmed`, bewusst: `confirmed` heisst „in der Session
so gesagt", `accepted` heisst „im Zusammenhang des Kapitels gelesen und für
gut befunden". Davids Entscheidung vom 2026-09-04 (zweite Fassung; die erste
Fassung dieses Abschnitts hatte kein Häkchen je Zeile — revidiert). Ein
Wert, der sich nach der Abnahme ändert (Bearbeiten, Korrektur nach §9),
verliert `accepted` automatisch — der Server setzt es beim Schreiben des
Werts zurück, nie die Oberfläche. Bearbeiten = die Korrektur aus §9 (Impact-
Hinweis, wenn bestätigte Felder daran hängen, dann Sprung in die Session).

**2 · Der Zähler.** Über der Liste „7 von 10 abgenommen"; die
Pflicht-Sessions zählen, optionale ohne Wert nicht. Unbestätigte Sessions
(Wert fehlt) stehen mit Link in ihre Session, können nicht abgenommen werden.

**3 · Alles abgenommen.** Erst wenn ALLE Pflicht-Sessions `accepted` sind,
keine Session `stale` ist und kein offener `conflict`-Befund an einem Feld
dieses Kapitels hängt, erscheint unter der Liste der Hinweis
„In diesem Kapitel ist nichts mehr offen — bestätige es, wenn es passt."
und darunter die Frage **„Passt dieses Kapitel?"** mit den drei Antworten
(heute die Konfidenz-Chips `fits` / `almost` / `restart`). Vorher ist die
Frage NICHT sichtbar — das ist dieselbe Regel wie `brandStepCompletion`
(eine Weiche, die vor ihrer Bedingung erscheint, verspricht einen Abschluss,
den die Route abweist), nur mit `accepted` und den zwei neuen Gliedern in
der Bedingung. Ein offener Konflikt SPERRT damit die Abnahme, nicht die
Session — die eine Stelle, an der ein Befund Zwang ausübt, bewusst die
Kapitel-Grenze: wer weiterzieht, hat seinen Konflikt entschieden.

**4 · Die drei Antworten.**

- **„Passt"** ⇒ `complete` mit Konfidenz `fits`. Kapitel `done`, nächstes
  Kapitel `open`, Knopf „Weiter zu Kapitel …" öffnet dessen erste Session
  mit George.
- **„Fast"** ⇒ `complete` mit Konfidenz `almost`. Dasselbe, das Kapitel trägt
  die Selbstauskunft (heute schon so; George der späteren Kapitel kennt sie).
- **„Nochmal von vorn"** ⇒ KEINE Konfidenz, sondern die Handlung `restart`
  (unten). `restart` wird nie mehr als Konfidenz GESPEICHERT;
  `BRAND_CONFIDENCE_VALUES` behält den Wert nur für Bestandszeilen.

### „Nochmal von vorn" — die eine echte Verhaltensänderung

Heute ist „Nochmal von vorn" eine VERTIEFUNGSRUNDE: `reopen` setzt das
Kapitel auf `active`, Slots und Konfidenz bleiben stehen („kein Löschknopf",
`brandJourney.ts` §3b.8). Davids Entscheidung 2026-09-04: von vorn heisst
von vorn — die Ebene-3-Ergebnisse dieses Kapitels gehen verloren, und genau
davor steht ein Schutz:

1. **Der Klick öffnet einen Layer** (Modal, `UModal`), der ausdrücklich sagt,
   dass ALLES in diesem Kapitel verloren geht und man in dieser Ebene von
   vorn beginnt: Anzahl der Werte, Notizen, Abnahmen — und, falls spätere
   Kapitel schon bestätigte Felder haben, die daran hängen, die
   Abhängigkeits-Hülle aus §9 („berührt ausserdem 14 bestätigte Felder in
   drei späteren Kapiteln"). Der Layer IST damit der Impact-Hinweis; ein
   zweiter Dialog danach wäre eine Verdopplung.
2. **Bestätigen nur durch Tippen:** ein Feld, in das der Mensch das Wort
   **„bestätigen"** (Locale: `brand.acceptance.restart.word`, en `confirm`)
   eintippt, dann der Knopf „Bestätigen" — vorher ist der Knopf
   deaktiviert. Oder **„Abbrechen"**: nichts passiert. Das getippte Wort ist
   Reibung gegen den Fehlklick und gehört der Oberfläche; der SERVER prüft
   nicht das Wort, sondern `acknowledge: true` plus den `impactAck`-Hash
   (§9), und weist ohne beides mit 409 `restart_unacknowledged` ab.
3. **Was der Server bei `restart` tut** — als EINE Handlung in
   `transitionBrandStep`, nicht als Aufräumen in der Route:
   - Schnappschuss der Kapitel-Zeile (Slots, Notizen, Konfidenz, Abnahmen)
     als `brand_events`-Eintrag `step.restarted` (24 Monate, Audit) — ein
     versehentlicher Restart ist damit für den Betreiber rekonstruierbar,
     für den Kunden aber wirklich „von vorn".
   - Slots des Kapitels geleert, `accepted`/`notes`/`sourcesHash`/Konfidenz
     zurückgesetzt, `state = 'active'`, `revision` steigt.
   - `restartedAt` auf der Kapitel-Zeile (additiv). Die Nachrichten werden
     NICHT gelöscht (Retention-Regel brand-003: dauerhaft), aber der Verlauf
     lädt nur noch Züge NACH `restartedAt` — George beginnt ohne das alte
     Gedächtnis, sonst wäre „von vorn" eine Lüge.
   - Spätere Kapitel: ihre abhängigen Felder werden nach §9 mechanisch
     `stale` (Hash weicht ab). Der Spezialist grenzt hier NICHT ein — es gibt
     keinen neuen Wert, gegen den er prüfen könnte; die Eingrenzung kommt
     mit der ersten neuen Bestätigung im Kapitel.
   - Antwort: `next` = erste Session des Kapitels; George eröffnet.

### Was die Seite sonst noch kann

Befunde annehmen oder ablehnen (§8) direkt am Block. **Der Spezialist liest
das Kapitel mit** (Kapitel-Modus des Schliess-Aufrufs, §7): beim Öffnen der
Abnahme-Seite ein Aufruf über die bestätigten Werte des Kapitels gegen das
ganze Dokument, Antwort nur `findings`. Molekül-Ebene der Prüfung; der
Prüfblick in §10 ist dieselbe Prüfung auf Foundation-Ebene. Fail-soft (§7):
die Seite funktioniert ohne Befunde, `reviewed: false` am Kapitel. Kein George
auf dieser Seite.

**Weiter geht es erst danach:** `done` entsteht NUR durch die Abnahme; das
nächste Kapitel wird `open`, wenn der Vorgänger `done` ist — wie heute in
`resolveBrandJourney`. Zurück bleibt immer erlaubt (§3b.2). `reopen` bleibt
als leise Vertiefung (Session öffnen, Wert ändern) und propagiert weiter
nicht; eine Korrektur nach der Abnahme macht das Kapitel nicht
„un-abgenommen", sondern nimmt der geänderten Zeile `accepted` und zeigt
veraltete Zeilen bernstein, bis sie neu gestempelt oder neu besprochen sind.

## 6. Gesprächsführung: ein George, 68 Sessions

- **Prompt je Zug** = Fundament + Persönlichkeit + `sessionInstruction(config)`
  + Eingaben (bestätigte Werte der `inputs.slots`, Startkarte, Notizen) +
  Verlauf DIESER Session (Fenster bleibt 6) + `openFieldLabels` des Kapitels.
  Der Zug-Vertrag (QUESTION / BASIS / DRAFT / ASK / OPTION) bleibt.
- **Der Eröffnungszug einer Session schliesst an.** Regel im Prompt: der
  erste Satz nimmt den zuletzt bestätigten Wert oder die letzte Notiz auf
  („Ihr habt gerade gesagt, dass … — daraus folgt jetzt …"), nie eine
  Vorstellung, nie ein Kapitel-Intro. Georges Kapitel-Intro („Vera liest
  mit") bleibt, aber nur EINMAL je Kapitel, beim ersten Betreten.
- **Nächste Session** (`resolveNextSession`, ersetzt den Rumpf von
  `resolveNextQuestion`): Grundfassung = erste offene Pflicht-Session in
  Registry-Reihenfolge. Adaptive Fassung = der Spezialist nennt beim
  Schliessen (§7) aus den OFFENEN Sessions des Kapitels die mit dem höchsten
  Informationswert; die Route prüft den Vorschlag gegen die Registry und
  fällt sonst auf die Grundfassung zurück. George erfindet keine Frage und
  wählt keine ausserhalb der Registry — die Regel „Reihenfolge gehört der
  Registry" gilt weiter, nur die Reihenfolge INNERHALB der offenen Menge wird
  beweglich.
- **Session-Typen im Gespräch:** `ask` = wie heute. `collect` = George fragt
  die Teile nacheinander, EIN Zug je Teil, der Wert entsteht am Ende. `choose`
  = George nennt seine Empfehlung mit Begründung in Prosa und hängt die
  `OPTION:`-Zeilen an (converse-4). `derive`/`draft` = Generator-Aufruf wie
  heute, George rahmt (BASIS/DRAFT/ASK), Bestätigen auf der Bühne.
  `instrument` = eigenes UI, George kommentiert das Ergebnis.
- **Verlauf:** `brand_messages.sessionKey` (§12). Die Leseroute filtert je
  Session; alte Kapitel-Nachrichten (leerer Schlüssel) bleiben als
  Kapitel-Verlauf lesbar und zählen zum Fenster der ersten Session des
  Kapitels — sonst stünde ein Bestands-Branding nach dem Deploy ohne Gedächtnis
  da.

## 7. Der Schliess-Aufruf: der Spezialist

Ein Aufruf je Session, beim Bestätigen des Outputs — NICHT je Zug (der
Marker-Vertrag wurde gebaut, um einen zweiten Aufruf je Zug zu vermeiden:
Geld, Latenz). `aiCompleteJson`, nicht gestreamt, eigener Drossel-Eimer
(§13). **Zweistufig (Davids Entscheidung 2026-09-04):** Stufe 1 ist das
günstigste ZDR-fähige Modell der Routing-Liste und liefert die volle
Antwort unten. Meldet sie MINDESTENS einen Befund vom Typ `conflict` oder
`affected` (bei `correct`), läuft Stufe 2 mit dem George-Modell und
DENSELBEN Eingaben plus den Stufe-1-Befunden als Hypothese; ihre Antwort
ERSETZT die Befunde von Stufe 1 (sie darf welche streichen oder schärfen),
`notes`/`nextSession`/`goalReached` bleiben von Stufe 1. Grund: der teure
Blick nur dort, wo er dem Kunden etwas kostet — ein falscher Konflikt sperrt
später die Abnahme (§5a). Stufe 2 zählt im Eimer 3, scheitert sie, gilt
Stufe 1 (fail-soft, mit `reviewedBy: 'stage1'` im Log).

**Eingaben:** die Session-Config (Ziel, Regeln), der Output (Wert, Verlauf
der Session), das BESTÄTIGTE Dokument (alle bestätigten Werte aller Kapitel,
kompakt je Feld eine Zeile), die Notizen des Kapitels, bei `correct` (§9)
zusätzlich die betroffenen Felder mit ihren Werten.

**Antwort (Zod-geprüft, sonst fail-soft):**

```ts
export interface BrandSessionReview {
  /** Ist das Ziel der Session mit diesem Wert erreicht? */
  goalReached: boolean
  /** Was fehlt, wenn nicht (Chat-Sprache, max. 3). */
  missing: readonly string[]
  /** 0–3 Notizen (Inhaltssprache). */
  notes: readonly string[]
  /** Befunde gegen das Dokument (§8) bzw. betroffene Felder (§9). */
  findings: readonly BrandFinding[]
  /** Vorschlag für die nächste offene Session des Kapitels (Registry-Id). */
  nextSession: string | null
  /** Bei `correct`: welche der mechanisch veralteten Felder wirklich getroffen sind. */
  affected?: readonly string[]
}
```

**Regeln:**

- `goalReached: false` sperrt NICHTS. Die Bestätigung des Menschen gilt;
  George sagt im nächsten Zug einmal, was der Spezialist vermisst, und bietet
  an, nachzulegen. Ein Spezialist, der Bestätigungen abweist, wäre ein
  zweiter Schreibweg neben `transitionBrandStep`.
- **Fail-soft, mit Spur:** scheitert der Aufruf (Drossel, Modell, Schema),
  wird der Wert trotzdem geschrieben, `notes`/`findings` bleiben leer,
  `nextSession` fällt auf die Grundfassung — und der Log-Eintrag trägt
  `reviewed: false`, damit der Prüfblick (§10) diese Sessions nachholt.
  AUSNAHME `correct`: dort ist fail-soft fail-CLOSED in Richtung „bitte
  ansehen" — ohne Antwort bleiben ALLE mechanisch veralteten Felder
  veraltet (§9).
- **Der Spezialist spricht nie.** Alles, was er sagt, wird zu Georges
  Prompt-Block („Vera hat mitgelesen: …") oder zu Log-Einträgen. Die
  Eine-Stimme-Entscheidung wird damit wörtlich wahr.
- **Drei Modi, ein Vertrag:** `session` (Standard, beim Bestätigen),
  `correct` (§9, mit `affected`), `chapter` (§5a, beim Öffnen der Finalen
  Abnahme — nur `findings`). Der Prüfblick (§10) ist `chapter` über alle
  Kapitel.
- Prompt-Version `review-1` wie bei `converse-N`; Änderungen versioniert.

## 8. Konflikt-Befunde

Heute prüft nichts eine neue Antwort SEMANTISCH gegen bestätigte Werte. Der
Spezialist mit dem vollen bestätigten Dokument ist der Ort dafür.

- Geprüft wird nur gegen **bestätigte** Werte. Entwürfe sind keine Wahrheit.
- Ein Konflikt ist ein Befund mit **zwei** Feld-Verweisen (`slots: [a, b]`),
  `why` und optional `suggestion`. Die UI zeigt ihn als Chip im Log und in
  beiden Sessions, mit Links auf beide Felder.
- **Beratend, nie sperrend.** George formuliert ihn EINMAL im nächsten Zug
  („Das reibt sich mit eurer Konfliktregel aus Kapitel C — wollt ihr eines
  von beiden anfassen?"), danach lebt er nur noch als Chip. Der Mensch
  setzt ihn auf `accepted` (⇒ Korrektur eines der Felder, §9) oder
  `dismissed` (mit Grund, eine Zeile, landet in den Notizen).
- Damit bekommt der offene Punkt „Rückfragen zeigen auf Felder fertiger
  Kapitel ohne Weg" seinen Weg: der Chip IST der Weg.

## 9. Korrektur-Regel: wer hängt an diesem Feld?

**Die Umkehrung ist eine reine Rechnung** über dieselbe Registry:
`sessionsAffectedBy(id)` liefert die transitive Hülle aller Felder, deren
`inputs.slots` direkt oder über Zwischenschritte auf `id` zeigen — getrennt
in direkt/indirekt, gruppiert je Kapitel. Pure Funktion, Test mit Gegenprobe
(eine erfundene Abhängigkeit muss in der Hülle auftauchen, eine gelöschte
verschwinden).

Wie tief das reicht, sagt die Registry heute schon (Anhang A, Spalte
„berührt"): `a.customerPraise` berührt 29 Felder in 7 Kapiteln, `a.pitch` 27
in 7, `a.origin` 23 in 7, `b.conviction` 22 in 7, `d.hypothesis` 21 in 5.
Ganz unten (`ep.*`, `f.decision`, `result.*`) berührt eine Korrektur nichts.

**Der Ablauf, in drei Schritten:**

1. **Vor der Korrektur — ohne KI.** Der Klick „Korrigieren" auf einem
   bestätigten Feld ruft `GET …/sessions/:id/impact`. Antwort: die Hülle,
   nur BESTÄTIGTE Felder, je Kapitel, direkt/indirekt. Nichts wird
   geschrieben. Ist die Hülle leer, öffnet das Feld sofort (wie heute).
2. **Der Hinweis.** „Diese Änderung berührt 14 bestätigte Felder in vier
   Kapiteln", darunter die Liste mit Feld-Links. **Annehmen** oder
   **Abbrechen**. Abbrechen lässt das Dokument unberührt.
3. **Nach dem Annehmen.** Der PATCH trägt `impactAck: <hash der Hülle>`; der
   Server rechnet die Hülle erneut und weist ohne passendes Ack mit 409
   `impact_unacknowledged` ab (Envelope-`reason`, Muster `last_owner`) — die
   Oberfläche erzwingt es nie allein. Dann: Feld wird `active`, seine
   Session läuft wie jede andere bis zum Schliess-Aufruf.

**„Veraltet" für ALLE Feldarten — eine Rechnung:** beim Bestätigen speichert
jede Session `sourcesHash` = Hash der bestätigten Werte ihrer `inputs.slots`
(additiv in `slots[id]`, Bestand ohne Hash gilt als aktuell — Migrationsvertrag
§3e). `stale` = gespeicherter Hash ≠ heutiger Hash. Der `inputHash` der
Generationen bleibt für die Fassungs-Historie („welche Fassung entstand
woraus"), er ist nicht mehr die Quelle von „veraltet".

**Die Eingrenzung durch den Spezialisten:** wird das korrigierte Feld erneut
bestätigt, sind ALLE Felder der Hülle mechanisch `stale`. Der Schliess-Aufruf
(`correct`-Modus) bekommt alten Wert, neuen Wert und die Hülle mit Werten und
antwortet mit `affected`: welche Felder die Änderung INHALTLICH trifft. Für
die nicht getroffenen stempelt der Server den `sourcesHash` neu (sie sind
wieder `done`, eine Kommakorrektur kostet niemanden zwanzig Gespräche); die
getroffenen bleiben `stale` und bekommen je einen Befund `affected` mit
`why`. Ohne Antwort (fail-closed, §7) bleibt alles `stale` — der Mensch kann
jedes Feld mit einem Klick „gilt weiter" neu stempeln oder die Session
öffnen.

**Die Warteschlange „neu besprechen":** alle `stale`-Sessions in
Registry-Reihenfolge. Auto-Weiter (§5) bedient sie vor den offenen Sessions,
der Log zeigt sie bernstein (wie heute `stale` auf der Bühne), die
Seitenleiste zählt sie am Kapitel („2 neu besprechen").

## 10. Das Dokument und die Schlussanalyse

Die Ergebnis-Seite (P5–P7) ist heute ein offenes Konzept-Gate; der einzige
Dummy ist von vor dem Bühnen-Umbau und widerspricht der Spec („ohne George").
Davids Entscheidung 5 ist das Konzept — und seit Entscheidung 6 ist die
Ergebnis-Seite schlicht die **Finale Abnahme der Ebene 1**: dieselbe Seite
wie §5a, nur über alle Kapitel, mit dem Prüfblick statt des Kapitel-Modus.

- **Das Dokument** = alle bestätigten Werte in Registry-Reihenfolge, je
  Kapitel ein Abschnitt, Notizen einklappbar, offene Befunde als Chips.
  Kein George auf dieser Seite. Korrektur aus dem Dokument heraus geht über
  §9 (Impact-Hinweis, dann Sprung in die Session).
- **Der Prüfblick** = ein Spezialisten-Aufruf über das GANZE bestätigte
  Dokument, ausgelöst vom Menschen („Dokument prüfen"), nicht automatisch;
  Antwort in der Form von §7, aber mit `findings` als einziger Nutzlast:
  Widersprüche (zwei Felder), Lücken (ein Feld, `gap`), Schärfungen
  (`suggestion` an einem Feld). Nachholung aller Sessions mit `reviewed:
  false`. Ergebnis: Befund-Liste im Log; Annehmen eines Befunds = Korrektur
  nach §9.
- Nicht in diesem Plan: Export, Teilen und `result.direction` (bleiben P5–P7
  im Phase-1-Plan).

## 11. Navigation

- Seitenleiste: Kapitel wie heute (Ampel, Sperre, „+ N optional"), darunter
  die Sessions als Unterpunkte — nur das AKTIVE Kapitel aufgeklappt, die
  anderen zeigen Zähler („7 von 11 bestätigt · 2 neu besprechen"). Glyphen:
  gesperrt / offen / aktiv / bestätigt / veraltet, dieselben wie auf der
  Bühne (`BwSlotList`).
- Letzter Eintrag jedes Kapitels: **„Finale Abnahme"** (§5a), Glyphe
  Funken, gesperrt bis alle Pflicht-Sessions bestätigt sind, grün nach der
  Abnahme. Die Kapitel-Zähler zählen sie nicht mit („7 von 11 bestätigt"
  meint die Sessions).
- Klick auf eine Session = derselbe Route-Record wie heute
  (`brand/[profileId]/[stepKey]`), Session als Query (`?s=<id>`), damit
  Zurück/Vor im Browser funktionieren und der Sticky-Fortschritt bleibt.
- Der Prompt unten und die rechte Spalte bleiben, wie im Umbau-Plan §2.
- Mobil: „reicht für jetzt" (Davids Entscheidung 2026-09-03) — der Drawer
  zeigt die Unterpunkte, mehr nicht.

## 12. Datenmodell — alles additiv

| Migration | Was | Warum additiv |
| --- | --- | --- |
| brand-011 | `brand_messages.sessionKey` (string, leer = Kapitel-Verlauf), Index `(profileId, stepKey, sessionKey)` | Bestands-Verläufe bleiben lesbar (§6) |
| brand-014 (012 = Warteliste der Nachbar-Sitzung, 2026-09-04) | Tabelle `brand_findings`: `profileId`, `kind`, `slots` (JSON), `why`, `suggestion`, `status`, `sourceSession`, `$createdAt`; Index `(profileId, status)`; Permissions wie `brand_messages` | Befunde haben Status und sind kapitelübergreifend (§4) |
| — | `brand_steps.slots[id].notes`, `.sourcesHash`, `.reviewed`, `.accepted` | JSON in bestehender Spalte, kein Schema-Schritt |
| brand-013 | `brand_steps.restartedAt` (datetime, null) | Verlaufs-Schnitt nach „Nochmal von vorn" (§5a), Nachrichten bleiben |

Index-Anlage NUR über `createIndexSteps` (CLAUDE.md). Neue Tabelle ⇒ in die
Soll-Liste von `pnpm ops:schema-parity` (Layer-Block `brand`) UND in den
GDPR-Contributor (`brandUserData.ts`: Befunde gehören zum Branding, Kaskade
bei Profil-Löschung §7 des Schema-Plans).

## 13. Drosseln und Kosten

| Aufruf | Wann | Je Branding, grob | Eimer |
| --- | --- | --- | --- |
| George-Zug (Stream) | je Antwort des Menschen | wie heute | `talk` 40/Tag (unverändert) |
| Generator | je Entwurf | wie heute | `slot` 10/Tag je Feld (unverändert) |
| **Schliess-Aufruf, Stufe 1** | je bestätigter Session | ~68 + Korrekturen | **neu** `review` 120/Tag je Brand, günstiges ZDR-Modell |
| **Schliess-Aufruf, Stufe 2** | nur bei Konflikt-Verdacht aus Stufe 1 | wenige | `review`, zählt 3, George-Modell |
| **Kapitel-Abnahme** (`chapter`) | beim Öffnen der Finalen Abnahme | 9 (+ Wiederholungen) | `review`, zählt 2 |
| **Prüfblick** | auf Klick | wenige | `review`, zählt 5 |

`brandAiLimits.ts` bekommt den Eimer als eigenen Vertrag (Muster
`BRAND_AI_TALK_DAILY_LIMIT`), der Instanz-Deckel zählt ihn mit. Modelle:
`pukalani.brand.ai.reviewModel` (Stufe 1, Default das günstigste ZDR-fähige
Modell der Routing-Liste) und Stufe 2 = das George-Modell (kein eigener
Schalter — sonst driften zwei Urteile). Ohne Schlüssel läuft alles fail-soft
(§7), im Dev der bestehende Stub.

## 14. Nicht anfassen / bekannte Fallen

- **Slot-Ids** bleiben; `defineSession` ist eine Umbenennung des Bauers, nie
  der Ids. Ein Rename wäre stille Datenlöschung.
- **Marker-Vertrag** (`georgeTurn.ts`): Der Spezialist läuft NICHT im
  Stream; wer JSON in den George-Zug mischt, zerstört das Streaming.
- **Eine Stimme:** kein zweiter Sprecher, auch nicht als „Vera sagt:".
- **Bestätigen ist ein Zustand** (Server erzwingt; „Korrigieren" einziger
  Rückweg — jetzt mit Impact-Ack davor). Die Finale Abnahme verdoppelt es
  NICHT je Feld (§5a).
- **`reopen` propagiert nicht** — die Warteschlange ist die Antwort, nicht ein
  kaskadierendes Reset. `restart` (§5a) ist davon getrennt: löschend, mit
  Schnappschuss, getipptem Wort und Impact-Ack — und NUR über die
  Abnahme-Seite erreichbar, nie über die Bühne.
- **Ein gespeichertes `done` wird nicht herabgestuft**, nur als `stale`
  angezeigt (Migrationsvertrag §3e).
- **Registry-Reihenfolge bleibt die Ordnung**; adaptiv ist nur die Wahl
  innerhalb der offenen Menge, geprüft vom Server.
- **`upsertRow` ist tabu**, `updateRow` mit 404-Fallback (Realtime-Falle aus
  D6).
- **Startkarte steht nicht im `sourcesHash`** (wie heute nicht im
  `inputHash`) — bekannt und bewusst; eine geänderte Startkarte ist ein
  eigenes Thema (Phase-1-Plan).
- **Spitze Klammern in Locale-Texten** sind verboten (i18n-Compiler-Falle).
- **Worktree-Beweise:** Dev-Server aus dem Worktree, `lsof` vorher, zweite
  Messung zählt.

## 15. Umsetzungspakete, Gates, Beweise

Jedes Paket ein Opus-Lauf mit Bilanz (Tests, beide Lints, Typecheck),
Verifikation im Fable-Hauptloop, Merge erst grün.

| # | Paket | Inhalt | Gate | Beweis |
| --- | --- | --- | --- | --- |
| 1 ✅ 2026-09-04 | **Session-Vertrag** | `BrandSessionConfig`, `defineSession`, `sessionsAffectedBy`, `resolveSessionStates`, `resolveNextSession` (Grundfassung); Prompt-Bauer `sessionInstruction` ersetzt die Feld-Anweisungen der drei Prompt-Dateien; Platzhalter-Ziele aus den heutigen Anweisungen | — | Registry-Tests erweitert (Rückwärts-Regel, Hülle mit Gegenprobe, Kind↔Typ), Prompt-Tests auf den Bauer umgestellt; Snapshot-Vergleich: Prompts je Feld inhaltsgleich zu vorher |
| 2 ✅ 2026-09-04 (+2b Gegenlese-Runde) | **Session-Ziele (Inhalt)** | 68 Zielsätze + Verarbeitungs- und Antwort-Regeln als Content-Spec §14, dann in die Registry | **David liest gegen** | `slotRegistry.test.ts`: kein leeres `goal` |
| 3 ✅ 2026-09-05 (3a/3b/3c-i/3c-ii) | **Verlauf + Nav + Finale Abnahme** | brand-011, `sessionKey` in converse/messages-Routen, Seitenleiste mit Unterpunkten, `?s=` in der Route, Auto-Weiter, Eröffnungszug-Regel, `collect`-Typ für `a.facts`; Abnahme-Seite je Kapitel (§5a: Bereich/Beispiel/Eingabe, Abnehmen je Block, Zähler, Hinweis + Frage erst bei 10/10, Restart-Layer mit getipptem Wort), `acceptSlot`/`restart` in der Zustandsmaschine, brand-013 — Konfidenz-Weiche zieht von der Bühne dorthin, `complete` bekommt die drei neuen Glieder | Davids Blick auf Seite und Restart-Layer | Playwright: Frage erscheint erst bei vollständiger Abnahme; Restart ohne Wort ⇒ Knopf aus; Route-Test: `restart` ohne Ack ⇒ 409, mit Ack ⇒ Schnappschuss-Event + leere Slots + `restartedAt`; Verlauf lädt nur Züge danach |
| 4 ✅ 2026-09-05 | **Schliess-Aufruf** | brand-012, `review`-Eimer, Route `POST …/sessions/:id/close`, `BrandSessionReview`-Zod, Notizen/Befunde im Log, Georges „hat mitgelesen"-Block, adaptive `nextSession`, Kapitel-Modus für die Finale Abnahme | KI-Kosten: David sieht den Eimer | Route-Test mit Stub (goalReached false sperrt nichts; Schema-Fehler ⇒ fail-soft mit `reviewed:false`); Live-Probe an einem Test-Branding |
| 5 ✅ 2026-09-05 | **Konflikt-Chips** | Befund-UI im Log und in beiden Sessions, `accepted`/`dismissed`, Georges Einmal-Hinweis | — | Playwright: Chip verlinkt beide Felder; `dismissed` schreibt Notiz |
| 6 ✅ 2026-09-05 | **Korrektur-Regel** | `sourcesHash` beim Bestätigen (alle Feldarten), `GET impact`, `impactAck`/409, Warteschlange, `correct`-Modus des Schliess-Aufrufs mit Eingrenzung, „gilt weiter"-Stempel | Davids Blick auf den Hinweis | Unit: Hülle je Feld = Anhang A (Gegenprobe); Route-Test: PATCH ohne Ack ⇒ 409; ohne Review bleiben alle `stale`; mit Review nur `affected` |
| 7 ✅ 2026-09-05 (Davids Seiten-Abnahme offen) | **Dokument + Prüfblick** | Ergebnis-Seite ohne George, „Dokument prüfen", Nachholung `reviewed:false` | Konzept-Gate P5–P7 damit beantwortet — **David nimmt die Seite ab** | Live-Durchlauf eines vollständigen Brandings |

Reihenfolge ist Abhängigkeit: 1 vor allem; 2 parallel zu 3; 4 vor 5 und 6; 7
zuletzt.

**Paket-1-Befunde für spätere Pakete (2026-09-04):** (a) Die Invariante
`c.final count 3–5` zählt Zeilen im Listen-Format (`- eintrag`); Paket 6 muss
vor dem Verdrahten von `facts.value` prüfen, dass der Chips-Editor die Werte
genau so serialisiert — sonst blockt ein 409 jedes Bestätigen. (b)
`f.decision memberOf f.shortlist` ist NICHT registriert: `f.decision` ist
„top three, in order", kein Einzelwert; Paket 2 entscheidet die Wert-Form und
trägt dann `subsetOf` ein. (c) `sessionInstruction` hat keinen
`locale`-Parameter; kommt mit Paket 2, wenn Beispiele je Sprache nötig
werden. (d) `answers.*` reist bewusst NICHT in den Entwurfs-Prompt, sondern
gehört in `conversePrompt.ts` (Paket 3). Nach jedem Paket: OPEN-ITEMS aktualisieren, Erledigtes nach
OPEN-ITEMS-COMPLETE.

## 16. Entscheidungen vom 2026-09-04 (David, per Fragenrunde)

- **§3a:** alle vier Inhalts-Ergänzungen (Qualitätskriterien, Anti-Muster,
  Frage-Leiter, Form) und alle vier Struktur-Ergänzungen (Invarianten,
  Vertraulichkeit, Vertagen, Umfang-Anzeige) — angenommen.
- **Review-Modell:** zweistufig (§7) — günstig als Standard, George-Modell
  nur bei Konflikt-Verdacht.
- **Prüfblick:** nur auf Klick (§10), nie automatisch.
- **`minSubstance`:** drei Stufen (`short`/`medium`/`long`) — stillschweigend
  angenommen, weil 68 Zahlen ohne Massstab niemand pflegt; David hat es nicht
  eigens entschieden. Wer es je Session braucht, ergänzt eine Zahl, die
  Stufe bleibt der Default.

Damit gibt es keine offene Entscheidung mehr, die Paket 1 blockiert.

## 17. Ausblick (NICHT Teil dieses Plans): Marktvergleich

Davids Produktgedanke vom 2026-09-04: weil die Foundation am Ende als
STRUKTURIERTE Daten vorliegt (68 bestätigte Felder mit Herkunft, nicht ein
PDF), kann man sie später gegen den Markt halten — Wettbewerber-Websites
analysieren (die URL-Analyse aus brand-010 ist der Anfang), deren
Positionierung, Tonalität und Versprechen in DIESELBE Feld-Struktur
übersetzen und daraus sagen, wo die eigene Marke steht und was sie ändern,
verbessern oder überdenken sollte. Das ist ein eigenes Produkt (eigener
Layer nach der Silo-Regel), es braucht die Sessions-Architektur als
Fundament, und es bekommt erst nach Paket 7 einen Plan. Hier steht es, damit
die Session-Configs von Anfang an so gebaut werden, dass ein Feldwert
MASCHINELL vergleichbar bleibt (Schema je Feld, keine Freitext-Blobs, wo eine
Struktur möglich ist).

---

## Anhang A — Die sortierte Liste (mechanisch aus der Registry, 2026-09-04)

Spalten: Session · Typ (Erbe) · Kind · Pflicht · liest (Anzahl Slot-Eingaben)
· **berührt** (transitive Hülle: Felder / Kapitel). Die Reihenfolge ist die
Registry-Reihenfolge und damit die Gesprächs-Reihenfolge. `berührt 0` heisst:
eine Korrektur dort löst keine Warteschlange aus.

### A · Kontext (11) — George

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| a.pitch | derivation | derive | ja | Startkarte | 27 / 7 |
| a.category | derivation | derive | ja | Startkarte | 9 / 4 |
| a.competitors | stage-edit | draft | ja | Startkarte | 9 / 4 |
| a.audienceSketch | stage-edit | draft | ja | Startkarte | 14 / 5 |
| a.toneAnalysis | derivation | derive | nein | Website-Text | 22 / 5 |
| a.origin | question | ask | ja | — (Pfad-Fassung) | 23 / 7 |
| a.customerPraise | question | ask | ja | — | 29 / 7 |
| a.complaints | question | ask | ja | — | 19 / 6 |
| a.oneThing | question | ask | ja | — | 10 / 4 |
| a.challenge | question | ask | ja | — | 0 |
| a.facts | choice | **collect** | ja | — | 0 |

### B · Purpose, Vision, Mission (10) — Vera

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| b.whyStarted | question | ask (ableitbar aus a.origin) | ja | 1 (Pfad-Fassung) | 15 / 5 |
| b.worldLoses | question | ask | ja | — | 15 / 5 |
| b.conviction | question | ask | ja | — | 22 / 7 |
| b.tenYears | question | ask | ja | — | 8 / 4 |
| b.legacy | question | ask | ja | — | 8 / 4 |
| b.purpose | stage-edit | draft | ja | 4 | 14 / 5 |
| b.vision | stage-edit | draft | ja | 3 | 7 / 3 |
| b.mission | stage-edit | draft | ja | 5 | 8 / 3 |
| b.positioningCategory | choice | choose (mit Ableitung) | ja | 3 | 3 / 2 |
| b.positioningFirstChoice | question | ask | ja | — | 1 / 1 |

### B2 · Architektur (5, nur bei Sub-Brands) — Vera

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| b2.visibility | question | ask | ja | — | 2 / 1 |
| b2.roleOfMaster | question | ask | ja | — | 2 / 1 |
| b2.namingPattern | question | ask | ja | — | 2 / 1 |
| b2.model | choice | choose (Karten, mit Ableitung) | ja | 5 | 1 / 1 |
| b2.rule | stage-edit | draft | ja | 2 | 0 |

### C · Werte (9) — Milo

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| c.discovery1 | question | ask | ja | — | 19 / 6 |
| c.discovery2 | question | ask | ja | — | 19 / 6 |
| c.discovery3 | question | ask | ja | — | 19 / 6 |
| c.candidates | derivation | derive (candidates) | ja | 7 | 18 / 6 |
| c.final | choice | choose | ja | 1 | 17 / 6 |
| c.definitions | stage-edit | draft | ja | 4 | 6 / 3 |
| c.livedExamples | question | ask | ja | 1 | 0 |
| c.conflictRule | question | ask | ja | 1 | 0 |
| c.teamFilter | question | ask | nein (nur Team) | 1 | 0 |

### D · Archetyp (12) — Milo (Interim: Gesprächs-Ableitung)

Die Technik dieses Kapitels ist MILO, nicht Nika: `brandAdvisors.ts` gibt ihm
`['values', 'archetype']`, die Content-Spec §1.4 bestätigt es, und das generierte
Inhalts-Dokument folgt dem. Hier stand bis 2026-09-04 „Nika" — ein Doku-Konflikt,
kein Code-Befund (Inhalts-Audit §2.4). Die letzten drei Sessions
(`d.voiceSamples`, `d.toneWords`, `d.vocabulary`) sind fachlich Ohr-Arbeit und
damit Nika-Stoff; ihre Leitern sind bereits so geschrieben. Wandert D eines Tages
zu Nika, kollidiert ihre Verbotsliste („zwei Varianten anbieten, nie drei") mit
`d.voiceSamples` („EXACTLY THREE", Content-Spec §7) — das ist dann zu entscheiden.

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| d.hypothesis | derivation | derive | ja | 3 | 21 / 5 |
| d.pairs | special | **instrument** (interim derive) | ja | 1 | 20 / 5 |
| d.primary | derivation | derive | ja | 1 | 18 / 5 |
| d.secondary | derivation | derive | ja | 1 | 2 / 1 |
| d.gapReveal | derivation | derive | ja | 3 (Pfad-Fassung) | 0 |
| d.party | question | ask | ja | — | 1 / 1 |
| d.never | question | ask | ja | — | 0 |
| d.admired | question | ask | ja | — | 0 |
| d.emotion | question | ask | ja | — | 17 / 5 |
| d.voiceSamples | choice | choose (Karten, Entwurf) | ja | 5 | 0 |
| d.toneWords | choice | choose (mit Ableitung) | ja | 3 | 10 / 4 |
| d.vocabulary | question | ask (ableitbar) | ja | 2 | 1 / 1 |

### E · Manifest (6) — Nika

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| e.warmup1 | question | ask | ja | — | 6 / 3 |
| e.warmup2 | question | ask | ja | — | 6 / 3 |
| e.statements | stage-edit | draft | ja | 9 | 5 / 3 |
| e.composition | choice | choose | ja | — | 5 / 3 |
| e.manifesto | stage-edit | draft | ja | 3 | 4 / 3 |
| e.anchorLine | choice | choose | ja | 1 | 3 / 2 |

### EP · Tagline & Messaging (5) — Nika

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| ep.taglines | choice | choose (candidates) | ja | 5 | 0 |
| ep.boilerplates | stage-edit | draft | ja | 6 | 0 |
| ep.keyMessages | stage-edit | draft | ja | 4 | 0 |
| ep.vocabulary | derivation | derive | ja | 2 | 0 |
| ep.distinctiveAsset | choice | choose | ja | 1 | 0 |

### F · Name & Prüfung (8, nur ohne Namen oder beim Neuschnitt) — Otto

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| f.nameType | choice | choose | ja | — | 5 / 1 |
| f.taste | question | ask | ja | — | 5 / 1 |
| f.noGos | question | ask | ja | — | 5 / 1 |
| f.candidates | derivation | derive (candidates) | ja | 10 | 4 / 1 |
| f.shortlist | choice | choose | ja | 1 | 3 / 1 |
| f.checks | derivation | derive | ja | 1 | 2 / 1 |
| f.criteria | choice | choose | ja | 2 | 1 / 1 |
| f.decision | choice | choose (Karten) | ja | 3 | 0 |

### Ergebnis (2) — George

| Session | Typ | Kind | Pflicht | liest | berührt |
| --- | --- | --- | --- | --- | --- |
| result.direction | choice | choose (Karten) | ja | 3 | 0 |
| result.rating | choice | choose | nein | — | 0 |

Erzeugt mit einem Wegwerf-Skript über `BRAND_SLOTS` (Umkehrung der
`dependencies`, transitive Hülle). Sobald Paket 1 `sessionsAffectedBy`
liefert, nagelt ein Test diese Tabelle an die Registry — die Tabelle hier ist
dann Dokumentation, nicht Wahrheit.
