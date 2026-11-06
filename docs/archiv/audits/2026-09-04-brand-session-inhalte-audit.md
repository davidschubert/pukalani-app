# Inhalts-Audit Paket 2 — die 68 Session-Inhalte

Prüferin: unabhängig, nur Inhalt (Markenstrategie + Interviewführung), keine Code-Prüfung,
keine Datei geändert. Gegenstand: `docs/referenz/BRAND-WIZARD-SESSION-INHALTE.md`
(generiert aus `packages/brand/shared/sessionContent.ts`, Stand 2026-09-04).
Maßstab: CONTENT-SPEC §§1–16, SESSIONS §3a, `packages/brand/shared/brandAdvisors.ts`,
`packages/brand/i18n/locales/{de,en}.json`.

**Gesamtbild vorab:** die Substanz ist gut. Die Qualitätskriterien sind über alle 68 Sessions
hinweg mit Ja/Nein prüfbar (0 Befunde in der schärfsten Spalte), die Anti-Muster sind fast
durchgehend als erkennbarer Satz formuliert, die Beispiele sind konkret, warm und
handwerklich glaubwürdig. Die Befunde liegen in drei Nestern: (1) Umfangs-Zahlen, die die
45-Minuten-Zusage um das Dreifache reißen, (2) Antwort-Regeln, die der eigenen Leiter
widersprechen, (3) englisch übersetzte Eigennamen in den Beispielen.

## ✗ je Spalte (68 Sessions)

| Spalte | ✗ | Kern |
| --- | --- | --- |
| a Ziel deckt sich mit Frage/Zweck | **2** | `a.origin` (R3/R4 aus §2.3 haben kein Zuhause), `e.statements` (die 23 Satzanfänge stehen nirgends) |
| b Qualität Ja/Nein-prüfbar | **0** | keine „inspiring/authentic/strong"-Kriterien; einziges weiches Wort steht in einer Verneinung |
| c Anti-Muster konkret | **1** | `result.rating` beschreibt Georges Verhalten statt eines zurückgewiesenen Werts |
| d Leiter folgt Leitsatz + Technik | **2** | `e.composition` (drei Entscheidungen in einem Zug), `f.criteria` (16–24 Bewertungen in 3 Zügen) |
| e Beispiele | **16** | 13× übersetzter Eigenname, 2× englische Schlüssel im deutschen Beispiel, 1× reale Marke erkennbar |
| f Widerspruch zu Spec-Regeln | **11** | 5× eingefrorener Fragen-Pool, 6× deterministische Regel ohne Invariante |
| g Form/Antwort-Regeln plausibel | **23** | 14× `maxProbes: 0` bei vorhandener Nachfrage, 12× Person-Weiche ohne sprechenden Menschen, 4× Vertagen-Logik, 1× Vertraulichkeit |

Dazu **ein systemischer Befund außerhalb der Spalten** (betrifft alle 68, s. §4):
die Summe der `effort.minutes` ergibt 154 Min im Basispfad und 187 Min im Vollpfad —
gegen die 45–55 Min der Spec §16.

---

## 1. Die Tabelle über alle 68 Sessions

Legende: ✓ = kein Befund · ✗ + Ein-Wort-Grund = Befund. Begründungen in §2–§5.

**Kontext**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a.pitch` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.category` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.competitors` | ✓ | ✓ | ✓ | ✓ | ✗ Anti-Muster | ✓ | ✗ Vertraul. |
| `a.audienceSketch` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.toneAnalysis` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.origin` | ✗ R3/R4 fehlen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.customerPraise` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.complaints` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.oneThing` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.challenge` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `a.facts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Purpose, Vision & Mission**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `b.whyStarted` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.worldLoses` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.conviction` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.tenYears` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.legacy` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.purpose` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.vision` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.mission` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `b.positioningCategory` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0 |
| `b.positioningFirstChoice` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Markenarchitektur**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `b2.visibility` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `b2.roleOfMaster` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `b2.namingPattern` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `b2.model` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✗ probes=0+Person+Vertagen |
| `b2.rule` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✗ Vertagen |

**Werte**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `c.discovery1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Pool 7→3 | ✓ |
| `c.discovery2` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Pool 7→3 | ✓ |
| `c.discovery3` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Pool 7→3 | ✓ |
| `c.candidates` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `c.final` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0 |
| `c.definitions` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Invariante | ✓ |
| `c.livedExamples` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Invariante | ✗ Vertagen |
| `c.conflictRule` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Invariante | ✓ |
| `c.teamFilter` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Archetyp und Stimme**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `d.hypothesis` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `d.pairs` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Person |
| `d.primary` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Person |
| `d.secondary` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Invariante | ✗ Person |
| `d.gapReveal` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Person |
| `d.party` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `d.never` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `d.admired` | ✓ | ✓ | ✓ | ✓ | ✗ Realmarke | ✓ | ✓ |
| `d.emotion` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `d.voiceSamples` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0 |
| `d.toneWords` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0 |
| `d.vocabulary` | ✓ | ✓ | ✓ | ✓ | ✗ use/avoid | ✓ | ✓ |

**Manifest**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `e.warmup1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Pool 5→2 | ✓ |
| `e.warmup2` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Pool 5→2 | ✓ |
| `e.statements` | ✗ 23 offen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `e.composition` | ✓ | ✓ | ✓ | ✗ Dreifach | ✓ | ✓ | ✗ probes=0+Person |
| `e.manifesto` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `e.anchorLine` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0+Person |

**Tagline & Messaging**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ep.taglines` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0 |
| `ep.boilerplates` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ep.keyMessages` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ep.vocabulary` | ✓ | ✓ | ✓ | ✓ | ✗ use/avoid | ✓ | ✓ |
| `ep.distinctiveAsset` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Invariante | ✗ probes=0+Person |

**Name**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `f.nameType` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✗ probes=0+Person |
| `f.taste` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `f.noGos` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ Vertagen |
| `f.candidates` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `f.shortlist` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✗ Invariante | ✗ probes=0 |
| `f.checks` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✓ |
| `f.criteria` | ✓ | ✓ | ✓ | ✗ Takt | ✗ Eigenname | ✓ | ✗ probes=0+Person |
| `f.decision` | ✓ | ✓ | ✓ | ✓ | ✗ Eigenname | ✓ | ✗ probes=0 |

**Ergebnis**

| Session | a Ziel | b Qualität | c Anti | d Leiter | e Beispiele | f Spec | g Form/Regeln |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `result.direction` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ probes=0+Person |
| `result.rating` | ✓ | ✓ | ✗ Verhalten | ✓ | ✓ | ✓ | ✗ Person |
---

## 2. Die Befunde im Einzelnen

### 2.1 Spalte a — Ziel gegen Frage und Spec-Zweck (2)

