/**
 * Recount+Write pro Post serialisieren (Muster comments/voteLock): parallele
 * Votes verschiedener User könnten sonst einen Write auf VERALTETEM Recount
 * hinterlassen (Lost Update — Zähler driften bis zum nächsten Vote).
 * In-memory — reicht für Single-Instanz (wie das Rate-Limit).
 */
const queues = new Map<string, Promise<unknown>>()

export async function serializePerPost<T>(postId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(postId) ?? Promise.resolve()
  // eslint-disable-next-line pukalani/no-silent-catch -- Ende einer Sperr-Kette: den Fehler bekommt der Aufrufer des Glieds, die Kette selbst darf nie abgelehnt sein
  const run = prev.catch(() => {}).then(fn)
  queues.set(postId, run)
  try {
    return await run
  }
  finally {
    if (queues.get(postId) === run) queues.delete(postId)
  }
}
