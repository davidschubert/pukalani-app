/**
 * DIE LEGALE MENGE EINER AUSWAHL — die eine Stelle, an der steht, was ein
 * `choice`-Slot überhaupt enthalten darf (P3.1).
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * Bis P3.1 stand die Antwort auf „welche Optionen hat dieser Slot" NIRGENDS:
 * die Registry kennt nur `kind: 'choice'` und `editor: 'chips' | 'cards'`, der
 * i18n-Katalog trägt die FRAGE (`brand.q.b2.model`) und den Lehrblock, und die
 * Werkstatt rendert für `chips`/`cards` heute noch ein gewöhnliches Textfeld.
 * Ein Generator, der eine Auswahl entwerfen soll, hätte sich die Optionen also
 * selbst ausdenken müssen — und ein erfundenes fünftes Architektur-Modell im
 * Brand-Dokument ist genau die Sorte Schaden, die niemand mehr zurückrechnet.
 *
 * ── ZWEI ARTEN VON AUSWAHL, UND DAS IST KEIN VERSEHEN ─────────────────────
 * `b2.model` ist GESCHLOSSEN: die vier Architektur-Modelle stehen wörtlich in
 * der Content-Spec §5a und in der Infografik §12.3 (Branded House · Sub-Brands ·
 * Endorsed · House of Brands). Mehr gibt es nicht, und was nicht dazugehört, ist
 * falsch.
 *
 * `d.primary` und `d.secondary` sind EBENFALLS GESCHLOSSEN: die zwölf
 * Archetypen stehen wörtlich in der Content-Spec §12.1. Sie teilen sich EINEN
 * Katalog und haben trotzdem ZWEI Verträge — die Rückfrage ist eine andere,
 * weil die Frage eine andere ist („welcher Archetyp seid ihr?" gegen „was
 * bewahrt euch vor dem Klischee?").
 *
 * INTERIM bis zum Paarvergleich-Instrument (Spec §12.2) — Davids Entscheidung
 * 2026-09-04: George leitet die Archetyp-Kette im GESPRÄCH her statt sie aus
 * `d.pairs` zu BERECHNEN; das Instrument ersetzt diesen Weg, die gespeicherten
 * Werte (stabile Ids) bleiben kompatibel. Der Katalog hier ist genau die Menge,
 * aus der die Paarvergleich-Karten später ihre zwölf Karten bauen — er ist
 * deshalb kein Provisorium, nur sein heutiger Konsument ist einer.
 *
 * `b.positioningCategory` ist OFFEN: „In welcher Kategorie spielt ihr?" hat
 * keine Liste, aus der man wählt — die Kategorie gehört DIESER Marke („Software
 * agency for online shops"), und eine Taxonomie zu erfinden, aus der George
 * wählen MUSS, hiesse den Menschen in ein Raster zu zwingen, das aus diesem
 * Projekt käme und nicht aus seinem Markt. Geprüft wird deshalb die FORM (eine
 * Zeile, wenige Wörter, kein Satz) — dieselbe Regel, die `a.category` schon in
 * seiner Instruktion trägt („at most five words").
 *
 * Beide Arten enden bei einem Verstoss GLEICH: der Lauf wird eine RÜCKFRAGE
 * (`outcome: 'question'`), nie ein kaputter Entwurf. Ein Feld, das ein
 * Auswahl-Element werden soll, darf keinen Absatz enthalten — und ein Modell,
 * das die Menge verfehlt hat, hat eher zu wenig Material als zu wenig Willen.
 *
 * ── DIE RÜCKFRAGE STEHT HIER UND NICHT IM i18n-KATALOG ────────────────────
 * Sie wird im GENERATOR gebraucht (Server, ohne vue-i18n) und landet als
 * `brand_messages`-Zeile im Verlauf — sie wird also GESPEICHERT, nicht aus einem
 * Schlüssel gerendert. Derselbe Fall wie `advisorOpenersFor` in
 * `brandAdvisors.ts`, und dieselbe Auflösung: zwei kurze Sätze je Sprache,
 * neben der Regel, die sie auslöst.
 *
 * DIESE DATEI IST PUR: kein i18n, kein H3, kein Appwrite.
 */

import {
  BRAND_DNA_BOARD_KINDS,
  BRAND_ICON_OPTIONS,
  BRAND_ILLUSTRATION_OPTIONS,
  BRAND_LOGO_MOTION_OPTIONS,
  BRAND_MARK_KINDS,
  BRAND_MARK_SETTINGS,
  BRAND_TEMPO_OPTIONS,
  BRAND_TYPE_SCALES,
  type BrandDesignTerm,
} from './brandDesignVocab'
import { BRAND_FONT_PAIRS } from './brandFontPairs'
import { BRAND_DIRECTION_OPTIONS } from './brandDirections'
import { BRAND_AI_REVIEWS, BRAND_AI_SCOPES, type BrandKitTerm } from './brandKitVocab'
import type { BrandTeamKind } from './slotRegistry'

/** Eine legale Option einer GESCHLOSSENEN Auswahl. */
export interface BrandChoiceOption {
  /**
   * Der GESPEICHERTE Wert — stabil, sprachneutral, nie übersetzt. Er steht in
   * `brand_steps.slots` und ist damit dieselbe Art Zusage wie eine Slot-Id.
   */
  readonly id: string
  /** Wie die Option im Prompt heisst (englisch, wie der Rest des Prompt-Kerns). */
  readonly label: string
  /** Ein Halbsatz Wirkung — er steht im Prompt neben dem Namen. */
  readonly hint: string
  /**
   * WIE DIE OPTION DEM MENSCHEN HEISST, je Sprache der Oberfläche (P4).
   *
   * Sie steht HIER und nicht nur im i18n-Katalog, weil die Auflösung eines
   * GESPEICHERTEN Wertes (`brandChoiceDisplayLabel`) pur bleiben muss: sie
   * läuft in Log-Karten und Bühnen-Modulen, aber auch dort, wo es kein
   * vue-i18n gibt. Der Katalog trägt dieselben Namen — dass beide nicht
   * auseinanderlaufen, nagelt `brandChoiceOptions.test.ts` fest.
   *
   * Die vier Modell-Namen sind EIGENNAMEN (wie die Theme-Namen im Core), de
   * und en sind heute deshalb wörtlich gleich. Das Feld ist trotzdem
   * zweisprachig: ein künftiger geschlossener Vertrag („Ja"/„Nein") wäre es
   * nicht, und ein einsprachiges Feld hätte ihn still falsch beschriftet.
   */
  readonly display: { readonly de: string, readonly en: string }
  /**
   * Die WURZEL der Karten-Copy im i18n-Katalog (`.label`, `.hint`,
   * `.example`). Sie steht ausgeschrieben da und wird NICHT aus der Id
   * gerechnet: die Ids tragen Bindestriche, ein Schlüssel-Pfad verträgt sie
   * schlecht, und eine versteckte Umwandlung wäre eine Kopplung, die kein
   * Test sieht.
   *
   * ER DARF HEUTE INS LEERE ZEIGEN, und zwar genau dort, wo ihn niemand
   * rendert: die Karten-Copy wird nur für einen Slot mit `editor: 'cards'`
   * aufgelöst (`choiceCardsFor` in der Werkstatt). Die zwölf Archetypen haben
   * heute keinen solchen Slot — `d.primary`/`d.secondary` stehen auf
   * `editor: 'none'`, und die KARTEN dieses Bausteins gehören dem
   * Paarvergleich-Instrument (Spec §12.1), das eine ANDERE Dreiheit zeigt
   * (Motto · Stimmung · „wie …") als die `label`/`hint`/`example` der
   * Architektur-Karten. Copy zu erfinden, bevor die Form entschieden ist,
   * legte die Form fest. Der Wächter dagegen steht im Test: kippt ein
   * Archetyp-Slot je auf `cards`, wird er rot und verlangt den Katalog-Eintrag.
   */
  readonly copyKey: string
}

