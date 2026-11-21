<script setup lang="ts">
import { computed } from 'vue'
import { BRAND_ADVISORS, type BrandAdvisor, advisorIsVoice } from '../../shared/brandAdvisors'

/**
 * DER STECKBRIEF DER STIMME — der Avatar im Gespräch öffnet ihn (Runde 20).
 *
 * Aus der Werkstatt-Seite geschnitten (WS1, Kapitel „Modale"). WER spricht,
 * entscheidet die Seite an EINER Stelle (`voice`, George oder Frida) und
 * reicht die Stimme herein; der Steckbrief zeigt sie nur. Offen/zu hält die
 * Seite (`v-model:open`).
 */
const props = defineProps<{
  voice: BrandAdvisor
  /** Die Rolle der Stimme — dieselbe Zeile wie in der Kopfzeile des Gesprächs. */
  role: string
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()

/**
 * Das Team im Steckbrief — alle, die NICHT selbst sprechen, in
 * Registry-Reihenfolge.
 *
 * `advisorIsVoice` statt `key !== voice.key` (Brand Design D0): seit Frida
 * gibt es eine zweite Stimme, und ein Vergleich gegen George allein hätte sie
 * hier als „Kollegin hinter George" gelistet — sie ist aber die Beraterin von
 * Schicht 2, nicht seine Technik-Geberin.
 */
const team = computed(() => BRAND_ADVISORS
  .filter(member => !advisorIsVoice(member.key))
  .map(member => ({
    key: member.key,
    line: `${member.fullName} — ${t(`brand.advisors.${member.key}.role`)} · ${t(`brand.advisors.${member.key}.focus`)}`,
  })))
</script>

<template>
  <UModal v-model:open="open" :title="props.voice.fullName">
    <template #content>
      <div class="bw-root bw-overlay max-h-[85vh] overflow-y-auto p-7">
        <div class="flex items-center gap-3">
          <BwGeorgeAvatar :src="props.voice.avatar" :initial="props.voice.name.slice(0, 1)" :alt="props.voice.name" />
          <span class="min-w-0 leading-tight">
            <span class="block text-base font-medium">{{ props.voice.fullName }}</span>
            <span class="bw-label block" style="color: var(--bw-muted)">{{ props.role }}</span>
          </span>
          <UButton
            size="xs" color="neutral" variant="ghost" class="ml-auto rounded-full"
            icon="i-ph-x" :aria-label="t('brand.common.close')" @click="open = false"
          />
        </div>
        <p class="bw-doc-text mt-4">{{ t('brand.workspace.advisorInfo.desc') }}</p>
        <ul class="mt-2 space-y-1">
          <li
            v-for="member in team" :key="member.key"
            class="flex gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
          >
            <span class="flex-none" style="color: var(--bw-line-strong)">—</span>{{ member.line }}
          </li>
        </ul>
        <p class="bw-label mt-4" style="color: var(--bw-muted)">{{ t('brand.workspace.advisorInfo.asksTitle') }}</p>
        <p class="mt-1 text-sm italic">{{ t('brand.workspace.advisorInfo.asks') }}</p>
        <p class="bw-label mt-4 leading-relaxed" style="color: var(--bw-muted)">
          {{ t('brand.workspace.advisorInfo.personal') }}
        </p>
      </div>
    </template>
  </UModal>
</template>
