import {
  BRAND_CONTRAST_PAIR_SPECS,
  brandColorContrastPairs,
  brandContrast,
  brandDesignDefaultsFromDna,
  brandHexToRgb,
  brandNeutralRamp,
  brandNeutralSource,
  brandRampLight,
  isBrandHex,
} from './brandDesign'
import {
  BRAND_COLOR_ROLES,
  BRAND_CONTRAST_LEVEL_TERMS,
  BRAND_CONTRAST_PAIR_TERMS,
  BRAND_NEUTRAL_OPTIONS,
  type BrandColorRoleTerm,
  brandTermById,
  brandTermLabel,
} from './brandDesignVocab'
import { brandDirectionById } from './brandDirections'
import { BRAND_PALETTES, brandPaletteId } from './brandPalette'
import { brandSlotValueView, formatBrandSlotStructured } from './brandSlotFormat'
import { BRAND_RAMP_SHADES, type BrandColorRole, type BrandContrastPair, type BrandRamp } from './types/brand'

/**
 * DIE FARBWELT — die REGELN von Kapitel 2, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.3, Paket D3).
 *
 * ── SECHS SESSIONS, EINE DATEI, WEIL SIE EINE KETTE SIND ──────────────────
 * `h.base` ist die EINZIGE Entscheidung mit einer Farbe darin; `h.ramp`,
 * `h.roles` und `h.contrast` sind Rechnungen daraus, `h.neutral` und
 * `h.accent` sind zwei kleine Wahlen dazwischen. Getrennt lägen Schreiber und
 * Leser desselben Formats in vier Dateien — dieselbe Begründung wie bei
 * `brandDesignDna.ts` (D2c).
 *
 * ── DIE MATHEMATIK STEHT HIER NICHT ───────────────────────────────────────
 * Rampe, getönte Neutral-Rampe und jedes WCAG-Urteil kommen aus
 * `brandDesign.ts` — der EINEN Stelle des Layers mit der A14-Zeilen-Ausnahme
 * nach `packages/themes/shared/ramp.ts` (§2.3). Ein zweiter Griff dorthin wäre
 * ein ESLint-Fehler UND eine zweite Wahrheit über dieselbe Zahl. Auch die
 * SECHS KONTRAST-PAARE kommen von dort (`BRAND_CONTRAST_PAIR_SPECS`): was das
 * Kapitel auf dem Bildschirm misst, ist wörtlich das, was später im Preset
 * steht.
 *
 * ── DIE KANDIDATEN SIND KEIN MODELL-LAUF ──────────────────────────────────
 * §2.3 spricht von „drei Basisfarben-Kandidaten aus DNA + Archetyp mit
 * Begründung". Sie entstehen hier als DETERMINISTISCHE Rechnung aus zwei
 * Dingen, die schon entschieden sind: der gewählten RICHTUNG (`result.
 * direction`, Paket G4 — sie trägt einen kuratierten Dreiklang) und der
 * Farbwelt der Marken-Kachel (`brandPalette.ts`). Kein KI-Aufruf, keine
 * Drossel, keine Kosten — und zweimal Aufschlagen zeigt dieselben drei
 * Farben. Die BEGRÜNDUNGEN reisen als i18n-SCHLÜSSEL, weil ein Handbuch in
 * der Sprache seines Lesers steht (dieselbe Regel wie in `brandDirections.ts`).
 *
 * ── WAS BLOCKIERT WIRD, UND WARUM NICHT MEHR ──────────────────────────────
 * Ein Kandidat, der als TEXTFARBE auf dem eigenen Papierton AA reisst, ist
 * nicht wählbar (§2.3: „ein Vorschlag, der AA reisst, wird nicht angeboten").
 * Er steht trotzdem in der Liste, ausgegraut, mit seiner Zahl daneben — der
 * Prototyp führt „Crema" ausdrücklich mit: eine Liste ohne den Durchfaller
 * versteckt ihn.
 *
 * DIESE DATEI IST PUR: kein Vue, kein i18n, kein H3, kein Appwrite.
 */

