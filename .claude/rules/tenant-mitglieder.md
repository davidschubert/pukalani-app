---
paths:
  - "packages/core/server/utils/community*.ts"
  - "packages/core/server/utils/userLabels.ts"
  - "packages/core/server/utils/notify.ts"
  - "packages/core/server/utils/notification*.ts"
  - "packages/core/server/middleware/06.community-*.ts"
  - "packages/core/server/middleware/07.community-role.ts"
  - "packages/core/server/api/presence/**"
  - "packages/core/shared/community*.ts"
  - "packages/core/shared/notification*.ts"
  - "packages/core/app/middleware/community-removed.global.ts"
  - "packages/core/app/composables/useCommunityRole.ts"
  - "packages/core/app/components/NotificationBell.global.vue"
  - "packages/control/server/**"
  - "packages/admin/server/**"
  - "packages/core/server/api/auth/**"
  - "packages/core/server/utils/tenantDb.ts"
  - "packages/control/shared/community*.ts"
  - "packages/onboarding/server/**"
  - "apps/platform/server/plugins/**"
  - "packages/*/server/api/**"
---

# Mandanten: Label, Beitritt, Entzug, Benachrichtigungen

Datentür, „DER SERVER SCHREIBT", Sperre und Mitmach-Wachen:
`tenant-isolation.md`.

## Label und Beitritt
- SITE-LABEL = „ist Mitglied dieser Community" (A5):
  `core/server/middleware/06.community-label.ts` vergibt `Role.label
  (communityId)` genau dem, der eine `community_members`-Zeile MIT ZUGANG hat
  (idempotent, additiv; `grantCommunityLabel`/`revokeCommunityLabel` in
  `core/server/utils/communityLabel.ts`). Ein Label ist ein LESE-Publikum,
  KEINE Rolle — Autorisierung über `requireCommunityPermission`/Site-Rollen;
  `hasCapability` kennt nur `'admin'`/`'moderator'`, `grantCommunityLabel`
  verweigert solche Labels. Das Label ist `communities.$id` (=
  `community_members.communityId`), NICHT `tenantId`.
- EIN LABEL-SCHREIBER (SEC-024, Davids Entscheidung): JEDER Schreibvorgang auf
  Konto-Labels (Community-Labels UND Betreiber-Rollen der admin-Routen) läuft
  über `mutateUserLabels` (`core/server/utils/userLabels.ts`: je Konto
  serialisiert, frisch gelesen, nur die genannten Labels, nachgelesen, einmal
  wiederholt, Ergebnis zurück) — `updateLabels` setzt die ganze Liste, zwei
  Schreiber vom selben Stand überschreiben einander. Vergabe bleibt
  fail-soft; `revokeCommunityLabel` gibt `{ revoked }` zurück, „Zugang
  entziehen" antwortet bei `false` mit 502 `label_revoke_failed`, Stilllegen
  zählt `labels.failed`.
- NIE DER LETZTE AKTIVE ADMIN (SA1): Löschen, Sperren und Entzug von `admin`
  laufen über `withLastAdminGuard` (`core/server/utils/lastAdmin.ts`, frisch
  gezählt, unter der Regel-Sperre `core/server/utils/ruleLock.ts`) ⇒ 409
  `last_admin`. Neuer Weg, der ein Konto sperrt oder löscht ⇒ derselbe Wächter.
- LABEL-ABGLEICH zwischen Prozessen: stündlicher Lauf der Platform-App
  (`onboarding/server/utils/labelReconcile.ts`, Schalter
  `pukalani.community.labelReconcile` off/dry-run/apply). Er nimmt nur Labels
  mit `removed`-Zeile und ohne Zeile MIT Zugang, nie Betreiber-Rollen, nie
  Bestand ohne Zeile; dazu (SI1 b) eine `active`-Zeile in einer STILLGELEGTEN
  Community (beide Labels; die Community wird unmittelbar vorher frisch
  gefragt) und das Moderations-Label nach einer Herabstufung in den letzten
  26 Stunden (nur dieses, über `revokeCommunityModeratorLabel`; Rolle frisch
  gelesen). Runbook: `docs/runbooks/LABEL-ABGLEICH.md`.
