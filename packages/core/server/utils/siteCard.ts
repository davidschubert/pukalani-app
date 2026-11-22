import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { handoffAudience } from './embedHandoff'
import { logEvent } from './logEvent'
import { secretBoxKeyId } from './secretBox'
import { parseSiteCardMode, SITE_CARD_PREFIX, type SiteCardClaims, type SiteCardMode } from '../../shared/siteCard'

/**
 * EINTRITTSKARTE JE SEITE — der versiegelte Umschlag um die Sitzung (PK1,
 * Etappe E1a; Plan `docs/plans/PUKALANI-KONTO-E1.md`, § 5 Variante A und § 8).
 *
 * ZWECK: Im Sitzungs-Cookie soll künftig kein Wert liegen, der woanders gilt.
 * Die Karte trägt das Appwrite-Geheimnis versiegelt und gebunden an EINEN
 * Host und EINE Community; nur dieser Server öffnet sie, und nur auf diesem
 * Host, solange der Host zu dieser Community gehört.
 *
 * FORMAT: `c1.<kid>.<base64url(iv | tag | ciphertext)>` — AES-256-GCM,
 * zufälliger IV je Karte, AAD = Name des Cookies (eine Karte gilt nur unter
 * dem Namen, unter dem sie ausgegeben wurde). `kid` ist die kurze Kennung des
 * Schlüssels (`secretBoxKeyId`, dieselbe wie beim Umschlag der Geheimnis-
 * Ablage), damit beim Lesen gezielt der richtige von zwei Schlüsseln greift.
 * Inhalt: `SiteCardClaims` (`core/shared/siteCard.ts`).
 *
 * MODI (`NUXT_SITE_CARD_MODE`, Core-Default `off`):
 *  - `off`   — nichts ändert sich, der Lesepunkt liefert den Cookie-Wert;
 *  - `read`  — Karten werden geöffnet, Klartext gilt weiter;
 *  - `write` — wie `read`, auf einer eigenen Domain gilt NUR die Karte.
 * Geschrieben wird in E1a weiter Klartext; das Schreiben der Karte kommt
 * später.
 *
 * SCHLÜSSEL: `NUXT_SITE_CARD_KEY` (32 Byte, base64, `openssl rand -base64 32`);
 * `NUXT_SITE_CARD_PREVIOUS_KEY` nur zum LESEN während eines geplanten
 * Tauschs. Fehlt der Schlüssel oder ist er ungültig, gilt bei `read` `off`; bei
 * `write` bleibt Klartext auf eigenen Domains abgelehnt, es öffnet sich nur
 * keine Karte. Immer mit EINER Log-Zeile `site_card.config_invalid` beim
 * Start, nie ein Absturz. Der Env-Wert wird über HKDF abgeleitet.
 *
 * RÜCKWEG: `NUXT_SITE_CARD_MODE=off` (oder leer) und die App neu starten —
 * kein Ausliefern nötig. Solange noch keine Karte geschrieben wird, verliert
 * dabei niemand seine Anmeldung.
 *
 * EIN LESEPUNKT: das Cookie liest nur `readRequestSession()`
 * (`core/server/utils/requestSession.ts`); Wächter
 * `packages/core/tests/sessionCookieReadGuard.test.ts`.
 */

const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export interface SiteCardSettings {
  mode: SiteCardMode
  /** Der erste ist der Schreib-Schlüssel, ein zweiter nur zum Lesen. */
  keys: readonly Buffer[]
}

const OFF: SiteCardSettings = Object.freeze({ mode: 'off', keys: Object.freeze([]) as readonly Buffer[] })

let current: SiteCardSettings = OFF

/**
 * base64-Wert → 32 Byte Schlüssel. Leer ⇒ `null` ohne Fehler; gesetzt, aber
 * nicht 32 Byte ⇒ `'invalid'`. Nimmt `unknown`: Env-Werte laufen durch destr.
 */
export function parseSiteCardKey(raw: unknown): Buffer | null | 'invalid' {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return 'invalid'
  const value = raw.trim()
  if (value === '') return null
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return 'invalid'
  const key = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return key.length === KEY_BYTES ? key : 'invalid'
}

/**
 * Einstellungen aus `runtimeConfig.siteCard` übernehmen. Läuft einmal beim
 * Start (Plugin `server/plugins/site-card.ts`). Jeder Fehler ⇒ `off` plus
 * EINE Log-Zeile mit dem Grund (nie der Wert).
 */
