import {
  brandColorContrastPairs,
  brandNeutralRamp,
  brandNeutralSource,
  brandRampDark,
  brandRampLight,
  isBrandHex,
} from '../../shared/brandDesign'
import {
  type BrandAccentCandidate,
  type BrandColorCandidate,
  brandAccentCandidates,
  brandBaseCandidates,
  brandColorDefaults,
  brandColorRoles,
  brandColorRolesSlotValue,
  brandContrastReview,
  brandContrastSlotValue,
  brandRampSlotValue,
  isBrandNeutralOption,
} from '../../shared/brandDesignColor'
import {
  brandDnaValuesOf,
  brandFontPairForDnaTypography,
  parseBrandDnaMixSlotValue,
} from '../../shared/brandDesignDna'
import { type BrandSceneColors, brandSceneColors, brandSceneFonts } from '../../shared/brandDesignScene'
import type { BrandColorRole, BrandContrastPair, BrandRamp } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE FARBWELT — EINE Rechnung für sechs Abschnitte (Brand Design D3, Konzept
 * §2.3).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Basisfarbe, Rampen, Grundton, Akzent, Rollen und Kontrast-Matrix stehen
 * untereinander in EINER Bühne und meinen dieselbe Rechnung: eine andere
 * Basisfarbe oben ändert alles darunter. Jede Komponente, die sie selbst
 * anstellte, wäre eine zweite Meinung über dieselbe Farbwelt — dieselbe
 * Begründung wie bei `useBrandDnaBoards` (D2c).
 *
 * ── SIE HÄLT KEINEN ZUSTAND ──────────────────────────────────────────────
 * Alles hier ist aus dem STORE gerechnet: die Basisfarbe steht in `h.base`,
 * der Grundton in `h.neutral`, der Akzent in `h.accent`. Es gibt bewusst keine
 * zweite Ablage im Browser — eine, die den Reload überlebt, wäre der
 * gespeicherte Wert selbst, und eine, die ihn nicht überlebt, widerspräche ihm
 * nach dem ersten Seitenaufbau.
 *
 * ── SIE SCHREIBT NICHTS ──────────────────────────────────────────────────
 * Sie RECHNET die Werte aus, die in die sechs Slots gehören; geschrieben
 * werden sie von der SEITE (`setSlotValue` + Autosave). Ein zweiter
 * Autosave-Lauf neben dem der Seite wäre ein zweiter Schreiber auf dieselbe
 * `revision`.
 *
 * ── DIE VORBELEGUNG IST EIN VORSCHLAG, KEIN WERT ─────────────────────────
 * Steht in einem Slot nichts, rechnet `defaults` einen Vorschlag aus DNA und
 * Richtung (H5: „jede Session muss als BESTÄTIGUNG durchlaufbar sein"). Sobald
 * ein Wert dasteht, gilt er — auch ein Hex, den niemand vorgeschlagen hat.
 */
export function useBrandColorWorld() {
  const store = useBrandWorkspaceStore()

  /** Die Sprache, in der die WERTE stehen — nie die der Oberfläche. */
  const contentLocale = computed(() => (store.profile?.contentLocale === 'en' ? 'en' : 'de'))

  /**
   * Die bestätigte DNA und die gewählte Richtung liegen in FREMDEN Kapiteln;
   * beide reisen als `sourceValues` mit (`BRAND_STAGE_SOURCE_SLOTS.color`).
   * Fehlen sie, fällt die Rechnung auf die Farbwelt der Marken-Kachel zurück.
   */
  const dna = computed<Readonly<Record<string, string>> | undefined>(() => {
    const entries = parseBrandDnaMixSlotValue(store.sourceValues['g.mix'] ?? '')
    return entries ? brandDnaValuesOf(entries) : undefined
  })
  const directionId = computed(() => store.sourceValues['result.direction'] ?? '')
  /** Der Streusamen der Kachel-Farbwelt ist die Profil-Id (`brandPalette.ts`). */
  const paletteSeed = computed(() => store.profile?.id ?? '')

  const defaults = computed(() => brandColorDefaults(dna.value, directionId.value, paletteSeed.value))

  /** Der wirksame Wert: was im Slot steht, sonst der Vorschlag. */
  const base = computed(() => {
    const stored = store.slotValue('h.base').trim()
    return isBrandHex(stored) ? stored.toLowerCase() : defaults.value.base
  })
  const neutral = computed(() => {
    const stored = store.slotValue('h.neutral').trim()
    return isBrandNeutralOption(stored) ? stored : defaults.value.neutral
  })
  const accent = computed(() => {
    const stored = store.slotValue('h.accent').trim()
    return isBrandHex(stored) ? stored.toLowerCase() : defaults.value.accent
  })

  const baseCandidates = computed<readonly BrandColorCandidate[]>(() =>
    brandBaseCandidates(directionId.value, paletteSeed.value))
  const accentCandidates = computed<readonly BrandAccentCandidate[]>(() =>
    brandAccentCandidates(directionId.value, paletteSeed.value, base.value))

  /**
   * DIE EINE RECHNUNG DER SEITE — Szene, Streifen, Rollen und Matrix lesen
   * dasselbe Ergebnis. Zwei Rechenwege wären zwei Wahrheiten (Prototyp).
   */
  const colors = computed<BrandSceneColors>(() =>
    brandSceneColors(base.value, accent.value, brandNeutralSource(neutral.value, base.value)))

  /** Die Schrift der Vorschau folgt der DNA — das Kapitel `type` kommt danach. */
  const fonts = computed(() => brandSceneFonts(brandFontPairForDnaTypography(dna.value?.typography ?? '')))

  const rampLight = computed<BrandRamp | null>(() => brandRampLight(base.value))
  const rampDark = computed<BrandRamp | null>(() => brandRampDark(base.value))

  const roles = computed<BrandColorRole[]>(() =>
    brandColorRoles(base.value, accent.value, neutral.value) ?? [])
  const pairs = computed<BrandContrastPair[]>(() =>
    brandColorContrastPairs(base.value, accent.value, neutral.value) ?? [])
  const review = computed(() => brandContrastReview(pairs.value))

  /** Eine Neutral-Rampe zur Vorschau EINER Grundton-Wahl (drei Streifen). */
  function neutralPreview(optionId: string): string[] {
    const ramp = brandNeutralRamp(brandNeutralSource(optionId, base.value))
    return ramp ? Object.values(ramp) : []
  }

  /**
   * DIE WERTE, DIE IN DIE SECHS SLOTS GEHÖREN.
   *
   * `h.contrast` bleibt LEER, solange ein Pflicht-Paar AA reisst (§2.3: „ein
   * Vorschlag, der AA reisst, wird nicht angeboten") — ein leerer Slot ist
   * nicht bestätigbar, und damit steht die Regel an EINER Stelle statt in
   * einem zweiten Bedienelement.
   */
  const slotValues = computed<Record<string, string>>(() => {
    const values: Record<string, string> = {
      'h.base': base.value,
      'h.neutral': neutral.value,
      'h.accent': accent.value,
    }
    if (rampLight.value && rampDark.value) {
      values['h.ramp'] = brandRampSlotValue(rampLight.value, rampDark.value, contentLocale.value)
    }
    if (roles.value.length) {
      values['h.roles'] = brandColorRolesSlotValue(roles.value, contentLocale.value)
    }
    if (review.value.ok && pairs.value.length) {
      values['h.contrast'] = brandContrastSlotValue(pairs.value, contentLocale.value)
    }
    return values
  })

  return {
    contentLocale,
    dna,
    directionId,
    base,
    neutral,
    accent,
    baseCandidates,
    accentCandidates,
    colors,
    fonts,
    rampLight,
    rampDark,
    roles,
    pairs,
    review,
    neutralPreview,
    slotValues,
  }
}
