/**
 * HAT DIESE APP EINE APPWRITE-INSTANZ? — die pure Regel.
 *
 * ── Der Anlass (Logbefund 2026-10-28) ────────────────────────────────────
 * `help.pukalani.app` ist öffentlich, kontenlos und spricht im Normalbetrieb
 * NIE mit Appwrite — ihre `.env` trägt Endpunkt, Projekt und Datenbank
 * absichtlich LEER (apps/help/.env.example). Seit dem 2026-09-08 lesen aber
 * auch Silo- und Einzel-Instanzen ihre `instance`-Zeile für Sucheintrag und
 * Weiterleitungen (shared/communitySettingsRow.ts, Fall 2), und beide Leser
 * bauten dafür den Admin-Client: `new Client().setEndpoint('')` wirft im SDK
 * „Endpoint must be a valid string", der Fail-soft-Zweig fing das und
 * schrieb `community.seo_read_failed` + `community.redirects_read_failed`
 * ins pm2-Fehlerlog — zweimal je Stunde, über 900 Zeilen in sieben Wochen,
 * und zwar für einen Zustand, der kein Fehler ist.
 *
 * ── Die Regel ────────────────────────────────────────────────────────────
 * Der Endpunkt IST der Schalter („der Wert ist der Schalter", dieselbe Haltung
 * wie beim SMTP-Host und bei Turnstile): leer oder nur Leerraum ⇒ diese App
 * hat keine Instanz, und jeder OPTIONALE Leser (Sucheintrag, Weiterleitungen)
 * antwortet still mit „keine eigene Wahl", ohne einen Client zu bauen und
 * ohne Meldung. Pflicht-Pfade (Auth, Routen unter /api) bleiben unberührt —
 * die haben auf einer App ohne Appwrite ohnehin nichts zu tun, und wenn
 * doch, soll es laut scheitern, nicht still.
 *
 * Geprüft wird NUR der Endpunkt, nicht Projekt oder Datenbank: fehlt eines
 * davon bei gesetztem Endpunkt, ist das ein Konfigurationsfehler, der im
 * Fehlerlog stehen SOLL (ein 401/404 von Appwrite mit sprechender Meldung).
 */
export function appwriteEndpointConfigured(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.trim().length > 0
}
