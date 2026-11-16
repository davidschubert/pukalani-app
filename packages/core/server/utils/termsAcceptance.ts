import type { H3Event } from 'h3'
import { resolveTermsAcceptance, type TermsAcceptanceConfig } from '../../shared/termsAcceptance'
import { recordAffirmedConsent, type ConsentRecordOptions } from './consentRecords'

/**
 * DIE AGB-ZUSTIMMUNG FESTHALTEN (BS1 R1, seit SEC-008 mit Nachweis).
 *
 * ── DER NACHWEIS: EINE ZEILE IN `consent_records` ─────────────────────────
 * Geschrieben NUR, wenn der Server die Bestätigung in dieser Anfrage gesehen
 * hat (`recordAffirmedConsent`, Regeln in `shared/consent.ts`):
 *  - Passwort-Anlage: `terms: true` im Body (die Route lehnt ohne ab),
 *  - Code-Anmeldung: `terms: true` im Body beim ersten Beitritt,
 *  - Google: das Merkzeichen `pk_consent`, gesetzt vom Formular
 *    unmittelbar vor dem Start; die Rückkehr ruft diese Funktion mit zwei
 *    Argumenten, der Weg kommt dann aus dem Pfad.
 * Ohne Bestätigung keine Zeile — die Nachfrage holt sie beim nächsten Besuch.
 *
 * ── DIE PREFS BLEIBEN, BELEGEN ABER NICHTS ───────────────────────────────
 * `termsAcceptedAt`/`termsVersion` werden wie bisher geschrieben (andere
 * Stellen lesen sie). Sie gehören dem Konto und sind seit SEC-008 nur noch
 * die Quelle der einmaligen Übernahme für Bestandskonten.
 *
 * ── BEST-EFFORT ───────────────────────────────────────────────────────────
 * Ein Schreibfehler darf keine Registrierung kippen. Bei einem Fehler bleibt
 * eine Warnung im Log.
 *
 * PREFS WERDEN GEMERGT: `updatePrefs` ERSETZT das ganze Fach.
 */
export async function recordTermsAcceptance(
  event: H3Event,
  userId: string,
  options: ConsentRecordOptions = {},
): Promise<void> {
  if (!userId) return

  const appConfig = useAppConfig() as { pukalani?: { auth?: TermsAcceptanceConfig } }
  const auth = appConfig.pukalani?.auth
  // Billiger Ausstieg VOR jedem Netzaufruf: Apps ohne AGB-Seite kosten nichts.
  if (!auth?.termsUrl) return

  await recordAffirmedConsent(event, userId, 'terms', options)

  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    const next = resolveTermsAcceptance(auth, user.prefs as Record<string, unknown>, new Date())
    if (!next) return
    await users.updatePrefs({ userId, prefs: { ...user.prefs, ...next } })
  }
  catch (error) {
    logEvent('warn', 'auth.terms_acceptance_failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
