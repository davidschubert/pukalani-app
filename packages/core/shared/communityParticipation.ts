import { joinOutcomeGrantsAccess, joinOutcomeRevokesAccess, type CommunityJoinOutcome } from './communityJoin'

/**
 * MITMACHEN VERLANGT ZUGEHÖRIGKEIT (SEC-030, seit 2026-11-13) — der pure Teil.
 *
 * Ein Konto im Pool ist auf JEDEM Community-Host angemeldet: das Projekt
 * `account` ist für alle Communities dasselbe. „Angemeldet" sagt deshalb nichts
 * darüber, ob jemand hierher gehört. Bis zu diesem Datum prüften die
 * Schreib-Routen der Produkte trotzdem nur das — und die Datentür fragte beim
 * Anlegen zwar nach dem Beitritt, las die Antwort aber nicht. Eine geschlossene
 * Registrierung und ein entzogener Zugang hielten damit niemanden ab.
 *
 * Die Regel bleibt A5: bei OFFENER Registrierung ist der erste eigene
 * Schreibvorgang der Beitritt. Neu ist nur, dass der AUSGANG dieses Beitritts
 * zählt.
 */

/**
 * Der Grund, mit dem eine Route ein Nicht-Mitglied abweist. Reist als
 * `data: { code }`, der zentrale Fehler-Handler hebt ihn als `reason` ins
 * Envelope, die Oberfläche liest `error.data.reason`.
 */
export const COMMUNITY_NOT_A_MEMBER_CODE = 'not_a_member'

/**
 * Was folgt aus dem Ausgang des Beitritts?
 *  - `allow`          — gewährt (frisch beigetreten oder schon Mitglied). Gilt
 *    auch dann, wenn der Mitgliedschafts-Cache (30 s) das frische Mitglied noch
 *    nicht kennt: hier zählt der Ausgang, nicht der Cache.
 *  - `deny`           — geschlossene Registrierung oder entzogener Zugang.
 *  - `ask-membership` — `unavailable` sagt nichts über die Person (Silo, kein
 *    Handler, Störung der Naht). Dann entscheidet die Mitgliedschaft: im Pool
 *    fail-closed, im Silo durch.
 */
export type ParticipationVerdict = 'allow' | 'deny' | 'ask-membership'

export function participationVerdict(outcome: CommunityJoinOutcome): ParticipationVerdict {
  if (joinOutcomeGrantsAccess(outcome)) return 'allow'
  if (joinOutcomeRevokesAccess(outcome)) return 'deny'
  return 'ask-membership'
}

/**
 * PURE: Soll der zentrale Hinweis „kein Mitglied" für diese abgewiesene Antwort
 * erscheinen? (Leser: `app/plugins/community-suspended-notice.client.ts`.)
 *
 *  - Nur ein 403 mit genau diesem Grund.
 *  - Nur bei einem SCHREIBVERSUCH (alles außer GET/HEAD): ein Lesezugriff, der
 *    `not_a_member` bekommt, zeigt seine Seite selbst an — ein Toast beim
 *    Laden einer Liste wäre Lärm.
 *  - Nicht für Adressen, deren Seiten den Fall SELBST erklären (Kurse, SEC-029:
 *    eigener Satz mit dem Weg zur Vorschau). Die Liste meldet der jeweilige
 *    Layer über `pukalani.notices.notAMemberSelfExplained` (app.config, tief
 *    gemergt) — ein expliziter Vertrag statt eines Pfads, den der Core kennt.
 */
export function notAMemberNoticeApplies(
  notice: { status: number, reason: string, method?: string, url?: string },
  selfExplainedPrefixes: readonly string[],
): boolean {
  if (notice.status !== 403 || notice.reason !== COMMUNITY_NOT_A_MEMBER_CODE) return false
  const method = (notice.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return false
  const path = (notice.url ?? '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '')
  return !selfExplainedPrefixes.some(prefix => prefix !== '' && path.startsWith(prefix))
}
