import { brandNeutralSource, buildBrandDesign } from './brandDesign'
import { parseBrandColorRolesSlotValue } from './brandDesignColor'
import { parseBrandDnaMixSlotValue } from './brandDesignDna'
import {
  brandImageryPrincipleLines,
  parseBrandImageryDoDontSlotValue,
  parseBrandImageryPrincipleSlotValue,
} from './brandDesignImagery'
import {
  brandMarkBriefLines,
  brandMarkSpec,
  parseBrandMarkBriefSlotValue,
} from './brandDesignMark'
import { parseBrandMotionRulesSlotValue } from './brandDesignMotion'
import { brandSceneColors } from './brandDesignScene'
import { brandTypeRuleLines, parseBrandTypeRulesSlotValue } from './brandDesignType'
import { brandMarkExampleSvgs } from './brandMarkSvg'
import type { BrandDesignPreset, BrandDesignValues } from './types/brand'

/**
 * DER WEG VON DEN BESTÄTIGTEN SLOT-WERTEN ZUM PRESET (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Paket D8).
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 * `buildBrandDesign(values)` steht seit D0 und rechnet aus einem
 * `BrandDesignValues` das Preset. Was fehlte, war der Schritt DAVOR: aus den
 * gespeicherten Slot-Werten der sechs Kapitel (Zeichenketten in der
 * Inhaltssprache der Marke) wieder Werte machen. Jedes Kapitel-Modul hat dafür
 * seinen eigenen Rückweg (`parseBrand*SlotValue`) — hier werden sie EINMAL
 * zusammengesetzt, damit nicht jeder Leser (Kapitel 10, Ergebnis-Board,
 * Snapshot, Produkt 03) seine eigene Zusammensetzung baut. Die eine, die man
 * später ändert, wäre garantiert nicht die, die noch gelesen wird.
 *
 * ── SIE IST PUR ───────────────────────────────────────────────────────────
 * Kein Appwrite, kein H3, kein i18n. Wer die Zeilen lädt, ist
 * `server/utils/brandDesignPreset.ts`; wer sie testet, ist ein Unit-Test.
 *
 * ── DREI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF ────────────────────────
 * (1) DIE SETZUNGEN (`mark.examples`) WERDEN GERECHNET, NICHT GELESEN. Im
 *     Slot `j.examples` stehen bewusst die EINGABEN der Setzung (Name,
 *     Monogramm-Buchstabe, vier Farbtripel), nicht ihr SVG — die Begründung
 *     steht im Kopf von `brandDesignMark.ts`. Das SVG entsteht deterministisch
 *     aus Schriftpaar, Farbwelt, Richtung und DNA; es hier aus dem Slot lesen
 *     zu wollen hiesse, eine zweite Fassung derselben Wahrheit zu pflegen.
 * (2) DIE INHALTSSPRACHE IST DIE DER MARKE. `brandMarkBriefLines`,
 *     `brandTypeRuleLines` und `brandImageryPrincipleLines` bekommen deshalb
 *     `contentLocale` und nicht die Sprache des Lesers: das Preset trägt
 *     Marken-INHALT, und der wechselt nicht, weil jemand die Oberfläche auf
 *     Englisch stellt.
 * (3) `keptDrafts` KOMMT VON AUSSEN. Die behaltenen KI-Entwürfe stehen in
 *     einer eigenen Tabelle (`brand_mark_drafts`), nicht in einem Slot — der
 *     Slot `j.drafts` wird nie `confirmed` (D5c). Wer sie nicht hat (der
 *     Snapshot-Schreiber), übergibt nichts, und dann steht im Preset eine
 *     leere Liste statt einer geratenen.
 */

/** Die Slot-Ids, aus denen das Preset entsteht — sechs Kapitel, sechzehn Werte. */
export const BRAND_DESIGN_PRESET_SLOTS: readonly string[] = [
  'g.mix',
  'h.base', 'h.neutral', 'h.accent', 'h.roles',
  'i.pair', 'i.scale', 'i.rules',
  'j.kind', 'j.brief',
  'k.photo', 'k.illustration', 'k.icons', 'k.dodont',
  'l.tempo', 'l.logo', 'l.rules',
]

export interface BrandDesignSlotSource {
  /** Der Markenname — er wird gesetzt (Wortmarke, Monogramm). */
  readonly title: string
  /** Die Inhaltssprache der Marke (s. Kopf, Regel 2). */
  readonly contentLocale: string
  /** Slot-Id → BESTÄTIGTER Wert. Fehlende Schlüssel sind der Normalfall. */
  readonly values: Readonly<Record<string, string>>
  /** Ids der behaltenen KI-Entwürfe (s. Kopf, Regel 3). */
  readonly keptDrafts?: readonly string[]
}

function valueOf(source: BrandDesignSlotSource, slotId: string): string {
  return (source.values[slotId] ?? '').trim()
}

/**
 * DIE ZEHN DIMENSIONEN AUS DEM BESTÄTIGTEN MIX — `undefined`, sobald der Wert
 * nicht lesbar ist.
 *
 * `undefined` und nicht `{}`: `buildBrandDesign` prüft die Vollständigkeit
 * selbst und antwortet mit `null`; ein halb gefülltes Objekt wäre eine DNA,
 * die es nicht gibt.
 */
