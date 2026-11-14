import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { hasShellSyntax } from './exec.ts'
import { PERMISSION_MODES, type PermissionMode } from './protocol.ts'

/**
 * Die lokale Allowlist — docs/plans/AI-RUNNER.md § 7.1/§ 8.1.
 *
 * DIE WICHTIGSTE EINZELREGEL DES GANZEN SYSTEMS: die Datenbank darf
 * AUSWÄHLEN, was diese Datei ERLAUBT — nie umgekehrt. Deshalb reist über die
 * Naht nur ein `repoKey`, nie ein Pfad; erlaubte Modi, Modelle, Budget-Deckel,
 * geschützte Branches und Testbefehle stehen ausschliesslich hier (über die
 * Naht reist bei Testbefehlen nur eine AUSWAHL, SEC-037). Läge die Allowlist in
 * der Datenbank, wäre jede Lücke in der Betreiber-Konsole eine
 * Remote-Code-Execution auf diesem Laptop.
 *
 * Alles in dieser Datei ausser `loadRunnerConfig` ist PUR — die Prüfungen sind
 * Sicherungen, und eine Sicherung, die man nur durch Starten des Daemons
 * auslösen kann, wird nie einzeln gegengeprüft (scripts/smoke.mjs).
 */

/** Ein Konfigurationsfehler, der dem Menschen gilt — nicht ein Stacktrace. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

export interface RepoRule {
  /** Der Schlüssel, unter dem der Lauf dieses Repo wählt */
  key: string
  path: string
  /** Auf diesen Branches wird NIE gearbeitet (§ 8.1) */
  protectedBranches: string[]
  allowedModes: PermissionMode[]
  /** null = keine Einschränkung; sonst gewinnt der erste Eintrag als Rückfall */
  allowedModels: string[] | null
  maxBudgetUsd: number
  /**
   * Die Testbefehle, die dieser Rechner in diesem Repo ausführen darf
   * (SEC-037). Über die Naht reist höchstens eine AUSWAHL daraus — ein
   * Befehl, der hier nicht wortgleich steht, lehnt den ganzen Auftrag ab
   * (testCommands.ts). Leer = keine Testbefehle; das ist auch die Vorgabe,
   * wenn das Feld in der Datei fehlt.
   */
  allowedTestCommands: string[]
}

/** Was mit alten Lauf-Ordnern geschieht (BE-025, cleanup.ts). */
export const RUN_RETENTION_MODES = ['off', 'dry-run', 'apply'] as const
export type RunRetentionMode = (typeof RUN_RETENTION_MODES)[number]

export interface RunRetention {
  /** `dry-run` zählt nur, `apply` löscht, `off` tut nichts */
  mode: RunRetentionMode
  /** Ordner, deren jüngste Änderung älter ist, gelten als abgelaufen */
  days: number
}

export const DEFAULT_RUN_RETENTION: Readonly<RunRetention> = { mode: 'dry-run', days: 30 }

/** Grenzen der lokalen Testbefehl-Liste — eine Liste, die ein Mensch pflegt, nicht ein Generator. */
export const MAX_TEST_COMMAND_ENTRIES = 50
export const MAX_TEST_COMMAND_CHARS = 200

export interface RunnerConfig {
  endpoint: string
  secretFile: string
  pollSeconds: number
  heartbeatSeconds: number
  maxRunMinutes: number
  stateDir: string
  /** Ausführbare Datei der Claude-Code-CLI (launchd hat einen kargen PATH) */
  claudeBin: string
  /**
   * Datei mit einem langlebigen CLI-Token (`claude setup-token`), das dem
   * claude-Prozess als CLAUDE_CODE_OAUTH_TOKEN mitgegeben wird. NÖTIG für den
   * Daemon-Betrieb: das normale OAuth-Login der CLI läuft ab, und headless
   * kann sie sich nicht re-authentifizieren — der erste Feature-Lauf starb
   * am 2026-08-18 genau daran (401 bei \$0.00/1 Turn). '' = kein Token-File,
   * die CLI nutzt ihre eigene gespeicherte Anmeldung.
   */
  claudeTokenFile: string
  /**
   * Verzeichnisse, die dem PATH der KIND-Prozesse vorangestellt werden.
   * launchd startet den Daemon mit kargem PATH (/usr/bin:/bin) — `claude`
   * rettet `claudeBin` (absolut), aber die TESTBEFEHLE eines Laufs fanden ihr
   * `pnpm` nicht (Exit 127 im ersten Prod-Lauf, 2026-08-18: pnpm liegt in
   * /opt/homebrew/bin). Konfiguration statt Hardcode, weil der Ort je
   * Maschine anders ist (Homebrew, corepack, nvm).
   */
  extraPath: string[]
  /**
   * Native macOS-Mitteilung bei succeeded/needs_input/failed (notify.ts).
   * Vorgabe `true`; `false` schaltet sie ab. cancelled meldet nie (der
   * Abbrechende weiß es schon).
   */
  macosNotifications: boolean
  /** Aufräumen von `<stateDir>/runs/` (BE-025); Vorgabe: nur zählen, 30 Tage */
  runRetention: RunRetention
  repos: Record<string, RepoRule>
}

