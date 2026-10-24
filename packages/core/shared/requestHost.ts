/**
 * DER HOST-HEADER IST CLIENT-EINGABE — die pure Formprüfung dazu.
 *
 * GEMESSENER VORFALL (2026-08-09, an einem PROD-BUILD der portfolio-App):
 * ein Request mit `Host: evil.tld"><x>` ließ `getRequestURL()` mit
 * `TypeError: Invalid URL, base: 'http://evil.tld"><x>'` werfen. h3 baut die
 * Request-URL als `new URL(path, protocol + '://' + host)`, und `"`, `<`, `>`
 * und Leerzeichen sind im Host-Teil einer URL verbotene Zeichen. Der
 * Stacktrace zeigte auf die zentrale Rate-Limit-Middleware des core-Layers —
 * die liest die URL als ERSTES und ungeschützt, also antwortete JEDE Route
 * JEDER App mit 500. Das ist gleich dreifach schlecht: eine Fehlermeldung, die
 * mehr verrät als nötig, ein Monitoring-Fehlalarm (5xx-Rate), und ein
 * Einzeiler, mit dem ein Fremder ihn auslösen kann.
 *
 * WAS HIER GEPRÜFT WIRD, IST DIE **FORM**, NICHT DIE ZUGEHÖRIGKEIT. Ob ein
 * Host zu dieser Installation gehört, beantworten ganz andere Stellen — der
 * Mandanten-Resolver (`00.tenant.ts` ⇒ 404 für unbekannte Hosts) und nginx.
 * Diese Funktion sagt nur: „lässt sich daraus überhaupt eine URL bauen?".
 * Ein legitimer FREMD-Host (`pukalani.studio` auf einem portfolio-Server)
 * muss deshalb DURCHKOMMEN — sonst wäre die Wache eine zweite, blindere
 * Kopie der Host-Autorisierung, und die Fehlerantwort käme aus der falschen
 * Schicht.
 *
 * ERLAUBT ist damit bewusst mehr, als DNS zulässt (Unterstriche etwa gibt es
 * in echten Hostnamen): der Maßstab ist `new URL()`, nicht RFC 1123. Eine
 * Wache, die strenger ist als der Verbraucher, weist gültigen Verkehr ab —
 * das wäre ein Ausfall, den niemand mit dieser Datei in Verbindung bringt.
 */

/**
 * Obergrenze: ein DNS-Name ist maximal 253 Zeichen lang, dazu `:` und
 * höchstens fünf Portziffern. Ein IPv6-Literal in Klammern ist mit 47+6
 * Zeichen deutlich kürzer. 260 lässt also jeden gültigen Host durch und
 * schneidet nur Unfug ab, den sonst jede spätere Zeichenkette mitschleppt.
 */
const MAX_HOST_HEADER_LENGTH = 260

/**
 * IPv6-Literal: MUSS in eckigen Klammern stehen (`[::1]`, `[::1]:8080`).
 * Ohne Klammern (`Host: ::1`) wirft `new URL()` — das ist kein gültiger
 * Host-Header, sondern ein kaputter Client.
 */
const IPV6_HOST = /^\[[0-9a-f:.]+\](?::(\d{1,5}))?$/i

/**
 * Name oder IPv4, optional mit Port. Buchstaben/Ziffern/`.`/`-`/`_` decken
 * Punycode (`xn--mller-kva.de`) ab, weil Punycode reines ASCII ist; die
 * Groß-/Kleinschreibung ist im Host-Header frei (`GROSS.example.com`).
 * Nicht enthalten und damit abgewiesen: genau die Zeichen, die `new URL()`
 * im Host verbietet — `" < > # % / ? @ [ ] ^ | \` sowie Leerzeichen,
 * Tabulator und Zeilenumbruch.
 */
const NAMED_HOST = /^[a-z0-9._-]+(?::(\d{1,5}))?$/i

/**
 * PURE (unit-getestet): Lässt sich aus diesem Host-Header eine URL bauen?
 *
 * `false` heißt: der Request ist fehlgeformt und wird mit **400** beantwortet
 * (s. `server/middleware/00.host-header.ts`). Ein leerer String ist hier
 * bewusst `false` — dass ein FEHLENDER Header etwas anderes ist als ein
 * fehlgeformter, entscheidet die Middleware, nicht diese Rechnung.
 */
