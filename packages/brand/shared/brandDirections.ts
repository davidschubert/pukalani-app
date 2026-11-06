import type { BrandChoiceOption } from './brandChoiceOptions'
import { type BrandGradient, BRAND_GRADIENTS } from './brandPalette'

/**
 * DER KURATIERTE RICHTUNGS-KATALOG (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.5 und §11 a/b, Paket G4).
 *
 * ── WAS EINE „RICHTUNG" IST — UND WAS SIE NICHT IST ───────────────────────
 * Sie ist die ENTSCHEIDUNG, in welche Welt die visuelle Ausarbeitung laufen
 * soll: Farbwelt, Schriftcharakter, Grundhaltung. Sie ist KEIN Design und kein
 * Theme. Die Ausarbeitung (Logo, Bildsprache, Motion) entsteht in Produkt 02
 * „Brand Design" — Kapitel 10 der Foundation bleibt deshalb `locked`, auch
 * wenn die Richtung steht (Konzept §2.5: die Schranke steht, nur die Richtung
 * ist gewählt).
 *
 * ── WARUM EIN KATALOG UND KEINE THEMES-ENGINE (Davids Entscheidung a) ─────
 * Der Phase-1-Plan sah 2–3 Themes-Presets in Vorschau-iframes vor (globales
 * `:root` ⇒ je Richtung ein iframe). Ein iframe je Karte kostet drei
 * Dokumente, drei Hydrationen und eine Höhen-Messung — für eine Wahl zwischen
 * drei Farbwelten. Gewählt ist deshalb ein kuratierter Katalog, den eine Karte
 * mit LOKALEN CSS-Variablen zeigt. Die Presets bleiben der spätere Ersatz:
 * `presetId`/`presetVersion` reisen im Share-Snapshot mit, damit ein
 * geteiltes Dokument nicht rückwirkend umfärbt, wenn dieser Katalog wächst.
 *
 * ── DIE FARBWELTEN SIND NICHT NEU ERFUNDEN ────────────────────────────────
 * Jeder Dreiklang steht wörtlich in `brandPalette.ts` — den zwölf
 * handgestimmten Welten der Übersicht (hell ~L90 · mittel ~L60 · tief ~L27).
 * Ein zweiter Farbvorrat neben dem ersten wäre die zweite Meinung darüber, wie
 * diese Marke aussieht; der Test nagelt deshalb fest, dass jede Richtung ihre
 * Welt aus `BRAND_GRADIENTS` nimmt.
 *
 * ── DIE SCHRIFTEN SIND STRINGS, KEIN IMPORT AUS `themes` ──────────────────
 * Die FAMILIEN-NAMEN sind aus `packages/themes/app/utils/themeRegistry.ts`
 * (`FONT_FAMILY_REGISTRY`) ABGESCHRIEBEN, nicht importiert: der brand-Layer
 * hängt nicht am themes-Layer (Layer-Grenzen A14 — kein impliziter
 * Cross-Layer-Import, kein String-Coupling über eine fremde Registry). Der
 * `stack` ist ein vollständiger CSS-Fallback-Stack, weil die Vorschau die
 * Web-Schrift BEWUSST NICHT NACHLÄDT (s. `BwDirectionCard.vue`): gezeigt wird
 * eine RICHTUNG, kein Rendering-Beweis — und 12 Schriftschnitte für eine
 * Auswahl zu laden, wäre der teuerste Weg zu derselben Entscheidung.
 *
 * ── DIE ARCHETYPEN-ZUORDNUNG UND IHRE ARITHMETIK ──────────────────────────
 * Jede Richtung nennt die Archetypen, zu denen sie passt; daraus rechnet
 * `suggestBrandDirections` die drei Vorschläge. Damit JEDER der zwölf
 * Archetypen in mindestens drei Richtungen vorkommt (sonst bekäme eine Marke
 * Vorschläge, die nur noch Katalog-Reihenfolge sind), braucht es mindestens
 * 12 × 3 = 36 Nennungen auf sechs Richtungen — also im Schnitt sechs je
 * Richtung. Die Skizze im Paket sprach von „3–5 je Richtung"; das ist bei
 * sechs Richtungen arithmetisch unmöglich (6 × 5 = 30 < 36). Gewählt sind
 * deshalb fünf bis sieben je Richtung, exakt drei je Archetyp — beides per
 * Test genagelt.
 *
 * DIESE DATEI IST PUR: kein i18n, kein H3, kein Appwrite. Namen und
 * Begründungen reisen als SCHLÜSSEL, weil ein Handbuch in der Sprache seines
 * Lesers steht (dieselbe Regel wie im Kopf von `brandFoundation.ts`).
 */