// ── Kandidaten (`h.base`, `h.accent`) ──────────────────────────────────────

/** Ein Farb-Vorschlag: stabile Id, Hex, Begründung als i18n-Schlüssel. */
export interface BrandColorCandidate {
  readonly id: string
  readonly hex: string
  /** Der Schlüssel der Begründung — der Katalog kennt keine Prosa. */
  readonly reasonKey: string
}

const REASON = 'brand.color.reason'

/**
 * DIE DREI TÖNE, AUS DENEN GEWÄHLT WIRD.
 *
 * Der Dreiklang der gewählten Richtung (hell · mittel · tief) plus die TIEFE
 * der eigenen Kachel-Farbwelt. Vier Töne, drei Kandidaten je Session — mehr
 * wäre eine Palette, und die soll hier gerade nicht entstehen.
 *
 * Ohne bestätigte Richtung (unbekannte Id, von Hand korrigierter Slot) gilt
 * die Farbwelt der Kachel für beides: die Kandidaten sollen stehen, auch wenn
 * die Richtung nicht mehr auflösbar ist (dieselbe Regel wie `brandDnaBoards`).
 */
function tonesFor(directionId: string, paletteSeed: string): {
  gradient: readonly [string, string, string]
  ownDeep: string
} {
  const own = BRAND_PALETTES.find(palette => palette.id === brandPaletteId(paletteSeed))
    ?? BRAND_PALETTES[0]!
  const gradient = brandDirectionById(directionId)?.gradient ?? own.gradient
  /* Fällt die eigene Tiefe mit der der Richtung zusammen, rückt der Vorrat
   * eine Welt weiter — sonst stünden zwei Kandidaten mit demselben Hex und
   * verschiedenen Begründungen nebeneinander. */
  const index = BRAND_PALETTES.findIndex(palette => palette.id === own.id)
  const next = BRAND_PALETTES[(index + 1) % BRAND_PALETTES.length]!
  const ownDeep = own.gradient[2] === gradient[2] ? next.gradient[2] : own.gradient[2]
  return { gradient: [gradient[0], gradient[1], gradient[2]], ownDeep }
}

/**
 * DIE DREI BASISFARBEN-KANDIDATEN (`h.base`) — in dieser Reihenfolge, weil
 * die Reihenfolge eine Empfehlung ist: die Tiefe der Richtung trägt Text, die
 * fremde Tiefe ist die eigenständige Alternative, der Mittelton ist der
 * freundliche Fall, der als Textfarbe meistens durchfällt.
 */
export function brandBaseCandidates(
  directionId: string,
  paletteSeed: string,
): readonly BrandColorCandidate[] {
  const { gradient, ownDeep } = tonesFor(directionId, paletteSeed)
  return [
    { id: 'direction-deep', hex: gradient[2], reasonKey: `${REASON}.base.directionDeep` },
    { id: 'palette-deep', hex: ownDeep, reasonKey: `${REASON}.base.paletteDeep` },
    { id: 'direction-mid', hex: gradient[1], reasonKey: `${REASON}.base.directionMid` },
  ]
}

/**
 * TRÄGT DIESE FARBE TEXT? — geprüft gegen den Papierton, den sie SELBST
 * erzeugt.
 *
 * Das ist keine Spitzfindigkeit: der Papierton ist die hellste Stufe der
 * Neutral-Rampe, und die ist aus der Basisfarbe getönt. Wer alle Kandidaten
 * gegen EINEN festen Papierton misst, misst für zwei von dreien eine Fläche,
 * die es in ihrer Farbwelt nie geben wird.
 *
 * `AA18` gilt als durchgefallen: die Stufe erlaubt nur grosse Schrift, und
 * eine Basisfarbe, die keinen Fliesstext tragen kann, ist keine Basisfarbe.
 */