/**
 * DIE VIER ARCHITEKTUR-MODELLE (Content-Spec §5a + Infografik §12.3).
 *
 * Die Beispiele sind dieselben wie in der Infografik — ein Modell, das im
 * Prompt andere Beispiele sieht als der Mensch in der Grafik, erklärt ihm
 * hinterher etwas anderes, als er gelesen hat.
 */
export const BRAND_ARCHITECTURE_MODELS: readonly BrandChoiceOption[] = [
  {
    id: 'branded-house',
    label: 'Branded House',
    hint: 'one brand carries everything; the products are named after it (Apple)',
    display: { de: 'Branded House', en: 'Branded House' },
    copyKey: 'brand.choice.model.brandedHouse',
  },
  {
    id: 'sub-brands',
    label: 'Sub-Brands',
    hint: 'products carry a name of their own NEXT to the main brand (FedEx Express)',
    display: { de: 'Sub-Brands', en: 'Sub-Brands' },
    copyKey: 'brand.choice.model.subBrands',
  },
  {
    id: 'endorsed',
    label: 'Endorsed Brands',
    hint: 'products stand on their own and name who backs them ("by Marriott")',
    display: { de: 'Endorsed Brands', en: 'Endorsed Brands' },
    copyKey: 'brand.choice.model.endorsed',
  },
  {
    id: 'house-of-brands',
    label: 'House of Brands',
    hint: 'the brands stand alone, the parent stays invisible (P&G)',
    display: { de: 'House of Brands', en: 'House of Brands' },
    copyKey: 'brand.choice.model.houseOfBrands',
  },
]

/**
 * DIE ZWÖLF ARCHETYPEN (Content-Spec §12.1).
 *
 * ── DIE IDS SIND DIE ENGLISCHEN NAMEN, KLEIN UND OHNE ARTIKEL ─────────────
 * Sie sind das, was in `brand_steps.slots` steht — die Zusage an den Prompt,
 * an das Brand-Dokument und an jede spätere Ableitung (`e.statements`,
 * `ep.taglines`, `f.candidates` und die Themes-Richtung lesen sie alle). Ein
 * deutscher Name als Id hiesse, dass ein Sprachwechsel den gespeicherten Wert
 * bewegt; ein Artikel („der-weise") hiesse, dass ein grammatisches Geschlecht
 * in einer Datenbank steht.
 *
 * `citizen` heisst so und nicht `everyman`, weil die Spec-Tabelle „Jedermann
 * (Citizen)" sagt — die Id folgt der Spalte, nicht der Literatur.
 *
 * ── DER `hint` IST DIE STIMMUNG, NICHT DAS MOTTO ──────────────────────────
 * Er steht neben dem Namen IM PROMPT und muss dort eine ENTSCHEIDUNG stützen:
 * „Die Wahrheit macht euch frei" klingt gut und trennt nichts, „ruhig,
 * fundiert, erklärt gern" trennt den Weisen vom Magier. Das Motto gehört auf
 * die Karte des Paarvergleichs (§12.1), wo ein Mensch nach Gefühl wählt — hier
 * wählt ein Modell nach Belegen.
 *
 * ── BEISPIELMARKEN STEHEN BEWUSST NICHT DRIN ──────────────────────────────
 * §12.1 sagt es für die Karten („sie verankern die Wahl an fremder
 * Bekanntheit statt am eigenen Gefühl"), und für den Prompt gilt es doppelt:
 * ein Modell, das „wie Patagonia" liest, schreibt hinterher Patagonias
 * Argumente in eine fremde Marke.
 */
export const BRAND_ARCHETYPES: readonly BrandChoiceOption[] = [
  {
    id: 'sage',
    label: 'The Sage',
    hint: 'calm, well-founded, likes to explain — the trustworthy head in the room',
    display: { de: 'Der Weise', en: 'The Sage' },
    copyKey: 'brand.choice.archetype.sage',
  },
  {
    id: 'explorer',
    label: 'The Explorer',
    hint: 'independent, curious, always one step ahead of the map',
    display: { de: 'Der Entdecker', en: 'The Explorer' },
    copyKey: 'brand.choice.archetype.explorer',
  },
  {
    id: 'creator',
    label: 'The Creator',
    hint: 'inventive, expressive, in love with making things',
    display: { de: 'Der Schöpfer', en: 'The Creator' },
    copyKey: 'brand.choice.archetype.creator',
  },
  {
    id: 'caregiver',
    label: 'The Caregiver',
    hint: 'warm, dependable, the person comes first',
    display: { de: 'Der Fürsorgliche', en: 'The Caregiver' },
    copyKey: 'brand.choice.archetype.caregiver',
  },
  {
    id: 'ruler',
    label: 'The Ruler',
    hint: 'assured, precise, sets the standard others measure against',
    display: { de: 'Der Herrscher', en: 'The Ruler' },
    copyKey: 'brand.choice.archetype.ruler',
  },
  {
    id: 'innocent',
    label: 'The Innocent',
    hint: 'optimistic, clear, nothing hidden under the surface',
    display: { de: 'Der Unschuldige', en: 'The Innocent' },
    copyKey: 'brand.choice.archetype.innocent',
  },
  {
    id: 'citizen',
    label: 'The Citizen',
    hint: 'down to earth, approachable, never on a pedestal',
    display: { de: 'Der Jedermann', en: 'The Citizen' },
    copyKey: 'brand.choice.archetype.citizen',
  },
  {
    id: 'jester',
    label: 'The Jester',
    hint: 'playful, quick-witted, takes everything seriously except itself',
    display: { de: 'Der Narr', en: 'The Jester' },
    copyKey: 'brand.choice.archetype.jester',
  },
  {
    id: 'lover',
    label: 'The Lover',
    hint: 'sensual, devoted, treats detail as affection',
    display: { de: 'Die Liebende', en: 'The Lover' },
    copyKey: 'brand.choice.archetype.lover',
  },
  {
    id: 'hero',
    label: 'The Hero',
    hint: 'determined, demanding, grows against resistance',
    display: { de: 'Der Held', en: 'The Hero' },
    copyKey: 'brand.choice.archetype.hero',
  },
  {
    id: 'magician',
    label: 'The Magician',
    hint: 'transforming, visionary, makes the impossible look casual',
    display: { de: 'Der Magier', en: 'The Magician' },
    copyKey: 'brand.choice.archetype.magician',
  },
  {
    id: 'rebel',
    label: 'The Rebel',
    hint: 'uncomfortable, fearless, breaks what is already brittle',
    display: { de: 'Der Rebell', en: 'The Rebel' },
    copyKey: 'brand.choice.archetype.rebel',
  },
]

