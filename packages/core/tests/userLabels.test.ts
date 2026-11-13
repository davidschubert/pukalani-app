import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DER EINE SCHREIBER FÜR KONTO-LABELS (SEC-024, 2026-11-13).
 *
 * `users.updateLabels` setzt die GANZE Liste. Jeder Schreiber muss deshalb
 * lesen, rechnen, schreiben — und zwei Schreiber für dasselbe Konto, die vom
 * selben alten Stand ausgehen, überschreiben einander. Bis SEC-024 gab es
 * vier solche Stellen, jede mit eigener Vorsicht, und ein Entzug, der
 * scheiterte, landete nur im Log.
 *
 * Die Attrappe ist ein Konto-Speicher mit ECHTER Nebenläufigkeit: Lesen und
 * Schreiben geben die Kontrolle ab (`await tick()`), damit zwei gleichzeitige
 * Aufrufe sich wirklich überholen könnten.
 */

vi.stubGlobal('logEvent', () => {})

const { mutateUserLabels } = await import('../server/utils/userLabels')

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

interface FakeUsersOptions {
  /** Wie oft `updateLabels` zuerst wirft. */
  failWrites?: number
  /** Wie oft `updateLabels` „gelingt", aber nichts speichert. */
  swallowWrites?: number
  /** Konto gibt es nicht (404). */
  missing?: boolean
}

function fakeUsers(initial: string[], options: FakeUsersOptions = {}) {
  let stored = [...initial]
  let failWrites = options.failWrites ?? 0
  let swallowWrites = options.swallowWrites ?? 0
  const api = {
    get: vi.fn(async ({ userId }: { userId: string }) => {
      await tick()
      if (options.missing) throw Object.assign(new Error('User not found'), { code: 404 })
      return { $id: userId, labels: [...stored] }
    }),
    updateLabels: vi.fn(async ({ labels }: { userId: string, labels: string[] }) => {
      await tick()
      if (failWrites > 0) {
        failWrites--
        throw new Error('Appwrite hiccup')
      }
      if (swallowWrites > 0) {
        swallowWrites--
        return { labels: [...stored] }
      }
      stored = [...labels]
      return { labels: [...stored] }
    }),
    labels: () => [...stored],
  }
  return api
}

describe('mutateUserLabels', () => {
  beforeEach(() => vi.clearAllMocks())

  it('entzieht beim zweiten Versuch, wenn der erste Schreibvorgang wirft', async () => {
    const users = fakeUsers(['admin', 'cA', 'modcA'], { failWrites: 1 })
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA', 'modcA'] })
    expect(result).toEqual({ ok: true, changed: true, labels: ['admin'] })
    expect(users.updateLabels).toHaveBeenCalledTimes(2)
    expect(users.labels()).toEqual(['admin'])
  })

  it('meldet einen Fehlschlag, wenn auch der zweite Versuch wirft', async () => {
    const users = fakeUsers(['admin', 'cA'], { failWrites: 2 })
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA'] })
    expect(result.ok).toBe(false)
    expect(users.updateLabels).toHaveBeenCalledTimes(2)
    expect(users.labels()).toEqual(['admin', 'cA'])
  })

  it('wiederholt, wenn der Schreibvorgang „gelingt", das Nachlesen das Label aber noch zeigt', async () => {
    const users = fakeUsers(['cA', 'cB'], { swallowWrites: 1 })
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA'] })
    expect(result).toEqual({ ok: true, changed: true, labels: ['cB'] })
    expect(users.updateLabels).toHaveBeenCalledTimes(2)
  })

  it('meldet einen Fehlschlag, wenn das Nachlesen das Label nach beiden Versuchen noch zeigt', async () => {
    const users = fakeUsers(['cA'], { swallowWrites: 2 })
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA'] })
    expect(result).toMatchObject({ ok: false, reason: 'verify_failed' })
  })

  it('nichts zu tun ist Erfolg ohne Schreibvorgang', async () => {
    const users = fakeUsers(['admin'])
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA'] })
    expect(result).toEqual({ ok: true, changed: false, labels: ['admin'] })
    expect(users.updateLabels).not.toHaveBeenCalled()
  })

  it('fasst NUR die genannten Labels an: Betreiber-Rollen und fremde Communities bleiben wörtlich', async () => {
    const users = fakeUsers(['moderator', 'cX', 'admin', 'modcX', 'cA', 'modcA'])
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA', 'modcA'], add: ['cB'] })
    expect(result).toEqual({ ok: true, changed: true, labels: ['moderator', 'cX', 'admin', 'modcX', 'cB'] })
  })

  it('zwei gleichzeitige Aufrufe für dasselbe Konto: Entzug A und Vergabe B stimmen beide, ohne Wiederholung', async () => {
    const users = fakeUsers(['admin', 'cA'])
    const [revoke, grant] = await Promise.all([
      mutateUserLabels(users, 'u1', { remove: ['cA'] }),
      mutateUserLabels(users, 'u1', { add: ['cB'] }),
    ])
    expect(revoke.ok).toBe(true)
    expect(grant.ok).toBe(true)
    expect(users.labels()).toEqual(['admin', 'cB'])
    // Serialisiert: jeder Aufruf schreibt GENAU EINMAL. Ohne die Kette lesen
    // beide denselben alten Stand, der zweite Schreibvorgang holt `cA` zurück,
    // und erst eine Wiederholung räumt es wieder weg.
    expect(users.updateLabels).toHaveBeenCalledTimes(2)
  })

  it('ein fehlendes Konto ist `not_found`, kein Schreibversuch', async () => {
    const users = fakeUsers([], { missing: true })
    const result = await mutateUserLabels(users, 'u1', { remove: ['cA'] })
    expect(result).toMatchObject({ ok: false, reason: 'not_found' })
    expect(users.updateLabels).not.toHaveBeenCalled()
  })

  it('lehnt ein Label ab, das Appwrite nicht speichern kann, ohne etwas zu schreiben', async () => {
    const users = fakeUsers(['admin'])
    const result = await mutateUserLabels(users, 'u1', { add: ['t-abc'] })
    expect(result).toMatchObject({ ok: false, reason: 'invalid_label' })
    expect(users.updateLabels).not.toHaveBeenCalled()
  })
})
