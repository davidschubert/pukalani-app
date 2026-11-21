---
paths:
  - "packages/onboarding/**"
  - "packages/control/**"
  - "packages/core/server/utils/community*"
  - "packages/core/shared/community*"
---

## Self-Service-Onboarding (Layer onboarding)
- KONTROLL-HOSTS: der Trichter der Platform-App ist bewusst KEIN Mandant
  (`pukalani.tenancy.controlHosts`, Env `NUXT_PUBLIC_TENANCY_CONTROL_HOSTS`).
  Weil dort NICHTS gescopt ist, lässt
  `core/server/middleware/01.control-center.ts` nur
  `pukalani.tenancy.controlApiPrefixes` zu — alles andere 404. Neuer Endpunkt
  im Kundenbereich ⇒ Präfix bewusst eintragen.
- EINLADUNGS-LINK `<onboardingStartUrl>?code=…` (Vorgabe
  `https://account.pukalani.app`, gebaut in
  `control/server/utils/inviteMail.ts`) → die Startseite leitet mit Query auf
  `/start`, der Auth-Guard hängt das Ziel als `?redirect=` an
  (`safeRedirectTarget`, `core/shared/redirectTarget.ts` — NUR Pfade auf diesem
  Host), nach der Anmeldung geht es zurück, der Wizard liest `?code=` und prüft
  ohne Klick. Post-Auth-Ziel IMMER über `useAuthRedirect()`.
- ANLEGEN GEHÖRT DEM CONTROL PLANE: `POST /api/control/onboarding/site`
  verlangt Service-Secret (`NUXT_CONTROL_ONBOARDING_SECRET` ⇔
  `NUXT_ONBOARDING_SERVICE_SECRET`) UND ein Appwrite-JWT, das das Control Plane
  SELBST gegen das Pool-Projekt (`account`) prüft. Idempotenz über den
  Hostnamen (kein Idempotency-Key); scheitert die Owner-Mitgliedschaft, wird der
  Tenant zurückgerollt.