export function brandBaseCandidateBlocked(hex: string, neutralOption?: string): boolean {
  const paper = brandColorPaper(hex, neutralOption)
  if (!paper) return true
  const verdict = brandContrast(hex, paper)
  return verdict === null || verdict.level === 'fail' || verdict.level === 'AA18'
}

/** Der Papierton einer Farbwelt: die hellste Stufe der Neutral-Rampe. */
export function brandColorPaper(base: string, neutralOption?: string): string | null {
  const neutral = brandNeutralRamp(brandNeutralSource(neutralOption, base))
  return neutral ? neutral[50] : null
}

/**
 * WIE WEIT MUSS EIN AKZENT VON DER BASIS WEG SEIN?
 *
 * Ein Akzent ist ein SIGNAL (`sessionContent.ts`: „the signal, not a second
 * ground"). Steht er zu nah an der Basisfarbe, liest ihn niemand als Signal —
 * er sieht aus wie eine zweite Stufe derselben Rampe.
 *
 * ── WARUM NICHT DAS KONTRAST-VERHÄLTNIS ──────────────────────────────────
 * Der naheliegende Griff wäre `brandContrast(accent, base)`. Er ist FALSCH,
 * und zwar messbar: Kontrast misst HELLIGKEIT. Zwei tiefe Töne verschiedener
 * Farbe (ein Braun und ein Schiefer) haben fast keinen Kontrast zueinander und
 * sind trotzdem klar zu unterscheiden — genau der Fall eines Akzents, der auf
 * dunklem Grund als Signal steht. Beim Bau von D3 verwarf die Kontrast-Regel
 * damit den EINZIGEN Kandidaten, der die Matrix bestehen liess.
 *
 * Gemessen wird deshalb der ABSTAND der Farbkanäle, auf 0…1 normiert (die
 * längste Diagonale des Würfels ist √3·255). 0,06 lässt einen zweiten Farbton
 * durch und weist eine zweite Stufe derselben Farbe ab; die Zahl ist eine
 * Setzung und gehört zu Davids Inhalts-Gate wie die Texte.
 */
export const BRAND_ACCENT_MIN_DISTANCE = 0.06

const RGB_DIAGONAL = Math.sqrt(3) * 255

/** Der normierte Abstand zweier Farben (0 = dieselbe, 1 = Schwarz zu Weiss). */
export function brandColorDistance(a: string, b: string): number | null {
  const left = brandHexToRgb(a)
  const right = brandHexToRgb(b)
  if (!left || !right) return null
  const sum = left.reduce((total, channel, index) => total + (channel - right[index]!) ** 2, 0)
  return Math.sqrt(sum) / RGB_DIAGONAL
}

export function brandAccentTooClose(accent: string, base: string): boolean {
  const distance = brandColorDistance(accent, base)
  return distance === null || distance < BRAND_ACCENT_MIN_DISTANCE
}

/** Ein Akzent-Vorschlag plus das Urteil der Abstands-Regel. */
export interface BrandAccentCandidate extends BrandColorCandidate {
  /** Zu nah an der Basis — nicht wählbar, aber sichtbar (s. Kopf). */
  readonly tooClose: boolean
}

/**
 * DIE DREI AKZENT-KANDIDATEN.
 *
 * Einer aus der eigenen Richtung (harmonisch — und meistens zu hell, um den
 * Knopf-Text zu tragen: der sichtbare Beinahe-Treffer) und zwei TIEFE Töne
 * aus anderen kuratierten Welten, weit genug weg, um als Signal zu lesen.
 *
 * Warum tief: `button-light` misst die Schrift AUF dem Akzent (§2.8, Preset).
 * Seit D9 rechnet die Matrix dieselbe adaptive Schriftfarbe wie die Szene
 * (`brandAccentInk`) — durch fällt deshalb nicht mehr jeder helle Ton, sondern
 * der MITTELTON, der weder helle noch dunkle Schrift trägt. Tiefe Signale sind
 * trotzdem die bessere Wahl: sie lesen als Signal, nicht als zweite Fläche.
 */
