import { describe, expect, it } from 'vitest'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import {
  BRAND_RUN_NOTICE_MS,
  BRAND_RUN_OUTCOMES,
  BRAND_RUN_PROFILE_SCOPES,
  BRAND_RUN_SCOPES,
  brandRunNoticeDue,
  brandRunOwesRefund,
  brandRunQuota,
  emptyBrandRunDetail,
  noBrandRunView,
  parseBrandRunDetail,
  runningBrandRunSubjects,
  toBrandRunView,
} from '../shared/brandRun'

/**
 * EIN LAUF DES MARKENBERATERS AN SEINER ZEILE (LL1 b) — die puren Regeln:
 * was aus dem Detail gelesen wird, wie der Zähler nach einer Rückbuchung
 * aussieht, und wann ein abgebrochener Vorgänger noch eine Rückbuchung
 * schuldet.
 */

const NOW = Date.parse('2026-11-17T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

function row(input: { heartbeatAt?: string, finishedAt?: string, outcome?: string, detail?: unknown }) {
  return {
    seq: 1,
    startedAt: iso(-60_000),
    heartbeatAt: input.heartbeatAt ?? iso(-5_000),
    finishedAt: input.finishedAt ?? '',
    outcome: input.outcome ?? '',
    detail: input.detail === undefined ? '' : JSON.stringify(input.detail),
  }
}

describe('die Arten', () => {
  it('passen in die Spalte `scope` (32 Zeichen) und sind verschieden', () => {
    const scopes = Object.values(BRAND_RUN_SCOPES)
    expect(new Set(scopes).size).toBe(scopes.length)
    for (const scope of scopes) expect(scope.length).toBeLessThanOrEqual(32)
  })

  it('der öffentliche Check hängt an keiner Marke — er fehlt in der Liste „geht mit der Marke"', () => {
    expect(BRAND_RUN_PROFILE_SCOPES).not.toContain(BRAND_RUN_SCOPES.check)
    expect(BRAND_RUN_PROFILE_SCOPES).toHaveLength(4)
    // Die Dokument-Prüfung hängt an der Marke (LL1 d) — Auskunft und Löschen nehmen sie mit.
    expect(BRAND_RUN_PROFILE_SCOPES).toContain(BRAND_RUN_SCOPES.documentReview)
  })

  it('jeder gemeinsame Ausgang passt in die Spalte `outcome` (32 Zeichen)', () => {
    for (const outcome of Object.values(BRAND_RUN_OUTCOMES)) expect(outcome.length).toBeLessThanOrEqual(32)
  })
})

describe('parseBrandRunDetail — klemmt, lehnt nicht ab', () => {
  it('leer, kaputt oder fremd ⇒ sichere Vorgaben', () => {
    for (const raw of ['', null, undefined, '{', '[]', '"x"']) {
      expect(parseBrandRunDetail(raw)).toEqual(emptyBrandRunDetail())
    }
  })

  it('nur ein echtes `true` zählt, Zahlen nur ≥ 0, Texte gekürzt', () => {
    expect(parseBrandRunDetail(JSON.stringify({
      booked: 'true', refunded: 1, created: -3, used: 2.9, limit: 'drei', ref: 'x'.repeat(200), model: 7, key: 'k',
    }))).toEqual(emptyBrandRunDetail({ used: 2, ref: 'x'.repeat(64), key: 'k' }))
  })
})

describe('brandRunQuota — der sichtbare Zähler', () => {
  it('ohne Deckel zeigt der Weg keinen Zähler', () => {
    expect(brandRunQuota({ used: 2, limit: 0, refunded: false })).toBeNull()
  })

  it('nach einer Rückbuchung zählt der Lauf nicht mehr mit', () => {
    expect(brandRunQuota({ used: 2, limit: 3, refunded: false })).toEqual({ used: 2, limit: 3, remaining: 1 })
    expect(brandRunQuota({ used: 2, limit: 3, refunded: true })).toEqual({ used: 1, limit: 3, remaining: 2 })
    // Nie unter null und nie über den Deckel.
    expect(brandRunQuota({ used: 0, limit: 3, refunded: true })).toEqual({ used: 0, limit: 3, remaining: 3 })
    expect(brandRunQuota({ used: 9, limit: 3, refunded: false })).toEqual({ used: 3, limit: 3, remaining: 0 })
  })
})

describe('toBrandRunView — gegen die Server-Uhr', () => {
  it('keine Zeile ⇒ „kein Lauf"', () => {
    expect(toBrandRunView(null, NOW)).toEqual(noBrandRunView())
  })

  it('frischer Herzschlag ⇒ läuft; der Grund bleibt leer', () => {
    expect(toBrandRunView(row({ detail: { booked: true, used: 1, limit: 3 } }), NOW)).toMatchObject({
      state: 'running', failure: '', quota: { used: 1, limit: 3, remaining: 2 },
    })
  })

  it('alter Herzschlag ohne Ende ⇒ abgebrochen', () => {
    expect(toBrandRunView(row({ heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1) }), NOW).state).toBe('stalled')
  })

  it('Ende mit `done` ⇒ fertig; jedes andere Ende ⇒ gescheitert MIT seinem Grund', () => {
    expect(toBrandRunView(row({ finishedAt: iso(0), outcome: 'done', detail: { created: 4 } }), NOW))
      .toMatchObject({ state: 'done', failure: '', created: 4 })
    expect(toBrandRunView(row({ finishedAt: iso(0), outcome: 'drafts_failed', detail: { refunded: true, used: 1, limit: 3 } }), NOW))
      .toMatchObject({ state: 'failed', failure: 'drafts_failed', refunded: true, quota: { remaining: 3 } })
  })

  it('das Kennzeichen des öffentlichen Checks verlässt den Server nie', () => {
    const view = toBrandRunView(row({ detail: { key: 'geheim', ref: 'check-1' } }), NOW)
    expect(JSON.stringify(view)).not.toContain('geheim')
    expect(view.ref).toBe('check-1')
  })
})