- BEITRITT IST EIN EREIGNIS (A5): Vertrag `core/shared/communityJoin.ts` +
  Registry `core/server/utils/communityJoin.ts` (`registerCommunityJoinHandler`
  — die Naht zum Control Plane besitzt onboarding, A14), Regel `decideJoin` in
  `packages/control/shared/communityTeam.ts`, Route `POST
  /api/control/community/members/join`. Schalter `communities.openRegistration`:
  OFFEN ⇒ Beitritt (Rolle `viewer`), GESCHLOSSEN ⇒ nur per Einladung. GENAU
  ZWEI Auslöser: `registration` (Kontoanlage auf dem Mandanten-Host:
  `signup.post.ts`, `otp/verify.post.ts`) und `contribution` (erster eigener
  Schreibvorgang, abgefangen in `tenantDb().create`, nur Klinke `member`).
  Ein SEITENAUFRUF löst NICHTS aus (sonst wäre jeder Vorbeisurfer Mitglied).
  Falle: bei `contribution` steht das Label erst mitten in der Sitzung — der
  offene Realtime-WS behält seine Rollen, die Anwesenheit kommt über Heartbeat
  + den 20-s-Leser-Poll (`usePresence`, `POLL_MS`). ENTZOGEN schlägt jeden
  Auslöser (Rückkehr nur per Einladung); Bestand aus der A4-Zeit (Label ohne
  Zeile) übernimmt sich beim nächsten Besuch selbst (`trigger: 'legacy'`,
  umgeht den Schalter, kein Backfill-Skript). Beweis: Abschnitt 10 in
  `packages/onboarding/scripts/verify-site-authz.mjs`.
- ROLLEN-TOR UND ANWESENHEIT FRAGEN DIE ZUGEHÖRIGKEIT (BT1 e):
  `requireCommunityPermission` liest die frische Entzugs-Notiz VOR der Rolle
  (dieselbe Reihenfolge wie `resolveCommunityMembership` und
  `joinCommunity`); steht sie, zählt die gecachte Rolle nicht. Der Betreiber
  im Not-Zugang kommt über sein Label und ist nicht betroffen. `POST
  /api/presence/heartbeat` schreibt im Pool nur für Mitglieder der Community
  des Hosts (`resolveCommunityMembership`); alle anderen bekommen ein stilles
  `ok` ohne Lesen oder Schreiben (kein 403 — der Takt läuft in jedem Reiter).
  Ist die Frage nicht beantwortbar, entscheidet das Label am Konto. Beweise:
  `packages/core/tests/communityPermission.test.ts`,
  `packages/core/tests/route-roles-platform.test.ts`,
  `packages/onboarding/tests/route-roles-members.test.ts`.

## Entfernt ⇒ kein Zugriff, nur der Hinweis (SEC-030 Teil 2, Davids Entscheidung)
- Gilt für `community_members.status='removed'` — eine POSITIVE Tatsache;
  „war nie Mitglied" ist etwas anderes und sieht den Hinweis NICHT. Angemeldet
  bekommt die Person auf dem Host dieser Community nichts mehr.
- ERKENNEN: `isRemovedFromCommunity(event)`
  (`core/server/utils/communityRemoval.ts`, pure Reihenfolge
  `detectCommunityRemoval`): frische Notiz „gerade entzogen" ⇒ ja (schlägt
  Rollen-Cache 30 s UND Cache „ehemalig" 60 s) · frische Notiz „wieder
  aufgenommen" ⇒ nein (`rememberCommunityAccessRestored` in `accept.post.ts`)
  · aktive Rolle ⇒ nein · sonst `resolveFormerMembers`. FAIL-SOFT: bei
  Störung „nein" — kein Mitglied auf Verdacht aussperren; die Schreib-Wachen
  dahinter bleiben fail-closed.
- SPERREN: `core/server/middleware/06.community-removed.ts` (nach
  `06.community-label`) setzt `event.context.communityRemoved` und antwortet
  JEDER `/api/**`-Route mit 403 `reason: community_removed`, außer der
  ERLAUBNISLISTE (`removedApiAllowed`, fail-closed, Segmentgrenze; Core-Teil
  in `core/shared/communityRemoval.ts`, Layer melden weitere über
  `pukalani.community.removedAllowedApi` an). NEUE ROUTE AUF DER LISTE ⇒ sie
  darf nur über das EIGENE Konto antworten, nie etwas aus der Community.
- ZEIGEN: der Zustand reist per SSR in den Client (`useCommunityRemoved`), die
  globale Routen-Middleware `community-removed.global.ts` führt jede Seite auf
  `pukalani.community.removedNoticePath`, der zentrale 403-Leser lädt bei
  `community_removed` dorthin um. Realtime ist für Entfernte aus
  (`realtimeEnabled()`): kein Socket, kein Token, kein Heartbeat.
