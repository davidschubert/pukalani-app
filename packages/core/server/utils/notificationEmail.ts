import type { H3Event } from 'h3'
import { type NotificationLinkContext, notificationLinkUrl } from '../../shared/notificationLinks'
import { formatNotificationWhen, notificationWhenMailZone, parseNotificationWhen } from '../../shared/notificationWhen'
import { normalizeTimezonePref } from '../../shared/timezone'
import { resolveCommunityHosts } from './communityHost'
import { resolveSiteLinkBase } from './siteOrigin'
import type { NotifyInput } from './notify'

/**
 * E-Mail-Zweig der Notifications (OPEN-ITEMS Idee 1): Bell-Notifications
 * zusätzlich per Mail — sofort ('instant') oder gesammelt ('digest', Sweep in
 * server/plugins/email-digest.ts). Opt-in über prefs.emailNotifications
 * (Default 'off', Settings → Benachrichtigungen); die Mail-Sprache ist die
 * UI-Sprache beim Speichern der Präferenz (prefs.emailLocale, Fallback en).
 *
 * title/body der Notifications sind ROHE Inhalte (Absendername + Snippet);
 * das Typ-Label liefert das Wörterbuch hier — Server-Pendant zur Bell.
 */

export type EmailNotificationMode = 'off' | 'instant' | 'digest'
export type EmailLocale = 'de' | 'en'

export interface NotificationEmailPrefs {
  emailNotifications?: EmailNotificationMode
  emailLocale?: EmailLocale
  emailDigestLastAt?: string
}

const COPY: Record<EmailLocale, {
  types: Record<string, string>
  /**
   * Typen, deren Überschrift ein ganzer Satz ist statt „{Titel} {Label}"
   * (BE-018): „Sommerfest Erinnerung" las sich wie ein Stichwortzettel.
   */
  headings: Record<string, (title: string) => string>
  /** Sprach-Tag für Zeitpunkte (`notificationWhen.ts`). */
  language: string
  fallbackType: string
  openLink: string
  digestSubject: (count: number) => string
  digestIntro: (count: number) => string
  footer: string
}> = {
  de: {
    // 'badge.awarded': der Titel IST der Abzeichen-Name (als Schlüssel
    // gespeichert, oben übersetzt) — das Label sagt nur, worum es geht.
    // 'reply.guest': der Titel ist ein frei gewählter Gast-Name — das
    // Kennzeichen steht deshalb im Label, direkt hinter dem Namen (SEC-035).
    types: { reply: 'hat auf deinen Kommentar geantwortet', 'reply.guest': '(Gast) hat auf deinen Kommentar geantwortet', mention: 'hat dich erwähnt', 'post.mention': 'hat dich in einem Beitrag erwähnt', ticket: '— Ticket-Update', billing: '— Zahlungsproblem', 'badge.awarded': '— Abzeichen erhalten', 'run.succeeded': '— Lauf fertig', 'run.needs_input': '— Lauf braucht deine Antwort', 'run.failed': '— Lauf fehlgeschlagen' },
    headings: { reminder: title => `Erinnerung: ${title} beginnt bald` },
    language: 'de-DE',
    fallbackType: 'Neue Benachrichtigung',
    openLink: 'Ansehen',
    digestSubject: count => `${count} neue Benachrichtigung${count === 1 ? '' : 'en'}`,
    digestIntro: count => `Du hast ${count} ungelesene Benachrichtigung${count === 1 ? '' : 'en'}:`,
    footer: 'Du erhältst diese Mail, weil E-Mail-Benachrichtigungen in deinen Einstellungen aktiv sind. Abstellen: Dashboard → Einstellungen → Benachrichtigungen.',
  },
  en: {
    types: { reply: 'replied to your comment', 'reply.guest': '(guest) replied to your comment', mention: 'mentioned you', 'post.mention': 'mentioned you in a post', ticket: '— ticket update', billing: '— payment issue', 'badge.awarded': '— badge earned', 'run.succeeded': '— run finished', 'run.needs_input': '— run needs your reply', 'run.failed': '— run failed' },
    headings: { reminder: title => `Reminder: ${title} starts soon` },
    language: 'en-US',
    fallbackType: 'New notification',
    openLink: 'View',
    digestSubject: count => `${count} new notification${count === 1 ? '' : 's'}`,
    digestIntro: count => `You have ${count} unread notification${count === 1 ? '' : 's'}:`,
    footer: 'You receive this email because email notifications are enabled in your settings. Turn off: Dashboard → Settings → Notifications.',
  },
}

