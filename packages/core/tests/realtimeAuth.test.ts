import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isJwtCookieConflict, isRealtimeAccessEnded, isSessionDeleteEvent } from '../shared/realtimeAuth'

/**
 * RT1 (2026-11-08): der geteilte Realtime-Socket verband sich lokal im
 * Sekundentakt neu (167 Sockets in 60 s), weil Appwrite 2.7 JWT + Cookie im
 * selben Handshake ablehnt und das Cookie auf `localhost` jeden Port erreicht.
 * Die Erkennung hängt an Appwrites Fehlertext — der Wortlaut unten ist aus
 * `app/config/errors.php` von appwrite/appwrite:2.7.1 kopiert, nicht erfunden.
 */
const APPWRITE_27_MESSAGE = 'JWT and cookie used in the same request. Use either `setJWT` or `setCookie`. Learn about which authentication method to use in the SSR docs: https://appwrite.io/docs/products/auth/server-side-rendering'

describe('isJwtCookieConflict', () => {
  it('erkennt die Ablehnung von Appwrite 2.7 (403 + Wortlaut)', () => {
    expect(isJwtCookieConflict(APPWRITE_27_MESSAGE, 403)).toBe(true)
    // Das SDK reicht `data.code` unverändert durch — als Zahl, notfalls als String.
    expect(isJwtCookieConflict(APPWRITE_27_MESSAGE, '403')).toBe(true)
  })

  // Gegenproben: jede andere Ablehnung darf den JWT NICHT abschalten — sonst
  // würde ein fremder 403 (Origin, gesperrtes Projekt) den Socket still zum Gast machen.
  it('ignoriert andere 403 und denselben Text unter anderem Code', () => {
    expect(isJwtCookieConflict('Invalid Origin. Register your new client as a new platform', 403)).toBe(false)
    expect(isJwtCookieConflict('User (role: guests) missing scopes (["account"])', 403)).toBe(false)
    expect(isJwtCookieConflict(APPWRITE_27_MESSAGE, 401)).toBe(false)
    expect(isJwtCookieConflict(APPWRITE_27_MESSAGE, 1008)).toBe(false)
  })

  it('übersteht fehlende Angaben (Socket-Fehler ohne Nachricht)', () => {
    expect(isJwtCookieConflict(undefined, undefined)).toBe(false)
    expect(isJwtCookieConflict('WebSocket error', undefined)).toBe(false)
    expect(isJwtCookieConflict(undefined, 403)).toBe(false)
  })
})

/**
 * Die Verdrahtung im Composable lässt sich ohne Nuxt-Laufzeit nicht ausführen
 * (dynamischer SDK-Import, Auth-Store) — deshalb hält dieser Test die drei
 * Stellen fest, an denen der Cookie-Modus wirken MUSS. Fehlt eine, kehrt der
 * Loop zurück: ohne onError keine Erkennung, ohne die Wache in fetchJwt setzt
 * der 12-min-Refresh den JWT wieder, ohne die Wache in ensureRealtimeJwt holt
 * jeder Login einen neuen. Der Live-Beweis (0 Reconnects in 60 s, Event kommt
 * an) steht in OPEN-ITEMS-COMPLETE unter RT1.
 */
