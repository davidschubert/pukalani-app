import { createHmac, hkdfSync } from 'node:crypto'
import type { H3Event } from 'h3'
import { ID } from 'node-appwrite'

/**
 * DIE ERSATZ-KENNUNG DER CODE-ANMELDUNG (V1, 2026-11-23).
 *
 * `POST /api/auth/otp` antwortet für eine Adresse ohne Konto (geschlossene
 * Registrierung) und über der Grenze je Empfänger mit einer `userId`, die es
 * nicht gibt. Bis hierher war das `ID.unique()` — JE AUFRUF NEU. Ein
 * vorhandenes Konto antwortet aber immer mit SEINER Kennung. Wer dieselbe
 * Adresse zweimal anfragt, sah also am Wechsel, ob es sie gibt.
 *
 * Jetzt ist die Ersatz-Kennung eine FESTE Funktion der Adresse: HMAC mit
 * einem Schlüssel, der aus dem Server-Geheimnis abgeleitet ist (eigener
 * HKDF-Zweck, wie `knownDevice.ts`), geformt wie eine Appwrite-Kennung
 * (8 Hex Sekunden + 5 Hex Millisekunden + 7 Hex Zufall = 20 Zeichen). Die
 * Sekunden liegen in einem festen Fenster in der Vergangenheit — eine echte
 * Kennung trägt die Anlagezeit des Kontos, die Attrappe eine gleich
 * plausible. Ohne Geheimnis (kann eine laufende Instanz nicht sein) bleibt
 * es bei `ID.unique()`.
 *
 * Grenze, bewusst getragen: ein Konto, das NACH dem Ende des Fensters
 * angelegt wurde, trägt eine jüngere Zeit als jede Attrappe. Das sagt über
 * eine EINZELNE alte Kennung nichts; es verrät nur, dass ein sehr junges
 * Konto echt ist — für eine Adresse, die man selbst gerade angelegt hätte.
 */

const HKDF_INFO = 'pukalani:otp-decoy-user-id:v1'

/** Fenster der Attrappen-Zeit: 2024-01-01 bis 2026-11-01 (UTC, Sekunden). */
export const DECOY_WINDOW_START_S = Date.UTC(2024, 0, 1) / 1000
export const DECOY_WINDOW_END_S = Date.UTC(2026, 10, 1) / 1000

export function deriveOtpDecoyKey(secret: string | undefined | null): Buffer | null {
  if (!secret || !secret.trim()) return null
  return Buffer.from(hkdfSync('sha256', secret, '', HKDF_INFO, 32))
}

/** Pur: dieselbe Adresse, derselbe Schlüssel ⇒ dieselbe Kennung. */
export function otpDecoyUserIdFor(key: Buffer, email: string): string {
  const digest = createHmac('sha256', key).update(email.trim().toLowerCase()).digest()
  const span = DECOY_WINDOW_END_S - DECOY_WINDOW_START_S
  const sec = DECOY_WINDOW_START_S + (digest.readUInt32BE(0) % span)
  const msec = digest.readUInt16BE(4) % 1000
  const tail = digest.subarray(6, 10).toString('hex').slice(0, 7)
  return sec.toString(16) + msec.toString(16).padStart(5, '0') + tail
}

let cached: { secret: string, key: Buffer | null } | null = null

/** Die Ersatz-Kennung für diese Adresse auf dieser Instanz. */
export function otpDecoyUserId(event: H3Event, email: string): string {
  const secret = String(useRuntimeConfig(event).appwriteKey ?? '')
  if (cached?.secret !== secret) cached = { secret, key: deriveOtpDecoyKey(secret) }
  return cached.key ? otpDecoyUserIdFor(cached.key, email) : ID.unique()
}
