import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { RunnerApi } from './api.ts'
import { clampRun, type ClampDecision } from './clamp.ts'
import type { RepoRule, RunnerConfig } from './config.ts'
import { EventPump, FLUSH_AT_EVENTS } from './events.ts'
import { buildPromptFile, downloadAttachments } from './files.ts'
import { buildCommitMessage, commitWorktree, currentBranch } from './git.ts'
import { childEnv, hasShellSyntax, lastLines, runCommand } from './exec.ts'
import {
  buildHookScript,
  buildHookSettings,
  buildInteractiveArgs,
  buildWrapperScript,
  interactiveRunName,
} from './interactive.ts'
import { log } from './log.ts'
import { buildNotificationArgs, showNotification } from './notify.ts'
import { isSafeRunId, type RunFinalStatus, type RunPayload } from './protocol.ts'
import { buildResultJson, type RunReport, type TestOutcome } from './result.ts'
import { decideTestCommands, type AllowedTestCommand } from './testCommands.ts'
import {
  condenseStreamLine,
  deriveFinalStatus,
  isPostTurnSummary,
  readResultLine,
  summaryStatusCategory,
  truncate,
  type ResultSummary,
} from './stream.ts'

/**
 * EIN Lauf, von der Claim-Antwort bis zum `finish` — docs/plans/AI-RUNNER.md
 * § 7.2.
 *
 * DIE LEITREGEL DIESER DATEI: ein Lauf darf nie stumm hängen bleiben. Jeder
 * Weg hier hinaus endet in genau EINEM `finish` — auch der unerwartete Fehler,
 * auch der Abbruch, auch die Zeitüberschreitung. Die einzige Ausnahme ist ein
 * Daemon, der KOMPLETT stirbt (kill -9, Stromausfall); dann steht der Lauf auf
 * `running`, und die Kur ist der Abbrechen-Knopf im Board (README).
 */

