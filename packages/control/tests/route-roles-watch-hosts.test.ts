import { afterEach, describe, expect, it } from 'vitest'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'
import { WEBSITES_TABLE } from '../shared/types/website'
import { WATCH_SECRET_HEADER, WATCH_SECRET_MIN_LENGTH } from '../server/utils/watchHostsGate'
import {
  COMMUNITY_ID,
  NEIGHBOUR_COMMUNITY_ID,
  SILO_WEBSITE_ID,
  probeControlRoute,
  resetControlWorld,
  type ControlProbe,
  type OperatorWho,
} from './support/controlRouteHarness'

/**
 * ROLLEN-TEST DER WÄCHTER-ROUTE (WA1 d, OPS-009).
 *
 * `GET /api/control/watch/hosts` gibt dem Produktions-Wächter die Kundendomains,
 * die er prüfen soll. Die Tür, ausgeschrieben:
 *  - Geheimnis auf der Instanz nicht gesetzt oder zu kurz ⇒ 404 (die Route
 *    gibt es dann nicht), auch für den Betreiber;
 *  - ohne oder mit falschem Geheimnis ⇒ 401, die Datenbank bleibt zu;
 *  - eine Sitzung zählt nicht — auch nicht die des Betreibers;
 *  - das Geheimnis der NAHT öffnet diese Route nicht (eigener Wert);
 *  - mit dem richtigen Geheimnis: nur lesen, nur zwei Tabellen, nur Host-Namen.
 *
 * Echter Handler, echte Tür, nachgebaute Ablage (`support/controlRouteHarness.ts`).
 */
const load = () => import('../server/api/control/watch/hosts.get')

// Erfundene Werte in der Länge eines echten (64 Hex-Zeichen), kein Geheimnis.
const WATCH_VALUE = 'a1'.repeat(32)
const OTHER_VALUE = 'b2'.repeat(32)
/** Das Naht-Geheimnis des Prüfstands (`PROBE_SECRET`) — hier absichtlich falsch am Platz. */
const SEAM_VALUE = 'probe-geheimnis'

afterEach(resetControlWorld)

function probe(options: { configured?: string, sent?: string, session?: OperatorWho, seed?: ControlProbe['seed'], door?: ControlProbe['door'] } = {}) {
  const configured = options.configured ?? WATCH_VALUE
  return probeControlRoute(load, {
    session: options.session,
    seed: options.seed,
    door: options.door,
    globals: {
      useRuntimeConfig: () => ({
        controlWatchHostsSecret: configured,
        controlOnboardingSecret: SEAM_VALUE,
        public: { appwriteDatabaseId: 'main' },
      }),
      getHeader: (_event: unknown, name: string) => (name.toLowerCase() === WATCH_SECRET_HEADER ? options.sent : undefined),
    },
  })
}

/** Zwei Communities und eine Einzel-Site mit eigener Domain, in verschiedenen Zuständen. */
const seedDomains: ControlProbe['seed'] = (db) => {
  Object.assign(db.table(COMMUNITIES_TABLE).get(COMMUNITY_ID)!, { customDomain: 'kundeeins.example', customDomainStatus: 'active' })
  Object.assign(db.table(COMMUNITIES_TABLE).get(NEIGHBOUR_COMMUNITY_ID)!, { customDomain: 'wartet.example.org', customDomainStatus: 'pending_dns' })
  Object.assign(db.table(WEBSITES_TABLE).get(SILO_WEBSITE_ID)!, { customDomain: 'forum.einzel.example.net', customDomainStatus: 'active' })
}

describe('GET /api/control/watch/hosts — wer darf', () => {
  it.each([
    ['nicht gesetzt', ''],
    ['nur Leerzeichen', '   '],
    ['kürzer als die Mindestlänge', 'x'.repeat(WATCH_SECRET_MIN_LENGTH - 1)],
  ])('Geheimnis auf der Instanz %s: 404, Datenbank zu — auch wenn der Aufrufer genau diesen Wert schickt', async (_label, configured) => {
    const run = await probe({ configured, sent: configured, session: 'operator' })
    expect(run.status).toBe(404)
    expect(run.doorOpened).toBe(false)
  })

  it.each([
    ['ohne Kopfzeile', undefined],
    ['mit leerer Kopfzeile', ''],
    ['mit falschem Wert', OTHER_VALUE],
    ['mit dem Geheimnis der Naht', SEAM_VALUE],
    ['mit einem Anfang des richtigen Werts', WATCH_VALUE.slice(0, 40)],
  ])('%s: 401, Datenbank zu', async (_label, sent) => {
    const run = await probe({ sent })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
    expect(run.calls).toEqual([])
  })

  it.each(['konto', 'community', 'moderator', 'operator'] as const)('Sitzung „%s" ohne Geheimnis: 401 — eine Sitzung zählt hier nicht', async (session) => {
    const run = await probe({ session })
    expect(run.status).toBe(401)
    expect(run.doorOpened).toBe(false)
    expect(run.permissionPassed).toBe(false)
  })

  it('richtiges Geheimnis, ohne Sitzung: 200', async () => {
    const run = await probe({ sent: WATCH_VALUE, seed: seedDomains })
    expect(run.status, run.error?.statusText).toBe(200)
  })
})

describe('GET /api/control/watch/hosts — was hinausgeht', () => {
  it('nur aktive eigene Domains, nach Name, je Eintrag Host und Ja/Nein', async () => {
    const run = await probe({ sent: WATCH_VALUE, seed: seedDomains })
    expect(run.result).toEqual({
      hosts: [
        { host: 'forum.einzel.example.net', health: true },
        { host: 'kundeeins.example', health: true },
        { host: 'www.kundeeins.example', health: false },
      ],
    })
  })

  it('nichts aus den Zeilen außer den Host-Namen: keine Kennung, kein Name, keine Adresse', async () => {
    const run = await probe({ sent: WATCH_VALUE, seed: seedDomains })
    const text = JSON.stringify(run.result)
    for (const leak of [COMMUNITY_ID, NEIGHBOUR_COMMUNITY_ID, SILO_WEBSITE_ID, 'Probe', 'probe.example.test', 'wartet.example.org', '@']) {
      expect(text, leak).not.toContain(leak)
    }
  })

  it('ohne eine einzige eigene Domain: eine leere Liste, kein Fehler', async () => {
    const run = await probe({ sent: WATCH_VALUE })
    expect(run.status).toBe(200)
    expect(run.result).toEqual({ hosts: [] })
  })

  it('liest genau zwei Tabellen und schreibt nichts', async () => {
    const run = await probe({ sent: WATCH_VALUE, seed: seedDomains })
    expect(run.calls.map(call => `${call.method} ${call.table}`).sort()).toEqual([`listRows ${COMMUNITIES_TABLE}`, `listRows ${WEBSITES_TABLE}`].sort())
    expect(run.writes).toEqual([])
  })

  it('ein Lesefehler ist ein Fehler (5xx), keine leere Liste', async () => {
    const run = await probe({
      sent: WATCH_VALUE,
      seed: (db) => {
        seedDomains(db)
        db.failingReads.set(WEBSITES_TABLE, () => new Error('Ablage nicht erreichbar'))
      },
    })
    expect(run.status).toBe(500)
    expect(run.result).toBeUndefined()
  })
})
