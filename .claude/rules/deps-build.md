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
<!-- Ausgelagert aus CLAUDE.md am 2026-11-08 (Token-Hygiene, SH1 e): lädt
     automatisch, sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen
     (cat/sed) diese Datei bewusst per Read öffnen. Wortlaut unverändert. -->

## Abhängigkeiten, Typen und der Lint-Lauf

- EINE Version je Kernabhängigkeit — `pnpm check:single-copy` (CI-Gate) ist der
  Wächter. Zwei Kopien brechen Typen oder Build, und WELCHE gewinnt, entscheidet
  pnpms HOISTING, nicht das Lockfile: derselbe Lockfile ist damit auf einer
  Maschine grün und auf der anderen rot. `nuxi prepare` schreibt die gehoistete
  Version in die `paths` der generierten tsconfigs — passt sie nicht zu Nitros
  Typen, ist jedes an einen Helfer weitergereichte H3Event ein Fehler. Zweimal
  live erwischt (2026-07-30): vue doppelt ⇒ Prod-Build stirbt an ENAMETOOLONG,
  h3 doppelt ⇒ 1102/944/1261 Typfehler. Doppelungen werden BESEITIGT, nicht
  durch Kür eines Gewinners kaschiert; begründete Ausnahmen stehen im Skript.
- Eine Caret-Range im Katalog PINNT NICHTS (`^4.4.8` erlaubt 4.5.1) — ein
  „Rückbau" per Range-Bearbeitung wirkt nicht. Beweis ist immer
  `node -p "require('./apps/<app>/node_modules/<pkg>/package.json').version"`;
  Zurücksetzen nur per `git checkout -- pnpm-lock.yaml pnpm-workspace.yaml` +
  `pnpm install --frozen-lockfile`. Nach jedem Bump `git diff --stat
  pnpm-lock.yaml` lesen: steht dort viel mehr als erwartet, gehört es nicht so
  in den Commit.
- `@nuxtjs/i18n` gehört zur NUXT-GENERATION und wird mit Nuxt zusammen gezogen
  (10.4↔4.4, 10.6↔4.5). Ein Nuxt-Bump ohne i18n-Bump lässt unhead, vue-router
  und pinia doppelt im Baum stehen. `pinia` und `@pinia/nuxt` sind ebenso fest
  gekoppelt (0.11.x↔pinia 3, 1.0.x↔pinia 4) — nur gemeinsam bumpen.
- KOPF-EINTRÄGE sind seit unhead 3 über `rel` bzw. `name`/`property`
  DISKRIMINIERTE Unions — ein `rel: string` wird zu `never`. In `useHead`-Aufrufen
  `rel` literal halten (`as const`); bedingte Spreads nehmen dem Array-Literal
  sonst den Kontext-Typ.
- NITROS ROUTEN-TYPISIERUNG IST AUS (Davids Entscheidung 2026-08-14, TS2589-
  Strukturfix): `packages/core/nuxt.config.ts` leert `types.routes` im
  `types:extend`-Hook — `$fetch('/api/x')` liefert damit `unknown`, und JEDER
  gebundene `$fetch`/`useFetch` nennt seinen Antworttyp SELBST
  (`$fetch<XyzResponse>(…)`); Antwort-Typen leben in `shared/types/` und
  werden an BEIDEN Enden verlangt (Handler-Annotation + Aufrufstelle). ESLint
  erzwingt es für gebundene Aufrufe in `app/**` (no-restricted-syntax);
  Feuer-und-vergiss-POSTs bleiben bewusst untypisiert. GRUND (gemessen, nicht
  geglaubt): `$fetch` löste jeden Routen-Literal gegen ALLE ~210 Routen auf —
  Aufrufstellen × Routen = 92 % aller Typ-Instanziierungen (7,5 Mio → 618k,
  Typecheck 10,7 s → 5,4 s); 12 neue Routen reichten vorher für TS2589, jetzt
  kosten 100 Proberouten +142 Instanziierungen. Explizite Handler-
  Annotationen allein ändern gemessene 1 % — NICHT als Ausweg anbieten.
  Der Trick `$fetch<…, string>` ist verboten (kompensierte nur die Karte;
  Grep-Stand 0). Umkehrbar über den einen Hook; Verhalten getestet in
  `packages/core/tests/nitroRouteTypes.test.ts`.