/** Zweisprachige Rückfrage — s. Kopf, warum sie nicht im i18n-Katalog steht. */
export interface BrandChoiceFallbackQuestion {
  /**
   * Die deutsche Fassung im TEAM („Passt zu eurer Marke?").
   *
   * Sie ist die Vorgabe und nicht die Solo-Fassung, weil sie älter ist: bis
   * zur Inhaltsrunde 2026-09-09 gab es nur sie. Ein Vertrag ohne `deSolo`
   * spricht damit weiter wie bisher, statt still auf eine Anrede zu
   * wechseln, die niemand geschrieben hat.
   */
  readonly de: string
  /**
   * Die deutsche Fassung bei „Nur ich" — OPTIONAL (BW1-Inhaltsrunde
   * 2026-09-09, Davids Zuschnitt „Weiche nur, wo wirklich jemand
   * angesprochen wird").
   *
   * Eine Rückfrage ist Chat: George spricht die Person an. Anredefrei
   * umschreiben — wie bei den Beschriftungen dieser Runde — würde aus der
   * Frage ein Formularfeld machen. Verträge ohne Anrede („Welches der drei
   * Boards ist der Ausgangspunkt?") lassen die Zeile deshalb weg.
   */
  readonly deSolo?: string
  readonly en: string
}

export type BrandChoiceContract =
  | {
    readonly slotId: string
    readonly kind: 'closed'
    readonly options: readonly BrandChoiceOption[]
    /**
     * DER SATZ, DER DIE AUSWEICHMANÖVER DIESER MENGE BEIM NAMEN NENNT —
     * englisch, wörtlich in den Prompt.
     *
     * Er steht am VERTRAG und nicht in `brandChoicePromptRule`, weil er von der
     * Menge abhängt: „erfinde kein fünftes Modell" ist für vier Modelle die
     * ganze Wahrheit und für zwölf Archetypen schlicht falsch. Ein generischer
     * Satz („do not invent options") wäre die Formulierung, die genau das
     * zurückbringt, wogegen sie sich richtet — ein Modell weicht auf das aus,
     * was man ihm nicht ausdrücklich verboten hat.
     */
    readonly strayRule: string
    readonly fallbackQuestion: BrandChoiceFallbackQuestion
  }
  | {
    readonly slotId: string
    readonly kind: 'open'
    /** Höchstens so viele Wörter — eine Kategorie ist ein Etikett, kein Satz. */
    readonly maxWords: number
    readonly fallbackQuestion: BrandChoiceFallbackQuestion
  }

const BASE_CONTRACTS: readonly BrandChoiceContract[] = [
  {
    slotId: 'b.positioningCategory',
    kind: 'open',
    // Fünf Wörter sind die Zusage von `a.category`; sechs lassen einem
    // deutschen Kompositum-Ersatz („Agentur für kleine Online-Shops") Luft,
    // ohne dass ein Satz durchrutscht.
    maxWords: 6,
    fallbackQuestion: {
      de: 'Aus dem, was ich habe, bekomme ich noch keine saubere Kategorie. '
        + 'Sagt es mir in höchstens fünf Wörtern: Als was würdet ihr gesucht werden?',
      deSolo: 'Aus dem, was ich habe, bekomme ich noch keine saubere Kategorie. Sag es mir in höchstens fünf '
        + 'Wörtern: Als was würdest du gesucht werden?',
      en: 'From what I have, I cannot pin down a clean category yet. '
        + 'In five words or fewer: what would people search for to find you?',
    },
  },
  {
    slotId: 'b2.model',
    kind: 'closed',
    options: BRAND_ARCHITECTURE_MODELS,
    strayRule: 'Do not invent a fifth model, do not combine two, do not write a "hybrid".',
    fallbackQuestion: {
      de: 'Ich kann daraus noch nicht genau EIN Architektur-Modell ableiten. '
        + 'Eine Frage dazu: Tragen eure weiteren Angebote heute euren Markennamen — oder eigene Namen?',
      deSolo: 'Ich kann daraus noch nicht genau EIN Architektur-Modell ableiten. Eine Frage dazu: Tragen deine '
        + 'weiteren Angebote heute deinen Markennamen — oder eigene Namen?',
      en: 'I cannot pin this down to exactly ONE architecture model yet. '
        + 'One question: do your other offerings carry your brand name today — or names of their own?',
    },
  },
  /**
   * BAUSTEIN D — ZWEI SLOTS, EIN KATALOG, ZWEI RÜCKFRAGEN.
   *
   * INTERIM bis zum Paarvergleich-Instrument (Spec §12.2) — Davids Entscheidung
   * 2026-09-04: Gesprächs-Ableitung statt Berechnung; das Instrument ersetzt
   * diesen Weg, die gespeicherten Werte (stabile Ids) bleiben kompatibel.
   *
   * Der Vertrag selbst ist NICHT interim: er sagt nur, was in dem Feld stehen
   * darf, und daran ändert das Instrument nichts — es ändert, WER die Wahl
   * trifft (heute ein begründeter Vorschlag mit Bestätigung, später acht bis
   * zwölf Paare).
   *
   * DASS DER SEKUNDÄRE SICH VOM PRIMÄREN UNTERSCHEIDEN MUSS, STEHT NICHT HIER:
   * eine Prüfung sieht immer nur IHREN Slot und kennt den anderen Wert gar
   * nicht. Sie stünde also entweder falsch (immer grün) oder sie bräuchte eine
   * zweite Datenquelle in einer puren Datei. Die Regel steht deshalb in der
   * INSTRUKTION (`archetypePrompt.ts`), wo sie hingehört — dort liegt der
   * bestätigte Primär-Wert als Quell-Slot ohnehin vor.
   */
  {
    slotId: 'd.primary',
    kind: 'closed',
    options: BRAND_ARCHETYPES,
    strayRule: 'Do not invent a thirteenth archetype, do not merge two into one, do not write '
      + '"a mix of Sage and Creator" — the second-strongest one has its own field right after this.',
    fallbackQuestion: {
      de: 'Ich kann daraus noch nicht EINEN Haupt-Archetyp ableiten, ohne zu raten. '
        + 'Eine Frage dazu: Wenn eure Marke ein Mensch auf einer Party wäre — wie verhält sie sich?',
      deSolo: 'Ich kann daraus noch nicht EINEN Haupt-Archetyp ableiten, ohne zu raten. Eine Frage dazu: Wenn deine '
        + 'Marke ein Mensch auf einer Party wäre — wie verhält sie sich?',
      en: 'I cannot settle on ONE primary archetype from this without guessing. '
        + 'One question: if your brand were a person at a party — how would they behave?',
    },
  },
  {
    slotId: 'd.secondary',
    kind: 'closed',
    options: BRAND_ARCHETYPES,
    strayRule: 'Do not invent a thirteenth archetype, do not merge two into one, and do not repeat '
      + 'the primary archetype — a brand that is twice the same thing has no second archetype.',
    fallbackQuestion: {
      de: 'Für den zweiten Archetyp fehlt mir noch etwas — er ist das, was euren ersten vor dem '
        + 'Klischee bewahrt. Eine Frage dazu: Was sollen Leute fühlen, wenn sie mit euch zu tun haben?',
      deSolo: 'Für den zweiten Archetyp fehlt mir noch etwas — er ist das, was deinen ersten vor dem Klischee '
        + 'bewahrt. Eine Frage dazu: Was sollen Leute fühlen, wenn sie mit dir zu tun haben?',
      en: 'I am still missing something for the second archetype — it is what keeps the first one from '
        + 'becoming a cliché. One question: what should people feel when they deal with you?',
    },
  },
]

