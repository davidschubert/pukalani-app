import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  type BrandJourneyStep,
  type BrandSessionState,
  type BrandStepAcceptance,
  type BrandStepFacts,
  brandStepAcceptance,
  mergeBrandSlotFacts,
  resolveBrandJourney,
} from '../../shared/brandJourney'
import { blockingFindingSlots } from '../../shared/brandFindings'
import {
  type BrandRestartImpact,
  brandRestartImpact,
  affectsView,
} from '../../shared/brandSessions'
import {
  type BrandPathKind,
  type BrandSlot,
  type BrandSlotStateFacts,
  type BrandStepKey,
  type BrandTeamKind,
  exampleKeyFor,
  slotById,
  slotLabelKeyFor,
  slotsForStep,
} from '../../shared/slotRegistry'
import type { BrandAcceptanceSessionView, BrandFindingView } from '../../shared/types/brand'
import { listBrandFindings, toBrandFindingView } from './brandFindingsStore'
import {
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepContext,
  type BrandStepRow,
  brandSlotRecordConfirmed,
  loadBrandStepContext,
  loadOwnedProfile,
  loadStepRows,
  parseSlotRecords,
  profileFacts,
  requireProfileIdParam,
  resolveBrandSessionStates,
  toSlotFacts,
  toStepFacts,
} from './brandStore'

/**
 * DER GEMEINSAME UNTERBAU DER ABNAHME-ROUTEN (Plan §5a) — abnehmen, vertagen,
 * die Seite lesen, „Nochmal von vorn" ankündigen und ausführen.
 *
 * ── WARUM DIE FÜNF DENSELBEN EINSTIEG BRAUCHEN ────────────────────────────
 * Jede von ihnen stellt dieselben vier Fragen in derselben Reihenfolge: wem
 * gehört das Profil, welches Kapitel, wie steht JEDE Session (das ist eine
 * Rechnung über ALLE Kapitel, nicht über die eine Zeile) und was steht der
 * Abnahme im Weg. Stünde die Kette in jeder Route, wäre sie fünfmal da und
 * irgendwann dreimal richtig — genau die Begründung, aus der auch
 * `loadBrandStepContext` entstanden ist. Diese Datei legt nur die
 * Session-Ebene darüber.
 *
 * ── DIE KONFLIKTE SIND SEIT PAKET 4 ECHT ──────────────────────────────────
 * Bis Paket 3b war `openConflicts` immer leer und der Parameter ein Haken für
 * später. Jetzt kommt er aus `brand_findings`: jeder OFFENE `conflict`, an dem
 * ein Feld dieses Kapitels beteiligt ist, sperrt die Finale Abnahme (§5a
 * Schritt 3). Die Rechnung dahinter ist pur (`blockingFindingSlots`), das
 * Laden ist FAIL-SOFT (`listBrandFindings`) — eine Abnahme-Seite, die wegen
 * einer klemmenden Nebentabelle nicht mehr lädt, hätte einen Menschen für eine
 * Zugabe ausgesperrt.
 *
 * Gefiltert wird über die SLOTS und nicht über `brand_findings.stepKey`: der
 * Stempel sagt, wo ein Befund ENTSTANDEN ist, gesperrt wird aber jedes
 * Kapitel, dessen Feld daran hängt. Ein Konflikt zwischen B und C sperrt beide.
 */
export const BRAND_OPEN_CONFLICTS_NONE: readonly string[] = []

export interface BrandAcceptanceDerivation {
  /** Die Slot-Fakten ALLER Kapitel — die Grundlage jeder Session-Rechnung. */
  allFacts: Record<string, BrandSlotStateFacts | undefined>
  sessionStates: Readonly<Record<string, BrandSessionState>>
  acceptance: BrandStepAcceptance
}

export interface BrandAcceptanceContext extends BrandStepContext, BrandAcceptanceDerivation {
  /** Die gelesenen Slot-Datensätze DIESES Kapitels. */
  records: Record<string, BrandSlotRecord>
  stepFacts: BrandStepFacts[]
  /** ALLE offenen Befunde des Brandings — kapitelübergreifend, wie die Tabelle. */
  findings: BrandFindingView[]
  /** Die davon, die ein Feld DIESES Kapitels sperren (§5a Schritt 3). */
  openConflicts: string[]
}

