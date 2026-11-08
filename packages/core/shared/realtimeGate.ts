/**
 * ── DARF DIESE APP EINE REALTIME-VERBINDUNG AUFBAUEN? (F14, 2026-08-01) ──────
 *
 * EINE pure Regel für alle Realtime-Einstiege des Core (Row-Streams, Presence,
 * Account-WS). Sie beantwortet zwei Fragen auf einmal, weil beide dasselbe
 * bedeuten — „hier gibt es nichts zu abonnieren":
 *
 * 1. DAS CONFIG-GATE `pukalani.realtime.enabled` (Core-Default AN). Apps, die
 *    bewusst keine lebende Datenebene haben — die Marketing-Startseite, die
 *    Hilfe-Site — schalten es aus. Ohne das Gate erbte JEDE App, die core
 *    erweitert, das Config-Plugin (`realtime-config.client.ts`): eine statische,
 *    kontenlose Landingpage lud das 76-kB-Web-SDK nach und öffnete einen
 *    Gast-WebSocket, um `app_config`-Flags zu abonnieren, die sie nirgends liest.
 * 2. DIE DATENEBENE. Ohne Datenbank-/Tabellen-Id (bzw. ohne Endpoint/Projekt
 *    beim Account-WS) wirft der SDK-Kanalbau „Channel ID is required" — in
 *    einem PLUGIN wird daraus ein fataler App-Start-Fehler (Live-Vorfall
 *    2026-07-29: help.pukalani.app lieferte sauberes SSR-HTML, und der Browser
 *    malte eine 500-Seite darüber).
 *
 * WARUM DEFAULT AN, wo der Core sonst jedes Gate ausschaltet: Realtime ist kein
 * Zusatz, den eine App anschaltet, sondern das BESTEHENDE Verhalten jeder
 * Produkt-App (Kommentare, Presence, Live-Branding). Ein Default AUS würde sie
 * alle stillschweigend entkoppeln — und der Ausfall wäre unsichtbar (die Seite
 * sieht richtig aus, sie aktualisiert sich nur nicht mehr). Ein überflüssiger
 * Socket ist ein Kostenfehler, eine fehlende Live-Aktualisierung ein
 * Produktfehler; deshalb muss die stillere Wahl die AUSDRÜCKLICHE sein.
 *
 * `enabled !== false` statt `=== true`: fehlt der Schlüssel (Test ohne
 * App-Config, App mit `realtime: {}`), gilt der Core-Default.
 */
export function realtimeAllowed(
  enabled: boolean | undefined,
  ...requiredIds: (string | undefined)[]
): boolean {
  if (enabled === false) return false
  return requiredIds.every(id => !!id)
}

/**
 * ── WIE OFT DARF EIN VERBINDUNGSABBRUCH DEN AUTH-STAND NACHPRÜFEN? ──────────
 *
 * `realtime-account.client.ts` prüft nach jedem Account-Ereignis und jedem
 * 401 des geteilten Sockets, ob die eigene Session noch lebt (`auth.refresh()`
 * → `/api/auth/me` + `/api/community/role`). Bis RT2 (2026-11-08) hing das am
 * Schliessen eines eigenen Cookie-Sockets; für den galt der Rest dieses
 * Abschnitts, und für 401-Stürme gilt er weiter.
 *
 * Ohne Bremse ist es aber auch ein VERSTÄRKER: steht der Socket nicht (toter
 * `appwrite-realtime`-Container, geflappte Verbindung), wird aus jedem
 * Reconnect-Versuch ein Doppel-Abruf. Der Reconnect selbst hat exponentiellen
 * Backoff (1 s → 15 s Deckel), also dauerhaft vier Doppel-Abrufe pro Minute,
 * je offenem Tab — für eine Frage, deren Antwort sich nicht ändert.
 *
 * 30 s. Die alte Annahme „nach einer normal stehenden Verbindung liegt die
 * letzte Prüfung lange zurück" war FALSCH (Prod-Messung 2026-11-09, demo):
 * schon beim Laden der Seite lief eine Prüfung, der Widerruf 7 s später fiel
 * ins Fenster und wurde VERWORFEN — abgemeldet erst 33 s danach, durch ein
 * späteres 401 eines Reconnects. Deshalb seit RT2 zwei Regeln in
 * `accountVerifyAt`: ein Session-Lösch-Ereignis umgeht die Bremse (selten,
 * vom Nutzer ausgelöst, kein Sturm möglich), alles andere wird ans
 * Fensterende GESCHOBEN statt verworfen.
 *
 * `0` heisst „noch nie geprüft" und ist AUSDRÜCKLICH immer fällig — nicht
 * verlassen auf „`Date.now()` ist ohnehin grösser als der Abstand". Sonst
 * hinge die erste Prüfung an der Grösse einer Uhr, und in jedem Test mit
 * gefälschter Zeit (`vi.setSystemTime(0)`, `performance.now()`) verschwände
 * genau die Abmeldung, um die es hier geht.
 */
export const ACCOUNT_VERIFY_MIN_MS = 30_000

export function accountVerifyDue(lastVerifyAt: number, now: number): boolean {
  if (lastVerifyAt === 0) return true
  return now - lastVerifyAt >= ACCOUNT_VERIFY_MIN_MS
}

/**
 * WANN läuft die nächste Prüfung (Zeitstempel)? RT2-Nachtrag (2026-11-09):
 * - `urgent` (ein `users.*.sessions.*.delete`-Ereignis, `isSessionDeleteEvent`)
 *   ⇒ sofort, die Bremse gilt nicht — das ist genau der Widerruf.
 * - sonst ⇒ sofort, wenn fällig; im Fenster ans FENSTERENDE geschoben, nie
 *   verworfen (sonst verschluckte ein Ereignis kurz davor das nächste).
 * Die 400-ms-Entprellung (Event und 401-Frame kommen beim Widerruf direkt
 * hintereinander) legt der Aufrufer obendrauf.
 */
export function accountVerifyAt(lastVerifyAt: number, now: number, urgent: boolean): number {
  if (urgent || accountVerifyDue(lastVerifyAt, now)) return now
  return lastVerifyAt + ACCOUNT_VERIFY_MIN_MS
}
