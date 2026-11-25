/**
 * `<i18n-t keypath>` MELDET SEINEN SCHLÜSSEL (TK1).
 *
 * Mit `stripMessagesPayload` legt @nuxtjs/i18n nur die Texte in die Seite, die
 * der Server über `t`/`te`/`tm` angefasst hat. `<i18n-t>` geht an diesen drei
 * vorbei (vue-i18n ruft dafür eine interne Funktion hinter dem Symbol
 * `__translateVNode`) — ohne diesen Nachtrag fehlte sein Text beim Start im
 * Browser, bis der volle Katalog nachkommt. Gibt es das Symbol nicht (neue
 * vue-i18n-Fassung), bleibt es still beim alten Stand; der Wächter
 * `packages/core/tests/i18nCatalogLater.test.ts` meldet das vorher.
 */
interface TrackingContext {
  trackKey?: (key: string, locale: string) => void
}

const TRANSLATE_VNODE_SYMBOL_NAME = '__translateVNode'

export default defineNuxtPlugin({
  name: 'core:i18n-track-keypath',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const event = useRequestEvent(nuxtApp)
    const tracking = event?.context?.nuxtI18n as TrackingContext | undefined
    if (!tracking?.trackKey) return
    const composer = nuxtApp.$i18n as unknown as Record<symbol, unknown>
    const symbol = Object.getOwnPropertySymbols(composer).find(s => s.description === TRANSLATE_VNODE_SYMBOL_NAME)
    if (!symbol) return
    const original = composer[symbol]
    if (typeof original !== 'function') return
    composer[symbol] = (...args: unknown[]) => {
      const key = args[0]
      const options = args[2] as { locale?: unknown } | undefined
      if (typeof key === 'string') {
        const locale = typeof options?.locale === 'string' ? options.locale : nuxtApp.$i18n.locale.value
        tracking.trackKey?.(key, locale)
      }
      return (original as (...a: unknown[]) => unknown)(...args)
    }
  },
})
