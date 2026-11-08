---
paths:
  - "packages/core/app/composables/useRealtime*"
  - "packages/*/app/plugins/realtime-*"
  - "packages/core/shared/realtimeGate.ts"
  - "packages/core/app/utils/hostGate.ts"
  - "**/usePresence*"
  - "**/useRealtimeRows*"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-11-08 (Token-Hygiene, SH1 e): lädt
     automatisch, sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen
     (cat/sed) diese Datei bewusst per Read öffnen. Wortlaut unverändert. -->

## Realtime-Gate (F14/G5) — Config-Gate und Host-Gate

- pukalani.realtime.enabled (F14, seit 2026-08-01): der EINE Schalter für alle
  Realtime-Einstiege des Core — Row-Streams (useRealtimeRows), Presence
  (usePresence/-State) und den Account-WS (useRealtimeAccount). AUS heißt: kein
  Web-SDK nachgeladen, kein Socket, kein /api/auth/realtime-token. **Core-Default
  AN** — die begründete Ausnahme von „Core-Default ist IMMER aus": Realtime ist
  kein Zusatz, sondern das bestehende Verhalten jeder Produkt-App, und ein
  Default AUS entkoppelte sie stillschweigend (die Seite sieht richtig aus, sie
  aktualisiert sich nur nicht mehr). AUS in `marketing` + `help` (öffentlich,
  kontenlos, ohne themes-Layer — sie abonnierten `app_config` über den geerbten
  core-Layer, ohne die Flags je zu lesen). EINE pure Regel in
  core/shared/realtimeGate.ts (`realtimeAllowed(enabled, ...ids)` — Gate UND
  Datenebene; der `!databaseId`-Guard aus dem Live-Vorfall 2026-07-29 geht darin
  auf), gelesen an EINER Stelle (`realtimeEnabled()` in useRealtimeClient.ts,
  memoisiert). `ensureRealtimeClients`/`sharedRealtime`/`realtimeCookieClient`
  geben bewusst `… | null` zurück: der strict-Modus zwingt so JEDEN künftigen
  Konsumenten, „diese App hat keine Realtime" zu behandeln.
  ZWEITES GATE, ANDERE FRAGE (G5, 2026-08-03): das Config-Gate sagt, ob die APP
  Realtime hat — `startWhenHostResolves()` (core/app/utils/hostGate.ts) sagt, ob
  die SEITE dazu einen Host hat. Auf einem unbekannten oder `abuse`-gesperrten
  Host antwortet jeder Pfad 404, die Fehlerseite rendert aber MIT hydriertem
  Auth-Store (C12b) — der Account-WS lief los, und JEDER Abbruch zog
  `/api/auth/me` + `/api/community/role` nach (gemessen: 66 WS + 15 Requests in
  60 s, jetzt 1 + 0). JEDES neue client-Realtime-Plugin gehört in diese Klammer
  (heute: realtime-account, realtime-config, realtime-themes; realtime-branding
  steigt ohne `useSiteId()` ohnehin aus). Bedingung ist `isUnknownHostError`,
  NICHT `useError()` — auf einer Tippfehler-404 einer GESUNDEN Community läuft
  Realtime weiter, sonst verlöre man dort die Sofort-Abmeldung bei
  Session-Widerruf. Nachgeholt, sobald `clearError()` räumt. Der Auth-Nachtrag
  selbst hat zusätzlich einen Mindestabstand (`accountVerifyDue`, 30 s) — er ist
  der Verstärker bei jedem flappenden Socket, nicht nur auf 404-Hosts. Der feste
  1-s-Reconnect in der Konsole kommt aus dem Appwrite-Web-SDK (es nullt
  `reconnectAttempts` im `open`-Handler, erreicht seine Staffelung also nie);
  unser eigener Backoff staffelt 1→15 s und ist nicht das Problem.
