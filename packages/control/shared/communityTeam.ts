import { COMMUNITY_JOIN_ROLE, type CommunityJoinOutcome, type CommunityJoinTrigger } from '../../core/shared/communityJoin'
import { COMMUNITY_ROLES, type CommunityRole } from '../../core/shared/communityAuthz'
import type { CommunityMemberStatus } from './types/communityMember'
import type { CommunityInviteRow, CommunityInviteStatus } from './types/communityInvite'
import type { InviteRequestStatus } from './types/inviteRequest'

/**
 * Die Schutzregeln der Mitglieder-Verwaltung — PURE (unit-getestet, ohne h3/
 * Appwrite), weil sie zweimal gebraucht werden: die Kunden-App darf sie fürs UI
 * kennen (Knöpfe ausgrauen), das Control Plane MUSS sie durchsetzen. Wären sie
 * nur in der Route, gäbe es genau die Sorte Regel, die beim nächsten Endpunkt
 * vergessen wird.
 *
 * Vier Regeln, alle mit Grund:
 *
 *  1. **Kein Selbst-Degradieren.** Wer die Verwaltung offen hat, darf sich nicht
 *     selbst die Rechte nehmen, mit denen er sie offen hält — sonst sperrt ein
 *     Fehlklick die letzte handlungsfähige Person aus ihrer eigenen Community.
 *     Dieselbe Regel kennt die Operator-Nutzerliste schon (isSelf ⇒ Block/Delete
 *     gesperrt).
 *  2. **Nicht der letzte Owner.** Eine Community ohne Owner hätte niemanden, der
 *     übertragen oder abrechnen kann. Degradieren UND Entfernen prüfen das.
 *  3. **Owner ist nur per Übergabe erreichbar.** Ein Admin kann keinen Owner
 *     ernennen und keinen Owner antasten — sonst wäre `community.transfer` (Owner-
 *     Capability) über die Rollen-Änderung (admin-Capability) umgehbar.
 *  4. **Sich selbst entfernt man nicht.** Austritt ist ein anderer Vorgang als
 *     Verwaltung; ihn hier mitzudenken hieße, den einzigen Owner per „Entfernen"
 *     loswerden zu können.
 *
 * ENTFERNEN LÖSCHT NICHTS (Davids Entscheidung 1 vom 2026-07-29): der Status
 * wird 'removed', Inhalte und Namen bleiben. Echtes Löschen ist der getrennte
 * DSGVO-Weg (Konto löschen).
 */

/** Fakten über eine Mitgliedschaft, die für eine Entscheidung reichen. */
export interface CommunityTeamMemberFacts {
  /** Row-Id der Mitgliedschaft. */
  id: string
  /** Appwrite-User IM Runtime-Projekt. */
  runtimeUserId: string
  role: CommunityRole
  status: CommunityMemberStatus
}

export type CommunityTeamDenyReason =
  /** Zielzeile gehört nicht (mehr) zum Team dieser Community. */
  | 'not_a_member'
  /** Unbekannte Rolle. */
  | 'invalid_role'
  /** Rolle unverändert — nichts zu tun. */
  | 'unchanged'
  /** Selbst-Degradierung. */
  | 'self_demote'
  /** Sich selbst entfernen. */
  | 'self_remove'
  /** Letzter Owner. */
  | 'last_owner'
  /** Owner nur per Übergabe (weder ernennen noch antasten). */
  | 'owner_protected'
  /** Diese Adresse ist schon im Team. */
  | 'already_member'
  /** Es läuft noch ein Abo — erst kündigen (C16). */
  | 'subscription_active'
  /** Die Community ist schon stillgelegt (C16) — nichts zu tun. */
  | 'already_disabled'

export type CommunityTeamDecision =
  | { ok: true }
  | { ok: false, reason: CommunityTeamDenyReason }

const ALLOW: CommunityTeamDecision = { ok: true }
const deny = (reason: CommunityTeamDenyReason): CommunityTeamDecision => ({ ok: false, reason })

/** Zählt die Mitglieder mit Zugang und Owner-Rolle. */
export function countActiveOwners(members: readonly CommunityTeamMemberFacts[]): number {
  return members.filter(member => member.status === 'active' && member.role === 'owner').length
}

/** Hat diese Mitgliedschaft Zugang? (nur 'active' — genau wie der Resolver) */
export function hasCommunityAccess(status: CommunityMemberStatus): boolean {
  return status === 'active'
}

export interface RoleChangeInput {
  /** Runtime-User, der handelt. */
  actorUserId: string
  /** Rolle des Handelnden (aus der Mitgliedschaft, nicht aus dem Request). */
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
  nextRole: string
  /** ALLE Mitgliedschaften der Site (für die Owner-Zählung). */
  members: readonly CommunityTeamMemberFacts[]
}

/** Darf die Rolle dieses Mitglieds so geändert werden? */
export function decideRoleChange(input: RoleChangeInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target, nextRole, members } = input

  if (!(COMMUNITY_ROLES as readonly string[]).includes(nextRole)) return deny('invalid_role')
  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.role === nextRole) return deny('unchanged')

  // Zum Owner macht nur die ÜBERGABE — sonst wäre eine Owner-Capability über
  // eine Admin-Capability erreichbar (auch für sich selbst).
  if (nextRole === 'owner') return deny('owner_protected')

  // Eigene Rechte gibt niemand über diese Seite ab.
  if (target.runtimeUserId === actorUserId) return deny('self_demote')

  // Einen Owner anzutasten darf nur ein Owner — und nie den letzten.
  if (target.role === 'owner') {
    if (actorRole !== 'owner') return deny('owner_protected')
    if (countActiveOwners(members) <= 1) return deny('last_owner')
  }

  return ALLOW
}

