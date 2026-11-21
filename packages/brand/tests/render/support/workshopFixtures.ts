import { resolveBrandJourney, resolveSessionStates } from '../../../shared/brandJourney'
import type { BrandProfileFacts } from '../../../shared/brandJourney'
import { affectsView } from '../../../shared/brandSessions'
import { type BrandStepKey, slotsForStep } from '../../../shared/slotRegistry'
import type {
  BrandGenerationVersionsResponse,
  BrandMessagesResponse,
  BrandProfileDetailResponse,
  BrandProfileListResponse,
  BrandProfileSummary,
  BrandSessionView,
  BrandSiteAnalyzeResponse,
  BrandStepDetailResponse,
} from '../../../shared/types/brand'

/**
 * GESTELLTE ANTWORTEN FÜR DEN WERKSTATT-RAUCH-TEST (Q21).
 *
 * Kein Netz, keine Datenbank, keine KI: die drei Abrufe, mit denen die Seite
 * startet (Profil, Kapitel, Liste) und der Gesprächs-Verlauf werden aus den
 * GETEILTEN Regeln gebaut, die auch die Server-Routen benutzen
 * (`resolveBrandJourney`, `resolveSessionStates`, `affectsView`) — die Seite
 * sieht dieselbe Form wie im Betrieb, ohne dass hier eine zweite, handgeschriebene
 * Wahrheit über Kapitel-Zustände entsteht.
 *
 * Der Verlauf hat EINEN Zug von George: eine stumme Session löste im Browser
 * den Eröffnungszug aus, und der ruft die KI.
 */
export const WORKSHOP_PROFILE_ID = 'render-profile'
export const WORKSHOP_STEP_KEY: BrandStepKey = 'context'
export const WORKSHOP_TITLE = 'Render-Probe GmbH'
export const WORKSHOP_GEORGE_LINE = 'Erzählt mir, wie alles angefangen hat.'
/** Mit Adresse in der Startkarte zeigt das Kapitel `context` den Website-Streifen. */
export const WORKSHOP_SITE_URL = 'https://render-probe.example'

const NOW = '2026-11-21T10:00:00.000Z'

const FACTS: BrandProfileFacts = {
  pathKind: 'new',
  relaunchScope: null,
  hasName: true,
  team: 'solo',
  subBrands: 'no',
  namingOpted: false,
  designUnlockedAt: null,
  derivationUnlocked: false,
}

const STEP_FACTS = [{ stepKey: WORKSHOP_STEP_KEY, state: 'active' as const, confidence: null, slots: {} }]

export function workshopProfileSummary(): BrandProfileSummary {
  return {
    id: WORKSHOP_PROFILE_ID,
    title: WORKSHOP_TITLE,
    contentLocale: 'de',
    ownerType: 'user',
    ownerId: 'render-user',
    pathKind: FACTS.pathKind,
    relaunchScope: null,
    hasName: true,
    namingOpted: false,
    team: 'solo',
    subBrands: 'no',
    startCard: { websiteUrl: WORKSHOP_SITE_URL, industry: 'Design', about: 'Wir bauen Marken.', audience: 'Kleine Firmen' },
    siteAnalysis: { url: WORKSHOP_SITE_URL, analyzedAt: '', textLength: 0, stale: false },
    progressPct: 0,
    currentStepKey: WORKSHOP_STEP_KEY,
    lastActivityAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    hasActiveShare: false,
    designUnlockedAt: null,
    derivationUnlocked: false,
  }
}

export function workshopProfileDetail(): BrandProfileDetailResponse {
  return {
    profile: workshopProfileSummary(),
    story: { body: '', generatedAt: null, editedByUser: false, inputHash: '' },
    journey: [...resolveBrandJourney(FACTS, STEP_FACTS)],
    steps: [{
      stepKey: WORKSHOP_STEP_KEY,
      storedState: 'active',
      revision: 1,
      confidence: null,
      startedAt: NOW,
      completedAt: null,
      activeSeconds: 0,
    }],
  }
}

export function workshopProfileList(): BrandProfileListResponse {
  return { profiles: [workshopProfileSummary()] }
}

/**
 * Die Ableitung „Kategorie" mit einer ERSTEN FASSUNG: so zeigt ihre Karte
 * auf der Bühne „Frühere Fassungen" (`showVersions` = erzeugbar UND Historie).
 * Der Test öffnet sie über die Adresse (`?s=a.category`); bereit ist sie, weil der Startbogen eine Branche nennt.
 */
