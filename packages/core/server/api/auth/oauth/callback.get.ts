import { Query } from 'node-appwrite'
import { createAdminClient, setSessionCookie } from '../../../lib/appwrite'
import { safeRedirectTarget } from '../../../../shared/redirectTarget'
import {
  OAUTH_REDIRECT_COOKIE,
  oauthFailureTarget,
  oauthLocalePrefix,
} from '../../../../shared/oauthProviders'

/**
 * RÜCKKEHR des Social-Logins (U14): tauscht `userId`+`secret` gegen eine
 * Session und setzt das Cookie — mit derselben `setSessionCookie()`, die auch
 * `login.post.ts` benutzt. Ab hier ist ein Google-Login von einem
 * Passwort-Login nicht mehr zu unterscheiden.
 *
 * ── WARUM DIESE ROUTE MEHR TUT ALS TAUSCHEN ───────────────────────────────
 *
 * Der Erstkontakt über Google LEGT EIN KONTO AN — Appwrite tut das in seinem
 * eigenen Callback, bevor eine Zeile von uns läuft. Damit übernimmt diese
 * Route die Pflichten, die `signup.post.ts` für den Passwort-Weg erfüllt;
 * täte sie es nicht, wäre ein Google-Nutzer ein Konto ZWEITER KLASSE: nie
 * Mitglied der Community, nie im Feed, nie in der Mitgliederzahl.
 *
 *   · Registrierungs-Schalter (Instanz + Mandant) — s. u.
 *   · A5-Beitritt `registration` (macht ihn zum `community_members`-Eintrag,
 *     also zu etwas, das man auch wieder ENTZIEHEN kann)
 *   · Feed-Eintrag „ist der Community beigetreten" + Mitglieder-Meilenstein
 *   · Auth-Protokoll (`method: 'oauth'`)
 *
 * ── IST DAS KONTO NEU? ────────────────────────────────────────────────────
 *
 * Der OTP-Weg misst das VOR der Anmeldung (`!emailVerification &&
 * !passwordUpdate`); hier geht das nicht — das Konto entsteht außerhalb
 * unseres Codes, und ein Google-Konto ist von Haus aus verifiziert und
 * passwortlos, die Kennzeichen taugen also nicht.
 *
 * Deshalb die Zeit: Appwrite legt das Konto im unmittelbar vorausgehenden
 * Schritt an (sein OAuth-Callback leitet direkt hierher weiter), zwischen
 * Anlage und dieser Zeile liegt eine Netzwerk-Weiterleitung. Ein Fenster von
 * zwei Minuten ist dafür großzügig und trotzdem eindeutig. Verrechnet es sich
 * doch einmal (jemand meldet sich Sekunden nach der Anlage erneut an), kostet
 * das nichts Kaputtes: `joinCommunity` fragt bestehende Mitglieder gar nicht
 * erst, und der Feed-Eintrag ist best-effort.
 */
const NEW_ACCOUNT_WINDOW_MS = 120_000

export default defineEventHandler(async (event) => {
  // Die Adresse trägt ein Einmal-Secret (?secret=…) — diese Antwort hat in
  // KEINEM Cache etwas verloren, auch nicht revalidierbar.
  setHeader(event, 'Cache-Control', 'no-store')
  const locale = getCookie(event, 'i18n_redirected')
  const prefix = oauthLocalePrefix(locale)
  const failure = oauthFailureTarget(locale)

  // Das gemerkte Ziel gilt genau einmal — egal wie es hier ausgeht.
  const remembered = safeRedirectTarget(getCookie(event, OAUTH_REDIRECT_COOKIE))
  deleteCookie(event, OAUTH_REDIRECT_COOKIE, { path: '/' })

  const { userId, secret } = getQuery(event)
  if (typeof userId !== 'string' || typeof secret !== 'string' || !userId || !secret) {
    return sendRedirect(event, failure)
  }

  const { account, users } = createAdminClient(event)

  let session
  try {
    session = await account.createSession({ userId, secret })
  }
  catch (error) {
    logEvent('warn', 'auth.oauth_exchange_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return sendRedirect(event, failure)
  }

  const user = await users.get({ userId: session.userId }).catch(() => null)
  const createdAt = user ? Date.parse(user.$createdAt) : Number.NaN
  const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS

  /**
   * DIE REGISTRIERUNGS-SCHALTER GELTEN AUCH HIER (beide Ebenen wie im Signup:
   * Instanz-Schalter/Wartungsmodus und der Mandanten-Schalter der Community).
   *
   * Was wir NICHT tun: das Konto löschen. Appwrite hat es angelegt, bevor wir
   * gefragt wurden — wir können den Zutritt verweigern, nicht die Anlage
   * verhindern. Verweigern heißt hier: die frische Session sofort wieder
   * einziehen und KEIN Cookie setzen. Ein Löschen wäre der einzige Weg, der
   * einen echten Bestandsnutzer treffen könnte, wenn sich das Zeitfenster
   * oben je verrechnet — dieses Risiko ist den aufgeräumten Datenbestand
   * nicht wert.
   */
  if (isNewAccount) {
    const appConfig = await getAppConfig(event)
    const registrationOpen = appConfig.registrationEnabled
      && !appConfig.maintenanceMode
      && tenantRegistrationOpen(event)

    if (!registrationOpen) {
      await account.deleteSession({ sessionId: session.$id }).catch(() => {})
      logEvent('warn', 'auth.oauth_registration_closed', { userId: session.userId })
      // Die Register-Seite erklärt den Zustand bereits ehrlich (geschlossen,
      // Wartung oder „nur auf Einladung") — dorthin, statt einen zweiten Text.
      return sendRedirect(event, `${prefix}/register`)
    }
  }

  setSessionCookie(event, session.secret, session.expire)
  await logAuthEvent(event, 'user.login', { userId: session.userId, method: 'oauth' })

  if (isNewAccount) {
    // Wortgleich zu signup.post.ts — der frische Secret steckt noch nicht im
    // Request-Cookie, deshalb userId + sessionSecret explizit.
    await joinCommunity(event, 'registration', { sessionSecret: session.secret, userId: session.userId })

    /**
     * AGB-ZUSTIMMUNG MIT FASSUNG (BS1 R1) — wortgleich zu signup.post.ts, und
     * hier ist es am wenigsten verzichtbar: der Google-Weg hat gar kein
     * Formularfeld, das eine Zustimmung tragen könnte. Was ihn trotzdem
     * bindet, ist der gesperrte Knopf neben dem Häkchen (`AuthOauthButtons`
     * `:disabled`) — der Vermerk hier ist die Server-Seite derselben Zusage.
     * No-Op in jeder App ohne `pukalani.auth.termsUrl`.
     */
    await recordTermsAcceptance(event, session.userId)

    /**
     * UNTERNEHMER-BESTÄTIGUNG (BS1 R1c) — und hier gilt Wort für Wort
     * dasselbe wie oben: kein Formularfeld, gebunden durch den gesperrten
     * Knopf neben BEIDEN Häkchen (`oauthBlockedBy` in `RegisterForm.vue`),
     * festgehalten aus der Config. No-Op ohne `pukalani.auth.businessOnly`.
     */
    await recordBusinessConfirmation(event, session.userId)

    await recordActivity(event, {
      actorId: session.userId,
      actorName: user?.name ?? '',
      type: 'user.joined',
      objectType: 'user',
      objectId: session.userId,
      link: '/',
    })
    const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
    await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })
  }

  return sendRedirect(event, remembered ?? `${prefix}/`)
})