describe('useRealtimeClient — Cookie-Modus ist verdrahtet', () => {
  const src = readFileSync(new URL('../app/composables/useRealtimeClient.ts', import.meta.url), 'utf8')

  it('hört auf die Realtime-Fehler des geteilten Sockets', () => {
    expect(src).toMatch(/realtime\.onError\([\s\S]{0,120}isJwtCookieConflict\(error\?\.message, code\)[\s\S]{0,40}switchToCookieAuth\(rtClient\)/)
  })

  it('räumt den JWT beim Umschalten weg und stoppt den Refresh', () => {
    const fn = src.slice(src.indexOf('function switchToCookieAuth'), src.indexOf('function switchToCookieAuth') + 400)
    expect(fn).toContain(`rtClient.setJWT('')`)
    expect(fn).toContain('stopJwtRefresh()')
  })

  it('setzt im Cookie-Modus keinen JWT mehr — weder beim Abruf noch beim Start', () => {
    const fetchFn = src.slice(src.indexOf('async function fetchJwt'), src.indexOf('clients.rtClient.setJWT(jwt)'))
    expect(fetchFn).toContain('if (useCookieAuth)')
    const ensureFn = src.slice(src.indexOf('export function ensureRealtimeJwt'), src.indexOf('jwtPromise = fetchJwt()'))
    expect(ensureFn).toContain('if (useCookieAuth)')
  })
})

/**
 * RT2 (2026-11-08): der Account-WS war in Prod ein Gast (host-only Cookie
 * erreicht `api.pukalani.app` nie) — Session widerrufen, Tab nach 98,5 s noch
 * angemeldet. Seit RT2 hängt die Sofort-Abmeldung am geteilten Socket: Appwrite
 * 2.7 schickt beim Widerruf einen 401-Frame (`USER_UNAUTHORIZED`, Wortlaut aus
 * `app/config/errors.php` von 2.7.1) und schließt auch JWT-Verbindungen.
 */
describe('isRealtimeAccessEnded', () => {
  it('erkennt den Entzug am Code 401 — als Zahl oder String', () => {
    expect(isRealtimeAccessEnded(401)).toBe(true)
    expect(isRealtimeAccessEnded('401')).toBe(true)
  })

  it('der RT1-Konflikt (403) und Socket-Fehler ohne Code sind kein Entzug', () => {
    expect(isRealtimeAccessEnded(403)).toBe(false)
    expect(isRealtimeAccessEnded(1008)).toBe(false)
    expect(isRealtimeAccessEnded(undefined)).toBe(false)
  })
})

describe('Sofort-Abmeldung hängt am geteilten Socket (RT2)', () => {
  const client = readFileSync(new URL('../app/composables/useRealtimeClient.ts', import.meta.url), 'utf8')
  const account = readFileSync(new URL('../app/composables/useRealtimeAccount.ts', import.meta.url), 'utf8')
  const plugin = readFileSync(new URL('../app/plugins/realtime-account.client.ts', import.meta.url), 'utf8')

  it('der geteilte Socket meldet den Entzug nur, wenn er angemeldet war', () => {
    expect(client).toMatch(/realtime\.onError\([\s\S]{0,400}jwtReady && isRealtimeAccessEnded\(code\)[\s\S]{0,40}accessEndedListeners\.forEach/)
  })

  it('der Account-Channel läuft über den geteilten Socket, nicht über einen eigenen WebSocket', () => {
    expect(account).toContain('realtime.subscribe(Channel.account()')
    expect(account).toContain('onRealtimeAccessEnded(options.onAccessEnded)')
    expect(account).not.toMatch(/new WebSocket\(/)
  })

  it('das Plugin prüft die Session bei Event UND bei Entzug', () => {
    expect(plugin).toContain('useRealtimeAccount(event => verify(isSessionDeleteEvent(event.events)), { onAccessEnded: () => verify() })')
    // Die Bremse verwirft nichts mehr — sie plant (accountVerifyAt).
    expect(plugin).toContain('accountVerifyAt(lastVerifyAt, now, urgent)')
    expect(plugin).not.toContain('accountVerifyDue(')
  })

  // Ohne Neuaufbau schließt Appwrite den Socket beim Ablauf des ERSTEN JWT
  // (401, das auslösende Event geht verloren) — und jeder 401 wäre ein Fehlalarm.
  it('der 12-min-Refresh verbindet den Socket mit dem neuen JWT neu', () => {
    expect(client).toContain('setInterval(() => { void refreshJwtAndReconnect() }, JWT_REFRESH_MS)')
    const fn = client.slice(client.indexOf('async function refreshJwtAndReconnect'), client.indexOf('async function refreshJwtAndReconnect') + 300)
    expect(fn).toContain('await fetchJwt()')
    expect(fn).toContain('reconnectSocket(')
  })
})

describe('isSessionDeleteEvent', () => {
  // Ereignisnamen wie Appwrite 2.7.1 sie auf `account` zustellt
  // (Event-Frame `events[]`, im RT2-E2E mitgelesen).
  it('erkennt das Löschen einer Session', () => {
    expect(isSessionDeleteEvent(['users.6a5c.sessions.6af0.delete', 'users.*.sessions.*.delete', 'users.*'])).toBe(true)
    expect(isSessionDeleteEvent(['users.6a5c.sessions.6af0.delete'])).toBe(true)
  })

  it('Gegenproben: Anlegen, Profil, Presence und leere Liste sind KEIN Widerruf', () => {
    expect(isSessionDeleteEvent(['users.6a5c.sessions.6af0.create', 'users.*.sessions.*.create'])).toBe(false)
    expect(isSessionDeleteEvent(['users.6a5c.update.prefs', 'users.6a5c.update'])).toBe(false)
    expect(isSessionDeleteEvent(['users.6a5c.delete'])).toBe(false)
    expect(isSessionDeleteEvent([])).toBe(false)
  })
})
