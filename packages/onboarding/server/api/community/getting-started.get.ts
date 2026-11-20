import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
// Der pages-Layer BESITZT die Tabelle und stellt Typ + Id bereit (A14,
// dasselbe explizite Konsumieren wie `seedHomePage` im Wizard-Abschluss).
import { PAGES_TABLE, type PageRow } from '../../../../pages/shared/types/page'
import {
  communityDismissedGettingStarted,
  hasActiveCommunitySubscription,
  homePageEdited,
  teamHasReach,
  GETTING_STARTED_PREF_KEY,
  type GettingStartedResponse,
} from '../../../shared/gettingStarted'
import { resolveCommunityTeamSnapshot } from '../../utils/communityTeamSnapshot'
import { softFail } from '../../../../core/server/utils/softFail'

/**
 * DIE FÜNF TATSACHEN HINTER DER WILLKOMMENS-CHECKLISTE (U4).
 *
 * Die Regel steht pur in `shared/gettingStarted.ts`; hier wird nur ERMITTELT.
 * Leitsatz der ganzen Route: **kein neues Datenmodell, keine neue
 * Service-Naht.** Jeder Punkt wird aus der billigsten Quelle berechnet, die es
 * ohnehin gibt:
 *
 * | Punkt      | Quelle                                   | Kosten                        |
 * |------------|------------------------------------------|-------------------------------|
 * | Farbwelt   | `tenant.theme` aus dem Mandanten-Kontext  | 0 (30-s-Resolver-Cache)       |
 * | Abo        | `tenant.billingStatus`, ebendaher         | 0 (dito)                      |
 * | Beitrag    | core-Vertrag, beantwortet vom posts-Layer  | 1 Zählabfrage, `limit(1)`,    |
 * |            | (Beispiel-Saat ausgenommen, s. unten)      | + 1 Blick nur im Grenzfall    |
 * | Startseite | `pages`-Zeilen mit slug 'home'             | 1 Abfrage, ≤ 4 Zeilen         |
 * | Einladen   | Team-Route der BESTEHENDEN Service-Naht    | 1 Ruf, 30 s gecacht, GETEILT  |
 *
 * WARUM DER MITGLIEDER-PUNKT TROTZDEM ÜBER DAS CONTROL PLANE GEHT: sowohl
 * `community_members` als auch `community_invites` leben dort, und der
 * Mandanten-Host hat auf beide keinen Schlüssel — das ist dieselbe Grenze wie
 * bei `revokeCommunityLabel` (A5). Billiger wäre nur `resolveRecentJoinCount`,
 * das aber offene EINLADUNGEN nicht kennt: der Owner hätte eingeladen und
 * bekäme den Punkt trotzdem nicht abgehakt. Deshalb der volle Ruf — aber über
 * die schon vorhandene Route, ohne die Namens-Anreicherung von
 * `/api/community/members` (die kostet zusätzlich `users.list`), und mit einem
 * kleinen Cache: die Übersicht ist die meistbesuchte Seite des Dashboards.
 *
 * WARUM `team.manage` UND NICHT `community.billing`: die Liste ist eine
 * AUFBAU-Liste. Owner und Admin bauen die Community auf; ein Moderator, der zu
 * einer fremden Community dazugestoßen ist, braucht keine Startliste — und
 * bekäme in ihr vier Links in 403-Seiten. Dieselbe Capability trägt deshalb
 * auch der Registry-Eintrag in `app.config.ts`.
 *
 * WEGGEKLICKT WIRD ZUERST GEPRÜFT: wer die Karte nicht will, soll dafür nicht
 * bei jedem Seitenaufruf drei Abfragen und einen Control-Ruf bezahlen.
 *
 * FAIL-SOFT MIT RICHTUNG: fällt eine der drei Abfragen aus (Tabelle fehlt,
 * Produkt nicht komponiert, Appwrite hustet), gilt der Punkt als ERLEDIGT.
 * Andersherum wäre die Karte unsterblich — ein technischer Fehler darf keine
 * Aufgabe erfinden, die niemand erledigen kann.
 */

