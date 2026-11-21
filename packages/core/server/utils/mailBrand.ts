import type { H3Event } from 'h3'
import { useTenant } from './tenant'

/**
 * WELCHE MARKE UNTERSCHREIBT EINE MAIL? (Q06, Davids Antwort R6)
 *
 * Dieselbe Kette wie `useBrandName()` im Browser, damit Seite und Mail
 * denselben Namen tragen:
 *   1. auf einem Community-Host der Name der Community (Mandant),
 *   2. sonst `pukalani.brand.publicName` der App — für Apps, deren Kopf-Name
 *      nicht der Name vor der Kundschaft ist (control: „Pukalani Control" im
 *      Dashboard, „Pukalani" in der Mail),
 *   3. sonst `pukalani.brand.name` der App.
 * Ohne Konfiguration bleibt der Host der Anfrage — ein Name im Code wäre
 * genau die feste Verdrahtung, die dieser Baustein ablöst.
 *
 * OHNE `H3Event` (Sweeps) gibt es keinen Mandanten; dann zählt die App.
 */
export function resolveMailBrand(event?: H3Event): string {
  // `event.context` fehlt nur an gebauten Test-Events — eine Mail stirbt
  // daran trotzdem nicht.
  const tenantName = event?.context ? useTenant(event)?.name?.trim() : ''
  if (tenantName) return tenantName
  const brand = (useAppConfig() as { pukalani?: { brand?: { name?: string, publicName?: string } } }).pukalani?.brand
  const configured = brand?.publicName?.trim() || brand?.name?.trim()
  if (configured) return configured
  const host = (event?.node?.req?.headers?.host ?? '').split(':')[0]
  return host || 'noreply'
}