export function brandAccentCandidates(
  directionId: string,
  paletteSeed: string,
  base: string,
): readonly BrandAccentCandidate[] {
  const { gradient } = tonesFor(directionId, paletteSeed)
  const start = Math.max(0, BRAND_PALETTES.findIndex(palette => palette.id === brandPaletteId(paletteSeed)))

  /* Der Vorrat läuft EINMAL im Kreis durch den Katalog, beginnend hinter der
   * eigenen Welt: deterministisch, und jede Marke bekommt andere Signale. */
  const signals: string[] = []
  for (let step = 1; step <= BRAND_PALETTES.length && signals.length < 2; step++) {
    const deep = BRAND_PALETTES[(start + step) % BRAND_PALETTES.length]!.gradient[2]
    if (brandAccentTooClose(deep, base) || signals.includes(deep) || deep === gradient[2]) continue
    signals.push(deep)
  }

  return [
    { id: 'direction-mid', hex: gradient[1], reasonKey: `${REASON}.accent.directionMid` },
    { id: 'signal-deep', hex: signals[0] ?? gradient[0], reasonKey: `${REASON}.accent.signalDeep` },
    { id: 'signal-alt', hex: signals[1] ?? gradient[0], reasonKey: `${REASON}.accent.signalAlt` },
  ].map(candidate => ({ ...candidate, tooClose: brandAccentTooClose(candidate.hex, base) }))
}

/**
 * DIE VORBELEGUNG DES KAPITELS (H5: „jede Session muss als BESTÄTIGUNG
 * durchlaufbar sein").
 *
 * Basisfarbe = der erste Kandidat, der Text trägt; Grundton = was die DNA
 * vorschlägt (`brandDesignDefaultsFromDna`), sonst getönt; Akzent = der erste
 * Kandidat, der weit genug von der Basis weg ist UND die Kontrast-Prüfung
 * bestehen lässt. Fällt jeder Kandidat durch, gilt trotzdem der erste — ein
 * leeres Feld wäre die schlechtere Antwort, und die Kontrast-Prüfung sagt es
 * dann laut.
 *
 * ── WARUM DER AKZENT DIE MATRIX MITRECHNET ────────────────────────────────
 * Der harmonischste Akzent ist oft der MITTELTON der Richtung — und der trägt
 * weder hellen noch dunklen Knopf-Text (`button-light`, seit D9 adaptiv
 * gemessen). Ein Vorschlag, mit dem das Kapitel von Anfang an rot ist, wäre
 * kein Vorschlag: H5 verspricht einen Durchgang, in dem man nur widerspricht,
 * wo man will. Der Mensch DARF ihn trotzdem wählen — dann sagt die Tabelle,
 * was es kostet.
 */
export interface BrandColorDefaults {
  base: string
  neutral: string
  accent: string
}

export function brandColorDefaults(
  dna: Readonly<Record<string, string>> | undefined,
  directionId: string,
  paletteSeed: string,
): BrandColorDefaults {
  const neutral = brandDesignDefaultsFromDna(dna).neutral ?? 'tinted'
  const bases = brandBaseCandidates(directionId, paletteSeed)
  const base = (bases.find(candidate => !brandBaseCandidateBlocked(candidate.hex, neutral)) ?? bases[0]!).hex
  const accents = brandAccentCandidates(directionId, paletteSeed, base)
  const usable = accents.filter(candidate => !candidate.tooClose)
  const clean = usable.find(candidate =>
    brandContrastReview(brandColorContrastPairs(base, candidate.hex, neutral) ?? []).ok)
  const accent = (clean ?? usable[0] ?? accents[0]!).hex
  return { base, neutral, accent }
}

// ── Die Rollen (`h.roles`) ─────────────────────────────────────────────────

/**
 * DER HEX ZU EINER ROLLEN-QUELLE. Die Kennungen sind `ramp.<stufe>`,
 * `neutral.<stufe>` und `accent` (s. `BRAND_COLOR_ROLES`); alles andere ergibt
 * `null` und die Rolle fällt heraus, statt mit '' im Preset zu stehen.
 */
