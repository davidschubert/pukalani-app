import { brandNeutralSource, isBrandHex } from '../../shared/brandDesign'
import { brandColorDefaults, isBrandNeutralOption } from '../../shared/brandDesignColor'
import { brandDnaValuesOf, parseBrandDnaMixSlotValue } from '../../shared/brandDesignDna'
import {
  type BrandImageryDoDont,
  brandIconStrokeVerdict,
  brandImageryDefaults,
  brandImageryDoDont,
  brandImageryDoDontSlotValue,
  brandImageryPrincipleSlotValue,
  isBrandIconOption,
  isBrandIllustrationOption,
  parseBrandImageryPrincipleSlotValue,
} from '../../shared/brandDesignImagery'
import { type BrandSceneColors, brandSceneColors } from '../../shared/brandDesignScene'
import { brandTypeDefaults } from '../../shared/brandDesignType'
import { BRAND_FONT_PAIRS, type BrandFontPair, brandFontPair } from '../../shared/brandFontPairs'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE BILDSPRACHE — EINE Rechnung für vier Abschnitte (Brand Design D6,
 * Konzept §2.6).
 *
 * ── WARUM ES DIESE STELLE GIBT ───────────────────────────────────────────
 * Prinzip, Illustration und Icons stehen untereinander in EINER Bühne, und das
 * Do & Don't darunter folgt AUS ALLEN DREIEN: ein anderes Prinzip oben ändert
 * vier der sechs Zeilen, eine andere Icon-Wahl die letzte. Jede Komponente,
 * die das selbst ausrechnete, wäre eine zweite Meinung über dieselbe Marke —
 * dieselbe Begründung wie bei `useBrandColorWorld` (D3), `useBrandTypeWorld`
 * (D4) und `useBrandMarkWorld` (D5).
 *
 * ── SIE HÄLT KEINEN ZUSTAND UND SCHREIBT NICHTS ──────────────────────────
 * Alles ist aus dem STORE gerechnet; geschrieben wird von der SEITE
 * (`setSlotValue` + Autosave). Ein zweiter Autosave-Lauf neben dem der Seite
 * wäre ein zweiter Schreiber auf dieselbe `revision`.
 *
 * ── ZWEI KAPITEL LIEFERN ZU (`BRAND_STAGE_SOURCE_SLOTS.imagery`) ─────────
 * Die Farbwelt (`h.*`) malt die drei abstrahierten Kompositionen — ohne sie
 * stünden dort drei Skizzen in der Notfarbe. Das Schriftpaar (`i.pair`)
 * entscheidet die Spanne der Strichstärke. `g.mix` belegt alle drei Wahlen vor,
 * `result.direction` trägt wie überall nur den Rückfall der Farbwelt.
 *
 * ── KEIN SCENE-BLOCK ─────────────────────────────────────────────────────
 * D4 und D5 enden mit `BwDesignScene`. Hier nicht: die Szene zeigt Schrift und
 * Farbe, und beides ist in diesem Kapitel längst entschieden — sie wäre eine
 * Wiederholung ohne eine einzige Aussage über die Bildsprache. Was diese
 * Entscheidungen sichtbar macht, sind die Karten selbst.
 */
export function useBrandImageryWorld() {
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

  // ── Das Schriftpaar aus `type` — sonst der Vorschlag von D4 ─────────────
  const pairId = computed(() => {
    const stored = (store.sourceValues['i.pair'] ?? '').trim()
    return brandFontPair(stored) ? stored : brandTypeDefaults(dna.value).pair
  })
  const pair = computed<BrandFontPair>(() => brandFontPair(pairId.value) ?? BRAND_FONT_PAIRS[0]!)

  // ── Die vier Sessions ───────────────────────────────────────────────────

  /** Die Vorbelegung aus der DNA — sie trägt in der Bühne den Vorschlags-Chip. */
  const defaults = computed(() => brandImageryDefaults(dna.value))

  /**
   * DAS PRINZIP kommt aus dem SLOT-WERT zurück, nicht aus einem eigenen
   * Zustand: `k.photo` ist der einzige Ort, an dem es steht (es gibt keinen
   * Slot mit der blossen Id). Lässt sich der Wert nicht lesen — leer, von Hand
   * verändert —, gilt der Vorschlag der DNA.
   */
  const principleId = computed(() =>
    parseBrandImageryPrincipleSlotValue(store.slotValue('k.photo')) ?? defaults.value.principle)

  const illustrationId = computed(() => {
    const stored = store.slotValue('k.illustration').trim()
    return isBrandIllustrationOption(stored) ? stored : defaults.value.illustration
  })

  const iconsId = computed(() => {
    const stored = store.slotValue('k.icons').trim()
    return isBrandIconOption(stored) ? stored : defaults.value.icons
  })

  /** Passt die Strichstärke zur Textschrift? Eine Auskunft, kein Tor (D6). */
  const strokeVerdict = computed(() => brandIconStrokeVerdict(pairId.value, iconsId.value))

  const dodont = computed<BrandImageryDoDont[]>(() =>
    brandImageryDoDont(principleId.value, illustrationId.value, iconsId.value, contentLocale.value))

  /**
   * DER WERT EINER PRINZIP-KARTE — fünf Blöcke, nicht die blosse Id.
   *
   * `k.photo` hält den ganzen Satz an die Fotografin; eine Karte, die nur
   * `closeup` schickte, schriebe einen Wert, den `parseBrandImageryPrinciple
   * SlotValue()` nicht wiedererkennt — die Wahl fiele beim nächsten Rendern
   * still auf den DNA-Vorschlag zurück, und der Autosave überschriebe sie mit
   * genau dem. Am eigenen Klick gefunden: die Karte liess sich anklicken und
   * nichts bewegte sich. Dasselbe Muster wie `rulesSlotValue` in D4.
   */
  function principleSlotValue(id: string): string {
    return brandImageryPrincipleSlotValue(id, contentLocale.value)
  }

  /**
   * DIE WERTE, DIE IN DIE SLOTS GEHÖREN — alle vier.
   *
   * Anders als in D5 (wo `j.brief` aus einem Lauf kommt) rechnet dieses Kapitel
   * JEDEN seiner Werte: es gibt hier keinen Modell-Text, den ein Autosave
   * überschreiben könnte (§1.4, „Regeln statt Bilder").
   */
  const slotValues = computed<Record<string, string>>(() => ({
    'k.photo': brandImageryPrincipleSlotValue(principleId.value, contentLocale.value),
    'k.illustration': illustrationId.value,
    'k.icons': iconsId.value,
    'k.dodont': brandImageryDoDontSlotValue(dodont.value),
  }))

  return {
    contentLocale,
    dna,
    colors,
    pairId,
    pair,
    defaults,
    principleId,
    illustrationId,
    iconsId,
    strokeVerdict,
    dodont,
    principleSlotValue,
    slotValues,
  }
}
