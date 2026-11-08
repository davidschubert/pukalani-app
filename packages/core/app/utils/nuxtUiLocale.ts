import { de, en } from '@nuxt/ui/locale'
import type { Locale, Messages } from '@nuxt/ui'

// Nuxt UI hat eine EIGENE Sprache (`useLocale()` — Texte wie „Schließen",
// Kalender, Paginierung, Datumsformat in UChangelogVersion). Sie kommt NUR über
// `<UApp :locale>` herein; ohne die Angabe ist sie Englisch, egal was
// @nuxtjs/i18n sagt. Vor dem 2026-11-08 setzte keine App sie — auf
// /de/changelog stand „Oct 27, 2026" (CL1). Diese Zuordnung ist die EINE
// Stelle; jede `app.vue` und CoreErrorPage holen sie über `useNuxtUiLocale()`
// (Wächter: tests/nuxtUiLocale.test.ts).
//
// Nur die Sprachen, die core in `i18n.locales` führt, sind eingebunden —
// `import * from '@nuxt/ui/locale'` zöge alle ~50 Sprachpakete ins Bundle.
// Eine unbekannte Sprache fällt auf Englisch zurück (wie Nuxt UI selbst).
const NUXT_UI_LOCALES: Record<string, Locale<Messages>> = { de, en }

export function nuxtUiLocaleFor(code: string | undefined): Locale<Messages> {
  return (code && NUXT_UI_LOCALES[code]) || en
}
