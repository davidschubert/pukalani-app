import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControlPlanCatalog } from '../../../packages/control/shared/types/planCatalog'
import { requireBillingEnabled, toStripeSafeError } from '../../../packages/billing/server/utils/stripe'
import {
  OPERATOR_PEOPLE,
  probeControlRoute,
  resetControlWorld,
  type ControlProbe,
  type OperatorExpectation,
} from '../../../packages/control/tests/support/controlRouteHarness'
import { createSideEffects, createStripeFake, type StripeResponses } from './support/stripeFake'

/**
 * BETREIBER-ROUTEN DER STRIPE-EINRICHTUNG UND DER PLAN-PREISE (OPS-009, N14).
 *
 * Echter Handler, echte Wache `requirePermission(…)` aus dem Core (Prüfstand
 * `packages/control/tests/support/controlRouteHarness.ts`), echte
 * Abrechnungs-Sperre `requireBillingEnabled` aus dem billing-Layer. Stripe ist
 * eine Attrappe (`support/stripeFake.ts`): sie schreibt mit, welche Aufrufe
 * angekommen wären. Speichern, Protokoll und Preis-Cache sind Spione.
 *
 * Wer durch darf — AUSGESCHRIEBEN, nicht aus der Rechte-Matrix berechnet:
 *  - `sites.manage` (Plan-Preise lesen und ändern): nur die Instanz-Rolle
 *    `admin`, der Betreiber.
 *  - `system.manage` (Schlüssel, Preis-Abgleich, Statuskarte, Webhook-
 *    Endpunkt anlegen): ebenfalls nur der Betreiber.
 * Die Instanz-Rolle `moderator`, ein Community-Label (so trägt es ein Owner)
 * und ein Konto ohne Label kommen nicht durch.
 *
 * `POST /api/control/stripe/webhook` ist NICHT der Empfänger der signierten
 * Stripe-Zustellungen (der liegt im billing-Layer unter `/api/stripe/webhook`),
 * sondern die Betreiber-Route, die den Endpunkt bei Stripe anlegt — sie trägt
 * dieselbe Wache wie ihre Nachbarn.
 */

vi.mock('../../../packages/billing/shared/stripeKeys', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../packages/billing/shared/stripeKeys')>()
  // Die Formprüfung verlangt die Vorsilbe echter Schlüssel. Ein Test-Wert mit
  // dieser Vorsilbe sähe aus wie ein Geheimnis (gitleaks liest die Historie);
  // deshalb nimmt die Prüfung hier zusätzlich GENAU den sprechenden
  // Platzhalter an — alles andere prüft sie wie im Programm.
  return {
    ...original,
    looksLikeStripeSecretKey: (value: string) => value === 'test-secret-key-value' || original.looksLikeStripeSecretKey(value),
  }
})

const PROBE_KEY = 'test-secret-key-value'

const PLANS: ControlPlanCatalog = {
  personal: { lookupKey: 'probe-personal-monthly', lookupKeyYearly: 'probe-personal-yearly', products: [] },
}

const stripe = createStripeFake()
const effects = createSideEffects()

const OPERATOR_ONLY: OperatorExpectation = {
  allow: ['operator'],
  deny: ['konto', 'community', 'moderator'],
}

function globalsFor(billingEnabled: boolean): Record<string, unknown> {
  return {
    useAppConfig: () => ({ pukalani: { billing: { enabled: billingEnabled }, control: { plans: PLANS } } }),
    useRuntimeConfig: () => ({ public: { appUrl: 'https://admin.example.test', appwriteDatabaseId: 'main' } }),
    requireBillingEnabled,
    toStripeSafeError,
    useStripe: async () => stripe.client,
    stripeClientForKey: () => stripe.client,
    resolveStripeSecretKey: async () => ({ value: PROBE_KEY, source: 'db' }),
    resolveStripeWebhookSecret: async () => ({ value: '', source: 'none' }),
    resolveStripeWebhookEndpointId: async () => '',
    stripeSettingsStorageState: () => 'available',
    stripeSettingsStorageAvailable: () => true,
    saveStripeSettings: effects.spy('saveStripeSettings'),
    rememberStripeWebhookEndpointId: effects.spy('rememberStripeWebhookEndpointId'),
    recordAudit: effects.spy('recordAudit'),
    invalidateStripePriceCache: () => { effects.calls.push('invalidateStripePriceCache') },
  }
}

interface StripeRoute {
  name: string
  load: () => Promise<{ default: unknown }>
  expectation: OperatorExpectation
  body?: unknown
  /** Antworten der Attrappe für den Weg des Betreibers. */
  responses?: StripeResponses
  /** Der erste Stripe-Aufruf auf dem Weg des Betreibers — der Beleg „durch". */
  firstStripeCall: string
}

