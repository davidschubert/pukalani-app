/**
 * DER WIEDERHOL-SCHUTZ EINES GESPRÄCHS-ZUGES (P3.2).
 *
 * ── WARUM ES KEINE IDEMPOTENZ WIE BEI DER GENERIERUNG GIBT ────────────────
 * Ein Entwurf legt seinen Idempotenzschlüssel in `brand_steps.generations` ab
 * und kann bei einer Wiederholung DENSELBEN Entwurf noch einmal ausliefern —
 * er hat ein Ergebnis, das sich aufheben lässt. Ein Gesprächszug hat das nicht:
 * sein Ergebnis ist eine Nachricht, die bereits im Verlauf steht und beim
 * nächsten Aufschlagen des Bausteins ohnehin wieder erscheint.
 *
 * Was bleibt, ist die eine Zusage aus Plan §6: „was nichts kostet, kostet kein
 * Kontingent" — und ihre Umkehrung, dass ein DOPPELT abgeschickter Zug nicht
 * ZWEIMAL kosten darf. Genau das leistet diese Datei: ein Schlüssel, den wir
 * schon gesehen haben, bekommt kein zweites Mal einen Anbieter-Aufruf.
 *
 * ── DER PREIS, AUSGESPROCHEN ──────────────────────────────────────────────
 * Der Wiederholende sieht seinen Zug NICHT noch einmal strömen; die Antwort ist
 * `{ conversed: false }`, und die Oberfläche verhält sich, als hätte es keine
 * Reaktion gegeben. Die Nachricht ist trotzdem geschrieben und steht nach dem
 * nächsten Laden da. Das ist der bessere Tausch: eine Sprechblase, die erst
 * beim Neuladen auftaucht, gegen einen zweiten bezahlten Aufruf.
 *
 * ── IM PROZESS, MIT ABSICHT ───────────────────────────────────────────────
 * Eine Map, wie die Generierungs-Sperre nebenan und mit derselben bewussten
 * Grenze: bei mehreren Node-Prozessen kennt jeder nur seine eigenen Schlüssel.
 * Der Schaden wäre ein zweiter Zug bei einem Retry, der zufällig auf einem
 * anderen Worker landet — die drei Tages-Deckel liegen im geteilten
 * Rate-Limit-Store und begrenzen die Rechnung weiterhin.
 */

/** Wie lange ein gesehener Schlüssel sperrt. Ein Retry kommt in Sekunden, nicht in Minuten. */
export const BRAND_CONVERSE_KEY_TTL_MS = 120_000

/** Damit die Map nicht wächst, solange der Prozess lebt. */
const MAX_KEYS = 500

const SEEN = new Map<string, number>()

function prune(now: number): void {
  for (const [key, at] of SEEN) {
    if (now - at >= BRAND_CONVERSE_KEY_TTL_MS) SEEN.delete(key)
  }
  // Notbremse gegen ein Skript, das in zwei Minuten 500 verschiedene Schlüssel
  // schickt: die ÄLTESTEN fliegen, `Map` hält Einfügereihenfolge.
  while (SEEN.size > MAX_KEYS) {
    const oldest = SEEN.keys().next()
    if (oldest.done) break
    SEEN.delete(oldest.value)
  }
}

/**
 * `true` = dieser Zug darf laufen (der Schlüssel ist neu und ab jetzt vergeben).
 * `false` = wir hatten ihn schon; der Aufrufer antwortet `{ conversed: false }`.
 *
 * OHNE Schlüssel ist die Antwort immer `true`: ein Client, der keinen schickt,
 * bekommt das Verhalten von vorher und nicht eine stille Ablehnung.
 */
export function claimBrandConverseKey(
  userId: string,
  key: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!key) return true
  prune(now)
  const id = `${userId}:${key}`
  if (SEEN.has(id)) return false
  SEEN.set(id, now)
  return true
}

/** Nur für Beweise/Tests. */
export function clearBrandConverseKeys(): void {
  SEEN.clear()
}
