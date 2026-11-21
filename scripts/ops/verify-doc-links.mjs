#!/usr/bin/env node
/**
 * WÄCHTER: ZEIGT DIE DOKU NOCH AUF ETWAS, DAS ES GIBT? (F22, 2026-08-02)
 *
 * Die Doku dieses Repos ist ihr eigenes Gedächtnis: sie nennt Dateien, Routen,
 * Migrationen und Skripte beim Namen, und genau davon lebt sie. Eine
 * Umbenennung zieht die MELDUNGEN mit, die PFADE aber nicht (Memory
 * „Umbenennung lässt Pfade zurück") — ein Verweis auf eine gelöschte Datei
 * sieht danach genauso aus wie ein gültiger. Er kostet erst beim nächsten
 * Nachschlagen Zeit, und dann viel.
 *
 * WAS GEPRÜFT WIRD — drei Durchgänge für Verweise (hier), sieben weitere für
 * die Doku-Ordnung (seit 2026-11-21, beschrieben weiter unten), alle rein lesend:
 *
 *   1. Markdown-Links `[Text](ziel)` auf Dateien im Repo (nicht http/mailto).
 *   2. `[[Wiki-Verweise]]` — nachgesehen am 2026-07-30: JEDER von ihnen zeigt
 *      auf eine Notiz AUSSERHALB des Repos (Davids Obsidian-Vault bzw. eine
 *      Claude-Memory-Notiz, eine trägt das sogar als „(Memory)" dabei). Diese
 *      Schreibweise bedeutet in diesem Repo also „Notiz außerhalb" und ist
 *      kein Dateiverweis. Sie werden deshalb aufgelistet, aber nie als Fehler
 *      gezählt — prüfbar wären sie nur gegen ein Verzeichnis auf Davids
 *      Rechner, und ein Wächter, der nur auf einer Maschine grün ist, ist
 *      keiner.
 *   3. Pfad-artige Angaben in `Backticks` — in der Doku UND in den
 *      Kopfkommentaren der Skripte. Das ist der Durchgang, der die
 *      Umbenennungen fängt: Links stehen selten auf Quelldateien, Fließtext
 *      dagegen ständig („… in `core/server/utils/presence.ts`").
 *
 * WIE AUFGELÖST WIRD: die Doku schreibt Layer-Pfade verkürzt („themes/shared/
 * ramp.ts" statt „packages/themes/shared/ramp.ts") — das ist gewachsene,
 * lesbare Konvention und wird hier NICHT zum Fehler erklärt. Ein Kandidat gilt
 * als gefunden, sobald er unter EINEM der üblichen Präfixe existiert
 * (`PREFIXES`) oder relativ zur prüfenden Datei liegt.
 *
 * WAS BEWUSST NICHT GEPRÜFT WIRD: Funktions- und Symbolnamen. `requireEntitlement`
 * ist kein Pfad, und eine Heuristik darauf meldete jeden Begriff, der einmal
 * anders hieß. Solche Verweise finden Menschen per grep; dieses Skript hält
 * das fest, was maschinell EINDEUTIG entscheidbar ist — sonst wird es
 * abgeschaltet, weil es zu oft schreit.
 *
 * PROTOKOLL VS. WEGWEISER — die Grenze, an der dieses Skript aufhört:
 *
 * `docs/archiv/**`, `docs/OPEN-ITEMS-COMPLETE.md` und die Phasen-Tabelle in
 * `README.md` sind PROTOKOLLE. Sie beschreiben einen Stand von damals, und ein
 * ausgeführter Plan wird nicht auf heute umgeschrieben (CLAUDE.md,
 * Doku-Ordnung). Ein Dateiname im Fließtext ist dort eine historische Aussage
 * („die Datei hieß damals so") — sie zu „korrigieren" wäre
 * Geschichtsfälschung, und deshalb sind Pfad-Angaben dort nur ein Hinweis.
 *
 * Ein Link auf ein DOKUMENT ist etwas anderes. Er verspricht „hier kannst Du
 * es nachlesen", und dieses Versprechen altert nicht: zieht die verlinkte
 * Datei um, muss der Link mitziehen — es ist ja dasselbe Dokument. Solche
 * Links werden ÜBERALL erzwungen, auch im Archiv.
 *
 * Ein Link auf eine QUELLDATEI ist dagegen wieder eine Momentaufnahme (das
 * Archiv verlinkt gern die Datei, um die es damals ging) und wird in
 * Protokollen wie eine Pfad-Angabe behandelt. `--strict` macht auch die
 * weichen Treffer zu Fehlern — für eine bewusste Durchsicht.
 *
 * `docs/plans/**` GEHÖRT SEIT 2026-08-18 IN DIESELBE MILDE KATEGORIE, aus dem
 * SPIEGELBILDLICHEN Grund: dort steht, was NOCH NICHT gebaut ist (CLAUDE.md,
 * Doku-Ordnung: „docs/plans/ enthält nur, was NOCH NICHT gebaut ist"). Ein
 * Plan, der die Datei benennt, die er anlegen wird, ist genau richtig
 * geschrieben — für den Wächter sieht das aber wie ein toter Verweis aus.
 * Am 2026-08-18 ist das Gate deshalb auf `main` rot geworden: ein frisch
 * geschriebenes Konzept nannte `packages/agents/scripts/verify-runner-
 * boundary.mjs`, also die Prüfung, die es selbst vorschlägt. Die Alternative
 * — Pfade in Plänen zu umschreiben, damit ein Skript ruhig bleibt — macht
 * Pläne schlechter lesbar und hätte genau EINEN Zweck: den Wächter zu
 * beruhigen. Ein Link auf ein DOKUMENT bleibt auch hier hart, denn ein Plan
 * verlinkt nur, was es schon gibt.
 *
 * Lauf: `node scripts/ops/verify-doc-links.mjs [--strict] [--json]`
 * Exit 0 = keine toten Verweise (außerhalb der Allowlist), sonst 1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = new Set(process.argv.slice(2))
const STRICT = args.has('--strict')
const AS_JSON = args.has('--json')

/**
 * Dokumente, deren PFAD-Angaben nicht den heutigen Stand meinen — siehe Kopf.
 * Protokolle blicken zurück (`archiv/`, COMPLETE, README, CHANGELOG), Pläne
 * nach vorn (`docs/plans/`); für einen Pfad-Prüfer ist beides dasselbe: er
 * kann nicht wissen, ob eine Datei einmal existierte oder erst entstehen soll.
 */
