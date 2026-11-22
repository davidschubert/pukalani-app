/**
 * DIE DREI MARKEN UND WIE SIE AUFEINANDER ZEIGEN (Q24, Davids Entscheidungen
 * R4 und R9, DECISION-LOG 2026-11-21).
 *
 * Pukalani, Pukalani Studio und Branding Supply verweisen in der Fußzeile
 * ruhig aufeinander: jede Site nennt die ZWEI anderen, mit Namen und zwei,
 * drei Wörtern Rolle (Schlüssel `ui.brandFamily.*`), normale Links ohne
 * `nofollow`. Gerendert wird das von `CoreBrandFamily`; hier steht nur, was
 * ohne Vue prüfbar ist. Namen und Rollen: Davids Wortlaut vom 2026-11-21
 * („Auch von uns: Pukalani App – Community-Plattform · Pukalani Studio –
 * UI/UX-Design Studio · Branding Supply – Digitaler Markenaufbau").
 */

export const BRAND_FAMILY = [
  { key: 'pukalani', name: 'Pukalani App', origin: 'https://pukalani.app' },
  { key: 'studio', name: 'Pukalani Studio', origin: 'https://pukalani.studio' },
  { key: 'branding', name: 'Branding Supply', origin: 'https://branding.supply' },
] as const

export type BrandFamilyKey = (typeof BRAND_FAMILY)[number]['key']

export interface BrandFamilyLink {
  key: BrandFamilyKey
  name: string
  href: string
}

/**
 * Die zwei ANDEREN Marken, in fester Reihenfolge. Alle drei Sites fahren
 * `prefix_except_default` mit Englisch ohne Präfix (core nuxt.config): wer
 * deutsch liest, landet drüben unter `/de`, sonst auf der Wurzel.
 */
export function brandFamilyLinks(current: BrandFamilyKey, locale: string): BrandFamilyLink[] {
  const prefix = locale.startsWith('de') ? '/de' : ''
  return BRAND_FAMILY
    .filter(brand => brand.key !== current)
    .map(brand => ({ key: brand.key, name: brand.name, href: `${brand.origin}${prefix}` }))
}

/**
 * SPRICHT HIER PUKALANI SELBST? Nur dann zeigt der Kundenbereich das
 * Pukalani-Zeichen (R4). Ein Mandanten-Host (Community eines Kunden im Pool)
 * trägt IMMER sein eigenes Gesicht — dort ist der Tenant-Name gesetzt, und
 * die Antwort ist nein, egal wie der Host sonst eingestuft wäre. Silo-Apps
 * (eigene Marke, keine Kontroll-Hosts) bleiben ebenfalls ohne.
 */
export function pukalaniSpeaks(input: { tenantBrand: string | null, controlHost: boolean }): boolean {
  return input.tenantBrand === null && input.controlHost
}
