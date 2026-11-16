import type { H3Event } from 'h3'
import { resolveCustomDomainStatus, type CustomDomainApprovalResponse } from '../../shared/customDomain'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * FREIGABE EINER EIGENEN DOMAIN DURCH DEN BETREIBER (control-040, SEC-022 —
 * Davids Entscheidung vom 2026-11-16: „eine eigene Domain ist nur MIT
 * Freigabe des Betreibers je Community aktiv", Übergang bis zum Vorhaben
 * „Pukalani-Konto").
 *
 * Der EINE Schreibvorgang auf `customDomainApproved`. Die Freigabe gehört der
 * COMMUNITY, nicht der Domain: der Owner kann seine Domain entfernen und neu
 * eintragen, die Freigabe bleibt.
 *
 * ENTZUG WIRKT SOFORT: ist die Domain gerade `active`, wird sie im selben
 * Schreibvorgang ABGESCHALTET (`paused`, ohne Frist) — eine Betreiber-
 * Entscheidung, die erst nach 14 Tagen greift, wäre keine. Abgeschaltet heißt
 * wie überall: Domain, Token, ploi-Tenant und Zertifikat bleiben, Besucher
 * werden vorübergehend auf die Pukalani-Adresse umgeleitet (≤ 30 s Cache des
 * Resolvers). Eine nicht aktive Domain bleibt, wie sie ist — die Tür der
 * Domain-Routen lässt ohne Freigabe ohnehin keinen weiteren Schritt zu.
 *
 * PROTOKOLL wie bei der Sperre (`communitySuspension.ts`): `recordAudit`
 * (best-effort, wirft nie) plus `logEvent`.
 */

export async function setCustomDomainApproval(
  event: H3Event,
  input: { communityId: string, approved: boolean },
): Promise<CustomDomainApprovalResponse> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const before = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: input.communityId,
  }).catch((error) => { throw toH3Error(error, 'Community not found') })

  const now = new Date().toISOString()
  const previousStatus = resolveCustomDomainStatus(before.customDomainStatus)
  const pause = !input.approved && Boolean(before.customDomain) && previousStatus === 'active'

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: input.communityId,
    data: input.approved
      ? { customDomainApproved: true, customDomainApprovedAt: now }
      : {
          customDomainApproved: false,
          customDomainApprovedAt: null,
          ...(pause
            ? { customDomainStatus: 'paused', customDomainPausedAt: now, customDomainGraceEndsAt: null }
            : {}),
        },
  }).catch((error) => { throw toH3Error(error, 'Could not update custom domain approval') })

  const status = resolveCustomDomainStatus(row.customDomainStatus)
  const action = input.approved ? 'community.custom_domain_approved' : 'community.custom_domain_approval_revoked'
  await recordAudit(event, {
    action,
    targetType: 'community',
    targetId: row.$id,
    targetName: row.host,
    metadata: { domain: row.customDomain || '', previousStatus, status },
  })
  logEvent(input.approved ? 'info' : 'warn', action, {
    communityId: row.$id,
    host: row.host,
    domain: row.customDomain || '',
    previousStatus,
    status,
  })

  return {
    id: row.$id,
    host: row.host,
    customDomain: row.customDomain || '',
    customDomainStatus: status,
    customDomainApproved: row.customDomainApproved === true,
    customDomainApprovedAt: row.customDomainApprovedAt ?? null,
    customDomainGraceEndsAt: row.customDomainGraceEndsAt ?? null,
    customDomainPausedAt: row.customDomainPausedAt ?? null,
  }
}
