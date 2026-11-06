<script setup lang="ts">
import { formatBrandPromptTemplates, parseBrandPromptTemplates } from '../../shared/brandKitSlots'
import type { BrandKitWorkshopPrompt } from '../../shared/types/brandKit'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE DREI PROMPT-VORLAGEN (`n.prompts`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.3, Paket K5) — gebaut nach dem freigegebenen
 * Prototyp (`.playground/app/pages/brand/demo/kit/aiguide.vue`).
 *
 * ── PUR: HIER LÄUFT KEIN MODELL (§2.11) ──────────────────────────────────
 * Die drei Vorlagen sind GERECHNET — aus den bestätigten Werten und den
 * Leitplanken darüber. Sie kommen fertig vom Server
 * (`/api/brand/profiles/:id/kit/workshop`), weil der System-Prompt die
 * Kurzform von `brand.md` IST und die ganze Foundation braucht; der Browser
 * kennt nur den offenen Baustein.
 *
 * ── DER KNOPF SCHREIBT, NICHT DER RENDERDURCHLAUF ────────────────────────
 * `n.prompts` ist `editor: 'none'` und trotzdem ein bestätigter Wert. Er wird
 * auf Klick übernommen und nicht bei jedem Neuzeichnen — sonst liefe der
 * Autosave im Kreis, sobald sich am Server-Ergebnis ein Zeichen ändert.
 *
 * ── KOPIEREN IST DER ZWECK, NICHT DIE ZUGABE ─────────────────────────────
 * Eine Vorlage wird in ein fremdes Fenster geklebt (ChatGPT, Claude, das
 * Redaktionssystem). Deshalb je Vorlage ein eigener Knopf und die
 * Zeilenumbrüche EXAKT so, wie sie gespeichert sind — dieselbe Regel wie beim
 * `brand.md`-Kopieren (K3).
 */
const props = withDefaults(defineProps<{
  /** Die gerechneten Vorlagen — leer, solange die Route noch lädt. */
  prompts?: readonly BrandKitWorkshopPrompt[]
  pending?: boolean
  disabled?: boolean
  confirmed?: readonly string[]
}>(), { prompts: () => [], pending: false, disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const locked = computed(() => props.disabled || props.confirmed.includes('n.prompts'))

/**
 * WAS GEZEIGT WIRD: der bestätigte Wert, wenn es ihn gibt — sonst der
 * Vorschlag. Ein Mensch, der eine Vorlage von Hand nachgeschärft hat, soll
 * SEINE lesen und nicht die gerechnete daneben.
 */
const stored = computed(() => parseBrandPromptTemplates(store.slotValue('n.prompts')))
const shown = computed<readonly BrandKitWorkshopPrompt[]>(() =>
  (stored.value.length > 0 ? stored.value : props.prompts))

const suggestion = computed(() => formatBrandPromptTemplates(props.prompts.map(entry => ({
  id: entry.id,
  title: entry.title,
  body: entry.body,
}))))

const taken = computed(() => store.slotValue('n.prompts').trim() === suggestion.value.trim())

function applyPrompts(): void {
  if (locked.value || !suggestion.value) return
  emit('pick', 'n.prompts', suggestion.value)
}

/** Welche Vorlage gerade kopiert wurde — reiner Bedienzustand. */
const copied = ref<string>('')

async function copyPrompt(id: string, body: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(body)
    copied.value = id
    setTimeout(() => { if (copied.value === id) copied.value = '' }, 2000)
  }
  catch {
    // Kein Zwischenspeicher (Berechtigung, alter Browser) ⇒ der Text steht
    // sichtbar da und kann von Hand markiert werden. Eine Fehlermeldung wäre
    // hier lauter als das Problem.
  }
}
</script>

<template>
  <section data-brand-kit-prompts class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.kit.prompts.title') }}</h2>
      <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.prompts.tag') }}</span>
    </div>
    <p class="bw-doc-text">{{ t('brand.kit.prompts.intro') }}</p>

    <p v-if="pending && !shown.length" class="bw-pending">{{ t('brand.kit.prompts.loading') }}</p>
    <p v-else-if="!shown.length" class="bw-pending">{{ t('brand.kit.prompts.empty') }}</p>

    <div v-for="entry in shown" :key="entry.id || entry.title" class="rounded-2xl p-3 bw-choice-card">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-sm font-medium">{{ entry.title }}</span>
        <UButton
          color="neutral" variant="ghost" size="xs" class="ms-auto rounded-full"
          :label="copied === entry.id ? t('brand.kit.prompts.copied') : t('brand.kit.prompts.copy')"
          @click="copyPrompt(entry.id, entry.body)"
        />
      </div>
      <pre class="bw-doc-text mt-2 overflow-x-auto whitespace-pre-wrap text-sm">{{ entry.body }}</pre>
    </div>

    <div v-if="suggestion" class="flex items-center gap-2">
      <UButton
        color="neutral" variant="ghost" class="bw-send rounded-full"
        :label="t('brand.kit.prompts.apply')"
        :disabled="locked || taken"
        @click="applyPrompts"
      />
      <span v-if="taken" class="bw-label" style="color: var(--bw-muted)">
        {{ t('brand.kit.prompts.applied') }}
      </span>
    </div>
  </section>
</template>