/**
 * DIE WEICHE VON KAPITEL 1 „MOODBOARD" (`g.source`, Brand Design §2.2,
 * Davids Entscheidung 2026-09-08) — woher die visuelle Richtung kommt.
 *
 * ZWEI Optionen und keine dritte: „wir haben Vorbilder" und „Frida schlägt
 * vor". Ein „vielleicht später" wäre keine Weiche, sondern ein Kapitel, das
 * auf nichts wartet — die Leiter in `sessionContent.ts` sagt das ausdrücklich
 * („A yes that means 'we will collect some later'").
 *
 * BEIDE WEGE ENDEN IN DERSELBEN DNA. Der Unterschied ist die QUELLE, nicht die
 * Reihenfolge: das Moodboard steht in beiden Fällen vor Farbwelt und
 * Typografie. Deshalb ist die zweite Option auch keine Absage — sie sagt, wer
 * den ersten Vorschlag macht.
 *
 * `label`/`hint` sind ENGLISCH wie der ganze Prompt-Kern; `display` und die
 * Karten-Copy (`copyKey`) tragen den deutschen und englischen Wortlaut aus dem
 * freigegebenen Prototyp (`.playground/…/design/dna.vue`).
 */
export const BRAND_DNA_SOURCES: readonly BrandChoiceOption[] = [
  {
    id: 'inspiration',
    label: 'With references',
    hint: 'they bring screenshots, a pinboard, sites they like; Frida reads them against the foundation',
    display: { de: 'Wir haben Vorbilder', en: 'We have references' },
    copyKey: 'brand.choice.dnaSource.inspiration',
  },
  {
    id: 'foundation',
    label: 'From the foundation alone',
    hint: 'no references; the direction comes from archetype, values, tone words and positioning',
    display: { de: 'Frida schlägt vor', en: 'Frida suggests' },
    copyKey: 'brand.choice.dnaSource.foundation',
  },
]

/**
 * DIE DREI MOODBOARDS ALS OPTIONEN (`g.board`, Brand Design D2c) — AUS dem
 * Vokabular gebaut, nicht daneben gepflegt.
 *
 * Eine zweite, abgeschriebene Liste wäre beim ersten neuen Board genau die
 * Stelle, an der sich Name und Regel auseinanderleben (dieselbe Begründung wie
 * bei `BRAND_GRADIENTS` in `brandPalette.ts`). `label`/`hint` sind ENGLISCH wie
 * der ganze Prompt-Kern; `copyKey` zeigt bewusst ins Leere, weil die Karten
 * dieses Slots eine gerenderte Szene zeigen und keine Text-Copy (s. Vertrag
 * unten und den Kopf von `BrandChoiceOption.copyKey`).
 */
export const BRAND_DNA_BOARD_OPTIONS: readonly BrandChoiceOption[] = BRAND_DNA_BOARD_KINDS
  .map(kind => ({
    id: kind.id,
    label: kind.en,
    hint: kind.noteEn,
    display: { de: kind.de, en: kind.en },
    copyKey: `brand.choice.dnaBoard.${kind.id}`,
  }))

/**
 * DIE DREI GRUNDTÖNE ALS OPTIONEN (`h.neutral`, Brand Design D3) — AUS dem
 * Vokabular gebaut, nicht daneben gepflegt (wie die Boards).
 *
 * Die KARTEN dieses Slots stehen im Farbwelt-Abschnitt und zeigen je eine
 * gerechnete Neutral-Rampe; `copyKey` zeigt deshalb — wie bei `g.board` — auf
 * eine Copy, die die Bühne nicht rendert. Der Vertrag ist trotzdem nötig: ohne
 * ihn stünde im Handbuch die rohe Id `tinted`.
 */
export const BRAND_NEUTRAL_CHOICE_OPTIONS: readonly BrandChoiceOption[] = [
  {
    id: 'tinted',
    label: 'Tinted from the base colour',
    hint: 'surfaces carry a hint of the brand — the engine default',
    display: { de: 'Aus der Basisfarbe getönt', en: 'Tinted from the base colour' },
    copyKey: 'brand.choice.neutral.tinted',
  },
  {
    id: 'warm',
    label: 'Warm',
    hint: 'paper-like surfaces with a yellow cast',
    display: { de: 'Warm', en: 'Warm' },
    copyKey: 'brand.choice.neutral.warm',
  },
  {
    id: 'cool',
    label: 'Cool',
    hint: 'quieter, more technical surfaces',
    display: { de: 'Kühl', en: 'Cool' },
    copyKey: 'brand.choice.neutral.cool',
  },
]

