/**
 * ── EIN ANZEIGENAME IST KEINE NACHRICHT (Vorfall 2026-10-27) ─────────────────
 *
 * Appwrite schreibt den Konto-Namen in den Kopf der Verifizierungs-Mail
 * („<Name> <E-Mail>") und in die Anrede. Wer bei der Registrierung eine FREMDE
 * Adresse und als Namen einen Werbesatz mit Link einträgt, lässt uns damit
 * Spam an ein Opfer schicken — über UNSER Resend-Konto, mit UNSEREM Absender-
 * Ruf. Genau das lief in der Nacht auf den 2026-10-27: 209 Mails mit
 * „Etsy User! Your item has been successfully sold … https://a29.at/9hdF2k"
 * als Name. Am Vortag derselbe Hebel über „Name ändern" + „Mail erneut senden".
 *
 * Diese pure Regel ist der INHALTS-Riegel (der MENGEN-Riegel sitzt in
 * server/middleware/05.rate-limit.ts). Sie gilt an jeder Stelle, an der ein
 * Mensch seinen Anzeigenamen frei wählt — Registrierung, OTP-Registrierung,
 * Profil — über die Zod-Schemas in schemas/auth.ts und schemas/profile.ts, also
 * im Formular UND in der Route mit DERSELBEN Regel.
 *
 * Abgelehnt wird, was ein Name nie braucht, eine Nachricht aber schon:
 *  - `links`: eine URL oder Domain (`http(s)://`, `www.`, `irgendwas.tld`) —
 *    oder ein `@`, denn eine E-Mail-Adresse ist ebenso eine Adresse, und ein
 *    Mailprogramm macht aus beidem einen anklickbaren Link.
 *  - `control`: Steuerzeichen, Zeilen-/Absatztrenner und Bidi-Steuerzeichen.
 *    Ein Zeilenumbruch macht aus dem Namen einen Absatz, ein Bidi-Override dreht
 *    die Leserichtung (klassische Link-Tarnung). Der Nullbreiten-Verbinder
 *    (U+200D) bleibt bewusst erlaubt: ohne ihn zerfallen Emoji-Folgen und
 *    einige Schriften (Devanagari, Arabisch).
 *  - `too_long`: mehr als 80 Zeichen. Appwrite erlaubt 128 — ein Mensch
 *    braucht keine 80, ein Werbesatz mit Link dagegen fast immer mehr.
 *
 * WARUM KEINE TLD-LISTE: sie veraltet (es gibt über 1.400 TLDs, `.app`, `.shop`
 * und `.xyz` sind gerade die billigen) und kostet Pflege. Das allgemeine Muster
 * „Buchstabe/Ziffer, Punkt, mindestens zwei Buchstaben, danach weder Buchstabe
 * noch Ziffer" trifft `a29.at/9hdF2k` und `pukalani.app`, aber keine Initialen
 * und keine Titel mit Leerzeichen („Dr. Anna Müller", „J. R. R. Tolkien" — nach
 * dem Punkt steht ein Leerzeichen). Abkürzungen OHNE Leerzeichen, die selbst mit
 * einem Punkt enden („Prof.Dr. Müller", „Dr.med. Hans"), bleiben ebenfalls
 * erlaubt: ein Pseudo-TLD, auf das ein Punkt und dann Leerzeichen/Ende folgt,
 * ist eine Abkürzung. Der Preis: eine nackte Domain mit Schlusspunkt
 * („beispiel.de.") rutscht durch — der Kurzlink aus dem Vorfall (mit Pfad) nie.
 * BEWUSST abgelehnt bleiben zusammengeschriebene Formen wie „St.Pauli" oder
 * „J.R.R.Tolkien": sie sind vom Domain-Muster nicht zu unterscheiden, und
 * „St. Pauli" schreibt sich genauso gut.
 *
 * Eine vollständige Spam-Erkennung ist das nicht und soll es nicht sein
 * („a29 punkt at" kommt durch) — aber ohne klickbaren Link verliert der Hebel
 * seinen Wert, und die Menge deckelt die Drossel.
 */

export const MAX_DISPLAY_NAME_LENGTH = 80

export type DisplayNameProblem = 'links' | 'control' | 'too_long'

/**
 * Steuerzeichen (C0/C1, darunter \n, \r, \t), Zeilen-/Absatztrenner
 * (U+2028/U+2029) und die Bidi-Steuerzeichen (U+202A–U+202E, U+2066–U+2069,
 * U+200E/U+200F). Bewusst NICHT die ganze Kategorie Cf: dort liegt auch der
 * Nullbreiten-Verbinder, ohne den Emoji-Folgen zerfallen.
 */
const CONTROL_RE = /[\p{Cc}\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069]/u

/** Ein Schema oder ein `www.` — eindeutig, egal was folgt. */
const URL_PREFIX_RE = /https?:\/\/|\bwww\./i

/**
 * Domain-Muster ohne TLD-Liste (Begründung im Kopf). Nach dem Pseudo-TLD darf
 * weder ein Buchstabe/eine Ziffer folgen (sonst wäre es nicht das Ende des
 * Labels) noch ein Punkt mit Leerzeichen/Ende dahinter (das ist eine
 * Abkürzung wie „Dr." oder „med."). Ein Pfad (`/`), Port (`:`), Query (`?`),
 * Satzzeichen oder das Ende machen es zur Domain.
 */
const DOMAIN_RE = /[\p{L}\p{N}-]\.[a-z]{2,63}(?![\p{L}\p{N}]|\.(?:\s|$))/iu

/** `@` und das vollbreite At-Zeichen (U+FF20), das manche Mailprogramme ebenfalls verlinken. */
const AT_RE = /[@\uFF20]/

/**
 * Prüft einen frei gewählten Anzeigenamen. `null` = in Ordnung, sonst der
 * ERSTE gefundene Grund. Leere/zu kurze Namen sind NICHT Sache dieser Regel —
 * die Mindestlänge hängt am jeweiligen Schema (Pflicht- vs. optionales Feld).
 */
export function displayNameProblem(name: string): DisplayNameProblem | null {
  if (name.length > MAX_DISPLAY_NAME_LENGTH) return 'too_long'
  if (CONTROL_RE.test(name)) return 'control'
  if (AT_RE.test(name) || URL_PREFIX_RE.test(name) || DOMAIN_RE.test(name)) return 'links'
  return null
}

/**
 * Nur der LINK-Zweig, für freie Texte, die in einer Mail an eine vom Absender
 * gewählte Adresse zurückzitiert werden (Erstgespräch-Quittung auf
 * branding.supply). Ein Spam-Text ohne Link ist für den Spammer wertlos —
 * eine Nachricht an eine Adresse, die ihm nicht gehört, hat ihren Wert einzig
 * im Link. `@` und Steuerzeichen sind in einem Anliegen dagegen normal
 * („schreibt mir an …"), deshalb nicht `displayNameProblem`.
 */
export function textContainsLink(text: string): boolean {
  return URL_PREFIX_RE.test(text) || DOMAIN_RE.test(text)
}