- KONTAKT: `POST /api/community/removed-contact` (onboarding) — nur für
  Entfernte (sonst 404), eine Nachricht je 7 Tage je (Community, Konto),
  atomar VOR dem Versand gezählt (`store.hit`) plus dauerhaft über die `rowId`
  der Glocken-Zeile; Glocke (`member.appeal`) und genau eine Mail je
  Owner/Admin mit `Reply-To` der Person; die Antwort verrät nichts über die
  Empfänger.
- Abgemeldet liest eine entfernte Person in einer ÖFFENTLICHEN Community, was
  jeder Gast liest — das ist „öffentlich", keine Lücke. Beweise: Abschnitt
  10 b2 in `packages/onboarding/scripts/verify-site-authz.mjs`, E2E
  `apps/comments/e2e/community-removed.spec.ts` (nur gegen eine Pool-Bühne,
  in der CI übersprungen).

## Benachrichtigungen
- BENACHRICHTIGUNGEN SIND ABLAGE, NICHT ZUGRIFF (C15):
  `notifications.communityId` entscheidet, in WELCHER Glocke eine Meldung
  erscheint; lesen darf, wen die Row-Permissions nennen (nur `recipientId`).
  `notify()` verlangt das PFLICHTFELD `scope: 'tenant' | 'account'`, KEIN
  Default; `'account'` ist bewusst mandantenlos (Vertrag statt Community:
  Stripe-Zahlungsproblem, Control- und Early-Access-Anfragen) (ein geratener Stempel legt eine Zahlungswarnung in fremde Glocken;
  der Typfehler ersetzt den ESLint-Backstop, der in `server/utils/**` nicht
  greift). EINE pure Regel für Schreiben, Leseroute UND Realtime-`where`:
  `core/shared/notificationScope.ts`. Drei Spaltenwerte: `<communityId>` ·
  `_account` · `''` = unbekannt. `''` ist FAIL-OPEN — die BEGRÜNDETE AUSNAHME
  von `rowBelongsToTenant` (fail-closed leerte Altbestand-Glocken). Nicht
  „korrigieren". Der Digest-Sweep bleibt mandantenübergreifend (eine Mail je
  Tag).
- WER ZAHLT, ENTSCHEIDET DIE GLOCKE (Davids Entscheidung, schärft C15): eine
  Zahlungswarnung ist `scope: 'account'`, solange ein KONTO Vertragspartner
  ist (Silo/Einzel-Abo); bei einem COMMUNITY-Abo `scope: 'tenant'` mit der
  communityId, Link `/dashboard/settings/subscription` (lesen darf trotzdem
  nur der Owner, über die Row-Permissions). Sie wird IM POOL geschrieben,
  nicht im Webhook (der läuft auf `control`, hat keinen Pool-Schlüssel, und `metadata.userId`
  eines Community-Checkouts ist eine POOL-Id): der
  Webhook stempelt (`billingStatus`/`pastDueSince`), der stündliche Lauf meldet
  (`packages/onboarding/server/utils/pastDueNotice.ts`, Leser
  `packages/control/server/utils/pastDueNoticeReader.ts`, verdrahtet in
  `apps/platform/server/plugins/past-due-notice.ts`). BEWUSST keine neue
  Service-Naht control→platform. „Genau einmal" macht der Idempotenz-Schlüssel
  von `notify()` (`rowId` aus communityId + `pastDueSince` + recipientId; 409 ⇒ kein Eintrag UND keine Mail, `created:
  false`) — kein „erst nachsehen, dann schreiben". Ohne `H3Event` nimmt
  `notify()` den Ablage-Wert per `communityId` explizit; ACHTUNG, das ist
  `communities.tenantId` (`t-…`), nicht `communities.$id`.