- `pnpm -r lint` läuft NUR über die Workspace-Pakete — die Dateien in `scripts/`
  (Migrations-Runner, ops-Wächter, CI-Aufbau) deckt `pnpm lint:scripts` ab, seit
  2026-08-20 als eigener Schritt in lint.yml. Ein neues Skript dort ist also
  gelintet; vor dem Commit selbst laufen lassen, `pnpm -r lint` sieht es nicht.
  Seit 2026-11-13 fährt `lint:scripts` davor `check:nul-bytes` (SEC-044): ein
  LITERALES NUL-Zeichen in einer Quelldatei macht sie für git binär — ihr Diff
  ist dann in keinem Review sichtbar, und `grep` ohne `-a` findet in ihr
  nichts. Im Code steht das Zeichen als Escape `\u0000`. Ebenfalls seit
  2026-11-13 fährt `lint:scripts` `check:permissions` (SEC-001): rot bei jedem
  Bucket mit Schreibrecht für Konten in einer Migration oder einem
  Bootstrap-Skript (Regel in `.claude/rules/appwrite.md`, „Rechte an Ablagen").
  Seit 2026-11-14 fährt `lint:scripts` auch `check:workflows` (SEC-041): in
  `.github/workflows/*.yml` ist jede fremde Action über einen COMMIT
  eingebunden (`uses: owner/repo@<40 Hex> # vX.Y.Z` — ein Tag lässt sich
  umhängen, ein Commit nicht), auf Workflow-Ebene steht `permissions: {}`, und
  JEDER Job nennt seine eigenen Rechte. Neuer Job ohne `permissions:` ⇒ rot.
  Dazu zwei Regeln für Secrets (SEC-041/SEC-042): ein Job, der `secrets.…`
  liest, nennt eine UMGEBUNG (`environment:` — `production` fürs Ausliefern,
  `production-watch` für die Wächter; beide lassen nur `main` zu, auf
  Repo-Ebene liegt kein Secret), und ein Job mit Umgebung installiert und
  baut nichts (kein `pnpm`/`npm`/`npx`) — gebaut wird in einem Job ohne
  Umgebung, das Ergebnis reist als Artefakt weiter.
  Den Commit zu einem Tag liefert `gh api repos/<owner>/<repo>/commits/<tag>
  --jq .sha`; aktuell hält die Einträge Dependabot (ein Sammel-PR je Woche).
  Seit 2026-11-15 fährt `lint:scripts` auch `check:public-ips` (SEC-011):
  das Repo ist öffentlich, eine echte IPv4 aus einem Log ist ein
  personenbezogenes Datum. In Doku, Tests und Beispielen stehen Adressen aus
  den Dokumentations-Bereichen (203.0.113.x, 198.51.100.x, 192.0.2.x); jede
  andere öffentliche Adresse braucht einen Eintrag MIT GRUND in der
  Erlaubnisliste des Skripts (eigene Server, öffentliche Resolver,
  Test-Grenzwerte).
- LOSE PROMISES IM SERVER-CODE SIND ROT (SEC-023, seit 2026-11-13): für jedes
  `packages/*/server/**/*.ts` und `apps/*/server/**/*.ts` gilt die TYPISIERTE
  Regel `@typescript-eslint/no-floating-promises`. Eine Wache oder ein
  Schreibvorgang, dessen Ergebnis die Antwort trägt, bekommt `await`; bewusstes
  „Feuer und vergiss" (Log, Benachrichtigung, Aufräumen nach der Antwort,
  Intervall-Läufe) bekommt `void` davor — das ist die sichtbare Aussage, nicht
  ein `eslint-disable`. Die Typen kommen aus den GENERIERTEN Server-tsconfigs
  der Apps (`apps/<app>/.nuxt/tsconfig.server.json`, nur dort sind Nitros
  Auto-Importe typisiert); Layer haben keine eigene. EIGENER DURCHGANG (SI1 c,
  seit 2026-11-18): die Regel läuft NICHT im `eslint .` der Pakete, sondern in
  `pnpm lint:typed` (`scripts/lint-typed.mjs` + `eslint.typed.config.mjs`) —
  je App-Programm EIN ESLint-Prozess über alle Server-Ordner, die zu ihr
  gehören, parallel. Vorher baute jedes Paket das Programm seiner App neu
  (34 Aufbauten für acht Programme). `pnpm -r lint` sieht lose Promises also
  NICHT mehr; `pnpm lint` (Wurzel) fährt beides, `lint.yml` fährt
  `pnpm lint:typed` als eigenen Schritt im Job `lint`. Deshalb: (1) ohne
  `.nuxt` erst `pnpm lint:prepare` (`nuxi prepare` je App, kalt ~7 s; in
  `lint.yml` als Schritt vor dem Lint) — fehlt eine tsconfig, bricht
  `lint:typed` mit genau diesem Hinweis ab. (2) Jeder Layer mit `server/`
  steht in `SERVER_LINT_PROGRAM` (eslint.typed.config.mjs) mit GENAU EINER
  App, die ihn per `extends` mitbringt. App-eigene `server/`-Ordner nehmen
  die eigene App automatisch. NEUER LAYER MIT `server/` ⇒ dort eintragen;
  ohne Eintrag (oder mit einer App, deren tsconfig ihn nicht enthält) ist
  `lint:typed` rot. Die Ausnahmen (`ignores`) dort stehen gleich zu denen von
  `pnpm -r lint` (samt `**/public` aus @nuxt/eslint-config) — sonst sähe der
  Durchgang andere Dateien. Gemessen 2026-11-18 lokal, abwechselnd unter
  gleicher (hoher) Last, Median aus vier Runden: vorher `pnpm -r lint` 66 s,
  nachher `pnpm -r lint` 27 s + `pnpm lint:typed` 11 s = 39 s. Datei-Menge
  der Regel vorher und nachher gleich (1178 Dateien, je dieselbe tsconfig).