const PROTOCOL = [
  /^docs\/archiv\//,
  /^docs\/OPEN-ITEMS-COMPLETE\.md$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^docs\/plans\//,
  // Erledigte Umzugs-Anleitungen brauchen hier keinen eigenen Eintrag mehr:
  // sie liegen seit 2026-11-16/17 unter `docs/archiv/` (Zeile oben).
]
const isProtocol = file => PROTOCOL.some(pattern => pattern.test(file))

/**
 * Zeigt der Verweis auf ein DOKUMENT (Navigation, muss immer stimmen) oder auf
 * eine Quelldatei (Momentaufnahme)? Siehe Kopf.
 */
const isNavigation = (kind, token) =>
  kind === 'doku-route' || (kind === 'link' && /\.md($|#)/.test(token))

/** Verzeichnisse, die nie eine Quelle der Wahrheit sind. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.nuxt', '.output', 'dist', '.data', 'coverage',
  'test-results', 'playwright-report', '.claude', '.pnpm-store',
])

/** Dateiendungen, die einen Backtick-Inhalt überhaupt zum Pfad-Kandidaten machen. */
const CODE_EXT = /\.(ts|mts|tsx|vue|mjs|cjs|js|md|json|jsonc|css|scss|ya?ml|sh|sql|toml|txt)$/

const dirNames = dir => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name)

/**
 * Präfixe, unter denen ein verkürzt geschriebener Pfad liegen darf.
 * Reihenfolge egal — es genügt EIN Treffer.
 *
 * JEDER Layer und jede App kommt dazu, weil die Doku ständig aus der Sicht
 * EINES Layers schreibt: „`scripts/generate-themes.ts`" meint
 * `packages/themes/scripts/generate-themes.ts`, „`scripts/og-images.mjs`"
 * meint `apps/marketing/scripts/og-images.mjs`. Ohne diese Präfixe meldete das
 * Skript jede solche Kurzform — und die ist nicht falsch, sondern die übliche
 * Schreibweise in diesem Repo.
 */
const PREFIXES = [
  '', 'packages/', 'apps/', 'docs/',
  ...dirNames('packages').map(name => `packages/${name}/`),
  ...dirNames('apps').map(name => `apps/${name}/`),
]

/** Layer- und App-Namen, wie die Doku sie als Kurzform benutzt („themes/shared/ramp.ts"). */
const LAYER_NAMES = new Set([...dirNames('packages'), ...dirNames('apps')])

/** Zweites Segment einer Kurzform: die Struktur-Ordner eines Layers. */
const LAYER_SUBDIRS = new Set(['server', 'app', 'shared', 'scripts', 'tests', 'i18n', 'e2e', 'schemas', 'public'])

/** Eindeutige Anfänge — hier ist ohne Zweifel ein Repo-Pfad gemeint. */
const ROOT_PREFIXES = ['packages/', 'apps/', 'scripts/', 'docs/', 'ci/', 'ops/', '.github/', './', '../']

/**
 * IST DAS ÜBERHAUPT EIN REPO-PFAD? Diese Frage entscheidet über den Wert des
 * ganzen Skripts.
 *
 * Die Doku ist voller Fragmente, die wie Pfade AUSSEHEN und keine sind:
 * `pages/login.vue` in einer Aufzählung, `users/[id].vue` als Bezeichnung
 * einer Dashboard-Seite, `src/main.js` im Beispiel-Repo eines fremden
 * Projekts. Jedes davon zu melden hieße, das Skript beim ersten Lauf
 * abzuschalten (der erste Entwurf meldete 120 Stellen, davon war eine Handvoll
 * echt). Deshalb zählt nur, was EINDEUTIG auf dieses Repo zeigt:
 *
 *   - ein Pfad ab Repo-Wurzel (`packages/…`, `scripts/…`, `docs/…`), oder
 *   - die gewachsene Layer-Kurzform: bekannter Layer-/App-Name + Struktur-
 *     Ordner (`core/server/…`, `themes/shared/…`) — beide Segmente werden
 *     gegen die WIRKLICHEN Verzeichnisse geprüft, die Liste pflegt sich also
 *     selbst.
 *
 * Alles andere ist Fließtext und geht das Skript nichts an.
 */
function looksLikeRepoPath(token) {
  if (ROOT_PREFIXES.some(prefix => token.startsWith(prefix))) return true
  const [first, second] = token.split('/')
  return LAYER_NAMES.has(first) && LAYER_SUBDIRS.has(second)
}

/**
 * ALLOWLIST — Verweise, die absichtlich ins Nichts zeigen, mit Grund.
 * Jeder Eintrag ist eine Entscheidung, keine Bequemlichkeit.
 */
const ALLOWLIST = [
  // Nicht eingecheckt (gitignored), aber in Betriebsanleitungen unverzichtbar.
  { pattern: /(^|\/)\.env/, why: 'Env-Dateien sind absichtlich nicht im Repo' },
  // Beispiel-/Platzhalterpfade in Anleitungen („lege X an").
  { pattern: /<[^>]+>|\{[^}]+\}|\$\{/, why: 'Platzhalter, kein echter Pfad' },
  // Erzeugte Artefakte, die erst ein Build/Deploy anlegt.
  //
  // ÜBERALL im Pfad, nicht nur am Anfang (CI-Rotlauf 2026-08-03): das
  // Deployment-Runbook nennt `apps/comments/.output/server/index.mjs` — der
  // Artefakt-Ordner liegt dort MITTEN im Pfad. Lokal fiel das nicht auf, weil
  // ein gebautes .output vorhanden war; im frischen CI-Checkout gibt es keins,
  // und das neue Gate meldete prompt einen toten Verweis, der keiner ist.
  { pattern: /(^|\/)(\.output|\.nuxt|dist|releases)\//, why: 'Build-/Deploy-Artefakt, entsteht erst zur Laufzeit' },
]

const allowed = token => ALLOWLIST.find(entry => entry.pattern.test(token))

/** Alle Dateien unter `dir`, die `match` erfüllen. */
function walk(dir, match, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch { return out }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, match, out)
    else if (match(entry.name)) out.push(full)
  }
  return out
}

