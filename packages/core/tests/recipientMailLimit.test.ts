import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore } from '../server/utils/rateLimitStore'
import type { RateLimitStore } from '../server/utils/rateLimitStore'

/**
 * GRENZE JE EMPFÄNGER-ADRESSE (SEC-018) — gegen den echten Helfer, gezählt mit
 * dem echten Memory-Store. Gestubbt sind nur die Nitro-Globals, die der Helfer
 * anfasst. Muster: `accountAttempts.test.ts`.
 */

type Helpers = typeof import('../server/utils/recipientMailLimit')

let store: RateLimitStore
let seenKeys: string[]
const logEvent = vi.fn()
let mod: Helpers

/** Zeichnet jeden gezählten Schlüssel auf — für die Klartext-Probe. */
function recordingStore(base: RateLimitStore, delayMs = 0): RateLimitStore {
  return {
    ...base,
    hit: async (key, windowMs) => {
      seenKeys.push(key)
      if (delayMs) await new Promise<void>(resolve => setTimeout(resolve, delayMs))
      return base.hit(key, windowMs)
    },
  }
}

beforeAll(async () => {
  vi.stubGlobal('useRateLimitStore', () => ({ store, prefix: 'rl:test:' }))
  vi.stubGlobal('logEvent', logEvent)
  mod = await import('../server/utils/recipientMailLimit')
})

beforeEach(() => {
  seenKeys = []
  store = recordingStore(createMemoryRateLimitStore())
  logEvent.mockClear()
})

const event = {} as never

describe('allowRecipientMail', () => {
  it('lässt je Adresse und Bereich den Deckel durch, die nächste Mail nicht', async () => {
    const results: boolean[] = []
    for (let i = 0; i < mod.RECIPIENT_MAIL_MAX + 1; i++) {
      results.push(await mod.allowRecipientMail(event, 'test:form', 'person@example.com'))
    }
    expect(mod.RECIPIENT_MAIL_MAX).toBe(3)
    expect(mod.RECIPIENT_MAIL_WINDOW_MS).toBe(24 * 60 * 60_000)
    expect(results).toEqual([true, true, true, false])
  })

  it('zählt Groß-/Kleinschreibung und Leerzeichen als dieselbe Adresse', async () => {
    expect(await mod.allowRecipientMail(event, 'test:form', 'Person@Example.com')).toBe(true)
    expect(await mod.allowRecipientMail(event, 'test:form', '  person@example.com ')).toBe(true)
    expect(await mod.allowRecipientMail(event, 'test:form', 'PERSON@EXAMPLE.COM')).toBe(true)
    expect(await mod.allowRecipientMail(event, 'test:form', 'person@example.com')).toBe(false)
  })

  it('zählt andere Adressen und andere Bereiche getrennt', async () => {
    for (let i = 0; i < mod.RECIPIENT_MAIL_MAX; i++) {
      await mod.allowRecipientMail(event, 'test:form', 'person@example.com')
    }
    expect(await mod.allowRecipientMail(event, 'test:form', 'person@example.com')).toBe(false)
    expect(await mod.allowRecipientMail(event, 'test:form', 'andere@example.com')).toBe(true)
    expect(await mod.allowRecipientMail(event, 'test:other', 'person@example.com')).toBe(true)
  })

  it('lässt von 10 GLEICHZEITIGEN Anfragen für dieselbe Adresse höchstens den Deckel durch', async () => {
    store = recordingStore(createMemoryRateLimitStore(), 5)
    const results = await Promise.all(
      Array.from({ length: 10 }, () => mod.allowRecipientMail(event, 'test:form', 'person@example.com')),
    )
    expect(results.filter(Boolean)).toHaveLength(mod.RECIPIENT_MAIL_MAX)
  })

  it('schreibt die Adresse weder in den Schlüssel noch ins Log, und meldet das Überschreiten einmal je Fenster', async () => {
    for (let i = 0; i < mod.RECIPIENT_MAIL_MAX + 3; i++) {
      await mod.allowRecipientMail(event, 'test:form', 'Person@Example.com')
    }
    expect(seenKeys.length).toBeGreaterThan(0)
    for (const key of seenKeys) {
      expect(key.toLowerCase()).not.toContain('person')
      expect(key.toLowerCase()).not.toContain('example')
      expect(key.startsWith('rl:test:')).toBe(true)
    }
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('warn', 'mail.recipient_limit', { scope: 'test:form' })
  })

  it('wirft nicht, wenn der Store ausfällt — und lässt dann keine Mail durch', async () => {
    store = {
      ...createMemoryRateLimitStore(),
      hit: async () => {
        throw new Error('store down')
      },
    }
    await expect(mod.allowRecipientMail(event, 'test:form', 'person@example.com')).resolves.toBe(false)
  })
})
