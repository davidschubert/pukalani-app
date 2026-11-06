import type { H3Event } from 'h3'
import { resolveTermsAcceptance, type TermsAcceptanceConfig } from '../../shared/termsAcceptance'

/**
 * DIE AGB-ZUSTIMMUNG AM KONTO FESTHALTEN (BS1 R1) — der Schreiber zur puren
 * Regel in `shared/termsAcceptance.ts` (dort steht die ganze Begründung).
 *
 * ── WARUM SERVER-SEITIG UND NICHT AUS DEM FORMULAR ───────────────────────
 * Das Häkchen ist eine Formularvalidierung, es reist nicht zum Server (und
 * SOLL es nicht: ein Client-Feld „ich habe zugestimmt" wäre eine Behauptung,
 * die jeder POST mitschicken kann). Verlässlich ist nur, was der Server selbst
 * weiß: DIESE App verlangt eine Zustimmung (`pukalani.auth.termsUrl`), und
 * DIESES Konto ist gerade in ihr entstanden. Genau das wird hier festgehalten.
 *
 * Und nur so ist der Google-Weg überhaupt erfassbar: dort legt Appwrite das
 * Konto in seinem eigenen Callback an, bevor eine Zeile von uns läuft — ein
 * Formularfeld gibt es da nirgends. Alle drei Anlagewege (Passwort, Code,
 * Google) rufen deshalb dieselbe Funktion an derselben Stelle: dort, wo sie
 * schon heute den A5-Beitritt auslösen.
 *
 * ── BEST-EFFORT, WIE DER FEED-EINTRAG DANEBEN ────────────────────────────
 * Ein Prefs-Schreibfehler darf keine Registrierung kippen — der Mensch wäre
 * dann ausgesperrt, obwohl sein Konto existiert. Bei einem Fehler bleibt eine
 * Warnung im Log und das Konto ohne Vermerk; nachtragen kann das die
 * Nachfrage-Runde für Bestandskonten (Fassung 2, Paket R3).
 *
 * PREFS WERDEN GEMERGT: `updatePrefs` ERSETZT das ganze Fach — ohne den Spread
 * verlöre ein frisches Konto zwar wenig, aber die Nachfrage-Runde später
 * Avatar, Bio und Zeitzone. Dieselbe Regel wie überall sonst im Core.
 */
export async function recordTermsAcceptance(event: H3Event, userId: string): Promise<void> {
  if (!userId) return

  const appConfig = useAppConfig() as { pukalani?: { auth?: TermsAcceptanceConfig } }
  const auth = appConfig.pukalani?.auth
  // Billiger Ausstieg VOR jedem Netzaufruf: Apps ohne AGB-Seite kosten nichts.
  if (!auth?.termsUrl) return

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