function describeStripeOperatorRoute(route: StripeRoute): void {
  describe(`${route.name} (Betreiber, Stripe-Attrappe)`, () => {
    beforeEach(() => {
      stripe.reset()
      effects.reset()
      stripe.respond(route.responses ?? {})
    })
    afterEach(resetControlWorld)

    const run = (probe: Omit<ControlProbe, 'body' | 'globals'>, billingEnabled = true) =>
      probeControlRoute(route.load, { ...probe, body: route.body, globals: globalsFor(billingEnabled) })

    const nothingHappened = () => {
      expect(stripe.calls, 'kein Stripe-Aufruf').toEqual([])
      expect(effects.calls, 'nichts gespeichert, nichts protokolliert').toEqual([])
    }

    it('die Erwartung nennt jede Person genau einmal', () => {
      expect([...route.expectation.allow, ...route.expectation.deny].sort()).toEqual([...OPERATOR_PEOPLE].sort())
    })

    it('ohne Sitzung: 401, kein Stripe-Aufruf', async () => {
      const result = await run({ session: 'gast' })
      expect(result.status).toBe(401)
      nothingHappened()
    })

    it('ohne Sitzung, mit dem Naht-Geheimnis: trotzdem 401', async () => {
      const result = await run({ session: 'gast', secret: 'right' })
      expect(result.status).toBe(401)
      nothingHappened()
    })

    for (const who of route.expectation.deny) {
      it(`${who}: 403, kein Stripe-Aufruf`, async () => {
        const result = await run({ session: who })
        expect(result.status).toBe(403)
        expect(result.permissionPassed).toBe(false)
        nothingHappened()
      })
    }

    for (const who of route.expectation.allow) {
      it(`${who}, Abrechnung aus: 404, kein Stripe-Aufruf`, async () => {
        const result = await run({ session: who }, false)
        expect(result.permissionPassed).toBe(true)
        expect(result.status).toBe(404)
        nothingHappened()
      })

      it(`${who}: durch die Wache, Stripe erreicht`, async () => {
        const result = await run({ session: who })
        expect(result.permissionPassed).toBe(true)
        expect(result.status, result.error?.statusText).toBe(200)
        expect(stripe.calls[0]).toBe(route.firstStripeCall)
      })
    }
  })
}

describeStripeOperatorRoute({
  name: 'GET /api/control/billing/prices',
  load: () => import('../server/api/control/billing/prices.get'),
  expectation: OPERATOR_ONLY,
  firstStripeCall: 'prices.list',
})

describeStripeOperatorRoute({
  name: 'POST /api/control/billing/prices',
  load: () => import('../server/api/control/billing/prices.post'),
  expectation: OPERATOR_ONLY,
  body: { plan: 'personal', interval: 'monthly', amount: 1900 },
  responses: {
    'prices.list': () => ({
      data: [{ id: 'price-alt', unit_amount: 900, currency: 'eur', product: { id: 'prod-probe', default_price: 'price-alt' } }],
    }),
    'prices.create': () => ({ id: 'price-neu', unit_amount: 1900, currency: 'eur' }),
  },
  firstStripeCall: 'prices.list',
})

describeStripeOperatorRoute({
  name: 'POST /api/control/stripe/keys',
  load: () => import('../server/api/control/stripe/keys.post'),
  expectation: OPERATOR_ONLY,
  body: { secretKey: PROBE_KEY },
  firstStripeCall: 'accounts.retrieveCurrent',
})

describeStripeOperatorRoute({
  name: 'POST /api/control/stripe/prices',
  load: () => import('../server/api/control/stripe/prices.post'),
  expectation: OPERATOR_ONLY,
  responses: {
    'products.search': () => ({ data: [{ id: 'prod-probe', livemode: false }] }),
    'prices.create': () => ({ id: 'price-neu' }),
  },
  firstStripeCall: 'products.search',
})

describeStripeOperatorRoute({
  name: 'GET /api/control/stripe/status',
  load: () => import('../server/api/control/stripe/status.get'),
  expectation: OPERATOR_ONLY,
  responses: {
    'tax.settings.retrieve': () => ({ defaults: { tax_behavior: 'inclusive' }, status: 'active' }),
  },
  firstStripeCall: 'tax.settings.retrieve',
})

describeStripeOperatorRoute({
  name: 'POST /api/control/stripe/webhook',
  load: () => import('../server/api/control/stripe/webhook.post'),
  expectation: OPERATOR_ONLY,
  responses: {
    'webhookEndpoints.create': () => ({ id: 'we-probe', secret: 'test-webhook-signing-value' }),
  },
  firstStripeCall: 'webhookEndpoints.list',
})

describe('Nebenwirkungen auf dem Weg des Betreibers', () => {
  beforeEach(() => {
    stripe.reset()
    effects.reset()
  })
  afterEach(resetControlWorld)

  it('Schlüssel eintragen: erst bei Stripe geprüft, dann gespeichert und protokolliert', async () => {
    const result = await probeControlRoute(() => import('../server/api/control/stripe/keys.post'), {
      session: 'operator', body: { secretKey: PROBE_KEY }, globals: globalsFor(true),
    })
    expect(result.status, result.error?.statusText).toBe(200)
    expect(stripe.calls).toEqual(['accounts.retrieveCurrent'])
    expect(effects.calls).toEqual(['saveStripeSettings', 'recordAudit'])
  })

  it('Schlüssel in falscher Form: 400, nichts gespeichert, kein Stripe-Aufruf', async () => {
    const result = await probeControlRoute(() => import('../server/api/control/stripe/keys.post'), {
      session: 'operator', body: { secretKey: 'kein-schluessel' }, globals: globalsFor(true),
    })
    expect(result.status).toBe(400)
    expect(result.error?.data?.code).toBe('key_malformed')
    expect(stripe.calls).toEqual([])
    expect(effects.calls).toEqual([])
  })

  it('Webhook-Endpunkt anlegen: Signatur-Geheimnis gespeichert, protokolliert', async () => {
    stripe.respond({ 'webhookEndpoints.create': () => ({ id: 'we-probe', secret: 'test-webhook-signing-value' }) })
    const result = await probeControlRoute(() => import('../server/api/control/stripe/webhook.post'), {
      session: 'operator', globals: globalsFor(true),
    })
    expect(result.status, result.error?.statusText).toBe(200)
    expect(stripe.calls).toEqual(['webhookEndpoints.list', 'webhookEndpoints.create'])
    expect(effects.calls).toEqual(['saveStripeSettings', 'rememberStripeWebhookEndpointId', 'recordAudit'])
  })
})
