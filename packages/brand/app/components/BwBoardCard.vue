<script setup lang="ts">
import type { BrandDnaBoard } from '../../shared/brandDesignDna'
import { brandSceneColors, brandSceneFonts } from '../../shared/brandDesignScene'

/**
 * EIN MOODBOARD ALS KARTE (`g.board`, Konzept docs/archiv/BRAND-DESIGN.md §2.2
 * Schritt 5, Paket D2c).
 *
 * ── SIE ZEIGT DIE WELT, STATT SIE ZU BESCHREIBEN ─────────────────────────
 * Dasselbe Muster wie `BwDirectionCard` (Paket G4) — mit einem Unterschied:
 * hier steht eine echte VORSCHAU-SZENE darin (`BwDesignScene`), keine drei
 * Swatches. Menschen können an Farbfeldern nicht entscheiden (H1, und der
 * Marktbefund zu Realtime Colors); alle drei Karten zeigen deshalb DIESELBE
 * Anwendung, damit man an der Sache vergleicht und nicht an drei Bildern.
 *
 * ── DIE SZENE STEHT AUF FESTEM HELL, UND DAS IST PFLICHT ─────────────────
 * Die Karte ist ein `<button>`. Eine Szene mit eigenem Hell/Dunkel-Umschalter
 * brächte einen zweiten Button hinein — ungültiges HTML, der Browser schliesst
 * beim Parsen den äusseren, und die Hydration findet einen anderen Baum vor
 * (am 2026-09-08 im Prototyp live erwischt). `scheme="light"` macht aus dem
 * Umschalter ein `<span>`; dunkel sieht man die Welt im Abschnitt „Euer Stand"
 * darunter, wo die Szene für sich steht.
 */
const props = defineProps<{
  board: BrandDnaBoard
  /** Der Name des Boards in der Sprache der Oberfläche. */
  name: string
  note: string
  /** Worin sich das Board vom Vorschlag unterscheidet — schon als Etiketten. */
  differences: readonly string[]
  selected?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ pick: [id: string] }>()

const { t } = useI18n()

/* Der Neutral-Ton kommt aus der Basisfarbe (getönt) — die Vorgabe, die das
 * Kapitel `color` später als `h.neutral` anbietet. */
const colors = computed(() => brandSceneColors(props.board.base, props.board.accent, props.board.base))
const fonts = computed(() => brandSceneFonts(props.board.fontPairId))
</script>

<template>
  <button
    type="button"
    class="bw-choice-card block w-full rounded-2xl p-3 text-left"
    :class="selected ? 'bw-choice-card--selected' : ''"
    :aria-pressed="selected"
    :disabled="disabled"
    @click="emit('pick', board.id)"
  >
    <!--
      DIE SZENE STEHT IM `button`, UND DAS BLEIBT SO (Audit-Befund
      2026-09-09).

      `BwDesignScene` rendert ein `div` mit `h3`/`p` darin, und Fluss-Inhalt in
      einem `button` verletzt das Content-Modell von HTML. Es ist ein
      VALIDITÄTS-Befund, kein Parser-Fall: anders als `<p><div>` schliesst der
      Browser hier nichts vorzeitig, der Baum bleibt der geschriebene.

      Die Alternative wäre ein `div role="button"` — und die kostet genau das,
      was die Karte braucht: Tastatur-Fokus, Leertaste/Enter, `:disabled`
      (statt `aria-disabled` plus eigenem Klick-Riegel) und das
      Fokus-Verhalten des Browsers. Alles davon müsste von Hand nachgebaut
      werden, damit ein Schachtelungs-Vorwurf verschwindet, den kein Nutzer
      merkt. DIE KARTE IST DER KLICK, die Szene ist ihre Anzeige — deshalb
      bleibt der `button` der Klick.
    -->
    <BwDesignScene compact scheme="light" :colors="colors" :fonts="fonts" />
    <span class="mt-3 flex items-start justify-between gap-2">
      <span class="text-sm font-medium">{{ name }}</span>
      <UIcon
        v-if="selected" name="i-ph-check-circle-fill"
        class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)"
      />
    </span>
    <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ note }}</span>
    <span class="bw-label mt-2 block" style="color: var(--bw-muted)">
      {{ differences.length
        ? t('brand.dna.board.differs', { dimensions: differences.join(' · ') })
        : t('brand.dna.board.same') }}
    </span>
  </button>
</template>
