import { PAGE_CACHE_HEADER } from '../../shared/pageCache'
import { pageCacheRemember, pageCacheWillStore } from '../utils/pageCache'

/**
 * SEITEN KURZ FERTIG HALTEN (Q22, R3) — ablegen. `render:response` stempelt
 * `x-page-cache: MISS` auf eine Seite, die gehalten werden DARF;
 * `afterResponse` legt sie erst ab, wenn alle Kopfzeilen feststehen (sonst
 * fehlten die, die andere Haken nach diesem setzen). Ohne Schlüssel aus der
 * Middleware (Schalter aus, fremder Cookie, Abfrage-Parameter …) tun beide
 * Haken nichts.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    if (!pageCacheWillStore(event, response.statusCode)) return
    response.headers = { ...response.headers, [PAGE_CACHE_HEADER]: 'MISS' }
  })
  nitroApp.hooks.hook('afterResponse', (event, response) => {
    pageCacheRemember(event, response?.body)
  })
})
