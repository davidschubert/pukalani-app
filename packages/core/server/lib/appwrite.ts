import { Client, Account, TablesDB, Storage, Users, Presences, Avatars } from 'node-appwrite'
import type { H3Event } from 'h3'
import { trustedClientIp } from '../utils/clientIp'
import { createAppwriteHealth } from '../utils/appwriteHealth'

/**
 * Projekt des Requests (Horizont-3 Naht 2): der Tenant-Context der Middleware
 * 00.tenant.ts gewinnt, sonst das .env-Projekt — ohne Tenant (heutiger
 * Betrieb, Tests) exakt das bisherige Verhalten.
 */
function resolvedProjectId(event: H3Event | undefined): string {
  const config = useRuntimeConfig(event)
  return event?.context.tenant?.projectId ?? config.public.appwriteProjectId
}

/**
 * Cookie-Name nach Konzept A3: a_session_<PROJECT_ID>.
 * Das Web SDK erkennt dieses Cookie automatisch — Browser-Realtime
 * läuft damit authentifiziert statt anonym. Zieht im Tenant-Betrieb
 * automatisch mit dem aufgelösten Projekt mit (Naht 2).
 */
export function sessionCookieName(event: H3Event): string {
  return `a_session_${resolvedProjectId(event)}`
}

/**
 * Session-Cookie setzen/löschen — httpOnly + sameSite immer, secure in
 * Produktion (localhost hat kein HTTPS, daher konditional via import.meta.dev).
 *
 * Embed-Modus (E2, § 3a): `partitioned` setzt DASSELBE Cookie als
 * CHIPS-partitioniertes `SameSite=None; Secure; Partitioned` — nur für den
 * Embed-Kontext (/api/auth/embed-session), NIE für die Haupt-App (dort
 * bleibt 'strict', sonst fällt der CSRF-Schutz; Backstop dafür ist die
 * csrf-origin-Middleware). Partitioned verlangt Secure — der Modus ist
 * daher nur unter HTTPS wirksam (Dev-http: Browser verwirft es, der
 * Cross-Site-Beweis läuft auf echten Domains).
 */