export interface RemovalInput {
  actorUserId: string
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
  members: readonly CommunityTeamMemberFacts[]
}

/** Darf diesem Mitglied der Zugang entzogen werden? */
export function decideRemoval(input: RemovalInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target, members } = input

  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.runtimeUserId === actorUserId) return deny('self_remove')
  if (target.role === 'owner') {
    if (actorRole !== 'owner') return deny('owner_protected')
    if (countActiveOwners(members) <= 1) return deny('last_owner')
  }

  return ALLOW
}

export interface TransferInput {
  actorUserId: string
  actorRole: CommunityRole
  target: CommunityTeamMemberFacts
}

/**
 * Darf der Besitz an dieses Mitglied übergehen? Erfolgreich heißt: das Ziel wird
 * Owner, der Übergebende wird Admin (nicht ausgesperrt — Davids Entscheidung 3).
 */
export function decideTransfer(input: TransferInput): CommunityTeamDecision {
  const { actorUserId, actorRole, target } = input

  if (actorRole !== 'owner') return deny('owner_protected')
  if (!hasCommunityAccess(target.status)) return deny('not_a_member')
  if (target.runtimeUserId === actorUserId) return deny('unchanged')

  return ALLOW
}

export interface CommunityDeletionInput {
  actorRole: CommunityRole
  /** `communities.status` — 'disabled' heißt: schon stillgelegt. */
  communityStatus: string
  /** Läuft an dieser Community ein Abo? (hasLiveSubscription, communityBilling.ts) */
  liveSubscription: boolean
}

/**
 * Darf diese Community JETZT gelöscht werden? (C16, Davids Kehrtwende zur
 * Entscheidung 3 vom 2026-07-29 — er hat den Punkt selbst wieder eingereiht.)
 *
 * WAS „LÖSCHEN" HIER HEISST — und was ausdrücklich nicht (der bewusste Schnitt):
 * **Deaktivieren + Zugänge entziehen, Daten bleiben.** `communities.status`
 * wird 'disabled' (der Host-Resolver liefert dann nichts mehr → 404 binnen
 * ≤30 s), jede Mitgliedschaft wird 'removed', und die Runtime zieht die
 * Community-Labels ein. KEINE Zeile wird gelöscht. Drei Gründe:
 *
 *  1. F3-Grundsatz „nie destruktiv": ein unumkehrbares Löschen ohne
 *     Wiederherstellungs-Frist ist Datenverlust auf einen Klick.
 *  2. Für echtes Löschen von Personendaten gibt es einen eigenen, geprüften
 *     Weg (DSGVO: Konto löschen, deleteUserCompletely). Zwei Löschpfade
 *     nebeneinander wären zwei Stellen, an denen etwas übrig bleibt.
 *  3. Inhalte einer Community gehören nicht nur ihrem Owner — an Threads hängen
 *     die Beiträge anderer.
 *
 * Ein echtes Hard-Delete (Rows weg, Projekt weg) wäre Davids FOLGE-Entscheidung
 * und ein eigener Plan (Frist, Export, Reihenfolge über zwei Projekte hinweg).
 *
 * Zwei Sperren, beide mit Grund:
 *  - **Abo läuft** ⇒ erst kündigen. Stillegen kündigt bei Stripe nichts; die
 *    Rechnung käme weiter für etwas, das niemand mehr sehen kann.
 *  - **Schon stillgelegt** ⇒ nichts zu tun. Bewusst eine ABLEHNUNG und kein
 *    stilles ok: sonst meldete die Seite jedem Doppelklick einen Erfolg, der
 *    nichts bewirkt hat.
 *
 * Die Owner-Prüfung ist doppelt gemoppelt (der Gate verlangt schon
 * `community.delete`, und die trägt nur der Owner) — sie steht trotzdem hier,
 * weil eine PURE Regel ohne ihre Vorbedingung nur die halbe Wahrheit ist.
 */
export function decideCommunityDeletion(input: CommunityDeletionInput): CommunityTeamDecision {
  const { actorRole, communityStatus, liveSubscription } = input

  if (actorRole !== 'owner') return deny('owner_protected')
  if (communityStatus === 'disabled') return deny('already_disabled')
  if (liveSubscription) return deny('subscription_active')

  return ALLOW
}

// ── DSGVO: die Mitgliedschaften EINES Kontos auflösen (F3) ──────────────────

/**
 * Was mit EINER Mitgliedschaft passiert, wenn das dazugehörige Runtime-Konto
 * gelöscht wird.
 *
 *  - `delete`    — Zeile weg. Der Regelfall: an einer Mitgliedschaft hängt
 *                  kein fremder Kontext (anders als an einem Kommentar), sie
 *                  ist reine Zuordnung Person ⇄ Community.
 *  - `anonymize` — Zeile bleibt, E-Mail wird geleert. Nur wenn die Zeile
 *                  strukturell gebraucht wird (siehe `decideMembershipErasure`).
 */
