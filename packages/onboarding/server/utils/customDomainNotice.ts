import {
  customDomainNoticeRowId,
  customDomainNoticesDue,
  type CustomDomainGraceNotice,
} from '../../../control/shared/customDomainNotice'
import { buildCustomDomainNoticeMail, customDomainNoticeBellBody } from '../../shared/customDomainNoticeMail'

/**
 * DIE ZWEI HINWEISE ZUR FRIST DER EIGENEN DOMAIN (BE-014) — geschrieben HIER,
 * im Pool, aus demselben Grund wie die Zahlungswarnung (`pastDueNotice.ts`):
 * nur die Platform-App kennt das Konto des Owners (Adresse, Sprache) und hat
 * die Glocke. Das Control Plane stempelt `customDomainGraceEndsAt`, dieser
 * Lauf liest den Stempel über den registrierten Leser und meldet. Keine neue
 * Naht, kein neues Geheimnis, keine Tabelle.
 *
 * GENAU EINMAL je (Community, Frist, Art, Owner): die Glocken-Zeile entsteht
 * mit FESTER Id (`customDomainNoticeRowId`) — sie IST der Vermerk „dieser
 * Hinweis ist raus". Nur wenn `notify()` sie NEU anlegt (`created: true`),
 * geht die Mail; ein zweiter Lauf (stündlich, oder gleichzeitig in einem
 * zweiten Prozess) läuft in Appwrites 409 und verschickt nichts. Kein „erst
 * nachsehen, dann schreiben", kein aus dem Datum geratenes „schon gemeldet".
 *
 * DIE MAIL GEHT AN DER EINSTELLUNG VORBEI (`mail: 'skip'` an `notify()` und
 * ein eigener `sendMail`): es ist ein Hinweis zum VERTRAG — „deine Domain wird
 * abgeschaltet" —, keine Benachrichtigung über Geschehen in der Community.
 * Wer Benachrichtigungs-Mails abgeschaltet hat, muss trotzdem erfahren, dass
 * seine Adresse in 14 Tagen nicht mehr gilt. Ohne `mail: 'skip'` käme sie bei
 * `instant` doppelt.
 *
 * SCHEITERT DIE MAIL, steht der Hinweis trotzdem in der Glocke; die Zeile
 * `custom_domain.notice_mail_failed` macht es zählbar. Einen zweiten Versuch
 * gibt es bewusst nicht: die Zeile steht, und ein Wiederholen ohne Vermerk
 * hieße raten.
 */

export interface CustomDomainNoticeSweepResult {
  /** Communities mit laufender Frist in diesem Projekt. */
  checked: number
  /** Neu entstandene Hinweise (Glocken-Zeilen) in DIESEM Lauf. */
  notified: number
  /** Davon mit verschickter Mail. */
  mailed: number
  /** Communities ohne aktiven Owner. */
  withoutOwner: number
}

/** Die Seite der eigenen Domain im Dashboard der Community. */
export const CUSTOM_DOMAIN_NOTICE_LINK = '/dashboard/community/domain'

export type CustomDomainNoticeReader = (runtimeProjectId: string) => Promise<CustomDomainGraceNotice[]>

let reader: CustomDomainNoticeReader | null = null
/** Reentranz-Schutz (Single-Instanz-Annahme). Über Prozesse hinweg schützt
 *  die feste Zeilen-Id. */
let sweepRunning = false

/** Der LESER wird REGISTRIERT, nicht importiert: er braucht den read-only-Key
 *  auf das Control Plane, den nur die App kennt (wie beim Zahlungsverzug). */
export function registerCustomDomainNoticeReader(fn: CustomDomainNoticeReader): void {
  if (reader) console.warn('[onboarding] registerCustomDomainNoticeReader: bestehender Leser wird ersetzt — pro Deployment ist EINER vorgesehen')
  reader = fn
}

/** Nur für Tests. */
export function __resetCustomDomainNoticeReader(): void {
  reader = null
  sweepRunning = false
}

export async function runCustomDomainNoticeSweep(now: number = Date.now()): Promise<CustomDomainNoticeSweepResult> {
  const result: CustomDomainNoticeSweepResult = { checked: 0, notified: 0, mailed: 0, withoutOwner: 0 }
  const read = reader
  if (!read || sweepRunning) return result
  sweepRunning = true
  try {
    const config = useRuntimeConfig()
    const communities = await read(config.public.appwriteProjectId)
    result.checked = communities.length
    if (communities.length === 0) return result

    const { users } = createAdminClient()

    for (const community of communities) {
      const kinds = customDomainNoticesDue(community.graceEndsAt, now)
      if (kinds.length === 0) continue
      if (community.ownerUserIds.length === 0) {
        result.withoutOwner++
        logEvent('error', 'custom_domain.notice_without_owner', { communityId: community.communityId, host: community.host })
        continue
      }

      for (const ownerId of community.ownerUserIds) {
        const recipient = await users.get({ userId: ownerId }).catch(() => null)
        if (!recipient) {
          logEvent('error', 'custom_domain.notice_recipient_missing', { communityId: community.communityId, recipientId: ownerId })
          continue
        }
        const locale = resolveEmailPrefs(recipient.prefs as Record<string, unknown>).emailLocale

        for (const kind of kinds) {
          const { created } = await notify(undefined, {
            recipientId: ownerId,
            // KEIN neuer Typ: `billing` wie die Zahlungswarnung — die Glocke
            // zeigt dafür „Zahlungsproblem: {Titel}" und den gespeicherten Text.
            type: 'billing',
            title: community.name || community.host,
            body: customDomainNoticeBellBody({ kind, locale, domain: community.domain, graceEndsAt: community.graceEndsAt }),
            link: CUSTOM_DOMAIN_NOTICE_LINK,
            // In DIE Community (Davids Entscheidung „wer zahlt, entscheidet die
            // Glocke"); der Stempel ist `communities.tenantId`.
            scope: 'tenant',
            communityId: community.tenantId,
            rowId: customDomainNoticeRowId(community.communityId, community.graceEndsAt, kind, ownerId),
            mail: 'skip',
          })
          if (!created) continue
          result.notified++
          logEvent('info', 'custom_domain.notice_created', { communityId: community.communityId, kind, recipientId: ownerId })

          // Nur an ein Konto MIT Adresse — sonst bleibt es bei der Glocke.
          if (!recipient.email) continue
          const mail = buildCustomDomainNoticeMail({
            kind,
            locale,
            name: community.name,
            host: community.host,
            domain: community.domain,
            graceEndsAt: community.graceEndsAt,
          })
          const sent = await sendMail(undefined, { to: recipient.email, subject: mail.subject, text: mail.text }).catch(() => false)
          if (sent) result.mailed++
          else logEvent('error', 'custom_domain.notice_mail_failed', { communityId: community.communityId, kind })
        }
      }
    }
    return result
  }
  finally {
    sweepRunning = false
  }
}