/**
 * DIE AUSWAHL-IDS VON BRAND DESIGN ALS OPTIONEN (Brand Design D8).
 *
 * ── WARUM SIE ÜBERHAUPT EINEN VERTRAG BRAUCHEN ───────────────────────────
 * Ohne Vertrag ist die Anzeige eines gespeicherten Wertes der Wert selbst —
 * und der ist hier eine Katalog-Id. Im Gespräch, in der Log-Karte und im
 * Brand-Dokument stand deshalb wörtlich `snappy`, `yes`, `word` (D7-Stand,
 * Nebenbefund: „rohe Katalog-Ids als Antworttext"). Ein Mensch hat auf einer
 * Karte „Knapp" geklickt; was er danach liest, muss „Knapp" sein.
 *
 * ── DIE MENGEN STEHEN IM VOKABULAR, NICHT HIER ───────────────────────────
 * Gebaut aus `brandDesignVocab.ts` bzw. dem Schriftpaar-Katalog — dieselbe
 * Regel wie bei `BRAND_DNA_BOARD_OPTIONS`: eine zweite, abgeschriebene Liste
 * wäre beim ersten neuen Wert die Stelle, an der Name und Regel auseinander-
 * laufen. `label`/`hint` sind ENGLISCH wie der ganze Prompt-Kern.
 *
 * ── `copyKey` ZEIGT INS LEERE, UND DAS IST RICHTIG ───────────────────────
 * Jeder dieser Slots hat eine eigene Bühne (`BwTypePanel`, `BwMarkPanel`,
 * `BwImageryPanel`, `BwMotionPanel`) mit gerenderten Karten — Schriftproben,
 * SVG-Setzungen, laufende Szenen. Text-Karten daneben wären dieselbe Wahl ein
 * zweites Mal, deshalb blendet `choiceCardsFor` sie aus (wie `g.board` und
 * `result.direction`). Der Vertrag beschreibt trotzdem, was in dem Feld stehen
 * DARF — und genau dafür ist er da.
 */
function designOptions(
  terms: readonly BrandDesignTerm[],
  copyPrefix: string,
): readonly BrandChoiceOption[] {
  return terms.map(term => ({
    id: term.id,
    label: term.en,
    hint: term.en,
    display: { de: term.de, en: term.en },
    copyKey: `${copyPrefix}.${term.id}`,
  }))
}

/** Die sechs Schriftpaare — ihr Name ist zweisprachig gepflegt (D4). */
export const BRAND_FONT_PAIR_OPTIONS: readonly BrandChoiceOption[] = BRAND_FONT_PAIRS.map(pair => ({
  id: pair.id,
  label: pair.nameEn,
  hint: `${pair.headingFamily} + ${pair.bodyFamily}`,
  display: { de: pair.nameDe, en: pair.nameEn },
  copyKey: `brand.choice.fontPair.${pair.id}`,
}))

/**
 * DIE ACHT AUSWAHL-SESSIONS DER SCHICHT 2 — je Slot eine Menge und eine
 * Rückfrage.
 *
 * Sie stehen als TABELLE und nicht als acht handgeschriebene Verträge: die
 * einzigen Unterschiede sind Slot, Menge und die zwei Sätze — acht Kopien
 * derselben fünf Zeilen wären acht Gelegenheiten, eine davon zu vergessen.
 */
const DESIGN_CONTRACTS: readonly BrandChoiceContract[] = [
  {
    slotId: 'i.pair',
    options: BRAND_FONT_PAIR_OPTIONS,
    stray: 'Do not invent a seventh pair, do not name a single typeface, and do not combine two pairs.',
    de: 'Welches der Paare passt zu eurer Marke? Die Probe darüber zeigt beide Schriften in eurer Farbwelt.',
    deSolo: 'Welches der Paare passt zu deiner Marke? Die Probe darüber zeigt beide Schriften in deiner Farbwelt.',
    en: 'Which of the pairs fits your brand? The specimen above shows both typefaces in your colour world.',
  },
  {
    slotId: 'i.scale',
    options: designOptions(BRAND_TYPE_SCALES, 'brand.choice.typeScale'),
    stray: 'Do not invent a fourth level, do not give a pixel size — the field holds one id.',
    de: 'Wie laut soll eure Hierarchie sein — ruhig, dicht oder plakativ?',
    deSolo: 'Wie laut soll deine Hierarchie sein — ruhig, dicht oder plakativ?',
    en: 'How loud should your hierarchy be — calm, dense or bold?',
  },
  {
    slotId: 'j.kind',
    options: designOptions(BRAND_MARK_KINDS, 'brand.choice.markKind'),
    stray: 'Do not invent a fifth direction, do not merge two, and do not describe a logo in words.',
    de: 'Welche Richtung soll euer Zeichen nehmen — Wortmarke, Bildmarke, Kombination oder Monogramm?',
    deSolo: 'Welche Richtung soll dein Zeichen nehmen — Wortmarke, Bildmarke, Kombination oder Monogramm?',
    en: 'Which direction should your mark take — wordmark, pictorial, combination or monogram?',
  },
  {
    slotId: 'j.pick',
    options: designOptions(BRAND_MARK_SETTINGS, 'brand.choice.markSetting'),
    stray: 'There are exactly two settings — do not invent a third and do not answer "both".',
    de: 'Welche der zwei Setzungen soll als Vorzugs-Beispiel im Briefing stehen?',
    en: 'Which of the two settings should be the preferred example in the brief?',
  },
  {
    slotId: 'k.illustration',
    options: designOptions(BRAND_ILLUSTRATION_OPTIONS, 'brand.choice.illustration'),
    stray: 'Do not invent a fifth language and do not answer "depends" — the field holds one id.',
    de: 'Welche Illustrations-Sprache passt — oder bewusst keine?',
    en: 'Which illustration language fits — or deliberately none?',
  },
  {
    slotId: 'k.icons',
    options: designOptions(BRAND_ICON_OPTIONS, 'brand.choice.iconSet'),
    stray: 'Do not invent a fourth icon set and do not name a library — the field holds one id.',
    de: 'Welcher Icon-Satz passt zu eurer Schrift — Linie, Fläche oder kräftig?',
    deSolo: 'Welcher Icon-Satz passt zu deiner Schrift — Linie, Fläche oder kräftig?',
    en: 'Which icon set fits your typeface — line, filled or bold?',
  },
  {
    slotId: 'l.tempo',
    options: designOptions(BRAND_TEMPO_OPTIONS, 'brand.choice.tempo'),
    stray: 'Do not invent a fourth tempo, do not give a duration in milliseconds — the field holds one id.',
    de: 'Wie schnell soll sich eure Marke bewegen — ruhig, lebendig oder knapp?',
    deSolo: 'Wie schnell soll sich deine Marke bewegen — ruhig, lebendig oder knapp?',
    en: 'How fast should your brand move — calm, lively or snappy?',
  },
  {
    slotId: 'l.logo',
    options: designOptions(BRAND_LOGO_MOTION_OPTIONS, 'brand.choice.logoMotion'),
    stray: 'There is no "maybe" and no third option — the field holds one id.',
    de: 'Soll sich euer Zeichen bewegen — oder still stehen?',
    deSolo: 'Soll sich dein Zeichen bewegen — oder still stehen?',
    en: 'Should your mark move — or stand still?',
  },
].map(entry => ({
  slotId: entry.slotId,
  kind: 'closed' as const,
  options: entry.options,
  strayRule: entry.stray,
  fallbackQuestion: { de: entry.de, en: entry.en },
}))

