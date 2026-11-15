import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { decideInvite, decideInviteDelivery } from '../../../../../shared/communityTeam'
import { decideMemberInvite, memberInviteQuota, memberInviteWindowStart } from '../../../../../shared/communityInviteQuota'
import { COMMUNITY_INVITES_TABLE, COMMUNITY_INVITE_TTL_MS, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { resolveTenantMemberInvitesEnabled } from '../../../../../shared/types/tenantRecord'
import { COMMUNITY_ROLES, communityRoleHasCapability } from '../../../../../../core/shared/communityAuthz'
import { countCommunityInvitesBy, memberInviteLimit, requireCommunityTeamContext, createCommunityInviteToken, memberFacts, throwOnDenied } from '../../../../utils/communityTeam'
import { sendCommunityInviteMail } from '../../../../utils/communityInviteMail'

/**
 * Jemanden in eine Community einladen — EIN Feld, eine Rollenwahl (Davids
 * Entscheidung 2 vom 2026-07-29).
 *
 * Reihenfolge mit Absicht: erst Regeln, dann MAIL, dann Row. Wie bei den
 * Einladungen (M9-T2-Muster) gilt „keine Einladung ohne Zustellung": lässt
 * sich die Mail nicht senden, entsteht auch kein pending-Eintrag, der im
 * Dashboard läge und niemanden erreicht (503, nichts angelegt).
 *
 * Eine zweite Einladung an dieselbe Adresse ERSETZT die erste — genau EIN
 * gültiger Link je Adresse, alte Links sterben. Die DB kennt nur den Token-Hash.
 *
 * 'owner' ist hier verboten (decideInvite): Besitz entsteht durch Gründung oder
 * Übergabe, nie durch eine Einladung.
 *
 * ── SEIT F57 DÜRFEN AUCH MITGLIEDER EINLADEN (Davids Entscheidung 2026-08-14)
 * Die Capability heißt jetzt `members.invite` statt `team.manage` und sitzt
 * beim VIEWER — jedes Mitglied mit Zugang. Für ein Mitglied kommen drei
 * Bedingungen dazu, alle in der PUREN `decideMemberInvite`: der Owner-Schalter
 * der Community, die eingeladene Rolle (immer `viewer`) und das Kontingent
 * (5 je rollierender Woche). Owner/Admin gehen unverändert durch.
 *
 * WO DIE PRÜFUNG STEHT, IST DIE HALBE MECHANIK: VOR der Mail. Stünde sie
 * danach, hätte ein erschöpftes Kontingent trotzdem eine Mail verschickt und
 * nur die Zeile verweigert — die Drossel säße hinter dem Missbrauch.
 *
 * WARUM DIE ROLLEN-PRÜFUNG HIER UND NICHT NUR IN DER OBERFLÄCHE: ohne sie
 * wäre `role: 'admin'` im Body eine Rollen-Vergabe per Mitglieds-Capability —
 * dieselbe Klasse Fehler, gegen die `community.transfer` als eigene
 * Capability geschnitten wurde. Ein verstecktes Auswahlfeld ist keine Grenze.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  email: z.string().email().max(254),
  role: z.enum(COMMUNITY_ROLES),
  locale: z.enum(['de', 'en']).default('de'),
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'members.invite')

  /**
   * F57: die Zusatz-Regeln für MITGLIEDER. `managesTeam` beantwortet die
   * Capability-Matrix, nicht ein Rollen-Vergleich — käme je eine sechste Rolle
   * dazu, stimmt diese Zeile weiter.
   *
   * Der Verbrauch wird nur GEZÄHLT, wenn er zählt: für Owner/Admin ist das
   * Kontingent unendlich, und eine Abfrage, deren Ergebnis niemand liest, ist
   * eine Abfrage zu viel auf dem Weg jeder Team-Einladung.
   */
  const managesTeam = communityRoleHasCapability(context.actorRole, 'team.manage')
  const limit = memberInviteLimit()
  const used = managesTeam
    ? 0
    : await countCommunityInvitesBy(
        event,
        body.communityId,
        context.identity.userId,
        memberInviteWindowStart(Date.now()),
      )

  const gate = decideMemberInvite({
    managesTeam,
    role: body.role,
    invitesEnabled: resolveTenantMemberInvitesEnabled(context.tenant.memberInvitesEnabled),
    // AU1: die eigene Adresse muss bestätigt sein. Der Wert lag hier seit
    // control-019 auf dem Tisch und wurde nie gelesen (Audit 2026-08-15).
    emailVerified: context.identity.emailVerified,
    limit,
    used,
  })
  if (!gate.ok) {
    logEvent('info', 'community.member_invite_denied', {
      communityId: body.communityId,
      actor: context.identity.userId,
      role: body.role,
      reason: gate.reason,
      used,
      limit,
    })
    /**
     * 429 NUR fürs erschöpfte Kontingent — das ist die einzige der VIER
     * Ablehnungen, die sich von selbst erledigt (in spätestens sieben Tagen).
     * Abgeschaltete Mechanik, unbestätigte Adresse und verbotene Rolle sind
     * 403: daran ändert Warten nichts, und ein 429 lüde zum Wiederholen ein.
     * Bei `email_unverified` ist der nächste Schritt zudem ein anderer — die
     * Bestätigungs-Mail —, und den nennt der Text in der Oberfläche.
     *
     * `Retry-After` bleibt bewusst WEG. Ehrlich wäre „wenn deine älteste
     * Einladung sieben Tage alt ist" — dafür müsste die Route deren Datum
     * nachschlagen, und der Header ist auf die Sekunde genau gemeint, nicht
     * auf den Tag. Der Text in der Oberfläche sagt es besser.
     */
    throw createError({
      status: gate.reason === 'invite_quota_exhausted' ? 429 : 403,
      statusText: gate.reason === 'invite_quota_exhausted' ? 'Invite quota exhausted' : 'Forbidden',
      data: { code: gate.reason },
    })
  }

  const email = body.email.trim().toLowerCase()
  const activeEmails = context.members
    .filter(row => row.status === 'active')
    .map(row => row.email ?? '')

  /**
   * AU1: aus der Regel-Entscheidung wird ein VERHALTEN — senden, stillschweigen
   * oder ablehnen (`decideInviteDelivery`, pur und unit-getestet). Die
   * Begründung, warum ein Mitglied auf `already_member` eine Erfolgs-Antwort
   * bekommt, steht dort und wird hier bewusst nicht wiederholt.
   */
  const delivery = decideInviteDelivery(
    decideInvite({ email, role: body.role, members: context.members.map(memberFacts), activeEmails }),
    managesTeam,
  )
  if (delivery.outcome === 'reject') {
    throwOnDenied(
      { ok: false, reason: delivery.reason },
      { communityId: body.communityId, actor: context.identity.userId, role: body.role },
    )
  }

  const admin = createAdminClient(event)
  const { token, tokenHash } = createCommunityInviteToken()
  const expiresAt = new Date(Date.now() + COMMUNITY_INVITE_TTL_MS).toISOString()
  // Nach dem Wurf oben bleiben genau zwei Wege. Der Grund wird HIER
  // festgehalten, solange der Typ ihn noch trägt — weiter unten ist `delivery`
  // nur noch die Frage „echt oder still?".
  const suppressed = delivery.outcome === 'suppress'
  const suppressedReason = delivery.outcome === 'suppress' ? delivery.reason : ''

  if (!suppressed) {
    const sent = await sendCommunityInviteMail(event, {
      to: email,
      siteName: context.tenant.name || context.tenant.host,
      host: context.tenant.host,
      token,
      role: body.role,
      locale: body.locale,
      invitedByName: context.identity.name,
    })
    if (!sent) {
      throw createError({ status: 503, statusText: 'Mailer not configured' })
    }

    // Vorherige offene Einladung derselben Adresse zurückziehen (nicht löschen —
    // die Spur bleibt, aber der alte Link ist tot). NUR auf dem echten Weg: eine
    // stillgelegte Einladung darf keine fremde, gültige mit sich reissen.
    //
    // GEZIELT gesucht (SEC-028), nicht aus der Anzeige-Liste gefischt: die ist
    // auf 100 gekappt, und bei mehr offenen Einladungen blieb der ältere Link
    // neben dem neuen gültig. `listAllRows` blättert, bis nichts mehr kommt —
    // ohne Deckel, weil die Treffermenge die offenen Einladungen EINER Adresse
    // sind (im Normalfall höchstens eine); der Index `idx_community_email`
    // (control-019/023) deckt die beiden Gleichheits-Filter. Gespeichert wird
    // die Adresse klein geschrieben, deshalb trifft `equal` genau.
    const previous = await listAllRows<CommunityInviteRow>(admin.tablesDB, context.databaseId, COMMUNITY_INVITES_TABLE, [
      Query.equal('communityId', body.communityId),
      Query.equal('email', email),
      Query.equal('status', 'pending'),
    ]).catch((error) => { throw toH3Error(error, 'Could not read site invites') })
    for (const invite of previous) {
      await admin.tablesDB.updateRow({
        databaseId: context.databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id,
        data: { status: 'revoked' },
      }).catch(() => {})
    }
  }

  /**
   * DIE ZEILE ENTSTEHT IN BEIDEN FÄLLEN — und genau das ist der Preis, der das
   * Orakel schliesst (AU1).
   *
   * Das Kontingent zählt `community_invites`-Zeilen (countCommunityInvitesBy,
   * bewusst OHNE `status`-Filter). Eine stillgelegte Einladung, die keine Zeile
   * schriebe, wäre also gratis — und ein Orakel, das nichts kostet, ist ein
   * offenes Orakel, egal wie die Antwort aussieht.
   *
   * SIE ENTSTEHT SOFORT `revoked`, nicht `pending`. Damit ist sie überall tot,
   * wo eine Einladung lebt, ohne dass eine einzige Leseroute eine Ausnahme
   * lernen muss: `listCommunityInvites` filtert auf `pending` (die offenen
   * Einladungen des Teams bleiben also sauber), `preview` und `accept`
   * verlangen `pending`. Ihr Token wurde nie verschickt und existiert nach
   * diesem Request nirgends mehr.
   *
   * KEIN NEUER STATUS-WERT: `status` ist eine ENUM-Spalte (control-019/023).
   * Ein vierter Wert wäre eine Migration, die VOR dem Code-Deploy laufen muss —
   * sonst antwortet Appwrite 400 und ausgerechnet der Missbrauchs-Pfad wäre
   * kaputt. Was hier passiert, ist ohnehin wörtlich „angelegt und sofort
   * zurückgezogen"; das Warum steht im Log, nicht in der Spalte.
   */
  const row = await admin.tablesDB.createRow<CommunityInviteRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    rowId: ID.unique(),
    data: {
      communityId: body.communityId,
      email,
      role: body.role,
      tokenHash,
      status: suppressed ? 'revoked' : 'pending',
      expiresAt,
      invitedBy: context.identity.userId,
      acceptedBy: '',
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create invitation') })

  logEvent('info', suppressed ? 'community.member_invite_suppressed' : 'site.member_invited', {
    communityId: body.communityId,
    inviteId: row.$id,
    role: body.role,
    actor: context.identity.userId,
    // F57: woher das Recht kam. Ohne diese Zeile ließe sich im Nachhinein
    // nicht unterscheiden, ob eine Einladungswelle vom Team oder aus der
    // Mitgliedschaft kam — genau die Frage, die man bei Missbrauch stellt.
    viaQuota: !managesTeam,
    // AU1: der Grund steht NUR hier. Ein Betreiber, der eine Sondierungs-Welle
    // sucht, findet sie an dieser Zeile; der Einladende erfährt sie nie.
    ...(suppressedReason ? { reason: suppressedReason } : {}),
  })

  /**
   * EINE ANTWORT, ZWEI WEGE — Feld für Feld dieselbe (AU1).
   *
   * `delivered` sagt der Runtime-Route, ob es etwas zu melden gibt (die
   * Glocken-Benachrichtigung hängt daran). Sie reicht es NICHT an den Browser
   * weiter — sonst wäre das Orakel nur eine Ebene höher gewandert. Der Beweis
   * dafür liegt an der Naht: packages/onboarding/.../members/index.post.ts.
   *
   * Das Kontingent NACH dieser Einladung reist mit — die Oberfläche schreibt
   * „noch 2 von 5" fort, ohne eine zweite Runde zum Server. `used + 1` ist
   * hier keine Schätzung: die Zeile ist eine Anweisung weiter oben entstanden,
   * auf BEIDEN Wegen.
   *
   * GERECHNET WIRD MIT `memberInviteQuota`, NICHT MIT DER HAND. Bis AU1 stand
   * hier ein Vier-Felder-Auszug ohne `enabled` — die Oberfläche schreibt die
   * Antwort direkt in ihren Kontingent-Zustand fort, und danach war `enabled`
   * dort `undefined`, also der Einladen-Knopf bis zum nächsten Seitenaufbau
   * verschwunden. Eine zweite Formulierung derselben Zahlen ist genau die
   * Doppelung, gegen die die pure Regel gebaut wurde.
   */
  return {
    ok: true,
    delivered: !suppressed,
    inviteId: row.$id,
    email,
    role: body.role,
    expiresAt: row.expiresAt,
    quota: memberInviteQuota({
      managesTeam,
      invitesEnabled: resolveTenantMemberInvitesEnabled(context.tenant.memberInvitesEnabled),
      emailVerified: context.identity.emailVerified,
      limit,
      used: used + 1,
    }),
  }
})
