/**
 * EIN Abruf je Reiter, beliebig viele Leser (PERF-011, Q23).
 *
 * Vorher legte JEDER Leser der Anwesenheit (`usePresence()`) seinen eigenen
 * Takt an: alle 20 s `presences.list()` und ein eigenes Abo. Eine
 * Dashboard-Übersicht hat vier Leser — gemessen zwölf Listen-Abrufe in 65 s
 * Ruhe statt vier. Geteilt war die Verbindung, nicht der Abruf.
 *
 * Diese Datei teilt den Abruf: der erste Leser startet Quelle, Abo und Takt,
 * jeder weitere hängt sich an und bekommt sofort den letzten Stand, der letzte
 * räumt ab. Jeder Leser filtert für sich (das Prädikat bleibt beim Aufrufer).
 *
 * NACHLAUF (`lingerMs`): bei einem Seitenwechsel räumt die alte Seite ihre
 * Leser ab, BEVOR die neue ihre anmeldet (Vue ruft `onMounted` der neuen Seite
 * nach dem Abbau der alten). Ohne Nachlauf hiesse jeder Wechsel: Abo zu, Abo
 * auf, sofort neuer Abruf — und die Avatare blinkten kurz leer. Mit Nachlauf
 * übernimmt die neue Seite den laufenden Stand.
 *
 * Bewusst ohne Vue und ohne Nuxt: reine Zeitgeber und Rückrufe, damit der
 * Test (`tests/sharedPoll.test.ts`) die Zahl der Abrufe je Zeitfenster
 * nachzählen kann.
 */

export interface SharedPollSource<T> {
  /** Holt den vollständigen Stand (der Abruf, der geteilt wird). */
  list: () => Promise<T>
  /**
   * Optionaler Auslöser „etwas hat sich geändert" (Live-Ereignis). Liefert
   * die Abmelde-Funktion. Ein Fehler hier ist gutartig: der Takt trägt.
   */
  subscribe?: (onChange: () => void) => Promise<(() => void) | undefined>
}

export interface SharedPollOptions {
  /** Takt des Rückhalt-Abrufs (falls ein Ereignis verloren geht). */
  pollMs: number
  /** Ereignis-Bündelung: mehrere Ereignisse kurz hintereinander = EIN Abruf. */
  debounceMs: number
  /** Wie lange Quelle und Takt nach dem letzten Leser weiterlaufen. */
  lingerMs: number
}

export type SharedPollListener<T> = (value: T) => void

export interface SharedPoll<T> {
  /**
   * Meldet einen Leser an. `connect` wird nur beim ERSTEN Leser gerufen
   * (oder nach einem vollständigen Abbau) und darf `null` liefern
   * („keine Quelle", z. B. Realtime aus). Rückgabe: Abmelden.
   */
  acquire: (listener: SharedPollListener<T>, connect: () => Promise<SharedPollSource<T> | null>) => () => void
  /** Zahl der angemeldeten Leser (für Tests und Diagnose). */
  readers: () => number
}

export function createSharedPoll<T>(options: SharedPollOptions): SharedPoll<T> {
  const listeners = new Set<SharedPollListener<T>>()
  /** Laufende Sitzung von Quelle + Takt; `null` = nichts läuft. */
  let session: {
    source: SharedPollSource<T> | null
    value: { current: T } | null
    poll?: ReturnType<typeof setTimeout>
    debounce?: ReturnType<typeof setTimeout>
    unsubscribe?: () => void
    stopped: boolean
    /** Takt läuft (erst nach dem Aufbau von Quelle und Abo). */
    polling: boolean
  } | null = null
  let lingerTimer: ReturnType<typeof setTimeout> | undefined

  function publish(value: T) {
    if (!session) return
    session.value = { current: value }
    for (const listener of listeners) listener(value)
  }

  /**
   * DER TAKT IST NUR RÜCKHALT: er feuert `pollMs` nach dem LETZTEN Abruf,
   * gleich welcher Herkunft, und ein Ereignis bricht ihn ab (der Abruf nach
   * dem Ereignis stellt ihn neu). Ein fester Takt fiel sonst mit dem Abruf
   * nach dem eigenen Herzschlag (beide alle 20 s) zu zwei Abrufen zusammen.
   */
  function arm(current: NonNullable<typeof session>) {
    clearTimeout(current.poll)
    if (!current.polling || current.stopped) return
    current.poll = setTimeout(() => { void refresh() }, options.pollMs)
  }

  async function refresh() {
    const current = session
    if (!current?.source || current.stopped) return
    arm(current)
    try {
      const value = await current.source.list()
      if (session === current && !current.stopped) publish(value)
    }
    catch {
      // Ein fehlgeschlagener Abruf behält den letzten Stand; der nächste Takt
      // oder das nächste Ereignis versucht es wieder.
    }
  }

  function scheduleRefresh() {
    const current = session
    if (!current || current.stopped) return
    clearTimeout(current.poll)
    clearTimeout(current.debounce)
    current.debounce = setTimeout(() => { current.debounce = undefined; void refresh() }, options.debounceMs)
  }

  function stop() {
    const current = session
    session = null
    if (!current) return
    current.stopped = true
    clearTimeout(current.poll)
    clearTimeout(current.debounce)
    try { current.unsubscribe?.() }
    catch { /* Abo war schon weg */ }
  }

  async function start(connect: () => Promise<SharedPollSource<T> | null>) {
    const current: NonNullable<typeof session> = { source: null, value: null, stopped: false, polling: false }
    session = current
    let source: SharedPollSource<T> | null
    try { source = await connect() }
    catch {
      // Quelle kam nicht zustande: Sitzung verwerfen, damit der nächste Leser
      // (z. B. nach einem Seitenwechsel) es neu versucht, statt an einer
      // toten Sitzung zu hängen.
      current.stopped = true
      if (session === current) session = null
      return
    }
    if (current.stopped) return
    current.source = source
    if (!source) return
    await refresh()
    if (current.stopped) return
    if (source.subscribe) {
      try {
        const unsubscribe = await source.subscribe(scheduleRefresh)
        if (current.stopped) { unsubscribe?.(); return }
        current.unsubscribe = unsubscribe
      }
      catch { /* kein Live-Auslöser — der Takt trägt */ }
    }
    if (current.stopped) return
    current.polling = true
    // Läuft schon ein Abruf nach einem Ereignis (Bündelung), stellt der den
    // Takt; sonst ab jetzt.
    if (!current.debounce) arm(current)
  }

  function acquire(listener: SharedPollListener<T>, connect: () => Promise<SharedPollSource<T> | null>) {
    clearTimeout(lingerTimer)
    lingerTimer = undefined
    listeners.add(listener)
    if (!session) void start(connect)
    else if (session.value) listener(session.value.current)

    let released = false
    return () => {
      if (released) return
      released = true
      listeners.delete(listener)
      if (listeners.size > 0) return
      clearTimeout(lingerTimer)
      lingerTimer = setTimeout(() => {
        lingerTimer = undefined
        if (listeners.size === 0) stop()
      }, options.lingerMs)
    }
  }

  return { acquire, readers: () => listeners.size }
}
