/**
 * ── JWT ODER COOKIE? WER AUTHENTIFIZIERT DEN GETEILTEN REALTIME-SOCKET (RT1, 2026-11-08) ──
 *
 * Der geteilte SDK-Socket (`useRealtimeClient`) trägt einen kurzlebigen JWT in
 * der URL, weil das httpOnly-Session-Cookie Appwrite normalerweise NICHT
 * erreicht: es ist HOST-ONLY (kein `Domain`, `core/server/lib/appwrite.ts`) und
 * gehört `comments.pukalani.app`, der Socket geht an `api.pukalani.app`.
 *
 * ES GIBT ABER DEN FALL, IN DEM DAS COOKIE DOCH ANKOMMT: App und Appwrite auf
 * DEMSELBEN Host. Cookies kennen keine Ports — lokal teilen sich
 * `localhost:3001` (Nuxt) und `localhost:80` (Appwrite) dasselbe Cookie-Glas,
 * der Browser schickt `a_session_<projekt>` beim WebSocket-Handshake also mit.
 * Seit Appwrite 2.7 prüft der Realtime-Server dann wie die HTTP-Schicht:
 * gültige Cookie-Session UND JWT ⇒ 403 `user_jwt_and_cookie_set`
 * (`app/init/realtime/connection.php`), danach schließt er den Socket. Das
 * Web-SDK nullt seinen Reconnect-Zähler bei jedem `open` und verbindet daher
 * im Sekundentakt neu — gemessen 167 Sockets in 60 s, kein einziges Event.
 *
 * Der Ausweg ist KEINE Vorhersage, ob das Cookie ankommt (Host-Vergleich,
 * Secure-Flag, Proxy-Header — jede falsche Vorhersage hieße „stiller
 * Gast-Socket", schlimmer als der laute Loop), sondern Appwrites eigene
 * Antwort: kommt genau diese Ablehnung, IST das Cookie da und gültig — dann
 * reicht es allein, und der JWT bleibt für diesen Tab weg.
 *
 * Das Web-SDK reicht nur `message` und `code` an `onError` weiter, nicht den
 * Fehler-Typ. Deshalb der Text-Abgleich; ändert Appwrite die Formulierung,
 * fällt das Verhalten auf den Loop von vorher zurück — nicht auf etwas Stilleres.
 * Der Wortlaut ist in `tests/realtimeAuth.test.ts` festgehalten.
 */
export function isJwtCookieConflict(message: string | undefined, code: number | string | undefined): boolean {
  if (Number(code) !== 403) return false
  return /\bJWT and cookie\b/i.test(message ?? '')
}
