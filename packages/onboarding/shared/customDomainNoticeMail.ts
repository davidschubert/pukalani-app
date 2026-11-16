import { communityOrigin } from '../../core/shared/notificationLinks'
import { CUSTOM_DOMAIN_GRACE_DAYS } from '../../control/shared/customDomain'
import type { CustomDomainNoticeKind } from '../../control/shared/customDomainNotice'

/**
 * DIE ZWEI HINWEIS-MAILS ZUR FRIST DER EIGENEN DOMAIN (BE-014) — Textbau pur,
 * ohne `H3Event`, wie `communityReadyMail.ts`.
 *
 * Ein HINWEIS ZUM VERTRAG, keine Benachrichtigung: er geht an den Owner
 * unabhängig von dessen Mail-Einstellung (`customDomainNotice.ts`). Darum
 * einfache Worte und genau vier Dinge: um welche Domain es geht, an welchem
 * TAG sie abgeschaltet wird, dass nichts gelöscht wird (samt der
 * Pukalani-Adresse, unter der die Community erreichbar bleibt) und der Weg
 * zurück (die Plan-Seite).
 *
 * ALLE LINKS AUF DIE PUKALANI-ADRESSE, nie auf die eigene Domain: genau die
 * wird ja abgeschaltet. Der Host kommt aus `communities.host` (vom Leser), das
 * Schema aus `communityOrigin()` — dieselbe Regel wie in den
 * Benachrichtigungs-Mails.
 */

export interface CustomDomainNoticeMailInput {
  kind: CustomDomainNoticeKind
  /** 'de' | 'en' — alles außer 'de' ist Englisch (Rückfall von `resolveEmailPrefs`). */
  locale: string
  /** Anzeigename der Community ('' ⇒ der Host). */
  name: string
  /** Die PUKALANI-Adresse der Community (ohne Schema). */
  host: string
  /** Die eigene Domain. */
  domain: string
  /** Ende der Frist = Tag des Abschaltens (ISO). */
  graceEndsAt: string
}

export interface CustomDomainNoticeMailText {
  subject: string
  text: string
}

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * „30. November 2026" / "November 30, 2026" — in UTC und ohne
 * `toLocaleDateString` (das Ergebnis hinge sonst an den ICU-Daten der
 * Server-Maschine; dieselbe Begründung wie `formatMailDate`). Unlesbar ⇒ ''.
 */
export function formatNoticeDate(iso: string, german: boolean): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const day = parsed.getUTCDate()
  const month = parsed.getUTCMonth()
  const year = parsed.getUTCFullYear()
  return german ? `${day}. ${MONTHS_DE[month]} ${year}` : `${MONTHS_EN[month]} ${day}, ${year}`
}

/** Locale-Prefix von Hand (kein `localePath()` auf dem Server):
 *  'prefix_except_default' ⇒ `/de/…` für Deutsch, ohne Prefix für Englisch. */
function link(host: string, path: string, german: boolean): string {
  return `${communityOrigin(host)}${german ? '/de' : ''}${path}`
}

export function customDomainNoticePlanUrl(host: string, locale: string): string {
  return link(host, '/dashboard/community/plan', locale === 'de')
}

export function buildCustomDomainNoticeMail(input: CustomDomainNoticeMailInput): CustomDomainNoticeMailText {
  const german = input.locale === 'de'
  const name = input.name || input.host
  const date = formatNoticeDate(input.graceEndsAt, german)
  const address = communityOrigin(input.host)
  const plan = customDomainNoticePlanUrl(input.host, input.locale)

  if (input.kind === 'start') {
    const subject = german
      ? `Deine Domain ${input.domain} bleibt noch bis zum ${date} aktiv`
      : `Your domain ${input.domain} stays active until ${date}`
    const lines = german
      ? [
          'Hallo,',
          '',
          `der Pro-Plan von ${name} ist nicht mehr aktiv. Eine eigene Domain gehört zum Pro-Plan.`,
          '',
          `Deine Domain ${input.domain} bleibt noch ${CUSTOM_DOMAIN_GRACE_DAYS} Tage aktiv, bis zum ${date}. Danach schalten wir sie ab.`,
          '',
          `Es wird nichts gelöscht. Deine Community bleibt unter ihrer Pukalani-Adresse erreichbar: ${address}`,
          '',
          `So bleibt deine Domain aktiv: wähle wieder den Pro-Plan. ${plan}`,
        ]
      : [
          'Hello,',
          '',
          `The Pro plan of ${name} is no longer active. A custom domain is part of the Pro plan.`,
          '',
          `Your domain ${input.domain} stays active for ${CUSTOM_DOMAIN_GRACE_DAYS} more days, until ${date}. After that we switch it off.`,
          '',
          `Nothing is deleted. Your community stays reachable at its Pukalani address: ${address}`,
          '',
          `To keep your domain active, choose the Pro plan again: ${plan}`,
        ]
    return { subject, text: lines.join('\n') }
  }

  const subject = german
    ? `In drei Tagen schalten wir ${input.domain} ab`
    : `We will switch off ${input.domain} in three days`
  const lines = german
    ? [
        'Hallo,',
        '',
        `am ${date} schalten wir deine Domain ${input.domain} ab, weil der Pro-Plan von ${name} nicht mehr aktiv ist.`,
        '',
        `Es wird nichts gelöscht. Deine Community bleibt unter ihrer Pukalani-Adresse erreichbar: ${address}`,
        '',
        `So bleibt deine Domain aktiv: wähle wieder den Pro-Plan. ${plan}`,
        'Auch nach dem Abschalten kannst du sie mit dem Pro-Plan wieder einschalten.',
      ]
    : [
        'Hello,',
        '',
        `On ${date} we will switch off your domain ${input.domain}, because the Pro plan of ${name} is no longer active.`,
        '',
        `Nothing is deleted. Your community stays reachable at its Pukalani address: ${address}`,
        '',
        `To keep your domain active, choose the Pro plan again: ${plan}`,
        'Even after it is switched off, you can turn it back on with the Pro plan.',
      ]
  return { subject, text: lines.join('\n') }
}

/**
 * Der kurze Text in der Glocke — in der Sprache des EMPFÄNGERS, weil
 * Glocken-Texte gespeicherter Rohtext sind (wie `PAST_DUE_NOTICE_BODY`).
 */
export function customDomainNoticeBellBody(input: Omit<CustomDomainNoticeMailInput, 'name' | 'host'>): string {
  const german = input.locale === 'de'
  const date = formatNoticeDate(input.graceEndsAt, german)
  if (input.kind === 'start') {
    return german
      ? `Die Domain ${input.domain} bleibt noch bis zum ${date} aktiv, danach wird sie abgeschaltet. Mit dem Pro-Plan bleibt sie aktiv.`
      : `The domain ${input.domain} stays active until ${date}, then it will be switched off. With the Pro plan it stays active.`
  }
  return german
    ? `Am ${date} wird die Domain ${input.domain} abgeschaltet. Mit dem Pro-Plan bleibt sie aktiv.`
    : `On ${date} the domain ${input.domain} will be switched off. With the Pro plan it stays active.`
}
