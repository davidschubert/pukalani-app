---
paths:
  - "packages/*/server/**"
  - "packages/*/shared/**"
  - "apps/*/server/**"
  - "packages/core/app/plugins/**"
  - "eslint.config.mjs"
  - "scripts/lib/data-door-layers.mjs"
  - "scripts/lib/server-written-tables.mjs"
  - "scripts/migrations-lib/tableWriteRights.mts"
---

# Mandanten-Isolation: Datentür, Schreiben, Sperre, Mitmachen

WER `notify(` RUFT, EIN LABEL SCHREIBT, EINE ROLLE PRÜFT ODER EINE ROUTE FÜR
ENTFERNTE ÖFFNET, liest vorher `tenant-mitglieder.md` (Label, Beitritt,
Entzug, Benachrichtigungen) — sie lädt nicht bei jeder Server-Datei.

## EINE Datentür
- EINE DATENTÜR: in `server/api/**` mandantenfähiger Layer geht Datenzugriff
  über `tenantDb(event)` (`core/server/utils/tenantDb.ts`), NIE über
  `createAdminClient().tablesDB` / `createSessionClient().tablesDB` direkt.
  `list/find/count` scopen immer, `get/update/remove` belegen die Zugehörigkeit
  VOR der Aktion, `create` stempelt communityId + Row-Permissions. `as:
  'operator'` = Admin-Client: er umgeht die Row-Permissions, dort ist die Tür
  die EINZIGE Grenze. Warum EINE Tür: Isolation darf nicht an Dingen hängen,
  an die man sich erinnern muss (Scope-Query, Zeilen-Prüfung, ID-Prüfung).
- ZWEI FRAGEN, ZWEI FELDER (C1c): `as` = WELCHER CLIENT (Technik: Rechte
  setzen, rowSecurity-Zeilen schreiben), `actor` = WER HANDELT (`'member' |
  'guest' | 'operator'`, Default = `as`). Die M13-Sperre
  (`actorFacesContentLock`) und der A5-Beitritt (`actorJoinsByWriting`) hängen
  am `actor`, nicht an der Klinke — viele Routen wählen `'operator'` nur wegen
  der Rechte, gehandelt hat trotzdem ein Mitglied. Ein GAST-Inhalt ist Inhalt
  (Sperre gilt) und macht niemanden zum Mitglied (`actor: 'guest'`). Neue
  Route mit Operator-Klinke: IMMER prüfen, ob `actor` gesetzt gehört.
- DIE MANDANTEN-ID KOMMT NIE VOM AUFRUFER: `stripTenantKey` entfernt BEIDE
  Schlüssel, `communityId` und `tenantId` — sonst schreibt ein durchgereichter
  Body in einen fremden Mandanten.
- AUSSERHALB der Tür erlaubt (per Definition mandantenübergreifend):
  Migrationen, Sweeps/Intervall-Plugins, GDPR-Orchestrierung, Control Plane.
- OHNE RESOLVER LEHNT DIE PLATTFORM AB (SEC-025, Davids Entscheidung): ist
  `pukalani.tenancy.enabled` an, aber kein Resolver registriert, antwortet
  `00.tenant.ts` mit 503 `tenant_resolver_missing` für JEDEN Host und Pfad,
  auch Kontroll-Hosts. Durch kommen nur `/api/health` (`ok:false` mit Grund),
  `/_i18n/` und Nuxts Fehlerseiten-Durchgang (Realtime startet dort nicht,
  `isHostUnservedError`). Kein Schalter, kein Rückfall auf „Single-Tenant".
  KEIN zweites Netz in der Tür selbst: Exporte, Spiegel und Sweeps rufen sie
  ohne Mandant. Beweis: `packages/core/tests/tenantMiddleware.test.ts`.