/**
 * Der Claim ist serverseitig auf 30/min gedrosselt (§ 5: „Ein Poll-Loop mit
 * Fehler ist eine Selbst-DoS gegen die eigene Konsole"). Unter 2 Sekunden wird
 * deshalb nicht gepollt — und zwar geklemmt, nicht nur dokumentiert: eine
 * Zahl in einer Datei, die man von Hand tippt, ist irgendwann eine 0.
 */
export const MIN_POLL_SECONDS = 2

export const DEFAULT_POLL_SECONDS = 3
export const DEFAULT_HEARTBEAT_SECONDS = 60
export const DEFAULT_MAX_RUN_MINUTES = 30

/** `~` und `~/…` gegen das Home-Verzeichnis auflösen — sonst legt Node ein Verzeichnis namens „~" an. */
export function expandHome(value: string, home: string): string {
  if (value === '~') return home
  if (value.startsWith('~/')) return join(home, value.slice(2))
  return value
}

/** Wo liegt die Config? Env schlägt Vorgabe — der Testlauf braucht eine eigene Datei. */
export function resolveConfigPath(env: Record<string, string | undefined>, home: string): string {
  const override = env.PUKALANI_RUNNER_CONFIG?.trim()
  if (override) return expandHome(override, home)
  return join(home, '.config', 'pukalani-runner', 'config.json')
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${where}: erwartet ein Objekt`)
  }
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigError(`${where}.${key}: fehlt oder ist keine nicht-leere Zeichenkette`)
  }
  return value.trim()
}

function readNumber(source: Record<string, unknown>, key: string, where: string, fallback: number): number {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`${where}.${key}: erwartet eine positive Zahl`)
  }
  return value
}

function readStringArray(source: Record<string, unknown>, key: string, where: string): string[] | null {
  const value = source[key]
  if (value === undefined) return null
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !entry.trim())) {
    throw new ConfigError(`${where}.${key}: erwartet eine Liste nicht-leerer Zeichenketten`)
  }
  return (value as string[]).map(entry => entry.trim())
}

/**
 * `repos.<key>.testCommands` — die lokale Liste der erlaubten Testbefehle
 * (SEC-037). ANDERS als die übrigen Listen wird hier NICHTS still bereinigt:
 * verglichen wird später wortgleich, und ein Eintrag mit Rand-Leerraum oder
 * doppeltem Leerzeichen sähe in der Datei richtig aus und passte trotzdem nie.
 * Ein Tippfehler soll beim Start auffallen, nicht beim ersten abgelehnten Lauf.
 *
 * Steuerzeichen und anderer Leerraum als das einfache Leerzeichen sind
 * verboten, weil der Befehl an Leerraum zerlegt wird (`splitCommand`) — was
 * ein Mensch als ein Wort liest, muss auch eines bleiben. Shell-Zeichen sind
 * verboten, weil es keine Shell gibt (exec.ts): so ein Eintrag liefe nie so,
 * wie er aussieht.
 */
function readTestCommands(source: Record<string, unknown>, where: string): string[] {
  const value = source.testCommands
  if (value === undefined) return []
  const field = `${where}.testCommands`
  if (!Array.isArray(value)) {
    throw new ConfigError(`${field}: erwartet eine Liste von Befehlen (z. B. ["pnpm lint"])`)
  }
  if (value.length > MAX_TEST_COMMAND_ENTRIES) {
    throw new ConfigError(`${field}: höchstens ${MAX_TEST_COMMAND_ENTRIES} Einträge`)
  }
  const seen = new Set<string>()
  value.forEach((entry: unknown, index: number) => {
    const at = `${field}[${index}]`
    if (typeof entry !== 'string' || !entry.length) {
      throw new ConfigError(`${at}: erwartet eine nicht-leere Zeichenkette`)
    }
    if (entry.length > MAX_TEST_COMMAND_CHARS) {
      throw new ConfigError(`${at}: länger als ${MAX_TEST_COMMAND_CHARS} Zeichen`)
    }
    // eslint-disable-next-line no-control-regex -- genau die sind gemeint
    if (/[\u0000-\u001F\u007F]/.test(entry) || /[^\S ]/.test(entry)) {
      throw new ConfigError(`${at}: enthält Steuerzeichen, Tabulator oder Zeilenumbruch — nur einfache Leerzeichen trennen die Wörter`)
    }
    if (entry !== entry.trim()) {
      throw new ConfigError(`${at}: beginnt oder endet mit Leerraum — verglichen wird wortgleich, bitte entfernen`)
    }
    if (entry.includes('  ')) {
      throw new ConfigError(`${at}: enthält mehrere Leerzeichen hintereinander — verglichen wird wortgleich, bitte auf eines kürzen`)
    }
    if (hasShellSyntax(entry)) {
      throw new ConfigError(`${at}: enthält Shell-Zeichen — es gibt keine Shell; eine Pipeline gehört in ein Skript im Repo`)
    }
    if (seen.has(entry)) {
      throw new ConfigError(`${at}: steht doppelt in der Liste`)
    }
    seen.add(entry)
  })
  return [...seen]
}

function readRunRetention(root: Record<string, unknown>): RunRetention {
  if (root.runRetention === undefined) return { ...DEFAULT_RUN_RETENTION }
  const where = 'config.json.runRetention'
  const source = asRecord(root.runRetention, where)

  const mode = source.mode === undefined ? DEFAULT_RUN_RETENTION.mode : source.mode
  if (typeof mode !== 'string' || !(RUN_RETENTION_MODES as readonly string[]).includes(mode)) {
    throw new ConfigError(`${where}.mode: erwartet einen von ${RUN_RETENTION_MODES.join(', ')}`)
  }

  const days = source.days === undefined ? DEFAULT_RUN_RETENTION.days : source.days
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
    throw new ConfigError(`${where}.days: erwartet eine ganze Zahl ab 1`)
  }

  return { mode: mode as RunRetentionMode, days }
}

/**
 * Die Config prüfen und vervollständigen. Wirft mit einem Satz, den man ohne
 * Quelltext versteht — diese Datei tippt ein Mensch.
 */
export function parseRunnerConfig(raw: unknown, home: string): RunnerConfig {
  const root = asRecord(raw, 'config.json')

  const endpoint = readString(root, 'endpoint', 'config.json').replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(endpoint)) {
    throw new ConfigError('config.json.endpoint: muss mit http:// oder https:// beginnen')
  }

  const secretFile = expandHome(readString(root, 'secretFile', 'config.json'), home)
  if (!isAbsolute(secretFile)) {
    throw new ConfigError('config.json.secretFile: muss ein absoluter Pfad sein')
  }

  const pollSeconds = Math.max(MIN_POLL_SECONDS, readNumber(root, 'pollSeconds', 'config.json', DEFAULT_POLL_SECONDS))
  const heartbeatSeconds = readNumber(root, 'heartbeatSeconds', 'config.json', DEFAULT_HEARTBEAT_SECONDS)
  const maxRunMinutes = readNumber(root, 'maxRunMinutes', 'config.json', DEFAULT_MAX_RUN_MINUTES)

  const stateDirRaw = typeof root.stateDir === 'string' && root.stateDir.trim()
    ? root.stateDir.trim()
    : join(home, '.local', 'state', 'pukalani-runner')
  const stateDir = expandHome(stateDirRaw, home)
  if (!isAbsolute(stateDir)) {
    throw new ConfigError('config.json.stateDir: muss ein absoluter Pfad sein')
  }

  const claudeBin = typeof root.claudeBin === 'string' && root.claudeBin.trim() ? root.claudeBin.trim() : 'claude'
  const claudeTokenFile = typeof root.claudeTokenFile === 'string' ? expandHome(root.claudeTokenFile.trim(), home) : ''
  const extraPath = Array.isArray(root.extraPath)
    ? root.extraPath.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('/'))
    : []
  // Vorgabe AN: nur ein ausdrückliches `false` schaltet die Mitteilung ab.
  const macosNotifications = root.macosNotifications === undefined ? true : root.macosNotifications
  if (typeof macosNotifications !== 'boolean') {
    throw new ConfigError('config.json.macosNotifications: erwartet true oder false')
  }

  const reposRaw = asRecord(root.repos, 'config.json.repos')
  const keys = Object.keys(reposRaw)
  if (!keys.length) {
    throw new ConfigError('config.json.repos: leer — ohne freigegebenes Repo kann kein Lauf starten')
  }

  const repos: Record<string, RepoRule> = {}
  for (const key of keys) {
    const where = `config.json.repos.${key}`
    const entry = asRecord(reposRaw[key], where)

    const path = expandHome(readString(entry, 'path', where), home)
    if (!isAbsolute(path)) throw new ConfigError(`${where}.path: muss ein absoluter Pfad sein`)

    const modes = readStringArray(entry, 'allowedModes', where)
    if (!modes || !modes.length) {
      throw new ConfigError(`${where}.allowedModes: fehlt — ohne erlaubten Modus gibt es nichts freizugeben`)
    }
    for (const mode of modes) {
      if (!(PERMISSION_MODES as readonly string[]).includes(mode)) {
        throw new ConfigError(`${where}.allowedModes: „${mode}" ist kein Modus der CLI (${PERMISSION_MODES.join(', ')})`)
      }
    }

    const maxBudget = entry.maxBudgetUsd
    if (typeof maxBudget !== 'number' || !Number.isFinite(maxBudget) || maxBudget <= 0) {
      throw new ConfigError(`${where}.maxBudgetUsd: erwartet eine positive Zahl — ein Lauf ohne Deckel ist keiner`)
    }

    const allowedModels = readStringArray(entry, 'allowedModels', where)
    if (allowedModels !== null && !allowedModels.length) {
      throw new ConfigError(`${where}.allowedModels: leer — weglassen heisst „alle", eine leere Liste hiesse „keins"`)
    }

    repos[key] = {
      key,
      path,
      protectedBranches: readStringArray(entry, 'protectedBranches', where) ?? ['main'],
      allowedModes: modes as PermissionMode[],
      allowedModels,
      maxBudgetUsd: maxBudget,
      allowedTestCommands: readTestCommands(entry, where),
    }
  }

  const runRetention = readRunRetention(root)

  return { endpoint, secretFile, pollSeconds, heartbeatSeconds, maxRunMinutes, stateDir, claudeBin, claudeTokenFile, extraPath, macosNotifications, runRetention, repos }
}

