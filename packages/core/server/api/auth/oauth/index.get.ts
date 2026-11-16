import { OAuthProvider } from 'node-appwrite'
import { createAdminClient } from '../../../lib/appwrite'
import { resolveTrustedOrigin } from '../../../utils/trustedOrigin'
import { instanceAuthFeatureGap } from '../../../../shared/authMethodAvailability'
import { safeRedirectTarget } from '../../../../shared/redirectTarget'
import {
  OAUTH_REDIRECT_COOKIE,
  oauthFailureTarget,
  oauthProviderAllowed,
  type OauthProviderId,
} from '../../../../shared/oauthProviders'

/**
 * START des Social-Logins (U14): erzeugt die Provider-URL und leitet dorthin.
 *
 * Der SSR-Weg, nicht der Web-SDK-Weg: `createOAuth2Token` (Server-SDK,
 * Admin-Client) statt `createOAuth2Session`. Der Unterschied ist genau unsere
 * Cookie-Architektur — die Session-Variante legt das Cookie auf der
 * APPWRITE-Domain an, die Token-Variante gibt uns `userId`+`secret` zurück,
 * und daraus macht die Callback-Route ein httpOnly-Cookie auf UNSEREM Host,
 * mit derselben `setSessionCookie()` wie `login.post.ts`.
 *
 * DREI Dinge, die diese Route tut und die man nicht wegkürzen darf:
 *
 *  (1) SIE GLAUBT DEM KLICK NICHTS. Der Provider muss von der App angeboten
 *      UND von der Instanz belegt sein (`oauthProviderAllowed`, beide
 *      Bedingungen in core/shared/oauthProviders.ts). Sonst 404 wie ein
 *      unbekannter Pfad — dieselbe Antwort wie an der Datentür, damit ein
 *      Aufrufer nicht abfragen kann, welche Provider es hier GÄBE.
 *
 *  (2) SIE MERKT SICH DAS ZIEL. `?redirect=` überlebt den Ausflug zu Google
 *      nicht — die Rückkehr kommt von Appwrite und trägt nur `userId`+`secret`.
 *      Deshalb ein kurzlebiges Cookie statt eines Query-Parameters: es hängt
 *      nicht davon ab, wie Appwrite fremde Query-Teile an die `success`-URL
 *      anfügt, und es steht nicht in der Browser-Historie. `sameSite: 'lax'`
 *      ist dabei PFLICHT und kein Versehen — die Rückkehr ist eine
 *      SEITENFREMDE Top-Level-Navigation, bei der ein `strict`-Cookie NICHT
 *      mitgeschickt würde (das Session-Cookie bleibt `strict`, es wird ja erst
 *      danach gesetzt).
 *
 *  (3) SIE STIRBT NICHT AN EINER FEHLENDEN CONSOLE-EINSTELLUNG. Ist der
 *      Provider im Appwrite-Projekt nicht belegt (oder steht eine eigene
 *      Kunden-Domain noch in `pending_platform`, dann weist Appwrite die
 *      `success`-URL ab), wäre die rohe Antwort ein 500 — also eine
 *      Fehlerseite ohne Auskunft. Stattdessen: Log für den Betreiber, saubere
 *      Weiterleitung mit Grund für den Gast.
 */
const SUPPORTED_PROVIDERS: Record<OauthProviderId, OAuthProvider> = {
  google: OAuthProvider.Google,
  github: OAuthProvider.Github,
}

export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { auth?: { providers?: string[] } } }
  const config = useRuntimeConfig(event)
  const { provider } = getQuery(event)

  if (!oauthProviderAllowed(provider, appConfig.pukalani?.auth?.providers, config.public.authOauthProviders)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const locale = getCookie(event, 'i18n_redirected')
  const failure = oauthFailureTarget(locale)
  // Rückweg von Appwrite: auf einen Host, den die App selbst kennt, nicht auf
  // den Namen aus der Anfrage (SEC-010, `shared/trustedOrigin.ts`).
  const { origin } = await resolveTrustedOrigin(event)

  // Das Ziel nach der Anmeldung — geprüft wie überall (kein offener Weiterleiter).
  const target = safeRedirectTarget(getQuery(event).redirect)
  if (target) {
    setCookie(event, OAUTH_REDIRECT_COOKIE, target, {
      path: '/',
      httpOnly: true,
      secure: !import.meta.dev,
      sameSite: 'lax',
      maxAge: 600,
    })
  }
  else {
    deleteCookie(event, OAUTH_REDIRECT_COOKIE, { path: '/' })
  }

  try {
    const { account } = createAdminClient(event)
    const url = await account.createOAuth2Token({
      provider: SUPPORTED_PROVIDERS[provider],
      success: `${origin}/api/auth/oauth/callback`,
      failure: `${origin}${failure}`,
    })
    return sendRedirect(event, url)
  }
  catch (error) {
    // Der Betreiber braucht die Unterscheidung, der Gast nicht (F37-Muster).
    logEvent('error', 'auth.oauth_start_failed', {
      provider,
      gap: instanceAuthFeatureGap(error),
      message: error instanceof Error ? error.message : String(error),
    })
    return sendRedirect(event, failure)
  }
})
