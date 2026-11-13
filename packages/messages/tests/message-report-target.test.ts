import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRoute } from './support/messageRouteHarness'

/**
 * SEC-031 — MELDEN KANN MAN NUR, WAS MAN SELBST LESEN KANN (P05, 2026-11-13).
 *
 * Die Melde-Probe für private Nachrichten liest über die Moderations-Klinke
 * (die Zeile trägt kein Leserecht für die Community). „Gibt es die Zeile?"
 * wäre damit für jede Id der Community wahr — und die erste Meldung friert
 * den Text in die Moderations-Ansicht ein. Die Probe sagt deshalb nur dann Ja,
 * wenn das meldende Konto am Gespräch teilnimmt; sonst dieselbe Antwort wie
 * für eine Id, die es nicht gibt.
 *
 * Bestand des Prüfstands: `msg-1` liegt im Gespräch des Mitglieds, `msg-2` in
 * einem Gespräch zweier ANDERER Konten derselben Community.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

function probe(messageId: string) {
  return async () => {
    const { messageExists } = await import('../server/utils/messageReports')
    return { default: (event: H3Event) => messageExists(event, messageId) }
  }
}

describe('Melde-Probe für private Nachrichten', () => {
  it('Nachricht aus dem eigenen Gespräch: meldbar', async () => {
    const run = await runRoute<boolean>(probe('msg-1'), { who: 'member' })
    expect(run.result).toBe(true)
  })

  it('Nachricht aus einem fremden Gespräch derselben Community: wie unbekannt', async () => {
    const foreign = await runRoute<boolean>(probe('msg-2'), { who: 'member' })
    const unknown = await runRoute<boolean>(probe('msg-gibt-es-nicht'), { who: 'member' })
    expect(foreign.result).toBe(false)
    expect(unknown.result).toBe(false)
  })

  it('ohne Konto: nie meldbar', async () => {
    const run = await runRoute<boolean>(probe('msg-1'), { who: 'guest' })
    expect(run.result).toBe(false)
  })
})
