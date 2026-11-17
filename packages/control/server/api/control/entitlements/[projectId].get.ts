import { issueEntitlementDocument } from '../../../utils/entitlementIssue'

/**
 * GET /api/control/entitlements/<projectId> — das signierte
 * Entitlement-Dokument einer Site (WL1 c, 2026-11-17).
 *
 * Öffentlich: die Site holt es ohne Control-Session (Adresse in
 * `NUXT_ENTITLEMENTS_URL`), der Inhalt ist die Produkt-Liste, die Signatur
 * verhindert Fälschung. Die Adresse liegt unter dem `apiPrefixes`-Präfix des
 * Control Plane — sein Not-Aus erreicht sie damit wie jede andere seiner
 * Routen. Rumpf und Regeln: `server/utils/entitlementIssue.ts`.
 */
export default defineEventHandler(event => issueEntitlementDocument(event))
