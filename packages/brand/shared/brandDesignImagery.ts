import { brandDesignDefaultsFromDna } from './brandDesign'
import { BRAND_ICON_OPTIONS, BRAND_ILLUSTRATION_OPTIONS, brandTermById } from './brandDesignVocab'
import { BRAND_FONT_PAIRS, brandFontPair } from './brandFontPairs'
import { brandSlotValueView, formatBrandSlotList, formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE BILDSPRACHE — die REGELN von Kapitel 5, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.6, Paket D6).
 *
 * ── VIER SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ───────────────────
 * `k.photo` ist das Bild-Prinzip, `k.illustration` und `k.icons` sind die zwei
 * Wahlen daneben, und `k.dodont` ist die Liste, die AUS ALLEN DREIEN folgt.
 * Getrennt lägen Schreiber und Leser derselben Form in vier Dateien (dieselbe
 * Begründung wie `brandDesignColor.ts` in D3, `brandDesignType.ts` in D4 und
 * `brandDesignMark.ts` in D5).
 *
 * ── REGELN STATT BILDER (§1.4) ────────────────────────────────────────────
 * „Keine generierten Fotos. Bildsprache sind Prinzipien und Do/Don't." Diese
 * Datei erzeugt deshalb TEXT und Zahlen — kein Bild, kein Prompt, kein
 * Bild-Modell. Die drei Prinzipien werden in der Bühne als ABSTRAHIERTE
 * Kompositionen aus der bestätigten Farbwelt gezeigt; ein Foto (Stock oder
 * generiert) verkaufte die Entscheidung, die hier gerade getroffen wird — man
 * wählte dann das Bild und nicht das Prinzip.
 *
 * Die OPTIONALEN KI-Beispielbilder aus §2.6 gehören nicht zu D6: sie hängen am
 * Bild-Transport von D5c, und der wartet auf Davids Anbieter-Entscheidung.
 *
 * ── DAS DO & DON'T IST GERECHNET, NICHT GESCHRIEBEN ───────────────────────
 * Jedes Prinzip trägt seine vier Achsen ALS PAAR: das „Do" ist genau der Satz,
 * der auf der Karte steht, das „Don't" sein Gegenstück. Dazu je ein Paar aus
 * der Illustrations- und der Icon-Wahl. Damit gilt das Qualitätsmerkmal der
 * Session wörtlich — „every do has its matching do-not, the pair is what makes
 * it checkable" —, und es gibt keinen Modell-Lauf, dessen Ergebnis niemand
 * prüfen könnte. Dieselbe Arbeitsteilung wie in D5 (Masse gerechnet, Prosa
 * geschrieben), nur ohne den geschriebenen Teil.
 *
 * ── DIE STRICHSTÄRKE IST EINE AUSKUNFT, KEIN TOR ──────────────────────────
 * `brandIconStrokeVerdict()` sagt, ob die Strichstärke des gewählten Satzes zur
 * Spanne des Schriftpaars passt. Sie SPERRT nichts: eine Marke darf laute Icons
 * wollen, und ein ausgegrauter Knopf würde eine Geschmacksfrage zu einer
 * Fehlermeldung machen. Anders als die Kontrast-Regel in D3, die eine
 * Barrierefreiheits-Zusage ist und deshalb wirklich klemmt.
 *
 * DIESE DATEI IST PUR: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

function isGerman(locale: string): boolean {
  return locale.toLowerCase().startsWith('de')
}

/** Zweisprachiger Satz — dieselbe Form wie überall im Layer. */
export interface BrandImageryText {
  readonly de: string
  readonly en: string
}

function textOf(entry: BrandImageryText, locale: string): string {
  return isGerman(locale) ? entry.de : entry.en
}

// ── Die vier Achsen eines Bild-Prinzips (`k.photo`) ────────────────────────

/**
 * DIE VIER ACHSEN, IN DIESER REIHENFOLGE — sie ist der Lese-Schlüssel des
 * Slot-Wertes und die Reihenfolge auf der Karte.
 *
 * Vier und nicht mehr: Licht, Ausschnitt, Menschen, Farbigkeit sind die
 * Entscheidungen, die eine Fotografin VOR dem Termin braucht. Alles Weitere
 * (Objektiv, Format, Bildbearbeitung) ist ihr Handwerk und nicht die Marke.
 */
export const BRAND_IMAGERY_AXES = ['light', 'crop', 'people', 'colour'] as const
export type BrandImageryAxis = (typeof BRAND_IMAGERY_AXES)[number]

/** Die Beschriftungen der Achsen — sie stehen im Slot-Wert der Marke. */
export const BRAND_IMAGERY_AXIS_LABELS: Readonly<Record<BrandImageryAxis, BrandImageryText>> = {
  light: { de: 'Licht', en: 'Light' },
  crop: { de: 'Ausschnitt', en: 'Crop' },
  people: { de: 'Menschen', en: 'People' },
  colour: { de: 'Farbigkeit', en: 'Colour' },
}

