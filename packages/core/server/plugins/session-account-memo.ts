import type { H3Event } from 'h3'
import { forgetAccountSessions, isSafeMethod } from '../utils/sessionAccount'

/**
 * Anmelde-Merker räumen nach jeder schreibenden Anfrage (Q12, B3).
 *
 * Eine schreibende Anfrage kann das eigene Konto ändern — Abmelden, eine
 * Sitzung beenden, Passwort, Name, Einstellungen, Konto löschen. Die nächste
 * Anfrage derselben Person (meist gleich danach `/api/auth/me`) darf dann
 * nicht den Stand von VORHER aus dem Merker bekommen. Darum räumt dieser Haken
 * alle Sitzungen des handelnden Kontos, BEVOR die Antwort rausgeht — auch,
 * wenn die Route mit einem Fehler endet (sie kann vorher schon geschrieben
 * haben). Abfragen, die währenddessen unterwegs waren, merken ihr Ergebnis
 * nicht mehr (Epoche im Merker).
 *
 * Wer ein FREMDES Konto ändert, räumt selbst: `forgetAccountSessions(userId)`.
 */
function forgetActingAccount(event: H3Event | undefined) {
  if (!event || isSafeMethod(event.method)) return
  const userId = event.context.user?.$id
  if (userId) forgetAccountSessions(userId)
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', event => forgetActingAccount(event))
  nitroApp.hooks.hook('error', (_error, { event }) => forgetActingAccount(event))
})