/** Ein Fehlschlag mit einem Kurz-Code, wie ihn `runs.error` trägt. */
class RunFailure extends Error {
  override name = 'RunFailure'
  code: string

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

export interface RunContext {
  api: RunnerApi
  config: RunnerConfig
  /** Setzt der Daemon bei SIGINT/SIGTERM — der Lauf beendet sich dann selbst */
  shutdownRequested: () => boolean
}

/** Wie oft die Wache nach Abbruch/Herunterfahren sieht. */
const WATCHDOG_MS = 500
/** Frist zwischen SIGTERM und SIGKILL. */
const KILL_GRACE_MS = 10_000
/** Höchstens so viele stderr-Zeilen als Ereignis — der Rest steht im Transkript. */
const MAX_STDERR_EVENTS = 50
/** Serverseitiger Deckel für das Transkript (`transcript.post.ts`). */
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024

export async function executeRun(ctx: RunContext, run: RunPayload): Promise<void> {
  /**
   * SCHRITT 0: die Lauf-Id prüfen, BEVOR sie in einen Pfad (`runs/<id>`),
   * einen Worktree-Namen (`ai-<id>`) oder eine Naht-URL geht. Eine Id, die
   * das nicht besteht, bekommt KEINEN Aufruf, keinen Ordner, keinen Prozess —
   * auch kein `finish`, denn dessen URL trüge dieselbe Id.
   *
   * BEWUSSTE AUSNAHME von „jeder Weg endet in genau einem finish": der Lauf
   * bleibt serverseitig auf `claimed` stehen. Die Kur ist dieselbe wie beim
   * gestorbenen Daemon — der Abbrechen-Knopf im Board.
   */
  // `unknown`: der Typ sagt string, die Naht garantiert es nicht.
  const rawId: unknown = run.$id
  if (!isSafeRunId(rawId)) {
    const shown = typeof rawId === 'string' ? JSON.stringify(rawId.slice(0, 40)) : typeof rawId
    log.error(`Lauf mit unzulässiger Id ${shown} übernommen — wird nicht ausgeführt (im Board abbrechen)`)
    return
  }

  /**
   * SCHRITT 1 (§ 7.2): die Session-Id wird VOR dem Start gewürfelt und SOFORT
   * gemeldet. Damit kennt das Ticket seine Session ab Sekunde null, und
   * `--resume` trägt auch dann noch, wenn der Runner mittendrin abstürzt.
   *
   * AUSNAHME FORTSETZUNG (§ 9): ein `--resume`-Lauf würfelt NICHTS — er knüpft
   * an `run.resumeSessionId` an, und seine eigene (neue) Session kennt erst das
   * Abschluss-JSON. Bis dahin bleibt `sessionId` '' und reist nicht mit; danach
   * setzt `performRun` sie über den `setSessionId`-Haken nach.
   */
  let sessionId = run.resumeSessionId ? '' : randomUUID()
  const startedAt = Date.now()
  const pump = new EventPump(ctx.api, run.$id, sessionId)
  let workBranch = ''
  let finished = false

  const finish = async (status: RunFinalStatus, error: string, resultJson: string): Promise<void> => {
    if (finished) return
    finished = true
    await pump.drain().catch(() => {})
    try {
      await ctx.api.finish(run.$id, {
        status,
        error: truncate(error, 2000),
        resultJson,
        // Bei einer Fortsetzung erst am Ende bekannt (§ 9); ein leerer Wert
        // reist nicht mit (er fiele durch die uuid-Prüfung des Servers).
        ...(sessionId ? { sessionId } : {}),
        ...(workBranch ? { workBranch } : {}),
      })
      log.info(`Lauf ${run.$id} beendet: ${status}${error ? ` (${error})` : ''}`)
    }
    catch (apiError) {
      // Mehr als „best effort" geht hier nicht: der Lauf ist gelaufen, die
      // Naht ist weg. Das Board zeigt ihn weiter als laufend, bis jemand
      // abbricht — genau die Grenze, die im README steht.
      log.error(`Abschluss für ${run.$id} konnte nicht gemeldet werden: ${(apiError as Error).message}`)
    }

    /**
     * Native macOS-Mitteilung (opt-out via config). Sie hängt NICHT am Erfolg
     * der Naht oben — der Mensch am Mac soll es auch dann erfahren, wenn der
     * `finish`-Call scheiterte. `buildNotificationArgs` gibt für `cancelled`
     * bewusst `null` (der Abbrechende weiß es schon).
     */
    if (ctx.config.macosNotifications) {
      const args = buildNotificationArgs({
        status,
        promptSource: run.promptSource,
        subjectType: run.subjectType,
        subjectId: run.subjectId,
      })
      if (args) showNotification(args)
    }
  }

  pump.start()
  pump.status('Lauf angenommen')
  // Erstes Bündel sofort: es trägt die Session-Id und hebt den Lauf
  // serverseitig von `claimed` auf `running`.
  await pump.flush()

  try {
    await performRun(ctx, run, pump, sessionId, startedAt, {
      setWorkBranch: (branch) => {
        workBranch = branch
        pump.setWorkBranch(branch)
      },
      // Die NEUE Session einer Fortsetzung (§ 9): sie fließt in den `finish`
      // (der Server stempelt sie als Erst-Wert) und in spätere Ereignis-Bündel.
      setSessionId: (id) => {
        sessionId = id
        pump.setSessionId(id)
      },
      finish,
    })
  }
  catch (error) {
    if (error instanceof RunFailure) {
      pump.error(error.message)
      await finish('failed', error.code, '')
    }
    else {
      const message = truncate((error as Error).message || String(error), 2000)
      pump.error(message)
      await finish('failed', message, '')
    }
  }
  finally {
    pump.stop()
  }
}

interface RunHooks {
  setWorkBranch: (branch: string) => void
  setSessionId: (sessionId: string) => void
  finish: (status: RunFinalStatus, error: string, resultJson: string) => Promise<void>
}

async function performRun(
  ctx: RunContext,
  run: RunPayload,
  pump: EventPump,
  sessionId: string,
  startedAt: number,
  hooks: RunHooks,
): Promise<void> {
  /**
   * SCHRITT 2: den `repoKey` gegen die LOKALE Allowlist auflösen (§ 8.1). Ein
   * Pfad aus der Naht wird NIE angenommen — es reist auch keiner.
   */
  const repo = ctx.config.repos[run.repoKey]
  if (!repo) {
    pump.error(`Unbekannter Repo-Schlüssel „${run.repoKey}" — dieser Rechner kennt: ${Object.keys(ctx.config.repos).join(', ')}`)
    throw new RunFailure('unknown_repo_key')
  }

  /**
   * Die Spalte `executor` trägt heute nur `'claude-code'` (§ 2) — sie existiert,
   * damit ein zweiter Agent später keine Migration kostet. Ein FREMDER Wert
   * darf hier trotzdem nicht durchrutschen: dieser Daemon kann genau eine CLI
   * starten, und still die falsche zu nehmen wäre schlimmer als ein Fehlschlag.
   */
  if (run.executor && run.executor !== 'claude-code') {
    pump.error(`Dieser Runner kann nur „claude-code" ausführen, verlangt war „${run.executor}"`)
    throw new RunFailure('unsupported_executor')
  }

  // SCHRITT 3: kappen. Stilles Herunterstufen mit je einer Ereigniszeile.
  const decision = clampRun({
    requestedMode: run.permissionMode,
    requestedModel: run.model,
    requestedBudgetUsd: run.maxBudgetUsd,
    // STRIKT: nur das boolesche `true` gilt als geprüft — ein fehlendes oder
    // verdrehtes Feld aus der Naht ist „ungeprüft", nie „geprüft".
    promptTrusted: run.promptTrusted === true,
  }, repo)
  for (const note of decision.notes) pump.status(note)
  if (decision.rejection) {
    pump.error(decision.rejection.message)
    throw new RunFailure(decision.rejection.code)
  }
  pump.status(`Repo „${repo.key}", Modus ${decision.mode}, Budget ${decision.budgetUsd} USD`)

  /**
   * SCHRITT 3b (SEC-037): Testbefehle gegen die LOKALE Liste entscheiden —
   * HIER, vor Material und Agent, damit ein abgelehnter Auftrag nichts
   * startet, nichts lädt und kein Budget kostet. Abgelehnt wird der GANZE
   * Auftrag, nicht nur der eine Befehl (Begründung in testCommands.ts).
   */
  const testDecision = decideTestCommands({
    raw: run.testCommands,
    promptTrusted: run.promptTrusted === true,
    allowed: repo.allowedTestCommands,
    repoKey: repo.key,
  })
  if (!testDecision.ok) {
    pump.error(testDecision.message)
    log.warn(`Lauf ${run.$id} abgelehnt (${testDecision.code}): ${testDecision.message}`)
    throw new RunFailure(testDecision.code)
  }
  const testCommands = testDecision.commands
  if (testCommands.length) {
    pump.status(`${testCommands.length} Testbefehl${testCommands.length === 1 ? '' : 'e'} aus der lokalen Liste freigegeben`)
  }

  // SCHRITT 4: Material holen (§ 6).
  const runDir = join(ctx.config.stateDir, 'runs', run.$id)
  const filesDir = join(runDir, 'files')
  await mkdir(filesDir, { recursive: true })

  const { attachments } = await ctx.api.listAttachments(run.$id)
  const downloaded = attachments.length
    ? await downloadAttachments(ctx.api, run.$id, attachments, filesDir)
    : []
  if (downloaded.length) pump.status(`${downloaded.length} Anhänge geladen`)

  const promptPath = join(runDir, 'prompt.md')
  await writeFile(promptPath, buildPromptFile(run.promptSource, downloaded.map(entry => entry.path), {
    // § 8.2: ungeprüfter Text wird als Zitat gerahmt (files.ts).
    trusted: run.promptTrusted === true,
  }), 'utf8')

  // SCHRITT 5: starten. Der Worktree kommt von der CLI, nicht von uns (§ 11).
  const worktreeName = `ai-${run.$id}`

  /**
   * § 7.3: ein interaktiver Lauf geht einen ganz anderen Weg — Terminal.app
   * statt headless-Pipe. Er verzweigt HIER, nachdem Material und Kappung stehen
   * (die gelten für beide Wege gleich), und kehrt danach zurück. Eine
   * Fortsetzung (`--resume`) ist nie interaktiv (die Route setzt interactive
   * false), die beiden Zweige schließen sich also aus.
   */
  if (run.interactive) {
    await performInteractiveRun(ctx, run, pump, {
      sessionId, startedAt, decision, promptPath, filesDir, worktreeName, runDir, repo, hooks, testCommands,
    })
    return
  }

  if (run.resumeSessionId) pump.status(`Fortsetzung von Session ${run.resumeSessionId} (--resume)`)
  const args = buildAgentArgs({
    resumeSessionId: run.resumeSessionId,
    sessionId,
    model: decision.model,
    mode: decision.mode,
    worktreeName,
    filesDir,
    budgetUsd: decision.budgetUsd,
    reference: `Referenz: Lauf ${run.$id} zu ${run.subjectType} ${run.subjectId}. Ticket-Bezug siehe prompt.`,
  })

  log.info(`Starte ${ctx.config.claudeBin} für Lauf ${run.$id} in ${repo.path}`)
  const child = spawn(ctx.config.claudeBin, args, {
    cwd: repo.path,
    stdio: ['pipe', 'pipe', 'pipe'],
    // claude startet selbst Kinder (node, git, Bash-Werkzeug) — unter launchd
    // erben die sonst denselben kargen PATH, an dem die Testbefehle des
    // ersten Prod-Laufs gescheitert sind (childEnv in exec.ts).
    env: withClaudeToken(childEnv(runPathPrefix(ctx.config)), ctx.config.claudeTokenFile),
  })

  /**
   * DER PROMPT GEHT ÜBER STDIN, nicht als Argument. Zwei Gründe: die Länge
   * (`promptSource` darf 200 000 Zeichen haben — die Argumentliste eines
   * Prozesses darf das nicht) und das Zitieren (ein Auftragstext kann alles
   * enthalten, auch Anführungszeichen und Zeilenumbrüche).
   */
  const promptText = await readFile(promptPath, 'utf8')
  child.stdin.on('error', () => {})
  child.stdin.write(promptText)
  child.stdin.end()

  const transcriptPath = join(runDir, 'transcript.jsonl')
  const transcript = createWriteStream(transcriptPath, { flags: 'w' })

  /**
   * Der veränderliche Zustand des Mitlesens — BEWUSST EIN OBJEKT und keine
   * losen `let`-Variablen. Grund ist die Fluss-Analyse von TypeScript: ein
   * `let x: T | null = null`, das nur in einem Callback beschrieben wird, gilt
   * an der Leseseite weiter als `null` (bekannte Grenze, gemessen: „Property
   * 'costUsd' does not exist on type 'never'"). Der Bericht hätte dann nie
   * Kosten, Turns oder Verweigerungen gesehen — und zwar ohne dass irgendwo
   * ein Fehler stünde. Ein Feld eines annotierten Objekts behält seinen
   * deklarierten Typ.
   */
  const state: {
    summary: ResultSummary | null
    blocked: boolean
    brokenLines: number
    stderrEvents: number
    stderrTail: string
    timedOut: boolean
    cancelled: boolean
    shutdown: boolean
    killing: boolean
  } = {
    summary: null,
    blocked: false,
    brokenLines: 0,
    stderrEvents: 0,
    stderrTail: '',
    timedOut: false,
    cancelled: false,
    shutdown: false,
    killing: false,
  }

  const kill = () => {
    if (state.killing) return
    state.killing = true
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref?.()
  }

  const timeoutMs = ctx.config.maxRunMinutes * 60_000
  const timeoutTimer = setTimeout(() => {
    state.timedOut = true
    pump.error(`Zeitüberschreitung nach ${ctx.config.maxRunMinutes} min — der Lauf wird beendet`)
    kill()
  }, timeoutMs)
  timeoutTimer.unref?.()

  // Die Wache: sie liest den Rückkanal des Boards (§ 9) und das
  // Herunterfahren des Daemons. Beides endet in demselben SIGTERM/SIGKILL.
  const watchdog = setInterval(() => {
    if (state.killing) return
    if (pump.cancelled) {
      state.cancelled = true
      pump.status('Vom Board abgebrochen — der Agent wird beendet')
      kill()
      return
    }
    if (ctx.shutdownRequested()) {
      state.shutdown = true
      kill()
    }
  }, WATCHDOG_MS)
  watchdog.unref?.()

  const readStdout = (async () => {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (!line.trim()) continue
      transcript.write(`${line}\n`)

      let value: unknown
      try {
        value = JSON.parse(line)
      }
      catch {
        // Kaputte Zeile: zählen, nicht daran sterben. Sie steht im Transkript.
        state.brokenLines++
        continue
      }

      const result = readResultLine(value)
      if (result) state.summary = result
      // § 11: `status_category: 'blocked'` ist die EINE Quelle, die ein
      // freundliches „success" als das entlarvt, was es ist.
      if (isPostTurnSummary(value) && summaryStatusCategory(value) === 'blocked') state.blocked = true

      for (const draft of condenseStreamLine(value)) pump.push(draft)
      if (pump.pending >= FLUSH_AT_EVENTS) void pump.flush()
    }
  })()