/**
 * EIN PAAR JE ACHSE: was gilt, und was daneben verboten ist.
 *
 * Das „Do" ist der Satz, der auf der Prinzip-Karte steht — er wird NICHT für
 * die Liste noch einmal formuliert. Zwei Fassungen desselben Satzes wären zwei
 * Regeln, sobald jemand eine davon anfasst.
 */
export interface BrandImageryAxisRule {
  readonly doText: BrandImageryText
  readonly dontText: BrandImageryText
}

export interface BrandImageryPrinciple {
  /** Stabile Id — sie entscheidet die Vorbelegung und die Skizze. Nie umbenennen. */
  readonly id: string
  readonly name: BrandImageryText
  /** Warum dieses Prinzip zu dieser Marke gehört — eine Begründung, kein Lob. */
  readonly reason: BrandImageryText
  /**
   * Welche abstrahierte Komposition die Bühne zeichnet. Der Wert ist eine
   * ANWEISUNG an die Vorschau, kein Bild: die Farben kommen aus der
   * bestätigten Farbwelt, die Formen aus dieser Id.
   */
  readonly scene: 'daylight' | 'contrast' | 'closeup'
  readonly axes: Readonly<Record<BrandImageryAxis, BrandImageryAxisRule>>
}

/**
 * DIE DREI BILD-PRINZIPIEN (§2.6) — übernommen aus dem freigegebenen Prototyp
 * (`.playground/app/utils/demoDesign.ts`, `DS_IMAGERY_PRINCIPLES`) und um die
 * „Don't"-Hälfte jeder Achse ergänzt.
 *
 * DREI und nicht fünf: es sind die drei Haltungen, die sich in einem Bild
 * wirklich unterscheiden lassen (weiches Licht · hartes Licht · Textur).
 * Feinere Abstufungen wären eine Auswahl, die niemand ohne Fachwissen treffen
 * kann — genau das, was das Kapitel verspricht zu vermeiden.
 *
 * D6: die Texte sind Davids Inhalts-Gate (aus dem Prototyp übernommen, die
 * „Don't"-Hälften sind der Entwurf des Baus).
 */