export const WORKSHOP_VERSIONS_SLOT = 'a.category'
export const WORKSHOP_FIRST_DRAFT = 'Markenberatung für kleine Firmen'
export const WORKSHOP_OLDER_DRAFT = 'Design-Studio'

export function workshopStepDetail(): BrandStepDetailResponse {
  const journey = resolveBrandJourney(FACTS, STEP_FACTS)
  const step = journey.find(entry => entry.stepKey === WORKSHOP_STEP_KEY)!
  const states = resolveSessionStates(FACTS, STEP_FACTS)
  const sessions: Record<string, BrandSessionView> = {}
  for (const session of slotsForStep(WORKSHOP_STEP_KEY)) {
    sessions[session.id] = {
      state: states[session.id] ?? 'locked',
      kind: session.kind,
      effort: session.effort,
      sensitivity: session.sensitivity,
      affects: affectsView(session.id, journey),
      accepted: false,
      deferred: false,
      reviewed: false,
    }
  }
  // Das Entwurfs-Feld ist offen (sonst führt die Adresse `?s=` nicht
  // hinein) und trägt ihre erste Fassung.
  sessions[WORKSHOP_VERSIONS_SLOT] = { ...sessions[WORKSHOP_VERSIONS_SLOT]!, state: 'open' }
  const slots: BrandStepDetailResponse['slots'] = {
    [WORKSHOP_VERSIONS_SLOT]: {
      firstDraft: WORKSHOP_FIRST_DRAFT,
      latestDraft: WORKSHOP_FIRST_DRAFT,
      confirmed: null,
      confidence: null,
      updatedAt: NOW,
    },
  }
  return {
    profileId: WORKSHOP_PROFILE_ID,
    stepKey: WORKSHOP_STEP_KEY,
    storedState: 'active',
    revision: 1,
    confidence: null,
    inputHash: '',
    startedAt: NOW,
    completedAt: null,
    restartedAt: null,
    activeSeconds: 0,
    slots,
    sessions,
    findings: [],
    generations: { items: [], count: 0 },
    progress: step.progress,
    missingRequired: [...step.missingRequired],
    sourceValues: {},
  }
}

export function workshopSiteAnalyzed(): BrandSiteAnalyzeResponse {
  return {
    analyzed: true,
    title: 'Render-Probe',
    description: '',
    textLength: 4321,
    analyzedAt: NOW,
  }
}

export function workshopMessages(sessionKey: string): BrandMessagesResponse {
  return {
    messages: [{
      id: 'render-msg-1',
      stepKey: WORKSHOP_STEP_KEY,
      sessionKey,
      role: 'george',
      body: WORKSHOP_GEORGE_LINE,
      parts: null,
      generationId: null,
      createdAt: NOW,
    }],
    cursor: null,
    hasMore: false,
  }
}

/** Die Historie eines Felds (`GET …/generations?slotId=`): eine ältere Fassung plus die erste. */
export function workshopVersions(slotId: string): BrandGenerationVersionsResponse {
  return {
    slotId,
    items: [{
      generationId: 'render-gen-1',
      slotId,
      schemaVersion: 1,
      promptVersion: 'v1',
      model: 'render-model',
      provider: 'render',
      locale: 'de',
      inputHash: '',
      createdAt: NOW,
      draft: WORKSHOP_OLDER_DRAFT,
    }],
    count: 1,
    firstDraft: WORKSHOP_FIRST_DRAFT,
    latestDraft: WORKSHOP_FIRST_DRAFT,
  }
}

/** Ein fremdes Kapitel für den Log: aufgeklappt zeigt es seine Felder lesend. */
export const WORKSHOP_FOREIGN_STEP: BrandStepKey = 'pvm'
export const WORKSHOP_FOREIGN_SLOT = 'b.whyStarted'
export const WORKSHOP_FOREIGN_VALUE = 'Weil Marken Ordnung brauchen.'

export function workshopForeignStepDetail(): BrandStepDetailResponse {
  return {
    ...workshopStepDetail(),
    stepKey: WORKSHOP_FOREIGN_STEP,
    sessions: {},
    slots: {
      [WORKSHOP_FOREIGN_SLOT]: {
        firstDraft: null,
        latestDraft: null,
        confirmed: WORKSHOP_FOREIGN_VALUE,
        confidence: null,
        updatedAt: NOW,
      },
    },
  }
}
