/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * Datum-Anzeige der Belege. Sie steht hier und nicht in `shared/`, weil sie
 * die Oberflächen-Sprache braucht: das Abrufdatum reist als ISO-Zeichenkette
 * (maschinenlesbar, sortierbar) und wird erst beim Anzeigen zu „5. Sept.
 * 2026" bzw. „Sep 5, 2026". Ein im Server formatiertes Datum wäre in der
 * zweiten Sprache falsch.
 */
export function marketDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed)
}

/**
 * EIN TAG OHNE UHRZEIT (`YYYY-MM-DD`) — und deshalb NICHT `marketDate`.
 *
 * `verifiedAt` eines Bibliotheks-Eintrags ist ein Kalendertag, kein Zeitpunkt.
 * `new Date('2026-09-06')` ist UTC-Mitternacht; ein Formatierer ohne
 * `timeZone` schiebt das in jeder westlichen Zeitzone auf den 5. September —
 * auf dem SERVER (Zeitzone des Hosts) womöglich anders als im BROWSER, und
 * genau daraus wird ein Hydration-Fehler. `timeZone: 'UTC'` gibt beiden Seiten
 * dieselbe Antwort. Die SPRACHE bleibt Sache der Oberfläche (5. Sept. 2026 /
 * Sep 5, 2026), deshalb steht die Funktion hier und nicht in `shared/`.
 */
export function marketDay(isoDate: string, locale: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed)
}

/** Die Adresse, wie ein Mensch sie liest — ohne Schema, ohne Schrägstrich am Ende. */
export function marketHost(sourceUrl: string): string {
  return sourceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
