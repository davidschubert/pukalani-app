<script setup lang="ts">
import { brandSlotValueView } from '../../shared/brandSlotFormat'
import { slotById } from '../../shared/slotRegistry'

/**
 * EIN SLOT-WERT, WIE EIN MENSCH IHN LIEST (Dritter Testlauf, Befund 1,
 * 2026-09-10).
 *
 * ── DER BEFUND, IN EINEM ABSATZ ───────────────────────────────────────────
 * Der zusammengelegte Wert der Sammel-Session „Zahlen & Fakten" ist ein
 * `structured`-Wert — beschriftete Blöcke, deren Form `brandSlotFormat.ts`
 * festlegt. In der Entwurfskarte der Bühne UND in der Karte des Notizblocks
 * stand er WÖRTLICH so, wie er gespeichert ist: „## Team / Nur ich / ## Seit /
 * 2021 / ## Märkte / …". Beide Stellen rendern den rohen Text in ein
 * `whitespace-pre-wrap`, und Markdown gibt es in der Werkstatt bewusst nicht
 * (`richtext` ist genau EIN Slot, und der läuft über `MarkdownContent`). Der
 * Mensch sah also die Speicherform seiner eigenen Antwort.
 *
 * ── WARUM EINE KOMPONENTE UND NICHT DREI ZWEIGE IM MARKUP ────────────────
 * Weil es dieselbe Ansicht an DREI Stellen ist (Entwurfs-Modul,
 * Bestätigungs-Modul, Log-Karte) — und an einer vierten, die es schon gibt:
 * `BwSessionBlock` (Abnahme und Dokument) rendert seit Paket 7 genau diese
 * drei Formen. Ein vierter, fünfter und sechster Zweig im Markup wären drei
 * Gelegenheiten, die Liste beim nächsten Format-Schritt zu vergessen.
 *
 * ── SIE RECHNET NICHT, SIE LIEST ─────────────────────────────────────────
 * Die Form kommt aus `brandSlotValueView` (pur, `shared/`), die Art aus der
 * Registry. FAIL-SOFT ist dort begründet: ein formfremder Wert — von Hand
 * nachgebessert, aus der Zeit vor der Regel — gilt als freier Text und steht
 * wörtlich da, statt als leere Liste zu behaupten, es sei nichts gesagt worden.
 *
 * Der `value` ist die LESE-Fassung: eine geschlossene Auswahl kommt hier schon
 * als Name an (`brandChoiceDisplayLabel` in der Aufrufstelle), nie als Id.
 */
const props = defineProps<{
  /** Die Session, deren Art die Form entscheidet. */
  slotId: string
  /** Der Wert in seiner LESE-Fassung (Auswahl-Ids sind schon aufgelöst). */
  value: string
  /** Schriftgrösse der Zeilen — der Notizblock ist enger als die Bühne. */
  size?: 'sm' | 'md'
}>()

const view = computed(() => brandSlotValueView(
  slotById(props.slotId)?.schema.kind ?? 'text',
  props.value,
))

const textStyle = computed(() => (props.size === 'sm'
  ? 'font-size: 0.875rem; line-height: 1.5'
  : ''))
</script>

<template>
  <ul v-if="view.kind === 'list'" class="space-y-1">
    <li
      v-for="(item, index) in view.items" :key="index"
      class="bw-doc-text flex gap-2" :style="textStyle"
    >
      <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ item }}
    </li>
  </ul>
  <div v-else-if="view.kind === 'blocks'" class="space-y-3">
    <div v-for="(block, index) in view.blocks" :key="index">
      <p class="bw-label" style="color: var(--bw-ink-soft)">{{ block.label }}</p>
      <p class="bw-doc-text mt-0.5 whitespace-pre-wrap" :style="textStyle">{{ block.body }}</p>
    </div>
  </div>
  <p v-else class="bw-doc-text whitespace-pre-wrap" :style="textStyle">{{ view.text }}</p>
</template>