- DER LINT-LAUF IST MEHR ALS `lint` (2026-09-10 rot erwischt): `lint.yml` fährt
  SIEBEN Wächter vor den drei Lint-Schritten (`pnpm -r lint`,
  `pnpm lint:typed`, `pnpm lint:scripts`) — `check:manifests`,
  `check:i18n-keys`, `check:bilanz`, **`check:doc-links`**, `check:single-copy`,
  `check:prompt-quotes` (seit AI2, 2026-11-09: ein gerades `"` in einem
  KI-PROMPT ist eine Vorlage für genau das Zeichen, das die JSON-Antwort des
  Modells beendet — gemessen 4 von 52 bezahlten Läufen; Zeilen, die nicht in
  einen Prompt gehen, tragen `prompt-quotes-ok` mit Grund).
  `check:doc-links` prüft JEDEN Datei-Pfad und Link in `docs/` und im README:
  ein Pfad, der ins Leere zeigt, ist ROT. In Protokoll-Dokumenten
  (OPEN-ITEMS-COMPLETE, `archiv/`) sind Pfade von damals geduldet — im
  DECISION-LOG, in `plans/`, `referenz/`, `runbooks/` und im README nicht. Wer
  in einer dieser Dateien einen Pfad nennt (oder eine Datei löscht, die dort
  genannt ist), fährt vorher `pnpm check:doc-links`.
