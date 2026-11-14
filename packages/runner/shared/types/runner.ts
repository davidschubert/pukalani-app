import type { Models } from 'node-appwrite'

/**
 * Datenmodell des AI-Runners — docs/plans/AI-RUNNER.md § 4.
 *
 * Alle drei Tabellen laufen mit `rowSecurity: false` und werden
 * AUSSCHLIESSLICH über Server-Routen (Admin-Client) geschrieben; gelesen wird
 * nur mit dem Label `admin` (§ 4: Repo-Schlüssel, Branch-Namen und Kosten
 * eines fremden Rechners sind keine Moderations-Sache).
 */

export const RUNNERS_TABLE = 'runners'
export const RUNS_TABLE = 'runs'
export const RUN_EVENTS_TABLE = 'run_events'

/**
 * Die Ende-Markierung eines interaktiven Laufs (§ 7.3). Der SessionEnd-Hook
 * meldet das Ende an `POST …/session-end`; die Route legt GENAU diese Zeile in
 * `run_events` ab. Zwei Aufgaben in einer: sie macht das Ende in der Zeitleiste
 * sichtbar UND ist der migrationsfreie Speicher, an dem `GET …/session-end` das
 * Ende erkennt (es gibt keine eigene Spalte dafür). Der Text ist deshalb Marke
 * UND Anzeige — beide Routen vergleichen ihn wörtlich.
 */
export const INTERACTIVE_SESSION_END_MARKER = 'Interaktive Sitzung beendet.'
/**
 * EIGENER Bucket, bewusst NICHT `ticket-files` (§ 4): dessen Upload-Route
 * verlangt Session + `tickets.manage` — der Runner hat nur sein
 * Bearer-Secret —, und `runner` kennt `tickets` ohnehin nicht (A14).
 */
export const RUNNER_FILES_BUCKET = 'runner-files'

/**
 * Der Zustandsautomat eines Laufs (§ 4):
 *
 *   draft → queued → claimed → running → ┬→ succeeded
 *                                        ├→ needs_input  (Rückfrage, per --resume weiter)
 *                                        ├→ failed
 *                                        └→ cancelled
 *
 * `queued → cancelled` muss auch VOR dem Claim gehen (Knopf „Abbrechen").
 *
 * `draft` IST DIE ANTWORT AUF EIN WETTRENNEN (Paket 3): ein Anhang braucht
 * eine `runId`, existiert also erst NACH dem Anlegen — und ein `queued`-Lauf
 * kann binnen Sekunden geclaimt sein, während der Browser noch die zweite
 * Datei hochlädt. Der Runner bekäme dann einen Auftrag, dessen Material erst
 * halb da ist, und weil er die Anhänge einmal am Anfang zieht (§ 7.2 Schritt
 * 4), fiele der Rest still unter den Tisch. Deshalb legt das Board IMMER
 * `draft` an, lädt hoch und schaltet mit `runs/:id/queue` frei. Ab dann ist
 * der Auftrag VERSIEGELT: die Upload-Route antwortet 409.
 *
 * `draft` ist NICHT terminal (es geht ja weiter) und für den RUNNER nicht
 * sichtbar — `claim` filtert auf `queued`, und die Zustandstabelle gibt dem
 * Runner keinen Übergang aus `draft` (tests/runGuards.test.ts prüft genau das).
 */