export function configureSiteCard(raw: unknown): SiteCardSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as { mode?: unknown, key?: unknown, previousKey?: unknown }
  const mode = parseSiteCardMode(input.mode)
  if (mode === null) {
    logEvent('error', 'site_card.config_invalid', { reason: 'mode_unknown', fallback: 'off' })
    current = OFF
    return current
  }
  if (mode === 'off') {
    current = OFF
    return current
  }
  const rawKey = parseSiteCardKey(input.key)
  if (rawKey === null || rawKey === 'invalid') {
    const reason = rawKey === null ? 'key_missing' : 'key_invalid'
    if (mode === 'write') {
      // SCHUTZ BLEIBT AN (Gegenlesen E1a, Fund 2): `write` ohne brauchbaren
      // Schlüssel öffnet keine Karte, lehnt Klartext auf eigenen Domains aber
      // WEITER ab — ein vergessener Schlüssel darf den Schutz nicht still
      // abschalten. Wer dort niemanden aussperren will, stellt `read` ein.
      logEvent('error', 'site_card.config_invalid', { reason, mode, fallback: 'write_without_cards' })
      current = Object.freeze({ mode, keys: Object.freeze([]) as readonly Buffer[] })
      return current
    }
    logEvent('error', 'site_card.config_invalid', { reason, mode, fallback: 'off' })
    current = OFF
    return current
  }
  const key = deriveSiteCardKey(rawKey)
  const rawPrevious = parseSiteCardKey(input.previousKey)
  let previous: Buffer | null = null
  if (rawPrevious === 'invalid') {
    // Ein kaputter VORIGER Schlüssel kostet nur die Karten, die mit ihm
    // versiegelt wurden (Neuanmeldung) — er schaltet nichts ab.
    logEvent('error', 'site_card.config_invalid', { reason: 'previous_key_invalid', mode, fallback: 'current_key_only' })
  }
  else if (rawPrevious) {
    previous = deriveSiteCardKey(rawPrevious)
    if (previous.equals(key)) {
      logEvent('warn', 'site_card.config_invalid', { reason: 'previous_key_equals_key', mode, fallback: 'current_key_only' })
      previous = null
    }
  }
  current = Object.freeze({ mode, keys: Object.freeze(previous ? [key, previous] : [key]) })
  return current
}

/**
 * Der Env-Wert wird nie direkt als AES-Schlüssel benutzt, sondern über HKDF
 * mit eigenem Etikett abgeleitet (Gegenlesen E1a, Fund 5): derselbe Rohwert
 * in einer anderen Ablage ergäbe so nie denselben Schlüssel.
 */
export function deriveSiteCardKey(raw: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', raw, Buffer.alloc(0), 'pukalani-site-card-v1', KEY_BYTES))
}

/** Die geltenden Einstellungen (vor dem Start-Plugin: `off`). */
export function siteCardSettings(): SiteCardSettings {
  return current
}

/** Kann es in diesem Prozess überhaupt Karten geben? */
export function siteCardActive(): boolean {
  return current.mode !== 'off'
}

function fail(message: string): never {
  throw new Error(`sealSiteCard: ${message}`)
}

/**
 * Karte versiegeln. Wirft bei fehlendem Pflichtfeld — eine Karte ohne Host
 * oder Geheimnis darf nicht entstehen.
 */
export function sealSiteCard(claims: SiteCardClaims, options: { key: Buffer, cookieName: string }): string {
  const host = handoffAudience(claims.host)
  if (!host) fail('host is required')
  if (!claims.secret) fail('secret is required')
  if (!options.cookieName) fail('cookieName is required')
  if (options.key.length !== KEY_BYTES) fail('key must be 32 bytes')
  if (!Number.isFinite(claims.expiresAt) || !Number.isFinite(claims.authAt)) fail('times must be numbers')

  const payload = JSON.stringify({
    s: claims.secret,
    sid: claims.sessionId,
    uid: claims.userId,
    h: host,
    c: claims.communityId,
    exp: claims.expiresAt,
    at: claims.authAt,
  })
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', options.key, iv)
  cipher.setAAD(Buffer.from(options.cookieName, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${SITE_CARD_PREFIX}${secretBoxKeyId(options.key)}.${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`
}

export interface OpenSiteCardOptions {
  /** Host der Anfrage (wird normalisiert). */
  host: string | null | undefined
  /** Community, zu der der Host JETZT gehört ('' = kein Mandant). */
  communityId: string
  now: number
  keys: readonly Buffer[]
  cookieName: string
}

type Payload = { s?: unknown, sid?: unknown, uid?: unknown, h?: unknown, c?: unknown, exp?: unknown, at?: unknown }

/**
 * Karte öffnen. `null` bei: falschem Präfix, unbekanntem Schlüssel,
 * Manipulation, anderem Cookie-Namen, falschem Host, falscher Community,
 * Ablauf oder unvollständigem Inhalt.
 */
export function openSiteCard(value: string, options: OpenSiteCardOptions): SiteCardClaims | null {
  if (!value.startsWith(SITE_CARD_PREFIX)) return null
  const host = handoffAudience(options.host)
  if (!host || !options.cookieName) return null

  const rest = value.slice(SITE_CARD_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot === -1) return null
  const keyId = rest.slice(0, dot)
  const key = options.keys.find(candidate => secretBoxKeyId(candidate) === keyId)
  if (!key) return null

  const body = rest.slice(dot + 1)
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null
  const raw = Buffer.from(body, 'base64url')
  if (raw.length <= IV_BYTES + TAG_BYTES) return null

  let payload: Payload
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
    decipher.setAAD(Buffer.from(options.cookieName, 'utf8'))
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
    payload = JSON.parse(plain) as Payload
  }
  catch {
    // Manipuliert oder nicht mit diesem Schlüssel versiegelt — eine ungültige
    // Karte ist „nicht angemeldet", kein Fehler der Anfrage.
    return null
  }

  if (!payload || typeof payload !== 'object') return null
  const { s, sid, uid, h, c, exp, at } = payload
  if (typeof s !== 'string' || !s) return null
  if (typeof sid !== 'string' || typeof uid !== 'string') return null
  if (typeof h !== 'string' || typeof c !== 'string') return null
  if (typeof exp !== 'number' || typeof at !== 'number' || !Number.isFinite(exp) || !Number.isFinite(at)) return null
  if (h !== host) return null
  if (c !== options.communityId) return null
  if (exp <= options.now) return null

  return { secret: s, sessionId: sid, userId: uid, host: h, communityId: c, expiresAt: exp, authAt: at }
}