- WÄCHTER LESEN IHRE LISTEN AUS DEM CODE (GA1 P20, seit 2026-11-16 — Davids
  Entscheidung „Die Wächter erzeugen ihre Listen aus dem Code"): eine Liste,
  die jemand nachtragen muss, macht ihren Wächter blind für genau das Neue.
  `check:manifests` fährt seitdem ZEHN Prüfungen; neu sind (7) jede
  Routen-Datei eines abschaltbaren Layers liegt unter seinen `apiPrefixes`,
  (8) keine globale `pageTransition` in einer App mit dem Layer `admin`,
  (9) die Lösch-Pflicht (Manifest `userData` gegen Beitrag und
  Personen-Spalten) und (10) die Datentür-Liste (wer `communityId` anlegt,
  steht in `scripts/lib/data-door-layers.mjs`). 9 und 10 lesen die
  MIGRATIONEN über `scripts/lib/migration-inventory.mjs` — der Leser versteht
  den Schreibstil der Migrationen (Literal, Konstante der Datei, Schleife über
  eine Liste, Hilfsfunktion, Fabrik aus `scripts/migrations-lib/`); was er
  NICHT lesen kann, macht `check:manifests` rot, statt still zu fehlen. Neue
  Migration ⇒ Tabelle und Spalte als Literal oder Konstante derselben Datei
  schreiben. Dazu als achter Wächter im Lint-Lauf `check:live-beweise`
  (`docs/referenz/LIVE-BEWEISE.md` wird aus den Köpfen der Beweis-Skripte
  ERZEUGT: neues, gelöschtes oder umbenanntes `verify-*`/`acceptance-*`-Skript
  ⇒ `pnpm live-beweise` und die Datei mit committen). Im Test-Lauf
  (`packages/core/tests`): `verifySiteEnv` (jede Einstellung aus
  `runtimeConfig` und jedes `process.env.NUXT_…` hat eine Entscheidung in
  `scripts/ops/site-env-decisions.mjs`), `aiModelFields` (jedes Feld `…Model`
  einer `app.config.ts` kennt der Modell-Wächter), `deployApps` (Health-Hosts
  ⊆ TLS-Hosts), `layerTestsNoAppImports` (ein Test eines Layers importiert
  nichts aus `apps/` — dort fehlt in der CI `.nuxt/`). REGEL FÜR JEDE
  AUSNAHMELISTE: eine Stelle, je Eintrag ein Grund, und ein Eintrag, der
  nichts mehr ausnimmt, ist rot. Gemessen: `check:manifests` 0,25 s,
  `lint:scripts` unverändert rund 4 s.
- ALLE VIER PRÜFUNGEN HALTEN DEN DEPLOY AUF (seit 2026-11-13, P07, Davids
  Entscheidung 2026-11-12): Test, Lint, Typecheck, E2E. Ein roter Wächter im
  Lint-Lauf ist damit kein Hinweis mehr, sondern ein Stopp. Im Lint-Workflow
  läuft dazu der Job `secrets`: `gitleaks` über die ganze Historie, als
  Binärdatei mit Prüfsumme gepinnt, Ausnahmen in `.gitleaksignore` (nur
  geprüfte Testwerte; ein echtes Geheimnis wird rotiert, nie eingetragen).
  Lokal: `pnpm check:secrets` (braucht `brew install gitleaks`).
  „DIE GANZE HISTORIE" HEISST: JEDER ZWEIG AUF ORIGIN (2026-11-18 erwischt):
  ein Zweig eines Helfers mit einem erfundenen Testwert in einer Variable
  namens `SECRET` machte die Prüfung dreizehn Minuten lang auf `main` und in
  JEDEM Pull Request rot — und hielt damit jedes Ausliefern auf. Vor dem
  ERSTEN Push eines Zweigs: `gitleaks git --no-banner --redact --exit-code 1
  --log-opts="origin/main..HEAD" .` Testwerte, die wie ein Geheimnis
  aussehen sollen, nicht in eine Variable legen, deren Name `secret`,
  `token`, `key` oder `password` enthält. Kur, wenn es passiert ist: den
  Zweig auf origin löschen, sauber neu aufsetzen (ein Commit ohne den Wert),
  die roten Läufe neu starten.
