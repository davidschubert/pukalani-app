---
paths:
  - "packages/*/server/**"
  - "packages/*/shared/**"
  - "apps/*/server/**"
  - "packages/core/app/plugins/**"
  - "eslint.config.mjs"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Mandanten-Isolation: EINE Datentür (seit 2026-07-26)
- In `server/api/**` mandantenfähiger Layer geht Datenzugriff über
  `tenantDb(event)` (core/server/utils/tenantDb.ts) — NICHT über
  `createAdminClient().tablesDB` / `createSessionClient().tablesDB` direkt.
  `list/find/count` scopen immer, `get/update/remove` belegen die Zugehörigkeit
  VOR der Aktion, `create` stempelt communityId + Row-Permissions. `as:'operator'`
  = Admin-Client (Moderation) — dort ist die Tür die EINZIGE Grenze, weil der
  Admin-Client die Row-Permissions bewusst umgeht.
- ZWEI FRAGEN, ZWEI FELDER (seit 2026-08-02, Audit-Befund C1c): `as` sagt, WELCHER
  CLIENT zugreift (Technik: Row-Permissions setzen, rowSecurity-Rows schreiben),
  `actor` sagt, WER HANDELT (Fachlichkeit: `'member' | 'guest' | 'operator'`,
  Default = `as`). Daran hängen die M13-Sperre (`actorFacesContentLock`) und der
  A5-Beitritt (`actorJoinsByWriting`). WARUM getrennt: viele Routen wählen
  `'operator'` NUR wegen der Label-Permissions — gehandelt hat trotzdem ein
  Mitglied. Solange die Sperre an der Klinke hing, meldeten sich diese Routen
  still von ihr ab: von den fünf Inhaltsarten, die M13 namentlich zusagt, war
  genau EINE tatsächlich zu (Umfrage-Stimme, Beitrags-Löschung, RSVP,
  Einschreibung, Lektions-Abschluss liefen vorbei). Drei Actor-Werte, weil ein
  GAST-Kommentar Inhalt ist (Sperre gilt) und trotzdem niemanden zum Mitglied
  macht (kein Konto) — ein Ja/Nein-Flag kann beides nicht gleichzeitig sagen.
  Neue Route mit Operator-Klinke: IMMER prüfen, ob `actor` gesetzt gehört.
- Warum: Isolation hing an drei Dingen, an die man sich erinnern musste
  (scopeQuery/scopeRow/ID-Prüfung). Am 2026-07-26 hat genau das versagt (drei
  Moderations-Routen lasen fremde Zeilen per ID, commit 1cc4855).
