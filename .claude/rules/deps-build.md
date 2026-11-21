---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - "**/nuxt.config.ts"
  - "**/shared/types/**"
  - "eslint.config.mjs"
  - "eslint.typed.config.mjs"
  - "scripts/lint-typed.mjs"
  - ".github/workflows/lint.yml"
  - "scripts/check-*.mjs"
---

## Abhängigkeiten, Typen und der Lint-Lauf

### Abhängigkeiten
- EINE VERSION JE KERNABHÄNGIGKEIT — Wächter `pnpm check:single-copy`.
  Zwei Kopien brechen Typen oder Build, und WELCHE gewinnt, entscheidet pnpms
  HOISTING, nicht das Lockfile (derselbe Lockfile ist hier grün, dort rot).
  `nuxi prepare` schreibt die gehoistete Version in die `paths` der
  generierten tsconfigs — passt sie nicht zu Nitros Typen, ist jedes
  weitergereichte H3Event ein Fehler. Doppelungen werden BESEITIGT, nicht
  durch Kür eines Gewinners kaschiert; begründete Ausnahmen stehen im Skript.
- CARET PINNT NICHTS (`^4.4.8` erlaubt 4.5.1) — ein „Rückbau" per
  Range-Bearbeitung wirkt nicht. Beweis ist immer
  `node -p "require('./apps/<app>/node_modules/<pkg>/package.json').version"`;
  zurücksetzen nur per `git checkout -- pnpm-lock.yaml pnpm-workspace.yaml` +
  `pnpm install --frozen-lockfile`. Nach jedem Bump `git diff --stat
  pnpm-lock.yaml` lesen: viel mehr als erwartet ⇒ so nicht committen.
- GEKOPPELTE BUMPS: `@nuxtjs/i18n` gehört zur Nuxt-Generation und wird mit
  Nuxt zusammen gezogen (sonst stehen unhead, vue-router und pinia doppelt im
  Baum); `pinia` und `@pinia/nuxt` nur gemeinsam (0.11.x↔pinia 3,
  1.0.x↔pinia 4). Die passende Linie steht im Kommentar am Katalog-Eintrag in
  `pnpm-workspace.yaml`.
- KOPF-EINTRÄGE sind seit unhead 3 über `rel` bzw. `name`/`property`
  diskriminierte Unions — ein `rel: string` wird `never`. In `useHead` `rel`
  literal halten (`as const`); bedingte Spreads nehmen dem Array-Literal sonst
  den Kontext-Typ.

### Typen
- NITROS ROUTEN-TYPISIERUNG IST AUS (Davids Entscheidung, TS2589):
  `packages/core/nuxt.config.ts` leert `types.routes` im `types:extend`-Hook —
  `$fetch('/api/x')` liefert `unknown`, und JEDER gebundene `$fetch`/`useFetch`
  nennt seinen Antworttyp SELBST (`$fetch<XyzResponse>(…)`). Antwort-Typen
  leben in `shared/types/` und werden an BEIDEN Enden verlangt
  (Handler-Annotation + Aufrufstelle). ESLint erzwingt es für gebundene
  Aufrufe in `packages/*/app/**` und `apps/*/app/**` (no-restricted-syntax);
  Feuer-und-vergiss-POSTs bleiben bewusst untypisiert. Explizite
  Handler-Annotationen allein sind KEIN Ausweg (kaum Wirkung) — nicht
  anbieten. `$fetch<…, string>` für eigene Routen ist verboten (kompensierte
  nur die Karte). Umkehrbar über den einen Hook; Verhalten getestet in
  `packages/core/tests/nitroRouteTypes.test.ts`.
- LOSE PROMISES IM SERVER-CODE SIND ROT (SEC-023,
  `@typescript-eslint/no-floating-promises` für `packages/*/server/**/*.ts`
  und `apps/*/server/**/*.ts`): trägt das Ergebnis die Antwort ⇒ `await`;
  bewusstes „Feuer und vergiss" (Log, Benachrichtigung, Aufräumen nach der
  Antwort, Intervall-Läufe) ⇒ `void` davor, nie ein `eslint-disable`. Die
  Typen kommen aus den generierten Server-tsconfigs der Apps
  (`apps/<app>/.nuxt/tsconfig.server.json`); Layer haben keine eigene.
