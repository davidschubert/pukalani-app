<script setup lang="ts">
import { brandSlotValueView } from '../../shared/brandSlotFormat'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE PRESSEKIT-VORSCHAU (`p.summary`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.4, Paket K5) — gebaut nach dem freigegebenen
 * Prototyp (`.playground/app/pages/brand/demo/kit/presskit.vue`).
 *
 * ── HIER ENTSTEHT NICHTS, HIER WIRD ZUSAMMENGESTELLT ─────────────────────
 * Boilerplates, Tagline, freigegebene Fakten, Kontakt und die
 * Zeichen-Setzungen — alles bestätigte Werte, PUR gerechnet (§2.11: null
 * KI-Aufrufe). Ein fehlender Teil wird BENANNT und nicht gefüllt; den Satz
 * dafür setzt die Rechnung selbst (`brandPressSummaryMissing`), damit die
 * Ansicht nicht entscheidet, was fehlen darf.
 *
 * ABWEICHUNG VOM BRIEF, IM BAU ENTSCHIEDEN: eine eigene Komponente statt
 * eines Abschnitts in `BwKitFactsPanel` oder `BwKitContactPanel`. Die
 * Vorschau ist die dritte Session dieses Kapitels und liest die Werte der
 * beiden anderen — sie in eine von ihnen zu legen, hiesse, ein Kapitel-Ende
 * an einen Kapitel-Anfang zu hängen.
 *
 * ── „NUR LESEN", UND DER KNOPF SCHLIESST ────────────────────────────────
 * `editor: 'none'`. Übernommen wird auf Klick — nicht bei jedem Neuzeichnen,
 * sonst liefe der Autosave im Kreis, sobald sich ein Zeichen am Ergebnis
 * ändert.
 */
const props = withDefaults(defineProps<{
  /** Die gerechnete Vorschau als fertiger `structured`-Wert. */
  summary?: string
  pending?: boolean
  disabled?: boolean
  confirmed?: readonly string[]
}>(), { summary: '', pending: false, disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const locked = computed(() => props.disabled || props.confirmed.includes('p.summary'))

/** Der bestätigte Wert schlägt den Vorschlag — der Mensch liest SEINEN. */
const shown = computed(() => {
  const stored = store.slotValue('p.summary')
  const view = brandSlotValueView('structured', stored.trim() ? stored : props.summary)
  return view.kind === 'blocks' ? view.blocks : []
})

const taken = computed(() => store.slotValue('p.summary').trim() === props.summary.trim())

function applySummary(): void {
  if (locked.value || !props.summary) return
  emit('pick', 'p.summary', props.summary)
}
</script>

<template>
  <section data-brand-kit-summary class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.kit.summary.title') }}</h2>
      <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.summary.tag') }}</span>
    </div>
    <p class="bw-doc-text">{{ t('brand.kit.summary.intro') }}</p>

    <p v-if="pending && !shown.length" class="bw-pending">{{ t('brand.kit.summary.loading') }}</p>
    <p v-else-if="!shown.length" class="bw-pending">{{ t('brand.kit.summary.empty') }}</p>

    <dl v-else class="flex flex-col gap-3" data-kit-summary>
      <div v-for="block in shown" :key="block.label">
        <dt class="bw-label" style="color: var(--bw-muted)">{{ block.label }}</dt>
        <dd class="bw-doc-text mt-1 whitespace-pre-wrap">{{ block.body }}</dd>
      </div>
    </dl>

    <div v-if="summary" class="flex items-center gap-2">
      <UButton
        color="neutral" variant="ghost" class="bw-send rounded-full"
        :label="t('brand.kit.summary.apply')"
        :disabled="locked || taken"
        @click="applySummary"
      />
      <span v-if="taken" class="bw-label" style="color: var(--bw-muted)">
        {{ t('brand.kit.summary.applied') }}
      </span>
    </div>
  </section>
</template>
