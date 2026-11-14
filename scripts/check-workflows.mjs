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
  /** @type {{ id: string, line: number, hasPermissions: boolean }[]} */
  const jobs = []
  for (let i = jobsStart + 1; i < lines.length; i++) {
    const line = lines[i]
    // Ende des jobs-Blocks: die nächste Zeile ohne Einrückung, die kein Kommentar ist.
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const job = /^ {2}([\w-]+):\s*$/.exec(line)
    if (job) {
      jobs.push({ id: job[1], line: i + 1, hasPermissions: false })
      continue
    }
    if (jobs.length && /^ {4}permissions:/.test(line)) {
      jobs[jobs.length - 1].hasPermissions = true
    }
  }
  if (!jobs.length) findings.push(`${name} — im „jobs:"-Block wurde kein Job erkannt (Einrückung?)`)
  for (const job of jobs) {
    if (!job.hasPermissions) {
      findings.push(`${name}:${job.line} — Job „${job.id}" nennt keine eigenen Rechte („permissions:" fehlt)`)
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
  console.log(`✔ check:workflows — ${files.length} Workflows: jede Action über einen Commit, Rechte je Job.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
