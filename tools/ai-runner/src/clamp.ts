import type { RepoRule } from './config.ts'
import { PERMISSION_MODES, UNTRUSTED_PERMISSION_MODES, type PermissionMode } from './protocol.ts'

/**
 * Das Kappen gegen die lokale Allowlist — docs/archiv/AI-RUNNER.md § 7.2
 * Schritt 3 und § 8.2.
 *
 * „Kein Fehler, sondern stilles Herunterstufen mit einer Ereigniszeile" — das
 * ist die Regel aus § 7.2, und sie hat einen Grund: der Mensch am Board soll
 * einen Lauf bekommen, der etwas tut, und daneben lesen, was der Rechner davon
 * nicht erlaubt hat. Ein 400 auf einen an sich sinnvollen Auftrag wäre eine
 * Sackgasse ohne Erkenntnis.
 *
 * ALLES HIER IST PUR. Diese Funktionen SIND die Sicherung (§ 8.1: „Die Grenze
 * liegt auf dem Mac, nicht in der Website") — sie müssen einzeln prüfbar sein,
 * ohne dass ein Prozess startet (scripts/smoke.mjs).
 */

export interface ClampRequest {
  requestedMode: string
  requestedModel: string
  /** `runs.maxBudgetUsd`; 0 = kein eigener Deckel */
  requestedBudgetUsd: number
  promptTrusted: boolean
}

export interface ClampDecision {
  mode: PermissionMode
  model: string
  budgetUsd: number
  /** Je Herunterstufung eine Zeile für die Zeitleiste */
  notes: string[]
  /** Gesetzt, wenn GAR NICHTS erlaubt ist — dann scheitert der Lauf, statt still etwas anderes zu tun */
  rejection: { code: string, message: string } | null
}

/**
 * Die Rückfall-Reihenfolge, wenn der gewünschte Modus nicht erlaubt ist:
 * VORSICHTIGSTES ZUERST. `plan` schreibt gar nichts, `acceptEdits` nur Dateien
 * im Worktree. Ein Rückfall, der nach „möglichst nah am Wunsch" suchte, würde
 * aus einem gesperrten `bypassPermissions` ein `dontAsk` machen — also genau
 * die Rechte, die jemand gerade ausgeschlossen hat.
 */
const MODE_FALLBACK_ORDER: readonly PermissionMode[] = [
  'plan',
  'acceptEdits',
  'default',
  'auto',
  'dontAsk',
  'bypassPermissions',
]

function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value)
}

/**
 * Welche Modi bleiben übrig? ZWEI Filter, und beide müssen greifen:
 * die Repo-Allowlist (§ 8.1) UND — bei ungeprüftem Auftragstext — die
 * Injection-Sperre (§ 8.2). Der Server hat dieselbe Sperre; das hier ist die
 * zweite Sicherung, nicht die einzige.
 */
export function allowedModesFor(repo: Pick<RepoRule, 'allowedModes'>, promptTrusted: boolean): PermissionMode[] {
  const fromRepo = repo.allowedModes.filter(isPermissionMode)
  if (promptTrusted) return fromRepo
  return fromRepo.filter(mode => UNTRUSTED_PERMISSION_MODES.includes(mode))
}

export function clampRun(request: ClampRequest, repo: RepoRule): ClampDecision {
  const notes: string[] = []

  // ---- Modus -------------------------------------------------------------
  const allowed = allowedModesFor(repo, request.promptTrusted)
  let mode: PermissionMode = 'plan'
  let rejection: ClampDecision['rejection'] = null

  if (!allowed.length) {
    // Kein Rückfall möglich: bei ungeprüftem Text erlaubt dieses Repo weder
    // `plan` noch `acceptEdits`. Das ist eine bewusste Einstellung und keine
    // Panne — der Lauf scheitert sichtbar.
    rejection = {
      code: 'mode_not_allowed',
      message: request.promptTrusted
        ? `Repo „${repo.key}" erlaubt keinen gültigen Berechtigungs-Modus`
        : `Repo „${repo.key}" erlaubt für ungeprüfte Aufträge weder plan noch acceptEdits (§ 8.2)`,
    }
  }
  else if (isPermissionMode(request.requestedMode) && allowed.includes(request.requestedMode)) {
    mode = request.requestedMode
  }
  else {
    const fallback = MODE_FALLBACK_ORDER.find(candidate => allowed.includes(candidate)) ?? allowed[0]!
    mode = fallback
    const reason = !isPermissionMode(request.requestedMode)
      ? 'unbekannt'
      : request.promptTrusted
        ? 'nicht in der lokalen Allowlist'
        : 'für ungeprüfte Aufträge gesperrt (§ 8.2)'
    notes.push(`Modus „${request.requestedMode}" ${reason} — begrenzt auf „${fallback}"`)
  }

  // ---- Modell ------------------------------------------------------------
  let model = request.requestedModel.trim()
  if (repo.allowedModels) {
    if (!model || !repo.allowedModels.includes(model)) {
      const fallback = repo.allowedModels[0]!
      notes.push(`Modell „${model || '—'}" nicht freigegeben — ersetzt durch „${fallback}"`)
      model = fallback
    }
  }
  else if (!model) {
    // Ohne Modell startet die CLI mit ihrer eigenen Vorgabe; wir sagen es nur.
    notes.push('Kein Modell angegeben — die CLI wählt ihre Vorgabe')
  }

  // ---- Budget ------------------------------------------------------------
  const requested = request.requestedBudgetUsd > 0 ? request.requestedBudgetUsd : Number.POSITIVE_INFINITY
  const budgetUsd = Math.min(requested, repo.maxBudgetUsd)
  if (budgetUsd < requested) {
    notes.push(`Budget auf ${budgetUsd} USD begrenzt (Deckel des Repos „${repo.key}")`)
  }

  return { mode, model, budgetUsd, notes, rejection }
}
