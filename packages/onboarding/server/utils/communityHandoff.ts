import type { H3Event } from 'h3'
// Cross-Layer als EXPLIZITER Vertrag (A14): der Umschlag gehört dem Control
// Plane — reiner Typ-Import, kein Laufzeit-Coupling.
import type { MyCommunitiesResponse, MyCommunityView } from '../../../control/shared/myCommunities'
import { deriveHandoffKey, sealHandoff } from '../../../core/server/utils/embedHandoff'
import { requestHandoffGrant } from '../../../core/server/utils/sessionHandoff'
import { callControlPlane, mintRuntimeJwt } from './controlPlane'

/**
 * DAS SIEGEL FÜR DEN SPRUNG AUF EINEN COMMUNITY-HOST — EINE Fassung für alle
 * Aufrufer (F50, 2026-08-07).
 *
 * Session-Cookies sind host-only: die Anmeldung auf `account.*` (oder auf Community
 * A) gilt auf Community B nicht. Deshalb siegelt der abgebende Host beim KLICK
 * ein 60-Sekunden-Token, das der Ziel-Host gegen Appwrite prüft, bevor er sein
 * eigenes Cookie setzt (`GET /api/auth/site-session`).
 *
 * ── WARUM DAS HIER STEHT UND NICHT ZWEIMAL ────────────────────────────────
 * Bis zum Community-Switcher gab es genau EINEN Aufrufer
 * (`POST /api/onboarding/handoff`, der Kundenbereich). Mit
 * `POST /api/community/switch` gibt es einen zweiten, und der braucht Wort für
 * Wort dieselben fünf Schritte — inklusive der beiden, die 2026-08-02 ein
 * KRITISCHER Sicherheitsbefund waren. Zwei Kopien wären genau die Sorte
 * Doppelpflege, bei der eines Tages nur eine der beiden den Ziel-Host noch
 * serverseitig belegt.
 *
 * ── DER ZIEL-HOST KOMMT VON HIER, NICHT VOM AUFRUFER ──────────────────────
 * Sicherheits-Audit 2026-08-02 (KRITISCH, Kontoübernahme). Vorher gab die
 * Route nur ein Token heraus, das an KEINEN Host gebunden war, und die Seite
 * baute ihr Ziel aus `?host=` zusammen. Wer ein Opfer dazu brachte, einen
 * präparierten Link zu öffnen und dort zu klicken, bekam dessen frisches Siegel
 * geliefert und konnte es binnen 60 s gegen einen ECHTEN Pukalani-Host
 * einlösen — der setzte ihm daraufhin das Session-Cookie des Opfers.
 *
 * Beide Hälften sind zu, und beide leben in dieser Datei:
 *  (a) Das Siegel trägt seinen Ziel-Host (`sealHandoff(..., host)`), und
 *      `/api/auth/site-session` löst es nur ein, wenn es der eigene ist.
 *  (b) Der Host kommt aus der MITGLIEDSCHAFTS-Liste des Nutzers, nie aus dem
 *      Body. Damit ist die Zugehörigkeit serverseitig belegt, BEVOR ein Siegel
 *      entsteht — und der Aufrufer kann gar keinen fremden Host in den Link
 *      schreiben, weil er ihn von hier bekommt.
 *
 * Der Preis ist ein Ruf ins Control Plane pro Klick (JWT + zwei Tabellen). Das
 * ist derselbe Aufwand wie `/api/onboarding/communities` und deshalb im selben
 * Rate-Limit-Budget — ein Klick pro Sprung, kein heißer Pfad. GENAU GESAGT:
 * alle VIER Einstiege teilen den Bucket `onboarding:communities`
 * (`/api/onboarding/communities`, `/api/onboarding/handoff`,
 * `/api/community/switcher`, `/api/community/switch`). Die letzten beiden
 * standen bis zum Session-Audit 2026-08-09 nicht in
 * `core/server/middleware/05.rate-limit.ts` — der Satz stimmte also für den
 * Kundenbereich und nicht für den Dashboard-Wechsler. Ein neuer Aufrufer
 * dieser Datei gehört dort eingetragen.
 */

/** Was der Aufrufer zurückbekommt: Siegel UND das Ziel, für das es gilt. */
export interface SealedCommunityHandoff {
  token: string
  /** Der Aufrufer baut sein Ziel aus DIESEM Host — nicht aus der eigenen URL. */
  host: string
}

/**
 * Die EINE vertrauenswürdige Quelle: was das Control Plane für die Identität
 * aus dem JWT als Mitgliedschaften kennt. Enthält bewusst weder stillgelegte
 * noch (für Mitleser) abuse-gesperrte Communities — wohin die Übersicht nicht
 * verlinkt, dorthin siegelt auch niemand.
 */
