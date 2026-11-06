import {
  discoverOgCacheKey,
  discoverOgPng,
} from '../../../utils/discoverOgImage'

/**
 * DAS VORSCHAUBILD EINES INSIGHTS-ARTIKELS — `/og/insights/<slug>.png`
 * (BI1 I3; Pfad-Wahrheit: `insightsOgPath()` im insights-Layer, eingetragen in
 * den Kopf über `useBrandOgImage()` → `useLocaleSeoHead()`).
 *
 * ── DERSELBE RASTERIZER WIE BEI DEN ANATOMIEN ───────────────────────────
 * `discoverOgPng` liegt in `server/utils/discoverOgImage.ts` dieser App und
 * ist bewusst nicht auf Discover zugeschnitten: Farbwelt-Verlauf, Titel,
 * Herkunftszeile. Ein zweiter Rasterizer für dieselbe Kachelform wäre ein
 * zweiter Zeichen-Atlas und eine zweite Kontrast-Rechnung. Der Unterschied
 * steht in der WORTMARKE — sie sagt, aus welchem Bereich das Bild kommt.
 *
 * ── DIE APP UND NICHT DER LAYER ─────────────────────────────────────────
 * Der Rasterizer lebt in `packages/themes`, die Farbwelt in `packages/brand`,
 * der Beitrag in `packages/insights`. Ein Produkt-Layer darf `themes` nicht
 * kennen (CONCEPT.md A14) — die APP darf alle drei, und genau das ist ihre
 * Aufgabe: komponieren. Dieselbe Ablage wie bei `/og/discover/<slug>.png`.
 *
 * ── DER SLUG IST HIER EINGABE UND WIRD ZWEIMAL GEMESSEN ─────────────────
 * Erst gegen die Form (unten), dann gegen die WIRKLICHKEIT: gerendert wird
 * nur, was `findPublicInsightsPost()` als öffentlichen ARTIKEL herausgibt —
 * inklusive Riegel. Damit kann niemand mit erfundenen Schlüsseln die Platte
 * füllen oder Rechenzeit bestellen.
 *
 * KEINE Weiterleitung und KEINE Betreiber-Vorschau: ein og:image ist kein
 * Navigationsziel (ein Vorschau-Dienst folgt keiner 301 auf ein Bild, er
 * meldet einen Fehler), und die Vorschau trägt `noindex` und damit gar kein
 * Bild. Ein alter Slug antwortet hier also 404 — die SEITE dahinter leitet
 * weiter und trägt dann die neue Bildadresse im Kopf.
 *
 * ── DIE FARBWELT KOMMT VON DER ERSTEN ERWÄHNTEN MARKE ───────────────────
 * Sie ist das Erkennungszeichen des Beitrags in der Liste, und das Bild soll
 * dasselbe zeigen. Hat der Beitrag keine Marke (ein allgemeiner Artikel),
 * bleibt `paletteId` leer und `discoverOgGradient` nimmt seinen neutralen
 * Rückfall — nie die erste Welt des Katalogs.
 *
 * ── DER ABLAGE-SCHLÜSSEL TRÄGT EIN EIGENES PRÄFIX ───────────────────────
 * `insights-<slug>` statt `<slug>`: sonst kollidierte eine Marke, die unter
 * `/discover/<slug>` UND als Artikel unter demselben Slug steht, mit sich
 * selbst — und ein Bild landete unter dem Namen des anderen. Der Stand
 * (`$updatedAt` der Zeile) steckt wie dort mit drin, damit ein neuer Stand ein
 * neues Bild bekommt, ohne dass jemand aufräumen muss.
 *
 * ── CACHE-KOPF: EIN TAG, NICHT EWIG ─────────────────────────────────────
 * Die Adresse wandert nicht, wenn sich das Bild ändert (der Slug ist stabil —
 * das ist der Zweck einer indexierbaren Adresse). `immutable` wäre deshalb
 * eine Lüge; 24 Stunden sind der Kompromiss.
 */
const INSIGHTS_OG_WORDMARK = 'Brand Insights · branding.supply'

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'slug') ?? ''
  const slug = param.endsWith('.png') ? param.slice(0, -4).toLowerCase() : ''
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const lookup = await findPublicInsightsPost(event, 'article', slug)
  if (lookup.kind !== 'post') throw createError({ status: 404, statusText: 'Not found' })

  const { row, post } = lookup.hit
  const brandId = post.brandRefs[0]?.brandId ?? ''
  const brands = await loadInsightsBrandRowsByIds(event, brandId ? [brandId] : [])
  const paletteId = brandId ? brands.get(brandId)?.paletteId ?? '' : ''

  // Der Titel in der GRUNDSPRACHE: das Bild hat keine Sprache des Lesers, und
  // die Grundfassung ist die redigierte (Entscheidung 3).
  const title = post.baseLocale === 'de' ? post.titleDe : post.titleEn

  const png = await discoverOgPng(discoverOgCacheKey(`insights-${row.slug}`, row.$updatedAt), {
    title,
    paletteId,
    wordmark: INSIGHTS_OG_WORDMARK,
  })

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'content-length', png.length)
  setHeader(event, 'cache-control', 'public, max-age=86400')
  return png
})