export const RUN_STATUSES = [
  'draft',
  'queued',
  'claimed',
  'running',
  'succeeded',
  'needs_input',
  'failed',
  'cancelled',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/**
 * Berechtigungs-Modi der Claude-Code-CLI (`--permission-mode`). Die Liste ist
 * eine ANZEIGE-Menge, keine Erlaubnis: was wirklich zulässig ist, entscheidet
 * die LOKALE Allowlist auf dem Rechner des Runners (§ 8.1) — die Datenbank
 * darf auswählen, was der Runner erlaubt, nie umgekehrt.
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

/** Ein registrierter Rechner — ein Eintrag je Runner. */
export interface RunnerRow extends Models.Row {
  /** Anzeigename, z. B. „MacBook Pro (David)" */
  name: string
  /** Reine Anzeige — WIE der Runner arbeitet, entscheidet er selbst */
  kind: 'local' | 'ssh'
  /**
   * HASH des Bearer-Secrets (M9-Muster wie `community_invites.tokenHash`),
   * nie der Klartext: die Zeile ist für jeden Admin lesbar, das Secret ist
   * Code-Ausführung auf einem fremden Rechner.
   */
  secretHash: string
  /**
   * Was der Runner beim Heartbeat meldet (JSON: Repos, Modelle, erlaubte
   * Modi). ANZEIGE-KOPIE, keine Wahrheit (§ 8.1) — die Allowlist liegt lokal.
   */
  capabilitiesJson: string
  /** Letzter Claim-Poll; null = hat sich nie gemeldet */
  lastSeenAt: string | null
  status: 'active' | 'disabled'
}

/** Ein Auftrag. Der Zustandsautomat lebt hier. */
export interface RunRow extends Models.Row {
  /**
   * NEUTRALER Bezug statt `ticketId` (§ 3.1): heute nur `'ticket'`, später
   * auch Roadmap-Eintrag oder GitHub-Issue — ohne Migration und ohne dass
   * dieser Layer `tickets` kennen muss (A14).
   */
  subjectType: string
  subjectId: string
  /** Ziel-Runner; '' = beliebiger */
  runnerId: string
  /** Heute immer 'claude-code' — die Spalte spart später eine Migration */
  executor: string
  status: RunStatus
  /** SCHLÜSSEL aus der Runner-Allowlist, NIE ein Pfad (§ 8.1) */
  repoKey: string
  baseBranch: string
  /**
   * Vom Runner AUSGELESEN, nicht erfunden: mit `--worktree` vergibt die CLI
   * den Namen selbst (gemessen 2026-08-17). '' = noch nicht bekannt.
   */
  workBranch: string
  /** 'fable' | 'opus' | 'sonnet' oder ein voller Modellname */
  model: string
  permissionMode: PermissionMode
  /** false = headless (MVP), true = Terminal öffnen (§ 7.3) */
  interactive: boolean
  /**
   * Der zusammengesetzte Auftrag, wie er abgeschickt wurde — MEDIUMTEXT
   * (off-row): Beschreibung + Checkliste + zitiertes Feedback sprengen sonst
   * das ~65-KB-Zeilenbudget von MariaDB (Lektion pages-002).
   */
  promptSource: string
  /**
   * BESTIMMT VOM SERVER (SEC-038): die Anlege-Route fragt die Herkunft des
   * Subjekts über `resolveRunSubjectTrust` ab — beim Ticket ist nur die
   * Herkunft `operator` geprüft —, und eine Fortsetzung ist nie besser als ihr
   * Vorgänger und die heutige Herkunft. Aus einem Body wird der Wert nie
   * gelesen.
   *
   * false z. B., wenn Text aus GAST-Feedback stammt (§ 8.2). Gast-Feedback ist ein
   * Prompt-Injection-Pfad: `feedback/index.post.ts` nimmt bewusst auch Gäste
   * an, und daraus wird per „Übernehmen" ein Ticket. Dass ein Mensch geklickt
   * hat, ist kein Schutz — er liest nicht jede Zeile. Bei false wird der
   * fremde Text in `prompt.md` als DATEN gerahmt und `permissionMode` auf
   * `plan`/`acceptEdits` begrenzt; die Sperre sitzt serverseitig UND im
   * Runner, nie nur in einer ausgegrauten Schaltfläche.
   */
  promptTrusted: boolean
  /** JSON string[], z. B. ["pnpm lint","pnpm -r test"]; '' = keine */
  testCommands: string
  /**
   * JSON `RunAttachment[]` (Migration `runner-002`); '' = keine.
   *
   * EINE KOPIE, kein Verweis (§ 6): die Datei liegt im Bucket `runner-files`
   * dieses Layers, nicht im `ticket-files`-Bucket eines fremden Produkts —
   * `runner` kennt `tickets` nicht (A14), und der Runner hat für dessen
   * Session-Routen ohnehin kein Passierschein. Der Preis ist doppelter
   * Speicher; der Gegenwert ist ein Auftrag, der sich nicht mehr ändert,
   * nachdem er abgeschickt wurde.
   *
   * Die LISTE ist zugleich die Erlaubnis: `runs/:id/files/:fileId` liefert nur
   * aus, was hier steht — sonst wäre die Route ein freier Bucket-Zugriff über
   * geratene Ids.
   */
  attachmentsJson: string
  /** Kosten-Deckel in USD; 0 = kein eigener — der Runner kappt ohnehin gegen seinen */
  maxBudgetUsd: number
  /**
   * UUID, VOR dem Start vergeben (§ 7.2): so kennt das Ticket seine Session ab
   * Sekunde null und `--resume` trägt auch dann noch, wenn der Runner
   * zwischendurch abstürzt.
   *
   * BEI EINER FORTSETZUNG (`resumeSessionId` gesetzt) steht sie erst am ENDE
   * fest — dann startet der Runner mit `--resume` statt `--session-id` und liest
   * die NEUE Session-Id aus dem Abschluss-JSON (§ 9). Bis dahin '' .
   */
  sessionId: string
  /**
   * Die `sessionId` des VORGÄNGER-Laufs, wenn dieser Lauf eine Antwort auf eine
   * `needs_input`-Rückfrage ist (Migration `runner-003`); '' = gewöhnlicher
   * Lauf. Ist sie gesetzt, startet der Runner `claude --resume <sessionId>`
   * statt `--session-id` (§ 9).
   *
   * SIE KOMMT AUS DEM VORGÄNGER, NIE VOM AUFRUFER: die Fortsetzungs-Route liest
   * sie aus dem `needs_input`-Lauf und vererbt zugleich dessen `promptTrusted`
   * (§ 8.2 — eine Fortsetzung wäscht die Herkunft nicht rein).
   */
  resumeSessionId: string
  claimedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  /** JSON: Commit, Diffstat, Tests, Kosten, Dauer; '' = noch keins */
  resultJson: string
  /** Klartext-Grund bei `failed`; '' = keiner */
  error: string
  createdBy: string
}

/**
 * Eine Zeile Fortschritt — das ist die Live-Anzeige (§ 4). Hier landet
 * BEWUSST NICHT das komplette `stream-json`: der Runner verdichtet auf
 * Statuszeilen, Werkzeugaufrufe mit Ziel und Fehler; das volle Transkript
 * geht als Datei in den Bucket `runner-files`.
 */
export interface RunEventRow extends Models.Row {
  runId: string
  /** Monoton je Lauf — der Runner zählt, der Server ordnet danach */
  seq: number
  kind: 'status' | 'tool' | 'text' | 'error'
  message: string
  at: string
}

/**
 * Ein Runner, wie ihn das Board zu sehen bekommt: OHNE `secretHash`.
 *
 * Ein Hash ist kein Klartext — aber im Browser hat er trotzdem nichts
 * verloren. Er ist ein unsalted SHA-256; wer ihn hat, kann offline gegen ein
 * kurzes oder erratbares Secret rechnen, ohne dass eine einzige Anfrage im
 * Rate-Limit auftaucht. Die Zeile ist ohnehin nur für `admin` lesbar (§ 4) —
 * das hier ist die zweite Schicht, nicht die einzige.
 */
export type RunnerPublic = Omit<RunnerRow, 'secretHash'>

/** GET /api/runner/runs?subjectType=…&subjectId=… */
export interface RunsListResponse {
  runs: RunRow[]
}

/** GET /api/runner/runners */
export interface RunnersListResponse {
  runners: RunnerPublic[]
}

/**
 * POST /api/runner/runners — die Registrierung.
 *
 * `token` erscheint GENAU EINMAL, nämlich hier. Danach existiert im System nur
 * noch sein Hash; wer ihn verliert, registriert einen neuen Runner (oder
 * bekommt später ein Rotieren). Das ist dasselbe Versprechen wie beim
 * Einladungs-Token (M9-Muster) und der Grund, warum die Antwort nicht
 * wiederholbar ist.
 */
export interface RunnerCreatedResponse {
  runner: RunnerPublic
  token: string
}

/**
 * POST /api/runner/runs/claim — höchstens EIN Lauf, `null` = nichts zu tun.
 * `null` ist der Normalfall: der Runner fragt alle paar Sekunden.
 */
export interface ClaimResponse {
  run: RunRow | null
}

/**
 * POST /api/runner/runs/:id/events — die Quittung.
 *
 * `status` ist der GRUND, warum diese Route überhaupt etwas zurückgibt: der
 * Runner erfährt hier (und nur hier), dass das Board seinen Lauf abgebrochen
 * hat (§ 9). `accepted` sagt, wie viele Zeilen wirklich geschrieben wurden —
 * ein Wiederholungsversuch nach Netzabbruch liefert 0, ohne dass etwas
 * doppelt in der Zeitleiste steht.
 */
export interface EventsAckResponse {
  status: RunStatus
  accepted: number
}

/** POST /api/runner/runs/:id/finish */
export interface RunFinishResponse {
  run: RunRow
}

/** POST /api/runner/runs/:id/transcript */
export interface TranscriptUploadResponse {
  fileId: string
}

/** POST /api/runner/runners/heartbeat */
export interface HeartbeatResponse {
  ok: true
  lastSeenAt: string
}

/**
 * Ein Anhang eines Laufs — die Kopie im Bucket `runner-files` (§ 6).
 *
 * `fileId` ist die Bucket-Id, `name` der Anzeige- und Dateiname beim Runner.
 * `mimeType` kommt aus der Magic-Bytes-Erkennung des Servers, NIE aus dem
 * Client (die Client-Mime ist Angreifer-Eingabe).
 */
export interface RunAttachment {
  fileId: string
  name: string
  mimeType: string
  size: number
}

/** Höchstens so viele Anhänge je Lauf — darüber 409 `too_many_files`. */
export const MAX_RUN_ATTACHMENTS = 10

/** GET /api/runner/runs/:id/files (Runner-Naht) */
export interface RunAttachmentsResponse {
  attachments: RunAttachment[]
}

/** POST /api/runner/runs/:id/files (Board) — der Stand NACH dem Hochladen */
export interface RunAttachmentAddedResponse {
  attachment: RunAttachment
  attachments: RunAttachment[]
}

/**
 * GET /api/runner/runs/:id/events (Board) — der ERSTE Stand der Zeitleiste.
 *
 * Danach übernimmt Realtime (`run_events` trägt Table-Read für `admin`, § 4).
 * Bewusst getrennt: ein Fenster, das mitten im Lauf geöffnet wird, hat sonst
 * nur die Zeilen, die NACH dem Öffnen entstanden sind.
 */
export interface RunEventsListResponse {
  events: RunEventRow[]
}

/** GET /api/runner/runs/recent (Board) — über ALLE Subjekte, neueste zuerst */
export interface RecentRunsResponse {
  runs: RunRow[]
}

/** PATCH /api/runner/runners/:id (Board) — stilllegen/aktivieren, umbenennen */
export interface RunnerUpdatedResponse {
  runner: RunnerPublic
}

/**
 * Was das Start-Formular an den Lauf-Bereich meldet (Paket 3, UI-Vertrag).
 *
 * BEWUSST OHNE `promptSource`/`promptTrusted`/`subject*`: die kommen von dem,
 * der den Bereich einbindet (das Ticket-Modal), nicht aus dem Formular. Wer
 * den Auftrag WÄHLT und wer ihn STELLT, sind zwei verschiedene Rollen — und
 * `promptTrusted` aus einem Formular entgegenzunehmen wäre § 8.2 verkehrt
 * herum. Seit SEC-038 bestimmt es ohnehin allein der Server.
 */
export interface RunStartOptions {
  runnerId: string
  model: string
  permissionMode: PermissionMode
  repoKey: string
  maxBudgetUsd: number
  testCommands: string[]
  /**
   * true ⇒ der Runner öffnet ein Terminal-Fenster und lässt Claude Code im
   * Vordergrund laufen (§ 7.3) — zum Zuschauen und Genehmigen. Nur sinnvoll auf
   * einem lokalen Rechner; ein SSH-Runner kann kein Fenster öffnen.
   */
  interactive: boolean
}

/**
 * GET /api/runner/runs/:id/session-end (Runner-Naht, § 7.3) — der Poll, mit dem
 * der Daemon eines interaktiven Laufs auf das Ende der Sitzung wartet. `ended`
 * wird true, sobald der SessionEnd-Hook die Markierung geschrieben hat; `seq`
 * ist ihre Sequenz (der Runner richtet seinen Zähler daran aus), `status` deckt
 * einen Board-Abbruch auf.
 */
export interface SessionEndStateResponse {
  ended: boolean
  status: RunStatus
  seq: number
}

/** POST /api/runner/runs/:id/session-end (Runner-Naht, § 7.3) — die Quittung des Hooks. */
export interface SessionEndReportResponse {
  ok: true
  seq: number
}

/**
 * Eine Anhang-QUELLE für den Lauf-Bereich (Paket 3, UI-Vertrag) — bewusst
 * LAZY: `blob()` wird erst gerufen, wenn ein Lauf tatsächlich startet.
 *
 * Der Grund ist der Ort: der Bereich hängt im Ticket-Modal, das JEDE geöffnete
 * Karte rendert. Würde er die Dateien beim Anzeigen laden, zöge jedes Öffnen
 * einer Karte mit drei Screenshots drei Downloads nach sich — für einen Knopf,
 * den man selten drückt.
 */
export interface RunAttachmentSource {
  name: string
  blob: () => Promise<Blob>
}