- ENTFERNT ⇒ KEINE BENACHRICHTIGUNG (MM1 b): `notify()` fragt bei `scope:
  'tenant'` VOR dem Schreiben, ob der Empfänger aus der Community des Stempels
  entfernt ist: keine Zeile, keine Mail, `{ created: false, skipped:
  'former_member' }` (kein Fehlschlag; wer Störungen nachholt, zählt es
  nicht). Reihenfolge wie `detectCommunityRemoval`: erst die Notiz im Request
  (`communityAccessMemory`: gerade entzogen ⇒ aus, wieder aufgenommen ⇒
  zustellen), dann `resolveFormerMembersOfTenant(stempel,
  konten)` (`core/server/utils/communityMembership.ts`, ohne Request über
  `communities.tenantId`; Implementierung
  `createFormerMembersByTenantResolver` im control-Layer). Die Sammel-Mail
  fragt gebündelt je Community und lässt aus, was vor dem Entzug liegen
  blieb. FAIL-SOFT (anders als die Sperren): ohne Antwort geht die Meldung
  raus. Ausnahme: die neue Einladung stellt zu (`formerMember: 'deliver'`,
  `siteInvite`) — sie ist der Rückweg. Ein neuer `notify()`-Aufruf braucht
  nichts zu tun. Beweise: `packages/core/tests/notifyFormerMember.test.ts`,
  `packages/onboarding/scripts/verify-removed-notifications.mjs` (Bühne, mit
  Gegenprobe).
- MAIL-LINKS FOLGEN DER ABLAGE (D5): eine Benachrichtigungs-Mail verlinkt auf
  den Host DER COMMUNITY. Pure Regel `core/shared/notificationLinks.ts`
  (`<communityId>` ⇒ Community-Host · `_account` und `''` ⇒ App-Host),
  aufgelöst über `registerCommunityHostResolver`
  (`core/server/utils/communityHost.ts`; Implementierung
  `packages/control/server/utils/communityHostResolver.ts`, verdrahtet in
  `apps/platform`) — OHNE `H3Event` (der Digest läuft ohne Request) und
  GEBÜNDELT (sonst N+1 über Projektgrenzen). Nachgeschlagen wird
  `communities.tenantId`, NICHT `$id`. FAIL-SOFT: kein Host ⇒ App-Basis, eine
  Mail wird NIE verworfen — darum braucht jeder Test hier eine Gegenprobe,
  sonst ist er immer grün. JEDER Eintrag einer Digest-Mail trägt seinen
  eigenen Host. Beweise: `packages/core/tests/notificationLinks.test.ts`,
  `packages/control/tests/communityHostResolver.test.ts`,
  `packages/core/scripts/verify-notification-mail-links.mjs`.
- „NICHT ERREICHBAR" IST EINE EIGENE FRAGE (SE1 d): „kein Host" sagt nicht, ob
  eine Community stillgelegt ist. Für „soll ein Lauf hier noch etwas tun?" gibt
  es `resolveUnreachableCommunities(stempel)`
  (`core/server/utils/communityReachability.ts`, ohne Request, gebündelt,
  über `communities.tenantId`) ⇒ `answered` + Menge der NICHT erreichbaren
  Stempel. Genannt wird nur eine POSITIVE Tatsache: stillgelegt (`status !==
  'active'`) oder wegen Missbrauchs gesperrt (`communityUnreachableReason`,
  `packages/control/shared/communityReachability.ts`); Zahlungs-Sperre und
  unbekannter Stempel zählen nicht. FAIL-SOFT: kein Resolver, Störung oder
  Einzel-Instanz ⇒ `answered: false`, der Aufrufer macht weiter wie ohne die
  Frage. Leser `packages/control/server/utils/unreachableCommunitiesResolver.ts`
  (bewusst ohne Zwischenspeicher), verdrahtet in `apps/platform`. Beweise:
  `packages/core/tests/communityReachability.test.ts`,
  `packages/control/tests/unreachableCommunitiesResolver.test.ts`,
  `packages/events/tests/event-reminders-sweep.test.ts`.
- WO HÄNGT DIE GLOCKE? (C17): NUR aus `pukalani.chrome.utilities`, und das
  rendert nur das blueprint-Layout — eine App OHNE blueprint hat keine.
  `pukalani.chrome.accountBell` (Core-Default AUS; an in `apps/control` und `apps/branding`) hängt
  sie ins core-default-Layout und in die SEITENLEISTE der Dashboard-Shell
  (oben rechts sitzen die Seiten-Aktionen). Der Schalter sagt nur, OB sie
  hängt; WAS sie zeigt, bleibt das Publikum ihres Hosts.
- JEDER NEUE `notify()`-TYP braucht einen Zweig in `messageKey()`
  (`core/app/components/NotificationBell.global.vue`) + Text in de/en — der
  Rückfall auf `'replied'` macht ein Loch unsichtbar. Netz:
  `packages/core/tests/notificationBellTexts.test.ts`.
