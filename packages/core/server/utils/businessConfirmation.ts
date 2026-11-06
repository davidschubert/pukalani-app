import type { H3Event } from 'h3'
import { resolveBusinessConfirmation, type BusinessConfirmationConfig } from '../../shared/businessConfirmation'

/**
 * DIE UNTERNEHMER-BESTÄTIGUNG AM KONTO FESTHALTEN (BS1 R1c) — der Schreiber
 * zur puren Regel in `shared/businessConfirmation.ts` (dort steht die ganze
 * Begründung).
 *
 * ── WARUM SERVER-SEITIG UND NICHT AUS DEM FORMULAR ───────────────────────
 * Dieselbe Antwort wie bei der AGB-Zustimmung nebenan: das Häkchen ist eine
 * Formularvalidierung, es reist nicht zum Server (und SOLL es nicht — ein
 * Client-Feld „ich bin Unternehmer" wäre eine Behauptung, die jeder POST
 * mitschicken kann, auch ohne Formular). Verlässlich ist nur, was der Server
 * selbst weiß: DIESE App nimmt nur Unternehmen auf (`pukalani.auth.
 * businessOnly`), und DIESES Konto ist gerade in ihr entstanden.
 *
 * Und nur so ist der GOOGLE-WEG erfassbar: dort gibt es kein Formularfeld.
 * Gebunden wird er wie bei den AGB durch den gesperrten Knopf neben dem
 * Häkchen (`AuthOauthButtons :disabled` in `RegisterForm.vue`); der Vermerk
 * hier ist die Server-Seite derselben Zusage. Ein Post-OAuth-Schritt oder ein
 * Dashboard-Banner wäre eine zweite, schwächere Tür für dieselbe Frage —
 * und der bestehende Weg ist bereits so streng wie der Passwort-Weg.
 *
 * ── BEST-EFFORT, WIE DIE AGB-ZUSTIMMUNG DANEBEN ──────────────────────────
 * Ein Prefs-Schreibfehler darf keine Registrierung kippen — der Mensch wäre
 * dann ausgesperrt, obwohl sein Konto existiert. Bei einem Fehler bleibt eine
 * Warnung im Log und das Konto ohne Vermerk.
 *
 * ZWEI SCHREIBER STATT EINEM, mit Absicht: `recordTermsAcceptance` und diese
 * Funktion beantworten zwei verschiedene Fragen und hängen an zwei
 * verschiedenen Schaltern (`termsUrl` bzw. `businessOnly`) — eine App kann
 * genau eines von beidem verlangen. Der Preis sind zwei zusätzliche Aufrufe
 * bei der Konto-ANLAGE (nicht auf einem heißen Pfad), und beide steigen VOR
 * jedem Netzaufruf aus, wenn ihr Schalter aus ist.
 *
 * PREFS WERDEN GEMERGT: `updatePrefs` ERSETZT das ganze Fach — ohne den Spread
 * verlöre dieses Konto die AGB-Felder, die der Schreiber davor gerade
 * geschrieben hat. Dieselbe Regel wie überall sonst im Core.
 */
export async function recordBusinessConfirmation(event: H3Event, userId: string): Promise<void> {
  if (!userId) return

  const appConfig = useAppConfig() as { pukalani?: { auth?: BusinessConfirmationConfig } }
  const auth = appConfig.pukalani?.auth
  // Billiger Ausstieg VOR jedem Netzaufruf: Apps ohne B2B-Beschränkung kosten nichts.
  if (auth?.businessOnly !== true) return

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
