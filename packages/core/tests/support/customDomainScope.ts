import { randomBytes } from 'node:crypto'
import { vi } from 'vitest'
import { registerProductManifest } from '../../server/utils/productRegistry'
import { configureSiteCard } from '../../server/utils/siteCard'
import type { ProductManifest } from '../../shared/types/manifest'

/**
 * KONTEXT EINER ANFRAGE HINTER `01.custom-domain-scope.ts` (PK1 E1b-2).
 *
 * Fährt die ECHTE Middleware mit Schalter, Host und einem Pool-Mandanten
 * (Pukalani-Adresse `kunde-a.pukalani.app`, eigene Domain `www.kunde.de`) und
 * Produkt-Layer, deren Präfix die Route trägt, gibt der Test mit
 * (`products`, das echte Manifest) — wie das Nitro-Plugin der App. Er
 * liefert die Felder, die die Middleware in den Kontext legt — für `probeRoute(…, {
 * context })`. Wirft die Middleware (404), wirft auch diese Hilfe.
 * Nach dem Test: `configureSiteCard(undefined)` und `vi.unstubAllGlobals()`.
 */

export const PUKALANI_ADDRESS = 'kunde-a.pukalani.app'
export const OWN_DOMAIN = 'www.kunde.de'

export async function customDomainContext(
  mode: 'off' | 'read' | 'write',
  host: string,
  path = '/api/x',
  products: readonly ProductManifest[] = [],
): Promise<Record<string, unknown>> {
  for (const manifest of products) registerProductManifest(manifest)
  configureSiteCard(mode === 'off' ? undefined : { mode, key: randomBytes(32).toString('base64') })
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getHeader', (event: { headers: Record<string, string> }, name: string) => event.headers[name.toLowerCase()])
  vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
  const middleware = (await import('../../server/middleware/01.custom-domain-scope')).default as unknown as (event: unknown) => void
  const tenant = { mode: 'pool', projectId: 'pool', tenantId: 't-a', communityId: 'c-a', canonicalHost: OWN_DOMAIN, pukalaniHost: PUKALANI_ADDRESS }
  const context: Record<string, unknown> = { tenant }
  middleware({ path, method: 'GET', headers: { host }, context })
  delete context.tenant
  return context
}
