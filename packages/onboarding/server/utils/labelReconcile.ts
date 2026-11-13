import { communityLabelsFor, type LabelReconcileReader, type RemovedMembership } from '../../../control/shared/labelReconcile'

/**
 * DER STÜNDLICHE LABEL-ABGLEICH (SEC-024, seit 2026-11-13 — Davids
 * Entscheidung: „Zugang entziehen" prüft nach und meldet einen Fehlschlag, ein
 * stündlicher Lauf gleicht nach).
 *
 * WARUM ES IHN BRAUCHT: „Zugang entziehen" hat zwei Schritte in zwei
 * Projekten — das Control Plane setzt `community_members.status='removed'`,
 * danach nimmt die Platform-App dem Konto das Community-Label (das
 * Lese-Publikum, A5). Scheitert der zweite Schritt, meldet die Route das jetzt
 * (502 `label_revoke_failed`) — aber eine Meldung räumt nichts auf. Bis
 * SEC-024 heilte erst die Label-Middleware, wenn die ENTFERNTE Person den Host
 * wieder besuchte; wer still über Realtime oder einen anderen Host mitlas, tat
 * das nie. Beim Stilllegen einer Community antwortet ihr Host sogar 404 — dort
 * heilt die Middleware gar nichts mehr.
 *
 * WAS DER LAUF TUT: je `community_members`-Zeile mit `status='removed'` dieses
 * Runtime-Projekts das Konto lesen; trägt es das Community-Label ODER das
 * Moderations-Label dieser Community UND gibt es nachweislich keine Zeile MIT
 * Zugang (frisch gefragt, unmittelbar vorher), ist das eine Abweichung. Im
 * Modus `apply` entzieht er sie über den EINEN Schreiber
 * (`revokeCommunityLabel` → `mutateUserLabels`, inkl. Handle-Publikum).
 *
 * WAS ER NIE TUT: keine Vergabe; keine Betreiber-Rollen (`admin`/`moderator`
 * — der Schreiber nimmt NUR die zwei Labels dieser Community); keine Labels
 * ohne `removed`-Zeile — Bestands-Mitglieder aus der A4-Zeit tragen ein Label
 * OHNE Zeile und sind legitim (`trigger: 'legacy'`, tenant-isolation.md); nie
 * ein Konto, dessen Zeile inzwischen wieder `active` ist.
 *
 * WIEDERHOLBAR: der zweite Lauf findet dieselben `removed`-Zeilen, aber keine
 * Labels mehr — also nichts.
 *
 * DECKEL: höchstens `MAX_CANDIDATES` Zeilen je Lauf, mit Log-Zeile, wenn er
 * greift. Weil `removed`-Zeilen nie verschwinden, würde ein fester Deckel die
 * Zeilen dahinter NIE erreichen — der Lauf merkt sich deshalb den Cursor und
 * macht beim nächsten Mal HINTER der letzten Zeile weiter (im Prozess; nach
 * einem Neustart beginnt er vorn).
 *
 * KOSTEN je Lauf: die Seiten des Lesers (eine Abfrage je 100 Zeilen) plus ein
 * `users.get` je KONTO (nicht je Zeile: Zeilen werden je Konto gebündelt).
 * Nur bei einem Treffer kommen hinzu: eine `hasAccess`-Abfrage, im Modus
 * `apply` der Schreiber (ein Lesen + ein Schreiben + ein Nachlesen, höchstens
 * 3 + 2) und die Handle-Zeilen des Kontos.
 *
 * ARBEITSTEILUNG wie bei der Zahlungswarnung: LESEN gehört dem control-Layer
 * (`packages/control/server/utils/labelReconcileReader.ts`), die LOGIK hier,
 * VERDRAHTET in `apps/platform/server/plugins/label-reconcile.ts`.
 * Runbook: docs/runbooks/LABEL-ABGLEICH.md.
 */

export type LabelReconcileMode = 'off' | 'dry-run' | 'apply'

const MODES: readonly LabelReconcileMode[] = ['off', 'dry-run', 'apply']

/** Der Schalter `pukalani.community.labelReconcile`. Fehlt er ⇒ `off`;
 *  ein unbekannter Wert ⇒ `off` UND `invalid` (der Aufrufer schreibt die
 *  Fehlerzeile — nie still „irgendwas" annehmen). */
export function resolveLabelReconcileMode(value: unknown): { mode: LabelReconcileMode, invalid: boolean } {
  if (value === undefined || value === null || value === '') return { mode: 'off', invalid: false }
  if (typeof value === 'string' && (MODES as readonly string[]).includes(value)) {
    return { mode: value as LabelReconcileMode, invalid: false }
  }
  return { mode: 'off', invalid: true }
}

/** Höchstens so viele `removed`-Zeilen je Lauf. */
export const MAX_CANDIDATES = 1000

export interface LabelReconcileResult {
  mode: 'dry-run' | 'apply'
  /** Gelesene `removed`-Zeilen in diesem Lauf. */
  candidates: number
  /** Davon: Konto trägt noch ein Label dieser Community, kein Zugang. */
  stale: number
  /** Davon im Modus `apply` nachweislich entzogen. */
  revoked: number
  /** Konto nicht lesbar, Zugangs-Frage gescheitert oder Entzug gescheitert. */
  failed: number
  /** Konto gelöscht, Wert ist kein Label, oder Zeile inzwischen wieder mit Zugang. */
  skipped: number
  /** Der Deckel hat gegriffen — der nächste Lauf macht dahinter weiter. */
  truncated: boolean
}

