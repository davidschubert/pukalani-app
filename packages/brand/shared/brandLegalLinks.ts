/**
 * DIE RECHTSWÖRTER IM FUSS — ENTWEDER ECHTE LINKS ODER GAR NICHTS (BS1 R0).
 *
 * ── DER BEFUND ───────────────────────────────────────────────────────────
 * `BwSiteFooter` rendert „Impressum · Datenschutz · AGB" seit Runde 136 als
 * blossen `<span>`: drei Wörter ohne Ziel. Auf branding.supply gibt es die
 * Seiten dahinter nicht (sie kommen mit Paket R1). Das ist die schlechteste
 * der drei möglichen Zustände — schlechter als ein leerer Fuß: ein Wort ohne
 * Ziel BELEGT, dass die Pflicht bekannt war, und liefert dem Besucher
 * trotzdem nichts. Ein Link ins 404 wäre dasselbe mit einem Klick mehr.
 *
 * ── DIE REGEL ────────────────────────────────────────────────────────────
 * Der Schalter `pukalani.brand.legalLinks` trägt PFADE, keine i18n-Schlüssel
 * (die Beschriftungen stehen fest im Layer-Katalog, `brand.legal.*`) — er
 * fällt deshalb bewusst NICHT unter `pnpm check:i18n-keys`. Ein Eintrag mit
 * Pfad wird ein Link; ein leerer Eintrag verschwindet; sind alle drei leer,
 * fällt die ganze Zeile weg. Der Layer-Default ist leer, weil kein Layer
 * wissen kann, ob die App diese Seiten hat.
 *
 * R1 füllt den Schalter mit den `pages`-Routen der Site — dann ist das hier
 * eine Konfig-Zeile und kein Umbau.
 *
 * FAIL-CLOSED: nur ein Pfad, der mit `/` beginnt, gilt. Eine absolute Adresse
 * ist hier bewusst nicht vorgesehen — Impressum und Datenschutz gehören dem
 * Betreiber DIESER Site; ein Fremdlink wäre keine Erfüllung der Pflicht.
 */

/** Reihenfolge ist Absicht: dieselbe wie bisher im Fuß. */
export const BRAND_LEGAL_LINK_IDS = ['imprint', 'privacy', 'terms'] as const

export type BrandLegalLinkId = typeof BRAND_LEGAL_LINK_IDS[number]

/** Die Config-Form: je Eintrag ein App-Pfad, leer = „gibt es hier nicht". */
export type BrandLegalLinksConfig = Partial<Record<BrandLegalLinkId, string>>

export interface BrandLegalLink {
  id: BrandLegalLinkId
  /** App-Pfad ohne Sprach-Präfix — der Aufrufer legt `localePath()` darum. */
  to: string
  /** Der feste Katalog-Schlüssel dieses Eintrags. */
  labelKey: string
}

/**
 * Macht aus dem Schalter die Liste, die der Fuß rendert. Leere Liste heisst:
 * die Zeile bleibt weg. Pur — prüfbar ohne Nuxt.
 */
export function resolveBrandLegalLinks(raw: unknown): BrandLegalLink[] {
  if (!raw || typeof raw !== 'object') return []
  const cfg = raw as Partial<Record<string, unknown>>
  const links: BrandLegalLink[] = []
  for (const id of BRAND_LEGAL_LINK_IDS) {
    const value = cfg[id]
    const to = typeof value === 'string' ? value.trim() : ''
    if (!to.startsWith('/')) continue
    links.push({ id, to, labelKey: `brand.legal.${id}` })
  }
  return links
}
