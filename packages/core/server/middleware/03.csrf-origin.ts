import { csrfOriginVerdict } from '../utils/csrfOrigin'
import { isCsrfOriginExempt } from '../../shared/csrfOriginExempt'

/**
 * HERKUNFTSPRÜFUNG für unsichere Methoden (POST/PUT/PATCH/DELETE) auf /api/*.
 *
 * Regel in einem Satz: eine fremde Seite darf hier nichts Schreibendes
 * auslösen — `cross-site` wird abgelehnt, `same-site` (und ein fehlender
 * `Sec-Fetch-Site` MIT `Origin`) nur durchgelassen, wenn der Origin-Host samt
 * Port dem Request-Host gleicht. Die ENTSCHEIDUNG ist pure und steht mit ihrer
 * Begründung in server/utils/csrfOrigin.ts; hier stehen nur Methode, Pfad,
 * Ausnahmen und das Auslesen der Kopfzeilen.
 *
 * ÜBERALL AN, KEIN SCHALTER (SEC-004, Stufe 2): alle Hosts unter
 * `*.pukalani.app` sind same-site zueinander, `SameSite=Lax` an den
 * Session-Cookies trennt sie also nicht. Die Prüfung gilt deshalb in JEDER
 * App, die den Core erweitert, und liest keine App-Config (früher
 * `pukalani.security.csrfOriginCheck`; Wächter gegen die Rückkehr eines
 * Aus-Schalters: tests/csrf-origin-routes.test.ts, Teil B).
 *
 * AUSNAHMEN NUR ÜBER DIE LISTE: einzelne Routen mit Grund in
 * `shared/csrfOriginExempt.ts` (`CSRF_ORIGIN_EXEMPT_ROUTES`, heute leer) —
 * kein Schalter je App. Server, Webhooks und Daemons brauchen keine: sie
 * tragen weder `Origin` noch `Sec-Fetch-Site` und passieren die Regel.
 *
 * SSR-FALLE: beim Server-Rendern reicht Nuxt die Kopfzeilen der Navigation an
 * interne `$fetch`-Aufrufe weiter, auch `sec-fetch-site`. Ein schreibender
 * Aufruf beim Rendern wird deshalb abgelehnt, sobald die Seite über einen
 * fremden Link geöffnet wurde. Schreibende Aufrufe gehören in den Browser
 * (`server: false`, `onMounted`, Handler) — Wächter:
 * tests/ssr-write-fetch.test.ts.
 */
export default defineEventHandler((event) => {
  const method = event.method
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return

  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return
  if (isCsrfOriginExempt(method, url.pathname)) return

  const verdict = csrfOriginVerdict({
    secFetchSite: getHeader(event, 'sec-fetch-site'),
    origin: getHeader(event, 'origin'),
    host: url.host,
  })
  if (verdict === 'reject') {
    throw createError({ status: 403, statusText: 'Cross-site request rejected' })
  }
})
