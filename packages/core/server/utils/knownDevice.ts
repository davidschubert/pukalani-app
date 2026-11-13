import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { AccountAttemptScope } from './accountAttempts'

/**
 * BEKANNTES GERÄT (P29) — ein Merkzeichen für Browser, in denen sich ein Konto
 * schon einmal VOLLSTÄNDIG angemeldet hat.
 *
 * Wozu: die Konto-Bremse aus `accountAttempts.ts` (SEC-003) zählt über alle
 * Adressen. Ohne Merkzeichen könnte ein Fremder mit zehn falschen Versuchen
 * auch den echten Besitzer für 15 Minuten aussperren. Mit Merkzeichen zählt
 * der bekannte Browser in einem EIGENEN Topf — mit demselben Deckel und
 * demselben Fenster, also selbst gebremst.
 *
 * Regeln:
 *  - Ausgestellt wird NUR nach vollständiger Anmeldung (kein zweiter Faktor
 *    mehr offen) und nach der Registrierung — nie nach einem halben Schritt.
 *  - Das Cookie verrät weder Adresse noch userId: es trägt je Kennung nur eine
 *    gekürzte HMAC-Marke, dazu eine HMAC-SHA256-Signatur über alles.
 *  - Der Schlüssel wird per HKDF aus dem server-seitigen Appwrite-Schlüssel
 *    der App abgeleitet (keine neue Umgebungsvariable). Fehlt er, gibt es kein
 *    Merkzeichen: fail-closed, alle zählen im gemeinsamen Topf.
 *  - Ein Konto je Browser: ein gültiges Cookie DESSELBEN Kontos wird nur
 *    verlängert, ein fremdes ersetzt.
 *  - Ein Fehler hier lässt NIE eine Anmeldung scheitern.
 *
 * Das Cookie ist technisch notwendig (Schutz des Kontos), kein Tracking: es
 * wird nur beim Anmelden gelesen und nur von diesem Server.
 */

export const KNOWN_DEVICE_COOKIE = 'pk_known_device'
/** Laufzeit des Merkzeichens: 180 Tage, danach zählt der Browser wieder im gemeinsamen Topf. */
export const KNOWN_DEVICE_TTL_MS = 180 * 24 * 60 * 60_000
const VERSION = 'v1'
const HKDF_INFO = 'pukalani:known-device:v1'
/** Länge der Konto-Marken in Byte (gekürzter HMAC) — genug gegen Raten, kurz im Cookie. */
const MARK_BYTES = 16

/** Inhalt eines gültigen Merkzeichens (nach geprüfter Signatur). */
export interface KnownDevicePayload {
  deviceId: string
  expiresAt: number
  emailMark: string
  userMark: string
}

/** Schlüssel aus dem Server-Geheimnis ableiten (pur); `null` ohne Geheimnis. */
export function deriveKnownDeviceKey(secret: string | undefined | null): Buffer | null {
  if (!secret || !secret.trim()) return null
  return Buffer.from(hkdfSync('sha256', secret, '', HKDF_INFO, 32))
}

function normalize(account: string): string {
  return account.trim().toLowerCase()
}

function hmac(key: Buffer, label: string, value: string): Buffer {
  return createHmac('sha256', key).update(`${label}\0${value}`).digest()
}

/** Konto-Marke (pur): gekürzter HMAC, getrennt nach Art der Kennung. */
export function knownDeviceMark(key: Buffer, kind: 'email' | 'user', account: string): string {
  return hmac(key, `mark:${kind}`, normalize(account)).subarray(0, MARK_BYTES).toString('base64url')
}

/** Neue zufällige Geräte-Kennung (16 Byte). */
export function newKnownDeviceId(): string {
  return randomBytes(16).toString('base64url')
}

/** Merkzeichen ausstellen (pur). */
export function issueKnownDeviceToken(
  key: Buffer,
  input: { deviceId: string, email: string, userId: string, expiresAt: number },
): string {
  const body = [
    VERSION,
    input.deviceId,
    Math.floor(input.expiresAt).toString(36),
    knownDeviceMark(key, 'email', input.email),
    knownDeviceMark(key, 'user', input.userId),
  ].join('.')
  return `${body}.${hmac(key, 'sig', body).toString('base64url')}`
}

