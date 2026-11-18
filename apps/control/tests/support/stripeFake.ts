/**
 * EINE STRIPE-ATTRAPPE FÜR DIE ROLLEN-TESTS DIESER APP (N14).
 *
 * Stripe wird NIE echt gerufen. Die Attrappe nimmt jeden Aufruf an
 * (`stripe.prices.list(…)`, `stripe.checkout.sessions.create(…)` …), schreibt
 * seinen Namen mit und antwortet aus `responses` — ohne Eintrag mit
 * `{ data: [] }`. So zeigt ein Test, OB und WELCHE Aufrufe bei Stripe
 * angekommen wären: bei einer Ablehnung keiner.
 */

export type StripeResponses = Record<string, (args: unknown[]) => unknown>

export interface StripeFake {
  /** Der Client, den `useStripe()` bzw. `stripeClientForKey()` liefert. */
  client: unknown
  /** Jeder Aufruf mit Pfad, in Reihenfolge (`prices.list`, …). */
  calls: string[]
  /** Antworten setzen (ersetzt die bisherigen). */
  respond: (responses: StripeResponses) => void
  /** Aufrufe und Antworten zurücksetzen. */
  reset: () => void
}

export function createStripeFake(): StripeFake {
  const calls: string[] = []
  let responses: StripeResponses = {}

  const node = (path: readonly string[]): unknown => new Proxy(() => {}, {
    get(_target, property) {
      // `await useStripe(event)` fragt nach `then` — die Attrappe ist KEIN
      // Promise, sonst bliebe das `await` für immer hängen.
      if (typeof property !== 'string' || property === 'then') return undefined
      return node([...path, property])
    },
    apply(_target, _this, args: unknown[]) {
      const name = path.join('.')
      calls.push(name)
      const answer = responses[name]
      return Promise.resolve(answer ? answer(args) : { data: [] })
    },
  })

  return {
    client: node([]),
    calls,
    respond(next) { responses = next },
    reset() {
      calls.length = 0
      responses = {}
    },
  }
}

/**
 * Ein Spion für die Nebenwirkungen einer Route (Speichern, Protokoll …):
 * zählt Aufrufe unter einem Namen, ohne etwas zu tun.
 */
export function createSideEffects() {
  const calls: string[] = []
  const spy = (name: string, answer: unknown = undefined) => async (..._args: unknown[]) => {
    calls.push(name)
    return answer
  }
  return { calls, spy, reset: () => { calls.length = 0 } }
}