export async function loadBrandAcceptanceContext(
  event: H3Event,
  userId: string,
  betaAccount: boolean,
): Promise<BrandAcceptanceContext> {
  const context = await loadBrandStepContext(event, userId, betaAccount)
  const records = parseSlotRecords(context.stepRow.slots)
  const stepFacts = toStepFacts(context.stepRows)
  const findings = (await listBrandFindings(event, context.profile.$id, 'open')).map(toBrandFindingView)
  const openConflicts = blockingFindingSlots(
    findings,
    slotsForStep(context.stepKey).map(session => session.id),
  )
  return {
    ...context,
    records,
    stepFacts,
    findings,
    openConflicts,
    // `context.betaAccount` und nicht das Argument: der Kontext ist ab hier
    // die eine Quelle für alles, was hinter dem Eintritt gerechnet wird.
    ...deriveBrandAcceptance(
      context.profile, context.stepKey, stepFacts, context.betaAccount, openConflicts,
    ),
  }
}

/**
 * DIE RECHNUNG SELBST, ohne Laden — damit eine Route sie NACH ihrem Schreiben
 * mit den neuen Fakten wiederholen kann, ohne die Zeile erneut zu lesen. Ein
 * zweiter Lesevorgang wäre eine zweite Wahrheit über denselben Augenblick.
 */
export function deriveBrandAcceptance(
  profile: BrandProfileRow,
  stepKey: BrandStepKey,
  stepFacts: readonly BrandStepFacts[],
  /**
   * Die Beta-Tatsache des Aufrufers (K1) — sie steht VOR `openConflicts` und
   * ist ohne Vorgabewert: `resolveBrandSessionStates` rechnet über die Journey,
   * und die kennt seit Schicht 3 eine Sperre, die nicht an der Zeile hängt
   * (§2.8). Ein Default `false` hätte einem Beta-Konto still die Sessions der
   * dritten Schicht verborgen (`brandSessions.ts`, HIDDEN_REASONS).
   */
  betaAccount: boolean,
  openConflicts: readonly string[] = BRAND_OPEN_CONFLICTS_NONE,
): BrandAcceptanceDerivation {
  const allFacts = mergeBrandSlotFacts(stepFacts)
  const sessionStates = resolveBrandSessionStates(profileFacts(profile, betaAccount), stepFacts)
  const acceptance = brandStepAcceptance(stepKey, allFacts, sessionStates, openConflicts)
  return { allFacts, sessionStates, acceptance }
}

/**
 * Die Fakten der Kapitel-Zeile durch einen NEUEN Stand ersetzen — die Form, in
 * der eine Route ihre eigene Schreibung in die Gesamtrechnung einsetzt.
 */
export function withStepSlotFacts(
  stepFacts: readonly BrandStepFacts[],
  stepKey: BrandStepKey,
  records: Record<string, BrandSlotRecord>,
): BrandStepFacts[] {
  return stepFacts.map(facts => (facts.stepKey === stepKey
    ? { ...facts, slots: toSlotFacts(records) }
    : facts))
}

/**
 * DIE BLÖCKE EINES KAPITELS (Plan §5a Schritt 1) — EINE Rechnung, ZWEI Leser.
 *
 * ── WARUM SIE HIER STEHT UND NICHT IN DER ABNAHME-ROUTE ──────────────────
 * Seit Paket 7 gibt es dieselbe Liste zweimal: die Finale Abnahme zeigt SIE
 * für ein Kapitel, das Dokument (§10) für alle neun. Das Dokument IST die
 * Finale Abnahme der Ebene 1 — eine zweite, schlankere Zeilenform hätte
 * zwangsläufig eine zweite Antwort auf „was steht in diesem Feld", und
 * spätestens beim ersten veralteten Wert liefen die Seiten auseinander.
 *
 * ── SCHLÜSSEL STATT TEXT, BEISPIELE ALS TEXT ─────────────────────────────
 * `labelKey`/`questionKey`/`exampleKey` sind i18n-Schlüssel: WIE etwas heisst,
 * entscheiden die Locale-Dateien. Das `example` ist INHALT aus der Registry
 * (Davids Gate, `sessionContent.ts`) und steht dort in beiden Sprachen — welche
 * gilt, weiss der Browser besser. Ob es GEZEIGT wird, entscheidet ebenfalls die
 * Oberfläche: die Abnahme zeigt es (dort wird gelernt), das Dokument nicht
 * (dort steht die Marke).
 */
export interface BrandAcceptanceSessionsInput {
  stepKey: BrandStepKey
  /** Die Slot-Datensätze DIESES Kapitels. */
  records: Record<string, BrandSlotRecord>
  /** Die Session-Zustände ALLER Kapitel (eine Session liest über Grenzen). */
  sessionStates: Readonly<Record<string, BrandSessionState>>
  /** ALLE offenen Befunde des Brandings — gefiltert wird je Block. */
  findings: readonly BrandFindingView[]
  /** Für die Kapitel-Reihenfolge in `affects.steps`. */
  journey: readonly BrandJourneyStep[]
  pathKind: BrandPathKind
  team: BrandTeamKind
}

