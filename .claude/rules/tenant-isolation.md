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
