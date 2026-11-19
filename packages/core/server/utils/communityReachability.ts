/**
 * IST DIESE COMMUNITY NOCH ERREICHBAR? — als Registry-Vertrag (SE1 d).
 *
 * WOFÜR: der Erinnerungs-Lauf `event-reminders` (events-Layer) geht stündlich
 * über ALLE Communities des Pools. Ist eine davon stillgelegt
 * (`communities.status !== 'active'`) oder wegen Missbrauchs vom Netz genommen
 * (`communities.suspension === 'abuse'`), antwortet ihr Host 404 — eine
 * Erinnerung dorthin verlinkt auf eine Seite, die es nicht gibt. Ob eine
 * Community erreichbar ist, weiß nur das Control Plane, ein anderes
 * Appwrite-PROJEKT, zu dem core weder Schlüssel noch Kenntnis haben darf (A14).
 * Also derselbe Bau wie bei `registerCommunityHostResolver`: core beschreibt
 * die FRAGE, die App verdrahtet die ANTWORT
 * (apps/platform/server/plugins/tenant-resolver.ts → control-Layer).
 *
 * WARUM NICHT DER HOST-VERTRAG: „kein Host in der Karte" heißt dort zweierlei
 * — „nicht erreichbar" UND „keine Antwort" (kein Resolver, Lesefehler). Für
 * einen Link ist das gleich (beides fällt auf die App-Basis zurück); für die
 * Frage „erinnern oder auslassen?" ist es das Gegenteil. Dieser Vertrag
 * trennt beides: `answered` sagt, ob überhaupt jemand geantwortet hat.
 *
 * KEIN `H3Event`: der Lauf hat keinen Request, keinen Mandanten-Kontext und
 * keinen Host. Der Resolver bekommt seine Verbindungsdaten bei der
 * Registrierung, nicht pro Aufruf (wie der Host-Vertrag).
 *
 * GEBÜNDELT: ein Takt fasst bis zu 200 fällige Termine aus vielen
 * Communities an. Viele Ids rein, EINE Antwort raus — eine Frage je Termin wäre
 * die N+1-Falle über Projektgrenzen.
 *
 * WELCHE ID? Der Stempel der Termin-Zeile — `communities.tenantId`
 * (z. B. `t-kunde-a`), NICHT `communities.$id`. E8-3 hat die SPALTE umbenannt,
 * nicht den WERT (`scopeRowFor()` stempelt `tenant.tenantId`). Wer `$id`
 * nachschlägt, findet nie etwas — und merkt es nicht, weil der Vertrag
 * fail-soft ist.
 *
 * DIE REGEL: NUR EINE POSITIVE TATSACHE NENNT EINE COMMUNITY; KEINE ANTWORT
 * HEISST ERINNERN. Genannt wird eine Community nur, wenn das Control Plane
 * ihre Zeile gelesen hat und diese Zeile sagt „stillgelegt" oder
 * „Missbrauch". Kein Resolver (Silo-App, CI-Build ohne Control-Env), ein
 * Lesefehler oder ein unbekannter Stempel nennen NICHTS — der Aufrufer
 * erinnert dann wie bisher. Fail-soft, bewusst wie beim Vertrag
 * `resolveFormerMembersOfTenant`: eine Erinnerung zu viel an einen Termin, den
 * die Zusager im Kalender haben, ist der kleinere Schaden als eine
 * verschluckte, weil das Control Plane kurz nicht antwortete.
 *
 * Die Zahlungs-Sperre (`suspension === 'billing'`) macht eine Community NICHT
 * unerreichbar: der Host lebt, er ist nur nur-lesend.
 */

import { NOTIFICATION_SCOPE_ACCOUNT } from '../../shared/notificationScope'
import { logEvent } from './logEvent'

/**
 * Viele Ablage-Stempel (`communities.tenantId`) → die Teilmenge, die NICHT
 * erreichbar ist. Eine Störung WIRFT — der Resolver darf nie still „alle
 * erreichbar" antworten, sonst wäre „keine Antwort" wieder nicht von „alle
 * erreichbar" zu unterscheiden. Gefangen wird in
 * `resolveUnreachableCommunities()` unten.
 */
export type UnreachableCommunitiesResolver = (
  communityIds: string[],
) => Promise<string[]> | string[]

let unreachableResolver: UnreachableCommunitiesResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerUnreachableCommunitiesResolver(fn: UnreachableCommunitiesResolver): void {
  if (unreachableResolver) {
    console.warn('[core] registerUnreachableCommunitiesResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  unreachableResolver = fn
}

export function getUnreachableCommunitiesResolver(): UnreachableCommunitiesResolver | null {
  return unreachableResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetUnreachableCommunitiesResolver(): void {
  unreachableResolver = null
}

export interface CommunityReachability {
  /** `true` nur, wenn ein Resolver da ist und ohne Störung geantwortet hat. */
  answered: boolean
  /** Die genannten (nicht erreichbaren) Stempel; ohne Antwort immer leer. */
  unreachable: ReadonlySet<string>
}

const NO_ANSWER: CommunityReachability = { answered: false, unreachable: new Set() }

/**
 * Für diese Stempel fragen, welche nicht erreichbar sind. Filtert selbst, was
 * gar keine Community ist (`''`, `_account`, Dubletten) — der Aufrufer darf
 * seine Liste roh übergeben.
 *
 *  - kein Resolver ⇒ `answered: false` (der Aufrufer erinnert)
 *  - Resolver wirft ⇒ `answered: false` und EINE Zeile
 *    `community.reachability_unavailable` (nur die Zahl der Fragen)
 *  - Resolver da, aber nichts zu fragen ⇒ `answered: true`, leere Menge
 *  - Ids in der Antwort, die nicht gefragt wurden, fallen weg
 */
export async function resolveUnreachableCommunities(
  communityIds: ReadonlyArray<string | null | undefined>,
): Promise<CommunityReachability> {
  const resolver = getUnreachableCommunitiesResolver()
  if (!resolver) return NO_ANSWER

  const ids = [...new Set(communityIds.filter((id): id is string => Boolean(id) && id !== NOTIFICATION_SCOPE_ACCOUNT))]
  if (ids.length === 0) return { answered: true, unreachable: new Set() }

  let named: string[]
  try {
    named = await resolver(ids)
  }
  catch {
    // Fail-soft (s. Kopf): keine Antwort heißt erinnern. Nur Zahlen ins
    // Protokoll — keine Stempel, keine Meldung des Fehlers.
    logEvent('warn', 'community.reachability_unavailable', { asked: ids.length })
    return NO_ANSWER
  }
  const asked = new Set(ids)
  return { answered: true, unreachable: new Set((Array.isArray(named) ? named : []).filter(id => asked.has(id))) }
}
