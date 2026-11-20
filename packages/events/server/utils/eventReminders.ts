import { createHash } from 'node:crypto'
import { Query } from 'node-appwrite'
import { encodeNotificationWhen } from '../../../core/shared/notificationWhen'
import type { NotifyInput, NotifyResult } from '../../../core/server/utils/notify'
import { listAllRows } from '../../../core/server/utils/listAllRows'
import type { EventReminderJobMode, EventReminderUnreachableMode } from '../../shared/eventReminderJob'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow } from '../../shared/types/event'

/** Vorlauf der Erinnerung (Entscheidung David, EVENTS-V2 §8.2: 24 h) */
const REMINDER_LEAD_MS = 24 * 3600_000

/**
 * Erinnerung 24 h vor dem Beginn: published-Termine, die innerhalb der
 * nächsten 24 h starten und noch nicht erinnert wurden, lösen eine
 * Benachrichtigung an alle Zusager aus (Core-Vertrag notify()).
 *
 * DER WEG ist seit OPS-003 (2026-11-16) der Zeit-Lauf `event-reminders`
 * (`sweepAllEventReminders` unten), stündlich über ALLE Communities. Bis
 * BE-018 (2026-11-17) stieß zusätzlich JEDER Aufruf der Termin-Liste einen
 * Lauf an, auch von Gästen — das ist entfernt. Die Route `reminder-sweep`
 * (eine Community je Aufruf, Schlüssel `NUXT_EVENTS_SWEEP_KEY`) rief seit
 * OPS-003 niemand mehr; sie ist seit dem 2026-11-17 (SE1 d) gelöscht.
 *
 * „GENAU EINMAL" je (Termin, Empfänger, Beginn) macht die feste Zeilen-Id der
 * Benachrichtigung (`eventReminderRowId`, `notify({ rowId })`): ein zweiter
 * Versuch läuft in Appwrites 409 — keine Zeile, keine Mail. Der Merker
 * `remindersSentAt` steht deshalb erst NACH den Benachrichtigungen und nur,
 * wenn keine an einer Störung scheiterte; sonst holt der nächste Takt die
 * Fehlenden nach. Bis BE-018 stand er ZUERST — ein abgebrochener Versand
 * kostete den Rest seine Erinnerung.
 *
 * WER HANDELT (F17): KEIN `actor` — ein Sweep. Geschrieben wird nur ein
 * Versand-Merker auf fremden Zeilen. Weder tritt der Aufrufer dadurch der
 * Community bei (A5), noch soll eine Zahlungssperre die Erinnerung an einen
 * Termin verschlucken, den die Zusager längst im Kalender haben.
 */

/**
 * EINE WARTESCHLANGE IM PROZESS: ein Sweep nach dem anderen, und der spätere
 * liest erst, wenn der frühere seine Merker gesetzt hat. Seit BE-018 schützt
 * die feste Zeilen-Id ohnehin vor Doppeln; die Schlange spart die Arbeit
 * (Zusagen lesen, 409 kassieren) und hält die Zähler ehrlich.
 *
 * WARUM KEINE LAUF-SPERRE MIT EIGENER TABELLE (`core/shared/runLease.ts`):
 * sie bräuchte im Pool-Projekt eine neue Tabelle samt Migration, und decken
 * würde sie nur das Fenster von Sekunden, in dem beim Neuladen der alte und
 * der neue Prozess beide leben. Innerhalb eines Prozesses ist diese Kette die
 * Sperre; zwischen Prozessen ist es die feste Zeilen-Id je Erinnerung, und
 * `firstRunMs` des Zeit-Laufs legt dessen ersten Takt weit hinter das Ende
 * des alten Prozesses. Single-Instanz-Annahme wie bei allen Sweeps hier.
 */
let reminderQueue: Promise<unknown> = Promise.resolve()

function inReminderQueue<T>(work: () => Promise<T>): Promise<T> {
  const run = reminderQueue.then(work, work)
  // Die Kette selbst darf nie abgelehnt sein, sonst übersprängen spätere
  // Glieder ihre Arbeit — der Fehler gehört dem Aufrufer, nicht der Kette.
  // eslint-disable-next-line pukalani/no-silent-catch -- Ende einer Sperr-Kette: den Fehler bekommt der Aufrufer des Glieds, die Kette selbst darf nie abgelehnt sein
  reminderQueue = run.catch(() => {})
  return run
}

