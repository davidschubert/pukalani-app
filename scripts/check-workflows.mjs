/**
 * Wächter für `.github/workflows/*.yml` (SEC-041).
 *
 * Warum es das gibt: ein Workflow ist Code, der mit den Rechten des Repos
 * läuft — und zwei seiner Eigenschaften sieht weder Typecheck noch Lint noch
 * ein Test:
 *
 *   1. FREMDE ACTIONS ÜBER EIN TAG. `uses: actions/checkout@v7` meint „was
 *      auch immer heute hinter v7 liegt". Ein Tag lässt sich umhängen; der
 *      Lauf holt dann anderen Code, ohne dass sich hier eine Zeile ändert.
 *      Regel: jede fremde Action nennt den COMMIT (40 Hex-Zeichen) und die
 *      Version als Kommentar dahinter:
 *        uses: actions/checkout@<commit> # v7.0.1
 *      Aktuell hält sie Dependabot (`.github/dependabot.yml`, Ökosystem
 *      `github-actions`): es hebt Commit UND Kommentar gemeinsam.
 *
 *   2. RECHTE, DIE NIEMAND GEWÄHLT HAT. Rechte auf Workflow-Ebene erbt jeder
 *      Job, auch der, der später dazukommt. Regel: auf Workflow-Ebene steht
 *      `permissions: {}`, und JEDER Job nennt seine eigenen — ein neuer Job
 *      ohne Angabe hat damit keine, statt still die der Nachbarn.
 *
 *   3. EIN SECRET, DAS JEDER ZWEIG LESEN KANN (SEC-041). Ein Secret auf
 *      Repo-Ebene bekommt jeder Workflow auf jedem Zweig — auch einer, den
 *      jemand nur zum Auslesen anlegt. Regel: ein Job, der `secrets.…` liest,
 *      nennt eine UMGEBUNG (`environment:`). Die Umgebungen `production` und
 *      `production-watch` lassen nur den Zweig `main` zu; dort liegen die
 *      Secrets. (`github.token` ist kein Secret in diesem Sinn.)
 *
 *   4. FREMDER CODE NEBEN EINEM SECRET (SEC-042). Ein Job mit Umgebung
 *      installiert und baut nichts: kein `pnpm`, `npm`, `npx`, `yarn`. Was
 *      beim Installieren oder Bauen läuft (Werkzeuge, Module, deren
 *      Abhängigkeiten), könnte sonst den Schlüssel lesen. Gebaut wird in
 *      einem Job OHNE Umgebung, das Ergebnis reist als Artefakt weiter.
 *      Eigene Skripte ohne Abhängigkeiten (`node scripts/ops/…`) sind erlaubt.
 *
 *   5. EINE VARIABLE IM ÖFFENTLICHEN PROTOKOLL (SEC-043). GitHub druckt das
 *      `env:` jedes Schritts in den Kopf des Protokolls, und das Protokoll
 *      eines öffentlichen Repos liest jedes GitHub-Konto. Ein Secret erscheint
 *      dort als `***`, eine `vars.*`-Variable im Klartext. Die Empfänger-
 *      Adresse des Alarms stand so in jedem Lauf, der eine Mail schickte.
 *      Regel: kein `vars.` in einem Workflow — was ein Lauf von außen
 *      braucht, ist ein Secret in einer Umgebung.
 *
 * Bewusst zeilenweise statt mit einem YAML-Parser: das Repo hat keinen als
 * direkte Abhängigkeit, und die Workflows sind einheitlich eingerückt (zwei
 * Leerzeichen je Ebene). Eine Datei, die davon abweicht, fällt hier als
 * „Job ohne Rechte" auf — also laut, nicht still.
 *
 * Aufruf: `pnpm check:workflows` (läuft mit `pnpm lint:scripts`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = join(ROOT, '.github', 'workflows')

/** `uses: owner/repo[/pfad]@<40 hex> # v1.2.3` — nichts sonst gilt als fest. */
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/