export function brandColorRoleHex(
  source: string,
  colors: { rampLight: BrandRamp, neutral: BrandRamp, accent: string },
): string | null {
  if (source === 'accent') return colors.accent
  const [family, raw] = source.split('.')
  const shade = Number(raw)
  if (!(BRAND_RAMP_SHADES as readonly number[]).includes(shade)) return null
  const key = shade as keyof BrandRamp
  if (family === 'ramp') return colors.rampLight[key]
  if (family === 'neutral') return colors.neutral[key]
  return null
}

/**
 * DIE FÜNF ROLLEN ZU EINER FARBWELT — `null`, sobald eine der Farben kein
 * gültiger Hex ist (beim Tippen der Normalfall).
 *
 * Die HELLE Rampe trägt die Marken-Rollen: die Rollen beschreiben die Welt, in
 * der geschrieben wird, und die dunkle ist ihre Spiegelung (die Szene rechnet
 * sie selbst). Zwei Rollensätze nebeneinander wären zehn Zeilen für fünf
 * Entscheidungen.
 */
export function brandColorRoles(
  base: string,
  accent: string,
  neutralOption?: string,
): BrandColorRole[] | null {
  if (!isBrandHex(base) || !isBrandHex(accent)) return null
  const rampLight = brandRampLight(base)
  const neutral = brandNeutralRamp(brandNeutralSource(neutralOption, base))
  if (!rampLight || !neutral) return null

  const roles: BrandColorRole[] = []
  for (const role of BRAND_COLOR_ROLES) {
    const hex = brandColorRoleHex(role.source, { rampLight, neutral, accent })
    if (hex) roles.push({ id: role.id, source: role.source, hex })
  }
  return roles
}

/** Die Lesefassung eines Rollen-Namens. */
export function brandColorRoleLabel(roleId: string, locale: string): string {
  const role = BRAND_COLOR_ROLES.find(entry => entry.id === roleId)
  return role ? brandTermLabel(role, locale) : roleId
}

/** Die Notiz einer Rolle — wofür sie da ist, in einem Satz. */
export function brandColorRoleNote(roleId: string, locale: string): string {
  const role = BRAND_COLOR_ROLES.find(entry => entry.id === roleId)
  if (!role) return ''
  return locale.toLowerCase().startsWith('de') ? role.noteDe : role.noteEn
}

/**
 * WOHER DIE ROLLE KOMMT, ALS LESETEXT — „Rampe 900", „Neutral 50", „Akzent".
 *
 * Der Slot-Wert trägt sie nur als ANZEIGE (zurückgelesen wird die Kennung aus
 * dem Katalog, s. `parseBrandColorRolesSlotValue`): eine Herkunft ohne Namen
 * wäre im Handbuch eine Zeile, die niemand nachvollziehen kann.
 */
export function brandColorRoleSourceLabel(source: string, locale: string): string {
  const de = locale.toLowerCase().startsWith('de')
  if (source === 'accent') return de ? 'Akzent' : 'Accent'
  const [family, shade] = source.split('.')
  if (family === 'ramp') return `${de ? 'Rampe' : 'Ramp'} ${shade}`
  if (family === 'neutral') return `${de ? 'Grundton' : 'Neutral'} ${shade}`
  return source
}

/** Der Katalog-Eintrag einer Rolle — für Bühne und Beweis. */
export function brandColorRole(roleId: string): BrandColorRoleTerm | undefined {
  return BRAND_COLOR_ROLES.find(entry => entry.id === roleId)
}

// ── Die Kontrast-Prüfung (`h.contrast`) ────────────────────────────────────