**`a.origin`.** Die Registry-Frage trägt auf dem Relaunch-Pfad wörtlich R1 aus Spec §2.3
(„Was am bestehenden Auftritt MUSS bleiben"). Das Ziel deckt R1; ein Qualitätskriterium
schiebt R2 nach („names one thing that must stay and one that goes"). **R3 („Warum jetzt?
Was ist passiert…") und R4 („Was gefällt dir am jetzigen Auftritt NICHT?") kommen in keiner
der 68 Sessions vor** — weder als Ziel, noch als Qualität, noch als Nachfrage in der Leiter.
Beide Fragen existieren als Locale-Schlüssel (`brand.q.rebrand.r3`, `.r4` in de.json/en.json
Zeile 321/322) und sind damit gebaut, aber unerreichbar. Spec §16 hatte für den Relaunch-Pfad
in Baustein A ausdrücklich 11 statt 8 Züge eingeplant — genau der Platz für R2–R4.
Gate ① („David liest R1–R4 gegen") läuft damit ins Leere, weil zwei der vier Fragen
das Produkt nicht erreichen.

**`e.statements`.** Ziel: „draft the statement openers the manifesto will be built from".
Spec §8 nennt das Instrument präzise: **23** Satzanfänge in fünf Gruppen („We believe…" ×5,
Commitment/Desire ×5, Energy/Identity ×4, Stance/Contrast ×5, Commitment/Promise ×4).
Weder Ziel noch Qualitätskriterien noch Invarianten nennen eine Zahl oder eine Gruppe.
Ein Modell, das hier sechs Zeilen liefert, verletzt keine einzige geschriebene Regel.
Zum Vergleich: `d.voiceSamples` schreibt „EXACTLY THREE" ins Ziel, `c.candidates` „5 to 7",
`f.decision` „top three" — die Zähl-Disziplin ist überall sonst da, nur an der größten
Session nicht.

### 2.2 Spalte b — Qualitätskriterien (0)

Über 271 Qualitätszeilen findet die Suche nach nicht prüfbaren Wertungen
(inspiring / authentic / strong / compelling / powerful / meaningful / memorable / nice)
**einen** Treffer, und der steht in einer Verneinung:
`c.teamFilter` — „It says what would disqualify somebody, **not what would be nice to have**."
Das ist eine Abgrenzung, kein Kriterium. Die Spalte ist sauber.

Stichprobe der Machart, die das trägt (jede Zeile mit Ja/Nein beantwortbar):
- `b.purpose`: „One sentence." · „No competitor in this industry could say it word for word."
  · „No product, service or feature is mentioned in it."
- `a.toneAnalysis`: „Every trait carries a short phrase quoted from their own texts."
  · „A reader could find the quoted phrase on their site."
- `d.emotion`: „A different feeling would be plausible here — so this one is a choice."

Das letzte ist das stärkste Kriterium im ganzen Dokument: es prüft nicht die Antwort,
sondern ob überhaupt eine Wahl getroffen wurde.

### 2.3 Spalte c — Anti-Muster (1 ✗, 7 ⚠)

**✗ `result.rating`.** Alle drei Anti-Muster beschreiben **Georges Verhalten**, nicht einen
zurückgewiesenen Wert: „Asking again after a skip" · „Reading the rating as a confirmation
of the result" · „Framing the question so that a low answer feels rude". Inhaltlich richtig
und wichtig — aber es sind Prompt-Regeln, keine Muster, die der Spezialist beim Schließen
zurückweisen kann (§7). Sie gehören in `ladder`/`processing.rules`; das Feld `antiPatterns`
bleibt damit für diese Session leer.

**⚠ Sieben Sessions tragen je EIN Anti-Muster, das nur die Verneinung eines eigenen
Kriteriums ist** — jeweils erkennbar formuliert, deshalb kein ✗, aber ohne eigenen
Erkenntniswert:

| Session | Kriterium | Anti-Muster |
| --- | --- | --- |
| `c.livedExamples` | „It shows the value costing something." | „An example in which the value cost nothing." |
| `d.never` | „It is more than the opposite of a virtue." | „The exact opposite of a value they already named." |
| `e.anchorLine` | „It is one line from the manifesto, word for word." | „A new line written for the occasion." |
| `f.shortlist` | „Every entry comes from the candidate list." | „A new name appearing for the first time at the shortlist stage." |
| `f.candidates` | „The candidates come from more than one route." | „A list in which every name is descriptive." |
| `ep.vocabulary` | „It adds words to the use side, not only bans." | „A ban list with nothing on the use side." |
| `ep.distinctiveAsset` | „It is one line that is already confirmed elsewhere." | „A newly invented line." |

Sechs dieser sieben Verneinungen sind zugleich die Stelle, an der eine **Invariante**
gehörte (§2.6) — dieselbe Regel steht dann dreimal (Qualität, Anti-Muster, gar nicht im Code).

### 2.4 Spalte d — Leiter gegen Leitsatz und Technik (2 ✗)

Zuerst das, was **stimmt**, weil es die Ausnahmen erklärt:

- **Otto (F) ist mustergültig.** `f.shortlist`-Nachfrage „say each one on the phone — which
  of them needs spelling?" ist wörtlich seine Technik; `f.noGos` „how long may it be before
  it stops working on a van door?"; `f.nameType`-Umdeutung „if they pick a descriptive name,
  say plainly what that costs in protectability". Nüchtern, prüfend, ohne Namens-Verliebtheit.
- **Vera (B/B2) trägt die Widerspruchs-Pflicht.** `b.conviction`-Umdeutung „if nobody could
  disagree, ask for the version their competitor would refuse to sign" ist §1.4 in einem Satz;
  `b.positioningFirstChoice` „if the answer is 'everyone', ask who has called twice this year".
- **Milo (C) fragt nach Momenten, nie nach Adjektiven.** `c.discovery1`-Umdeutung „if the
  answer is an adjective, ask for the day that made them use that word".
- **George (A) fängt klein an.** `a.customerPraise` Eröffnung „one sentence, verbatim, the way
  a customer said it" — kleiner geht eine Markenfrage nicht.

**23 Sessions haben gar keine Leiter** — und das ist systematisch, nicht schlampig: es sind
exakt alle `derive`/`draft`/`instrument`-Sessions (George entwirft, redigiert wird auf der
Bühne). Kein Befund, aber eine Konsequenz, die in §3a nicht steht: `ladder` ist dort nicht
als optional markiert, ein Registry-Test „kein leeres `ladder`" würde 23 Sessions rot machen.

**✗ `e.composition`.** Eröffnung: „settle tone, length and use — say which one you would take
and why." Das sind **drei Entscheidungen in einem Zug**, bei `maxProbes: 0` und 2 Zügen
Gesamtumfang. Der Leitsatz sagt „runterbrechen, bevor jemand zu viel erzählt", die Zug-Regel
(§1.2.2) „genau EINE Frage je Zug". Vergleich: `a.facts` hat für dieselbe Drei-Teile-Lage
den `collect`-Typ mit benannten Teilen bekommen. `e.composition` ist derselbe Fall und
bekommt ihn nicht.

**✗ `f.criteria`.** Eröffnung: „rate two or three finalists against the eight criteria,
**one criterion at a time**." Das sind 16–24 Bewertungen; der Umfang sagt 3 Züge, 3 Minuten.
Entweder ist „one criterion at a time" falsch, oder der Umfang. Beides zugleich geht nicht.

**⚠ Kapitel D läuft unter Milo, die letzten drei Sessions sind Nika-Arbeit.**
`brandAdvisors.ts` gibt Milo `['values','archetype']`, CONTENT-SPEC §1.4 bestätigt
(„Milo · C Werte · D Archetyp"), das generierte Dokument folgt dem — **aber
SESSIONS.md Anhang A schreibt „D · Archetyp (12) — Nika"**, und der Prüfauftrag ebenso.
Eine der beiden Quellen ist veraltet; inhaltlich hat der Code recht für `d.party`/`d.never`/
`d.admired`/`d.emotion` (Charakterfragen = Milo) und **unrecht für die letzten drei**:
`d.voiceSamples` („which of the three sounds least like you"), `d.toneWords` („which of these
words would you cross out first") und `d.vocabulary` („which word in your own texts makes you
wince when you read it back") sind Ohr-Arbeit, also Nika. Die Leitern sind fachlich richtig
geschrieben — nur die Kapitel-Zuordnung ist gröber als der Inhalt. Kein ✗, weil die Leiter
je Feld stimmt; Doku-Konflikt in Anhang A gehört korrigiert.

**⚠ Nikas eigene Verbotsliste kollidiert mit `d.voiceSamples`.** `neverDo`: „Offer two
variants and ask which one sounds like them — **never three**." `d.voiceSamples` verlangt
„EXACTLY THREE" (so auch Spec §7: „3 Beispielsätze im Archetyp"). Entschärft dadurch, dass
D bei Milo liegt — bricht in dem Moment, in dem D zu Nika wandert.

### 2.5 Spalte e — Beispiele (16 ✗)

#### a) Übersetzte Eigennamen — 13 Sessions

Der schwerste Befund dieser Spalte, weil er die Beispiele **inhaltlich falsch** macht,
nicht nur unschön. Ein Markenname ist kein übersetzbarer Text:

| Session | de | en |
| --- | --- | --- |
| `f.taste` | Mirabell · Kolibri · Anker · Klar · Nordlicht · Hain | Mirabelle · Colibri · Anchor · Clear · Northlight · Grove |
| `f.candidates` | Kolben · Nabe · Sattelfest · Hain · Nordlicht | Piston · Hub · Saddlefast · Grove · Northlight |
| `f.shortlist` / `f.decision` | dieselben | dieselben, übersetzt |
| `f.checks` | „Domain: **kolben.de** vergeben, kolben-rad.de frei" | „Domain: **piston.de** taken, piston-bikes.de free" |
| `f.criteria` | „## Kolben" | „## Piston" |
| `f.nameType` | „Praxis Ehlerding" | „Ehlerding **Practice**" |
| `a.competitors` | „Backhaus Merten" | „**Merten Bakeries**" |
| `b2.visibility/.roleOfMaster/.model/.rule` | „Sanitätshaus Krause" | „**Krause Medical Supplies**" |
| `b2.namingPattern` | „Lindenhof Quitte", „Lindenhof Schlehe" | „Lindenhof **Quince**", „Lindenhof **Sloe**" |

Zwei Schäden: (1) Das Beispiel lehrt das Modell, dass ein **Namens-Kandidat mit der
Oberflächensprache wechseln darf** — genau die Verwechslung, gegen die `f.*` gebaut ist.
(2) `f.checks` behauptet Domain-Befunde für zwei verschiedene Domains je nach Sprache;
eine `.de`-Domain zu einem englischen Namen ist ein Widerspruch in einem Beispiel, das
Vorprüfungs-DISZIPLIN zeigen soll. Richtig wäre: Name identisch in beiden Sprachen,
nur der erklärende Zusatz übersetzt („Nabe — descriptive, from the trade").

#### b) Englische Schlüssel im deutschen Beispiel — 2 Sessions

`d.vocabulary` und `ep.vocabulary` zeigen im **deutschen** Beispiel:

> - use: geschmiedet · use: Werkstatt · avoid: Premium · avoid: Manufaktur — steht inzwischen auf jeder Tiefkühlpizza

`use:`/`avoid:` sind Struktur-Marker aus der englischen Fassung, unübersetzt stehen
geblieben. Im Deutschen gehört dort „benutzen:" / „meiden:" — genau der Feldtitel, den
`brand.q.ep.vocabulary` schon auf Deutsch führt („Wörter zum Benutzen, Wörter zum Meiden").

#### c) Reale Marke erkennbar — 1 Session, beide Pfade

`d.admired`:

> **Neue Marke, de:** „Eine kleine Outdoor-Marke aus Schweden: Sie legt seit Jahren dieselbe
> Reparaturanleitung bei, statt jedes Jahr eine neue Kampagne zu machen. Ihre Umweltpredigt
> wäre uns aber zu viel."
>
> **Relaunch, de:** „Eine Kaffeerösterei in Hamburg: Sie schreibt auf jede Tüte, was der
> Bauer bekommen hat. Ihr Ton wäre uns aber zu belehrend."

Beide sind **Steckbriefe existierender Marken**: Land + Größe + eine seltene, tatsächlich
praktizierte Eigenheit reichen zur Identifikation, und der Nachsatz ist in beiden Fällen ein
öffentliches Werturteil über diese identifizierbare Marke („Umweltpredigt", „belehrend").
Das ist die einzige Stelle in 132 Beispielen, an der §3a („erfunden, nie eine reale Marke
empfehlen") reißt — und sie reißt in beide Richtungen: Empfehlung UND Herabsetzung.
Das ist zugleich der einzige Punkt mit Außenwirkungs-Risiko, weil er im Kunden-Dokument
und auf der Abnahme-Seite steht.

#### d) Das Beispiel widerspricht dem eigenen Anti-Muster — `a.competitors`

Anti-Muster: „**Invented competitors that merely sound plausible for the industry.**"
Beispiel: „- Backhaus Merten — stark: sechs Filialen, alle am Bahnhof — schwach: eine
Teiglinie für alles, kein Sauerteig". Das ist exakt ein erfundener, plausibel klingender
Wettbewerber. Die Absicht ist klar (Form zeigen), aber diese eine Session kann sich das
nicht leisten: sie ist die einzige, deren Kernregel „jeder Name steht wörtlich in den
Eingaben" lautet. Ein Formbeispiel gehört hier mit Platzhalter-Kennzeichnung
(„— Name aus den Eingaben —") oder gar nicht.

#### e) Was NICHT beanstandet wird

- **Fehlende Beispiele** bei `d.pairs` (Instrument) und `result.rating` (freiwillige
  Abschlussfrage): regelkonform, §3a verlangt sie nur bei `draft`/`derive`.
- **Nähe von de und en.** Die meisten Paare sind enge Entsprechungen, keine Neuschöpfungen.
  Für Beispiele ist das richtig — sie müssen in beiden Sprachen dieselbe FORM zeigen; die
  Native-Formulierungs-Regel der Spec (§8/§13) gilt Satzanfängen und Lehrtexten, nicht
  Beispielen. Wo Lokalisierung nötig war, ist sie gemacht: `a.toneAnalysis` de „die Seite
  sagt nirgends ‚du' oder ‚ihr'" → en „the site never addresses anyone directly".
- **Anglizismen im Deutschen** außerhalb von (b): keine. Die deutschen Beispiele sind
  auffallend sauber („werkstattnah", „warm ohne Zucker", „Wir zählen, wer wiederkommt").

#### f) Branchen-Statistik der 132 Beispiele

Gezählt: 66 Sessions × 2 Pfade. Die Beispiele sind **je Kapitel als durchlaufende Geschichte**
gebaut — ein Betrieb je Pfad, quer durch alle Sessions des Kapitels. Das ist didaktisch stark
(man sieht dieselbe Marke reifen) und hat eine Nebenwirkung, s. §5 Punkt 10.

| Kapitel | Pfad „Neue Marke" | Pfad „Relaunch" |
| --- | --- | --- |
| A Kontext | wechselnd (11 verschiedene) | wechselnd (11 verschiedene) |
| B PVM | wechselnd (10 verschiedene) | wechselnd (10 verschiedene) |
| B2 Architektur | Obsthof/Brennerei „Lindenhof" (5/5) | Sanitätshaus Krause + Reha-Marke (5/5) |
| C Werte | Hundeschule (9/9) | Reitstall (9/9) |
| D Archetyp | Messerschmiede (10/10, außer `d.admired`) | Reiseveranstalter (10/10, außer `d.admired`) |
| E Manifest | Energieberatung Altbau (6/6) | Fitness-/Sportstudio (6/6) |
| E+ Verbal | Energieberatung Altbau (5/5) | Fitness-/Sportstudio (5/5) |
| F Name | Fahrradwerkstatt (8/8) | Zahnarztpraxis (8/8) |
| Ergebnis | Messerschmiede | Fitnessstudio |

Branchen-Häufung über alle 132:

| Feld | Anteil (gerundet) | Beispiele |
| --- | --- | --- |
| **Handwerk, Reparatur, Bau, Manufaktur** | **~37 %** | Tischlerei, Sattlerei, Schuhmacher, Messerschmiede (10), Schlosserei, Orgelbau, Keramik, Fahrradwerkstatt (9), Holzbau, Reetdachdecker, Energieberatung (11), Repair-Café |
| **Tier, Landwirtschaft, Lebensmittel-Erzeugung** | **~22 %** | Hundeschule (9), Reitstall (9), Obsthof (5), Imkerei, Käserei, Metzgerei, Bäckerei, mobile Tierarztpraxis, Baumschule |
| **Gesundheit, Praxis, Körper** | **~22 %** | Zahnarztpraxis (8), Sanitätshaus/Reha (5), Fitnessstudio (11), Physiotherapie, Apotheke, Pflege, Hörakustik, Optiker |
| **Handel & Dienstleistung sonstiges** | **~12 %** | Reiseveranstalter (10), Umzug, Fahrschule, Steuerkanzlei, Naturseife, Weingut, Getränke |
| **Bildung, Kultur, Öffentliches** | **~5 %** | Musikschule, Chor, Buchhandlung, Stadtbibliothek, Kletterhalle |

**Was in 132 Beispielen NICHT vorkommt:** Software, SaaS, Agentur, Studio, Beratung
(außer Steuerkanzlei und Energieberatung), E-Commerce, Gastronomie, Medien, Bau-B2B,
Handwerk mit >50 Mitarbeitenden, überhaupt jedes Unternehmen ohne Werkbank oder Behandlungsliege.
Die Beispiel-Welt ist geschlossen analog und kleinstädtisch. Das ist ein Geschmacksurteil,
kein Fehler — es steht als Punkt 9 auf dem Gegenlese-Blatt.

**Beispiele, die eine reale Marke nahelegen — vollständige Liste:**

1. `d.admired` / Neue Marke — „kleine Outdoor-Marke aus Schweden" mit beigelegter
   Reparaturanleitung und „Umweltpredigt". **Hoch.**
2. `d.admired` / Relaunch — „Kaffeerösterei in Hamburg", die auf jede Tüte schreibt, was der
   Bauer bekommen hat. **Hoch** (der im Prüfauftrag genannte Fall — er bestätigt sich).
3. `f.taste` — „Mirabell" (existiert als Süßwaren-Marke), „Klar" (existiert als deutsche
   Seifen-Marke), „Anker" (mehrfach vergeben), „Hain" (Lebensmittelkonzern). **Mittel** —
   hier ist es weniger schlimm, weil die FRAGE nach echten Namen fragt (s. §5 Punkt 11).
4. `a.competitors` „Backhaus Merten", `b2.*` „Lindenhof" (sehr häufiger realer Hofname),
   `a.competitors` „Velo Grün", `b2.*` „Sanitätshaus Krause", `f.*` „Praxis Ehlerding".
   **Niedrig-mittel** — erfundene Firmennamen, die es als reale Betriebe fast sicher gibt.
   Kein Markenrechts-Thema (kein Werturteil bei `b2`/`f`), aber `a.competitors` **nennt eine
   Schwäche** zu „Backhaus Merten" und „Velo Grün" — dieselbe Konstruktion wie bei `d.admired`,
   nur mit erfundenem Namen.

### 2.6 Spalte f — Widerspruch zu Spec-Formeln und -Regeln (11 ✗)

#### a) Eingefrorene Fragen-Pools — 5 Sessions

| Session | Spec | Registry/Inhalt |
| --- | --- | --- |
| `c.discovery1/2/3` | §6: „c.discovery1–3 (F — **KI wählt 3 der 7** Discovery-Fragen nach Pfad/Kontext)" | fest D1, D2, D3; D4–D7 kommen nirgends vor |
| `e.warmup1/2` | §8: „e.warmup1–2 (F — **KI wählt 2 der 5** Warmup-Fragen)" | fest W1, W2; W3–W5 kommen nirgends vor |

Die Ziele zementieren das zusätzlich („capture a moment when this business was at its best"
= wörtlich D1). Damit ist die Adaptivität, die die Spec für C und E vorsieht, still
verschwunden — und mit ihr die vier Fragen D4 („Was haben eure Lieblingskunden gemeinsam?"),
D5 („Wenn du einen Kunden wegen eines Prinzips feuern müsstest"), D6 („Wofür werdet ihr immer
wieder gelobt?"), D7 („Wie soll dein Team entscheiden, wenn du nicht im Raum bist?") sowie
W3–W5 („Auf welchem Hügel würdest du sterben?"). D7 ist inhaltlich der stärkste Verlust:
er ist die einzige Discovery-Frage, die auf die Team-Weiche zielt.

Das kann eine bewusste Vereinfachung sein — dann gehört sie in die Spec, nicht still in die
Registry. Als Befund zählt der Widerspruch, nicht die Entscheidung.

#### b) Deterministische Regeln ohne Invariante — 6 Sessions

§3a ist an dieser Stelle unmissverständlich: „Eine Regel, die ein Test prüfen kann, wird
nicht der KI überlassen — sie ist billiger, schneller und lügt nie." Es existieren **drei**
Invarianten in 68 Sessions (`c.final` count 3–5 · `e.anchorLine` sentenceOf `e.manifesto` ·
`f.decision` subsetOf `f.shortlist`). §3a nennt **vier** Beispiele — das vierte fehlt:

| Session | Qualitätskriterium (deterministisch) | Invariante |
| --- | --- | --- |
| `c.conflictRule` | „It names two of their own values by name." — §3a wörtlich: „c.conflictRule nennt nur Werte aus c.final" | **fehlt** |
| `f.shortlist` | „Every entry comes from the candidate list." | fehlt (`subsetOf f.candidates`) |
| `c.definitions` | „One line per chosen value, none missing and none added." | fehlt (`count == c.final.length`) |
| `c.livedExamples` | „One real example per chosen value." | fehlt |
| `d.secondary` | „It is a different archetype from the primary." | fehlt (`≠ d.primary`) |
| `ep.distinctiveAsset` | „It is one line that is already confirmed elsewhere in the foundation." | fehlt (`memberOf` e.anchorLine/ep.taglines) |

Jede dieser sechs kostet heute einen KI-Aufruf, den ein `if` erledigen würde — und wird
still falsch, wenn das Modell einmal danebengreift.

#### c) ⚠ Kleinere Spannungen (kein ✗)

- `b.purpose` `maxWords: 25` gegen §3a „z. B. Purpose ≤ **20** Wörter". Die Spec schreibt
  „z. B.", also nicht bindend — aber 25 Wörter sind für einen Purpose spürbar lang, und die
  beiden Beispiele brauchen 15 bzw. 14. Der Deckel ist weiter als die eigene Anschauung.
- `b.vision` `forbidden` nennt die Wörter englisch: „the words **'we want' and 'we will'**".
  Der Wert entsteht in der Inhaltssprache der Marke; für eine deutsche Vision sind „wir
  wollen"/„wir werden" gemeint. Als Prompt-Text funktioniert es semantisch, als spätere
  Code-Prüfung nicht.
- `b.purpose` Person = „wir", aber beide Beispiele haben gar kein Subjekt („Damit niemand
  mehr glaubt, guter Kaffee sei…"). Die Purpose-Formel der Spec verlangt das auch nicht —
  die Form-Angabe passt hier nicht zur eigenen Anschauung.
- **Paarvergleich-Verankerungsverbot (§12.1) ist korrekt umgesetzt.** `d.pairs` Qualität:
  „The decisions came from their own sense, not from a brand they admire", Anti-Muster:
  „A choice justified by a famous brand instead of by their own feeling." Kein Befund.
- **Archetyp-Katalog-Ids (§12.1) korrekt.** `d.primary`/`d.secondary`/`d.hypothesis`
  verlangen durchgehend „one of the twelve catalogue archetypes" und „a catalogue name,
  not an informal one". Kein Befund.
- **Werte 3–5 (§6) korrekt**, sogar als einzige gezählte Invariante. **Kandidaten 5–7**
  steht im Ziel von `c.candidates`, aber ohne Kriterium und ohne Invariante — im Gegensatz
  zu `c.final`. Grenzfall, nicht gezählt.

### 2.7 Spalte g — Form und Antwort-Regeln (23 ✗)

#### a) `maxProbes: 0` bei vorhandener Nachfrage — 14 Sessions

§3a: „`answers.maxProbes` **deckelt die Leiter**; die Leiter sagt, WAS gefragt wird."
Bei `maxProbes: 0` ist jede in der Leiter geschriebene Nachfrage tot. Betroffen sind alle
14 `choose`-Sessions mit Leiter:

`b.positioningCategory` · `b2.model` · `c.final` · `d.voiceSamples` · `d.toneWords` ·
`e.composition` · `e.anchorLine` · `ep.taglines` · `ep.distinctiveAsset` · `f.nameType` ·
`f.shortlist` · `f.criteria` · `f.decision` · `result.direction`

Je Session ist es genau eine Nachfrage, und es sind durchweg die guten:

- `c.final`: „which of these would you still hold in the worst month of the year?"
- `f.decision`: „if the trademark check kills number one, is number two really your next choice?"
- `f.shortlist`: „say each one on the phone — which of them needs spelling?"
- `d.toneWords`: „which of these words would you cross out first?"

Das sind die Sätze, an denen eine Auswahl von einer Abnick-Übung zu einer Entscheidung wird.
Entweder `maxProbes: 1` für diese 14, oder die Nachfragen streichen — der heutige Stand
schreibt sie auf und verbietet sie im selben Atemzug.

#### b) Person-Weiche ohne sprechenden Menschen — 12 Sessions

`form.person: 'fromTeam'` („folgt der Weiche Solo/Team") steht bei 12 Sessions, in denen
**kein Mensch** den Wert formuliert — George leitet ab oder der Mensch klickt eine Karte:

`d.pairs` · `d.primary` · `d.secondary` · `d.gapReveal` · `b2.model` · `e.composition` ·
`e.anchorLine` · `ep.distinctiveAsset` · `f.nameType` · `f.criteria` · `result.direction` ·
`result.rating`

Beleg, dass es der durchgereichte Default ist und keine Entscheidung: `d.primary`s eigenes
Beispiel lautet „Der Schöpfer — ‚auch wenn es zehnmal dasselbe ist' ist **euer** Satz" —
also `brand`, nicht `we`/`I`. Richtig wären `'brand'` oder `'none'`; die Spec kennt beide.
Nebenwirkung: `tense` steht bei allen zwölf auf `'any'` („frei"), obwohl die Ableitungen
durchweg Präsens sind.

#### c) Vertagen-Logik — 4 Sessions

`allowDefer: true` steht bei sieben Sessions: `a.facts`, `b2.visibility`, `b2.roleOfMaster`,
`b2.namingPattern`, `c.conflictRule`, `c.teamFilter`, `f.noGos`. §3a nennt als Begründung
„Manche Sessions brauchen jemanden, der gerade nicht am Tisch sitzt (Zahlen in `a.facts`,
die Konfliktregel im Team)". Gegen diesen Maßstab:

- **✗ `f.noGos`** ist vertagbar, ist aber die persönlichste Geschmacksfrage im ganzen
  Baustein F („Gibt es Wörter, Stile oder Längen, die tabu sind?"). Dafür braucht niemand
  einen Abwesenden.
- **✗ `b2.model` und `b2.rule`** sind NICHT vertagbar — obwohl sie die beiden
  ENTSCHEIDUNGEN des Kapitels sind, deren Vorfragen (`visibility`, `roleOfMaster`,
  `namingPattern`) alle drei vertagbar sind. Wer die Vorfragen vertagen darf, kann die
  Entscheidung erst recht nicht allein treffen.
- **✗ `c.livedExamples`** ist nicht vertagbar, verlangt aber „one REAL example per value"
  mit Datum, Ort oder Person — in einem Team genau das, was man nachschlagen oder jemanden
  fragen muss. §3a: „Ohne Vertagen erfindet der Mensch eine Antwort, um weiterzukommen" —
  und diese Session ist die, in der eine erfundene Antwort am meisten anrichtet
  (sie ist die Substanz der Werte).

#### d) Vertraulichkeit — 1 Session

`internal` steht bei vier Sessions: `a.complaints`, `a.challenge`, `a.facts` (die drei aus
§3a) plus `b2.roleOfMaster`. Die Stufe `private` wird **nirgends** verwendet.

**✗ `a.competitors` ist `public`** und enthält zu **namentlich genannten Dritten** je eine
Schwäche („schwach: eine Teiglinie für alles, kein Sauerteig" · „schwach: repariert nur
Räder, die sie selbst verkauft haben"). §3a begründet die Stufe mit „Ein Kunde, der seine
Marke teilt, teilt nicht seine Beschwerden" — dasselbe gilt erst recht für sein Urteil über
den Nachbarn. Heute reist dieser Block per Share-Link und im Export mit.

Grenzfälle ohne ✗, weil vertretbar: `c.discovery2` (das Eingeständnis eines eigenen
Fehlverhaltens — im Beispiel „wir haben ein lahmes Pferd noch eine Woche im Unterricht
gelassen"), `e.warmup1` (Zorn auf Branchenpraktiken), `d.gapReveal` (der Befund
Selbstbild/Außenbild). Alle drei sind `public`; alle drei können auf einer geteilten Seite
unangenehm werden.

---

## 3. Was in dieser Prüfung ausdrücklich gut ist

Damit die Befundliste nicht das Bild verzerrt — was in diesem Paket überdurchschnittlich ist:

1. **Die Qualitätskriterien sind echte Prüflisten.** 0 Befunde in der schwersten Spalte,
   über 271 Zeilen. Das ist das Fundament für `goalReached` und der Grund, warum der
   Spezialist überhaupt etwas zurückweisen kann.
2. **Die Anti-Muster zitieren die Floskel, statt sie zu beschreiben.** „we deliver quality
   and innovation" · „women, 30 to 45, urban" · „they do not know us yet" · „we are sometimes
   too thorough" · „it depends" · „case by case" · „they never conflict". Das erkennt ein
   Modell wieder; eine Umschreibung nicht.
3. **Die Leitern kennen die Umdeutung, nicht nur die Nachfrage.** Fast jede `ask`-Session
   hat zwei `reframes`, die einen typischen Ausweichzug abfangen — „if the answer is a market
   opportunity, ask what personally annoyed them", „if the answer is ‚none', ask what people
   quietly stop doing instead of complaining". Das ist die Stelle, an der Interviewqualität
   entsteht.
4. **Die Beispiele sind konkret und nicht kopierbar.** Zahlen, Orte, Uhrzeiten, benannte
   Kosten („240 Euro zurückgezahlt", „bei 1240 Grad", „seit 1994"). Kein einziges Beispiel
   ist ein Slogan.
5. **Die Widerspruchs-Pflicht ist eingebaut, nicht behauptet.** `d.gapReveal` Qualität:
   „It names the difference plainly, without softening it" + Anti-Muster „A reassuring closing
   sentence." Genauso `c.livedExamples` Umdeutung: „if one value has no story, **say so
   plainly** and ask whether it belongs on the list."
6. **`f.checks` hält die Rechtsgrenze.** „Domain and handle results are stated as indicators,
   never as legal facts" + Anti-Muster „A trademark verdict: ‚this name is free'." Deckt
   sich mit Ottos `neverDo` und dem Disclaimer aus Spec §10.

---

## 4. Der systemische Befund: der Umfang

Gerechnet aus `effort.minutes` und `effort.turns` je Session, summiert je Kapitel:

| Kapitel | Sessions | Σ Minuten | Σ Züge | Spec §16 Startwert (Min) | Faktor |
| --- | --- | --- | --- | --- | --- |
| A Kontext | 11 | **31** | 35 | 8 | 3,9× |
| B PVM | 10 | **28** | 35 | 8 | 3,5× |
| B2 Architektur | 5 | **13** | 17 | 4 | 3,3× |
| C Werte | 9 | **26** | 32 | 10 | 2,6× |
| D Archetyp | 12 | **30** | 33 | 8 | 3,8× |
| E Manifest | 6 | **23** | 19 | 8 | 2,9× |
| E+ Verbal | 5 | **14** | 12 | 4 | 3,5× |
| F Name | 8 | **20** | 21 | 12 | 1,7× |
| Ergebnis | 2 | **2** | 3 | 3 | 0,7× |

**Pfad-Summen (ohne Schritt 0):**

| Pfad | Σ Minuten | Σ Züge | Spec §16 (erwartet) |
| --- | --- | --- | --- |
| Basispfad (ohne B2, ohne F) | **154** | 169 | ~45–55 Min · 59 Züge |
| Vollpfad (mit B2 und F) | **187** | 207 | ~75 Min · 78 Züge |

Die Zahl, die der Mensch sieht, ist nach §3a die Summe („Steht in der Seitenleiste
(‚~3 Min') und am Kapitel (‚11 Sessions, ~25 Min')"). Baustein A meldet dem Kunden damit
**~31 Minuten** für die Kontext-Runde, und der Basispfad **über zweieinhalb Stunden** —
gegen die Kommunikationslinie „~45 Minuten" (Spec §16 Konsequenz 3: „Kommunikation spricht
von ZEIT (‚~45 Minuten')").

Drei Lesarten, und sie schließen sich aus:
1. Die `effort.minutes` sind zu großzügig geschätzt (5 Min für `a.origin`, 10 für
   `e.statements`, 5 für `c.livedExamples`).
2. Die §16-Startwerte waren zu optimistisch und die Spec-Zeile „~45 Minuten" fällt.
3. `effort.minutes` misst etwas anderes als §16 (Session-Dauer inkl. Lesen und Nachdenken
   gegen reine Antwortzeit) — dann fehlt die Umrechnung, und die Seitenleiste zeigt die
   falsche Zahl.

Das ist keine Mechanik, das ist eine Produktzusage. Es steht als Punkt 1 auf dem
Gegenlese-Blatt.

Nebenbefund gleicher Herkunft: `effort.turns` ist laut §3a der Deckel („George hört auf zu
bohren, wenn `turns` erreicht ist"). Bei den `ask`-Sessions steht er auf 4 — Eröffnung +
2 Nachfragen + Bestätigung geht auf. Bei `d.pairs` steht **1 Zug für 8–12 Paarvergleiche**
(Spec §12.2), bei `f.criteria` **3 Züge für 16–24 Kriterien-Bewertungen**, bei
`e.statements` **4 Züge für 23 Satzanfänge**. Drei Instrumente, die als eine Session gezählt
sind — sauber im Sinne des Session-Vertrags, aber der Deckel `turns` bedeutet dort etwas
anderes als überall sonst.

---

# TEIL 2 — Das Gegenlese-Blatt für David

Zwölf Punkte. Nur Produkt-Geschmack und Produktentscheidungen — nichts aus Teil 1,
das eine Korrektur ohne Rückfrage ist.

## 1 · Alle 68 — die Zeit, die wir versprechen

**Frage:** Die Summe der Session-Minuten ergibt 154 Min im Basispfad (Kapitel A allein
31 Min) — sagen wir dem Kunden künftig diese Zahl, oder rechnen wir die Schätzungen
auf die 45 Minuten herunter, die die Kommunikation verspricht?

- **Empfehlung: die Schätzungen halbieren und „~75 Minuten, in Kapiteln" kommunizieren.**
  Ehrlich genug, um nicht zu enttäuschen, kurz genug, um jemanden anfangen zu lassen —
  und die Kapitel-Anzeige macht klar, dass man aufhören und zurückkommen kann.
- Alternative A: Zahlen so lassen und „~2,5 Stunden Markenarbeit" bewerben — das ist eine
  andere Preis- und Erwartungslage (Beratungsprodukt statt Wizard).
- Alternative B: `effort.minutes` als reine Antwortzeit neu definieren (dann ~55 Min) und
  Lesen/Nachdenken nicht mitzählen.

**Warum du:** Das ist keine Schätzgenauigkeit, sondern das Versprechen auf der Preisseite
und der Grund, warum jemand anfängt oder nicht.

## 2 · `e.statements` — 23 Satzanfänge in 10 Minuten

**Frage:** Bleibt die Manifest-Session ein 23-Zeilen-Block in einem Zug, oder schneiden
wir sie in Gruppen?

- **Empfehlung: in die fünf Gruppen der Spec §8 schneiden („Wir glauben…" ×5,
  Commitment ×5, Energie ×4, Haltung ×5, Versprechen ×4), je Gruppe ein Zug.**
  Der Leitsatz sagt „runterbrechen, bevor jemand zu viel erzählt" — 23 vorbefüllte Zeilen
  auf einmal sind das Gegenteil, und die Session ist mit 10 Min ohnehin die längste im
  ganzen Wizard.
- Alternative A: so lassen, aber die Zahl ins Ziel schreiben (heute steht sie nirgends —
  ein Modell darf sechs Zeilen liefern).
- Alternative B: auf 12 Anfänge kürzen — halbe Arbeit, halbe Zeit, weniger Material fürs
  Manifest.

**Warum du:** Das Instrument „23 Satzanfänge" ist aus den Hawaii-Formularen übernommen —
ob es in einem Chat-Wizard in dieser Länge trägt, ist eine Produkt-, keine Textfrage.

## 3 · `a.facts` — die drei Teilfragen

**Frage:** Bleiben Teamgröße, Alter und Märkte drei nacheinander gestellte Fragen
(`collect`, 2 Min, 3 Züge), oder wird daraus EIN kompaktes Kartenfeld?

- **Empfehlung: EIN Kartenfeld mit drei Zeilen, ein Absenden.** Es sind die einzigen drei
  Fragen im ganzen Wizard, auf die niemand nachdenken muss; sie nacheinander zu stellen,
  macht aus Verwaltung ein Gespräch. Die Startkarte (Spec §2.1) hat für genau diesen Fall
  das Ein-Absenden-Muster.
- Alternative A: so lassen — der `collect`-Typ existiert nur für diese Session und wäre
  sonst toter Vertrag.
- Alternative B: ganz in die Startkarte ziehen und `a.facts` streichen (sie fließt in
  nichts weiter: „berührt 0").

**Warum du:** `collect` wurde in §3 als eigener Session-Typ für genau dieses Feld gebaut —
ihn aufzugeben ist eine Vertragsentscheidung, keine Textkorrektur.

## 4 · `d.admired` — die zwei Beispiele, die eine reale Marke meinen

**Frage:** Wie schreiben wir die beiden Beispiele um, die heute identifizierbare
Unternehmen beschreiben und ihnen im Nachsatz „Umweltpredigt" bzw. „belehrend" attestieren?

- **Empfehlung: das Verhalten behalten, die Herkunft entfernen.** Statt „eine kleine
  Outdoor-Marke aus Schweden" → „ein Hersteller, der seit Jahren dieselbe Reparaturanleitung
  beilegt, statt jedes Jahr eine Kampagne zu machen"; statt „eine Kaffeerösterei in Hamburg"
  → „ein Röster, der auf jede Tüte schreibt, was der Bauer bekommen hat". Die FORM
  (ein Verhalten + was ich nicht kopieren würde) bleibt vollständig erhalten.
- Alternative A: Beispiele bei `d.admired` ganz streichen — der Mensch nennt hier ohnehin
  eine echte Marke, das Beispiel muss nur die STRUKTUR der Antwort zeigen.
- Alternative B: so lassen, weil kein Name fällt.

**Warum du:** Das Beispiel steht im Kunden-Dokument und auf der Abnahme-Seite. Ob wir dort
ein erkennbares Unternehmen mit einem Werturteil zeigen wollen, ist eine Haltungsfrage
für die Marke Pukalani, keine Textfrage.

## 5 · Die deutschen Beispiele — ihr/wir/du und Sie

**Frage:** Halten wir die deutschen Beispiele durchgehend Sie-frei, auch dort, wo das
Beispiel KUNDENANSPRACHE zeigt?

- **Empfehlung: ja, durchgehend Sie-frei.** Heute bricht `ep.keyMessages`: Pfad
  „Neue Marke" schreibt „**Sie** müssen nicht ausziehen", Pfad „Relaunch" im selben Feld
  „In den ersten sechs Wochen zählt nur, dass **ihr** wiederkommt". Zwei Anreden im selben
  Beispielpaar liest sich wie ein Versehen, egal welche richtig ist.
- Alternative A: Sie erlauben, wo das Beispiel Kundentext ist (Hausbesitzer über 60 duzt man
  nicht) — dann beide Pfade auf Sie umstellen und die Regel „George duzt, die Marke darf
  siezen" aufschreiben.
- Alternative B: die Anrede im Beispiel ganz vermeiden (unpersönlich formulieren).

**Warum du:** „George duzt auf Deutsch" ist deine Spracheentscheidung (Spec-Kopf) — ob sie
auch für die Beispiel-INHALTE gilt, die eine fremde Marke spricht, hast du nie entschieden.

## 6 · Die 45 `ask`-Sessions — helfen Beispiele bei reinen Menschenfragen?

**Frage:** Zeigen wir dem Menschen auch bei den Fragen, die nur er beantworten kann
(`a.origin`, `c.discovery1–3`, `d.party`, `e.warmup1`), ein Beispiel — oder ankert das
seine Antwort?

- **Empfehlung: bei `ask` das Beispiel erst NACH der ersten eigenen Antwort anbieten
  („Soll ich zeigen, wie andere darauf geantwortet haben?").** Bei `draft`/`derive` bleibt
  es vorne, weil es dort die Form eines von George geschriebenen Werts zeigt — bei `ask`
  zeigt es die Form einer fremden Lebensgeschichte, und das ist etwas anderes.
  Milos `neverDo` sagt es fast: „never ask people to pick values from a list before they
  have told you a story."
- Alternative A: so lassen — §5a macht Beispiele zur Pflicht, weil die Abnahme-Seite sie
  je Kapitel zeigt; die Abnahme-Seite ist aber NACH der Antwort.
- Alternative B: bei `ask` gar keine Beispiele (spart 45 × 2 Texte in der Pflege).

**Warum du:** Es ist die Abwägung „schneller antworten" gegen „ehrlicher antworten", und
das ist die Kernfrage deines Leitsatzes.

## 7 · Vertagen — die Liste stimmt nicht mit sich selbst

**Frage:** Wo darf man jemanden holen, der gerade nicht am Tisch sitzt?

- **Empfehlung: `f.noGos` raus, `b2.model` + `b2.rule` + `c.livedExamples` rein.**
  Heute darf man die drei VORFRAGEN der Markenarchitektur vertagen, aber nicht die
  Entscheidung, die aus ihnen folgt — und `c.livedExamples` („ein echtes Beispiel je Wert,
  mit Datum, Ort oder Person") kann im Team niemand allein beantworten, ist aber
  nicht vertagbar. Genau dort erfindet jemand eine Antwort, um weiterzukommen.
- Alternative A: Vertagen überall erlauben und die Kapitel-Abnahme das Fehlen einfordern
  lassen (§3a: „das Kapitel kann ohne sie nicht abgenommen werden").
- Alternative B: Vertagen nur bei den drei §3a-Fällen (`a.facts`, `c.conflictRule`,
  `c.teamFilter`) und die B2-Sessions zurücknehmen.

**Warum du:** Vertagen ist der vierte Ausgang, den du am 2026-09-04 angenommen hast —
wo er offensteht, entscheidet, wie oft jemand hängen bleibt statt zu erfinden.

## 8 · `b2.roleOfMaster` intern — und `a.competitors` öffentlich

**Frage:** Nach welcher Regel ist eine Session `internal`?

- **Empfehlung: `a.competitors` auf `internal` heben, `b2.roleOfMaster` auf `public`
  zurück.** Heute reist ein Block mit, der zu NAMENTLICH genannten Wettbewerbern je eine
  Schwäche nennt („schwach: eine Teiglinie für alles") — das ist das Erste, was ein Kunde
  nicht teilen will. Umgekehrt ist „soll die Hauptmarke Vertrauen leihen" eine
  Architektur-Aussage, die im geteilten Dokument gebraucht wird, sobald `b2.rule` (public)
  darauf verweist.
- Alternative A: beides internal — dann ist die Markenarchitektur im Share-Link halb blind.
- Alternative B: `private` einführen (die Stufe existiert im Vertrag und wird nirgends
  benutzt) für alles, was Dritte oder eigene Fehler benennt: `a.competitors`,
  `a.complaints`, `c.discovery2`.

**Warum du:** „Ein Kunde, der seine Marke teilt, teilt nicht seine Beschwerden" ist deine
Formulierung — welche Sätze noch darunter fallen, ist ein Urteil, keine Ableitung.

## 9 · Alle 132 Beispiele — die Welt, die sie zeigen

**Frage:** Bleibt die Beispiel-Welt reines analoges Handwerk und Provinz (Sattlerei,
Hundeschule, Reitstall, Messerschmiede, Zahnarztpraxis, Reetdachdecker), oder mischen wir
die Kundschaft dazu, die branding.supply tatsächlich erreicht?

- **Empfehlung: drei bis vier Kapitel auf digitale/beratende Betriebe umstellen** (etwa
  E/E+ auf ein zweiköpfiges Software-Studio, F auf eine Steuerberatung mit Online-Mandanten).
  In 132 Beispielen kommt heute kein einziges Software-, Agentur-, Studio-, Handels- oder
  Gastronomie-Unternehmen vor; ~37 % sind Werkstatt, ~22 % Tier/Landwirtschaft,
  ~22 % Praxis/Körper. Ein Freelancer, der den Wizard für sein Design-Studio benutzt,
  sieht 30 Beispiele aus Welten, die mit seiner nichts zu tun haben.
- Alternative A: so lassen — die analogen Beispiele sind konkreter, und Konkretheit ist
  genau das, was sie lehren sollen.
- Alternative B: eine dritte Beispiel-Spalte je Session („digital") und die Route wählt
  nach Branche.

**Warum du:** Das ist die Zielgruppen-Frage von branding.supply in Beispielform.

## 10 · Ein Beispielpaar je Session — „fremde Branche" ist heute nicht garantierbar

**Frage:** §3a sagt „immer aus einer anderen Branche als der des Kunden (**die Route wählt**
gegen `startCard.industry`)". Es gibt aber je Session genau EIN Beispiel je Pfad — die Route
hat nichts zu wählen. Bauen wir ein zweites Paar, oder streichen wir die Zusage?

- **Empfehlung: die Zusage streichen und stattdessen die KAPITEL-Branchen bewusst weit
  streuen.** Zwei Beispielpaare je Session sind 264 Texte statt 132 — das ist die teuerste
  aller Lösungen für ein Problem, das ~5 % der Kunden trifft.
- Alternative A: nur die neun Kapitel-Geschichten doppeln (18 statt 9 Betriebe), Session-
  Beispiele folgen automatisch — 132 zusätzliche Texte, aber die Zusage hält.
- Alternative B: bei Kollision (Hundeschule kommt als Hundeschule) das Beispiel unterdrücken
  statt tauschen — der Kunde sieht dann bei ein paar Sessions keins.

**Warum du:** Heute bekommt eine Hundeschule im Kapitel Werte neun Hundeschul-Beispiele
und schreibt sie ab. Das ist genau der Schaden, den die Regel verhindern sollte —
aber die Reparatur kostet ein volles Content-Paket.

## 11 · Kapitel F — Namens-Kandidaten als Beispiel

**Frage:** Zeigen wir bei `f.candidates`/`f.shortlist`/`f.decision` konkrete Namen
(Kolben, Nabe, Sattelfest, Hain, Nordlicht), oder nur die Struktur?

- **Empfehlung: Namen zeigen, aber alle aus EINER offensichtlich fremden Branche und mit
  Typ-Etikett** — so wie heute. Es ist die einzige Session-Gruppe, in der die Form ohne
  Inhalt nichts zeigt. **Aber:** die englische Fassung darf die Namen NICHT übersetzen
  (heute: Kolben→Piston, Nabe→Hub, Hain→Grove, Praxis Ehlerding→Ehlerding Practice,
  Sanitätshaus Krause→Krause Medical Supplies). Ein Name, der mit der Oberflächensprache
  wechselt, lehrt genau das Falsche — und `f.checks` behauptet dadurch zwei verschiedene
  Domains (kolben.de / piston.de) für dieselbe Prüfung.
- Alternative A: Namen durch Platzhalter ersetzen („⟨Kandidat 1⟩ — erfunden") — verliert
  jeden Lerneffekt.
- Alternative B: bei `f.taste` (wo der Mensch echte Marken nennen SOLL) das Etikett
  „erfunden" streichen — es ist dort sachlich falsch.

**Warum du:** Ob ein Namensvorschlag im Beispiel „nur die Form" ist, entscheidet, ob jemand
ihn abschreibt. Das ist eine Produkthaftungs-Anmutung, keine Redaktion.

## 12 · Kapitel C und E — die eingefrorenen Fragen-Pools

**Frage:** Die Spec sieht vor, dass die KI 3 der 7 Discovery-Fragen und 2 der 5
Warmup-Fragen nach Kontext wählt. Gebaut sind fest D1/D2/D3 und W1/W2. Adaptivität
zurückholen oder Spec anpassen?

- **Empfehlung: D7 gegen D3 tauschen, wenn die Team-Weiche auf „2+" steht** — sonst
  einfrieren und die Spec nachziehen. D7 („Wie soll dein Team entscheiden, wenn du nicht
  im Raum bist?") ist die einzige Discovery-Frage, die auf ein Team zielt, und sie fällt
  heute komplett aus. Die übrigen (D4 Lieblingskunden, D5 Prinzipien-Kündigung,
  D6 Lob, W3–W5) sind gute Fragen, aber sie fügen dem, was D1/D2/D3 schon holen,
  wenig hinzu.
- Alternative A: volle Adaptivität wie in der Spec — kostet eine Auswahl-Regel und macht
  die Sessions untereinander unvergleichbar (jede Marke bekommt andere Fragen).
- Alternative B: alles einfrieren, D4–D7 und W3–W5 aus der Spec streichen, damit niemand
  später denkt, es fehle etwas.

**Warum du:** Die Adaptivität war eine deiner Zusagen an die Interviewqualität. Sie still
fallenzulassen ist eine Entscheidung; sie zu bauen kostet eine Auswahlregel je Kapitel.

---

# TEIL 3 — Empfehlung

**Freigabefähig nach fünf konkreten Korrekturen** — die Substanz trägt, die Befunde sind
Reparaturen, nicht Neubauten: (1) `maxProbes` bei den 14 `choose`-Sessions auf 1, damit
die aufgeschriebenen Nachfragen nicht im selben Atemzug verboten sind; (2) Eigennamen in
den englischen Beispielen der 13 Sessions nicht mehr übersetzen (inkl. der Domains in
`f.checks`) und `use:`/`avoid:` in den beiden deutschen Vokabel-Beispielen eindeutschen;
(3) `d.admired` in beiden Pfaden so umschreiben, dass keine reale Marke mehr erkennbar ist,
und `a.competitors` ein Beispiel geben, das nicht selbst das eigene Anti-Muster vorführt;
(4) die sechs deterministischen Regeln als Invarianten setzen — allen voran die in §3a
namentlich zugesagte für `c.conflictRule` — und `form.person` bei den 12 Ableitungen und
Auswahlen von `fromTeam` auf `brand`/`none` stellen; (5) R3 und R4 aus Spec §2.3 ein Zuhause
geben oder sie samt Locale-Schlüsseln streichen, und die Zahl 23 im Ziel von `e.statements`
festschreiben.

Die zwölf Punkte aus Teil 2 sind **nicht** Bedingung der Freigabe, mit einer Ausnahme:
**Punkt 1 (der Umfang) muss vor dem Bau der Seitenleiste entschieden sein** — die
Minuten-Summen sind das, was der Kunde als Erstes sieht, und 154 Minuten im Basispfad
stehen gegen die Kommunikationslinie „~45 Minuten".

Nicht freigabefähig wäre dieses Paket nur, wenn die Qualitätskriterien weich oder die
Anti-Muster leer wären — beides ist nicht der Fall: 0 Befunde in der schärfsten Spalte
über 271 Kriterienzeilen, und die Anti-Muster zitieren die Floskeln, statt sie zu
umschreiben. Das ist die eigentliche Leistung dieses Pakets.
