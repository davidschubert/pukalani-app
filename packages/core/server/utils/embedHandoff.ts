import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { normalizeHost } from './tenantResolver'

/**
 * Session-Handoff — kurzlebige, verschlüsselte Übergabe einer Session an einen
 * ZWEITEN Browser-Kontext desselben Deployments. Zwei Nutzer:
 *
 *  1. **Embed** (E2, Embed-Plan § 3a): das Login-POPUP (Top-Level, first-party
 *     Session) reicht die Session an das cross-site eingebettete IFRAME —
 *     Popup: POST /api/auth/embed-handoff → iframe: POST /api/auth/embed-session.
 *     Beide Kontexte liegen auf DEMSELBEN Host.
 *  2. **Host-Wechsel** (O6, Schritt 9): der Kontroll-Host siegelt
 *     (POST /api/onboarding/handoff), der COMMUNITY-Host löst ein
 *     (GET /api/auth/site-session). Zwei verschiedene Hosts, dasselbe Deployment.
 *
 * STATELESS (AES-256-GCM + eingebetteter Ablauf): funktioniert über alle
 * pm2-Cluster-Worker hinweg ohne geteilten Store. Der Schlüssel wird aus dem
 * server-only Appwrite-API-Key abgeleitet (stabil pro App, nie im Client).
 *
 * ── DAS TOKEN IST AN SEINEN ZIEL-HOST GEBUNDEN ────────────────────────────
 * Sicherheits-Audit 2026-08-02, KRITISCH: vorher trug das Siegel nur Secret +
 * Ablauf. Damit öffnete JEDER Host desselben Deployments JEDES Token — und
 * `/start/done?host=…` nahm sein Ziel ungeprüft aus der Query. Ein Opfer,
 * das einen präparierten Link öffnete, schickte sein Siegel an eine fremde
 * Origin, die es binnen 60 s gegen einen echten Pukalani-Host einlöste und die
 * Session des Opfers übernahm (Kontoübernahme).
 *
 * Seither trägt das Siegel eine PFLICHT-Zielgruppe (`a` = normalisierter
 * Ziel-Host) und `openHandoffToken` verlangt sie ebenfalls als Pflichtargument.
 * Kein Default, keine Alt-Duldung: ein Token ohne passende Zielgruppe ist
 * `null`. Damit nützt ein abgefangenes Siegel dem Angreifer NIRGENDWO sonst —
 * er müsste den Host selbst kontrollieren, und dann hat er ohnehin schon
 * gewonnen. Beide Seiten laufen im selben Deployment (Wildcard-Site platform
 * bzw. dieselbe App), ein Versionssprung mit gemischten Formaten ist also nicht
 * möglich; ein misslungener Handoff endet zudem in beiden Aufrufern in einem
 * Fallback auf den normalen Login, nie in einer Sackgasse.
 *
 * Replay innerhalb der 60 s bleibt bewusst akzeptiert — jetzt aber nur noch
 * gegen den EINEN Host, für den gesiegelt wurde, und beide Einlöse-Routen
 * validieren das Secret ohnehin gegen Appwrite, bevor ein Cookie entsteht.
 */

export const HANDOFF_TTL_MS = 60_000

export function deriveHandoffKey(serverSecret: string): Buffer {
  return createHash('sha256').update(`${serverSecret}:pukalani-embed-handoff`).digest()
}

/**
 * Ziel-Host → Zielgruppe des Siegels. Dieselbe Normalisierung wie die
 * Mandanten-Auflösung (`normalizeHost`: Kleinschreibung, Port und Punkt weg) —
 * bewusst KEINE zweite Variante, sonst siegelt die eine Seite für
 * `Kunde-A.pukalani.app:443` und die andere sucht `kunde-a.pukalani.app`.
 * Leer heißt „kein Ziel" und ist nirgends gültig (fail-closed).
 */
export function handoffAudience(rawHost: string | undefined | null): string {
  return normalizeHost(rawHost)
}

/**
 * Was ein Siegel trägt (PK1 E1b). `secret` immer; die übrigen Felder nur im
 * Modus `write` des Kartenschalters — der Ziel-Host legt damit eine eigene
 * Sitzung an und gibt den Zeitpunkt der URSPRÜNGLICHEN Anmeldung weiter.
 * Ein Siegel ohne diese Felder (altes Format, oder `off`/`read`) bleibt
 * gültig: das Ziel nimmt dann die Angaben der geprüften Quell-Sitzung.
 */
export interface HandoffGrant {
  secret: string
  /** Konto der Quell-Sitzung. */
  userId?: string
  /** Die Quell-Sitzung. */
  sessionId?: string
  /** Zeitpunkt der ursprünglichen Anmeldung (ms seit 1970). */
  authAt?: number
}

/**
 * Siegel bauen (base64url iv.tag.cipher). `audience` = Host, der es einlösen
 * darf (Pflicht, s. Kopf). Inhalt: `s` Geheimnis, `exp`, `a` Ziel-Host, dazu
 * optional `u` Konto, `sid` Sitzung, `at` ursprüngliche Anmeldung.
 */
export function sealHandoff(grant: HandoffGrant, key: Buffer, audience: string, now: number = Date.now()): string {
  const target = handoffAudience(audience)
  if (!target) throw new Error('sealHandoffToken: audience is required')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify({
    s: grant.secret,
    exp: now + HANDOFF_TTL_MS,
    a: target,
    ...(grant.userId ? { u: grant.userId } : {}),
    ...(grant.sessionId ? { sid: grant.sessionId } : {}),
    ...(typeof grant.authAt === 'number' && Number.isFinite(grant.authAt) ? { at: grant.authAt } : {}),
  })
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

/**
 * Siegel öffnen — null bei Manipulation, falschem Schlüssel, Ablauf, fremder
 * Zielgruppe ODER einem Zusatzfeld mit falschem Typ. `audience` ist der
 * EIGENE Host des Einlösers. Öffnet beide Fassungen (mit und ohne Zusatz).
 */
export function openHandoff(token: string, key: Buffer, audience: string, now: number = Date.now()): HandoffGrant | null {
  const self = handoffAudience(audience)
  if (!self) return null
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const encrypted = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as { s?: unknown, exp?: unknown, a?: unknown, u?: unknown, sid?: unknown, at?: unknown }
    if (typeof payload.s !== 'string' || typeof payload.exp !== 'number') return null
    if (typeof payload.a !== 'string' || payload.a !== self) return null
    if (payload.exp < now) return null
    if (payload.u !== undefined && (typeof payload.u !== 'string' || !payload.u)) return null
    if (payload.sid !== undefined && (typeof payload.sid !== 'string' || !payload.sid)) return null
    if (payload.at !== undefined && (typeof payload.at !== 'number' || !Number.isFinite(payload.at))) return null
    return {
      secret: payload.s,
      ...(payload.u ? { userId: payload.u } : {}),
      ...(payload.sid ? { sessionId: payload.sid } : {}),
      ...(typeof payload.at === 'number' ? { authAt: payload.at } : {}),
    }
  }
  catch {
    return null
  }
}

/** Kurzform: nur das Geheimnis einsiegeln (Format vor E1b). */
export function sealHandoffToken(sessionSecret: string, key: Buffer, audience: string, now: number = Date.now()): string {
  return sealHandoff({ secret: sessionSecret }, key, audience, now)
}

/** Kurzform: nur das Geheimnis aus einem Siegel (beide Fassungen). */
export function openHandoffToken(token: string, key: Buffer, audience: string, now: number = Date.now()): string | null {
  return openHandoff(token, key, audience, now)?.secret ?? null
}
