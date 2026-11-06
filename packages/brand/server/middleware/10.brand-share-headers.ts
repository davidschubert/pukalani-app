/**
 * DIE KÖPFE DER GETEILTEN SEITE (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.8, Paket G3).
 *
 * Die API-Antwort `/api/brand/share/:token` setzt dieselben drei Köpfe selbst
 * (s. deren Kopf) — die SEITE `/brand/share/:token` bekommt sie davon NICHT:
 * beim SSR ist der interne Abruf ein eigener Request mit eigener Antwort, und
 * die Kopfzeilen der einen wandern nicht in die andere. Ohne diese Middleware
 * trüge das HTML also gar keinen Schutz, obwohl die JSON-Antwort daneben ihn
 * vollständig hat.
 *
 * DREI KÖPFE, DREI GRÜNDE (wortgleich zur Route, weil es dieselbe Zusage ist):
 *   `Cache-Control: no-store`         ein Widerruf muss sofort wirken — eine
 *                                     Kopie im Proxy verzögerte ihn um Stunden
 *   `X-Robots-Tag: noindex, nofollow` geteilt ist nicht öffentlich; die Seite
 *                                     trägt dasselbe zusätzlich als Meta-Tag,
 *                                     weil ein Crawler mal das eine und mal
 *                                     das andere liest
 *   `Referrer-Policy: no-referrer`    sonst trüge jeder Klick auf einen Link
 *                                     im Dokument den TOKEN in der Adresse an
 *                                     die fremde Seite weiter
 *
 * `frame-ancestors 'none'` steht bewusst NICHT hier: der Core setzt diesen
 * einen Kopf im `render:response`-Hook und überschriebe ihn: `share-frame.ts`
 * trägt den Pfad deshalb in die Registry ein, aus der der Core seinen Wert
 * bildet.
 *
 * DER TOKEN WIRD NICHT ANGEFASST — nicht gelesen, nicht geloggt, nicht
 * gemessen. Diese Middleware kennt nur den Pfad davor.
 */

/** Locale-Präfix (de, en-US, …) abstreifen — i18n prefix_except_default. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, '')
}

export default defineEventHandler((event) => {
  const path = stripLocale(getRequestURL(event).pathname)
  if (!path.startsWith('/brand/share/')) return
  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  })
})
