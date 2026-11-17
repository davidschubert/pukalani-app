/**
 * DER HERZSCHLAG IM BERATER-STROM (LL1 b, 2026-11-17).
 *
 * Die zwei Strom-Routen des Markenberaters (`…/steps/:stepKey/generate` und
 * `…/converse`) halten eine Antwort offen, solange das Modell schreibt. Der
 * Webserver davor trennt eine Verbindung nach 60 s STILLE
 * (`proxy_read_timeout`; die Frist wird bewusst nicht angehoben). Still ist
 * der Strom genau in den Phasen, in denen der Mensch am meisten wartet: das
 * Modell denkt vor dem ersten Wort, die Nachprüfung läuft, ein Parallel-Platz
 * ist belegt. Dann sah der Browser einen abgerissenen Strom, obwohl der
 * Server weiterrechnete.
 *
 * Deshalb schreibt der Server, solange der Strom offen ist, alle 15 s eine
 * SSE-KOMMENTARZEILE (`: ping`). Die Form ist mit Absicht gewählt: der Leser
 * im Browser (`decodeBrandGenerationChunk`, `shared/brandGeneration.ts`)
 * nimmt aus einem Frame nur `data:`-Zeilen — und das tut er nicht erst seit
 * heute. Ein ALTER Browser-Stand, der während eines Ausrollens mit dem neuen
 * Server spricht, überliest das Zeichen also genauso wie der neue
 * (`brandStreamHeartbeat.test.ts` belegt es am echten Leser).
 *
 * Drei Zusagen der Hilfe:
 *  · sie WIRFT NIE — ein Herzschlag, der nicht geschrieben werden kann,
 *    beendet nur sich selbst, nie den Strom;
 *  · sie schreibt NICHTS mehr, sobald der Strom zu ist (`writableEnded`,
 *    `destroyed`, `close`/`finish`) — auch wenn eine Route das Stoppen vergäße;
 *  · ihr Takt hält den Prozess nicht am Leben (`unref`).
 * Die Routen stoppen sie trotzdem in JEDEM Ausgang selbst (`fail()` und
 * `finally`): das Selbst-Abschalten ist das Netz, nicht der Weg.
 */

/** Rund alle 15 s — sicher unter der 60-s-Frist, auch wenn ein Takt sich verspätet. */
export const BRAND_STREAM_HEARTBEAT_MS = 15_000

/** Eine SSE-Kommentarzeile mit Leerzeile: ein eigener Frame ohne `data:`. */
export const BRAND_STREAM_HEARTBEAT_FRAME = ': ping\n\n'

/** Was die Hilfe von der Antwort braucht — `ServerResponse` erfüllt es, die Test-Fälschung auch. */
export interface BrandStreamHeartbeatTarget {
  readonly writableEnded: boolean
  readonly destroyed?: boolean
  write: (chunk: string) => unknown
  once?: (name: 'close' | 'finish', listener: () => void) => unknown
}

/**
 * Startet den Takt und gibt die Stopp-Funktion zurück (beliebig oft rufbar).
 */
export function startBrandStreamHeartbeat(
  res: BrandStreamHeartbeatTarget,
  intervalMs: number = BRAND_STREAM_HEARTBEAT_MS,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null

  const stop = (): void => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  const beat = (): void => {
    if (res.writableEnded || res.destroyed) {
      stop()
      return
    }
    try {
      res.write(BRAND_STREAM_HEARTBEAT_FRAME)
    }
    catch {
      // Ein Strom, in den nichts mehr geht, braucht auch keinen Herzschlag.
      stop()
    }
  }

  timer = setInterval(beat, intervalMs)
  const handle: unknown = timer
  if (handle && typeof handle === 'object' && typeof (handle as { unref?: unknown }).unref === 'function') {
    (handle as { unref: () => void }).unref()
  }

  try {
    res.once?.('close', stop)
    res.once?.('finish', stop)
  }
  catch {
    // Ohne Ereignisse bleibt die Prüfung vor jedem Takt (`writableEnded`).
  }

  return stop
}
