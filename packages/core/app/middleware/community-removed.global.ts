import { removedNoticeRedirect } from '../../shared/communityRemoval'

/**
 * ENTFERNT ⇒ HINWEISSEITE (SEC-030 Teil 2, seit 2026-11-13).
 *
 * Ist der Zustand „aus dieser Community entfernt" gesetzt (SSR-Spiegel aus
 * server/middleware/06.community-removed.ts, oder vom zentralen 403-Leser,
 * wenn der Entzug mitten in der Sitzung passiert), führt JEDE Seite dieses
 * Hosts auf die Hinweisseite — beim SSR als Redirect, im Browser als
 * Navigation. Ausnahmen: die Hinweisseite selbst, und alles nach dem
 * Abmelden (der Zustand gilt nur für den angemeldeten Menschen; Login und
 * Startseite sind danach wieder erreichbar). Regel: `removedNoticeRedirect`.
 *
 * Die Seite kommt aus der app.config (`pukalani.community.removedNoticePath`,
 * gesetzt vom onboarding-Layer, der sie besitzt). Ohne Eintrag passiert
 * nichts: der Core allein hat keine Hinweisseite, und eine Umleitung ins
 * Leere wäre schlimmer als keine — die API ist trotzdem gesperrt.
 *
 * NUR UX-Schicht: die Grenze ist die Server-Middleware.
 */
export default defineNuxtRouteMiddleware((to) => {
  const removed = useCommunityRemoved()
  if (!removed.value) return

  const appConfig = useAppConfig() as { pukalani?: { community?: { removedNoticePath?: string } } }
  const noticePath = appConfig.pukalani?.community?.removedNoticePath ?? ''
  if (!noticePath) return

  const target = removedNoticeRedirect({
    removed: true,
    loggedIn: useAuthStore().isLoggedIn,
    noticePath,
    localizedNoticePath: useLocalePath()(noticePath),
    toPath: to.path,
  })
  if (!target) return
  return navigateTo(target, { replace: true })
})
