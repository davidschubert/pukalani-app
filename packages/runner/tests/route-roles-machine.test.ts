import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_ID,
  describeRunnerMachineRoute,
  OWN_RUN,
  probeMachineRoute,
} from './support/runnerMachineHarness'

/**
 * ROLLEN-PROBEN FÜR DIE LESENDEN MASCHINEN-ROUTEN DES AI-RUNNERS (OPS-009).
 *
 * Diese Routen ruft der Runner selbst — mit seinem Bearer-Ausweis, nie mit
 * einer Sitzung. Jede ist an EINEN Lauf gebunden: ein richtiger Ausweis
 * öffnet nur die Läufe, die auf diesen Runner geclaimt sind. Die Fragen
 * stehen in `support/runnerMachineHarness.ts`; hier dazu, was der Runner
 * bei einem erlaubten Aufruf bekommt.
 */

const loadFiles = () => import('../server/api/runner/runs/[id]/files.get')
const loadFile = () => import('../server/api/runner/runs/[id]/files/[fileId].get')
const loadSessionEnd = () => import('../server/api/runner/runs/[id]/session-end.get')

describeRunnerMachineRoute('GET /api/runner/runs/:id/files', loadFiles, { params: { id: OWN_RUN } })

describeRunnerMachineRoute('GET /api/runner/runs/:id/files/:fileId', loadFile, { params: { id: OWN_RUN, fileId: ATTACHMENT_ID } })

describeRunnerMachineRoute('GET /api/runner/runs/:id/session-end', loadSessionEnd, { params: { id: OWN_RUN } })

describe('Maschinen-Routen — was ein erlaubter Aufruf bekommt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Anhänge: die Liste des eigenen Laufs', async () => {
    const run = await probeMachineRoute(loadFiles, { credential: 'own', params: { id: OWN_RUN } })
    expect(run.result).toMatchObject({ attachments: [{ fileId: ATTACHMENT_ID }] })
  })

  it('Anhang: die Datei wird gelesen', async () => {
    const run = await probeMachineRoute(loadFile, { credential: 'own', params: { id: OWN_RUN, fileId: ATTACHMENT_ID } })
    expect(run.status).toBe(200)
    expect(run.fileRead).toBe(true)
  })

  it('Anhang, der nicht zum Lauf gehört: 404, keine Datei gelesen', async () => {
    const run = await probeMachineRoute(loadFile, { credential: 'own', params: { id: OWN_RUN, fileId: 'f-anderer' } })
    expect(run.status).toBe(404)
    expect(run.fileRead).toBe(false)
  })

  it('Sitzungsende: ohne Markierung noch nicht beendet', async () => {
    const run = await probeMachineRoute(loadSessionEnd, { credential: 'own', params: { id: OWN_RUN } })
    expect(run.result).toMatchObject({ ended: false, status: 'running' })
  })
})
