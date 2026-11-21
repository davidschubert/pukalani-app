---
paths:
  - "packages/core/app/composables/useRealtime*.ts"
  - "packages/*/app/composables/*Presence*.ts"
  - "packages/core/app/composables/useEditAwareness.ts"
  - "packages/core/app/plugins/presence-heartbeat.client.ts"
  - "packages/core/app/plugins/realtime-*.client.ts"
  - "packages/core/app/composables/useTenantId.ts"
  - "packages/core/app/components/presence/**"
  - "packages/core/server/api/presence/**"
  - "packages/core/server/api/auth/realtime-token.get.ts"
  - "packages/core/server/utils/presence*.ts"
  - "packages/core/shared/presence*.ts"
  - "packages/core/shared/sharedPoll.ts"
  - "packages/core/shared/realtimeAuth.ts"
  - "packages/core/scripts/verify-presence-*.mjs"
---

## Appwrite — Realtime-Socket und Anwesenheit (Presence)

Ob eine App/Seite überhaupt Realtime hat (Config-Gate F14, Host-Gate G5):
`realtime.md`.

### Der eine Socket
- DAS WEB SDK (`appwrite`) IST NUR FÜR REALTIME UND PRESENCE DA: CRUD geht
  nur über `server/api/*`, nie aus dem Browser (`appwrite.md`).
- EINE geteilte, JWT-authentifizierte SDK-Realtime in
  `core/app/composables/useRealtimeClient.ts` (`sharedRealtime`,
  `realtimeCookieClient`, `ensureRealtimeJwt`): Row-Streams, Presence,
  Config-Flags und der `account`-Channel (`useRealtimeAccount`, Sofort-Abmeldung
  bei Session-Widerruf) laufen über denselben Socket
  (`Channel.tablesdb().table().row()`, optional server-seitige queries; der
  where-Filter bleibt Sicherheitsnetz). Keinen eigenen `new WebSocket` bauen —
  ein eigener Cookie-WS ist in Prod ein GAST (das host-only Cookie erreicht
  `api.pukalani.app` nie).
- JWT über `GET /api/auth/realtime-token` (`JWT_DURATION_S`, Client
  refresht). Cookie-Client NIE mit JWT mischen ⇒ Appwrite-403. Dasselbe 403
  trifft den SOCKET, wenn das host-only Session-Cookie den Realtime-Host selbst
  erreicht (lokal: `localhost` teilt Cookies über alle Ports) — dann schaltet
  der Tab auf Cookie-Auth um (RT1, `isJwtCookieConflict` in
  `core/shared/realtimeAuth.ts`); in Prod bleibt es beim JWT.
- SESSION-BINDUNG (Appwrite ≥ 2.7, RT2): jede angemeldete Verbindung hängt an
  ihrer Session — beim Widerruf erst `account`-Event, dann 401-Frame, dann
  Close (`onRealtimeAccessEnded` in `useRealtimeClient.ts`). Darum VERBINDET
  der JWT-Refresh (`JWT_REFRESH_MS`) den Socket NEU; sonst schließt Appwrite
  beim Ablauf des ERSTEN JWT und das auslösende Event geht verloren.
- Realtime braucht einen gesunden `appwrite-realtime`-Container
  (Swoole-Crash ⇒ `docker compose up -d --no-deps appwrite-realtime`).

### Anwesenheit (Presences API)
- EINE Presence pro Konto (`presenceId = userId`); `metadata` trägt die Teile,
  die Produkte SETZEN, statt eigene Presences zu schreiben. KEINE
  presence-Table. Felder mit je eigenem Zweck: `scope` (Thread), `action`
  (`reviewing:` / `editing:`), `typing`, `page` (Dashboard-Seite),
  `replyingTo` und `near` (commentId), `away` (Tab im Hintergrund),
  `tenantId` (setzt nur der Server bzw. kommt aus dem SSR-Payload).
  Use-Cases: `useThreadPresence`, `useModerationPresence`,
  `useEditAwareness`, `useViewingPresence` (→ `DashboardViewers`);
  `PresenceAvatar` (core) zeigt Avatar + Icon-Badge.
