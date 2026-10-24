import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isValidForwardedHostHeader, isValidHostHeader } from '../shared/requestHost'

/**
 * Die Wache vor allen anderen (Befund 2026-08-09): ein Host-Header mit für
 * URLs verbotenen Zeichen ließ `getRequestURL()` werfen — und damit JEDE
 * Route JEDER App mit 500 antworten.
 *
 * Zwei Fehlerrichtungen, beide teuer: lässt die Wache zu viel durch, ist der
 * 500er zurück; weist sie zu viel ab, ist ein legitimer Host tot — und ZWAR
 * NUR IN PRODUKTION, wo Hosts anders aussehen als `localhost:3000`. Deshalb
 * stehen die gültigen Fälle zuerst.
 */

describe('isValidHostHeader — gültige Hosts kommen durch', () => {
  it('lokale Entwicklung mit Port', () => {
    expect(isValidHostHeader('localhost:3000')).toBe(true)
  })

  it('gewöhnlicher Name ohne Port', () => {
    expect(isValidHostHeader('pukalani.studio')).toBe(true)
  })

  it('Mandanten-Subdomain', () => {
    expect(isValidHostHeader('kunde-a.pukalani.app')).toBe(true)
  })

  /** Punycode ist reines ASCII — eine Umlaut-Domain kommt so über die Leitung. */
  it('Punycode (xn--)', () => {
    expect(isValidHostHeader('xn--mller-kva.de')).toBe(true)
  })

  it('IPv6-Literal in Klammern, mit Port', () => {
    expect(isValidHostHeader('[::1]:8080')).toBe(true)
  })

  it('IPv6-Literal in Klammern, ohne Port', () => {
    expect(isValidHostHeader('[2001:db8::1]')).toBe(true)
  })

  /** Der Host-Header ist nicht auf Kleinschreibung festgelegt. */
  it('Großschreibung', () => {
    expect(isValidHostHeader('GROSS.example.com')).toBe(true)
  })

  it('höchster gültiger Port', () => {
    expect(isValidHostHeader('pukalani.studio:65535')).toBe(true)
    expect(isValidHostHeader('[::1]:65535')).toBe(true)
  })

  it('IPv4 mit Port', () => {
    expect(isValidHostHeader('127.0.0.1:3045')).toBe(true)
  })

  /**
   * Unterstriche gibt es in DNS-Hostnamen nicht, in echten Umgebungen aber
   * doch — und `new URL()` nimmt sie an. Der Maßstab der Wache ist der
   * VERBRAUCHER, nicht RFC 1123: strenger als `new URL()` zu sein hieße,
   * gültigen Verkehr abzuweisen.
   */
  it('Unterstrich (permissiver als DNS, so streng wie new URL)', () => {
    expect(isValidHostHeader('my_host.internal')).toBe(true)
  })
})

describe('isValidHostHeader — fehlgeformte Hosts werden abgewiesen', () => {
  /** DER GEMESSENE VORFALL. */
  it('Anführungszeichen und spitze Klammern (der Prod-Befund)', () => {
    expect(isValidHostHeader('evil.tld"><x>')).toBe(false)
  })

  it('Leerzeichen im Namen', () => {
    expect(isValidHostHeader('a b.tld')).toBe(false)
  })

  it('Leerstring', () => {
    expect(isValidHostHeader('')).toBe(false)
  })

  it('Backslash', () => {
    expect(isValidHostHeader('evil.tld\\path')).toBe(false)
  })

  it('Zeilenumbruch (Header-Injection-Form)', () => {
    expect(isValidHostHeader('evil.tld\r\nX-Foo: bar')).toBe(false)
  })

  it('Schrägstrich schmuggelt einen Pfad in den Host', () => {
    expect(isValidHostHeader('evil.tld/pfad')).toBe(false)
  })

  it('Zugangsdaten-Form mit @', () => {
    expect(isValidHostHeader('user@evil.tld')).toBe(false)
  })

  it('IPv6 OHNE Klammern (new URL wirft darauf)', () => {
    expect(isValidHostHeader('::1')).toBe(false)
  })

  it('Port ohne Ziffern', () => {
    expect(isValidHostHeader('pukalani.studio:')).toBe(false)
  })

  it('Port ist keine Zahl', () => {
    expect(isValidHostHeader('pukalani.studio:abc')).toBe(false)
  })

  it('Port über 65535 — fünf Ziffern sehen gültig aus, new URL wirft', () => {
    // Die Lücke vom 2026-10-23: `\d{1,5}` passt auf `:99999`, ein Port über
    // 65535 ist aber keiner. Kam durch die Wache und ließ `getRequestURL()`
    // eine Middleware später werfen — derselbe 500er, engerer Auslöser.
    expect(isValidHostHeader('pukalani.studio:65536')).toBe(false)
    expect(isValidHostHeader('pukalani.studio:99999')).toBe(false)
    expect(isValidHostHeader('127.0.0.1:70000')).toBe(false)
    expect(isValidHostHeader('[::1]:99999')).toBe(false)
  })

  it('Prozentzeichen', () => {
    expect(isValidHostHeader('evil%2etld')).toBe(false)
  })

  it('Randständige Leerzeichen werden NICHT stillschweigend repariert', () => {
    expect(isValidHostHeader(' pukalani.studio ')).toBe(false)
  })

  it('absurd lang', () => {
    expect(isValidHostHeader(`${'a'.repeat(300)}.tld`)).toBe(false)
  })
})

