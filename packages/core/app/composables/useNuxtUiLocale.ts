import { nuxtUiLocaleFor } from '../utils/nuxtUiLocale'

/**
 * Nuxt-UI-Sprache passend zur i18n-Sprache der Seite — für `<UApp :locale>`.
 * Reaktiv: ein Sprachwechsel ohne Reload zieht Nuxt UI mit.
 */
export function useNuxtUiLocale() {
  const { locale } = useI18n()
  return computed(() => nuxtUiLocaleFor(locale.value))
}