  const readStderr = (async () => {
    for await (const line of createInterface({ input: child.stderr, crlfDelay: Infinity })) {
      if (!line.trim()) continue
      transcript.write(`${JSON.stringify({ type: 'runner_stderr', line })}\n`)
      state.stderrTail = `${state.stderrTail}${line}\n`.slice(-4000)
      if (state.stderrEvents < MAX_STDERR_EVENTS) {
        state.stderrEvents++
        pump.error(truncate(line, 4000))
      }
    }
  })()

  const exit = await new Promise<{ code: number, spawnError: string }>((resolve) => {
    child.on('error', error => resolve({ code: 127, spawnError: error.message }))
    child.on('close', code => resolve({ code: code ?? -1, spawnError: '' }))
  })
  clearTimeout(timeoutTimer)
  clearInterval(watchdog)
  await Promise.all([readStdout, readStderr])
  await new Promise<void>(resolve => transcript.end(resolve))
  await pump.flush()

  if (exit.spawnError) {
    pump.error(`Agent konnte nicht gestartet werden: ${exit.spawnError}`)
    throw new RunFailure('spawn_failed', exit.spawnError)
  }
  if (state.brokenLines) pump.status(`${state.brokenLines} unlesbare Protokollzeilen übersprungen`)

  // SIGINT/SIGTERM am Daemon: der Lauf wird als Fehlschlag geschlossen,
  // damit er nicht als „läuft" zurückbleibt.
  if (state.shutdown) throw new RunFailure('runner_shutdown')

