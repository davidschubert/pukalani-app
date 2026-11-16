import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  TRIAL_FALLBACK_PLAN,
  TRIAL_PLAN,
  evaluateSiteQuota,
  resolveVibe,
  serializeSiteProfile,
  trialEndsAt,
  type SiteProfile,
} from '../../shared/onboarding'
import { slugToHost } from '../../schemas/tenant'
import { COMMUNITIES_TABLE, normalizeTenantPlan, type TenantRow } from '../../shared/types/tenantRecord'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import type { InviteCodeRow } from '../../shared/types/inviteCode'
import type { RuntimeIdentity } from './onboardingService'
import { claimTrial, releaseTrialClaim } from './trialClaims'
import { TRIAL_USED_SUSPENSION_REASON } from './trialSweep'

/**
 * Die eigentliche Anlage einer Self-Service-Community (SAAS-ROADMAP #1).
 *
 * Reihenfolge und Fehlerverhalten sind hier der Kern, nicht die Schreibbefehle:
 *
 *  - **Idempotenz über den Hostnamen.** Ein Retry mit derselben Nutzlast
 *    findet die Community wieder und gibt sie zurück, statt eine zweite
 *    anzulegen. Es braucht deshalb keinen Idempotency-Key und keinen
 *    zusätzlichen Zustand: der Host IST der natürliche Schlüssel (Unique-Index
 *    uq_host). Gehört der Host jemand ANDEREM, ist es ein 409 — nie eine
 *    stille Übernahme.
 *  - **Kompensation statt halber Community.** Legt der Tenant an, scheitert
 *    aber die Owner-Mitgliedschaft, wird der Tenant wieder gelöscht. Sonst
 *    stünde eine Community da, die niemandem gehört und die niemand
 *    aufräumen kann — genau die „verwaiste Row", die die Roadmap-DoD verbietet.
 *  - **Reihenfolge:** Testphase → Tenant → Mitgliedschaft. Bis A6 Schritt 5
 *    stand davor noch ein Abrechnungs-Workspace; die Community IST jetzt das
 *    zahlende Objekt (Davids Entscheidung 2026-07-30), es gibt nichts mehr
 *    davor.
 *  - **Testphase einmal je Konto (BE-015).** Vor dem Anlegen wird sie über
 *    `claimTrial` vergeben (feste Zeile je Konto, 409 = gab es schon). Ohne
 *    Testphase entsteht die Community trotzdem — auf `basic`, nur-lesend
 *    (`billing`-Sperre), bis ein Abo sie öffnet. Scheitert die Anlage danach,
 *    geht die Vergabe zurück (`releaseTrialClaim`).
 */

export interface ProvisionInput {
  name: string
  slug: string
  vibe: string
  profile: SiteProfile
  inviteCode: InviteCodeRow | null
}

export interface ProvisionResult {
  communityId: string
  host: string
  url: string
  /** Der echte Plan der Zeile (`pro` mit Testphase, sonst `basic`). */
  plan: string
  trialEndsAt: string | null
  /** true = diese Community hat eine Testphase (BE-015). Bei `reused` aus der
   *  Zeile abgeleitet (`trialEndsAt` gesetzt). */
  trial: boolean
  /** Zeilen-Scope im Pool — die Runtime braucht ihn, um die erste Seite der
   *  Community anzulegen (sie läuft dabei OHNE Mandanten-Kontext). */
  tenantId: string
  /** true = derselbe Aufruf lief schon einmal durch (Retry/Doppelklick). */
  reused: boolean
}

function siteUrl(host: string): string {
  return `https://${host}`
}

async function findTenantByHost(event: H3Event, host: string): Promise<TenantRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  return rows[0] ?? null
}

/** Alle Communities, die diesem Runtime-User als Owner gehören. */
async function ownedSites(event: H3Event, identity: RuntimeIdentity): Promise<TenantRow[]> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const memberships: CommunityMemberRow[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await admin.tablesDB.listRows<CommunityMemberRow>({
      databaseId,
      tableId: COMMUNITY_MEMBERS_TABLE,
      queries: [
        Query.equal('runtimeProjectId', identity.projectId),
        Query.equal('runtimeUserId', identity.userId),
        Query.equal('role', 'owner'),
        Query.limit(100),
        Query.offset(offset),
      ],
    })
    memberships.push(...page.rows)
    if (page.rows.length < 100) break
  }
  if (!memberships.length) return []

  // Die Tenants zu den Mitgliedschaften lesen. Query.equal mit Id-Liste statt
  // N Einzel-Reads; fehlende Ids (gelöschte Site, verwaiste Mitgliedschaft)
  // fallen einfach weg und blockieren das Kontingent damit nicht.
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.equal('$id', memberships.map(row => row.communityId)), Query.limit(100)],
  })
  return rows
}

