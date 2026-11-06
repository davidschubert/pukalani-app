import { createBrandProfilePatchSchema } from '../../../../../schemas/brandProfile'
import {
  type BrandJunctionChange,
  type BrandProfileFacts,
  applyJunctionChange,
  resolveBrandJourney,
} from '../../../../../shared/brandJourney'
import type { BrandStepKey } from '../../../../../shared/slotRegistry'
import type { BrandProfilePatchResponse, BrandStepSummary } from '../../../../../shared/types/brand'
import {
  activeShareProfileIds,
  loadOwnedProfile,
  loadStepRows,
  profileFacts,
  requireProfileIdParam,
  resolveProfileProgress,
  toBrandStepKey,
  toProfileSummary,
  toStepFacts,
  toStepSummary,
  toStoryView,
  touchProfile,
} from '../../../../utils/brandStore'

/**
 * TITEL, STARTKARTE UND WEICHEN ÄNDERN — mehr kann diese Route nicht, und das
 * ist ihr Sinn. Alle drei sind ERHOBENE Angaben: jemand hat sie gesagt, und
 * jemand darf sie korrigieren.
 *
 * Fortschritt, Konfidenz, Story, Preset und Zustände der Bausteine stehen NICHT
 * im Schema: sie sind Ergebnisse der Arbeit. Ein PATCH, der sie entgegennähme,
 * wäre die „Manipulation von Fortschritt/Konfidenz über den Client", die §3e
 * ausschliesst. Der Fortschritts-Cache wird hier trotzdem NEU GERECHNET — weil
 * eine umgelegte Weiche Bausteine vom Weg nimmt und die Prozentzahl sonst
 * falsch stehen bliebe.
 *
 * ── VIER WEICHEN, EINE FUNKTION ───────────────────────────────────────────
 * Jede Änderung läuft durch `applyJunctionChange` — auch `team`, das gar keinen
 * Baustein bewegt. Der Grund steht im Kopf von `brandJourney.ts`: eine Weiche,
 * die man an anderer Stelle beantworten müsste, wird irgendwann an beiden
 * Stellen unterschiedlich behandelt.
 *
 * ── DIE BAUSTEIN-ZEILEN WERDEN NICHT ANGEFASST ────────────────────────────
 * Das sieht nach einer Lücke aus und ist die eigentliche Umsetzung des
 * §3e-Vertrags. `resolveBrandJourney` liest aus den Zeilen nur `done` und
 * `active` heraus; ob ein Baustein offen, gesperrt oder übersprungen ist,
 * rechnet es bei JEDEM Lesen neu aus den Weichen. Eine Zeile umzuschreiben
 * hiesse also, denselben Zustand ein zweites Mal zu behaupten — und beim
 * nächsten Zurückschalten wäre die alte Fassung verloren. Wer Naming wieder
 * aktiviert, findet seinen Stand vor, WEIL hier nichts geschrieben wurde.
 *
 * ── `relaunchScope` GEHÖRT ZUM RELAUNCH-PFAD ──────────────────────────────
 * Auf dem Gründer-Pfad wird er ABGEWIESEN statt still ignoriert. Die pure Regel
 * ignoriert ihn ohnehin (fail-closed gegen widersprüchliche Tatsachen) — aber
 * eine Zeile, die ein Feld trägt, das nichts bedeutet, verwirrt jeden, der sie
 * später von Hand liest.
 */
