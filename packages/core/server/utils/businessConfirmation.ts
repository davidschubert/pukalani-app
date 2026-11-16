import type { H3Event } from 'h3'
import { resolveBusinessConfirmation, type BusinessConfirmationConfig } from '../../shared/businessConfirmation'
import { recordAffirmedConsent, type ConsentRecordOptions } from './consentRecords'

/**
 * DIE UNTERNEHMER-BESTÄTIGUNG FESTHALTEN (BS1 R1c, seit SEC-008 mit
 * Nachweis) — die kleine Schwester von `recordTermsAcceptance` und dieselbe
 * Arbeitsteilung:
 *
 *  - der NACHWEIS ist eine Zeile in `consent_records` (Art `business`),
 *    geschrieben NUR, wenn der Server die Bestätigung in dieser Anfrage
 *    gesehen hat: `business: true` im Body (Passwort, Code) oder das
 *    Merkzeichen `pk_consent` auf dem Google-Weg;
 *  - `businessConfirmedAt` in den Prefs wird wie bisher geschrieben und ist
 *    nur noch die Quelle der einmaligen Übernahme für Bestandskonten.
 *
 * ZWEI SCHREIBER STATT EINEM, mit Absicht: zwei Schalter (`termsUrl` bzw.
 * `businessOnly`), eine App kann genau eines von beidem verlangen. Beide
 * steigen VOR jedem Netzaufruf aus, wenn ihr Schalter aus ist.
 *
 * BEST-EFFORT: ein Schreibfehler darf keine Registrierung kippen.
 * PREFS WERDEN GEMERGT: `updatePrefs` ERSETZT das ganze Fach.
 */
export async function recordBusinessConfirmation(
  event: H3Event,
  userId: string,
  options: ConsentRecordOptions = {},
): Promise<void> {
  if (!userId) return

  const appConfig = useAppConfig() as { pukalani?: { auth?: BusinessConfirmationConfig } }
  const auth = appConfig.pukalani?.auth
  // Billiger Ausstieg VOR jedem Netzaufruf: Apps ohne B2B-Beschränkung kosten nichts.
  if (auth?.businessOnly !== true) return

  await recordAffirmedConsent(event, userId, 'business', options)

  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    const next = resolveBusinessConfirmation(auth, user.prefs as Record<string, unknown>, new Date())
    if (!next) return
    await users.updatePrefs({ userId, prefs: { ...user.prefs, ...next } })
  }
  catch (error) {
    logEvent('warn', 'auth.business_confirmation_failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
