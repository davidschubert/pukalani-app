/**
 * DIE GETEILTE FOUNDATION WIRD NIE EINGEBETTET (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.8, Paket G3).
 *
 * Die API-Antwort (`/api/brand/share/:token`) sagt das seit BF1 selbst; die
 * SEITE konnte es bis G3 nicht sagen: `security-headers.ts` des Core setzt
 * `frame-ancestors` im `render:response`-Hook und überschreibt dabei jeden
 * Wert, den die Seite oder eine Middleware vorher gesetzt hätte. Der Default
 * `'self'` hätte also gewonnen — und ein fremdes iframe um ein geteiltes
 * Markenhandbuch ist die einfachste Art, es als eigene Arbeit auszugeben.
 *
 * Deshalb der Eintrag in DERSELBEN Registry, in der auch die Erlaubnisse
 * stehen (`registerFrameDeniedRoute`, core/server/utils/frameAncestors.ts):
 * EINE Stelle, an der der Wert entsteht, statt zweier, von denen die falsche
 * gewinnt. Das Präfix steht OHNE Locale — `/de/brand/share/…` deckt die
 * Registry selbst ab.
 */
export default defineNitroPlugin(() => {
  registerFrameDeniedRoute('/brand/share')
})