export const BRAND_IMAGERY_PRINCIPLES: readonly BrandImageryPrinciple[] = [
  {
    id: 'daylight',
    name: { de: 'Tageslicht, nichts gestellt', en: 'Daylight, nothing staged' },
    reason: {
      de: 'Aus der Bildwelt „dokumentarisch": weiches Fensterlicht zeigt, was da ist — '
        + 'Studioblitz zeigt, was inszeniert wurde.',
      en: 'From the "documentary" imagery dimension: soft window light shows what is there — '
        + 'a studio flash shows what was staged.',
    },
    scene: 'daylight',
    axes: {
      light: {
        doText: {
          de: 'Weiches Seitenlicht, sichtbare Schatten, keine Aufheller.',
          en: 'Soft side light, visible shadows, no fill.',
        },
        dontText: {
          de: 'Studioblitz und ausgeleuchtete Flächen ohne einen einzigen Schatten.',
          en: 'Studio flash and evenly lit surfaces without a single shadow.',
        },
      },
      crop: {
        doText: {
          de: 'Weiter Ausschnitt, Raum um das Motiv.',
          en: 'A wide crop with room around the subject.',
        },
        dontText: {
          de: 'Enge Ausschnitte, die den Ort verschweigen.',
          en: 'Tight crops that hide where this happens.',
        },
      },
      people: {
        doText: {
          de: 'Menschen bei der Arbeit, nie in die Kamera lächelnd.',
          en: 'People at work, never smiling into the camera.',
        },
        dontText: {
          de: 'Gestellte Gruppenbilder mit Daumen hoch.',
          en: 'Staged group shots with thumbs up.',
        },
      },
      colour: {
        doText: {
          de: 'Gedämpfte Töne aus der Farbwelt, der Akzent sparsam.',
          en: 'Muted tones from your colour world, the accent used sparingly.',
        },
        dontText: {
          de: 'Farbfilter und Sättigungs-Regler, die die eigenen Töne verschieben.',
          en: 'Colour filters and saturation sliders that shift your tones.',
        },
      },
    },
  },
  {
    id: 'contrast',
    name: { de: 'Dunkel und konzentriert', en: 'Dark and focused' },
    reason: {
      de: 'Näher an „souverän" als an „ehrlich": harte Schatten, wenig Fläche — wirkt teurer, '
        + 'aber auch verschlossener.',
      en: 'Closer to "confident" than to "honest": hard shadows, little surface — it reads as more '
        + 'expensive, and as more closed.',
    },
    scene: 'contrast',
    axes: {
      light: {
        doText: {
          de: 'Hartes, gerichtetes Licht; tiefe Schatten auf dunklem Grund.',
          en: 'Hard, directional light; deep shadows on a dark ground.',
        },
        dontText: {
          de: 'Flaches Licht, das die Tiefe wegnimmt.',
          en: 'Flat light that takes the depth away.',
        },
      },
      crop: {
        doText: {
          de: 'Enger Ausschnitt, viel ruhige dunkle Fläche daneben.',
          en: 'A tight crop with a lot of quiet dark surface beside it.',
        },
        dontText: {
          de: 'Überfüllte Bilder, in denen keine Fläche ruhig bleibt.',
          en: 'Crowded pictures in which no surface stays quiet.',
        },
      },
      people: {
        doText: {
          de: 'Hände und Werkzeug statt Gesichter.',
          en: 'Hands and tools instead of faces.',
        },
        dontText: {
          de: 'Porträts, die in die Kamera lachen.',
          en: 'Portraits laughing into the camera.',
        },
      },
      colour: {
        doText: {
          de: 'Ein heller Ton als einziges Licht im Bild.',
          en: 'One light tone as the only light in the frame.',
        },
        dontText: {
          de: 'Mehrere Buntfarben nebeneinander.',
          en: 'Several bright colours side by side.',
        },
      },
    },
  },
  {
    id: 'closeup',
    name: { de: 'Nah am Handwerk', en: 'Close to the craft' },
    reason: {
      de: 'Textur statt Szene: Material, Werkzeug, Spur der Arbeit. Zeigt das Versprechen, '
        + 'ohne es zu behaupten.',
      en: 'Texture instead of scene: material, tool, the trace of the work. It shows the promise '
        + 'without claiming it.',
    },
    scene: 'closeup',
    axes: {
      light: {
        doText: {
          de: 'Diffuses, gleichmäßiges Licht ohne Drama.',
          en: 'Diffuse, even light without drama.',
        },
        dontText: {
          de: 'Harte Spitzlichter, die die Textur ausbrennen.',
          en: 'Hard highlights that burn out the texture.',
        },
      },
      crop: {
        doText: {
          de: 'Sehr nah: das Detail füllt das Bild.',
          en: 'Very close: the detail fills the frame.',
        },
        dontText: {
          de: 'Übersichtsbilder, auf denen das Detail verschwindet.',
          en: 'Overview shots in which the detail disappears.',
        },
      },
      people: {
        doText: {
          de: 'Hände im Bild, Gesicht optional.',
          en: 'Hands in the frame, faces optional.',
        },
        dontText: {
          de: 'Menschen als Staffage neben dem Produkt.',
          en: 'People as decoration beside the product.',
        },
      },
      colour: {
        doText: {
          de: 'Nur Töne aus der Farbwelt, keine Fremdfarbe.',
          en: 'Only tones from your colour world, no foreign colour.',
        },
        dontText: {
          de: 'Requisiten in Signalfarben, die den Blick stehlen.',
          en: 'Props in signal colours that steal the eye.',
        },
      },
    },
  },
]

export function brandImageryPrinciple(principleId: string): BrandImageryPrinciple | undefined {
  return BRAND_IMAGERY_PRINCIPLES.find(principle => principle.id === principleId)
}

export function isBrandImageryPrinciple(principleId: string): boolean {
  return BRAND_IMAGERY_PRINCIPLES.some(principle => principle.id === principleId)
}

// ── Die Vorbelegung (H5) ───────────────────────────────────────────────────

/**
 * WELCHES PRINZIP DIE DNA VORSCHLÄGT — aus der Dimension „Bildwelt".
 *
 * Sie ist die einzige DNA-Dimension, die WIRKLICH über ein Bild spricht;
 * „Materialität" und „Grundstimmung" beschreiben Oberflächen und Gefühl und
 * würden hier zu einer zweiten, schwächeren Meinung über dieselbe Frage
 * (dieselbe Regel wie bei der Zeichen-Richtung in D5: EINE Zuordnung, nicht
 * drei, die sich überstimmen).
 *
 * `still` (inszeniert-still) landet bewusst bei „dunkel und konzentriert": eine
 * gebaute Stillleben-Szene lebt von gerichtetem Licht, nicht von Fensterlicht.
 */
export const BRAND_IMAGERY_PRINCIPLE_BY_DNA: Readonly<Record<string, string>> = {
  documentary: 'daylight',
  people: 'daylight',
  still: 'contrast',
  abstract: 'contrast',
  craftClose: 'closeup',
}

/**
 * Ohne DNA gilt „Tageslicht": es behauptet am wenigsten, verlangt keine
 * Ausrüstung und lässt sich in jeder Branche fotografieren — dieselbe
 * Begründung wie die Wortmarke in D5.
 */
export const BRAND_IMAGERY_PRINCIPLE_FALLBACK = 'daylight'

export function brandImageryPrincipleDefault(
  dna: Readonly<Record<string, string>> | undefined,
): string {
  const fromDna = BRAND_IMAGERY_PRINCIPLE_BY_DNA[dna?.imagery ?? ''] ?? ''
  return isBrandImageryPrinciple(fromDna) ? fromDna : BRAND_IMAGERY_PRINCIPLE_FALLBACK
}

