/**
 * PROTOTYP (I0) — Komponenten-Vorlage für I2/I3.
 *
 * Anzeige-Formate der Redaktion. Sie stehen HIER und nicht in `shared/`, weil
 * sie die Oberflächen-Sprache brauchen: ein Beitrag reist mit ISO-Datum
 * (maschinenlesbar, sortierbar) und wird erst beim Anzeigen zu „8. Sept.
 * 2026" bzw. „Sep 8, 2026". Ein im Server formatiertes Datum wäre in der
 * zweiten Sprache falsch.
 */

/**
 * DER KALENDERTAG AUS EINEM ISO-WERT — `2026-09-08` ebenso wie
 * `2026-09-08T10:00:00.000+00:00`.
 *
 * ── WARUM DAS ABSCHNEIDEN HIER STEHT UND NICHT AN DER AUFRUFSTELLE ───────
 * Beim Klick-Beweis (2026-09-10) stand auf JEDER öffentlichen Karte und im
 * Artikel-Kopf der rohe Zeitstempel `2026-09-08T10:00:00.000+00:00`. Grund:
 * die Funktion war am PROTOTYP gebaut, dessen Demo-Daten reine Datums-Strings
 * tragen (`publishedAt: '2026-09-04'`) — die echten Spalten `publishedAt`,
 * `reviewedAt` und `translatedAt` sind aber Appwrite-`datetime` und liefern
 * einen vollen Zeitstempel. `${wert}T00:00:00.000Z` ergibt daraus ein
 * ungültiges Datum, und der Ausweg „gib die Eingabe zurück" machte den Fehler
 * zu etwas, das wie eine Absicht aussieht. Der Editor hatte sich schon mit
 * `.slice(0, 10)` an der Aufrufstelle beholfen — genau die Sorte Wissen, die
 * an der zweiten Aufrufstelle fehlt. Deshalb: EINE Stelle.
 *
 * ── UTC, UND DAS IST KEINE PEDANTERIE ───────────────────────────────────
 * `new Date('2026-09-08')` ist UTC-Mitternacht; ein Formatierer ohne
 * `timeZone` schiebt das in jeder westlichen Zeitzone auf den 7. September —
 * auf dem SERVER (Zeitzone des Hosts) womöglich anders als im BROWSER, und
 * genau daraus wird ein Hydrations-Fehler. Dieselbe Falle wie in
 * `market/app/utils/marketFormat.ts`; sie wird hier nicht neu gelernt. Der
 * Tag wird deshalb auch als UTC-Tag GENOMMEN (die ersten zehn Zeichen), nicht
 * über die Ortszeit des Lesers gerechnet.
 */
export function insightsCalendarDay(isoValue: string): string {
  const value = (isoValue ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

export function insightsDay(isoDate: string, locale: string): string {
  const day = insightsCalendarDay(isoDate)
  if (!day) return ''
  const parsed = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return day
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed)
}

/** Die Adresse, wie ein Mensch sie liest — ohne Schema, ohne Schrägstrich am Ende. */
export function insightsHost(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** Grosse Zahlen des Radars. `Intl.NumberFormat` ist auf beiden Seiten gleich. */
export function insightsNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

/** Tage zwischen zwei Kalendertagen — für „Alter" im Radar (§9.6). */
export function insightsDaysBetween(isoDate: string, todayIso: string): number {
  // Dieselbe Normalisierung wie oben: ein voller Zeitstempel ist ein gültiger
  // Eingabewert, kein Fehler (die Radar-Zeilen tragen das Datum der API).
  const fromDay = insightsCalendarDay(isoDate)
  const toDay = insightsCalendarDay(todayIso)
  if (!fromDay || !toDay) return 0
  const from = new Date(`${fromDay}T00:00:00.000Z`).getTime()
  const to = new Date(`${toDay}T00:00:00.000Z`).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}
