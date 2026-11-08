import { realtimeAllowed } from '../../shared/realtimeGate'

export interface AccountRealtimeEvent {
  events: string[]
  payload: unknown
}

/**
 * Realtime auf dem `account`-Channel des eingeloggten Users — Session- und
 * Account-Änderungen (z.B. ein Admin beendet die Sessions, Login/Logout auf
 * einem anderen Gerät).
 *
 * ── AUF DEM GETEILTEN SOCKET (RT2, 2026-11-08 — vorher eigener Cookie-WS) ──
 * Bis RT2 war das ein eigener, cookie-authentifizierter nativer WebSocket, mit
 * der Begründung, nur ein Cookie-Socket werde beim Session-Widerruf
 * geschlossen. Beides stimmt seit Appwrite 2.7 nicht mehr bzw. traf in Prod nie
 * zu:
 * - Das Session-Cookie ist host-only (`setSessionCookie`, kein `Domain`) und
 *   erreicht `api.pukalani.app` nie — der Cookie-WS verband sich in Prod als
 *   GAST (`connected`, `user: null`) und bekam weder Event noch Abbruch.
 *   Gemessen 2026-11-08: Session widerrufen, Server 401 nach 1,2 s, der Tab
 *   nach 98,5 s noch angemeldet. Lokal fiel es nicht auf, weil `localhost`
 *   App und Appwrite dasselbe Cookie gibt.
 * - Appwrite 2.7 bindet JEDE angemeldete Verbindung an ihre Session, auch die
 *   JWT-Verbindung (`sessionId` aus dem JWT). Beim Widerruf stellt der Server
 *   erst das `account`-Event zu, dann einen 401-Frame, dann schließt er
 *   (`Realtime/Event/Handler.php`, `revalidateUser`).
 * Der geteilte Socket ist in Prod per JWT und lokal per Cookie (RT1)
 * angemeldet — beides session-gebunden. Ein Socket weniger je Tab, kein
 * eigener Ping/Backoff mehr (die SDK pingt alle 20 s und verbindet neu).
 *
 * Zwei Signale, beide gehen an den Aufrufer:
 * - `callback`: jedes Event auf `account` (Session angelegt/gelöscht, Profil …)
 * - `onAccessEnded`: Appwrite hat dem Socket den Zugang entzogen (401-Frame,
 *   `onRealtimeAccessEnded`) — kommt auch dann, wenn das Event fehlt.
 *
 * - SSR: no-op (import.meta.server Guard)
 * - Config-Gate `pukalani.realtime.enabled` + Endpoint/Projekt (F14)
 * - Cleanup via onScopeDispose bzw. Rückgabewert
 */
export function useRealtimeAccount(
  callback: (event: AccountRealtimeEvent) => void,
  options: { onAccessEnded?: () => void } = {},
): () => void {
  if (import.meta.server) return () => {}

  const config = useRuntimeConfig()
  if (!realtimeAllowed(realtimeEnabled(), config.public.appwriteEndpoint, config.public.appwriteProjectId)) return () => {}

  let sub: { unsubscribe?: () => void, close?: () => void } | undefined
  let disposed = false
  const stopAccessEnded = options.onAccessEnded ? onRealtimeAccessEnded(options.onAccessEnded) : undefined

  // SYNCHRON anstoßen (noch im Setup): liest die Runtime-Config, nach dem
  // ersten await ist der Nuxt-Kontext weg (s. useRealtimeRows).
  const jwtReady = ensureRealtimeJwt()

  void (async () => {
    // Direkt destrukturiert — Tree-Shaking des SDK-Chunks (useRealtimeClient.ts).
    const { Channel } = await import('appwrite')
    const realtime = await sharedRealtime()
    if (disposed || !realtime) return
    // Angemeldet verbinden, BEVOR der Socket steht — als Gast bekäme der
    // `account`-Channel nichts (Rolle `user:<id>` fehlt).
    await jwtReady
    if (disposed) return
    try {
      sub = await realtime.subscribe(Channel.account(), (event) => {
        callback({ events: event.events ?? [], payload: event.payload })
      })
      if (disposed) { void (sub.unsubscribe ?? sub.close)?.(); sub = undefined }
    }
    catch { /* Socket nicht verfügbar → /api/auth/me bei der nächsten Anfrage bleibt das Netz */ }
  })()

  const close = () => {
    disposed = true
    stopAccessEnded?.()
    try { (sub?.unsubscribe ?? sub?.close)?.() }
    catch { /* ignore */ }
    sub = undefined
  }

  // Aufrufer außerhalb eines EffectScopes (z.B. Plugin mit manuellem
  // Lifecycle über den Rückgabewert) lösen sonst eine Vue-Warnung aus.
  if (getCurrentScope()) onScopeDispose(close)

  return close
}