describe('brandRunOwesRefund — nur der abgebrochene, gebuchte, leere Vorgänger', () => {
  const owed = JSON.stringify({ booked: true, created: 0 })

  it('abgebrochen + gebucht + nichts abgelegt + nicht zurückgebucht ⇒ ja', () => {
    expect(brandRunOwesRefund('stalled', owed)).toBe(true)
  })

  it('GEGENPROBEN: jeder andere Zustand und jede fehlende Bedingung ⇒ nein', () => {
    for (const state of ['none', 'running', 'failed', 'done'] as const) {
      expect(brandRunOwesRefund(state, owed)).toBe(false)
    }
    expect(brandRunOwesRefund('stalled', JSON.stringify({ booked: false, created: 0 }))).toBe(false)
    expect(brandRunOwesRefund('stalled', JSON.stringify({ booked: true, created: 1 }))).toBe(false)
    expect(brandRunOwesRefund('stalled', JSON.stringify({ booked: true, created: 0, refunded: true }))).toBe(false)
    // Kein lesbares Detail ⇒ nichts gebucht ⇒ nichts zurück.
    expect(brandRunOwesRefund('stalled', '')).toBe(false)
  })
})

describe('brandRunOwesRefund — verlorener Herzschlag (LL1 c, 2026-11-20)', () => {
  const owed = JSON.stringify({ booked: true, created: 0 })

  it('beendet mit `lease_lost` + gebucht + nichts abgelegt + nicht zurückgebucht ⇒ ja', () => {
    expect(brandRunOwesRefund('failed', owed, 'lease_lost')).toBe(true)
  })

  it('GEGENPROBEN: jeder andere Grund hat selbst entschieden; fehlende Bedingungen ⇒ nein', () => {
    for (const outcome of ['drafts_failed', 'reading_unavailable', 'failed', 'profile_gone', 'ai_endpoint_unavailable', '', null, undefined]) {
      expect(brandRunOwesRefund('failed', owed, outcome), String(outcome)).toBe(false)
    }
    // `done` ist `done`, auch wenn dort je `lease_lost` stünde.
    expect(brandRunOwesRefund('done', owed, 'lease_lost')).toBe(false)
    expect(brandRunOwesRefund('running', owed, 'lease_lost')).toBe(false)
    expect(brandRunOwesRefund('failed', JSON.stringify({ booked: false, created: 0 }), 'lease_lost')).toBe(false)
    expect(brandRunOwesRefund('failed', JSON.stringify({ booked: true, created: 1 }), 'lease_lost')).toBe(false)
    expect(brandRunOwesRefund('failed', JSON.stringify({ booked: true, created: 0, refunded: true }), 'lease_lost')).toBe(false)
  })
})

