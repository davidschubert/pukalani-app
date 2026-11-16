/**
 * DIE EIGENE DOMAIN ALS LINK-ADRESSE — pur, damit sie prüfbar ist
 * (seit 2026-11-16).
 *
 * Aus der Auskunft der Naht (`siteDomainAddress`) wird die Adresse, die
 * Mail-Links und OAuth-Rückwege tragen (core-Vertrag `resolveSiteOrigin`).
 * Strenger als die Umleitung, und mit Absicht: eine Umleitung, die ausbleibt,
 * ist harmlos — ein Reset-Link auf einen Namen, den Appwrite (noch) nicht als
 * Plattform kennt, scheitert still beim Empfänger.
 *
 * DESHALB NUR `active`: das Control Plane setzt diesen Status erst, nachdem
 * die Site die Appwrite-Plattformen der Domain eingetragen und die
 * Origin-Probe bestanden hat (`api/site/domain/settle.post.ts`). Jeder frühere
 * Status ⇒ `null`, und der Aufrufer nimmt die Standard-Adresse.
 *
 * DESHALB NUR EINE FORM DER EIGENEN DOMAIN: `canonicalHost` muss in `forms`
 * stehen. Sonst wäre es die Standard-Adresse, und die kennt der Aufrufer über
 * `appUrl` schon — mit dem Schema, das dort eingetragen ist.
 *
 * SCHEMA `https`, im Dev-Server das von `appUrl`: eine aktive Domain hat ein
 * Zertifikat (der Status kommt nach dem Zertifikatsschritt). Lokal gibt es
 * keins, dort entscheidet die eingetragene Adresse.
 */
import type { SiteDomainAddress } from '../../core/shared/types/siteDomain'

export type SiteOriginAddress = Pick<SiteDomainAddress, 'canonicalHost' | 'forms' | 'status'>

export interface SiteOriginOptions {
  dev: boolean
  /** `runtimeConfig.public.appUrl` — nur für das Schema im Dev-Server. */
  appUrl: string | null | undefined
}

function devProtocol(appUrl: string | null | undefined): 'http:' | 'https:' {
  try {
    return new URL((appUrl ?? '').trim()).protocol === 'http:' ? 'http:' : 'https:'
  }
  catch {
    return 'https:'
  }
}

/** PURE: die aktive eigene Domain als Origin (`https://name`), sonst `null`. */
export function siteOriginFromAddress(address: SiteOriginAddress | null, options: SiteOriginOptions): string | null {
  if (!address || address.status !== 'active') return null
  const host = (address.canonicalHost || '').trim().toLowerCase()
  if (!host || !address.forms.map(form => form.toLowerCase()).includes(host)) return null

  const protocol = options.dev ? devProtocol(options.appUrl) : 'https:'
  try {
    const url = new URL(`${protocol}//${host}`)
    // Nur ein reiner Hostname: steckte ein Port, ein Pfad oder ein `@` darin,
    // wäre der gebaute Origin ein anderer Name als der eingetragene.
    if (url.hostname !== host || url.port || url.username) return null
    return url.origin
  }
  catch {
    return null
  }
}