export function brandAcceptanceSessions(
  input: BrandAcceptanceSessionsInput,
): BrandAcceptanceSessionView[] {
  return slotsForStep(input.stepKey).map((session) => {
    const record = input.records[session.id]
    return {
      slotId: session.id,
      kind: session.kind,
      required: session.required,
      state: input.sessionStates[session.id] ?? 'locked',
      confirmed: brandSlotRecordConfirmed(record),
      accepted: record?.accepted === true,
      deferred: record?.deferred === true,
      allowDefer: session.answers.allowDefer,
      // Der BESTÄTIGTE Wert, nicht der Entwurf: beide Seiten zeigen das
      // Dokument, nicht die Werkstatt. Eine optionale Session ohne Wert steht
      // grau mit ihrem Beispiel da (§5a Schritt 1).
      value: record?.confirmed ?? '',
      // Die Notiz des Schliess-Aufrufs (§4) — hier steht auch der Grund einer
      // abgelehnten Befund-Meldung (§8).
      notes: record?.notes ?? '',
      // Die OFFENEN Befunde, an denen GENAU DIESES Feld beteiligt ist. Ein
      // Konflikt hat zwei Felder und erscheint deshalb an beiden Blöcken —
      // gewollt: er verbindet sie, und wer ihn an einer Stelle entscheidet,
      // entscheidet ihn für beide.
      findings: input.findings.filter(view => view.slots.includes(session.id)),
      labelKey: `brand.labels.${session.id}`,
      // `slotLabelKeyFor` und nicht `questionKeyFor`: dieselbe Rechnung, die
      // Bühne und Log für den Rückfall „kein Kurz-Label" machen. Sie hält
      // `d.gapReveal` beim Basis-Schlüssel (die angemeldete Relaunch-Fassung
      // steht bis heute nicht im Katalog) und nimmt umgekehrt auch die
      // Solo-Fassung eines Slots mit, der nicht `question`/`choice` ist
      // (`d.pairs`). Vorher konnte hier ein Schlüssel entstehen, den nur der
      // Rückfall auf `labelKey` unsichtbar hielt.
      questionKey: slotLabelKeyFor(session, input.pathKind, input.team),
      // Nur Menschenfragen haben eine Beispiel-ANTWORT im Katalog; Auswahlen
      // haben Chips statt Freitext (s. `exampleKeyFor`).
      exampleKey: session.type === 'question' ? exampleKeyFor(session, input.pathKind, input.team) : null,
      example: {
        de: [...session.examples[input.pathKind].de],
        en: [...session.examples[input.pathKind].en],
      },
      // Nur ERREICHBARE Kapitel (gesperrtes Brand Design fällt heraus) —
      // pure Regel `affectsView`, s. dort.
      affects: affectsView(session.id, input.journey),
    }
  })
}

/**
 * DER EINSTIEG DER DOKUMENT-ROUTEN (Plan §10) — dasselbe wie
 * `loadBrandAcceptanceContext`, nur OHNE Kapitel.
 *
 * ── WARUM NICHT `loadBrandStepContext` ───────────────────────────────────
 * Der verlangt einen `stepKey` aus der Adresse, prüft den Eintritt in dieses
 * eine Kapitel und wirft 403, wenn es gesperrt ist. Das Dokument hat keinen
 * Schlüssel und kennt diese Sperre nicht: LESEN ist immer erlaubt (§10 — es
 * zeigt ausschliesslich BESTÄTIGTE Werte, und was bestätigt ist, hat der Mensch
 * selbst gesagt). Die Grenze bleibt dieselbe wie überall in diesem Silo-Layer:
 * `assertBrandOwnerAccess` in `loadOwnedProfile`.
 *
 * ── EINE ABFRAGE MEHR ALS NÖTIG GIBT ES HIER NICHT ───────────────────────
 * Neun Kapitel-Zeilen kommen mit EINEM `listRows` (Limit 9), die Befunde mit
 * einem zweiten. Alles Weitere — Journey, Session-Zustände, Abnahme-Zähler —
 * ist Rechnung über dem, was schon im Speicher liegt.
 */
