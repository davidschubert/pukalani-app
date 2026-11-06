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
  30-s-Rollen-Cache das Label nicht sofort wieder vergibt. Besitz übertragen
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
- Beweise: `packages/onboarding/scripts/{verify-control-host,verify-site-authz,
  acceptance-onboarding}.mjs` + `packages/control/scripts/verify-onboarding.mjs`.
  Lokal testen: `seed-local-tester.mjs` (Konto+Code, `--clean` räumt auf).
  Node's `fetch` verwirft einen eigenen Host-Header, und Nitro hört auf `[::1]`
  (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http über ::1.