export type MembershipErasureAction = 'delete' | 'anonymize'

export interface MembershipErasureInput {
  /** Die Mitgliedschaft des zu löschenden Kontos. */
  target: CommunityTeamMemberFacts
  /** ALLE Mitgliedschaften DIESER Community — inklusive `target`. */
  members: readonly CommunityTeamMemberFacts[]
  /** `communities.status` — 'disabled' heißt: stillgelegt (C16). */
  communityStatus: string
}

export interface MembershipErasureDecision {
  action: MembershipErasureAction
  /** Warum die Zeile bleiben MUSS; null bei `delete`. */
  reason: 'last_owner' | null
}

/**
 * Darf diese Mitgliedschaft mit dem Konto verschwinden? (F3)
 *
 * DIE EINE AUSNAHME IST DIESELBE WIE ÜBERALL: der letzte Owner einer aktiven
 * Community. `decideRoleChange` und `decideRemoval` verbieten schon, ihn per
 * Verwaltung wegzunehmen — eine Community ohne Owner hätte niemanden, der
 * übertragen oder abrechnen kann, und niemanden, der sie wieder öffnet. Die
 * DSGVO-Löschung darf diese Sperre nicht hintenherum aufheben, nur weil sie aus
 * einer anderen Richtung kommt.
 *
 * Sie darf die Löschung aber auch nicht VERWEIGERN: das Recht auf Löschung
 * hängt nicht daran, ob jemand anders eine Community erbt. Also der Mittelweg,
 * und er ist bewusst kein Kompromiss aus Bequemlichkeit: die Zeile bleibt als
 * STRUKTUR stehen (Community behält einen Owner-Platz), aber ohne
 * Personenbezug — die E-Mail wird geleert, und die `runtimeUserId` zeigt nach
 * `users.delete()` auf ein Konto, das es nicht mehr gibt. Was bleibt, ist ein
 * Pseudonym ohne Auflösung.
 *
 * Damit das nicht still passiert, meldet die Route jede zurückgehaltene Zeile
 * im KLARTEXT (Community-Name + Rolle) — der Betreiber muss wissen, welche
 * Community jetzt einen verwaisten Owner-Platz hat, und sie einem Menschen
 * zuweisen können.
 *
 * Drei Fälle gehen ohne Ausnahme durch:
 *  - kein Zugang mehr ('removed'/'suspended') — die Zeile schützt niemanden,
 *  - keine Owner-Rolle,
 *  - Community stillgelegt ('disabled') — dort ist nichts mehr zu verwalten.
 */
export function decideMembershipErasure(input: MembershipErasureInput): MembershipErasureDecision {
  const { target, members, communityStatus } = input

  if (!hasCommunityAccess(target.status)) return { action: 'delete', reason: null }
  if (target.role !== 'owner') return { action: 'delete', reason: null }
  if (communityStatus === 'disabled') return { action: 'delete', reason: null }
  if (countActiveOwners(members) > 1) return { action: 'delete', reason: null }

  return { action: 'anonymize', reason: 'last_owner' }
}

/** Welche Spur-Felder einer Einladung auf dieses Konto zeigen — `null` = keine. */
export type InviteReferencePatch = { invitedBy?: '', acceptedBy?: '' }

/**
 * Kappt die SPUREN, die eine Einladung über andere Konten führt: `invitedBy`
 * (wer eingeladen hat) und `acceptedBy` (wer angenommen hat). Beide tragen eine
 * `runtimeUserId` — also nicht die Person, an die die Einladung ging, sondern
 * die, die sie ausgesprochen oder eingelöst hat.
 *
 * WARUM ÜBERHAUPT, wo doch die Adresse der eigentliche Personenbezug ist: eine
 * `runtimeUserId` ohne Konto ist ein Pseudonym ohne Auflösung — sie ist der
 * mildere Fall, aber sie zeigt nach `users.delete()` DAUERHAFT auf die gelöschte
 * Person, in Zeilen, die diese Person nicht einmal betreffen (die Einladung
 * gehört jemand anderem und bleibt bestehen). Gekappt wird deshalb, ohne dass
 * die Zeile angetastet würde.
 *
 * WARUM DAS GEFAHRLOS IST: beide Spalten haben im ganzen Repo KEINEN Leser —
 * nur Schreibstellen (invite.post.ts setzt `invitedBy`, accept.post.ts setzt
 * `acceptedBy`). Die Einladungs-Mail nennt den Einladenden aus
 * `invitedByName`, das aus dem JWT des Handelnden kommt, nicht aus dieser
 * Spalte. Leeren nimmt also niemandem eine Anzeige weg.
 *
 * IDEMPOTENT PER KONSTRUKTION: geleert wird auf `''`, und `''` matcht die
 * Abfrage `Query.equal(field, runtimeUserId)` beim Re-Run nicht mehr. Ein
 * leerer `runtimeUserId` ergibt nie einen Treffer — sonst kappte ein
 * Aufruf ohne Identität wahllos fremde Zeilen.
 */
