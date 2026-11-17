/**
 * NACHGEBAUTE APPWRITE-KLIENTEN FÜR DIE ROLLEN-TESTS DES CORE (OPS-009, BT1 b).
 *
 * Die Konto-Routen des Core sprechen Appwrite nicht über die Datentür
 * (`tenantDb`), sondern über die rohen Klienten aus `server/lib/appwrite`:
 * den SESSION-Klienten (Appwrite selbst grenzt auf das angemeldete Konto ein)
 * und den ADMIN-Klienten (Server-Schlüssel, sieht alle Konten). Für die Frage
 * „nur das eigene Konto?" ist genau das die Entscheidung: welcher Klient
 * gerufen wird und mit welcher Konto-Id.
 *
 * Dieses Modul zeichnet jeden Aufruf auf (`client`, `service`, `method`,
 * Argumente). Antworten setzt der Test je Schlüssel
 * `<client>.<service>.<method>` (z. B. `session.account.getSession`); ohne
 * Angabe antwortet ein Aufruf mit `{}`.
 *
 * Eingebunden wird es per
 *   vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)
 * — `vi.mock` muss in der Testdatei stehen (es wird hochgezogen).
 * Für Routen, die `new Account(new Client())` selbst bauen, gibt es
 * `FakeClient`/`FakeAccount` (Klient `direct`).
 */

export type FakeClientKind = 'session' | 'admin' | 'direct'

export interface AppwriteCall {
  client: FakeClientKind
  service: string
  method: string
  args: Record<string, unknown>
  /** Beim Klienten `direct`: das gesetzte Session-Geheimnis (sonst leer). */
  session?: string
}

export type FakeReply = (args: Record<string, unknown>) => unknown

export interface CookieWrite {
  secret: string
  expire: string
  partitioned: boolean
}

const calls: AppwriteCall[] = []
const replies = new Map<string, FakeReply>()
const cookiesSet: CookieWrite[] = []
let cookiesCleared = 0

function record(client: FakeClientKind, service: string, method: string, args: unknown, session?: string): Promise<unknown> {
  const plain = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
  calls.push({ client, service, method, args: plain, ...(session === undefined ? {} : { session }) })
  const reply = replies.get(`${client}.${service}.${method}`)
  try {
    return Promise.resolve(reply ? reply(plain) : {})
  }
  catch (error) {
    return Promise.reject(error)
  }
}

/** Ein Dienst (`account`, `users`, …), dessen Methoden alle aufgezeichnet werden. */
function service(client: FakeClientKind, name: string, session?: string): Record<string, (args?: unknown) => Promise<unknown>> {
  return new Proxy({}, {
    get: (_target, method) => {
      if (typeof method !== 'string' || method === 'then') return undefined
      return (args?: unknown) => record(client, name, method, args, session)
    },
  })
}

function clientOf(kind: FakeClientKind) {
  return {
    account: service(kind, 'account'),
    users: service(kind, 'users'),
    tablesDB: service(kind, 'tablesDB'),
    storage: service(kind, 'storage'),
    presences: service(kind, 'presences'),
    avatars: service(kind, 'avatars'),
    teams: service(kind, 'teams'),
  }
}

export const appwriteFake = {
  calls,
  cookiesSet,
  cookiesCleared: () => cookiesCleared,

  /** Vor jedem Test: alles vergessen. */
  reset(): void {
    calls.length = 0
    cookiesSet.length = 0
    cookiesCleared = 0
    replies.clear()
  },

  /** Antwort für `<client>.<service>.<method>` setzen. Werfen = Appwrite lehnt ab. */
  reply(key: string, fn: FakeReply): void {
    replies.set(key, fn)
  },

  /** Alle Aufrufe eines Schlüssels `<client>.<service>.<method>` (nur die Argumente). */
  argsOf(key: string): Array<Record<string, unknown>> {
    return calls
      .filter(call => `${call.client}.${call.service}.${call.method}` === key)
      .map(call => call.args)
  },

  /** Hat die Route diesen Klienten überhaupt benutzt? */
  used(client: FakeClientKind): boolean {
    return calls.some(call => call.client === client)
  },

  createSessionClient: () => clientOf('session'),
  createAdminClient: () => clientOf('admin'),
}

/** Ersatz für `server/lib/appwrite` (Klienten und Cookie-Helfer). */
export const appwriteLibMock = {
  createSessionClient: appwriteFake.createSessionClient,
  createAdminClient: appwriteFake.createAdminClient,
  sessionCookieName: () => 'a_session_probe',
  setSessionCookie: (_event: unknown, secret: string, expire: string, options?: { partitioned?: boolean }) => {
    cookiesSet.push({ secret, expire, partitioned: options?.partitioned === true })
  },
  clearSessionCookie: () => {
    cookiesCleared += 1
  },
  requestLocale: () => undefined,
}

/** `new Client()` aus node-appwrite: merkt sich nur das Session-Geheimnis. */
export class FakeClient {
  session = ''
  setEndpoint(): this {
    return this
  }

  setProject(): this {
    return this
  }

  setSession(secret: string): this {
    this.session = secret
    return this
  }
}

/**
 * `new Account(client)` aus node-appwrite: Aufrufe laufen als Klient `direct`.
 * Eine Funktion statt einer Klasse — mit `new` gerufen, liefert sie das
 * aufzeichnende Objekt zurück.
 */
export function FakeAccount(client: FakeClient): Record<string, (args?: unknown) => Promise<unknown>> {
  return service('direct', 'account', client.session)
}