const exists = (path) => {
  try { statSync(path); return true }
  catch { return false }
}

/**
 * Existiert `token` — als Repo-Pfad, unter einem der PREFIXES oder relativ zur
 * Datei, die ihn nennt? Globs (`*`) werden auf ihr Elternverzeichnis
 * zurückgeführt: ob eine EINZELNE erzeugte Datei da ist, sagt nichts über die
 * Richtigkeit der Angabe.
 */
function resolves(token, fromFile) {
  const clean = token.split('#')[0].split('?')[0].trim()
  if (!clean) return true
  // Bei einem Glob zählt das Verzeichnis, nicht der Treffer: ob EINE erzeugte
  // Datei gerade da ist, sagt nichts über die Richtigkeit der Angabe.
  const globFree = clean.includes('*')
    ? clean.slice(0, clean.indexOf('*')).replace(/\/[^/]*$/, '')
    : clean
  if (!globFree) return true
  const candidates = [
    resolve(dirname(fromFile), globFree),
    ...PREFIXES.map(prefix => resolve(ROOT, prefix + globFree)),
  ]
  return candidates.some(exists)
}

const findings = []
const external = []
const record = (file, line, token, kind) => {
  if (allowed(token)) return
  const rel = relative(ROOT, file)
  // `[[…]]` meint in diesem Repo immer eine Notiz außerhalb — nie ein Fehler.
  if (kind === 'wiki') { external.push({ file: rel, line, token, kind }); return }
  const soft = !STRICT && isProtocol(rel) && !isNavigation(kind, token)
  findings.push({ file: rel, line, token, kind, soft })
}

