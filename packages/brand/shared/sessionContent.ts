/**
 * DER INHALT EINER SESSION — Ziel, Qualität, Anti-Muster, Leiter, Form,
 * Beispiele (BW2 Paket 1 + Paket 2, Plan docs/archiv/BRAND-WIZARD-SESSIONS.md
 * §3 + §3a; Inhaltsgrundlage docs/plans/BRAND-WIZARD-CONTENT-SPEC.md).
 *
 * ── WARUM DER INHALT NEBEN DER TABELLE STEHT UND NICHT DARIN ──────────────
 * `slotRegistry.ts` ist eine TABELLE: eine Zeile je Session, auf einen Blick
 * lesbar, und genau daran hängt ihre Prüfbarkeit („Fehler darin sind
 * Tippfehler"). Der Session-INHALT ist das Gegenteil — fünfzehn Zeilen Prosa je
 * Session, mit einem eigenen Pflege-Rhythmus (Paket 2 ist Davids Inhalts-Gate
 * und fasst NUR diese Datei an, die Struktur bleibt unberührt). Beides in einer
 * Datei hiesse: wer ein `required` sucht, blättert durch 1.000 Zeilen Englisch.
 *
 * `defineSession()` führt beides zu EINER `BrandSessionConfig` zusammen — es
 * gibt also weiterhin genau einen Vertrag je Session, nur zwei Ablagen dafür.
 *
 * ── DIESE DATEI HAT KEINE IMPORTE, UND DAS IST ABSICHT ────────────────────
 * Sie trägt deshalb auch die kleinen Wert-TYPEN der Session-Config
 * (`BrandSessionKind`, `BrandInvariant`, Form, Antwortregeln …), die
 * `slotRegistry.ts` re-exportiert. Andersherum wäre es ein Zyklus: die Registry
 * braucht diese Tabelle zur LAUFZEIT, die Tabelle bräuchte die Typen der
 * Registry. Eine Richtung, keine Ausnahme.
 *
 * ── DIE REGELTEXTE SIND ENGLISCH UND GEHEN WÖRTLICH IN DEN PROMPT ─────────
 * Wie in den Prompt-Dateien (Content-Spec §1.2, „sprachneutral formuliert"):
 * sie beschreiben Verhalten, nicht Text. Was der Mensch liest, steht in den
 * Locale-Katalogen; hier steht, was das Modell tun soll.
 *
 * DIE BEISPIELE SIND DIE EINE AUSNAHME und liegen ZWEISPRACHIG vor — dasselbe
 * Muster wie die `openers` in `brandAdvisors.ts` und aus demselben Grund: sie
 * sind Text, kein Verhalten. Sie reisen in den Prompt der INHALTSSPRACHE
 * (`sessionInstruction`, Parameter `contentLocale`) UND auf die Abnahme-Seite
 * je Kapitel (Plan §5a: „Beispiel — das Beispiel aus der Session-Config …
 * je Pfad"), wo ein Mensch sie liest. Ein englisches Beispiel unter einer
 * deutschen Eingabe wäre dort eine Zumutung, und eine Wort-für-Wort-Übersetzung
 * wäre keine gute deutsche Zeile — beide Fassungen sind deshalb eigenständig
 * geschrieben.
 *
 * ── WOFÜR DIE BEISPIELE DA SIND UND WOFÜR NICHT ───────────────────────────
 * Für die FORM, nie für den Inhalt (Plan §3a Nr. 3). Innerhalb eines Kapitels
 * bleibt es bewusst bei EINEM Beispielbetrieb je Pfad: die Werte-Sessions
 * erzählen denselben Betrieb weiter, weil man an einer fortlaufenden Geschichte
 * sieht, wie aus einem Moment ein Wert und daraus eine Definition wird.
 *
 * ── DIE BEISPIELWELT (Davids Entscheidung 2026-09-04, Paket 2b) ───────────
 * Bis dahin war sie geschlossen analog und kleinstädtisch — 37 % Werkstatt,
 * 22 % Tier und Landwirtschaft, kein einziges Software-, Agentur-, Studio-,
 * Gastronomie- oder Personal-Brand-Beispiel (Audit §2.5 f). Ein Freelancer, der
 * den Wizard für sein Designstudio benutzt, sah 30 Beispiele aus Welten, die
 * mit seiner nichts zu tun hatten. Jetzt spielt jedes Kapitel in EINER Branche
 * der Kundschaft, die branding.supply wirklich erreicht, und die neun Kapitel
 * sind bewusst WEIT GESTREUT: ein Kunde aus einer dieser Branchen sieht seine
 * eigene in höchstens EINEM Kapitel (die §3a-Zusage „die Route wählt gegen
 * startCard.industry" ist damit gestrichen — es gibt je Session nur ein
 * Beispielpaar, die Route hatte nie etwas zu wählen).
 *
 *   Kontext (A)        Gastronomie — Tagescafé mit Backstube / Mittagslokal
 *   Purpose/Vision (B) Yoga-Studio — Rückenkurse / Studio seit 2009
 *   Architektur (B2)   Software — Modul-Haus „Steinlach" / SaaS „Meerkamp"
 *   Werte (C)          Coaching — Ernährungsberatung / Personal-Training
 *   Archetyp (D)       Kreativ-Studio — Buchgestaltung / Fotostudio
 *   Manifest (E)       Agentur — zwei Köpfe / Agentur seit 2011
 *   Verbale Identität  Interior Design — kleine Wohnungen / Praxen und Büros
 *   Name (F)           Freelancer — Texterin / Entwickler beim Umbenennen
 *   Ergebnis           Personal Brand — Beratung unter eigenem Namen
 *
 * ZWEI REGELN, DIE MAN NICHT „AUFRÄUMEN" DARF: (1) EIGENNAMEN werden NICHT
 * übersetzt — ein Markenname, der mit der Oberflächensprache wechselt, lehrt
 * genau die Verwechslung, gegen die Baustein F gebaut ist (Kolben/Piston,
 * kolben.de/piston.de: derselbe Kandidat hatte je Sprache eine andere Domain).
 * (2) In Beispielen, in denen die MARKE SPRICHT (Pitch, Purpose, Mission,
 * Manifest, Stimmproben, Boilerplates, Key Messages, Tagline …), kommt KEINE
 * Anrede vor — weder du/ihr noch Sie. Wessen Kundschaft geduzt wird, ist die
 * Entscheidung dieser Marke, nicht unsere; ein Beispielpaar, das auf einem Pfad
 * siezt und auf dem anderen duzt, liest sich wie ein Versehen. Dort, wo George
 * oder der Kunde spricht (Frage-Antworten, Hypothese, Abweichung), bleibt der
 * Wizard-Ton „ihr/wir".
 *
 * ── DIE VERARBEITUNGSREGELN SIND WÖRTLICH DIE ALTEN ───────────────────────
 * `rules`/`pathRules` sind aus `georgePrompt.ts`, `veraPrompt.ts`,
 * `miloPrompt.ts` und `archetypePrompt.ts` WÖRTLICH hierher gezogen — Zeile für
 * Zeile, ohne Umformulierung; Paket 2 hat daran NICHTS geändert.
 * `tests/sessionPrompt.test.ts` hält die alten Texte weiter als Fixture
 * dagegen: jede Zeile von damals (ausser der `TASK:`-Zeile) steht auch im
 * neuen Prompt. Wer hier eine Zeile ändert, ändert einen Prompt und muss die
 * Prompt-Fassung (`*_PROMPT_VERSION`) hochzählen.
 *
 * ── WAS PAKET 2 DAZUGELEGT HAT ───────────────────────────────────────────
 * `quality`, `antiPatterns`, `ladder`, `form`, `examples`, `answers` und
 * `effort` je Session — der Inhalt aus Plan §3a. Weil damit jeder Entwurfs-
 * Auftrag länger geworden ist, sind alle vier Prompt-Fassungen gestiegen
 * (`george-a-12`, `vera-b-3`, `milo-c-3`, `george-archetype-3`).
 *
 * `quality` und `antiPatterns` sind PFLICHTFELDER dieses Typs, nicht optional:
 * eine Session ohne prüfbare Merkmale macht `goalReached` (Plan §7) wieder zu
 * einer Stimmung, und der Compiler ist hier der billigere Wächter als ein Test.
 *
 * ── DIESE DATEI LIEGT IM CLIENT-BÜNDEL ───────────────────────────────────
 * `slotRegistry.ts` wird im Browser gelesen (Navigation, Fortschritt), also
 * reisen diese Texte mit. Das ist der bewusste Preis dafür, dass es EINEN
 * Session-Vertrag gibt und nicht einen für den Server und einen für die
 * Anzeige (Plan §3) — und seit §5a ist es kein reiner Preis mehr: die
 * Abnahme-Seite BRAUCHT Beispiel, Ziel und Bereich im Browser. Wird es je eng,
 * ist die Antwort ein serverseitiger Nachlade-Weg für `processing.rules`
 * (die einzige Gruppe, die nur das Modell liest), nicht ein zweiter Vertrag.
 */

/** Die sechs Arbeitsformen einer Session (Plan §3). */
export type BrandSessionKind =
  /** F: eine Menschenfrage — George fragt, hört, spiegelt. */
  | 'ask'
  /** F, mehrteilig: sammelt N Teile nacheinander (heute nur `a.facts`). */
  | 'collect'
  /** A: Auswahl aus Registry-Optionen, ggf. mit Empfehlung. */
  | 'choose'
  /** K: George leitet ab, der Mensch bestätigt oder korrigiert. */
  | 'derive'
  /** K→B: George entwirft, redigiert wird auf der Bühne. */
  | 'draft'
  /** Eigenes Werkzeug (`d.pairs`); interim läuft es als `derive`. */
  | 'instrument'

/**
 * MINDEST-SUBSTANZ IN DREI STUFEN (Plan §16, stillschweigend angenommen):
 * 68 Zeichen-Zahlen ohne Massstab pflegt niemand. Wer für eine einzelne
 * Session eine Zahl braucht, ergänzt sie dort; die Stufe bleibt der Default.
 */
export type BrandSessionSubstance = 'short' | 'medium' | 'long'

/** Was bei dünnen, überlangen oder ausbleibenden Antworten gilt (Plan §3). */
export interface BrandSessionAnswers {
  readonly minSubstance: BrandSessionSubstance
  /** Wie oft George nachfragt, bevor er den Stand annimmt. */
  readonly maxProbes: 0 | 1 | 2
  /** Ist „weiss ich nicht" eine gültige Antwort? (dann: Hypothese anbieten) */
  readonly allowUnknown: boolean
  /**
   * VERTAGEN als vierter Ausgang (Plan §3a): manche Sessions brauchen jemanden,
   * der gerade nicht am Tisch sitzt. Ohne diesen Ausgang erfindet der Mensch
   * eine Antwort, um weiterzukommen.
   */
  readonly allowDefer: boolean
}

/** Regeln, die der WERT selbst einhalten muss (Plan §3a Nr. 5). */
export interface BrandSessionForm {
  /** `'fromTeam'` = folgt der Weiche W3 (Solo/Team), wo die Person nicht fest ist. */
  readonly person: 'we' | 'I' | 'brand' | 'none' | 'fromTeam'
  readonly tense: 'present' | 'future' | 'any'
  /** Wortdeckel, enger als der Zeichen-Deckel. `null` = keiner. */
  readonly maxWords: number | null
  /** Was im Wert nie vorkommen darf (Markenname im Purpose, Zahlen in der Vision …). */
  readonly forbidden: readonly string[]
}

/** Die Interviewführung DIESER einen Session (Plan §3a Nr. 4). */
export interface BrandSessionLadder {
  /** Womit George öffnet — die Absicht, nicht der Wortlaut (der steht im Locale-Katalog). */
  readonly opening: string
  /** Nachfrage 1 und 2, je nachdem WIE dünn die Antwort war. */
  readonly probes: readonly string[]
  /** Umdeutung, wenn die Antwort in ein bekanntes Anti-Muster fällt. */
  readonly reframes: readonly string[]
}

/**
 * Die Beispiele EINES Pfades, je Oberflächen-Sprache (s. Kopf). Beide Fassungen
 * sind eigenständig geschrieben, keine Übersetzung voneinander.
 */
export interface BrandSessionExampleSet {
  readonly de: readonly string[]
  readonly en: readonly string[]
}

/**
 * 1–2 erfundene starke Werte je Pfad, IMMER aus einer fremden Branche
 * (Plan §3a Nr. 3) — für die FORM, nie für den Inhalt. Wo es keine gibt: leer.
 */
export interface BrandSessionExamples {
  readonly new: BrandSessionExampleSet
  readonly relaunch: BrandSessionExampleSet
}

/** Was der Mensch vorher über den Umfang erfährt (Plan §3a Nr. 8). */
export interface BrandSessionEffort {
  readonly minutes: 1 | 2 | 3 | 5 | 10
  /** George hört auf zu bohren, wenn diese Zahl erreicht ist. */
  readonly turns: number
}

/**
 * Was per Share-Link und Export standardmässig NICHT reist (Plan §3a Nr. 7).
 * Ein Kunde, der seine Marke teilt, teilt nicht seine Beschwerden.
 */
export type BrandSessionSensitivity = 'public' | 'internal' | 'private'

/**
 * DETERMINISTISCHE PRÜFUNGEN, IM CODE (Plan §3a Nr. 6).
 *
 * Eine Regel, die ein Test prüfen kann, wird nicht der KI überlassen — sie ist
 * billiger, schneller und lügt nie. Geprüft wird beim Bestätigen
 * (`transitionBrandStep`), ein Verstoss ist `invariant_violated`.
 */
export type BrandInvariantKind =
  | 'subsetOf'
  | 'memberOf'
  | 'sentenceOf'
  | 'count'
  | 'mentionsNone'
  /**
   * DER WERT NENNT EINTRÄGE EINER QUELL-LISTE BEIM NAMEN (Paket 2b, Audit
   * Teil 3 Nr. 4). Ohne `min` müssen ALLE Einträge vorkommen („je Wert eine
   * Zeile, keiner fehlt"), mit `min` mindestens so viele („nennt zwei ihrer
   * eigenen Werte").
   *
   * ── WARUM NICHT „NUR Werte aus der Liste" ────────────────────────────────
   * §3a formuliert die Regel als Verbot („c.conflictRule nennt NUR Werte aus
   * c.final"). Ein Verbot ist auf FREIEM Text nicht entscheidbar: um zu sehen,
   * dass jemand einen FREMDEN Wert genannt hat, müsste die Prüfung wissen,
   * welche Wörter im Satz überhaupt Werte sind — und diese Liste gibt es
   * nirgends. Prüfbar ist die andere Hälfte derselben Zusage, und sie steht
   * wörtlich im Qualitätsmerkmal: dass die eigenen Werte vorkommen. Was ein
   * Test nicht entscheiden kann, bleibt beim Spezialisten (§7).
   */
  | 'mentionsFrom'
  /**
   * DER WERT IST EINE FARBE (`#rrggbb`) — Brand Design D3.
   *
   * Die einzige Invariante ohne Quell-Slot und ohne Zahl: sie prüft die FORM
   * eines Wertes, nicht sein Verhältnis zu einem anderen. Nötig, weil `h.base`
   * und `h.accent` als `text` gespeichert werden und die Bühne ein
   * Korrigieren-Feld hat — ein dort hineingeschriebener Satz stünde sonst
   * bestätigt im Slot, und `buildBrandDesign` gäbe von da an stumm `null`
   * zurück (die ganze Farbwelt wäre weg, ohne dass irgendwo etwas rot würde).
   */
  | 'hex'
  /**
   * DER WERT IST EINE ID AUS EINER GESCHLOSSENEN MENGE (`terms`) — Brand
   * Design D4.
   *
   * Die zweite Invariante ohne Quell-Slot (wie `hex`): die Menge steht nicht
   * in einem anderen Feld, sondern in einem KATALOG des Layers
   * (`BRAND_FONT_PAIRS`, `BRAND_TYPE_SCALES`). `memberOf` kann das nicht — es
   * liest seine erlaubten Werte aus dem Wert eines anderen Slots, und einen
   * solchen Slot gibt es hier nicht.
   *
   * Nötig aus demselben Grund wie `hex`: `i.pair` und `i.scale` sind
   * ANZEIGE-lose Ids, die Bühne hat ein Korrigieren-Feld, und ein dort
   * hineingeschriebener Satz stünde sonst bestätigt im Slot — `buildBrandDesign`
   * gäbe von da an stumm `null` zurück (die ganze Typografie wäre weg, ohne
   * dass irgendwo etwas rot würde).
   */
  | 'oneOf'

export interface BrandInvariant {
  readonly kind: BrandInvariantKind
  /**
   * Quell-Slot — MUSS in der Registry VOR dieser Session stehen. Bei
   * `mentionsNone` ist er OPTIONAL und ergänzt `terms` um die Einträge des
   * Quell-Werts (so wird aus „nennt keines dieser Wörter" ohne neue
   * Invarianten-Art auch „ist nicht dasselbe wie dort"); bei `hex` und
   * `oneOf` gibt es ihn nicht (beide prüfen die FORM eines Wertes).
   */
  readonly of?: string
  readonly min?: number
  readonly max?: number
  readonly terms?: readonly string[]
}

/**
 * DIE ÜBERSCHREIBBAREN FELDER je Session. Alles, was hier fehlt, bekommt den
 * mechanischen Default aus `defineSession()` — 68 vollständige Datensätze von
 * Hand wären 68 Chancen, einen Default zu vergessen.
 *
 * `goal`, `quality` und `antiPatterns` sind Pflicht (s. Kopf).
 */
export interface BrandSessionContent {
  /** ZIEL — ein Satz, was am Ende feststehen muss. Pflicht für jede Session. */
  readonly goal: string
  /** 3–5 PRÜFBARE Merkmale eines guten Werts — je eines mit Ja/Nein zu beantworten. */
  readonly quality: readonly string[]
  /** 2–3 konkrete Muster, die der Spezialist zurückweist. */
  readonly antiPatterns: readonly string[]
  /** Die Interviewführung — nur bei `ask`/`collect`/`choose`. */
  readonly ladder?: BrandSessionLadder
  /** Beispiele je Pfad und Sprache (s. Kopf). */
  readonly examples?: BrandSessionExamples
  /** Wie Antworten eingeordnet werden — wörtlich in den Prompt. */
  readonly rules?: readonly string[]
  /** Regeln, die NUR auf einem Pfad gelten (heute: `d.hypothesis`, `d.gapReveal`). */
  readonly pathRules?: { readonly new?: readonly string[], readonly relaunch?: readonly string[] }
  /** Die Teile einer `collect`-Session, in Frage-Reihenfolge. */
  readonly parts?: readonly string[]
  /** Liest diese Session die Startkarte als primäre Quelle? (Default: Baustein A) */
  readonly startCard?: boolean
  /** Nennt der Auftrag den Website-Text? (Default: nein) */
  readonly siteAnalysis?: boolean
  readonly sensitivity?: BrandSessionSensitivity
  /** Abweichungen von den Antwort-Regeln der Arbeitsform. */
  readonly answers?: Partial<BrandSessionAnswers>
  /** Abweichender Umfang — sonst gilt der Wert der Arbeitsform. */
  readonly effort?: BrandSessionEffort
  readonly invariants?: readonly BrandInvariant[]
  readonly form?: Partial<BrandSessionForm>
}

// ── Regeltexte, die MEHRERE Sessions teilen ────────────────────────────────
// Sie stehen hier und nicht bei den Sessions, weil sie wörtlich in mehreren
// Aufträgen vorkommen: zwei Fassungen desselben Prüfsteins wären zwei
// Qualitätsschwellen, und die Abweichung sähe man nur am Ergebnis.

/** Veras Schwelle, wörtlich — der Satz, der jeden PVM-Entwurf tragen muss. */
export const VERA_COMPETITOR_TEST
  = 'Before you write it down, hold the sentence against one test: could any competitor in this industry '
    + 'say exactly this, word for word? If yes, it is not their sentence yet — write the version only this '
    + 'brand can say, using something concrete from the inputs.'

/** Was in KEINEN der drei PVM-Sätze gehört (Content-Spec §5, Lehrblock teach.pvm). */
export const PVM_BANNED
  = 'Banned: "world-class", "innovative", "passionate", "leading", "synergy", "holistic", "solutions" as a '
    + 'noun, and any sentence built only from such words. No superlatives you cannot back with something '
    + 'in the inputs.'

/**
 * Wie viele Werte-Kandidaten. §6/03 §7 grenzt danach auf 3–5 ein — weniger als
 * fünf Kandidaten wäre keine Auswahl, mehr als sieben keine Liste mehr.
 */
export const MILO_CANDIDATE_RANGE = { min: 5, max: 7 } as const

/**
 * WIE VIELE SATZANFÄNGE DAS MANIFEST-INSTRUMENT HAT (Content-Spec §8: fünf
 * Gruppen — „Wir glauben…" ×5 · Commitment ×5 · Energie ×4 · Haltung ×5 ·
 * Versprechen ×4).
 *
 * Sie steht seit Paket 2b IM ZIEL und in einem Qualitätsmerkmal (Davids
 * Entscheidung 2026-09-04, Audit Teil 3 Nr. 5): der Block bleibt EIN Zug, aber
 * die Zahl darf nicht nur in der Spec stehen. Vorher nannte sie weder Ziel
 * noch Qualität noch Invariante — ein Modell, das sechs Zeilen lieferte,
 * verletzte keine einzige geschriebene Regel.
 *
 * KEINE Invariante daraus: der Wert ist ein `richtext`-Entwurf, den der Mensch
 * auf der Bühne redigiert, und ein 409 auf „nur 21 Zeilen" hielte ihn von
 * seinem eigenen Feld fern.
 */
export const MANIFESTO_STATEMENT_COUNT = 23

/** Der Satz über das leere Paarvergleich-Feld — wörtlich in beiden Auswahl-Aufträgen. */
export const ARCHETYPE_PAIRS_PENDING
  = 'The field d.pairs is the pair-comparison instrument and it does not exist yet, so it is empty for '
    + 'everyone. Its emptiness says NOTHING about this brand: do not read it as a refusal, a preference '
    + 'or a gap in their answers, and never mention it to them.'

/** Die Zwei-Kandidaten-Regel — die Stelle, an der das Modell NICHT entwirft. */
export const ARCHETYPE_TWO_CANDIDATES_RULE
  = 'IF TWO ARCHETYPES ARE REALISTICALLY IN PLAY — if you could argue for either one from the same '
    + 'evidence — do NOT draft. Ask instead: use the QUESTION form, name the two in your own words, say '
    + 'which one you lean towards and why in one sentence, and append one OPTION line per archetype so '
    + 'they can pick with a click. Choosing between two defensible readings is theirs to do, not yours.'

/** Prosa und Wert meinen denselben Archetyp (`george-archetype-2`, Live-Fund 2026-09-04). */
export const ARCHETYPE_COHERENCE_RULE
  = 'YOUR PROSE AND YOUR DRAFT VALUE MUST NAME THE SAME ARCHETYPE. In the prose, call it by its '
    + 'catalogue name (the labels of the twelve options below) — never argue for one archetype and '
    + 'store another. The conversation may have used informal names that are not in the catalogue (a '
    + 'craftsman, a host): map such a name to the closest catalogue archetype and say the mapping out '
    + 'loud in your BASIS line, e.g. that what you both called the craftsman is the Creator of the '
    + 'catalogue. Never store an informal name.'

/**
 * KURZFORM FÜR DEN REGELFALL: je Pfad EIN Beispiel, je Sprache eines.
 *
 * Zwei Beispiele sind erlaubt (Plan §3a Nr. 3) und stehen dann als volles
 * Objekt da — die Kurzform deckt den Normalfall, damit 68 Einträge nicht aus
 * 340 Zeilen Klammern bestehen.
 */
function pathExamples(
  fresh: { de: string, en: string },
  relaunch: { de: string, en: string },
): BrandSessionExamples {
  return {
    new: { de: [fresh.de], en: [fresh.en] },
    relaunch: { de: [relaunch.de], en: [relaunch.en] },
  }
}

/**
 * DIE 68 SESSIONS. Reihenfolge wie im Katalog — die Registry prüft, dass hier
 * genau ihre Ids stehen (kein verwaister Eintrag, keine Session ohne Ziel).
 */
