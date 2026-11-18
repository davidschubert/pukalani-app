import { z } from 'zod'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(5).max(2000),
  // Honeypot: für Menschen unsichtbar — ausgefüllt heißt Bot. BEWUSST freier
  // Text (nur gedeckelt): ein `max(0)` lehnte ihn vorher mit 400 ab, BEVOR der
  // Zweig „still schlucken" unten griff — der Bot erfuhr am 400, welches Feld
  // auffällt. Jetzt antwortet er wie ein Mensch mit `{ ok: true }`.
  website: z.string().max(2000).optional().default(''),
  // Einmal-Token des Turnstile-Widgets — fehlt, solange die App keine
  // Turnstile-Schlüssel hat.
  turnstileToken: z.string().max(4096).optional(),
}).strict()

/**
 * Kontakt-Formular (P2-Polish, ersetzt den mailto-v1): validiert und schickt
 * die Anfrage per sendMail() (Core-Mailer, lokal Mailpit) an die feste
 * Adresse des Betreibers (`contactEmail`) — nie an die eingetragene, deshalb
 * braucht es keine Grenze je Empfänger. Ohne konfiguriertes SMTP antwortet die
 * Route 503 — die Seite fällt dann sichtbar auf die direkte E-Mail-Adresse
 * zurück.
 *
 * DIE BREMSEN (NF1 b, 2026-11-18):
 *  - Drossel in der Core-Middleware (`05.rate-limit.ts`, Bucket
 *    `photos:contact`, 3 je 10 Minuten und IP, dazu die Notbremse der
 *    Gast-Mail-Eimer). Vorher zählte diese Route selbst in einer `Map` im
 *    Speicher des Prozesses; der Bremsen-Speicher des Core zählt mit
 *    `NUXT_REDIS_URL` über alle Prozesse.
 *  - Honigtopf (`website`), still mit `{ ok: true }`.
 *  - Bot-Prüfung (Turnstile, Aktion `photos_contact`) nach dem Honigtopf und
 *    vor der Mail. Ohne die zwei Turnstile-Schlüssel ein No-op.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, contactSchema.parse)

  // Honeypot gefüllt → Bot: still schlucken (kein Signal nach außen)
  if (body.website) return { ok: true }

  await requireTurnstile(event, 'photos_contact', body.turnstileToken)

  if (!await mailerConfigured(event)) {
    throw createError({ status: 503, statusText: 'Contact mail is not configured' })
  }

  const config = useRuntimeConfig(event)
  const sent = await sendMail(event, {
    to: config.contactEmail,
    subject: `Enquiry via maui.photos — ${body.name}`,
    text: `${body.message}\n\n— ${body.name} <${body.email}>`,
  }).catch((error: unknown) => {
    // Vorher still zu 502. Geloggt werden nur KENNUNGEN des Fehlers (Name,
    // SMTP-Code, Antwort-Code) — keine Empfänger-Adresse, kein Nachrichtentext
    // und keine Fehlermeldung, denn SMTP-Meldungen zitieren gern die Adresse.
    const failure = error as { name?: unknown, code?: unknown, responseCode?: unknown } | null
    logEvent('error', 'photos.contact_mail_failed', {
      name: typeof failure?.name === 'string' ? failure.name : '?',
      code: typeof failure?.code === 'string' ? failure.code : '?',
      responseCode: typeof failure?.responseCode === 'number' ? failure.responseCode : '?',
    })
    return false
  })

  if (!sent) {
    throw createError({ status: 502, statusText: 'Could not send message' })
  }
  return { ok: true }
})
