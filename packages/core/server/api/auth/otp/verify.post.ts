import { Query } from 'node-appwrite'
import { createAdminClient, createSessionClient, setSessionCookie } from '../../../lib/appwrite'
import { otpVerifySchema } from '../../../../schemas/auth'
import { secondFactorPending } from '../../../../shared/mfa'
import type { OtpVerifyResponse } from '../../../../shared/types/auth-responses'

/**
 * Code prüfen → Session erzeugen → Cookie setzen (wie OAuth-Callback) — und
 * wie login.post.ts fragen, ob Appwrite noch einen ZWEITEN Faktor verlangt.
 */
export default defineEventHandler(async (event): Promise<OtpVerifyResponse> => {
  const { userId, code } = await readValidatedBody(event, otpVerifySchema.parse)

  const { account, users } = createAdminClient(event)

  // Erst-Beitritt VOR der Session erkennen (der Login kippt emailVerification
  // auf true): OTP-Auto-Signups haben weder verifizierte E-Mail noch je ein
  // Passwort gesetzt. Passwort-User, die erstmals OTP nutzen, sind hier
  // bewusst raus — deren user.joined kam schon vom Signup.
  const before = await users.get({ userId }).catch(() => null)
  const isFirstJoin = !!before && !before.emailVerification && !before.passwordUpdate

  try {
    const session = await account.createSession({ userId, secret: code })
    // Das Cookie wird IMMER gesetzt, auch wenn noch ein zweiter Faktor fehlt
    // (Begründung in login.post.ts): die halbe Session ist der Träger, mit dem
    // /api/auth/mfa/challenge die Challenge löst, und für jeden Konto-Aufruf
    // wertlos, solange der Faktor fehlt.
    setSessionCookie(event, session.secret, session.expire)

    /**
     * ZWEITER FAKTOR (Befund 2026-10-24, prod): ein Konto mit `mfa=1` und
     * verifiziertem Authenticator bekam hier eine Session mit
     * `factors: ['email']`, auf die Appwrite jeden Konto-Aufruf mit
     * `user_more_factors_required` beantwortet — der SSR-Guard hielt den
     * Nutzer für abgemeldet und zeigte nach dem RICHTIGEN Code wieder das
     * Login. Dieselbe Weiche wie im Passwort-Login: Appwrite fragen, nicht
     * rechnen. Ein Erst-Beitritt kann hier nicht gleichzeitig vorliegen (ein
     * Authenticator setzt ein Konto voraus), die Beitritts-Kette unten bleibt
     * deshalb hinter der Weiche. BEWUSST noch KEIN 'user.login' im Protokoll:
     * angemeldet ist erst, wer auch den zweiten Faktor hatte — das schreibt
     * die Challenge-Route.
     */
    if (await secondFactorPending(() => createSessionClient(event, session.secret).account.get())) {
      return { ok: true, mfaRequired: true }
    }

    await logAuthEvent(event, 'user.login', { userId: session.userId, method: 'otp' })

    if (isFirstJoin) {
      /**
       * BEITRITT (A5, Davids Entscheidung 1 vom 2026-07-29) — derselbe Auslöser
       * wie im Signup, an derselben Stelle wie der Feed-Eintrag: die
       * VERIFIZIERTE Code-Anmeldung ist der Moment, in dem aus einem
       * Auto-Signup ein Mensch mit Absicht wird. `isFirstJoin` grenzt es exakt
       * ab — wer sein Konto schon hatte und nur heute per Code hereinkommt,
       * tritt nicht erneut bei (er ist entweder Mitglied oder wird es beim
       * ersten Schreiben).
       *
       * `sessionSecret` + `userId` explizit: die Session steckt noch nicht im
       * Request-Cookie. No-Op auf Kontroll-Hosts und in Silo-Apps.
       */
      await joinCommunity(event, 'registration', { sessionSecret: session.secret, userId: session.userId })

      /**
       * AGB-ZUSTIMMUNG MIT FASSUNG (BS1 R1) — an derselben Stelle wie der
       * A5-Beitritt und aus demselben Grund: die VERIFIZIERTE Code-Anmeldung
       * ist der Moment, in dem aus einem Auto-Signup ein Konto mit Absicht
       * wird. `isFirstJoin` grenzt es exakt ab; wer sein Konto schon hatte,
       * bekommt keinen neuen Vermerk. No-Op ohne `pukalani.auth.termsUrl`.
       */
      await recordTermsAcceptance(event, session.userId)

      /**
       * UNTERNEHMER-BESTÄTIGUNG (BS1 R1c) — an derselben Stelle und mit
       * derselben `isFirstJoin`-Abgrenzung: der Code-Weg fragt das Häkchen
       * nur im register-Modus ab, und nur dort entsteht ein neues Konto.
       * No-Op ohne `pukalani.auth.businessOnly`.
       */
      await recordBusinessConfirmation(event, session.userId)

      // Activity-Feed: der verifizierte OTP-Beitritt ist der Beitritts-Moment
      // (das Anlegen beim Token-Versand wäre verfrüht — unverifizierte E-Mail).
      await recordActivity(event, {
        actorId: session.userId,
        actorName: before.name,
        type: 'user.joined',
        objectType: 'user',
        objectId: session.userId,
        link: '/',
      })
      const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
      await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })
    }

    return { ok: true, mfaRequired: false }
  }
  catch {
    // Falscher/abgelaufener Code — generisch, KEIN Cookie
    throw createError({ status: 401, statusText: 'Invalid or expired code' })
  }
})