export const SESSION_CONTENT: Readonly<Record<string, BrandSessionContent>> = {
  // ── A · Kontext ─────────────────────────────────────────────────────────
  // Beispiel-Betriebe dieses Kapitels: Tagescafé mit eigener Backstube (neue
  // Marke) / Mittagslokal seit 1998 (Relaunch).
  'a.pitch': {
    goal: 'draft the elevator pitch of this brand: what they do, who it is for, and what is different '
      + 'about it, in two or three sentences.',
    quality: [
      'Someone from outside the industry understands it after reading it once.',
      'It names who it is for, not only what is made.',
      'It carries at least one detail that comes from this brand and not from its industry.',
      'No sentence of it could be moved to a competitor page unchanged.',
    ],
    antiPatterns: [
      'A list of services instead of a sentence about what the customer gets.',
      'Superlatives with nothing behind them: leading, innovative, world-class.',
      'Trade jargon that only insiders can decode.',
    ],
    form: { person: 'we', tense: 'present', maxWords: 60 },
    examples: pathExamples(
      {
        de: 'Wir sind ein Tagescafé mit eigener Backstube: Das Brot vom Vortag geht mittags in die Suppe, '
          + 'weggeworfen wird nichts. Für Leute, die zwischen zwei Terminen zwanzig Minuten sitzen und '
          + 'trotzdem etwas Warmes essen wollen.',
        en: 'We are a daytime café with our own bakery: yesterday\'s bread goes into the midday soup, and '
          + 'nothing is thrown out. For people who want to sit for twenty minutes between two appointments '
          + 'and still eat something warm.',
      },
      {
        de: 'Wir kochen seit 1998 einen Mittagstisch für die Werkstätten und Büros im Viertel — zwei Gerichte '
          + 'am Tag, eines davon ohne Fleisch. Wer um halb eins kommt, sitzt um zehn nach eins wieder '
          + 'draußen.',
        en: 'Since 1998 we have cooked a midday menu for the workshops and offices in this quarter — two '
          + 'dishes a day, one of them meat-free. Whoever arrives at half past twelve is back outside by ten '
          + 'past one.',
      },
    ),
    rules: [
      'Work from the start card: "what they do" and "who it is for" are the person\'s own words — keep their '
      + 'substance, sharpen the wording.',
      'Two to three sentences, plain language, no superlatives and no marketing noise. '
      + 'Say what they do, who it is for, and what makes it different.',
    ],
  },
  'a.category': {
    goal: 'name the industry / category this brand plays in, normalised to a term the industry itself uses.',
    quality: [
      'Five words at most.',
      'It is a term the person would find in a trade directory.',
      'It excludes at least half of what a word like "agency" or "shop" would include.',
      'It says what they DO — the shelf they are compared on comes later.',
    ],
    antiPatterns: [
      'A slogan in place of a category: "we make things people love".',
      'A word so broad that every company fits: services, consulting, solutions.',
      'An invented category nobody is looking for.',
    ],
    form: { person: 'none', tense: 'present', maxWords: 5 },
    examples: pathExamples(
      {
        de: 'Tagescafé mit eigener Backstube',
        en: 'Café with its own bakery',
      },
      {
        de: 'Mittagstisch für Betriebe im Viertel',
        en: 'Midday canteen for local businesses',
      },
    ),
    rules: [
      'The start card carries their own answer to "industry" — normalise THAT, do not replace it with a '
      + 'category you would have picked.',
      'One line, at most five words. "Software agency for online shops" — not "we build stuff".',
    ],
  },
  'a.competitors': {
    goal: 'write 3-5 short competitor profiles.',
    quality: [
      'Every name in the list appears literally in the inputs.',
      'Each line carries one strength and one weakness, both of them things a customer would notice.',
      'Anything you could only infer is marked as an assumption in the line itself.',
      'The weakness is a fact about the offer, not a judgement about the company.',
    ],
    antiPatterns: [
      'Invented competitors that merely sound plausible for the industry.',
      'Filler such as "not stated in the inputs" instead of a point.',
      'A strength and a weakness that are the same sentence in two moods.',
    ],
    form: { person: 'none', tense: 'present' },
    // INTERN (Davids Entscheidung 2026-09-04, Audit Punkt 8): der Block nennt
    // NAMENTLICH Dritte und zu jedem eine Schwäche. „Ein Kunde, der seine Marke
    // teilt, teilt nicht seine Beschwerden" (Plan §3a Nr. 7) gilt erst recht für
    // sein Urteil über den Nachbarn — heute reiste es per Share-Link mit.
    sensitivity: 'internal',
    examples: pathExamples(
      {
        de: '- (Name aus den Eingaben) — stark: mittags in elf Minuten am Tisch — schwach: dieselbe Karte '
          + 'seit Jahren',
        en: '- (name from the inputs) — strong: lunch on the table in eleven minutes — weak: the same menu '
          + 'for years',
      },
      {
        de: '- (Name aus den Eingaben) — Annahme, bitte prüfen: nach 14 Uhr gibt es nichts Warmes mehr',
        en: '- (name from the inputs) — assumption, please verify: nothing hot is served after two in the '
          + 'afternoon',
      },
    ),
    siteAnalysis: true,
    rules: [
      'USE ONLY names that appear literally in the inputs below — named by the person or linked from their '
      + 'own site. Do NOT invent competitors, do NOT add companies you happen to know, do NOT guess from the '
      + 'industry named in the start card. If fewer than three names are given, return only those and say '
      + 'nothing about the missing ones. If no name is given at all, return a single entry saying that no '
      + 'competitor was named yet.',
      'One line per competitor, in this shape: "- <name> - strong: <one point> - weak: <one point>".',
      // B6: „steht nicht in den Eingaben" war als Steckbrief-Inhalt wertlos — der
      // Mensch bekam drei Zeilen Füllung. Eine GEKENNZEICHNETE Annahme ist eine
      // Aussage, die er prüfen kann; ein erfundener NAME bleibt verboten, weil er
      // sich nicht prüfen, sondern nur glauben lässt.
      'A point you can only infer — rather than read in the inputs — is allowed, but it must be marked in '
      + 'the line itself, in this shape: "- <name> - assumption, please verify: <the point>". Never write '
      + 'filler such as "not stated in the inputs": either say something checkable, or leave the point out.',
    ],
  },
  'a.audienceSketch': {
    goal: 'sketch the audience of this brand: who they are, what they want, and what holds them back.',
    quality: [
      'Each block says what these people are trying to get done, not how old they are.',
      'What holds them back is a real obstacle, not their ignorance of this brand.',
      'Three blocks at most — a brand that serves everyone serves nobody.',
      'Someone who takes the calls would recognise these people from the description.',
    ],
    antiPatterns: [
      'Demographics standing in for a need: "women, 30 to 45, urban".',
      'An audience described as "everyone who needs what we do".',
      '"They do not know us yet" as the obstacle.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: '## Wer\nLeute aus den Büros zwei Straßen weiter, die mittags raus wollen\n\n## Was sie '
          + 'wollen\nIn zwanzig Minuten etwas Warmes, ohne vorher zu bestellen\n\n## Was sie bremst\nDie '
          + 'Sorge, um halb eins keinen Platz mehr zu bekommen',
        en: '## Who\nPeople from the offices two streets away who want to get out at lunchtime\n\n## What '
          + 'they want\nSomething warm within twenty minutes, without ordering ahead\n\n## What holds them '
          + 'back\nThe worry that there will be no table left at half past twelve',
      },
      {
        de: '## Wer\nHandwerker auf dem Weg zur nächsten Baustelle\n\n## Was sie wollen\nEin Essen, das satt '
          + 'macht und nicht nach Diät aussieht\n\n## Was sie bremst\nDer Eindruck, mit staubiger Hose hier '
          + 'fehl am Platz zu sein',
        en: '## Who\nTradespeople on the way to the next building site\n\n## What they want\nA meal that '
          + 'fills them up and does not look like a diet\n\n## What holds them back\nThe sense that dusty '
          + 'work trousers are out of place here',
      },
    ),
    rules: [
      'The start card\'s "who it is for" is the seed — unfold it, do not overwrite it.',
      'One block per audience, at most three blocks. Use these labels: "Who", "What they want", '
      + '"What holds them back". Concrete over demographic: what these people are trying to get done.',
    ],
  },
  'a.toneAnalysis': {
    goal: 'analyse the tone of the existing texts contained in the inputs below.',
    quality: [
      'Every trait carries a short phrase quoted from their own texts.',
      'Three to five traits, no more.',
      'It describes how they sound TODAY, not how they ought to sound.',
      'A reader could find the quoted phrase on their site.',
    ],
    antiPatterns: [
      'A trait with no quote behind it.',
      'Advice about how the brand should sound instead of a reading of how it does.',
      'A tone analysis written although no existing text was given.',
    ],
    form: { person: 'none', tense: 'present', maxWords: 70 },
    examples: pathExamples(
      {
        de: 'Knapp und ohne Werbung — „Brot vom Vortag geht in die Suppe." Viel Handwerk, keine Adjektive. '
          + 'Distanziert: die Seite spricht niemanden direkt an.',
        en: 'Short and free of advertising — "yesterday\'s bread goes into the soup". A lot of craft, no '
          + 'adjectives. Distant: the site never addresses anyone directly.',
      },
      {
        de: 'Werbend bis laut — „Der beste Mittagstisch der Stadt." Viele Superlative, und nirgends steht, '
          + 'was tatsächlich auf der Karte steht.',
        en: 'Advertising, verging on loud — "the best midday menu in town". Plenty of superlatives, and '
          + 'nowhere does it say what is actually on the menu.',
      },
    ),
    siteAnalysis: true,
    rules: [
      'Name three to five tonal traits and quote a short phrase from the inputs for each one. '
      + 'If the inputs contain no existing brand texts, say exactly that in one sentence and stop — '
      + 'do not analyse a tone you cannot see, and do not describe how the brand SHOULD sound.',
    ],
  },
  'a.origin': {
    goal: 'capture why this brand was started — or, on a relaunch, what about the current brand must '
      + 'survive the relaunch.',
    quality: [
      'It names a concrete trigger: a moment, a job, a person, a year.',
      'It says which problem was unbearable enough to act on.',
      'It is told as something that happened, not as a mission statement.',
      'On a relaunch it names one thing that must stay and one that goes, each with a reason.',
    ],
    antiPatterns: [
      'A founding myth polished into marketing: "we saw an opportunity in a growing market".',
      'A curriculum vitae instead of a reason.',
      'On a relaunch: "everything has to change", without one thing worth keeping.',
    ],
    ladder: {
      opening: 'the smallest concrete thing — the moment or the job that started it.',
      probes: [
        'what happened right before that, and what was the last straw?',
        'who else was in the room, and what did they say?',
      ],
      reframes: [
        'if the answer is a market opportunity, ask what personally annoyed them about the way it was done before',
        'if the answer is a career history, ask which single job made them think: never again like that',
      ],
    },
    answers: { minSubstance: 'long', maxProbes: 2 },
    effort: { minutes: 2, turns: 4 },
    examples: pathExamples(
      {
        de: 'Drei Jahre habe ich in einer Kantine gekocht und jeden Abend zwei Bleche Brot in die Tonne '
          + 'geworfen. An dem Abend, an dem ich den Sack nicht mehr zubinden wollte, habe ich gekündigt und '
          + 'den Laden hier gemietet.',
        en: 'For three years I cooked in a staff canteen and threw two trays of bread into the bin every '
          + 'evening. On the evening I could not bring myself to tie up the bag again, I quit and rented this '
          + 'place.',
      },
      {
        de: 'Bleiben muss der Name und die blaue Tafel neben der Tür — daran findet uns die Nachbarschaft '
          + 'seit 1998. Weg muss das Wort „Gaststätte": es holt niemanden mehr herein, der unter vierzig ist.',
        en: 'The name stays, and the blue board next to the door — the neighbourhood has found us by it since '
          + '1998. What goes is the word "Gaststätte": nobody under forty walks in because of it.',
      },
    ),
  },
  'a.customerPraise': {
    goal: 'capture the sentence their happiest customers say about them, in the words the customers use.',
    quality: [
      'It is one sentence a customer actually said, in that customer\'s words.',
      'It is specific enough that another company could not have received it.',
      'It praises a behaviour or a moment, not a product feature.',
      'It could be printed with quotation marks around it.',
    ],
    antiPatterns: [
      'A summary of feedback: "customers value our reliability".',
      'A review rewritten in company voice.',
      'A star rating with no sentence in it.',
    ],
    ladder: {
      opening: 'one sentence, verbatim, the way a customer said it.',
      probes: [
        'when did you last hear it, and what had just happened?',
        'who said it, and what were they reacting to?',
      ],
      reframes: [
        'if the answer summarises many customers, ask for the last single person who said something',
        'if the answer is a feature, ask for the moment where that feature mattered to someone',
      ],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: '„Ihr seid die Einzigen, die mir nicht das letzte Stück Kuchen aufschwatzen, wenn es schon '
          + 'trocken ist."',
        en: '"You are the only ones who do not talk me into the last piece of cake when it has already gone '
          + 'dry."',
      },
      {
        de: '„Bei euch weiß ich um halb eins, dass ich um eins wieder auf der Baustelle stehe."',
        en: '"With you I know at half past twelve that I will be back on site by one."',
      },
    ),
  },
  'a.complaints': {
    goal: 'capture the complaints and negative feedback this brand actually gets, unvarnished.',
    quality: [
      'It quotes or paraphrases a complaint that was really made.',
      'It is uncomfortable enough that no marketing page would print it.',
      'It says what triggered the complaint, not only the mood it arrived in.',
      'It does not excuse itself in the same breath.',
    ],
    antiPatterns: [
      'A humblebrag: "we are sometimes too thorough".',
      '"We have no complaints."',
      'A complaint blamed entirely on the customer.',
    ],
    ladder: {
      opening: 'the last complaint they actually received, in the words it arrived in.',
      probes: [
        'what had happened right before that call or that mail?',
        'is that a one-off, or does it come back every few months?',
      ],
      reframes: [
        'if the answer is a humblebrag, ask what the angriest customer of the last year said',
        'if the answer is "none", ask what people quietly stop doing instead of complaining',
      ],
    },
    sensitivity: 'internal',
    examples: pathExamples(
      {
        de: '„Zweimal hintereinander war um 13 Uhr die Suppe alle, und auf der Tafel stand sie noch."',
        en: '"Twice in a row the soup was gone by one o\'clock, and it was still up on the board."',
      },
      {
        de: '„Seit die Karte geändert wurde, gibt es nichts mehr, was mein Vater essen kann — gesagt hat uns '
          + 'das niemand."',
        en: '"Since the menu changed there is nothing my father can eat, and nobody told us in advance."',
      },
    ),
  },
  'a.oneThing': {
    goal: 'capture the one thing they wish every customer knew about them.',
    quality: [
      'It is one thing, not a list.',
      'It is something customers demonstrably do not know today.',
      'Knowing it would change a decision a customer makes.',
      'It is checkable, not a claim about attitude.',
    ],
    antiPatterns: [
      'A slogan: "that we really care".',
      'Three things joined by commas.',
      'Something their own front page already says.',
    ],
    ladder: {
      opening: 'the one sentence they wish every customer already knew.',
      probes: [
        'what do people get wrong about you again and again?',
        'what would be different for a customer who knew it before the first call?',
      ],
      reframes: [
        'if the answer is a claim about attitude, ask for the fact behind it',
        'if there are three, ask which one costs them the most misunderstandings',
      ],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: 'Dass wir das Brot am selben Morgen backen und nach 15 Uhr zum halben Preis abgeben, statt es '
          + 'wegzuwerfen.',
        en: 'That we bake the bread the same morning and sell it at half price after three instead of '
          + 'throwing it away.',
      },
      {
        de: 'Dass jedes zweite Gericht ohne Fleisch ist — auf der Tafel steht das seit zwanzig Jahren nicht. '
          + 'Dass jedes zweite Gericht ohne Fleisch ist — auf der Tafel steht das seit zwanzig Jahren nicht.',
        en: 'That every second dish is meat-free — the board has never said so in twenty years.',
      },
    ),
  },
  'a.challenge': {
    goal: 'capture the biggest obstacle standing in front of this brand right now.',
    quality: [
      'It names one obstacle, and it is the one actually in the way this month.',
      'It is specific enough to say what would have to change.',
      'It is honest about their own part in it.',
      'It is more than "we need more customers".',
    ],
    antiPatterns: [
      '"The economy" or "the market", with nothing in it they control.',
      'A goal dressed up as an obstacle: "growing to ten people".',
      'A list of five problems.',
    ],
    ladder: {
      opening: 'the one thing that is actually in the way right now.',
      probes: [
        'what did it stop you from doing in the last four weeks?',
        'what would have to be true for it to be gone?',
      ],
      reframes: [
        'if the answer is the market, ask what they would change tomorrow if they could',
        'if the answer is a goal, ask what stands between them and it',
      ],
    },
    sensitivity: 'internal',
    examples: pathExamples(
      {
        de: 'Zwischen 11 und 14 Uhr platzen wir, den Rest des Tages steht die Backstube still — die zweite '
          + 'Kraft bekommen wir aber nur ganztags.',
        en: 'Between eleven and two we burst at the seams, and the rest of the day the bakery stands still — '
          + 'but the second baker is only available full time.',
      },
      {
        de: 'Die Stammgäste sind mit uns in Rente gegangen. Die neuen Büros im Viertel bestellen mittags beim '
          + 'Lieferdienst.',
        en: 'Our regulars retired when we got older. The new offices in the quarter order lunch from a '
          + 'delivery service.',
      },
    ),
  },
  'a.facts': {
    goal: 'collect the plain facts of this brand: how big the team is, how long it has existed and which '
      + 'markets it serves.',
    quality: [
      'Every part carries a number or a plain "not yet".',
      'The team size counts the people who actually work in it, freelancers named as such.',
      'The age is a year, not "for a long time".',
      'The markets are named places or channels where money actually came in.',
    ],
    antiPatterns: [
      '"A small, dedicated team" instead of a number.',
      '"Since forever" instead of a year.',
      '"Worldwide" for a business that ships inside one country.',
    ],
    ladder: {
      opening: 'three quick facts, one at a time: team, age, markets.',
      probes: [
        'does that number include freelancers and part-timers?',
        'in which of those markets did you actually sell something last year?',
      ],
      reframes: [
        'if a number is missing, offer the range you can read from the inputs and ask for a yes or no',
        'if the answer is "worldwide", ask for the three places the money really comes from',
      ],
    },
    // Drei Teile, nicht vier: der Content-Spec §4 nennt „Zahlen: Teamgrösse,
    // Alter, Märkte", die Frage im Katalog stellt genau diese drei.
    parts: ['teamSize', 'age', 'markets'],
    sensitivity: 'internal',
    // Vertagen, weil die Zahlen oft im Steuerbüro oder beim Partner liegen —
    // ohne diesen Ausgang schätzt jemand, und eine geschätzte Teamgrösse steht
    // danach als Tatsache im Dokument.
    answers: { minSubstance: 'short', allowDefer: true },
    effort: { minutes: 1, turns: 3 },
    examples: pathExamples(
      {
        de: 'Team: 3 fest, 1 Aushilfe am Wochenende · Seit: 2023 · Märkte: das Viertel und ein Stand auf dem '
          + 'Wochenmarkt',
        en: 'Team: 3 permanent, 1 weekend helper · Since: 2023 · Markets: this quarter and a stall at the '
          + 'weekly market',
      },
      {
        de: 'Team: 7 Angestellte, davon 3 in Teilzeit · Seit: 1998 · Märkte: das Viertel, dazu '
          + 'Mittagslieferung an vier Betriebe',
        en: 'Team: 7 employees, 3 of them part-time · Since: 1998 · Markets: this quarter, plus lunch '
          + 'deliveries to four firms',
      },
    ),
  },

  // ── B · Purpose · Vision · Mission ──────────────────────────────────────
  // Beispiel-Betriebe: Yoga-Studio für Rückenkurse (neue Marke) / Yoga-Studio
  // seit 2009, das den Wellness-Anstrich loswerden will (Relaunch). Purpose,
  // Vision und Mission stehen nebeneinander im selben Betrieb — sonst lernt man
  // die Unterschiede zwischen den dreien nicht.
  'b.whyStarted': {
    goal: 'turn what this person already told you about the beginning of this brand into ONE sentence '
      + 'about why that still matters TODAY.',
    quality: [
      'One sentence, two at the very most.',
      'It says why it matters today, not how it began.',
      'The reason is traceable to something they already said.',
      'It stays true when the founding anecdote is removed.',
    ],
    antiPatterns: [
      'The founding anecdote retold in place of the reason.',
      'A purpose statement smuggled in early: "we exist to change the world of ...".',
      'A reason any company in the industry could claim.',
    ],
    ladder: {
      opening: 'the reason inside their own origin story, offered back in one sentence.',
      probes: ['is that still the reason, or has it shifted since?'],
      reframes: ['if it comes back as an anecdote, ask what of it is still true on an ordinary Tuesday'],
    },
    effort: { minutes: 2, turns: 4 },
    form: { person: 'we', tense: 'present', maxWords: 30 },
    examples: pathExamples(
      {
        de: 'Weil die meisten Rücken nicht mehr Dehnung brauchen, sondern jemanden, der beim ersten Mal '
          + 'danebensteht.',
        en: 'Because most backs do not need more stretching, they need somebody standing beside them the '
          + 'first time.',
      },
      {
        de: 'Weil eine Stunde, die niemand versteht, keine Ruhe bringt, sondern ein schlechtes Gewissen.',
        en: 'Because an hour nobody understands brings no calm, only a bad conscience.',
      },
    ),
    rules: [
      'This is a DERIVATION, not a new question: the substance must be traceable to their own origin story '
      + 'in the inputs. Keep their words where they carry meaning, drop the anecdote, keep the reason.',
      'One sentence, at most two. Present tense — the question is not how it began, but what of it still '
      + 'holds.',
      'If the origin story in the inputs is empty or says nothing about a reason, do not construct one: '
      + 'ask instead.',
    ],
  },
  'b.worldLoses': {
    goal: 'capture what the world would lose if this brand shut down tomorrow — impact, not revenue.',
    quality: [
      'It names something concrete that would stop happening.',
      'It is about people outside the company.',
      'It is not measured in revenue or in jobs.',
      'Someone who never heard of this brand would still see the loss.',
    ],
    antiPatterns: [
      'The revenue answer: "our customers would have to go elsewhere".',
      'An answer about the team losing their jobs.',
      'A claim of being irreplaceable with nothing behind it.',
    ],
    ladder: {
      opening: 'what would stop happening if they closed tomorrow.',
      probes: [
        'who would notice first, and what would they do instead?',
        'would somebody else simply take it over, or would it really stop?',
      ],
      reframes: [
        'if the answer is about turnover, ask who would be left without something',
        'if the answer is "someone else would do it", ask what would then be done WORSE',
      ],
    },
    examples: pathExamples(
      {
        de: 'Dann gäbe es hier keinen Kurs mehr, in dem jemand mit Bandscheibenvorfall in der ersten Reihe '
          + 'stehen darf.',
        en: 'There would be no class left here where somebody with a slipped disc is allowed to stand in the '
          + 'front row.',
      },
      {
        de: 'Zwölf Leute, die seit Jahren dienstags um sieben kommen, hätten keinen festen Termin mehr, an '
          + 'dem jemand ihren Namen kennt.',
        en: 'Twelve people who have come at seven on Tuesdays for years would lose the one fixed hour where '
          + 'somebody knows their name.',
      },
    ),
  },
  'b.conviction': {
    goal: 'capture the belief that drives this company — the one they would defend even when it costs them.',
    quality: [
      'It is a belief someone could openly disagree with.',
      'It has already cost them something, and they can say what.',
      'It is stated as a claim about the world, not about themselves.',
      'It fits into one sentence.',
    ],
    antiPatterns: [
      'A belief nobody would contradict: "quality matters".',
      'A list of value words instead of a conviction.',
      'A conviction that has never cost anything.',
    ],
    ladder: {
      opening: 'the belief they would defend even when it costs them.',
      probes: [
        'when did holding it last cost you money or a customer?',
        'who in your industry would openly disagree with it?',
      ],
      reframes: [
        'if nobody could disagree, ask for the version their competitor would refuse to sign',
        'if it is a list of values, ask which one they have already paid for',
      ],
    },
    examples: pathExamples(
      {
        de: 'Wer eine Übung nicht kann, ist nicht zu unbeweglich — die Übung kommt zu früh. Das hat uns schon '
          + 'zwei Kursleiterinnen gekostet.',
        en: 'Somebody who cannot do a pose is not too stiff — the pose came too early. That has already cost '
          + 'us two teachers.',
      },
      {
        de: 'Yoga ist kein Wellness. Wir haben die Kerzen und die Klangschale abgeschafft und dabei ein '
          + 'Drittel der Anmeldungen verloren.',
        en: 'Yoga is not wellness. We dropped the candles and the singing bowl and lost a third of the '
          + 'sign-ups doing it.',
      },
    ),
  },
  'b.tenYears': {
    goal: 'capture what looks different in the world ten years from now because this brand existed.',
    quality: [
      'It describes a state of the world, not a company milestone.',
      'Somebody could tell whether it has arrived or not.',
      'It is bigger than this brand and still connected to it.',
      'It contains no target figures.',
    ],
    antiPatterns: [
      'A growth plan: "three locations, twenty employees".',
      'A world so large the brand plays no part in it.',
      'The mission repeated in the future tense.',
    ],
    ladder: {
      opening: 'what looks different in the world in ten years because they existed.',
      probes: [
        'who would notice that change without ever hearing your name?',
        'what is ordinary by then that is unusual today?',
      ],
      reframes: [
        'if the answer is a growth plan, ask what that growth would make possible for other people',
        'if the answer is a better world in general, ask which corner of it they can actually touch',
      ],
    },
    examples: pathExamples(
      {
        de: 'In zehn Jahren schickt die Hausärztin nach der Reha nicht nur zur Physiotherapie, sondern in '
          + 'einen Kurs, der weitergeht.',
        en: 'In ten years a family doctor sends people after rehab not only to physiotherapy but into a class '
          + 'that keeps going.',
      },
      {
        de: 'Eine Übungsstunde ist dann so selbstverständlich wie Schwimmen — man geht hin, ohne dabei etwas '
          + 'werden zu wollen.',
        en: 'By then a practice hour is as ordinary as swimming: people go without wanting to become '
          + 'anything.',
      },
    ),
  },
  'b.legacy': {
    goal: 'capture what people should be saying about this brand in twenty years.',
    quality: [
      'It is a sentence somebody else would say, in that person\'s words.',
      'It names something they did, not something they were.',
      'It survives the founder leaving.',
      'It is modest enough to be believable.',
    ],
    antiPatterns: [
      'A eulogy for the founder rather than for the brand.',
      'A superlative: "the best in the region".',
      'The ten-year answer said again.',
    ],
    ladder: {
      opening: 'the sentence people should be saying about them in twenty years.',
      probes: [
        'who says it — a customer, a colleague, a competitor?',
        'what did you have to do so that they could say it?',
      ],
      reframes: [
        'if it is about the founder, ask what should be said about the workshop after they stop',
        'if it is a superlative, ask what somebody would point at as proof',
      ],
    },
    examples: pathExamples(
      {
        de: '„Da konnte man mit einem kaputten Rücken anfangen, ohne sich zu schämen."',
        en: '"You could start there with a wrecked back and not feel ashamed."',
      },
      {
        de: '„Die haben nie behauptet, dass eine Stunde das Leben verändert — und alle kamen trotzdem '
          + 'wieder."',
        en: '"They never claimed an hour would change your life, and everybody came back anyway."',
      },
    ),
  },
  'b.purpose': {
    goal: 'draft the PURPOSE of this brand — the WHY. The reason it exists beyond making money.',
    quality: [
      'One sentence.',
      'It names why the world is better, not what the company sells.',
      'No competitor in this industry could say it word for word.',
      'No product, service or feature is mentioned in it.',
      'A founder could say it out loud without wincing.',
    ],
    antiPatterns: [
      'A sentence assembled from quality, passion and innovation.',
      'The formula left visible: "we exist so that customers get value".',
      'A growth or revenue goal in disguise.',
    ],
    form: {
      person: 'we',
      tense: 'present',
      maxWords: 25,
      forbidden: ['the brand name', 'product or service names', 'numbers and targets'],
    },
    examples: pathExamples(
      {
        de: 'Damit ein schmerzender Rücken kein Grund mehr ist, sich vom Bewegen ganz zu verabschieden.',
        en: 'So that an aching back stops being a reason to give up on moving altogether.',
      },
      {
        de: 'Damit Ruhe nichts ist, das man kaufen muss, sondern etwas, das man üben kann.',
        en: 'So that calm is not something to be bought but something that can be practised.',
      },
    ),
    rules: [
      'Formula as a scaffold, never as a fill-in-the-blanks: "We exist so that <who> <what changes for '
      + 'them>." It has to read like a sentence a founder would say out loud, not like a filled-in '
      + 'template — if your draft still looks like the formula, rewrite it.',
      'One sentence, two at the very most. Present tense. It names a change in the world, not a product '
      + 'and not a revenue goal.',
      'Build it from what they answered: why they started, what the world would lose, and the conviction '
      + 'they would defend even when it costs them. Those three answers are the substance — the pitch is '
      + 'only there to keep you honest about what they actually do.',
      VERA_COMPETITOR_TEST,
      PVM_BANNED,
    ],
  },
  'b.vision': {
    goal: 'draft the VISION of this brand — the WHERE TO. The world once they have succeeded.',
    quality: [
      'One sentence describing a state that HAS arrived.',
      'It contains no figure, market share or headcount.',
      'A stranger could tell whether the world is there yet.',
      'It reaches further than a plan and still points at today.',
    ],
    antiPatterns: [
      'A target: "market leader in the region by 2035".',
      'An intention instead of a picture: "we want X to become normal".',
      'A world so vague that this brand is not in it.',
    ],
    form: {
      person: 'none',
      tense: 'present',
      maxWords: 25,
      forbidden: ['numbers, market shares and headcounts', 'the words "we want" and "we will"'],
    },
    examples: pathExamples(
      {
        de: 'Ein Anfängerkurs ist selbstverständlich der mit der besten Betreuung, nicht der billigste im '
          + 'Plan.',
        en: 'A beginners class is obviously the one with the closest attention, not the cheapest on the '
          + 'timetable.',
      },
      {
        de: 'Niemand entschuldigt sich mehr dafür, nur wegen des Rückens zu kommen und nicht wegen der '
          + 'Erleuchtung.',
        en: 'Nobody apologises any more for coming because of their back rather than for enlightenment.',
      },
    ),
    rules: [
      'Formula as a scaffold, never as a fill-in-the-blanks: "In ten years, <what looks different in the '
      + 'world because they existed>." A picture, not a target figure: no market share, no revenue, no '
      + 'headcount.',
      'One sentence, two at the very most. Write it as a state that HAS arrived, not as an intention: "X '
      + 'is normal" beats "we want X to become normal".',
      'Build it from their ten-year answer and their legacy answer. It may sit far out and still has to '
      + 'give direction today.',
      VERA_COMPETITOR_TEST,
      PVM_BANNED,
    ],
  },
  'b.mission': {
    goal: 'draft the MISSION of this brand — the HOW. What they do every day to get towards the vision.',
    quality: [
      'One sentence: what they do, for whom, to what end.',
      'Concrete enough that a new colleague could act on it tomorrow.',
      'It sits under the purpose instead of repeating it.',
      'Active voice, present tense, no conditional.',
    ],
    antiPatterns: [
      'A second purpose: another sentence beginning "we exist to".',
      'A list of services.',
      'A sentence whose only verb is "provide" or "offer".',
    ],
    form: { person: 'we', tense: 'present', maxWords: 30 },
    examples: pathExamples(
      {
        de: 'Wir unterrichten in Gruppen von höchstens acht und gehen bei jeder Übung einmal durch die Reihe, '
          + 'damit niemand falsch übt.',
        en: 'We teach in groups of no more than eight and walk the room during every pose, so that nobody '
          + 'practises it wrong.',
      },
      {
        de: 'Wir erklären vor jeder Übung, was sie im Körper tut, und lassen die Sanskrit-Namen weg, bis '
          + 'jemand danach fragt.',
        en: 'We explain what each pose does in the body before we teach it, and leave the Sanskrit names out '
          + 'until somebody asks.',
      },
    ),
    rules: [
      'Formula as a scaffold, never as a fill-in-the-blanks: "We <do what> for <whom>, so that <what '
      + 'result>." Concrete enough that a new colleague could act on it tomorrow.',
      'One sentence, two at the very most. Present tense, active voice, no conditional.',
      'Build it from the pitch, the audience sketch, the one thing they do differently, what customers '
      + 'praise them for — and keep it under the purpose you already drafted: the mission is the how of '
      + 'THAT why, not a second why.',
      VERA_COMPETITOR_TEST,
      PVM_BANNED,
    ],
  },
  'b.positioningCategory': {
    goal: 'propose the CATEGORY this brand plays in — the shelf people mentally put it on.',
    quality: [
      'It names the shelf they are compared on, not the trade they practise.',
      'Somebody is already looking for that category.',
      'It excludes at least half of the industry.',
      'It can be said in five words.',
    ],
    antiPatterns: [
      'The industry repeated as a category.',
      'A category that exists only inside this one sentence.',
      'A category so broad that every competitor is on the same shelf.',
    ],
    ladder: {
      opening: 'name the shelf, say in one sentence why, then append the alternatives as options.',
      probes: ['who would you be compared against on that shelf?'],
      reframes: ['if they take the broadest option, ask which half of it they would rather not be measured against'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present', maxWords: 5 },
    examples: pathExamples(
      {
        de: 'Rückenkurse für Wiedereinsteiger — nicht „Yoga"',
        en: 'Back classes for returners — not "yoga"',
      },
      {
        de: 'Übungsraum statt „Wellness-Studio"',
        en: 'A practice room, not "wellness"',
      },
    ),
    rules: [
      'This is not the same as their industry: the industry is what they do, the category is what they are '
      + 'compared against. "Roastery" is an industry; "speciality coffee for cafés" is a category.',
      'Derive it from the pitch, the normalised category and the competitor profiles in the inputs — the '
      + 'competitors are the strongest evidence of which shelf they are already on.',
      'Narrow beats broad: a category nobody else claims is worth more than one everybody claims. But do '
      + 'not invent a category that only exists in this sentence — people have to already look for it.',
    ],
  },
  'b.positioningFirstChoice': {
    goal: 'capture for whom this brand is the FIRST choice inside its category, and against whom.',
    quality: [
      'It names one group for whom they are the first call.',
      'It names who they are the first choice AGAINST.',
      'The group is small enough to be recognisable.',
      'Somebody in that group would agree with the description.',
    ],
    antiPatterns: [
      '"Everyone who values quality."',
      'A first choice with no competitor named.',
      'A group defined by budget alone.',
    ],
    ladder: {
      opening: 'for whom, inside that category, they are the first call — and instead of whom.',
      probes: [
        'who do those people call if not you, and why do they call you first?',
        'which kind of job would you rather send on to somebody else?',
      ],
      reframes: [
        'if the answer is "everyone", ask who has called twice this year and why',
        'if no competitor is named, ask who else was on the list the last time they were chosen',
      ],
    },
    examples: pathExamples(
      {
        de: 'Für Leute, die nach der Reha weitermachen sollen und sich in ein volles Fitnessstudio nicht '
          + 'trauen — gegen die Volkshochschulkurse mit dreißig Teilnehmern.',
        en: 'For people told to keep going after rehab who do not dare walk into a busy gym — against the '
          + 'adult-education classes with thirty people in the room.',
      },
      {
        de: 'Für Berufstätige, die abends eine feste Stunde brauchen — gegen die Studios mit Zehnerkarte, in '
          + 'denen jede Woche jemand anderes unterrichtet.',
        en: 'For working people who need one fixed hour in the evening — against the studios with a ten-class '
          + 'pass where somebody different teaches every week.',
      },
    ),
  },

  // ── B2 · Markenarchitektur ──────────────────────────────────────────────
  // Beispiel-Betriebe: Software-Haus „Steinlach" mit Modulen unter dem Hausnamen
  // (neue Marke) / SaaS „Meerkamp" mit einer eigenen Freiberufler-Marke
  // (Relaunch) — beide haben mehrere Angebote unter einem Dach, und daran sieht
  // man die vier Modelle. Die NAMEN stehen in beiden Sprachen gleich.
  'b2.visibility': {
    goal: 'settle whether the other brands should visibly belong to the main brand or stand on their own.',
    quality: [
      'The answer is a decision, not a preference.',
      'It says what the CUSTOMER should see, not what the ownership looks like.',
      'It gives one reason.',
      'It holds for all the sub-brands, or it names the exception.',
    ],
    antiPatterns: [
      '"It depends", without naming what it depends on.',
      'An answer about internal ownership instead of what a customer sees.',
      'Both at once — "visible but independent" — with no rule for the conflict.',
    ],
    ladder: {
      opening: 'what a customer should see on the product: the main brand, or not.',
      probes: ['what should somebody assume about the main brand when they meet the product first?'],
      reframes: ['if the answer is "it depends", take the case that comes up most often and decide that one'],
    },
    // Vertagen, weil die Architektur oft zu zweit entschieden wird — hier
    // erfindet sonst eine Person eine Festlegung für alle.
    answers: { minSubstance: 'short', allowDefer: true },
    examples: pathExamples(
      {
        de: 'Sichtbar. Wer das Rechnungsmodul kauft, soll wissen, dass es aus demselben Haus kommt wie die '
          + 'Zeiterfassung.',
        en: 'Visible. Whoever buys the invoicing module should know it comes from the same house as the time '
          + 'tracking.',
      },
      {
        de: 'Eigenständig. Das Werkzeug für Freiberufler darf nicht nach Lohnbuchhaltung für Konzerne '
          + 'aussehen, sonst probiert es niemand aus.',
        en: 'On its own. The tool for freelancers must not look like corporate payroll, or nobody will ever '
          + 'try it.',
      },
    ),
  },
  'b2.roleOfMaster': {
    goal: 'settle whether the main brand lends the other brands its trust, or leaves them free to reach '
      + 'audiences the main brand cannot.',
    quality: [
      'It names what the main brand gives the others: trust, reach, or nothing.',
      'It also names what the main brand costs them.',
      'It is honest about the audiences the main brand cannot reach.',
      'It is one decision, not two options side by side.',
    ],
    antiPatterns: [
      '"Both", with no rule for the case where they collide.',
      'An answer that only lists the advantages of the main brand.',
      'A statement about reporting lines instead of about customers.',
    ],
    ladder: {
      opening: 'whether the main brand lends trust here, or gets in the way.',
      probes: ['which customers would be put off if the main brand were on it?'],
      reframes: ['if the answer is "both", ask which of the two they would give up if forced'],
    },
    // ÖFFENTLICH (Davids Entscheidung 2026-09-04, Audit Punkt 8): Paket 2 hatte
    // die Session zurückgehalten, weil die ehrliche Antwort oft „unsere
    // Hauptmarke schreckt genau diese Kundschaft ab" lautet. Sie ist aber eine
    // ARCHITEKTUR-Aussage, auf die `b2.rule` (öffentlich) verweist — ohne sie
    // ist die Markenarchitektur im geteilten Dokument halb blind. Zurückgehalten
    // wird stattdessen `a.competitors`, das Dritte beim Namen nennt.
    answers: { minSubstance: 'short', allowDefer: true },
    examples: pathExamples(
      {
        de: 'Vertrauen leihen. Wer Steinlach schon einsetzt, testet das zweite Modul ohne Ausschreibung — '
          + 'ohne den Hausnamen wäre es eines von zwanzig.',
        en: 'Lend trust. Anyone already running Steinlach will test the second module without a tender — '
          + 'without the house name it would be one of twenty.',
      },
      {
        de: 'Freilassen. Die Freiberufler-Marke erreicht Leute, die bei Meerkamp nie anfragen würden, weil '
          + 'sie dort eine Personalabteilung vermuten.',
        en: 'Set it free. The freelancer brand reaches people who would never approach Meerkamp, because they '
          + 'assume an HR department behind it.',
      },
    ),
  },
  'b2.namingPattern': {
    goal: 'settle how the other brands are allowed to be named — as "Brand Product" or with names of '
      + 'their own.',
    quality: [
      'It is a pattern somebody could apply to the next product without asking.',
      'It says what is NOT allowed as well as what is.',
      'It fits the visibility decision they already made.',
      'It works for a product nobody has thought of yet.',
    ],
    antiPatterns: [
      'A list of existing product names instead of a rule.',
      'A rule with an exception for every name that already exists.',
      '"Case by case."',
    ],
    ladder: {
      opening: 'how the next product may be named — the pattern, not the examples.',
      probes: ['does that rule still work for a product in a completely different field?'],
      reframes: ['if the answer is a list of names, ask what those names have in common'],
    },
    answers: { minSubstance: 'short', allowDefer: true },
    examples: pathExamples(
      {
        de: 'Immer der Hausname vorn, dann die Aufgabe: „Steinlach Rechnung", „Steinlach Zeit". Keine '
          + 'Fantasienamen, keine Versionsnummer im Namen.',
        en: 'Always the house name first, then the job it does: "Steinlach Rechnung", "Steinlach Zeit". No '
          + 'invented names, no version number in the name.',
      },
      {
        de: 'Eigene Namen sind erlaubt, aber nie mit unserem Kürzel davor — sonst hält es jeder für ein '
          + 'Zusatzmodul.',
        en: 'Names of their own are allowed, but never with our initials in front — otherwise everyone reads '
          + 'it as an add-on module.',
      },
    ),
  },
  'b2.model': {
    goal: 'propose the brand ARCHITECTURE model for this brand.',
    quality: [
      'The model follows from their three answers, and the reason says how.',
      'The BASIS line names what this model costs them.',
      'It is one of the four models, called by its catalogue name.',
      'It would still hold for a product they have not invented yet.',
    ],
    antiPatterns: [
      'A fifth, invented model, or a "hybrid" that avoids the decision.',
      'A model chosen because it is the most common one.',
      'A recommendation with no price named.',
    ],
    ladder: {
      opening: 'name the model, say why and what it costs, then append the four as options.',
      probes: ['does that still work if you add a product in a different field?'],
      reframes: ['if they want a hybrid, ask which of the four a customer would see first'],
    },
    // VERTAGEN (Paket 2b, Audit Punkt 7): die drei VORFRAGEN dieses Kapitels
    // sind vertagbar — die ENTSCHEIDUNG, die aus ihnen folgt, war es nicht.
    // Wer die Vorfragen allein nicht beantworten darf, kann das Modell erst
    // recht nicht allein festlegen.
    answers: { maxProbes: 1, allowDefer: true },
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Branded House — alles läuft unter Steinlach, weil das Haus selbst das Versprechen ist.',
        en: 'Branded house — everything runs under Steinlach, because the house itself is the promise.',
      },
      {
        de: 'Endorsed — die Freiberufler-Marke tritt eigenständig auf und trägt klein „von Meerkamp".',
        en: 'Endorsed — the freelancer brand stands on its own and carries a small "from Meerkamp".',
      },
    ),
    rules: [
      'Decide from their three answers in the inputs: whether the other brands should visibly belong to the '
      + 'main brand, whether the main brand should lend them trust, and how they are allowed to be named. '
      + 'Those three answers together point at exactly one of the four models.',
      'In the BASIS line of your turn, say in one sentence WHY this model and what it costs them — every '
      + 'model buys a different kind of trust and every model has a price.',
      'If the three answers contradict each other, or if two of them are empty, do not pick the middle '
      + 'ground: ask instead.',
    ],
  },
  'b2.rule': {
    goal: 'write the NAMING RULE that follows from the architecture model they chose.',
    quality: [
      'Somebody naming the next product could apply it without asking.',
      'It says what the name must contain, what it must not, and who decides.',
      'It carries two or three examples from their own context.',
      'Four sentences at most, examples included.',
    ],
    antiPatterns: [
      'A rule illustrated with "Brand Product A".',
      'A rule that contradicts the architecture model they chose.',
      'A rule with nobody named as the decider.',
    ],
    form: { person: 'we', tense: 'present', maxWords: 80 },
    // Vertagen wie bei `b2.model`: die Regel bindet jeden künftigen Namen.
    answers: { allowDefer: true },
    examples: pathExamples(
      {
        de: 'Jedes neue Modul heißt „Steinlach" plus die Aufgabe in einem Wort. Keine Fantasienamen, keine '
          + 'Jahreszahl. Über Ausnahmen entscheidet die Produktleitung, nicht der Vertrieb.',
        en: 'Every new module is called "Steinlach" plus the job it does, in one word. No invented names, no '
          + 'year. Product management decides on exceptions, not sales.',
      },
      {
        de: 'Untermarken tragen einen eigenen Namen und im Impressum immer „von Meerkamp". Nie das Kürzel im '
          + 'Namen selbst. Jeden neuen Namen gibt die Geschäftsführung frei.',
        en: 'Sub-brands carry a name of their own and always the line "from Meerkamp" in the legal notice. '
          + 'Never the initials in the name itself. The managing directors sign off every new name.',
      },
    ),
    rules: [
      'One rule, said plainly enough that someone naming the next product can apply it without asking: what '
      + 'the name must contain, what it must not, and who decides.',
      'Then two or three concrete examples FROM THEIR OWN CONTEXT — real offerings, product areas or '
      + 'audiences named in the inputs, not "Brand Product A". If the inputs carry no such offering, use '
      + 'their own words for what they do and say in the BASIS line that the examples are illustrative.',
      'At most four sentences in total, examples included.',
    ],
  },

  // ── C · Werte ───────────────────────────────────────────────────────────
  // EIN Betrieb je Pfad durch das ganze Kapitel (Ernährungscoaching /
  // Personal-Training-Studio): an einer fortlaufenden Geschichte sieht man, wie
  // aus einem Moment ein Wert, daraus eine Definition und daraus eine
  // Konfliktregel wird. Getrennte Branchen je Session hätten dieselben fünf
  // Zeilen zusammenhanglos gezeigt.
  'c.discovery1': {
    goal: 'capture a moment when this business was at its best, told as a scene and not as an adjective.',
    quality: [
      'It is one scene with a place, a time and people in it.',
      'Something was decided or done, not only felt.',
      'A listener could say what was at stake.',
      'No other company could tell this scene.',
    ],
    antiPatterns: [
      'An adjective instead of a scene: "when we are at our best we are reliable".',
      'A whole period: "the first year was great".',
      'A customer testimonial retold as their own memory.',
    ],
    ladder: {
      opening: 'one day when the business was at its best — as a scene, not as a summary.',
      probes: [
        'what happened first, and what did you do next?',
        'who else was there, and what did they say afterwards?',
      ],
      reframes: [
        'if the answer is an adjective, ask for the day that made them use that word',
        'if it is a whole period, ask for the single moment inside it they remember best',
      ],
    },
    answers: { minSubstance: 'long' },
    effort: { minutes: 2, turns: 4 },
    examples: pathExamples(
      {
        de: 'Eine Kundin kam nach drei gescheiterten Diäten. In der vierten Woche hat sie zum ersten Mal '
          + 'wieder gefrühstückt, statt bis mittags zu warten, und mir das aus dem Zug geschrieben.',
        en: 'A client came to us after three failed diets. In the fourth week she had breakfast again for the '
          + 'first time instead of waiting until noon, and wrote to me about it from the train.',
      },
      {
        de: 'Nach dem Wasserrohrbruch stand die halbe Frühgruppe im Flur. Der Trainer hat die Stunde abgesagt '
          + 'und stattdessen mit allen eine Stunde im Hof trainiert.',
        en: 'After the burst pipe half the early group stood in the corridor. The trainer called the session '
          + 'off and trained everybody in the yard for an hour instead.',
      },
    ),
  },
  'c.discovery2': {
    goal: 'capture a moment when something felt deeply wrong in this business, told as a scene.',
    quality: [
      'It is a scene, and the discomfort has a cause somebody could name.',
      'They say what they did about it, or that they did nothing.',
      'It is about their own work, not about a difficult customer.',
      'It still bothers them.',
    ],
    antiPatterns: [
      'A complaint about a customer.',
      'An abstract grievance about the industry.',
      'A scene in which they were only the victim.',
    ],
    ladder: {
      opening: 'a day when something felt deeply wrong — the scene, not the lesson.',
      probes: [
        'what exactly made it feel wrong: what was done, or how it was done?',
        'what did you do afterwards?',
      ],
      reframes: [
        'if the answer blames a customer, ask what they themselves would do differently today',
        'if the answer stays abstract, ask when they last felt it in the room',
      ],
    },
    answers: { minSubstance: 'long' },
    effort: { minutes: 2, turns: 4 },
    examples: pathExamples(
      {
        de: 'Wir haben ein Zwölf-Wochen-Paket an jemanden verkauft, der ab Woche zwei nicht mehr kam. '
          + 'Angerufen hat ihn niemand, das Geld war ja da.',
        en: 'We sold a twelve-week package to somebody who stopped showing up in week two. Nobody called him, '
          + 'because the money was already in.',
      },
      {
        de: 'Wir haben einen Kunden weiter trainieren lassen, obwohl seine Schulter längst zum Arzt gehört '
          + 'hätte. Gesagt hat das niemand, gesehen haben es alle.',
        en: 'We kept training a client although his shoulder should long since have seen a doctor. Nobody '
          + 'said it out loud, and everybody saw it.',
      },
    ),
  },
  // DIE EINE TEAM-FASSUNG DES KATALOGS (Davids Entscheidung 2026-09-04, Audit
  // Punkt 12). Solo fragt D3 der Content-Spec §6 („welches Verhalten würdest
  // du nie dulden"), im Team D7 („wie soll dein Team entscheiden, wenn du
  // nicht im Raum bist"). Beides holt dieselbe Sache — die Grenze, an der
  // dieser Betrieb nein sagt —, nur über den Weg, den der Betrieb kennt: allein
  // über das eigene Nein, im Team über die Regel, die ohne den Inhaber gilt.
  // Deshalb tragen Ziel, Qualität und Leiter BEIDE Fassungen; der Fragen-Pool
  // bleibt im Übrigen eingefroren (D4–D6 und W3–W5 sind in der Spec als
  // „nicht gebaut" vermerkt).
  'c.discovery3': {
    goal: 'capture where this brand draws its line: solo, the behaviour they would never tolerate even '
      + 'from their best-paying client; with a team, the rule the team decides by when the owner is not '
      + 'in the room.',
    quality: [
      'It names a behaviour or a decision rule, never a type of person.',
      'It has been applied at least once, and they can say when.',
      'It would still hold for the best-paying client, and without the owner present.',
      'It is specific enough to recognise while it is happening.',
    ],
    antiPatterns: [
      'A no-go so extreme that nobody would ever ask for it.',
      'A preference dressed up as a principle: "we do not like rush jobs".',
      'A behaviour they have in fact tolerated, or a rule nobody has ever used.',
    ],
    ladder: {
      opening: 'solo: the behaviour they would refuse even from their best-paying client. With a team: '
        + 'the rule the team decides by when the owner is not there.',
      probes: [
        'when did that last happen, and what did it cost?',
        'who applied it — and did they have to ask first?',
      ],
      reframes: [
        'if the no-go is illegal anyway, ask for the one that is legal and still unacceptable',
        'if the rule has never been tested, ask what the team came closest to getting wrong',
      ],
    },
    effort: { minutes: 2, turns: 4 },
    examples: pathExamples(
      {
        de: 'Wer bei uns Nahrungsergänzung auf Provision verkaufen will, ist raus — auch wenn das ganze Jahr '
          + 'gebucht ist.',
        en: 'Anybody who wants to sell supplements on commission here is out, even when the whole year has '
          + 'been booked.',
      },
      {
        de: 'Ist niemand von uns da, gilt: im Zweifel wird die Übung abgebrochen und ein Arztbesuch '
          + 'empfohlen. Das darf jeder Trainer allein entscheiden.',
        en: 'When none of us is there the rule is: when in doubt the exercise stops and a doctor is '
          + 'recommended. Every trainer may decide that alone.',
      },
    ),
  },
  'c.candidates': {
    goal: `distil ${MILO_CANDIDATE_RANGE.min} to ${MILO_CANDIDATE_RANGE.max} candidate VALUES out of `
      + 'what this person has told you.',
    quality: [
      'Every candidate carries the moment it comes from, in the same line.',
      'No two candidates rest on the same sentence.',
      'A word that could stand under any brand appears only where a specific moment earns it.',
      'The list is unranked and has no favourite.',
    ],
    antiPatterns: [
      'Poster words with no moment behind them.',
      'A ranking, or a candidate marked as the obvious one.',
      'A value invented to round the list up to seven.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: '- Geduld — der Plan wurde umgeschrieben, statt die Kundin weiterzuschieben\n- Unbestechlichkeit '
          + '— das Provisionsangebot eines Herstellers wurde abgelehnt',
        en: '- Patience — the plan was rewritten instead of pushing the client along\n- Incorruptibility — a '
          + 'manufacturer\'s commission offer was turned down',
      },
      {
        de: '- Ehrlichkeit — kein Training an einer Schulter, die zum Arzt gehört\n- Verlässlichkeit — bei '
          + 'Krankheit wird abgesagt, nicht vertreten',
        en: '- Honesty — no training on a shoulder that belongs at a doctor\n- Reliability — when a trainer '
          + 'is ill the session is cancelled, not handed over',
      },
    ),
    rules: [
      'A value is a rule of behaviour that is allowed to cost money — not a poster word. You are looking '
      + 'for the moments where they chose the harder way: that is where a value becomes visible.',
      'Read the moments in the inputs: when the business was at its best, when something felt deeply '
      + 'wrong, what they would never tolerate, how the brand began, what customers praise, what they '
      + 'complain about, and the conviction they would defend even when it costs them.',
      'ONE LINE PER CANDIDATE, in exactly this shape: "- <value in one or two words> — <the moment or '
      + 'statement it comes from, in half a sentence>". The evidence half must be traceable to the inputs: '
      + 'quote or paraphrase what they actually said.',
      'NEVER list a value you cannot point at: no "quality", "reliability", "passion", "innovation", '
      + '"customer focus" or any other word that could stand under any brand in any industry — unless a '
      + 'specific moment in the inputs earns it, and then the line says which moment.',
      'Two candidates may not rest on the same sentence: if you can only find three moments, return three '
      + 'candidates and say in the BASIS line that the material carries no more.',
      'Do not rank them and do not pick a favourite — the choosing is the next step, and it belongs to the '
      + 'person.',
    ],
  },
  'c.final': {
    goal: 'settle the three to five values this brand would defend even when they cost it something.',
    quality: [
      'Between three and five values.',
      'Each one has already cost them something.',
      'Dropping one of them would change how a decision is made.',
      'No two of them mean the same thing.',
    ],
    antiPatterns: [
      'Six or more, because none of them could be dropped.',
      'A value kept because it looks good on a wall.',
      'Two words for the same behaviour, such as honesty and transparency.',
    ],
    ladder: {
      opening: 'narrow the candidates to three to five, and say which of them have a price.',
      probes: ['which of these would you still hold in the worst month of the year?'],
      reframes: ['if six or more survive, ask which one they have never actually paid for'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    // Die Frage im Katalog sagt „three to five" und der Wert ist eine LISTE
    // (eine Zeile je Wert, `brandSlotFormat.ts`) — damit ist die Zahl zählbar.
    invariants: [{ kind: 'count', min: 3, max: 5 }],
    examples: pathExamples(
      {
        de: '- Geduld\n- Unbestechlichkeit\n- Klarheit',
        en: '- Patience\n- Incorruptibility\n- Clarity',
      },
      {
        de: '- Ehrlichkeit\n- Verlässlichkeit\n- Ruhe\n- Sorgfalt',
        en: '- Honesty\n- Reliability\n- Calm\n- Care',
      },
    ),
  },
  'c.definitions': {
    goal: 'for each value they chose, write ONE sentence saying what it means HERE — in this brand, not '
      + 'in a dictionary.',
    quality: [
      'One line per chosen value, none missing and none added.',
      'Each sentence says what somebody DOES or does not do.',
      'The moment behind the value is recognisable in the sentence.',
      'It could be read out on a first working day without embarrassment.',
    ],
    antiPatterns: [
      'A dictionary definition: "honesty means being honest".',
      'A sentence that names an attitude but no action.',
      'A definition for a value they did not choose.',
    ],
    form: { person: 'we', tense: 'present' },
    // „One line per chosen value, none missing" ist zählbar (Paket 2b, Audit
    // Teil 3 Nr. 4): jede Zeile beginnt mit dem Wert, also muss jeder gewählte
    // Wert im Feld vorkommen. Ohne `c.final` prüft sie nichts (fail-open).
    invariants: [{ kind: 'mentionsFrom', of: 'c.final' }],
    examples: pathExamples(
      {
        de: '- Geduld — wir schreiben den Plan so oft um, wie der Alltag es verlangt, und rechnen die '
          + 'Beratung nicht doppelt ab.',
        en: '- Patience — we rewrite the plan as often as everyday life demands, and we do not charge for the '
          + 'session twice.',
      },
      {
        de: '- Verlässlichkeit — fällt ein Trainer aus, sagen wir ab und geben den Termin kostenfrei zurück, '
          + 'statt jemanden einspringen zu lassen.',
        en: '- Reliability — if a trainer drops out we cancel and refund the slot instead of sending in a '
          + 'stand-in.',
      },
    ),
    rules: [
      'ONE LINE PER VALUE, in exactly this shape: "- <value> — <what it means here, in one sentence>".',
      'The sentence has to be behavioural: it says what someone DOES or DOES NOT do because of this value. '
      + '"Honesty means we say no to work we cannot do well" beats "Honesty means being honest".',
      'Build each sentence from the moments they described, not from the word itself — the same moment '
      + 'that made the value a candidate should be recognisable in its definition.',
      'Cover exactly the values in their final selection: no extra ones, none left out. If a chosen value '
      + 'has no moment behind it in the inputs, ask about that one instead of inventing a meaning for it.',
    ],
  },
  'c.livedExamples': {
    goal: 'capture one real example per chosen value where this brand already lived it.',
    quality: [
      'One real example per chosen value.',
      'Each example carries a date, a place or a person.',
      'It shows the value costing something.',
      'It happened — it is not what they would do.',
    ],
    antiPatterns: [
      'A hypothetical: "we would always ...".',
      'The same story used for two values.',
      'An example in which the value cost nothing.',
    ],
    ladder: {
      opening: 'one thing that really happened, per value.',
      probes: [
        'when was that, and who was involved?',
        'what did it cost you that time?',
      ],
      reframes: [
        'if the example is hypothetical, ask for the last time it really happened',
        'if one value has no story, say so plainly and ask whether it belongs on the list',
      ],
    },
    // VERTAGEN (Paket 2b, Audit Punkt 7): „ein echtes Beispiel je Wert, mit
    // Datum, Ort oder Person" kann im Team niemand allein beantworten — und
    // genau hier richtet eine erfundene Antwort den grössten Schaden an, weil
    // sie die Substanz der Werte ist.
    answers: { minSubstance: 'long', allowDefer: true },
    effort: { minutes: 2, turns: 5 },
    // Ein Beispiel JE gewähltem Wert — also kommt jeder Wert im Feld vor.
    invariants: [{ kind: 'mentionsFrom', of: 'c.final' }],
    examples: pathExamples(
      {
        de: '- Unbestechlichkeit — im März haben wir ein Provisionsangebot über 2.000 Euro abgelehnt und das '
          + 'in der Sprechstunde offen gesagt.',
        en: '- Incorruptibility — in March we turned down a commission offer worth 2,000 euros and said so '
          + 'openly in the consultation hour.',
      },
      {
        de: '- Ruhe — im Juli haben wir den Wettkampf abgesagt, weil zwei Leute krank waren; das Startgeld '
          + 'ging zurück.',
        en: '- Calm — in July we called off the competition because two people were ill, and the entry fees '
          + 'went back.',
      },
    ),
  },
  'c.conflictRule': {
    goal: 'settle which of the chosen values wins when two of them collide, and why.',
    quality: [
      'It names two of their own values by name.',
      'It says which one wins, without "it depends".',
      'The case it describes has happened, or could happen next month.',
      'A colleague could apply it without asking.',
    ],
    antiPatterns: [
      '"They never conflict."',
      'A rule that resolves the conflict by doing both.',
      'A conflict between a value and something that is not a value, such as time or money.',
    ],
    ladder: {
      opening: 'the case where two of their values collide — and which one wins.',
      probes: [
        'which two rub against each other most often in practice?',
        'who decides when it happens on a Friday afternoon?',
      ],
      reframes: [
        'if the answer is "they never conflict", offer the pair you can see colliding and ask whether that is right',
        'if the answer does both, ask what happens when there is no time for both',
      ],
    },
    // ÖFFENTLICH, obwohl es nach Innenpolitik klingt: die Konfliktregel steht
    // ausdrücklich im Ergebnis-Dokument (Content-Spec §11, „Werte inkl.
    // Konfliktregel"). Sie ist das ERGEBNIS des Kapitels, nicht sein Rohmaterial.
    answers: { minSubstance: 'medium', allowDefer: true },
    // DIE IN §3a NAMENTLICH ZUGESAGTE INVARIANTE (Paket 2b, Audit Teil 3
    // Nr. 4): „c.conflictRule nennt nur Werte aus c.final". Entscheidbar ist
    // die positive Hälfte — dass zwei der eigenen Werte beim Namen vorkommen;
    // sie steht wörtlich als erstes Qualitätsmerkmal. Warum nicht das Verbot:
    // s. `mentionsFrom` im Kopf dieser Datei.
    invariants: [{ kind: 'mentionsFrom', of: 'c.final', min: 2 }],
    examples: pathExamples(
      {
        de: 'Geduld gegen Klarheit: Trägt ein Plan nach acht Wochen nicht, gewinnt Klarheit — wir sagen es, '
          + 'statt weiter Geduld zu verkaufen.',
        en: 'Patience against clarity: when a plan is not working after eight weeks, clarity wins — we say so '
          + 'instead of selling more patience.',
      },
      {
        de: 'Verlässlichkeit gegen Ehrlichkeit: Ist jemand nicht fit, gewinnt Ehrlichkeit — wir sagen den '
          + 'zugesagten Termin ab.',
        en: 'Reliability against honesty: if somebody is not fit, honesty wins — we cancel the session we '
          + 'promised.',
      },
    ),
  },
  'c.teamFilter': {
    goal: 'settle which value is the non-negotiable filter when this brand hires someone.',
    quality: [
      'It names exactly one of their chosen values.',
      'It says what would disqualify somebody, not what would be nice to have.',
      'It has already decided a hire or a parting.',
      'It can be applied on a trial day, not only to a CV.',
    ],
    antiPatterns: [
      'All the values at once as the filter.',
      'A skill requirement instead of a value.',
      'A filter nobody has ever failed.',
    ],
    ladder: {
      opening: 'the one value that decides a hire, and what would fail it.',
      probes: [
        'what would somebody have to do on a trial day for you to say no?',
        'has anybody ever failed on exactly that?',
      ],
      reframes: [
        'if all the values are named, ask which one they could not train into somebody',
        'if the answer is a skill, ask what they would forgive in skill and never in behaviour',
      ],
    },
    // Vertagen: die Frage betrifft Menschen, die gerade nicht am Tisch sitzen
    // (Mitinhaberin, Werkstattleitung) — eine allein erfundene Einstellungsregel
    // ist die schlechteste Sorte Festlegung.
    answers: { minSubstance: 'short', allowDefer: true },
    examples: pathExamples(
      {
        de: 'Geduld. Wer am Probetag beim ersten Rückschritt die Stimme hebt, passt nicht zu uns — Fachwissen '
          + 'bringen wir bei.',
        en: 'Patience. Anybody who raises their voice at the first setback on a trial day does not fit here — '
          + 'knowledge we can teach.',
      },
      {
        de: 'Ehrlichkeit. Wer einen Fehler im Studio nicht meldet, weil er klein aussieht, ist raus.',
        en: 'Honesty. Anybody who hides a small mistake in the studio because it looks harmless is out.',
      },
    ),
  },

  // ── D · Archetyp & Stimme ───────────────────────────────────────────────
  // EIN Betrieb je Pfad durch das Kapitel (Designstudio für Buchgestaltung /
  // Fotostudio): Hypothese, Primär, Sekundär und Abweichung sind nur zusammen
  // zu lesen.
  'd.hypothesis': {
    goal: 'say which archetype speaks out of their appearance TODAY — as a reading, not as a decision.',
    quality: [
      'It names one or two archetypes by their catalogue name.',
      'Each one carries a phrase from their own texts as evidence.',
      'It reads as a reading of the appearance, never as a decision about them.',
      'A mixed appearance is named as a finding instead of being smoothed over.',
    ],
    antiPatterns: [
      '"You are the Sage" — a verdict instead of a reading.',
      'An archetype with no phrase behind it.',
      'An appearance invented because no texts were given.',
    ],
    form: { person: 'none', tense: 'present', maxWords: 70 },
    examples: pathExamples(
      {
        de: 'Aus euren Texten spricht vor allem der Schöpfer: „Wir setzen jedes Buch neu, auch wenn es die '
          + 'vierte Auflage ist." Daneben klingt der Weise durch, wo ihr Papier und Bindung erklärt.',
        en: 'What speaks out of your texts is mostly the Creator: "we typeset every book from scratch, even '
          + 'for a fourth edition". The Sage shows through where you explain paper and binding.',
      },
      {
        de: 'Euer Auftritt zieht in zwei Richtungen: „Bilder, die bleiben" klingt nach dem Schöpfer, die '
          + 'Seite mit den Stornobedingungen nach dem Herrscher.',
        en: 'Your appearance pulls two ways: "pictures that stay" sounds like the Creator, while the '
          + 'cancellation page sounds like the Ruler.',
      },
    ),
    siteAnalysis: true,
    rules: [
      'Work from what is in the inputs: the pitch, the tone analysis of their existing texts and what '
      + 'customers praise them for. Name one or two candidates and, for each, the evidence you read it '
      + 'from — a phrase from their own texts beats an adjective every time.',
      'Two to four sentences. Name the archetype in plain language, the way a person would say it, and '
      + 'stay short: this is the sentence you will say out loud before the choosing starts.',
      'DO NOT DECIDE ANYTHING HERE. This is the step before the choice: it says what their appearance '
      + 'sounds like, not who they are. Never write "you are the Sage" — write what you read and where.',
      'If their appearance pulls in two directions, SAY SO. A mixed appearance is a finding, not a '
      + 'failure — and it is often the most useful sentence in this whole chapter.',
    ],
    pathRules: {
      relaunch: [
        'This is a relaunch, so an appearance exists: read it as it is today, including the parts that '
        + 'no longer fit them.',
      ],
      new: [
        'This is a new brand, so there may be barely any appearance yet. If the inputs carry no existing '
        + 'texts, say plainly that you can only read their own description so far, and read THAT — do '
        + 'not invent an appearance to have something to analyse.',
      ],
    },
  },
  'd.pairs': {
    goal: 'settle which archetype of each pair feels more like this brand, until a first and a second '
      + 'place stand.',
    quality: [
      'Every pair was decided, none skipped.',
      'Each winner is one of the twelve catalogue archetypes.',
      'The result has a first and a second place with a countable margin.',
      'The decisions came from their own sense, not from a brand they admire.',
    ],
    antiPatterns: [
      'A pair answered with "both".',
      'A choice justified by a famous brand instead of by their own feeling.',
      'The result read as a personality test about the founder.',
    ],
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    // KEINE BEISPIELE, und das ist kein Vergessen: der Wert entsteht im
    // Instrument (Karte gegen Karte), nicht in einem Feld, das jemand füllt.
    // Ein erfundenes Ergebnis zeigte keine FORM, sondern nur ein Resultat — und
    // ein Resultat vor der Wahl ist genau die Verankerung, die §12.1 verbietet
    // (deshalb stehen dort auch keine Beispielmarken auf den Karten).
  },
  'd.primary': {
    goal: 'propose the PRIMARY archetype of this brand — the one that carries how they behave.',
    quality: [
      'It names exactly one of the twelve catalogue archetypes.',
      'The prose and the stored value name the same archetype.',
      'The BASIS line quotes one of their own sentences as the reason.',
      'Where their answers and their appearance disagree, the answers win and the text says so.',
    ],
    antiPatterns: [
      'An informal name stored instead of a catalogue archetype.',
      'A draft where two archetypes are equally defensible.',
      'A choice derived from the pitch alone.',
    ],
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Der Schöpfer — „auch wenn es die vierte Auflage ist" ist euer Satz, nicht der einer Druckerei.',
        en: 'The Creator — "even for a fourth edition" is your sentence, not a printer\'s.',
      },
      {
        de: 'Der Fürsorgliche — ihr habt dreimal gesagt, dass ihr vorher anruft, wenn jemand zum ersten Mal '
          + 'vor einer Kamera steht.',
        en: 'The Caregiver — you said three times that you call ahead when somebody stands in front of a '
          + 'camera for the first time.',
      },
    ),
    rules: [
      ARCHETYPE_PAIRS_PENDING,
      'Derive it from three things, in this order of weight: (1) the hypothesis you drew from their '
      + 'appearance, (2) what they said in this conversation about how their brand behaves at a party, '
      + 'which trait it must never have, which brand personality they admire and what people should feel '
      + 'when dealing with them, (3) the pitch and the tone of their existing texts.',
      'What they SAID about themselves outweighs what you read off their appearance: the appearance is '
      + 'where they are, the answers are where they mean to be. Where the two disagree, follow the '
      + 'answers — the disagreement itself gets its own field later.',
      ARCHETYPE_COHERENCE_RULE,
      ARCHETYPE_TWO_CANDIDATES_RULE,
      'In the BASIS line of your turn, say in one sentence WHY this archetype and which of their own '
      + 'sentences carries it. A choice they cannot trace back to something they said is one they will '
      + 'confirm without believing.',
      'If neither the conversation nor the fields say anything about how this brand behaves, do not pick '
      + 'from the pitch alone: ask.',
    ],
  },
  'd.secondary': {
    goal: 'propose the SECONDARY archetype — the one that keeps the primary from becoming a cliché.',
    quality: [
      'It is a different archetype from the primary.',
      'The BASIS line says what the pair does: how the second keeps the first bearable.',
      'It explains a note in their answers that the primary does not.',
      'It is a catalogue name, not an informal one.',
    ],
    antiPatterns: [
      'The same archetype as the primary, in other words.',
      'A second name with no relationship to the first.',
      'A secondary guessed while the primary is missing.',
    ],
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    // DIE EINZIGE REGEL DIESER SESSION, DIE EIN TEST ENTSCHEIDEN KANN (Paket 2b,
    // Audit Teil 3 Nr. 4): der zweite Archetyp darf nicht der erste sein. Beide
    // Felder tragen eine stabile Katalog-Id (`sage`), der Vergleich ist also
    // exakt — und `mentionsNone` mit Quelle ist genau die Frage „steht das hier
    // nicht drin?". Fehlt der primäre Wert, prüft sie nichts (fail-open).
    invariants: [{ kind: 'mentionsNone', of: 'd.primary' }],
    examples: pathExamples(
      {
        de: 'Der Weise als Zweiter — er hält den Schöpfer vom Schwärmen ab: ihr erklärt, warum ein Papier '
          + 'durchscheint, bevor ihr es empfehlt.',
        en: 'The Sage second — it keeps the Creator from mere enthusiasm: you explain why a paper shows '
          + 'through before you recommend it.',
      },
      {
        de: 'Der Entdecker als Zweiter — er hält den Fürsorglichen davon ab, betulich zu werden.',
        en: 'The Explorer second — it keeps the Caregiver from turning fussy.',
      },
    ),
    rules: [
      ARCHETYPE_PAIRS_PENDING,
      'The primary archetype they confirmed is in the inputs. The secondary MUST be a different one: it '
      + 'is the counterweight, the trait that makes the primary bearable and specific. A Sage with a '
      + 'Jester secondary explains without lecturing; a Hero with a Caregiver secondary demands without '
      + 'trampling. Say that relationship in the BASIS line — the pair is the point, not the second name.',
      'Derive it from the same material as the primary: the hypothesis, what they said in this '
      + 'conversation (party behaviour, the trait they never want, the brand personality they admire, the '
      + 'feeling they want to leave behind) and the tone of their texts. Look for the note that the '
      + 'primary does NOT explain — that note is the secondary.',
      ARCHETYPE_COHERENCE_RULE,
      ARCHETYPE_TWO_CANDIDATES_RULE,
      'If the primary archetype is missing from the inputs, do not guess it in order to pick a second '
      + 'one: ask for it instead.',
    ],
  },
  'd.gapReveal': {
    goal: 'put their self-image next to their outside image and name the difference.',
    quality: [
      'It says in one sentence where the two agree.',
      'It names the difference plainly, without softening it.',
      'It points at the phrase in their texts that sounds like the other archetype.',
      'It gives no advice — the finding is the value.',
    ],
    antiPatterns: [
      'A reassuring closing sentence.',
      '"There are elements of both."',
      'A gap invented because a finding was expected.',
    ],
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Ihr wollt als Schöpfer gelesen werden, eure Seite klingt aber an drei Stellen nach dem '
          + 'Herrscher: „Wir arbeiten ausschließlich mit Verlagen."',
        en: 'You want to be read as the Creator, but in three places your site sounds like the Ruler: "we '
          + 'work exclusively with publishers".',
      },
      {
        de: 'Selbstbild und Außenbild treffen sich beim Fürsorglichen — nur die Preisliste spricht wie ein '
          + 'Herrscher: „Absagen unter 48 Stunden werden voll berechnet."',
        en: 'Self-image and outside image meet at the Caregiver — only the price list speaks like a Ruler: '
          + '"cancellations within 48 hours are charged in full".',
      },
    ),
    rules: [
      'Self-image = the archetypes they chose. Outside image = the hypothesis you drew from their '
      + 'appearance. Say in two to four sentences where the two agree and, more importantly, where they '
      + 'do not.',
      'NAME THE DIFFERENCE HONESTLY, NEVER SMOOTH IT OVER. "You want to come across as the Rebel, but '
      + 'your texts sound like the Caregiver" is the sentence this field exists for. Do not soften it '
      + 'into "there are elements of both", do not add a reassuring closing sentence, and do not turn it '
      + 'into advice — the finding is the value here, and it is theirs to act on.',
      'Where they AGREE, say that just as plainly and in one sentence. A confirmed match is a real '
      + 'result, and inventing a gap to have something to report is the same failure as hiding one.',
      'Point at the evidence: which phrase in their texts sounds like the other archetype. A difference '
      + 'without a place to look at is an accusation.',
    ],
    pathRules: {
      relaunch: [
        'This is a relaunch: their appearance is years of accumulated decisions, not a mistake. Describe '
        + 'the gap as distance travelled, not as a verdict on their past.',
      ],
      new: [
        'This is a new brand: there may be almost no outside image yet. If the hypothesis rests on '
        + 'nothing but their own description, say exactly that in one sentence and stop — a gap you '
        + 'cannot see is one you must not report.',
      ],
    },
  },
  'd.party': {
    goal: 'capture how this brand would behave as a person at a party.',
    quality: [
      'It describes behaviour, not adjectives.',
      'A stranger could act it out.',
      'It also says what that person does NOT do at the party.',
      'It is one person, not a committee.',
    ],
    antiPatterns: [
      'Three adjectives: open, friendly, honest.',
      'A description of the founder rather than of the brand.',
      'A guest everybody likes and nobody remembers.',
    ],
    ladder: {
      opening: 'the brand as a person at a party — what they do in the first ten minutes.',
      probes: [
        'who do they end up talking to, and about what?',
        'what do they never do at that party?',
      ],
      reframes: [
        'if the answer is adjectives, ask what that person actually does when they arrive',
        'if the person is likeable to everybody, ask who at that party would find them annoying',
      ],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: 'Steht am Rand, redet mit einem Menschen zwei Stunden über dessen Familienalbum und geht früh.',
        en: 'Stands at the edge, talks to one person about their family album for two hours, and leaves '
          + 'early.',
      },
      {
        de: 'Merkt sich, wer nicht fotografiert werden will, und fragt kein zweites Mal — hält aber keine '
          + 'Rede.',
        en: 'Notices who does not want to be photographed and does not ask twice — but never makes a speech. '
          + 'Notices who does not want to be photographed and does not ask twice — but never makes a speech.',
      },
    ),
  },
  'd.never': {
    goal: 'capture the one trait this brand must never have.',
    quality: [
      'It is one trait, and this brand could plausibly drift into it.',
      'It excludes something — some respectable brand somewhere has that trait.',
      'It is more than the opposite of a virtue.',
      'They can name a sentence they would refuse to write because of it.',
    ],
    antiPatterns: [
      'A trait nobody wants: dishonest, unprofessional, arrogant.',
      'The exact opposite of a value they already named.',
      'A list of five traits.',
    ],
    ladder: {
      opening: 'the one trait this brand must never have.',
      probes: [
        'where do you feel yourselves drifting towards it?',
        'which sentence would you refuse to write because of it?',
      ],
      reframes: ['if the trait is one nobody wants, ask which respectable trait would still be wrong for them'],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: 'Belehrend. Wir erklären, warum eine Zeile umbricht, aber wir sagen niemandem, dass er den '
          + 'falschen Geschmack hat.',
        en: 'Preachy. We explain why a line breaks where it does, but we never tell anybody their taste is '
          + 'wrong.',
      },
      {
        de: 'Aufgeregt. Kein „nur noch zwei Termine frei" — dafür ruft hier niemand an.',
        en: 'Breathless. No "only two slots left" — that is not what people call for.',
      },
    ),
  },
  'd.admired': {
    goal: 'capture a brand whose personality they admire and what exactly it is about that brand.',
    quality: [
      'It names one brand and one thing about it.',
      'The thing named is a behaviour, not a logo or a budget.',
      'It also says what they would NOT copy from that brand.',
      'The brand comes from another industry, or they say why it does not.',
    ],
    antiPatterns: [
      'A famous name with "they just do everything right".',
      'Admiration for a marketing budget instead of a behaviour.',
      'A competitor named as a template to copy.',
    ],
    ladder: {
      opening: 'one brand whose personality they admire, and the exact thing about it.',
      probes: [
        'what does that brand DO that you noticed?',
        'what about them would be wrong for you?',
      ],
      reframes: ['if the answer is a logo or a budget, ask what that brand does that a small company could do too'],
    },
    examples: pathExamples(
      {
        de: 'Ein Hersteller, der seit Jahren dieselbe Reparaturanleitung beilegt, statt jede Saison eine neue '
          + 'Kampagne zu fahren. Das ständige Predigen der eigenen Haltung wäre uns zu viel.',
        en: 'A manufacturer that has enclosed the same repair instructions for years instead of running a new '
          + 'campaign every season. The constant preaching about their own stance would be too much for us.',
      },
      {
        de: 'Ein Röster, der auf jede Tüte schreibt, was der Bauer bekommen hat. Der belehrende Ton wäre uns '
          + 'zu viel.',
        en: 'A roaster who prints on every bag what the farmer was paid. The lecturing tone would be too much '
          + 'for us.',
      },
    ),
  },
  'd.emotion': {
    goal: 'capture what people should feel when they interact with this brand.',
    quality: [
      'It is one feeling, in a word a person would actually use.',
      'It says at which moment that feeling should arrive.',
      'A different feeling would be plausible here — so this one is a choice.',
      'It is a feeling, not a judgement about the company.',
    ],
    antiPatterns: [
      '"Trust", with no moment attached.',
      'Three feelings at once.',
      'A judgement in place of a feeling: "they should think we are professional".',
    ],
    ladder: {
      opening: 'the one feeling people should leave with, and at which moment.',
      probes: [
        'at which point in dealing with you should that feeling arrive?',
        'which feeling would be wrong here, even though others in your industry aim for it?',
      ],
      reframes: [
        'if the answer is "trust", ask what has to happen before somebody feels it',
        'if there are three, ask which one they would keep if they had to drop the others',
      ],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: 'Erleichterung — in dem Moment, in dem jemand merkt, dass sein Manuskript nicht kürzer werden '
          + 'muss.',
        en: 'Relief — at the moment somebody realises their manuscript does not have to get shorter.',
      },
      {
        de: 'Ruhe. Ist der Termin bestätigt, soll niemand mehr überlegen, was er anziehen muss.',
        en: 'Calm. Once the appointment is confirmed, nobody should still be wondering what to wear.',
      },
    ),
  },
  'd.voiceSamples': {
    goal: 'write EXACTLY THREE example sentences in the voice of this brand — three lines, no more and '
      + 'no fewer.',
    quality: [
      'Exactly three lines, from three different everyday situations.',
      'Each one is ordinary speech, not a slogan.',
      'The primary sets the attitude, the secondary keeps it from tipping into caricature.',
      'You could tell them apart from any competent brand text.',
    ],
    antiPatterns: [
      'Three variations of the same sentence.',
      'Taglines or headlines instead of speech.',
      'A call to action.',
    ],
    ladder: {
      opening: 'three sentences in their voice, then let them pick or correct.',
      probes: ['which of the three sounds least like you, and what is wrong with it?'],
      reframes: ['if all three feel right, ask which one they would actually send tomorrow'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'we', tense: 'present' },
    examples: pathExamples(
      {
        de: '- Der Satz steht, aber das Papier trägt ihn nicht.\n- Vor Oktober schaffen wir das nicht — '
          + 'ehrlich gesagt frühestens im November.\n- 2.400 Euro, weil jede Seite einzeln umbrochen wird und '
          + 'nicht aus einer Vorlage kommt.',
        en: '- The typesetting works, but the paper cannot carry it.\n- We will not manage it before October '
          + '— honestly, November at the earliest.\n- 2,400 euros, because every page is set by hand and not '
          + 'poured into a template.',
      },
      {
        de: '- Der Termin steht, die Bilder kommen am Freitag.\n- Das Licht ist gut, der Hintergrund nicht — '
          + 'besser jetzt gesagt als hinterher.\n- Ab Freitag gilt der neue Preis, deshalb melden wir uns '
          + 'heute.',
        en: '- The appointment is fixed, the pictures arrive on Friday.\n- The light is good, the background '
          + 'is not — better said now than afterwards.\n- The new price starts on Friday, which is why we are '
          + 'getting in touch today.',
      },
    ),
    rules: [
      'They must be sentences THIS brand would actually say: pick three everyday situations from what you '
      + 'know about them (greeting someone, saying no, explaining a price, delivering bad news, describing '
      + 'what they do) and write one line for each. Three sentences from three different situations are '
      + 'worth more than three variations of the same one.',
      'This is not a slogan collection. No taglines, no headlines, no calls to action — those come later '
      + 'in their own chapter. What belongs here is ordinary speech in an unmistakable voice.',
      'Carry the primary and the secondary archetype AND their values into the sound: the primary sets '
      + 'the attitude, the secondary keeps it from tipping into caricature. If you cannot hear the '
      + 'difference between your three sentences and any competent brand text, they are not there yet.',
      'One line per sentence, no labels, no explanation of the situation — the sentence carries itself. '
      + 'Where you want to say what it is for, say it in the BASIS line of your turn.',
    ],
  },
  'd.toneWords': {
    goal: 'name FOUR to SIX tone words for this brand — the words someone would use to describe how it '
      + 'sounds.',
    quality: [
      'Four to six words, one per line, nothing else on the line.',
      'Every word excludes a plausible brand.',
      'Together they describe a voice, not a mood.',
      'They can be held against a finished text as a checklist.',
    ],
    antiPatterns: [
      'Professional, authentic, modern, high-quality — words that exclude nothing.',
      'Explanations or "but not ..." on the line.',
      'Words that describe the industry instead of the voice.',
    ],
    ladder: {
      opening: 'offer four to six words and say which came from their texts and which from the archetype.',
      probes: ['which of these words would you cross out first?'],
      reframes: ['if a word excludes nothing, name a brand it would also fit and ask whether that is right'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: '- karg\n- geduldig\n- handfest\n- unbeeindruckt',
        en: '- spare\n- patient\n- hands-on\n- unimpressed',
      },
      {
        de: '- nüchtern\n- vorausschauend\n- warm ohne Zucker\n- knapp',
        en: '- sober\n- one step ahead\n- warm without sugar\n- brief',
      },
    ),
    siteAnalysis: true,
    rules: [
      'Build them from the tone analysis of their existing texts, the archetype they chose and the '
      + 'feeling they want to leave behind. Where the analysis and the archetype disagree, follow the '
      + 'archetype: this is the tone they are going TO, not the one they are coming from.',
      'One adjective or short phrase per line, nothing else — no explanation, no pairs, no "but not ...". '
      + 'They are meant to be read at a glance and used as a checklist against a finished text.',
      'Every word has to EXCLUDE something. "Professional", "authentic", "modern" and "high-quality" '
      + 'exclude nothing — no brand aims to sound unprofessional. If you cannot name a plausible brand '
      + 'that the word rules out, it is the wrong word.',
    ],
  },
  'd.vocabulary': {
    goal: 'build their vocabulary list — the words they use and the words they avoid.',
    quality: [
      'Their own never-words are carried over unchanged, in their wording.',
      'Every line carries one word and its side.',
      'The use side contains words their customers actually say.',
      'A reason is given only where the avoidance is not obvious.',
    ],
    antiPatterns: [
      'Arguing with one of their own no-go words.',
      'A trade term banned only because it sounds technical.',
      'A list with none of their own words in it.',
    ],
    ladder: {
      opening: 'the words they would never use — in their wording, unchanged.',
      probes: ['which word in your own texts makes you wince when you read it back?'],
      reframes: ['if a term is banned only for sounding technical, ask whether their customers use it every day'],
    },
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: '- benutzen: gesetzt\n- benutzen: Bogen\n- meiden: Premium\n- meiden: Manufaktur — steht '
          + 'inzwischen auf jeder Tiefkühlpizza',
        en: '- use: typeset\n- use: sheet\n- avoid: premium\n- avoid: artisanal — it is on frozen pizza now',
      },
      {
        de: '- benutzen: Abzug\n- benutzen: Termin\n- meiden: Traumbilder\n- meiden: unschlagbar',
        en: '- use: print\n- use: appointment\n- avoid: dream pictures\n- avoid: unbeatable',
      },
    ),
    rules: [
      'START FROM THEIR OWN ANSWER. The words they said they would NEVER use are already in the inputs or '
      + 'in this conversation: take those over unchanged into the avoid side, in their wording, and never '
      + 'argue with them about one. This field is theirs first and yours second.',
      'Then add three to five suggestions per side, derived from the archetype and the tone words: words '
      + 'this voice would reach for, and words that would break it.',
      'One word or short phrase per line. Mark the side at the start of the line, in this shape: '
      + '"- use: <word>" and "- avoid: <word>". Keep the use side first.',
      'Give an avoid word a reason only where it is not obvious, in half a sentence after a dash — their '
      + 'own no-go words need none, and explaining them back to them reads like a correction.',
      'Industry jargon is not automatically a no-go: a word their customers use every day belongs on the '
      + 'use side, even if it sounds technical. What belongs on the avoid side is what sounds like an '
      + 'agency wrote it.',
    ],
  },

  // ── E · Manifest ────────────────────────────────────────────────────────
  // EIN Betrieb je Pfad (zweiköpfige Agentur / Agentur seit 2011) — Warmup,
  // Statements, Manifest und Ankerzeile bauen aufeinander auf, das Beispiel
  // ebenso.
  'e.warmup1': {
    goal: 'capture what makes them angry about their own industry.',
    quality: [
      'It names something concrete that happens in their industry.',
      'The anger is aimed at a practice, not at customers.',
      'Somebody in the industry would object to hearing it said out loud.',
      'They themselves do it differently, and can say how.',
    ],
    antiPatterns: [
      'Anger at customers for not paying enough.',
      'A complaint about regulation nobody in the room controls.',
      'A grievance they are guilty of themselves.',
    ],
    ladder: {
      opening: 'what makes them angry about their own industry.',
      probes: [
        'when did you last see it happen?',
        'do you do it differently — and how exactly?',
      ],
      reframes: [
        'if the anger is aimed at customers, ask what the industry has taught those customers',
        'if it is about rules, ask what colleagues do that they would never do',
      ],
    },
    examples: pathExamples(
      {
        de: 'Dass Angebote absichtlich unvergleichbar gemacht werden — vier Seiten Positionen, damit niemand '
          + 'den Stundensatz ausrechnen kann.',
        en: 'That quotes are made deliberately incomparable — four pages of line items so nobody can work out '
          + 'the hourly rate.',
      },
      {
        de: 'Rahmenverträge, die sich verlängern, wenn man die Kündigung um zwei Tage verpasst. Das ist kein '
          + 'Geschäftsmodell, das ist eine Falle.',
        en: 'Retainers that renew if you miss the notice period by two days. That is not a business model, it '
          + 'is a trap.',
      },
    ),
  },
  'e.warmup2': {
    goal: 'capture what they wish more people understood about their work.',
    quality: [
      'It names one misunderstanding, not a general lack of appreciation.',
      'It is something they could show, not only claim.',
      'Knowing it would change what a customer asks for.',
      'It is not a complaint about price.',
    ],
    antiPatterns: [
      '"That good work costs money."',
      'A lecture about the whole industry.',
      'Something their own website already explains well.',
    ],
    ladder: {
      opening: 'what they wish more people understood about the work.',
      probes: [
        'what do people ask for that they would not ask for if they knew?',
        'how would you show it in two minutes?',
      ],
      reframes: ['if the answer is about price, ask what exactly the price pays for that nobody sees'],
    },
    examples: pathExamples(
      {
        de: 'Dass die Idee nicht das Teure ist. In den meisten Projekten kostet das Abstimmen dreimal so viel '
          + 'wie das Entwerfen.',
        en: 'That the idea is not the expensive part. In most projects the rounds of approval cost three '
          + 'times as much as the design work.',
      },
      {
        de: 'Dass die ersten sechs Wochen nichts mit Kreativität zu tun haben, sondern damit, ob jemand die '
          + 'Zahlen des Kunden versteht.',
        en: 'That the first six weeks have nothing to do with creativity and everything to do with whether '
          + 'somebody understands the client\'s numbers.',
      },
    ),
  },
  'e.statements': {
    goal: `draft all ${MANIFESTO_STATEMENT_COUNT} statement openers the manifesto will be built from — `
      + 'one line per opener, in the five groups of the instrument (belief, commitment, energy, stance, '
      + 'promise), filled from what they have already said.',
    quality: [
      `There are ${MANIFESTO_STATEMENT_COUNT} lines, and every group of the instrument is represented.`,
      'Every statement takes a side somebody could refuse.',
      'Each one is traceable to an answer they gave.',
      'They are sentences somebody would say, not headlines.',
      'The strongest ones stand out without needing a marker.',
    ],
    antiPatterns: [
      'Statements everybody in the industry would sign.',
      'A statement that only praises the brand.',
      'A filled-in opener with nothing behind it.',
    ],
    form: { person: 'we', tense: 'present' },
    effort: { minutes: 5, turns: 4 },
    examples: pathExamples(
      {
        de: '- Wir glauben, dass die teuerste Runde die ist, die niemand gebraucht hätte.\n- Wir weigern uns, '
          + 'einen Entwurf zu zeigen, bevor die Frage feststeht.',
        en: '- We believe the most expensive round is the one nobody needed.\n- We refuse to show a draft '
          + 'before the question has been settled.',
      },
      {
        de: '- Wir glauben, dass Bleiben wichtiger ist als Auffallen.\n- Wir weigern uns, Verträge zu '
          + 'verlängern, die niemand nutzt.',
        en: '- We believe staying matters more than standing out.\n- We refuse to renew a contract nobody is '
          + 'using.',
      },
    ),
  },
  'e.composition': {
    goal: 'settle the tone, the length and the intended use of the manifesto.',
    quality: [
      'Tone, length and use are each decided, none left open.',
      'The use names a place where it will really be read.',
      'The length fits that place.',
      'The tone is one of the offered ones, not a mixture.',
    ],
    antiPatterns: [
      '"All of them" as the intended use.',
      'A tone chosen because it sounds impressive.',
      'A length nobody will read where it is meant to appear.',
    ],
    // EINE ENTSCHEIDUNG JE ZUG (Paket 2b, Audit Teil 1 Spalte d): die alte
    // Eröffnung verlangte Ton, Länge und Verwendung in EINEM Zug — gegen den
    // Leitsatz „runterbrechen, bevor jemand zu viel erzählt" und gegen die
    // Zug-Regel (Content-Spec §1.2.2). Jetzt: die Verwendung zuerst, weil der
    // ORT die beiden anderen bestimmt, dann Länge, dann Ton.
    ladder: {
      opening: 'start with the use — where will this be read first?',
      probes: [
        'what length does that place carry?',
        'which of the offered tones fits that place — one of them, not a mixture?',
      ],
      reframes: ['if every use is ticked, ask which one it has to work for on day one'],
    },
    answers: { maxProbes: 2 },
    form: { person: 'none', tense: 'present' },
    effort: { minutes: 2, turns: 3 },
    examples: pathExamples(
      {
        de: 'Ton: nüchtern · Länge: kurz, unter 120 Wörtern · Verwendung: die erste Seite jedes Angebots',
        en: 'Tone: sober · Length: short, under 120 words · Use: the first page of every proposal',
      },
      {
        de: 'Ton: direkt · Länge: mittel · Verwendung: das Plakat im Besprechungsraum und die Seite „Über '
          + 'uns"',
        en: 'Tone: direct · Length: medium · Use: the poster in the meeting room and the About page',
      },
    ),
  },
  'e.manifesto': {
    goal: 'draft the manifesto of this brand from the confirmed statements and the chosen composition.',
    quality: [
      'It takes a side that would put some readers off.',
      'Every line can be read aloud without wincing.',
      'It is built from the statements they marked, not from new material.',
      'It ends without a call to action.',
    ],
    antiPatterns: [
      'A mission statement stretched over ten lines.',
      'A manifesto that could hang in any company of this industry.',
      'A closing sales line.',
    ],
    form: { person: 'we', tense: 'present' },
    effort: { minutes: 3, turns: 3 },
    examples: pathExamples(
      {
        de: 'Die teuerste Runde ist die, die niemand gebraucht hätte.\nDeshalb klären wir die Frage, bevor '
          + 'wir entwerfen.\nUnd sagen ab, wenn die Frage nicht zu klären ist.',
        en: 'The most expensive round is the one nobody needed.\nSo we settle the question before we '
          + 'design.\nAnd we say no when the question cannot be settled.',
      },
      {
        de: 'Der beste Auftritt ist der, den ein Kunde in drei Jahren noch selbst pflegen kann.\nWir zählen '
          + 'keine Preise.\nWir zählen, was übrig bleibt.',
        en: 'The best brand is the one a client can still maintain three years later.\nWe do not count '
          + 'awards.\nWe count what is left.',
      },
    ),
  },
  'e.anchorLine': {
    goal: 'settle which single line of the manifesto is the one they would put on a wall.',
    quality: [
      'It is one line from the manifesto, word for word.',
      'It stands alone without the lines around it.',
      'It is short enough to repeat from memory.',
      'It says something, not merely something pleasant.',
    ],
    antiPatterns: [
      'A new line written for the occasion.',
      'The most general line of the manifesto.',
      'Two lines joined into one.',
    ],
    ladder: {
      opening: 'pick the one line they would put on a wall — from the manifesto itself.',
      probes: ['which line would you still want to say in five years?'],
      reframes: ['if they want to write a new one, point back to the manifesto and ask which line comes closest'],
    },
    answers: { maxProbes: 1 },
    // Der Wert ist eine bereits bestätigte ZEILE — ihre Form gehört der Quelle.
    // `none` sagt hier nur, dass diese Session dem Wert keine eigene Person
    // aufzwingt; ein Entwurfs-Auftrag entsteht daraus ohnehin nie
    // (`generator: 'none'`).
    form: { person: 'none', tense: 'present' },
    // Der Wähler zeigt Zeilen des Manifests — der gewählte Satz MUSS deshalb
    // darin vorkommen (Plan §3a: „e.anchorLine ist ein Satz aus e.manifesto").
    invariants: [{ kind: 'sentenceOf', of: 'e.manifesto' }],
    examples: pathExamples(
      {
        de: 'Die teuerste Runde ist die, die niemand gebraucht hätte.',
        en: 'The most expensive round is the one nobody needed.',
      },
      {
        de: 'Wir zählen, was übrig bleibt.',
        en: 'We count what is left.',
      },
    ),
  },

  // ── E+ · Verbale Identität ──────────────────────────────────────────────
  // EIN Betrieb je Pfad (Innenarchitektur für kleine Wohnungen / für Praxen und
  // Büros). Bis Paket 2b liefen E und E+ auf demselben Betrieb; die Streuung der
  // Kapitel-Branchen (s. Kopf) wiegt schwerer als dieser Bezug — die Kette
  // Ankerzeile → verbales Erkennungszeichen zeigt sich innerhalb dieses Kapitels
  // an seiner eigenen Zeile.
  'ep.taglines': {
    goal: 'propose tagline candidates and settle on the one that carries this brand.',
    quality: [
      'Seven words at most.',
      'It says something only this brand could claim.',
      'It works without the logo next to it.',
      'It can be said out loud without a second look.',
    ],
    antiPatterns: [
      'A category description: "your partner for X".',
      'A rhyme that means nothing.',
      'A line that would fit the competitor after swapping one word.',
    ],
    ladder: {
      opening: 'offer the candidates, name the one you would take and say why.',
      probes: ['which of these would you actually say on the phone?'],
      reframes: ['if they like the one that describes the category, ask what it says that a competitor could not'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present', maxWords: 7 },
    examples: pathExamples(
      {
        de: 'Erst messen, dann möblieren.',
        en: 'Measure first, furnish second.',
      },
      {
        de: 'Wir planen für den Montag.',
        en: 'We plan for the Monday.',
      },
    ),
  },
  'ep.boilerplates': {
    goal: 'draft the three boilerplates of this brand: the one-line bio, the short paragraph and the '
      + 'full paragraph.',
    quality: [
      'Three lengths: a bio under 160 characters, a short paragraph, a full paragraph.',
      'Each one works alone — the short one is not the long one cut off.',
      'The bio says what they do and for whom, and nothing else.',
      'None of the three uses a superlative.',
    ],
    antiPatterns: [
      'The same text three times at three lengths.',
      'A bio that only names the industry.',
      'A press-release voice nobody speaks.',
    ],
    form: { person: 'we', tense: 'present' },
    examples: pathExamples(
      {
        de: '## Bio\nInnenarchitektur für kleine Wohnungen in Leipzig — wir messen, bevor jemand kauft.',
        en: '## Bio\nInterior design for small flats in Leipzig — we measure before anybody buys.',
      },
      {
        de: '## Bio\nInnenarchitektur für Praxen und Büros. Wir planen für den Montag, nicht für das Foto.',
        en: '## Bio\nInterior design for practices and offices. We plan for the Monday, not for the '
          + 'photograph.',
      },
    ),
  },
  'ep.keyMessages': {
    goal: 'draft the key messages of this brand, one set per audience.',
    quality: [
      'One set per audience from the audience sketch, none invented.',
      'Each message answers something that audience really worries about.',
      'Three messages per audience at most.',
      'No message repeats the tagline.',
    ],
    antiPatterns: [
      'The same three messages for every audience.',
      'A set for an audience that is not in the sketch.',
      'A feature list disguised as a message.',
    ],
    form: { person: 'we', tense: 'present' },
    examples: pathExamples(
      {
        de: '## Mieterinnen und Mieter\n- Nichts von dem, was wir planen, muss beim Auszug zurückgebaut '
          + 'werden.\n- Wir sagen vorher, was sich nicht lohnt.',
        en: '## Tenants\n- Nothing we plan has to be undone when the lease ends.\n- We say in advance what is '
          + 'not worth doing.',
      },
      {
        de: '## Praxen im laufenden Betrieb\n- In den ersten sechs Wochen zählt nur, dass der Betrieb '
          + 'weiterläuft.\n- Kein Termin wird ohne Rücksprache verschoben.',
        en: '## Practices that stay open during the work\n- For the first six weeks the only thing that '
          + 'counts is that the practice keeps running.\n- No appointment is moved without asking first.',
      },
    ),
  },
  'ep.vocabulary': {
    goal: 'derive the words this brand uses and the words it avoids, as one list for everyday writing.',
    quality: [
      'Their own never-words are carried over unchanged.',
      'Every entry names its side.',
      'It is usable while writing, not only while reviewing.',
      'It adds words to the use side, not only bans.',
    ],
    antiPatterns: [
      'A ban list with nothing on the use side.',
      'Their words rewritten into other wording.',
      'Entries that merely repeat the tone words.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: '- benutzen: Grundriss\n- benutzen: Aufmaß\n- meiden: Wohntraum\n- meiden: hochwertig '
          + 'ausgestattet',
        en: '- use: floor plan\n- use: survey\n- avoid: dream home\n- avoid: high-end fittings',
      },
      {
        de: '- benutzen: Bestandsaufnahme\n- benutzen: Bauabschnitt\n- meiden: Wohlfühlatmosphäre\n- meiden: '
          + 'Transformation',
        en: '- use: survey\n- use: construction phase\n- avoid: feel-good atmosphere\n- avoid: transformation '
          + '- use: survey\n- use: construction phase\n- avoid: feel-good atmosphere\n- avoid: transformation',
      },
    ),
  },
  'ep.distinctiveAsset': {
    goal: 'settle which line becomes the verbal signature of this brand.',
    quality: [
      'It is one line that is already confirmed elsewhere in the foundation.',
      'It could be recognised without the brand name next to it.',
      'It survives being repeated for years.',
      'It is not a description of what they sell.',
    ],
    antiPatterns: [
      'A newly invented line.',
      'A line that only works next to the logo.',
      'A seasonal campaign slogan.',
    ],
    ladder: {
      opening: 'confirm the one line that becomes the verbal signature.',
      probes: ['would you still want to say it in five years?'],
      reframes: ['if they want a new line, ask what the anchor line is missing'],
    },
    answers: { maxProbes: 1 },
    // Der Wert ist eine bereits bestätigte ZEILE — ihre Form gehört der Quelle.
    // `none` sagt hier nur, dass diese Session dem Wert keine eigene Person
    // aufzwingt; ein Entwurfs-Auftrag entsteht daraus ohnehin nie
    // (`generator: 'none'`).
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Erst messen, dann möblieren.',
        en: 'Measure first, furnish second.',
      },
      {
        de: 'Wir planen für den Montag.',
        en: 'We plan for the Monday.',
      },
    ),
  },

  // ── F · Name & Prüfung ──────────────────────────────────────────────────
  // EIN Betrieb je Pfad (freie Texterin, die ihren Namen sucht / freier
  // Entwickler, der sich umbenennt): Typ, Geschmack, No-Gos, Kandidaten,
  // Shortlist, Prüfung, Kriterien und Entscheidung sind EINE Kette — die
  // Beispiele tragen dieselben Namen durch, sonst zeigt die Shortlist Namen, die
  // nie Kandidaten waren. UND SIE TRAGEN SIE IN BEIDEN SPRACHEN GLEICH: ein
  // Namens-Kandidat wechselt nicht mit der Oberflächensprache (s. Kopf).
  'f.nameType': {
    goal: 'settle which kind of name fits this brand.',
    quality: [
      'It is one of the nine catalogue types.',
      'The reason names what that type buys and what it costs.',
      'It fits the no-gos already given.',
      'It leaves room for more than three candidates.',
    ],
    antiPatterns: [
      'A type chosen because famous brands use it.',
      'Two types at once.',
      'A descriptive type chosen while the no-gos rule out every describing word.',
    ],
    ladder: {
      opening: 'name the type you would take, say what it buys and what it costs, then offer the types.',
      probes: ['is there a type you would rule out straight away?'],
      reframes: ['if they pick a descriptive name, say plainly what that costs in protectability'],
    },
    answers: { maxProbes: 1 },
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Erfundener Name — kurz, schützbar, sagt nichts über Texte und passt auch noch, wenn später '
          + 'Konzeptarbeit dazukommt.',
        en: 'An invented name — short, protectable, says nothing about copywriting, and still fits if concept '
          + 'work comes later.',
      },
      {
        de: 'Gründername bleibt, aber ohne Zusatz: „Ohlsen" statt „Ohlsen Webentwicklung".',
        en: 'The founder name stays, but without the add-on: "Ohlsen" instead of "Ohlsen Webentwicklung".',
      },
    ),
  },
  'f.taste': {
    goal: 'capture three to five brand names they love, from any industry, and why each one works for them.',
    quality: [
      'Three to five names, each with a reason.',
      'The reason is about the name itself: sound, length, image.',
      'At least one comes from outside their own industry.',
      'A pattern is visible across the reasons.',
    ],
    antiPatterns: [
      'Names loved because the company behind them is successful.',
      'A list with no reasons.',
      'Nothing but competitor names.',
    ],
    ladder: {
      opening: 'three to five names they love, each with the reason.',
      probes: [
        'what do those names have in common when you say them out loud?',
        'which of them would you never have dared to choose yourselves?',
      ],
      reframes: ['if the reason is the company, ask what they would think of the name if the company were unknown'],
    },
    examples: pathExamples(
      {
        de: 'Kolibri — man sieht sofort ein Bild. Anker — kurz und am Telefon sofort verstanden. Marlen — '
          + 'weich, zwei Silben, erklärt nichts.',
        en: 'Kolibri — you see a picture at once. Anker — short and understood on the phone straight away. '
          + 'Marlen — soft, two syllables, explains nothing.',
      },
      {
        de: 'Nordlicht, weil es die Gegend mitnimmt, ohne sie zu buchstabieren. Hain, weil man es nach einmal '
          + 'Hören schreiben kann. Kiesel, weil es ein einziges Wort ist.',
        en: 'Nordlicht, because it carries the region without spelling it out. Hain, because you can write it '
          + 'down after hearing it once. Kiesel, because it is a single word.',
      },
    ),
  },
  'f.noGos': {
    goal: 'capture the words, styles and lengths that are off-limits for this name.',
    quality: [
      'It names words, styles or lengths that are out, each with a reason.',
      'At least one no-go is about language or region, not taste.',
      'It is short enough to leave a brainstorm room to work.',
      'Somebody else could apply it to a new candidate without asking.',
    ],
    antiPatterns: [
      'A no-go list so long that nothing is left.',
      '"Nothing boring" as a rule.',
      'No-gos with no reason, which nobody can apply to a name they have not seen.',
    ],
    ladder: {
      opening: 'the words, styles and lengths that are out — and why each one.',
      probes: [
        'is there a word that means something else in a language your customers speak?',
        'how long may it be before it stops working on a van door?',
      ],
      reframes: ['if the list rules out everything, ask which three of them are truly non-negotiable'],
    },
    // KEIN Vertagen (Paket 2b, Audit Punkt 7): das ist die persönlichste
    // Geschmacksfrage des ganzen Bausteins („welche Wörter sind tabu?") —
    // dafür braucht niemand jemanden, der gerade nicht am Tisch sitzt.
    answers: { minSubstance: 'short' },
    examples: pathExamples(
      {
        de: 'Kein „Text", kein „Media", nichts mit Bindestrich. Höchstens drei Silben — der Name muss in eine '
          + 'Signatur passen.',
        en: 'No "Text", no "Media", nothing with a hyphen. Three syllables at most — the name has to fit into '
          + 'an email signature.',
      },
      {
        de: 'Nichts mit „dev" oder „digital". Kein Wort, das man buchstabieren muss, wenn ein Kunde am '
          + 'Telefon mitschreibt.',
        en: 'Nothing with "dev" or "digital". No word that has to be spelled out when a client is taking it '
          + 'down over the phone.',
      },
    ),
  },
  'f.candidates': {
    goal: 'propose name candidates that fit the chosen name type, their taste and their no-gos.',
    quality: [
      'Each candidate carries the name type it belongs to.',
      'None of them breaks a stated no-go.',
      'The candidates come from more than one route, not from one word varied.',
      'Each one can be said on the phone without spelling it out.',
    ],
    antiPatterns: [
      'Ten variations of a single word.',
      'Candidates that break the no-gos "as an idea".',
      'A list in which every name is descriptive.',
    ],
    form: { person: 'none', tense: 'present' },
    effort: { minutes: 2, turns: 2 },
    examples: pathExamples(
      {
        de: '- Bogen — erfunden\n- Satzbau — beschreibend, aus dem Handwerk\n- Nordfeld — zusammengesetzt',
        en: '- Bogen — invented\n- Satzbau — descriptive, from the trade\n- Nordfeld — compound',
      },
      {
        de: '- Ohlsen — Gründername\n- Kiesel — abstrakt\n- Tagwerk — bildhaft',
        en: '- Ohlsen — founder name\n- Kiesel — abstract\n- Tagwerk — evocative',
      },
    ),
  },
  'f.shortlist': {
    goal: 'settle which name candidates make the shortlist.',
    quality: [
      'Every entry comes from the candidate list.',
      'Between three and six names.',
      'Each survivor has been said out loud at least once.',
      'None of them breaks a no-go.',
    ],
    antiPatterns: [
      'A new name appearing for the first time at the shortlist stage.',
      'A shortlist of one.',
      'Names kept because they are hard to give up rather than because they work.',
    ],
    ladder: {
      opening: 'narrow the candidates down to the ones worth checking.',
      probes: ['say each one on the phone — which of them needs spelling?'],
      reframes: ['if a new name appears here, put it back into the candidate list first'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    // KEINE `subsetOf f.candidates`-INVARIANTE, und das ist eine Entscheidung:
    // eine Kandidaten-ZEILE trägt laut Content-Spec §10 mehr als den Namen (sie
    // ist „je Namenstyp beschriftet", also „- Bogen — erfunden"). `subsetOf`
    // vergleicht ganze Zeilen; die Shortlist-Zeile „- Bogen" käme darin nie
    // vor, und ein 409 hielte den Menschen von seiner eigenen Auswahl fern.
    // Wenn Paket 3 die Kandidaten in ein Feld mit getrennter Typ-Spalte legt,
    // gehört die Invariante nachgetragen.
    examples: pathExamples(
      {
        de: '- Bogen\n- Satzbau\n- Nordfeld',
        en: '- Bogen\n- Satzbau\n- Nordfeld',
      },
      {
        de: '- Ohlsen\n- Kiesel\n- Tagwerk',
        en: '- Ohlsen\n- Kiesel\n- Tagwerk',
      },
    ),
  },
  'f.checks': {
    goal: 'derive the availability checks for the shortlisted names.',
    quality: [
      'Every shortlisted name has its own block, none missing.',
      'Domain and handle results are stated as indicators, never as legal facts.',
      'A foreign-language finding names the language and the meaning.',
      'Nothing is claimed that was not actually checked.',
    ],
    antiPatterns: [
      'A trademark verdict: "this name is free".',
      'A check reported for a name that is not on the shortlist.',
      'An availability claim with no source behind it.',
    ],
    form: { person: 'none', tense: 'present' },
    effort: { minutes: 3, turns: 2 },
    examples: pathExamples(
      {
        de: '## Bogen\nDomain: bogen.de vergeben, bogen-texte.de frei · Handles: ungeprüft, Suchlink unten · '
          + 'Marke: DPMA-Suche noch offen · Fremdsprache: keine Auffälligkeit',
        en: '## Bogen\nDomain: bogen.de taken, bogen-texte.de free · Handles: unverified, search link below · '
          + 'Trademark: DPMA search still open · Other languages: nothing conspicuous',
      },
      {
        de: '## Kiesel\nDomain: kiesel.de vergeben, kiesel-code.de frei · Handles: ungeprüft · Marke: '
          + 'geführte Suche noch offen · Fremdsprache: keine Auffälligkeit',
        en: '## Kiesel\nDomain: kiesel.de taken, kiesel-code.de free · Handles: unverified · Trademark: '
          + 'guided search still open · Other languages: nothing conspicuous',
      },
    ),
  },
  'f.criteria': {
    goal: 'rate the shortlisted names against the eight criteria.',
    quality: [
      'Only two or three finalists are rated.',
      'Every one of the eight criteria carries a rating, none skipped.',
      'A weak rating stays weak instead of being argued away.',
      'The ratings together point at a name rather than at a tie.',
    ],
    antiPatterns: [
      'All eight criteria rated high for the favourite.',
      'A criterion skipped because it is inconvenient.',
      'Ten names rated instead of three.',
    ],
    // EINE ENTSCHEIDUNG JE ZUG (Paket 2b, Audit Teil 1 Spalte d): „one
    // criterion at a time" waren 16 bis 24 gesprochene Bewertungen in drei
    // Zügen. Die acht Bewertungen stehen im Raster (Chips) — das GESPRÄCH
    // führt je Zug über EIN Kriterium, und das erste ist das entscheidende.
    ladder: {
      opening: 'name the one criterion that would decide it, and compare the finalists on that one first.',
      probes: ['which criterion comes second — and does it change the order?'],
      reframes: ['if every criterion is high, ask where the name is weakest; every name is weak somewhere'],
    },
    effort: { minutes: 2, turns: 3 },
    answers: { maxProbes: 1 },
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: '## Bogen\nSprechbar: gut · Schreibbar: gut · Merkbar: mittel · Schützbar: gut · Passend: mittel '
          + '· Erweiterbar: gut · Frei: offen · Zeitlos: gut',
        en: '## Bogen\nSayable: good · Spellable: good · Memorable: medium · Protectable: good · Fitting: '
          + 'medium · Extendable: good · Available: open · Timeless: good',
      },
      {
        de: '## Kiesel\nSprechbar: gut · Schreibbar: gut · Merkbar: mittel · Schützbar: mittel · Passend: gut '
          + '· Erweiterbar: gut · Frei: offen · Zeitlos: gut',
        en: '## Kiesel\nSayable: good · Spellable: good · Memorable: medium · Protectable: medium · Fitting: '
          + 'good · Extendable: good · Available: open · Timeless: good',
      },
    ),
  },
  'f.decision': {
    goal: 'settle their top three names, in order — first choice first, then the two fallbacks.',
    quality: [
      'Exactly three names, in order.',
      'Every one of them comes from the shortlist.',
      'The reason for first place is supported by one of the criteria.',
      'Second and third are real fallbacks, not filler.',
    ],
    antiPatterns: [
      'A single name with no fallbacks.',
      'A ranking that contradicts the criteria ratings.',
      'A name that never was on the shortlist.',
    ],
    ladder: {
      opening: 'settle the top three, in order, with a reason for first place.',
      probes: ['if the trademark check kills number one, is number two really your next choice?'],
      reframes: ['if only one name is named, ask which two they could live with'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    // DIE WERT-FORM IST EINE LISTE (Paket-1-Befund (b), jetzt entschieden):
    // „top three, in order" ist kein Einzelwert, also kein `memberOf`. Der Wert
    // ist die übliche Listen-Form „- Name" je Zeile, und die REIHENFOLGE der
    // Zeilen IST die Rangfolge — deshalb `subsetOf` (jede Zeile muss aus der
    // Shortlist stammen) und nicht `count`: die Zahl drei steht in den
    // Qualitätsmerkmalen, weil ein 409 auf „nur zwei Namen gefunden" niemandem
    // hilft. Anders als bei `f.shortlist` trägt die Quelle hier nur den Namen.
    invariants: [{ kind: 'subsetOf', of: 'f.shortlist' }],
    examples: pathExamples(
      {
        de: '- Bogen\n- Nordfeld\n- Satzbau',
        en: '- Bogen\n- Nordfeld\n- Satzbau',
      },
      {
        de: '- Kiesel\n- Ohlsen\n- Tagwerk',
        en: '- Kiesel\n- Ohlsen\n- Tagwerk',
      },
    ),
  },

  // ── Ergebnis ────────────────────────────────────────────────────────────
  'result.direction': {
    goal: 'settle which direction fits this brand.',
    quality: [
      'One of the offered directions is chosen, not a mixture.',
      'The reason refers to the archetype or the tone words, not to a colour preference.',
      'It is a direction for the brand, not for one page.',
      'They could explain the choice to somebody who was not in the room.',
    ],
    antiPatterns: [
      'A choice made on colour taste alone.',
      'A mixture of two directions.',
      'The direction that looks the most expensive.',
    ],
    ladder: {
      opening: 'show the directions, name the one that follows from their archetype and tone, and say why.',
      probes: ['which of these would still feel right on an invoice?'],
      reframes: ['if the choice is about colour only, ask which one sounds like their tone words'],
    },
    answers: { maxProbes: 1 },
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Die ruhige Richtung — sie passt zu „knapp" und „zugewandt"; die kontrastreiche wirkt wie ein '
          + 'Werbebanner.',
        en: 'The quiet direction — it matches "brief" and "attentive"; the high-contrast one looks like an '
          + 'advertising banner.',
      },
      {
        de: 'Die warme Richtung, weil unsere Leute wiederkommen sollen und nicht angetrieben werden wollen.',
        en: 'The warm direction, because our people are meant to come back, not to be pushed.',
      },
    ),
  },
  'result.rating': {
    goal: 'capture how helpful this result was — voluntary, and never pressed for.',
    quality: [
      'It is their own answer, given without being pressed.',
      'A low rating is recorded as it stands.',
      'Skipping it is a valid outcome and ends the session.',
    ],
    // ANTI-MUSTER SIND ZURÜCKGEWIESENE WERTE, NICHT GEORGES VERHALTEN (Paket
    // 2b, Audit Teil 1 Spalte c): hier standen drei Prompt-Regeln („nach einem
    // Überspringen nicht noch einmal fragen"). Der Spezialist kann beim
    // Schliessen nur einen WERT zurückweisen; die Führung gehört in die Leiter,
    // und dort steht sie jetzt.
    antiPatterns: [
      'A rating recorded although they skipped the question.',
      'A rating nobody gave, filled in from the mood of the conversation.',
      'A number that is not one of the offered ones.',
    ],
    ladder: {
      opening: 'ask once, plainly, accept a skip as an answer, never ask again after one, and never read '
        + 'the number as a confirmation of the result.',
      // KEINE Nachfragen und keine Umdeutung — beides wäre hier Druck. Die
      // Frage ist ausdrücklich freiwillig (Content-Spec §11), und eine
      // freiwillige Frage, die zweimal gestellt wird, ist keine mehr.
      probes: [],
      reframes: [],
    },
    // KEINE PERSON, WEIL HIER NIEMAND SPRICHT (Paket 2b, Audit Teil 1
    // Spalte g): `fromTeam` war der durchgereichte Default und behauptete,
    // der Wert folge der Weiche Solo/Team — er ist aber eine Ableitung bzw.
    // eine Auswahl, in der kein Mensch einen Satz formuliert.
    form: { person: 'none', tense: 'present' },
    answers: { maxProbes: 0, allowUnknown: true },
    effort: { minutes: 1, turns: 1 },
    // KEINE BEISPIELE: eine Beispiel-Bewertung („4 von 5") zeigt keine Form,
    // sondern nur eine Zahl — und eine gezeigte Zahl ist ein Anker auf genau
    // die Antwort, die hier unverfälscht gebraucht wird.
  },

  // ══ SCHICHT 2 · BRAND DESIGN (Konzept §2.2–§2.7, Paket D0) ═══════════════
  //
  // D1: Inhalte sind Davids Gate. Ziele, Leitern, Qualitätsmerkmale und
  // Beispiele stehen hier in einer BRAUCHBAREN, aber PROVISORISCHEN Fassung —
  // sie sind aus dem freigegebenen Prototyp (`.playground/app/utils/
  // demoDesign.ts`) und dem Konzept abgeleitet, nicht gegengelesen. Paket D1
  // fasst genau diese Texte an; die Struktur darüber bleibt unberührt (dasselbe
  // Verhältnis wie BW2 Paket 1 zu Paket 2).
  //
  // Beispiel-Betriebe dieser Schicht: Rösterei mit eigenem Laden (neue Marke) /
  // Möbeltischlerei im Relaunch — bewusst zwei Branchen, die in Schicht 1 nicht
  // vorkommen (s. Kopf, „Die Beispielwelt").

  // ── G · Moodboard (§2.2) ────────────────────────────────────────────────
  'g.source': {
    goal: 'settle where the visual direction comes from: from the foundation alone, or from the '
      + 'foundation plus reference images the customer brings.',
    quality: [
      'The answer is one of the two offered ways, not a description of a look.',
      'If they say yes, they actually have images at hand — not the intention to look for some.',
      'Nobody is talked into uploading anything: no is a complete answer.',
    ],
    antiPatterns: [
      'A yes that means "we will collect some later" — the chapter would then wait for nothing.',
      'A description of a favourite website instead of a choice between the two ways.',
    ],
    ladder: {
      opening: 'ask plainly whether they have references — screenshots, a pinboard, three sites they '
        + 'like — and say in one sentence what happens either way.',
      probes: [],
      reframes: ['if they start describing a look in words, say that words belong in the next session and '
        + 'ask only for the yes or no'],
    },
    form: { person: 'none', tense: 'present' },
  },
  'g.inspiration': {
    goal: 'collect three to twelve reference images, each tagged with the one area it is meant to show.',
    quality: [
      'Every image carries exactly one area: colour, type, mark, imagery or composition.',
      'The images are theirs to show, and the screen says plainly that they stay private.',
      'A note, where there is one, says what they like about it — not what it is.',
    ],
    antiPatterns: [
      'An image without an area — it could then be read for anything and would be read for nothing.',
      'One image tagged with three areas at once.',
      'A reference uploaded as "our new logo" instead of as an example.',
    ],
    // KEINE LEITER: das Instrument fragt nicht, es nimmt entgegen (D2).
    form: { person: 'none', tense: 'present' },
    // FREMDWERKE, und sie bleiben es (§2.13): die Bilder reisen nie in
    // Snapshot, Share, Beispiel oder Dokument.
    sensitivity: 'internal',
  },
  'g.reading': {
    goal: 'read each reference image in the language of the visual DNA and measure it against the '
      + 'foundation: does it already carry, is there tension, or does it contradict.',
    quality: [
      'Every reading names two or three DNA dimensions it observed, not a mood.',
      'Every verdict names the place in the foundation it was measured against.',
      'A tension says what to take from the image and what to leave.',
      'Praise is as concrete as criticism: what works is named, not applauded.',
    ],
    antiPatterns: [
      'A verdict without a foundation anchor — that is taste, not a reading.',
      'A reading that copies the image instead of describing it as DNA.',
      'Calling an image wrong because it is unusual, rather than because it contradicts something.',
    ],
    form: { person: 'none', tense: 'present' },
    sensitivity: 'internal',
    examples: pathExamples(
      {
        de: 'Beobachtet: ruhige Komposition, redaktioneller Stil, erdige Farben. Trägt schon — Tagline '
          + '„ein ehrlicher Moment am Tag" und Ton-Wort „ruhig": Text vor Bild, Weissraum als Haltung.',
        en: 'Observed: calm composition, editorial style, earthy colour. Already carries — tagline "one '
          + 'honest moment a day" and the tone word "quiet": text before image, white space as a stance.',
      },
      {
        de: 'Beobachtet: sehr hoher Kontrast, geometrische Formen. Spannung — Wert „Handarbeit": die '
          + 'Klarheit dürft ihr übernehmen, die Härte der Kanten nicht.',
        en: 'Observed: very high contrast, geometric shapes. Tension — value "handmade": take the '
          + 'clarity, leave the hardness of the edges.',
      },
    ),
  },
  'g.dna': {
    goal: 'settle the visual DNA of this brand: one controlled value for each of the ten dimensions, '
      + 'each with the reason it follows from the foundation.',
    quality: [
      'All ten dimensions carry a value from the vocabulary — none is left open.',
      'Every reason points at something in the foundation: archetype, a value, a tone word or the '
        + 'positioning.',
      'Where references exist, the line says whether it comes from the foundation, from an image, or '
        + 'from both.',
      'No reason is a matter of taste alone.',
    ],
    antiPatterns: [
      'A value invented outside the vocabulary — a preset could not carry it later.',
      'A reason that only repeats the value in other words.',
      'A DNA taken from a reference image without any foundation anchor.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Farb-Charakter: erdig gedämpft — eure Palette kommt aus dem Produkt selbst, nicht aus einer '
          + 'Farbmode.',
        en: 'Colour character: earthy and muted — your palette comes from the product itself, not from a '
          + 'colour trend.',
      },
      {
        de: 'Formsprache: weich gerundet — zum Archetyp „Der Weise" passt Milde in den Kanten; kantig '
          + 'wäre der Rebell.',
        en: 'Form language: softly rounded — mildness in the edges suits the archetype "the sage"; hard '
          + 'edges would be the rebel.',
      },
    ),
  },
  'g.boards': {
    goal: 'lay out three moodboards as variants of the settled DNA: as proposed, one step quieter, one '
      + 'step bolder.',
    quality: [
      'All three boards fill the same ten dimensions — they differ in four or five, not in everything.',
      'Each board says in one sentence what it does differently from the proposal.',
      'The quieter and the bolder board are both defensible for this brand, not straw men.',
    ],
    antiPatterns: [
      'A board that is simply worse so that the proposal wins.',
      'Three boards that differ in a single dimension — that is not a choice.',
      'A fourth board, because three is the number a human being can hold at once.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Eine Stufe ruhiger: weniger Wärme, mehr Weiss — humanistische Grotesk statt Serif, '
          + 'monochromere Flächen.',
        en: 'One step quieter: less warmth, more white — a humanist sans instead of a serif, more '
          + 'monochrome surfaces.',
      },
      {
        de: 'Eine Stufe mutiger: die zweite Farbe als tragende Fläche, kontrastreiche Schriftmischung, '
          + 'dichtere Komposition.',
        en: 'One step bolder: the second colour as the carrying surface, a high-contrast type mix, a '
          + 'denser composition.',
      },
    ),
  },
  'g.board': {
    goal: 'pick one of the three boards as the starting point.',
    quality: [
      'One board is chosen, not a mixture — mixing is the next session.',
      'The reason names a dimension, not a colour they happen to like.',
      'They could explain the choice to somebody who was not in the room.',
    ],
    antiPatterns: [
      'A choice made because one board looks more expensive.',
      'A mixture presented as a choice.',
    ],
    ladder: {
      opening: 'show the three boards side by side, name the one that follows from the DNA, and say in '
        + 'one sentence what the other two would cost them.',
      probes: ['which of the three would still feel right on an invoice?'],
      reframes: ['if they cannot choose between quieter and bolder, say that this is a question about '
        + 'their positioning and hand it back to George'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
  },
  'g.mix': {
    goal: 'settle the final DNA: hold what fits from the chosen board and take single dimensions from '
      + 'the other two.',
    quality: [
      'The result fills all ten dimensions and says for each one where it came from.',
      'Held dimensions stay untouched when the rest is proposed again.',
      'The mixture is still one direction, not a list of favourites.',
    ],
    antiPatterns: [
      'A mixture that takes the loudest value from every board.',
      'A regeneration that quietly moves a dimension the human held.',
      'A dimension left empty because two boards disagreed.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Farbwelt aus Board 1, Typografie aus Board 3 — festgehalten: Komposition „ruhig und luftig".',
        en: 'Colour world from board 1, typography from board 3 — held: composition "calm and airy".',
      },
      {
        de: 'Alles wie gewählt, nur die Materialität aus dem mutigen Board: glatt statt Papier.',
        en: 'Everything as chosen, only materiality from the bolder board: smooth instead of paper.',
      },
    ),
  },

  // ── H · Farbwelt (§2.3) ─────────────────────────────────────────────────
  'h.base': {
    // Die Farbe ist der WERT dieses Feldes (§2.3) — ein Satz darin wäre eine
    // Farbwelt, die nicht gerechnet werden kann.
    invariants: [{ kind: 'hex' }],
    goal: 'settle the one base colour everything else is calculated from.',
    quality: [
      'It is a single colour with a hex value, not a palette.',
      'It follows from the DNA dimension "colour character" and the archetype.',
      'It is deep enough to carry text, or it is explicitly meant as a surface and says so.',
      'The reason names something of this brand, not a colour trend.',
    ],
    antiPatterns: [
      'Three base colours, because nobody wanted to decide.',
      'A colour chosen because a competitor uses it.',
      'A base colour that fails the contrast check and is offered anyway.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Roast — die Farbe des Produkts nach der Röstung: tief genug für Text, warm genug für „Nähe".',
        en: 'Roast — the colour of the product after roasting: deep enough for text, warm enough for '
          + '"closeness".',
      },
      {
        de: 'Das Eichenbraun der Werkstatt statt des alten Blaus — es steht seit zwanzig Jahren im Laden, '
          + 'nur nie in der Marke.',
        en: 'The oak brown of the workshop instead of the old blue — it has stood in the shop for twenty '
          + 'years, just never in the brand.',
      },
    ),
  },
  'h.ramp': {
    goal: 'derive the light and the dark ramp from the base colour, eleven steps each.',
    quality: [
      'Both ramps carry all eleven steps and anchor the base colour where it belongs.',
      'The dark ramp is its own calculation, not the light one reversed.',
      'Nothing here is a matter of taste: the same base colour always gives the same ramps.',
    ],
    antiPatterns: [
      'A ramp with a step corrected by hand — the next recalculation would silently drop it.',
      'A dark ramp whose deepest step disappears into the dark ground.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Elf Stufen hell, elf Stufen dunkel — die 500er ist eure Basisfarbe, alles andere ist '
          + 'gerechnet.',
        en: 'Eleven steps light, eleven steps dark — step 500 is your base colour, everything else is '
          + 'calculated.',
      },
      {
        de: 'Dieselbe Rechnung wie bisher, nur mit der neuen Basisfarbe: die alten Zwischentöne entfallen.',
        en: 'The same calculation as before, only with the new base colour: the old in-between tones fall '
          + 'away.',
      },
    ),
  },
  'h.neutral': {
    goal: 'settle the tint of the neutral ramp: tinted from the base colour, warm or cool.',
    quality: [
      'One of the offered options is chosen.',
      'The reason says what the surfaces should feel like, not which one looks nicer.',
      'The choice still works on paper as well as on screen.',
    ],
    antiPatterns: [
      'A neutral ramp so strongly tinted that it competes with the base colour.',
      'A choice made without ever looking at a surface.',
    ],
    ladder: {
      opening: 'show the three neutral ramps under the same scene and name the one the DNA suggests.',
      probes: [],
      reframes: ['if they call it a detail, show the same card on all three grounds'],
    },
    form: { person: 'none', tense: 'present' },
  },
  'h.accent': {
    invariants: [{ kind: 'hex' }],
    goal: 'settle one accent colour: the signal, not a second ground.',
    quality: [
      'Exactly one accent is chosen.',
      'It is far enough from the base colour to read as a signal.',
      'It passes the contrast check in the role it is meant for.',
    ],
    antiPatterns: [
      'Two accents, so that neither is one.',
      'An accent used as a surface all over the page.',
      'A signal colour too light for the text that sits on it.',
    ],
    ladder: {
      opening: 'offer three harmonic candidates, say which one reads as a signal and why the others do '
        + 'not.',
      probes: ['where would this colour appear on a page, and where never?'],
      reframes: ['if they want two accents, show what one page looks like with both'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
  },
  'h.roles': {
    goal: 'settle which colour fills which role: ground and text, surfaces, light areas, accent and '
      + 'signal, paper.',
    quality: [
      'Every role names its source: a ramp step or a colour from the palette.',
      'Text never sits on a step that was meant as a surface.',
      'Somebody who was not in the room could apply the roles to a new page.',
      'The roles work in light and in dark.',
    ],
    antiPatterns: [
      'A role filled with "the brand colour" without saying which step.',
      'Two roles with the same source and different names.',
      'A role that only exists on one page.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Grund und Text: Stufe 900 auf Papier. Nie die 500er — die ist Fläche, nicht Schrift.',
        en: 'Ground and text: step 900 on paper. Never step 500 — that one is surface, not type.',
      },
      {
        de: 'Akzent und Signal: nur Knöpfe und aktive Zustände, genau ein Pop je Fläche.',
        en: 'Accent and signal: buttons and active states only, exactly one pop per surface.',
      },
    ),
  },
  'h.contrast': {
    goal: 'check the text and ground pairs in light and dark and record the WCAG verdict for each.',
    quality: [
      'Every pair that really appears on a page is checked, in light and in dark.',
      'Each pair carries its ratio and its verdict.',
      'A pair that fails AA is not offered as a settled decision.',
    ],
    antiPatterns: [
      'A check run only on the light side.',
      'A pair measured between two colours that never meet on a page.',
      'A failing pair waved through because it looks good.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Fliesstext auf Papier: 11,4:1, AAA. Knopf-Text auf Akzent: 4,9:1, AA.',
        en: 'Body text on paper: 11.4:1, AAA. Button text on the accent: 4.9:1, AA.',
      },
      {
        de: 'Die alte Kombination Grau auf Beige reisst AA (3,1:1) — sie fällt raus, nicht die Marke.',
        en: 'The old grey-on-beige combination fails AA (3.1:1) — it goes, not the brand.',
      },
    ),
  },

  // ── I · Typografie (§2.4) ───────────────────────────────────────────────
  'i.pair': {
    goal: 'settle the type pair: one family for headings, one for body text, with the fixed mono role '
      + 'beside them.',
    quality: [
      'The pair comes from the curated catalogue, so the preview really loads it.',
      'The reason names the DNA dimension "typography", not a personal favourite.',
      'Together with the fixed mono role there are never more than three families.',
      'Body text stays readable at small sizes.',
    ],
    antiPatterns: [
      'A family named but not declared, so the preview quietly falls back to the system stack.',
      'A third display family added "just for headlines".',
      'A pair chosen on the headline alone, with nobody looking at a paragraph.',
    ],
    ladder: {
      opening: 'show the pairs with real type and a real specimen, and name the one that follows from '
        + 'the DNA.',
      probes: ['read one paragraph in it — does it still sound like you after ten lines?'],
      reframes: ['if the choice is about the headline only, show the price list in both'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    /**
     * DIE SECHS PAAR-IDS WÖRTLICH (D4) — diese Datei hat keine Importe (s.
     * Kopf), der Katalog steht in `shared/brandFontPairs.ts`. Dass beide
     * dasselbe sagen, nagelt `tests/brandDesignType.test.ts` fest; ohne diese
     * Invariante stünde ein von Hand korrigierter Satz bestätigt im Slot und
     * `buildBrandDesign` gäbe stumm `null` zurück.
     */
    invariants: [{
      kind: 'oneOf',
      terms: ['editorial', 'humanist', 'inter', 'geometric', 'classic', 'contrast'],
    }],
  },
  'i.scale': {
    goal: 'derive the size and weight hierarchy from the DNA: calm, dense or bold.',
    quality: [
      'The hierarchy carries a ratio between the largest heading and body text.',
      'It follows from the DNA dimensions "typography" and "composition".',
      'It works on a phone as well as on a wide screen.',
    ],
    antiPatterns: [
      'A hierarchy with so many sizes that nobody can keep them apart.',
      'Steps so small that the levels stop reading as levels.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Ruhig, 1 : 2,6 — wenige Grössen, viel Zeilenabstand: die Hierarchie aus „ruhig und luftig".',
        en: 'Calm, 1 : 2.6 — few sizes, generous leading: the hierarchy of "calm and airy".',
      },
      {
        de: 'Dicht, 1 : 2,2 — kleinere Sprünge, mehr Text je Bildschirm: redaktionell statt plakativ.',
        en: 'Dense, 1 : 2.2 — smaller steps, more text per screen: editorial instead of poster-like.',
      },
    ),
    /** Die drei Hierarchien wörtlich — dieselbe Begründung wie bei `i.pair`. */
    invariants: [{ kind: 'oneOf', terms: ['calm', 'dense', 'loud'] }],
  },
  'i.rules': {
    goal: 'settle the typographic rules: heading weight, tracking, capitals and what the mono role is for.',
    quality: [
      'Every rule can be applied by somebody who was not in the room.',
      'The mono role has exactly one job, and the rule says which.',
      'Capitals, where they are allowed, are named by place, not by mood.',
      'No rule contradicts the chosen hierarchy.',
    ],
    antiPatterns: [
      'A rule that only says "use it tastefully".',
      'Capitals allowed everywhere, which is the same as no rule.',
      'A mono role that turns into a third brand voice.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Mono gehört den Herkunftsangaben und Preisen — sonst nirgends. Versalien nur im Ladenschild.',
        en: 'Mono belongs to origin details and prices — nowhere else. Capitals only on the shop sign.',
      },
      {
        de: 'Überschriften im halbfetten Schnitt, Laufweite minus zwei; Fliesstext bleibt unangetastet.',
        en: 'Headings in the semibold cut, tracking minus two; body text stays untouched.',
      },
    ),
  },

  // ── J · Zeichen (§2.5) ──────────────────────────────────────────────────
  'j.kind': {
    goal: 'settle the kind of mark: wordmark, pictorial mark, combination or monogram.',
    quality: [
      'One kind is chosen, and the reason names the DNA dimension "form language" or the name itself.',
      'The reason says what the other kinds would cost this brand.',
      'The choice fits how often people actually meet this brand.',
    ],
    antiPatterns: [
      'A pictorial mark for a young brand with one shop and few contacts.',
      'A choice made because a competitor has a symbol.',
      'A monogram picked as the main mark because it is the easiest to draw.',
    ],
    ladder: {
      opening: 'name the kind that follows from the name and the form language, and say in one sentence '
        + 'what each of the others would cost.',
      probes: ['where will this mark be smallest — and does it still work there?'],
      reframes: ['if they want a symbol because everyone has one, ask how often somebody sees their brand '
        + 'in a year'],
    },
    answers: { maxProbes: 1 },
    form: { person: 'none', tense: 'present' },
    /**
     * DIE VIER RICHTUNGS-IDS WÖRTLICH (D5a) — dieselbe Begründung wie bei
     * `i.pair` (D4): diese Datei hat keine Importe, der Katalog steht in
     * `shared/brandDesignVocab.ts`, und dass beide dasselbe sagen, nagelt
     * `tests/brandDesignMark.test.ts` fest. Ohne die Invariante stünde ein
     * von Hand korrigierter Satz bestätigt im Slot, und weder die Setzungen
     * noch `buildBrandDesign` könnten etwas damit anfangen.
     */
    invariants: [{ kind: 'oneOf', terms: ['word', 'pictorial', 'combination', 'monogram'] }],
  },
  'j.brief': {
    goal: 'write the briefing a designer would get: character, form language, clear space, variants, '
      + 'no-gos and the places the mark has to work in.',
    quality: [
      'Every section is concrete enough to be checked against a draft.',
      'The clear space is a measure, not an adjective.',
      'The no-gos name things that would really be done wrong here.',
      'The places are the ones this brand actually has.',
    ],
    antiPatterns: [
      'A briefing that describes a mood instead of a task.',
      'A clear space given as "enough room".',
      'A list of places copied from a template — an app icon for a brand without an app.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Schutzraum ringsum gleich der Höhe des Versals; Mindestbreite der Wortmarke 96 px digital, '
          + '24 mm im Druck.',
        en: 'Clear space all round equal to the cap height; minimum wordmark width 96 px on screen, '
          + '24 mm in print.',
      },
      {
        de: 'Nicht verzerren, nicht schräg stellen, keinen Schatten — das Zeichen ist eine Datei, kein '
          + 'Textfeld.',
        en: 'Do not distort it, do not tilt it, no shadow — the mark is a file, not a text field.',
      },
    ),
  },
  'j.examples': {
    goal: 'set the wordmark and the monogram from the chosen type pair and colour world, in the four '
      + 'variants.',
    quality: [
      'The settings use the real type pair and the real colour roles, nothing invented.',
      'All four variants exist: primary, inverted, single colour, icon area.',
      'The clear space is drawn, not described.',
      'They are shown as settings, never as a finished logo.',
    ],
    antiPatterns: [
      'A setting in a font nobody chose.',
      'A variant that only works on white.',
      'A setting presented as the finished mark.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Wortmarke in der Überschriften-Schrift, Roast auf Paper; Monogramm im Quadrat für Avatar und '
          + 'Favicon.',
        en: 'Wordmark in the heading family, roast on paper; monogram in a square for avatar and favicon.',
      },
      {
        de: 'Dieselbe Wortmarke einfarbig für Prägung und Stempel — dort gibt es keine zweite Farbe.',
        en: 'The same wordmark in a single colour for embossing and stamps — there is no second colour '
          + 'there.',
      },
    ),
  },
  'j.pick': {
    goal: 'pick one setting as the preferred example for the briefing.',
    quality: [
      'Exactly one setting is picked.',
      'The reason names a place it has to work in.',
      'The pick is understood as an example for the designer, not as the final mark.',
    ],
    antiPatterns: [
      'A pick made on the largest size only.',
      'Two settings picked, so the briefing carries two directions.',
    ],
    ladder: {
      opening: 'show the settings side by side and ask which one they would put on the smallest surface '
        + 'they have.',
      probes: [],
      reframes: ['if they treat it as the final logo, say plainly that this is an example for the '
        + 'designer'],
    },
    form: { person: 'none', tense: 'present' },
    /** Die zwei gesetzten Beispiele wörtlich (`BRAND_MARK_SETTINGS`, D5b). */
    invariants: [{ kind: 'oneOf', terms: ['wordmark', 'monogram'] }],
  },
  'j.drafts': {
    goal: 'generate image drafts from the briefing and let the human keep or discard them — as ideas for '
      + 'the design work, never as a logo.',
    quality: [
      'Every draft carries its origin: model, date and prompt hash.',
      'Every draft carries the note that it is a draft, not a checked logo.',
      'Kept drafts stay private: they never travel into a snapshot or a shared link.',
      'The trademark note is on the screen, not in a help page.',
    ],
    antiPatterns: [
      'A draft shown without its origin.',
      'A draft that leaves the workshop as "the logo".',
      'A statement about protectability or similarity to existing marks.',
    ],
    // KEINE LEITER: der Bereich erzeugt auf Knopfdruck, er fragt nicht (D5c).
    form: { person: 'none', tense: 'present' },
    sensitivity: 'internal',
  },

  // ── K · Bildsprache (§2.6) ──────────────────────────────────────────────
  'k.photo': {
    goal: 'settle the picture principles: light, crop, people and colour — with the reason each follows '
      + 'from the DNA.',
    quality: [
      'All four axes are answered: light, crop, people, colour.',
      'A photographer could work from it without asking back.',
      'The reason points at a value or a tone word, not at a mood board.',
      'It says what is never photographed here.',
    ],
    antiPatterns: [
      'A principle that only says "authentic".',
      'A rule that no camera can follow.',
      'Stock photography described as the house style.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Weiches Seitenlicht, sichtbare Schatten, keine Aufheller; Menschen bei der Arbeit, nie in die '
          + 'Kamera lächelnd.',
        en: 'Soft side light, visible shadows, no fill; people at work, never smiling into the camera.',
      },
      {
        de: 'Sehr naher Ausschnitt, das Detail füllt das Bild — Werkstatt statt Ausstellungsraum.',
        en: 'A very close crop, the detail fills the frame — workshop instead of showroom.',
      },
    ),
  },
  'k.illustration': {
    goal: 'settle whether there is illustration at all, and if so in which language: line, area or '
      + 'organic.',
    quality: [
      'One of the offered options is chosen, and "none" is a full answer.',
      'The reason says who would keep this consistent.',
      'The option fits the form language of the DNA.',
    ],
    antiPatterns: [
      'An illustration style chosen although nobody can draw or commission it.',
      'Two styles side by side.',
    ],
    ladder: {
      opening: 'show the options with the settled colours and say plainly that "none" is the rule nobody '
        + 'can break.',
      probes: [],
      reframes: ['if they want everything, ask who will draw the second one'],
    },
    form: { person: 'none', tense: 'present' },
    /**
     * DIE VIER OPTIONS-IDS WÖRTLICH (D6, Muster `i.pair` aus D4) — diese Datei
     * hat keine Importe (s. Kopf), der Katalog steht in
     * `shared/brandDesignVocab.ts` (`BRAND_ILLUSTRATION_OPTIONS`). Dass beide
     * dasselbe sagen, nagelt `tests/brandDesignImagery.test.ts` fest; ohne diese
     * Invariante stünde ein von Hand hineingeschriebener Satz bestätigt im Slot
     * und `buildBrandDesign` trüge ihn als Illustrations-Sprache ins Preset.
     */
    invariants: [{ kind: 'oneOf', terms: ['none', 'line', 'area', 'organic'] }],
  },
  'k.icons': {
    goal: 'settle the icon set: line or filled, and the stroke weight beside the body type.',
    quality: [
      'One set is chosen and shown next to the real body type.',
      'The stroke weight sits with the type, not against it.',
      'Icons stay legible at the smallest size this brand uses.',
    ],
    antiPatterns: [
      'A heavy icon set next to a light serif.',
      'Two sets mixed on one page.',
    ],
    ladder: {
      opening: 'show the same five icons in each set next to a line of the body type and ask which stroke '
        + 'weight belongs to it.',
      probes: [],
      reframes: ['if it comes down to taste, say that the only question here is the stroke weight'],
    },
    form: { person: 'none', tense: 'present' },
    /** Die drei Icon-Sätze wörtlich — dieselbe Begründung wie bei `k.illustration`. */
    invariants: [{ kind: 'oneOf', terms: ['regular', 'fill', 'bold'] }],
  },
  'k.dodont': {
    goal: 'write the do and do-not list of the picture language, in the form of the foundation.',
    quality: [
      'Every do has its matching do-not — the pair is what makes it checkable.',
      'Each line names something visible in a picture, not an intention.',
      'The list is short enough to be remembered before a shoot.',
    ],
    antiPatterns: [
      'A do-not that forbids a whole medium instead of a treatment.',
      'A pair in which both halves say the same thing.',
      'A list so long that nobody reads it twice.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Do: Hände, Werkzeug, Arbeit im Bild. Don’t: gestellte Gruppenbilder mit Daumen hoch.',
        en: 'Do: hands, tools, work in the frame. Do not: staged group shots with thumbs up.',
      },
      {
        de: 'Do: Tageslicht mit sichtbaren Schatten. Don’t: Weichzeichner und Lens Flare.',
        en: 'Do: daylight with visible shadows. Do not: soft focus and lens flare.',
      },
    ),
  },

  // ── L · Bewegung (§2.7) ─────────────────────────────────────────────────
  'l.tempo': {
    goal: 'settle the tempo of movement: calm, lively or snappy.',
    quality: [
      'One tempo is chosen and it follows from the DNA dimension "motion character".',
      'The reason says what the movement should feel like, not how modern it looks.',
      'The tempo is the same everywhere, not one per page.',
    ],
    antiPatterns: [
      'A tempo chosen because it looks impressive in a demo.',
      'Two tempos "depending on the context".',
    ],
    ladder: {
      opening: 'play the same transition in all three tempos and name the one the DNA suggests.',
      probes: [],
      reframes: ['if they cannot tell them apart, play the slowest and the fastest one after the other'],
    },
    form: { person: 'none', tense: 'present' },
    /**
     * DIE DREI TEMPO-IDS WÖRTLICH (D7, Muster `k.icons` aus D6) — diese Datei
     * hat keine Importe (s. Kopf), der Katalog steht in
     * `shared/brandDesignVocab.ts` (`BRAND_TEMPO_OPTIONS`). Dass beide dasselbe
     * sagen, nagelt `tests/brandDesignMotion.test.ts` fest; ohne diese
     * Invariante stünde ein von Hand hineingeschriebenes „mittelschnell"
     * bestätigt im Slot, und `buildBrandDesign` fände dafür weder Dauer noch
     * Kurve — das Preset wäre `null`, obwohl das Kapitel abgeschlossen ist.
     */
    invariants: [{ kind: 'oneOf', terms: ['calm', 'lively', 'snappy'] }],
  },
  'l.transitions': {
    goal: 'derive the transition tokens from the tempo: durations, easing and the offset between '
      + 'siblings.',
    quality: [
      'There are three durations and one offset — fast, base, slow.',
      'Every token says what it is for.',
      'The values follow from the tempo, they are not typed in by hand.',
    ],
    antiPatterns: [
      'A dozen tokens nobody can keep apart.',
      'A duration corrected by hand, which the next recalculation would drop.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Schnell 120 ms für Hover und Fokus, normal 240 ms für Karten, langsam 384 ms für '
          + 'Seitenwechsel; Versatz 60 ms.',
        en: 'Fast 120 ms for hover and focus, base 240 ms for cards, slow 384 ms for page changes; offset '
          + '60 ms.',
      },
      {
        de: 'Dieselben drei Tokens, nur aus dem knappen Tempo: 60, 120 und 192 ms.',
        en: 'The same three tokens, only from the snappy tempo: 60, 120 and 192 ms.',
      },
    ),
  },
  'l.logo': {
    goal: 'settle whether the mark moves at all, and under which rule.',
    quality: [
      'The answer is yes or no, not "maybe later".',
      'A yes names the one place it is used and comes with a reduced-motion version.',
      'A no is recorded as a decision, not as an omission.',
    ],
    antiPatterns: [
      'A moving mark for a brand whose tone word is "quiet".',
      'An animation without a reduced-motion answer.',
    ],
    ladder: {
      opening: 'ask plainly whether the mark should move, and say what a yes costs: one more file that '
        + 'somebody has to maintain.',
      probes: [],
      reframes: ['if the yes is about a video intro only, say that this is a film question, not a brand '
        + 'one'],
    },
    form: { person: 'none', tense: 'present' },
    /**
     * JA ODER NEIN, und beides als Katalog-Id — dieselbe Begründung wie bei
     * `l.tempo`. Die Ids stehen in `BRAND_LOGO_MOTION_OPTIONS`; „vielleicht
     * später" ist hier ausdrücklich ein Anti-Muster und soll auch technisch
     * nicht in den Slot passen.
     */
    invariants: [{ kind: 'oneOf', terms: ['no', 'yes'] }],
  },
  'l.rules': {
    goal: 'write the motion rules: where movement is allowed, where never, and what happens with reduced '
      + 'motion.',
    quality: [
      'Every rule can be checked on a real page.',
      'There is a rule for reduced motion, and it says the end state simply stands.',
      'The rules name which properties may move at all.',
      'Nothing decorative moves.',
    ],
    antiPatterns: [
      'A rule that says "use animation sparingly".',
      'A replacement animation for reduced motion, which is the same problem at half speed.',
      'A rule that allows any property to move.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Bewegung erklärt einen Zusammenhang oder sie entfällt — Dekoration bewegt sich nie.',
        en: 'Movement explains a relationship or it does not happen — decoration never moves.',
      },
      {
        de: 'Nur zwei Eigenschaften gleichzeitig: Deckkraft und eine Verschiebung. Keine Rotation, keine '
          + 'Skalierung von Text.',
        en: 'Only two properties at a time: opacity and one shift. No rotation, no scaling of text.',
      },
    ),
  },

  // ══ SCHICHT 3 · BRAND BOOK & KIT (Konzept §2.2–§2.4, Paket K0) ═══════════
  //
  // K0: INHALTE SIND DAVIDS GATE IN K5 (§2.18). Ziele, Leitern,
  // Qualitätsmerkmale und Beispiele stehen hier in einer BRAUCHBAREN, aber
  // PROVISORISCHEN Fassung — abgeleitet aus dem freigegebenen Prototyp
  // (`.playground/app/utils/demoKit.ts`) und dem Konzept, nicht gegengelesen.
  // Paket K5 fasst genau diese Texte an; die Struktur darüber bleibt unberührt
  // (dasselbe Verhältnis wie BW2 Paket 1 zu Paket 2 und D0 zu D1).
  //
  // WAS DIESE SCHICHT VON DEN BEIDEN ANDEREN UNTERSCHEIDET: hier entsteht
  // NICHTS Neues (§1.11 a — „Book & Kit = kuratieren/exportieren"). Jede
  // Session bestätigt, wählt aus oder rechnet zusammen, was in Foundation und
  // Design längst steht. Die Ziele sagen das ausdrücklich, damit kein Modell
  // anfängt, hier eine zweite Marke zu erfinden.
  //
  // Beispiel-Betriebe dieser Schicht: Sprachschule mit Kursreihen (neue Marke)
  // / Fahrradwerkstatt mit zweiter Filiale (Relaunch) — bewusst zwei Branchen,
  // die in Schicht 1 und 2 nicht vorkommen (s. Kopf, „Die Beispielwelt").

  // ── M · Nomenklatur (§2.2, Otto) ────────────────────────────────────────
  'm.types': {
    goal: 'settle which kinds of things this brand actually needs names for, chosen from the catalogue '
      + 'of five — products, services, programmes, places, digital.',
    quality: [
      'Every chosen kind has at least one real example in this brand, today or planned.',
      'A kind they do not have is left out — the list is what needs naming, not what sounds ambitious.',
      'The choice comes from the catalogue; nothing is typed in freely.',
    ],
    antiPatterns: [
      'Ticking all five because none of them is wrong in principle.',
      'A kind chosen for something that will exist "some day" without anyone planning it.',
    ],
    ladder: {
      opening: 'ask which of the five kinds of things they give names to today — and which they already '
        + 'know will come; name one example per kind from their own answers.',
      probes: [
        'if they name only the obvious kind, ask about the things around it: a course, a second '
          + 'location, a newsletter',
      ],
      reframes: [
        'if they start proposing names, say that names come in the next session and ask only which '
          + 'kinds there are',
      ],
    },
    form: { person: 'none', tense: 'present' },
    // EINE Nachfrage, abweichend von der Arbeitsform (`choose` fragt sonst
    // nicht nach): die erste Antwort nennt fast immer nur das Offensichtliche,
    // und ein vergessener Typ fehlt danach dem ganzen Kapitel.
    answers: { maxProbes: 1 },
  },
  'm.patterns': {
    goal: 'draft one naming pattern per chosen kind, each with one example and the line in the '
      + 'foundation it follows from.',
    quality: [
      'Every chosen kind has exactly one pattern — no kind is left without one.',
      'Every pattern is a rule someone else could apply tomorrow, not a description of taste.',
      'Every pattern names its source: the architecture model, the naming rule, the decided name or a '
        + 'tone word.',
      'Every pattern carries one example that obeys it.',
    ],
    antiPatterns: [
      'A pattern that only says "fits the brand" — that is the conclusion, not the rule.',
      'Two patterns for the same kind, so that nobody knows which one applies.',
      'An example that breaks its own pattern.',
    ],
    /*
     * K5: DIESE SESSION HAT EINEN ENTWURFS-AUFTRAG BEKOMMEN.
     *
     * In K0 stand hier alles ausser den Verarbeitungsregeln — und ohne sie
     * wirft `sessionInstruction` (bewusst: „ein stiller Allzweck-Text wäre ein
     * Entwurf ohne Auftrag"). Der Auftrag ist inhaltlich NICHTS Neues: er sagt
     * in Regelform, was Ziel und Qualitätsmerkmale darüber schon zusagen. Die
     * FORM des Wertes steht nicht hier, sondern in `server/utils/ottoPrompt.ts`
     * — sie hängt an `brandKitSlots.ts` und wird nach dem Lauf gemessen.
     */
    rules: [
      'You are not naming anything here. You are writing the RULE that a name of that kind has to '
      + 'obey — and one example that obeys it, so the rule can be checked.',
      'Derive every pattern from a line that is already settled: the architecture model (does the '
      + 'umbrella brand carry everything, or do the parts stand on their own?), the naming rule, the '
      + 'decided brand name, a tone word. Name that line as the source. Never derive a pattern from '
      + 'taste.',
      'One pattern per chosen kind — the kinds are in the inputs. Do not add a kind they did not '
      + 'choose, and never write two patterns for the same kind.',
      'A pattern says what a name IS MADE OF and what it never contains. "Fits the brand" is the '
      + 'conclusion, not the rule.',
      'The example is a name this brand could actually give tomorrow — in their language, their '
      + 'place, their trade. Never a placeholder and never a name that breaks its own pattern.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Programm / Format: Dachmarke + Substantiv ohne Anglizismus — „Sprachhaus Tafelrunde". '
          + 'Herkunft: Architektur-Modell „eine Marke" und Tabu-Wort „Experience".',
        en: 'Programme or format: umbrella brand plus a plain noun — "Sprachhaus Tafelrunde". Source: '
          + 'the architecture model "one brand" and the banned word "experience".',
      },
      {
        de: 'Ort / Filiale: Dachmarke + Stadtteil, nie eine Nummer — „Radwerk Weststadt". Herkunft: Wert '
          + '„Nähe" — ein Ort hat einen Namen, keine Filialnummer.',
        en: 'Place: umbrella brand plus the district, never a number — "Radwerk Weststadt". Source: the '
          + 'value "closeness" — a place has a name, not a branch number.',
      },
    ),
  },
  'm.rules': {
    goal: 'confirm the naming rules that follow from the patterns: capitalisation, separators, the order '
      + 'of umbrella brand and product, and what is never done.',
    quality: [
      'Every rule can be checked against a name without asking anybody.',
      'There is one rule about the order of umbrella brand and product.',
      'There is at least one rule that says what is NEVER done.',
      'No rule contradicts a pattern from the session before.',
    ],
    antiPatterns: [
      'A rule that says "keep it consistent" — that is the wish, not the rule.',
      'A rule that repeats a pattern in other words instead of adding the part the pattern leaves open.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Die Dachmarke steht vorn: „Sprachhaus Abendkurs", nie „Abendkurs by Sprachhaus".',
        en: 'The umbrella brand comes first: "Sprachhaus Abendkurs", never "Abendkurs by Sprachhaus".',
      },
      {
        de: 'In Adressen und Dateinamen alles klein und mit Bindestrich; nie zwei Namen für dieselbe '
          + 'Sache — die Werkstatt heisst an der Tür so wie auf der Rechnung.',
        en: 'In addresses and file names everything is lower case with hyphens; never two names for one '
          + 'thing — the workshop is called the same on the door and on the invoice.',
      },
    ),
  },

  // ── N · AI-Guidelines (§2.3, Nika) ──────────────────────────────────────
  'n.scope': {
    goal: 'settle what AI may produce in the name of this brand: drafts for everything, text only, '
      + 'internal only, or nothing customer-facing.',
    quality: [
      'The answer is one of the four offered ways, not a description of a workflow.',
      'The choice matches what they actually do today — not what sounds responsible.',
      'They understand that this answer travels: it goes into brand.md, which other people and their '
        + 'tools will read.',
    ],
    antiPatterns: [
      'A choice of "nothing" out of caution, while the same people use AI daily — the guideline would '
        + 'be a rule nobody keeps.',
      'An answer that mixes scope and approval ("only with review") — approval is the next session.',
    ],
    ladder: {
      opening: 'ask plainly what AI is allowed to produce for them, name the four ways in one sentence '
        + 'each, and say which one most brands their size end up with.',
      probes: [],
      reframes: [
        'if they answer with who checks it, say that the check is the next question and ask only what '
          + 'may be produced',
      ],
    },
    form: { person: 'none', tense: 'present' },
  },
  'n.review': {
    goal: 'settle the approval rule: every publication read by a human, a spot check, or a rule that '
      + 'depends on the channel.',
    quality: [
      'The answer is one of the three offered rules.',
      'The rule names a person or a role, not a hope.',
      'The rule can be kept on a normal working day, at the volume they really publish.',
    ],
    antiPatterns: [
      'A rule so strict that the first busy week breaks it.',
      'A spot check without a number — "now and then" is not a rule.',
    ],
    ladder: {
      opening: 'ask who reads a text before it goes out, and offer the three rules with what each one '
        + 'costs in a normal week.',
      probes: [],
      reframes: [
        'if they say "it depends", ask them to name the channel it depends on — that is the third rule',
      ],
    },
    form: { person: 'none', tense: 'present' },
  },
  'n.guardrails': {
    goal: 'draft the guardrails as a list: tone parameters, taboos, the spelling of brand marks, and '
      + 'the topics this brand does not speak about — each line taken from a settled value.',
    quality: [
      'Every line comes from a confirmed value above and says which one.',
      'The tone parameters are the tone words with one voice sample each, not adjectives added here.',
      'The taboos are the words already banned in the vocabulary sessions, not new ones.',
      'The spelling rules name the brand marks that really exist: title, tagline, product names.',
    ],
    antiPatterns: [
      'A guardrail invented here because it sounds sensible — the list is a summary, not a new decision.',
      'A taboo that contradicts a word the brand uses on its own website.',
      'A line so general that no text could ever break it.',
    ],
    /*
     * K5: DIESE SESSION HAT EINEN ENTWURFS-AUFTRAG BEKOMMEN — dieselbe
     * Begründung wie bei `m.patterns` darüber (ohne Verarbeitungsregeln wirft
     * der Prompt-Bauer). Die vier Gruppen und der Trenner stehen in
     * `server/utils/nikaPrompt.ts`, weil sie an `brandKitSlots.ts` hängen und
     * nach dem Lauf gemessen werden.
     */
    rules: [
      'You are SORTING, not deciding. Every line restates something the client has already '
      + 'confirmed — a tone word, a voice sample, a banned word, a value, a naming rule — and says '
      + 'which one it comes from. If a line has no source above, it does not belong in the list.',
      'The tone parameters are the tone words, each with the one voice sample that shows it. Do not '
      + 'add adjectives of your own, and never use a word that stands on their avoid list.',
      'The taboos ARE the avoid lists, word for word. Do not soften them, do not add new ones, do '
      + 'not explain them away.',
      'The spellings name the marks that really exist: the brand title, the tagline, the product '
      + 'names from their naming rules. A brand without its own naming rules still has a title and a '
      + 'tagline — that is where its spellings come from.',
      'The no-go topics are subjects this brand does not speak about at all. If nothing above says '
      + 'so, ask for one instead of inventing it.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Ton: „ruhig" — kurze Sätze, kein Ausrufezeichen. Stimmprobe: „Der Kurs beginnt am 3. März. '
          + 'Zehn Plätze." Herkunft: Ton-Wort „ruhig" plus eure Stimmprobe.',
        en: 'Tone: "quiet" — short sentences, no exclamation marks. Voice sample: "The course starts on '
          + '3 March. Ten places." Source: the tone word "quiet" plus your voice sample.',
      },
      {
        de: 'Tabu: „Rundum-sorglos", „Premium", „Experience". Herkunft: eure Meiden-Liste aus dem '
          + 'Wort-Leitfaden — sie gilt für KI wortgleich.',
        en: 'Taboo: "all-round carefree", "premium", "experience". Source: your avoid list from the '
          + 'word guide — it applies to AI word for word.',
      },
    ),
  },
  'n.prompts': {
    goal: 'assemble three ready-to-copy prompt templates from the settled values and the guardrails: a '
      + 'system prompt, a social post, and an email to customers.',
    quality: [
      'Each template stands on its own: someone can paste it into a chat without adding context.',
      'Each template carries the guardrails, not a summary of them.',
      'Nothing in the templates is new — every sentence traces back to a confirmed value.',
      'The system prompt is the short form of brand.md, in the same words.',
    ],
    antiPatterns: [
      'A template that asks the model to "be creative" — that is exactly the instruction the guardrails '
        + 'exist against.',
      'A fourth template, because three is what a person keeps at hand.',
      'A placeholder nobody can fill, because the value behind it was never settled.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'System-Prompt: „Du schreibst für Sprachhaus. Ton: ruhig, gerade heraus. Nie: Superlative, '
          + '„Experience". Immer: Termin und Platzzahl im ersten Satz."',
        en: 'System prompt: "You write for Sprachhaus. Tone: quiet, straightforward. Never: '
          + 'superlatives, the word experience. Always: date and number of places in the first sentence."',
      },
      {
        de: 'Social-Post: „Ein Satz, was es gibt. Ein Satz, für wen. Ein Satz, wo. Keine Emojis, kein '
          + 'Ausrufezeichen — so wie eure Aushänge in der Werkstatt."',
        en: 'Social post: "One sentence on what it is. One on who it is for. One on where. No emoji, no '
          + 'exclamation marks — the way your workshop notices read."',
      },
    ),
  },

  // ── P · Pressekit (§2.4, George) ────────────────────────────────────────
  //
  // `p.facts` IST DIE AUSNAHME DER REISE-REGEL (§2.10) und trotzdem kein Loch
  // darin: der Wert dieser Session ist NICHT `a.facts`, sondern eine bewusste
  // AUSWAHL daraus. `a.facts` bleibt `internal` und reist nie; was hier
  // entsteht, ist ein neuer, öffentlicher Wert, den ein Mensch Eintrag für
  // Eintrag freigegeben hat (Voreinstellung: keiner).
  'p.facts': {
    goal: 'settle which of the facts from the profile may travel into the press kit — one opt-in per '
      + 'entry, nothing released by default.',
    quality: [
      'Every released fact is one a stranger may read, today and in a year.',
      'Nothing is released just because it is true — the question is whether it should be public.',
      'A fact that stays back keeps its reason, so the decision can be read again later.',
      'The released text is the fact itself, not a summary of several.',
    ],
    antiPatterns: [
      'Releasing everything at once because the list is short.',
      'Releasing a number that is a negotiating position: revenue, margins, the share of one customer.',
      'Rewriting a fact while releasing it, so that the press kit says something the profile does not.',
    ],
    ladder: {
      opening: 'go through the facts one by one and ask for each whether it may be public; say plainly '
        + 'that nothing travels unless they say so.',
      probes: [],
      reframes: [
        'if they want to release everything at once, take the two most sensitive entries and ask about '
          + 'those two alone',
      ],
    },
    form: { person: 'none', tense: 'present' },
  },
  'p.contact': {
    goal: 'settle the press contact — name, role and email of one person the press may write to.',
    quality: [
      'There is exactly one person, with a role that says why they are the one to ask.',
      'The email is one that is actually read; a shared mailbox is fine if somebody reads it.',
      'They have seen, before confirming, that this line travels publicly.',
    ],
    antiPatterns: [
      'A private mobile number given because the field was there.',
      'Two contacts, so that a journalist has to guess which one to try.',
      'A reference to the account holder instead of a confirmed text — the account may change hands '
        + 'later, and the press kit would change with it silently.',
    ],
    ladder: {
      opening: 'offer the contacts already on file as a template — the account holder and, if there is '
        + 'one, the contact from the intro call — and say that this line will be public.',
      probes: [
        'if they hesitate, ask who takes the call when a local paper rings on a Tuesday morning',
      ],
      reframes: [
        'if nobody is responsible yet, say that the entry is optional and the press kit works without it',
      ],
    },
    form: { person: 'none', tense: 'present' },
    // Optional (§2.4) — und darum ausdrücklich vertagbar: wer die Zuständigkeit
    // erst klären muss, soll das Kapitel trotzdem abschliessen können.
    answers: { allowDefer: true },
  },
  'p.summary': {
    goal: 'lay out the press kit as it will be read: boilerplates in three lengths, the tagline, the '
      + 'mark settings, the released facts and the contact — nothing new, only assembled.',
    quality: [
      'Every part comes from a confirmed value; the preview invents no sentence of its own.',
      'A part that is missing is named as missing, not filled with something similar.',
      'No fact appears that was not released in the session before.',
      'The whole thing reads as one page, not as a list of fields.',
    ],
    antiPatterns: [
      'A boilerplate rewritten here because it reads better in this context.',
      'A fact from the profile that nobody released.',
      'An empty section rendered as if it were finished.',
    ],
    form: { person: 'none', tense: 'present' },
    examples: pathExamples(
      {
        de: 'Kurz: „Sprachhaus ist eine Sprachschule in Mainz mit Abendkursen für Erwachsene." Tagline, '
          + 'Wortmarke, zwei freigegebene Fakten, Kontakt.',
        en: 'Short: "Sprachhaus is a language school in Mainz with evening courses for adults." Tagline, '
          + 'wordmark, two released facts, contact.',
      },
      {
        de: 'Ohne Design: Boilerplates, Tagline und Fakten stehen; der Abschnitt „Zeichen" nennt offen, '
          + 'dass er mit Brand Design kommt.',
        en: 'Without design: boilerplates, tagline and facts are there; the "marks" section says plainly '
          + 'that it arrives with Brand Design.',
      },
    ),
  },
}
