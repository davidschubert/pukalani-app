import { Query } from 'node-appwrite'
import { z } from 'zod'
import { notificationLinkUrl } from '../../../../core/shared/notificationLinks'
import type { PublicTeamResponse } from '../../../../control/shared/communityTeam'
import {
  REMOVED_CONTACT_LIMIT_CODE,
  REMOVED_CONTACT_MAX_LENGTH,
  REMOVED_CONTACT_MIN_LENGTH,
  REMOVED_CONTACT_WINDOW_MS,
  buildRemovedContactMail,
  headerSafe,
  removedContactExcerpt,
  removedContactRecipients,
  removedContactWeekBucket,
  removedContactWeekRemainingMs,
  sanitizeRemovedContactMessage,
} from '../../../shared/removedContact'
import { callControlPlane } from '../../utils/controlPlane'
import { removedContactRowId } from '../../utils/removedContact'

/**
 * EINE NACHRICHT AN DIE LEITUNG — NUR FÜR ENTFERNTE (SEC-030 Teil 2, seit
 * 2026-11-13 — Davids Wahl vom selben Tag).
 *
 * Wer aus einer Community entfernt wurde, erreicht dort nichts mehr außer der
 * Hinweisseite und dieser Route (eingetragen in
 * `pukalani.community.removedAllowedApi`, app/app.config.ts dieses Layers).
 * Die Nachricht geht an Inhaber und Admins: je Person EINE Glocke und EINE
 * Mail mit `Reply-To` auf die Absenderin. Die Absenderin erfährt dabei NICHTS
 * über die Empfänger — weder Anzahl noch Namen noch Adressen, auch nicht, ob
 * es überhaupt welche gab: die Antwort ist immer `{ ok: true }`.
 *
 * ── WER DARF ──────────────────────────────────────────────────────────────
 * 401 ohne Konto. Sonst NUR, wer auf DIESEM Pool-Host als entfernt erkannt ist
 * (`event.context.communityRemoved`, gesetzt von der Core-Middleware
 * 06.community-removed.ts) — für alle anderen 404: das ist kein allgemeines
 * Kontaktformular.
 *
 * ── ZWEI BREMSEN ──────────────────────────────────────────────────────────
 *  1. Je Adresse 5 je Stunde (`WRITE_LIMITED` in core/server/middleware/
 *     05.rate-limit.ts) — gegen Hämmern.
 *  2. FACHLICH eine Nachricht je 7 Tage je (Community, Konto): gezählt VOR
 *     dem Versand mit `store.hit` (atomar; in Produktion in Redis, übersteht
 *     Neustarts). Zwei gleichzeitige Anfragen sehen so verschiedene Zähler —
 *     genau eine kommt durch. „Erst nachsehen, dann zählen" hielte nur für
 *     Anfragen NACHEINANDER.
 *  Dahinter die dauerhafte zweite Sicherung: die Glocken-Zeile trägt einen
 *  Idempotenz-Schlüssel aus (Community, Absenderin, Kalenderwoche,
 *  Empfänger) — auch ohne Zähler (Neustart ohne Redis) entsteht je Woche
 *  höchstens eine Zeile je Empfänger, und ohne neue Zeile geht keine Mail.
 *
 * ── ZURÜCKBUCHEN ──────────────────────────────────────────────────────────
 * Nur, wenn NICHTS angekommen ist und das sauber feststeht: das Team ist nicht
 * lesbar (503), oder KEINE Glocken-Zeile ließ sich schreiben (503). Ist
 * mindestens eine Zeile entstanden, bleibt der Zähler: die Nachricht ist bei
 * der Leitung, eine fehlgeschlagene Mail daneben kostet nur den zweiten Kanal,
 * und eine zweite Nachricht wäre für die, die sie schon haben, eine Dublette.
 *
 * ── MAIL ──────────────────────────────────────────────────────────────────
 * GENAU EINE je Empfänger, unabhängig von dessen Benachrichtigungs-Einstellung
 * (Verwaltungs-Post an die Leitung), deshalb `notify({ mail: 'skip' })` und
 * der Digest lässt den Typ aus. Nur an BESTÄTIGTE Adressen — dieselbe
 * Spam-Regel wie der Benachrichtigungs-Zweig. In der Sprache des Empfängers,
 * reiner Text, Links in der Nachricht entschärft, Kopfzeilen-Werte ohne
 * Zeilenumbruch. Link zur Mitgliederverwaltung auf dem Host der Community
 * (D5). Kein Mailer ⇒ nur die Glocke, Antwort trotzdem 200.
 */
const bodySchema = z.object({
  message: z.string().max(REMOVED_CONTACT_MAX_LENGTH * 4),
}).strict()

interface RecipientAccount {
  $id: string
  email: string
  emailVerification: boolean
  prefs: Record<string, unknown>
}

