/**
 * UNZUSTELLBARE ADRESSEN — die puren Regeln hinter dem Resend-Webhook (RS1 b).
 *
 * Resend sperrt eine Adresse nach einem harten Bounce oder einer Spam-
 * Beschwerde selbst (teamweite Suppression List). Bei UNS blieb sie aber
 * „lebendig": der Newsletter-Abonnent stand weiter auf „bestätigt" und zählte
 * bei jeder Ausgabe als Fehlschlag, und die Benachrichtigungs-Mails eines
 * Kontos liefen ins Leere. Der Webhook meldet das Schicksal zurück; WAS daraus
 * folgt, steht hier — ohne Netz, damit ein Test jede Regel lesen kann.
 *
 * Zuschnitt: docs/archiv/MAIL-ZUSTELLBARKEIT.md § 2 Stufe B; Davids
 * Entscheidung 2026-11-06: bei einer Beschwerde NUR die Mails abschalten und
 * einen Hinweis zeigen, keine Sanktion am Konto.
 */

export type MailUndeliverableReason = 'bounce' | 'complaint' | 'suppressed'

/**
 * Der Merker in den Konto-Prefs (`prefs.emailUndeliverable`).
 *
 * `emailHash` bindet ihn an die ADRESSE, nicht an das Konto: ändert jemand
 * seine E-Mail (heute nur über die Appwrite-Konsole — eine Änderungs-Route
 * gibt es bei uns nicht), passt der Hash nicht mehr und der Hinweis
 * verschwindet von selbst. Ein Merker, den erst eine bestimmte Route räumen
 * müsste, bliebe bei jedem anderen Weg für immer stehen. Gekürzter sha256,
 * nie die Adresse selbst — sie steht ohnehin am Konto, ein zweites Exemplar
 * in den Prefs wäre nur eine Kopie mehr, die ein Export oder Log mitnimmt.
 */
export interface MailUndeliverableMarker {
  reason: MailUndeliverableReason
  at: string
  emailHash: string
}

export type ResendWebhookVerdict =
  | { kind: 'undeliverable', reason: MailUndeliverableReason, recipients: string[], subType: string, emailId: string }
  | { kind: 'soft_bounce', recipients: string[], subType: string, emailId: string }
  | { kind: 'ignore' }

/**
 * „Name <adresse>" oder „adresse" ⇒ die nackte Adresse, kleingeschrieben.
 *
 * Gemessen (MZ1, 2026-11-06): Resends `to` trägt manchmal den Anzeigenamen.
 * Kleingeschrieben, weil Appwrite die Konto-Adresse und insights die
 * Abonnenten-Adresse (`emailLower`) so ablegen — eine Großschreibung im
 * Ereignis darf keinen Treffer verpassen.
 */
export function mailRecipientAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const angled = /<([^<>\s]+)>/.exec(raw)
  const address = (angled ? angled[1]! : raw).trim().toLowerCase()
  // Bewusst grob: genau ein @, links und rechts etwas, kein Leerraum. Wer
  // hier eine RFC-Prüfung erwartet — die Adresse kommt signiert von Resend,
  // die Frage ist nur „ist das überhaupt eine Adresse?".
  return /^[^\s@]+@[^\s@]+$/.test(address) ? address : null
}

/** Nur die Domain — das Einzige, was von einer Adresse ins Log darf. */
export function mailAddressDomain(address: string): string {
  const at = address.lastIndexOf('@')
  return at >= 0 ? address.slice(at + 1) : ''
}