export function isBrandIllustrationOption(optionId: string): boolean {
  return BRAND_ILLUSTRATION_OPTIONS.some(option => option.id === optionId)
}

export function isBrandIconOption(optionId: string): boolean {
  return BRAND_ICON_OPTIONS.some(option => option.id === optionId)
}

export interface BrandImageryDefaults {
  /** Id aus `BRAND_IMAGERY_PRINCIPLES`. */
  principle: string
  /** Id aus `BRAND_ILLUSTRATION_OPTIONS`. */
  illustration: string
  /** Id aus `BRAND_ICON_OPTIONS`. */
  icons: string
}

/**
 * DAS KAPITEL BELEGT SICH SELBST VOR (H5: „jede Session muss als BESTÄTIGUNG
 * durchlaufbar sein").
 *
 * Illustration und Icons kommen aus `brandDesignDefaultsFromDna()` (D0) —
 * dieselbe Tabelle, die Produkt 03 lesen wird. Eine zweite Zuordnung hier wäre
 * eine zweite Meinung darüber, was „nah am Handwerk" für eine Zeichnung heisst;
 * dort steht sie einmal, für alle sechs Kapitel.
 */
export function brandImageryDefaults(
  dna: Readonly<Record<string, string>> | undefined,
): BrandImageryDefaults {
  const fromDna = brandDesignDefaultsFromDna(dna)
  const illustration = fromDna.illustration ?? ''
  const icons = fromDna.icons ?? ''
  return {
    principle: brandImageryPrincipleDefault(dna),
    illustration: isBrandIllustrationOption(illustration) ? illustration : BRAND_ILLUSTRATION_OPTIONS[0]!.id,
    icons: isBrandIconOption(icons) ? icons : BRAND_ICON_OPTIONS[0]!.id,
  }
}

// ── Die Strichstärke der Icons (`k.icons`) ─────────────────────────────────

/**
 * DIE STRICHSTÄRKE JEDES SATZES, in px bei einem 24 px grossen Icon.
 *
 * Es sind die ECHTEN Zahlen des Phosphor-Satzes, den die Bühne zeigt: sein
 * `viewBox` ist 256 breit, `regular` zeichnet mit 16, `bold` mit 24 — bei 24 px
 * Kantenlänge sind das 1,5 px und 2,25 px. Sie sind nicht gerundet, damit die
 * Regel unten dieselbe Zahl misst, die der Browser malt.
 *
 * `fill` hat KEINEN Strich (0): eine gefüllte Form ist eine Fläche, und eine
 * Fläche lässt sich mit einer Strichstärke nicht vergleichen. Deshalb hat sie
 * unten ein eigenes Urteil statt einer Zahl, die nichts bedeutet.
 */
export const BRAND_ICON_STROKE_PX: Readonly<Record<string, number>> = {
  regular: 1.5,
  fill: 0,
  bold: 2.25,
}

export function brandIconStrokePx(optionId: string): number {
  return BRAND_ICON_STROKE_PX[optionId] ?? 0
}

/** Der Phosphor-Suffix je Satz — die Bühne zeigt ECHTE Icons, kein Bild davon. */
export const BRAND_ICON_SUFFIX: Readonly<Record<string, string>> = {
  regular: '',
  fill: '-fill',
  bold: '-bold',
}

export function brandIconSuffix(optionId: string): string {
  return BRAND_ICON_SUFFIX[optionId] ?? ''
}

/**
 * DIE FÜNF ICONS DER VERGLEICHSREIHE — wörtlich aus dem Prototyp.
 *
 * Fünf, weil ein einzelnes Icon nichts über einen SATZ sagt: erst nebeneinander
 * sieht man, ob die Strichstärke über verschiedene Formen gleich wirkt. Der
 * Suffix kommt aus der Wahl, die Namen bleiben.
 */
export const BRAND_ICON_SAMPLE: readonly string[] = [
  'i-ph-coffee', 'i-ph-leaf', 'i-ph-map-pin', 'i-ph-scales', 'i-ph-clock',
]

/**
 * IST DIESER SCHRIFT-STACK EINE SERIF? — gelesen an seinem RÜCKFALL, nicht an
 * einer zweiten Liste von Schriftnamen.
 *
 * Jeder Stack des Katalogs endet mit der generischen Familie, in die der
 * Browser fällt: `serif` oder `sans-serif`. Das ist dieselbe Quelle, aus der
 * auch die Schrift selbst kommt (`brandFontPairs.ts`) — eine gepflegte Liste
 * „diese sechs Familien sind Serifen" wäre die zweite Stelle, die beim
 * siebten Paar vergessen wird.
 *
 * Der Ausdruck trifft `serif` NUR als eigenes Wort: in `sans-serif` steht ein
 * Bindestrich davor, und der zählt hier nicht als Grenze.
 */
