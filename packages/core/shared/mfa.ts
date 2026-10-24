/**
 * Zwei-Faktor (U15 Teil 4) — die reinen Regeln.
 *
 * Der Zweitfaktor ist Appwrites MFA (TOTP), NICHT selbst gebaut: kein eigener
 * Code-Speicher, keine eigene Krypto. Hier steht nur, was rund um Appwrite
 * pur entschieden werden kann — damit es testbar ist und nicht in einer
 * Route versteckt liegt.
 */

/** Der TOTP-Faktor heißt bei Appwrite schlicht `totp`. */
export const MFA_FACTOR_TOTP = 'totp'

/**
 * ACHTUNG, HIER STEHT ABSICHTLICH `recoveryCode` UND NICHT `recoverycode`.
 *
 * Appwrite 1.9.6 nimmt für den Wiederherstellungs-Code zwei verschiedene
 * Schreibweisen ernst, und die SDKs senden die FALSCHE:
 *
 *  - `Auth/MFA/Type::RECOVERY_CODE` ist **`'recoveryCode'`** (camelCase).
 *  - Der Enum-Wert `AuthenticationFactor.Recoverycode` aller offiziellen SDKs
 *    ist **`'recoverycode'`** (klein).
 *  - Die `WhiteList` beim Anlegen der Challenge prüft case-INsensitiv, das
 *    Kleinschreiben kommt also anstandslos durch und wird SO gespeichert.
 *  - `Challenges/Update.php` vergleicht danach mit `===` gegen
 *    `Type::RECOVERY_CODE`. `'recoverycode' === 'recoveryCode'` ist falsch,
 *    der Zweig fällt in `default => false`, und die Antwort ist ein
 *    ununterscheidbares `401 user_invalid_token` — als wäre der Code falsch.
 *
 * Ergebnis: mit dem SDK-Enum ist JEDER Wiederherstellungs-Code ungültig.
 * Am 2026-08-13 gegen die lokale 1.9.6 gemessen, A/B auf demselben Konto:
 *
 *   factor="recoverycode" -> gespeichert als "recoverycode" -> ABGELEHNT
 *   factor="recoveryCode" -> gespeichert als "recoveryCode" -> AKZEPTIERT
 *
 * Deshalb geht hier ein STRING an Appwrite und nicht das SDK-Enum. Wer das
 * „aufräumt" und auf `AuthenticationFactor.Recoverycode` umstellt, nimmt dem
 * Nutzer seinen letzten Weg zurück ins Konto — und der Fehler sieht dabei
 * exakt wie ein Tippfehler des Nutzers aus. Erst wieder anfassen, wenn
 * Appwrite den Vergleich repariert hat; der Beweis dafür ist Abschnitt 6 in
 * `packages/core/scripts/verify-mfa.mjs` (er prüft BEIDE Schreibweisen und
 * fällt, sobald die kleine wieder funktioniert).
 */
export const MFA_FACTOR_RECOVERY_CODE = 'recoveryCode'

/** Womit der Nutzer seinen zweiten Faktor belegt. */
export type MfaChallengeMode = 'totp' | 'recovery'

/** Modus (unsere Sprache) → Appwrite-Faktor (deren Sprache, inkl. Falle oben). */
export function mfaFactorFor(mode: MfaChallengeMode): string {
  return mode === 'recovery' ? MFA_FACTOR_RECOVERY_CODE : MFA_FACTOR_TOTP
}

/**
 * „Diese Session hat das Passwort geschafft, aber noch nicht den zweiten
 * Faktor." Appwrite antwortet darauf auf JEDEM Konto-Aufruf mit 401 und dem
 * Typ `user_more_factors_required` (app/controllers/shared/api.php, Schritt
 * 12/13: `minimumFactors = 2`, sobald `mfa` an ist und ein Faktor verifiziert
 * wurde). Die Session EXISTIERT dabei bereits und ihr Cookie ist gültig —
 * sie trägt nur erst `factors: ['password']`.
 */
export function isMoreFactorsRequired(error: unknown): boolean {
  return (error as { type?: string } | null)?.type === 'user_more_factors_required'
}

/**
 * DIE EINE WEICHE „erste Stufe steht, zweiter Faktor fehlt" — für JEDEN Weg,
 * der eine Session anlegt (Passwort, E-Mail-Code, …).
 *
 * Ob ein zweiter Faktor nötig ist, sagt APPWRITE, nicht wir: die Rechnung
 * (`minimumFactors`, app/controllers/shared/api.php) hängt an `user.mfa` UND
 * daran, ob überhaupt ein Faktor verifiziert ist, und sie zählt Faktoren, die
 * wir nicht erraten sollten (`['email','oauth2']` gilt als zwei — deshalb kam
 * der Google-Login immer durch). Also wird GEFRAGT statt gerechnet: `probe`
 * ist ein Konto-Aufruf mit der frischen Session (`account.get()`).
 *
 *  - Appwrite wirft `user_more_factors_required` ⇒ true: die Session EXISTIERT
 *    und ihr Cookie ist gültig, sie trägt nur erst EINEN Faktor; der Aufrufer
 *    antwortet `mfaRequired: true` und protokolliert noch KEIN `user.login`.
 *  - der Aufruf gelingt ⇒ false.
 *  - jeder andere Fehler (Netz, Appwrite) ⇒ false: das ist kein Fehler der
 *    Anmeldung, die Session steht — also normal weitermachen.
 *
 * Der Code-Login (otp/verify) hatte diese Weiche bis zum 2026-10-24 NICHT:
 * nach dem richtigen Code entstand eine Session mit `factors: ['email']`,
 * `/api/auth/me` antwortete 401, der SSR-Guard hielt den Nutzer für
 * abgemeldet und zeigte ohne ein Wort wieder das Login.
 */
export async function secondFactorPending(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe()
    return false
  }
  catch (error) {
    return isMoreFactorsRequired(error)
  }
}

/**
 * Wie die Anmeldung im Protokoll heißt, NACHDEM der zweite Faktor saß —
 * aus den Faktoren der Session, nicht aus einer Annahme: `['email','totp']`
 * ⇒ `otp+totp`, `['password','totp']` ⇒ `password+totp`. Vor dem 2026-10-24
 * schrieb die Challenge-Route fest `password+…`, obwohl auch der Code-Weg
 * dort ankommt. Appwrite nennt den E-Mail-Code-Faktor `email`; im Protokoll
 * heißt der Weg seit jeher `otp` (otp/verify), deshalb die Übersetzung.
 */
export function mfaLoginMethod(factors: readonly string[], mode: MfaChallengeMode): string {
  const first = factors[0]
  const label = first === undefined ? 'unknown' : first === 'email' ? 'otp' : first
  return `${label}+${mode}`
}

/**
 * „Der Code war falsch." Appwrite wirft beim Challenge-Abschluss
 * `user_invalid_token`; beim Bestätigen eines frischen Authenticators
 * zusätzlich `user_invalid_credentials`.
 */
export function isInvalidMfaCode(error: unknown): boolean {
  const type = (error as { type?: string } | null)?.type
  return type === 'user_invalid_token' || type === 'user_invalid_credentials'
}

/**
 * Ein TOTP-Code ist sechsstellig, ein Wiederherstellungs-Code zehn Zeichen
 * hex (`Type::generateBackupCodes`). Nutzer tippen Leerzeichen und
 * Bindestriche mit, Passwortmanager fügen sie sogar ein — deshalb wird VOR
 * der Prüfung geputzt statt hinterher abgelehnt.
 */
export function normalizeMfaCode(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}
