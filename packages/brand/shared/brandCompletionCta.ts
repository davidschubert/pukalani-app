/**
 * DER EINE CONVERSION-WEG DIESES LAYERS — ROUTE ODER ADRESSE (BS1 R0).
 *
 * `pukalani.brand.completionCta` beantwortet die Frage „was steht am Ende?"
 * — am Ende des Wizards (`BwFoundationChapter`, die Schranke vor dem
 * visuellen Teil) und an der Schranke des Marktvergleichs. Beide Klicks
 * meinen dasselbe Ziel; ein zweiter getippter Pfad wäre eine zweite Wahrheit
 * über denselben Weg.
 *
 * ── WARUM ES SEIT BS1 R0 ZWEI ARTEN GIBT ─────────────────────────────────
 * Bis 2026-09-07 kannte das Feld nur `type: 'route'` mit `/erstgespraech` —
 * und genau diese Seite gibt es ausschliesslich in `apps/portfolio`
 * (pukalani.studio). Auf branding.supply führten deshalb BEIDE Aufrufer ins
 * 404. Der Layer-Default bleibt trotzdem die Route: läuft `brand` einmal auf
 * pukalani.studio, ist sie dort richtig. Die SITE entscheidet das Ziel —
 * `apps/branding` setzt deshalb `type: 'url'` auf die Studio-Adresse, bis die
 * eigene Erstgespräch-Seite im Layer steht (Paket Z1 des Plans).
 *
 * ── DIE REGEL, DIE MAN NICHT VEREINFACHEN DARF ───────────────────────────
 * `localePath()` darf auf eine ABSOLUTE Adresse nicht angewandt werden: es
 * hängt der fremden URL das Sprach-Präfix des eigenen Hosts voran und macht
 * aus `https://…` einen relativen Unfug. Deshalb trägt das Ergebnis das Feld
 * `external` — der Aufrufer entscheidet daran, ob er `localePath` benutzt und
 * ob `navigateTo` `{ external: true }` braucht. Ein Ergebnis ohne dieses Feld
 * hätte die Falle nur verschoben.
 *
 * FAIL-CLOSED AUF DEN DEFAULT: alles, was nicht eindeutig eine der beiden
 * Formen ist (fehlendes `href`, ein `href` ohne `http(s):`-Schema, ein
 * leeres `to`), fällt auf die Route zurück. Ein halb gelesener Schalter darf
 * keinen leeren Knopf erzeugen — ein Knopf ohne Ziel ist schlimmer als ein
 * Knopf mit dem alten Ziel.
 */

/** Die Vorgabe aus der Config — genau zwei Formen, mehr gibt es nicht. */
export type BrandCompletionCtaConfig =
  | { type: 'route', to: string, labelKey: string }
  | { type: 'url', href: string, labelKey: string, target?: string, rel?: string }

/** Was ein Aufrufer binden kann. */
export interface BrandCompletionCtaTarget {
  /**
   * Bei `external: false` ein PFAD dieser App (der Aufrufer legt
   * `localePath()` darum), bei `external: true` eine absolute Adresse
   * (dann NIEMALS `localePath()`).
   */
  to: string
  external: boolean
  labelKey: string
  /** Nur extern belegt; `undefined` heisst „gleicher Tab". */
  target?: string
  /** Nur extern belegt — bei `target: '_blank'` immer gesetzt. */
  rel?: string
}

/** Der Rückfall, wenn die Config fehlt oder unlesbar ist. */
export const BRAND_COMPLETION_CTA_FALLBACK: BrandCompletionCtaTarget = {
  to: '/erstgespraech',
  external: false,
  labelKey: 'brand.cta.book',
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Absolut heisst hier: mit `http:` oder `https:` — sonst ist es kein Ziel für einen fremden Host. */
function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value)
}

/**
 * Liest die Config und beantwortet die eine Frage: wohin, und ist das dieser
 * Host? Pur — kein Nuxt, kein Fenster, damit es prüfbar bleibt.
 */
export function resolveBrandCompletionCta(raw: unknown): BrandCompletionCtaTarget {
  if (!raw || typeof raw !== 'object') return BRAND_COMPLETION_CTA_FALLBACK
  const cfg = raw as Partial<Record<string, unknown>>
  const labelKey = nonEmpty(cfg.labelKey) || BRAND_COMPLETION_CTA_FALLBACK.labelKey

  if (cfg.type === 'url') {
    const href = nonEmpty(cfg.href)
    if (!isAbsoluteUrl(href)) return { ...BRAND_COMPLETION_CTA_FALLBACK, labelKey }
    const target = nonEmpty(cfg.target)
    // `rel` ist keine Geschmacksfrage: ein `_blank` ohne `noopener` gibt der
    // Zielseite `window.opener` in die Hand. Wer eigenes `rel` setzt, bekommt
    // seins; wer keins setzt und `_blank` will, bekommt das sichere.
    const rel = nonEmpty(cfg.rel) || (target === '_blank' ? 'noopener noreferrer' : '')
    return {
      to: href,
      external: true,
      labelKey,
      ...(target ? { target } : {}),
      ...(rel ? { rel } : {}),
    }
  }

  const to = nonEmpty(cfg.to)
  if (!to.startsWith('/')) return { ...BRAND_COMPLETION_CTA_FALLBACK, labelKey }
  return { to, external: false, labelKey }
}