export function brandFontStackIsSerif(stack: string): boolean {
  return /(?:^|[,\s])serif\s*$/i.test(stack.trim())
}

/**
 * DIE SPANNE, IN DER DIE STRICHSTÄRKE ZUR SCHRIFT PASST.
 *
 * ── WARUM ZWEI SPANNEN ────────────────────────────────────────────────────
 * Eine Serif hat feine Haarstriche und Serifen; ein Icon daneben darf nicht
 * kräftiger sein als die dicksten Stellen der Schrift, sonst zieht es den Blick
 * von der Zeile weg. Eine Grotesk hat gleichmässige Striche und verträgt mehr.
 *
 * ── WELCHE FAMILIE ENTSCHEIDET ───────────────────────────────────────────
 * Trägt EINE der beiden Rollen eine Serif, gilt die feinere Spanne: das Icon
 * steht in derselben Fläche wie die Überschrift, und der feinere Partner setzt
 * den Massstab. Sonst entscheidet die Textschrift — sie ist die Fläche, neben
 * der ein Icon in neun von zehn Fällen steht.
 */
export const BRAND_ICON_STROKE_RANGE_SERIF = { min: 1.25, max: 1.5 } as const
export const BRAND_ICON_STROKE_RANGE_SANS = { min: 1.5, max: 2 } as const

export interface BrandIconStrokeRange {
  readonly min: number
  readonly max: number
  /** Die Familie, die die Spanne bestimmt — sie steht im Hinweis. */
  readonly family: string
  readonly serif: boolean
}

export function brandIconStrokeRange(pairId: string): BrandIconStrokeRange {
  const pair = brandFontPair(pairId) ?? BRAND_FONT_PAIRS[0]!
  const headingSerif = brandFontStackIsSerif(pair.headingStack)
  const bodySerif = brandFontStackIsSerif(pair.bodyStack)
  if (headingSerif || bodySerif) {
    return {
      ...BRAND_ICON_STROKE_RANGE_SERIF,
      family: bodySerif ? pair.bodyFamily : pair.headingFamily,
      serif: true,
    }
  }
  return { ...BRAND_ICON_STROKE_RANGE_SANS, family: pair.bodyFamily, serif: false }
}

/**
 * DAS URTEIL: passt die Strichstärke zur Schrift?
 *
 *  · `area`  der gefüllte Satz — er hat keinen Strich, also gibt es nichts zu
 *            vergleichen. Das ist KEIN „passt nicht": eine Fläche ist eine
 *            eigene Entscheidung, und die Auskunft dazu ist eine andere.
 *  · `fits`  die Stärke liegt in der Spanne.
 *  · `heavy` sie liegt darüber — das Icon ist lauter als die Zeile daneben.
 *  · `light` sie liegt darunter — das Icon verschwindet neben der Zeile.
 *
 * BESTÄTIGEN LÄSST SICH JEDER FALL (s. Kopf): das ist eine Auskunft, kein Tor.
 */
export type BrandIconStrokeKind = 'fits' | 'heavy' | 'light' | 'area'

export interface BrandIconStrokeVerdict extends BrandIconStrokeRange {
  readonly kind: BrandIconStrokeKind
  /** Die Stärke des gewählten Satzes in px (0 = Fläche). */
  readonly stroke: number
}

export function brandIconStrokeVerdict(pairId: string, iconId: string): BrandIconStrokeVerdict {
  const range = brandIconStrokeRange(pairId)
  const stroke = brandIconStrokePx(iconId)
  const kind: BrandIconStrokeKind = stroke === 0
    ? 'area'
    : stroke > range.max ? 'heavy' : stroke < range.min ? 'light' : 'fits'
  return { ...range, kind, stroke }
}

/** „1,5 px" / „1.5 px" — im Deutschen mit Komma, wie überall im Layer. */
export function brandIconStrokeText(stroke: number, locale: string): string {
  const text = Number.isInteger(stroke) ? String(stroke) : stroke.toFixed(2).replace(/0+$/, '')
  return `${isGerman(locale) ? text.replace('.', ',') : text} px`
}

/** „1,5–2 px" — die Spanne als ein Stück Text, für Hinweis und Do-Zeile. */
export function brandIconStrokeRangeText(range: BrandIconStrokeRange, locale: string): string {
  const min = brandIconStrokeText(range.min, locale).replace(' px', '')
  return `${min}–${brandIconStrokeText(range.max, locale)}`
}

// ── Der Slot-Wert von `k.photo` ────────────────────────────────────────────
//
// FÜNF BLÖCKE: ein Kopf („Prinzip: Name · Begründung") und die vier Achsen.
// Gelesen wird nach POSITION, wie bei `i.rules` (D4) und `j.brief` (D5) — die
// Beschriftungen stehen in der INHALTSSPRACHE der Marke, und ein Leser, der
// sie erkennen müsste, wäre bei der dritten Sprache falsch.

