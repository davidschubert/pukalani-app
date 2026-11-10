import { z } from 'zod'
import {
  looksLikeStripeSecretKey,
  looksLikeStripeWebhookSecret,
  secretTail,
  stripeModeFromKey,
} from '../../../../../../packages/billing/shared/stripeKeys'

/**
 * SCHLÜSSEL EINTRAGEN (F55) — der Schritt, der den Terminal-Weg ablöst.
 *
 * VIER SICHERUNGEN, jede mit einem Vorfall dahinter:
 *
 * 1. PRÄFIX-PRÜFUNG vor allem anderen. Der häufigste Kopierfehler ist der
 *    öffentliche `pk_`-Key; er würde bei Stripe mit einer kryptischen
 *    Meldung scheitern, und zwar erst beim nächsten Checkout.
 *
 * 2. DER KEY WIRD LIVE VERIFIZIERT, BEVOR ER GESPEICHERT WIRD. Ein
 *    `GET /v1/account` mit genau diesem Schlüssel. Scheitert es, wird NICHTS
 *    abgelegt — sonst tauscht ein Tippfehler den funktionierenden Key gegen
 *    einen toten, und der Geldweg steht, ohne dass irgendwo etwas rot wird.
 *    Genau die Klasse Fehler, die F44 zum Wächter gemacht hat.
 *
 * 3. DER KEY GEHT IN KEIN LOG. Kein `logEvent` mit Wert, keine
 *    Stripe-Fehlermeldung im Klartext nach draußen (die trägt gelegentlich
 *    Konto-Ids). Was wir protokollieren, ist die TATSACHE einer Rotation.
 *
 * 4. DIE ANTWORT ENTHÄLT KEINEN KLARTEXT. Nur Modus + die letzten vier
 *    Zeichen — dieselbe Regel wie in der Statuskarte.
 *
 * Das WEBHOOK-Secret wird bewusst NICHT verifiziert: es lässt sich nur durch
 * eine echte signierte Zustellung prüfen. Hier greift nur die Formprüfung.
 */
const schema = z.object({
  secretKey: z.string().trim().min(1).optional(),
  webhookSecret: z.string().trim().min(1).optional(),
}).strict().refine(
  body => body.secretKey !== undefined || body.webhookSecret !== undefined,
  { message: 'Mindestens ein Feld angeben' },
)

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.manage')
  await requireBillingEnabled(event)

  // Ohne Verschlüsselungs-Schlüssel gibt es keinen Ort, an den das gehen
  // könnte. 503 + `data.code`, damit die Karte den Env-Namen nennen kann
  // statt „unbekannter Fehler".
  //
  // ZWEI GRÜNDE, ZWEI MELDUNGEN (Session-Audit 2026-08-09): ein GESETZTER,
  // aber falsch geformter NUXT_BILLING_SETTINGS_KEY (Tippfehler, halbe Zeile
  // kopiert, 63 statt 64 Zeichen) kam hier bis heute als „nicht konfiguriert"
  // an — und schickte den Betreiber los, eine Variable anzulegen, die schon
  // dasteht. Der Unterschied kostet eine Zeile und spart die Suche.
  const storage = stripeSettingsStorageState(event)
  if (storage !== 'available') {
    throw createError({
      status: 503,
      statusText: storage === 'invalid' ? 'Secret storage key malformed' : 'Secret storage not configured',
      data: { code: storage === 'invalid' ? 'encryption_key_invalid' : 'encryption_unconfigured' },
    })
  }

  const body = await readValidatedBody(event, schema.parse)

  if (body.secretKey !== undefined && !looksLikeStripeSecretKey(body.secretKey)) {
    throw createError({ status: 400, statusText: 'Invalid secret key', data: { code: 'key_malformed' } })
  }
  if (body.webhookSecret !== undefined && !looksLikeStripeWebhookSecret(body.webhookSecret)) {
    throw createError({ status: 400, statusText: 'Invalid webhook secret', data: { code: 'webhook_secret_malformed' } })
  }

  if (body.secretKey !== undefined) {
    try {
      await stripeClientForKey(body.secretKey).accounts.retrieveCurrent()
    }
    catch (error) {
      // Nur die TATSACHE ins Log, nie der Schlüssel und nie die rohe Meldung.
      console.error('[control/stripe/keys] Secret-Key-Probe (accounts.retrieveCurrent) abgelehnt:', (error as { type?: string })?.type ?? 'unknown')
      throw createError({ status: 400, statusText: 'Stripe rejected this key', data: { code: 'key_invalid' } })
    }
  }

  await saveStripeSettings(event, {
    ...(body.secretKey !== undefined ? { secretKey: body.secretKey } : {}),
    ...(body.webhookSecret !== undefined ? { webhookSecret: body.webhookSecret } : {}),
  }, user.$id)

  // EIN VON HAND EINGETRAGENES SIGNATUR-GEHEIMNIS HAT UNBEKANNTE HERKUNFT
  // (MEDIUM 2): es mag zum bestehenden Endpunkt gehören oder nicht — beweisen
  // lässt sich das nicht. Die Marke wird deshalb gelöscht, statt eine alte
  // Zusicherung auf ein neues Geheimnis zu übertragen.
  if (body.webhookSecret !== undefined) {
    await rememberStripeWebhookEndpointId(event, '', user.$id)
  }

  console.info(`[control/stripe/keys] Geheimnisse aktualisiert (${body.secretKey !== undefined ? 'secretKey' : ''}${body.secretKey !== undefined && body.webhookSecret !== undefined ? '+' : ''}${body.webhookSecret !== undefined ? 'webhookSecret' : ''}) durch ${user.$id}`)

  // AUDIT (MEDIUM 5): die TATSACHE einer Rotation gehört ins Protokoll — bis
  // hierher stand sie nur in `console.info`, also nirgends, wo jemand
  // nachschlägt. Was NICHT hineingehört, ist der Wert: Modus und die letzten
  // vier Zeichen, dieselbe Regel wie in der Antwort dieser Route.
  await recordAudit(event, {
    action: 'stripe.key_rotated',
    targetType: 'stripe_settings',
    targetId: 'stripe',
    metadata: {
      ...(body.secretKey !== undefined
        ? { mode: stripeModeFromKey(body.secretKey), keyTail: secretTail(body.secretKey) }
        : {}),
      ...(body.webhookSecret !== undefined
        ? { webhookSecretTail: secretTail(body.webhookSecret) }
        : {}),
    },
  })

  return {
    ok: true,
    mode: stripeModeFromKey(body.secretKey ?? ''),
    keyTail: secretTail(body.secretKey ?? ''),
    webhookSecretTail: secretTail(body.webhookSecret ?? ''),
  }
})
