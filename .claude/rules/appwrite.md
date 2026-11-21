---
paths:
  - "packages/*/server/**"
  - "apps/*/server/**"
  - "packages/core/shared/**"
  - "scripts/ops/appwrite-auth-policies.mjs"
  - "scripts/ops/verify-auth-methods.mjs"
---

## Appwrite (SSR-first, TablesDB) — Clients, Rechte, Anmeldung

Migrationen, Ziel-Prüfung und Schema-Stand: `appwrite-migrationen.md`.
Realtime-Socket und Anwesenheit: `appwrite-presence.md`.

- BEGRIFFE: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents).
- ZWEI SERVER-CLIENTS: `createAdminClient` (API-Key) + `createSessionClient`
  (pro Request, NIE teilen) in `core/server/lib/appwrite.ts`; Produkt-Layer
  nutzen sie per Auto-Import (Re-Export `core/server/utils/appwrite.ts`).
- ZWEI SCHLÜSSEL je Instanz: Runtime-Key (sessions/users/rows/health, in .env)
  + Migrations-Key (databases/tables/columns/indexes, nur für Skripte).
- CRUD NUR über `server/api/*` (Session erzwungen, Validierung zentral), NIE
  Web-SDK-CRUD aus `<script setup>`.
- IMMER explizites `Query.limit()` (Default 25). SDK-Generics nutzen:
  `tablesDB.listRows<T>()`.
- SESSION-COOKIE `a_session_<PROJECT_ID>`, httpOnly+secure+sameSite;
  Appwrite-Endpoint als Subdomain derselben Root-Domain.
- JEDE APP: eigene Appwrite-Instanz, Config aus .env (`NUXT_APPWRITE_KEY`
  server-only, `NUXT_PUBLIC_*` für Endpoint/Project).
- PROJEKT `account` (AH-1): das geteilte Projekt aller Pool-Communities und
  Konten, Cookie `a_session_account`; ein Projekt `pool` gibt es nicht mehr,
  auch lokal heißen die Projekte `account` und `admin` (Verify-Skripte fallen
  ohne Variable auf `account` zurück). Projekt-Ids sind unveränderlich:
  „umbenennen" = Neuanlage + Migration (Schema, Nutzer MIT Passwort-Hashes,
  Rows, Buckets) und eine EIGENE Web-Platform `*.pukalani.app`, sonst ist dort
  jede Realtime tot (F45). Default neuer Communities:
  `pukalani.control.defaultPoolProject` (`packages/control/app/app.config.ts`),
  Override `NUXT_PUBLIC_CONTROL_POOL_PROJECT`. Runbook:
  `docs/archiv/ACCOUNT-CUTOVER.md`.

### Rechte an Ablagen und Tabellen
- RECHTE AN ABLAGEN (SEC-001): Appwrite ist für jedes Konto direkt
  erreichbar, ein Bucket-Recht für `users`/`any`/Label gilt NEBEN unserer
  Route. Buckets sind verschlossen (`permissions: []`): der Server schreibt mit
  dem Admin-Client NACH seinen Prüfungen (Typ, Größe, Magic-Bytes),
  Leserechte trägt die Datei (`fileSecurity`). Wächter: `pnpm check:permissions`
  (in `lint:scripts`; rot bei jedem Bucket mit Schreibrecht für Konten in
  einer Migration oder einem Bootstrap-Skript). Schließen eines Buckets, `updateBucket`, „409 ⇒
  nachziehen": `appwrite-migrationen.md`.
- ENDUNGSLISTE IST NUR DAS NETZ: Appwrite prüft den INHALT nur bei Bild-/PDF-
  Endungen (ab 2.7.2, auch mit Admin-Schlüssel ⇒ 400
  `storage_file_type_unsupported`); `woff2`, `json`, `svg` nur am Namen, und
  ob Endung und Inhalt ZUSAMMENPASSEN, prüft es nicht (ein JPEG als `x.png`
  geht durch, wenn der Bucket `jpg` erlaubt). Die
  eigene Inhaltsprüfung der Route bleibt immer.
- AUSLIEFERUNGS-ROUTE reicht den gespeicherten Typ nie durch: Erlaubnisliste
  auf den gespeicherten Typ, `Content-Type` aus dem selbst erkannten Inhalt,
  auf jeder Antwort `X-Content-Type-Options: nosniff` und
  `Content-Security-Policy: default-src 'none'; sandbox` (EINE Quelle:
  `core/shared/avatarImage.ts`).
