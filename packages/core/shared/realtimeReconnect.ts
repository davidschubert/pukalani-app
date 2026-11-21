/**
 * WACHSENDE ABSTÄNDE BEIM NEUVERSUCH DER LIVE-VERBINDUNG (Q23-Rest, Bahn 2).
 *
 * Das Web-SDK hat eine Staffelung (1 s, 5 s, 10 s, 60 s), erreicht sie aber
 * nie, wenn der Server die Verbindung ANNIMMT und gleich wieder schließt: der
 * `open`-Handler nullt den Zähler, jeder Neuversuch wartet wieder 1 s — ein
 * Tab mit abgelehnter Verbindung klopft so 3600-mal je Stunde an.
 *
 * Hier zählt ein Fehlschlag nicht am `open`, sondern an der DAUER: eine
 * Verbindung, die kürzer als `RECONNECT_STABLE_MS` offen war (oder nie
 * aufging), ist ein Fehlschlag; erst eine, die so lange hielt, setzt den
 * Zähler zurück. Der Abstand verdoppelt sich ab 1 s bis `RECONNECT_MAX_MS`.
 *
 * Unberührt: ein gewolltes Schließen (JWT-Wechsel, Abmelden) — dann versucht
 * das SDK ohnehin nichts neu; die 120-s-Regel (das SDK pingt im Takt); der
 * Widerruf einer Sitzung (401-Frame, danach Schließen ohne Neuversuch).
 */

/** So lange muss eine Verbindung gehalten haben, damit sie als gesund zählt. */
export const RECONNECT_STABLE_MS = 30_000
/** Erster Neuversuch — wie bisher nach 1 s. */
export const RECONNECT_BASE_MS = 1_000
/** Obergrenze des Abstands. */
export const RECONNECT_MAX_MS = 60_000

/**
 * Neuer Stand des Fehlschlag-Zählers nach einem Schließen. `openForMs` ist
 * `null`, wenn die Verbindung gar nicht aufging.
 */
export function nextReconnectFailures(previous: number, openForMs: number | null): number {
  if (openForMs !== null && openForMs >= RECONNECT_STABLE_MS) return 0
  return previous + 1
}

/** Wartezeit vor dem nächsten Versuch: 1 s, 2 s, 4 s … höchstens 60 s. */
export function reconnectDelayMs(failures: number): number {
  const step = Math.max(0, failures - 1)
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(step, 16))
}