export function inviteReferenceErasure(
  row: Pick<CommunityInviteRow, 'invitedBy' | 'acceptedBy'>,
  runtimeUserId: string,
): InviteReferencePatch | null {
  if (!runtimeUserId) return null

  const patch: InviteReferencePatch = {}
  if (row.invitedBy === runtimeUserId) patch.invitedBy = ''
  if (row.acceptedBy === runtimeUserId) patch.acceptedBy = ''

  // Eine Zeile kann BEIDES tragen (wer sich selbst einlädt, ist ein Sonderfall,
  // aber Bestand ist Bestand) — dann geht ein Update mit beiden Feldern raus.
  return Object.keys(patch).length > 0 ? patch : null
}

/** Eine Mitgliedschaft, die die DSGVO-Löschung stehen lassen MUSSTE. */
export interface RetainedMembership {
  communityId: string
  /** Klartext für den Betreiber — Anzeigename, ersatzweise der Host. */
  communityName: string
  role: CommunityRole
  reason: 'last_owner'
}

/** Was die DSGVO-Löschung im Control Plane bewegt hat. */
export interface CommunityErasureResult {
  /** Hart gelöschte `community_members`-Zeilen. */
  deleted: number
  /** Zeilen, die bleiben mussten und entpersonalisiert wurden. */
  anonymized: number
  /** Gelöschte `community_invites` (die E-Mail IST dort der Personenbezug). */
  invitesDeleted: number
  /** Fremde `community_invites`, deren Spur auf dieses Konto gekappt wurde
   *  (`invitedBy`/`acceptedBy` — siehe `inviteReferenceErasure`). */
  invitesAnonymized: number
  /** Gelöschte `invite_requests` (Adresse + Freitext = Personenbezug). */
  inviteRequestsDeleted: number
  /** `invite_codes`, an denen die Adresse geleert wurde (`boundEmail`, und
   *  aus `label` herausgenommen) — der Code selbst bleibt, siehe
   *  `inviteCodeErasure`. */
  inviteCodesAnonymized: number
  /** Gelöschte `trial_claims`-Zeile (0 oder 1, BE-015). Optional, weil eine
   *  ältere Control-Plane-Fassung das Feld noch nicht kennt (platform und
   *  admin werden getrennt ausgeliefert). */
  trialClaimsDeleted?: number
  /** Klartext zu jeder zurückgehaltenen Zeile — gehört ins Log, nie in eine
   *  Browser-Antwort (es nennt fremde Communities). */
  retained: RetainedMembership[]
}

/** Eine Mitgliedschaft, wie die DSGVO-AUSKUNFT sie zeigt. */
export interface CommunityMembershipExport {
  communityId: string
  communityName: string
  host: string
  role: CommunityRole
  status: CommunityMemberStatus
  joinedAt: string
  removedAt: string | null
}

/** Eine offene Einladung, wie die DSGVO-Auskunft sie zeigt (nie mit Token). */
export interface CommunityInviteExport {
  communityId: string
  communityName: string
  role: CommunityRole
  status: CommunityInviteStatus
  expiresAt: string
  createdAt: string
}

/**
 * Eine Early-Access-Anfrage, wie die DSGVO-Auskunft sie zeigt.
 *
 * Der FREITEXT reist mit, und das ist der Punkt: „Wofür willst du Pukalani
 * nutzen?" beantwortet ein Mensch mit Sätzen über sich, seine Firma oder seinen
 * Verein. Eine Auskunft, die nur „Status: new" meldet, verschwiege genau das
 * personenbezogene Stück. Der zugewiesene Code bleibt draußen (Betriebsdatum,
 * kein Personenbezug).
 */
export interface InviteRequestExport {
  status: InviteRequestStatus | ''
  note: string
  createdAt: string
}

/**
 * Eine Einladung, die die Person SELBST verschickt (`invitedBy`) oder
 * angenommen (`acceptedBy`) hat, wie die DSGVO-Auskunft sie zeigt.
 *
 * Bei VERSCHICKTEN Einladungen fehlt die Adresse der Eingeladenen bewusst: sie
 * ist ein Datum über einen DRITTEN, und eine Auskunft an A ist keine Auskunft
 * über B. Gemeldet wird nur, DASS eingeladen wurde, wann, mit welcher Rolle und
 * in welche Community. Der Token-Hash reist nie mit.
 *
 * `lastChangedAt` statt eines Annahme-Zeitpunkts: die Tabelle hat dafür keine
 * eigene Spalte, und `$updatedAt` ist nur „zuletzt geändert" — so heißt es
 * auch, statt eine Genauigkeit vorzutäuschen.
 */
export interface CommunityInviteTraceExport {
  communityId: string
  communityName: string
  role: CommunityRole
  status: CommunityInviteStatus
  createdAt: string
  lastChangedAt: string
}

/**
 * Ein Early-Access-Code, der an die Adresse der Person gebunden war, wie die
 * DSGVO-Auskunft ihn zeigt. NIE der Code selbst und nie sein Hash — der
 * Klartext existiert ohnehin nicht mehr, und der Hash ist ein Betriebsdatum.
 */
export interface InviteCodeExport {
  boundEmail: string
  label: string
  status: string
  createdAt: string
  assignedAt: string | null
  expiresAt: string
  redeemed: boolean
  redeemedAt: string | null
}

/**
 * Eine Missbrauchsmeldung, die die Person unter ihrer Adresse abgegeben hat.
 * Ohne `handledBy`/`note`: das ist die Arbeit des Betreibers an der Meldung,
 * nicht ein Datum über die meldende Person.
 */
