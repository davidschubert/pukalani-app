# Brand Wizard — Schema-Anhang (P1a, zur Durchsicht)

Stand: 2026-08-30. Vertrag aus Plan §6 (BRAND-WIZARD-PHASE-1.md),
Slot-Quelle: BRAND-WIZARD-CONTENT-SPEC.md. **DAVID-GATE: dieser Anhang
braucht deine Abnahme, bevor P1b (Migrationen/API) baut.**

Gemeinsame Regeln (gelten für ALLE sieben Tabellen):
- Projekt `portfolio`, Database `main`, Präfix `brand_*` (Plan §6 —
  keine eigene Database).
- **Server-only:** Tabellen- und Row-Permissions `[]`; der Browser
  spricht ausschließlich `/api/brand/**` (Gate §5). Kein Appwrite-
  Realtime (George streamt per SSE).
- Indizes NUR über `indexStep` (indexRetry.mts); Migrationen idempotent
  (409 → skip) über `pnpm migrate --app portfolio`.
- Große Texte via `createMediumtextColumn` (off-row, MariaDB-Budget);
  je Feld trotzdem ein eigenes Zod-Limit (unten je Tabelle).
- Alle Listen-Reads mit explizitem `Query.limit()`; brand_messages
  cursor-paginiert.
- JSON-Spalten sind ADDITIV erweiterbar (custom_themes-Muster), nie
  umgedeutet; `schemaVersion` steht in den Generations-Metadaten.