/**
 * GEGENPROBE MIT DEM ECHTEN VERBRAUCHER: was die Wache durchlässt, muss
 * `new URL()` bauen können — und was sie abweist, darf dort werfen. Ohne
 * diese Schleife wäre die Regex nur mit sich selbst einig.
 */
describe('isValidHostHeader deckt sich mit new URL()', () => {
  const hosts = [
    'localhost:3000',
    'pukalani.studio',
    'xn--mller-kva.de',
    '[::1]:8080',
    'GROSS.example.com',
    '127.0.0.1:3045',
    'my_host.internal',
    'evil.tld"><x>',
    'a b.tld',
    'evil.tld\\path',
    'evil.tld/pfad',
    'user@evil.tld',
    '::1',
    'pukalani.studio:abc',
    'pukalani.studio:65535',
    'pukalani.studio:65536',
    'pukalani.studio:99999',
    '[::1]:65536',
    '127.0.0.1:70000',
  ]

  for (const host of hosts) {
    it(`stimmt für ${JSON.stringify(host)}`, () => {
      let urlWorks = true
      try {
        void new URL('/', `http://${host}`)
      }
      catch {
        urlWorks = false
      }
      // Die Wache darf STRENGER sein als new URL (sie ist es bei
      // `pukalani.studio:` und bei Überlänge), aber NIE lockerer: was sie
      // durchlässt, muss bauen.
      if (isValidHostHeader(host)) expect(urlWorks).toBe(true)
    })
  }
})

/**
 * `X-Forwarded-Host` — der zweite Weg zu demselben 500er (nachgemessen
 * 2026-08-10 am Prod-Build: gültiger `Host:` + `X-Forwarded-Host:
 * evil.tld"><x>` ⇒ 500 auf JEDER Route, weil @nuxtjs/i18n seinen
 * Server-Kontext über `getRequestURL(…, { xForwardedHost: true })` aufbaut).
 */
describe('isValidForwardedHostHeader', () => {
  it('einzelner gültiger Host', () => {
    expect(isValidForwardedHostHeader('pukalani.studio')).toBe(true)
  })

  it('Komma-Liste aus gültigen Hosts (mehrere Proxys)', () => {
    expect(isValidForwardedHostHeader('a.tld, b.tld')).toBe(true)
  })

  it('Komma-Liste ohne Leerzeichen', () => {
    expect(isValidForwardedHostHeader('a.tld,b.tld:8443')).toBe(true)
  })

  /** DER GEMESSENE VORFALL, zweiter Weg. */
  it('einzelner fehlgeformter Host', () => {
    expect(isValidForwardedHostHeader('evil.tld"><x>')).toBe(false)
  })

  /**
   * DIE WICHTIGSTE ZEILE DIESES BLOCKS: h3 nähme heute nur den ERSTEN Eintrag
   * und käme damit durch — die Wache ist hier bewusst strenger, weil
   * „welcher Eintrag gilt?" eine Entscheidung des Verbrauchers ist und sich
   * mit dem nächsten Bump ändern kann.
   */
  it('fehlgeformt an ZWEITER Position (h3 nähme nur den ersten)', () => {
    expect(isValidForwardedHostHeader('pukalani.studio, evil.tld"><x>')).toBe(false)
  })

  it('fehlgeformt an erster Position', () => {
    expect(isValidForwardedHostHeader('evil.tld"><x>, pukalani.studio')).toBe(false)
  })

  /** Schludrige Proxys hängen ein Komma an — das ist KEIN Grund für ein 400. */
  it('leerer Eintrag am Ende ist in Ordnung', () => {
    expect(isValidForwardedHostHeader('a.tld,')).toBe(true)
  })

  it('leerer Eintrag am Anfang ist in Ordnung (h3 fällt auf Host zurück)', () => {
    expect(isValidForwardedHostHeader(', a.tld')).toBe(true)
  })

  it('nur Kommas/Leerraum ist in Ordnung (h3 fällt auf Host zurück)', () => {
    expect(isValidForwardedHostHeader(' , ')).toBe(true)
  })

  it('Leerstring ist in Ordnung (h3 fällt auf Host zurück)', () => {
    expect(isValidForwardedHostHeader('')).toBe(true)
  })

  it('IPv6 in der Liste', () => {
    expect(isValidForwardedHostHeader('[::1]:8080, a.tld')).toBe(true)
  })

  it('Leerzeichen INNERHALB eines Eintrags bleibt fehlgeformt', () => {
    expect(isValidForwardedHostHeader('a b.tld, c.tld')).toBe(false)
  })

  it('Port über 65535 in der Liste', () => {
    expect(isValidForwardedHostHeader('a.tld, b.tld:99999')).toBe(false)
  })

  it('Zeilenumbruch in der Liste', () => {
    expect(isValidForwardedHostHeader('a.tld, evil.tld\r\nX-Foo: bar')).toBe(false)
  })
})

/**
 * DIE REIHENFOLGE IST TEIL DER LÖSUNG. Nitro sortiert die Middleware eines
 * Layers alphabetisch nach Dateinamen — die Wache wirkt nur, wenn sie vor
 * `05.rate-limit.ts` und allen anderen Host-Lesern steht. Eine Umbenennung
 * („warum heißt die nicht 09.…?") wäre sonst eine stille Regression: alle
 * Unit-Tests blieben grün, und der 500er käme in Produktion zurück.
 */
describe('00.host-header.ts läuft als erste Middleware', () => {
  it('steht alphabetisch vor allen anderen Middleware-Dateien', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../server/middleware')
    const files = readdirSync(dir).filter(f => f.endsWith('.ts')).sort()
    expect(files[0]).toBe('00.host-header.ts')
  })
})