export interface AbuseReportExport {
  host: string
  category: string
  url: string
  message: string
  status: string
  createdAt: string
}

/**
 * Die Testphase dieses Kontos (BE-015, `trial_claims`), wie die DSGVO-Auskunft
 * sie zeigt: für welche Community, woher, wann.
 */
export interface TrialClaimExport {
  communityId: string
  communityName: string
  source: string
  claimedAt: string
}

export interface CommunityUserDataExport {
  /** `null` = für dieses Konto wurde keine Testphase vergeben. */
  trialClaim: TrialClaimExport | null
  memberships: CommunityMembershipExport[]
  invites: CommunityInviteExport[]
  inviteRequests: InviteRequestExport[]
  invitesSent: CommunityInviteTraceExport[]
  invitesAccepted: CommunityInviteTraceExport[]
  inviteCodes: InviteCodeExport[]
  abuseReports: AbuseReportExport[]
}

/** Was die DSGVO-Löschung an einem `invite_codes`-Eintrag ändert. */
export interface InviteCodePatch {
  boundEmail?: string
  label?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Die Adresse aus einem Code-Eintrag nehmen (SEC-026, Davids Entscheidung
 * „Die Kontolöschung leert auch die Adresse am Einladungscode").
 *
 * `assignCode` schreibt die Adresse an ZWEI Stellen: `boundEmail` und — bei
 * einem frisch angelegten Code — das Etikett „Anfrage <adresse>". Beides wird
 * leer bzw. ohne die Adresse; der Code SELBST bleibt, er ist ein Zähler im
 * Vorrat des Betreibers (ausgegeben, eingelöst, abgelaufen). „Anfrage" ohne
 * Adresse sagt weiter, woher der Code kam; ein Etikett, von dem nichts bleibt,
 * wird '' — die Liste zeigt dafür ihr „ohne Etikett".
 *
 * Verglichen wird ohne Rücksicht auf Groß-/Kleinschreibung: die Anfrage-Route
 * speichert kleingeschrieben, ein von Hand vergebenes Etikett kann anders
 * aussehen.
 *
 * IDEMPOTENT: nach dem Patch passt nichts mehr, der zweite Lauf gibt `null`.
 * Eine leere Adresse ergibt nie einen Treffer.
 */
export function inviteCodeErasure(
  row: { boundEmail?: string | null, label?: string | null },
  email: string,
): InviteCodePatch | null {
  const address = email.trim().toLowerCase()
  if (!address) return null

  const patch: InviteCodePatch = {}
  if ((row.boundEmail ?? '').trim().toLowerCase() === address) patch.boundEmail = ''

  const label = row.label ?? ''
  if (label.toLowerCase().includes(address)) {
    patch.label = label
      .replace(new RegExp(escapeRegExp(address), 'gi'), '')
      .replace(/[<>()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[\s:,;–-]+$/, '')
      .trim()
  }

  return Object.keys(patch).length > 0 ? patch : null
}

export interface InviteInput {
  email: string
  role: string
  members: readonly CommunityTeamMemberFacts[]
  /** E-Mails der Mitglieder MIT Zugang (gleiche Reihenfolge irrelevant). */
  activeEmails: readonly string[]
}

/** Darf unter dieser Adresse mit dieser Rolle eingeladen werden? */
export function decideInvite(input: InviteInput): CommunityTeamDecision {
  const { email, role, activeEmails } = input

  if (!(COMMUNITY_ROLES as readonly string[]).includes(role)) return deny('invalid_role')
  // Owner wird nie eingeladen — Besitz entsteht durch Gründung oder Übergabe.
  if (role === 'owner') return deny('owner_protected')

  const normalized = email.trim().toLowerCase()
  if (activeEmails.some(existing => existing.trim().toLowerCase() === normalized)) {
    return deny('already_member')
  }

  return ALLOW
}

/**
 * WAS MIT DIESER ENTSCHEIDUNG GESCHIEHT — die Regel gegen das
 * Mitgliedschafts-ORAKEL (AU1, Davids Entscheidung 2026-08-15).
 *
 * ── DAS LECK ───────────────────────────────────────────────────────────────
 * Seit F57 darf JEDES Mitglied einladen. `decideInvite` antwortet auf eine
 * bereits vorhandene Adresse mit `already_member` → 409, und ein 409 kostete
 * NICHTS: keine Mail, keinen Zähler, keine Zeile. Damit war die Route für
 * jeden `viewer` ein unbegrenzt oft benutzbarer Test „ist diese Adresse hier
 * Mitglied?" — für Adressen, deren Mitgliederliste er nicht lesen darf. Nur
 * die 5/min-Drossel bremste, und die verhindert kein geduldiges Durchprobieren.
 *
 * ── DIE ENTSCHEIDUNG: UNUNTERSCHEIDBAR ANTWORTEN ───────────────────────────
 * Wer die Mitgliederliste NICHT lesen darf, bekommt auf `already_member`
 * dieselbe Antwort wie auf eine echte Einladung — und ZAHLT DENSELBEN PREIS:
 * das Wochen-Kontingent wird verbraucht. Der Preis ist die eigentliche
 * Sicherung; eine bloss gleich AUSSEHENDE Antwort liesse sich beliebig oft
 * wiederholen, und das Orakel wäre nur langsamer, nicht zu.
 * Verschickt wird dabei NICHTS — ein Mitglied bekommt keine Einladung in eine
 * Community, in der es längst ist.
 *
 * WER DIE LISTE LESEN DARF, BEKOMMT DIE WAHRHEIT (`team.manage`): für
 * Owner/Admin bleibt es beim ehrlichen 409 mit `already_member`. Ihnen etwas
 * vorzumachen schützte niemanden — sie sehen dieselbe Person zwei Zeilen
 * weiter in ihrer eigenen Mitgliederliste — und kostete sie den Hinweis, den
 * sie brauchen („die Rolle änderst du direkt in der Liste").
 *
 * WARUM DIESE REGEL PUR IST: sie ist der einzige Ort, an dem „so tun als ob"
 * steht. Läge sie in der Route, wäre sie beim nächsten Umbau eine Zeile, die
 * man für eine Vereinfachung hält — und ihr Wegfall sähe in keinem Test rot
 * aus, weil die Route dann einfach wieder ehrlich antwortet.
 *
 * NUR `already_member` WIRD VERSCHWIEGEN. Die anderen Ablehnungen sagen nichts
 * über eine fremde Adresse aus (`invalid_role`, `owner_protected`) — sie
 * ununterscheidbar zu machen hiesse, einen Tippfehler in einen stillen
 * Fehlschlag zu verwandeln.
 *
 * WAS BEWUSST OFFEN BLEIBT: die LAUFZEIT. Der stille Weg verschickt keine Mail
 * und zieht keine Vorgänger-Einladung zurück, ist also messbar schneller. Das
 * wurde gesehen und nicht bekämpft: eine künstliche Verzögerung wäre eine
 * Zahl, die bei jedem SMTP-Wetter falsch ist, und die Reichweite des Kanals ist
 * ohnehin dieselbe wie die der Antwort — fünf Fragen je Woche, danach ist das
 * Kontingent leer. Das Kontingent ist die Grenze, nicht die Stoppuhr.
 */
export type CommunityInviteDelivery =
  /** Mail verschicken, Einladung anlegen — der gewöhnliche Weg. */
  | { outcome: 'send' }
  /**
   * Nichts verschicken, Kontingent trotzdem verbrauchen, wie Erfolg antworten.
   * Der Grund reist mit — fürs Log, nie für die Antwort.
   */
  | { outcome: 'suppress', reason: 'already_member' }
  /** Ablehnen; `reason` geht als `data.code` an den Einladenden. */
  | { outcome: 'reject', reason: CommunityTeamDenyReason }

export function decideInviteDelivery(
  decision: CommunityTeamDecision,
  /** Hält der Einladende `team.manage`? (nicht die Rolle — die Capability) */
  managesTeam: boolean,
): CommunityInviteDelivery {
  if (decision.ok) return { outcome: 'send' }
  if (decision.reason === 'already_member' && !managesTeam) {
    return { outcome: 'suppress', reason: 'already_member' }
  }
  return { outcome: 'reject', reason: decision.reason }
}

export interface JoinInput {
  /** Warum jemand beitreten möchte (core/shared/communityJoin.ts). */
  trigger: CommunityJoinTrigger
  /** `tenants.openRegistration` DIESER Community — der bestehende Schalter. */
  openRegistration: boolean
  /** Bestehende Mitgliedschaft (jeden Status) oder null. */
  existing: CommunityTeamMemberFacts | null
}

export interface JoinDecision {
  outcome: CommunityJoinOutcome
  /** Rolle, die danach gilt (bei 'closed'/'removed' null). */
  role: CommunityRole | null
}

/**
 * Darf diese Person JETZT Mitglied dieser Community werden? (A5, Davids
 * Entscheidung 1 vom 2026-07-29)
 *
 * Die Reihenfolge der drei Fragen ist die ganze Regel, und sie ist mit Absicht so:
 *
 *  1. **Gibt es schon eine Zeile?** Dann entscheidet SIE, nicht der Schalter.
 *     Eine aktive heißt „ist schon dabei" (idempotent — jeder Auslöser darf
 *     beliebig oft feuern). Eine entzogene heißt **draußen**, und zwar
 *     endgültig: das ist der Kern des ganzen Vorgangs. Ohne diesen Zweig würde
 *     der Auslöser genau das wieder aufheben, was „Zugang entziehen" gerade
 *     getan hat — die entfernte Person schreibt einen Kommentar und ist zurück.
 *     Zurück kommt man nur über eine neue EINLADUNG (accept.post.ts hebt den
 *     Status wieder auf 'active').
 *  2. **Bestand?** `legacy` überspringt den Schalter — und nur dieser Auslöser.
 *     Wer das Site-Label aus der A4-Zeit trägt, hat diese Community bisher als
 *     Mitglied benutzt; ihn jetzt auszusperren, weil seine Community inzwischen
 *     geschlossen ist, wäre ein Rückschritt für einen echten Nutzer, kein
 *     Sicherheitsgewinn. Die Zeile, die dabei entsteht, macht den Zustand zum
 *     ersten Mal sichtbar UND entziehbar.
 *  3. **Ist die Registrierung offen?** Sonst: kein Auto-Beitritt. Geschlossen
 *     heißt geschlossen — Mitglied wird man dort ausschließlich per Einladung.
 */
export function decideJoin(input: JoinInput): JoinDecision {
  const { trigger, openRegistration, existing } = input

  if (existing) {
    if (hasCommunityAccess(existing.status)) return { outcome: 'member', role: existing.role }
    return { outcome: 'removed', role: null }
  }

  if (trigger !== 'legacy' && !openRegistration) return { outcome: 'closed', role: null }

  return { outcome: 'joined', role: COMMUNITY_JOIN_ROLE }
}

// ── Anzeige-Verträge (Control Plane ⇄ Kunden-App ⇄ UI) ──────────────────────

/**
 * Ein Mitglied, wie die Verwaltungsseite es zeigt. `name` reichert die RUNTIME
 * an (nur sie kennt die Nutzer ihres Projekts) — das Control Plane liefert es
 * leer.
 */
export interface CommunityMemberView {
  id: string
  runtimeUserId: string
  email: string
  name: string
  /**
   * `prefs.avatarUrl` des Kontos; '' = keins hinterlegt (die UI zeigt dann
   * Initialen). Wie `name` eine Auskunft der RUNTIME — das Control Plane
   * kennt die Konten seines Kunden-Projekts nicht und liefert es leer.
   */
  avatarUrl: string
  role: CommunityRole
  status: CommunityMemberStatus
  /** Beitrittsdatum = Entstehung der Mitgliedschaft. */
  joinedAt: string
  /** Zeitpunkt des Zugangs-Entzugs; null = hat Zugang. */
  removedAt: string | null
  /** true = das bin ich (die UI sperrt Selbst-Aktionen sichtbar). */
  self: boolean
}

/** Eine offene Einladung, wie die Verwaltungsseite sie zeigt (nie mit Token). */
export interface CommunityInviteView {
  id: string
  email: string
  role: CommunityRole
  status: CommunityInviteStatus
  expiresAt: string
  createdAt: string
}

/**
 * So viele offene Einladungen listet die Team-Ansicht höchstens (die neuesten
 * zuerst). Gibt es mehr, sagt die Antwort das (`invitesTruncated`) und die
 * Seite zeigt einen Hinweis — vorher endete die Liste dort kommentarlos.
 */
export const COMMUNITY_INVITE_LIST_MAX = 100

export interface CommunityTeamResponse {
  members: CommunityMemberView[]
  invites: CommunityInviteView[]
  /** Es gibt mehr offene Einladungen als `COMMUNITY_INVITE_LIST_MAX`. */
  invitesTruncated?: boolean
  /** Rolle des Abfragenden — die UI leitet daraus ab, was sie anbietet. */
  actorRole: CommunityRole | null
}

/**
 * ── DIE ÖFFENTLICHE TEAM-SICHT (F1 Stufe 3, Davids Entscheidung 2026-08-04) ──
 *
 * „Wer ist hier ansprechbar?" ist eine Frage, die JEDER Besucher einer
 * Community stellen darf — die About-Seite der Discussions beantwortet sie.
 * Die bestehende Sicht (`CommunityMemberView`) kann das nicht liefern: sie
 * verlangt `team.manage` und trägt E-Mail-Adressen, Beitritts- und
 * Entzugs-Zeitpunkte ALLER Mitglieder.
 *
 * Diese Sicht ist deshalb nicht „dieselbe mit weniger Rechten", sondern eine
 * ANDERE mit weniger FELDERN. Was hier nicht steht, kann auch nicht
 * versehentlich mitgeliefert werden:
 *  - KEINE E-Mail (die einzige PII, die das Control Plane überhaupt hält),
 *  - kein `joinedAt`/`removedAt` (wann jemand kam oder ging, geht Dritte
 *    nichts an),
 *  - kein `self`, keine Einladungen, keine `actorRole` — dafür gibt es hier
 *    keinen handelnden Menschen.
 *
 * Der `runtimeUserId` BLEIBT: ohne ihn kann die Runtime weder Namen noch
 * Avatar auflösen (das Control Plane kennt beides nicht). Er ist eine
 * Appwrite-Row-Id, keine Kontaktinformation — dieselbe Id steht ohnehin an
 * jedem öffentlichen Beitrag als `authorId`.
 */
export interface PublicTeamMember {
  runtimeUserId: string
  role: CommunityRole
  /** Reicht die RUNTIME nach (nur sie kennt die Nutzer ihres Projekts). */
  name: string
  /** Ebenfalls von der Runtime (prefs.avatarUrl); '' = keiner hinterlegt. */
  avatarUrl: string
}

export interface PublicTeamResponse {
  members: PublicTeamMember[]
}

/**
 * ── DIE MITGLIEDER-SICHT FÜR DIE KARTE (Mitglieder-Karte Etappe 2, 2026-08-23)
 *
 * DRITTE Sicht auf dieselben Zeilen, und sie ist weder die
 * Verwaltungs- (`CommunityMemberView`) noch die öffentliche
 * (`PublicTeamMember`). Der Grund ist derselbe wie bei `publicTeamFrom`: eine
 * Sicht, die ein Feld gar nicht erst zusammenbaut, kann es auch nicht
 * versehentlich herausgeben.
 *
 * WER SIE LESEN DARF: jedes Mitglied (`members.invite` — die Capability, die
 * seit F57 jede der fünf Rollen trägt). Die Karte ist ausdrücklich für ALLE
 * gedacht; sie darf deshalb nicht an `team.manage` hängen.
 *
 * WAS DESHALB FEHLT — und zwar hart, nicht durch Weglassen an der Aufrufstelle:
 *  - **KEINE E-Mail.** Sie ist die einzige PII, die das Control Plane hält, und
 *    ein `viewer` hat auf sie keinen Anspruch. Das ist der eigentliche Grund
 *    für diese Route: `members/list` liefert sie, also darf `members/list`
 *    nicht einfach mit einer kleineren Capability aufgerufen werden.
 *  - **kein `removedAt`, kein `self`, keine Einladungen.** Die Karte zeigt, wer
 *    JETZT dabei ist; wer ging und wann, ist Verwaltungswissen.
 *
 * WAS BLEIBT: `runtimeUserId` (ohne ihn kann die Runtime weder Name noch Avatar
 * noch Standort auflösen), `role` und `joinedAt` — die zwei Community-FAKTEN,
 * die die Detailseite neben dem zeigt, was ein Mensch selbst veröffentlicht hat.
 *
 * NUR MITGLIEDER MIT ZUGANG: `hasCommunityAccess`, dieselbe Regel wie überall.
 * Ein Entfernter steht nicht mehr auf der Karte.
 */
export interface CommunityRosterMember {
  runtimeUserId: string
  role: CommunityRole
  /** Beitrittsdatum = Entstehung der Mitgliedschaft. */
  joinedAt: string
}

export interface CommunityRosterResponse {
  members: CommunityRosterMember[]
}

/**
 * PURE (unit-getestet): aus den Rohzeilen die Mitglieder-Sicht machen.
 *
 * Sie sitzt hier und nicht in der Route, weil sie — genau wie `publicTeamFrom`
 * — die eigentliche Sicherheitsaussage ist: „nur aktive, nur diese drei
 * Felder". Die REIHENFOLGE ist die des Beitritts (die Zeilen kommen schon
 * `orderAsc($createdAt)` aus `listCommunityMembers`); sie bleibt damit stabil,
 * ohne dass die Karte sortieren müsste.
 *
 * Zeilen OHNE `runtimeUserId` fallen heraus: sie sind der DSGVO-Rest eines
 * gelöschten Kontos (`decideMembershipErasure` lässt den letzten Owner als
 * Struktur stehen) — ein Punkt auf der Karte ohne auflösbaren Menschen wäre
 * ein Geist.
 */
export function communityRosterFrom(
  members: readonly { runtimeUserId: string, role: CommunityRole, status: CommunityMemberStatus, $createdAt: string }[],
): CommunityRosterMember[] {
  return members
    .filter(member => hasCommunityAccess(member.status) && member.runtimeUserId !== '')
    .map(member => ({
      runtimeUserId: member.runtimeUserId,
      role: member.role,
      joinedAt: member.$createdAt,
    }))
}

/**
 * WELCHE ROLLEN GELTEN ALS „ANSPRECHPARTNER" — und diese Liste ist der Kern
 * der ganzen Sicht.
 *
 * Owner, Admin und Moderator: also genau die, die eingreifen können, wenn
 * etwas schiefgeht. `editor` und `viewer` stehen NICHT darauf — ein Redakteur
 * ist kein Ansprechpartner, und ein Betrachter erst recht nicht. Sie hier
 * mitzuzählen hieße, die Mitgliederliste einer Community zu veröffentlichen,
 * und das ist eine völlig andere Zusage.
 */
const PUBLIC_TEAM_ROLES: readonly CommunityRole[] = ['owner', 'admin', 'moderator']

/**
 * PURE (unit-getestet): aus den Rohzeilen die öffentliche Team-Sicht machen.
 *
 * Sie sitzt hier und nicht in der Route, weil sie die eigentliche
 * Sicherheitsaussage ist — „nur diese Rollen, nur diese Felder, nur mit
 * Zugang". Eine Route kann man beim nächsten Mal um ein Feld erweitern, ohne
 * dass jemand hinsieht; eine getestete Regel nicht.
 *
 * `hasCommunityAccess` filtert Entfernte heraus: wer keinen Zugang mehr hat,
 * ist kein Ansprechpartner — und dass er einmal Moderator WAR, geht Besucher
 * nichts an.
 *
 * Die REIHENFOLGE ist die der Rollen-Liste, nicht die des Beitritts: die Seite
 * zeigt „Leitung" vor „Moderation", und eine stabile Ordnung erspart ihr das
 * Sortieren.
 */
export function publicTeamFrom(
  members: readonly { runtimeUserId: string, role: string, status: CommunityMemberStatus }[],
): PublicTeamMember[] {
  const eligible = members.filter(member =>
    hasCommunityAccess(member.status)
    && member.runtimeUserId !== ''
    && (PUBLIC_TEAM_ROLES as readonly string[]).includes(member.role))

  return PUBLIC_TEAM_ROLES.flatMap(role =>
    eligible
      .filter(member => member.role === role)
      .map(member => ({
        runtimeUserId: member.runtimeUserId,
        role,
        // Beide leer — sie gehören der Runtime. Das Control Plane hätte sie
        // nicht, und ein geratener Platzhalter wäre schlimmer als ein leeres Feld.
        name: '',
        avatarUrl: '',
      })))
}
