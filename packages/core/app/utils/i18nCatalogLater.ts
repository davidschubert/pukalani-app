/**
 * DER VOLLE TEXTKATALOG KOMMT NACH DEM START, NICHT DAVOR (TK1, Rest von PERF-006).
 *
 * Mit `experimental.preload` + `stripMessagesPayload` legt @nuxtjs/i18n die
 * Texte, die der Server beim Rendern benutzt hat, in die Seite. Der Browser
 * holt in 10.6 trotzdem VOR der Hydration den ganzen Katalog seiner Sprache
 * (branding.supply 102 KB gepackt) — `loadMessages` merkt sich die
 * eingebetteten Texte nicht. Diese Weiche lässt genau diesen einen Abruf
 * während der Hydration aus und holt den Katalog, sobald die Seite steht
 * (`whenIdle`), oder sofort, wenn vorher ein Text fehlt.
 *
 * Rein und ohne Nuxt, damit der Test die Fälle durchspielen kann; die
 * Verdrahtung steht in `plugins/i18n-catalog-later.client.ts`.
 */
export interface CatalogLaterOptions {
  /** der echte Lader des Moduls (holt den vollen Katalog einer Sprache) */
  load: (locale: string) => Promise<void>
  /** läuft gerade die Hydration der ersten Seite? */
  isHydrating: () => boolean
  /** hat der Server für diese Sprache Texte in die Seite gelegt? */
  hasPagePart: (locale: string) => boolean
  /** führt den Nachlader aus, sobald die Seite steht */
  whenIdle: (run: () => void) => void
}

export interface CatalogLater {
  /** Ersatz für `loadMessages` des Moduls */
  loader: (locale: string) => Promise<void>
  /** fehlt der volle Katalog dieser Sprache noch (wartend oder unterwegs)? */
  isPending: (locale: string) => boolean
  /** jetzt holen (z. B. weil ein Text fehlt); teilt einen laufenden Abruf */
  loadNow: (locale: string) => Promise<void>
}

export function createCatalogLater(options: CatalogLaterOptions): CatalogLater {
  /** Sprachen, deren voller Katalog noch aussteht → laufender Abruf oder null */
  const pending = new Map<string, Promise<void> | null>()

  const loadNow = (locale: string): Promise<void> => {
    if (!pending.has(locale)) return options.load(locale)
    const running = pending.get(locale)
    if (running) return running
    const started = options.load(locale).finally(() => pending.delete(locale))
    pending.set(locale, started)
    return started
  }

  const loader = async (locale: string): Promise<void> => {
    if (options.isHydrating() && options.hasPagePart(locale)) {
      // Zweiter Aufruf während derselben Hydration (Plugin, dann die
      // Middleware der ersten Route) ⇒ ebenfalls auslassen.
      if (!pending.has(locale)) {
        pending.set(locale, null)
        options.whenIdle(() => {
          void loadNow(locale)
        })
      }
      return
    }
    return loadNow(locale)
  }

  return { loader, isPending: locale => pending.has(locale), loadNow }
}
