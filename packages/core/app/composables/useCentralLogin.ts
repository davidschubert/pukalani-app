import { parseCentralLoginMode } from '../../shared/centralLogin'

/**
 * Zentrale Anmeldung (PK1 E2, Prototyp) aus Sicht einer COMMUNITY-Seite:
 * `true`, wenn der Schalter `on` ist, diese Seite ein Mandanten-Host ist und
 * ein Kundenbereich eingestellt ist. Dann führt „Anmelden" in den
 * Kundenbereich, und die Einstellungen zeigen „Konto verwalten".
 *
 * Nur UX-Schicht: welcher Host zurück darf, prüft allein der Server
 * (`server/utils/centralLogin.ts`). Schalter: `shared/centralLogin.ts`.
 */
export function useCentralLogin() {
  const config = useRuntimeConfig()
  const accountUrl = useAccountAreaUrl()
  const onTenantHost = useIsTenantHost()
  const enabled = parseCentralLoginMode((config.public as { centralLogin?: unknown }).centralLogin) === 'on' && onTenantHost && accountUrl !== ''
  return { enabled, accountUrl }
}
