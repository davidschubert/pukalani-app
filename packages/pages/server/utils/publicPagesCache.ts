import type { H3Event } from 'h3'
import type { PublicPagesSnapshot } from '../../shared/publicPagesNav'

/**
 * Microcache der ÖFFENTLICHEN Seiten-Liste (`/api/pages/public`).
 *
 * WARUM: die Route läuft bei JEDEM SSR-Seitenaufbau — das blueprint-Layout
 * holt daraus seine Navigation, die Fußzeile von apps/portfolio ihre
 * Rechtslinks. Jede dieser Anfragen ist eine Appwrite-Abfrage über alle
 * veröffentlichten Rows (geblättert, BE-019), für eine Antwort, die sich
 * zwischen zwei Redaktionsvorgängen nicht ändert.
 *
 * USER-AGNOSTISCH, und das ist die Bedingung (CLAUDE.md „Microcache"): die
 * Antwort enthält ausschließlich VERÖFFENTLICHTE Seiten und keine
 * Session-Daten. Die Autorisierung (`assertCommunityContentReadable`) bleibt
 * deshalb VOR dem Cache — gecacht wird das Ergebnis, nicht die Erlaubnis.
 *
 * SCHLÜSSEL = MANDANT, WERT = DER SPRACHUNABHÄNGIGE STAND (seit BE-019). Der
 * Mandanten-Scope ist Pflicht (im Pool teilen sich alle Communities einen
 * Prozess — ein ungescopter Schlüssel gäbe Kunde A die Navigation von Kunde B).
 * Gespeichert wird je Mandant EINMAL, was veröffentlicht ist (Fassungen je
 * slug, dazu die Antwort auf „gilt der Regeln-Rückfall"); die Auswahl der
 * Sprache rechnet `publicNavItems` je Anfrage daraus. Bis BE-019 lag hier ein
 * Objekt mit der Sprache aus der Anfrage als Schlüssel: jede erfundene Sprache
 * legte eine Abfrage und einen Eintrag an, und `toString` traf eine geerbte
 * Funktion. Ein Redaktionsvorgang verwirft weiter mit EINEM `delete` alles für
 * diesen Mandanten. Ein `clear()` wäre hier falsch, es nähme die Einträge
 * aller anderen Mandanten mit (Begründung an `Microcache.delete`).
 */
const TTL_MS = 30_000

const cache = createMicrocache<PublicPagesSnapshot>(TTL_MS)

/** Der Stand dieses Mandanten, wenn er noch gilt — für jede Sprache derselbe. */
export function cachedPublicPages(event: H3Event): PublicPagesSnapshot | undefined {
  return cache.get(tenantCacheScope(event))
}

/** Stand merken — ersetzt den vorigen dieses Mandanten. */
export function rememberPublicPages(event: H3Event, snapshot: PublicPagesSnapshot): void {
  cache.set(tenantCacheScope(event), snapshot)
}

/**
 * Nach jedem Schreibvorgang an den Seiten: der neue Stand ist sofort sichtbar,
 * ohne dass jemand 30 Sekunden auf die Ablaufzeit wartet. Die TTL bleibt als
 * Netz für Schreibwege, die nicht durch die Dashboard-Routen gehen (Seeds bei
 * der Provisionierung, Nachrüst-Skripte).
 */
export function forgetPublicPages(event: H3Event): void {
  cache.delete(tenantCacheScope(event))
}