export function resolveEmailPrefs(prefs: Record<string, unknown> | undefined | null): Required<Pick<NotificationEmailPrefs, 'emailNotifications' | 'emailLocale'>> & { emailDigestLastAt: string } {
  const mode = prefs?.emailNotifications
  const locale = prefs?.emailLocale
  return {
    emailNotifications: mode === 'instant' || mode === 'digest' ? mode : 'off',
    emailLocale: locale === 'de' ? 'de' : 'en',
    emailDigestLastAt: typeof prefs?.emailDigestLastAt === 'string' ? prefs.emailDigestLastAt : '',
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

/**
 * Die Link-Basis dieser App — der Fallback, wenn eine Meldung keiner Community
 * gehört oder ihr Host nicht auflösbar ist. Seit 2026-11-16 die aktive eigene
 * Domain der Site, sonst `NUXT_PUBLIC_APP_URL` (`siteOrigin.ts`). Im Pool gibt
 * es keinen Site-Resolver, dort bleibt es `appUrl`, und die Community-Hosts
 * haben je Eintrag ohnehin Vorrang.
 *
 * Bis D5 (2026-08-01) war das die EINZIGE Basis, und darin lag der Fehler: eine
 * Meldung aus Community A verlinkte auf den App-Host. Wohin ein Eintrag
 * WIRKLICH zeigt, entscheidet jetzt die pure Regel in
 * shared/notificationLinks.ts — pro EINTRAG, nicht pro Mail (eine Digest-Mail
 * mischt Communities).
 */
async function appLinkBase(event: H3Event | undefined): Promise<string> {
  return await resolveSiteLinkBase(event)
}

export interface NotificationEmailItem {
  type: string
  title: string
  body: string
  link: string
  /**
   * Ablage-Wert der Zeile (`notifications.communityId`): `<communityId>` ·
   * `_account` · `''`. Optional, weil Bestands-Aufrufer ihn nicht kennen —
   * fehlt er, verhält sich der Link wie vor D5 (App-Basis).
   */
  communityId?: string
}

/** Was die Mail über den EMPFÄNGER wissen muss, außer der Sprache. */
export interface NotificationEmailOptions {
  /**
   * Seine gewählte Zeitzone (`prefs.timezone`, `''` = automatisch). Nur für
   * Zeitpunkte im Text (BE-018); fehlt sie, gilt die Zone des Termins, sonst UTC.
   */
  timezone?: string
}

function itemLines(locale: EmailLocale, item: NotificationEmailItem, links: NotificationLinkContext, options: NotificationEmailOptions) {
  const copy = COPY[locale]
  const label = copy.types[item.type]
  const sentence = copy.headings[item.type]
  /**
   * ÜBERSETZBARE TEXTE (F1 Teilpaket 2): steht in `title`/`body` ein
   * i18n-Schlüssel (Abzeichen-Name, Bedingungstext), macht die Registry daraus
   * den Satz in der Mail-Sprache des EMPFÄNGERS. Rohe Inhalte — Absendername,
   * Kommentar-Zitat — erkennt keine Auflösung und sie bleiben unverändert;
   * deshalb darf der Aufruf hier ohne Fallunterscheidung stehen. Er gilt auch
   * für die Digest-Mail, die ihre Einträge aus GESPEICHERTEN Zeilen baut — die
   * einzige Stelle, an der ein fertiger Text nicht mehr zu retten wäre.
   */
  const title = resolveNotificationText(item.title, locale)
  /**
   * ZEITPUNKT (BE-018): ein `@when:`-Token wird hier erst zur Uhrzeit — in der
   * Sprache des Empfängers und in SEINER Zone, sonst der des Termins, sonst
   * UTC; immer mit Kürzel. Eine Uhrzeit ist kein Zitat: sie steht ohne
   * Anführungszeichen. Alte Zeilen mit fertigem Text erkennt der Parser nicht,
   * sie laufen wie bisher als Zitat. NUR FÜR ERINNERUNGEN (KK1): der Auszug
   * eines Kommentars, der wörtlich wie ein Token aussieht, bleibt ein Zitat.
   */
  const when = item.type === 'reminder' ? parseNotificationWhen(item.body) : null
  const body = when
    ? formatNotificationWhen(when, { language: copy.language, zone: notificationWhenMailZone(options.timezone, when.zone) })
    : resolveNotificationText(item.body, locale)
  const heading = sentence ? sentence(title) : label ? `${title} ${label}` : `${copy.fallbackType}: ${title}`
  const url = notificationLinkUrl(links, item)
  const bodyText = !body ? '' : when ? `${body}\n` : `„${body}"\n`
  const bodyHtml = !body ? '' : when ? `${escapeHtml(body)}<br>` : `<em>„${escapeHtml(body)}"</em><br>`
  return {
    heading,
    text: `${heading}\n${bodyText}${copy.openLink}: ${url}`,
    html: `<p><strong>${escapeHtml(heading)}</strong><br>${bodyHtml}<a href="${escapeHtml(url)}">${copy.openLink}</a></p>`,
  }
}

/** Sofort-Mail für EINE Notification (Modus 'instant'). */
export function buildInstantEmail(links: NotificationLinkContext, locale: EmailLocale, input: NotificationEmailItem, options: NotificationEmailOptions = {}): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const lines = itemLines(locale, input, links, options)
  return {
    subject: lines.heading,
    text: `${lines.text}\n\n—\n${copy.footer}`,
    html: `${lines.html}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/**
 * Digest-Mail für mehrere ungelesene Notifications (Modus 'digest').
 *
 * JEDER Eintrag bekommt seinen eigenen Host (D5) — das ist hier kein Detail,
 * sondern der Normalfall: der Sweep bündelt bewusst mandantenübergreifend (eine
 * Sammel-Mail pro Tag, nicht eine je Community), eine Mail trägt also Links in
 * mehrere Communities UND in den Kundenbereich nebeneinander.
 */
export function buildDigestEmail(links: NotificationLinkContext, locale: EmailLocale, items: NotificationEmailItem[], options: NotificationEmailOptions = {}): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const parts = items.map(item => itemLines(locale, item, links, options))
  return {
    subject: copy.digestSubject(items.length),
    text: `${copy.digestIntro(items.length)}\n\n${parts.map(p => p.text).join('\n\n')}\n\n—\n${copy.footer}`,
    html: `<p>${escapeHtml(copy.digestIntro(items.length))}</p>${parts.map(p => p.html).join('')}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/**
 * Instant-Zweig für notify(): Empfänger laden, Opt-in prüfen, senden.
 * Best-effort — wirft nie (der auslösende Request ist längst beantwortet).
 *
 * `communityId` ist der bereits BERECHNETE Ablage-Wert aus notify() — nicht
 * noch einmal aus dem Request abgeleitet. Ein zweites Mal rechnen hieße, die
 * Regel aus notificationScope.ts zu kopieren, und dann könnten Glocke und Mail
 * unterschiedlich entscheiden.
 *
 * OHNE `H3Event` aufrufbar, weil notify() es seit der Community-Zahlungswarnung
 * ist: die entsteht in einem Intervall-Plugin. Alles, was hier gebraucht wird,
 * kennt diesen Fall schon (`mailerConfigured`, `createAdminClient`,
 * `useRuntimeConfig`, `sendMail` nehmen `undefined`).
 */
export async function maybeSendInstantEmail(event: H3Event | undefined, input: NotifyInput, communityId: string): Promise<void> {
  try {
    if (!await mailerConfigured(event)) {
      warnMailerMissingOnce('eine Sofort-Benachrichtigung')
      return
    }
    const { users } = createAdminClient(event)
    const recipient = await users.get({ userId: input.recipientId })
    const prefs = resolveEmailPrefs(recipient.prefs as Record<string, unknown>)
    if (prefs.emailNotifications !== 'instant' || !recipient.email) return
    // Spam-Schutz: Mails NUR an verifizierte Adressen — sonst könnte ein
    // Account mit fremder E-Mail Dritten unsere Notifications zustellen.
    if (!recipient.emailVerification) return
    // EINE Community, also ein Resolver-Aufruf — der 60-s-Cache im Resolver
    // trägt die übrigen Antworten desselben Threads.
    const hosts = await resolveCommunityHosts([communityId])
    // Zone aus denselben Prefs, die gerade für Modus und Sprache gelesen
    // wurden (BE-018) — kein zweiter Abruf.
    const timezone = normalizeTimezonePref((recipient.prefs as Record<string, unknown>).timezone)
    const mail = buildInstantEmail({ appBase: await appLinkBase(event), hosts }, prefs.emailLocale, { ...input, communityId }, { timezone })
    await sendMail(event, { ...mail, to: recipient.email })
  }
  catch (error) {
    console.error('[core] Instant-Notification-Mail fehlgeschlagen:', error)
  }
}
