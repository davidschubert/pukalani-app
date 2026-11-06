import { brandStepAcceptance } from '../../../../../shared/brandJourney'
import { blockingFindingSlots } from '../../../../../shared/brandFindings'
import { BRAND_SLOTS, isBrandDesignStep, isBrandKitStep, slotsForStep } from '../../../../../shared/slotRegistry'
import type {
  BrandDocumentChapter,
  BrandDocumentResponse,
} from '../../../../../shared/types/brand'
import {
  brandAcceptanceSessions,
  loadBrandDocumentContext,
} from '../../../../utils/brandAcceptance'
import { brandDesignSnapshotPreset } from '../../../../../shared/brandDesignValues'
import { brandDesignStand, loadBrandDesignPreset } from '../../../../utils/brandDesignPreset'
import { readBrandDocumentReview } from '../../../../utils/brandReview'
import { brandSlotRecordConfirmed, parseSlotRecords } from '../../../../utils/brandStore'

/**
 * „EUER BRANDING" — DAS DOKUMENT (BW2 Paket 7, Plan §10).
 *
 * ── ES IST DIE FINALE ABNAHME DER EBENE 1 ────────────────────────────────
 * Session → bestätigen, Kapitel → Finale Abnahme, Foundation → Dokument: drei
 * Ebenen, drei Abnahmen (§0, Entscheidung 6). Deshalb liefert diese Route
 * WÖRTLICH dieselben Blöcke wie die Kapitel-Abnahme
 * (`brandAcceptanceSessions`), nur neunmal. Eine eigene, schlankere Form wäre
 * eine zweite Antwort auf „was steht in diesem Feld" gewesen — und spätestens
 * beim ersten veralteten Wert liefen die beiden Seiten auseinander.
 *
 * ── ÜBERSPRUNGENE KAPITEL STEHEN NICHT DRIN ──────────────────────────────
 * §10: das Dokument ist, was diese Marke IST — nicht, was sie hätte sein
 * können. Ein abgewähltes Naming hat Daten (§3e: sie bleiben liegen), aber es
 * gehört nicht zum Weg, und ein Kapitel ohne Weg hat im Dokument nichts zu
 * suchen.
 *
 * ── LESEN IST IMMER ERLAUBT ──────────────────────────────────────────────
 * Kein `canEnterBrandStep`, keine 403: gezeigt werden ausschliesslich
 * BESTÄTIGTE Werte, und die hat der Mensch selbst gesagt. Die Grenze ist
 * dieselbe wie überall in diesem Silo-Layer — `assertBrandOwnerAccess` in
 * `loadOwnedProfile` (s. `loadBrandDocumentContext`).
 *
 * ── SIE RUFT NICHTS AN ───────────────────────────────────────────────────
 * Wie die Kapitel-Abnahme: der PRÜFBLICK ist eine eigene Route und läuft NUR
 * auf Klick (§16). Ein Modell-Aufruf in einem GET wäre eine Leseroute, die
 * Geld kostet und die ein Reload beliebig oft auslöst — und dieser hier kostet
 * 5 im Eimer.
 *
 * ── `unreviewed` IST DIE ARBEITSLISTE DES PRÜFBLICKS (§7/§10) ────────────
 * Bestätigt, aber ohne Urteil: der Schliess-Aufruf ist fail-soft ausgefallen
 * (Drossel, Anbieter, Schema, KI aus). Gezählt wird die ABWESENHEIT der Marke
 * `reviewed` — „nicht da" heisst „nicht gelaufen", ein gespeichertes `false`
 * gibt es nicht (s. `BrandSlotRecord.reviewed`). Die Reihenfolge ist die der
 * REGISTRY, weil der Deckel die ersten zehn nimmt und die frühen Felder die
 * sind, an denen der Rest hängt.
 */
