/**
 * LINKS AUS GESPEICHERTEN DATEN: NUR http ODER https (SEC-021).
 *
 * Eine Adresse, die ein Mensch eingegeben hat oder die aus einer Zeile kommt,
 * wird nur dann zum Link, wenn sie eine absolute http(s)-Adresse ist. Jedes
 * andere Schema ergibt keinen Link, sondern Text.
 *
 * Zwei Stellen nutzen diese Datei:
 *  - BEIM SPEICHERN: `z.url({ protocol: HTTP_URL_PROTOCOL })` — ohne die
 *    Option nimmt `z.url()` jedes Schema an (Test in core/tests/safeHref.test.ts).
 *  - BEIM ANZEIGEN: `:href="safeExternalHref(wert)"` — auch für Bestandsdaten,
 *    die vor der strengen Prüfung gespeichert wurden. Der Wächter
 *    `core/tests/hrefBindingsGuard.test.ts` zählt jede `:href`-Bindung.
 *
 * Abgrenzung: `isSafeHref` in `markdown.ts` lässt zusätzlich interne Pfade zu
 * (Links im Fließtext) — anderer Zweck, bleibt getrennt.
 *
 * Pure, ohne Nuxt-Importe: Server, App und Tests nutzen dieselbe Funktion.
 */

/** Für `z.url({ protocol })`: Zod prüft das Schema ohne den Doppelpunkt. */
export const HTTP_URL_PROTOCOL = /^https?$/

/** Leerraum, Steuerzeichen (C0 + DEL) — Browser würden sie still entfernen. */
function hasSpaceOrControl(value: string): boolean {
  if (/\s/.test(value)) return true
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7F) return true
  }
  return false
}

/**
 * Wahr nur für eine absolute Adresse mit Schema http oder https — geprüft am
 * Wortlaut (`http://`/`https://` am Anfang, kein Leerraum, keine
 * Steuerzeichen) UND über den Parser des Browsers (`new URL`).
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  if (hasSpaceOrControl(value)) return false
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  }
  catch {
    return false
  }
}

/** Die Adresse, wenn sie `isHttpUrl` ist — sonst `undefined` (dann kein Link). */
export function safeExternalHref(value: unknown): string | undefined {
  return isHttpUrl(value) ? value : undefined
}
