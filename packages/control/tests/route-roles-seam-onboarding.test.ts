import { afterEach, describe, expect, it } from 'vitest'
import { ABUSE_REPORTS_TABLE } from '../shared/abuseReports'
import { INVITE_REQUESTS_TABLE } from '../shared/types/inviteRequest'
import {
  COMMUNITY_ID,
  describeSeamSecret,
  probeControlRoute,
  resetControlWorld,
  type ControlProbe,
} from './support/controlRouteHarness'

/**
 * ÖFFENTLICHE NAHT-ROUTEN: MELDUNG, TRICHTER-VORPRÜFUNG, ANFRAGE
 * (OPS-009, BT1 b).
 *
 * Diese Routen nehmen Eingaben von Menschen OHNE Konto an — die Platform-App
 * reicht ein Formular durch. Ihre eine Entscheidung ist das Geheimnis der
 * Naht: es beweist, dass der Aufruf aus unserem Deployment kommt (und dort
 * Bremse und Bot-Prüfung schon liefen). Eine Sitzung, auch die des
 * Betreibers, ersetzt es nicht. Dahinter: was sie ohne Konto annehmen und was
 * sie ablehnen.
 *
 * Echte Handler, echte Wache, nachgebaute Ablage; Mail und Benachrichtigung
 * werden nur entgegengenommen (Prüfstand `support/controlRouteHarness.ts`).
 */

afterEach(resetControlWorld)

const report = () => import('../server/api/control/abuse-reports/index.post')
const gate = () => import('../server/api/control/onboarding/gate.post')
const precheck = () => import('../server/api/control/onboarding/precheck.post')
const request = () => import('../server/api/control/onboarding/request.post')

/** Mail und Benachrichtigung: werden hier nur entgegengenommen, nicht geprüft. */
function outbox(): ControlProbe['globals'] {
  return {
    sendMail: async () => true,
    notify: async () => {},
    listOperatorIds: async () => [],
  }
}

const REPORT_BODY = {
  host: `https://${COMMUNITY_ID}.probe.example.test/beitrag/1`,
  category: 'spam',
  message: 'Hier wird Werbung verteilt.',
}

// ── Missbrauch melden ───────────────────────────────────────────────────────

describeSeamSecret('POST /api/control/abuse-reports', report, {
  body: REPORT_BODY,
  globals: outbox(),
}, { passStatus: 200 })

describe('POST /api/control/abuse-reports — Meldung ohne Konto', () => {
  it('angenommen: eine Zeile, der Community zugeordnet', async () => {
    const run = await probeControlRoute(report, { secret: 'right', body: REPORT_BODY, globals: outbox() })
    expect(run.result).toEqual({ ok: true })
    const rows = [...run.db.table(ABUSE_REPORTS_TABLE).values()]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ host: `${COMMUNITY_ID}.probe.example.test`, communityId: COMMUNITY_ID, status: 'open' })
  })

  it('kein gültiger Host: 400, nichts geschrieben', async () => {
    const run = await probeControlRoute(report, { secret: 'right', body: { ...REPORT_BODY, host: 'kein host' }, globals: outbox() })
    expect(run.status).toBe(400)
    expect(run.writes).toEqual([])
  })

  it('unbekannte Kategorie: abgelehnt, nichts geschrieben', async () => {
    const run = await probeControlRoute(report, { secret: 'right', body: { ...REPORT_BODY, category: 'egal' }, globals: outbox() })
    expect(run.status).not.toBe(200)
    expect(run.writes).toEqual([])
  })
})

// ── Trichter: Einladungspflicht und Vorprüfung ──────────────────────────────

describeSeamSecret('POST /api/control/onboarding/gate', gate, {}, { passStatus: 200 })

describe('POST /api/control/onboarding/gate — sagt nur, ob ein Code nötig ist', () => {
  it('Antwort ist der Schalter, sonst nichts', async () => {
    const run = await probeControlRoute(gate, { secret: 'right' })
    expect(run.result).toEqual({ inviteRequired: true })
  })
})

describeSeamSecret('POST /api/control/onboarding/precheck', precheck, {
  body: { slug: 'neue-probe' },
}, { passStatus: 200 })

describe('POST /api/control/onboarding/precheck — prüft, legt nichts an', () => {
  it('freier Name: verfügbar, nichts geschrieben', async () => {
    const run = await probeControlRoute(precheck, { secret: 'right', body: { slug: 'neue-probe' } })
    expect(run.result).toEqual({ slugAvailable: true })
    expect(run.writes).toEqual([])
  })

  it('unbekannter Code bei Einladungspflicht: ungültig, nichts geschrieben', async () => {
    const run = await probeControlRoute(precheck, { secret: 'right', body: { code: 'PUKA-ABCD-EFGH' } })
    expect(run.result).toMatchObject({ codeValid: false })
    expect(run.writes).toEqual([])
  })

  it('leere Anfrage: abgelehnt', async () => {
    const run = await probeControlRoute(precheck, { secret: 'right', body: {} })
    expect(run.status).not.toBe(200)
  })
})

// ── Einladung anfragen ──────────────────────────────────────────────────────

describeSeamSecret('POST /api/control/onboarding/request', request, {
  body: { email: 'anfrage@example.test' },
  globals: outbox(),
}, { passStatus: 200 })

describe('POST /api/control/onboarding/request — Anfrage ohne Konto', () => {
  it('angenommen: eine Zeile mit der Adresse', async () => {
    const run = await probeControlRoute(request, { secret: 'right', body: { email: 'Anfrage@Example.test' }, globals: outbox() })
    expect(run.result).toEqual({ ok: true })
    const rows = [...run.db.table(INVITE_REQUESTS_TABLE).values()]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: 'anfrage@example.test' })
  })

  it('keine Adresse: abgelehnt, nichts geschrieben', async () => {
    const run = await probeControlRoute(request, { secret: 'right', body: { email: 'keine-adresse' }, globals: outbox() })
    expect(run.status).not.toBe(200)
    expect(run.writes).toEqual([])
  })
})
