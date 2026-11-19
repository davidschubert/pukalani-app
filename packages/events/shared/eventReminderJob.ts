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
 * STAND: `'send'` seit 2026-11-16. Der Zähl-Lauf lief auf Production (0
 * fällige Termine, 0 Fehler, 34 ms), der Server-Zeitplan ist an beiden Stellen
 * entfernt (crontab des Benutzers und Ploi).
 *
 * Eine Konstante im Code statt eines Schalters in der Konfiguration: der
 * Wechsel ist ein einmaliger, geprüfter Schritt mit eigenem Commit, kein
 * Zustand, den jemand im Betrieb umlegt.
 */
export type EventReminderJobMode = 'count' | 'send'

export const EVENT_REMINDER_JOB_MODE: EventReminderJobMode = 'send'

/**
 * WAS DER LAUF MIT TERMINEN NICHT ERREICHBARER COMMUNITIES TUT (SE1 d).
 *
 * Nicht erreichbar heißt: das Control Plane nennt die Community stillgelegt
 * (`status !== 'active'`) oder wegen Missbrauchs gesperrt (`suspension ===
 * 'abuse'`) — ihr Host antwortet 404, der Link in der Erinnerung führte ins
 * Leere. Die Zahlungs-Sperre zählt NICHT dazu (dort wird weiter erinnert).
 * Ohne Antwort des Control Plane wird in beiden Modi erinnert.
 *
 * Stufe 1 — `'count'`: der Lauf erinnert WEITER wie bisher und zählt nur, wie
 * viele Erinnerungen er auslassen würde (Zeile `events.reminder_unreachable`
 * je Takt, im Pool auch bei lauter Nullen). Grund wie bei
 * `EVENT_REMINDER_JOB_MODE` oben: bevor der Lauf etwas WEGLÄSST, soll an den
 * Zahlen von Production ablesbar sein, dass die Frage ans Control Plane
 * beantwortet wird und nur die gemeinten Termine trifft.
 *
 * Stufe 2 — `'skip'`: erst NACH einem gezählten Lauf auf Production, eigener
 * Commit. Dann bekommt ein Termin einer genannten Community keine Erinnerung
 * und keinen Merker — er bleibt fällig, und geht die Community vor dem Beginn
 * wieder ans Netz, erinnert ein späterer Takt.
 *
 * STAND: `'skip'` seit 2026-11-19. Der Zähl-Lauf lief auf Production (ein
 * Takt: 0 Termine, 0 Erinnerungen, kein Takt ohne Antwort — es war kein
 * Termin fällig, also gab es auch nichts zu fragen). NICHT gesehen ist damit
 * eine echte Antwort des Control Plane auf Production und ein ausgelassener
 * Termin; beides zeigt der tägliche Blick in die App, sobald es vorkommt
 * (Zeile `erinnerungen …` des Zähl-Skripts). Der Rückweg ist diese eine Zeile.
 *
 * Eine Konstante im Code statt eines Schalters, aus demselben Grund wie oben:
 * der Wechsel ist ein einmaliger, geprüfter Schritt.
 */
export type EventReminderUnreachableMode = 'count' | 'skip'

export const EVENT_REMINDER_UNREACHABLE_MODE: EventReminderUnreachableMode = 'skip'