/**
 * Das Bearer-Token hat die Form `<rowId>.<secret>` (§ 5) und erscheint bei der
 * Registrierung GENAU EINMAL. Hier wird nur die FORM geprüft — ob es stimmt,
 * sagt der erste 401.
 *
 * Wirft ohne den Wert zu nennen: eine Fehlermeldung ist ein Log-Eintrag, und
 * dieses Secret ist Code-Ausführung auf diesem Rechner.
 */
export function parseRunnerToken(raw: string): string {
  const token = raw.split('\n')[0]?.trim() ?? ''
  if (!token) throw new ConfigError('secretFile: leer — dort gehört das Token aus der Runner-Registrierung hinein')
  const separator = token.indexOf('.')
  if (separator <= 0 || separator === token.length - 1) {
    throw new ConfigError('secretFile: erwartet ein Token der Form <runnerId>.<secret> (eine Zeile, wie im Board angezeigt)')
  }
  return token
}

export interface LoadedConfig {
  config: RunnerConfig
  /** NIE loggen, nie drucken, nie in eine Fehlermeldung */
  token: string
  configPath: string
}

/** Config + Secret laden. Die EINZIGE Funktion hier, die das Dateisystem anfasst. */
export function loadRunnerConfig(env: Record<string, string | undefined> = process.env, home: string = homedir()): LoadedConfig {
  const configPath = resolveConfigPath(env, home)

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  }
  catch {
    throw new ConfigError(`Config nicht lesbar: ${configPath}\nAnlegen (siehe README) oder PUKALANI_RUNNER_CONFIG setzen.`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new ConfigError(`Config ist kein gültiges JSON (${configPath}): ${(error as Error).message}`)
  }

  const config = parseRunnerConfig(parsed, home)

  let secretRaw: string
  try {
    secretRaw = readFileSync(config.secretFile, 'utf8')
  }
  catch {
    throw new ConfigError(`Secret-Datei nicht lesbar: ${config.secretFile}`)
  }

  return { config, token: parseRunnerToken(secretRaw), configPath }
}