  /**
   * § 9: eine Fortsetzung (`--resume`) hat keine vorab gewürfelte Session — sie
   * erfährt ihre NEUE Session erst JETZT, aus dem Abschluss-JSON. Ab hier kennt
   * der Lauf sie: für die Commit-Nachricht, den `finish` (Server stempelt sie)
   * und spätere Ereignis-Bündel. Kam keine (kaputte Abschluss-Zeile), bleibt es
   * bei '' — der Bericht trägt dann keine Session, aber der Lauf schließt sauber.
   */
  let effectiveSessionId = sessionId
  if (run.resumeSessionId && state.summary?.sessionId) {
    effectiveSessionId = state.summary.sessionId
    hooks.setSessionId(effectiveSessionId)
  }

  const durationMs = Date.now() - startedAt
  const outcome = deriveFinalStatus({
    timedOut: state.timedOut,
    cancelled: state.cancelled,
    sawResult: state.summary !== null,
    isError: state.summary?.isError ?? false,
    exitCode: exit.code,
    denials: state.summary?.denials ?? [],
    blocked: state.blocked,
  })

  /**
   * ABGEBROCHEN heisst: niemand will dieses Ergebnis mehr. Es wird deshalb
   * NICHT committet und es laufen keine Tests — die Arbeit liegt im Worktree
   * und kann von Hand angesehen werden.
   */
  if (outcome.status === 'cancelled') {
    await hooks.finish('cancelled', '', buildResultJson(emptyReport(durationMs, state.summary)))
    return
  }

