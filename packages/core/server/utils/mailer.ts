import { createTransport, type Transporter } from 'nodemailer'
import type { H3Event } from 'h3'
import {
  parseMailerSettings,
  pickMailerSettings,
  type MailerSettings,
} from '../../shared/mailerSettings'

/**
 * SMTP-Mailer (Core): EIN Versandweg für alle E-Mail-Produkte (Notification-
 * Mails, Digest). Bewusst direktes SMTP statt Appwrite Messaging — kein
 * zusätzlicher Console-Setup/Key-Scope, lokal Mailpit (localhost:1025),
 * in Produktion jeder SMTP-Anbieter. Kein Host = Produkt aus; Konsumenten
 * fragen `resolveMailerSettings()` und senden best-effort.
 *
 * ── ZWEI QUELLEN SEIT 2026-08-18: ABLAGE SCHLÄGT ENV ──────────────────────
 * Der Betreiber trägt den Zugang unter Instanz → Integrationen ein (EIN
 * verschlüsselter Block in `instance_secrets`, system-036); die Env bleibt
 * für alles ohne Oberfläche (CI, lokale Entwicklung, Rückfall nach einem
 * Fehleintrag). Dieselbe Rangfolge wie bei Stripe und der KI — stünde die Env
 * vorn, hätte ein Eintrag über die Konsole auf einer Instanz mit gesetzter
 * Env keine Wirkung.
 *
 * `isMailerConfigured` HIESS BIS DAHIN SO UND WAR SYNCHRON. Die Umbenennung
 * ist die Sicherung: seit die Antwort aus der Datenbank kommen kann, muss sie
 * erwartet werden, und ein vergessenes `await` an `if (!isMailerConfigured())`
 * wäre KEIN Typfehler gewesen (ein Promise ist immer truthy) — der Sweep
 * hätte fröhlich weitergemacht und wäre erst am Transporter gescheitert.
 */

let cached: { key: string, transporter: Transporter } | null = null

/**
 * Was gerade gilt — Ablage vor Env, oder null wenn es keinen Versandweg gibt.
 *
 * KURZ GEPUFFERT (30 s), und das ist kein Feinschliff: der Digest-Sweep
 * verschickt in einem Lauf viele Mails. Ohne Puffer wäre das je Mail eine
 * Appwrite-Abfrage — für eine Antwort, die sich in derselben Minute nicht
 * ändert. Nach einer Änderung in der Konsole greift sie spätestens eine halbe
 * Minute später; das ist die Sorte Verzögerung, die niemand bemerkt.
 */
let settingsCache: { at: number, value: MailerSettings | null } | null = null
const SETTINGS_TTL_MS = 30_000