/**
 * Feste Zeilen-Id der Erinnerung je (Termin, Empfänger, Beginn) — der
 * Idempotenz-Schlüssel für `notify()` (Muster `pastDueNoticeRowId`, onboarding).
 * Der BEGINN gehört hinein, damit ein verschobener Termin erneut erinnern KANN.
 * `evrem-` + 30 Hex = 36 Zeichen: Appwrites Grenze, nur erlaubte Zeichen,
 * Anfang ein Buchstabe. Liegt hier und nicht in `shared/`, weil nur der
 * Server sie braucht und `node:crypto` nicht in den Browser gehört.
 */
export function eventReminderRowId(eventId: string, userId: string, startAt: string): string {
  const digest = createHash('sha256').update(`${eventId}|${userId}|${startAt}`).digest('hex')
  return `evrem-${digest.slice(0, 30)}`
}

/** Was die Arbeit je Termin von ihrer Umgebung braucht. */
interface ReminderPort {
  /** Alle Zusagen (`going`) des Termins. */
  listGoing: (eventId: string) => Promise<EventRsvpRow[]>
  /** Den Versand-Merker setzen. */
  markSent: (eventId: string, at: string) => Promise<void>
  /** Eine Erinnerung schreiben (Ablage-Felder kennt nur der Aufrufer). */
  notify: (input: Omit<NotifyInput, 'scope' | 'communityId'>) => Promise<NotifyResult>
}

interface ReminderOutcome {
  recipients: number
  reminded: number
  errors: number
}

/**
 * DIE ARBEIT JE TERMIN, EINMAL für beide Wege: Zusagen lesen ⇒ je Zusage eine
 * Erinnerung mit fester Zeilen-Id ⇒ Merker, wenn niemand an einer STÖRUNG
 * scheiterte (`created: false` ohne `duplicate` und ohne `skipped`, oder ein
 * Wurf). Eine Dublette ist kein Fehler und kein `reminded` — die Erinnerung
 * steht schon da; ebenso eine Zusage, deren Konto inzwischen aus der Community
 * entfernt ist (`skipped`, MM1 b). Ein Lesefehler lässt den Termin für den nächsten Takt liegen.
 */
async function remindEvent(row: EventRow, port: ReminderPort, nowIso: string, dryRun: boolean): Promise<ReminderOutcome> {
  const outcome: ReminderOutcome = { recipients: 0, reminded: 0, errors: 0 }
  let rsvps: EventRsvpRow[]
  try {
    rsvps = await port.listGoing(row.$id)
  }
  catch {
    outcome.errors++
    return outcome
  }
  outcome.recipients = rsvps.length
  if (dryRun) return outcome

  // Rohwert statt fertigem Text (BE-018): Zeitpunkt + Zone DES TERMINS. Zone
  // und Sprache wählt erst, wer liest — Glocke und Mail (core/shared/notificationWhen.ts).
  const body = encodeNotificationWhen(row.startAt, row.timezone)
  let failed = 0
  for (const rsvp of rsvps) {
    try {
      const sent = await port.notify({
        recipientId: rsvp.userId,
        type: 'reminder',
        title: row.title,
        body,
        link: `/events/${row.$id}`,
        rowId: eventReminderRowId(row.$id, rsvp.userId, row.startAt),
      })
      if (sent.created) outcome.reminded++
      // Bewusst nicht geschrieben (Empfänger aus der Community entfernt, MM1 b)
      // ist wie die Dublette KEINE Störung — sonst bliebe der Termin fällig
      // und der Lauf fragte jede Stunde wieder.
      else if (!sent.duplicate && !sent.skipped) failed++
    }
    catch {
      failed++
    }
  }
  outcome.errors += failed
  if (failed > 0) return outcome

  try {
    await port.markSent(row.$id, nowIso)
  }
  catch {
    // Ohne Merker bleibt der Termin fällig; der nächste Takt läuft für jede
    // Zusage in die Dublette — keine zweite Erinnerung, nur Arbeit.
    outcome.errors++
  }
  return outcome
}