export default defineEventHandler(async (event): Promise<BrandDocumentResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const context = await loadBrandDocumentContext(event, userId, betaAccount)
  const { profile, stepRows, journey, allFacts, sessionStates, findings } = context

  const pathKind = profile.pathKind === 'relaunch' ? 'relaunch' : 'new'
  const team = profile.team === 'team' ? 'team' : 'solo'

  /** Die gelesenen Slots je Kapitel — EINMAL geparst, zweimal gebraucht. */
  const recordsByStep = new Map(stepRows.map(row => [row.stepKey, parseSlotRecords(row.slots)]))

  const chapters: BrandDocumentChapter[] = []
  for (const entry of journey) {
    if (entry.state === 'skipped') continue
    // DIE SECHS DESIGN-KAPITEL SIND HIER EIN ABSCHNITT, KEINE SECHS (D8).
    // Ihre Werte sind Vokabular-Ids, Hex und gerechnete Tabellen — als
    // Abnahme-Blöcke gelesen ergäben sie sechs Abschnitte voll `snappy` und
    // `#4a3123`. Sie erscheinen deshalb unten als PRESET („Visuelle
    // Identität"), so wie in Kapitel 10 der Leseansicht; abgenommen werden sie
    // weiterhin in der Werkstatt.
    if (isBrandDesignStep(entry.stepKey)) continue
    // SCHICHT 3 STEHT HIER NOCH NICHT (K0). Ohne Freischaltung ist sie
    // `skipped` und fiele schon oben heraus; die Klemme gilt dem Tag DANACH.
    // Ihre Werte sind heute weder gerendert noch beschriftet — die drei
    // Kapitel kommen mit K5 (Werkstatt) und K4 (Leseansicht) in das Dokument,
    // und zwar zusammen mit ihren Blöcken. Ein Abschnitt aus rohen
    // Katalog-Ids wäre dieselbe Falle wie bei Schicht 2 vor D8.
    if (isBrandKitStep(entry.stepKey)) continue
    const row = stepRows.find(candidate => candidate.stepKey === entry.stepKey)
    const records = recordsByStep.get(entry.stepKey) ?? {}
    const openConflicts = blockingFindingSlots(
      findings,
      slotsForStep(entry.stepKey).map(session => session.id),
    )
    chapters.push({
      stepKey: entry.stepKey,
      state: entry.state,
      // Fehlt die Zeile (Datenfehler, s. `loadBrandStepContext`), steht das
      // Kapitel leer da statt die ganze Seite zu verhindern: das Dokument ist
      // eine LESE-Ansicht, und ein 404 dafür wäre die schlechtere Antwort.
      storedState: row?.state ?? 'open',
      revision: row?.revision ?? 0,
      restartedAt: row?.restartedAt ?? null,
      acceptance: brandStepAcceptance(entry.stepKey, allFacts, sessionStates, openConflicts),
      sessions: brandAcceptanceSessions({
        stepKey: entry.stepKey,
        records,
        sessionStates,
        findings,
        journey,
        pathKind,
        team,
      }),
    })
  }

  const included = new Set(chapters.map(chapter => chapter.stepKey))
  const unreviewed: string[] = []
  for (const session of BRAND_SLOTS) {
    if (session.deactivated || !included.has(session.stepId)) continue
    const record = recordsByStep.get(session.stepId)?.[session.id]
    if (brandSlotRecordConfirmed(record) && record?.reviewed !== true) unreviewed.push(session.id)
  }

  const lastRun = readBrandDocumentReview(profile.$id)

  /* Dasselbe Preset wie in der Leseansicht — eine Quelle, zwei Ansichten. */
  const design = await loadBrandDesignPreset(event, profile, stepRows)

  return {
    profileId: profile.$id,
    title: profile.title ?? '',
    chapters,
    findings,
    review: {
      unreviewed,
      ...(lastRun ? { lastRunAt: lastRun.at, lastRunRevisionKey: lastRun.revisionKey } : {}),
    },
    // Auch hier ohne die behaltenen Entwürfe (§1.11 b): das Dokument ist eine
    // LESE-Ansicht, und was sie nie zeigt, bekommt sie auch nicht geschickt.
    design: design.preset ? brandDesignSnapshotPreset(design.preset) : null,
    designStand: design.preset ? brandDesignStand(stepRows) : '',
    designKeptDrafts: design.preset?.mark.keptDrafts.length ?? 0,
  }
})