/**
 * DIE SLOTS MIT EIGENER BÜHNE — sie bekommen KEINE Text-Karten (s. o.).
 * `result.direction` und `g.board` standen schon vorher als Einzelfälle in der
 * Werkstatt; seit D8 sind es zehn, und zehn Einzelfälle gehören in eine Liste.
 */
export const BRAND_STAGE_CHOICE_SLOTS: readonly string[] = [
  'result.direction',
  'g.board',
  ...DESIGN_CONTRACTS.map(contract => contract.slotId),
]

/**
 * DIE ZWEI AUSWAHL-SESSIONS DER SCHICHT 3 (Konzept BRAND-BOOK-KIT §2.3,
 * Paket K5) — `n.scope` und `n.review`.
 *
 * ── WARUM SIE EINEN VERTRAG BRAUCHEN, OBWOHL NIEMAND SIE ENTWIRFT ────────
 * Beide stehen auf `generator: 'none'`; kein Modell schreibt hier je einen
 * Wert. Der Vertrag ist trotzdem Pflicht, und zwar aus DREI Gründen, von denen
 * jeder für sich reichte:
 *  1. Die KARTEN kommen aus ihm (`choiceCardsFor`) — vier bzw. drei Karten mit
 *     Name, Wirkung und Beispiel. Ohne ihn stünde dort ein Textfeld, und in
 *     `brand.md` läse eine Maschine irgendwann „eigentlich nur Social, ausser
 *     bei Kampagnen".
 *  2. Die LOG-KARTE liest ihn (`brandChoiceDisplayLabel`): sonst steht im
 *     Handbuch und in der Werkstatt die rohe Id `text-only`.
 *  3. Diese zwei Werte reisen WÖRTLICH in `brand.md` und `brand.json` (§2.6)
 *     und werden dort von einem Agenten ausgewertet — sie sind der Grund,
 *     warum `brandKitVocab.ts` überhaupt existiert.
 *
 * Die MENGE steht dort und wird hier nur übersetzt: eine zweite Liste wäre
 * genau die zweite Wahrheit, gegen die beide Dateien geschrieben sind.
 */
function kitOptions(
  terms: readonly BrandKitTerm[],
  copyKeys: Readonly<Record<string, string>>,
): readonly BrandChoiceOption[] {
  return terms.map(term => ({
    id: term.id,
    label: term.en,
    hint: term.noteEn,
    display: { de: term.de, en: term.en },
    // AUSGESCHRIEBEN, nicht gerechnet (s. Kopf von `BrandChoiceOption.copyKey`):
    // `text-only` trägt einen Bindestrich, und ein Schlüssel-Pfad verträgt ihn
    // schlecht. Eine versteckte Umwandlung wäre eine Kopplung, die kein
    // Wächter sieht — `check:i18n-keys` prüft Config-Schlüssel, nicht
    // gerechnete.
    copyKey: copyKeys[term.id] ?? '',
  }))
}

const KIT_CONTRACTS: readonly BrandChoiceContract[] = [
  {
    slotId: 'n.scope',
    kind: 'closed',
    options: kitOptions(BRAND_AI_SCOPES, {
      drafts: 'brand.choice.aiScope.drafts',
      'text-only': 'brand.choice.aiScope.textOnly',
      internal: 'brand.choice.aiScope.internal',
      none: 'brand.choice.aiScope.none',
    }),
    strayRule: 'Do not invent a fifth scope, do not combine two, and do not answer with a workflow — '
      + 'the field holds one id and nothing else. Who checks the text is the NEXT session.',
    fallbackQuestion: {
      de: 'Was darf eine Maschine in eurem Namen schreiben — Entwürfe für alles, nur Text, '
        + 'nur intern, oder nichts Kundenseitiges?',
      deSolo: 'Was darf eine Maschine in deinem Namen schreiben — Entwürfe für alles, nur Text, nur intern, oder '
        + 'nichts Kundenseitiges?',
      en: 'What may a machine write in your name — drafts for everything, text only, '
        + 'internal only, or nothing customer-facing?',
    },
  },
  {
    slotId: 'n.review',
    kind: 'closed',
    options: kitOptions(BRAND_AI_REVIEWS, {
      every: 'brand.choice.aiReview.every',
      sample: 'brand.choice.aiReview.sample',
      channel: 'brand.choice.aiReview.channel',
    }),
    strayRule: 'There are exactly three rules — do not invent a fourth, do not answer "it depends" '
      + 'without naming the channel (that IS the third rule), and do not describe the scope again.',
    fallbackQuestion: {
      de: 'Wer liest einen Text, bevor er rausgeht — jemand bei jeder Veröffentlichung, '
        + 'stichprobenartig, oder je nach Kanal?',
      en: 'Who reads a text before it goes out — someone for every publication, as a spot check, '
        + 'or depending on the channel?',
    },
  },
]

