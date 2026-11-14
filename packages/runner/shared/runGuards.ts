import { PERMISSION_MODES, type PermissionMode, type RunStatus } from './types/runner'

/**
 * Die zwei puren Regeln des AI-Runners — docs/plans/AI-RUNNER.md § 4 (der
 * Zustandsautomat) und § 8.2 (die Modus-Sperre für ungeprüfte Prompts).
 *
 * BEWUSST PUR UND BEWUSST HIER: beide Regeln werden an mehreren Stellen
 * gebraucht (Anlege-Route, Runner-Routen, später die Oberfläche und der
 * Mac-Daemon), und beide sind Sicherungen. Eine Sicherung, die in einem
 * Handler zwischen zwei Appwrite-Aufrufen steht, lässt sich nicht einzeln
 * gegenprüfen — diese hier schon (tests/runGuards.test.ts).
 */

/**
 * Wer eine Zustandsänderung auslöst. Zwei Publikums-Klassen, streng getrennt
 * (§ 5): das BOARD spricht mit Session + Capability `runner.manage`, der
 * RUNNER mit seinem Bearer-Secret. Sie dürfen ausdrücklich NICHT dasselbe.
 */
export type RunActor = 'board' | 'runner'

/**
 * Endzustände. Aus ihnen führt KEIN Weg zurück — auch nicht `needs_input`:
 * eine Rückfrage wird über einen NEUEN Lauf mit `--resume` fortgesetzt
 * (§ 4, § 9), nicht durch Wiederbelebung des alten. Sonst hätte ein Lauf zwei
 * Berichte, zwei Kostenzeilen und keine ehrliche Dauer.
 */
export const TERMINAL_RUN_STATUSES = ['succeeded', 'needs_input', 'failed', 'cancelled'] as const

/**
 * Zustände, in denen ein Lauf noch NICHT beim Runner ist und die Oberfläche
 * das Formular bzw. die Zeitleiste zeigt — die Gegenmenge zu den Endzuständen.
 * `draft` gehört dazu: er ist angelegt, aber noch nicht freigegeben.
 */
export function isActiveRunStatus(status: RunStatus): boolean {
  return !isTerminalRunStatus(status)
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(status)
}

/**
 * Die Modi, die ein Lauf mit UNGEPRÜFTEM Auftragstext haben darf (§ 8.2).
 *
 * `promptTrusted: false` heißt: der Text ist nicht nachweislich vom Betreiber
 * geschrieben — z. B. Gast-Feedback, aus dem per „Übernehmen" ein Ticket wurde.
 * Bestimmt wird der Wert vom SERVER aus der Herkunft des Subjekts (SEC-038). Das ist ein Prompt-Injection-Pfad,
 * und dass ein Mensch geklickt hat, ist kein Schutz (er liest nicht jede
 * Zeile). `plan` schreibt gar nichts, `acceptEdits` schreibt nur Dateien im
 * Worktree; `dontAsk` und `bypassPermissions` würden einem fremden Text die
 * volle Werkzeugkiste auf Davids Rechner geben.
 */
export const UNTRUSTED_PERMISSION_MODES = ['plan', 'acceptEdits'] as const

/**
 * Darf dieser Berechtigungs-Modus für diesen Auftrag gewählt werden? (§ 8.2)
 *
 * Die Sperre sitzt SERVERSEITIG beim Anlegen des Laufs UND im Runner. Eine
 * Oberfläche, die den Knopf ausgraut, ist keine Sicherung — sie ist eine
 * Höflichkeit gegenüber dem, der das Formular benutzt.
 */
export function permissionModeAllowed(mode: PermissionMode, promptTrusted: boolean): boolean {
  if (!(PERMISSION_MODES as readonly string[]).includes(mode)) return false
  if (promptTrusted) return true
  return (UNTRUSTED_PERMISSION_MODES as readonly string[]).includes(mode)
}

/**
 * Der Zustandsautomat aus § 4, als Tabelle statt als verstreute if-Ketten:
 *
 *   draft → queued → claimed → running → ┬→ succeeded
 *                                        ├→ needs_input
 *                                        ├→ failed
 *                                        └→ cancelled
 *
 * Drei Dinge, die die Tabelle über das Bild hinaus festhält:
 *
 *  1. `queued → cancelled` muss auch VOR dem Claim gehen (Knopf „Abbrechen",
 *     § 4) — deshalb steht `queued` beim Board.
 *  2. Der Runner darf `claimed` direkt beenden, ohne über `running` zu gehen.
 *     Ein Lauf, der schon beim Auflösen des `repoKey` scheitert (§ 7.2
 *     Schritt 2), hat nie gestartet — ihn erst künstlich auf `running` zu
 *     heben, wäre eine erfundene Startzeit im Bericht.
 *  3. `draft` STEHT NUR BEIM BOARD, und das ist die eigentliche Sicherung des
 *     Anhänge-Wettrennens: der Runner hat aus `draft` KEINEN Übergang, kann
 *     einen halb bestückten Auftrag also nicht einmal dann greifen, wenn ein
 *     künftiger Filter in `claim` ihn versehentlich mitliefert. Die zwei Wege
 *     hinaus gehören dem Board — freigeben (`queue`) oder wegwerfen
 *     (`cancelled`, für den Fall, dass ein Upload scheitert und niemand mehr
 *     freigibt).
 *
 * `queued → claimed` steht zwar hier, passiert aber AUSSCHLIESSLICH in
 * `runs/claim.post.ts` (serialisiert, § 5): ein Runner kann sich keinen
 * bestimmten Lauf aussuchen.
 */
