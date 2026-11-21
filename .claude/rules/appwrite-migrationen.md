---
paths:
  - "packages/*/scripts/**"
  - "apps/*/scripts/**"
  - "scripts/migrate.mjs"
  - "scripts/migrations-lib/**"
  - "scripts/lib/**"
  - "scripts/ops/**"
  - "packages/*/product.manifest.ts"
  - "apps/*/site.manifest.ts"
  - "packages/core/server/utils/schemaState.ts"
  - "packages/core/shared/schemaState.ts"
  - "packages/core/server/api/health.ts"
---

## Appwrite — Migrationen, Ziel-Prüfung, Schema-Stand

Clients, Rechte und Anmeldung: `appwrite.md`.

### Migrationen
- NEUER BUCKET ⇒ `permissions: []` + `fileSecurity`; NEUE TABELLE ⇒ kein
  Schreibrecht für Konten und ein Eintrag in
  `scripts/lib/server-written-tables.mjs` (Grundregeln: `appwrite.md`,
  „Rechte an Ablagen und Tabellen"; `tenant-isolation.md`, „DER SERVER
  SCHREIBT").
- IMMER über den zentralen Runner `pnpm migrate --app <app>`
  (`scripts/migrate.mjs`; `--app` Pflicht — nie die falsche Instanz).
  Idempotent: 409 ⇒ überspringen.
- KEIN REGISTER in der DB: die Labels (`control-019`, `system-021`, …) sind
  reine Anzeige, die Idempotenz kommt vom 409. „Welche Migration lief hier?"
  ist nicht fragbar — nur, was herauskam (`pnpm ops:schema-parity`, unten).
- NAMEN: Migrationen des Control Plane heißen `control-NNN`; ältere Dokumente
  (`docs/archiv/**`, CHANGELOG) nennen sie `studio-NNN` — bewusst nicht
  umschreiben. Die DATEINAMEN (`019-site-team.ts`) bleiben immer.
- `system`-LAYER läuft auf jeder Instanz (Pool, Control Plane, jede
  Einzel-Instanz) ⇒ eine neue `system`-Migration überall fahren, danach
  `pnpm ops:schema-parity`.
- SPALTE VOR INDEX: nach Spalten-Anlage auf `available` pollen. Das reicht
  NICHT (Index-Endpunkt liest einen nachhinkenden Metadaten-Cache ⇒ 400
  `column_not_available`): Index-Anlage NUR über die Fabrik aus
  `scripts/migrations-lib/indexRetry.mts` — einmal je Datei
  `const { indexStep } = createIndexSteps(tablesDB, databaseId)`, dann
  `await indexStep('Index x.idx_y', { tableId, key, type, columns })`. Sie
  ruft `createIndex` selbst und bringt Retry + Cache-Anstoß
  (`tableCacheNudge`) mit; nur ein Schreibzugriff auf die Tabelle räumt einen
  vergifteten Cache. Sicherungen gehören in die Schnittstelle, nicht in die
  Disziplin. Seeds/`createRow` sind nicht betroffen. Ab Appwrite 2.4 ist das
  Rennen upstream geschlossen, die Fabrik bleibt trotzdem;
  `packages/media/scripts/verify-index-nudge.mjs` prüft versionsbewusst.
- ROHES `tablesDB.createIndex` in `packages/*/scripts/migrations/**`
  verbietet ESLint — der EINZIGE greifende Wächter: Migrationen liegen in
  keiner tsconfig, `pnpm -r typecheck` sieht sie nie.
- „409 ⇒ EINSTELLUNGEN NACHZIEHEN" darf nur die JÜNGSTE Migration: der Runner
  fährt jede Migration bei jedem Lauf erneut, eine alte setzte den Bucket
  sonst jedes Mal zurück (system-032).
- BUCKET SCHLIESSEN: ERST der Code, der mit dem Admin-Client schreibt, DANN die
  Migration (umgekehrt scheitert jeder Upload). `updateBucket` setzt
  Weggelassenes auf API-Defaults ⇒ Bucket lesen, Unverändertes
  zurückschreiben.
- TABELLENRECHTE: `updateTable` setzt Weggelassenes auf Defaults ⇒ Tabelle
  lesen, nur die Rechte ändern, Name/`rowSecurity`/`enabled` zurückschreiben
  (`scripts/migrations-lib/tableWriteRights.mts`). Das Tabellenrecht BESITZT
  genau eine Migration (`rights.migration` in
  `scripts/lib/server-written-tables.mjs`) — ein altes `updateTable`, das
  Rechte absolut setzt, öffnet die Tabelle bei jedem vollen Lauf wieder.

### Ziel-Prüfung vor dem Schreiben (OPS-002, Davids Entscheidung)
- EINE Funktion für alle: `scripts/lib/target.mjs`. Lokaler Endpunkt
  (localhost, 127.0.0.1, ::1, *.localhost) ⇒ durch; jeder andere nur mit
  ausdrücklicher Bestätigung.
- RUNNER verlangt `--prod` UND vergleicht die Projekt-Id der Env-Datei mit
  `appwriteProjects` im `site.manifest.ts` der App (Abweichung ⇒ Abbruch mit
  beiden Ids; nicht ladbares Manifest ⇒ Abbruch, nie „alle Layer";
  `--env-file` ohne `--app` gibt es nicht). Er reicht die geprüfte Id als
  `PUKALANI_TARGET_CONFIRM` an jede Migration weiter.
- JEDES ANDERE SKRIPT verlangt gegen einen entfernten Endpunkt
  `PUKALANI_TARGET_CONFIRM=<Projekt-Id>`; zeigt die Env-Datei auf ein anderes
  Projekt, bricht es ab.
- AUFRUFE: lokal `pnpm migrate --app <app>`; Production
  `pnpm migrate --app <app> --env ~/.appwrite-secrets/migrations/<projekt>.env
  --only <layer>-<NNN> --prod` — erst mit `--dry-run` statt `--prod`
  ansehen (zeigt Projekt, Endpunkt, Dateien, schreibt nichts). Ohne `--only`
  fährt er alle Layer der App. Über `pnpm` geht nur `--env` (`--env-file`
  fängt Node ab); direkt mit `node scripts/migrate.mjs` gehen beide.
- EINZELN FREIGEGEBEN ⇒ immer mit `--only`: ein VOLLER Lauf legt im
  `system`-Layer weiter Spalten an und löscht sie wieder (alte Migrationen
  ohne Register).
- NEUE MIGRATION ⇒ erste Import-Zeile
  `import '../../../../scripts/lib/assert-target.mjs'`.
- NEUES SKRIPT MIT SCHLÜSSEL ⇒ dieselbe Zeile oder
  `assertTarget({ endpoint, projectId })` vor dem ersten Client; Stripe:
  `checkStripeTarget` (Live-Schlüssel verlangt `--live`). Wächter:
  `packages/core/tests/scriptTargetGuard.test.ts` — jede Datei unter
  `scripts/`, `packages/*/scripts/`, `apps/*/scripts/` mit Schlüssel ruft die
  Prüfung oder steht mit Grund in `EXEMPT`; eine veraltete Ausnahme ist
  ebenfalls rot.
- NEUES PROJEKT einer App ⇒ zuerst in `appwriteProjects` eintragen.

### Datenbank-Stand in `/api/health` (OPS-008, Davids Entscheidung)
- JEDER LAYER MIT MIGRATIONEN nennt in `product.manifest.ts`
  `schema: { latest, probe: { migration, table, column? } }`: `latest` =
  höchste Dateinummer, `probe` = die jüngste Migration, deren Ergebnis am
  Schema ABLESBAR ist (Tabelle oder Spalte, die bleibt; Indizes, Rechte,
  Ablagen, Daten sind es nicht).
- NEUE MIGRATION ⇒ `latest` nachziehen, legt sie Tabelle oder Spalte an, auch
  `probe`. Wächter `packages/core/tests/schemaProbeManifests.test.ts` (prüft
  auch, dass die Probe auf nichts zeigt, was eine spätere Migration löscht).
  Ein TIPPFEHLER in der Probe sieht aus wie eine fehlende Migration ⇒ vor dem
  Merge lokal `/api/health` lesen.
- DIE PRÜFUNG: die App liest die Proben aller einkompilierten Layer mit ihrem
  LAUFZEIT-Schlüssel (`listRows`, limit 1, select [spalte]); fehlende Spalte
  ⇒ 400 `general_query_invalid`, fehlende Tabelle ⇒ 404 `table_not_found`
  (`core/server/utils/schemaState.ts`, dort auch die Haltezeiten; Deutung pur
  in `core/shared/schemaState.ts`). Bewusst KEIN Zeiger und
  kein Register: die Probe liest, was da ist.
- `/api/health` meldet `schema: { state: ok|behind|unknown, expected, found }`:
  öffentlich NUR das Wort und zwei Zahlen; welche Migration fehlt, steht im
  Server-Log (`schema.behind`). `ok` bleibt davon UNBERÜHRT, ein Lesefehler
  heißt `unknown`, nie „ungesund". Landing und Hilfe haben einen eigenen
  Health ohne Appwrite und kein Feld.
- AUSWERTER: der Halbstunden-Wächter (`scripts/ops/verify-health.mjs`: rot
  bei `behind`, anhaltendem `unknown`, fehlendem Feld), die Probe des Deploys
  (rot bei `behind`, NACH dem Ausliefern — aufgehalten wird nichts) und
  täglich `scripts/ops/verify-schema-parity.mjs --ci`. Bei Rot:
  `docs/runbooks/PRODUKTIONS-ALARM.md`.

### Schema-Parität (`pnpm ops:schema-parity`, AU4/MG1 c)
- Prüft je Instanz ein KURATIERTES SOLL über alle Layer, die dort laufen
  sollen: eine fehlende Soll-Tabelle ist ein Fehler, auch wenn sie nirgends
  existiert.
- SPALTEN GENAU: Soll ist, was die Migrationen anlegen
  (`scripts/lib/migration-inventory.mjs`), nur für die Layer, die die App laut
  `site.manifest.ts` nutzt (`scripts/lib/schema-columns.mjs`). Fehlende
  Soll-Spalte und Spalte ohne Soll (von Hand angelegt) sind rot; mit `--ci`
  nennt er bei der zweiten nur Tabelle und Anzahl.
- AUSSEN VOR: Tabellen fremder Layer (Legacy-Silo portfolio, der eingefrorene
  Schatten `communities`/`tickets` in `account`), Appwrites `$`-Felder,
  Tabellen aus ensure-Skripten, ein Layer mit unlesbaren Migrationen
  (⚠-Zeile). Alt-/unbekannte Ist-Tabellen sind eine nicht-fatale WARNUNG.
- SOLL-LISTEN SIND GEPFLEGT ⇒ neue Tabelle in ihren Layer-Block im Skript
  eintragen, AUCH Tabellen aus ensure-Skripten. `user-data-coverage.test.ts`
  hält die Soll-Listen gegen die Migrationen; WO eine Tabelle läuft, bleibt
  eine Entscheidung im Skript.
- `INSTANCES`: jeder Eintrag trägt `ausgerollt` — fehlt die Env-Datei einer
  AUSGEROLLTEN Instanz, endet der Lauf rot (Exit 1) statt still
  „übersprungen". Alle Prod-Migrations-Envs
  liegen unter ~/.appwrite-secrets/migrations/<name>.env (account, admin,
  portfolio, branding; portfolios Repo-Baum-Datei ist umgezogen — sie fehlte in
  jedem Worktree).
- LÄUFT am Mac (`pnpm ops:schema-parity`) und täglich im Produktions-Wächter
  (`--ci`, nur lesende Schlüssel `watch-schema-readonly` mit `tables.read` +
  `columns.read` in der Umgebung `production-watch`, ohne Namen, die nur
  Production kennt).
