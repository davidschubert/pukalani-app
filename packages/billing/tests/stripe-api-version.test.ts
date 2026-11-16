import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STRIPE_API_VERSION, stripeApiVersionMatches } from '../shared/stripeApiVersion'

/**
 * BE-016 — DIE STRIPE-VERSION IST EINE ENTSCHEIDUNG, KEIN NEBENEFFEKT.
 *
 * Die Konstante muss GENAU die Version des installierten SDK sein. Bringt ein
 * SDK-Wechsel eine andere mit, wird dieser Test rot: dann sind Typen,
 * Webhook-Formen und die Version des Endpunkts bei Stripe neu zu bedenken
 * (Endpunkt neu anlegen), bevor die Konstante nachgezogen wird.
 *
 * Gelesen wird die Datei des SDK selbst — `stripe/esm/apiVersion.js` steht
 * nicht in dessen `exports`, ein Import bräche an der Paket-Grenze.
 */
const SDK_API_VERSION_FILE = resolve(import.meta.dirname, '../node_modules/stripe/esm/apiVersion.js')

function installedSdkApiVersion(): string {
  const source = readFileSync(SDK_API_VERSION_FILE, 'utf8')
  const match = /export const ApiVersion = '([^']+)'/.exec(source)
  if (!match?.[1]) throw new Error(`ApiVersion nicht gefunden in ${SDK_API_VERSION_FILE}`)
  return match[1]
}

describe('STRIPE_API_VERSION', () => {
  it('ist die Version des installierten SDK', () => {
    expect(STRIPE_API_VERSION).toBe(installedSdkApiVersion())
  })

  it('stripeApiVersionMatches erkennt nur genau diese Version', () => {
    expect(stripeApiVersionMatches(STRIPE_API_VERSION)).toBe(true)
    expect(stripeApiVersionMatches('2025-03-31.basil')).toBe(false)
    expect(stripeApiVersionMatches(null)).toBe(false)
    expect(stripeApiVersionMatches(undefined)).toBe(false)
  })
})

describe('jede Stelle, die eine Version wählt, nimmt die Konstante', () => {
  const REPO = resolve(import.meta.dirname, '../../..')
  const read = (path: string) => readFileSync(resolve(REPO, path), 'utf8')

  it('beide Clients in stripe.ts', () => {
    const source = read('packages/billing/server/utils/stripe.ts')
    const constructions = source.match(/new Stripe\([^)]*\)/g) ?? []
    expect(constructions).toHaveLength(2)
    for (const call of constructions) expect(call).toContain('apiVersion: STRIPE_API_VERSION')
  })

  it('das Anlegen des Webhook-Endpunkts', () => {
    const source = read('apps/control/server/api/control/stripe/webhook.post.ts')
    expect(source).toMatch(/webhookEndpoints\.create\(\{[\s\S]*?api_version: STRIPE_API_VERSION/)
  })
})