export async function resolveMailerSettings(event?: H3Event): Promise<MailerSettings | null> {
  const now = Date.now()
  if (settingsCache && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value

  const config = useRuntimeConfig(event)
  const env: MailerSettings = {
    host: config.smtpHost ?? '',
    port: String(config.smtpPort ?? ''),
    user: config.smtpUser ?? '',
    pass: config.smtpPass ?? '',
    from: config.smtpFrom ?? '',
  }
  // Fail-soft: ist die Ablage nicht lesbar (Tabelle fehlt, Umschlag fehlt),
  // trägt die Env weiter. Ein Mailversand darf nicht an einer Ablage sterben,
  // die es vielleicht gar nicht geben soll.
  const stored = parseMailerSettings(await readInstanceSecret(event, 'smtp').catch(() => ''))
  const value = pickMailerSettings(stored, env)
  settingsCache = { at: now, value }
  return value
}

/** Nur für Tests und für den Schreibweg: Puffer verwerfen. */
export function __resetMailerSettingsCache(): void {
  settingsCache = null
}

/** Gibt es einen Versandweg? (Ersetzt das synchrone `isMailerConfigured`.) */
export async function mailerConfigured(event?: H3Event): Promise<boolean> {
  return (await resolveMailerSettings(event)) !== null
}

let warnedMissingMailer = false

/**
 * „Aus" und „vergessen" sehen identisch aus — deshalb sagt es der Server EINMAL
 * laut, wenn eine GEWOLLTE Mail an der fehlenden Konfiguration stirbt
 * (F44, 2026-08-02).
 *
 * Ohne diesen Hinweis ist ein fehlendes `NUXT_SMTP_HOST` vollkommen still:
 * `isMailerConfigured()` meldet sauber `false`, jeder Konsument überspringt
 * best-effort, kein Log, keine Ausnahme. Genau so lief `apps/platform` in
 * PRODUKTION — für ALLE Kunden-Communities ging nie eine Benachrichtigungs-Mail
 * raus (Antworten, Erwähnungen, Digest, und seit F43 die Zahlungswarnung des
 * Owners), während `comments` und `control` konfiguriert waren. Niemandem fiel
 * es auf, weil Stille wie ein bewusstes „Produkt aus" aussieht.
 *
 * Der ORT ist der Punkt: gewarnt wird da, wo eine konkrete Mail verworfen wird,
 * NICHT in `isMailerConfigured()`. Diese Frage stellt auch der Digest-Sweep beim
 * Start JEDER App — help, marketing und portfolio verschicken bewusst nichts und
 * hätten die Warnung bei jedem Start bekommen. Eine Warnung, die überall steht,
 * wird weggelesen, und dann ist der Ausfall wieder still.
 *
 * Einmal pro Prozess, auf `warn`, ohne den Start zu blockieren: eine App DARF
 * ohne Mailer laufen. Sichtbar sein muss nur der Unterschied.
 */
export function warnMailerMissingOnce(context: string): void {
  if (warnedMissingMailer) return
  warnedMissingMailer = true
  console.warn(`[core] NUXT_SMTP_HOST fehlt — ${context} wurde NICHT verschickt und wird es auch künftig nicht. Beabsichtigt, wenn diese App keine Mails senden soll.`)
}

/** Nur für Tests: Merker leeren. */
export function __resetMailerWarnings(): void {
  warnedMissingMailer = false
  settingsCache = null
  cached = null
}

function getTransporter(settings: MailerSettings): Transporter {
  // Der Puffer-Schlüssel trägt jetzt auch das PASSWORT: wer es in der Konsole
  // dreht, bekäme sonst weiter den alten Transporter — mit dem alten Passwort,
  // und die Mails scheiterten still an der Anmeldung.
  const key = `${settings.host}:${settings.port}:${settings.user}:${settings.pass}`
  if (cached?.key === key) return cached.transporter
  const port = Number(settings.port) || 587
  const transporter = createTransport({
    host: settings.host,
    port,
    // 465 = implizites TLS; sonst STARTTLS wenn der Server es anbietet
    secure: port === 465,
    ...(settings.user ? { auth: { user: settings.user, pass: settings.pass } } : {}),
  })
  cached = { key, transporter }
  return transporter
}

export interface MailInput {
  to: string
  subject: string
  text: string
  /** Optional — ohne html geht die Mail als reiner Text raus */
  html?: string
  /**
   * ZUSÄTZLICHE KOPFZEILEN, unverändert an nodemailer durchgereicht (seit
   * BI1 I5b, 2026-10-27).
   *
   * ── WOFÜR ───────────────────────────────────────────────────────────────
   * `List-Unsubscribe`. Ein Newsletter ohne diesen Kopf wird von Gmail und
   * Outlook schlechter behandelt als einer mit, und der Abmelde-Knopf des
   * Mail-Programms ist für den Empfänger der kürzeste Weg hinaus — kürzer als
   * jeder Link im Text. Der Wert ist JE EMPFÄNGER ein anderer (er trägt dessen
   * Token), deshalb sitzt er an der EINZELNEN Mail und nicht in der
   * Transporter-Konfiguration.
   *
   * ── BEWUSST OHNE `List-Unsubscribe-Post` (RFC 8058, One-Click) ──────────
   * Der One-Click-Kopf ist eine ZUSAGE an das Mail-Programm: es darf ohne
   * Rückfrage ein form-kodiertes `POST` an die Adresse schicken, mit
   * `List-Unsubscribe=One-Click` als ganzem Körper und OHNE unseren Token
   * darin. Unser Abmelde-Weg ist eine SEITE mit dem Token in der Query — ein
   * solches POST wüsste also nicht, wen es abmelden soll, und Gmail wertete
   * die ausbleibende Wirkung als kaputten Abmelde-Weg. Das wäre schlechter als
   * keine Zusage. Ein eigener RFC-8058-Endpunkt ist ein eigenes Vorhaben.
   *
   * ── KEINE PRÜFUNG HIER ──────────────────────────────────────────────────
   * Der Mailer ist Transport und policy-frei (wörtlich wie `aiComplete`): WAS
   * eine sinnvolle Kopfzeile ist, weiss der Konsument. Wer hier etwas einträgt,
   * trägt es in eine Mail ein — Zeilenumbrüche in einem Wert gehören dem
   * Aufrufer, nodemailer kodiert sie.
   */
  headers?: Record<string, string>
}

/**
 * Mail senden — wirft bei Fehler (Konsumenten entscheiden über best-effort).
 * Bei unkonfiguriertem SMTP no-op (false), damit Aufrufer nicht selbst gaten
 * müssen — aber nicht mehr still: der erste verworfene Versuch sagt es einmal
 * laut (F44). Die Adresse steht dabei nur angedeutet im Log, ein Log ist kein
 * Ort für Empfängerlisten.
 */
export async function sendMail(event: H3Event | undefined, input: MailInput): Promise<boolean> {
  const settings = await resolveMailerSettings(event)
  if (!settings) {
    warnMailerMissingOnce(`eine Mail an ${input.to.replace(/(.).*(@.*)/, '$1***$2')}`)
    return false
  }
  const transporter = getTransporter(settings)
  await transporter.sendMail({
    from: settings.from || `noreply@${settings.host}`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    // Nur setzen, wenn es welche gibt: ein leeres `headers: {}` an jeder Mail
    // wäre ein Unterschied im Umschlag, den niemand beschlossen hat.
    ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
  })
  return true
}
