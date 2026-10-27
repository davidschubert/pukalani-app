import { z } from 'zod'
import { MAX_DISPLAY_NAME_LENGTH, displayNameProblem } from '../shared/displayName'

export type TranslateFn = (key: string) => string

// Ohne t() bleiben die Meldungen i18n-Keys — die UI übersetzt via
// create*Schema(t), Server-Routes validieren mit der Key-Variante.
const identity: TranslateFn = key => key

/**
 * E-Mails IMMER normalisieren: Appwrites createEmailToken matcht
 * case-SENSITIV und legt sonst Duplikat-Accounts an (signup lowercased,
 * OTP nicht — empirisch in Phase 20 gefunden).
 */
function normalizedEmail(t: TranslateFn) {
  return z.email(t('validation.emailInvalid')).transform(value => value.trim().toLowerCase())
}

/**
 * Frei gewählter Anzeigename (Vorfall 2026-10-27, Regel shared/displayName.ts):
 * Appwrite setzt ihn in den Kopf jeder Verifizierungs-Mail — ein Name mit Link
 * machte aus der Registrierung ein Spam-Werkzeug an fremde Adressen. EINE
 * Fabrik für Registrierung, OTP-Registrierung und Profil (schemas/profile.ts),
 * damit kein Eingang die Regel vergisst.
 *
 * `optional: true` = der OTP-Login ohne Registrierung: leer ist dann erlaubt,
 * alles andere muss dieselben Hürden nehmen wie der Pflicht-Name. Bewusst ein
 * `refine` statt der früheren `z.union([min(2), literal('')])`: eine Union
 * meldet bei JEDEM Fehlschlag nur ihre eigene Sammelmeldung — der Hinweis
 * „keine Links" wäre dort als „mindestens 2 Zeichen" angekommen.
 *
 * `too_long` beantwortet `.max()` mit eigener Meldung; das `refine` meldet nur
 * Links/Steuerzeichen, damit ein zu langer Name nicht zwei Fehler zeigt.
 */
export function displayNameField(t: TranslateFn = identity, options: { optional?: boolean } = {}) {
  return z.string(t('validation.required'))
    .max(MAX_DISPLAY_NAME_LENGTH, t('validation.nameMax'))
    .refine(
      value => (options.optional && value === '') || value.length >= 2,
      t('validation.nameMin'),
    )
    .refine(
      value => {
        const problem = displayNameProblem(value)
        return problem === null || problem === 'too_long'
      },
      t('validation.nameNoLinks'),
    )
}

export function createLoginSchema(t: TranslateFn = identity) {
  return z.object({
    email: normalizedEmail(t),
    password: z.string(t('validation.required')).min(8, t('validation.passwordMin')),
  })
}

/**
 * Starkes Passwort (nur Registrierung): min. 8 Zeichen + je 1 Groß-/Kleinbuchstabe,
 * Zahl und Sonderzeichen. Der Login bleibt bewusst bei min. 8 (Bestandskonten).
 */
function strongPassword(t: TranslateFn = identity) {
  return z.string(t('validation.required'))
    .min(8, t('validation.passwordMin'))
    .refine(
      value => /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value),
      t('validation.passwordComplexity'),
    )
}

export function createRegisterSchema(t: TranslateFn = identity) {
  return createLoginSchema(t).extend({
    name: displayNameField(t),
    password: strongPassword(t),
  })
}

export interface RegisterFormOptions {
  /** true = AGB-Checkbox ist Pflicht (pukalani.auth.termsUrl gesetzt) */
  requireTerms?: boolean
  /**
   * true = Unternehmer-Häkchen ist Pflicht (`pukalani.auth.businessOnly`,
   * BS1 R1c). Ein ZWEITES Häkchen neben den AGB und kein gemeinsames: die
   * beiden Zusagen hängen an verschiedenen Schaltern und beantworten
   * verschiedene Fragen (welcher Text — wer zustimmt).
   */
  requireBusiness?: boolean
}

/**
 * Formular-Variante des Register-Schemas: Confirm-Password (+ optional AGB,
 * + optional Unternehmer-Bestätigung).
 * Der Server validiert weiterhin nur name/email/password (registerSchema) —
 * passwordConfirm/terms/business sind reine UI-Belange. Was am Konto
 * festgehalten wird, entscheidet der Server aus seiner eigenen Config
 * (`server/utils/termsAcceptance.ts`, `server/utils/businessConfirmation.ts`).
 */
export function createRegisterFormSchema(t: TranslateFn = identity, options: RegisterFormOptions = {}) {
  return createRegisterSchema(t)
    .extend({
      passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
      terms: options.requireTerms
        ? z.literal(true, t('validation.termsRequired'))
        : z.boolean().optional(),
      business: options.requireBusiness
        ? z.literal(true, t('validation.businessRequired'))
        : z.boolean().optional(),
    })
    .refine(data => data.password === data.passwordConfirm, {
      message: t('validation.passwordMismatch'),
      path: ['passwordConfirm'],
    })
}

export function createRecoverySchema(t: TranslateFn = identity) {
  return z.object({
    email: normalizedEmail(t),
  })
}

/**
 * Formular der Reset-Page (userId/secret kommen aus der Mail-URL, nicht aus dem
 * Formular). Neues Passwort MUSS die Komplexitäts-Policy erfüllen — sonst
 * unterläuft der „Passwort vergessen"-Flow die Registrierungs-Anforderungen.
 */
