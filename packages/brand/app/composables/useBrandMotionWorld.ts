import { brandNeutralSource, isBrandHex } from '../../shared/brandDesign'
import { brandColorDefaults, isBrandNeutralOption } from '../../shared/brandDesignColor'
import { brandDnaValuesOf, parseBrandDnaMixSlotValue } from '../../shared/brandDesignDna'
import {
  type BrandMotionToken,
  brandMotionDefaults,
  brandMotionRules,
  brandMotionRulesSlotValue,
  brandMotionScene,
  brandMotionTokens,
  brandMotionTransitionsSlotValue,
  isBrandLogoMotion,
  isBrandTempo,
} from '../../shared/brandDesignMotion'
import {
  type BrandSceneColors,
  type BrandSceneFonts,
  type BrandSceneMotion,
  brandSceneColors,
  brandSceneFonts,
} from '../../shared/brandDesignScene'
import { brandTypeDefaults, brandTypeScaleFactor, parseBrandTypeRulesSlotValue } from '../../shared/brandDesignType'
import { brandFontPair } from '../../shared/brandFontPairs'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE BEWEGUNG — EINE Rechnung für vier Abschnitte (Brand Design D7,
 * Konzept §2.7).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Alles in diesem Kapitel hängt an EINER Entscheidung: das Tempo bestimmt die
 * vier Tokens, die Tokens bestimmen, womit die Szene spielt, und Tempo plus
 * kinetisches Zeichen bestimmen die sechs Regeln. Jede Komponente, die das
 * selbst ausrechnete, wäre eine zweite Meinung über dieselbe Marke — dieselbe
 * Begründung wie bei `useBrandColorWorld` (D3), `useBrandTypeWorld` (D4),
 * `useBrandMarkWorld` (D5) und `useBrandImageryWorld` (D6).
 *
 * ── SIE HÄLT KEINEN ZUSTAND UND SCHREIBT NICHTS ──────────────────────────
 * Alles ist aus dem STORE gerechnet; geschrieben wird von der SEITE
 * (`setSlotValue` + Autosave). Ein zweiter Autosave-Lauf neben dem der Seite
 * wäre ein zweiter Schreiber auf dieselbe `revision`.
 *
 * ── DREI KAPITEL LIEFERN ZU (`BRAND_STAGE_SOURCE_SLOTS.motion`) ──────────
 * Die Szene zeigt die ganze Marke in Bewegung: Farbwelt (`h.*`), Schriftpaar
 * (`i.pair`) UND die Schrift-Regeln (`i.rules`, für die Wortmarke im Kopf).
 * Fehlt eine davon — Kapitel wieder geöffnet, von Hand korrigiert —, rechnen
 * DIESELBEN Regeln wie in D3/D4 einen Vorschlag: eine Vorschau auf der grauen
 * Notfarbe sagt über das Tempo DIESER Marke nichts.
 *
 * ── DAS ABSPIELEN GEHÖRT DER KOMPONENTE ──────────────────────────────────
 * `playKey` und der Schalter „weniger Bewegung" sind Bedienzustand einer
 * Fläche, kein Ergebnis einer Regel — sie stehen deshalb in `BwMotionPanel`
 * und nicht hier (dieselbe Trennung wie beim Hell/Dunkel-Umschalter der
 * Szene).
 */
export function useBrandMotionWorld() {
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
  const fonts = computed<BrandSceneFonts>(() => brandSceneFonts(pairId.value, {
    headingWeight: typeRules.value.headingWeight,
    headingTracking: typeRules.value.headingTracking,
    headingUppercase: typeRules.value.headingUppercase,
    scale: brandTypeScaleFactor(typeDefaults.value.scale),
  }))

  // ── Die vier Sessions ───────────────────────────────────────────────────

  /** Die Vorbelegung aus der DNA — sie trägt in der Bühne den Vorschlags-Chip. */
  const defaults = computed(() => brandMotionDefaults(dna.value))

  const tempoId = computed(() => {
    const stored = store.slotValue('l.tempo').trim()
    return isBrandTempo(stored) ? stored : defaults.value.tempo
  })

  const logoId = computed(() => {
    const stored = store.slotValue('l.logo').trim()
    return isBrandLogoMotion(stored) ? stored : defaults.value.logo
  })

  /** Die vier Tokens des gewählten Tempos — in der Sprache der WERTE. */
  const tokens = computed<BrandMotionToken[]>(() => brandMotionTokens(tempoId.value, contentLocale.value))

  /** Die sechs Regeln, wie sie im Slot stehen werden. */
  const rules = computed<string[]>(() =>
    brandMotionRules(tempoId.value, logoId.value, contentLocale.value))

  /**
   * WOMIT DIE SZENE SPIELT — zu JEDEM Tempo, nicht nur zum gewählten: die drei
   * Karten stehen nebeneinander und spielen gleichzeitig, sonst vergleicht man
   * eine Erinnerung mit einer Bewegung.
   */
  function sceneMotion(id: string): BrandSceneMotion {
    return brandMotionScene(id)
  }

  /**
   * DIE WERTE, DIE IN DIE SLOTS GEHÖREN — alle vier.
   *
   * Wie in D6 rechnet dieses Kapitel JEDEN seiner Werte: es gibt hier keinen
   * Modell-Text, den ein Autosave überschreiben könnte (§1.4). `l.rules` ist
   * `stage-edit` — eine von Hand ergänzte Zeile überlebt trotzdem, weil die
   * Seite bestätigte Slots nie überschreibt.
   */
  const slotValues = computed<Record<string, string>>(() => ({
    'l.tempo': tempoId.value,
    'l.transitions': brandMotionTransitionsSlotValue(tempoId.value, contentLocale.value),
    'l.logo': logoId.value,
    'l.rules': brandMotionRulesSlotValue(rules.value),
  }))

  return {
    contentLocale,
    dna,
    colors,
    fonts,
    pairId,
    defaults,
    tempoId,
    logoId,
    tokens,
    rules,
    sceneMotion,
    slotValues,
  }
}
