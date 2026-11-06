import { stripBrandGenerationDrafts } from '../../../../../../shared/brandGeneration'
import { affectsView, brandStageSourceSlots } from '../../../../../../shared/brandSessions'
import { slotsForStep } from '../../../../../../shared/slotRegistry'
import type { BrandSessionView, BrandStepDetailResponse } from '../../../../../../shared/types/brand'
import { listBrandFindings, toBrandFindingView } from '../../../../../utils/brandFindingsStore'
import {
  confirmedSlotValues,
  loadBrandStepContext,
  parseCollectedParts,
  parseGenerations,
  parseSlotRecords,
  profileFacts,
  resolveBrandSessionStates,
  toSlotViews,
  toStepFacts,
} from '../../../../../utils/brandStore'

/**
 * EINEN BAUSTEIN ÖFFNEN — Slots, Zustand, Fortschritt.
 *
 * ── GENERATIONEN: METADATEN, KEINE INHALTE ────────────────────────────────
 * `generations` trägt je Eintrag `generationId`, Slot-Id, Schema-/Prompt-
 * Version, Modell, Anbieter, Sprache, `inputHash` und Zeitpunkt — nie den
 * erzeugten Text. Der TEXT lebt in den Slots (`firstDraft`/`latestDraft`) und in
 * `brand_messages`; diese Liste beantwortet „wie kam das zustande?", nicht „was
 * steht da?".
 *
 * GESPEICHERT wird der Entwurf trotzdem mit (`BrandGenerationEntry.draft`, seit
 * der Generierungs-Route) — sonst könnte die Fassungs-Wiederherstellung keine
 * frühere Fassung zurückholen. Er wird hier ABGESTREIFT, damit jede Antwort
 * genau so viel trägt, wie ihre Seite braucht: die Werkstatt zeigt Herkunft, die
 * Fassungs-Liste zeigt Text und hat dafür ihre eigene Route.
 *
 * ── `missingRequired` KOMMT AUS DER JOURNEY ───────────────────────────────
 * Also aus derselben Rechnung, die auch der Abschluss benutzt. Ein eigener
 * Durchlauf hier wäre die zweite Wahrheit, an der Lesen und Schreiben
 * auseinanderlaufen: der Baustein zeigte „nichts fehlt" und `complete`
 * antwortete `required_slots_missing`.
 *
 * ── LESEN IST NACHSICHTIG ─────────────────────────────────────────────────
 * Ein neu hinzugekommener Pflicht-Slot taucht in `missingRequired` auf, wirft
 * einen abgeschlossenen Baustein aber nicht zurück (Migrationsvertrag §3e).
 * Streng ist erst der Schreibweg.
 *
 * ── `sessions`: DER STAND JE FELD (BW2 §5, Paket 3a) ──────────────────────
 * `slots` sagt, WAS in einem Feld steht; `sessions` sagt, WIE es um die
 * Arbeitseinheit dahinter steht — gesperrt, offen, fertig, veraltet — plus
 * das, was die Oberfläche dem Menschen VORHER sagen soll: wie lange es dauert
 * (`effort`), wie vertraulich es ist (`sensitivity`), welche Arbeitsform es
 * hat (`kind`) und wohin es später fliesst (`affects`).
 *
 * `affects` ist eine reine RECHNUNG über der Registry (`sessionsAffectedBy`),
 * keine gepflegte Liste: „das fliesst später in vier Kapitel" wird damit nie
 * falsch, auch wenn morgen eine Abhängigkeit dazukommt. Die Zahl ist die
 * Länge der transitiven Hülle — dieselbe Spalte „berührt" wie in Anhang A des
 * Plans.
 *
 * Gerechnet wird über die Fakten ALLER Kapitel (`stepRows`), nicht nur des
 * eigenen: eine Session liest über Kapitelgrenzen (`b.purpose` ← `a.pitch`),
 * und mit nur einer Zeile stünde die halbe Registry für immer auf `locked`.
 */