export default defineEventHandler(async (event): Promise<BrandProfilePatchResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const body = await readValidatedBody(event, createBrandProfilePatchSchema().parse)

  const before = profileFacts(profile, betaAccount)
  if (body.relaunchScope !== undefined && before.pathKind !== 'relaunch') {
    throw createError({
      status: 400,
      statusText: 'Relaunch scope is only available on the relaunch path',
      data: { code: 'relaunch_scope_forbidden' },
    })
  }

  // Reihenfolge der Weichen = Reihenfolge im Rumpf-Schema; sie ist egal, weil
  // jede Weiche ein eigenes Feld setzt und keine von einer anderen abhängt.
  const changes: BrandJunctionChange[] = []
  if (body.hasName !== undefined) changes.push({ junction: 'hasName', value: body.hasName })
  if (body.team !== undefined) changes.push({ junction: 'team', value: body.team })
  if (body.subBrands !== undefined) changes.push({ junction: 'subBrands', value: body.subBrands })
  if (body.relaunchScope !== undefined) changes.push({ junction: 'relaunchScope', value: body.relaunchScope })
  if (body.namingOpted !== undefined) changes.push({ junction: 'namingOpted', value: body.namingOpted })

  let facts: BrandProfileFacts = before
  const activated = new Set<BrandStepKey>()
  const deactivated = new Set<BrandStepKey>()
  for (const change of changes) {
    const effect = applyJunctionChange(facts, change)
    facts = effect.profile
    for (const stepKey of effect.activated) activated.add(stepKey)
    for (const stepKey of effect.deactivated) deactivated.add(stepKey)
  }
  // Ein Baustein, der durch die eine Weiche geht und durch die nächste wieder
  // verschwindet, steht am Ende in keiner der beiden Listen — die Antwort
  // beschreibt den UNTERSCHIED, nicht den Weg dorthin.
  for (const stepKey of [...activated]) if (deactivated.has(stepKey)) { activated.delete(stepKey); deactivated.delete(stepKey) }

  const stepRows = await loadStepRows(event, profileId)
  const journey = resolveBrandJourney(facts, toStepFacts(stepRows))
  const progress = resolveProfileProgress(journey)

  const data: Record<string, unknown> = {}
  if (body.title !== undefined && body.title !== (profile.title ?? '')) data.title = body.title
  // Die STARTKARTE (§2.1) — dieselbe Bauart wie der Titel: erhoben, nicht
  // erarbeitet, und deshalb korrigierbar. Geschrieben wird nur, was sich
  // wirklich unterscheidet (s. „NO-OP SCHREIBT NICHT" unten).
  if (body.websiteUrl !== undefined && body.websiteUrl !== (profile.websiteUrl ?? '')) data.websiteUrl = body.websiteUrl
  if (body.industry !== undefined && body.industry !== (profile.industry ?? '')) data.industry = body.industry
  if (body.about !== undefined && body.about !== (profile.about ?? '')) data.about = body.about
  if (body.audience !== undefined && body.audience !== (profile.audience ?? '')) data.audience = body.audience
  if (facts.hasName !== before.hasName) data.hasName = facts.hasName
  if (facts.team !== before.team) data.team = facts.team
  if (facts.subBrands !== before.subBrands) data.subBrands = facts.subBrands
  if (facts.namingOpted !== before.namingOpted) data.namingOpted = facts.namingOpted === true
  if ((facts.relaunchScope ?? null) !== (before.relaunchScope ?? null)) {
    data.relaunchScope = facts.relaunchScope ?? null
  }
  if (progress.progressPct !== profile.progressPct) data.progressPct = progress.progressPct
  if (progress.currentStepKey !== (profile.currentStepKey ?? '')) data.currentStepKey = progress.currentStepKey

  // NO-OP SCHREIBT NICHT (bodyToSave-Prinzip): ein Formular, das ohne
  // Tastendruck gespeichert wird, darf `lastActivityAt` nicht bewegen — sonst
  // sortiert sich die Kartenwand um, ohne dass jemand etwas getan hat.
  const updated = Object.keys(data).length > 0
  if (updated) await touchProfile(event, profileId, data)

  const shared = await activeShareProfileIds(event, [profileId])
  const steps: BrandStepSummary[] = []
  for (const row of stepRows) {
    const stepKey = toBrandStepKey(row.stepKey)
    if (stepKey) steps.push(toStepSummary(row, stepKey))
  }

  return {
    profile: toProfileSummary(
      {
        ...profile,
        title: data.title as string ?? profile.title,
        websiteUrl: data.websiteUrl as string ?? profile.websiteUrl,
        industry: data.industry as string ?? profile.industry,
        about: data.about as string ?? profile.about,
        audience: data.audience as string ?? profile.audience,
        hasName: facts.hasName,
        team: facts.team,
        subBrands: facts.subBrands,
        namingOpted: facts.namingOpted === true,
        relaunchScope: facts.relaunchScope ?? null,
        progressPct: progress.progressPct,
        currentStepKey: progress.currentStepKey,
      },
      shared.has(profileId),
      betaAccount,
    ),
    story: toStoryView(profile),
    journey: [...journey],
    steps,
    activated: [...activated],
    deactivated: [...deactivated],
  }
})