const CONTRACTS: readonly BrandChoiceContract[] = [...BASE_CONTRACTS, ...KIT_CONTRACTS, {
  /**
   * DIE WEICHE (`g.source`) — geschlossen, zwei Optionen (s.
   * `BRAND_DNA_SOURCES`).
   *
   * Ohne Vertrag stünde in der Log-Karte die rohe Id `inspiration`, und
   * „Korrigieren" führte in ein Textfeld statt zurück auf die zwei Karten
   * (die P4-Restkante, die `choiceCardsFor` schliesst).
   *
   * `fallbackQuestion` steht da, obwohl `g.source` `generator: 'none'` hat und
   * heute niemand entwirft: der Vertrag beschreibt, was in dem Feld stehen
   * DARF, nicht wer es hineinschreibt — und die Frage ist dieselbe, die die
   * Karte stellt.
   */
  slotId: 'g.source',
  kind: 'closed',
  options: BRAND_DNA_SOURCES,
  strayRule: 'Do not invent a third way, do not answer "maybe later", and do not describe a look — '
    + 'the field holds one id and nothing else.',
  fallbackQuestion: {
    de: 'Habt ihr Vorbilder — Screenshots, eine Pinnwand, drei Seiten, die euch gefallen? '
      + 'Beides ist in Ordnung; ohne Vorbilder komme ich aus eurer Foundation zur Richtung.',
    deSolo: 'Hast du Vorbilder — Screenshots, eine Pinnwand, drei Seiten, die dir gefallen? Beides ist in '
      + 'Ordnung; ohne Vorbilder komme ich aus deiner Foundation zur Richtung.',
    en: 'Do you have references — screenshots, a pinboard, three sites you like? '
      + 'Either is fine; without them I get to the direction from your foundation.',
  },
}, {
  /**
   * DIE RICHTUNG (Paket G4) — geschlossen wie die Architektur-Modelle.
   *
   * Der Vertrag steht hier und die Menge in `brandDirections.ts`, weil dort
   * noch mehr an einer Richtung hängt (Farbwelt, Schriftpaar, Archetypen-
   * Zuordnung) als in eine Option passt. Er ist trotzdem nötig: ohne ihn stünde
   * in der Log-Karte und im Chat die rohe Id `warm-editorial`, und George
   * dürfte sich eine siebte Welt ausdenken.
   *
   * ANGEBOTEN werden dem Menschen nur DREI davon (`suggestBrandDirections`);
   * der Vertrag kennt alle sechs, denn er beschreibt, was in dem Feld STEHEN
   * darf — nicht, was gerade auf dem Bildschirm liegt. Wer seine Marke von
   * Hand auf eine vierte Welt setzt, hat keinen Verstoss begangen.
   */
  slotId: 'result.direction',
  kind: 'closed',
  options: BRAND_DIRECTION_OPTIONS,
  strayRule: 'Do not invent a seventh direction, do not merge two into one, and do not describe a look '
    + 'in your own words — the field holds one id and nothing else.',
  fallbackQuestion: {
    de: 'Ich kann euch die Richtung nicht abnehmen — sie ist eine Entscheidung, keine Ableitung. '
      + 'Welche der drei Welten fühlt sich nach euch an?',
    deSolo: 'Ich kann dir die Richtung nicht abnehmen — sie ist eine Entscheidung, keine Ableitung. Welche der '
      + 'drei Welten fühlt sich nach dir an?',
    en: 'I cannot settle the direction for you — it is a decision, not a derivation. '
      + 'Which of the three worlds feels like you?',
  },
}, {
  /**
   * DAS GEWÄHLTE MOODBOARD (`g.board`, Brand Design D2c) — geschlossen, drei
   * Optionen.
   *
   * Die Menge steht in `brandDesignDna.ts` (`BRAND_DNA_BOARD_KINDS`), weil an
   * einem Board mehr hängt als ein Name: die Achsen-Regel, aus der es entsteht,
   * seine Farbrollen und sein Schriftpaar. Der Vertrag hier ist trotzdem nötig
   * — ohne ihn stünde im Handbuch und in der Log-Karte die rohe Id `proposed`.
   *
   * ANGEZEIGT werden sie NICHT als Text-Karten (`choiceCardsFor` blendet den
   * Slot aus, wie `result.direction`): drei gerenderte Szenen sagen mehr über
   * drei Welten als drei Absätze. `copyKey` zeigt deshalb ins Leere, und das
   * ist ausdrücklich erlaubt (s. Kopf von `BrandChoiceOption.copyKey`).
   */
  slotId: 'g.board',
  kind: 'closed',
  options: BRAND_DNA_BOARD_OPTIONS,
  strayRule: 'Do not invent a fourth board, do not mix two into one — mixing is the next session, and '
    + 'the field holds one id and nothing else.',
  fallbackQuestion: {
    de: 'Welches der drei Boards ist euer Ausgangspunkt? Mischen könnt ihr gleich danach — '
      + 'hier geht es nur darum, womit wir anfangen.',
    deSolo: 'Welches der drei Boards ist dein Ausgangspunkt? Mischen kannst du gleich danach — hier geht es nur '
      + 'darum, womit wir anfangen.',
    en: 'Which of the three boards is your starting point? You can mix straight afterwards — '
      + 'this is only about where we begin.',
  },
}, {
  /**
   * DER GRUNDTON (`h.neutral`, Brand Design D3) — geschlossen, drei Optionen.
   *
   * Er ist die einzige Session der Farbwelt, deren Wert eine ID ist (Basis und
   * Akzent sind Hex-Werte, alles andere ist gerechnet). Genau deshalb braucht
   * sie den Vertrag: „tinted" im Handbuch wäre kein Satz, sondern ein Feldname.
   */
  slotId: 'h.neutral',
  kind: 'closed',
  options: BRAND_NEUTRAL_CHOICE_OPTIONS,
  strayRule: 'Do not invent a fourth tint, do not name a colour, and do not answer "both" — the field '
    + 'holds one id and nothing else.',
  fallbackQuestion: {
    de: 'Sollen eure Flächen einen Hauch eurer Marken-Farbe tragen — oder bewusst warm oder kühl sein?',
    deSolo: 'Sollen deine Flächen einen Hauch deiner Marken-Farbe tragen — oder bewusst warm oder kühl sein?',
    en: 'Should your surfaces carry a hint of your brand colour — or be deliberately warm or cool?',
  },
}, ...DESIGN_CONTRACTS]

const CONTRACTS_BY_SLOT = new Map<string, BrandChoiceContract>(
  CONTRACTS.map(contract => [contract.slotId, contract]),
)

/** `null` = dieser Slot ist keine geregelte Auswahl (dann gilt nur `maxLength`). */
export function brandChoiceContract(slotId: string): BrandChoiceContract | null {
  return CONTRACTS_BY_SLOT.get(slotId) ?? null
}

/**
 * DIE REGEL FÜR DEN PROMPT — englisch, wörtlich in die Slot-Instruktion.
 *
 * Bei der geschlossenen Auswahl nennt sie die Menge EXPLIZIT (Id, Name,
 * Halbsatz Wirkung) und sagt, dass genau eine Id im Feld steht. Ein Prompt, der
 * „choose one of the common models" sagt, bekommt „Hybrid" zurück.
 */
export function brandChoicePromptRule(contract: BrandChoiceContract): string[] {
  if (contract.kind === 'open') {
    return [
      `The field value is a CATEGORY LABEL, not a sentence: one line, at most ${contract.maxWords} words, `
      + 'no full stop, no explanation. The explanation belongs in the BASIS line of your turn.',
    ]
  }
  return [
    'The field value is EXACTLY ONE of these ids, written on a single line and nothing else:',
    ...contract.options.map(option => `  ${option.id} = ${option.label} — ${option.hint}`),
    `${contract.strayRule} Why you chose it and what it costs them belongs in the BASIS line of your `
    + 'turn, never in the field.',
  ]
}

/**
 * DIE WERT-ZEILE EINES ZUGES GEGEN IHRE ANZEIGE TAUSCHEN (Live-Fund
 * 2026-09-04, erster Archetyp-Lauf: die rohe Id `sage` stand in der
 * Sprechblase — der DRAFT-Block reist im Chat-Zug mit).
 *
 * ── SIE STEHT IM SHARED-ORDNER, WEIL SIE ZWEI LESER HAT ───────────────────
 * Der SERVER tauscht vor dem Persistieren (`advisorGenerator.ts` — der
 * Verlauf beim Neuladen), der BROWSER tauscht die GESTREAMTE Blase beim
 * `slot.ready`-Frame (die Deltas sind da längst gemalt, niemand ersetzt sie
 * nachträglich). Zwei Kopien der Regel wären zwei Meinungen darüber, was
 * eine Wert-Zeile ist — und die Abweichung stünde wörtlich im Chat.
 *
 * ── NUR GANZE ZEILEN, NUR KATALOG-TREFFER ─────────────────────────────────
 * Getauscht wird eine Zeile, die FÜR SICH ALLEIN als Katalog-Wert durchgeht
 * (dieselbe Prüfung wie beim Feldwert, `checkBrandChoiceDraft` — Id, Label
 * oder Anzeige, egal welche Sprache). Prosa-Sätze bleiben unangetastet;
 * ohne Vertrag für den Slot passiert nichts — fail-soft, ein falscher
 * Tausch mitten im Satz wäre schlimmer als eine sichtbare Id.
 */