/**
 * WELCHE PAARE MINDESTENS AA ERREICHEN MÜSSEN, DAMIT DAS KAPITEL WEITERGEHT.
 *
 * Fünf der sechs: alles, was TEXT ist und auf jeder Seite vorkommt — Fliesstext
 * und Überschrift auf Papier, Nebentext auf einer Fläche, der Knopf-Text auf
 * dem Akzent und der Fliesstext der dunklen Welt. `accent-dark` ist bewusst
 * NICHT dabei: dort steht eine Rampen-Stufe als FARBE auf dem Grund (ein
 * Balken, ein Rahmen, ein Icon), nicht ein Absatz — eine harte Grenze dort
 * verböte jede ruhige dunkle Welt.
 *
 * §2.3 sagt: „ein Vorschlag, der AA reisst, wird nicht angeboten". Umgesetzt
 * ist das als FEHLENDER WERT, nicht als ausgegrauter Knopf: die Bühne schreibt
 * `h.contrast` gar nicht erst, und ein leerer Slot ist nach
 * `brandSlotControls` nicht bestätigbar (`slot_empty`). So gibt es genau eine
 * Regel statt einer zweiten im Bedienelement.
 */
export const BRAND_CONTRAST_REQUIRED_PAIRS: readonly string[] = [
  'body-light',
  'heading-light',
  'button-light',
  'muted-light',
  'body-dark',
]

export interface BrandContrastReview {
  /** Erreichen ALLE Pflicht-Paare mindestens AA? */
  readonly ok: boolean
  /** Die Ids der Pflicht-Paare, die es nicht tun — in Katalog-Reihenfolge. */
  readonly failing: readonly string[]
}

/**
 * DAS URTEIL ÜBER DIE GANZE MATRIX. Ein FEHLENDES Pflicht-Paar zählt wie ein
 * durchgefallenes: eine Prüfung, die ihren Gegenstand nicht findet, ist kein
 * Bestehen.
 */
export function brandContrastReview(pairs: readonly BrandContrastPair[]): BrandContrastReview {
  const byId = new Map(pairs.map(pair => [pair.id, pair]))
  const failing = BRAND_CONTRAST_REQUIRED_PAIRS.filter((id) => {
    const pair = byId.get(id)
    return !pair || (pair.level !== 'AA' && pair.level !== 'AAA')
  })
  return { ok: failing.length === 0, failing }
}

/** Die Lesefassung eines Paar-Namens. */
export function brandContrastPairLabel(pairId: string, locale: string): string {
  const term = brandTermById(BRAND_CONTRAST_PAIR_TERMS, pairId)
  return term ? brandTermLabel(term, locale) : pairId
}

/** Die Lesefassung eines WCAG-Urteils („unter AA"). */
export function brandContrastLevelLabel(level: string, locale: string): string {
  const term = brandTermById(BRAND_CONTRAST_LEVEL_TERMS, level)
  return term ? brandTermLabel(term, locale) : level
}

function levelIdFromLabel(label: string): string {
  const needle = label.trim().toLowerCase()
  const term = BRAND_CONTRAST_LEVEL_TERMS
    .find(entry => entry.de.toLowerCase() === needle || entry.en.toLowerCase() === needle)
  return term?.id ?? ''
}

/** „4,8:1" — im Deutschen mit Komma, sonst mit Punkt, eine Nachkommastelle. */
export function brandRatioText(ratio: number, locale: string): string {
  const text = ratio.toFixed(1)
  return `${locale.toLowerCase().startsWith('de') ? text.replace('.', ',') : text}:1`
}

function ratioFromText(text: string): number {
  return Number.parseFloat(text.replace(':1', '').replace(',', '.').trim())
}

// ── Die Lesefassung des Grundtons (`h.neutral`) ────────────────────────────

export function brandNeutralOptionLabel(optionId: string, locale: string): string {
  const term = brandTermById(BRAND_NEUTRAL_OPTIONS, optionId)
  return term ? brandTermLabel(term, locale) : optionId
}

export function isBrandNeutralOption(optionId: string): boolean {
  return BRAND_NEUTRAL_OPTIONS.some(option => option.id === optionId)
}

