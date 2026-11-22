import { z } from 'zod'
import {
  TENANT_PLANS,
  COMMUNITY_PLANS_TABLE,
  mergeTenantPlanLimits,
  parseTenantPlanLimits,
  type TenantPlanRow,
} from '../../../../shared/types/tenantRecord'
import { withControlLock } from '../../../utils/controlLock'

// Limits je kind: ganze Zahlen ≥ 0 (0 = unbegrenzt), Obergrenze als
// Tippfehler-Schutz. Kinds bewusst offen (comments, pages, events, media …) —
// aber nur kleine Wort-Keys, kein Injection-/Aufbläh-Spielraum. `null` nimmt
// eine Art aus dem Katalog (dann gilt wieder die Zahl aus der Konfiguration).
const limitsSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),
  z.object({
    perDay: z.number().int().min(0).max(10_000_000).optional(),
    total: z.number().int().min(0).max(1_000_000_000).optional(),
  }).nullable(),
)

/**
 * Betreiber: Quota-Limits eines Plans ändern — wirkt im Pool nach ≤ 90 s
 * (Katalog-Cache 60 s + Host-Cache 30 s im platform-Resolver).
 *
 * ZUSAMMENFÜHREN STATT ÜBERSCHREIBEN (KK1 c, 2026-11-22): der Körper nennt
 * nur die Arten, die sich ändern (`mergeTenantPlanLimits`). Gelesen,
 * zusammengeführt und geschrieben wird unter der Sperre des Control Plane
 * (`withControlLock`, Scope `plans`, Gegenstand = Plan-Key) — „erst lesen,
 * dann schreiben" ohne Sperre hielte zwei gleichzeitige Änderungen nicht
 * auseinander (BE-013). Ein Lesefehler außer 404 bricht ab: lieber nichts
 * schreiben als einen Stand, der die übrigen Arten nicht kennt.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const param = getRouterParam(event, 'key')
  const key = TENANT_PLANS.find(plan => plan === param)
  if (!key) {
    throw createError({ status: 404, statusText: 'Unknown plan' })
  }

  const patch = await readValidatedBody(event, limitsSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  return await withControlLock(event, { scope: 'plans', subject: key }, async () => {
    let stored: Record<string, { perDay?: number, total?: number }> = {}
    try {
      const existing = await admin.tablesDB.getRow<TenantPlanRow>({ databaseId, tableId: COMMUNITY_PLANS_TABLE, rowId: key })
      stored = parseTenantPlanLimits(existing.limits)
    }
    catch (error) {
      // 404 = die Zeile fehlt (neuer Plan-Key nach Migration) ⇒ leerer Stand.
      if ((error as { code?: unknown } | null)?.code !== 404) throw toH3Error(error, 'Could not read tenant plan')
    }

    // rowId = key (control-014-Seed) — fehlt die Row, wird sie angelegt.
    const row = await admin.tablesDB.upsertRow<TenantPlanRow>({
      databaseId,
      tableId: COMMUNITY_PLANS_TABLE,
      rowId: key,
      data: { key, limits: JSON.stringify(mergeTenantPlanLimits(stored, patch)) },
    }).catch((error) => { throw toH3Error(error, 'Could not update tenant plan') })

    return { key: row.key, limits: parseTenantPlanLimits(row.limits) }
  })
})