/**
 * DIE ROUTEN DER DOKU-SITE (`docs/content/**` → admin.pukalani.app/docs).
 *
 * Dort sind interne Links KEINE Dateipfade, sondern Nuxt-Content-Routen
 * (`/architektur/migrationen`). Ein toter Link darin ist besonders teuer: er
 * fällt niemandem beim Schreiben auf, sondern erst dem Leser als 404. Die
 * Route entsteht aus dem Dateinamen ohne Sortier-Präfix (`4.migrationen.md`),
 * `index` fällt weg.
 */
const CONTENT_DIR = join(ROOT, 'docs/content')
const CONTENT_ROUTES = new Set(
  walk(CONTENT_DIR, name => name.endsWith('.md')).map((file) => {
    const segments = relative(CONTENT_DIR, file).replace(/\.md$/, '').split('/')
      .map(segment => segment.replace(/^\d+\./, ''))
    if (segments.at(-1) === 'index') segments.pop()
    return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
  }),
)

/** Durchgang 1+2: Links und Wiki-Verweise. */
function checkLinks(file, text) {
  const isContent = file.startsWith(CONTENT_DIR)
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|tel:|#|\/\/)/.test(target)) continue
      if (target.startsWith('/')) {
        // Absolute Links sind Seiten-Routen, keine Dateipfade. Nur in der
        // Doku-Site lässt sich das prüfen — überall sonst ist es eine URL
        // einer der laufenden Apps und geht dieses Skript nichts an.
        if (isContent && !CONTENT_ROUTES.has(target.split('#')[0].replace(/\/$/, ''))) {
          record(file, index + 1, target, 'doku-route')
        }
        continue
      }
      if (!resolves(target, file)) record(file, index + 1, target, 'link')
    }
    for (const match of line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = match[1].trim()
      // Obsidian-Verweise laufen ohne Endung — beide Formen probieren.
      if (!resolves(target, file) && !resolves(`${target}.md`, file)) {
        record(file, index + 1, target, 'wiki')
      }
    }
  })
}