// ── Die Slot-Werte ─────────────────────────────────────────────────────────
//
// DREI STRUKTURIERTE WERTE, EIN MUSTER (`brandSlotFormat.ts`): beschriftete
// Blöcke, gelesen nach POSITION (der Katalog sagt, welcher Block welcher ist)
// und nach INHALT (die Zahlen). Die Überschriften stehen in der Inhaltssprache
// der Marke — ein Leser, der sie erkennen müsste, wäre bei der dritten Sprache
// falsch (dieselbe Arbeitsteilung wie `parseBrandDnaSlotValue`).
//
// ' · ' trennt die Teile eines Rumpfes; keiner der Teile kann es enthalten
// (Hex-Werte, Zahlen, Katalog-Etiketten), deshalb braucht es hier keinen
// `withoutSeparator`-Putzer wie bei der DNA.

const RAMP_BLOCK_LABELS: readonly { readonly de: string, readonly en: string }[] = [
  { de: 'Hell', en: 'Light' },
  { de: 'Dunkel', en: 'Dark' },
]

/** Der Slot-Wert von `h.ramp` — zwei Blöcke mit je elf Stufen. */
export function brandRampSlotValue(rampLight: BrandRamp, rampDark: BrandRamp, locale: string): string {
  const de = locale.toLowerCase().startsWith('de')
  return formatBrandSlotStructured([rampLight, rampDark].map((ramp, index) => ({
    label: de ? RAMP_BLOCK_LABELS[index]!.de : RAMP_BLOCK_LABELS[index]!.en,
    body: BRAND_RAMP_SHADES.map(shade => `${shade} ${ramp[shade]}`).join(' · '),
  })))
}

/** Der Weg zurück — `null`, sobald etwas nicht passt (fail-soft wie überall). */
export function parseBrandRampSlotValue(
  value: string,
): { light: BrandRamp, dark: BrandRamp } | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== 2) return null

  const ramps: BrandRamp[] = []
  for (const block of view.blocks) {
    const parts = block.body.split('·').map(part => part.trim()).filter(part => part.length > 0)
    if (parts.length !== BRAND_RAMP_SHADES.length) return null
    const ramp: Partial<Record<number, string>> = {}
    for (const [index, part] of parts.entries()) {
      const [shade, hex] = part.split(/\s+/)
      if (Number(shade) !== BRAND_RAMP_SHADES[index] || !isBrandHex(hex)) return null
      ramp[BRAND_RAMP_SHADES[index]!] = hex
    }
    ramps.push(ramp as BrandRamp)
  }
  return { light: ramps[0]!, dark: ramps[1]! }
}

/** Der Slot-Wert von `h.roles` — fünf Blöcke: Hex · Herkunft · Zweck. */
export function brandColorRolesSlotValue(roles: readonly BrandColorRole[], locale: string): string {
  return formatBrandSlotStructured(roles.map(role => ({
    label: brandColorRoleLabel(role.id, locale),
    body: [
      role.hex,
      brandColorRoleSourceLabel(role.source, locale),
      brandColorRoleNote(role.id, locale),
    ].join(' · '),
  })))
}

/**
 * DER WEG ZURÜCK ZU DEN ROLLEN — gelesen werden Id (Position) und HEX; die
 * QUELLE kommt aus dem Katalog zurück, nicht aus dem Text.
 *
 * Das ist Absicht: die Herkunft ist eine Katalog-Tatsache („Grund & Text kommt
 * aus Rampe 900"), keine Eingabe. Aus dem Lesetext „Rampe 900" wieder
 * `ramp.900` zu raten hiesse, eine Anzeige zur Wahrheit zu machen — und in
 * einer dritten Sprache stünde dort etwas, das niemand zurückrechnen kann.
 */
export function parseBrandColorRolesSlotValue(value: string): BrandColorRole[] | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_COLOR_ROLES.length) return null

  const roles: BrandColorRole[] = []
  for (const [index, block] of view.blocks.entries()) {
    const term = BRAND_COLOR_ROLES[index]!
    const hex = block.body.split('·')[0]?.trim() ?? ''
    if (!isBrandHex(hex)) return null
    roles.push({ id: term.id, source: term.source, hex })
  }
  return roles
}

