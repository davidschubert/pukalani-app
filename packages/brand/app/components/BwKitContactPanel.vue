<script setup lang="ts">
import {
  type BrandPressContact,
  formatBrandPressContact,
  parseBrandPressContact,
} from '../../shared/brandKitSlots'
import type { BrandKitContactTemplate } from '../../shared/types/brandKit'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DER PRESSE-KONTAKT (`p.contact`, Konzept docs/plans/BRAND-BOOK-KIT.md §2.4
 * und §2.20 Nr. 3, Paket K5) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/kit/presskit.vue`).
 *
 * ── DIE VORLAGE FÜLLT VOR, GESPEICHERT WIRD DER BESTÄTIGTE TEXT ─────────
 * Davids Zuschnitt, wörtlich: „der Punkt soll ein Klick sein, wenn es
 * dieselben Daten sind" — mit der Leitplanke, dass ein VERWEIS auf die
 * Konto-Daten falsch wäre. Ein Konto kann den Besitzer wechseln, und das
 * Pressekit änderte sich dann still mit. Die Karte schreibt also in die
 * Felder, nicht in den Wert.
 *
 * ── KEINE TELEFONNUMMER ──────────────────────────────────────────────────
 * Die Erstgespräch-Anfrage trägt eine; sie kommt schon serverseitig nicht in
 * der Vorlage an (`BrandKitContactTemplate` hat das Feld nicht). Das
 * Anti-Muster der Session nennt genau diesen Fall: „a private mobile number
 * given because the field was there".
 *
 * ── DER REISE-SATZ STEHT VOR DER BESTÄTIGUNG ────────────────────────────
 * Session-Qualität: „They have seen, before confirming, that this line travels
 * publicly." Er steht deshalb ÜBER dem Knopf und nicht als Fussnote darunter.
 */
const props = withDefaults(defineProps<{
  templates?: readonly BrandKitContactTemplate[]
  pending?: boolean
  disabled?: boolean
  confirmed?: readonly string[]
}>(), { templates: () => [], pending: false, disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const locked = computed(() => props.disabled || props.confirmed.includes('p.contact'))

const stored = computed<BrandPressContact | null>(() =>
  parseBrandPressContact(store.slotValue('p.contact')))

/**
 * DER BEDIENZUSTAND DER DREI FELDER — er startet beim gespeicherten Wert und
 * wird von einer Vorlage überschrieben. Er ist NICHT der Wert: der entsteht
 * erst beim Übernehmen (s. o.).
 */
const form = ref<BrandPressContact>({
  name: stored.value?.name ?? '',
  role: stored.value?.role ?? '',
  email: stored.value?.email ?? '',
})

// Ein Wechsel der Marke oder ein Wert, der von woanders kommt (Korrektur,
// zweiter Tab), setzt die Felder nach — aber nur, solange hier nichts steht:
// sonst überschriebe ein Autosave-Echo den halb getippten Namen.
watch(stored, (next) => {
  if (!next) return
  if (form.value.name || form.value.role || form.value.email) return
  form.value = { ...next }
})

function useTemplate(template: BrandKitContactTemplate): void {
  if (locked.value) return
  form.value = { name: template.name, role: template.role, email: template.email }
}

const complete = computed(() => form.value.name.trim().length > 0 && form.value.email.trim().length > 0)

const taken = computed(() => {
  const current = stored.value
  return !!current
    && current.name === form.value.name.trim()
    && current.role === form.value.role.trim()
    && current.email === form.value.email.trim()
})

function applyContact(): void {
  if (locked.value || !complete.value) return
  emit('pick', 'p.contact', formatBrandPressContact({
    name: form.value.name.trim(),
    role: form.value.role.trim(),
    email: form.value.email.trim(),
  }, store.profile?.contentLocale ?? 'de'))
}
</script>

<template>
  <section data-brand-kit-contact class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.kit.contact.title') }}</h2>
      <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.contact.tag') }}</span>
    </div>
    <p class="bw-doc-text">{{ t('brand.kit.contact.intro') }}</p>

    <p v-if="pending && !templates.length" class="bw-pending">{{ t('brand.kit.contact.loading') }}</p>

    <div v-if="templates.length" class="grid gap-2 sm:grid-cols-2">
      <button
        v-for="template in templates" :key="template.id"
        type="button"
        class="bw-choice-card rounded-2xl p-3 text-left"
        :data-kit-contact-template="template.id"
        :disabled="locked"
        @click="useTemplate(template)"
      >
        <span class="block text-sm font-medium">{{ t(`brand.kit.contact.template.${template.id}`) }}</span>
        <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ [template.name, template.role, template.email].filter(Boolean).join(' · ') }}
        </span>
      </button>
    </div>
    <p class="bw-msg-help">{{ t('brand.kit.contact.template.manual') }}</p>

    <div class="grid gap-2 sm:grid-cols-3">
      <UInput
        v-model="form.name" size="sm" :disabled="locked"
        :placeholder="t('brand.kit.contact.field.name')"
        :aria-label="t('brand.kit.contact.field.name')"
        data-kit-contact-name
      />
      <UInput
        v-model="form.role" size="sm" :disabled="locked"
        :placeholder="t('brand.kit.contact.field.role')"
        :aria-label="t('brand.kit.contact.field.role')"
        data-kit-contact-role
      />
      <UInput
        v-model="form.email" size="sm" type="email" :disabled="locked"
        :placeholder="t('brand.kit.contact.field.email')"
        :aria-label="t('brand.kit.contact.field.email')"
        data-kit-contact-email
      />
    </div>

    <!-- VOR der Bestätigung, nicht darunter (s. Kopf). -->
    <p class="bw-doc-text" style="color: var(--bw-ink-soft)">{{ t('brand.kit.contact.public') }}</p>

    <div class="flex items-center gap-2">
      <UButton
        color="neutral" variant="ghost" class="bw-send rounded-full"
        :label="t('brand.kit.contact.apply')"
        :disabled="locked || !complete || taken"
        @click="applyContact"
      />
      <span v-if="taken" class="bw-label" style="color: var(--bw-muted)">
        {{ t('brand.kit.contact.applied') }}
      </span>
    </div>
  </section>
</template>