/**
 * Durchgang 3: Pfad-artige Backtick-Inhalte.
 * Bedingung: enthält `/` UND endet auf eine Code-Endung. Ohne die Endung
 * träfe es jede API-Route (`/api/themes`) und jedes Berechtigungs-Kürzel.
 */
function checkPathTokens(file, text) {
  const lines = text.split('\n')
  let inFence = false
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return }
    if (inFence) return
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim()
      if (!token.includes('/') || !CODE_EXT.test(token.split('#')[0])) continue
      if (/\s/.test(token) || !looksLikeRepoPath(token)) continue
      if (!resolves(token, file)) record(file, index + 1, token, 'pfad')
    }
  })
}

/** Durchgang 3b: dieselbe Prüfung in Kommentarzeilen von Skripten. */
function checkScriptComments(file, text) {
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (!/^\s*(\/\/|\*|\/\*|#)/.test(line)) return
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim()
      if (!token.includes('/') || !CODE_EXT.test(token.split('#')[0])) continue
      if (/\s/.test(token) || !looksLikeRepoPath(token)) continue
      if (!resolves(token, file)) record(file, index + 1, token, 'skript-kommentar')
    }
  })
}

// ---------------------------------------------------------------------------

const markdown = [
  ...walk(join(ROOT, 'docs'), name => name.endsWith('.md')),
  ...['CLAUDE.md', 'AGENTS.md', 'README.md'].map(name => join(ROOT, name)).filter(exists),
]
for (const file of markdown) {
  const text = readFileSync(file, 'utf8')
  checkLinks(file, text)
  checkPathTokens(file, text)
}

const scripts = [
  ...walk(join(ROOT, 'scripts'), name => /\.(mjs|ts|mts)$/.test(name)),
  ...walk(join(ROOT, 'packages'), name => /\.(mjs|mts)$/.test(name)).filter(p => p.includes('/scripts/')),
]
for (const file of scripts) checkScriptComments(file, readFileSync(file, 'utf8'))

// ---------------------------------------------------------------------------
// DOKU-ORDNUNG (Q19, 2026-11-21) — sieben weitere Durchgänge, alle rein lesend.
//
// Die drei Durchgänge oben fragen „zeigt ein Verweis auf etwas, das es gibt?".
// Das fing nicht, woran die Doku im Herbst 2026 wirklich gealtert ist:
//
//   4. PFADE IN BEFEHLEN. Ein Code-Block war bisher ausgenommen. Ein Runbook
//      nannte so dreimal `scp ops/appwrite-upgrade-….sh`, nachdem die Skripte
//      ins Archiv gezogen waren. Geprüft werden Wörter in Code-Blöcken, die
//      EINDEUTIG ein Repo-Pfad sind (ab Wurzel, mit Datei-Endung). Ein Block,
//      der einen gelaufenen Befehl als Protokoll zeigt, sagt das mit einer
//      Kommentarzeile `# Protokoll…` — ab dort wird er nicht mehr gelesen.
//   5. DOKU-PFADE IM FLIESSTEXT UND IM CODE. Der Pfad eines Plans ohne Backticks
//      (so steht er in Hunderten Kopfkommentaren) zog bei einem Umzug ins
//      Archiv nie mit. Gilt für alle Quelldateien und für alle Dokumente, die
//      kein Protokoll sind.
//   6. DIE GEGENRICHTUNG DER KARTE. `docs/README.md` ist der Einstieg; eine
//      Datei, die dort fehlt, wird nicht gefunden oder doppelt angelegt
//      (14 fehlten). Jede Datei der Sorten Steuerung, Referenz, Runbooks und
//      Pläne steht in der Karte — oder in `MAP_EXEMPT` mit Grund.
//   7. PLÄNE SAGEN IHREN STAND. `docs/plans/` enthält nur, was noch nicht
//      (ganz) gebaut ist. Jede Datei dort trägt in den ersten Zeilen
//      `> **Plan-Status (JJJJ-MM-TT):** nicht gebaut | teils gebaut — offen: …
//      | Unterlage zu …`. „gebaut" ohne Rest heißt: ab ins Archiv.
//      Dazu `docs/plans/offen/<KÜRZEL>.md`: Einzelheiten zu einem offenen
//      Punkt — das Kürzel muss als Zeile in `docs/OPEN-ITEMS.md` stehen.
//   8. DAS ARCHIV IST KEINE ARBEITSLISTE: kein offenes Kästchen dort.
//   9. DAS ENTSCHEIDUNGS-PROTOKOLL STEHT IN DATUMSFOLGE (neueste zuerst) —
//      elf Einträge einer Woche standen am Ende der Datei und wurden von
//      niemandem gefunden, der oben las.
//  10. DER RECHTE-KATALOG der Referenz nennt genau die Rechte aus dem Code.
//
// Was hier bewusst NICHT geprüft wird: ob ein Runbook einen alten NAMEN nennt
// (Projekt `control`, `pool`). Runbooks erzählen ihre Geschichte mit, eine
// Wortliste meldete jeden zweiten Absatz; das bleibt eine Durchsicht von Hand.
// ---------------------------------------------------------------------------

