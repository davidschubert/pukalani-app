import { readFileSync } from 'node:fs'
import { nextBackoffSeconds, RunnerApi } from './api.ts'
import { sweepRunDirs } from './cleanup.ts'
import { capabilitiesOf, ConfigError, describeConfig, loadRunnerConfig, type RunnerConfig } from './config.ts'
import { log } from './log.ts'
import { isSafeRunId } from './protocol.ts'
import { executeRun } from './run.ts'

/**
 * Der Daemon — docs/plans/AI-RUNNER.md § 7.
 *
 * Er ZIEHT sich Arbeit (§ 3.2: Polling statt Realtime, weil ein
 * Hintergrunddienst Standby, Netzwechsel und VPN überleben soll) und fährt
 * IMMER NUR EINEN Lauf gleichzeitig. Das ist keine Sparsamkeit: zwei
 * gleichzeitige Agenten auf demselben Rechner teilen sich Ports, Caches und
 * das Budget, und ihre Ereignisse wären für den Menschen am Board nicht mehr
 * auseinanderzuhalten.
 */

interface Flags {
  once: boolean
  dryConfig: boolean
}

export function parseFlags(argv: string[]): Flags {
  return {
    once: argv.includes('--once'),
    dryConfig: argv.includes('--dry-config'),
  }
}

function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const version = (parsed as { version?: unknown }).version
    return typeof version === 'string' ? version : '0.0.0'
  }
  catch {
    return '0.0.0'
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

interface DaemonState {
  shuttingDown: boolean
  /** Id des gerade laufenden Auftrags — das Aufräumen fasst ihn nie an */
  activeRunId: string | null
}

/** Ablage-Aufräumen (BE-025): einmal nach dem Start, danach alle 24 Stunden. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

async function sweepSafely(config: RunnerConfig, state: DaemonState): Promise<void> {
  try {
    await sweepRunDirs(config, () => state.activeRunId)
  }
  catch (error) {
    // Aufräumen ist Pflege, kein Betrieb: ein Fehler darf den Claim-Loop nicht anhalten.
    log.warn(`Ablage-Aufräumen fehlgeschlagen: ${(error as Error).message}`)
  }
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))

  let loaded
  try {
    loaded = loadRunnerConfig()
  }
  catch (error) {
    if (error instanceof ConfigError) {
      log.error(error.message)
      return 2
    }
    throw error
  }

  const { config, token, configPath } = loaded

  if (flags.dryConfig) {
    // Zusammenfassung OHNE Secret — siehe describeConfig.
    process.stdout.write(`${describeConfig(config, configPath)}\n`)
    return 0
  }

  const api = new RunnerApi(config.endpoint, token)
  const version = readVersion()
  const state: DaemonState = { shuttingDown: false, activeRunId: null }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (state.shuttingDown) {
        // Zweites Signal: der Mensch meint es ernst.
        log.warn(`${signal} erneut — Abbruch ohne Aufräumen`)
        process.exit(130)
      }
      state.shuttingDown = true
      log.info(`${signal} — der laufende Auftrag wird beendet und als Fehlschlag gemeldet`)
    })
  }

  log.info(`AI-Runner ${version} — ${config.endpoint} — Repos: ${Object.keys(config.repos).join(', ')}`)

  await sendHeartbeat(api, config, version)
  const heartbeat = setInterval(() => {
    void sendHeartbeat(api, config, version)
  }, config.heartbeatSeconds * 1000)
  heartbeat.unref?.()

  await sweepSafely(config, state)
  const sweep = setInterval(() => {
    void sweepSafely(config, state)
  }, SWEEP_INTERVAL_MS)
  sweep.unref?.()

  let backoff = 0
  do {
    try {
      const { run } = await api.claim()
      backoff = 0

      if (run) {
        // Eine unzulässige Id druckt erst executeRun — gekürzt (isSafeRunId).
        if (isSafeRunId(run.$id)) {
          log.info(`Lauf ${run.$id} übernommen (${run.subjectType} ${run.subjectId}, Repo ${run.repoKey})`)
          state.activeRunId = run.$id
        }
        try {
          await executeRun({ api, config, shutdownRequested: () => state.shuttingDown }, run)
        }
        finally {
          state.activeRunId = null
        }
      }
      else if (!flags.once) {
        await sleep(config.pollSeconds)
      }
    }
    catch (error) {
      backoff = nextBackoffSeconds(backoff, config.pollSeconds)
      log.warn(`Claim fehlgeschlagen (${(error as Error).message}) — nächster Versuch in ${backoff}s`)
      if (flags.once) return 1
      await sleep(backoff)
    }
  } while (!flags.once && !state.shuttingDown)

  clearInterval(heartbeat)
  clearInterval(sweep)
  return 0
}

async function sendHeartbeat(api: RunnerApi, config: RunnerConfig, version: string): Promise<void> {
  try {
    await api.heartbeat(capabilitiesOf(config, version))
  }
  catch (error) {
    // Der Heartbeat ist Anzeige, kein Betrieb (§ 5): sein Ausfall darf den
    // Claim-Loop nicht anhalten.
    log.warn(`Heartbeat fehlgeschlagen: ${(error as Error).message}`)
  }
}

const code = await main()
process.exit(code)