/**
 * DIE FASSUNG DES KATALOGS. Sie reist als `presetVersion` in jeden
 * Share-Snapshot: kommt eine Richtung dazu oder ändert eine ihre Farbwelt,
 * steigt diese Zahl, und ein ALTER Link rendert danach so, als wäre keine
 * Richtung gewählt — statt still eine andere Welt zu zeigen als die, die
 * jemand verschickt hat.
 */
export const BRAND_DIRECTIONS_VERSION = 1

export interface BrandDirectionFont {
  /** Der Familienname, wie ihn ein Mensch liest — er steht auf der Karte. */
  readonly family: string
  /**
   * Der vollständige CSS-Stack. Die Web-Schrift wird nicht geladen; was der
   * Browser davon hat, ist der Charakter (Serif gegen Grotesk), und den trägt
   * auch der Rückfall.
   */
  readonly stack: string
}

export interface BrandDirection {
  /** Stabile Id — sie steht in `result.direction` und im Snapshot (`presetId`). */
  readonly id: string
  readonly nameKey: string
  /** Ein Satz, WAS diese Welt tut — nicht, warum sie zu DIESER Marke passt. */
  readonly reasonKey: string
  /** Archetyp-Ids aus `BRAND_ARCHETYPES`, zu denen diese Richtung passt. */
  readonly archetypes: readonly string[]
  /** hell → mittel → tief, wie in `brandPalette.ts`. */
  readonly gradient: BrandGradient
  /**
   * Die drei Rollen in der Reihenfolge TIEF · MITTEL · HELL — also umgekehrt
   * zum Verlauf. Sie stehen so, wie die Foundation sie zeigt (Grund zuerst),
   * und sie stehen AM Eintrag statt als globale Konstante: eine spätere
   * Richtung darf die Tiefe als Signal statt als Grund einsetzen.
   */
  readonly roles: readonly [string, string, string]
  readonly fonts: { readonly heading: BrandDirectionFont, readonly body: BrandDirectionFont }
}

// ── Die Bausteine, aus denen die sechs Einträge bestehen ────────────────────

const KEY = 'brand.foundation.direction'

/** Heute für alle sechs gleich belegt — s. `roles` oben, warum sie trotzdem je Eintrag steht. */
const ROLES = [`${KEY}.role.ground`, `${KEY}.role.warmth`, `${KEY}.role.light`] as const

const FONTS = {
  inter: { family: 'Inter', stack: 'Inter, \'Helvetica Neue\', Arial, sans-serif' },
  sourceSans: {
    family: 'Source Sans',
    stack: '\'Source Sans 3\', \'Source Sans Pro\', \'Helvetica Neue\', Arial, sans-serif',
  },
  sourceSerif: {
    family: 'Source Serif',
    stack: '\'Source Serif 4\', \'Source Serif Pro\', Georgia, \'Times New Roman\', serif',
  },
  nunitoSans: {
    family: 'Nunito Sans',
    stack: '\'Nunito Sans\', \'Trebuchet MS\', \'Helvetica Neue\', Arial, sans-serif',
  },
  sora: { family: 'Sora', stack: 'Sora, \'Avenir Next\', \'Helvetica Neue\', Arial, sans-serif' },
  ptSans: { family: 'PT Sans', stack: '\'PT Sans\', \'Trebuchet MS\', \'Helvetica Neue\', Arial, sans-serif' },
  ptSerif: { family: 'PT Serif', stack: '\'PT Serif\', Georgia, \'Times New Roman\', serif' },
} as const satisfies Record<string, BrandDirectionFont>

/**
 * DIE SECHS RICHTUNGEN.
 *
 * Die Reihenfolge ist die Rückfall-Reihenfolge von `suggestBrandDirections`:
 * wer keinen bestätigten Archetyp hat, bekommt die ersten drei. Sie steht
 * deshalb nicht zufällig — vorne die zwei Welten, die den grössten Teil der
 * Marken tragen, hinten die zwei, die eine Haltung voraussetzen.
 */