const PART = /^[A-Za-z0-9_-]+$/

/**
 * Merkzeichen prüfen (pur): Format, Version, Signatur (zeitkonstant), Ablauf.
 * Alles, was nicht genau stimmt, ist `null` — nie eine Ausnahme.
 */
export function verifyKnownDeviceToken(key: Buffer, token: unknown, now: number): KnownDevicePayload | null {
  if (typeof token !== 'string' || token.length > 512) return null
  const parts = token.split('.')
  if (parts.length !== 6 || parts[0] !== VERSION) return null
  if (!parts.slice(1).every(p => PART.test(p))) return null
  const [, deviceId, expRaw, emailMark, userMark, sig] = parts as [string, string, string, string, string, string]

  const expected = hmac(key, 'sig', parts.slice(0, 5).join('.'))
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const expiresAt = Number.parseInt(expRaw, 36)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null
  return { deviceId, expiresAt, emailMark, userMark }
}

/** Gehört das Merkzeichen zu dieser Kennung? `login` = E-Mail, `otp`/`mfa` = userId (pur). */
export function knownDeviceMatches(key: Buffer, payload: KnownDevicePayload, scope: AccountAttemptScope, account: string): boolean {
  const kind = scope === 'login' ? 'email' : 'user'
  const expected = Buffer.from(knownDeviceMark(key, kind, account))
  const given = Buffer.from(scope === 'login' ? payload.emailMark : payload.userMark)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// ── Laufzeit (H3) ─────────────────────────────────────────────────────────────

let cachedKey: { secret: string, key: Buffer | null } | null = null

function serverKey(event: H3Event): Buffer | null {
  const secret = String(useRuntimeConfig(event).appwriteKey ?? '')
  if (cachedKey?.secret !== secret) cachedKey = { secret, key: deriveKnownDeviceKey(secret) }
  return cachedKey.key
}

/**
 * Geräte-Kennung, wenn die Anfrage ein gültiges Merkzeichen für GENAU dieses
 * Konto trägt — sonst `null` (dann zählt der gemeinsame Topf).
 */
export function knownDeviceId(event: H3Event, scope: AccountAttemptScope, account: string): string | null {
  try {
    const key = serverKey(event)
    if (!key) return null
    const payload = verifyKnownDeviceToken(key, getCookie(event, KNOWN_DEVICE_COOKIE), Date.now())
    if (!payload || !knownDeviceMatches(key, payload, scope, account)) return null
    return payload.deviceId
  }
  catch {
    return null
  }
}

/**
 * Merkzeichen nach VOLLSTÄNDIGER Anmeldung setzen. Ein gültiges Merkzeichen
 * desselben Kontos behält seine Geräte-Kennung (nur verlängert), jedes andere
 * wird ersetzt. Wirft nie.
 */
export function rememberKnownDevice(event: H3Event, account: { email: string, userId: string }): void {
  try {
    const key = serverKey(event)
    if (!key || !account.email || !account.userId) return
    const now = Date.now()
    const current = verifyKnownDeviceToken(key, getCookie(event, KNOWN_DEVICE_COOKIE), now)
    const sameAccount = !!current
      && knownDeviceMatches(key, current, 'login', account.email)
      && knownDeviceMatches(key, current, 'otp', account.userId)
    const expiresAt = now + KNOWN_DEVICE_TTL_MS
    const token = issueKnownDeviceToken(key, {
      deviceId: sameAccount && current ? current.deviceId : newKnownDeviceId(),
      email: account.email,
      userId: account.userId,
      expiresAt,
    })
    setCookie(event, KNOWN_DEVICE_COOKIE, token, {
      expires: new Date(expiresAt),
      path: '/',
      httpOnly: true,
      // Dieselbe Regel wie das Session-Cookie (lib/appwrite.ts): localhost hat kein HTTPS.
      secure: !import.meta.dev,
      sameSite: 'lax',
    })
  }
  catch {
    // Best effort: ohne Merkzeichen zählt der Browser im gemeinsamen Topf.
  }
}