const rule = (file, line, token, kind) =>
  findings.push({ file, line, token, kind, soft: false })

/** Ab Wurzel und ohne Kurzform: in einem Befehl ist nur das eindeutig. */
const COMMAND_ROOTS = ['packages/', 'apps/', 'scripts/', 'docs/', 'ci/', 'ops/', '.github/', 'tools/']

/**
 * Dokumente, deren Code-Blöcke keine heutigen Befehle sind: die abgeschlossene
 * Chronik (`GOALS.md` zeigt Pfade aus Phase 1). Die Doku-Site wird mitgeprüft.
 */
const COMMAND_EXEMPT = [/^docs\/GOALS\.md$/]

/** Durchgang 4: Pfade in Code-Blöcken. */
function checkCommandPaths(file, text) {
  const rel = relative(ROOT, file)
  if (isProtocol(rel) || COMMAND_EXEMPT.some(pattern => pattern.test(rel))) return
  let inFence = false
  let history = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; history = false; return }
    if (!inFence || history) return
    if (/^\s*#\s*Protokoll/.test(line)) { history = true; return }
    for (const raw of line.split(/[\s"'`=(),;|<>]+/)) {
      const token = raw.replace(/[.:]+$/, '').replace(/:\d+(-\d+)?$/, '')
      if (!COMMAND_ROOTS.some(prefix => token.startsWith(prefix))) continue
      if (!CODE_EXT.test(token) || allowed(token)) continue
      if (!exists(resolve(ROOT, token.includes('*') ? dirname(token.slice(0, token.indexOf('*') + 1)) : token))) {
        rule(rel, index + 1, token, 'befehl')
      }
    }
  })
}

/** Durchgang 5: `docs/<sorte>/X.md` ohne Backticks, in Doku und Quelltext. */
const DOC_PATH = /(?<![\w./-])docs\/(?:plans|archiv|referenz|runbooks)\/[\w./-]+\.md/g
function checkPlainDocPaths(file, text) {
  const rel = relative(ROOT, file)
  if (isProtocol(rel) && !STRICT) return
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(DOC_PATH)) {
      if (allowed(match[0])) continue
      if (!exists(resolve(ROOT, match[0]))) rule(rel, index + 1, match[0], 'doku-pfad')
    }
  })
}

/**
 * Durchgang 6: Dateien, die bewusst NICHT einzeln in der Karte stehen.
 * Jeder Eintrag ist eine Entscheidung mit Grund.
 */
