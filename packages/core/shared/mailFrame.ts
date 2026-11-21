/**
 * DER EINE RAHMEN FÜR JEDE EIGENE MAIL (Q06, BRD-006; Davids Antwort R6,
 * 2026-11-21).
 *
 * Was jede Mail bekommt, egal welcher Layer sie schreibt:
 *   - Anrede: „Hallo {Name}," (de) / „Hi {Name}," (en); ohne Namen „Hallo," / „Hi,".
 *   - Schluss-Zeile mit dem Namen der Marke: „Viele Grüße" / „Best regards",
 *     darunter die Marke. Die Marke kommt vom Aufrufer, und der Server holt
 *     sie aus EINER Quelle (`core/server/utils/mailBrand.ts`) — hier steht
 *     kein Name fest.
 *   - Eine Sprach-Regel (`resolveMailLocale`): Einstellung des Kontos, sonst
 *     Sprache der Anfrage, sonst Englisch.
 *   - Optional ein schlichtes HTML aus denselben Zeilen (ohne feste Farben).
 *
 * WAS DER RAHMEN NICHT TUT: Inhalte formulieren. Der Layer liefert seine
 * Absätze (`lines`) und eine optionale Fußzeile (`footer`, z. B. „Du erhältst
 * diese Mail, weil …"). Wächter: `packages/core/tests/mailFrame.test.ts`
 * (jeder Aufruf von `sendMail(` im Repo geht durch `frameMail`).
 */

export type MailLocale = 'de' | 'en'

export const MAIL_LOCALES: readonly MailLocale[] = ['de', 'en']

/** `'de'`/`'en'` (auch `de-DE`, `EN`) ⇒ der Wert, alles andere ⇒ null. */
export function asMailLocale(value: unknown): MailLocale | null {
  if (typeof value !== 'string') return null
  const base = value.trim().toLowerCase().split(/[-_]/)[0]
  return base === 'de' || base === 'en' ? base : null
}

/**
 * DIE EINE SPRACH-REGEL: Einstellung des Kontos (`prefs.emailLocale`), sonst
 * Sprache der Anfrage (Formular, Dashboard, Cookie), sonst Englisch — die
 * Standardsprache. Bis Q06 galten vier Regeln, darunter „Rückfall auf
 * Deutsch".
 */
export function resolveMailLocale(input: { account?: unknown, request?: unknown }): MailLocale {
  return asMailLocale(input.account) ?? asMailLocale(input.request) ?? 'en'
}

const COPY: Record<MailLocale, { hello: (name: string) => string, helloBare: string, closing: string }> = {
  de: { hello: name => `Hallo ${name},`, helloBare: 'Hallo,', closing: 'Viele Grüße' },
  en: { hello: name => `Hi ${name},`, helloBare: 'Hi,', closing: 'Best regards' },
}

/** Anrede nach R6 — ein leerer oder nur aus Leerzeichen bestehender Name zählt wie keiner. */
export function mailGreeting(locale: MailLocale, name?: string | null): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim()
  return clean ? COPY[locale].hello(clean) : COPY[locale].helloBare
}

/** Schluss-Zeile nach R6: Gruß und darunter die Marke. */
export function mailClosing(locale: MailLocale, brand: string): string {
  return `${COPY[locale].closing}\n${brand}`
}

export interface MailFrameInput {
  /** Name der Marke, der in der Schluss-Zeile steht (nie leer). */
  brand: string
  locale: MailLocale
  /** Anzeigename des Empfängers, wenn bekannt. */
  name?: string | null
  /**
   * Die Absätze der Mail, ohne Anrede und Gruß. Ein Absatz darf Zeilenumbrüche
   * enthalten; Absätze trennt eine Leerzeile.
   */
  lines: readonly string[]
  /** Hinweis UNTER dem Gruß (Abmelden, Grund der Mail) — klein im HTML. */
  footer?: string
  /** Auch ein HTML-Teil? Standard: nur Text. */
  html?: boolean
}

export interface FramedMail {
  text: string
  html?: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

/** Adressen im HTML-Teil klickbar machen; der Rest bleibt escaped. */
function htmlParagraph(text: string): string {
  const escaped = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}">${url}</a>`)
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
}

/**
 * Baut Text (und auf Wunsch HTML) einer Mail im gemeinsamen Rahmen.
 * Leere Absätze fallen heraus — ein Aufrufer darf `cond ? 'x' : ''` schreiben.
 */
export function frameMail(input: MailFrameInput): FramedMail {
  const brand = input.brand.trim()
  if (!brand) throw new Error('frameMail: brand fehlt — die Schluss-Zeile braucht den Namen der Marke')
  const body = input.lines.filter(line => line.trim() !== '')
  const greeting = mailGreeting(input.locale, input.name)
  const closing = mailClosing(input.locale, brand)
  const footer = input.footer?.trim() ?? ''

  const text = [greeting, ...body, closing, ...(footer ? [`—\n${footer}`] : [])].join('\n\n')
  if (!input.html) return { text }

  const html = [
    htmlParagraph(greeting),
    ...body.map(htmlParagraph),
    htmlParagraph(closing),
    ...(footer ? [`<hr><p style="font-size:12px;opacity:0.7">${escapeHtml(footer).replace(/\n/g, '<br>')}</p>`] : []),
  ].join('\n')
  return { text, html }
}