- ZWEI SCHREIBWEGE, beide gewollt, beide in `usePresenceState()` (Funktion in
  `core/app/composables/usePresence.ts`, die EINZIGE Schreib-Autorität je Tab:
  bei Login/metadata-Änderung, im Takt `HEARTBEAT_MS`, bei
  visibilitychange/focus): (1) `POST /api/presence/heartbeat`
  (`core/server/api/presence/heartbeat.post.ts`, Admin-Client, Ablauf
  `PRESENCE_TTL_MS`) — zuverlässig, löst aber KEIN Realtime-Event aus; (2)
  der WS-Upsert (`realtime.upsertPresence`, nur mit gültigem JWT, sonst ist
  der Socket ein Gast) — nur er meldet sofort. Der Cookie allein kann nicht
  schreiben (`PUT /presences` ⇒ 401).
- MITGLIEDER (BT1 e): im Pool schreibt der Heartbeat nur für Mitglieder der
  Community des Hosts, alle anderen bekommen ein stilles `ok` — Regel in
  `.claude/rules/tenant-isolation.md`.
- LESEN: `usePresence(predicate)` liest über die Presences-API
  (`presences.list()` mit dem Cookie-Client + `Channel.presences()` als
  Auslöser); „online jetzt" = `$updatedAt` jünger als `FRESH_MS`. Server:
  `listOnlinePresences()` in `core/server/utils/presence.ts` (Fenster
  `PRESENCE_FRESH_MS` in `core/server/utils/presenceFilter.ts`).
- EIN ABRUF JE REITER (Q23/PERF-011): alle `usePresence()` teilen Liste, Abo
  und Takt (`core/shared/sharedPoll.ts`), das Prädikat filtert je Leser. Der
  Takt ist Rückhalt (20 s nach dem LETZTEN Abruf, ein Ereignis bricht ihn ab), der unveränderte
  eigene Herzschlag lädt nichts nach. Kein eigenes `presences.list()` neben
  dem Leser. Wächter: `core/tests/sharedPoll.test.ts`,
  `apps/comments/e2e/presence-shared-poll.spec.ts`.
- VORFAHRT „sichtbar schlägt away": zwei offene Tabs VERSCHIEDENER
  Communities teilen sich die EINE Presence. Ein away-Schreiber weicht einer
  frischen (`PRESENCE_VISIBLE_FRESH_MS`) SICHTBAREN Presence eines FREMDEN
  Mandanten (`yieldsToForeignVisiblePresence`, `core/shared/presencePriority.ts`)
  — geprüft im Heartbeat und als Leave-Guard (`leave.post.ts`). away-Tabs
  upserten darum NICHT per WS (der Server ist der einzige Schiedsrichter).
  away-über-away und gleicher Mandant bleiben Letzter-gewinnt. Beweis:
  `packages/core/scripts/verify-presence-away-priority.mjs`.
- PRESENCE-GRENZE (A4): die Presence trägt dieselben Lese-Rechte wie jede
  Zeile — Pool `read("label:<communityId>")`, Silo/Single-Tenant
  `read("users")`. Der Heartbeat baut sie mit `tenantRowPermissionsFor`, der
  WS-Upsert (der die Permissions und die metadata ERSETZT, darum auch
  `tenantId` mitschickt) mit `core/shared/presencePermissions.ts`;
  `core/tests/presencePermissions.test.ts` nagelt beide aneinander. Der
  tenantId-Filter (`core/server/utils/presenceFilter.ts`, `usePresence.ts`)
  BLEIBT als Netz (Mehrfach-Mitgliedschaft). Beweis beidseitig:
  `packages/core/scripts/verify-presence-boundary.mjs`. Rest-Falle: eine
  Label-Änderung berechnet die Rollen OFFENER WS nicht neu
  (`docs/archiv/PRESENCE-GRENZE.md` Abschnitt 8).
