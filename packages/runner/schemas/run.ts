import { z } from 'zod'
import { PERMISSION_MODES } from '../shared/types/runner'

/**
 * Server-Validierung der Runner-Routen (docs/plans/AI-RUNNER.md § 5).
 *
 * Bewusst ohne t()-Factory: Betreiber-API, die Fehlertexte sind nicht
 * user-facing — dasselbe Muster wie `packages/tickets/schemas/ticket.ts`.
 * Die Obergrenzen sind KEIN Geschmack, sondern die Spalten-Budgets aus
 * `runner-001`: was hier durchrutscht, wirft Appwrite später mit einer
 * Meldung ab, die niemandem hilft.
 */

/**
 * Heute NUR `'ticket'`. Die Spalte ist neutral (§ 3.1) — die ERLAUBNIS ist es
 * nicht: ein neuer Subjekt-Typ ist eine bewusste Entscheidung (wer darf ihn
 * auslösen, wie sieht sein Prompt aus, wer verdrahtet die Anzeige?), keine
 * Nebenwirkung eines freien Textfeldes.
 */
export const RUN_SUBJECT_TYPES = ['ticket'] as const

/**
 * Der Auftrags-Text. 200 000 Zeichen wie der `pages`-Rumpf — die Spalte ist
 * MEDIUMTEXT (off-row), das Zeilenbudget von MariaDB begrenzt hier also
 * nichts. Was begrenzt: ein Prompt, der größer ist als das, ist kein Auftrag
 * mehr, sondern ein Datenleck aus einer Schleife.
 */
const MAX_PROMPT_CHARS = 200_000

export const createRunSchema = z.object({
  subjectType: z.enum(RUN_SUBJECT_TYPES),
  subjectId: z.string().trim().min(1).max(36),
  /** '' = beliebiger Runner (der erste, der fragt) */
  runnerId: z.string().trim().max(36).optional().default(''),
  /**
   * SCHLÜSSEL aus der lokalen Allowlist des Runners, NIE ein Pfad (§ 8.1).
   * Der Server kennt die Allowlist nicht und kann den Wert deshalb nicht
   * prüfen — genau so ist es gewollt: ein unbekannter Schlüssel lässt den
   * Lauf beim RUNNER scheitern (§ 7.2 Schritt 2), auf einem Rechner, der
   * seine eigenen Grenzen kennt.
   */
  repoKey: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(64),
  permissionMode: z.enum(PERMISSION_MODES),
  promptSource: z.string().min(1).max(MAX_PROMPT_CHARS),
  /*
   * `promptTrusted` STEHT HIER BEWUSST NICHT MEHR (SEC-038). Ob ein Auftrag als
   * geprüft gilt, bestimmt der SERVER aus der Herkunft des Subjekts
   * (`resolveRunSubjectTrust`, server/utils/runSubjectTrust.ts) — ein Wert aus
   * dem Body wäre die Selbstauskunft des Aufrufers. Schickt ein Client das Feld
   * trotzdem mit, verwirft Zod es (z.object entfernt unbekannte Schlüssel), und
   * keine Route liest es (Wächter in tests/runRoutes.test.ts).
   */
  /**
   * true ⇒ interaktiver Lauf: der Runner öffnet ein Terminal (§ 7.3). Optional
   * mit Default `false` (die SPALTE hat denselben Default) — fällt das Feld
   * einmal aus, ist der vorsichtige, headless Fall der eingestellte.
   */
  interactive: z.boolean().optional().default(false),
  /**
   * Wird als JSON in `runs.testCommands` (1000 Zeichen) gespeichert. Jeder
   * Eintrag muss EXAKT in der Liste stehen, die der gewählte Rechner meldet
   * (SEC-037, `checkRequestedTestCommands`) — deshalb hier KEIN `.trim()`:
   * eine stille Umformung würde aus einem nicht gelisteten Befehl einen
   * gelisteten machen.
   */
  testCommands: z.array(z.string().min(1).max(200)).max(10).optional().default([]),
  /** 0 = kein eigener Deckel; der Runner kappt ohnehin gegen seinen (§ 7.2) */
  maxBudgetUsd: z.number().nonnegative().max(100).optional().default(0),
  baseBranch: z.string().trim().max(255).optional().default(''),
})