- OHNE RESOLVER LEHNT DIE PLATTFORM AB (SEC-025, seit 2026-11-13 — Davids
  Entscheidung „Eine Sicherung, die nicht prüfen kann, lehnt ab"): die Tür
  scopt nur, wenn `00.tenant.ts` einen Mandanten gesetzt hat. Ist
  `pukalani.tenancy.enabled` an, aber kein Resolver registriert (fehlende
  Control-Env), kehrte die Middleware bis dahin STILL zurück — kein Mandant,
  kein 404, also keine Trennung, und `/api/health` war grün. Jetzt: 503
  `tenant_resolver_missing` für jeden Host und Pfad, auch für Kontroll-Hosts
  (ohne Resolver belegt niemand, dass ein Host KEIN Mandant ist). Durch kommen
  nur `/api/health` (meldet `ok:false` mit diesem Grund), `/_i18n/` und Nuxts
  Fehlerseiten-Durchgang (gebrandete Seite mit eigenem Satz; Realtime startet
  dort nicht, `isHostUnservedError`). Kein Schalter, kein Rückfall auf
  „Single-Tenant". Ein ZWEITES Netz in der Tür selbst gibt es bewusst nicht:
  Exporte, Spiegel und Sweeps rufen sie mit Ereignissen ohne Mandant, die
  Prüfung bräche sie. Beweis: `packages/core/tests/tenantMiddleware.test.ts`.
- AUSSERHALB der Tür erlaubt (per Definition mandantenübergreifend):
  Migrationen, Sweeps/Intervall-Plugins, GDPR-Orchestrierung, Control Plane.
- Die Mandanten-Id kommt NIE vom Aufrufer (`stripTenantKey` entfernt BEIDE
  Schlüssel, `communityId` und den Übergangs-Stempel `tenantId`) — sonst schreibt
  ein durchgereichter Body in einen fremden Mandanten.
- BACKSTOP (seit 2026-07-27): ESLint verbietet rohes `.tablesDB` in
  `server/api/**` UND `server/plugins/**` der gepoolten Layer (comments, posts,
  pages, moderation, events, courses — eslint.config.mjs, no-restricted-syntax).
  `server/plugins/**` kam am 2026-07-28 dazu (Dashboard-Audit B2): der
  Stats-Contributor von comments liegt dort und zählte deshalb ungebremst
  pool-weit in eine Kunden-Ansicht. Wer einen H3Event bekommt, bedient einen
  REQUEST und gehört hinter dieselbe Tür wie eine Route; eventlose Sweeps
  brauchen eine begründete eslint-disable-Zeile statt einer Aufweichung.
  Neue Pool-Layer in die Liste aufnehmen, sobald ihre Tabellen communityId
  tragen. Pool-Unique-
  Regel gilt weiter, ABER nur für tenant-RELATIVE Schlüssel: Host/Slug brauchen
  communityId (comments-015 uq_tenant_host, pages-004, courses-002 uq_tenant_slug
  — die INDEXNAMEN blieben, nur die Spalte wurde umbenannt),
  Row-Id-basierte NICHT (events/courses (courseId,userId) — eine Row-Id ist
  global eindeutig, da kann kein Mandant kollidieren).
- DIE SPERRE FRIERT NUR INHALTE EIN (M13, seit 2026-08-02 — Davids
  Entscheidung, festgehalten 2026-08-03): `communities.suspension` hat zwei
  Stufen (`core/shared/communitySuspension.ts`). `'abuse'` nimmt der Resolver
  vom Netz (⇒ 404 wie ein unbekannter Host, Seite UND API); `'billing'` macht
  die Community NUR-LESEND — und zwar AN DER DATENTÜR, nur an der Türklinke
  `member`. Zu ist damit jeder INHALT (Kommentare, Beiträge, Umfragen,
  Zu-/Absagen, Kursfortschritt). OFFEN bleiben bewusst alle Owner-Einstellungen
  (Branding, Team/Rollen, Publikum, Registrierung) und die Moderation
  (Klinke `operator`) — die laufen über die Service-Naht ins Control Plane, nicht
  durch die Tür. Grund: die Sperre soll zum ZAHLEN bewegen, nicht den Owner aus
  seiner Community aussperren; eine gesperrte Community, die niemand mehr
  moderieren kann, wird zum Problem des Betreibers. Eine neue Owner-Einstellung
  gehört also NICHT hinter die Sperre, eine neue Inhalts-Route braucht nichts zu
  tun. Der Abgewiesene erfährt den GRUND nicht (`community.billing`), wohl aber
  die TATSACHE: das 403 trägt `reason: community_suspended`, den EINEN Leser
  dafür stellt `core/app/plugins/community-suspended-notice.client.ts`
  ($fetch-Interceptor, ein Toast für alle Layer). Dieselbe Trennung auf der
  `my.*`-Karte: `readOnly` (DASS) für jede Rolle, `suspension` (WARUM) nur mit
  `community.billing`.
- SITE-LABEL = „ist Mitglied dieser Community" (A5, seit 2026-07-29 — ersetzt
  die A4-Regel „hat den Host eingeloggt benutzt", die noch am selben Tag zur
  Lüge wurde: „Zugang entziehen" nahm nur die Rolle, das Label kam beim nächsten
  Besuch zurück, die entfernte Person las weiter mit).
  `core/server/middleware/06.community-label.ts` vergibt `Role.label(communityId)` genau dem,
  der eine `community_members`-Zeile MIT ZUGANG hat (idempotent, additiv — mehrere
  Communities = mehrere Labels; `grantCommunityLabel`/`revokeCommunityLabel` in
  core/server/utils/communityLabel.ts). Ein Label ist ein LESE-Publikum, KEINE Rolle —
  Autorisierung läuft über requireCommunityPermission/Site-Rollen, `hasCapability`
  kennt nur 'admin'/'moderator' (grantCommunityLabel verweigert solche Labels).
  EIN SCHREIBER, ENTZUG WIRD NACHGEPRÜFT (SEC-024, seit 2026-11-13 — Davids
  Entscheidung „Eine Sicherung, die nicht prüfen kann, lehnt ab"): JEDER
  Schreibvorgang auf Konto-Labels (Community-Labels UND Betreiber-Rollen der
  admin-Routen) läuft über `mutateUserLabels` (core/server/utils/userLabels.ts):
  je Konto im Prozess serialisiert, frisch gelesen, NUR die genannten Labels
  hinzu/weg, nachgelesen, einmal wiederholt, Ergebnis zurück statt nur Log —
  `updateLabels` setzt die ganze Liste, und zwei Schreiber vom selben alten
  Stand überschrieben einander. Vergabe bleibt fail-soft; `revokeCommunityLabel`
  gibt `{ revoked }` zurück, und „Zugang entziehen" antwortet bei `false` mit
  502 `label_revoke_failed` statt `ok` (Stilllegen zählt `labels.failed`).
  Zwischen PROZESSEN hilft die Kette nicht — dafür gleicht ein stündlicher Lauf
  der Platform-App nach (`onboarding/server/utils/labelReconcile.ts`, Schalter
  `pukalani.community.labelReconcile` off/dry-run/apply): nur Labels mit
  `removed`-Zeile und ohne Zeile MIT Zugang, nie Betreiber-Rollen, nie Bestand
  ohne Zeile. Das Label ist `communities.$id` (= `community_members.communityId`),
  NICHT `tenantId`. Runbook: docs/runbooks/LABEL-ABGLEICH.md.
- MITGLIEDSCHAFT IST EIN EREIGNIS (A5): Vertrag `core/shared/communityJoin.ts` +
  Registry `core/server/utils/communityJoin.ts` (`registerCommunityJoinHandler` — die
  Naht zum Control Plane besitzt der onboarding-Layer, A14), Regel `decideJoin`
  in `packages/control/shared/communityTeam.ts`, Route
  `POST /api/control/community/members/join`. Gesteuert vom BESTEHENDEN Schalter
  `communities.openRegistration`: OFFEN ⇒ Beitritt (Rolle `viewer`), GESCHLOSSEN ⇒
  nur per Einladung. ZWEI Auslöser, mehr nicht: (1) `registration` — Kontoanlage
  auf dem Mandanten-Host (signup.post.ts + otp/verify.post.ts, dort wo der Feed
  schon „user.joined" sagt); (2) `contribution` — der erste eigene
  Schreibvorgang, abgefangen in der DATENTÜR (`tenantDb().create`, nur Türklinke
  'member') statt in zwanzig Routen. Ein SEITENAUFRUF löst bewusst NICHTS aus
  (sonst wäre jeder Vorbeisurfer Mitglied und „Zugang entziehen" wieder
  wirkungslos). Preis: bei `contribution` steht das Label erst mitten in der
  Sitzung — der offene Realtime-WS behält seine Rollen, die Anwesenheit kommt
  über Heartbeat + den 20-s-Leser-Poll (usePresence POLL_MS) an. ENTZOGEN
  schlägt jeden Auslöser (Rückkehr nur per Einladung); BESTAND aus der A4-Zeit
  (Label ohne Zeile) übernimmt sich beim nächsten Besuch selbst
  (`trigger: 'legacy'`, umgeht den Schalter — kein Backfill-Skript, weil die
  Wahrheit im Runtime-Projekt und die Zeile im Control Plane liegt). Beweis:
  Abschnitt 10 in `packages/onboarding/scripts/verify-site-authz.mjs`.
- MITMACHEN VERLANGT ZUGEHÖRIGKEIT (SEC-030, seit 2026-11-13 — Davids
  Entscheidung 2026-11-12): ein Konto im Pool ist auf JEDEM Community-Host
  angemeldet, „angemeldet" sagt also nichts über „gehört hierher". Bis dahin
  fragte die Datentür zwar nach dem Beitritt, las die Antwort aber nicht —
  geschlossene Registrierung und „Zugang entziehen" hielten niemanden vom
  Schreiben ab. Jetzt ZÄHLT DER AUSGANG, an zwei Stellen: (1) jede schreibende
  Route der Pool-Produkte ruft eine Wache, VOR dem ersten Datenbankzugriff —
  `requireCommunityParticipant(event)` für alles, was ein erster eigener
  Beitrag sein kann (Beitrag, Kommentar, Stimme, Reaktion, Zusage,
  Einschreiben, Melden; bei OFFENER Registrierung ist das weiter der Beitritt,
  A5), `requireCommunityMembership(event)` für eigenes Bearbeiten/Löschen und
  alle Routen der privaten Nachrichten (kein Beitritt), oder ein Rollen-Gate;
  (2) die Datentür wertet beim Anlegen denselben Ausgang als Netz dahinter.
  `closed`/`removed` ⇒ 403 `reason: not_a_member`; `unavailable` ⇒ die
  Mitgliedschaft entscheidet (Pool fail-closed, Silo durch — ein Ausfall des
  Control Plane kostet ein Mitglied mit Label keinen Kommentar, einen
  Erst-Beitritt schon). Melden bleibt in einer gesperrten Community offen
  (`openDuringSuspension`), tritt dort aber nicht bei. ÜBERSETZEN ist Lesen,
  nicht Mitmachen: die drei Routen (posts, comments, events) verlangen nur
  die Anmeldung und lesen ihr Ziel über die Session-Klinke. Die gemerkte
  Ablehnung schlägt in `joinCommunity` den Rollen-Cache (sonst schrieb eine
  entfernte Person noch 30 s weiter). EINEN Leser für den Grund stellt der
  Core (`community-suspended-notice.client.ts`, nur bei Schreibversuchen;
  Layer mit eigenem Satz melden sich über
  `pukalani.notices.notAMemberSelfExplained` ab). Wächter:
  `packages/core/tests/participation-guard-routes.test.ts` zählt die Routen
  selbst — eine neue schreibende Route ohne Wache wird rot, Ausnahmen stehen
  mit Grund in der Liste. Der Wächter prüft nur, DASS eine Wache im Quelltext
  steht; dass sie in jedem Zweig greift, belegen die Proben je Paket
  (`tests/participation-guard.test.ts`, Prüfstand
  `core/tests/support/participationHarness.ts`).
- ENTFERNT ⇒ KEIN ZUGRIFF, NUR DER HINWEIS (SEC-030 Teil 2, seit 2026-11-13 —
  Davids Entscheidung 2026-11-12): wem ein Admin den Zugang entzogen hat
  (`community_members.status='removed'` — eine POSITIVE Tatsache; „war nie
  Mitglied" ist etwas anderes und sieht den Hinweis NICHT), der bekommt auf
  dem Host dieser Community angemeldet nichts mehr. ERKENNEN:
  `isRemovedFromCommunity(event)` (core/server/utils/communityRemoval.ts, pure
  Reihenfolge `detectCommunityRemoval`): frische Notiz „gerade entzogen" ⇒ ja
  (schlägt Rollen-Cache 30 s UND den Cache „ehemalig" 60 s) · frische Notiz
  „wieder aufgenommen" ⇒ nein (`rememberCommunityAccessRestored` in
  accept.post.ts, sonst bliebe eine neu Eingeladene bis zu 60 s draußen) ·
  aktive Rolle ⇒ nein · sonst `resolveFormerMembers`. FAIL-SOFT: bei Störung
  „nein" — die Sperre darf kein Mitglied auf Verdacht aussperren; die
  Schreib-Wachen dahinter bleiben fail-closed. SPERREN:
  `server/middleware/06.community-removed.ts` (nach `06.community-label`)
  setzt `event.context.communityRemoved` und antwortet JEDER `/api/**`-Route
  mit 403 `reason: community_removed`, außer der ERLAUBNISLISTE
  (`removedApiAllowed`, fail-closed, Segmentgrenze): Core `/api/auth/me`,
  `/api/auth/logout`, `/api/health`, `/api/_nuxt_icon`; Layer melden weitere
  über `pukalani.community.removedAllowedApi` an (onboarding: Kontakt-Route und
  die zwei Routen des Rückwegs per Einladung). NEUE ROUTE AUF DER LISTE ⇒ sie
  darf nur über das EIGENE Konto antworten, nie etwas aus der Community.
  ZEIGEN: der Zustand reist per SSR in den Client (`useCommunityRemoved`), die
  globale Routen-Middleware `community-removed.global.ts` führt jede Seite auf
  `pukalani.community.removedNoticePath` (onboarding: `/removed`), der zentrale
  403-Leser lädt bei `community_removed` dorthin um (Entzug mitten in der
  Sitzung). Realtime ist für Entfernte aus (`realtimeEnabled()`): kein Socket,
  kein Token, kein Heartbeat. KONTAKT:
  `POST /api/community/removed-contact` (onboarding) — nur für Entfernte (sonst
  404), eine Nachricht je 7 Tage je (Community, Konto), atomar VOR dem Versand
  gezählt (`store.hit`) plus dauerhaft über die `rowId` der Glocken-Zeile;
  Glocke (`member.appeal`) und genau eine Mail je Owner/Admin mit `Reply-To`
  der Person; die Antwort verrät nichts über die Empfänger. Abgemeldet liest
  eine entfernte Person in einer ÖFFENTLICHEN Community weiter, was jeder Gast
  liest — das ist die Bedeutung von „öffentlich", keine Lücke. Beweis:
  Abschnitt 10 b2 in `packages/onboarding/scripts/verify-site-authz.mjs`,
  E2E `apps/comments/e2e/community-removed.spec.ts` (nur gegen eine
  Pool-Bühne, in der CI übersprungen).
- KURSE: VORSCHAU FÜR ALLE, INHALT FÜR MITGLIEDER (SEC-029, seit 2026-11-13 —
  Davids Entscheidung 2026-11-12): Übersicht und Vorschau eines
  VERÖFFENTLICHTEN Kurses sieht jeder, auch ohne Konto und auch in einer
  Community „nur für Mitglieder"; Lektions-Inhalt, Einschreiben, Fortschritt
  und Übersetzen gibt es nur für angemeldete Mitglieder. Rechte-Modell „nur
  Server-Zugriff" wie bei `pages`: Zeilen in `courses` und `lessons` tragen
  KEIN Leserecht (auch veröffentlichte nicht), die Routen lesen über die
  Operator-Klinke und sind die EINZIGE Grenze. Deshalb gibt es für Kurse auch
  keinen Eintrag beim Publikums-Wechsel (kein Recht, das umziehen könnte).
  Drei Dinge, die eine neue Kurs-Route braucht: (1) öffentliche Antworten
  NUR über die Feldauswahl `toCoursePreview`/`toLessonSummary`
  (`courses/shared/coursePreview.ts`) — nie die rohe Zeile, ein neues Feld
  wird sonst von selbst öffentlich; (2) alles hinter der Vorschau ruft
  `requireCourseMember(event)` VOR dem ersten Datenbankzugriff (gleiche
  Antwort für vorhandene und unbekannte Ids; 403 mit `reason: not_a_member`);
  (3) nur das EINSCHREIBEN darf der Beitritt sein
  (`requireCourseMemberJoining`: erst Inhalts-Sperre, dann
  `joinCommunity('contribution')`, und der AUSGANG zählt — direkt nach einem
  frischen Beitritt sagt der Mitgliedschafts-Cache noch bis zu 30 s „nein").
  WARUM KEIN LESERECHT AN DER ZEILE: ein Recht an der Zeile gilt NEBEN den
  Routen und weiß nichts von Mitgliedschaft oder Feldauswahl; im Pool ist
  `Role.users()` außerdem kein Publikum einer Community. Wächter: `packages/courses/tests/course-server-only-read.test.ts`
  (kein `Permission.read` außer `ownRowRead`, keine Route über die
  Mitglieder-Klinke); Live-Beweis: Abschnitt 7 in
  `packages/courses/scripts/verify-pool-isolation.mjs`.
- BENACHRICHTIGUNGEN sind ABLAGE, nicht Zugriff (C15, seit 2026-07-29):
  `notifications.communityId` (system-022, seit E8-3 so benannt) entscheidet, in WELCHER Glocke eine
  Meldung erscheint — wer sie lesen darf, bleiben die Row-Permissions (nur
  `recipientId`). `notify()` verlangt daher ein PFLICHTFELD
  `scope: 'tenant' | 'account'`: 'account' = bewusst mandantenlos (Stripe-
  Zahlungsproblem, Control-Anfragen — die betreffen den Vertrag, nicht die
  Community). Kein Default, weil ein geratener Stempel eine Zahlungswarnung in
  fremde Glocken legt; der Typfehler ersetzt hier den ESLint-Backstop, der in
  `server/utils/**` nicht greift. EINE pure Regel für Schreiben, Leseroute UND
  Realtime-`where`: `core/shared/notificationScope.ts`. Drei Spaltenwerte:
  `<communityId>` · `_account` (kollisionsfrei — Row-Ids beginnen nie mit `_`) ·
  `''` = unbekannt. `''` ist hier FAIL-OPEN und damit die BEGRÜNDETE AUSNAHME
  von `rowBelongsToTenant` — ohne Backfill würde fail-closed jedem Nutzer im
  Deploy-Moment die Glocke leeren. Nicht „korrigieren". Der Digest-Sweep bleibt
  mandantenübergreifend (eine Mail/Tag, nicht eine je Community).
  WER ZAHLT, ENTSCHEIDET DIE GLOCKE (Davids Entscheidung 2026-08-03 — schärft
  C15, hebt es NICHT auf): eine Zahlungswarnung ist `scope: 'account'`, solange
  ein KONTO der Vertragspartner ist (Silo/Einzel-Abo — Stripe-Webhook,
  `/account/billing`). Bei einem COMMUNITY-Abo (A6) zahlt die COMMUNITY, und
  ihr Owner ist genau dort eingeloggt, wo auch der Knopf sitzt: `scope:
  'tenant'` mit der communityId, Link `/dashboard/settings/subscription`. Kein
  Mitglied sieht sie deswegen — das war NIE die Aufgabe des Stempels, sondern
  die der Row-Permissions (`read(user:<owner>)`). GESCHRIEBEN WIRD SIE IM POOL,
  nicht im Webhook: der läuft auf `control`, `metadata.userId` eines
  Community-Checkouts ist aber eine POOL-Id (dort 404 `user_not_found`), und
  das Control Plane hat keinen Pool-Schlüssel (dieselbe Grenze wie bei
  `revokeCommunityLabel`, A5). Arbeitsteilung wie bei M13: der Webhook stempelt
  (`billingStatus`/`pastDueSince`), der stündliche Lauf der Platform-App meldet
  (`packages/onboarding/server/utils/pastDueNotice.ts`, Leser
  `packages/control/server/utils/pastDueNoticeReader.ts`, verdrahtet in
  `apps/platform/server/plugins/past-due-notice.ts`). BEWUSST KEINE neue
  Service-Naht control→platform: die kostete ein zweites Secret, einen
  Dienst-Endpunkt auf einem öffentlichen Mehr-Mandanten-Host und einen
  Geldpfad, der bei einem Platform-Ausfall Stripe-Retrys auslöst — für
  Sofortigkeit, die neben einer 14-Tage-Frist wertlos ist. „Genau einmal" macht
  der neue Idempotenz-Schlüssel von `notify()` (`rowId`, 409 → kein Eintrag UND
  keine Mail, `created: false`) aus communityId + `pastDueSince` +
  recipientId — kein „erst nachsehen, dann schreiben". `notify()` ist dafür
  ohne `H3Event` aufrufbar und nimmt den Ablage-Wert per `communityId`
  explizit entgegen (ein Sweep hat keinen Mandanten-Kontext); ACHTUNG, das ist
  `communities.tenantId` (`t-…`), nicht `communities.$id`.
- MAIL-LINKS FOLGEN DERSELBEN ABLAGE (D5, seit 2026-08-01): eine Benachrichtigungs-
  MAIL verlinkt auf den Host DER COMMUNITY, nicht mehr auf `public.appUrl`. Pure
  Regel `core/shared/notificationLinks.ts` (dieselben drei Spaltenwerte:
  `<communityId>` ⇒ Community-Host · `_account` ⇒ App-Host · `''` ⇒ App-Host).
  Aufgelöst über den Registry-Vertrag `registerCommunityHostResolver`
  (core/server/utils/communityHost.ts; Implementierung
  `packages/control/server/utils/communityHostResolver.ts`, verdrahtet in
  apps/platform) — zwei Eigenheiten mit Grund: OHNE `H3Event`, weil der
  Digest-Sweep ohne Request läuft, und GEBÜNDELT, weil der Sweep sonst N+1 über
  Projektgrenzen liefe. Nachgeschlagen wird `communities.tenantId`, NICHT `$id`
  (E8-3 hat die Spalte umbenannt, nicht den Wert). FAIL-SOFT: kein Host ⇒
  App-Basis, eine Mail wird NIE verworfen — deshalb muss jeder Test hier eine
  Gegenprobe haben, sonst ist er immer grün. JEDER EINTRAG einer Digest-Mail
  trägt seinen eigenen Host (die Sammel-Mail ist bewusst mandantenübergreifend).
  Beweise: `packages/core/tests/notificationLinks.test.ts`,
  `packages/control/tests/communityHostResolver.test.ts` und der Mailpit-Beweis
  `packages/core/scripts/verify-notification-mail-links.mjs` (11/11).
- WO HÄNGT DIE GLOCKE? (C17, seit 2026-07-29): sie wird NUR aus
  `pukalani.chrome.utilities` gerendert, und dessen einziger Konsument ist das
  blueprint-Layout — eine App OHNE blueprint hat also keine. Genau das traf
  `apps/control`, wo BEIDE `scope:'account'`-Absender leben (Stripe-Webhook,
  Early-Access-Anfragen) und wo auch ihre Empfänger Konten sind: Absender,
  Empfänger und Leser liegen alle im control-Projekt — `my.pukalani.app` (Pool)
  war nie der Leser, dort entsteht heute keine `_account`-Zeile. Schalter
  `pukalani.chrome.accountBell` (Core-Default AUS, apps/control an) hängt sie ins
  core-default-Layout und in die Dashboard-Shell, dort in die SEITENLEISTE neben
  die Suche (oben rechts sitzen die Aktionen der Seiten-Kopfzeilen — eine
  schwebende Glocke verdeckte sie). Der Schalter sagt nur, OB sie hängt; WAS sie
  zeigt, bleibt das Publikum ihres Hosts. Jeder neue notify()-TYP braucht einen
  Zweig in messageKey() + Text in de/en — der Rückfall auf 'replied' macht ein
  Loch unsichtbar; Netz: `packages/core/tests/notificationBellTexts.test.ts`.
- BETREIBER-Inhalt gehört nicht auf Mandanten-Hosts (N7, seit 2026-07-28):
  der öffentliche Changelog (admin-Layer) antwortet dort 404 — Seite via
  `useIsTenantHost()` (core, pure Ausschluss-Rechnung in shared/controlCenter.ts:
  Tenant-Gate an UND kein Kontroll-Host ⇒ Mandant), API via `useTenant(event)`.
  Die Chrome-Registry (`pukalani.chrome.changelogLink/whatsNew: false`) versteckt
  nur — jede neue Betreiber-Seite braucht BEIDE Sperren, Seite und Route.
  Kontroll-Hosts und Silo-Apps (comments) bleiben unberührt.
