import { afterEach, describe, expect, it, vi } from 'vitest'
import { WEBSITES_TABLE } from '../shared/types/website'
import {
  OTHER_SILO_PROJECT,
  SILO_PROJECT,
  SILO_WEBSITE_ID,
  describeSeamSecret,
  jwtOf,
  probeControlRoute,
  resetControlWorld,
  type ControlProbe,
} from './support/controlRouteHarness'

/**
 * NAHT-ROUTEN DER SILO-DOMAINS (control-036, OPS-009, BT1 b).
 *
 * Ein Silo (eigenes Appwrite-Projekt) verwaltet seine eigene Domain über das
 * Control Plane. Die Tür (`siteDomainGate.ts`) prüft, ausgeschrieben:
 *  1. das Naht-Geheimnis — der Aufrufer ist unser Deployment;
 *  2. die Website-Zeile zum genannten Projekt — unbekannt ⇒ 404;
 *  3. das JWT gegen GENAU das Projekt dieser Zeile — ein JWT eines anderen
 *     Silos oder des Pools ist dort ein 401. Damit kann ein Silo nicht die
 *     Domain eines anderen verwalten.
 * Die Rolle IM Silo prüft bewusst die Silo-App selbst (Kopf von
 * `siteDomainGate.ts`) — hier gibt es dazu keine Frage.
 *
 * `host` liefert nur die öffentliche Adresse und braucht kein JWT.
 *
 * Echte Handler, echte Wachen, nachgebaute Ablage; DNS und ploi werden nie
 * erreicht (Prüfstand `support/controlRouteHarness.ts`).
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

afterEach(resetControlWorld)

/** Die Silo-Website mit einer Domain, die auf die Anmeldung beim Webserver wartet. */
const pendingPlatform: ControlProbe['seed'] = (db) => {
  const row = db.table(WEBSITES_TABLE).get(SILO_WEBSITE_ID)
  if (row) Object.assign(row, { customDomain: 'kunde.example.com', customDomainStatus: 'pending_platform' })
}

interface JwtRoute {
  name: string
  load: () => Promise<{ default: unknown }>
  extra: Record<string, unknown>
  seed?: ControlProbe['seed']
  /** Antwort mit richtigem Geheimnis und richtigem JWT — ausgeschrieben. */
  passStatus: number
}

const JWT_ROUTES: JwtRoute[] = [
  { name: 'POST /api/control/site/domain/state', load: () => import('../server/api/control/site/domain/state.post'), extra: {}, passStatus: 200 },
  { name: 'POST /api/control/site/domain/set', load: () => import('../server/api/control/site/domain/set.post'), extra: { domain: 'probe-kunde.example.com' }, passStatus: 200 },
  { name: 'POST /api/control/site/domain/remove', load: () => import('../server/api/control/site/domain/remove.post'), extra: {}, passStatus: 200 },
  { name: 'POST /api/control/site/domain/activate', load: () => import('../server/api/control/site/domain/activate.post'), extra: {}, seed: pendingPlatform, passStatus: 200 },
  // Ohne eingetragene Domain endet die Prüfung VOR jeder DNS-Abfrage mit 400.
  { name: 'POST /api/control/site/domain/verify', load: () => import('../server/api/control/site/domain/verify.post'), extra: {}, passStatus: 400 },
]

for (const route of JWT_ROUTES) {
  describeSeamSecret(route.name, route.load, {
    body: { jwt: jwtOf('silo'), projectId: SILO_PROJECT, ...route.extra },
    seed: route.seed,
  }, { passStatus: route.passStatus })

  describe(`${route.name} — das JWT muss zum Projekt der Website passen`, () => {
    const probe = (jwt: string, projectId: string) =>
      probeControlRoute(route.load, { secret: 'right', body: { jwt, projectId, ...route.extra }, seed: route.seed })

    it('JWT eines anderen Silos: 401, nichts geschrieben', async () => {
      const run = await probe(jwtOf('other-silo'), SILO_PROJECT)
      expect(run.status).toBe(401)
      expect(run.writes).toEqual([])
    })

    it('JWT eines Pool-Kontos: 401, nichts geschrieben', async () => {
      const run = await probe(jwtOf('owner'), SILO_PROJECT)
      expect(run.status).toBe(401)
      expect(run.writes).toEqual([])
    })

    it('eigenes JWT, aber die Website des anderen Silos genannt: 401, nichts geschrieben', async () => {
      const run = await probe(jwtOf('silo'), OTHER_SILO_PROJECT)
      expect(run.status).toBe(401)
      expect(run.writes).toEqual([])
    })

    it('unbekanntes Projekt: 404, nichts geschrieben', async () => {
      const run = await probe(jwtOf('silo'), 'projekt-unbekannt')
      expect(run.status).toBe(404)
      expect(run.writes).toEqual([])
    })
  })
}

describe('POST /api/control/site/domain/set — schreibt nur die Zeile des eigenen Projekts', () => {
  it('die Domain landet auf der Silo-Website, die andere bleibt leer', async () => {
    const run = await probeControlRoute(() => import('../server/api/control/site/domain/set.post'), {
      secret: 'right',
      body: { jwt: jwtOf('silo'), projectId: SILO_PROJECT, domain: 'probe-kunde.example.com' },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.db.table(WEBSITES_TABLE).get(SILO_WEBSITE_ID)?.customDomain).toBe('probe-kunde.example.com')
    expect(run.db.table(WEBSITES_TABLE).get('w-andere')?.customDomain).toBe('')
  })
})

// ── Öffentliche Adresse ─────────────────────────────────────────────────────

const host = () => import('../server/api/control/site/domain/host.post')

describeSeamSecret('POST /api/control/site/domain/host', host, { body: { projectId: SILO_PROJECT } }, { passStatus: 200 })

describe('POST /api/control/site/domain/host — nur die Adresse, ohne JWT', () => {
  it('unbekanntes Projekt: leere Antwort statt Fehler, nichts geschrieben', async () => {
    const run = await probeControlRoute(host, { secret: 'right', body: { projectId: 'projekt-unbekannt' } })
    expect(run.result).toMatchObject({ canonicalHost: '', domain: '', status: 'none' })
    expect(run.writes).toEqual([])
  })

  it('bekanntes Projekt: keine Geheimnisse der Zeile in der Antwort', async () => {
    const run = await probeControlRoute(host, {
      secret: 'right',
      body: { projectId: SILO_PROJECT },
      seed: db => Object.assign(db.table(WEBSITES_TABLE).get(SILO_WEBSITE_ID) ?? {}, { customDomainToken: 'probe-token' }),
    })
    expect(run.status).toBe(200)
    expect(JSON.stringify(run.result)).not.toContain('probe-token')
    expect(run.writes).toEqual([])
  })
})