const MAP_EXEMPT = [
  { pattern: /^docs\/README\.md$/, why: 'die Karte selbst' },
  { pattern: /^docs\/archiv\//, why: 'Archiv: wird über Verweise nachgeschlagen, die Karte beschreibt den Ordner als Ganzes' },
  { pattern: /^docs\/content\//, why: 'Doku-Site: eigene Navigation, eigene Routen-Prüfung (Durchgang 1)' },
  { pattern: /^docs\/plans\/offen\/(?!README\.md$)/, why: 'Einzelheiten je Kürzel: verlinkt aus OPEN-ITEMS.md, geprüft in Durchgang 7' },
]
function checkMapCoverage(docFiles) {
  const mapFile = join(ROOT, 'docs/README.md')
  if (!exists(mapFile)) return
  const linked = new Set()
  for (const match of readFileSync(mapFile, 'utf8').matchAll(/\[[^\]]*\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
    linked.add(relative(ROOT, resolve(dirname(mapFile), match[1])))
  }
  for (const file of docFiles) {
    const rel = relative(ROOT, file)
    if (MAP_EXEMPT.some(entry => entry.pattern.test(rel))) continue
    if (!linked.has(rel)) rule('docs/README.md', 0, rel, 'fehlt-in-karte')
  }
}

/** Durchgang 7: Pläne sagen ihren Stand; Einzelheiten gehören zu einem Kürzel. */
const PLAN_STATUS = /^> \*\*Plan-Status \(\d{4}-\d{2}-\d{2}\):\*\* (nicht gebaut|teils gebaut — offen: \S|Unterlage zu \S|gebaut\b)/m
function checkPlans() {
  const plansDir = join(ROOT, 'docs/plans')
  let names
  try { names = readdirSync(plansDir).filter(name => name.endsWith('.md')) }
  catch { return }
  for (const name of names) {
    const head = readFileSync(join(plansDir, name), 'utf8').split('\n').slice(0, 15).join('\n')
    const match = head.match(PLAN_STATUS)
    if (!match) rule(`docs/plans/${name}`, 1, 'Zeile „> **Plan-Status (JJJJ-MM-TT):** …" fehlt', 'plan-status')
    else if (match[1] === 'gebaut') {
      rule(`docs/plans/${name}`, 1, 'gebaut — gehört nach docs/archiv/', 'plan-status')
    }
  }
  const openItems = join(ROOT, 'docs/OPEN-ITEMS.md')
  const offenDir = join(plansDir, 'offen')
  if (!exists(openItems) || !exists(offenDir)) return
  const codes = new Set([...readFileSync(openItems, 'utf8').matchAll(/^\| ([A-Z][A-Za-z0-9–-]*) \|/gm)].map(m => m[1]))
  for (const name of readdirSync(offenDir).filter(n => n.endsWith('.md') && n !== 'README.md')) {
    if (!codes.has(name.replace(/\.md$/, ''))) {
      rule(`docs/plans/offen/${name}`, 1, 'kein offener Punkt mit diesem Kürzel in docs/OPEN-ITEMS.md', 'einzelheiten')
    }
  }
}

/** Durchgang 8: kein offenes Kästchen im Archiv (Code-Blöcke zeigen Vorlagen). */
function checkArchiveBoxes(file, text) {
  const rel = relative(ROOT, file)
  if (!rel.startsWith('docs/archiv/')) return
  let inFence = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return }
    if (!inFence && /^\s*[-*] \[ \] /.test(line)) rule(rel, index + 1, 'offenes Kästchen', 'archiv-kaestchen')
  })
}

/** Durchgang 9: Überschriften des Entscheidungs-Protokolls, neueste zuerst. */
function checkDecisionOrder() {
  const file = join(ROOT, 'docs/DECISION-LOG.md')
  if (!exists(file)) return
  let previous = null
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const match = line.match(/^## (\d{4}-\d{2}-\d{2})/)
    if (!match) return
    if (previous && match[1] > previous) {
      rule('docs/DECISION-LOG.md', index + 1, `${match[1]} steht unter ${previous}`, 'datumsfolge')
    }
    previous = match[1]
  })
}

