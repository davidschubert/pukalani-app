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

/**
 * EIN TRANSPORTER JE ZUGANG, NICHT EINER INSGESAMT (RS1 e, 2026-11-09).
 *
 * Bis hierher war das ein einziger Platz. Das stimmte, solange alle Mails
 * dieselben Zugangsdaten benutzten — seit der Newsletter seine eigenen
 * mitbringen kann, wechselten sich zwei Schlüssel auf diesem einen Platz ab
 * und JEDE Mail hätte eine neue SMTP-Verbindung aufgebaut. Kein Fehler, den
 * man sieht: nur langsamer Versand und unnötig viele Anmeldungen beim
 * Anbieter.
 *
 * Die Map ist GEDECKELT. Der Schlüssel enthält das Passwort, und Passwörter
 * drehen sich — ohne Deckel wüchse sie mit jeder Rotation um einen toten
 * Eintrag. Zwei Zugänge sind der gedachte Fall, vier sind großzügig; was
 * darüber hinaus kommt, verdrängt den ältesten Eintrag (dessen Transporter
 * wird geschlossen, sonst bliebe sein Verbindungspool offen).
 */
const MAX_TRANSPORTERS = 4
const transporters = new Map<string, Transporter>()

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
  for (const transporter of transporters.values()) transporter.close()
  transporters.clear()
}

function getTransporter(settings: MailerSettings, auth?: MailAuth): Transporter {
  // Host und Port bleiben IMMER die der Einstellung: ein eigener Zugang heisst
  // „anderes Konto beim selben Anbieter", nicht „anderer Anbieter". Wer
  // wirklich woanders hin will, baut einen eigenen Transport — hier wäre es
  // eine Hintertür an der Mailer-Konfiguration vorbei.
  const user = auth?.user || settings.user
  const pass = auth ? auth.pass : settings.pass

  // Der Puffer-Schlüssel trägt auch das PASSWORT: wer es in der Konsole dreht,
  // bekäme sonst weiter den alten Transporter — mit dem alten Passwort, und
  // die Mails scheiterten still an der Anmeldung.
  const key = `${settings.host}:${settings.port}:${user}:${pass}`
  const known = transporters.get(key)
  if (known) return known

  const port = Number(settings.port) || 587
  const transporter = createTransport({
    host: settings.host,
    port,
    // 465 = implizites TLS; sonst STARTTLS wenn der Server es anbietet
    secure: port === 465,
    // BENUTZER ODER PASSWORT genügt, nicht „Benutzer" allein (RS1 e): mit
    // `user ?` fiel ein mitgegebenes Passwort still unter den Tisch, sobald
    // die Einstellung keinen Benutzernamen trug — die Mail wäre dann OHNE
    // Anmeldung rausgegangen statt mit der falschen. Ein Zugang, der nicht
    // vollständig ist, soll beim Anbieter scheitern und nicht hier
    // verschwinden. Beide leer heisst weiterhin „gar keine Anmeldung", und
    // das ist der unveränderte Normalfall.
    ...(user || pass ? { auth: { user, pass } } : {}),
  })
  if (transporters.size >= MAX_TRANSPORTERS) {
    const [oldestKey, oldest] = transporters.entries().next().value as [string, Transporter]
    oldest.close()
    transporters.delete(oldestKey)
  }
  transporters.set(key, transporter)
  return transporter
}

/**
 * EIGENE ZUGANGSDATEN FÜR EINE MAIL — der zweite Teil der Ruf-Trennung
 * (RS1 e, 2026-11-09).
 *
 * `MailInput.from` allein reicht NICHT. Gemessen am 2026-11-09: ein
 * Resend-Schlüssel, der an eine Domain gebunden ist, antwortet auf einen
 * fremden Absender mit **403 „This API key is not authorized to send emails
 * from …"** — und die Bindung lässt sich an einem bestehenden Schlüssel nicht
 * mehr ändern. Wer von einer zweiten Domain senden will, braucht also einen
 * zweiten Schlüssel, und der muss bis an den Transport reisen.
 *
 * Es bleibt bewusst beim HOST der Einstellung (s. `getTransporter`): ein
 * eigener Zugang heisst „anderes Konto beim selben Anbieter", nicht „anderer
 * Anbieter". Sonst wäre dieses Feld eine Hintertür an der
 * Mailer-Konfiguration vorbei.
 *
 * `user` ist optional, weil er bei einem Anbieter wie Resend für alle
 * Schlüssel gleich ist; ohne ihn gilt der der Einstellung. `pass` ist
 * Pflicht — ein Zugang ohne Passwort wäre keiner.
 */
