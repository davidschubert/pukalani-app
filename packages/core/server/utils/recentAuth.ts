import type { H3Event } from 'h3'
import { createSessionClient } from '../lib/appwrite'
import { isRecentAuth, RECENT_AUTH_MAX_AGE_MS, REAUTH_REQUIRED_REASON } from '../../shared/recentAuth'

/**
 * Verlangt eine FRISCHE Anmeldung (Regel und Begründung: shared/recentAuth.ts).
 *
 * Wirft 403 mit `reason: reauth_required` — die Oberfläche meldet die Person
 * dann ab und schickt sie über `/login?redirect=…` zurück. Gehört an jede
 * Route, die etwas Unumkehrbares tut; heute: Konto löschen (RA1),
 * Besitz übertragen und Community stilllegen (RA2, onboarding-Layer). Die
 * Oberfläche fängt den Grund EINMAL ab: `useRecentAuthPrompt`.
 *
 * Das Alter kommt von Appwrite (`$createdAt` der aktuellen Session), nicht
 * aus einem Cookie oder Body — der Aufrufer kann es also nicht behaupten.
 * Ist die Session nicht lesbar, gilt sie als NICHT frisch (fail-closed).
 */
export async function requireRecentAuth(event: H3Event, maxAgeMs: number = RECENT_AUTH_MAX_AGE_MS): Promise<void> {
  const { account } = createSessionClient(event)
  const session = await account.getSession({ sessionId: 'current' }).catch(() => null)
  if (!isRecentAuth(session?.$createdAt, Date.now(), maxAgeMs)) {
    throw createError({
      status: 403,
      statusText: 'Recent sign-in required',
      data: { code: REAUTH_REQUIRED_REASON },
    })
  }
}
