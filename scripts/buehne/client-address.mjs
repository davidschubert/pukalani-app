/**
 * Eine eigene Aufrufer-Adresse je Beweis-Skript (OPS-009, GA1 P27, Etappe 3).
 *
 * WARUM ES DAS GIBT: auf der Bühne steht kein Webserver vor den Apps. Alle
 * Skripte kämen deshalb von derselben Adresse (`::1`) und liefen gemeinsam in
 * dieselben Bremsen — etwa höchstens fünf Community-Anlagen je Adresse. Das
 * dritte Skript eines Laufs wäre dann rot, ohne dass am Code etwas falsch ist.
 *
 * Auf Production hängt der Webserver jeder Anfrage die Adresse des Aufrufers
 * hinten an `X-Forwarded-For` an, und die App nimmt das LETZTE Segment
 * (Regel-Quelle: `packages/core/server/utils/clientIp.ts`). Auf der Bühne
 * übernimmt der Läufer diese Rolle: er gibt jedem Skript eine eigene Adresse
 * aus einem privaten Bereich (`10.27.x.y`) in `BUEHNE_CLIENT_ADDRESS` mit und
 * lädt dieses Modul per `node --import` vor.
 *
 * Was es tut: jede Anfrage über `node:http` (`request` und `get`) bekommt
 * `x-forwarded-for: <BUEHNE_CLIENT_ADDRESS>` — es sei denn, das Skript setzt
 * die Kopfzeile selbst (dann gewinnt das Skript, z. B. ein Beweis für die
 * Adress-Regel). Ohne die Variable tut das Modul nichts.
 *
 * Was es NICHT tut: Anfragen über `fetch` bleiben unverändert. Die Beweis-
 * Skripte sprechen die Apps über `node:http` an (wegen der Host-Kopfzeile),
 * `fetch` nehmen sie für Appwrite — und dort zählt die Adresse nicht.
 */
import http from 'node:http'
import { syncBuiltinESMExports } from 'node:module'

const address = process.env.BUEHNE_CLIENT_ADDRESS

/**
 * Setzt die Kopfzeile in das Options-Objekt eines Aufrufs, falls sie fehlt.
 * Erlaubte Formen: `(url, options, cb)`, `(options, cb)`, `(url, cb)` — ein
 * reiner URL-Aufruf hat kein Options-Objekt und bekommt eines angehängt.
 *
 * @param {unknown[]} args
 * @returns {unknown[]}
 */
function withAddress(args) {
  const options = args.find(arg => arg && typeof arg === 'object' && !(arg instanceof URL))
  if (options) {
    const target = /** @type {{ headers?: Record<string, unknown> }} */ (options)
    const headers = target.headers ?? (target.headers = {})
    const present = Object.keys(headers).some(key => key.toLowerCase() === 'x-forwarded-for')
    if (!present) headers['x-forwarded-for'] = address
    return args
  }
  // Nur URL (+ Rückruf): ein Options-Objekt dazwischen schieben.
  const [first, ...rest] = args
  return [first, { headers: { 'x-forwarded-for': address } }, ...rest]
}

if (address) {
  const originalRequest = http.request
  const originalGet = http.get
  http.request = function patchedRequest(...args) {
    return originalRequest.apply(this, withAddress(args))
  }
  // `http.get` ruft intern die ORIGINALE `request` — deshalb eigens ersetzt.
  http.get = function patchedGet(...args) {
    return originalGet.apply(this, withAddress(args))
  }
  // Damit auch `import { request } from 'node:http'` die neue Fassung sieht.
  syncBuiltinESMExports()
}
