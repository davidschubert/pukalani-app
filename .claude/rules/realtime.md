---
paths:
  - "packages/core/app/composables/useRealtime*"
  - "packages/core/shared/liveRelay.ts"
  - "packages/core/server/utils/liveRelay.ts"
  - "packages/*/app/plugins/realtime-*"
  - "packages/core/shared/realtimeGate.ts"
  - "packages/core/app/utils/hostGate.ts"
  - "**/usePresence*"
---

## Realtime-Gate (F14/G5) — Config-Gate und Host-Gate

- OB REALTIME IN PRODUCTION ANTWORTET (OPS-004): `scripts/ops/verify-realtime.mjs`
  (Handshake von außen gegen `api.pukalani.app`, alle 30 min) und
  `ops/realtime-watchdog.sh` auf dem Appwrite-Server (prüft lokal, erstellt den
  Container höchstens `MAX_RESTARTS`-mal in Folge neu, danach `aufgegeben`).
  Ein Handshake (HTTP 101) beweist nur, dass Verbindungen angenommen werden —
  NICHT, dass Ereignisse ankommen. Bei Rot: `docs/runbooks/PRODUKTIONS-ALARM.md`,
  Absatz „Live-Verbindung (Realtime)".
- `pukalani.realtime.enabled` (F14) ist der EINE Schalter für alle
  Realtime-Einstiege des Core: Row-Streams (`useRealtimeRows`), Presence
  (`usePresence`/`usePresenceState`) und den Account-Channel
  (`useRealtimeAccount`). AUS heißt: kein Web-SDK nachgeladen, kein Socket,
  kein `/api/auth/realtime-token`. **Core-Default AN** — die begründete
  Ausnahme von „Core-Default ist IMMER aus": Realtime ist bestehendes
  Verhalten jeder Produkt-App; ein Default AUS entkoppelte sie still (die Seite
  sieht richtig aus, aktualisiert sich nur nicht). AUS in `marketing` + `help`
  (öffentlich, kontenlos, ohne themes-Layer).
- EINE pure Regel: `realtimeAllowed(enabled, ...ids)` in
  `core/shared/realtimeGate.ts` (Gate UND Datenebene, der `!databaseId`-Guard
  geht darin auf), gelesen an EINER Stelle (`realtimeEnabled()` in
  `core/app/composables/useRealtimeClient.ts`, memoisiert).
  `ensureRealtimeClients`/`sharedRealtime`/`realtimeCookieClient` geben
  bewusst `… | null` zurück — so zwingt strict JEDEN Konsumenten, „diese App
  hat keine Realtime" zu behandeln. Nicht wegtypisieren.
- ZWEITES GATE, ANDERE FRAGE (G5): das Config-Gate sagt, ob die APP Realtime
  hat — `startWhenHostResolves()` (`core/app/utils/hostGate.ts`) sagt, ob die
  SEITE einen Host hat. Auf einem unbekannten oder `abuse`-gesperrten Host
  rendert die 404-Fehlerseite MIT hydriertem Auth-Store (C12b); ein dort
  startender Socket zieht bei jedem Abbruch Auth-Abrufe nach (Reconnect-Sturm).
  JEDES neue client-Plugin, das eine Realtime-Verbindung STARTET, gehört in
  diese Klammer (heute `realtime-account`, `realtime-config`,
  `realtime-themes`). Ohne Klammer nur mit Grund: `realtime-branding` steigt
  ohne `useSiteId()` ohnehin aus; `realtime-auth` startet nichts, es verbindet
  nur eine schon bestehende Verbindung nach einem Login-Wechsel neu
  (`syncRealtimeAuth`).
- Bedingung ist `isHostUnservedError` (`core/shared/unknownHost.ts`:
  unbekannter Host ODER die 503 „Trennung ohne Resolver", SEC-025), NICHT
  `useError()` — auf einer Tippfehler-404 einer GESUNDEN Community läuft
  Realtime weiter, sonst fehlt dort die Sofort-Abmeldung bei Session-Widerruf.
  Nachgeholt wird, sobald `clearError()` räumt.
- APP-WEITE ABOS (Laufzeit-Flags, Farbwelten) laufen NUR FÜR ANGEMELDETE
  (Q23/PERF-012): `whileSignedIn` (`core/app/utils/hostGate.ts`) innerhalb
  der Host-Klammer. Kein drittes Gate — es sagt nur, für WEN ein Abo etwas
  meldet; Gäste öffnen eine Verbindung nur über einen Baustein mit
  Live-Inhalt (Kommentare, Feed). Wächter:
  `apps/portfolio/e2e/realtime-guest.spec.ts`.
- DER AUTH-NACHTRAG HAT EINEN MINDESTABSTAND (`accountVerifyDue`, 30 s,
  `core/shared/realtimeGate.ts`) — er ist der Verstärker bei jedem flappenden
  Socket. Er darf aber NICHTS VERWERFEN: ein `sessions.*.delete`-Ereignis geht
  vorbei, alles andere wird ans Fensterende geschoben (`accountVerifyAt`).
- NEUVERSUCH MIT WACHSENDEN ABSTÄNDEN (Q23-Rest): das Web-SDK nullt seinen
  Zähler im `open`-Handler, eine angenommene und gleich geschlossene
  Verbindung kam so jede Sekunde wieder. Unsere Instanz zählt die DAUER
  (`core/shared/realtimeReconnect.ts`, eingehängt in `useRealtimeClient.ts`):
  1 s, 2 s, 4 s … 60 s, zurück erst nach 30 s stabiler Verbindung.
- EIGENE DOMAIN (PK1 E1d): angemeldet auf der eigenen Domain einer
  Community im Modus `write` geht der geteilte Socket an `/api/live` auf
  DIESEM Host (`realtimeRelayWanted`, SSR-Spiegel `useLiveRelay`), nie an
  Appwrite; der Server hält das JWT. Durch lässt er nur, was
  `core/shared/liveRelay.ts` kennt (Zeilen, `presences`, `account`) — eine
  NEUE Kanal-Art kommt dort sonst still nicht an: Regel und Test
  (`core/tests/liveRelay.test.ts`) mit erweitern. Beweis:
  `packages/core/scripts/verify-site-card.mjs` (Abschnitt 4b).
- KEIN EIGENER ACCOUNT-WS (RT2): der `account`-Channel läuft auf dem geteilten
  Socket (Regel: `appwrite-presence.md`).
