/**
 * KEIN REFERRER VON DEN ZWEI TOKEN-SEITEN DES NEWSLETTERS (SEC-006).
 *
 * `/newsletter/confirm?token=…` und `/newsletter/unsubscribe?token=…` tragen
 * den Token aus der Mail in der ADRESSE. Der Core setzt für alle Antworten
 * `referrer-policy: strict-origin-when-cross-origin` — das schickt bei einem
 * Klick auf eine fremde Seite nur den Origin, innerhalb der eigenen Seite
 * aber die VOLLE Adresse samt Token (in Protokolle, an Analytics). Hier also
 * `no-referrer`, wie auf der Share-Seite der Brand Foundation
 * (`brand/server/middleware/10.brand-share-headers.ts`).
 *
 * Diese Middleware läuft NACH dem `request`-Haken des Core
 * (`core/server/plugins/security-headers.ts`) und gewinnt deshalb; der
 * Render-Haken übernimmt, was am Event steht.
 *
 * Der Token wird nicht gelesen — nur der Pfad davor zählt.
 */

/** Locale-Präfix (de, en-US, …) abstreifen — i18n prefix_except_default. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, '')
}

const TOKEN_PAGES = new Set(['/newsletter/confirm', '/newsletter/unsubscribe'])

/** Pur und exportiert, damit der Test die Pfad-Regel ohne Nitro prüft. */
export function isNewsletterTokenPage(path: string): boolean {
  const pathname = stripLocale(path.split('?')[0] ?? '').replace(/\/+$/, '')
  return TOKEN_PAGES.has(pathname)
}

export default defineEventHandler((event) => {
  if (!isNewsletterTokenPage(event.path)) return
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
})