/**
 * Eine Antwort auf eine `needs_input`-Rückfrage (§ 9). NUR der Antworttext —
 * alles andere (Rechner, Repo, Modell, Modus, Budget, Testbefehle) erbt die
 * Fortsetzungs-Route aus dem Vorgänger-Lauf, nie aus diesem Body; `promptTrusted`
 * ist höchstens so gut wie beim Vorgänger UND wie die heutige Herkunft des
 * Subjekts (§ 8.2, SEC-038: eine Fortsetzung wäscht die Herkunft nicht rein). Der
 * Vorgänger steckt in der Route (`:id`), nicht im Body — man kann sich keinen
 * fremden Lauf als Anker unterschieben.
 */
export const resumeRunSchema = z.object({
  answer: z.string().min(1).max(MAX_PROMPT_CHARS),
})

/**
 * Ein Bündel Fortschritt (§ 7.2 Schritt 6: „alle 2 s oder alle 20 Zeilen —
 * nicht je Zeile"). 50 ist der Deckel für ein Bündel, das nach einem
 * Netzabbruch nachgereicht wird.
 */
export const runEventsSchema = z.object({
  events: z.array(z.object({
    /** Monoton je Lauf — der Runner zählt, der Server verwirft Gesehenes */
    seq: z.number().int().nonnegative(),
    kind: z.enum(['status', 'tool', 'text', 'error']),
    message: z.string().max(4000),
    at: z.string().datetime({ offset: true }),
  })).min(1).max(50),
  /**
   * Beide ERST-WERT-Felder (§ 7.2 Schritt 1): der Runner meldet die vorab
   * gewürfelte Session-Id mit dem ersten Bündel, den Branch-Namen sobald die
   * CLI ihn vergeben hat. Optional, weil sie nur einmal mitreisen.
   */
  sessionId: z.string().uuid().optional(),
  workBranch: z.string().trim().max(255).optional(),
})

/**
 * Der Abschluss. Die vier Endzustände — `queued`/`claimed`/`running` stehen
 * hier bewusst NICHT: „fertig" ist ein Ende, keine Rückspulung.
 */
export const runFinishSchema = z.object({
  status: z.enum(['succeeded', 'needs_input', 'failed', 'cancelled']),
  /** JSON-Bericht: Commit, Diffstat, Tests, Kosten, Dauer (Spalte 6000) */
  resultJson: z.string().max(6000).optional().default(''),
  /** Klartext-Grund bei `failed` (Spalte 2000) */
  error: z.string().max(2000).optional().default(''),
  sessionId: z.string().uuid().optional(),
  workBranch: z.string().trim().max(255).optional(),
})

/**
 * Der Heartbeat. `capabilities` ist ein freies Objekt, weil es eine
 * ANZEIGE-KOPIE ist (§ 8.1) und keine Wahrheit: was der Runner wirklich
 * erlaubt, steht in seiner lokalen Config. Deshalb wird hier auch keine
 * Struktur erzwungen — nur die Größe, gemessen NACH dem Serialisieren
 * (die Spalte fasst 4000 Zeichen, und ein Objekt hat keine Länge).
 */
export const runnerHeartbeatSchema = z.object({
  capabilities: z.record(z.string(), z.unknown()).optional().default({}),
})

/** Registrierung eines Rechners (§ 5-Nachtrag, siehe Route) */
export const runnerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['local', 'ssh']).optional().default('local'),
})

/**
 * Einen Rechner ändern (Board). BEIDE Felder optional, und zwar mit
 * `.refine`-Netz: ein leerer Body wäre ein Schreibvorgang ohne Inhalt.
 *
 * `secretHash` steht hier bewusst NICHT — ein Secret rotiert man nicht per
 * PATCH, sondern über eine Route, deren Antwort das neue Token genau einmal
 * zeigt (wie die Registrierung).
 */
export const runnerUpdateSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  name: z.string().trim().min(1).max(120).optional(),
}).refine(body => body.status !== undefined || body.name !== undefined, {
  message: 'Nothing to update',
})
