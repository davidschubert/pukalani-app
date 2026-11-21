<script setup lang="ts">
import { brandFamilyLinks, type BrandFamilyKey } from '../../../shared/brandFamily'

/**
 * Die ruhige Zeile in der Fußzeile, mit der Pukalani, Pukalani Studio und
 * Branding Supply aufeinander zeigen (Q24, R9). Farbe und Größe stellt die
 * Fußzeile über `class`/`style` — jede Site hat ihre eigene Farbwelt, der
 * Baustein bringt keine mit. Normale Links: kein `nofollow`, kein neues
 * Fenster.
 */
const props = defineProps<{ current: BrandFamilyKey }>()

const { t, locale } = useI18n()

const ROLE_KEYS: Record<BrandFamilyKey, string> = {
  pukalani: 'ui.brandFamily.roles.pukalani',
  studio: 'ui.brandFamily.roles.studio',
  branding: 'ui.brandFamily.roles.branding',
}

const links = computed(() => brandFamilyLinks(props.current, locale.value))
</script>

<template>
  <nav :aria-label="t('ui.brandFamily.aria')" :data-brand-family="current">
    <span>{{ t('ui.brandFamily.label') }}</span>
    <template v-for="(link, index) in links" :key="link.key">
      <span v-if="index > 0" aria-hidden="true"> ·</span>
      {{ ' ' }}<a :href="link.href" class="underline-offset-2 hover:underline" :data-brand-link="link.key">{{ link.name }}</a>
      <span class="opacity-75"> – {{ t(ROLE_KEYS[link.key]) }}</span>
    </template>
  </nav>
</template>