export default defineEventHandler(async (event): Promise<GettingStartedResponse> => {
  const tenant = useTenant(event)
  // Kein Pool-Mandant (Silo, Kontroll-Host, Playground) ⇒ es gibt hier weder
  // Farbwelt-Zeile noch Abo noch Team im Control Plane. 404 wie bei den
  // Geschwister-Routen; die Karte rendert dann einfach nicht.
  if (tenant?.mode !== 'pool' || !tenant.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const { actor } = await requireCommunityPermission(event, 'team.manage')

  const communityId = tenant.communityId
  const dismissed = communityDismissedGettingStarted(
    (event.context.user?.prefs as Record<string, unknown> | undefined)?.[GETTING_STARTED_PREF_KEY],
    communityId,
  )
  // Die Karte ist weg — die Tatsachen interessieren niemanden mehr.
  if (dismissed) {
    return {
      steps: { post: false, branding: false, invite: false, homePage: false, plan: false },
      dismissed: true,
    }
  }

  // `as: 'operator'`, weil die Liste den AUFBAU-Zustand der Community meldet:
  // ein Entwurf oder ein ausgeblendeter erster Beitrag ist geschrieben worden.
  // Der `actor` wird durchgereicht (C1c) — gehandelt hat der Owner, nicht die
  // Klinke.
  const db = tenantDb(event, { as: 'operator', actor })

  const [post, homePage, invite] = await Promise.all([
    countsFirstPost(event),
    homePageTouched(db),
    resolveCommunityTeamSnapshot(event, communityId).then(teamHasReach),
  ])

  return {
    steps: {
      post,
      // '' heißt „nichts gewählt, Instanz-Einstellung gilt" (B5) — also hat
      // der Owner seine Farbwelt noch nicht gesetzt.
      branding: Boolean(tenant.theme),
      invite,
      homePage,
      plan: hasActiveCommunitySubscription(tenant.billingStatus),
    },
    dismissed: false,
  }
})

type TenantDb = ReturnType<typeof tenantDb>

/**
 * „Es gibt einen ersten Beitrag." — beantwortet vom Layer, dem der Feed
 * gehört, über den core-Vertrag `registerCommunityFirstContentProvider`.
 *
 * WARUM NICHT SELBST ZÄHLEN: dieser Layer darf `posts` nicht kennen (A14,
 * ESLint `pukalani/no-cross-layer-relative` — anders als `pages`, das für
 * Naht-Layer ausdrücklich erlaubt ist). Er kennt daher weder die Tabelle noch
 * die Id des Beispiel-Beitrags und fragt nur die eine Frage.
 *
 * DIE SAAT ZÄHLT DORT AUSDRÜCKLICH NICHT MIT: seit U4 Teil 5 legt der Wizard
 * einen Beispiel-Beitrag an (E2) — ohne diese Ausnahme hakte die Liste ihren
 * ersten Punkt mit unserer eigenen Saat ab und gratulierte dem Owner zu einem
 * Beitrag, den er nicht geschrieben hat. Wie das Beispiel wiedererkannt wird,
 * ist Sache des posts-Layers (ableitbare Zeilen-Id).
 *
 * `null` = kein Feed-Produkt komponiert oder keine Auskunft ⇒ ERLEDIGT, wie
 * bei den zwei Abfragen darunter: ein technischer Fehler darf keine Aufgabe
 * erfinden, die niemand erledigen kann.
 */
async function countsFirstPost(event: H3Event): Promise<boolean> {
  const authored = await communityHasAuthoredContent(event)
  return authored ?? true
}

/**
 * „Die Startseite wurde angepasst." — die Saat legt sie beim Anlegen an (in
 * BEIDEN Sprachen, M4), also zählt nicht ihre Existenz, sondern ihre
 * Bearbeitung (`homePageEdited`). Eine Sprache genügt: wer den deutschen Text
 * überarbeitet hat, hat die Startseite angepasst.
 */
async function homePageTouched(db: TenantDb): Promise<boolean> {
  return await db
    .list<PageRow>(PAGES_TABLE, [Query.equal('slug', 'home'), Query.limit(4)])
    .then(res => res.rows.some(row => homePageEdited(row.$createdAt, row.$updatedAt)))
    .catch(softFail('onboarding:api/community/getting-started.get:list', true))
}
