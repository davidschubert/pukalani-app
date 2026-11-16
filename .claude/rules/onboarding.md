---
paths:
  - "packages/onboarding/**"
  - "packages/control/**"
  - "packages/core/server/utils/community*"
  - "packages/core/shared/community*"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-09-08 (Token-Hygiene): lädt automatisch,
     sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen (cat/sed) diese
     Datei bewusst per Read öffnen. Wortlaut unverändert übernommen. -->

## Self-Service-Onboarding (Layer onboarding, seit 2026-07-25)
- Trichter auf den Kontroll-Hosts der Platform-App: bewusst KEIN Mandant
  (`pukalani.tenancy.controlHosts`, Env-Override
  NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). Weil dort NICHTS gescopt ist, lässt
  `01.control-center.ts` nur `pukalani.tenancy.controlApiPrefixes` zu — alles
  andere 404. Neuer Endpunkt im Kundenbereich ⇒ Präfix bewusst eintragen.
- Einladungs-Link: `start.pukalani.app?code=…` → Auth-Guard hängt das Ziel als
  `?redirect=` an (safeRedirectTarget, core/shared — NUR Pfade auf diesem
  Host), nach der Anmeldung geht es zurück, der Wizard liest `?code=` und
  prüft ohne Klick. Post-Auth-Ziel IMMER über useAuthRedirect().
- Anlegen gehört dem Control Plane: `POST /api/control/onboarding/site` verlangt
  Service-Secret (NUXT_CONTROL_ONBOARDING_SECRET ⇔ NUXT_ONBOARDING_SERVICE_SECRET)
  UND ein Appwrite-JWT, das das Control Plane SELBST gegen das Pool-Projekt
  prüft. Idempotenz über den Hostnamen (kein Idempotency-Key); Owner-Mitgliedschaft
  scheitert ⇒ Tenant wird zurückgerollt.
- REGELN, DIE UNTER GLEICHZEITIGEN ANFRAGEN HALTEN MÜSSEN (BE-013, seit
  2026-11-16): im Control Plane entscheidet nie „erst lesen, dann schreiben".
  Zwei Bausteine: (1) `withControlLock(event, { scope, subject }, work)`
  (`packages/control/server/utils/controlLock.ts`) — eine Sperr-Zeile mit
  fester Kennung in `system_runs`; UNTER der Sperre lesen, entscheiden,
  schreiben; die Zeile fällt am Ende wieder, ein abgestorbener Halter wird
  nach 30 s übernommen, ohne prüfbare Sperre wird NICHT geschrieben. Heute:
  `onboarding` (Anlage je Konto: Kontingent und Testphase), `team` (Rolle
  ändern, entfernen, Besitz übertragen — die Mitgliederliste wird unter der
  Sperre gelesen), `member-invite` (Wochen-Kontingent). (2) Zähler mit
  Obergrenze schreibt die Datenbank selbst: der Einladungs-Code wird VOR der
  Anlage reserviert (`incrementRowColumn` mit `max`, gemessen unteilbar) und
  bei Fehlschlag oder Wiederholung zurückgegeben. Neue Regel dieser Art ⇒
  einer der zwei Bausteine und ein Test mit zwei gleichzeitigen Anfragen.
  Die Testphase gibt es EINMAL JE KONTO, und Anlegen verlangt eine bestätigte
  Adresse: `.claude/rules/plans-products.md`.
- Vertrag (Kataloge, 6 Vibes, Testphase, Kontingent):
  `packages/control/shared/onboarding.ts` — der Wizard-Layer konsumiert ihn.
- Branding gehört dem MANDANTEN (`communities.theme/variant`), nicht dem Projekt:
  `app_config.themeSettings` ist EINE Row pro Projekt.
- Site-Routen autorisieren über `requireCommunityPermission` (Site-Rolle, dann
  protokollierter Operator-Break-Glass) — NIE `requirePermission` erweitern:
  die ist synchron und wird ohne await gerufen.
