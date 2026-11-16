/**
 * WAS DER ZEIT-LAUF `event-reminders` TUT (OPS-003, seit 2026-11-16).
 *
 * Stufe 1 — `'count'`: der Lauf geht stündlich alle Communities durch, schreibt
 * aber NICHTS (kein Merker, keine Benachrichtigung) und meldet nur die Zahlen
 * als eine Log-Zeile `events.reminder_count`. Grund: bis dahin erinnert noch
 * der alte Server-Zeitplan (stündlich `POST /api/events/reminder-sweep` für
 * eine Community). Liefen beide schreibend, wäre das zwar nicht doppelt (der
 * Merker je Termin schützt), aber niemand könnte an den Zahlen ablesen, ob der
 * neue Lauf dieselben Termine findet wie der alte, bevor der alte wegfällt.
 *
 * Stufe 2 — `'send'`: erst NACHDEM der Server-Zeitplan entfernt ist. Dann
 * erinnert dieser Lauf selbst, für jede Community.
 *
 * Eine Konstante im Code statt eines Schalters in der Konfiguration: der
 * Wechsel ist ein einmaliger, geprüfter Schritt mit eigenem Commit, kein
 * Zustand, den jemand im Betrieb umlegt.
 */
export type EventReminderJobMode = 'count' | 'send'

export const EVENT_REMINDER_JOB_MODE: EventReminderJobMode = 'count'