  // Verweigerte Berechtigungen, aber trotzdem fertig geworden (§ 11, Verfeinerung
  // 2026-08-18): deriveFinalStatus hat NICHT blockiert. Die Information darf
  // trotzdem nicht verschwinden — eine Ereigniszeile in der Zeitleiste, die Zahl
  // steht zusätzlich im Bericht (`permissionDenials`).
  const denialCount = state.summary?.denials.length ?? 0
  if (outcome.status === 'succeeded' && denialCount) {
    pump.status(`${denialCount} Berechtigung${denialCount === 1 ? '' : 'en'} verweigert — trotzdem fertig geworden`)
  }

  // SCHRITT 8: der Runner committet selbst (§ 11 — `acceptEdits` erlaubt kein
  // `git commit`).
  const worktree = join(repo.path, '.claude', 'worktrees', worktreeName)
  let branch = ''
  let commit = ''
  let diffstat = ''

  if (existsSync(worktree)) {
    branch = await currentBranch(worktree)
    /**
     * NIE AUF EINEM GESCHÜTZTEN BRANCH (§ 8.1). Der Worktree sollte hier gar
     * nicht stehen können — aber „sollte nicht" ist keine Sicherung, und der
     * Preis eines `git add -A` auf `main` wäre ein Commit in Davids
     * Hauptzweig, den niemand bestellt hat.
     */
    if (branch && repo.protectedBranches.includes(branch)) {
      pump.error(`Worktree steht auf geschütztem Branch „${branch}" — es wird nichts committet`)
      throw new RunFailure('protected_branch')
    }
    hooks.setWorkBranch(branch)

    const facts = await commitWorktree(worktree, buildCommitMessage({
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      runId: run.$id,
      sessionId: effectiveSessionId,
    }))
    commit = facts.commit
    diffstat = facts.diffstat
    pump.status(facts.committed
      ? `Committet auf ${facts.branch}: ${facts.diffstat || 'ohne Statistik'}`
      : 'Keine Änderungen im Worktree — nichts committet')
  }
  else {
    pump.status('Kein Worktree angelegt — nichts zu committen')
  }

  // SCHRITT 7 (nach dem Commit, damit die Tests den committeten Stand sehen):
  // Testbefehle. Ein Fehlschlag bricht die Kette NICHT ab — der Bericht soll
  // alle Ergebnisse zeigen, nicht nur bis zum ersten Roten.
  const tests = existsSync(worktree) && !state.timedOut
    ? await runTestCommands(testCommands, worktree, ctx.config, pump)
    : []

  // SCHRITT 9: Transkript hochladen, dann `finish`.
  const transcriptFileId = await uploadTranscript(ctx.api, run.$id, transcriptPath, pump)

  const report: RunReport = {
    branch,
    commit,
    diffstat,
    tests,
    durationMs: Date.now() - startedAt,
    costUsd: state.summary?.costUsd ?? 0,
    numTurns: state.summary?.numTurns ?? 0,
    // Das GEKLEMMTE Modell, nicht run.model (siehe RunReport.model).
    model: decision.model,
    transcriptFileId,
    workBranch: branch,
    permissionDenials: denialCount,
  }

  const error = outcome.error || (state.stderrTail && outcome.status === 'failed' ? lastLines(state.stderrTail, 5) : '')
  await hooks.finish(outcome.status, error, buildResultJson(report))
}

/**
 * Sicherheitsnetz gegen einen für immer wartenden Daemon (§ 7.3): fällt der
 * SessionEnd-Hook aus (David schließt das Fenster hart, statt die Sitzung zu
 * beenden), pollt der Runner nicht endlos. Grosszügig, weil eine beobachtete
 * Sitzung lange dauern darf — aber nicht unbegrenzt.
 */
const INTERACTIVE_MAX_MS = 8 * 60 * 60_000

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface InteractiveContext {
  sessionId: string
  startedAt: number
  decision: ClampDecision
  promptPath: string
  filesDir: string
  worktreeName: string
  runDir: string
  repo: RepoRule
  hooks: RunHooks
  /** Die in performRun ENTSCHIEDENE Liste (testCommands.ts) — nie neu aus der Naht gelesen */
  testCommands: AllowedTestCommand[]
}