- BACKSTOP: ESLint (`no-restricted-syntax`) verbietet rohes `.tablesDB` in
  `server/api/**` UND `server/plugins/**` der Datentür-Layer. Die Liste IST
  `scripts/lib/data-door-layers.mjs` (`DATA_DOOR_LAYERS`; `eslint.config.mjs`
  liest sie), `pnpm check:manifests` hält sie gegen die Migrationen: legt ein
  Layer `communityId` an, steht er dort oder mit Grund in `DATA_DOOR_EXEMPT`.
  Wer einen H3Event bekommt (auch ein Plugin/Contributor), bedient einen
  Request und gehört hinter die Tür; ein eventloser Sweep bekommt eine
  begründete eslint-disable-Zeile statt einer Aufweichung.
- POOL-UNIQUE nur für tenant-RELATIVE Schlüssel: Host/Slug brauchen
  `communityId` im Unique-Index; Row-Id-basierte (z. B. `(courseId, userId)`)
  nicht — eine Row-Id ist global eindeutig. Die INDEXNAMEN heißen weiter
  `uq_tenant_*` (nur die Spalte wurde auf `communityId` umbenannt).

## DER SERVER SCHREIBT (SEC-002, Davids Entscheidung)
- Appwrite ist für jedes Konto direkt erreichbar; ein Schreibrecht gilt NEBEN
  unseren Routen, und was die Route prüft (Mandant, Zugehörigkeit, Sperre,
  Eingabe, Bremse), prüft Appwrite nicht. Darum:
  (1) KEINE Tabelle trägt ein Schreibrecht für Konten;
  (2) KEINE TABELLENZEILE bekommt `update`/`delete` für ein Konto (kein
  `ownerUserId`, kein `Permission.update/delete(Role.user(…))`) — die
  Anwesenheit (Presence, keine Tabellenzeile) trägt sie bewusst, weil
  Appwrites Realtime sie im Namen des Kontos ändert
  (`core/server/api/presence/heartbeat.post.ts`);
  (3) JEDER Schreibvorgang läuft über den Admin-Client: `tenantDb(event, { as:
  'operator', actor: 'member' })`, wenn ein Mitglied handelt (M13 und A5
  gelten über `actor`), `actor: 'guest'` für Gäste, ohne `actor` für Zähler
  und Moderation.
- GELESEN wird weiter über die Mitglieder-Klinke, wo das Leserecht der Zeile
  die Sichtbarkeit entscheidet — Leserechte bleiben, Realtime hängt an ihnen.
- EIGENTUM PRÜFT DIE ROUTE, VOR DEM SCHREIBEN: mit dem Admin-Client ist ihre
  Prüfung die EINZIGE. Entweder Vergleich der Konto-Id (`authorId ===
  user.$id`; Gast-Zeilen und Grabsteine tragen eine leere Id und gehören
  niemandem) oder die eigene Zeile über `userId`/`reporterId` = Konto suchen
  und nur die so gefundene anfassen. Nie auf Appwrites 401 verlassen.
- DIE LISTE der Tabellen IST `scripts/lib/server-written-tables.mjs`. Drei
  Netze: `packages/core/tests/serverWrittenTables.test.ts` (jede schreibende
  Aufrufstelle an der Operator-Klinke, kein Schreibrecht beim Anlegen),
  `pnpm check:permissions` Stufe 2 (keine Migration gibt ein Schreibrecht
  zurück), `packages/core/scripts/verify-server-only-writes.mjs` (NUR lokal:
  direkt anlegen/ändern/löschen ⇒ 401; `--expect-closed all --expect-clean
  all`).
- NEUE TABELLE MIT INHALT VON KONTEN ⇒ ohne Tabellenrecht anlegen, in die
  Liste eintragen, Route mit Operator-Klinke.
