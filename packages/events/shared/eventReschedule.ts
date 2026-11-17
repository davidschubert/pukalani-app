/**
 * VERSCHOBEN NACH DER ERINNERUNG ⇒ NOCH EINMAL ERINNERN (KK1, Davids
 * Entscheidung 2026-11-17) — pur, getestet.
 *
 * Der Erinnerungs-Lauf nimmt nur Termine ohne Merker (`remindersSentAt`). Wird
 * der Beginn geändert, nachdem schon erinnert wurde, blieb der Merker stehen:
 * wer zugesagt hatte, kannte nur die alte Uhrzeit. Fällt der Merker beim
 * Verschieben, erinnert der nächste Takt neu — sobald der NEUE Beginn im
 * Fenster liegt (24 h vorher), also auch erst Tage später, wenn der Termin
 * weit nach hinten rückt.
 *
 * KEINE DOPPELTE ERINNERUNG FÜR DENSELBEN BEGINN: die Zeilen-Kennung einer
 * Erinnerung enthält den Beginn (`eventReminderRowId`). Wer den Termin hin-
 * und wieder zurückschiebt, läuft für die alte Uhrzeit in die Dublette.
 *
 * Verglichen wird der ZEITPUNKT, nicht die Zeichenkette: das Formular schickt
 * den Beginn bei jedem Speichern mit, auch wenn nur der Ort korrigiert wurde —
 * und dieselbe Uhrzeit in anderer Schreibweise ist keine Verschiebung.
 */
export function rescheduleClearsReminder(input: {
  previousStartAt: string
  /** `undefined` = der Beginn stand nicht in der Änderung. */
  nextStartAt: string | undefined
  remindersSentAt: string | null | undefined
}): boolean {
  if (!input.remindersSentAt || input.nextStartAt === undefined) return false
  const previous = Date.parse(input.previousStartAt)
  const next = Date.parse(input.nextStartAt)
  // Ein unlesbarer Wert ist keine Verschiebung — die Route lehnt ihn ohnehin ab.
  if (Number.isNaN(previous) || Number.isNaN(next)) return false
  return previous !== next
}