export interface BrandDocumentContext {
  profile: BrandProfileRow
  stepRows: BrandStepRow[]
  stepFacts: BrandStepFacts[]
  journey: readonly BrandJourneyStep[]
  /** Die Slot-Fakten ALLER Kapitel. */
  allFacts: Record<string, BrandSlotStateFacts | undefined>
  sessionStates: Readonly<Record<string, BrandSessionState>>
  /** ALLE offenen Befunde des Brandings. */
  findings: BrandFindingView[]
}

export async function loadBrandDocumentContext(
  event: H3Event,
  userId: string,
  betaAccount: boolean,
): Promise<BrandDocumentContext> {
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const stepRows = await loadStepRows(event, profileId)
  const stepFacts = toStepFacts(stepRows)
  const facts = profileFacts(profile, betaAccount)
  const journey = resolveBrandJourney(facts, stepFacts)
  const findings = (await listBrandFindings(event, profileId, 'open')).map(toBrandFindingView)

  return {
    profile,
    stepRows,
    stepFacts,
    journey,
    allFacts: mergeBrandSlotFacts(stepFacts),
    sessionStates: resolveBrandSessionStates(facts, stepFacts),
    findings,
  }
}

/**
 * DIE SESSION AUS DER ADRESSZEILE — geprüft gegen die Registry UND gegen das
 * Kapitel, bevor irgendetwas wirkt.
 *
 * 404 und nicht 400: eine Session, die es in diesem Kapitel nicht gibt, ist
 * für diese Adresse schlicht nicht da — dieselbe Antwort wie bei einem
 * unbekannten `stepKey` eine Ebene darüber.
 */
export function requireSessionParam(event: H3Event, stepKey: BrandStepKey): BrandSlot {
  const slotId = getRouterParam(event, 'slotId')
  const slot = slotId ? slotById(slotId) : undefined
  if (!slot || slot.deactivated || slot.stepId !== stepKey) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }
  return slot
}

/** Derselbe Trenner wie im Generations-Hash — in keiner Slot-Id möglich. */
const SEPARATOR = '\u0000'

/**
 * DER ACK-HASH DER RESTART-HÜLLE (§5a Schritt 2).
 *
 * Er bindet DREI Dinge zusammen: das Kapitel, seine `revision` und die
 * sortierte Liste der bestätigten Felder, die daran hängen. Bewegt sich eines
 * davon zwischen dem Zeigen und dem Klick, passt der zurückgetragene Wert
 * nicht mehr — und der Mensch bekommt die neue Hülle zu sehen, statt etwas zu
 * löschen, das er so nie angekündigt bekam.
 *
 * SORTIERT und nicht in Registry-Reihenfolge: der Hash ist eine Aussage über
 * die MENGE, nicht über ihre Anzeige. Getrennt wird mit U+0000 wie im
 * Generations-Hash — ein Zeichen, das in keiner Slot-Id vorkommen kann.
 */
export function brandRestartAck(
  stepKey: BrandStepKey,
  revision: number,
  sessions: readonly string[],
): string {
  const canonical = [stepKey, String(revision), ...[...sessions].sort()].join(SEPARATOR)
  return createHash('sha256').update(canonical).digest('hex')
}

export interface BrandRestartImpactView {
  stepKey: BrandStepKey
  revision: number
  chapter: { values: number, notes: number, accepted: number }
  downstream: { byStep: Partial<Record<BrandStepKey, string[]>>, count: number }
  ack: string
}

/**
 * WAS DER SCHUTZ-LAYER ZEIGT — die Zahlen dieses Kapitels plus die Hülle der
 * späteren. Gezählt wird der bestätigte WERT und nicht der Entwurf: ein
 * Entwurf, dem niemand zugestimmt hat, ist kein Verlust, den man ankündigt.
 */
export function brandRestartImpactView(
  stepKey: BrandStepKey,
  revision: number,
  records: Record<string, BrandSlotRecord>,
  allFacts: Record<string, BrandSlotStateFacts | undefined>,
): BrandRestartImpactView {
  const own = Object.values(records)
  const impact: BrandRestartImpact = brandRestartImpact(stepKey, allFacts)
  const byStep: Partial<Record<BrandStepKey, string[]>> = {}
  for (const [key, ids] of Object.entries(impact.byStep)) {
    byStep[key as BrandStepKey] = [...(ids ?? [])]
  }
  return {
    stepKey,
    revision,
    chapter: {
      values: own.filter(record => (record.confirmed ?? '').length > 0).length,
      notes: own.filter(record => (record.notes ?? '').length > 0).length,
      accepted: own.filter(record => record.accepted === true).length,
    },
    downstream: { byStep, count: impact.count },
    ack: brandRestartAck(stepKey, revision, impact.sessions),
  }
}
