/**
 * ADRESSEN IM PROTOKOLL: OHNE QUERY, OHNE FRAGMENT (SEC-013, 2026-11-15).
 *
 * Eine Adresse trägt hinter dem `?` und hinter dem `#` regelmässig Dinge, die
 * nur ihr Empfänger kennen soll (Einmal-Links, Kennungen aus Mails). Der PFAD
 * sagt dem Protokoll alles, was es zur Diagnose braucht — WO es krachte —, der
 * Rest gehört nicht in eine Datei, die länger lebt als der Link.
 *
 * EINE Stelle für drei Schreiber: die Fehler-Annahme (`/api/telemetry/error`),
 * das Browser-Plugin davor und die zentrale 5xx-Zeile (`server/error.ts`).
 * Pure, ohne Nuxt-Importe — App, Server und Tests nutzen dieselbe Rechnung.
 *
 * LANGE KENNUNG IM PFAD (SR1 d, 2026-11-17): ein Abschnitt des Pfads aus 40
 * oder mehr Zeichen `[A-Za-z0-9_-]` wird auf seine ersten sechs Zeichen
 * gekürzt (`/x/abcdef…`). So lang ist bei uns nur eine Zufalls-Kennung aus
 * einem Link (32 Bytes sind 43 bzw. 64 Zeichen); Zeilen-Ids (20 bis 36
 * Zeichen) und gewöhnliche Adressen bleiben ganz. Sechs Zeichen reichen, um
 * zwei Protokoll-Zeilen demselben Link zuzuordnen, und verraten ihn nicht. Ein
 * sehr langer sprechender Abschnitt wird mitgekürzt — der Anfang bleibt lesbar.
 *
 * WAS SIE NICHT KANN: eine KURZE Kennung im Pfad erkennen. Wer dort etwas
 * Vertrauliches unter 40 Zeichen führt, kürzt es selbst.
 */

/**
 * Ein Pfad-Abschnitt, der nur eine lange Zufalls-Kennung sein kann (s. Kopf):
 * direkt hinter einem `/`, mindestens 40 Zeichen, und dahinter endet der
 * Abschnitt (kein Punkt: ein Dateiname mit Endung ist keine Kennung).
 */
const LONG_PATH_SEGMENT = /(\/[\w-]{6})[\w-]{34,}(?![\w.-])/g

/**
 * Lange Kennungen im Pfad kürzen — in einer Adresse oder mitten im Text.
 * Ohne Lookbehind: die Datei läuft auch im Browser, und ältere Safari-Fassungen
 * scheitern daran schon beim Laden.
 */
export function shortenLongPathSegments(value: string): string {
  return value.replace(LONG_PATH_SEGMENT, '$1…')
}

/** Obergrenze für eine geloggte Adresse (der Pfad allein ist nie länger). */
export const LOG_ADDRESS_MAX = 512

/**
 * Eine einzelne Adresse auf das kürzen, was ins Protokoll darf: Schema, Host
 * und Pfad — ohne Zugangsdaten vor dem Host, ohne Query, ohne Fragment.
 * Relative Pfade bleiben relativ.
 */
export function stripAddressForLog(value: string, max = LOG_ADDRESS_MAX): string {
  const raw = value.trim()
  const cut = raw.search(/[?#]/)
  const head = cut === -1 ? raw : raw.slice(0, cut)
  // `schema://nutzer:passwort@host/…` ⇒ `schema://host/…`
  const withoutCredentials = head.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1')
  return shortenLongPathSegments(withoutCredentials).slice(0, max)
}

/**
 * Adressen INNERHALB eines Textes (Fehlermeldung, Stack) kürzen. Getroffen
 * wird nur, was wie eine Adresse aussieht: `schema://…` oder ein Pfad, der
 * mit `/` beginnt. Ein Fragezeichen mitten im Satz bleibt stehen.
 */
const ADDRESS_WITH_TAIL = /((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s?#"'`<>()[\]]*)[?#][^\s"'`<>)\]]*/gi
const ADDRESS_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/@\s"'`<>]*@/gi

export function stripAddressesInText(text: string): string {
  return shortenLongPathSegments(text.replace(ADDRESS_WITH_TAIL, '$1').replace(ADDRESS_CREDENTIALS, '$1'))
}

export interface ClientErrorReport {
  source: string
  message: string
  stack?: string
  url?: string
}

/**
 * Was von einer Browser-Fehlermeldung ins Protokoll geht. Die Längen sind
 * dieselben, die das Schema der Route annimmt — hier noch einmal geklemmt,
 * damit die Zusage nicht am Schema hängt.
 */
export function scrubClientErrorReport(report: ClientErrorReport): ClientErrorReport {
  const scrubbed: ClientErrorReport = {
    source: report.source.slice(0, 64),
    message: stripAddressesInText(report.message).slice(0, 2000),
  }
  if (report.stack !== undefined) scrubbed.stack = stripAddressesInText(report.stack).slice(0, 8000)
  if (report.url !== undefined) scrubbed.url = stripAddressForLog(report.url)
  return scrubbed
}