- BESTEHENDE TABELLE UMSTELLEN in drei Schritten, NIE zwei auf einmal: (1) der
  Code (läuft mit und ohne alte Rechte) auf allen Seiten live; (2) die
  Rechte-Migration (`scripts/migrations-lib/tableWriteRights.mts`, Rückweg
  unter `packages/<layer>/scripts/rollback/` — nie im Ordner `migrations/`,
  der Runner führe ihn sonst aus); (3) der Aufräum-Lauf `pnpm
  ops:strip-row-write-rights` (ohne `--apply` zählt er nur, Lauf-Sperre in
  `system_runs`, bricht ab, solange die Tabelle noch ein Schreibrecht trägt).
  Das ist die EINE begründete Ausnahme von „Migration vor dem Merge".
- OFFEN BLEIBT DAS LESEN: ein Konto liest direkt bei Appwrite jede Zeile, für
  die seine Rollen ein Leserecht tragen, und immer die ganze Zeile
  (`docs/plans/PUKALANI-KONTO.md`, § 9).

## Sperre (M13, Davids Entscheidung)
- DIE SPERRE FRIERT NUR INHALTE EIN: `communities.suspension` hat zwei Stufen
  (`core/shared/communitySuspension.ts`). `'abuse'` nimmt der Resolver vom
  Netz (404 wie ein unbekannter Host, Seite UND API). `'billing'` macht die
  Community NUR-LESEND — an der DATENTÜR, nur an der Klinke `member`: zu ist
  jeder INHALT. OFFEN bleiben alle Owner-Einstellungen (Branding, Team/Rollen,
  Publikum, Registrierung) und die Moderation (Klinke `operator`) — die
  Sperre soll zum Zahlen bewegen, nicht den Owner aussperren. Eine neue
  Owner-Einstellung gehört NICHT hinter die Sperre, eine neue Inhalts-Route
  braucht nichts zu tun.
- Der Abgewiesene erfährt den GRUND nicht (`community.billing`), wohl aber die
  TATSACHE: 403 mit `reason: community_suspended`, EIN Leser dafür
  (`core/app/plugins/community-suspended-notice.client.ts`, ein Toast für
  alle Layer). `my.*`-Karte genauso: `readOnly` (DASS) für jede Rolle,
  `suspension` (WARUM) nur mit `community.billing`.

## Mitmachen verlangt Zugehörigkeit (SEC-030, Davids Entscheidung)
- Ein Pool-Konto ist auf JEDEM Community-Host angemeldet; „angemeldet" sagt
  nichts über „gehört hierher". JEDE schreibende Route der Pool-Produkte ruft
  VOR dem ersten Datenbankzugriff eine Wache: `requireCommunityParticipant
  (event)` für alles, was ein erster eigener Beitrag sein kann (Beitrag,
  Kommentar, Stimme, Reaktion, Zusage, Einschreiben, Melden; bei OFFENER
  Registrierung ist das der Beitritt, A5), `requireCommunityMembership(event)`
  für eigenes Bearbeiten/Löschen und alle Routen der privaten Nachrichten
  (kein Beitritt), oder ein Rollen-Gate. Die Datentür wertet beim Anlegen
  denselben Ausgang als Netz dahinter.
- AUSGÄNGE: `closed`/`removed` ⇒ 403 `reason: not_a_member`; `unavailable` ⇒
  die Mitgliedschaft entscheidet (Pool fail-closed, Silo durch). Melden bleibt
  in einer gesperrten Community offen (`openDuringSuspension`), tritt dort
  aber nicht bei. Die gemerkte Ablehnung schlägt in `joinCommunity` den
  Rollen-Cache.
- EIN Leser für den Grund stellt der Core
  (`community-suspended-notice.client.ts`, nur bei Schreibversuchen); Layer
  mit eigenem Satz melden sich über `pukalani.notices.notAMemberSelfExplained`
  ab.
- WÄCHTER: `packages/core/tests/participation-guard-routes.test.ts` zählt die
  Routen — eine neue schreibende Route ohne Wache ist rot, Ausnahmen stehen
  mit Grund in der Liste. Er prüft nur, DASS eine Wache im Quelltext steht;
  dass sie in jedem Zweig greift, belegen die Proben je Paket
  (`tests/participation-guard.test.ts`, Prüfstand
  `core/tests/support/participationHarness.ts`).
