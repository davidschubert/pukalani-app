import { createCatalogLater } from '../utils/i18nCatalogLater'

/**
 * TEXTKATALOG NACH DEM START (TK1) — Verdrahtung der Weiche aus
 * `utils/i18nCatalogLater.ts`. Voraussetzung: `i18n.experimental.preload`
 * und `stripMessagesPayload` in `packages/core/nuxt.config.ts` (die Seite
 * bringt ihre benutzten Texte mit).
 *
 * Warum über den Hook `i18n:beforeLocaleSwitch`: das Modul ruft ihn in
 * `loadAndSetLocale` direkt VOR `loadMessages` — auch beim ersten Mal, aus
 * seinem eigenen Plugin heraus, das vor den Plugins der Layer läuft. Der Hook
 * ist der früheste Punkt, an dem der Kontext (`nuxtApp._nuxtI18n`) steht und
 * der erste Abruf noch nicht begonnen hat. `_nuxtI18n` ist nicht öffentlich:
 * fehlt er oder sein `loadMessages`, bleibt alles wie vorher (Katalog vor dem
 * Start) — Wächter: `packages/core/tests/i18nCatalogLater.test.ts`.
 *
 * SOLANGE DER KATALOG AUSSTEHT, steht für einen fehlenden Text eine LEERE
 * Stelle statt des rohen Schlüssels, und der Katalog wird sofort geholt; die
 * Stelle füllt sich, sobald er da ist (die Texte sind reaktiv). Danach gilt
 * wieder der vorige Umgang mit fehlenden Texten.
 */
interface I18nContextLike {
  loadMessages: (locale: string) => Promise<void>
  preloaded: boolean
}

export default defineNuxtPlugin({
  name: 'core:i18n-catalog-later',
  enforce: 'pre',
  setup(nuxtApp) {
    let wired = false
    nuxtApp.hook('i18n:beforeLocaleSwitch', () => {
      if (wired) return
      wired = true
      const ctx = (nuxtApp as unknown as { _nuxtI18n?: I18nContextLike })._nuxtI18n
      if (!ctx || typeof ctx.loadMessages !== 'function') return
      const i18n = nuxtApp.$i18n
      const original = ctx.loadMessages.bind(ctx)
      const previousMissing = i18n.getMissingHandler()

      const later = createCatalogLater({
        load: async (locale) => {
          try {
            await original(locale)
          }
          finally {
            // `finally` des Abrufs läuft vor dem Austragen in der Weiche —
            // erst im nächsten Schritt nachsehen, ob noch etwas aussteht.
            queueMicrotask(() => {
              if (!i18n.availableLocales.some(l => later.isPending(l))) {
                i18n.setMissingHandler(previousMissing)
              }
            })
          }
        },
        isHydrating: () => nuxtApp.isHydrating === true,
        hasPagePart: locale =>
          ctx.preloaded && Object.keys(i18n.getLocaleMessage(locale) ?? {}).length > 0,
        whenIdle: run => onNuxtReady(run),
      })

      ctx.loadMessages = later.loader
      i18n.setMissingHandler((locale, key, instance, type) => {
        if (later.isPending(locale)) {
          if (import.meta.dev) {
            console.warn(`[i18n] Text „${key}“ (${locale}) stand nicht in der Seite — Katalog wird sofort geholt.`)
          }
          void later.loadNow(locale)
          return ''
        }
        return previousMissing ? previousMissing(locale, key, instance, type) : undefined
      })
    })
  },
})