export interface LabelReconcileDeps {
  reader: LabelReconcileReader
  runtimeProjectId: string
  /** Labels des Kontos; `null` = Konto gibt es nicht (404). Wirft bei Störung. */
  getUserLabels: (userId: string) => Promise<string[] | null>
  /** Der Entzug über den EINEN Schreiber. */
  revoke: (communityId: string, userId: string) => Promise<{ revoked: boolean }>
  maxCandidates?: number
}

/** Wo der nächste Lauf weiterliest (nur im Prozess, siehe Kopf). */
let resumeCursor: string | null = null

/** Nur für Tests. */
export function __resetLabelReconcileCursor(): void {
  resumeCursor = null
}

/** Reentranz-Guard (Single-Instanz-Annahme, wie beim Zahlungs-Lauf). */
let running = false

/**
 * EIN Lauf. Wirft nur, wenn schon die ERSTE Seite des Lesers scheitert (dann
 * gibt es nichts zu zählen); jeder Fehler eines einzelnen Kontos zählt als
 * `failed` und hält den Lauf nicht auf.
 */
export async function reconcileCommunityLabels(
  mode: 'dry-run' | 'apply',
  deps: LabelReconcileDeps,
): Promise<LabelReconcileResult> {
  const result: LabelReconcileResult = { mode, candidates: 0, stale: 0, revoked: 0, failed: 0, skipped: 0, truncated: false }
  if (running) {
    logEvent('warn', 'community_label.reconcile_busy', { mode })
    return result
  }
  running = true
  try {
    const limit = deps.maxCandidates ?? MAX_CANDIDATES
    const page = await deps.reader.listRemoved(deps.runtimeProjectId, { limit, after: resumeCursor })
    resumeCursor = page.nextCursor
    result.candidates = page.rows.length
    if (page.nextCursor) {
      result.truncated = true
      logEvent('warn', 'community_label.reconcile_truncated', { limit, resumeAfter: page.nextCursor })
    }

    // Je Konto EIN Lesen, egal in wie vielen Communities es entfernt wurde.
    const byUser = new Map<string, RemovedMembership[]>()
    for (const row of page.rows) {
      const list = byUser.get(row.userId) ?? []
      list.push(row)
      byUser.set(row.userId, list)
    }

    for (const [userId, rows] of byUser) {
      let labels: string[] | null
      try {
        labels = await deps.getUserLabels(userId)
      }
      catch {
        result.failed += rows.length
        continue
      }
      if (labels === null) {
        result.skipped += rows.length
        continue
      }
      const have = labels

      for (const row of rows) {
        const communityLabels = communityLabelsFor(row.communityId)
        if (communityLabels.length === 0) {
          result.skipped++
          continue
        }
        if (!communityLabels.some(label => have.includes(label))) continue

        let access: boolean
        try {
          access = await deps.reader.hasAccess(deps.runtimeProjectId, row.communityId, userId)
        }
        catch {
          result.failed++
          continue
        }
        if (access) {
          // Wieder eingeladen, seit die Zeile gelesen wurde — das Label gehört ihm.
          result.skipped++
          continue
        }

        result.stale++
        if (mode !== 'apply') continue

        try {
          const revoke = await deps.revoke(row.communityId, userId)
          if (revoke.revoked) {
            result.revoked++
            logEvent('warn', 'community_label.reconcile_revoked', { userId, communityId: row.communityId })
          }
          else {
            result.failed++
          }
        }
        catch {
          result.failed++
        }
      }
    }

    // EINE Zusammenfassung je Lauf, nur Anzahlen. Ohne Abweichung leise
    // (info), mit Abweichung als Warnung — im Probelauf IMMER, damit man sein
    // Ergebnis lesen kann.
    const deviation = result.stale > 0 || result.failed > 0 || result.truncated
    logEvent(deviation ? 'warn' : 'info', 'community_label.reconcile', { ...result })
    return result
  }
  finally {
    running = false
  }
}

// ── Registry (wie pastDueNotice.ts): die App verdrahtet den Leser ──────────

let reader: LabelReconcileReader | null = null

export function registerLabelReconcileReader(fn: LabelReconcileReader): void {
  if (reader) console.warn('[onboarding] registerLabelReconcileReader: bestehender Leser wird ersetzt — pro Deployment ist EINER vorgesehen')
  reader = fn
}

/** Ist die Naht verdrahtet? (Silo-App, Kontroll-Host, CI-Build ohne Control-Env ⇒ nein) */
export function labelReconcileAvailable(): boolean {
  return reader !== null
}

/** Der wirksame Schalter dieser App — ein ungültiger Wert schreibt eine Fehlerzeile. */
export function labelReconcileMode(): LabelReconcileMode {
  const appConfig = useAppConfig() as { pukalani?: { community?: { labelReconcile?: unknown } } }
  const raw = appConfig.pukalani?.community?.labelReconcile
  const { mode, invalid } = resolveLabelReconcileMode(raw)
  if (invalid) logEvent('error', 'community_label.reconcile_invalid_mode', { value: String(raw) })
  return mode
}

/** Ein Lauf mit den echten Abhängigkeiten dieser App (Plugin und Ops-Route). */
export async function runLabelReconcile(mode: 'dry-run' | 'apply'): Promise<LabelReconcileResult | null> {
  const read = reader
  if (!read) return null
  const { users } = createAdminClient()
  return await reconcileCommunityLabels(mode, {
    reader: read,
    runtimeProjectId: useRuntimeConfig().public.appwriteProjectId,
    getUserLabels: async (userId) => {
      try {
        return (await users.get({ userId })).labels ?? []
      }
      catch (error) {
        if ((error as { code?: unknown } | null)?.code === 404) return null
        throw error
      }
    },
    revoke: async (communityId, userId) => await revokeCommunityLabel(undefined, communityId, userId),
  })
}