export function isValidHostHeader(host: string): boolean {
  if (typeof host !== 'string') return false
  if (host.length === 0 || host.length > MAX_HOST_HEADER_LENGTH) return false
  // Kein Trimmen: ein Header mit Leerzeichen am Rand ist bereits fehlgeformt,
  // und stillschweigend zu reparieren hieße, zwei Schichten könnten sich über
  // den Wert uneinig sein (die Wache prüft die getrimmte, h3 baut die rohe).
  const match = host.startsWith('[') ? IPV6_HOST.exec(host) : NAMED_HOST.exec(host)
  if (!match) return false
  return portIsBuildable(match[1])
}

/**
 * DER PORT IST DIE EINE STELLE, DIE EINE ZEICHEN-REGEX NICHT ENTSCHEIDEN KANN
 * (Lücke gemessen 2026-10-23, Gegenprobe gegen `new URL()`).
 *
 * `\d{1,5}` passt auch auf `:99999` — fünf Ziffern sehen gültig aus, der
 * URL-Parser wirft darauf aber, weil ein Port über **65535** keiner ist.
 * `Host: pukalani.studio:99999` kam damit durch die Wache und ließ
 * `getRequestURL()` eine Middleware später werfen: derselbe 500er auf jeder
 * Route, nur mit engerem Auslöser. Der Maßstab dieser Datei ist `new URL()`,
 * und der kennt eine ZAHLENgrenze — also muss hier gerechnet werden, nicht
 * gezählt.
 *
 * Führende Nullen sind in Ordnung (`:00080` ⇒ 80, `new URL()` normalisiert
 * selbst); die Länge deckelt bereits `\d{1,5}`, `Number()` kann hier also
 * nicht überlaufen.
 */
function portIsBuildable(port: string | undefined): boolean {
  if (port === undefined) return true
  return Number(port) <= 65_535
}

/**
 * PURE (unit-getestet): dasselbe für `X-Forwarded-Host`.
 *
 * WARUM ES DIESE ZWEITE FUNKTION BRAUCHT (nachgemessen 2026-08-10 am
 * Prod-Build): `Host:` ist nicht der einzige Weg zu einer Request-URL. Zwei
 * Verbraucher lesen `getRequestURL(event, { xForwardedHost: true })` und
 * nehmen damit ZUERST diesen Header:
 *  - **@nuxtjs/i18n** in `initializeI18nContext` (Nitro-`request`-Hook) — und
 *    dessen Fehler verschluckt Nitro STILL
 *    (`callHook('request').catch(captureError)`). Der Kontext fehlt danach
 *    einfach, und der SSR-Render kippt später mit „Nuxt I18n server context
 *    has not been set up yet" in einen **500 auf JEDER Seite**, auch auf `/`.
 *  - **Nitros eigener `defaultHandler`**, der im Fehlerpfad die URL für Log
 *    und Antwortkörper baut (die Stacktrace-Flut).
 * Ein gültiger `Host:` mit fehlgeformtem `X-Forwarded-Host` reproduzierte den
 * ursprünglichen Befund also unverändert — die Wache auf `host` allein war zu
 * schmal.
 *
 * ── WARUM JEDER EINTRAG GEPRÜFT WIRD, NICHT NUR DER ERSTE ──────────────────
 * Hängen mehrere Proxys an, wird der Header zur Komma-Liste (`a.tld, b.tld`).
 * h3 nimmt heute den ERSTEN Eintrag (`.split(',').shift().trim()`); nur den zu
 * prüfen wäre die knappste Fassung und zugleich die zerbrechlichste. „Welcher
 * Eintrag gilt?" ist eine Entscheidung DES VERBRAUCHERS — h3 nimmt den ersten,
 * andere Werkzeuge und nginx-Konfigurationen den letzten —, und sie kann sich
 * mit dem nächsten Bump ändern. Eine Wache, die an dieser Tie-Break-Regel
 * klebt, steht nach einem Update still wieder offen. Ein Eintrag mit
 * URL-verbotenen Zeichen ist ohnehin an KEINER Position legitim: eine echte
 * Proxy-Kette enthält nur Hostnamen.
 *
 * LEERE Einträge (`'a.tld,'`, `', a.tld'`) sind dagegen ausdrücklich in
 * Ordnung — sie kommen von schludrigen Proxys, und h3 fällt bei leerem ersten
 * Eintrag sauber auf `Host:` zurück. Ein 400 dafür wäre ein selbstgemachter
 * Ausfall. Sind ALLE Einträge leer, gilt dasselbe.
 */
export function isValidForwardedHostHeader(value: string): boolean {
  if (typeof value !== 'string') return false
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean)
  if (entries.length === 0) return true
  return entries.every(isValidHostHeader)
}
