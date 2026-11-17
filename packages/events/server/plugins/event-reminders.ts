import { EVENT_REMINDER_JOB_MODE } from '../../shared/eventReminderJob'
import { runEventReminderJob } from '../utils/eventReminders'

/**
 * DER TAKT DER TERMIN-ERINNERUNGEN (OPS-003, seit 2026-11-16).
 *
 * Bis dahin erinnerte nur, wer die Events-Seite einer Community öffnete, und
 * ein Server-Zeitplan, der stündlich die Route `reminder-sweep` für EINE
 * Community rief. Alle anderen Communities bekamen ihre Erinnerung nur, wenn
 * zufällig jemand in den 24 h vor dem Termin vorbeischaute. Dieser Lauf geht
 * stündlich alle Communities durch (Arbeit und Begründungen in
 * `server/utils/eventReminders.ts`). Was er tut — zählen oder erinnern —
 * steht in `shared/eventReminderJob.ts`.
 *
 * STÜNDLICH, weil der Vorlauf 24 h beträgt: eine Stunde Versatz verschiebt
 * eine Erinnerung von „24 h vorher" auf „23 h vorher", mehr nicht.
 *
 * ERSTER LAUF NACH 5 MINUTEN: beim Neuladen leben alter und neuer Prozess
 * kurz nebeneinander, und die Warteschlange im Prozess sieht den anderen
 * nicht. Fünf Minuten legen den ersten Takt weit hinter das Ende des alten
 * Prozesses — danach schützt die feste Zeilen-Id je Erinnerung (BE-018).
 *
 * KEIN TOR VOR DEM ANMELDEN außer dem Layer selbst: das Plugin liegt im
 * events-Layer und fährt damit genau in den Apps, die ihn erweitern. Ob das
 * Produkt dort gerade AN ist (Not-Aus, Entitlement), fragt der Takt selbst
 * (`'skipped'`) — der Schalter ändert sich zur Laufzeit, und das Manifest
 * registriert sich in `product-manifest.ts`, das Nitro nach dieser Datei lädt.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000

export default defineNitroPlugin(() => {
  // unref, damit die Timer einen sauberen Exit (CLI, Tests) nicht offen halten.
  defineTimedJob({
    name: 'event-reminders',
    everyMs: SWEEP_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: () => runEventReminderJob(EVENT_REMINDER_JOB_MODE),
  })
})