// ── DER ZEIT-LAUF ÜBER ALLE COMMUNITIES (OPS-003, seit 2026-11-16) ──────────

/**
 * So viele fällige Termine fasst EIN Lauf höchstens an. Ein Lauf liest alle
 * Zusagen jedes Termins und schreibt je Zusage eine Benachrichtigung (bei
 * `instant` auch eine Mail) — ohne Deckel wüchse ein einzelner Takt mit der
 * Zahl der Communities ins Unbegrenzte und überlappte den nächsten. 200 liegt
 * weit über dem, was heute in 24 h ansteht; der Rest kommt im nächsten Takt
 * (der Termin bleibt fällig, bis er beginnt), und `dueEvents === 200` im Log
 * zeigt, dass der Deckel gegriffen hat.
 */
export const EVENT_REMINDER_RUN_CAP = 200

/** Seitengröße beim Lesen der fälligen Termine. */
const DUE_PAGE = 100

export interface EventReminderSweepResult {
  /** Verschiedene Communities mit mindestens einem fälligen Termin (Silo: das eine Projekt). */
  communities: number
  /** Fällige Termine, die dieser Lauf angefasst hat (höchstens EVENT_REMINDER_RUN_CAP). */
  dueEvents: number
  /** Zusagen (`going`) dieser Termine — wer eine Erinnerung bekommt bzw. bekäme. */
  recipients: number
  /** Tatsächlich geschriebene Erinnerungen; im Zähl-Modus immer 0. */
  reminded: number
  /** Fehler je Termin oder Empfänger — sie halten den Lauf nicht an. */
  errors: number
  /**
   * SE1 d: wurde das Control Plane gefragt, welche Communities nicht
   * erreichbar sind? Nur im Pool und nur, wenn es fällige Termine MIT Stempel
   * gab — einmal je Takt.
   */
  reachabilityAsked: boolean
  /** … und hat es geantwortet? `false` ⇒ es wurde erinnert wie bisher. */
  reachabilityAnswered: boolean
  /** Verschiedene genannte (nicht erreichbare) Communities mit fälligen Terminen. */
  unreachableCommunities: number
  /** Fällige Termine dieser Communities. */
  unreachableEvents: number
  /**
   * Zusagen dieser Termine — die Erinnerungen, die Stufe 2 (`'skip'`)
   * auslassen würde. Nur im Modus `'count'`; `'skip'` liest die Zusagen nicht.
   */
  unreachableRecipients: number
}

/** Eine Termin-Zeile mit Mandanten-Stempel (Pool: `communities.tenantId`, Silo: fehlt). */
type StampedEventRow = EventRow & { communityId?: string | null }

function tenancyEnabled(): boolean {
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  return appConfig.pukalani?.tenancy?.enabled === true
}

/**
 * Alle Communities in einem Lauf, OHNE Request — Muster Digest-Sweep
 * (core/server/utils/emailDigest.ts).
 *
 * AUSSERHALB DER DATENTÜR, BEWUSST: ein Sweep ist per Definition
 * mandantenübergreifend (tenant-isolation, „AUSSERHALB der Tür erlaubt").
 * Er liegt deshalb in `server/utils`, wo der Admin-Client hingehört, und
 * nicht im Plugin — der richtige Ort statt einer `eslint-disable`-Zeile
 * (dieselbe Wahl wie bei den Sweeps in comments, market und brand).
 *
 * DER MANDANT KOMMT AUS DER ZEILE: im Pool trägt jede Termin-Zeile den
 * Stempel, den die Datentür beim Anlegen setzt (`communityId` =
 * `communities.tenantId`, `scopeRowFor`). Genau diesen Wert erwartet
 * `notify()` als `communityId` — die Erinnerung landet in der Glocke IHRER
 * Community, nicht in der „unbekannt"-Ablage. Im Silo (Mandanten-Auflösung
 * aus) gibt es keinen Stempel, das Projekt IST die Grenze; `notify()` legt
 * dann ab wie beim bisherigen Sweep.
 *
 * Die Arbeit je Termin ist `remindEvent` oben:
 * Zusagen lesen, benachrichtigen, Merker zuletzt. `dryRun` liest nur und
 * schreibt nichts.
 *
 * Ein Lesefehler der Termin-Liste wirft (der Zeit-Lauf meldet `failed`);
 * Fehler bei EINEM Termin oder Empfänger werden gezählt.
 */
