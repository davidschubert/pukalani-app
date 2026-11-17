import { appwriteFake } from './appwriteFake'

/**
 * GEMEINSAME GLOBALS FÜR DIE ROLLEN-TESTS DER CORE-ROUTEN (OPS-009, BT1 b).
 *
 * `probeRoute` (participationHarness.ts) stellt die Wachen und die h3-Helfer
 * fürs Lesen der Anfrage. Die Konto-Routen des Core brauchen darüber hinaus
 * Cookies, Kopfzeilen, die Laufzeit-Config und das Auth-Protokoll — hier,
 * einmal, statt in jeder Testdatei. Die rohen Appwrite-Klienten kommen aus
 * `appwriteFake.ts` (auch als Globals, für Routen ohne Import).
 *
 * Aufgezeichnet wird, was die Entscheidung einer Route sichtbar macht: wer im
 * Auth-Protokoll steht, für welches Konto die Fehlversuch-Bremse zählt,
 * wohin umgeleitet wird.
 */

export interface KitRecord {
  authEvents: Array<{ type: string, data: Record<string, unknown> }>
  attempts: Array<{ scope: string, account: string }>
  redirects: string[]
}

export interface KitOptions {
  /** Cookies der Anfrage (Name ⇒ Wert). */
  cookies?: Record<string, string>
  /** Kopfzeilen der Anfrage (klein geschrieben). */
  headers?: Record<string, string>
  /** Zusätzliche/abweichende Felder in `useRuntimeConfig().public`. */
  publicConfig?: Record<string, unknown>
  /** Zusätzliche Felder in `useRuntimeConfig()`. */
  config?: Record<string, unknown>
  /** Weitere Globals (überschreiben die Grundausstattung). */
  globals?: Record<string, unknown>
}

export interface Kit {
  record: KitRecord
  globals: Record<string, unknown>
}

/** Bucket der Profilbilder in der nachgebauten Laufzeit-Config. */
export const AVATARS_BUCKET = 'avatars'

export function coreKit(options: KitOptions = {}): Kit {
  const record: KitRecord = { authEvents: [], attempts: [], redirects: [] }
  const cookies = options.cookies ?? {}
  const headers = options.headers ?? {}
  const runtimeConfig = {
    appwriteKey: 'probe-schluessel',
    geoCitiesPath: '',
    ...options.config,
    public: {
      appwriteEndpoint: 'http://appwrite.example.test/v1',
      appwriteProjectId: 'probe',
      appwriteDatabaseId: 'probe-db',
      appwriteAvatarsBucket: AVATARS_BUCKET,
      ...options.publicConfig,
    },
  }

  return {
    record,
    globals: {
      useRuntimeConfig: () => runtimeConfig,
      getCookie: (_event: unknown, name: string) => cookies[name],
      setCookie: () => {},
      deleteCookie: () => {},
      getHeader: (_event: unknown, name: string) => headers[name.toLowerCase()],
      getRequestHeader: (_event: unknown, name: string) => headers[name.toLowerCase()],
      setResponseHeader: () => {},
      sendRedirect: (_event: unknown, target: string) => {
        record.redirects.push(target)
        return target
      },
      logAuthEvent: async (_event: unknown, type: string, data: Record<string, unknown>) => {
        record.authEvents.push({ type, data })
      },
      limitAccountAttempts: async (_event: unknown, scope: string, account: string) => {
        record.attempts.push({ scope, account })
      },
      clearAccountAttempts: async () => {},
      createSessionClient: appwriteFake.createSessionClient,
      createAdminClient: appwriteFake.createAdminClient,
      ...options.globals,
    },
  }
}