- GLEICHZEITIGE ANFRAGEN (BE-013): im Control Plane entscheidet nie „erst lesen,
  dann schreiben". Zwei Bausteine: (1) `withControlLock(event, { scope, subject
  }, work)` (`packages/control/server/utils/controlLock.ts`) — Sperr-Zeile mit
  fester Kennung in `system_runs`; UNTER der Sperre lesen, entscheiden,
  schreiben; ein abgestorbener Halter wird nach `CONTROL_LOCK_STALL_MS`
  übernommen, ohne prüfbare Sperre wird NICHT geschrieben (Scopes heute:
  `onboarding` = Anlage je Konto, Kontingent und Testphase; `team` = Rolle
  ändern, entfernen, Besitz übertragen — Mitgliederliste unter der Sperre
  lesen; `member-invite` = Wochen-Kontingent). (2) Zähler mit Obergrenze schreibt die Datenbank selbst:
  der Einladungs-Code wird VOR der Anlage reserviert (`incrementRowColumn` mit
  `max`) und bei Fehlschlag oder Wiederholung zurückgegeben. Neue Regel dieser
  Art ⇒ einer der zwei Bausteine + ein Test mit zwei gleichzeitigen Anfragen.
  Testphase EINMAL JE KONTO und Pflicht zur bestätigten Adresse:
  `.claude/rules/plans-products.md`.
- VERTRAG (Kataloge, Vibes `SITE_VIBES`, Testphase, Kontingent):
  `packages/control/shared/onboarding.ts` — der Wizard-Layer konsumiert ihn.
- Branding gehört dem MANDANTEN (`communities.theme/variant`), nicht dem
  Projekt: `app_config.themeSettings` ist EINE Row pro Projekt.
- Site-Routen autorisieren über `requireCommunityPermission` (Site-Rolle, dann
  protokollierter Operator-Break-Glass) — NIE `requirePermission` erweitern: die
  ist synchron und wird ohne await gerufen.

## Mitglieder-Verwaltung
- `/dashboard/members` liegt im ONBOARDING-Layer, nicht in admin: die Routen
  (`/api/community/members/*`) brauchen die Service-Naht; Silo-Apps ohne
  onboarding bekommen so keinen Menüpunkt ins Leere.
- EINLADEN = EIN Feld + Rolle → `community_invites` (Token-HASH, 7 Tage,
  M9-Muster); Mail zuerst, Row danach — keine Einladung ohne Zustellung.
  Annahme über `/join?token=…` ODER ohne Token über die eigene geprüfte Adresse.
  Die Antwort der Einladen-Route sagt NICHT, ob es zur Adresse ein Konto gibt.
- EINLADUNGEN LESEN WIE ANNEHMEN (SEC-028): `invites/mine` bleibt LEER, solange
  die Adresse des Kontos nicht bestätigt ist; `/join` ohne Token zeigt dann
  „bestätige zuerst". Der Mail-Link mit Token hängt nicht daran. Widerruf und
  erneutes Einladen suchen GEZIELT (`getRow` mit Prüfung der Community bzw.
  Abfrage Community + Adresse + offen) — `listCommunityInvites` ist gekappt und
  nur Anzeige. Stilllegen zieht offene Einladungen zurück, die Annahme verlangt
  `communities.status === 'active'`.
- ENTFERNEN LÖSCHT NICHT: `community_members.status='removed'` (control-019),
  Inhalte + Namen bleiben. Es nimmt aber Rolle UND Lese-Publikum: die
  Runtime-Route zieht danach `revokeCommunityLabel` (Labels gehören dem
  Pool-Projekt, das Control Plane hat dafür keinen Schlüssel) und merkt den
  Entzug (`rememberCommunityAccessRevoked`), damit der Rollen-Cache das Label
  nicht sofort wieder vergibt. Entzug NACHGEPRÜFT (SEC-024): liest nach,
  wiederholt einmal, gibt `{ revoked }`; bleibt das Label ⇒ 502
  `label_revoke_failed` (die Mitgliedschaft IST entfernt — die Seite sagt das in
  einem eigenen Satz und lädt neu). Stilllegen meldet
  `labels: { total, revoked, failed }`. Den Rest holt der stündliche
  Label-Abgleich (`tenant-mitglieder.md`, SITE-LABEL;
  `docs/runbooks/LABEL-ABGLEICH.md`).
- ENTFERNTE PERSON (SEC-030) sieht angemeldet nur die Hinweisseite
  (`onboarding/app/pages/removed.vue`, `/removed`) mit gebremstem Kontakt an
  Owner und Admins (`onboarding/server/api/community/removed-contact.post.ts`)
  und Rückweg per neuer Einladung; alles andere antwortet 403
  `community_removed` (`tenant-mitglieder.md`, „Entfernt ⇒ kein Zugriff").
- BESITZ ÜBERTRAGEN über `community.transfer` (Owner), NIE über die
  Rollen-Route — sonst wäre eine Owner-Capability per Admin-Capability
  erreichbar.
- `community.delete` (C16) = STILLLEGEN STATT VERNICHTEN:
  `communities.status='disabled'` ⇒ Host 404 (nach Ablauf des Resolver-Caches),
  alle Mitgliedschaften 'removed', Labels eingezogen — INHALTE BLEIBEN.
  Gesperrt bei laufendem Abo (409 `subscription_active`) und bei schon
  stillgelegter Community. Route:
  `packages/onboarding/server/api/community/delete.post.ts` → Service-Naht →
  `packages/control/server/api/control/community/delete.post.ts`.
- SCHUTZREGELN PURE + unit-getestet in `packages/control/shared/communityTeam.ts`
  (kein Selbst-Degradieren, nie der letzte Owner, `decideJoin`) — die UI kennt
  sie, das Control Plane setzt sie durch.
- Die Mitgliederliste zeigt ALLE beigetretenen Mitglieder; die Standardansicht
  filtert aufs Team (owner/admin/moderator/editor), ein Klick zeigt alle.
- „EHEMALIGES MITGLIED": GEBÜNDELTER Vertrag
  `core/server/utils/communityMembership.ts`
  (`registerFormerCommunityMembersResolver`, Implementierung
  `createFormerCommunityMembersResolver` im control-Layer) — viele userIds,
  EINE Abfrage, Cache pro NUTZER, fail-soft. Der Einzel-Lookup
  (`CommunityRoleResolver`) läuft dafür NIE in einer Schleife. „Ehemalig" ist
  eine POSITIVE Tatsache (Row mit status 'removed'); KEINE Row heißt
  „gewöhnlicher Nutzer" (Gäste, alte Autoren, Konten, die hier nie mitgemacht
  haben). Zeichen in der Kommentarliste (Gäste eingeschlossen). Derselbe Vertrag
  OHNE Request über den Ablage-Stempel (MM1 b): `resolveFormerMembersOfTenant`,
  Implementierung `createFormerMembersByTenantResolver` (dieselbe Instanz,
  derselbe Cache) — damit schreibt `notify()` entfernten Personen nichts
  (`tenant-mitglieder.md`, „ENTFERNT ⇒ KEINE BENACHRICHTIGUNG").

## Betreiber-Bedingungen (GA1 P13)
- Text in `apps/marketing/app/pages/betreiber-bedingungen.vue`
  (`/de/betreiber-bedingungen` ↔ `/community-operator-terms`, Texte unter
  `marketing.legal.operator`, noindex, Entwurf). Schalter
  `pukalani.onboarding.operatorTerms { url: { de, en }, version, draft }` —
  Layer-Default AUS (leere Adressen ⇒ kein Kästchen, keine Prüfung, keine
  Zeile), `apps/platform` schaltet ein.
- Geprüft wird NUR beim Anlegen und NUR auf der Platform-Seite:
  `POST /api/onboarding/site` verlangt `operatorTerms: true` VOR dem JWT (sonst
  400 `operator_terms_required`) und nimmt das Feld IMMER vom Body, bevor das
  `.strict()`-Schema es sieht — es reist nie ins Control Plane (ein älteres
  Control Plane antwortete sonst 400).
- VOR der Anlage (auch bei `reused`) eine Zeile in `consent_records` mit
  `kind: 'operator'`, `way: 'wizard'`; lässt sie sich nicht schreiben, entsteht
  nichts (503 `operator_terms_record_failed`).
- NIE über `pukalani.auth.termsUrl`/`requiredConsents` — die Tür fragte sonst
  jedes Mitglied (`GatedConsentKind` schließt `operator` vom Typ her aus).
- Neue Fassung ⇒ `version` in `apps/platform/app/app.config.ts` UND die
  Fassungs-Zeile im Text ändern (Wächter
  `apps/marketing/tests/operatorTermsPage.test.ts`).
- OFFEN: die Besitz-Übergabe (`community.transfer`) fragt nicht, der Kauf eines
  Plans zeigt die Bedingungen nicht, die verbindliche Fassung wartet auf den
  Anwalt (OPEN-ITEMS A1b).

## Beweise
- `packages/onboarding/scripts/verify-control-host.mjs`,
  `packages/onboarding/scripts/verify-site-authz.mjs`,
  `packages/onboarding/scripts/acceptance-onboarding.mjs`,
  `packages/control/scripts/verify-onboarding.mjs`. Lokal testen:
  `packages/onboarding/scripts/seed-local-tester.mjs` (Konto + Code, `--clean`
  räumt auf).
- FALLE: Node-`fetch` verwirft einen eigenen Host-Header, und Nitro hört auf
  `[::1]` (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http
  über ::1.
