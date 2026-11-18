import { resolveCommunitySuspension, communityIsOffline } from '../../core/shared/communitySuspension'
import { customDomainIsLive, customDomainSibling, normalizeCustomDomain } from './customDomain'

/**
 * WELCHE KUNDENDOMAINS SOLL DER PRODUKTIONS-WÄCHTER PRÜFEN? (WA1 d, 2026-11-18)
 *
 * Die Host-Listen des TLS- und des Health-Wächters (`scripts/ops/verify-tls.mjs`,
 * `verify-health.mjs`) waren von Hand gepflegt: eine neue Kundendomain stand
 * dort erst, wenn jemand sie eintrug. Diese Rechnung liefert sie aus dem
 * Register — und NUR sie:
 *
 *  · eigene Domains, die LIVE sind (`customDomainIsLive`: eingetragen und
 *    Status `active`), von Pool-Communities und von Einzel-Sites;
 *  · je Domain beide Formen, wo es ein Paar gibt (`customDomainSibling`):
 *    die eingetragene Form ist die kanonische und antwortet selbst
 *    (`health: true`), die Geschwister-Form leitet nur um und braucht
 *    trotzdem ein gültiges Zertifikat (`health: false`).
 *
 * WAS BEWUSST FEHLT:
 *  · Pukalani-Subdomains der Communities (`*.pukalani.app`): die deckt das
 *    Wildcard-Zertifikat, und im Wächter steht `demo` als Stellvertreter;
 *  · Domains, die noch nicht aktiv sind (`pending_*`, `error`) oder
 *    abgeschaltet (`paused`) — dort ist ein fehlendes Zertifikat kein Vorfall;
 *  · stillgelegte Communities (`status: 'disabled'`) und solche, die der
 *    Betreiber vom Netz genommen hat (Sperre `abuse`) — sie sind mit Absicht
 *    nicht erreichbar, ein Alarm dazu wäre Lärm.
 *
 * NICHTS AUSSER HOST-NAMEN: keine Community-Id, kein Name, kein Plan, keine
 * Adresse einer Person. Die Antwort geht an einen Wächter, dessen Protokoll
 * öffentlich ist; was sie nicht enthält, kann dort nicht landen.
 *
 * Die Reihenfolge ist fest (nach Name): der Wächter nennt eine Kundendomain
 * öffentlich nur als „Nr. n von m", und die Nummer muss bei zwei Abfragen
 * dieselbe Domain meinen.
 */

export interface WatchHost {
  /** Hostname, klein, ohne Port und Schema. */
  host: string
  /** `true` = der Host antwortet selbst auf `/api/health`; `false` = er leitet nur um (TLS genügt). */
  health: boolean
}

export interface WatchHostsResponse {
  hosts: WatchHost[]
}

/** Der Ausschnitt einer `communities`-Zeile, den die Rechnung braucht. */
export interface WatchCommunityRow {
  status?: string | null
  suspension?: string | null
  customDomain?: string | null
  customDomainStatus?: string | null
}

/** Der Ausschnitt einer `websites`-Zeile, den die Rechnung braucht. */
export interface WatchWebsiteRow {
  customDomain?: string | null
  customDomainStatus?: string | null
}

/** Mehr als ein Name, höchstens 253 Zeichen, nur Kleinbuchstaben, Ziffern, Bindestrich und Punkt. */
const HOST_FORM = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** PURE: ein Spaltenwert als prüfbarer Hostname — oder `''`, wenn er keiner ist. */
export function watchableHost(raw: string | null | undefined): string {
  const host = normalizeCustomDomain(raw)
  return host && HOST_FORM.test(host) ? host : ''
}

/**
 * PURE: die Liste für den Wächter — ohne Doppel, nach Name sortiert.
 *
 * Steht derselbe Host zweimal im Register (einmal als kanonische Form, einmal
 * als Geschwister einer anderen Zeile), gewinnt `health: true`: er antwortet
 * dann selbst.
 */
export function collectWatchHosts(input: {
  communities: readonly WatchCommunityRow[]
  websites: readonly WatchWebsiteRow[]
}): WatchHost[] {
  const found = new Map<string, boolean>()
  const add = (domain: string | null | undefined) => {
    const canonical = watchableHost(domain)
    if (!canonical) return
    found.set(canonical, true)
    const sibling = watchableHost(customDomainSibling(canonical))
    if (sibling && !found.has(sibling)) found.set(sibling, false)
  }

  for (const row of input.communities) {
    if (row.status === 'disabled') continue
    if (communityIsOffline(resolveCommunitySuspension(row.suspension))) continue
    if (customDomainIsLive(row.customDomain, row.customDomainStatus)) add(row.customDomain)
  }
  for (const row of input.websites) {
    if (customDomainIsLive(row.customDomain, row.customDomainStatus)) add(row.customDomain)
  }

  return [...found.entries()]
    .map(([host, health]) => ({ host, health }))
    .sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
}