function dnaOf(source: BrandDesignSlotSource): Readonly<Record<string, string>> | undefined {
  const entries = parseBrandDnaMixSlotValue(valueOf(source, 'g.mix'))
  if (!entries) return undefined
  return Object.fromEntries(entries.map(entry => [entry.dimension, entry.value]))
}

/**
 * DIE ACHT SETZUNGEN ALS SVG — gerechnet aus Paar, Farbwelt, Richtung und DNA
 * (s. Kopf, Regel 1). Leer, sobald eine der Quellen fehlt: acht Bilder aus
 * Notfarben wären eine Marke, die niemand entschieden hat.
 */
function markExamplesOf(
  source: BrandDesignSlotSource,
  dna: Readonly<Record<string, string>> | undefined,
): string[] {
  const base = valueOf(source, 'h.base')
  const accent = valueOf(source, 'h.accent')
  const pairId = valueOf(source, 'i.pair')
  const kind = valueOf(source, 'j.kind')
  if (!base || !accent || !pairId || !kind || !source.title.trim()) return []

  const rules = parseBrandTypeRulesSlotValue(valueOf(source, 'i.rules'))
  const colors = brandSceneColors(
    base,
    accent,
    brandNeutralSource(valueOf(source, 'h.neutral') || undefined, base),
  )
  return brandMarkExampleSvgs(brandMarkSpec({
    title: source.title,
    pairId,
    kind,
    dna,
    colors,
    ...(rules
      ? {
          headingWeight: rules.headingWeight,
          headingTracking: rules.headingTracking,
          headingUppercase: rules.headingUppercase,
        }
      : {}),
  }))
}

/**
 * DIE EINGABE VON `buildBrandDesign` AUS DEN GESPEICHERTEN WERTEN.
 *
 * Jeder Rückweg ist FAIL-SOFT: was nicht lesbar ist, fehlt — und `buildBrand
 * Design` entscheidet danach, ob daraus ein Preset wird. So bleibt genau EINE
 * Stelle, die „vollständig genug" beantwortet.
 */
export function brandDesignValuesFromSlots(source: BrandDesignSlotSource): BrandDesignValues {
  const locale = source.contentLocale
  const dna = dnaOf(source)
  const typeRules = parseBrandTypeRulesSlotValue(valueOf(source, 'i.rules'))
  const brief = parseBrandMarkBriefSlotValue(valueOf(source, 'j.brief'))
  const principleId = parseBrandImageryPrincipleSlotValue(valueOf(source, 'k.photo'))
  const roles = parseBrandColorRolesSlotValue(valueOf(source, 'h.roles'))
  const dodont = parseBrandImageryDoDontSlotValue(valueOf(source, 'k.dodont'))
  const motionRules = parseBrandMotionRulesSlotValue(valueOf(source, 'l.rules'))

  return {
    ...(dna ? { dna } : {}),
    base: valueOf(source, 'h.base'),
    neutral: valueOf(source, 'h.neutral'),
    accent: valueOf(source, 'h.accent'),
    ...(roles ? { roles } : {}),
    pair: valueOf(source, 'i.pair'),
    scale: valueOf(source, 'i.scale'),
    ...(typeRules ? { typeRules: brandTypeRuleLines(typeRules, locale) } : {}),
    markKind: valueOf(source, 'j.kind'),
    ...(brief ? { markBrief: brandMarkBriefLines(brief, locale) } : {}),
    markExamples: markExamplesOf(source, dna),
    keptDrafts: [...(source.keptDrafts ?? [])],
    ...(principleId ? { imageryPrinciples: brandImageryPrincipleLines(principleId, locale) } : {}),
    illustration: valueOf(source, 'k.illustration'),
    icons: valueOf(source, 'k.icons'),
    ...(dodont ? { dodont } : {}),
    tempo: valueOf(source, 'l.tempo'),
    logoMotion: valueOf(source, 'l.logo'),
    ...(motionRules ? { motionRules } : {}),
  }
}

/**
 * DAS PRESET AUS DEN GESPEICHERTEN WERTEN — `null`, solange etwas Tragendes
 * fehlt (die Liste steht bei `buildBrandDesign`).
 *
 * Die EINE Funktion, die jeder Leser ruft: sie hält die zwei Schritte
 * (Rückwege, dann Regel) zusammen, damit niemand den ersten überspringt und
 * eigene Werte zusammenstellt.
 */
export function brandDesignPresetFromSlots(source: BrandDesignSlotSource): BrandDesignPreset | null {
  return buildBrandDesign(brandDesignValuesFromSlots(source))
}

/**
 * DAS PRESET FÜR DEN SNAPSHOT — dasselbe OHNE die behaltenen Entwürfe
 * (§1.11 b: sie sind privat und reisen nie).
 *
 * Es ist eine eigene Funktion und kein `delete`: der Typ
 * `BrandDesignSnapshotPreset` lässt das Feld gar nicht zu, und wer es doch
 * setzen wollte, bekommt einen Übersetzungsfehler statt eines stillen Lecks.
 * Der Rest wird WÖRTLICH durchgereicht — das Abbild ist dasselbe Preset, nicht
 * ein zweites.
 */
export function brandDesignSnapshotPreset(
  preset: BrandDesignPreset,
): Omit<BrandDesignPreset, 'mark'> & { mark: Omit<BrandDesignPreset['mark'], 'keptDrafts'> } {
  const { keptDrafts: _keptDrafts, ...mark } = preset.mark
  return { ...preset, mark }
}