- RECHTE AN TABELLEN (SEC-002): keine Tabelle mit Schreibrecht für Konten,
  keine Zeile mit `update`/`delete` für ein Konto; Server schreibt nach seinen
  Prüfungen, Zeilenrechte regeln nur das Lesen. Regel und Umstellen:
  `.claude/rules/tenant-isolation.md` („DER SERVER SCHREIBT"). FALLE: ein
  Schreibvorgang OHNE Änderung prüft nur das LESErecht (200) — eine Probe
  „direkt ändern wird abgelehnt" muss geänderte Werte schicken.

### Anmeldung
- BESTÄTIGEN MIT SCHLÜSSEL WIRD GEZÄHLT (ab 2.7.2): `account.createSession`
  mit Geheimnis, `updateRecovery`, `updateVerification`, `updateMFAChallenge`
  zählen auch MIT API-Schlüssel (10 je Konto und Stunde ⇒ 429
  `general_rate_limit_exceeded`). Ein neuer solcher Aufruf mit dem
  Admin-Client muss diese 429 erwarten. Runbook:
  `docs/runbooks/APPWRITE-2-7-UPGRADE.md`, „2.7.1 → 2.7.3".
- ANMELDE-WEGE DES PROJEKTS (SEC-007): je Projekt unter Auth → Settings →
  Auth methods Email/Password, Magic URL, Email OTP, Anonymous, Phone, Team
  Invites UND JWT AUS (der JWT-Schalter trifft nur `account.createJWT` ohne
  Schlüssel; unsere Tokens entstehen über `users.createJWT`). Die Schalter treffen nur Aufrufe OHNE Schlüssel
  ⇒ JEDER solche Aufruf unseres Servers läuft über den Admin-Client
  (`account.create`, `createEmailPasswordSession`, `createEmailToken`;
  Wächter `packages/core/tests/authMethodCalls.test.ts`) — über den
  Session-Client käme 501 `user_auth_method_unsupported`. Weiter über den
  Session-Client: Wiederherstellung, E-Mail-Bestätigung, Zwei-Faktor,
  `createSession` aus einem Token. OAuth ist nicht schließbar (dafür die
  Zustimmungs-Nachfrage). Probe von außen: Anmelden direkt bei Appwrite mit
  erfundenen Zugangsdaten ⇒ 501 (zu) statt 401 (offen); täglicher Wächter
  `scripts/ops/verify-auth-methods.mjs` (`pnpm ops:auth-methods`, rot bei
  „offen" und unerwarteter Antwort, Störung = keine Aussage). NEUES PROJEKT ⇒
  in `PROJECTS` dort. Runbook: `docs/runbooks/ANMELDE-REGELN.md`.
- ANMELDE-REGELN DES PROJEKTS (P29: Passwort-Wörterbuch, persönliche Daten,
  Datenleck-Abgleich, Verlauf, Wegwerf-Adressen, Anmelde-Mail) sind
  Appwrite-Einstellungen JE PROJEKT und gelten auch mit Schlüssel. Soll in
  `scripts/ops/appwrite-auth-policies.mjs` (`pnpm ops:auth-policies`, setzen
  mit `--apply`), nie nur in der Konsole. Ablehnung ⇒ fachlicher Grund über
  `core/shared/passwordPolicy.ts`; jede Route, die ein Passwort setzt, nutzt
  dieselbe Funktion.

### Bremsen (SEC-003/BE-002)
- Auth-Routen laufen über den Admin-Client, Appwrites Grenzen gelten dort
  NICHT — gebremst wird in `core/server/middleware/05.rate-limit.ts`. Gezählt
  wird nur GELISTETES, unabhängig von der Methode.
- GEHEIMNIS (Passwort, Code, Token) ⇒ Route in `FAILURE_LIMITED`: gezählt
  VOR der Route (`store.hit`, atomar), eine Antwort < 400 bucht zurück. „Erst
  lesen, nach der Antwort zählen" hält bei gleichzeitigen Anfragen nicht.
- KONTO BEKANNT (E-Mail, userId) ⇒ zusätzlich
  `limitAccountAttempts(event, scope, konto)` aus
  `core/server/utils/accountAttempts.ts` (`ACCOUNT_ATTEMPT_MAX` in
  `ACCOUNT_ATTEMPT_WINDOW_MS`, je Konto über ALLE Adressen, Davids
  Entscheidung): festes Fenster, keine
  Dauersperre, dieselbe 429 für vorhandene und nicht vorhandene Konten, im
  Schlüssel nur ein Hash. Die Kennung muss BELEGT sein (`mfa/challenge` nimmt
  `challenge.userId`, nicht das Cookie), sonst bremst ein Fremder ein fremdes
  Konto. Ausweg ist „Passwort zurücksetzen": `recovery.put.ts` löscht den
  Login-Zähler, die Recovery-Routen zählen NICHT je Konto.
- TEURE WEGE (Export, bezahlte Aufrufe bei Stripe/ploi/KI, Uploads) ⇒ Zeile
  in `WRITE_LIMITED`; das Netz `delete:other` fängt jedes ungelistete DELETE und
  bleibt am ENDE der Liste (`find()` nimmt den ersten Treffer).
- `/api/health` bekommt NIE eine 429 (Wächter, Deploy-Beweis, UptimeRobot) —
  dort bremst der Zwischenspeicher `CACHE_MS`, die Antwort trägt keine
  Sitzungsdaten.
- STORE: Redis mit EINEM Lua-Skript je Zugriff (ein Schlüssel ohne Ablauf wäre
  eine Dauersperre); ohne `NUXT_REDIS_URL` zählt jeder PROZESS für sich — das
  trägt nur, solange pm2 je App `instances: 1` fährt.
- BEWEIS jeder Bremse: ein Test mit GLEICHZEITIGEN Anfragen
  (`core/tests/rateLimitFailureRoutes.test.ts`, `accountAttempts.test.ts`).
- AUSFALL IST KEIN FEHLVERSUCH (AB1 d): „Appwrite hat abgelehnt" (4xx ⇒ 401,
  zählt) getrennt von „Prüfung kam nicht zustande" (`isAuthBackendOutage`,
  `core/shared/authFailure.ts` ⇒ 503 `data.code: auth_unavailable`, eine
  Log-Zeile, `skipAccountAttempt(event)`). Die Minuten-Drossel je Anschluss
  zählt bewusst weiter.
