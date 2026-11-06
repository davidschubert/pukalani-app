<script setup lang="ts">
import { formatBrandPressFacts, parseBrandPressFacts } from '../../shared/brandKitSlots'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE FAKTEN-FREIGABE (`p.facts`, Konzept docs/plans/BRAND-BOOK-KIT.md §2.4,
 * Paket K5) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/kit/presskit.vue`).
 *
 * ── DIE EINE AUSNAHME DER REISE-REGEL, UND WARUM SIE KEINE IST ───────────
 * `a.facts` ist `internal` und bleibt es. Was hier entsteht, ist ein NEUER,
 * öffentlicher Wert: eine AUSWAHL, die ein Mensch Eintrag für Eintrag
 * freigegeben hat. Voreinstellung ist deshalb: KEINER angehakt — nichts
 * reist, bevor es jemand gesagt hat.
 *
 * ── GESPEICHERT WIRD DER TEXT, NICHT DER INDEX ───────────────────────────
 * Ein Index zeigte auf eine Zeile in `a.facts`, und die reist nie: das
 * Pressekit wäre dann ein Verweis auf etwas, das kein Leser sehen darf — und
 * eine später ergänzte Zeile verschöbe still die Freigabe von Fakt 2 auf
 * Fakt 3.
 *
 * ── DIE LISTE KOMMT ÜBER EINEN EIGENTÜMER-PFAD ───────────────────────────
 * `a.facts` liegt in einem fremden Baustein UND ist intern; der Store der
 * Werkstatt hat sie nicht und darf sie nicht haben. Sie kommt aus der einen
 * Werkstatt-Route (`private, no-store`) und wird hier nur angezeigt.
 */
const props = withDefaults(defineProps<{
  /** Die Einträge von `a.facts` — leer heisst „es gibt keine". */
  facts?: readonly string[]
  pending?: boolean
  disabled?: boolean
  confirmed?: readonly string[]
}>(), { facts: () => [], pending: false, disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const locked = computed(() => props.disabled || props.confirmed.includes('p.facts'))

/** Die freigegebenen TEXTE — sie stehen als Wert, nicht als Verweis. */
const released = computed(() => parseBrandPressFacts(store.slotValue('p.facts')))

function toggleFact(fact: string): void {
  if (locked.value) return
  const current = released.value
  const next = current.includes(fact)
    ? current.filter(entry => entry !== fact)
    : [...current, fact]
  // Reihenfolge der QUELLE, nicht die der Klicks — der Wert soll sich nicht
  // ändern, nur weil jemand zweimal auf dasselbe geklickt hat.
  const ordered = props.facts.filter(entry => next.includes(entry))
  emit('pick', 'p.facts', formatBrandPressFacts([...ordered]))
}
</script>

<template>
  <section data-brand-kit-facts class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.kit.facts.title') }}</h2>
      <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.facts.tag') }}</span>
    </div>
    <p class="bw-doc-text">{{ t('brand.kit.facts.intro') }}</p>

    <p v-if="pending && !facts.length" class="bw-pending">{{ t('brand.kit.facts.loading') }}</p>
    <p v-else-if="!facts.length" class="bw-pending">{{ t('brand.kit.facts.empty') }}</p>

    <div v-else class="flex flex-col items-stretch gap-2">
      <button
        v-for="(fact, index) in facts" :key="index"
        type="button"
        class="bw-chip text-left"
        :class="released.includes(fact) ? 'bw-chip--selected' : ''"
        :data-kit-fact="index"
        :aria-pressed="released.includes(fact)"
        :disabled="locked"
        @click="toggleFact(fact)"
      >
        {{ fact }}
      </button>
    </div>

    <p class="bw-msg-help">{{ t('brand.kit.facts.hint') }}</p>
  </section>
</template>
