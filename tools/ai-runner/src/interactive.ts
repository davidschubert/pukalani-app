/**
 * Der interaktive Modus — docs/archiv/AI-RUNNER.md § 7.3.
 *
 * Für Läufe, bei denen David zuschauen und genehmigen will: der Runner öffnet
 * ein Terminal-Fenster (Terminal.app, `open -a Terminal`) mit dem fertigen
 * `claude`-Befehl OHNE `-p` — dann läuft die CLI im Vordergrund, mit ihrer
 * gewohnten Oberfläche, und ein Mensch bestätigt jeden Werkzeugaufruf.
 *
 * ALLES HIER IST PUR (kein Prozessstart, kein Dateisystem): der Bau des
 * Befehls, des Wrapper-Skripts und des SessionEnd-Hooks ist einzeln
 * gegenprüfbar (scripts/smoke.mjs). Terminal.app wird NIE in einem Test
 * gestartet — geprüft wird, was gebaut wird, nie die Ausführung.
 *
 * ZWEI DINGE, DIE MAN NICHT „VEREINFACHEN" DARF:
 *
 *  1. Der Prompt reist NICHT als Argument aus dem Daemon, sondern als
 *     `"$(cat prompt.md)"` IM Wrapper-Skript (wie das Befehls-Muster in § 7.2
 *     Schritt 5). Ein 200-000-Zeichen-Auftrag als Prozess-Argument aus Node
 *     wäre riskant; im Skript liest ihn die Shell zur Startzeit.
 *  2. Das Hook-Skript trägt das Secret NIE in Argumente oder Logs. Es liest die
 *     Token-Datei zur Laufzeit (bash-`printf` ist ein Builtin — kein `curl`-
 *     Argument, kein eigener Prozess mit dem Secret im argv), schreibt einen
 *     0600-Header und gibt ihn `curl -H @datei`. Der Daemon KENNT das Secret
 *     zwar (er hat es geladen), backt es aber bewusst nicht in das Skript.
 */

/**
 * Ein Wert für die bash-Kommandozeile sicher einpacken: in einfache
 * Anführungszeichen, jedes enthaltene `'` als `'\''`. Damit kann ein
 * Modellname, ein Pfad oder ein Referenztext keine Shell-Syntax werden.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Der Fenster-/Resume-Name (`-n`). Heute Subjekt-Typ + -Id — mehr weiss der Runner nicht. */
export function interactiveRunName(subjectType: string, subjectId: string): string {
  return `${subjectType} ${subjectId}`.trim()
}

export interface InteractiveArgsInput {
  /** Vorab gewürfelt (§ 7.2 Schritt 1) — auch interaktiv, damit `--resume` trägt */
  sessionId: string
  /** Das GEKLEMMTE Modell; '' = die Vorgabe der CLI */
  model: string
  mode: string
  worktreeName: string
  filesDir: string
  budgetUsd: number
  reference: string
  /** `-n` — Fenstertitel und Eintrag im `/resume`-Picker */
  name: string
  /** `--settings` mit dem SessionEnd-Hook; '' ⇒ kein Hook (dann kein Rückkanal) */
  settingsPath: string
}

/**
 * Die Argumentliste für den INTERAKTIVEN `claude` — wie der headless Befehl,
 * aber OHNE `-p` und OHNE `--output-format stream-json --verbose` (die
 * Vordergrund-CLI zeigt ihre eigene Oberfläche, es liest kein Elternprozess
 * mit). Der Prompt ist NICHT dabei — den hängt das Wrapper-Skript als
 * Positionsargument an (`buildWrapperScript`).
 */
