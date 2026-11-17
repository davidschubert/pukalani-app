import type { H3Event } from 'h3'

/**
 * Der Host der Anfrage, wie ihn die Statistik versteht — EINE Rechnung für
 * beide Routen des Layers: `stats.get.ts` fragt damit Plausible (Ziel und
 * Zwischenspeicher), `settings.patch.ts` prüft damit, ob eine Zähl-Kennung
 * zur eigenen Seite gehört (BE-022). Zwei Kopien wären genau der Zustand, in
 * dem das Speichern eine Kennung annimmt, die die Anzeige danach anders sucht.
 *
 * Der Host kommt aus dem Request-Header, normalisiert wie überall im Repo
 * (`normalizeHost`: Kleinschreibung, Port und Punkt weg) — dieselbe Rechnung,
 * mit der die Mandanten-Middleware den Host auflöst. BEWUSST nicht über
 * `resolveSeoOrigin`: der liefert einen ORIGIN mit Schema für den Kopf einer
 * Seite, Plausibles `event:hostname` ist aber genau der nackte Hostname.
 */
export function analyticsRequestHost(event: H3Event): string {
  return normalizeHost(getHeader(event, 'host'))
}