const PRINCIPLE_BLOCK: BrandImageryText = { de: 'Prinzip', en: 'Principle' }

export function brandImageryPrincipleSlotValue(principleId: string, locale: string): string {
  const principle = brandImageryPrinciple(principleId)
  if (!principle) return ''
  return formatBrandSlotStructured([
    {
      label: textOf(PRINCIPLE_BLOCK, locale),
      body: `${textOf(principle.name, locale)} · ${textOf(principle.reason, locale)}`,
    },
    ...BRAND_IMAGERY_AXES.map(axis => ({
      label: textOf(BRAND_IMAGERY_AXIS_LABELS[axis], locale),
      body: textOf(principle.axes[axis].doText, locale),
    })),
  ])
}

/** Vergleichsform: Leerraum zusammengezogen, kleingeschrieben. */
function comparable(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * DER WEG ZURÜCK — die Id des Prinzips, `null`, sobald die Form nicht stimmt.
 *
 * Verglichen wird der NAME im Kopf-Block, gegen den Katalog in BEIDEN
 * Inhaltssprachen: er ist der Teil, der ein Prinzip eindeutig macht, und er ist
 * kurz genug, dass eine spätere Feinpolitur an einer Begründung den Rückweg
 * nicht abschneidet. Die Achsen-Blöcke werden bewusst nicht geprüft — sie
 * stehen im selben Wert, und ein zweites Kriterium hiesse nur, dass ein
 * korrigierter Satz den ganzen Wert unlesbar macht.
 */
export function parseBrandImageryPrincipleSlotValue(value: string): string | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_IMAGERY_AXES.length + 1) return null
  const head = view.blocks[0]?.body ?? ''
  const name = comparable(head.split('·')[0] ?? '')
  if (!name) return null
  const hit = BRAND_IMAGERY_PRINCIPLES.find(principle =>
    comparable(principle.name.de) === name || comparable(principle.name.en) === name)
  return hit?.id ?? null
}

/**
 * DAS PRINZIP ALS ZEILEN FÜR DAS PRESET (`imagery.principles`, §2.8) — gebaut
 * aus DEMSELBEN Katalog wie der Slot-Wert (dieselbe Zusage wie in D4/D5: was
 * das Kapitel zeigt, steht wörtlich im Preset).
 */
export function brandImageryPrincipleLines(principleId: string, locale: string): string[] {
  const view = brandSlotValueView('structured', brandImageryPrincipleSlotValue(principleId, locale))
  if (view.kind !== 'blocks') return []
  return view.blocks.map(block => `${block.label}: ${block.body}`)
}

// ── Das Do & Don't (`k.dodont`) ────────────────────────────────────────────

export interface BrandImageryDoDont {
  readonly doText: string
  readonly dontText: string
}

/**
 * DIE PAARE ZUR ILLUSTRATIONS-WAHL. „Keine Illustration" ist eine vollwertige
 * Antwort und bekommt deshalb ein Paar wie jede andere — es ist sogar das
 * einzige, das niemand versehentlich brechen kann.
 */
const ILLUSTRATION_RULES: Readonly<Record<string, BrandImageryAxisRule>> = {
  none: {
    doText: {
      de: 'Fotos und Typografie tragen alles — keine Illustration.',
      en: 'Photography and type carry everything — no illustration.',
    },
    dontText: {
      de: 'Eine Zeichnung „nur für diese eine Seite".',
      en: 'A drawing "just for this one page".',
    },
  },
  line: {
    doText: {
      de: 'Feine Konturzeichnungen in EINER Strichstärke.',
      en: 'Fine outline drawings in ONE stroke weight.',
    },
    dontText: {
      de: 'Zeichnungen aus fremden Bibliotheken mit anderem Strich.',
      en: 'Drawings from other libraries with a different stroke.',
    },
  },
  area: {
    doText: {
      de: 'Farbflächen ohne Kontur, aus der Farbwelt.',
      en: 'Colour areas without outlines, from your colour world.',
    },
    dontText: {
      de: 'Verläufe und Schatten, die Tiefe vortäuschen.',
      en: 'Gradients and shadows that fake depth.',
    },
  },
  organic: {
    doText: {
      de: 'Gezeichnete, unregelmässige Formen von EINER Hand.',
      en: 'Drawn, irregular shapes from ONE hand.',
    },
    dontText: {
      de: 'Zwei Zeichenstile nebeneinander.',
      en: 'Two drawing styles side by side.',
    },
  },
}

