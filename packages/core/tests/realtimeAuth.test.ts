import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isJwtCookieConflict } from '../shared/realtimeAuth'

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
