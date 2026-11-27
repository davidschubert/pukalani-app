import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { type BrandFetcher, useBrandWorkspaceStore } from '../../app/stores/brandWorkspace'
import type { BrandStepDetailResponse, BrandStepSaveResponse } from '../../shared/types/brand'
import {
  WORKSHOP_FOREIGN_SLOT,
  WORKSHOP_FOREIGN_STEP,
  WORKSHOP_FOREIGN_VALUE,
  WORKSHOP_PROFILE_ID,
  WORKSHOP_STEP_KEY,
  workshopForeignStepDetail,
  workshopStepDetail,
} from './support/workshopFixtures'

/**
 * EINE VERSPÄTETE SPEICHER-ANTWORT ÜBERSCHREIBT NICHTS (WS2 b).
 *
 * Der Autosave schickt einen PATCH für Kapitel A, der Mensch wechselt nach B,
 * DANN kommt die Antwort für A. Sie darf Slots und `revision` von B nicht
 * anfassen — sonst stünden fremde Felder im Kapitel und der nächste Tick
 * liefe mit der Revision von A in einen Schein-Konflikt.
 *
 * Geprüft am ECHTEN Store (Render-Projekt, weil der Store Nuxt-Auto-Imports
 * braucht); die Abrufe sind gestellt.
 */
function fetcherFor(detail: BrandStepDetailResponse): BrandFetcher {
  return (async () => detail) as unknown as BrandFetcher
}

function lateResponse(): BrandStepSaveResponse {
  return {
    revision: 99,
    slots: {
      'a.lateOnly': { firstDraft: 'zu spät', latestDraft: 'zu spät', confirmed: null, confidence: null, updatedAt: null },
    },
  }
}

describe('applySaveResponse prüft Profil und Kapitel (WS2 b)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('verwirft die Antwort eines verlassenen Kapitels', async () => {
    const store = useBrandWorkspaceStore()
    await store.loadStep(WORKSHOP_PROFILE_ID, WORKSHOP_FOREIGN_STEP, fetcherFor(workshopForeignStepDetail()))
    const revisionBefore = store.revision

    const applied = store.applySaveResponse(lateResponse(), undefined, {
      profileId: WORKSHOP_PROFILE_ID,
      stepKey: WORKSHOP_STEP_KEY,
    })

    expect(applied).toBe(false)
    expect(store.stepKey).toBe(WORKSHOP_FOREIGN_STEP)
    expect(store.revision).toBe(revisionBefore)
    expect(store.serverSlots[WORKSHOP_FOREIGN_SLOT]?.confirmed).toBe(WORKSHOP_FOREIGN_VALUE)
    expect(store.serverSlots['a.lateOnly']).toBeUndefined()
  })

  it('verwirft die Antwort eines anderen Brandings mit demselben Kapitel', async () => {
    const store = useBrandWorkspaceStore()
    await store.loadStep('anderes-branding', WORKSHOP_STEP_KEY, fetcherFor(workshopStepDetail()))
    const revisionBefore = store.revision

    const applied = store.applySaveResponse(lateResponse(), undefined, {
      profileId: WORKSHOP_PROFILE_ID,
      stepKey: WORKSHOP_STEP_KEY,
    })

    expect(applied).toBe(false)
    expect(store.revision).toBe(revisionBefore)
    expect(store.serverSlots['a.lateOnly']).toBeUndefined()
  })

  it('übernimmt die Antwort, solange Profil und Kapitel stimmen', async () => {
    const store = useBrandWorkspaceStore()
    await store.loadStep(WORKSHOP_PROFILE_ID, WORKSHOP_STEP_KEY, fetcherFor(workshopStepDetail()))

    const applied = store.applySaveResponse(lateResponse(), undefined, {
      profileId: WORKSHOP_PROFILE_ID,
      stepKey: WORKSHOP_STEP_KEY,
    })

    expect(applied).toBe(true)
    expect(store.revision).toBe(99)
    expect(store.serverSlots['a.lateOnly']?.latestDraft).toBe('zu spät')
  })
})
