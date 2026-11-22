import { createSessionClient } from '../lib/appwrite'
import { requestSessionSecret } from '../utils/requestSession'
import { lookupSessionAccount, needsFreshAccount } from '../utils/sessionAccount'

/**
 * Setzt event.context.user pro Request. Wirft nie — ohne (gültige)
 * Session bleibt user einfach undefined, Routen entscheiden selbst.
 *
 * ANMELDE-MERKER (Q12, B3): ein Seitenaufbau ruft die eigenen `/api`-Routen
 * auf, und jede läuft wieder hier durch. Die Antwort von Appwrite gilt darum
 * je Sitzung bis zu 5 s (Regeln: `core/shared/sessionAccountMemo.ts`,
 * Anbindung: `core/server/utils/sessionAccount.ts`). Schreibende Anfragen und
 * `/api/auth/me` fragen immer frisch.
 */
export default defineEventHandler(async (event) => {
  // Ohne Cookie kein Appwrite-Roundtrip (läuft für jeden Request). Gelesen
  // über den EINEN Lesepunkt (PK1 E1a): der Merker-Schlüssel hängt am INNEREN
  // Geheimnis, gleich ob das Cookie Klartext oder eine Karte trägt.
  const secret = requestSessionSecret(event)
  if (!secret) return

  try {
    event.context.user = await lookupSessionAccount(
      event,
      secret,
      () => createSessionClient(event).account.get(),
      { fresh: needsFreshAccount(event) },
    )
  }
  catch {
    // Session ungültig/abgelaufen — user bleibt undefined
  }
})
