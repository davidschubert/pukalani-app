import { brandNeutralSource, isBrandHex } from '../../shared/brandDesign'
import { brandColorDefaults, isBrandNeutralOption } from '../../shared/brandDesignColor'
import { brandDnaValuesOf, parseBrandDnaMixSlotValue } from '../../shared/brandDesignDna'
import {
  type BrandMarkBrief,
  type BrandMarkSpec,
  brandMarkExamplesSlotValue,
  brandMarkKindDefault,
  brandMarkPickDefault,
  brandMarkSpec,
  isBrandMarkKind,
  isBrandMarkSetting,
  parseBrandMarkBriefSlotValue,
} from '../../shared/brandDesignMark'
import { type BrandSceneColors, type BrandSceneFonts, brandSceneColors, brandSceneFonts } from '../../shared/brandDesignScene'
import { brandTypeDefaults, parseBrandTypeRulesSlotValue } from '../../shared/brandDesignType'
import { brandFontPair } from '../../shared/brandFontPairs'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DAS ZEICHEN — EINE Rechnung für vier Abschnitte (Brand Design D5a/D5b,
 * Konzept §2.5).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Richtung, Briefing, Setzungen und Wahl stehen untereinander in EINER Bühne
 * und meinen dasselbe Zeichen: eine andere Richtung oben ändert die
 * Vorbelegung der Wahl unten, ein anderes Schriftpaar im Kapitel davor ändert
 * jede Setzung. Jede Komponente, die das selbst ausrechnete, wäre eine zweite
 * Meinung über dieselbe Marke — dieselbe Begründung wie bei
 * `useBrandColorWorld` (D3) und `useBrandTypeWorld` (D4).
 *
 * ── SIE HÄLT KEINEN ZUSTAND UND SCHREIBT NICHTS ──────────────────────────
 * Alles ist aus dem STORE gerechnet; geschrieben wird von der SEITE
 * (`setSlotValue` + Autosave). Ein zweiter Autosave-Lauf neben dem der Seite
 * wäre ein zweiter Schreiber auf dieselbe `revision`.
 *
 * ── DREI KAPITEL LIEFERN ZU (`BRAND_STAGE_SOURCE_SLOTS.mark`) ────────────
 * Die DNA (`g.mix`) belegt Richtung und Eckenrundung vor, die Farbwelt
 * (`h.*`) gibt die vier Varianten, das Schriftpaar samt Regeln (`i.pair`,
 * `i.rules`) setzt den Namen. Fehlt eines davon — Kapitel wieder geöffnet,
 * von Hand korrigiert —, rechnet DIESELBE Regel wie in D3/D4 einen Vorschlag:
 * eine Wortmarke auf der grauen Notfarbe sagt über diese Marke nichts.
 *
 * ── DER NAME IST HIER TEIL DES WERTES, NICHT NUR DER ANSICHT ─────────────
 * Anders als in D4 (dort ist der Name nur das Specimen) steht er im
 * Slot-Wert von `j.examples` und im gesetzten SVG. Deshalb kennt dieses
 * Composable als einziges der drei `useI18n()` — für den Platzhalter einer
 * noch namenlosen Marke. Ein leerer Name ergäbe eine leere Fläche mit einem
 * Schutzraum darum.
 */
export function useBrandMarkWorld() {
  const store = useBrandWorkspaceStore()
  const { t } = useI18n()

  /** Die Sprache, in der die WERTE stehen — nie die der Oberfläche. */
  const contentLocale = computed(() => (store.profile?.contentLocale === 'en' ? 'en' : 'de'))

  const dna = computed<Readonly<Record<string, string>> | undefined>(() => {
    const entries = parseBrandDnaMixSlotValue(store.sourceValues['g.mix'] ?? '')
    return entries ? brandDnaValuesOf(entries) : undefined
  })
  const directionId = computed(() => store.sourceValues['result.direction'] ?? '')
  /** Der Streusamen der Kachel-Farbwelt ist die Profil-Id (`brandPalette.ts`). */
  const paletteSeed = computed(() => store.profile?.id ?? '')

  // ── Die Farbwelt aus `color` — sonst der Vorschlag von D3 ───────────────
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

  // ── Die Typografie aus `type` — sonst der Vorschlag von D4 ──────────────
  const typeDefaults = computed(() => brandTypeDefaults(dna.value))
  const pairId = computed(() => {
    const stored = (store.sourceValues['i.pair'] ?? '').trim()
    return brandFontPair(stored) ? stored : typeDefaults.value.pair
  })
  const typeRules = computed(() =>
    parseBrandTypeRulesSlotValue(store.sourceValues['i.rules'] ?? '') ?? typeDefaults.value.rules)

  /** Der Name, wie er gesetzt wird — der Platzhalter nur für namenlose Marken. */
  const wordmark = computed(() => store.profile?.title?.trim() || t('brand.scene.wordmarkFallback'))

  // ── Die vier Sessions ───────────────────────────────────────────────────
  const kindId = computed(() => {
    const stored = store.slotValue('j.kind').trim()
    return isBrandMarkKind(stored) ? stored : brandMarkKindDefault(dna.value)
  })

  /** Das Briefing aus dem Slot — `null`, solange keines gelaufen ist. */
  const brief = computed<BrandMarkBrief | null>(() =>
    parseBrandMarkBriefSlotValue(store.slotValue('j.brief')))

  const spec = computed<BrandMarkSpec>(() => brandMarkSpec({
    title: wordmark.value,
    pairId: pairId.value,
    kind: kindId.value,
    dna: dna.value,
    colors: colors.value,
    headingWeight: typeRules.value.headingWeight,
    headingTracking: typeRules.value.headingTracking,
    headingUppercase: typeRules.value.headingUppercase,
  }))

  const pickId = computed(() => {
    const stored = store.slotValue('j.pick').trim()
    return isBrandMarkSetting(stored) ? stored : brandMarkPickDefault(kindId.value)
  })

  /** Die Schrift-Props der Szene — dasselbe Paar und dieselben Regeln. */
  const fonts = computed<BrandSceneFonts>(() => brandSceneFonts(pairId.value, {
    headingWeight: typeRules.value.headingWeight,
    headingTracking: typeRules.value.headingTracking,
    headingUppercase: typeRules.value.headingUppercase,
  }))

  /**
   * DIE WERTE, DIE IN DIE SLOTS GEHÖREN — DREI, nicht vier.
   *
   * `j.brief` steht bewusst NICHT darin: es ist die einzige Session dieses
   * Kapitels, die weder gerechnet noch gewählt wird. Sie entsteht im Lauf
   * (server-seitig) oder von Hand — ein Autosave von hier überschriebe beides.
   */
  const slotValues = computed<Record<string, string>>(() => ({
    'j.kind': kindId.value,
    'j.examples': brandMarkExamplesSlotValue(spec.value, contentLocale.value),
    'j.pick': pickId.value,
  }))

  return {
    contentLocale,
    dna,
    colors,
    fonts,
    pairId,
    typeRules,
    wordmark,
    kindId,
    brief,
    spec,
    pickId,
    slotValues,
  }
}
