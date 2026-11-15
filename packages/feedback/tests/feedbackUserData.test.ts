import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DIE AUSKUNFT DEGRADIERT SICHTBAR (SEC-026, 2026-11-15).
 *
 * Ist das Control Plane nicht erreichbar oder scheitert der Aufruf, bleibt die
 * Auskunft bestehen (dokumentierte Entscheidung: eine Auskunft ohne einen Teil
 * ist besser als keine) — aber der Abschnitt sagt `{ unavailable: true }`.
 * Vorher stand dort `{}`, und das las sich wie „diese Person hat kein
 * Feedback". Die Löschung bleibt dagegen strikt.
 */

let reachable: boolean
let callResult: () => Promise<unknown>

vi.mock('../server/utils/feedbackGateway', () => ({
  feedbackServiceReachable: async () => reachable,
  callFeedbackService: async () => await callResult(),
}))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteProjectId: 'account' } }))

const { feedbackDeleteUserData, feedbackExportUserData } = await import('../server/utils/feedbackUserData')
const event = {} as H3Event

beforeEach(() => {
  reachable = true
  callResult = async () => ({ customerFeedback: [] })
})

describe('feedbackExportUserData', () => {
  it('Control Plane nicht konfiguriert ⇒ unavailable statt leer', async () => {
    reachable = false
    expect(await feedbackExportUserData(event, 'u1')).toEqual({ unavailable: true })
  })

  it('Aufruf scheitert ⇒ unavailable statt leer', async () => {
    callResult = async () => { throw new Error('502') }
    expect(await feedbackExportUserData(event, 'u1')).toEqual({ unavailable: true })
  })

  it('Erfolg ⇒ die Antwort des Control Plane, unverändert', async () => {
    expect(await feedbackExportUserData(event, 'u1')).toEqual({ customerFeedback: [] })
  })
})

describe('feedbackDeleteUserData', () => {
  it('bleibt strikt: ein Fehler kommt beim Orchestrator an', async () => {
    callResult = async () => { throw new Error('502') }
    await expect(feedbackDeleteUserData(event, 'u1')).rejects.toThrow('502')
  })
})
