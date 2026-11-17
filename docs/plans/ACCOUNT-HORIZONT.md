# Account-Horizont — ein Konto, das überall gilt

**Stand: 2026-08-11 · Status: beschlossen (Davids Entscheidungen, s. DECISION-LOG
2026-08-11), teilweise gebaut (AH-1, AH-5, AH-7).** Dieses Dokument trägt die
Tiefe; die Arbeitsliste bleibt OPEN-ITEMS.md (Punkte AH-1 … AH-7).

## Die Vision (Davids Worte, 2026-08-11)

Ein Pukalani-Konto („Pukalani ID"), das überall gilt: Man meldet sich auf
**account.pukalani.app** an, verwaltet dort Profil, Sicherheit, Abrechnung und
seine Communities — und dieselbe Konto-Verwaltung ist in jedem
Community-Dashboard eingebunden. Jede Community behält ihre eigenen
Community-Einstellungen. Weniger Subdomains, klarere Namen, ein Konten-Pool.

**Was davon schon existiert:** der Pool IST das eine Konto (ein Appwrite-Konto,
n Communities via Label + Mitgliedschafts-Zeile); die Konto-Hülle ist in jedem
Dashboard eingebunden (`/dashboard/settings`); der Community-Settings-Hub
existiert (F50/F51). Neu sind: der Name, der eigenständige Account-Bereich,
und die Konsolidierung der Rest-Landschaft.

## Appwrite-Faktenlage (Docs geprüft, 2026-08-11)

- **User sind strikt pro Projekt.** Kein Organisations-Auth, kein Teilen von
  Konten zwischen Projekten. `mail@…` in `control` und `pool` sind zwei
  unabhängige Konten.
- Offizieller Baustein für eigene Flows: **Custom Tokens** (Server erzeugt
  Token, Client tauscht gegen Session) — unser Handoff-Siegel nutzt genau das.
- „Ein Konto überall" heißt in Appwrite: **ein Projekt** für alle Menschen.
- Projekt-**IDs sind unveränderlich** — eine „Umbenennung" ist immer
  Neuanlage + Migration. Nutzer-Übernahme MIT Passwort-Hashes ist über die
  Server-API offiziell möglich (`createBcryptUser`/`createArgon2User`/…,
  je nach Hash — vor dem Bau gegen unsere 1.9.6 verifizieren).
- Deployment-Isolation ≠ Projekt-Isolation: eine App kann ein eigenes
  Deployment haben und trotzdem gegen das Account-Projekt sprechen. Nur ein
  echtes Silo (eigenes Projekt) hat zwingend eigene User — das bleibt das
  Enterprise-Versprechen.

## Die Schritte (Reihenfolge = OPEN-ITEMS)

### AH-1 · EIN Cutover: Projekt `pool` → `account` + Host `my.`/`start.` → `account.`

**Davids Entscheidung 2026-08-11: echte ID-Migration** (gegen die Empfehlung
„nur Anzeigename" — festgehalten mit dem Sachargument, das dafür spricht:
im Early Access mit einer Handvoll Konten ist das der EINZIGE günstige
Moment; später unmöglich ohne Großschaden). Host-Umzug und Projekt-Migration
in EINEM Fenster — Kunden werden genau einmal abgemeldet.

Migrations-Inventar (Neuanlage Projekt `account`, dann):
1. **Schema**: kompletter Migrations-Lauf über den zentralen Runner gegen die
   neue Instanz-Config (alle system-/Produkt-Tabellen des Pool-Projekts).
2. **Nutzer**: Users-API mit Passwort-Hash-Übernahme; Labels
   (`Role.label(communityId)`) und prefs mitkopieren. Sessions gehen bewusst
   verloren (einmalige Abmeldung).
3. **Daten**: alle Rows aller Tabellen (Skript, tabellenweise, mit
   Query.limit-Paginierung), Buckets + Dateien (fonts, media).
4. **Drumherum**: Web-Plattform `*.pukalani.app` im neuen Projekt anlegen
   (F45-Falle: ohne sie ist jede Realtime tot!), neue API-Keys
   (Runtime + Migrations), Envs auf allen Servern, Session-Cookie heißt
   danach `a_session_account`.
5. **Host**: `controlHosts` → `account.pukalani.app`; `wizardHosts` entfällt
   (start. geht auf — Davids Entscheidung 2026-08-11); Redirects
   `my.`/`start.` → `account.` (Übergang; Einladungs-Mails sind 7 Tage
   gültig); Mail-Vorlagen, `marketing*Url`-Envs, `NUXT_PUBLIC_I18N_BASE_URL`;
   `my`, `start`, `account` in RESERVED_SUBDOMAINS (my/start dauerhaft
   gesperrt).
6. **Beweise**: verify-Skripte des onboarding-Layers gegen die neue Instanz,
   Handoff my→Community, Realtime-Origin-Probe (`curl -H "Origin: …"`),
   Rückwärts-Redirect-Probe, TLS-Wächter.

DNS/TLS: nichts nötig — `account.` deckt die Wildcard ab (KEINE
Zertifikats-Anforderung, Lineage-Falle!).

### AH-2 · Der Account-Bereich auf account.pukalani.app

Ziel-URL-Struktur (Davids Liste + Bestandsabgleich):
- `/` — Account-Startseite (neu; heute Redirect auf /communities): Karten zu
  Profil, Communities, Einstellungen; Begrüßung mit Pukalani-ID.
- `/profile` — Bild, Name, @handle (heute in der Dashboard-Konto-Hülle; wird
  hierher gehoben und im Dashboard weiter eingebunden — EINE Implementierung).
- `/settings` — Hülle mit: `security` (Passwort), `sessions`,
  `notifications`, `data` (Datenexport + Konto löschen — heute unter
  „Sicherheit" versteckt, Audit M10), später `billing` (Account-Ebene, AH-3).
- `/communities` ✓ · `/login` ✓ · `/register` ✓ · `/join` ✓ ·
  `/request-access` ✓ · `/report-abuse` ✓ · `/start` (Wizard) ✓.
- Community-Abos bleiben BEWUSST im Community-Dashboard (die Community zahlt,
  M13/A6-Logik unangetastet).

### AH-3 · /profile/activity + Account-Billing (Phase 2)

Community-übergreifende EIGENE Aktivität (nur eigene Inhalte — die
Community-Grenzen gelten; das GDPR-Export-Muster `registerUserDataContributor`
zeigt die Aggregation). Account-Billing = Silo-/Einzel-Abos, getrennt von
Community-Abos.

### AH-4 · Cutover `control.` → `admin.`

Muster: docs/archiv/CONTROL-CUTOVER.md (studio→control war derselbe
Vorgang). Eigene Checkliste beim Bau; nicht vergessen: **Stripe-Webhook-URL**,
CI-Deploy-Ziele (rsync-Pfade), eigenes Zertifikat (control hat eine EIGENE
LE-Lineage — admin per DNS-01 NEU, NIE über die Wildcard-Site), Envs, Doku,
`admin` + `control` in RESERVED_SUBDOMAINS, pm2-Namen. Rein kosmetisch für
Kunden unsichtbar — Davids bewusste Namensentscheidung.

### AH-5 · Freelancer Community + demo-Vollausbau (GEFAHREN 2026-08-12)

Eine RESERVIERTE Pool-Community als Werkstatt (Name offen — „blueprint" ist
gesperrt, so heißt der Kompositions-Layer): alle Produkte inkl. Early Access
an, Mitwirkende über normale Rollen (kein zweiter Konten-Pool nötig — Pool
liefert das per Konstruktion). `demo.pukalani.app` bekommt alle FERTIGEN
Produkte (reine Konfiguration). „Fertig → freigeschaltet" läuft über den
bestehenden Produkt-Katalog (product_catalog, Plan-Gates).

### AH-7 · Der konto-weite @handle (GEBAUT 2026-08-11)

Davids Entscheidung (DECISION-LOG 2026-08-11, Punkt 11): **eine Pukalani-ID =
EIN Handle, überall.** Bis dahin galt ein Name je Community — derselbe Mensch
konnte in A `@david` und in B `@dave` heissen, und zwei verschiedene Menschen
konnten in A und B beide `@david` sein.

**Datenmodell.** Neue Tabelle `account_handles` (Migration **system-031**,
additiv — muss VOR dem Code-Deploy laufen): `userId`, `handle`, `handleLower`,
`status`, `changedAt`. Der eindeutige Index trägt **`handleLower` allein** und
damit keinen Mandanten mehr — die bewusste Ausnahme von der Pool-Unique-Regel,
weil ein Handle ab jetzt eine Eigenschaft des KONTOS ist (wie die E-Mail) und
kein tenant-relativer Schlüssel. Historien-Zeilen (`status: 'former'`) bleiben
wie gehabt: der alte Name bleibt belegt UND löst weiter auf dieselbe Person auf.

**Übernahme-Regel, wörtlich** (pure Rechnung in
`packages/core/shared/handleAdoption.ts`, unit-getestet, ausgeführt als letzter
Schritt derselben Migration): *Je Konto ist der ÄLTESTE eigene AKTIVE
Community-Handle der Kandidat. Die Kandidaten werden nach derselben Anlage-Zeit
vergeben. Ist `handleLower` global schon vergeben, bekommt das Konto KEINEN
Eintrag — es wählt später selbst im Formular.* Es wird nichts umbenannt und
nichts gelöscht; `community_handles` bleibt vollständig erhalten.

**Warum leer ausgehen und kein `@david2`:** eine automatische Umbenennung wäre
die schlechteste Antwort — der Mensch fände einen Namen vor, den er nie gewählt
hat, und erführe nichts davon. Ohne Eintrag vergibt `ensureAccountHandle` beim
nächsten Öffnen des Profils einen Vorschlag aus dem Anzeigenamen, oder er wählt
selbst.

**Auflösungs-Kette** (`core/server/utils/handles.ts`): Konto-Register zuerst,
`community_handles` als Lese-Fallback für alles, was dort keinen Besitzer hat.
Der Preis ist benannt: ein alter Beitrag, dessen `@david` in seiner Community
jemand anderem gehörte, zeigt jetzt auf den globalen Gewinner. Klein gehalten
durch „ältester Handle je Konto"; die Gegenrichtung hätte den Fehler nur
verschoben und dazu die Zusage gebrochen, dass `@david` überall derselbe ist.

**Die Grenze musste mitwandern — und brauchte eine Schicht mehr.** Vorher hielten
zwei Dinge (Mandanten-Filter der Datentür + `read(label:<communityId>)`). Der
Filter fällt weg. Die Row-Permissions allein reichen NICHT: eine Konto-Zeile
trägt eine Lese-Rolle je Mitgliedschaft, ein LESER trägt Labels mehrerer
Communities, und Appwrite fragt nicht, auf welchem Host er steht — ohne weiteres
Zutun stünden A-Mitglieder im Erwähnungs-Menü von B (beim Bau am Beweis
aufgefallen, nicht in Betrieb). Deshalb jetzt: **Mitglieder-Gate** auf
`/api/handles/search` (die Umkehrung der Vor-AH-7-Begründung, die genau diesen
Fall vorgesehen hatte) **plus** Publikums-Filter auf die aktuelle Community,
und derselbe Filter im Code bei der Auflösung (Admin-Client). Das Publikum wird
gepflegt in `accountHandlePermissions` (Vergabe), `ensureAccountHandleAudience`
(erstes Auftauchen) und `revokeCommunityLabel` (Entzug — der Name bleibt, die
Sicht geht).

**Oberfläche.** `/profile` bekommt das echte Formular; der Ersatztext samt
`onboarding.account.profile.handleNote/handleAction` ist entfallen.
`UserHandleForm` hängt an `GET`/`PATCH /api/account/handle` (core, damit auch
Silo-Apps sie haben) — die alten `GET`/`PATCH /api/handles/me` sind ENTFERNT.
`/api/handles/search` bleibt, jetzt gegen das Konto-Register.

**Offen (Folgearbeit).** Die Live-Beweise sind auf die neuen Pfade und die neue
Semantik umgebaut, aber seither NICHT gefahren (kein lebendes Appwrite in der
Bau-Sitzung) — inklusive der drei Gegenproben, die im Kopf von
`verify-handle-search-boundary.mjs` benannt sind. Ohne sie ist ihr Grün nur ein
Grün.

### AH-6 · F3: comments → Pool

Davids Entscheidung 2026-08-11: fest eingeplant als Abschluss des Horizonts.
Erst PLAN-Dokument (Nutzer-Migration ins Account-Projekt, comments als
Produkt/Community im Pool, Embed bleibt, neuer E2E-Anker — die CI-E2E hängt
heute an apps/comments!), dann Bau. Danach existieren genau zwei
Auth-Welten: **account** (alle Menschen) und **admin** (Betreiber).
`portfolio` bleibt als Davids eigenes Silo unberührt.

## Sicherheits-/Datenschutz-Notizen

- account./admin./master-Name in RESERVED_SUBDOMAINS VOR dem ersten Beworben.
- /profile/activity zeigt ausschließlich eigene Inhalte (keine
  Community-Querblicke).
- Der admin-Cutover rotiert KEINE Keys (bewusst — Key-Swap ist ein eigenes
  Runbook).
- Ein-Konto-Modell ändert an A4/A5/Datentür nichts; die Grenzen bleiben.

## Bewusst offen (je beim Bau fragen)

- (erledigt) Die Werkstatt heißt freelancer.pukalani.app — „Freelancer Community", offen, pro.
- Zeitfenster des AH-1-Cutovers (einmalige Kunden-Abmeldung).
- Plausible-Site für die Kontroll-Hosts (U18: 5 von 7 Trichter-Ereignissen
  schlafen dort) — erst NACH AH-1 anlegen, sonst trüge die Site den alten
  Namen my.pukalani.app; Davids Entscheidung dazu ist zurückgestellt.
- Hash-Algorithmus der Bestandskonten gegen die Users-API-Endpunkte der
  1.9.6 verifizieren, BEVOR AH-1 beginnt.