function contactLimitReached(event: Parameters<typeof setHeader>[0], resetInMs: number): never {
  setHeader(event, 'Retry-After', Math.max(1, Math.ceil(resetInMs / 1000)))
  throw createError({ status: 429, statusText: 'Too Many Requests', data: { code: REMOVED_CONTACT_LIMIT_CODE } })
}

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const user = event.context.user
  if (!user?.$id) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool' || !tenant.communityId || event.context.communityRemoved !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const message = sanitizeRemovedContactMessage(body.message)
  if (message.length < REMOVED_CONTACT_MIN_LENGTH || message.length > REMOVED_CONTACT_MAX_LENGTH) {
    throw createError({ status: 400, statusText: 'Bad Request', data: { code: 'invalid_message' } })
  }

  const communityId = tenant.communityId
  const senderId = user.$id
  const { store, prefix } = useRateLimitStore(event)
  const limitKey = `${prefix}removed-contact:${communityId}:${senderId}`
  const limit = await store.hit(limitKey, REMOVED_CONTACT_WINDOW_MS)
  if (limit.count > 1) contactLimitReached(event, limit.resetInMs)

  let team: PublicTeamResponse
  try {
    team = await callControlPlane<PublicTeamResponse>(event, '/api/control/community/team', {
      communityId,
      runtimeProjectId: tenant.projectId,
    })
  }
  catch {
    await store.refund(limitKey, REMOVED_CONTACT_WINDOW_MS)
    throw createError({ status: 503, statusText: 'Service Unavailable' })
  }

  const recipientIds = removedContactRecipients(team.members, senderId)

  // Konten der Empfänger (Adresse, Bestätigung, Sprache) — fail-soft: ohne sie
  // gibt es nur die Glocke, die braucht nur die Id.
  const accounts = new Map<string, RecipientAccount>()
  if (recipientIds.length > 0) {
    try {
      const res = await createAdminClient(event).users.list({
        queries: [Query.equal('$id', recipientIds), Query.limit(recipientIds.length)],
      })
      for (const account of res.users) {
        accounts.set(account.$id, {
          $id: account.$id,
          email: account.email,
          emailVerification: account.emailVerification,
          prefs: (account.prefs ?? {}) as Record<string, unknown>,
        })
      }
    }
    catch { /* nur Glocke */ }
  }

  const senderName = headerSafe(user.name ?? '') || headerSafe(user.email ?? '')
  const senderEmail = headerSafe(user.email ?? '')
  const week = removedContactWeekBucket(Date.now())
  const mailer = recipientIds.length > 0 && await mailerConfigured(event)
  const membersLink = '/dashboard/members'
  const membersUrl = mailer
    ? notificationLinkUrl(
        { appBase: getRequestURL(event).origin, hosts: await resolveCommunityHosts([tenant.tenantId]) },
        { link: membersLink, communityId: tenant.tenantId },
      )
    : ''

  let delivered = 0
  let duplicates = 0
  let mails = 0
  let mailFailures = 0
  for (const recipientId of recipientIds) {
    const bell = await notify(event, {
      recipientId,
      type: 'member.appeal',
      title: senderName,
      body: removedContactExcerpt(message),
      link: membersLink,
      scope: 'tenant',
      senderId,
      rowId: removedContactRowId(communityId, senderId, week, recipientId),
      mail: 'skip',
    })
    if (!bell.created) {
      if (bell.duplicate) duplicates++
      continue
    }
    delivered++

    const account = accounts.get(recipientId)
    if (!mailer || !account?.email || !account.emailVerification) continue
    const mail = buildRemovedContactMail({
      locale: account.prefs.emailLocale === 'de' ? 'de' : 'en',
      communityName: tenant.name ?? '',
      senderName,
      senderEmail,
      message,
      membersUrl,
    })
    try {
      await sendMail(event, { ...mail, to: account.email, ...(senderEmail ? { replyTo: senderEmail } : {}) })
      mails++
    }
    catch {
      mailFailures++
    }
  }

  // Ohne einen Zeilen-Treffer: entweder steht die Nachricht dieser Woche schon
  // da (der Zähler ging verloren, die Zeilen nicht) — dann ist die Grenze
  // erreicht —, oder es ließ sich gar nichts schreiben — dann zählt der
  // Versuch nicht.
  if (recipientIds.length > 0 && delivered === 0) {
    if (duplicates > 0) contactLimitReached(event, removedContactWeekRemainingMs(Date.now()))
    await store.refund(limitKey, REMOVED_CONTACT_WINDOW_MS)
    throw createError({ status: 503, statusText: 'Service Unavailable' })
  }

  // Ohne Nachrichtentext — der gehört der Leitung, nicht dem Log.
  logEvent('info', 'community.removed_contact', {
    communityId,
    senderId,
    recipients: recipientIds.length,
    delivered,
    mails,
    mailFailures,
  })

  return { ok: true }
})