export function sweepAllEventReminders(options: { dryRun: boolean, unreachableMode: EventReminderUnreachableMode }): Promise<EventReminderSweepResult> {
  return inReminderQueue(() => sweepAll(options.dryRun, options.unreachableMode))
}

async function sweepAll(dryRun: boolean, unreachableMode: EventReminderUnreachableMode): Promise<EventReminderSweepResult> {
  const result: EventReminderSweepResult = {
    communities: 0,
    dueEvents: 0,
    recipients: 0,
    reminded: 0,
    errors: 0,
    reachabilityAsked: false,
    reachabilityAnswered: false,
    unreachableCommunities: 0,
    unreachableEvents: 0,
    unreachableRecipients: 0,
  }
  const config = useRuntimeConfig()
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient()
  const pooled = tenancyEnabled()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Erst die ganze Liste (bis zum Deckel), dann die Arbeit: der Merker
  // nimmt bearbeitete Termine aus dem Filter, und ein Cursor über eine
  // schrumpfende Menge ist keine Grundlage, auf die man sich verlässt.
  const due: StampedEventRow[] = []
  let cursor: string | null = null
  while (due.length < EVENT_REMINDER_RUN_CAP) {
    const rows: StampedEventRow[] = (await tablesDB.listRows<StampedEventRow>({
      databaseId,
      tableId: EVENTS_TABLE,
      queries: [
        Query.equal('status', 'published'),
        Query.greaterThan('startAt', new Date(now).toISOString()),
        Query.lessThanEqual('startAt', new Date(now + REMINDER_LEAD_MS).toISOString()),
        Query.isNull('remindersSentAt'),
        Query.orderAsc('startAt'),
        Query.limit(Math.min(DUE_PAGE, EVENT_REMINDER_RUN_CAP - due.length)),
        ...(cursor === null ? [] : [Query.cursorAfter(cursor)]),
      ],
    })).rows
    due.push(...rows)
    if (rows.length < DUE_PAGE) break
    cursor = rows.at(-1)!.$id
  }
  due.splice(EVENT_REMINDER_RUN_CAP)

  result.dueEvents = due.length
  result.communities = new Set(due.map(row => row.communityId || '')).size

  // SE1 d — EINMAL je Takt fragen, welche dieser Communities nicht erreichbar
  // sind (stillgelegt, Missbrauchs-Sperre). Nur im Pool: in der Einzel-Instanz
  // ist das Projekt die Community, und es gibt kein Control Plane zu fragen.
  // Nur eine positive Antwort nennt eine Community; ohne Antwort
  // (`answered: false`) wird in BEIDEN Modi erinnert wie bisher.
  let unreachable: ReadonlySet<string> = new Set()
  const stamps = pooled ? [...new Set(due.map(row => row.communityId || '').filter(Boolean))] : []
  if (stamps.length > 0) {
    const reachability = await resolveUnreachableCommunities(stamps)
    result.reachabilityAsked = true
    result.reachabilityAnswered = reachability.answered
    if (reachability.answered) unreachable = reachability.unreachable
  }
  const unreachableSeen = new Set<string>()

  for (const row of due) {
    const communityId = row.communityId || ''
    // Im Pool ohne Stempel wüsste niemand, in WESSEN Glocke die Erinnerung
    // gehört — `notify()` legte sie fail-open in jede Glocke des Empfängers,
    // mit einem Link, der auf keinem Host gilt. Die Datentür stempelt jede
    // neue Zeile; so eine Zeile ist ein Datenfehler und wird gezählt, nicht
    // geraten. Kein Merker: sie fällt mit ihrem Beginn von selbst aus dem Fenster.
    if (pooled && !communityId) {
      result.errors++
      continue
    }

    const named = Boolean(communityId) && unreachable.has(communityId)
    if (named) {
      result.unreachableEvents++
      unreachableSeen.add(communityId)
      // Stufe 2: KEINE Zusagen lesen, keine Benachrichtigung, KEIN Merker,
      // kein Fehler. Ohne Merker bleibt der Termin fällig — geht die Community
      // vor dem Beginn wieder ans Netz, erinnert ein späterer Takt; sonst fällt
      // er mit seinem Beginn von selbst aus dem Fenster.
      if (unreachableMode === 'skip') continue
    }

    const outcome = await remindEvent(row, {
      listGoing: eventId => listAllRows<EventRsvpRow>(tablesDB, databaseId, EVENT_RSVPS_TABLE, [
        Query.equal('eventId', eventId),
        Query.equal('status', 'going'),
      ]),
      markSent: async (eventId, at) => {
        await tablesDB.updateRow({ databaseId, tableId: EVENTS_TABLE, rowId: eventId, data: { remindersSentAt: at } })
      },
      // scope 'tenant' (C15) mit dem Stempel DER ZEILE: ohne Request kennt
      // notify() keinen Mandanten. Im Silo bleibt der Wert leer, dann gilt
      // die Ablage ohne Mandant (das Projekt ist die Grenze).
      notify: input => notify(undefined, { ...input, scope: 'tenant', ...(communityId ? { communityId } : {}) }),
    }, nowIso, dryRun)
    result.recipients += outcome.recipients
    result.reminded += outcome.reminded
    result.errors += outcome.errors
    // Stufe 1: erinnert wie bisher, gezählt wird, wen Stufe 2 ausließe.
    if (named) result.unreachableRecipients += outcome.recipients
  }
  result.unreachableCommunities = unreachableSeen.size
  return result
}