export async function listMyCommunities(event: H3Event): Promise<MyCommunityView[]> {
  const jwt = await mintRuntimeJwt(event)
  const { communities } = await callControlPlane<MyCommunitiesResponse>(event, '/api/control/community/mine', { jwt })
  return communities
}

/**
 * Session siegeln für den Sprung in `communityId`.
 *
 * `accepts` ist die zusätzliche Bedingung des Aufrufers an die Mitgliedschaft.
 * Der Kundenbereich nimmt jede (auch `viewer` — dort steht die Community ja in
 * der Übersicht), der Dashboard-Wechsler nur Team-Rollen. Der Filter läuft
 * NACH der Mitgliedschaftsprüfung und kann sie deshalb nur verschärfen, nie
 * aufweichen; abgewiesen wird in beiden Fällen mit demselben 403, damit die
 * Antwort nicht verrät, ob eine fremde Id überhaupt existiert.
 */
export async function sealCommunityHandoff(
  event: H3Event,
  communityId: string,
  accepts: (community: MyCommunityView) => boolean = () => true,
): Promise<SealedCommunityHandoff> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Im Modus `write` trägt das Siegel dazu Konto, Sitzung und ursprüngliche
  // Anmeldung (PK1 E1b) — das Ziel legt damit eine eigene Sitzung an.
  const grant = requestHandoffGrant(event)
  if (!grant) {
    // Kein Cookie trotz Session-Kontext: dann käme ein Token heraus, das nichts
    // öffnet — lieber ehrlich 401 als ein Link, der beim Kunden scheitert.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const communities = await listMyCommunities(event)
  const community = communities.find(entry => entry.communityId === communityId)
  if (!community?.host || !accepts(community)) {
    logEvent('warn', 'onboarding.handoff_rejected', {
      communityId,
      userId: event.context.user.$id,
    })
    throw createError({ status: 403, statusText: 'Not a member of this community' })
  }

  const config = useRuntimeConfig(event)
  logEvent('info', 'onboarding.handoff_issued', {
    communityId: community.communityId,
    host: community.host,
    userId: event.context.user.$id,
  })
  return {
    token: sealHandoff(grant, deriveHandoffKey(config.appwriteKey), community.host),
    host: community.host,
  }
}

/**
 * Session siegeln für den Sprung auf einen KONTROLL-Host (F50-Nachtrag,
 * 2026-08-08).
 *
 * Dieselben Schritte wie oben, MINUS den Ruf ins Control Plane: Session
 * beweisen, Cookie-Secret holen, an den Ziel-Host binden. Der Kontroll-Host ist
 * kein Mandant — es gibt dort keine Mitgliedschaft, die man belegen könnte, und
 * nichts, wozu eine berechtigen würde (Begründung ausführlich in
 * `shared/controlExit.ts`). Diese Fassung spart deshalb JWT + zwei Tabellen und
 * ist ein reiner Krypto-Aufruf.
 *
 * DER HOST BLEIBT TROTZDEM SERVERSEITIG BESTIMMT — und das ist die Bedingung,
 * unter der das Weglassen der Mitgliedschaftsprüfung harmlos ist. `host` kommt
 * vom AUFRUFER DIESER FUNKTION, nicht aus dem Request: die Route liest ihn über
 * `controlExitTarget()` aus `pukalani.tenancy.*`. Wer hier eines Tages einen
 * Wert aus dem Body durchreicht, baut den Audit-Befund vom 2026-08-02 (KRITISCH,
 * Kontoübernahme) wieder ein — ein Siegel für einen fremden Host ist genau das,
 * was ein Angreifer braucht.
 */
export function sealControlHostHandoff(event: H3Event, host: string): SealedCommunityHandoff {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Im Modus `write` trägt das Siegel dazu Konto, Sitzung und ursprüngliche
  // Anmeldung (PK1 E1b) — das Ziel legt damit eine eigene Sitzung an.
  const grant = requestHandoffGrant(event)
  if (!grant) {
    // Kein Cookie trotz Session-Kontext: dann käme ein Token heraus, das nichts
    // öffnet — lieber ehrlich 401 als ein Link, der beim Kunden scheitert.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  logEvent('info', 'onboarding.control_handoff_issued', {
    host,
    userId: event.context.user.$id,
  })
  return {
    // Der rohe Host genügt: `sealHandoff` normalisiert die Audience
    // SELBST (handoffAudience — Kleinschreibung, Port weg), genau wie beim
    // Community-Sprung oben. Ein lokaler Kontroll-Host mit Port ist damit
    // abgedeckt.
    token: sealHandoff(grant, deriveHandoffKey(config.appwriteKey), host),
    host,
  }
}