/** Die Paare zur Icon-Wahl. Die Strichstärke steht als ZAHL in der Do-Zeile. */
const ICON_RULES: Readonly<Record<string, BrandImageryAxisRule>> = {
  regular: {
    doText: {
      de: 'Icons als Linie, {stroke} stark — dieselbe Stärke überall.',
      en: 'Icons as lines, {stroke} thick — the same weight everywhere.',
    },
    dontText: {
      de: 'Icons aus zwei Sätzen auf einer Seite.',
      en: 'Icons from two sets on one page.',
    },
  },
  fill: {
    doText: {
      de: 'Gefüllte Icons ohne Kontur — für kleine Flächen.',
      en: 'Filled icons without an outline — for small surfaces.',
    },
    dontText: {
      de: 'Gefüllte und gezeichnete Icons gemischt.',
      en: 'Filled and outlined icons mixed together.',
    },
  },
  bold: {
    doText: {
      de: 'Kräftige Icons, {stroke} stark — nur, wo sie laut sein sollen.',
      en: 'Bold icons, {stroke} thick — only where they are meant to be loud.',
    },
    dontText: {
      de: 'Kräftige Icons im Fliesstext, wo sie die Zeile überstimmen.',
      en: 'Bold icons inside body copy, where they shout down the line.',
    },
  },
}

/**
 * DIE LISTE — vier Achsen des Prinzips, dann Illustration, dann Icons.
 *
 * SECHS PAARE und nicht mehr: das Anti-Muster der Session heisst wörtlich „a
 * list so long that nobody reads it twice". Sechs Zeilen sind der Umfang, den
 * jemand vor einem Fototermin wirklich noch einmal aufschlägt.
 *
 * Die Reihenfolge ist die der Entscheidungen im Kapitel — wer die Liste liest,
 * liest sie in derselben Ordnung, in der er sie getroffen hat.
 */
export function brandImageryDoDont(
  principleId: string,
  illustrationId: string,
  iconsId: string,
  locale: string,
): BrandImageryDoDont[] {
  const principle = brandImageryPrinciple(principleId) ?? BRAND_IMAGERY_PRINCIPLES[0]!
  const rules: BrandImageryAxisRule[] = BRAND_IMAGERY_AXES.map(axis => principle.axes[axis])
  const illustration = ILLUSTRATION_RULES[illustrationId]
  const icons = ICON_RULES[iconsId]
  if (illustration) rules.push(illustration)
  if (icons) rules.push(icons)

  const strokeText = brandIconStrokeText(brandIconStrokePx(iconsId), locale)
  return rules.map(rule => ({
    doText: textOf(rule.doText, locale).replace('{stroke}', strokeText),
    dontText: textOf(rule.dontText, locale),
  }))
}

/**
 * DIE BESCHRIFTUNGEN DER ZWEI HÄLFTEN — in BEIDEN Inhaltssprachen dieselben.
 *
 * „Do" und „Don't" sind im Deutschen Lehnwörter und stehen so schon in den
 * Beispielen des Katalogs (`sessionContent.ts`, `k.dodont`). Eine deutsche
 * Übersetzung („Tu / Lass") wäre eine Erfindung, die kein Handbuch benutzt.
 */
export const BRAND_DODONT_DO_LABEL = 'Do'
export const BRAND_DODONT_DONT_LABEL = 'Don’t'

/**
 * DER TRENNER zwischen beiden Hälften — ein Gedankenstrich mit Leerzeichen.
 *
 * Er ist bewusst NICHT ' · ': eine Liste aus EINER Zeile wird von
 * `brandListEntries()` an Kommas, Semikola, Schrägstrichen UND Mittelpunkten
 * zerschnitten (Regel 2 dort), und ein einzelnes Paar wäre danach zwei
 * Einträge. Der Gedankenstrich steht in keiner dieser Listen.
 */
const DODONT_SEPARATOR = ' — '

export function brandImageryDoDontSlotValue(pairs: readonly BrandImageryDoDont[]): string {
  return formatBrandSlotList(pairs.map(pair =>
    `${BRAND_DODONT_DO_LABEL}: ${pair.doText}${DODONT_SEPARATOR}${BRAND_DODONT_DONT_LABEL}: ${pair.dontText}`))
}

/**
 * DIE ZEILE EINES PAARES — beide Beschriftungen und der Trenner in EINEM
 * Ausdruck.
 *
 * Er schneidet an der ERSTEN Stelle, an der ein Gedankenstrich vor „Don't:"
 * steht (`+?`), nicht am ersten Gedankenstrich: die Do-Hälfte darf selbst einen
 * tragen („Icons als Linie, 1,5 px stark — dieselbe Stärke überall"), und ein
 * einfaches Zerschneiden am Trenner machte daraus drei Teile und einen
 * verworfenen Wert. Beim Bau am eigenen Test gefunden.
 */