/**
 * Der INTERAKTIVE Lauf (§ 7.3) — Terminal.app statt headless-Pipe.
 *
 * Der Runner baut Hook, Settings und Wrapper (alle drei PUR gebaut, hier nur
 * geschrieben), öffnet mit `open -a Terminal` ein Fenster mit dem fertigen
 * `claude`-Befehl OHNE `-p` und hebt den Lauf sofort auf `running`. Danach
 * WARTET er: kein Elternprozess liest mit, also erfährt er das Ende über den
 * SessionEnd-Hook (→ `POST …/session-end`), den er per Poll abfragt. Commit,
 * Tests und Abschluss macht der Daemon danach — genau wie im headless Fall.
 *
 * GRENZE, EHRLICH (§ 7.3): „Abbrechen" vom Board beendet das offene Terminal
 * NICHT (es hängt an keinem Prozess, den der Runner hält). Der Poll erkennt den
 * Abbruch am Status und HÖRT AUF zu warten — committet dann aber nichts.
 */
async function performInteractiveRun(ctx: RunContext, run: RunPayload, pump: EventPump, ictx: InteractiveContext): Promise<void> {
  const { sessionId, startedAt, decision, promptPath, filesDir, worktreeName, runDir, repo, hooks, testCommands } = ictx

  // Hook, Settings, Wrapper schreiben (Bau ist pur — interactive.ts).
  const hookPath = join(runDir, 'session-end-hook.sh')
  const settingsPath = join(runDir, 'settings.json')
  const wrapperPath = join(runDir, 'interactive.sh')

  await writeFile(hookPath, buildHookScript({
    endpoint: ctx.config.endpoint,
    runId: run.$id,
    secretFile: ctx.config.secretFile,
  }), { mode: 0o700 })
  await writeFile(settingsPath, JSON.stringify(buildHookSettings(hookPath), null, 2), 'utf8')

  const agentArgs = buildInteractiveArgs({
    sessionId,
    model: decision.model,
    mode: decision.mode,
    worktreeName,
    filesDir,
    budgetUsd: decision.budgetUsd,
    reference: `Referenz: Lauf ${run.$id} zu ${run.subjectType} ${run.subjectId}. Ticket-Bezug siehe prompt.`,
    name: interactiveRunName(run.subjectType, run.subjectId),
    settingsPath,
  })
  await writeFile(wrapperPath, buildWrapperScript({
    claudeBin: ctx.config.claudeBin,
    cwd: repo.path,
    args: agentArgs,
    promptPath,
  }), { mode: 0o700 })

  // Terminal öffnen. `open -a Terminal <skript>` führt das Wrapper-Skript im
  // Vordergrund aus — die Startzeit steht damit auch im Bericht.
  pump.status('Interaktiver Modus: Terminal wird geöffnet — Claude Code läuft im Vordergrund')
  await pump.flush()
  const launch = await runCommand('open', ['-a', 'Terminal', wrapperPath], { cwd: repo.path, timeoutMs: 20_000 })
  if (launch.code !== 0) {
    pump.error(`Terminal konnte nicht geöffnet werden (Exit ${launch.code}): ${lastLines(launch.output, 3) || 'keine Ausgabe'}`)
    throw new RunFailure('terminal_launch_failed', lastLines(launch.output, 3))
  }
  pump.status('Terminal geöffnet — der Runner wartet auf das Ende der Sitzung (SessionEnd-Hook)')
  await pump.flush()

  // Auf das Ende warten. Zwei Netze: das Herunterfahren des Daemons und die
  // Höchstdauer. Netzfehler des Polls werden ignoriert — der nächste Versuch
  // kommt gleich.
  const deadline = startedAt + INTERACTIVE_MAX_MS
  // Ohne Initialwert: der einzige Weg aus der Schleife (break) kommt NACH der
  // Zuweisung — TypeScripts Zuweisungs-Analyse beweist das, ein Platzhalter
  // wäre nie lesbar (CI-Lint no-useless-assignment, 2026-08-19).
  let markerSeq: number
  for (;;) {
    if (ctx.shutdownRequested()) throw new RunFailure('runner_shutdown')

    let state: Awaited<ReturnType<typeof ctx.api.sessionEnded>> | null = null
    try {
      state = await ctx.api.sessionEnded(run.$id)
    }
    catch (error) {
      log.warn(`Poll auf das Sitzungs-Ende schlug fehl: ${(error as Error).message}`)
    }

    if (state?.ended) {
      markerSeq = state.seq
      break
    }
    // Vom Board abgebrochen (der EINZIGE Weg, auf dem ein interaktiver Lauf das
    // erfährt): aufhören zu warten, aber nichts committen — niemand will das
    // Ergebnis mehr, und das offene Terminal läuft ggf. weiter.
    if (state && state.status === 'cancelled') {
      pump.status('Lauf wurde vom Board abgebrochen — der Runner hört auf zu warten. Das offene Terminal läuft ggf. weiter.')
      await pump.flush()
      return
    }
    if (Date.now() > deadline) {
      pump.error('Interaktive Sitzung überschritt die Höchstdauer — der Lauf wird als Fehlschlag geschlossen. Das offene Terminal läuft ggf. weiter.')
      await hooks.finish('failed', 'interactive_timeout', buildResultJson(emptyReport(Date.now() - startedAt, null)))
      return
    }
    await delay(ctx.config.pollSeconds * 1000)
  }

  // Sitzung beendet. Den Ereigniszähler hinter die Ende-Markierung heben (§ 7.3),
  // damit die folgenden Zeilen nicht der Retry-Dedupe zum Opfer fallen.
  pump.resumeAfter(markerSeq)
  pump.status('Interaktive Sitzung beendet — der Runner committet und schließt ab')

  // SCHRITT 8: der Runner committet selbst (§ 11) — wie headless.
  const worktree = join(repo.path, '.claude', 'worktrees', worktreeName)
  let branch = ''
  let commit = ''
  let diffstat = ''

  if (existsSync(worktree)) {
    branch = await currentBranch(worktree)
    if (branch && repo.protectedBranches.includes(branch)) {
      pump.error(`Worktree steht auf geschütztem Branch „${branch}" — es wird nichts committet`)
      throw new RunFailure('protected_branch')
    }
    hooks.setWorkBranch(branch)

    const facts = await commitWorktree(worktree, buildCommitMessage({
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      runId: run.$id,
      sessionId,
    }))
    commit = facts.commit
    diffstat = facts.diffstat
    pump.status(facts.committed
      ? `Committet auf ${facts.branch}: ${facts.diffstat || 'ohne Statistik'}`
      : 'Keine Änderungen im Worktree — nichts committet')
  }
  else {
    pump.status('Kein Worktree angelegt — nichts zu committen')
  }

  // SCHRITT 7: Testbefehle im committeten Stand.
  const tests = existsSync(worktree)
    ? await runTestCommands(testCommands, worktree, ctx.config, pump)
    : []

  /**
   * KEIN Transkript und KEINE Kosten/Turns: der interaktive Lauf schreibt kein
   * `stream-json` (die CLI zeigt ihre eigene Oberfläche), also gibt es nichts
   * zu verdichten und nichts hochzuladen. Der Abschluss ist `succeeded` — das
   * Ergebnis ist, was der Mensch in der Sitzung getan und der Runner committet
   * hat.
   */
  const report: RunReport = {
    branch,
    commit,
    diffstat,
    tests,
    durationMs: Date.now() - startedAt,
    costUsd: 0,
    numTurns: 0,
    model: decision.model,
    transcriptFileId: '',
    workBranch: branch,
    permissionDenials: 0,
  }
  await hooks.finish('succeeded', '', buildResultJson(report))
}