export function buildInteractiveArgs(input: InteractiveArgsInput): string[] {
  const args = ['--session-id', input.sessionId]
  if (input.name) args.push('-n', input.name)
  if (input.model) args.push('--model', input.model)
  args.push(
    '--permission-mode', input.mode,
    '--worktree', input.worktreeName,
    // NUR der files-Ordner DIESES Laufs (§ 6) — nicht der State-Ordner.
    '--add-dir', input.filesDir,
  )
  if (Number.isFinite(input.budgetUsd)) args.push('--max-budget-usd', String(input.budgetUsd))
  // Kontext, nicht Auftrag (§ 6): der Rück-Bezug reist im System-Prompt.
  args.push('--append-system-prompt', input.reference)
  if (input.settingsPath) args.push('--settings', input.settingsPath)
  return args
}

export interface WrapperScriptInput {
  claudeBin: string
  /** Das Repo-Verzeichnis — die CLI legt den Worktree relativ dazu an */
  cwd: string
  args: string[]
  promptPath: string
}

/**
 * Das Wrapper-Skript, das `open -a Terminal` ausführt. Es wechselt ins Repo und
 * startet `claude` mit den Flags und dem Prompt als letztem Positionsargument
 * (`"$(cat prompt.md)"`, wie das Muster in § 7.2 Schritt 5).
 */
export function buildWrapperScript(input: WrapperScriptInput): string {
  const flags = input.args.map(shellQuote).join(' ')
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    `cd ${shellQuote(input.cwd)}`,
    `exec ${shellQuote(input.claudeBin)} ${flags} "$(cat ${shellQuote(input.promptPath)})"`,
    '',
  ].join('\n')
}

/**
 * Der Claude-Settings-Block, der den SessionEnd-Hook registriert. Er wird als
 * `--settings <datei>` übergeben; die CLI ruft `command` beim Ende der Sitzung.
 */
export function buildHookSettings(hookScriptPath: string): { hooks: { SessionEnd: { hooks: { type: 'command', command: string }[] }[] } } {
  return {
    hooks: {
      SessionEnd: [
        { hooks: [{ type: 'command', command: hookScriptPath }] },
      ],
    },
  }
}

export interface HookScriptInput {
  /** Basis-URL der Konsole (ohne abschliessenden Schrägstrich) */
  endpoint: string
  runId: string
  /** Pfad zur Token-Datei — der INHALT (Secret) wird erst zur Laufzeit gelesen */
  secretFile: string
}

/**
 * Das SessionEnd-Hook-Skript — DER RÜCKKANAL (§ 7.3). Kein Elternprozess liest
 * mit, also meldet der Hook das Ende selbst an `POST …/session-end`.
 *
 * DAS SECRET TAUCHT NIRGENDS IM ARGV ODER LOG AUF: `printf` ist ein bash-
 * Builtin (kein eigener Prozess), der Header landet in einer 0600-Datei, und
 * `curl -H @datei` liest ihn von dort statt aus der Kommandozeile. Die Datei
 * wird sofort wieder gelöscht. Baken sind nur Endpunkt, Run-Id und der PFAD zur
 * Token-Datei — nie das Token selbst.
 */
export function buildHookScript(input: HookScriptInput): string {
  const url = `${input.endpoint.replace(/\/+$/, '')}/api/runner/runs/${input.runId}/session-end`
  return [
    '#!/bin/bash',
    '# SessionEnd-Rückkanal des AI-Runners — docs/archiv/AI-RUNNER.md § 7.3.',
    '# Das Secret reist nur als 0600-Headerdatei, nie als Argument oder Log.',
    'set -u',
    `SECRET_FILE=${shellQuote(input.secretFile)}`,
    'if [ ! -r "$SECRET_FILE" ]; then exit 0; fi',
    'HDR="$(mktemp)" || exit 0',
    'chmod 600 "$HDR"',
    'printf "Authorization: Bearer %s\\n" "$(cat "$SECRET_FILE")" > "$HDR"',
    `curl -sS -m 20 -X POST -H @"$HDR" ${shellQuote(url)} >/dev/null 2>&1 || true`,
    'rm -f "$HDR"',
    'exit 0',
    '',
  ].join('\n')
}
