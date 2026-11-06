import {
  DISCOVER_OG_WORDMARK,
  discoverOgCacheKey,
  discoverOgPng,
} from '../../../utils/discoverOgImage'

/**
 * DAS VORSCHAUBILD EINER ANATOMIE — `/og/discover/<slug>.png`
 * (Discover-Paket D4; Pfad-Wahrheit: `brandDiscoverOgPath()` im brand-Layer,
 * eingetragen in den Kopf über `useBrandOgImage()` → `useLocaleSeoHead()`).
 *
 * ── DIE DATEI HEISST `[slug].get.ts`, DIE ADRESSE ENDET AUF `.png` ──────
 * Ein Nitro-Routenparameter deckt IMMER ein ganzes Pfadsegment ab; `.png` im
 * Dateinamen (`[slug].png.get.ts`) ergäbe keinen Router-Eintrag, der so
 * matcht. Die Endung wird deshalb hier vom Parameter abgeschnitten — wörtlich
 * wie in `apps/platform/server/routes/og/[key].get.ts`. Ohne `.png` am Ende
 * gibt es kein Bild: die Adresse im Kopf trägt sie, und eine zweite Schreibweise
 * derselben Ressource wäre ein zweiter Cache-Eintrag bei jedem Vorschau-Dienst.
 *
 * ── DER SLUG IST HIER EINGABE — UND WIRD DESHALB ZWEIMAL GEMESSEN ───────
 * Erst gegen die Form (unten), dann gegen die WIRKLICHKEIT: gerendert wird nur,
 * was `loadPublishedBrandPublication()` als SICHTBARE Veröffentlichung
 * herausgibt. Damit kann niemand mit erfundenen Schlüsseln die Platte füllen
 * oder Rechenzeit bestellen — das ist die Sicherheitsentscheidung dieser Route,
 * dieselbe wie bei `/og/<key>.png` in `apps/platform`, nur mit umgekehrter
 * Beweisrichtung (dort ist der Schlüssel bloss Cache-Brecher, hier ist der Slug
 * die Adresse einer echten Zeile).
 *
 * Zurückgezogen, ausgeblendet, in der Warteschlange, unbekannt: EIN 404 für
 * alle — genau wie `/api/discover/<slug>` (§3.2 „kein 410, kein Rest"). Es gibt
 * bewusst KEINE Betreiber-Vorschau: die Anatomie-Vorschau trägt `noindex` und
 * damit kein og:image.
 *
 * ── DER DATEINAME KOMMT NIE AUS DER ADRESSE ─────────────────────────────
 * Abgelegt wird unter einem Hash aus Slug + Stand (`discoverOgCacheKey`).
 *
 * ── CACHE-KOPF: EIN TAG, NICHT EWIG ─────────────────────────────────────
 * Anders als bei der Community-Karte wandert die URL hier NICHT, wenn sich das
 * Bild ändert (der Slug ist stabil, das ist der Zweck einer indexierbaren
 * Adresse). `immutable` wäre deshalb eine Lüge: nach einem neuen freigegebenen
 * Stand käme das alte Bild bis in alle Ewigkeit. 24 Stunden sind der
 * Kompromiss — lang genug, dass die Route nichts kostet, kurz genug, dass ein
 * neuer Stand innerhalb eines Tages ankommt.
 */
export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'slug') ?? ''
  const slug = param.endsWith('.png') ? param.slice(0, -4).toLowerCase() : ''
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const row = await loadPublishedBrandPublication(event, slug)
  if (!row) throw createError({ status: 404, statusText: 'Not found' })

  const png = await discoverOgPng(discoverOgCacheKey(row.slug, row.$updatedAt), {
    title: row.title ?? '',
    paletteId: row.paletteId ?? '',
    wordmark: DISCOVER_OG_WORDMARK,
  })

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'content-length', png.length)
  setHeader(event, 'cache-control', 'public, max-age=86400')
  return png
})