export interface AgentArgsInput {
  /** Gesetzt ⇒ `--resume <id>` statt `--session-id` (§ 9) */
  resumeSessionId: string
  /** Die vorab gewürfelte Session eines gewöhnlichen Laufs; bei Fortsetzung '' */
  sessionId: string
  /** Das GEKLEMMTE Modell (§ 7.2 Schritt 3); '' = die Vorgabe der CLI */
  model: string
  mode: string
  worktreeName: string
  filesDir: string
  budgetUsd: number
  reference: string
}

/**
 * Die Argumentliste für `claude` — PUR, damit die eine Verzweigung, auf die es
 * ankommt, ohne Prozessstart prüfbar ist (§ 9, smoke.mjs).
 *
 * DIE VERZWEIGUNG: ein Lauf mit `resumeSessionId` knüpft mit `--resume` an die
 * Vorgänger-Session an und vergibt KEINE neue `--session-id` (die neue kommt aus
 * dem Abschluss-JSON) — die beiden Flags schließen sich aus. Alles andere ist
 * für beide Wege gleich.
 */
export function buildAgentArgs(input: AgentArgsInput): string[] {
  const args = ['-p']
  if (input.resumeSessionId) args.push('--resume', input.resumeSessionId)
  else args.push('--session-id', input.sessionId)
  if (input.model) args.push('--model', input.model)
  args.push(
    '--permission-mode', input.mode,
    '--worktree', input.worktreeName,
    // NUR der files-Ordner DIESES Laufs — nicht der State-Ordner (§ 6),
    // sonst läse ein Lauf die Anhänge aller anderen.
    '--add-dir', input.filesDir,
  )
  if (Number.isFinite(input.budgetUsd)) args.push('--max-budget-usd', String(input.budgetUsd))
  args.push(
    // Kontext, nicht Auftrag (§ 6): der Rück-Bezug reist im System-Prompt.
    '--append-system-prompt', input.reference,
    // `stream-json` OHNE `--verbose` lehnt die CLI ab (§ 11, gemessen).
    '--output-format', 'stream-json',
    '--verbose',
  )
  return args
}

