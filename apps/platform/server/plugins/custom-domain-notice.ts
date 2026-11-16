import { createCustomDomainNoticeReader } from '../../../../packages/control/server/utils/customDomainNoticeReader'
import { registerCustomDomainNoticeReader, runCustomDomainNoticeSweep } from '../../../../packages/onboarding/server/utils/customDomainNotice'

/**
 * A14-Komposition: die zwei Hinweise zur Frist der eigenen Domain (BE-014)
 * gehören in die Glocke und das Postfach des Owners — beides kennt nur diese
 * App. Dieselbe Verdrahtung wie `past-due-notice.ts`:
 *  - LESEN gehört dem control-Layer (`communities` + `community_members`,
 *    Cross-Projekt-Read mit dem read-only-Key),
 *  - SCHREIBEN dem onboarding-Layer (`notify()` + `sendMail` im Pool).
 *
 * KEIN EIGENER SCHALTER: gemeldet wird nur, was das Control Plane
 * GESTEMPELT hat (`customDomainGraceEndsAt`). Solange dessen Fristen-Lauf nur
 * zählt (`pukalani.control.customDomainSweep: 'dry-run'`), steht nirgends ein
 * Stempel, und dieser Lauf findet nichts — er läuft trotzdem und meldet sich
 * beim Wächter, damit er nicht erst am Tag des Scharfschaltens fehlt.
 *
 * TAKT stündlich, erster Lauf nach ~75 s — versetzt zu den Nachbarn
 * (`past-due-notice` 45 s).
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 75 * 1000

export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  // Dieselbe Bedingung wie beim Tenant-Resolver (SEC-025): ohne Control-Env
  // lehnt die App ohnehin jede Anfrage ab, und es gibt nichts zu lesen.
  if (!endpoint || !projectId || !databaseId || !apiKey) return

  registerCustomDomainNoticeReader(createCustomDomainNoticeReader({ endpoint, projectId, apiKey, databaseId }))

  defineTimedJob({
    name: 'custom-domain-notice',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    run: async () => {
      const result = await runCustomDomainNoticeSweep()
      if (result.notified) {
        logEvent('info', 'custom_domain.notice_sweep', { notified: result.notified, mailed: result.mailed })
      }
    },
  })
})
