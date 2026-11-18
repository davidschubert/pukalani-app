import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * WEM EIN LAUF DES ÖFFENTLICHEN BRAND-CHECKS GEHÖRT (LL1 b, 2026-11-18).
 *
 * Der Check läuft ohne Konto, und seit er hinter der Antwort rechnet, muss
 * die Seite seinen Stand abfragen. Zwei Fragen brauchen deshalb eine Antwort,
 * die ohne Anmeldung trägt: „ist das mein Lauf?" und „läuft meiner schon?".
 *
 * ── DER GEGENSTAND: ADRESSE UND BESUCHER, ALS SCHLÜSSEL-HASH ──────────────
 * `brand_runs.subject` ist ein Hash aus der geprüften Adresse UND dem
 * Besucher (Konto, sonst der Tages-Stempel des Anschlusses). Derselbe
 * Besucher mit derselben Adresse trifft damit immer dieselbe Sperre — ein
 * zweiter Reiter, ein Doppelklick oder ein Neuladen startet nicht doppelt.
 * Ein FREMDER mit derselben Adresse trifft sie nie: er erfährt nicht, dass
 * ein Lauf existiert, und bekommt seinen eigenen (wie vor dem Umbau; das
 * Ergebnis teilen sich beide danach ohnehin über den Zwischenspeicher).
 * Gesalzen mit dem Server-Schlüssel wie der Anschluss-Stempel selbst: aus
 * der Zeile lässt sich weder die Adresse noch das Konto zurückrechnen.
 *
 * ── DAS KENNZEICHEN: NUR DER STARTER BEKOMMT ES ───────────────────────────
 * Die Antwort des Starts trägt ein Kennzeichen, mit dem die Seite den Stand
 * abfragt: `<Zeilen-Id>.<Unterschrift>`. Die Unterschrift ist ein HMAC über
 * die Zeilen-Id und einen Zufallswert, der NUR an der Zeile steht (`key` im
 * Detail). Erraten lässt es sich nicht (256 Bit), und es braucht BEIDES: wer
 * nur die Tabelle sieht, kennt den Server-Schlüssel nicht; wer nur den
 * Schlüssel kennt, kennt den Zufallswert nicht.
 *
 * WARUM NICHT EIN ZUFALLSWERT, DESSEN HASH AN DER ZEILE STEHT: dann könnte
 * der Server das Kennzeichen kein zweites Mal ausstellen. Genau das braucht
 * der zweite Start desselben Besuchers aber — er bekommt keinen neuen Lauf,
 * sondern das Kennzeichen des laufenden (derselbe Gegenstand belegt, dass er
 * derselbe Besucher mit derselben Adresse ist). So folgt ein zweiter Reiter
 * oder ein zweites Gerät am selben Anschluss demselben Lauf, ohne dass der
 * Browser sich dafür etwas merken muss.
 *
 * ── EINE ABLEHNUNG, IMMER DIESELBE ────────────────────────────────────────
 * Die lesende Route antwortet auf ein unbekanntes, fremdes, verfälschtes
 * oder falsch geformtes Kennzeichen wortgleich mit 404 — sie verrät nicht,
 * ob es die Zeile gibt. Verglichen wird in konstanter Zeit.
 *
 * ── DER SERVER-SCHLÜSSEL ALS SALZ ─────────────────────────────────────────
 * Derselbe Wert wie beim Anschluss-Stempel (`brandCheckIpHash`), aus
 * demselben Grund: keine weitere Pflicht-Variable. Wird der Schlüssel
 * getauscht, verlieren laufende Läufe ihr Kennzeichen — das Ergebnis
 * entsteht trotzdem, und ein erneuter Start findet es im Zwischenspeicher.
 * Ein Kennzeichen lebt Minuten, kein dauerhafter Link hängt daran.
 */

/** Die Form eines Kennzeichens: Zeilen-Id der Lauf-Sperre, Punkt, HMAC (base64url). */
const TOKEN_PATTERN = /^(r[0-9a-f]{31})\.([\w-]{43})$/

function secretOf(event: H3Event): string {
  return useRuntimeConfig(event).appwriteKey || 'brand-check'
}

/** Wer startet: das Konto, sonst der Tages-Stempel des Anschlusses. */
export function brandCheckRunVisitor(userId: string, ipHash: string): string {
  return userId ? `u:${userId}` : `a:${ipHash}`
}

/** Der Gegenstand der Sperre — 64 Hex-Zeichen, passt in `brand_runs.subject`. */
export function brandCheckRunSubject(event: H3Event, urlKey: string, visitor: string): string {
  return createHash('sha256')
    .update(`${secretOf(event)}|brand-check-run|${urlKey}|${visitor}`)
    .digest('hex')
}

/** Der Zufallswert eines Laufs — steht nur an der Zeile (`detail.key`). */
export function newBrandCheckRunNonce(): string {
  return randomBytes(24).toString('base64url')
}

function signatureOf(event: H3Event, rowId: string, nonce: string): string {
  return createHmac('sha256', secretOf(event))
    .update(`brand-check-run|${rowId}|${nonce}`)
    .digest('base64url')
}

/** Das Kennzeichen eines Laufs — nur für den Starter (s. Kopf). */
export function brandCheckRunToken(event: H3Event, rowId: string, nonce: string): string {
  return `${rowId}.${signatureOf(event, rowId, nonce)}`
}

/** Die Zeilen-Id aus einem Kennzeichen — oder leer, wenn es keines sein kann. */
export function brandCheckRunTokenRowId(token: string): string {
  return TOKEN_PATTERN.exec(token)?.[1] ?? ''
}

/**
 * Passt das Kennzeichen zu dieser Zeile? Ohne Zufallswert an der Zeile
 * (fremde Art, kaputtes Detail) passt nichts.
 */
export function brandCheckRunTokenMatches(event: H3Event, token: string, rowId: string, nonce: string): boolean {
  const match = TOKEN_PATTERN.exec(token)
  if (!match || match[1] !== rowId || !nonce) return false
  const given = Buffer.from(match[2] ?? '')
  const wanted = Buffer.from(signatureOf(event, rowId, nonce))
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}