/** Der Slot-Wert von `h.contrast` — sechs Blöcke: Vorder- · Hintergrund · Verhältnis · Urteil. */
export function brandContrastSlotValue(pairs: readonly BrandContrastPair[], locale: string): string {
  return formatBrandSlotStructured(pairs.map(pair => ({
    label: brandContrastPairLabel(pair.id, locale),
    body: [
      pair.foreground,
      pair.background,
      brandRatioText(pair.ratio, locale),
      brandContrastLevelLabel(pair.level, locale),
    ].join(' · '),
  })))
}

/** Der Weg zurück zur Matrix — die Paar-Ids kommen aus dem Katalog (Position). */
export function parseBrandContrastSlotValue(value: string): BrandContrastPair[] | null {
  const view = brandSlotValueView('structured', value)
  if (view.kind !== 'blocks' || view.blocks.length !== BRAND_CONTRAST_PAIR_SPECS.length) return null

  const pairs: BrandContrastPair[] = []
  for (const [index, block] of view.blocks.entries()) {
    const spec = BRAND_CONTRAST_PAIR_SPECS[index]!
    const parts = block.body.split('·').map(part => part.trim())
    if (parts.length < 4) return null
    const [foreground, background, ratioText, levelLabel] = parts as [string, string, string, string]
    const level = levelIdFromLabel(levelLabel)
    const ratio = ratioFromText(ratioText)
    if (!isBrandHex(foreground) || !isBrandHex(background) || !level || !Number.isFinite(ratio)) return null
    pairs.push({
      id: spec.id,
      scheme: spec.scheme,
      foreground,
      background,
      ratio,
      level: level as BrandContrastPair['level'],
    })
  }
  return pairs
}

// ── Die Invarianten als prüfbare Funktion ──────────────────────────────────

/**
 * Trägt jede Rolle eine EIGENE Quelle, und kennt jedes Kontrast-Paar seine
 * Beschriftung? Nimmt beliebige Listen, damit der Beweis mutierte Fassungen
 * vorlegen kann — eine Prüfung, die nur die richtigen Listen kennt, ist immer
 * grün (dieselbe Regel wie `validateBrandDnaCalmOrder`).
 */
export function validateBrandColorVocab(
  roles: readonly BrandColorRoleTerm[] = BRAND_COLOR_ROLES,
  pairSpecs: readonly { readonly id: string }[] = BRAND_CONTRAST_PAIR_SPECS,
): readonly string[] {
  const problems: string[] = []

  const sources = new Set<string>()
  const ids = new Set<string>()
  for (const role of roles) {
    if (ids.has(role.id)) problems.push(`doppelte Rollen-Id: ${role.id}`)
    ids.add(role.id)
    if (sources.has(role.source)) {
      problems.push(`${role.id}: die Quelle "${role.source}" trägt schon eine andere Rolle`)
    }
    sources.add(role.source)
    if (!role.de.trim() || !role.en.trim()) problems.push(`${role.id}: Label unvollständig`)
    if (!role.noteDe.trim() || !role.noteEn.trim()) problems.push(`${role.id}: Notiz unvollständig`)
  }

  const labelled = new Set(BRAND_CONTRAST_PAIR_TERMS.map(term => term.id))
  for (const spec of pairSpecs) {
    if (!labelled.has(spec.id)) problems.push(`Kontrast-Paar ohne Beschriftung: ${spec.id}`)
  }
  for (const term of BRAND_CONTRAST_PAIR_TERMS) {
    if (!pairSpecs.some(spec => spec.id === term.id)) {
      problems.push(`Beschriftung ohne Paar: ${term.id}`)
    }
  }
  for (const id of BRAND_CONTRAST_REQUIRED_PAIRS) {
    if (!pairSpecs.some(spec => spec.id === id)) problems.push(`Pflicht-Paar ohne Paar: ${id}`)
  }

  return problems
}
