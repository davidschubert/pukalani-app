import { brandNeutralSource, isBrandHex } from '../../shared/brandDesign'
import { brandColorDefaults, isBrandNeutralOption } from '../../shared/brandDesignColor'
import { brandDnaValuesOf, parseBrandDnaMixSlotValue } from '../../shared/brandDesignDna'
import { type BrandSceneColors, type BrandSceneFonts, brandSceneColors, brandSceneFonts } from '../../shared/brandDesignScene'
import {
  type BrandTypeRules,
  brandTypeDefaults,
  brandTypeRulesSlotValue,
  brandTypeScaleFactor,
  brandTypeWeightWarning,
  isBrandTypeScale,
  parseBrandTypeRulesSlotValue,
} from '../../shared/brandDesignType'
import { type BrandFontPair, BRAND_FONT_PAIRS, brandFontPair } from '../../shared/brandFontPairs'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE TYPOGRAFIE — EINE Rechnung für drei Abschnitte (Brand Design D4,
 * Konzept §2.4).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Paar, Hierarchie und Regeln stehen untereinander in EINER Bühne und meinen
 * dasselbe Specimen: ein anderes Paar oben ändert alles darunter, und die
 * Szene ganz unten zeigt beides zusammen. Jede Komponente, die das selbst
 * ausrechnete, wäre eine zweite Meinung über dieselbe Schrift — dieselbe
 * Begründung wie bei `useBrandColorWorld` (D3).
 *
 * ── SIE HÄLT KEINEN ZUSTAND UND SCHREIBT NICHTS ──────────────────────────
 * Alles ist aus dem STORE gerechnet (`i.pair`, `i.scale`, `i.rules`);
 * geschrieben wird von der SEITE (`setSlotValue` + Autosave). Ein zweiter
 * Autosave-Lauf neben dem der Seite wäre ein zweiter Schreiber auf dieselbe
 * `revision`.
 *
 * ── DIE FARBWELT KOMMT AUS DEM KAPITEL DAVOR ─────────────────────────────
 * Die Szene zeigt die Schrift IN der Marke, nicht auf Weiss. Basisfarbe,
 * Grundton und Akzent reisen deshalb als `sourceValues`
 * (`BRAND_STAGE_SOURCE_SLOTS.type`). Fehlt eine davon — Kapitel wieder
 * geöffnet, von Hand korrigiert —, rechnet DIESELBE Regel wie in D3 einen
 * Vorschlag aus Richtung und Kachel-Farbwelt: eine Vorschau auf der grauen
 * Notfarbe sagt über diese Marke nichts.
 */
export function useBrandTypeWorld() {
  const store = useBrandWorkspaceStore()

  /** Die Sprache, in der die WERTE stehen — nie die der Oberfläche. */
  const contentLocale = computed(() => (store.profile?.contentLocale === 'en' ? 'en' : 'de'))

  const dna = computed<Readonly<Record<string, string>> | undefined>(() => {
    const entries = parseBrandDnaMixSlotValue(store.sourceValues['g.mix'] ?? '')
    return entries ? brandDnaValuesOf(entries) : undefined
  })
  const directionId = computed(() => store.sourceValues['result.direction'] ?? '')
  /** Der Streusamen der Kachel-Farbwelt ist die Profil-Id (`brandPalette.ts`). */
  const paletteSeed = computed(() => store.profile?.id ?? '')

  const defaults = computed(() => brandTypeDefaults(dna.value))

  /** Der wirksame Wert: was im Slot steht, sonst der Vorschlag. */
  const pairId = computed(() => {
    const stored = store.slotValue('i.pair').trim()
    return brandFontPair(stored) ? stored : defaults.value.pair
  })
  const pair = computed<BrandFontPair>(() => brandFontPair(pairId.value) ?? BRAND_FONT_PAIRS[0]!)

  const scaleId = computed(() => {
    const stored = store.slotValue('i.scale').trim()
    return isBrandTypeScale(stored) ? stored : defaults.value.scale
  })
  const scaleFactor = computed(() => brandTypeScaleFactor(scaleId.value))

  const rules = computed<BrandTypeRules>(() =>
    parseBrandTypeRulesSlotValue(store.slotValue('i.rules')) ?? defaults.value.rules)

  /**
   * DIE FAMILIE, DEREN SCHNITT DER BROWSER FÄLSCHEN WÜRDE — `null`, wenn
   * alles echt ist. Sie hängt am PAAR und am Gewicht zugleich: ein Wechsel
   * von `editorial` auf `classic` kann eine Einstellung, die eben noch echt
   * war, unecht machen.
   */
  const weightWarning = computed(() => brandTypeWeightWarning(pairId.value, rules.value.headingWeight))

  /** Die bestätigte Farbwelt aus `color` — sonst der Vorschlag von D3. */
  const colorFallback = computed(() => brandColorDefaults(dna.value, directionId.value, paletteSeed.value))
  const base = computed(() => {
    const stored = (store.sourceValues['h.base'] ?? '').trim()
    return isBrandHex(stored) ? stored.toLowerCase() : colorFallback.value.base
  })
  const neutral = computed(() => {
    const stored = (store.sourceValues['h.neutral'] ?? '').trim()
    return isBrandNeutralOption(stored) ? stored : colorFallback.value.neutral
  })
  const accent = computed(() => {
    const stored = (store.sourceValues['h.accent'] ?? '').trim()
    return isBrandHex(stored) ? stored.toLowerCase() : colorFallback.value.accent
  })

  const colors = computed<BrandSceneColors>(() =>
    brandSceneColors(base.value, accent.value, brandNeutralSource(neutral.value, base.value)))

  /** Die Schrift-Props der Szene — Paar plus die drei Regeln plus Hierarchie. */
  const fonts = computed<BrandSceneFonts>(() => brandSceneFonts(pairId.value, {
    headingWeight: rules.value.headingWeight,
    headingTracking: rules.value.headingTracking,
    headingUppercase: rules.value.headingUppercase,
    scale: scaleFactor.value,
  }))

  /** Der Slot-Wert von `i.rules` zu einer (womöglich neuen) Einstellung. */
  function rulesSlotValue(next?: Partial<BrandTypeRules>): string {
    return brandTypeRulesSlotValue({ ...rules.value, ...(next ?? {}) }, contentLocale.value)
  }

  /** DIE WERTE, DIE IN DIE DREI SLOTS GEHÖREN. */
  const slotValues = computed<Record<string, string>>(() => ({
    'i.pair': pairId.value,
    'i.scale': scaleId.value,
    'i.rules': rulesSlotValue(),
  }))

  return {
    contentLocale,
    dna,
    defaults,
    pairId,
    pair,
    scaleId,
    scaleFactor,
    rules,
    weightWarning,
    colors,
    fonts,
    rulesSlotValue,
    slotValues,
  }
}