- EIGENER DURCHGANG (SI1 c): die Regel läuft NICHT in `pnpm -r lint`, sondern
  in `pnpm lint:typed` (`scripts/lint-typed.mjs` + `eslint.typed.config.mjs`,
  ein ESLint-Prozess je App-Programm). `pnpm lint` (Wurzel) fährt beides,
  `lint.yml` `lint:typed` als eigenen Schritt. (1) Ohne `.nuxt` erst
  `pnpm lint:prepare` (`nuxi prepare` je App) — fehlt eine tsconfig, bricht
  `lint:typed` mit genau diesem Hinweis ab. (2) Jeder Layer mit `server/` steht
  in `SERVER_LINT_PROGRAM` (`eslint.typed.config.mjs`) mit GENAU EINER App, die
  ihn per `extends` mitbringt; App-eigene `server/`-Ordner nehmen die eigene
  App. NEUER LAYER MIT `server/` ⇒ dort eintragen; ohne Eintrag oder mit einer App, deren tsconfig ihn nicht
  enthält, ist `lint:typed` rot.
  (3) Die `ignores` dort bleiben gleich denen von `pnpm -r lint` (samt
  `**/public`) — sonst sähe der Durchgang andere Dateien.

### Der Lint-Lauf
- DER LINT-LAUF IST MEHR ALS `lint`: vor den drei Lint-Schritten
  (`pnpm -r lint`, `pnpm lint:typed`, `pnpm lint:scripts`) fährt er eine Reihe
  Wächter — DIE LISTE IST `.github/workflows/lint.yml` (u. a.
  `check:manifests`, `check:i18n-keys`, `check:bilanz`, `check:single-copy`,
  `check:themes` im Paket `@pukalani/themes`). Dazu:
  - `pnpm check:doc-links`: jeder Pfad und Link in `docs/` und im README; ein
    Pfad ins Leere ist ROT. Geduldet (nur Hinweis) sind Pfad-Angaben in
    Protokollen und Plänen: `docs/archiv/`, `docs/OPEN-ITEMS-COMPLETE.md`,
    `README.md`, `CHANGELOG.md`, `docs/plans/`; ein Link auf ein DOKUMENT ist
    überall hart. Wer anderswo in `docs/` (`docs/DECISION-LOG.md`,
    `docs/referenz/`, `docs/runbooks/`) einen Pfad nennt oder eine dort
    genannte Datei löscht, fährt vorher `pnpm check:doc-links`.
  - `pnpm check:prompt-quotes` (AI2): ein gerades `"` in einem KI-PROMPT ist
    eine Vorlage für das Zeichen, das die JSON-Antwort des Modells beendet;
    Zeilen, die nicht in einen Prompt gehen, tragen `prompt-quotes-ok` mit
    Grund.
  - `pnpm check:live-beweise`: `docs/referenz/LIVE-BEWEISE.md` wird aus den
    Köpfen der Beweis-Skripte ERZEUGT — neues, gelöschtes oder umbenanntes
    `verify-*`/`acceptance-*`-Skript ⇒ `pnpm live-beweise` und die Datei mit
    committen.
  - `pnpm check:rules`: das Regelwerk (`CLAUDE.md`, `.claude/rules/`, `.claude/agents/`) —
    Größe (je Regeldatei höchstens 15.000 Bytes, `CLAUDE.md` 20.000), genannte
    Pfade und `pnpm`-Skripte existieren, jedes `paths:`-Muster trifft.
