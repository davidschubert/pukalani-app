/**
 * Die Naht zur Betreiber-Konsole — docs/plans/AI-RUNNER.md § 5.
 *
 * BEWUSST EINE KOPIE der Typen aus `packages/runner/shared/types/runner.ts`
 * und KEIN Import: dieses Paket hat absichtlich keine einzige Laufzeit-
 * Abhängigkeit (nur `node:`-Builtins und das globale `fetch`), die Layer-Typen
 * hängen aber an `node-appwrite` (`Models.Row`). Ein Import zöge das SDK samt
 * seiner Transitiven auf einen Rechner, der davon nichts braucht — der Runner
 * spricht ausschliesslich HTTPS (§ 3.2: „der Runner braucht kein
 * Appwrite-SDK").
 *
 * Der Preis ist eine zweite Stelle, die sich bei einer Schema-Änderung bewegen
 * muss. Er ist bezahlbar, weil die Kopie NUR das enthält, was der Runner
 * tatsächlich liest — fällt ein Feld weg, merkt es der erste Lauf, und ein
 * neues Feld interessiert ihn nicht.
 */

export const PERMISSION_MODES = [
  'default',
  'auto',
  'plan',
  'acceptEdits',
  'dontAsk',
  'bypassPermissions',
] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * Die Modi, die ein Lauf mit UNGEPRÜFTEM Auftragstext haben darf (§ 8.2) —
 * dieselbe Liste wie `UNTRUSTED_PERMISSION_MODES` im Layer. Sie steht hier ein
 * zweites Mal, weil die Sperre „serverseitig UND im Runner" sitzt: eine
 * Sicherung, die nur an einem Ende hängt, ist keine.
 */
export const UNTRUSTED_PERMISSION_MODES: readonly PermissionMode[] = ['plan', 'acceptEdits']

export type RunStatus =
  | 'draft'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'needs_input'
  | 'failed'
  | 'cancelled'

/** Endzustände, die der Runner selbst melden darf (`runFinishSchema`). */
export type RunFinalStatus = 'succeeded' | 'needs_input' | 'failed' | 'cancelled'

/** Ein Auftrag, so wie ihn die Claim-Antwort liefert (nur die gelesenen Felder). */
export interface RunPayload {
  $id: string
  subjectType: string
  subjectId: string
  runnerId: string
  executor: string
  status: RunStatus
  /** SCHLÜSSEL aus der LOKALEN Allowlist, NIE ein Pfad (§ 8.1) */
  repoKey: string
  baseBranch: string
  workBranch: string
  model: string
  permissionMode: string
  interactive: boolean
  promptSource: string
  promptTrusted: boolean
  /** JSON `string[]`; '' = keine */
  testCommands: string
  maxBudgetUsd: number
  sessionId: string
  /**
   * '' = gewöhnlicher Lauf. Gesetzt ⇒ dieser Lauf ist eine Antwort auf eine
   * `needs_input`-Rückfrage: der Runner startet `claude --resume <sessionId>`
   * statt `--session-id` (§ 9) und liest die NEUE Session aus dem Abschluss-JSON.
   */
  resumeSessionId: string
}

export interface ClaimResponse {
  run: RunPayload | null
}

export interface RunAttachment {
  fileId: string
  name: string
  mimeType: string
  size: number
}

export interface RunAttachmentsResponse {
  attachments: RunAttachment[]
}

export type RunEventKind = 'status' | 'tool' | 'text' | 'error'

export interface RunEventPayload {
  seq: number
  kind: RunEventKind
  message: string
  /** ISO 8601 MIT Zeitzone — der Server prüft `datetime({ offset: true })` */
  at: string
}

export interface EventsAckResponse {
  /** DER Rückkanal für „Abbrechen" (§ 9) — es gibt keinen zweiten */
  status: RunStatus
  accepted: number
}

/**
 * Der Zustand eines interaktiven Laufs, wie ihn `GET …/session-end` liefert
 * (§ 7.3). `ended` wird true, sobald der SessionEnd-Hook das Ende gemeldet hat;
 * `status` verrät zusätzlich einen Abbruch vom Board (`cancelled`), den ein
 * interaktiver Lauf sonst nirgends erführe (kein Elternprozess liest mit).
 * `seq` ist die Sequenz der Ende-Markierung — der Runner richtet seinen
 * Ereigniszähler daran aus, bevor er den Abschluss meldet.
 */
export interface SessionEndState {
  ended: boolean
  status: RunStatus
  seq: number
}

export interface TranscriptUploadResponse {
  fileId: string
}

export interface HeartbeatResponse {
  ok: true
  lastSeenAt: string
}

/**
 * Ist diese Lauf-Id als Pfad-, Worktree- und URL-Bestandteil unbedenklich?
 *
 * Die Id kommt über die Naht und landet in `<stateDir>/runs/<id>/`, im
 * Worktree-Namen `ai-<id>` und in jeder Naht-URL. Appwrite-Ids erfüllen die
 * Form ohnehin (höchstens 36 Zeichen, Buchstaben, Ziffern, `.`, `_`, `-`, nicht
 * mit Sonderzeichen beginnend) — geprüft wird trotzdem HIER, weil ein Pfad
 * nicht davon sicher wird, dass die Gegenseite sich an ihre eigenen Regeln
 * hält. Kein `/`, kein führender Punkt ⇒ kein `..`, kein Ausbruch aus dem
 * Ordner.
 */
export function isSafeRunId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id)
}