const DODONT_LINE_RE = /^Do\s*:\s*([\s\S]+?)\s+—\s+Don[’']?t\s*:\s*([\s\S]+)$/i

/**
 * DER WEG ZURÜCK — `null`, sobald eine Zeile kein Paar ist.
 *
 * Fail-soft wie überall: eine Liste, in der EINE Zeile ihre zweite Hälfte
 * verloren hat, ist kein Do & Don't mehr — und ein halbes Paar im Preset wäre
 * eine Regel ohne Gegenprobe. Der Apostroph wird in beiden Fassungen
 * akzeptiert (`’` und `'`): eine Tastatur schreibt das eine, ein Editor das
 * andere.
 */
export function parseBrandImageryDoDontSlotValue(value: string): BrandImageryDoDont[] | null {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/^-\s+/, '').trim())
    .filter(line => line.length > 0)
  if (lines.length === 0) return null

  const pairs: BrandImageryDoDont[] = []
  for (const line of lines) {
    const match = line.match(DODONT_LINE_RE)
    if (!match) return null
    const doText = (match[1] ?? '').trim()
    const dontText = (match[2] ?? '').trim()
    if (!doText || !dontText) return null
    pairs.push({ doText, dontText })
  }
  return pairs
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * HÄLT DER KATALOG SEINE ZUSAGEN? Nimmt beliebige Listen, damit der Beweis
 * mutierte Fassungen vorlegen kann — eine Prüfung, die nur die richtigen
 * Listen kennt, ist immer grün (dieselbe Regel wie `validateBrandTypeRules` in
 * D4 und `validateBrandMarkRules` in D5).
 */
export function validateBrandImageryRules(
  principles: readonly BrandImageryPrinciple[] = BRAND_IMAGERY_PRINCIPLES,
  strokes: Readonly<Record<string, number>> = BRAND_ICON_STROKE_PX,
  byDna: Readonly<Record<string, string>> = BRAND_IMAGERY_PRINCIPLE_BY_DNA,
): readonly string[] {
  const problems: string[] = []

  const ids = new Set<string>()
  for (const principle of principles) {
    if (ids.has(principle.id)) problems.push(`doppelte Prinzip-Id: ${principle.id}`)
    ids.add(principle.id)
    if (!principle.name.de.trim() || !principle.name.en.trim()) {
      problems.push(`${principle.id}: Name unvollständig`)
    }
    if (!principle.reason.de.trim() || !principle.reason.en.trim()) {
      problems.push(`${principle.id}: Begründung fehlt`)
    }
    for (const axis of BRAND_IMAGERY_AXES) {
      const rule = principle.axes[axis]
      // Jede Achse braucht BEIDE Hälften — ein „Do" ohne „Don't" ist genau die
      // Regel, an der sich nichts prüfen lässt (Anti-Muster der Session).
      if (!rule?.doText.de.trim() || !rule?.doText.en.trim()) {
        problems.push(`${principle.id}/${axis}: Do fehlt`)
      }
      if (!rule?.dontText.de.trim() || !rule?.dontText.en.trim()) {
        problems.push(`${principle.id}/${axis}: Don't fehlt`)
      }
    }
  }

  for (const [dnaValue, principleId] of Object.entries(byDna)) {
    if (!ids.has(principleId)) {
      problems.push(`Bildwelt "${dnaValue}" zeigt auf ein unbekanntes Prinzip: ${principleId}`)
    }
  }
  if (!ids.has(BRAND_IMAGERY_PRINCIPLE_FALLBACK)) {
    problems.push(`der Rückfall "${BRAND_IMAGERY_PRINCIPLE_FALLBACK}" steht nicht im Katalog`)
  }

  for (const option of BRAND_ILLUSTRATION_OPTIONS) {
    if (!ILLUSTRATION_RULES[option.id]) {
      problems.push(`Illustrations-Option ohne Do & Don't: ${option.id}`)
    }
  }
  for (const option of BRAND_ICON_OPTIONS) {
    if (!ICON_RULES[option.id]) problems.push(`Icon-Option ohne Do & Don't: ${option.id}`)
    if (!(option.id in strokes)) problems.push(`Icon-Option ohne Strichstärke: ${option.id}`)
    if (!(option.id in BRAND_ICON_SUFFIX)) problems.push(`Icon-Option ohne Phosphor-Suffix: ${option.id}`)
  }
  for (const [optionId, stroke] of Object.entries(strokes)) {
    if (stroke < 0 || stroke > 4) problems.push(`Strichstärke ausserhalb 0…4 px: ${optionId} = ${stroke}`)
    if (!brandTermById(BRAND_ICON_OPTIONS, optionId)) {
      problems.push(`Strichstärke für eine Option, die es nicht gibt: ${optionId}`)
    }
  }

  /**
   * ZU JEDEM PAAR DES KATALOGS MUSS EIN SATZ PASSEN. Sonst wäre die
   * Strichstärke-Regel eine Auskunft, die für jede Marke „passt nicht" sagt —
   * und eine Regel, die immer dasselbe sagt, ist keine.
   */
  for (const pair of BRAND_FONT_PAIRS) {
    const range = brandIconStrokeRange(pair.id)
    const fitting = Object.entries(strokes)
      .filter(([, stroke]) => stroke > 0 && stroke >= range.min && stroke <= range.max)
    if (fitting.length === 0) {
      problems.push(`${pair.id}: kein Icon-Satz in der Spanne ${range.min}…${range.max} px`)
    }
  }

  return problems
}
