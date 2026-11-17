import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * GRENZE JE EMPFÄNGER-ADRESSE (SEC-018).
 *
 * Öffentliche Formulare ohne Anmeldung (Erstgespräch, Warteliste, …) schicken
 * eine Mail an die Adresse, die der ABSENDER eintippt. Die Drossel je IP
 * (`05.rate-limit.ts`) bremst eine Quelle, nicht viele: über verteilte
 * Adressen ließe sich dieselbe fremde Adresse beliebig oft anschreiben. Diese
 * Grenze hängt deshalb am EMPFÄNGER und gilt über alle Quellen.
 *
 * Regeln:
 *  - Gezählt wird VOR dem Versand, atomar im selben Store wie die Drossel und
 *    `accountAttempts.ts` (`store.hit`) — hält unter gleichzeitigen Anfragen.
 *  - Festes Fenster, keine Rückbuchung: jede durchgelassene Anfrage ist eine
 *    Mail an diese Adresse, und genau die wird gezählt.
 *  - `false` heißt: der Aufrufer verschickt KEINE Mail an diese Adresse. Die
 *    Funktion wirft nicht und antwortet nicht selbst — der Aufrufer
 *    entscheidet, und seine Antwort darf nicht verraten, ob die Grenze
 *    gegriffen hat (sonst wäre sie eine Auskunft über fremde Adressen).
 *  - Im Schlüssel und im Log steht nie eine Adresse im Klartext (Redis ist
 *    geteilt): nur der Bereich und ein Hash der normalisierten Adresse.
 *
 * ZWEI ZAHLEN, EIN BAUSTEIN (AB1 e / SR1 c, 2026-11-17): Formulare ohne Konto
 * zählen 3 je Tag (unten). Anmelde-Mails — Code und „Passwort zurücksetzen" —
 * zählen `AUTH_MAIL_RECIPIENT_LIMIT`: wer sich anmelden will, fordert auch
 * einmal drei Mails hintereinander an und soll nach einer Stunde wieder
 * weiterkommen. Der Bereich trennt die Zähler (`auth:otp`, `auth:recovery`,
 * seit AB1 g auch `auth:verification` — die Mail „E-Mail bestätigen").
 */

/** Mails je Adresse und Bereich im Fenster. Die Zahl steht NUR hier. */
export const RECIPIENT_MAIL_MAX = 3
/** Fenster der Empfänger-Grenze: 24 Stunden, fest (kein gleitendes Fenster). */
export const RECIPIENT_MAIL_WINDOW_MS = 24 * 60 * 60_000

/** Deckel und Fenster einer Empfänger-Grenze. */
export interface RecipientMailLimit {
  max: number
  windowMs: number
}

/**
 * Anmelde-Mails je Adresse und Bereich: 5 je Stunde (Davids Entscheidung
 * 2026-11-17) — die Zahl steht NUR hier. Festes Fenster, danach geht es weiter.
 */
export const AUTH_MAIL_RECIPIENT_LIMIT: RecipientMailLimit = { max: 5, windowMs: 60 * 60_000 }

/**
 * Schlüssel der Empfänger-Grenze (pur). Die Adresse wird normalisiert
 * (`trim().toLowerCase()`) und mit dem Bereich gehasht — `A@b.de ` zählt wie
 * `a@b.de`, und keine Adresse landet im Klartext im Store.
 */
export function recipientMailKey(prefix: string, scope: string, email: string): string {
  const hash = createHash('sha256')
    .update(`${scope}:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
  return `${prefix}mailto:${scope}:${hash}`
}

/**
 * Eine Mail an `email` im Bereich `scope` anmelden. `true` ⇒ verschicken,
 * `false` ⇒ nicht verschicken (Grenze erreicht oder Store ausgefallen).
 * Ohne `limit` gilt die Formular-Grenze (3 je Tag).
 */
export async function allowRecipientMail(
  event: H3Event,
  scope: string,
  email: string,
  limit: RecipientMailLimit = { max: RECIPIENT_MAIL_MAX, windowMs: RECIPIENT_MAIL_WINDOW_MS },
): Promise<boolean> {
  try {
    const { store, prefix } = useRateLimitStore(event)
    const state = await store.hit(recipientMailKey(prefix, scope, email), limit.windowMs)
    if (state.count <= limit.max) return true
    // Genau EIN Request sieht den Übergang (atomarer Zähler) — eine Log-Zeile
    // je Fenster und Adresse, ohne die Adresse.
    if (state.count === limit.max + 1) logEvent('warn', 'mail.recipient_limit', { scope })
    return false
  }
  catch (error) {
    /**
     * STORE-AUSFALL. Wie bei `accountAttempts`: einen Redis-Ausfall fängt der
     * Store selbst ab (Rückfall auf die Zählung je Prozess) — hier landet nur,
     * was auch dieser Rückfall nicht mehr kann. `limitAccountAttempts` ließe
     * den Fehler dann durchschlagen, die Aktion fände nicht statt. Dasselbe
     * hier, nur ohne Wurf: KEINE Mail (fail-closed). Ein ungezählter Versand
     * wäre genau die Lücke, die diese Grenze schließt; der Preis ist eine
     * ausbleibende Bestätigung in einem Zustand, in dem ohnehin mehr kaputt ist.
     */
    logEvent('error', 'mail.recipient_limit_unavailable', {
      scope,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}
