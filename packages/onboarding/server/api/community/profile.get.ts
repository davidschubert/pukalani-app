import type { CommunityProfileResult } from '../../../../control/schemas/communityProfile'

/**
 * NAME UND BESCHREIBUNG DIESER COMMUNITY lesen (U5) — füllt das Formular auf
 * `/dashboard/community`.
 *
 * ── WARUM HIER KEINE SERVICE-NAHT STEHT (im Gegensatz zum PATCH nebenan) ──
 * Geschrieben werden kann `communities` nur über das Control Plane; GELESEN
 * ist die Zeile längst da. Der Tenant-Resolver holt sie bei jedem Request
 * (30-s-Microcache) und legt Name und Beschreibung in den Server-Kontext —
 * ein zweiter Ruf ins Control Plane wäre eine Abfrage über eine
 * Projektgrenze für einen Wert, der schon im Speicher liegt.
 *
 * ── WARUM ES DIE ROUTE TROTZDEM BRAUCHT ─────────────────────────────────
 * Der Name steht dem Browser über `useBrandName()` ohnehin zur Verfügung; die
 * BESCHREIBUNG bewusst nicht (sie ist kein SSR-Payload-Feld — Begründung an
 * `CommunitySettings.description`). Genau dafür ist das hier die eine Tür, und
 * sie ist capability-gegated: `team.manage`, dieselbe Capability wie der
 * Reiter und wie der PATCH. Ein beliebiges Mitglied bekommt die
 * Wizard-Antworten seiner Community nicht zu sehen.
 */
export default defineEventHandler(async (event): Promise<CommunityProfileResult> => {
  await requireCommunityPermission(event, 'team.manage')

  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  return {
    communityId: tenant.communityId,
    name: tenant.name ?? '',
    description: tenant.description ?? '',
    locale: tenant.primaryLocale ?? '',
  }
})