function emptyReport(durationMs: number, summary: ResultSummary | null): RunReport {
  return {
    branch: '',
    commit: '',
    diffstat: '',
    tests: [],
    durationMs,
    costUsd: summary?.costUsd ?? 0,
    numTurns: summary?.numTurns ?? 0,
    model: '',
    transcriptFileId: '',
    workBranch: '',
    permissionDenials: summary?.denials.length ?? 0,
  }
}

/**
 * CLAUDE_CODE_OAUTH_TOKEN aus der Token-Datei — JE LAUF frisch gelesen, damit
 * ein rotiertes Token ohne Daemon-Neustart greift. Das Token wird NIE geloggt;
 * eine fehlende/leere Datei ist kein Fehler (dann gilt die gespeicherte
 * CLI-Anmeldung), aber eine Warnzeile hilft der Diagnose.
 */
function withClaudeToken(env: NodeJS.ProcessEnv, tokenFile: string): NodeJS.ProcessEnv {
  if (!tokenFile) return env
  try {
    const token = readFileSync(tokenFile, 'utf8').trim()
    if (!token) return env
    return { ...env, CLAUDE_CODE_OAUTH_TOKEN: token }
  }
  catch {
    log.warn(`Token-Datei ${tokenFile} nicht lesbar — claude nutzt seine gespeicherte Anmeldung`)
    return env
  }
}

/** claudeBin-Verzeichnis + konfigurierte Extra-Verzeichnisse — EIN Ort für die Regel. */
function runPathPrefix(config: RunnerConfig): string[] {
  const binDir = config.claudeBin.includes('/') ? config.claudeBin.slice(0, config.claudeBin.lastIndexOf('/')) : ''
  return [...(binDir ? [binDir] : []), ...config.extraPath]
}

/**
 * Fährt die in performRun ENTSCHIEDENEN Testbefehle (testCommands.ts). Diese
 * Funktion liest `run.testCommands` bewusst NICHT: sie kennt nur Einträge der
 * lokalen Liste samt deren Zerlegung.
 */
async function runTestCommands(commands: AllowedTestCommand[], worktree: string, config: RunnerConfig, pump: EventPump): Promise<TestOutcome[]> {
  const outcomes: TestOutcome[] = []
  for (const { command, argv } of commands) {
    /**
     * KEIN automatisches `pnpm install` (§ 11): ein Worktree hat weder
     * `node_modules` noch `.env`, das Nachinstallieren kostet Minuten und
     * landet in jedem Budget. Wer Abhängigkeiten braucht, schreibt den
     * Install als ERSTEN Testbefehl — sichtbar, gewollt, gemessen.
     *
     * Die Shell-Prüfung ist hier das ZWEITE Netz: die lokale Liste lässt
     * solche Einträge schon beim Laden nicht zu (config.ts).
     */
    if (hasShellSyntax(command)) {
      pump.error(`Testbefehl „${command}" enthält Shell-Zeichen — es gibt keine Shell, er wird nicht ausgeführt`)
      outcomes.push({ cmd: command, exit: -1, tail: 'Nicht ausgeführt: Shell-Syntax wird nicht unterstützt (keine Shell).' })
      continue
    }
    const bin = argv[0]
    if (!bin) continue

    pump.status(`Test läuft: ${command}`)
    const result = await runCommand(bin, argv.slice(1), {
      cwd: worktree,
      timeoutMs: config.maxRunMinutes * 60_000,
      pathPrefix: runPathPrefix(config),
    })
    const exit = result.timedOut ? -2 : result.code
    outcomes.push({ cmd: command, exit, tail: lastLines(result.output, 20) })
    pump.status(`Test „${command}" → ${result.timedOut ? 'Zeitüberschreitung' : `Exit ${exit}`}`)
  }
  return outcomes
}

async function uploadTranscript(api: RunnerApi, runId: string, transcriptPath: string, pump: EventPump): Promise<string> {
  try {
    let data = await readFile(transcriptPath)
    if (!data.length) return ''
    if (data.length > MAX_TRANSCRIPT_BYTES) {
      // Der Server lehnt darüber mit 413 ab. Lieber das ENDE behalten (dort
      // steht der Abschluss) als gar kein Protokoll.
      data = data.subarray(data.length - MAX_TRANSCRIPT_BYTES + 200)
      pump.status('Transkript gekürzt — nur das Ende wurde hochgeladen')
    }
    const { fileId } = await api.uploadTranscript(runId, data)
    return fileId
  }
  catch (error) {
    // Ein fehlendes Transkript darf den Bericht nicht kosten.
    pump.error(`Transkript konnte nicht hochgeladen werden: ${(error as Error).message}`)
    return ''
  }
}
