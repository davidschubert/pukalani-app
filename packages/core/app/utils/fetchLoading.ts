/**
 * ── „LÄDT" BEI EINEM ABRUF, DER NUR IM BROWSER LÄUFT (FE-003, Q15, 2026-11-21) ─
 *
 * Ein Abruf mit `server: false` hat auf dem Server den Zustand `idle` — er ist
 * dort nie gestartet. Im Browser startet Nuxt ihn in `onBeforeMount`, also VOR
 * dem ersten Zeichnen beim Übernehmen der Server-Seite: dort steht der Zustand
 * schon auf `pending`.
 *
 * Eine Vorlage, die nur auf `status === 'pending'` verzweigt, zeichnet deshalb
 * zwei verschiedene Seiten: der Server den Zweig „fertig, nichts da" (leere
 * Tabelle, „Keine Einträge"), der Browser den Lade-Zweig. Vue meldet
 * „Hydration completed but contains mismatches" und baut den Teil neu auf; bis
 * dahin stand im ausgelieferten HTML eine falsche Auskunft. So gemessen auf
 * vier Dashboard-Seiten (Kategorien, Vertrauensstufen, Nachrichten, Gemeldete
 * Nachrichten).
 *
 * Die ehrliche Auskunft ist auf beiden Seiten dieselbe: solange kein Ergebnis
 * da ist, LÄDT die Seite — `idle` (noch nicht gestartet) und `pending`
 * (unterwegs) sind für den Leser dasselbe. Nach dem ersten Abruf heißt der
 * Zustand `success` oder `error`; `idle` kommt dann nur noch nach `clear()`
 * vor, und auch dann ist nichts geladen.
 *
 * NICHT für Abrufe mit `immediate: false` (dort heißt `idle` „wartet auf einen
 * Klick") — die verzweigen selbst.
 */
export type FetchStatus = 'idle' | 'pending' | 'success' | 'error'

export function isFetchLoading(status: FetchStatus): boolean {
  return status === 'idle' || status === 'pending'
}