export const BRAND_DIRECTIONS: readonly BrandDirection[] = [
  {
    id: 'warm-editorial',
    nameKey: `${KEY}.warmEditorial.name`,
    reasonKey: `${KEY}.warmEditorial.reason`,
    archetypes: ['sage', 'creator', 'caregiver', 'innocent', 'citizen', 'jester', 'lover'],
    gradient: ['#e8d3b8', '#b98a5e', '#4a3123'], // warmes Brot-Braun
    roles: ROLES,
    fonts: { heading: FONTS.sourceSerif, body: FONTS.sourceSans },
  },
  {
    id: 'clear-technical',
    nameKey: `${KEY}.clearTechnical.name`,
    reasonKey: `${KEY}.clearTechnical.reason`,
    archetypes: ['sage', 'explorer', 'ruler', 'hero', 'magician', 'rebel'],
    gradient: ['#e2e4ea', '#8a93ad', '#2b3148'], // Blaugrau
    roles: ROLES,
    fonts: { heading: FONTS.inter, body: FONTS.inter },
  },
  {
    id: 'calm-natural',
    nameKey: `${KEY}.calmNatural.name`,
    reasonKey: `${KEY}.calmNatural.reason`,
    archetypes: ['explorer', 'caregiver', 'innocent', 'citizen', 'lover'],
    gradient: ['#dfe8e4', '#6f9184', '#22392f'], // Tannengrün
    roles: ROLES,
    fonts: { heading: FONTS.nunitoSans, body: FONTS.sourceSans },
  },
  {
    id: 'bold-contrast',
    nameKey: `${KEY}.boldContrast.name`,
    reasonKey: `${KEY}.boldContrast.reason`,
    archetypes: ['explorer', 'creator', 'ruler', 'jester', 'hero', 'magician', 'rebel'],
    gradient: ['#eed9cf', '#c68a6f', '#552e1e'], // Terrakotta
    roles: ROLES,
    fonts: { heading: FONTS.sora, body: FONTS.inter },
  },
  {
    id: 'light-playful',
    nameKey: `${KEY}.lightPlayful.name`,
    reasonKey: `${KEY}.lightPlayful.reason`,
    archetypes: ['creator', 'caregiver', 'innocent', 'citizen', 'jester', 'rebel'],
    gradient: ['#d8e6e7', '#5e9299', '#1d3a3e'], // Petrol
    roles: ROLES,
    fonts: { heading: FONTS.sora, body: FONTS.nunitoSans },
  },
  {
    id: 'classic-serious',
    nameKey: `${KEY}.classicSerious.name`,
    reasonKey: `${KEY}.classicSerious.reason`,
    archetypes: ['sage', 'ruler', 'lover', 'hero', 'magician'],
    gradient: ['#e3e4e6', '#82878f', '#2a2d33'], // Schiefer
    roles: ROLES,
    fonts: { heading: FONTS.ptSerif, body: FONTS.ptSans },
  },
]

const BY_ID = new Map(BRAND_DIRECTIONS.map(direction => [direction.id, direction]))

/** `null` = unbekannte Id (Alt-Snapshot, von Hand korrigierter Slot). */
export function brandDirectionById(id: string): BrandDirection | null {
  return BY_ID.get(id) ?? null
}

/**
 * DIE ZWEI SLOTS, AUS DENEN DIE VORSCHLÄGE GERECHNET WERDEN.
 *
 * Sie stehen NICHT in den `dependencies` von `result.direction`, und das ist
 * eine Entscheidung: `dependencies` sind der VERALTUNGS-Vertrag (ändert sich
 * eine Quelle, gilt der abgeleitete Wert als veraltet). Die drei Richtungen
 * sind aber ein VORSCHLAG, keine Ableitung — eine getroffene Wahl bleibt
 * richtig, auch wenn der Neben-Archetyp später wechselt. Ein Eintrag dort
 * würde ausserdem die transitive Hülle von `d.secondary` verschieben
 * (`sessionsAffectedBy`), also eine Zahl, die an anderer Stelle etwas
 * anderes behauptet.
 */
export const BRAND_DIRECTION_SOURCE_SLOTS = ['d.primary', 'd.secondary'] as const

/**
 * WARUM DIESE RICHTUNG VORGESCHLAGEN WIRD — vier Fälle, absteigend nach
 * Belegkraft. Der Schlüssel reist mit dem Vorschlag; der Text steht im
 * Katalog.
 */
export type BrandDirectionMatch = 'both' | 'primary' | 'secondary' | 'fallback'

export interface BrandDirectionSuggestion {
  readonly id: string
  readonly reasonKey: string
}

/** Ein Feld, zwei Bedeutungen wären ein Fehler — deshalb der eigene Präfix. */
function matchKey(match: BrandDirectionMatch): string {
  return `${KEY}.reason.${match}`
}