/**
 * Die Zusammenfassung für `--dry-config`. OHNE Secret — gezeigt wird nur, WO
 * es liegt. Wer sein Token sehen will, öffnet die Datei selbst; ein Daemon,
 * der es auf Wunsch druckt, druckt es irgendwann auch in ein Log.
 */
export function describeConfig(config: RunnerConfig, configPath: string): string {
  const lines = [
    `Config:        ${configPath}`,
    `Endpunkt:      ${config.endpoint}`,
    `Secret-Datei:  ${config.secretFile} (Inhalt wird nicht angezeigt)`,
    `Poll:          alle ${config.pollSeconds}s (Mindestabstand ${MIN_POLL_SECONDS}s)`,
    `Heartbeat:     alle ${config.heartbeatSeconds}s`,
    `Laufzeit max:  ${config.maxRunMinutes} min`,
    `Ablage:        ${config.stateDir}`,
    `CLI:           ${config.claudeBin}`,
    `Mitteilungen:  ${config.macosNotifications ? 'an' : 'aus'} (macOS)`,
    `Aufräumen:     ${config.runRetention.mode} (Lauf-Ordner älter als ${config.runRetention.days} Tage)`,
    'Repos:',
  ]
  for (const repo of Object.values(config.repos)) {
    lines.push(`  ${repo.key}`)
    lines.push(`    Pfad:      ${repo.path}`)
    lines.push(`    geschützt: ${repo.protectedBranches.join(', ') || '—'}`)
    lines.push(`    Modi:      ${repo.allowedModes.join(', ')}`)
    lines.push(`    Modelle:   ${repo.allowedModels ? repo.allowedModels.join(', ') : 'alle'}`)
    lines.push(`    Budget:    max ${repo.maxBudgetUsd} USD`)
    if (repo.allowedTestCommands.length) {
      lines.push('    Testbefehle:')
      for (const command of repo.allowedTestCommands) lines.push(`      ${command}`)
    }
    else {
      lines.push('    Testbefehle: —')
    }
  }
  return lines.join('\n')
}