- UPLOADS: `rejectOversizedUpload(event, maxBytes)`
  (`core/server/utils/uploadSize.ts`) nach der Rechte-Prüfung, VOR
  `readMultipartFormData`; die Prüfung der echten Größe danach bleibt.
- BEKANNTES GERÄT (P29): nach VOLLSTÄNDIGER Anmeldung setzt der Server das
  signierte Cookie `pk_known_device` (`core/server/utils/knownDevice.ts`); ein
  Browser mit gültigem Merkzeichen für GENAU dieses Konto zählt in eigenem Topf
  — ein Fremder sperrt den Besitzer so nicht aus. Neue Anmelde-Route ⇒
  `rememberKnownDevice` nach dem Erfolg, nie im Zweig „zweiter Faktor steht
  aus".

### Zustimmung (SEC-008/SEC-007, Davids Entscheidungen)
- NACHWEIS: EINE Zeile je (Konto, Art, Fassung) in `consent_records`
  (system-041, keine Rechte für Konten, nur Admin-Client, feste Zeilen-Id,
  409 = steht schon, nie überschreiben) — `core/server/utils/consentRecords.ts`,
  Regeln pur in `core/shared/consent.ts`. Die Prefs-Felder
  (`termsAcceptedAt`, `businessConfirmedAt`) gehören dem Konto und belegen
  nichts.
- EINE ZEILE ENTSTEHT NUR, WENN DER SERVER DIE BESTÄTIGUNG IN DIESER ANFRAGE
  GESEHEN HAT. Wege: `password` (`signup.post.ts` verlangt
  `terms`/`business: true`, sonst 400 `terms_required`/`business_required`
  VOR der Anlage), `otp` (beim ersten Beitritt, nur mit den Feldern im Body — ohne sie keine
  Zeile, die Anmeldung gelingt trotzdem), `oauth` (Merkzeichen `pk_consent`,
  10 min, vom Google-Knopf im Register-Formular; die Rückkehr liest und
  LÖSCHT es), `prompt` (`POST /api/auth/consent`), `adopted`
  (einmalig aus den Prefs, nur Konten von vor `CONSENT_ADOPTION_CUTOVER`, AGB
  nur bei gleicher Fassung).
- TÜR `core/server/middleware/07.consent-required.ts`: jede schreibende
  `/api/**`-Anfrage eines Kontos ohne Zustimmung ⇒ 403 `consent_required`,
  Lesen frei. Erlaubnisliste fail-closed mit Grund je Eintrag in
  `core/shared/consentGate.ts`; Layer erweitern sie nicht. Lesefehler und
  fehlende Tabelle lassen durch (`auth.consent_check_failed`,
  `auth.consent_table_missing`).
- BETREIBER-KONTEN (globales Label `admin`/`moderator`, `isOperatorAccount`)
  sind ausgenommen: nie gefragt, nie gesperrt, keine Zeile. Eine
  Community-Rolle ist keine Betreiber-Rolle.
- BROWSER fragt einmal je Besuch (`CoreConsentPrompt` über `useOverlay`,
  `consent-prompt.client.ts`) und nach jedem 403 `consent_required`.
- NEUE APP mit `termsUrl` (oder `businessOnly`) bekommt Nachweis, Tür und
  Nachfrage ohne eigenen Code; ohne beides läuft nichts davon, auch kein
  Netzaufruf. NEUE
  SCHREIB-ROUTE ⇒ nichts zu tun. NEUE AGB-FASSUNG ⇒ `termsVersion` ändern.