/**
 * EIN TAKT des Zeit-Laufs `event-reminders` (das Plugin ruft nur diese
 * Funktion). Abgeschaltetes Produkt (Not-Aus in app_config, Entitlement) ⇒
 * `'skipped'`: wer das Produkt abschaltet, will auch keine Erinnerungen mehr
 * aus dem Hintergrund. Geprüft wird je Takt und nicht vor dem Anmelden, weil
 * der Schalter sich zur Laufzeit ändert und das Manifest in einem eigenen
 * Plugin registriert wird, das nicht sicher vorher läuft.
 *
 * Im Zähl-Modus GENAU EINE Zeile `events.reminder_count` je Takt, auch bei
 * lauter Nullen — die Zahlen sind der Vergleich mit dem alten Zeitplan. Nur
 * Zahlen: keine Titel, keine Ids, keine Adressen.
 *
 * NICHT ERREICHBARE COMMUNITIES (SE1 d), nur im Pool: im Modus `'count'`
 * GENAU EINE Zeile `events.reminder_unreachable` je Takt, auch bei lauter
 * Nullen — sie ist der Beleg, dass gezählt wurde (der tägliche Wächter liest
 * sie über ops/app-watch-counts.mjs). Im Modus `'skip'` nur, wenn etwas
 * ausgelassen wurde oder die Antwort ausblieb. Nur Zahlen und feste Wörter:
 * keine Titel, keine Ids, keine Stempel, keine Hosts.
 */
export async function runEventReminderJob(mode: EventReminderJobMode, unreachableMode: EventReminderUnreachableMode): Promise<'skipped' | undefined> {
  if (!await isProductEnabled(undefined, 'events')) return 'skipped'
  const result = await sweepAllEventReminders({ dryRun: mode === 'count', unreachableMode })
  const counts = {
    communities: result.communities,
    dueEvents: result.dueEvents,
    recipients: result.recipients,
    reminded: result.reminded,
    errors: result.errors,
  }
  if (mode === 'count') {
    logEvent('info', 'events.reminder_count', counts)
  }
  else if (result.reminded || result.errors) {
    // Im Versand-Modus still bei „nichts zu tun" — die `job.run`-Zeile
    // belegt den Takt schon.
    logEvent('info', 'events.reminders_sent', counts)
  }
  if (tenancyEnabled()) {
    const noAnswer = result.reachabilityAsked && !result.reachabilityAnswered
    if (unreachableMode === 'count' || result.unreachableEvents > 0 || noAnswer) {
      logEvent('info', 'events.reminder_unreachable', {
        mode: unreachableMode,
        asked: result.reachabilityAsked,
        answered: result.reachabilityAnswered,
        dueEvents: result.dueEvents,
        communities: result.unreachableCommunities,
        events: result.unreachableEvents,
        recipients: result.unreachableRecipients,
      })
    }
  }
  return undefined
}
