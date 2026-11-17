import { z } from 'zod'
import { parseProductsColumn, type ProductRuntimeState } from '../../../../../core/shared/types/config'

const bodySchema = z.object({ enabled: z.boolean() })

/**
 * Laufzeit-Produkt-Toggle (F2/M2): schreibt app_config.products (system-018).
 * Guards: nur einkompilierte optional-Tier-Produkte; Abschalten wird
 * verweigert, solange AKTIVE Produkte es via requires brauchen
 * (moderation ← comments); Anschalten verlangt aktive Abhängigkeiten.
 * Statusmaschine M2: enabled ⇔ active/inactive — provisioning/error kommen
 * mit dem Provisioner (M3/M7).
 *
 * ZWEI BETREIBER IM SELBEN AUGENBLICK (BP1 d, 2026-11-17): Prüfen und
 * Schreiben laufen in der Kette von `mutateAppConfig()`
 * (server/utils/appConfigWrite.ts) gegen den FRISCH gelesenen Stand — vorher
 * kam er aus dem 5-s-Zwischenspeicher der Produkt-Gates, und der zweite
 * Schalter schrieb den Stand von vor dem ersten zurück. Geschrieben werden
 * die gespeicherten Abweichungen plus genau dieser eine Schlüssel. Die
 * Prüfungen sehen zusätzlich das Entitlement (`getEffectiveProducts`, nach
 * dem Verwerfen des Zwischenspeichers ebenfalls frisch); geschrieben wird es
 * nie — ein vom Entitlement gesperrtes Produkt landet nicht als „aus" in der
 * Spalte (das tat der alte Weg, er schrieb den WIRKSAMEN Stand zurück).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const key = getRouterParam(event, 'key')
  const { enabled } = await readValidatedBody(event, bodySchema.parse)

  const manifest = key ? getProductRegistry().get(key) : undefined
  if (!key || !manifest) {
    throw createError({ status: 404, statusText: 'Unknown product' })
  }
  if (manifest.tier !== 'optional') {
    throw createError({ status: 409, statusText: 'Foundation products cannot be toggled' })
  }

  await mutateAppConfig(event, async (current) => {
    const stored = parseProductsColumn(current?.products)
    invalidateProductGateCache()
    const effective = await getEffectiveProducts(event)
    const isOn = (productKey: string) =>
      (stored[productKey]?.enabled ?? true) && (effective[productKey]?.enabled ?? true)

    if (!enabled) {
      const requiredBy = [...getProductRegistry().values()]
        .filter(m => m.requires?.includes(key) && isOn(m.key))
        .map(m => m.key)
      if (requiredBy.length > 0) {
        throw createError({ status: 409, statusText: `Required by: ${requiredBy.join(', ')}` })
      }
    }
    if (enabled) {
      const missing = (manifest.requires ?? []).filter(req => !isOn(req))
      if (missing.length > 0) {
        throw createError({ status: 409, statusText: `Requires: ${missing.join(', ')}` })
      }
    }

    const next: Record<string, ProductRuntimeState> = {
      ...stored,
      [key]: { enabled, status: enabled ? 'active' : 'inactive' },
    }
    // Nur echte Overrides persistieren — Default (an/active) bleibt implizit,
    // damit die Spalte klein bleibt und neue Produkte automatisch AN sind.
    const overrides = Object.fromEntries(
      Object.entries(next).filter(([, state]) => !(state.enabled && state.status === 'active')),
    )
    return { data: { products: JSON.stringify(overrides) }, result: undefined }
  }, 'Could not update products')

  invalidateProductGateCache()

  await recordAudit(event, {
    action: enabled ? 'product.enabled' : 'product.disabled',
    targetType: 'product',
    targetId: key,
  })

  return { key, enabled }
})