async function isOwner(event: H3Event, communityId: string, identity: RuntimeIdentity): Promise<boolean> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('communityId', communityId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(1),
    ],
  })
  return rows[0]?.role === 'owner'
}

export async function provisionCommunity(
  event: H3Event,
  identity: RuntimeIdentity,
  input: ProvisionInput,
  now: number = Date.now(),
): Promise<ProvisionResult> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const host = slugToHost(input.slug)

  // ── Idempotenz / Host-Kollision ───────────────────────────────────────────
  const existing = await findTenantByHost(event, host)
  if (existing) {
    if (await isOwner(event, existing.$id, identity)) {
      return {
        communityId: existing.$id,
        host: existing.host,
        url: siteUrl(existing.host),
        plan: normalizeTenantPlan(existing.plan),
        trialEndsAt: existing.trialEndsAt,
        trial: Boolean(existing.trialEndsAt),
        tenantId: existing.tenantId,
        reused: true,
      }
    }
    throw createError({ status: 409, statusText: 'This address is already taken' })
  }

  // ── Konto-Kontingent (die eigentliche Missbrauchs-Bremse) ─────────────────
  const mine = await ownedSites(event, identity)
  const quota = evaluateSiteQuota(mine.map(row => ({ status: row.status, trialEndsAt: row.trialEndsAt })), now)
  if (!quota.allowed) {
    throw createError({
      status: 403,
      statusText: quota.reason === 'trial_single_site'
        ? 'One community per account during the trial'
        : 'Community limit reached',
    })
  }

  const vibe = resolveVibe(input.vibe)
  // Dasselbe Projekt, gegen das die Identität geprüft wurde — der Tenant muss
  // im Projekt des Nutzers entstehen, sonst gehört ihm seine Site nicht.
  const projectId = identity.projectId

  // ── Testphase: einmal je Konto (BE-015) ─────────────────────────────────
  // Die Community-Id entsteht VORHER, damit die Vergabe sie nennen kann.
  // Ein `reused` oben vergibt nie.
  const communityRowId = ID.unique()
  const claim = await claimTrial(event, identity, communityRowId, now)
    .catch((error) => { throw toH3Error(error, 'Could not create community') })
  if (claim === 'unavailable') {
    // Migration control-039 steht aus: wie bisher vergeben, aber laut.
    logEvent('error', 'onboarding.trial_claims_missing', {
      communityId: communityRowId,
      runtimeUserId: identity.userId,
    })
  }
  const withTrial = claim !== 'used'
  const releaseClaim = async () => {
    if (claim === 'granted') await releaseTrialClaim(event, identity, communityRowId)
  }

  const tenantId = `t-${ID.unique()}`
  const tenant = await admin.tablesDB.createRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: communityRowId,
    data: {
      name: input.name,
      host,
      mode: 'pool',
      projectId,
      tenantId,
      status: 'active',
      wave: 'stable',
      // Testphase: Pro-QUOTA für 14 Tage. Die Pro-PRODUKTE (Feed, Events)
      // sind Early Access und damit ohnehin nicht Teil des Versprechens —
      // was hier gestaffelt wird, sind die Mengen-Limits.
      // OHNE Testphase (das Konto hatte seine schon, BE-015): `basic` als
      // Quota-Anker, kein Datum — nur-lesend über die Sperre unten.
      plan: withTrial ? TRIAL_PLAN : TRIAL_FALLBACK_PLAN,
      trialEndsAt: withTrial ? trialEndsAt(now) : null,
      theme: vibe.theme,
      variant: vibe.variant,
      // Neutral-Palette (control-020, Rest von B5): der Wizard fragt sie NICHT
      // ab — die 6 Vibes sind Farbwelten, kein Grundton-Katalog. '' heißt
      // „keine eigene Wahl", die Owner-Rolle kann sie später unter
      // /dashboard/community setzen.
      neutral: '',
      // Heimat-Zeitzone (control-038) — leer heisst „keine eigene Wahl", der
      // Owner setzt sie unter /dashboard/community. Bewusst nicht geraten:
      // eine falsche Zone verschiebt jeden Termin, eine leere nur die Vorgabe.
      timezone: '',
      // ÖFFENTLICH als Default (C18, Davids Entscheidung vom 2026-07-30) — die
      // bewusste KEHRTWENDE zur G0-Entscheidung 7 („privat als Default",
      // 2026-07-24). Begründung: eine frische Community, die niemand finden
      // kann, wächst nicht; „nur für Mitglieder" ist die Ausnahme, die man
      // trifft, wenn man sie braucht, und sie steht als Schalter unter
      // /dashboard/community. Der Schalter zieht den BESTAND mit um
      // (audienceRepermission.ts) — zumachen ist also jederzeit vollständig
      // möglich, aufmachen ebenso.
      //
      // BESTAND BLEIBT UNANGETASTET: Communities, die vor diesem Deploy
      // entstanden sind, tragen 'members' in der Zeile und behalten es —
      // resolveTenantAudience() liest fail-closed, es gibt keinen Backfill.
      audience: 'public',
      profile: serializeSiteProfile(input.profile),
      inviteCodeId: input.inviteCode?.$id ?? '',
      // Mitglieder-Registrierung offen (control-018, S1/Entscheidung 4): eine
      // frische Community soll wachsen können. Der Einladungs-Code, mit dem sie
      // entstand, gilt fürs GRÜNDEN — nicht fürs Beitreten. Umschalten kann die
      // Owner-Rolle jederzeit unter /dashboard/community.
      openRegistration: true,
      // Einladungen durch Mitglieder an (control-037, F57 Mechanik 2): eine
      // frische Community wächst über die Menschen, die schon da sind — genau
      // dafür ist die Mechanik gebaut. Abschalten kann der Owner jederzeit
      // unter /dashboard/community, neben der Registrierung.
      memberInvitesEnabled: true,
      // A6 (control-028): frisch angelegt = nie ein Abo — der Community-
      // Checkout (Geldfluss 1) füllt die Felder beim ersten Kauf.
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      billingStatus: '',
      // M13 (control-034): eine frisch gegründete Community ist nicht gesperrt.
      // Explizit, damit eine neue Spalte hier eine Entscheidung erzwingt statt
      // stillschweigend auf null zu bleiben.
      // Ohne Testphase (BE-015) beginnt sie NUR-LESEND: dieselbe `billing`-
      // Sperre wie nach dem Ende einer Testphase (trialSweep.ts). Der Kauf
      // hebt sie im Webhook auf (`handleCommunitySubscriptionUpdate`).
      suspension: withTrial ? '' : 'billing',
      suspensionReason: withTrial ? '' : TRIAL_USED_SUSPENSION_REASON,
      suspendedAt: withTrial ? null : new Date(now).toISOString(),
      pastDueSince: null,
      // control-035: eigene Domain. Eine frisch gegründete Community hat
      // keine — sie beginnt auf ihrer Subdomain, und die bleibt auch später
      // der Rückfall (Davids Entscheidung 2). Eingetragen wird sie ab Plan Pro
      // unter /dashboard/community/domain.
      customDomain: '',
      customDomainStatus: 'none',
      customDomainToken: '',
      customDomainError: '',
      customDomainVerifiedAt: null,
      customDomainActivatedAt: null,
    },
  }).catch(async (error) => {
    await releaseClaim()
    throw toH3Error(error, 'Could not create community')
  })

  // ── Owner-Mitgliedschaft — mit Kompensation ───────────────────────────────
  try {
    await admin.tablesDB.createRow<CommunityMemberRow>({
      databaseId,
      tableId: COMMUNITY_MEMBERS_TABLE,
      rowId: ID.unique(),
      data: {
        communityId: tenant.$id,
        runtimeProjectId: identity.projectId,
        runtimeUserId: identity.userId,
        role: 'owner',
        status: 'active',
        email: identity.email,
      },
    })
  }
  catch (error) {
    // Ohne Owner ist die Community unerreichbar UND unlöschbar für den Kunden
    // → zurückrollen, damit der Retry sauber neu anlegen kann.
    await admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITIES_TABLE, rowId: tenant.$id })
      .catch(cleanup => logEvent('error', 'onboarding.rollback_failed', {
        communityId: tenant.$id,
        host,
        message: cleanup instanceof Error ? cleanup.message : String(cleanup),
      }))
    await releaseClaim()
    throw toH3Error(error, 'Could not create community')
  }

  logEvent('info', 'onboarding.site_created', {
    communityId: tenant.$id,
    host,
    runtimeUserId: identity.userId,
    inviteCodeId: input.inviteCode?.$id ?? '',
    emailVerified: identity.emailVerified,
    trial: withTrial,
  })

  return {
    communityId: tenant.$id,
    host,
    url: siteUrl(host),
    plan: normalizeTenantPlan(tenant.plan),
    trialEndsAt: tenant.trialEndsAt,
    trial: withTrial,
    tenantId,
    reused: false,
  }
}
