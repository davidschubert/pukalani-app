import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import {
  mailAddressDomain,
  nextUndeliverablePrefs,
  type MailUndeliverableReason,
} from '../../shared/mailUndeliverable'

/**
 * Server-Seite des Resend-Webhooks (RS1 b): Signatur, Konto-Prefs und der
 * Vertrag, über den Produkt-Layer ihre eigenen Adressen abmelden.
 * Die Regeln selbst stehen in `shared/mailUndeliverable.ts`.
 */

// ── 1. Die Signatur (Svix, selbst geprüft) ─────────────────────────────────

/**
 * Wie lange eine signierte Zustellung gültig bleibt — 5 Minuten, derselbe
 * Wert wie die offizielle Svix-Bibliothek. Ohne Fenster wäre jede einmal
 * abgefangene Zustellung beliebig oft wiederholbar; die WIRKUNG ist zwar
 * idempotent, aber ein Replay-Fenster ist eine Tür, die niemand braucht.
 */
export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export type ResendSignatureCheck = 'ok' | 'missing_header' | 'stale' | 'mismatch' | 'bad_secret'

/**
 * Die Svix-Prüfung, SELBST gebaut statt Paket `svix` (Zuschnitt § 2 B): eine
 * Abhängigkeit weniger und kein `check:single-copy`-Thema. Belegt mit dem
 * Testvektor aus der Svix-Doku (tests/mailUndeliverable.test.ts).
 *
 *  · signiert ist `<svix-id>.<svix-timestamp>.<roher Body>` — der Body exakt
 *    wie empfangen, darum `readRawBody` und nie ein geparstes Objekt;
 *  · der Schlüssel ist der base64-Teil hinter `whsec_`, DEKODIERT;
 *  · `svix-signature` ist eine Liste `v1,<b64> v1,<b64>` (mehrere während
 *    eines Schlüsseltauschs) — eine passende genügt;
 *  · verglichen wird in konstanter Zeit.
 */
export function checkResendSignature(input: {
  secret: string
  id: string | undefined
  timestamp: string | undefined
  signature: string | undefined
  body: string
  nowSeconds: number
}): ResendSignatureCheck {
  const { id, timestamp, signature } = input
  if (!id || !timestamp || !signature) return 'missing_header'

  const sent = Number(timestamp)
  if (!Number.isFinite(sent) || Math.abs(input.nowSeconds - sent) > RESEND_WEBHOOK_TOLERANCE_SECONDS) return 'stale'

  const key = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64')
  if (!key.length) return 'bad_secret'

  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${input.body}`).digest()
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) continue
    const given = Buffer.from(value, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return 'ok'
  }
  return 'mismatch'
}

// ── 2. Das Konto ───────────────────────────────────────────────────────────

/** Gekürzter sha256 der kleingeschriebenen Adresse — der Anker des Merkers. */
export function mailUndeliverableEmailHash(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export type MailUndeliverableOutcome = 'changed' | 'unchanged' | 'none'

/**
 * Konten mit dieser Adresse im Appwrite-Projekt DIESES Deployments: Mails aus,
 * Merker setzen. Nicht gefunden ⇒ `none` — die Adresse gehört einem anderen
 * Projekt (jedes Deployment hat seinen eigenen Webhook, alle bekommen jedes
 * Ereignis des Resend-Teams) oder einem Newsletter-Abonnenten ohne Konto.
 *
 * Appwrite legt Konto-Adressen kleingeschrieben ab, darum genügt die eine
 * Abfrage mit der kleingeschriebenen Adresse.
 */
export async function markAccountMailUndeliverable(
  event: H3Event,
  input: { emailLower: string, reason: MailUndeliverableReason, at: string },
): Promise<MailUndeliverableOutcome> {
  const { users } = createAdminClient(event)
  const found = await users.list({ queries: [Query.equal('email', input.emailLower), Query.limit(5)] })
  if (!found.users.length) return 'none'

  const emailHash = mailUndeliverableEmailHash(input.emailLower)
  let changed = false
  for (const user of found.users) {
    const next = nextUndeliverablePrefs(user.prefs as Record<string, unknown>, { reason: input.reason, emailHash, at: input.at })
    if (!next) continue
    await users.updatePrefs({ userId: user.$id, prefs: next })
    changed = true
  }
  return changed ? 'changed' : 'unchanged'
}

// ── 3. Der Vertrag für Produkt-Layer ───────────────────────────────────────

/**
 * Produkt-Layer mit EIGENEN Adressen (heute: der insights-Newsletter) hängen
 * sich hier ein — core kennt ihre Tabellen nicht (A14, core besitzt keine
 * Tables). Muster wie `registerUserDataContributor`: Registrierung per
 * Nitro-Plugin, idempotent je `id`.
 *
 * `handle` MUSS idempotent sein (Resend wiederholt) und darf werfen: dann
 * antwortet die Route 500, und Resend versucht es später noch einmal.
 */
export interface MailUndeliverableHandler {
  /** stabil + eindeutig, z. B. 'insights' — erscheint im Log. */
  id: string
  handle(event: H3Event, input: { emailLower: string, reason: MailUndeliverableReason }): Promise<MailUndeliverableOutcome>
}

const handlers = new Map<string, MailUndeliverableHandler>()

export function registerMailUndeliverableHandler(handler: MailUndeliverableHandler): void {
  handlers.set(handler.id, handler)
}

export function listMailUndeliverableHandlers(): MailUndeliverableHandler[] {
  return [...handlers.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * EINE Adresse durch alle Empfänger: Konto zuerst, dann jeder Produkt-Layer.
 *
 * `allSettled` statt Abbruch beim ersten Fehler: kippt der Newsletter, soll
 * das Konto trotzdem seine Mails aus haben. Danach wirft die Funktion, wenn
 * irgendwer scheiterte — die Wiederholung von Resend trifft die schon
 * erledigten Teile als `unchanged`, kostet also nichts.
 *
 * Das Ergebnis ist log-fertig: Domain statt Adresse (das Repo ist öffentlich,
 * die Logs gehen durch fremde Hände).
 */
export async function applyMailUndeliverable(
  event: H3Event,
  input: { emailLower: string, reason: MailUndeliverableReason, at: string },
): Promise<{ domain: string, outcomes: Record<string, MailUndeliverableOutcome | 'error'> }> {
  const steps: { id: string, run: () => Promise<MailUndeliverableOutcome> }[] = [
    { id: 'account', run: () => markAccountMailUndeliverable(event, input) },
    ...listMailUndeliverableHandlers().map(handler => ({
      id: handler.id,
      run: () => handler.handle(event, { emailLower: input.emailLower, reason: input.reason }),
    })),
  ]
  const settled = await Promise.allSettled(steps.map(step => step.run()))
  const outcomes: Record<string, MailUndeliverableOutcome | 'error'> = {}
  const failures: unknown[] = []
  settled.forEach((result, index) => {
    const id = steps[index]!.id
    if (result.status === 'fulfilled') outcomes[id] = result.value
    else {
      outcomes[id] = 'error'
      failures.push(result.reason)
    }
  })
  const summary = { domain: mailAddressDomain(input.emailLower), outcomes }
  if (failures.length) {
    throw Object.assign(new Error('mail undeliverable: handler failed'), { summary, causes: failures })
  }
  return summary
}
