import { createAdminClient, createSessionClient, setSessionCookie } from '../../lib/appwrite'
import { loginSchema } from '../../../schemas/auth'
import { secondFactorPending } from '../../../shared/mfa'
import type { LoginResponse } from '../../../shared/types/auth-responses'

export default defineEventHandler(async (event): Promise<LoginResponse> => {
  const { email, password } = await readValidatedBody(event, loginSchema.parse)
  const { account } = createAdminClient(event)

  let session
  try {
    session = await account.createEmailPasswordSession({ email, password })
  }
  catch {
    // Keine Appwrite-Details leaken — generische 401
    throw createError({ status: 401, statusText: 'Invalid credentials' })
  }

  // Das Cookie wird IMMER gesetzt, auch wenn noch ein zweiter Faktor fehlt:
  // die Session EXISTIERT bei Appwrite bereits, sie trägt nur erst
  // `factors: ['password']`. Genau diese halbe Session ist es, mit der
  // /api/auth/mfa/challenge die Challenge löst — ohne Cookie gäbe es dafür
  // keinen Träger. Gefährlich ist sie nicht: solange der zweite Faktor fehlt,
  // beantwortet Appwrite JEDEN Konto-Aufruf mit 401, `event.context.user`
  // bleibt leer und der Nutzer ist überall ausgeloggt.
  setSessionCookie(event, session.secret, session.expire)

  // Ob ein zweiter Faktor nötig ist, sagt APPWRITE — nicht wir (Begründung
  // an der Weiche selbst, shared/mfa.ts). Die Frage kostet einen Aufruf:
  // `account.get()` mit der frischen Session. Dieselbe Weiche nimmt seit dem
  // 2026-10-24 auch der Code-Login (otp/verify.post.ts).
  if (await secondFactorPending(() => createSessionClient(event, session.secret).account.get())) {
    // BEWUSST noch KEIN 'user.login' im Protokoll: angemeldet ist erst, wer
    // auch den zweiten Faktor hatte. Das schreibt die Challenge-Route.
    return { ok: true, mfaRequired: true }
  }

  await logAuthEvent(event, 'user.login', { userId: session.userId, method: 'password' })
  return { ok: true, mfaRequired: false }
})