export default defineEventHandler(async (event): Promise<BrandStepDetailResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepKey, stepRow, stepRows, journey } = await loadBrandStepContext(event, userId, betaAccount)

  const step = journey.find(entry => entry.stepKey === stepKey)!
  const generations = parseGenerations(stepRow.generations)
  const records = parseSlotRecords(stepRow.slots)

  const states = resolveBrandSessionStates(profileFacts(profile, betaAccount), toStepFacts(stepRows))
  const sessions: Record<string, BrandSessionView> = {}
  for (const session of slotsForStep(stepKey)) {
    const collected = parseCollectedParts(records[session.id])
    sessions[session.id] = {
      state: states[session.id] ?? 'locked',
      kind: session.kind,
      effort: session.effort,
      sensitivity: session.sensitivity,
      // Nur ERREICHBARE Kapitel (gesperrtes Brand Design fällt heraus) —
      // pure Regel `affectsView`, s. dort.
      affects: affectsView(session.id, journey),
      // Die zwei Flags der Finalen Abnahme (Paket 3b) — IMMER gesetzt, auch als
      // `false`: ein fehlendes Feld hiesse für den Leser „unbekannt", und die
      // Abnahme-Seite hat keinen dritten Zustand.
      accepted: records[session.id]?.accepted === true,
      deferred: records[session.id]?.deferred === true,
      // Der Schliess-Aufruf (Paket 4, §7). FEHLT die Marke, ist er fail-soft
      // ausgefallen — und genau diese Sessions holt der Prüfblick nach.
      reviewed: records[session.id]?.reviewed === true,
      // NUR wo es welche gibt: ein leeres Objekt bzw. ein leeres Feld an 67
      // Sessions wäre Rauschen in jeder Antwort.
      ...(Object.keys(collected).length ? { collected } : {}),
      ...(records[session.id]?.notes ? { notes: records[session.id]!.notes! } : {}),
      ...(records[session.id]?.review?.missing?.length
        ? { missing: [...records[session.id]!.review!.missing!] }
        : {}),
    }
  }

  /**
   * DIE OFFENEN BEFUNDE DIESES KAPITELS (§8) — die Daten für die Chips aus
   * Paket 5, gefiltert über die beteiligten FELDER und nicht über den
   * Herkunfts-Stempel: ein Konflikt zwischen B und C gehört in beide Kapitel.
   *
   * FAIL-SOFT (`listBrandFindings`): ohne Befund-Tabelle ist die Liste leer
   * und die Werkstatt verhält sich wie vor Paket 4.
   */
  /**
   * DIE QUELL-WERTE DER BÜHNE (Paket G4) — bestätigt, aus FREMDEN Kapiteln,
   * und nur die, die eine Bühne namentlich braucht (`brandStageSourceSlots`).
   * Heute sind das die zwei Archetypen des Ergebnis-Kapitels, aus denen die
   * drei Richtungs-Vorschläge folgen.
   *
   * Gelesen wird `confirmed`, nie `latestDraft`: ein Vorschlag, der auf einem
   * Entwurf steht, wechselt beim Bestätigen die Karten unter der Hand.
   */
  const wanted = new Set(brandStageSourceSlots(stepKey))
  const sourceValues: Record<string, string> = {}
  if (wanted.size > 0) {
    for (const row of stepRows) {
      for (const slot of confirmedSlotValues(row)) {
        if (wanted.has(slot.slotId)) sourceValues[slot.slotId] = slot.value
      }
    }
  }

  const own = new Set(slotsForStep(stepKey).map(entry => entry.id))
  const findings = (await listBrandFindings(event, stepRow.profileId, 'open'))
    .map(toBrandFindingView)
    .filter(view => view.slots.some(slotId => own.has(slotId)))

  return {
    profileId: stepRow.profileId,
    stepKey,
    storedState: stepRow.state,
    revision: stepRow.revision ?? 0,
    confidence: stepRow.confidence ?? null,
    inputHash: stepRow.inputHash ?? '',
    startedAt: stepRow.startedAt ?? null,
    completedAt: stepRow.completedAt ?? null,
    // Der Verlaufs-Schnitt (brand-013): der Client lädt Züge nur DANACH.
    restartedAt: stepRow.restartedAt ?? null,
    activeSeconds: stepRow.activeSeconds ?? 0,
    slots: toSlotViews(records),
    sessions,
    findings,
    generations: { items: stripBrandGenerationDrafts(generations.items), count: generations.count },
    progress: step.progress,
    missingRequired: [...step.missingRequired],
    sourceValues,
  }
})
