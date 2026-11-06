import { safeRedirectTarget } from '../../shared/redirectTarget'

/**
 * Gemeinsamer Logout-Flow (UserMenu, LogoutButton, DashboardUserMenu):
 * 1. Presence sofort abräumen (best effort, VOR dem Session-Ende — danach hätte
 *    der Beacon keine Session mehr) — sonst bleibt der User bis zur Expiry
 *    (~90s) für andere „online".
 * 2. Session server-seitig beenden; Fehler werden abgefangen (kein unhandled
 *    rejection aus onSelect-Handlern) und als Toast gemeldet.
 *
 * `reauthenticate(returnTo)` ist derselbe Weg mit Rückfahrschein (RA1): der
 * Server verlangt eine frische Anmeldung (`reason: reauth_required`), also
 * abmelden und über `/login?redirect=…` an dieselbe Stelle zurück. Eigene
 * Funktion statt eines Parameters an `logout`, weil `logout` direkt als
 * Klick-Handler hängt und sonst das Klick-Ereignis als Option bekäme.
 */
export function useLogout() {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const auth = useAuthStore()
  const toast = useToast()
  const loading = ref(false)

  async function endSession(returnTo: string | null, successTitle: string) {
    if (loading.value) return
    loading.value = true
    try {
      if (auth.user) {
        try {
          navigator.sendBeacon('/api/presence/leave')
        }
        catch { /* best effort — Expiry räumt sonst ab */ }
      }
      await $fetch('/api/auth/logout', { method: 'POST' })
      auth.setUser(null)
      toast.add({ title: successTitle, color: 'success', icon: 'i-ph-sign-out' })
      await navigateTo({
        path: localePath('/login'),
        ...(returnTo ? { query: { redirect: returnTo } } : {}),
      })
    }
    catch {
      toast.add({
        title: t('auth.logoutError'),
        description: t('auth.logoutErrorDescription'),
        color: 'error',
        icon: 'i-ph-warning',
      })
    }
    finally {
      loading.value = false
    }
  }

  function logout() {
    return endSession(null, t('auth.logoutSuccess'))
  }

  function reauthenticate(returnTo: string) {
    return endSession(safeRedirectTarget(returnTo), t('auth.reauthSignedOut'))
  }

  return { logout, reauthenticate, loading }
}
