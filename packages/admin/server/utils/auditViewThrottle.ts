import type { H3Event } from 'h3'
import type { AuditInput } from './audit'

/**
 * ANSICHTEN ENTPRELLEN (BE-021, 2026-11-16): wer eine Person in der Konsole
 * öffnet oder die Nutzerliste ansieht, steht im Protokoll — aber nicht bei
 * jedem Neuladen, jeder Seite der Liste und jedem Realtime-Nachladen. Ein
 * Eintrag je Schlüssel in 15 Minuten (Schlüssel: Betreiber+Konto bzw.
 * Betreiber+Liste).
 *
 * IM PROZESS, BEWUSST: ein Neustart oder ein zweiter Prozess schreibt im
 * schlimmsten Fall einen Eintrag mehr — das ist zu viel Protokoll, nie zu
 * wenig. Die Karte ist gedeckelt, damit ein Betreiber, der tausend Konten
 * öffnet, den Speicher nicht wachsen lässt.
 *
 * PUR bis auf die Karte: `now` kommt als Argument, damit der Test die Zeit
 * selbst führt. `due` fragt nur, `mark` merkt — gemerkt wird erst NACH einem
 * gelungenen Eintrag, sonst unterdrückte ein Ausfall 15 Minuten lang auch
 * den nächsten Versuch.
 */
export const AUDIT_VIEW_WINDOW_MS = 15 * 60 * 1000
export const AUDIT_VIEW_MAX_KEYS = 2000

export interface AuditViewThrottle {
  due: (key: string, now: number) => boolean
  mark: (key: string, now: number) => void
  size: () => number
}

export function createAuditViewThrottle(
  windowMs: number = AUDIT_VIEW_WINDOW_MS,
  maxKeys: number = AUDIT_VIEW_MAX_KEYS,
): AuditViewThrottle {
  const last = new Map<string, number>()

  return {
    due(key, now) {
      const at = last.get(key)
      return at === undefined || now - at >= windowMs
    },
    mark(key, now) {
      // Neu einsortieren hält die Karte nach Alter geordnet (älteste vorn).
      last.delete(key)
      if (last.size >= maxKeys) {
        for (const [oldKey, at] of last) {
          if (now - at >= windowMs) last.delete(oldKey)
        }
        // Immer noch voll: den ältesten Eintrag opfern — schlimmstenfalls ein
        // Protokoll-Eintrag mehr, nie einer weniger.
        while (last.size >= maxKeys) {
          const oldest = last.keys().next().value
          if (oldest === undefined) break
          last.delete(oldest)
        }
      }
      last.set(key, now)
    },
    size: () => last.size,
  }
}

/** Die eine Karte je Prozess für die Ansichten der Nutzerverwaltung. */
export const auditViewThrottle = createAuditViewThrottle()

/**
 * Eine Ansicht festhalten, höchstens einmal je Schlüssel und Fenster. Nie
 * strikt: eine Ansicht ist keine Herausgabe, ein Ausfall wird nur gemeldet.
 */
export async function recordAuditView(
  event: H3Event,
  key: string,
  input: AuditInput,
  now: number = Date.now(),
): Promise<void> {
  if (!auditViewThrottle.due(key, now)) return
  if (await recordAudit(event, input)) auditViewThrottle.mark(key, now)
}