## 1. brand_profiles — ein Branding (Kopf)

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| createdByUserId | string 64 | ja | Anleger (bleibt auch nach Übertragung) |
| ownerType | enum 'user'\|'community' | ja | Phase 1 nur 'user' aktiv |
| ownerId | string 64 | ja | User- bzw. Community-Id |
| title | string 256 | nein | Arbeitstitel/Markenname ('' erlaubt — „Neue Marke" darf namenlos starten) |
| contentLocale | string 8 | ja | Inhaltssprache, bei Anlage FIXIERT (Plan §6) |
| pathKind | enum 'new'\|'relaunch' | ja | Weiche W1 |
| relaunchScope | enum 'refine'\|'recut' | nein | Rebrand-Verzweigung (nur relaunch) |
| hasName | boolean | ja | Weiche W2 (steuert Baustein F) |
| team | enum 'solo'\|'team' | ja | Weiche W3 |
| subBrands | enum 'unknown'\|'yes'\|'no' | ja | Weiche W4 — Default 'unknown' bis Ende B ('' wäre in einem USelect verboten, darum enum statt bool-nullable) |
| progressPct | integer | ja | DENORM-Cache aus brand_steps (Quelle = Slots ÷ Slots); für die Brandings-Karten, nie Autorität |
| currentStepKey | string 32 | nein | dito, Karten-Zeile „Gerade dran" |
| lastActivityAt | datetime | ja | Karten-Sortierung |
| storyBody | MEDIUMTEXT | nein | Georges Brand Story (Synthese, editierbar) |
| storyMeta | string 2048 (JSON) | nein | { inputHash, generatedAt, editedByUser } — Story ist STALE, wenn inputHash nicht mehr zum Slot-Stand passt; No-op-Edit invalidiert nicht |
| designPresetId | string 64 | nein | gewählte Design-Richtung (Themes-Preset) |
| designPresetVersion | string 32 | nein | friert die Vorschau-Fassung ein |

Indizes: `idx_owner (ownerType, ownerId)` · `idx_creator
(createdByUserId)`. Kein visibility-Feld (Audit 5/6 — „geteilt" ist
`hasActiveShare` aus brand_shares, abgeleitet). Zod: storyBody ≤ 100k.

**Nachtrag 2026-09-01 (P2.5) — die STARTKARTE bekommt vier Spalten.**
Migration `brand-009`, additiv:

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| websiteUrl | string 256 | nein | „Eure Website (optional)" — leer oder http(s)-Adresse |
| industry | string 120 | nein | „In welcher Branche seid ihr unterwegs?" (Eingabe mit Vorschlägen) |
| about | string 2000 | nein | „Was macht ihr" — 2–3 Sätze |
| audience | string 500 | nein | „Für wen ist es gedacht?" — ein Satz |

WARUM SIE FEHLTEN: die P1a-Fassung dieses Anhangs beschreibt den
Profil-Kopf als ANLAGE-Daten (Pfad, Weichen, Sprache, Titel); die
Startkarte steht nur in der Content-Spec §2.1 („Mehr erhebt Schritt 0
NICHT") und war bis P2.5 reine Spezifikation. Sichtbar wurde die Lücke
mit dem echten George (P2.2): die Slots des Bausteins A haben in der
Registry KEINE `dependencies`, weil sie aus der Startkarte schöpfen —
ohne diese vier Spalten bekam er buchstäblich nichts übergeben
(`formatDependencies([])` ⇒ „no earlier answers were handed to you").

OPTIONALITÄT — die Spalten sind alle vier `required: false` mit
`xdefault: ''`, die PFLICHT lebt im Zod-Schema der Anlage-Route
(`industry`/`about`/`audience` min 1 nach trim, `websiteUrl` frei). Der
Grund ist der übliche: es gibt Bestands-Zeilen von vor der Migration,
und für die ist '' die einzige wahre Auskunft. Dieselbe Bauart wie bei
`title`. `varchar` statt MEDIUMTEXT, weil MariaDB auf TEXT-Spalten
keinen Default erlaubt (s. `storyBody`) — ohne Default läse eine
Bestands-Zeile `undefined` statt ''. Kein Index: die vier werden nie
gefiltert oder sortiert.

ÄNDERBAR, ANDERS ALS DIE SPRACHE: der Profil-PATCH nimmt alle vier
entgegen (die drei Pflichtfelder ohne '' — weglassen heißt „nicht
angefasst", leeren wäre „ich nehme meine Antwort zurück"). Eine
korrigierte Branche macht den nächsten Entwurf besser; eine gewechselte
`contentLocale` machte die bisherigen unlesbar, deshalb bleibt DIE
fixiert.

NICHT im `inputHash`: der beschreibt den Stand der Quell-SLOTS. Eine
geänderte Startkarte macht einen bestehenden Entwurf heute also nicht
„veraltet" — offener Punkt, kein Versehen.

## 2. brand_steps — eine Row je Profil × Baustein

stepKeys (aus der Content-Spez): `context` `pvm` `architecture`
`values` `archetype` `manifesto` `verbal` `naming` `result`.

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| profileId | string 64 | ja | → brand_profiles.$id |
| stepKey | string 32 | ja | s. o. |
| state | enum 'locked'\|'open'\|'active'\|'done' | ja | sequenzielle Freischaltung (§3b.9) |
| slots | MEDIUMTEXT (JSON) | ja | je Slot `{ firstDraft, latestDraft, confirmed, confidence, updatedAt }` — der Versions-Vertrag für BEIDE Übernahmequoten (Audit 2) |
| generations | MEDIUMTEXT (JSON) | ja | letzte ~10 Generationen `{ generationId, schemaVersion, promptVersion, model, provider, locale, inputHash, createdAt }` + `generationCount` gesamt |
| inputHash | string 128 | nein | Hash der Quell-Slot-Stände der LETZTEN Generation — „veraltet" ist ABGELEITET (inputHash ≠ aktuell), kein Flag |
| revision | integer | ja | optimistische Nebenläufigkeit: Autosave sendet gelesene revision, veraltet ⇒ 409 |
| confidence | enum 'fits'\|'almost'\|'restart' | nein | letzte Konfidenz-Weiche des Bausteins |
| startedAt / completedAt | datetime | nein | ehrliche Zeitmessung |
| activeSeconds | integer | ja | gemessene aktive Zeit (kalibriert die Zeitangaben, §9b) |

Indizes: `uq_profile_step (profileId, stepKey)` UNIQUE ·
`idx_profile (profileId)`. Zod: slots ≤ 200k gesamt, einzelner
Slot-Text ≤ 20k; No-op-Regel nach bodyToSave-Prinzip (Speichern ohne
Änderung schreibt nicht, erhöht keine revision).

## 3. brand_messages — Gesprächsverlauf (dauerhaft)

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| profileId | string 64 | ja | |
| stepKey | string 32 | ja | Verlauf hängt am Baustein |
| role | enum 'george'\|'user'\|'system' | ja | |
| body | MEDIUMTEXT | ja | Text (Markdown-sanitisiert beim Rendern) |
| parts | string 8192 (JSON) | nein | Chips/Karten/Paar-Referenzen (strukturierte Message-Parts) |
| generationId | string 64 | nein | verknüpft George-Züge mit Generations-Metadaten |

Indizes: `idx_profile_step (profileId, stepKey)`. Pagination:
cursor-basiert über `$id` (Query.cursorAfter), Default-limit 50.
Persistenz-Regel (Plan §6): validiertes Ergebnis + Nachricht werden
gespeichert, BEVOR `generation.completed` gestreamt wird. Retention:
dauerhaft (Davids Entscheidung — Wiedereinstieg mit Kontext); Löschung
über Kaskade/GDPR. Zod: body ≤ 20k.

## 4. brand_shares — eingefrorene Veröffentlichungen

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| profileId | string 64 | ja | |
| tokenHash | string 128 | ja | sha256 des ≥128-Bit-Tokens — NIE der rohe Token |
| snapshot | MEDIUMTEXT (JSON) | ja | EINGEFROREN: Brand Story + bestätigte Kapitel + `presetId/presetVersion` — nie Chats/Entwürfe/Metriken (Audit 3) |
| publishedAt | datetime | ja | |
| expiresAt | datetime | ja | Standard +30 Tage |
| revokedAt | datetime | nein | Widerruf; Rotation = neue Row + alte widerrufen |

Indizes: `uq_token_hash (tokenHash)` UNIQUE · `idx_profile
(profileId)`. Nur die Token-Route liest; Routen-Härtung wie Plan §6
(no-store, noindex, frame-ancestors 'none', Token nie in Logs). Zod:
snapshot ≤ 400k. `hasActiveShare` = existiert Row mit `revokedAt` leer
und `expiresAt` in der Zukunft.

## 5. brand_invites + brand_access — der Beta-Zugang

**brand_invites** (E-Mail-gebunden, M9-Hash-Muster):

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| emailLower | string 320 | ja | gebundene Adresse |
| codeHash | string 128 | ja | sha256; roher Code nur in der Versand-Mail |
| createdByUserId | string 64 | ja | Betreiber |
| expiresAt | datetime | ja | Vorschlag 30 Tage |
| revokedAt | datetime | nein | |
| redeemedAt | datetime | nein | |
| redeemedByUserId | string 64 | nein | |

Indizes: `uq_code_hash` UNIQUE · `idx_email (emailLower)`.

**brand_access** (wer den Wizard nutzen darf):

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| userId | string 64 | ja | |
| grantedVia | enum 'invite'\|'open'\|'operator' | ja | |
| inviteId | string 64 | nein | Herkunft |
| revokedAt | datetime | nein | Entzug wirkt sofort (Server-only-Tabellen: kein Row-Permission-Umgehungspfad) |

Indizes: `uq_user (userId)` UNIQUE.
**Atomarität der Einlösung OHNE Transaktionen:** die brand_access-Row
wird mit `rowId = inviteId` angelegt — das zweite Einlösen desselben
Codes läuft in den 409 (notify()-Idempotenz-Muster), erst NACH
erfolgreichem createRow wird die Invite-Row als redeemed gestempelt.
Reihenfolge Neu-Konto (Plan §6): Code neutral prüfen → Konto anlegen →
E-Mail-Verifizierung → Access schreiben + Invite verbrauchen (ein
unverifiziertes Konto verbrennt den Code nicht). Falsch/abgelaufen/
widerrufen ⇒ DIESELBE neutrale Ablehnung (keine Enumeration).

## 6. brand_events — append-only Funnel

| Spalte | Typ | Pflicht | Inhalt |
| --- | --- | --- | --- |
| type | string 64 | ja | z. B. wizard.started, step.completed, generation.requested, result.rating, share.published |
| profileId | string 64 | nein | |
| userId | string 64 | nein | |
| payload | string 4096 (JSON) | nein | klein halten; NIE Prompt-/Inhaltstext (Log-Regel Plan §6) |

Indizes: `idx_type_time (type, $createdAt)` · `idx_profile
(profileId)`. Append-only (keine Updates). **Retention: 24 Monate**,
Sweep im Layer (eventloser Sweep ⇒ begründete eslint-disable-Zeile,
Backstop-Regel). Die eine freiwillige Abschlussfrage (§9b, 1–5) ist
`result.rating`.

## 7. Löschkaskade + GDPR

- **Profil löschen** (jederzeit, §9b): steps → messages → shares →
  events(profileId) → profiles-Row. Reihenfolge Kinder zuerst; Lauf
  idempotent (fehlende Rows überspringen).
- **GDPR-Contributor (PFLICHT, core-Vertrag):** Export = alle Profile
  des Users (ownerType 'user') samt Steps/Messages/Shares + access +
  invites(emailLower) + events(userId). Löschung = dieselbe Menge über
  die Profil-Kaskade + access-Row + invites anonymisieren
  (emailLower → gelöscht-Marker) + events(userId) löschen.
- **URL-Analyse-Rohmaterial** liegt in KEINER Tabelle (früh gelöscht,
  §9b) — nur extrahierte Ergebnisse in brand_steps.slots.

## 8. Laufzeit-Flags (System-Migrationen, Teil von P1a)

| Flag | Ablage | Default | Wirkung |
| --- | --- | --- | --- |
| brandAdmissionMode | app_config (system-Migration, additiv) | **'closed'** | DREI Werte (§3e-Korrektur): 'closed' = keine NEUEN Zugänge, bestehende brand_access-Rows bleiben gültig · 'invite' = neue nur per Einladung · 'open' = jedes eingeloggte, verifizierte Konto (Öffnung ist Laufzeitflag; Konto-Pflicht IMMER) |
| brandAiEnabled | app_config (system-Migration, additiv) | **false** | brand-spezifischer AI-Kill-Switch (Plan §6-Limits); aus ⇒ Stand voll bearbeitbar, keine neuen Entwürfe |

**§3e-Korrektur nach Abnahme, 2026-08-31:** die P1a-Fassung dieses Anhangs
nannte nur `closed|open`; Plan §3e definiert DREI Modi. Im GATE verhalten
sich `closed` und `invite` identisch (Zugang nur mit nicht-widerrufener
`brand_access`-Row) — der Unterschied liegt in der EINLÖSUNG
(`admissionAllowsRedeem` in `packages/brand/shared/brandAccess.ts`: nur
`invite` verwandelt einen gültigen Code in eine neue Row). `revokedAt`
schlägt weiterhin JEDEN Modus. Die Spaltengröße varchar(16) trägt alle drei
Werte; system-038 bleibt unverändert gültig.

`system`-Migrationen laufen auf JEDER Instanz mit (CLAUDE.md) — beide
Spalten sind additiv mit Default und kommen ins Paritäts-SOLL
(`verify-schema-parity.mjs`, Spalten-Parität system). Die
brand_*-TABELLEN dagegen nur ins `PORTFOLIO_SOLL` (sie existieren nur
dort).

## 9. Randstücke, die P1b aus diesem Anhang übernimmt

`brand` in RESERVED_SUBDOMAINS eintragen · A14-Matrix-Zeile (brand
konsumiert Themes-Presets als EXPLIZITEN Vertrag) · migrate.mjs
LAYER_ORDER + product.manifest.ts · Limits-Vertrag (200/Tag Konto,
10/Tag Brand×Slot-Typ, Burst 2, Instanz-Deckel) liest die Route, nicht
das Schema — kein Zähler-Feld in den Tabellen (Zählung über
brand_events wäre Scan-teuer; P1b implementiert die Drossel im
bestehenden rate-limit-Muster mit Tages-Buckets).