- MITGLIEDER-VERWALTUNG (seit 2026-07-29, Audit-Befund S9 „tote Capability"):
  `/dashboard/members` liegt im ONBOARDING-Layer, nicht in admin — die Seite kann
  nur so weit reichen wie ihre Routen (`/api/community/members/*`), und die brauchen
  die Service-Naht. Silo-Apps ohne onboarding bekommen so keinen Menüpunkt ins
  Leere. Einladen = EIN Feld + Rolle → `community_invites` (Token-HASH, 7 Tage,
  M9-Muster aus `workspace_invites`; Mail zuerst, Row danach — keine Einladung
  ohne Zustellung), Annahme über `/join?token=…` ODER ohne Token über die eigene
  geprüfte Adresse. ENTFERNEN LÖSCHT NICHT: `community_members.status='removed'`
  (Migration control-019), Inhalte + Namen bleiben. Es nimmt aber BEIDES —
  Rolle UND Lese-Publikum: die Runtime-Route zieht danach `revokeCommunityLabel`
  (Labels gehören dem Pool-Projekt, das Control Plane hat dafür keinen
  Schlüssel) und merkt den Entzug kurz (`rememberCommunityAccessRevoked`), damit der
  30-s-Rollen-Cache das Label nicht sofort wieder vergibt. Seit SEC-024
  (2026-11-13) ist der Entzug NACHGEPRÜFT: `revokeCommunityLabel` liest nach,
  wiederholt einmal und gibt `{ revoked }` zurück; bleibt das Label, antwortet
  die Route 502 `label_revoke_failed` (Mitgliedschaft IST entfernt — die Seite
  sagt das in einem eigenen Satz und lädt die Liste neu), Stilllegen meldet
  `labels: { total, revoked, failed }`. Den Rest holt der stündliche
  Label-Abgleich der Platform-App nach (tenant-isolation.md, SITE-LABEL;
  Runbook docs/runbooks/LABEL-ABGLEICH.md). Seit 2026-11-13
  (SEC-030) sieht die entfernte Person angemeldet nur noch die HINWEISSEITE
  (`onboarding/app/pages/removed.vue`, `/removed`) mit gebremstem Kontakt an
  Owner und Admins (`removed-contact.post.ts`) und dem Rückweg per neuer
  Einladung; alles andere auf dem Host antwortet 403 `community_removed`
  (Regel und Erlaubnisliste: tenant-isolation.md, „ENTFERNT ⇒ KEIN ZUGRIFF").
  EINLADUNGEN: LESEN WIE ANNEHMEN (SEC-028, seit 2026-11-15): die eigene
  Liste (`invites/mine`) bleibt LEER, solange die Adresse des Kontos nicht
  bestätigt ist — dieselbe Bedingung wie beim Annehmen; `/join` ohne Token
  zeigt dann den Kasten „bestätige zuerst". Der Link aus der Mail (mit Token)
  hängt nicht daran. Widerruf und erneutes Einladen suchen GEZIELT (`getRow`
  mit Prüfung der Community bzw. Abfrage nach Community + Adresse + offen) —
  `listCommunityInvites` ist auf 100 gekappt und nur noch Anzeige. Stilllegen
  zieht offene Einladungen zurück, die Annahme verlangt
  `communities.status === 'active'`. Die Antwort der Einladen-Route sagt
  NICHT, ob es zur Adresse ein Konto gibt (ein Hinweistext für beide Fälle).
  Besitz übertragen
  läuft über `community.transfer` (Owner), NIE über die Rollen-Route — sonst wäre eine
  Owner-Capability per Admin-Capability erreichbar. `community.delete` IST gebaut
  (C16, 2026-07-31 — Kehrtwende zu Davids Entscheidung 3 vom 2026-07-29), aber als
  **Stilllegen statt Vernichten**: `communities.status='disabled'` ⇒ Host 404 in
  ≤30 s, alle Mitgliedschaften 'removed', Labels eingezogen — INHALTE BLEIBEN.
  Gesperrt bei laufendem Abo (409 `subscription_active`) und bei bereits
  stillgelegter Community. Route: `packages/onboarding/server/api/community/
  delete.post.ts` → Service-Naht → `packages/control/server/api/control/community/
  delete.post.ts`. Schutzregeln PURE + unit-getestet in
  `packages/control/shared/communityTeam.ts` (kein Selbst-Degradieren, nie der letzte
  Owner, `decideJoin`) — die UI kennt sie, das Control Plane setzt sie durch.
  Die Mitgliederliste zeigt ALLE (Standardansicht filtert aufs Team
  owner/admin/moderator/editor, ein Klick zeigt alle) — seit A5 steht dort jedes
  beigetretene Mitglied, nicht mehr nur das Team.
- „Ehemaliges Mitglied": GEBÜNDELTER Vertrag `core/server/utils/communityMembership.ts`
  (`registerFormerCommunityMembersResolver`, Implementierung
  `createFormerCommunityMembersResolver` im control-Layer) — viele userIds, EINE
  Abfrage, Cache pro NUTZER 60 s, fail-soft. Der Einzel-Lookup
  (`CommunityRoleResolver`) darf dafür NIE in einer Schleife laufen: eine
  Kommentarliste hat 25 Autoren. Die Frage ist bewusst NEGATIV gestellt —
  „ehemalig" ist eine POSITIVE Tatsache (Row mit status 'removed'); die
  ABWESENHEIT einer Row heißt „gewöhnlicher Nutzer" — seit A5 trägt
  `community_members` zwar jedes BEIGETRETENE Mitglied, aber Gäste, Autoren von vor
  A5 und Konten, die hier nie mitgemacht haben, haben trotzdem keine Zeile.
  Zeichen erscheint heute in der Kommentarliste (Gäste eingeschlossen).
- BETREIBER-BEDINGUNGEN (seit 2026-11-16, GA1 P13, Davids Auftrag „betreiber
  benötigen eigene agb's, die sie per kästchen bestätigen müssen"): der Text
  liegt in `apps/marketing` (`pages/betreiber-bedingungen.vue`, `/de/
  betreiber-bedingungen` ↔ `/community-operator-terms`, Texte unter
  `marketing.legal.operator`, noindex, Entwurf). Schalter
  `pukalani.onboarding.operatorTerms { url: { de, en }, version, draft }` —
  Layer-Default AUS (leere Adressen ⇒ kein Kästchen, keine Prüfung, keine
  Zeile), `apps/platform` schaltet ein. Geprüft wird NUR beim Anlegen und NUR
  auf der Platform-Seite: `POST /api/onboarding/site` verlangt
  `operatorTerms: true` VOR dem JWT (sonst 400 `operator_terms_required`) und
  nimmt das Feld IMMER vom Body, bevor das `.strict()`-Schema es sieht — es
  reist nie ins Control Plane (zwei Deployments, ein älteres Control Plane
  antwortete sonst 400). VOR der Anlage (auch bei `reused`) eine Zeile in
  `consent_records` mit `kind: 'operator'`, `way: 'wizard'`; lässt sie sich
  nicht schreiben, entsteht nichts (503 `operator_terms_record_failed` —
  keine Community ohne festgehaltene Bestätigung; eine Zeile ohne Community
  schadet nicht). NIE über
  `pukalani.auth.termsUrl`/`requiredConsents` — die Tür fragte sonst jedes
  Mitglied (`GatedConsentKind` schließt `operator` vom Typ her aus). Neue
  Fassung ⇒ `version` in `apps/platform/app/app.config.ts` UND die
  Fassungs-Zeile im Text ändern (Wächter `apps/marketing/tests/
  operatorTermsPage.test.ts`). OFFEN: die Besitz-Übergabe
  (`community.transfer`) fragt nicht, der Kauf eines Plans zeigt die
  Bedingungen nicht, die verbindliche Fassung wartet auf den Anwalt
  (OPEN-ITEMS A1b).
- Beweise: `packages/onboarding/scripts/{verify-control-host,verify-site-authz,
  acceptance-onboarding}.mjs` + `packages/control/scripts/verify-onboarding.mjs`.
  Lokal testen: `seed-local-tester.mjs` (Konto+Code, `--clean` räumt auf).
  Node's `fetch` verwirft einen eigenen Host-Header, und Nitro hört auf `[::1]`
  (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http über ::1.
