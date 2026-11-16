import { z } from 'zod'
import { customDomainStateFor } from '../../../../utils/customDomainService'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'
import { ploiConfig } from '../../../../utils/ploi'
import { clearCustomDomainEntry } from '../../../../utils/customDomainRemoval'

/**
 * Die eigene Domain WIEDER ABGEBEN (control-035).
 *
 * Reihenfolge (erst die Zeile, dann ploi) und das fail-softe Aufräumen stehen
 * mit Begründung in `clearCustomDomainEntry` (server/utils/customDomainRemoval.ts)
 * — derselbe Weg räumt im Fristen-Lauf einen verfallenen Eintrag (BE-014).
 * (Die Appwrite-Web-Platform räumt die RUNTIME ab — dieselbe Schlüsselgrenze
 * wie beim Anlegen.)
 *
 * OHNE BERECHTIGUNGS-PRÜFUNG (`requireEntitlement: false`): wer von Pro herunterstuft, muss
 * seine Domain noch loswerden können. Eine Sperre, die den Rückweg
 * mitversperrt, macht aus einer Herabstufung eine Falle.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireCommunityDomainOwner(event, body, { requireEntitlement: false })

  const previous = row.customDomain || ''
  // Zeile leeren, DANN fail-soft bei ploi aufräumen — derselbe Weg wie beim
  // verfallenen Eintrag des Fristen-Laufs (`clearCustomDomainEntry`).
  const saved = await clearCustomDomainEntry({
    tablesDB: createAdminClient(event).tablesDB,
    databaseId,
    row,
    ploi: ploiConfig(event),
  }).catch((error) => { throw toH3Error(error, 'Could not remove domain') })

  logEvent('info', 'community.custom_domain_removed', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    domain: previous,
  })

  return customDomainStateFor(event, saved)
})
