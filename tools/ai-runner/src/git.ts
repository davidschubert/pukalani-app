import { runCommand } from './exec.ts'

/**
 * Der Commit gehört dem RUNNER — docs/archiv/AI-RUNNER.md § 7.2 Schritt 8 und
 * § 11 (gemessen 2026-08-17): `acceptEdits` erlaubt Dateiänderungen, aber kein
 * `git commit`. Dem Agenten dafür `Bash(git *)` freizugeben wäre mehr Rechte
 * für weniger Kontrolle — so ist die Commit-Nachricht deterministisch und
 * trägt Subjekt und Session-Id.
 *
 * ES WIRD NIE GEPUSHT (§ 8.1). In dieser Datei steht kein `push`, und das ist
 * der Grund, warum sie so kurz ist.
 */

export interface GitFacts {
  branch: string
  commit: string
  diffstat: string
  committed: boolean
}

async function git(cwd: string, args: string[]): Promise<{ ok: boolean, out: string }> {
  const result = await runCommand('git', args, { cwd, timeoutMs: 120_000 })
  return { ok: result.code === 0, out: result.output.trim() }
}

export async function currentBranch(worktree: string): Promise<string> {
  const result = await git(worktree, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return result.ok ? result.out : ''
}

export async function hasChanges(worktree: string): Promise<boolean> {
  const result = await git(worktree, ['status', '--porcelain'])
  return result.ok && result.out.length > 0
}

/**
 * Die Commit-Nachricht — PUR, weil sie ein Versprechen an den Bericht ist:
 * wer den Commit später findet, soll ohne das Board sehen, wozu er gehört.
 */
export function buildCommitMessage(input: { subjectType: string, subjectId: string, runId: string, sessionId: string }): string {
  return [
    `ai(${input.subjectType} ${input.subjectId}): Lauf ${input.runId}`,
    '',
    `Session: ${input.sessionId}`,
    '',
    'Co-Authored-By: Claude <noreply@anthropic.com>',
  ].join('\n')
}

/**
 * Alles im Worktree einsammeln und committen, dann die Fakten für den Bericht
 * lesen. Ohne Änderungen wird NICHT committet — ein leerer Commit wäre eine
 * Behauptung über Arbeit, die nicht stattgefunden hat.
 */
export async function commitWorktree(worktree: string, message: string): Promise<GitFacts> {
  const branch = await currentBranch(worktree)
  const dirty = await hasChanges(worktree)

  let committed = false
  if (dirty) {
    const added = await git(worktree, ['add', '-A'])
    if (added.ok) {
      const commit = await git(worktree, ['commit', '-m', message])
      committed = commit.ok
    }
  }

  const head = await git(worktree, ['rev-parse', 'HEAD'])
  const shortstat = committed ? await git(worktree, ['diff', '--shortstat', 'HEAD~1']) : { ok: false, out: '' }

  return {
    branch,
    commit: head.ok ? head.out : '',
    diffstat: shortstat.ok ? shortstat.out : '',
    committed,
  }
}
