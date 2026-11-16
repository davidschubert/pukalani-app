import type { H3Event } from 'h3'
import { writeAuditLog, type AuditLogRow } from './auditLog'

/**
 * ANSICHTEN ENTPRELLEN (BE-021, 2026-11-16; seit SEC-033 im Core).
 *
 * Wer Personendaten ANSIEHT — ein Konto in der Konsole, die Nutzerliste, den
 * Text einer gemeldeten privaten Nachricht —, steht im Betreiber-Protokoll.
 * Aber nicht bei jedem Neuladen, jeder Seite einer Liste und jedem
 * Realtime-Nachladen: ein Eintrag je Schlüssel in 15 Minuten. Den Schlüssel
 * baut der Aufrufer (z. B. Betreiber+Konto, Betreiber+Liste,
 * Moderator+Nachricht).
 *
 * WARUM IM CORE: zuerst lag die Hilfe im admin-Layer. Die Moderation privater
 * Nachrichten (messages-Layer) braucht dieselbe Regel, darf admin aber nicht
 * importieren (Layer-Grenze A14) — und eine zweite Karte mit eigener Regel
 * wäre genau die Doppelung, aus der zwei Wahrheiten werden.
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
 *
 * NIE STRIKT: eine Ansicht ist keine Herausgabe. Fällt das Protokoll aus,
 * läuft die Ansicht weiter, und der Schreiber meldet `audit.write_failed`.
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

/** Die eine Karte je Prozess für alle Ansichten. Die Schlüssel tragen ihre Art vorn. */
export const auditViewThrottle = createAuditViewThrottle()

/** Was eine Ansicht festhält — der Handelnde kommt immer aus `event.context.user`. */
export type AuditViewInput = Omit<AuditLogRow, 'actorId' | 'actorName'>

/**
 * Eine Ansicht festhalten, höchstens einmal je Schlüssel und Fenster. Ohne
 * angemeldetes Konto kein Eintrag (es gibt niemanden, der handelt).
 */
export async function recordAuditView(
  event: H3Event,
  key: string,
  input: AuditViewInput,
  now: number = Date.now(),
): Promise<void> {
  const actor = event.context.user
  if (!actor) return
  if (!auditViewThrottle.due(key, now)) return
  const written = await writeAuditLog(event, { ...input, actorId: actor.$id, actorName: actor.name })
  if (written) auditViewThrottle.mark(key, now)
}
