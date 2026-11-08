import type { H3Event } from 'h3'
import type { MailDailyRemaining } from '../../shared/mailBudget'
import { readResendDailyRemaining } from '../../shared/mailBudget'

/**
 * WIE VIELE MAILS TRÄGT DER TAG NOCH? (RS1 a — der Netzzugriff.)
 *
 * Die Regeln liegen in `shared/mailBudget.ts`, hier steht nur der Ruf nach
 * draußen: `GET https://api.resend.com/usage` mit dem Resend-API-Schlüssel
 * dieses Deployments.
 *
 * ── WARUM EIN ZWEITER SCHLÜSSEL NEBEN SMTP ──────────────────────────────
 * Verschickt wird über SMTP (`mailer.ts`, `NUXT_SMTP_*` — der Umstieg aufs
 * Resend-SDK ist abgelehnt, docs/archiv/MAIL-ZUSTELLBARKEIT.md § 1/§ 3).
 * SMTP kann aber nicht sagen, wie viel vom Tagesbudget übrig ist; das weiß
 * nur die HTTP-API, und die will einen API-Schlüssel. Er ist deshalb
 * NUR-LESEND gedacht (`GET /usage`) und NICHT der SMTP-Schlüssel.
 *
 * ── DIESE FUNKTION WIRFT NIE ────────────────────────────────────────────
 * Jeder Fehlausgang ist `null` = „unbekannt", und was daraus folgt,
 * entscheidet die Regel (`decideMailBatch`: unbekannt ⇒ nichts raus). Ein
 * `throw` hier würde den Versand mit einem 500 abbrechen, obwohl der
 * eigentliche Befund „ich weiß es nicht" ist — und der gehört dem Anrufer
 * als Grund in die Hand, nicht als Ausfall.
 *
 * ── NICHT GEPUFFERT, UND ZWAR ABSICHTLICH ───────────────────────────────
 * Ein Stapel läuft höchstens alle paar Sekunden und nur von Hand; ein
 * zwischengespeicherter Rest wäre nach fünfzig eigenen Mails falsch und
 * würde genau den Fall verfehlen, für den die Bremse da ist. Resends
 * Ratengrenze (10 Rufe/Sekunde) ist davon weit entfernt.
 */

const USAGE_URL = 'https://api.resend.com/usage'
const TIMEOUT_MS = 10_000

export async function mailDailyRemaining(event: H3Event): Promise<MailDailyRemaining> {
  const key = String(useRuntimeConfig(event).resendApiKey || '')
  if (!key) {
    logEvent('warn', 'mail.budget_no_key', {})
    return null
  }

  let res: Response
  try {
    res = await fetch(USAGE_URL, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }
  catch {
    // Netzfehler/Timeout. Ohne Ursachentext: eine fetch-Meldung kann die URL
    // samt Kopfzeilen zitieren, und darin steht der Schlüssel.
    logEvent('warn', 'mail.budget_unreachable', {})
    return null
  }

  if (!res.ok) {
    // Nur der Status, nie der Rumpf — eine Resend-Fehlermeldung ist fremder
    // Text in unserem Log.
    logEvent('warn', 'mail.budget_http_error', { status: res.status })
    return null
  }

  let payload: unknown
  try {
    payload = await res.json()
  }
  catch {
    logEvent('warn', 'mail.budget_unreadable', {})
    return null
  }

  const remaining = readResendDailyRemaining(payload)
  if (remaining === null) logEvent('warn', 'mail.budget_unreadable', {})
  return remaining
}