/**
 * Die Spalte `runners.capabilitiesJson` fasst 4000 Zeichen; darüber lehnt
 * der Heartbeat mit 400 ab (`capabilities_too_large`), und der Rechner sähe
 * im Board für immer „offline" aus. Die lokale Liste darf größer sein
 * (50 × 200 Zeichen) — die ANZEIGE-Kopie wird dann gekürzt, nicht der
 * Heartbeat geopfert.
 */
export const MAX_CAPABILITIES_CHARS = 4000

/**
 * Was der Heartbeat meldet — ANZEIGE-KOPIE, keine Wahrheit (§ 8.1).
 * `testCommands` füllt die Auswahl im Lauf-Formular; geprüft wird trotzdem
 * jeder Auftrag gegen die lokale Liste (testCommands.ts). Passt die Kopie
 * nicht in die Spalte, fallen Einträge vom Ende weg und
 * `testCommandsIncomplete` sagt es.
 */
export function capabilitiesOf(config: RunnerConfig, version: string): Record<string, unknown> {
  const modes = new Set<string>()
  const testCommands: Record<string, string[]> = {}
  for (const repo of Object.values(config.repos)) {
    for (const mode of repo.allowedModes) modes.add(mode)
    testCommands[repo.key] = [...repo.allowedTestCommands]
  }
  const capabilities: Record<string, unknown> = { repos: Object.keys(config.repos), modes: [...modes], version, testCommands }

  let incomplete = false
  while (JSON.stringify(capabilities).length > MAX_CAPABILITIES_CHARS) {
    // Immer aus der längsten Liste kürzen — so behält jedes Repo möglichst viel.
    const longest = Object.values(testCommands).reduce<string[] | null>(
      (best, list) => (!best || list.length > best.length ? list : best), null)
    if (!longest || !longest.length) break
    longest.pop()
    if (!incomplete) {
      incomplete = true
      capabilities.testCommandsIncomplete = true
    }
  }
  return capabilities
}