/**
 * Durchgang 10: der Rechte-Katalog der Referenz nennt genau die Rechte aus dem
 * Code. „Referenz lebt mit dem Code" war eine Absicht ohne Wächter — die
 * Tabelle stand bei 37, der Code bei 39.
 */
function checkCapabilityCatalog() {
  const sourceFile = join(ROOT, 'packages/core/shared/types/authz.ts')
  const docFile = join(ROOT, 'docs/referenz/RBAC-CONCEPT.md')
  if (!exists(sourceFile) || !exists(docFile)) return
  const source = readFileSync(sourceFile, 'utf8')
  const start = source.indexOf('export type Capability =')
  const end = source.indexOf('\nexport ', start + 1)
  if (start < 0) { rule('packages/core/shared/types/authz.ts', 1, '`export type Capability =` nicht gefunden', 'rechte-katalog'); return }
  const inCode = new Set([...source.slice(start, end < 0 ? undefined : end).matchAll(/^\s+\| '([\w.]+)'/gm)].map(m => m[1]))
  const doc = readFileSync(docFile, 'utf8')
  const from = doc.indexOf('### Capability-Katalog')
  const to = doc.indexOf('\n### ', from + 1)
  const inDoc = new Set([...doc.slice(from, to < 0 ? undefined : to).matchAll(/^\| `([\w.]+)` \|/gm)].map(m => m[1]))
  for (const name of inCode) if (!inDoc.has(name)) rule('docs/referenz/RBAC-CONCEPT.md', 0, `${name} fehlt im Capability-Katalog`, 'rechte-katalog')
  for (const name of inDoc) if (!inCode.has(name)) rule('docs/referenz/RBAC-CONCEPT.md', 0, `${name} gibt es im Code nicht mehr`, 'rechte-katalog')
  const stated = doc.slice(from, to < 0 ? undefined : to).match(/\*\*(\d+) Capabilities/)
  if (stated && Number(stated[1]) !== inCode.size) {
    rule('docs/referenz/RBAC-CONCEPT.md', 0, `nennt ${stated[1]} Capabilities, im Code sind es ${inCode.size}`, 'rechte-katalog')
  }
}

for (const file of markdown) {
  const text = readFileSync(file, 'utf8')
  checkCommandPaths(file, text)
  checkPlainDocPaths(file, text)
  checkArchiveBoxes(file, text)
}
const SOURCE_EXT = /\.(ts|mts|tsx|vue|mjs|cjs|js|sh|conf|ya?ml|html|css)$/
const sources = ['packages', 'apps', 'scripts', 'ops', 'tools', 'ci', '.github']
  .flatMap(dir => walk(join(ROOT, dir), name => SOURCE_EXT.test(name)))
for (const file of sources) checkPlainDocPaths(file, readFileSync(file, 'utf8'))
checkMapCoverage(markdown.filter(file => relative(ROOT, file).startsWith('docs/')))
checkPlans()
checkDecisionOrder()
checkCapabilityCatalog()

const hard = findings.filter(f => !f.soft)
const soft = findings.filter(f => f.soft)

if (AS_JSON) {
  console.log(JSON.stringify({ checked: markdown.length + scripts.length, hard, soft, external }, null, 2))
}
else {
  const show = (label, list) => {
    if (!list.length) return
    console.log(`\n${label} (${list.length}):`)
    for (const f of list) console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.token}`)
  }
  console.log(`Doku-Verweise geprüft: ${markdown.length} Markdown-Dateien + ${scripts.length} Skripte + ${sources.length} Quelldateien (Doku-Pfade)`)
  show('TOTE VERWEISE UND VERSTÖSSE GEGEN DIE DOKU-ORDNUNG', hard)
  show('Protokoll-Dokumente: Pfad-Angaben von damals (Hinweis, kein Fehler — --strict erzwingt sie)', soft)
  show('Notizen außerhalb des Repos ([[…]] — Obsidian-Vault / Claude-Memory, nie prüfbar)', external)
  if (!hard.length) console.log('\nOK — keine toten Verweise, Doku-Ordnung eingehalten.')
}

process.exit(hard.length ? 1 : 0)