const RUN_TRANSITIONS: Record<RunActor, Partial<Record<RunStatus, readonly RunStatus[]>>> = {
  board: {
    draft: ['queued', 'cancelled'],
    queued: ['cancelled'],
    claimed: ['cancelled'],
    running: ['cancelled'],
  },
  runner: {
    queued: ['claimed'],
    claimed: ['running', 'succeeded', 'needs_input', 'failed', 'cancelled'],
    running: ['succeeded', 'needs_input', 'failed', 'cancelled'],
  },
}

/**
 * Ist dieser Übergang für diesen Handelnden erlaubt? (§ 4)
 *
 * Terminale Ausgangszustände stehen in KEINER Zeile der Tabelle — sie sind
 * damit für jeden Handelnden zu, ohne Sonderfall im Code. Ein Lauf, den das
 * Board abgebrochen hat, bleibt also abgebrochen, auch wenn der Runner danach
 * noch ein `finish: succeeded` schickt (er lief bis zur nächsten
 * Ereignis-Antwort weiter und erfährt den Abbruch erst dort, § 9).
 */
export function runTransitionAllowed(from: RunStatus, to: RunStatus, actor: RunActor): boolean {
  return (RUN_TRANSITIONS[actor][from] ?? []).includes(to)
}

/**
 * Die Felder eines Vorgänger-Laufs, die eine Fortsetzung erbt — docs/plans/
 * AI-RUNNER.md § 4 / § 9. Bewusst eine EIGENE Schnittstelle statt `RunRow`:
 * die Regel ist pur und soll ohne `node-appwrite` prüfbar sein (die
 * Layer-Row hängt an `Models.Row`).
 */
export interface ResumePredecessor {
  status: RunStatus
  /** Die Session, an die `--resume` anknüpft. Leer ⇒ es gibt nichts fortzusetzen. */
  sessionId: string
  subjectType: string
  subjectId: string
  runnerId: string
  repoKey: string
  baseBranch: string
  model: string
  permissionMode: PermissionMode
  /** Obergrenze der Fortsetzung (§ 8.2) — nie neu aus einem Body gelesen. */
  promptTrusted: boolean
  testCommands: string
  maxBudgetUsd: number
}

/**
 * Die Felder eines Fortsetzungs-Laufs — das, was `buildResumeRunFields`
 * zusammenstellt. Genau die Spalten, die ein neuer Lauf zum Anknüpfen braucht;
 * `sessionId`, `claimedAt` u. Ä. bleiben leer und werden erst im Lauf gesetzt.
 */
export interface ResumeRunFields {
  subjectType: string
  subjectId: string
  runnerId: string
  repoKey: string
  baseBranch: string
  model: string
  permissionMode: PermissionMode
  promptTrusted: boolean
  promptSource: string
  testCommands: string
  maxBudgetUsd: number
  resumeSessionId: string
}

/**
 * Darf dieser Lauf fortgesetzt werden? (§ 4 / § 9)
 *
 * Genau dann, wenn er eine RÜCKFRAGE ist (`needs_input`) UND eine Session hat,
 * an die man anknüpfen kann. Jeder andere Endzustand ist keine offene Frage,
 * und ein `needs_input` OHNE Session (der Lauf brach vor dem ersten
 * Lebenszeichen ab) hat nichts, worauf `--resume` zeigen könnte — beides ergibt
 * an der Route ein 409. Die Regel ist der eine Wächter der Fortsetzungs-Route
 * und wird einzeln gegengeprüft (tests/runGuards.test.ts).
 */
export function runResumeAllowed(predecessor: Pick<ResumePredecessor, 'status' | 'sessionId'>): boolean {
  return predecessor.status === 'needs_input' && predecessor.sessionId.length > 0
}

/**
 * Die Felder des Fortsetzungs-Laufs aus dem Vorgänger + der Antwort (§ 9).
 *
 * DIE VERERBUNGS-REGEL, an einer Stelle: alles kommt aus dem VORGÄNGER —
 * Subjekt, Ziel-Rechner (der Session-File liegt genau dort), Repo, Modell,
 * Modus, Testbefehle, Budget. NUR der Auftragstext ist neu (die Antwort), und
 * `resumeSessionId` verweist auf die Vorgänger-Session.
 *
 * `promptTrusted` WIRD NIE BESSER (§ 8.2, SEC-038): die Fortsetzung ist
 * geprüft, wenn der Vorgänger es war UND das Subjekt es HEUTE noch ist
 * (`subjectTrusted`, vom Server über `resolveRunSubjectTrust` bestimmt). War
 * der Ursprung ungeprüft, bleibt die Fortsetzung ungeprüft — sonst wäre die
 * Antwort ein Weg, die Modus-Sperre zu umgehen; und ist das Ticket seither von
 * fremder Hand umgeschrieben, wird sie es. Ein Aufrufer-Body kommt hier nie an.
 * Verglichen wird strikt mit `true`: ein Alt-Wert, der kein Boolean ist, zählt
 * als ungeprüft.
 */
export function buildResumeRunFields(predecessor: ResumePredecessor, answer: string, subjectTrusted: boolean): ResumeRunFields {
  return {
    subjectType: predecessor.subjectType,
    subjectId: predecessor.subjectId,
    runnerId: predecessor.runnerId,
    repoKey: predecessor.repoKey,
    baseBranch: predecessor.baseBranch,
    model: predecessor.model,
    permissionMode: predecessor.permissionMode,
    promptTrusted: predecessor.promptTrusted === true && subjectTrusted === true,
    promptSource: answer,
    testCommands: predecessor.testCommands,
    maxBudgetUsd: predecessor.maxBudgetUsd,
    resumeSessionId: predecessor.sessionId,
  }
}
