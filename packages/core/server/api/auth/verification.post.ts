import { createSessionClient } from '../../lib/appwrite'
import { resolveSiteLinkBase } from '../../utils/siteOrigin'

/**
 * Verifizierungs-Mail erneut anfordern (Banner-Button). Session-Pflicht;
 * mail-versendende Route → ALWAYS_LIMITED im zentralen Rate-Limit.
 * Bereits verifiziert = No-op (kein Fehler, der Banner ist dann eh weg).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (user.emailVerification) {
    return { ok: true, alreadyVerified: true }
  }

  // Aktive eigene Domain der Site vor `appUrl` (`utils/siteOrigin.ts`): der
  // Link soll dort landen, wo die Person sich angemeldet hat, nicht über den
  // 301 der Standard-Adresse.
  const linkBase = await resolveSiteLinkBase(event)
  if (!linkBase) {
    throw createError({ status: 503, statusText: 'Verification unavailable' })
  }

  try {
    const { account } = createSessionClient(event)
    await account.createVerification({ url: `${linkBase}/verify` })
  }
  catch {
    // Keine Appwrite-Details leaken (z.B. SMTP-Zustand der Instanz)
    throw createError({ status: 503, statusText: 'Verification unavailable' })
  }

  return { ok: true }
})
