import { mailAddressDomain, readResendWebhookEvent } from '../../../shared/mailUndeliverable'

/**
 * RESEND MELDET ZURÜCK, WAS AUS EINER MAIL WURDE (RS1 b).
 *
 * Harte Bounces, Spam-Beschwerden und Mails, die Resend wegen der Sperrliste
 * gar nicht erst verschickt hat, schalten die Benachrichtigungs-Mails des
 * Kontos ab und melden den Newsletter-Abonnenten ab (über den Vertrag
 * `registerMailUndeliverableHandler`). Regeln: `shared/mailUndeliverable.ts`.
 * Einrichtung je Deployment: docs/runbooks/RESEND-WEBHOOK.md.
 *
 * ── DIE ANTWORTEN ───────────────────────────────────────────────────────
 *  · 404 ohne Secret — eine bewusst nicht eingerichtete Route ist kein
 *    Ausfall, sondern eine Abwesenheit (dieselbe Begründung wie beim
 *    Stripe-Webhook, live erwischt 2026-07-30).
 *  · 401 ohne gültige Signatur — VOR jedem Datenzugriff und VOR dem Parsen.
 *  · 400, wenn der signierte Body kein JSON ist (kommt von Resend nicht vor).
 *  · 200 für alles, was nichts bewirkt, und für jeden Erfolg.
 *  · 500 (generisch), wenn ein Schreibvorgang scheitert ⇒ Resend wiederholt;
 *    die Wirkung ist idempotent, eine Wiederholung kostet nichts.
 * NIE Resend- oder Appwrite-Details in der Antwort.
 *
 * ── LOG: IDS UND DOMAINS, NIE ADRESSEN ──────────────────────────────────
 * Das Repo ist öffentlich und die Logs gehen durch fremde Hände. Was eine
 * Adresse betrifft, steht nur als Domain drin; dazu `svix-id` und Resends
 * `email_id`, über die man im Resend-Dashboard den Rest findet.
 *
 * ── KEINE DROSSEL ───────────────────────────────────────────────────────
 * Bewusst nicht in `05.rate-limit.ts`: Resends Wiederholungen dürfen nie in
 * einen 429-Eimer laufen. Der Schutz ist die Signatur (wie beim Stripe-
 * Webhook).
 */

// Je Prozess EINMAL laut — die Route ist öffentlich, jeder Fremde kann sie
// unsigniert anstoßen; ein Log je Anstoß wäre ein Hebel, das Log zu fluten.
let warnedMissingSecret = false
let warnedBadSignature = false

export default defineEventHandler(async (event) => {
  const secret = String(useRuntimeConfig(event).resendWebhookSecret || '')
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true
      logEvent('warn', 'mail.webhook_not_configured', {})
    }
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const id = getHeader(event, 'svix-id')
  const check = checkResendSignature({
    secret,
    id,
    timestamp: getHeader(event, 'svix-timestamp'),
    signature: getHeader(event, 'svix-signature'),
    body: raw,
    nowSeconds: Math.floor(Date.now() / 1000),
  })
  if (check !== 'ok') {
    // `mismatch` bei einem ECHTEN Resend-Aufruf heißt fast immer: das Secret
    // auf dem Server gehört zu einem anderen Webhook-Eintrag. Der Grund steht
    // im Log, das Secret nie.
    if (!warnedBadSignature) {
      warnedBadSignature = true
      logEvent('warn', 'mail.webhook_signature_invalid', { check })
    }
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid webhook' })
  }

  const verdict = readResendWebhookEvent(payload)
  if (verdict.kind === 'ignore') return { received: true }

  if (verdict.kind === 'soft_bounce') {
    // Gezählt, nicht gesperrt (Begründung bei `readResendWebhookEvent`).
    logEvent('info', 'mail.bounce_soft', {
      svixId: id,
      emailId: verdict.emailId,
      subType: verdict.subType,
      domains: verdict.recipients.map(mailAddressDomain),
    })
    return { received: true }
  }

  const at = new Date().toISOString()
  for (const emailLower of verdict.recipients) {
    try {
      const summary = await applyMailUndeliverable(event, { emailLower, reason: verdict.reason, at })
      logEvent('info', 'mail.undeliverable', {
        svixId: id,
        emailId: verdict.emailId,
        reason: verdict.reason,
        subType: verdict.subType,
        ...summary,
      })
    }
    catch (error) {
      const failed = error as { summary?: Record<string, unknown>, causes?: unknown[] }
      logEvent('error', 'mail.undeliverable_failed', {
        svixId: id,
        emailId: verdict.emailId,
        reason: verdict.reason,
        ...(failed.summary ?? { domain: mailAddressDomain(emailLower) }),
        // Nur Typ und Code der Ursachen, keine Meldungstexte: eine Appwrite-
        // Meldung kann den Abfragewert zitieren — und der ist hier die Adresse.
        causes: (failed.causes ?? [error]).map(cause => ({
          name: cause instanceof Error ? cause.name : typeof cause,
          code: (cause as { code?: unknown } | null)?.code ?? null,
        })),
      })
      throw createError({ status: 500, statusText: 'Webhook processing failed' })
    }
  }
  return { received: true }
})