- ÜBERSETZEN NUR FÜR MITGLIEDER (MM1, Davids Entscheidung): jede
  Übersetzungs-Route für Inhalte der Mitglieder ruft
  `requireCommunityMembership` (Kurse: `requireCourseMember`) vor dem ersten
  Datenbankzugriff — kein Beitritt, keine Inhalts-Sperre (eine gesperrte Community bleibt LESBAR,
  darum wird der Cache als `actor: 'operator'` geschrieben — nicht auf
  `member` „korrigieren"). posts, comments und events lesen ihr Ziel
  danach über die Session-Klinke. Den Knopf zeigt der Browser nur mit
  `useCommunityMember()` (Spiegel aus `07.community-role.ts`, DIESELBE
  Funktion wie die Wache — Knopf und Wache dürfen nicht auseinanderlaufen; ohne Mandant ist
  jedes angemeldete Konto Mitglied).

## Kurse: Vorschau für alle, Inhalt für Mitglieder (SEC-029, Davids Entscheidung)
- Übersicht und Vorschau eines VERÖFFENTLICHTEN Kurses sieht jeder, auch ohne
  Konto und in einer Community „nur für Mitglieder"; Lektions-Inhalt,
  Einschreiben, Fortschritt und Übersetzen nur angemeldete Mitglieder.
- Zeilen in `courses` und `lessons` tragen KEIN Leserecht (auch
  veröffentlichte nicht); die Routen lesen über die Operator-Klinke und sind
  die EINZIGE Grenze. Ein Recht an der Zeile gilt neben den Routen und weiß
  nichts von Mitgliedschaft oder Feldauswahl; `Role.users()` ist im Pool kein
  Publikum einer Community. Darum auch kein Eintrag beim Publikums-Wechsel.
- NEUE KURS-ROUTE braucht: (1) öffentliche Antworten NUR über
  `toCoursePreview`/`toLessonSummary` (`courses/shared/coursePreview.ts`),
  nie die rohe Zeile (ein neues Feld würde sonst öffentlich); (2) alles hinter
  der Vorschau ruft `requireCourseMember(event)` VOR dem ersten
  Datenbankzugriff (gleiche Antwort für vorhandene und unbekannte Ids; 403
  `reason: not_a_member`); (3) nur das EINSCHREIBEN ist der Beitritt
  (`requireCourseMemberJoining`: erst Inhalts-Sperre, dann
  `joinCommunity('contribution')`, der AUSGANG zählt — direkt nach einem
  frischen Beitritt sagt der Mitgliedschafts-Cache noch bis zu 30 s „nein").
- Wächter: `packages/courses/tests/course-server-only-read.test.ts` (kein
  `Permission.read` außer `ownRowRead`, keine Route über die
  Mitglieder-Klinke); Live-Beweis: Abschnitt 7 in
  `packages/courses/scripts/verify-pool-isolation.mjs`.

## Betreiber-Inhalt (N7)
- BETREIBER-INHALT gehört nicht auf Mandanten-Hosts: dort 404 — Seite über
  `useIsTenantHost()` (pure Rechnung `isTenantHost` in
  `core/shared/controlCenter.ts`: Tenant-Gate an UND kein Kontroll-Host),
  API über `useTenant(event)`. Die Chrome-Registry
  (`pukalani.chrome.changelogLink/whatsNew: false`) versteckt nur — jede neue
  Betreiber-Seite braucht BEIDE Sperren, Seite und Route. Kontroll-Hosts und
  Silo-Apps bleiben unberührt. Dieselbe Sperre trägt
  `apps/comments/server/api/stats.get.ts` (zählt das ganze Projekt, mit
  Mandant 404, BE-023).
