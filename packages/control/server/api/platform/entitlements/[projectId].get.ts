import { issueEntitlementDocument } from '../../../utils/entitlementIssue'

/**
 * ALTE ADRESSE des Entitlement-Dokuments (WL1 c, 2026-11-17). Die neue ist
 * `/api/control/entitlements/<projectId>`; diese hier bleibt, bis keine Site
 * sie mehr abruft, und wird dann gelöscht — samt ihrer Ausnahme in
 * `scripts/lib/manifest-routes.mjs`. Rumpf und Regeln:
 * `server/utils/entitlementIssue.ts`.
 */
export default defineEventHandler(event => issueEntitlementDocument(event))