export function swapBrandChoiceValueLine(slotId: string, message: string, locale: string): string {
  const contract = brandChoiceContract(slotId)
  if (!contract) return message
  let swapped = false
  const lines = message.split('\n').map((line) => {
    const check = checkBrandChoiceDraft(contract, line.trim())
    if (!check.ok || !line.trim()) return line
    swapped = true
    return brandChoiceDisplayLabel(slotId, check.value, locale)
  })
  return swapped ? lines.join('\n') : message
}

export type BrandChoiceViolation = 'not_an_option' | 'not_a_label'

export type BrandChoiceCheck =
  | { readonly ok: true, readonly value: string }
  | { readonly ok: false, readonly violation: BrandChoiceViolation }

/** Zeilenumbrüche, Aufzählungszeichen und Anführungszeichen weg — was bleibt, wird geprüft. */
function tidy(draft: string): string {
  return draft
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/^["'„»]+|["'“«]+$/g, '')
    .trim()
}

/**
 * HÄLT DIESER ENTWURF SEINEN AUSWAHL-VERTRAG EIN?
 *
 * NACHSICHTIG BEIM LESEN, STRENG BEIM SPEICHERN: eine geschlossene Auswahl darf
 * das Modell mit der Id ODER mit dem Namen beantworten („house-of-brands" wie
 * „House of Brands"), gespeichert wird immer die Id. Alles andere — ein
 * erfundenes Modell, zwei Modelle, ein ganzer Absatz — ist ein Verstoss, und aus
 * dem Verstoss macht der Generator eine Rückfrage.
 *
 * Der Grund für die Nachsicht ist kein Entgegenkommen, sondern Sparsamkeit:
 * jede unnötige Rückfrage kostet den Menschen einen Zug und uns einen zweiten
 * Anbieter-Lauf, ohne dass die ENTSCHEIDUNG des Modells falsch gewesen wäre.
 */
export function checkBrandChoiceDraft(contract: BrandChoiceContract, draft: string): BrandChoiceCheck {
  const text = tidy(draft)
  if (!text) return { ok: false, violation: contract.kind === 'closed' ? 'not_an_option' : 'not_a_label' }

  if (contract.kind === 'closed') {
    // Nur EINE Zeile darf übrig sein: „branded-house\nsub-brands" ist keine
    // Entscheidung, sondern eine Liste.
    if (text.includes('\n')) return { ok: false, violation: 'not_an_option' }
    const needle = text.toLowerCase().replace(/[.,;:!?]+$/, '').trim()
    const hit = contract.options.find(option => (
      option.id.toLowerCase() === needle || option.label.toLowerCase() === needle
    ))
    return hit ? { ok: true, value: hit.id } : { ok: false, violation: 'not_an_option' }
  }

  if (text.includes('\n')) return { ok: false, violation: 'not_a_label' }
  const label = text.replace(/[.;:!?]+$/, '').trim()
  const words = label.split(/\s+/).filter(word => word.length > 0)
  if (words.length === 0 || words.length > contract.maxWords) {
    return { ok: false, violation: 'not_a_label' }
  }
  return { ok: true, value: label }
}

/**
 * Die Rückfrage in der Sprache der OBERFLÄCHE (nicht der Marke): sie ist Chat,
 * und Chat folgt Regel 9. Alles, was nicht mit `de` beginnt, bekommt Englisch —
 * dieselbe Konvention wie `advisorOpenersFor`.
 */
export function brandChoiceFallbackQuestion(
  contract: BrandChoiceContract,
  locale: string,
  team: BrandTeamKind = 'team',
): string {
  if (!locale.toLowerCase().startsWith('de')) return contract.fallbackQuestion.en
  const question = contract.fallbackQuestion
  // `team` ist die Vorgabe, nicht `solo`: eine Aufrufstelle, die die Weiche
  // (noch) nicht kennt, bekommt den Text, der vor dieser Runde dort stand.
  // Der Rückfall auf `de` gilt zusätzlich für jeden Vertrag ohne Anrede.
  return team === 'solo' ? (question.deSolo ?? question.de) : question.de
}

/**
 * WAS DER MENSCH STATT DER ROHEN ID LIEST (P4).
 *
 * Sie gilt für JEDEN geschlossenen Vertrag, nicht für `b2.model` allein: seit
 * P4/Interim liegen in `d.primary`/`d.secondary` Archetyp-Ids (`sage`), und die
 * Log-Karte des Archetyp-Kapitels liest hier genauso nach wie die der
 * Markenarchitektur.
 *
 * Gespeichert bleibt IMMER die stabile Id (`branded-house`) — sie ist die
 * Zusage an das Brand-Dokument, an den Prompt und an jede spätere Ableitung.
 * Angezeigt wird sie nie: „branded-house" in einer Log-Karte sieht aus wie ein
 * Datenbank-Leck, und der Mensch hat auf einer KARTE „Branded House" geklickt.
 *
 * DREI FÄLLE, EINE ANTWORT — und der Rückfall ist der WERT SELBST:
 *  - geschlossener Vertrag + bekannte Id ⇒ der Name in der Sprache der
 *    Oberfläche;
 *  - geschlossener Vertrag + UNBEKANNTER Wert (Alt-Bestand aus der Zeit des
 *    Textfelds, ein von Hand korrigierter Slot) ⇒ unverändert. Ein „—" oder
 *    eine leere Zeile würde einen vorhandenen Wert verschwinden lassen;
 *  - offener Slot (`b.positioningCategory`) oder gar kein Vertrag ⇒
 *    unverändert. Dort IST der Text die Antwort.
 *
 * Sprach-Konvention wie überall in dieser Datei: alles, was nicht mit `de`
 * beginnt, bekommt Englisch.
 */
export function brandChoiceDisplayLabel(slotId: string, storedValue: string, locale = 'en'): string {
  const contract = brandChoiceContract(slotId)
  if (!contract || contract.kind !== 'closed') return storedValue
  const hit = contract.options.find(option => option.id === storedValue)
  if (!hit) return storedValue
  return locale.toLowerCase().startsWith('de') ? hit.display.de : hit.display.en
}
