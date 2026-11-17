import { createSessionClient } from '../../lib/appwrite'
import { resolveSiteLinkBase } from '../../utils/siteOrigin'

/**
 * Verifizierungs-Mail erneut anfordern (Banner-Button). Session-Pflicht;
 * mail-versendende Route → ALWAYS_LIMITED im zentralen Rate-Limit (je
 * Anschluss) UND eine Grenze je Empfänger-Adresse (unten, AB1 g).
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

  /**
   * GRENZE JE EMPFÄNGER (AB1 g): dieselbe Zahl wie bei Code- und Reset-Mails
   * (`AUTH_MAIL_RECIPIENT_LIMIT`, 5 je Adresse und Stunde), eigener Bereich.
   * Die Drossel je Anschluss (ALWAYS_LIMITED) bremst eine Quelle; diese hier
   * hängt an der Adresse und gilt über alle Anschlüsse und Sitzungen. Gezählt
   * wird erst hier — „schon bestätigt" und „kein Link möglich" verschicken
   * nichts und verbrauchen nichts.
   *
   * ANDERS als bei Code und Reset darf die Antwort die Grenze NENNEN: gefragt
   * hat das angemeldete Konto nach seiner EIGENEN Adresse, die Auskunft
   * verrät nichts über Fremde. Eine stille `ok` ließe den Menschen auf eine
   * Mail warten, die nicht kommt. Dieselbe 429 wie die Drossel (`rate_limited`,
   * der Knopf zeigt dafür schon den richtigen Satz); `Retry-After` nennt das
   * ganze Fenster als Obergrenze.
   */
  if (user.email && !(await allowRecipientMail(event, 'auth:verification', user.email, AUTH_MAIL_RECIPIENT_LIMIT))) {
    tooManyRequests(event, AUTH_MAIL_RECIPIENT_LIMIT.windowMs)
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