export function setSessionCookie(event: H3Event, secret: string, expire: string, options?: { partitioned?: boolean }) {
  const partitioned = options?.partitioned === true
  setCookie(event, sessionCookieName(event), secret, {
    expires: new Date(expire),
    path: '/',
    httpOnly: true,
    secure: partitioned ? true : !import.meta.dev,
    /**
     * `lax`, NICHT `strict` (U14-Livefund, 2026-08-20): ein Strict-Cookie
     * wird auf einer Top-Level-Navigation, deren Redirect-Kette EXTERN begann,
     * nicht mitgeschickt. Genau das ist der Google-Login: accounts.google.com
     * → Appwrite-Callback → unser Callback → 302 auf `/` — die erste Seite
     * nach der Anmeldung kam damit OHNE Session an und zeigte dem frisch
     * angemeldeten Menschen den „Anmelden"-Knopf, bis er von Hand neu lud.
     * `lax` ist die Standardwahl für Session-Cookies aus genau diesem Grund:
     * Cross-Site-POSTs (CSRF-Fläche) tragen es weiterhin NICHT, und alle
     * Mutationen dieses Hauses sind POST/PATCH/DELETE; als zweites Netz steht
     * `03.csrf-origin.ts` bereit. Wer hier zurück auf `strict` dreht, bricht
     * jeden OAuth-Rückweg — und sieht es nur als „komisch, erst nach Reload
     * eingeloggt".
     */
    sameSite: partitioned ? 'none' : 'lax',
    partitioned,
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, sessionCookieName(event), { path: '/' })
}

/**
 * UI-Sprache des Requests (i18n_redirected-Cookie von @nuxtjs/i18n,
 * detectBrowserLanguage redirectOn 'all' hält es aktuell). Nur Format
 * validieren, KEINE App-Locale-Whitelist: Appwrite bringt ~60 Übersetzungen
 * mit und fällt bei unbekannten Codes selbst auf Englisch zurück — neue
 * App-Sprachen (es, pl, …) funktionieren damit ohne Änderung hier.
 */
export function requestLocale(event?: H3Event): string | undefined {
  if (!event) return undefined
  const cookie = getCookie(event, 'i18n_redirected')
  return cookie && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(cookie) ? cookie : undefined
}

/**
 * Reicht den Browser-User-Agent an Appwrite weiter, damit serverseitig erzeugte
 * Sessions das echte Gerät (Browser + Version + OS) statt des Node-SDK
 * aufzeichnen — plus die UI-Sprache (X-Appwrite-Locale), damit Appwrite-Mails
 * (Verification/OTP/Recovery) in der Sprache des Users rausgehen — plus die
 * Client-IP: ohne sie geolokalisiert Appwrite die IP des NUXT-SERVERS und
 * jede Session stand mit „Deutschland" (Hetzner) auf der Sessions-Seite,
 * egal wo der Mensch saß (2026-08-22 live aufgefallen; dieselbe Klasse wie
 * der Plausible-Fix in stats-event.post.ts). Das SDK hat kein
 * `setForwardedFor` — der Header ist der vorgesehene Weg, und `trustedClientIp`
 * liefert das nicht-fälschbare LETZTE X-Forwarded-For-Segment. Geehrt wird
 * der Header nur im Admin-Modus (API-Key) — Sessions entstehen genau dort
 * (login/signup/otp/oauth laufen über createAdminClient). Bestands-Sessions
 * behalten ihr eingefrorenes Land bis zum nächsten Login.
 */
function forwardClientContext(client: Client, event?: H3Event) {
  if (!event) return
  const userAgent = getHeader(event, 'user-agent')
  if (userAgent) client.setForwardedUserAgent(userAgent)
  const ip = trustedClientIp(event)
  if (ip) client.addHeader('x-forwarded-for', ip)
  const locale = requestLocale(event)
  if (locale) client.setLocale(locale)
}

/**
 * AdminClient — authentifiziert per API Key (server-only, Resource-based
 * mit minimalen Scopes). Nur für privilegierte Operationen: Signup,
 * Admin-Aktionen, Rate-Limit-Bypass.
 */
export function createAdminClient(event?: H3Event) {
  const config = useRuntimeConfig(event)
  const projectId = resolvedProjectId(event)
  // Naht-2-Grenze (bewusst): der API-Key der .env gehört zum .env-Projekt.
  // Pool-Tenants teilen genau dieses Projekt → identische projectId, Key passt.
  // Ein DYNAMISCHER Silo-Tenant (fremdes Projekt) braucht eine Key-Registry —
  // die ist eine spätere Etappe. Bis dahin: fail-loud statt 401-Salat mit
  // falschem Key (still falsche Credentials wären unschuldbar schwer zu debuggen).
  if (projectId !== config.public.appwriteProjectId) {
    throw createError({ status: 501, statusText: 'Dynamic silo admin access not implemented' })
  }
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(projectId)
    .setKey(config.appwriteKey)

  forwardClientContext(client, event)

  // Lazy get-Accessors: nur genutzte Services werden instanziiert
  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
    // node-appwrite 28: der `Health`-Service ist seit 27 aus dem SDK entfernt.
    // Ersatz ist ein REST-Helfer mit denselben Methodennamen — die Endpunkte
    // gibt es auf Appwrite 1.9.6 unverändert.
    get health() { return createAppwriteHealth(config.public.appwriteEndpoint, projectId, config.appwriteKey) },
    get storage() { return new Storage(client) },
    get users() { return new Users(client) },
    get presences() { return new Presences(client) },
  }
}

/**
 * SessionClient — agiert als der eingeloggte User (Session-Cookie).
 * Pro Request NEU erstellen, NIE über Requests teilen — sonst leakt
 * eine User-Session in fremde Responses.
 */
export function createSessionClient(event: H3Event, secret?: string) {
  const config = useRuntimeConfig(event)
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    // Naht 2: Tenant-Projekt (Middleware 00.tenant.ts) vor .env-Projekt —
    // Session-Cookie-Name zieht über sessionCookieName() automatisch mit.
    .setProject(resolvedProjectId(event))

  // `secret` ist die Ausnahme für eine Session, die es im REQUEST noch nicht
  // gibt: der Login setzt sein Cookie auf die ANTWORT, `getCookie` liest aber
  // die Anfrage — ohne diesen Weg könnte die Login-Route ihre eigene frische
  // Session nicht befragen („braucht die noch einen zweiten Faktor?", U15
  // Teil 4). Sonst gilt unverändert: Cookie, und pro Request neu.
  const session = secret ?? getCookie(event, sessionCookieName(event))
  if (session) client.setSession(session)

  forwardClientContext(client, event)

  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
    get storage() { return new Storage(client) },
    // Avatars: bislang nur fürs QR-Bild der Zwei-Faktor-Einrichtung (U15
    // Teil 4). Bewusst am SESSION-Client — der Aufruf gehört dem Nutzer.
    get avatars() { return new Avatars(client) },
  }
}