/** Paket-Werkzeuge und die Action, die eines einrichtet — in einem Job mit Umgebung tabu. */
const INSTALLS = /(?:^|[\s"'`(;&|])(?:pnpm|npm|npx|yarn)(?:\s|$)|pnpm\/action-setup/

/**
 * Prüft EINEN Workflow. Rein (Text rein, Befunde raus), damit der Test ohne
 * Dateisystem auskommt.
 * @param {string} name Dateiname, nur für die Meldung
 * @param {string} text Inhalt der Datei
 * @returns {string[]} Befunde, leer = in Ordnung
 */
export function checkWorkflow(name, text) {
  const findings = []
  const lines = text.split('\n')

  // ── 1. Fremde Actions ──────────────────────────────────────────────────
  lines.forEach((line, index) => {
    const match = /^\s*(?:-\s+)?uses:\s*(.+)$/.exec(line)
    if (!match) return
    const target = match[1].trim()
    // Eigene Actions und wiederverwendbare Workflows aus DIESEM Repo liegen
    // im selben Commit wie der Aufrufer — da gibt es nichts festzunageln.
    if (target.startsWith('./')) return
    if (!PINNED.test(target)) {
      findings.push(`${name}:${index + 1} — Action nicht über einen Commit eingebunden: „${target}" (erwartet: owner/repo@<40 Hex> # vX.Y.Z)`)
    }
  })

  // ── 1b. Keine Variablen (ihr Wert stünde im öffentlichen Protokoll) ────
  lines.forEach((line, index) => {
    if (/^\s*#/.test(line)) return
    if (/\$\{\{[^}]*\bvars\.[A-Za-z_]/.test(line)) {
      findings.push(`${name}:${index + 1} — „vars.…" im Workflow: der Wert erscheint im Klartext im öffentlichen Protokoll (als Secret in einer Umgebung ablegen)`)
    }
  })

  // ── 2. Rechte auf Workflow-Ebene ───────────────────────────────────────
  const topLevel = lines.filter(line => /^permissions:/.test(line))
  if (topLevel.length !== 1 || topLevel[0].trim() !== 'permissions: {}') {
    findings.push(`${name} — auf Workflow-Ebene muss genau „permissions: {}" stehen (gefunden: ${topLevel.length ? `„${topLevel[0].trim()}"` : 'nichts'})`)
  }

  // ── 3. Rechte je Job ───────────────────────────────────────────────────
  const jobsStart = lines.findIndex(line => /^jobs:\s*$/.test(line))
  if (jobsStart === -1) {
    findings.push(`${name} — kein „jobs:"-Block gefunden`)
    return findings
  }
  /** @type {{ id: string, line: number, hasPermissions: boolean, hasEnvironment: boolean, secretLines: number[], installLines: number[] }[]} */
  const jobs = []
  for (let i = jobsStart + 1; i < lines.length; i++) {
    const line = lines[i]
    // Ende des jobs-Blocks: die nächste Zeile ohne Einrückung, die kein Kommentar ist.
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const job = /^ {2}([\w-]+):\s*$/.exec(line)
    if (job) {
      jobs.push({ id: job[1], line: i + 1, hasPermissions: false, hasEnvironment: false, secretLines: [], installLines: [] })
      continue
    }
    if (!jobs.length) continue
    const current = jobs[jobs.length - 1]
    if (/^ {4}permissions:/.test(line)) current.hasPermissions = true
    if (/^ {4}environment:/.test(line)) current.hasEnvironment = true
    // Kommentare zählen nicht — dort darf stehen, was der Job NICHT tut.
    if (/^\s*#/.test(line)) continue
    if (/\bsecrets\.[A-Za-z_]/.test(line)) current.secretLines.push(i + 1)
    if (INSTALLS.test(line)) current.installLines.push(i + 1)
  }
  if (!jobs.length) findings.push(`${name} — im „jobs:"-Block wurde kein Job erkannt (Einrückung?)`)
  for (const job of jobs) {
    if (!job.hasPermissions) {
      findings.push(`${name}:${job.line} — Job „${job.id}" nennt keine eigenen Rechte („permissions:" fehlt)`)
    }
    if (job.secretLines.length && !job.hasEnvironment) {
      findings.push(`${name}:${job.secretLines[0]} — Job „${job.id}" liest ein Secret ohne Umgebung („environment:" fehlt — das Secret gälte für jeden Zweig)`)
    }
    if (job.hasEnvironment && job.installLines.length) {
      findings.push(`${name}:${job.installLines[0]} — Job „${job.id}" hat eine Umgebung (Secrets) und installiert oder baut — das gehört in einen Job ohne Umgebung`)
    }
  }

  return findings
}

function main() {
  const files = readdirSync(WORKFLOWS).filter(file => /\.ya?ml$/.test(file)).sort()
  const findings = files.flatMap(file => checkWorkflow(file, readFileSync(join(WORKFLOWS, file), 'utf8')))
  if (findings.length) {
    console.error(`✖ check:workflows — ${findings.length} Befund(e):\n`)
    for (const finding of findings) console.error(`  ${finding}`)
    console.error('\nRegel und Begründung: Kopf von scripts/check-workflows.mjs')
    process.exit(1)
  }
  console.log(`✔ check:workflows — ${files.length} Workflows: jede Action über einen Commit, Rechte je Job, Secrets nur mit Umgebung, kein Installieren neben einem Secret, keine Variablen.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
