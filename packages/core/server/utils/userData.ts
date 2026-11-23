import type { H3Event } from 'h3'
import type { AccountDeletionWarning } from '../../shared/accountDeletion'

/**
 * UserDataContributor-Vertrag (GDPR-Export/-Löschung, CONCEPT A14).
 *
 * Produkt-Layer BESITZEN ihre Daten — core darf ihre Schemas nicht kennen.
 * Stattdessen registriert jeder Layer beim Serverstart (Nitro-Plugin
 * `server/plugins/user-data.ts`) einen Contributor; core orchestriert Export
 * und Löschung über diese Registry (userDataOrchestration.ts), ohne ein
 * einziges Produkt-Schema zu importieren. Gleiches Kompositionsprinzip wie
 * `pukalani.admin.modules`: Apps ohne einen Layer haben dessen Plugin nicht →
 * die Registry ist automatisch korrekt besetzt.
 */

export interface UserDataDeleteResult {
  /** hart gelöschte Rows/Dateien */
  deleted: number
  /** in-place anonymisierte/pseudonymisierte Rows */
  anonymized: number
}

/**
 * WER DEN EXPORT BEKOMMT (SEC-034, Davids Entscheidung 2026-11-12):
 *   · `self`     — die Person selbst (`GET /api/auth/export`, Art. 15):
 *                  vollständig, so wie sie es im Produkt sieht.
 *   · `operator` — der Betreiber (Export in der Konsole UND die Kopie vor
 *                  einer Löschung, 30 Tage im gdpr-exports-Bucket): nur, was
 *                  ein Betreiber für Auskunft und Nachweis braucht. Was zwei
 *                  Menschen privat miteinander geschrieben haben, gehört NICHT
 *                  dazu (messages gibt dort nur Gesprächs-Eckdaten und Zähler).
 * Ein Beitrag, der für beide dasselbe liefert, muss den Kontext nicht lesen.
 */
export type UserDataAudience = 'self' | 'operator'

export interface UserDataExportContext {
  audience: UserDataAudience
}

export interface UserDataContributor {
  /** stabil + eindeutig, z. B. 'comments', 'moderation', 'system' */
  id: string
  /**
   * Alle Daten des Users als export-fertiges, JSON-serialisierbares Objekt.
   * MUSS intern vollständig paginieren (listAllRows). Darf werfen — der
   * Orchestrator entscheidet über das Teilfehler-Reporting.
   * `context.audience` sagt, WER den Export bekommt (siehe oben) — ein
   * neuer Beitrag mit privaten Inhalten Dritter beachtet ihn.
   */
  exportUserData(event: H3Event, userId: string, context: UserDataExportContext): Promise<unknown>
  /**
   * Löscht/anonymisiert alle Daten des Users im eigenen Layer.
   * MUSS idempotent sein: ein Re-Run nach Teilfehler findet Rest-Daten
   * (oder nichts) und terminiert erfolgreich.
   */
  deleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult>
  /**
   * OPTIONAL: was die Person VOR dem Löschen des eigenen Kontos wissen muss
   * (`GET /api/auth/account/deletion-check`) — z. B. „du bist der einzige
   * Inhaber von …". Nur lesen, nichts ändern; eine Warnung verhindert die
   * Löschung nicht. Darf werfen: die Seite sagt dann, dass die Liste
   * unvollständig ist.
   */
  deletionWarnings?(event: H3Event, userId: string): Promise<AccountDeletionWarning[]>
}

const contributors = new Map<string, UserDataContributor>()

/** Registrierung ist idempotent (HMR/Doppel-Plugin überschreibt nur sich selbst). */
export function registerUserDataContributor(contributor: UserDataContributor): void {
  contributors.set(contributor.id, contributor)
}

/** Deterministische Reihenfolge — unabhängig von der Plugin-Ladereihenfolge. */
export function listUserDataContributors(): UserDataContributor[] {
  return [...contributors.values()].sort((a, b) => a.id.localeCompare(b.id))
}
