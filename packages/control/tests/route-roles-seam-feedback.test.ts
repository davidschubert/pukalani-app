import { afterEach, describe, expect, it, vi } from 'vitest'
import { CUSTOMER_FEEDBACK_COMMENTS_TABLE, CUSTOMER_FEEDBACK_TABLE } from '../shared/customerFeedback'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'
import {
  COMMUNITY_ID,
  FOREIGN_PROJECT,
  POOL_PROJECT,
  describeSeamSecret,
  jwtOf,
  probeControlRoute,
  resetControlWorld,
  runtimeUserIdOf,
  type ControlProbe,
} from './support/controlRouteHarness'

/**
 * NAHT-ROUTEN DES KUNDEN-FEEDBACKS (OPS-009, BT1 b).
 *
 * Die Platform-App reicht das Feedback-Widget ihrer Communities über die Naht
 * durch. Der Aufrufer ist UNSER Deployment (Geheimnis), die Person ist das
 * Konto hinter dem JWT — oder niemand (anonym). Die Entscheidungen,
 * ausgeschrieben:
 *  - lesen (Liste, Kommentare): anonym erlaubt;
 *  - senden: anonym erlaubt;
 *  - wählen, kommentieren: nur mit Konto (401 `anonymous`);
 *  - Zustand ändern, Community stummschalten: über die Naht NIE — die Naht
 *    macht niemanden zum Betreiber (403 `operator_only`), auch nicht mit
 *    gültigem JWT und auch nicht mit einer Betreiber-Sitzung daneben.
 *  - ein JWT aus einem fremden Projekt ist ein 401, nicht „anonym".
 *  - die Community im Körper wird gegen das Projekt des JWT geprüft; passt sie
 *    nicht, steht der Eintrag OHNE Community da.
 *
 * Echte Handler, echte Wachen, nachgebaute Ablage (Prüfstand
 * `support/controlRouteHarness.ts`).
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

afterEach(resetControlWorld)

const list = () => import('../server/api/control/feedback/list.post')
const comments = () => import('../server/api/control/feedback/comments.post')
const submit = () => import('../server/api/control/feedback/submit.post')
const vote = () => import('../server/api/control/feedback/vote.post')
const comment = () => import('../server/api/control/feedback/comment.post')
const update = () => import('../server/api/control/feedback/update.post')
const mute = () => import('../server/api/control/feedback/mute.post')

const FEEDBACK_ID = 'fb-1'
const seedFeedback: ControlProbe['seed'] = (db) => {
  db.seed(CUSTOMER_FEEDBACK_TABLE, {
    $id: FEEDBACK_ID,
    area: 'core',
    productKey: '',
    title: 'Probe',
    message: 'Probe-Eintrag',
    state: 'under_review',
    status: 'visible',
    page: '',
    communityId: '',
    communityName: '',
    runtimeProjectId: POOL_PROJECT,
    authorUserId: runtimeUserIdOf('owner'),
    authorName: 'Probe owner',
    authorEmail: 'owner@example.test',
    voteCount: 0,
    communityCount: 0,
    commentCount: 0,
    lastVoteAt: null,
  })
}

const SUBMIT_INPUT = { area: 'core', message: 'Eine Probe-Nachricht' }

// ── Lesen und Senden: anonym erlaubt ────────────────────────────────────────

describeSeamSecret('POST /api/control/feedback/list', list, { body: {}, seed: seedFeedback }, { passStatus: 200 })
describeSeamSecret('POST /api/control/feedback/comments', comments, { body: { feedbackId: FEEDBACK_ID }, seed: seedFeedback }, { passStatus: 200 })
describeSeamSecret('POST /api/control/feedback/submit', submit, { body: { input: SUBMIT_INPUT } }, { passStatus: 201 })

describe('Feedback lesen und senden — anonym erlaubt, ein fremdes JWT nicht', () => {
  for (const [name, load, body] of [
    ['list', list, {}],
    ['comments', comments, { feedbackId: FEEDBACK_ID }],
    ['submit', submit, { input: SUBMIT_INPUT }],
  ] as const) {
    it(`${name}: ohne JWT angenommen`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body, seed: seedFeedback })
      expect([200, 201]).toContain(run.status)
    })

    it(`${name}: JWT aus einem fremden Projekt ⇒ 401, nichts geschrieben`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body: { ...body, jwt: jwtOf('foreign') }, seed: seedFeedback })
      expect(run.status).toBe(401)
      expect(run.writes).toEqual([])
    })
  }

  it('submit mit JWT: Absender aus dem JWT, Community nur, wenn sie zum Projekt gehört', async () => {
    const own = await probeControlRoute(submit, {
      secret: 'right',
      body: { jwt: jwtOf('viewer'), communityId: COMMUNITY_ID, input: SUBMIT_INPUT },
    })
    const ownRow = [...own.db.table(CUSTOMER_FEEDBACK_TABLE).values()][0]
    expect(ownRow).toMatchObject({ authorUserId: runtimeUserIdOf('viewer'), runtimeProjectId: POOL_PROJECT, communityId: COMMUNITY_ID })

    const foreign = await probeControlRoute(submit, {
      secret: 'right',
      body: { jwt: jwtOf('viewer'), communityId: 'c-silo', input: SUBMIT_INPUT },
      seed: db => db.seed(COMMUNITIES_TABLE, { $id: 'c-silo', projectId: FOREIGN_PROJECT, name: 'Silo' }),
    })
    const foreignRow = [...foreign.db.table(CUSTOMER_FEEDBACK_TABLE).values()][0]
    expect(foreignRow).toMatchObject({ authorUserId: runtimeUserIdOf('viewer'), communityId: '' })
  })
})

// ── Wählen und Kommentieren: nur mit Konto ──────────────────────────────────

describeSeamSecret('POST /api/control/feedback/vote', vote, {
  body: { jwt: jwtOf('viewer'), feedbackId: FEEDBACK_ID },
  seed: seedFeedback,
}, { passStatus: 200 })

describeSeamSecret('POST /api/control/feedback/comment', comment, {
  body: { jwt: jwtOf('viewer'), feedbackId: FEEDBACK_ID, input: { body: 'Probe-Kommentar' } },
  seed: seedFeedback,
}, { passStatus: 201 })

describe('Feedback wählen und kommentieren — nur mit Konto', () => {
  for (const [name, load, body] of [
    ['vote', vote, { feedbackId: FEEDBACK_ID }],
    ['comment', comment, { feedbackId: FEEDBACK_ID, input: { body: 'Probe-Kommentar' } }],
  ] as const) {
    it(`${name}: anonym ⇒ 401 anonymous, nichts geschrieben`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body, seed: seedFeedback })
      expect(run.status).toBe(401)
      expect(run.error?.data?.code).toBe('anonymous')
      expect(run.writes).toEqual([])
    })

    it(`${name}: JWT aus einem fremden Projekt ⇒ 401, nichts geschrieben`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body: { ...body, jwt: jwtOf('foreign') }, seed: seedFeedback })
      expect(run.status).toBe(401)
      expect(run.writes).toEqual([])
    })
  }

  it('comment mit JWT: Autor aus dem JWT', async () => {
    const run = await probeControlRoute(comment, {
      secret: 'right',
      body: { jwt: jwtOf('viewer'), feedbackId: FEEDBACK_ID, input: { body: 'Probe-Kommentar' } },
      seed: seedFeedback,
    })
    const row = [...run.db.table(CUSTOMER_FEEDBACK_COMMENTS_TABLE).values()][0]
    expect(row).toMatchObject({ authorUserId: runtimeUserIdOf('viewer'), runtimeProjectId: POOL_PROJECT })
  })
})

// ── Moderieren: über die Naht nie ───────────────────────────────────────────

const UPDATE_BODY = { feedbackId: FEEDBACK_ID, patch: { state: 'planned' } }
const MUTE_BODY = { communityId: COMMUNITY_ID, muted: true }

describeSeamSecret('POST /api/control/feedback/update', update, {
  body: { jwt: jwtOf('owner'), ...UPDATE_BODY },
  seed: seedFeedback,
}, { passStatus: 403 })

describeSeamSecret('POST /api/control/feedback/mute', mute, {
  body: { jwt: jwtOf('owner'), ...MUTE_BODY },
}, { passStatus: 403 })

describe('Feedback moderieren — die Naht macht niemanden zum Betreiber', () => {
  for (const [name, load, body] of [
    ['update', update, UPDATE_BODY],
    ['mute', mute, MUTE_BODY],
  ] as const) {
    it(`${name}: anonym ⇒ 403 operator_only, nichts geschrieben`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body, seed: seedFeedback })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('operator_only')
      expect(run.writes).toEqual([])
    })

    it(`${name}: Owner der Community mit JWT ⇒ 403 operator_only, nichts geschrieben`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', body: { ...body, jwt: jwtOf('owner') }, seed: seedFeedback })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('operator_only')
      expect(run.writes).toEqual([])
    })

    it(`${name}: Betreiber-Sitzung UND Geheimnis ⇒ trotzdem 403 operator_only`, async () => {
      const run = await probeControlRoute(load, { secret: 'right', session: 'operator', body, seed: seedFeedback })
      expect(run.status).toBe(403)
      expect(run.error?.data?.code).toBe('operator_only')
      expect(run.writes).toEqual([])
    })
  }
})