describe('toBrandRunView — der Zähler rechnet eine geschuldete Rückbuchung ein (LL1 c, 2026-11-20)', () => {
  const booked = { booked: true, created: 0, used: 3, limit: 3 }

  it('abgebrochen ohne Ergebnis ⇒ die Seite zeigt den Lauf schon wieder; `refunded` bleibt die Tatsache an der Zeile', () => {
    const view = toBrandRunView(row({ heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1), detail: booked }), NOW)
    expect(view.state).toBe('stalled')
    expect(view.refunded).toBe(false)
    expect(view.quota).toEqual({ used: 2, limit: 3, remaining: 1 })
  })

  it('Ende `lease_lost` ohne Ergebnis ⇒ ebenso', () => {
    const view = toBrandRunView(row({ finishedAt: iso(0), outcome: 'lease_lost', detail: booked }), NOW)
    expect(view.quota).toEqual({ used: 2, limit: 3, remaining: 1 })
  })

  it('GEGENPROBEN: läuft noch, hat abgelegt, eigener Grund ohne Vermerk, schon zurückgebucht ⇒ nichts doppelt', () => {
    expect(toBrandRunView(row({ detail: booked }), NOW).quota).toEqual({ used: 3, limit: 3, remaining: 0 })
    expect(toBrandRunView(row({ heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1), detail: { ...booked, created: 2 } }), NOW).quota)
      .toEqual({ used: 3, limit: 3, remaining: 0 })
    expect(toBrandRunView(row({ finishedAt: iso(0), outcome: 'drafts_failed', detail: booked }), NOW).quota)
      .toEqual({ used: 3, limit: 3, remaining: 0 })
    // Schon zurückgebucht: genau EINER zurück, nicht zwei.
    expect(toBrandRunView(row({ heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1), detail: { ...booked, refunded: true } }), NOW).quota)
      .toEqual({ used: 2, limit: 3, remaining: 1 })
  })
})

describe('brandRunNoticeDue — eine Übersicht weist nur einen Tag lang auf einen alten Lauf hin', () => {
  it('gescheitert oder abgebrochen, vor weniger als einem Tag gestartet ⇒ ja', () => {
    expect(brandRunNoticeDue({ state: 'failed', startedAt: iso(-60_000) }, NOW)).toBe(true)
    expect(brandRunNoticeDue({ state: 'stalled', startedAt: iso(-BRAND_RUN_NOTICE_MS + 1) }, NOW)).toBe(true)
  })

  it('GEGENPROBEN: älter als ein Tag, ein anderer Zustand oder ein unlesbarer Zeitpunkt ⇒ nein', () => {
    expect(brandRunNoticeDue({ state: 'failed', startedAt: iso(-BRAND_RUN_NOTICE_MS) }, NOW)).toBe(false)
    for (const state of ['none', 'running', 'done'] as const) {
      expect(brandRunNoticeDue({ state, startedAt: iso(-60_000) }, NOW)).toBe(false)
    }
    expect(brandRunNoticeDue({ state: 'failed', startedAt: '' }, NOW)).toBe(false)
  })
})

describe('runningBrandRunSubjects — die Übersicht über viele Marken (LL1 c)', () => {
  const at = (subject: string, seq: number, input: Parameters<typeof row>[0] = {}) => ({ ...row(input), subject, seq })

  it('nur Marken, deren JÜNGSTE Zeile läuft', () => {
    const running = runningBrandRunSubjects([
      at('p-laeuft', 1),
      at('p-fertig', 1, { finishedAt: iso(0), outcome: 'done' }),
      at('p-alt', 1, { heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1) }),
    ], NOW)
    expect([...running]).toEqual(['p-laeuft'])
  })

  it('ein beendeter Nachfolger schlägt den älteren, scheinbar laufenden Vorgänger — in beiden Reihenfolgen', () => {
    const older = at('p', 1)
    const newer = at('p', 2, { finishedAt: iso(0), outcome: 'done' })
    expect(runningBrandRunSubjects([older, newer], NOW).size).toBe(0)
    expect(runningBrandRunSubjects([newer, older], NOW).size).toBe(0)
    expect([...runningBrandRunSubjects([at('p', 1, { finishedAt: iso(0), outcome: 'failed' }), at('p', 2)], NOW)]).toEqual(['p'])
  })

  it('keine Zeilen ⇒ keine Marke', () => {
    expect(runningBrandRunSubjects([], NOW).size).toBe(0)
  })
})