function recipientsOf(data: Record<string, unknown>): string[] {
  const list = Array.isArray(data.to) ? data.to : [data.to]
  return [...new Set(list.map(mailRecipientAddress).filter((value): value is string => !!value))]
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * Welche Ereignisse etwas bewirken — die Allowlist.
 *
 *  · `email.bounced` mit `bounce.type === 'Permanent'` ⇒ unzustellbar.
 *    `Temporary` (Postfach voll, Server kurz weg) ist ein weicher Bounce: er
 *    wird nur gezählt (Log), nie gesperrt — sonst verlöre jemand den
 *    Newsletter, weil sein Anbieter eine Stunde lang hustete. Resend selbst
 *    sperrt bei weichen Bounces ebenfalls nicht.
 *  · `email.complained` ⇒ Beschwerde.
 *  · `email.suppressed` ⇒ Resend hat eine Mail gar nicht erst verschickt, weil
 *    die Adresse schon auf der Sperrliste stand. Das ist der Nachzügler-Fall:
 *    die Sperre stammt aus der Zeit VOR diesem Webhook, und ohne diesen Zweig
 *    erführen wir von ihr nie. Der Zuschnitt nannte `suppression.added` — das
 *    feuert aber auch bei Einträgen, die jemand von Hand in die Liste setzt,
 *    und seine Nutzlast ist nicht dokumentiert. `email.suppressed` trägt
 *    dasselbe `to` wie die anderen beiden, und es feuert genau dann, wenn wir
 *    wirklich an eine tote Adresse schreiben wollten.
 *
 * Alles andere (`delivered`, `opened`, `clicked`, …) ⇒ `ignore`. Öffnungen
 * und Klicks werten wir bewusst nicht aus (Tracking ohne Zweck, § 3).
 */
export function readResendWebhookEvent(payload: unknown): ResendWebhookVerdict {
  const root = objectOf(payload)
  const data = objectOf(root.data)
  const emailId = typeof data.email_id === 'string' ? data.email_id : ''

  if (root.type === 'email.bounced') {
    const bounce = objectOf(data.bounce)
    const subType = typeof bounce.subType === 'string' ? bounce.subType : ''
    const recipients = recipientsOf(data)
    if (!recipients.length) return { kind: 'ignore' }
    return bounce.type === 'Permanent'
      ? { kind: 'undeliverable', reason: 'bounce', recipients, subType, emailId }
      : { kind: 'soft_bounce', recipients, subType, emailId }
  }

  if (root.type === 'email.complained' || root.type === 'email.suppressed') {
    const recipients = recipientsOf(data)
    if (!recipients.length) return { kind: 'ignore' }
    const suppressed = objectOf(data.suppressed)
    return {
      kind: 'undeliverable',
      reason: root.type === 'email.complained' ? 'complaint' : 'suppressed',
      recipients,
      subType: typeof suppressed.type === 'string' ? suppressed.type : '',
      emailId,
    }
  }

  return { kind: 'ignore' }
}

function readMarker(value: unknown): MailUndeliverableMarker | null {
  const marker = objectOf(value)
  const reason = marker.reason
  if (reason !== 'bounce' && reason !== 'complaint' && reason !== 'suppressed') return null
  if (typeof marker.emailHash !== 'string' || typeof marker.at !== 'string') return null
  return { reason, at: marker.at, emailHash: marker.emailHash }
}

/**
 * Die neuen Prefs eines Kontos — oder `null`, wenn nichts zu schreiben ist.
 *
 * ZUSAMMENGEFÜHRT, nie ersetzt: `updatePrefs` ERSETZT das ganze Fach, und
 * Avatar, Bio, Zeitzone, Navigation stehen darin (die Falle aus dem Nav-Paket).
 *
 * IDEMPOTENT: Resend wiederholt eine Zustellung mit derselben `svix-id`, bis
 * wir 2xx antworten — und schickt für dieselbe Adresse oft mehrere Ereignisse
 * (Bounce, danach bei jedem weiteren Versuch `suppressed`). Steht schon ein
 * Merker für DIESE Adresse und sind die Mails aus, gibt es nichts zu tun: kein
 * Schreibzugriff, und der erste Zeitpunkt und Grund bleiben stehen. Darum
 * braucht es keine Tabelle für gesehene Ereignis-Ids (core besitzt keine).
 *
 * Hat jemand die Mails NACH dem Merker wieder eingeschaltet, schaltet das
 * nächste Ereignis sie erneut aus — die Adresse ist ja weiter tot.
 */
export function nextUndeliverablePrefs(
  prefs: Record<string, unknown> | null | undefined,
  input: { reason: MailUndeliverableReason, emailHash: string, at: string },
): Record<string, unknown> | null {
  const current = prefs ?? {}
  const existing = readMarker(current.emailUndeliverable)
  const sameAddress = existing?.emailHash === input.emailHash
  if (sameAddress && current.emailNotifications === 'off') return null
  return {
    ...current,
    emailNotifications: 'off',
    emailUndeliverable: sameAddress ? existing : { reason: input.reason, at: input.at, emailHash: input.emailHash },
  }
}

/**
 * Der Hinweis unter Einstellungen → Benachrichtigungen: der Grund, solange der
 * Merker zur AKTUELLEN Adresse des Kontos gehört, sonst `null`.
 */
export function undeliverableNoticeReason(
  prefs: Record<string, unknown> | null | undefined,
  currentEmailHash: string,
): MailUndeliverableReason | null {
  const marker = readMarker(prefs?.emailUndeliverable)
  if (!marker || !currentEmailHash) return null
  return marker.emailHash === currentEmailHash ? marker.reason : null
}
