import { spawn } from 'node:child_process'
import type { RunFinalStatus } from './protocol.ts'

/**
 * Native macOS-Mitteilung am Ende eines Laufs — docs/archiv/AI-RUNNER.md § 7.2.
 *
 * Der BAU der `osascript`-Argumente ist PUR und einzeln gegengeprüft
 * (scripts/smoke.mjs); die AUSFÜHRUNG (`showNotification` → `spawn`) wird NIE
 * getestet — dasselbe Muster wie interactive.ts (Terminal.app) und exec.ts
 * (Prozessstart ohne Shell).
 *
 * OHNE SHELL: Titel und Text sind NUTZERDATEN (die H1 eines Auftrags, ein
 * Subjekt-Id). `spawn('osascript', args)` ohne `shell: true` macht daraus
 * Argumente, nie eine Befehlszeile — ein `;` oder Backtick im Titel kann keine
 * Shell-Syntax werden (exec.ts erklärt das Muster). Der Titel muss ZUSÄTZLICH
 * gegen die AppleScript-STRING-Syntax gesichert werden (`appleScriptString`),
 * sonst bräche ein enthaltenes `"` das `display notification`-Skript.
 */

/**
 * Die deutsche End-Meldung je gemeldetem Endzustand. `cancelled` fehlt
 * BEWUSST — der Abbrechende weiß es schon, dafür kommt keine Mitteilung.
 */
export const NOTIFICATION_STATUS_TEXT: Record<'succeeded' | 'needs_input' | 'failed', string> = {
  succeeded: 'Fertig',
  needs_input: 'Rückfrage nötig — antworte im Board',
  failed: 'Fehlgeschlagen',
}

/**
 * Einen Wert als AppleScript-String-Literal einpacken: `\` und `"` maskieren.
 * Ohne das würde ein Anführungszeichen im Titel das `display notification`-
 * Skript beenden — kein Shell-Problem (es gibt keine Shell), sondern
 * AppleScript-Syntax.
 */
export function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Der Titel der Mitteilung: die erste H1-Zeile aus `promptSource` (`# …`),
 * sonst `<subjectType> <subjectId>`. H2+ (`## …`) und Text ohne führendes
 * `# ` zählen NICHT — nur eine echte H1.
 */
export function notificationTitle(promptSource: string, subjectType: string, subjectId: string): string {
  for (const line of promptSource.split('\n')) {
    // match[1] ist unter noUncheckedIndexedAccess `string | undefined` —
    // die Gruppe ist bei einem Treffer zwar immer belegt, aber der Beweis
    // gehört in den Code, nicht in den Kopf des Lesers (Durchsicht-Fix).
    const title = /^#[ \t]+(.+?)[ \t]*$/.exec(line)?.[1]
    if (title) return title
  }
  return `${subjectType} ${subjectId}`.trim()
}

export interface NotificationInput {
  status: RunFinalStatus
  promptSource: string
  subjectType: string
  subjectId: string
}

/**
 * Die `osascript`-Argumente für die End-Mitteilung — PUR. `null` heißt „keine
 * Mitteilung": bei `cancelled` (und jedem nicht gemeldeten Zustand) bewusst
 * nicht.
 */
export function buildNotificationArgs(input: NotificationInput): string[] | null {
  const text = NOTIFICATION_STATUS_TEXT[input.status as keyof typeof NOTIFICATION_STATUS_TEXT]
  if (!text) return null
  const title = notificationTitle(input.promptSource, input.subjectType, input.subjectId)
  return ['-e', `display notification ${appleScriptString(text)} with title ${appleScriptString(title)}`]
}

/**
 * Die Mitteilung wirklich zeigen — NIE getestet (siehe Kopf). Fehlt `osascript`
 * (kein macOS), scheitert der Start still; eine Mitteilung ist nie den Lauf
 * wert. Der Prozess wird `unref`t, damit er den Daemon nicht am Beenden hindert.
 */
export function showNotification(args: string[]): void {
  try {
    const child = spawn('osascript', args, { stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  }
  catch {
    // Nicht-macOS oder osascript unauffindbar: schlucken.
  }
}