export interface MailAuth {
  user?: string
  pass: string
}

export interface MailInput {
  to: string
  subject: string
  text: string
  /**
   * ABSENDER NUR FÜR DIESE MAIL — überschreibt `NUXT_SMTP_FROM` (RS1,
   * 2026-11-09).
   *
   * ── WOFÜR, UND WARUM NICHT EINFACH DIE EINE EINSTELLUNG ÄNDERN ──────────
   * Massenmail und Einzelmail teilen sich sonst EINEN Ruf. Wer seinen
   * Newsletter über dieselbe Absender-Domain schickt wie die Anmelde- und
   * Benachrichtigungs-Mails, setzt mit jeder Beschwerde über den Newsletter
   * die Zustellung der Passwort-Mail aufs Spiel — und das ist die Mail, die
   * ankommen MUSS. Deshalb bekommt der Newsletter von branding.supply eine
   * eigene, eigens verifizierte Versand-Subdomain, und deshalb reist der
   * Absender hier je Mail statt in der Einstellung.
   *
   * ── ES IST EIN ÜBERSCHREIBEN, KEIN NEUER DEFAULT ───────────────────────
   * Leer oder nicht gesetzt heisst unverändert `NUXT_SMTP_FROM` (und erst
   * danach `noreply@<host>`). Jede Mail, die das Feld nicht nennt, verhält
   * sich also wie vorher — das war die Bedingung dafür, es im Core
   * anzufassen.
   *
   * ── WAS DIESES FELD NICHT PRÜFT ────────────────────────────────────────
   * Ob die Domain beim Versanddienst verifiziert ist. Sie muss es sein, sonst
   * lehnt er die Mail ab; das ist eine Betriebs-Zusage, keine Typfrage. Der
   * Wert geht unverändert an nodemailer, darf also auch die Form
   * `Name <adresse@domain>` haben.
   */
  from?: string
  /**
   * ZUGANGSDATEN NUR FÜR DIESE MAIL — s. `MailAuth`. Ohne das Feld meldet
   * sich der Transport wie immer an, die Mail verhält sich also wie vorher.
   *
   * Fast immer reist es ZUSAMMEN mit `from`: ein eigener Schlüssel ohne
   * eigenen Absender bringt nichts, und ein eigener Absender ohne den
   * passenden Schlüssel ist genau der 403 von oben. Erzwungen wird die
   * Paarung hier trotzdem nicht — der Transport entscheidet keine Policy,
   * und es gibt den Fall „ein Konto, zwei verifizierte Domains".
   */
  auth?: MailAuth
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
  /**
   * ANTWORT-ADRESSE (`Reply-To`) NUR FÜR DIESE MAIL (SEC-030 Teil 2,
   * 2026-11-13). Erster Nutzer: die Nachricht einer entfernten Person an die
   * Leitung ihrer Community — „Antworten" im Mail-Programm soll bei der
   * Person landen, nicht bei unserer Absender-Adresse, ohne dass ihre Adresse
   * zum Absender wird (das bräche SPF/DKIM und gäbe ihr fremden Ruf).
   *
   * Rückwärtskompatibel: ohne Feld trägt der Umschlag nichts. Der Wert geht
   * unverändert an nodemailer; ihn frei von Zeilenumbrüchen zu halten, ist
   * Sache des Aufrufers (wie bei `headers`).
   */
  replyTo?: string
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
  const transporter = getTransporter(settings, input.auth)
  await transporter.sendMail({
    // Reihenfolge mit Absicht: die Mail selbst schlägt die Einstellung,
    // die Einstellung schlägt die Notlösung. Siehe `MailInput.from`.
    from: input.from || settings.from || `noreply@${settings.host}`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    // Nur setzen, wenn es welche gibt: ein leeres `headers: {}` an jeder Mail
    // wäre ein Unterschied im Umschlag, den niemand beschlossen hat.
    ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
  })
  return true
}