- SKRIPTE HABEN EIGENEN LINT: `pnpm -r lint` läuft nur über die
  Workspace-Pakete; `scripts/` deckt `pnpm lint:scripts` ab (eigener Schritt
  in `lint.yml`) — vor dem Commit selbst laufen lassen. Davor fährt es (die
  Liste IST das Skript in der Wurzel-`package.json`):
  - `check:nul-bytes` (SEC-044): ein LITERALES NUL-Zeichen macht eine
    Quelldatei für git binär (Diff in keinem Review, `grep` ohne `-a` findet
    nichts) — im Code als Escape `\u0000`.
  - `check:permissions` (SEC-001): rot bei jedem Bucket mit Schreibrecht für
    Konten in einer Migration oder einem Bootstrap-Skript
    (`.claude/rules/appwrite.md`, „Rechte an Ablagen und Tabellen").
  - `check:workflows` (SEC-041/SEC-042): in `.github/workflows/*.yml` ist jede
    fremde Action über einen COMMIT eingebunden
    (`uses: <owner>/<repo>@<40 Hex> # vX.Y.Z` — ein Tag lässt sich umhängen),
    auf Workflow-Ebene steht `permissions: {}`, JEDER Job nennt eigene Rechte.
    Ein Job, der `secrets.…` liest, nennt eine UMGEBUNG (`environment:` —
    `production` fürs Ausliefern, `production-watch` für die Wächter; beide nur
    `main`, auf Repo-Ebene liegt kein Secret); ein Job mit Umgebung installiert
    und baut nichts (kein `pnpm`/`npm`/`npx`) — gebaut wird ohne Umgebung, das
    Ergebnis reist als Artefakt. Commit zu einem Tag:
    `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`; aktuell hält die
    Einträge Dependabot.
  - `check:ai-routing` (SEC-005): jeder KI-Aufruf im Server-Code gibt als
    `providerRouting` nichts (Text: EU-Voreinstellung) oder eine BENANNTE
    Konstante aus `scripts/check-ai-routing.mjs` mit; jeder Ort liegt in der
    EU oder trägt eine Ausnahme mit Grund; niemand ruft `chat/completions`
    am Transport vorbei.
  - `check:public-ips` (SEC-011): das Repo ist öffentlich. In Doku, Tests und
    Beispielen nur Adressen aus den Dokumentations-Bereichen (203.0.113.x,
    198.51.100.x, 192.0.2.x); jede andere öffentliche Adresse braucht einen
    Eintrag MIT GRUND in der Erlaubnisliste des Skripts.
  - `check:icons` (FE-002): jeder fest geschriebene Symbol-Name (`i-ph-…`,
    `i-lucide-…`) in `apps/`, `packages/`, `docs/app` und `docs/content`
    existiert in seinem Symbol-Paket, das Paket ist im Workspace-Paket der
    Datei oder im Core eingetragen, der Core überschreibt jedes
    Standard-Symbol von Nuxt UI, `icon.fallbackToApi` bleibt `false`.
    Zusammengesetzte Namen (`i-circle-flags-${code}`) sieht er nicht.
- WÄCHTER LESEN IHRE LISTEN AUS DEM CODE (GA1 P20, Davids Entscheidung): eine
  Liste, die jemand nachtragen muss, macht ihren Wächter blind für das Neue.
  `pnpm check:manifests` (Prüfungen nummeriert im Kopf von
  `scripts/check-manifests.mjs`) prüft u. a.: jede Routen-Datei eines
  abschaltbaren Layers liegt unter seinen `apiPrefixes`; keine globale
  `pageTransition` in einer App mit dem Layer `admin`; die Lösch-Pflicht
  (Manifest `userData` gegen Beitrag und Personen-Spalten); die
  Datentür-Liste (wer `communityId` anlegt, steht in
  `scripts/lib/data-door-layers.mjs`). Die letzten zwei lesen die MIGRATIONEN
  über `scripts/lib/migration-inventory.mjs`; was der Leser nicht lesen kann,
  macht `check:manifests` rot. NEUE MIGRATION ⇒ Tabelle und Spalte als
  Literal oder Konstante derselben Datei schreiben. Im Test-Lauf
  (`packages/core/tests`): `verifySiteEnv` (jede Einstellung aus `runtimeConfig` und jedes
  `process.env.NUXT_…` hat eine Entscheidung in
  `scripts/ops/site-env-decisions.mjs`), `aiModelFields` (jedes Feld `…Model`
  einer `app.config.ts` steht in `scripts/ops/ai-model-endpoints.mjs`),
  `deployApps` (Health-Hosts ⊆ TLS-Hosts), `layerTestsNoAppImports` (ein
  Layer-Test importiert nichts aus `apps/`).
- REGEL FÜR JEDE AUSNAHMELISTE: eine Stelle, je Eintrag ein Grund, und ein
  Eintrag, der nichts mehr ausnimmt, ist rot.

### Tor und Geheimnisse
- ALLE VIER PRÜFUNGEN HALTEN DEN DEPLOY AUF (P07, Davids Entscheidung): Test,
  Lint, Typecheck, E2E. Ein roter Wächter im Lint-Lauf ist ein Stopp.
- GEHEIMNISSE: der Job `secrets` in `lint.yml` fährt `gitleaks` (Binärdatei mit
  Prüfsumme gepinnt); Ausnahmen in `.gitleaksignore` nur für geprüfte
  Testwerte — ein echtes Geheimnis wird rotiert, nie eingetragen. Lokal
  `pnpm check:secrets` (braucht `brew install gitleaks`).
- DIE PFLICHT-PRÜFUNG LIEST NUR DEN EIGENEN ZWEIG (CW1 b, Davids
  Entscheidung): alles vom geprüften Commit aus Erreichbare. ALLE Zweige und
  Tags liest täglich `.github/workflows/secrets-watch.yml`; ein Fund ist ein
  Issue `geheimnis-alarm` und hält nichts auf (Probealarm
  `gh workflow run secrets-watch.yml -f alarm_drill=true`). Version und
  Prüfsumme von gitleaks stehen in beiden Dateien;
  `packages/core/tests/secretsWatchWorkflow.test.ts` hält sie gleich.
- VOR DEM ERSTEN PUSH EINES ZWEIGS: `gitleaks git --no-banner --redact
  --exit-code 1 --log-opts="origin/main..HEAD" .` Testwerte, die wie ein
  Geheimnis aussehen sollen, nie in eine Variable, deren Name `secret`,
  `token`, `key` oder `password` enthält. Ist es passiert: Zweig auf origin
  löschen, sauber neu aufsetzen (ein Commit ohne den Wert), die roten Läufe
  neu starten.