/**
 * DREI RICHTUNGEN, PASSEND ZU HAUPT- UND NEBEN-ARCHETYP (Davids Entscheidung
 * b) — pur, deterministisch, immer genau drei.
 *
 * Die Rangfolge ist die Belegkraft: erst was zu BEIDEN Archetypen passt, dann
 * zum Haupt-, dann zum Neben-Archetyp, dann der Rest in Katalog-Reihenfolge.
 * Der Rest ist keine Notlösung, sondern die Zusage, dass hier IMMER drei
 * Karten stehen: eine Auswahl mit zwei Karten sähe aus wie ein Fehler, und
 * ein leerer Bildschirm für eine Marke ohne bestätigten Archetyp wäre einer.
 *
 * `secondary` darf `null` sein (Solo-Weg, übersprungener Neben-Archetyp);
 * unbekannte Archetyp-Ids fallen still durch — sie treffen keine Richtung, und
 * der Rückfall füllt auf. Ein Wurf wäre hier falsch: der Wert kommt aus einem
 * Feld, das ein Mensch von Hand korrigiert haben kann.
 */
export function suggestBrandDirections(
  primary: string,
  secondary: string | null,
): BrandDirectionSuggestion[] {
  const fits = (direction: BrandDirection, archetype: string): boolean =>
    archetype.length > 0 && direction.archetypes.includes(archetype)
  const second = secondary ?? ''

  const picked: BrandDirectionSuggestion[] = []
  const taken = new Set<string>()

  const take = (match: BrandDirectionMatch, accept: (direction: BrandDirection) => boolean): void => {
    for (const direction of BRAND_DIRECTIONS) {
      if (picked.length >= 3) return
      if (taken.has(direction.id) || !accept(direction)) continue
      taken.add(direction.id)
      picked.push({ id: direction.id, reasonKey: matchKey(match) })
    }
  }

  take('both', direction => fits(direction, primary) && fits(direction, second))
  take('primary', direction => fits(direction, primary))
  take('secondary', direction => fits(direction, second))
  take('fallback', () => true)

  return picked
}

/**
 * DIE RICHTUNGEN ALS AUSWAHL-VERTRAG (`result.direction`).
 *
 * `label`/`hint` sind ENGLISCH und stehen wörtlich in Georges Prompt-Regel —
 * dieselbe Konvention wie bei den Archetypen und den Architektur-Modellen. Der
 * `copyKey` zeigt auf die FOUNDATION-Schlüssel (`.name`/`.reason`) und nicht
 * auf eine eigene Karten-Copy: die Richtung hat ihre EIGENE Karte
 * (`BwDirectionCard`), die eine Farbwelt und ein Schriftpaar zeigt statt
 * dreier Textzeilen. Zwei Schlüsselfamilien für denselben Namen wären zwei
 * Namen, sobald jemand einen davon ändert.
 */
export const BRAND_DIRECTION_OPTIONS: readonly BrandChoiceOption[] = [
  {
    id: 'warm-editorial',
    label: 'Warm & Editorial',
    hint: 'paper white, quiet lines, earth tones — colour warms instead of signalling',
    display: { de: 'Warm & Editorial', en: 'Warm & Editorial' },
    copyKey: `${KEY}.warmEditorial`,
  },
  {
    id: 'clear-technical',
    label: 'Clear & Technical',
    hint: 'cool grey-blue, one grotesque, everything on a grid',
    display: { de: 'Klar & Technisch', en: 'Clear & Technical' },
    copyKey: `${KEY}.clearTechnical`,
  },
  {
    id: 'calm-natural',
    label: 'Calm & Natural',
    hint: 'green earth tones, soft edges, nothing shouts',
    display: { de: 'Ruhig & Natürlich', en: 'Calm & Natural' },
    copyKey: `${KEY}.calmNatural`,
  },
  {
    id: 'bold-contrast',
    label: 'Bold & High-Contrast',
    hint: 'deep ground, warm signal, large type — it takes a stand',
    display: { de: 'Kraftvoll & Kontrastreich', en: 'Bold & High-Contrast' },
    copyKey: `${KEY}.boldContrast`,
  },
  {
    id: 'light-playful',
    label: 'Light & Playful',
    hint: 'bright surfaces, fresh petrol, round shapes',
    display: { de: 'Leicht & Verspielt', en: 'Light & Playful' },
    copyKey: `${KEY}.lightPlayful`,
  },
  {
    id: 'classic-serious',
    label: 'Classic & Serious',
    hint: 'slate, a classic serif, wide margins — it lasts',
    display: { de: 'Klassisch & Ernst', en: 'Classic & Serious' },
    copyKey: `${KEY}.classicSerious`,
  },
]

/** Der Beweis, dass die Farbwelten aus der kuratierten Tabelle stammen (s. Kopf). */
export function brandGradientIsCurated(gradient: BrandGradient): boolean {
  return BRAND_GRADIENTS.some(entry => entry.every((hex, index) => hex === gradient[index]))
}
