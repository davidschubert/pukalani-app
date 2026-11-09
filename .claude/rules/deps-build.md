---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - "**/nuxt.config.ts"
  - "**/shared/types/**"
  - "eslint.config.mjs"
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
- DER LINT-LAUF IST MEHR ALS `lint` (2026-09-10 rot erwischt): `lint.yml` fährt
  SIEBEN Wächter vor den beiden Lint-Schritten — `check:manifests`,
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