export function createResetSchema(t: TranslateFn = identity) {
  return z.object({
    password: strongPassword(t),
    passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
  }).refine(data => data.password === data.passwordConfirm, {
    message: t('validation.passwordMismatch'),
    path: ['passwordConfirm'],
  })
}

export const loginSchema = createLoginSchema()
export const registerSchema = createRegisterSchema()
export const recoverySchema = createRecoverySchema()
/** OTP-Verify: 6-stelliger Code aus der Mail (server-only, keine i18n nötig) */
export const otpVerifySchema = z.object({
  userId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
})

export interface OtpRequestOptions {
  /** true = AGB-Checkbox ist Pflicht (register-Modus + pukalani.auth.termsUrl) */
  requireTerms?: boolean
  /** true = Name ist Pflicht (register-Modus, analog zur Passwort-Registrierung) */
  requireName?: boolean
  /**
   * true = Unternehmer-Häkchen ist Pflicht (register-Modus +
   * `pukalani.auth.businessOnly`, BS1 R1c). Der reine LOGIN bestehender Konten
   * bleibt friktionsfrei — dieselbe Abgrenzung wie bei `requireTerms`.
   */
  requireBusiness?: boolean
}

/**
 * E-Mail-Schritt des OTP-Formulars: Name (im Register-Modus Pflicht, sonst optional)
 * + optionale AGB-Pflicht + optionale Unternehmer-Bestätigung. Der Name wird
 * nach dem Verify gesetzt.
 */
export function createOtpRequestSchema(t: TranslateFn = identity, options: OtpRequestOptions = {}) {
  return z.object({
    email: normalizedEmail(t),
    name: options.requireName
      ? displayNameField(t)
      : displayNameField(t, { optional: true }).optional(),
    terms: options.requireTerms
      ? z.literal(true, t('validation.termsRequired'))
      : z.boolean().optional(),
    business: options.requireBusiness
      ? z.literal(true, t('validation.businessRequired'))
      : z.boolean().optional(),
  })
}

export type OtpRequestInput = z.infer<ReturnType<typeof createOtpRequestSchema>>
export const resetServerSchema = z.object({
  userId: z.string().min(1),
  secret: z.string().min(1),
  password: strongPassword(),
})

/** E-Mail-Verifizierung bestätigen (userId+secret aus dem Mail-Link) */
export const verificationConfirmSchema = z.object({
  userId: z.string().min(1),
  secret: z.string().min(1),
})

/** Passwort-Änderung im eingeloggten Zustand: aktuelles + neues (stark) + Bestätigung */
export function createPasswordChangeSchema(t: TranslateFn = identity) {
  return z.object({
    currentPassword: z.string(t('validation.required')).min(1, t('validation.required')),
    password: strongPassword(t),
    passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
  }).refine(data => data.password === data.passwordConfirm, {
    message: t('validation.passwordMismatch'),
    path: ['passwordConfirm'],
  })
}

/** Server-Variante: passwordConfirm ist reine UI-Validierung */
export const passwordChangeServerSchema = z.object({
  currentPassword: z.string().min(1),
  password: strongPassword(),
})

export type PasswordChangeInput = z.infer<ReturnType<typeof createPasswordChangeSchema>>

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormInput = z.infer<ReturnType<typeof createRegisterFormSchema>>
export type RecoveryInput = z.infer<typeof recoverySchema>
export type ResetFormInput = z.infer<ReturnType<typeof createResetSchema>>

/**
 * Zwei-Faktor (U15 Teil 4). Der Code ist ENTWEDER ein sechsstelliger
 * TOTP-Code ODER ein zehnstelliger Wiederherstellungs-Code — welcher, sagt
 * `mode`. Geputzt wird vorher (normalizeMfaCode), damit eingetippte
 * Leerzeichen/Bindestriche nicht als Tippfehler durchgehen.
 *
 * ES GIBT ZWEI FASSUNGEN, UND ZWAR AUS DEM ÜBLICHEN GRUND (Audit 2026-08-15,
 * Schnitt C): das Challenge-Formular bindet die Regel jetzt selbst, damit ein
 * Tippfehler im Browser scheitert statt gegen den 5/min-Eimer der Route zu
 * zählen — und ein Formular zeigt seine Meldung dem MENSCHEN. Die Route
 * validiert weiter mit der Key-Fassung, das Formular mit `create…Schema(t)`;
 * die REGEL steht nur einmal.
 */
export function createMfaChallengeSchema(t: TranslateFn = identity) {
  return z.object({
    mode: z.enum(['totp', 'recovery']),
    code: z.string().transform(value => value.replace(/[\s-]/g, '')),
  }).refine(
    data => data.mode === 'totp' ? /^\d{6}$/.test(data.code) : /^[a-zA-Z0-9]{10}$/.test(data.code),
    { message: t('validation.mfaCodeInvalid'), path: ['code'] },
  )
}

/** Die Key-Fassung für die Server-Routen (`readValidatedBody`). */
export const mfaChallengeSchema = createMfaChallengeSchema()

/** Bestätigung beim Einrichten: immer TOTP (der Wiederherstellungs-Code entsteht erst danach). */
export const mfaVerifySchema = z.object({
  code: z.string().transform(value => value.replace(/[\s-]/g, '')).refine(
    value => /^\d{6}$/.test(value),
    { message: 'validation.mfaCodeInvalid' },
  ),
})

export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>
