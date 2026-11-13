---
paths:
  - "packages/*/server/**"
  - "packages/*/scripts/**"
  - "packages/core/app/composables/**"
  - "packages/core/shared/**"
  - "scripts/migrate.mjs"
  - "scripts/migrations-lib/**"
  - "scripts/ops/**"
  - "apps/*/server/**"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key) + createSessionClient
  (pro Request, NIE teilen!) in server/lib/appwrite.ts; Produkt-Layer nutzen
  sie via Auto-Import (Core re-exportiert in server/utils/appwrite.ts)
- Zwei Keys pro Instanz: Runtime-Key (sessions/users/rows/health, in .env) +
  Migrations-Key (databases/tables/columns/indexes, nur für Scripts)
- CRUD NUR über server/api/* (Session enforced, Validierung zentral),
  NIE Web SDK CRUD aus <script setup>
- Realtime (seit P1, 2026-07-01): EINE geteilte, JWT-authentifizierte SDK-
  Realtime in core/app/composables/useRealtimeClient.ts (sharedRealtime,
  realtimeCookieClient, ensureRealtimeJwt) — useRealtimeRows, Presence und
  Config-Flags multiplexen über denselben Socket (Channel.tablesdb().table()
  .row(), optional server-seitige queries; where-Filter bleibt Sicherheitsnetz).
  JWT via GET /api/auth/realtime-token (15 min, Client refresht; Cookie-Client
  NIE mit JWT mischen → Appwrite-403). Dasselbe 403 trifft seit Appwrite 2.7
  den SOCKET, sobald das host-only Session-Cookie den Realtime-Host selbst
  erreicht (lokal: `localhost` teilt Cookies über alle Ports) — dann schaltet
  der Tab auf Cookie-Auth um (RT1, `core/shared/realtimeAuth.ts`); in Prod
  (`api.pukalani.app` ≠ App-Host) bleibt es beim JWT. AUCH der `account`-
  Channel (useRealtimeAccount, Sofort-Abmeldung bei Session-Widerruf) läuft
  seit RT2 (2026-11-08) über diesen Socket — der frühere eigene Cookie-WS war
  in Prod ein GAST (host-only Cookie erreicht `api.pukalani.app` nie; Tab nach
  98,5 s noch angemeldet). Appwrite ≥ 2.7 bindet JEDE angemeldete Verbindung,
  auch die JWT-Verbindung, an ihre Session: beim Widerruf erst `account`-Event,
  dann 401-Frame, dann Close (`onRealtimeAccessEnded`,
  `core/shared/realtimeAuth.ts`). Folge: der 12-min-JWT-Refresh verbindet den
  Socket NEU — Appwrite schließt sonst beim Ablauf des ERSTEN JWT (401, das
  auslösende Event geht verloren). Keinen eigenen `new WebSocket` mehr bauen.
  Realtime braucht einen gesunden appwrite-realtime-
  Container (Swoole-Crash → `docker compose up -d --no-deps appwrite-realtime`).
- Session-Cookie: a_session_<PROJECT_ID>, httpOnly+secure+sameSite,
  Appwrite-Endpoint als Subdomain derselben Root-Domain
- Das geteilte Projekt aller Pool-Communities und aller Konten heißt seit AH-1
  (2026-08-11) **`account`** (Session-Cookie `a_session_account`); der Vorgänger
  `pool` ist nach der Beobachtungszeit GELÖSCHT (2026-08-19, Davids
  Entscheidung — Alt-Stand nur noch in den Offsite-Dumps). Projekt-Ids sind unveränderlich —
  „umbenennen" war Neuanlage + Migration (Schema, Nutzer MIT Passwort-Hashes,
  Rows, Buckets) und braucht eine EIGENE Web-Platform `*.pukalani.app`, sonst
  ist dort jede Realtime tot (F45). Code-Default neuer Communities:
  `pukalani.control.defaultPoolProject` (packages/control/app/app.config.ts),
  Env-Override NUXT_PUBLIC_CONTROL_POOL_PROJECT. LOKAL heißt das Dev-Projekt
  weiterhin `pool` — die Verify-Skripte fallen bewusst darauf zurück.
  Runbook: docs/runbooks/ACCOUNT-CUTOVER.md.
- Jede App: EIGENE Appwrite-Instanz, Config aus .env
  (NUXT_APPWRITE_KEY server-only, NUXT_PUBLIC_* für Endpoint/Project)
- RECHTE AN ABLAGEN (SEC-001, seit 2026-11-13): Appwrite ist unter eigener
  Adresse für jedes Konto direkt erreichbar. Ein Recht für `users`, `any` oder
  ein Label an einem BUCKET gilt deshalb NEBEN unserer Route — und was die
  Route prüft (Typ, Größe, Magic-Bytes), prüft Appwrite nicht. Buckets sind
  darum verschlossen (`permissions: []`): geschrieben wird vom Server mit dem
  Admin-Client NACH den Prüfungen, Leserechte trägt die einzelne Datei
  (`fileSecurity`). Die Endungsliste eines Buckets ist nur das Netz: sie prüft
  den NAMEN, nicht den Inhalt (Appwrite erkennt den Typ aus dem Inhalt und
  speichert ihn, lehnt deswegen aber nichts ab). Eine AUSLIEFERUNGS-Route
  reicht den gespeicherten Typ nie durch: Erlaubnisliste auf den gespeicherten
  Typ, `Content-Type` aus dem selbst erkannten Inhalt, dazu auf jeder Antwort
  `X-Content-Type-Options: nosniff` und `Content-Security-Policy: default-src
  'none'; sandbox` (EINE Quelle: `core/shared/avatarImage.ts`). Wächter:
  `pnpm check:permissions` (läuft mit `lint:scripts`) wird rot bei jedem
  Bucket mit Schreibrecht für Konten in Migrationen und Bootstrap-Skripten.
  REIHENFOLGE beim Schließen eines bestehenden Buckets: ERST der Code, der mit
  dem Admin-Client schreibt, DANN die Migration (system-039) — umgekehrt
  scheitert jeder Upload. `updateBucket` setzt Weggelassenes auf API-Defaults
  ⇒ Bucket lesen und Unverändertes zurückschreiben. Der Runner fährt jede
  Migration bei jedem Lauf erneut: ein „409 ⇒ Einstellungen nachziehen" in
  einer ALTEN Migration stellt den Bucket bei jedem Lauf zurück (system-032
  tat das) — nachziehen darf nur die jüngste.
- BREMSEN (SEC-003/BE-002, seit 2026-11-13): Auth-Routen laufen über den
  Admin-Client, Appwrites eigene Grenzen gelten dort NICHT — gebremst wird in
  `core/server/middleware/05.rate-limit.ts`. Gezählt wird nur, was GELISTET
  ist (unabhängig von der Methode). Drei Regeln für neue Routen: (1) Prüft
  eine Route ein GEHEIMNIS (Passwort, Code, Token), gehört sie in
  `FAILURE_LIMITED`: gezählt wird VOR der Route (`store.hit`, atomar), eine
  Antwort < 400 bucht den eigenen Versuch zurück. „Erst lesen, nach der
  Antwort zählen" hält nur für Anfragen NACHEINANDER — gleichzeitige sehen
  alle denselben alten Stand. (2) Kennt die Route das KONTO (E-Mail, userId),
  ruft sie zusätzlich `limitAccountAttempts(event, scope, konto)` aus
  `core/server/utils/accountAttempts.ts`: 10 Fehlversuche in 15 Minuten je
  Konto über alle Adressen (Davids Entscheidung), festes Fenster, keine
  Dauersperre, dieselbe 429 für vorhandene und nicht vorhandene Konten, im
  Schlüssel nur ein Hash. Die Kennung muss BELEGT sein, bevor sie zählt
  (`mfa/challenge` nimmt `challenge.userId`, nicht das Cookie) — sonst bremst
  ein Fremder ein fremdes Konto. Ausweg aus der Pause ist „Passwort
  zurücksetzen": `recovery.put.ts` löscht den Login-Zähler, die
  Recovery-Routen zählen NICHT je Konto. (3) Teure Wege (Export, bezahlte
  Aufrufe bei Stripe/ploi/KI, Uploads) bekommen eine Zeile in `WRITE_LIMITED`;
  ungelistete DELETE fängt das Netz `delete:other` am ENDE der Liste (`find()`
  nimmt den ersten Treffer). `/api/health` bekommt NIE eine 429 (Wächter,
  Deploy-Beweis, UptimeRobot) — dort bremst ein Zwischenspeicher von 5 s je
  Prozess, und die Antwort trägt keine Sitzungsdaten. Der Store zählt in
  Redis mit EINEM Lua-Skript je Zugriff (ein Schlüssel ohne Ablauf wäre eine
  Dauersperre); ohne `NUXT_REDIS_URL` zählt jeder PROZESS für sich — das
  trägt, solange pm2 je App `instances: 1` fährt. Beweis-Muster für jede
  Bremse: ein Test mit GLEICHZEITIGEN Anfragen
  (`core/tests/rateLimitFailureRoutes.test.ts`, `accountAttempts.test.ts`).
- Immer explizites Query.limit() (Default 25)
- SDK-Generics nutzen: tablesDB.listRows<T>()
- Migrations: idempotent (409 → skip), IMMER über den zentralen Runner
  `pnpm migrate --app <app>` (scripts/migrate.mjs; bei mehreren Apps ist
  --app Pflicht — nie die falsche Instanz), nach Column-Anlage auf
  'available' pollen bevor Indizes. Das Pollen allein reicht NICHT:
  der Index-Endpunkt liest die Spaltenliste aus Appwrites Metadaten-Cache
  (Collection-Dokument), der dem Spalten-Status hinterherhinkt — CI-E2E
  zweimal live erwischt (400/column_not_available trotz 'available').
  Index-Anlage deshalb NUR über die Fabrik aus
  `scripts/migrations-lib/indexRetry.mts` — einmal je Datei
  `const { indexStep } = createIndexSteps(tablesDB, databaseId)`, dann
  `await indexStep('Index x.idx_y', { tableId, key, type, columns })`.
  Sie ruft `createIndex` SELBST und bringt Retry + Cache-Anstoß mit
  (Seeds/createRow sind NICHT betroffen — die physische Spalte existiert
  vor dem Status). WARTEN ALLEIN REICHT NICHT: räumt Appwrite den Cache,
  während ein Leser (z. B. der 'available'-Poller) noch seinen alten Stand
  hält, steht die Spalte dort für IMMER auf 'processing' — 23 Versuche ohne
  Bewegung, CI-E2E zweimal so gestorben. Nur ein Schreibzugriff auf die
  Tabelle (`tableCacheNudge`) räumt ihn. Der Anstoß war einen Tag lang ein
  OPTIONALES Argument: 2 von 63 Migrationen reichten ihn durch, 61 nicht, und
  eine davon warf die CI um — Sicherungen gehören deshalb in die Schnittstelle,
  nicht in die Disziplin. SEIT APPWRITE 2.4 (#14104; 2026-10-24 gegen 2.6.1
  bewiesen) liest der Index-Endpunkt bei einem nicht-`available`-Status im
  Cache das Attribut-Dokument selbst nach — das Rennen ist upstream
  geschlossen, die Fabrik bleibt als Gürtel UND Hosenträger, und
  `verify-index-nudge` prüft versionsbewusst (ab 2.4 darf ein vergifteter
  Cache den Index NICHT mehr aufhalten). Rohes `tablesDB.createIndex` in
  `packages/*/scripts/migrations/**` verbietet ESLint (no-restricted-syntax);
  das ist der EINZIGE greifende Wächter, denn die Migrations-Scripts liegen in
  keiner tsconfig und werden von `pnpm -r typecheck` nie gesehen.
  Es gibt KEIN Migrations-Register in der
  DB — die Labels (`control-019`, `system-021`, …) sind reine Anzeige, die
  Idempotenz kommt vom 409. Man kann deshalb nicht fragen „welche Migration
  lief hier?", wohl aber, was dabei herauskam: `pnpm ops:schema-parity`
  (E5 → AU4) prüft je Instanz ein KURATIERTES SOLL über ALLE Layer, die dort
  laufen SOLLEN (nicht mehr nur `system`): Fehlt eine Soll-Tabelle, ist es ein
  Fehler — auch wenn sie nirgends existiert (der Anlass war die `changelog`-
  Tabelle des admin-Layers, die nach dem control-Cutover monatelang in `control`
  fehlte; der alte Union-Vergleich konnte eine überall-fehlende Tabelle nie
  sehen). Der `system`-Layer läuft auf jeder Instanz mit — Pool, Control Plane
  und jede Einzel-Instanz —, eine neue `system`-Migration gehört also überall
  gefahren; danach diesen Lauf machen. Die SPALTEN-Parität bleibt bewusst eng
  (nur `system`+`admin`+`pages`+`analytics`, die jede Instanz im GLEICHKLANG
  fährt): sonst meldet der Wächter Scheinbefunde aus dem Legacy-Silo portfolio
  (Single-Tenant, ohne `communityId`) und aus Control-Plane-einheimischen
  Tabellen wie `communities`, die auf dem Pool nur als eingefrorener Alt-Schatten
  liegen (control-037 sagt es im eigenen Kopf: „gehört NICHT auf jede Instanz").
  Alt-/unbekannte Ist-Tabellen sind eine nicht-fatale WARNUNG (portfolios sechs
  tote Tabellen). Die Soll-Listen sind GEPFLEGT, nicht aus Migrations-Dateien
  geparst — neue Tabelle ⇒ in ihren Layer-Block im Skript eintragen; das gilt
  AUCH für Tabellen aus ensure-Skripten statt pnpm migrate (intro_requests so
  übersehen, 2026-08-31). Seit 2026-08-31 trägt jeder INSTANCES-Eintrag ein
  `ausgerollt`-Flag: fehlt die Env-Datei einer AUSGEROLLTEN Instanz, endet der
  Lauf rot (Exit 1) statt still „übersprungen" — so fiel die Betreiber-Konsole
  nach AH-4c wochenlang ungeprüft aus der Runde. Alle Prod-Migrations-Envs
  liegen unter ~/.appwrite-secrets/migrations/<name>.env (account, admin,
  portfolio, branding; portfolios Repo-Baum-Datei ist umgezogen — sie fehlte in
  jedem Worktree). Der Wächter läuft NUR manuell auf dem Mac, nicht in der CI. Die Migrationen des Control Plane heißen seit
  2026-07-29 `control-NNN`; Dokumente von VOR dem Cutover (docs/archiv/**,
  CHANGELOG) nennen dieselben Migrationen `studio-NNN` — bewusst nicht
  umgeschrieben, das ist ein Protokoll und kein Nachschlagewerk. Die
  DATEINAMEN bleiben immer (`019-site-team.ts`).
- Presences API (self-hostbar seit 1.9.5): GESAMTE Presence vereinheitlicht auf
  EINE Presence pro User (presenceId=userId; metadata trägt scope/action/typing).
  WICHTIG (SSR-Cookie-Architektur): der Browser kann seine Presence NICHT selbst
  schreiben — der Web-SDK-Client hat keine Session, daher wird realtime.
  upsertPresence() über einen Guest-WS verworfen und PUT /presences → 401. Der
  WRITE läuft daher server-seitig: POST /api/presence/heartbeat upsertet mit dem
  Admin-Client (expiresAt 90s). usePresenceState() = einzige
  Heartbeat-Autorität pro Tab (ruft die Route bei Login/metadata-Änderung + alle
  20s + bei visibilitychange/focus). usePresence(predicate) = Reader — liest
  direkt über die Presences-API (presences.list() per Cookie-GET funktioniert +
  Channel.presences()-Trigger), „online jetzt" via updatedAt-Recency 60s. Server:
  listOnlinePresences() in core/server/utils/presence.ts. KEINE presence-Table mehr.
  metadata-Felder (je eigener Zweck, kollidieren nicht): scope (Thread), action
  (reviewing:/editing:), typing, page (Dashboard-Seite), replyingTo (commentId),
  near (commentId, Lese-Position). Use-Cases: useThreadPresence (scope + typing +
  replyingTo + near), useModerationPresence (action reviewing:*), useEditAwareness
  (action editing:*), useViewingPresence (page → DashboardViewers „N sehen diese
  Seite"). PresenceAvatar (core): Avatar + Icon-Badge in der Ecke (tippt/antwortet)
- VORFAHRT „sichtbar schlägt away" (seit 2026-08-18): zwei offene Dashboards
  VERSCHIEDENER Communities teilen sich die EINE Presence — der gedrosselte
  Hintergrund-Tab stahl dem sichtbaren den tenantId-Stempel (Zähler flackerte
  0↔1). Regel in `core/shared/presencePriority.ts`: ein away-Schreiber weicht
  einer frischen (<60 s) SICHTBAREN Presence eines FREMDEN Mandanten — geprüft
  im Heartbeat und als Leave-Guard; away-Tabs upserten deshalb NICHT mehr per WS
  (der Server ist der einzige Schiedsrichter). away-über-away und gleicher
  Mandant bleiben bewusst Letzter-gewinnt. Beweis:
  `packages/core/scripts/verify-presence-away-priority.mjs`.
- PRESENCE-GRENZE (A4, seit 2026-07-29 — vorher `read("users")`, also im Pool
  JEDER eingeloggte User ALLER Communities): die Presence trägt jetzt dieselben
  Rechte wie jede andere Zeile — `tenantRowPermissionsFor` ⇒ Pool
  `read("label:<communityId>")`, Silo/Single-Tenant unverändert `read("users")`.
  Geschrieben wird sie an ZWEI Stellen (heartbeat.post.ts UND der WS-Upsert in
  usePresenceState, der die Permissions ERSETZT) — beide bauen sie aus
  core/shared/presencePermissions.ts, per Test an tenantRowPermissionsFor
  genagelt. Der tenantId-Filter (presenceFilter.ts/usePresence.ts) BLEIBT als
  Netz (Mehrfach-Mitgliedschaft). Beweis beidseitig:
  `packages/core/scripts/verify-presence-boundary.mjs`; Analyse + Rest-Falle
  (Label-Änderung berechnet die Rollen OFFENER WS nicht neu):
  docs/archiv/PRESENCE-GRENZE.md Abschnitt 8.
