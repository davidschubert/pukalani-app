import { communityModeratorLabel } from '../../../core/shared/communityModeratorLabel'
import { communityLabelsFor, type LabelReconcileReader, type MembershipList, type RemovedMembership } from '../../../control/shared/labelReconcile'

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
 * ein Konto, dessen Zeile inzwischen wieder Zugang gibt; nie eine Zeile im
 * Control Plane (nur lesender Schlüssel); nach einer Herabstufung nie das
 * Zugehörigkeits-Label.
 *
 * SEIT SI1 b (2026-11-17) ZWEI WEITERE FÄLLE:
 *  - STILLGELEGT, UMSTELLUNG GESCHEITERT: eine `active`-Zeile in einer
 *    Community mit `status='disabled'` — das Stilllegen konnte sie nicht auf
 *    `removed` setzen. Der Host antwortet 404, dort heilt nichts. Der Lauf
 *    behandelt sie wie eine entfernte Zeile (beide Labels weg); die
 *    Zugangs-Frage unmittelbar davor sagt für eine stillgelegte Community
 *    „kein Zugang" — ist sie inzwischen wieder `active`, wird NICHT entzogen.
 *    Die Zeile selbst repariert der Lauf NICHT (die Platform-App liest das
 *    Control Plane nur); er nimmt nur das Label und zählt die Fälle in
 *    `disabledStale` — wer sie im Log sieht, stellt die Zeilen von Hand um.
 *  - HERABGESTUFT: eine `active`-Zeile mit einer Rolle OHNE Moderations-Label
 *    (dieselbe Regel wie die Label-Middleware beim Besuch:
 *    `reports.moderate`), geändert in den letzten `DEMOTED_WINDOW_MS`. Trägt
 *    das Konto das Moderations-Label dieser Community, fällt NUR dieses
 *    (`revokeModerator` → `revokeCommunityModeratorLabel` → `mutateUserLabels`),
 *    nie das Zugehörigkeits-Label. Unmittelbar davor wird die Rolle FRISCH
 *    gelesen (wieder hochgestuft ⇒ nichts). Gezählt in `demotedStale`.
 *    BEKANNTE GRENZE: eine Herabstufung, die älter ist als das Fenster und in
 *    der Zeit keinen einzigen Lauf sah (Platform-App 26 h aus), findet der
 *    Abgleich nicht — dann heilt weiter der nächste Besuch der Person.
 *
 * WIEDERHOLBAR: der zweite Lauf findet dieselben Zeilen, aber keine
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
 * Seit SI1 b dazu: die stillgelegten Communities (eine Abfrage je 100) und
 * deren `active`-Zeilen, die geänderten Zeilen der letzten 26 h.
 * Nur bei einem Treffer kommen hinzu: eine `hasAccess`-Abfrage (bei einer
 * `active`-Zeile plus das Lesen des Community-Status) bzw. `moderatesNow`, im Modus
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

/** Höchstens so viele `active`-Zeilen in stillgelegten Communities je Lauf. */
export const MAX_DISABLED_CANDIDATES = 1000

/** Höchstens so viele kürzlich geänderte Zeilen ohne Moderations-Rolle je Lauf. */
export const MAX_DEMOTED_CANDIDATES = 1000

/**
 * Wie weit der Lauf nach Herabstufungen zurückschaut: 26 h. Der Takt ist
 * stündlich — das Fenster überbrückt einen ausgefallenen Lauf, einen Neustart
 * und einen Tag Stillstand. Der Lauf ist wiederholbar: wer schon kein Label
 * mehr trägt, kostet im nächsten Durchgang nur das Lesen des Kontos.
 */
export const DEMOTED_WINDOW_MS = 26 * 60 * 60 * 1000

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
  /** Ein Deckel hat gegriffen (Log-Zeile je Liste). Bei `removed` macht der
   *  nächste Lauf dahinter weiter, die zwei `active`-Listen haben keinen Cursor. */
  truncated: boolean
  /** SI1 b: gelesene `active`-Zeilen in stillgelegten Communities. */
  disabledCandidates: number
  /** Davon: Label hängt, kein Zugang (in `stale` mitgezählt). Die Zeile im
   *  Control Plane bleibt `active` — sie gehört von Hand umgestellt. */
  disabledStale: number
  /** SI1 b: gelesene kürzlich geänderte Zeilen mit Rolle ohne Moderation. */
  demotedCandidates: number
  /** Davon: Moderations-Label hängt, Rolle frisch ohne Moderation (in `stale`
   *  mitgezählt; entzogen wird NUR das Moderations-Label). */
  demotedStale: number
}

export interface LabelReconcileDeps {
  reader: LabelReconcileReader
  runtimeProjectId: string
  /** Labels des Kontos; `null` = Konto gibt es nicht (404). Wirft bei Störung. */
  getUserLabels: (userId: string) => Promise<string[] | null>
  /** Der Entzug über den EINEN Schreiber. */
  revoke: (communityId: string, userId: string) => Promise<{ revoked: boolean }>
  /** NUR das Moderations-Label entziehen, über denselben Schreiber (SI1 b). */
  revokeModerator: (communityId: string, userId: string) => Promise<{ revoked: boolean }>
  maxCandidates?: number
  maxDisabledCandidates?: number
  maxDemotedCandidates?: number
  /** Für Tests; sonst `Date.now()`. */
  now?: () => number
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
 * Läuft gerade ein Abgleich? Für den Takt (OPS-011): „schon im Gange" kommt
 * aus `reconcileCommunityLabels` nur als leeres Ergebnis zurück und sähe sonst
 * aus wie ein Lauf ohne Arbeit. Ändert nichts für die Ops-Route.
 */
export function isLabelReconcileRunning(): boolean {
  return running
}

/**
 * EIN Lauf. Wirft nur, wenn schon die ERSTE Seite des Lesers scheitert (dann
 * gibt es nichts zu zählen); jeder Fehler eines einzelnen Kontos zählt als
 * `failed` und hält den Lauf nicht auf.
 */
export async function reconcileCommunityLabels(
  mode: 'dry-run' | 'apply',
  deps: LabelReconcileDeps,
): Promise<LabelReconcileResult> {
  const result: LabelReconcileResult = {
    mode,
    candidates: 0,
    stale: 0,
    revoked: 0,
    failed: 0,
    skipped: 0,
    truncated: false,
    disabledCandidates: 0,
    disabledStale: 0,
    demotedCandidates: 0,
    demotedStale: 0,
  }
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

    // SI1 b: die zwei Fragen nach `active`-Zeilen. Scheitert eine, zählt das
    // als `failed` (der Takt meldet den Lauf als gescheitert) — die übrigen
    // Fälle laufen trotzdem.
    const disabled = await readList('disabled', result, () => deps.reader.listActiveInDisabled(
      deps.runtimeProjectId, { limit: deps.maxDisabledCandidates ?? MAX_DISABLED_CANDIDATES },
    ))
    result.disabledCandidates = disabled.length
    const now = deps.now?.() ?? Date.now()
    const demoted = await readList('demoted', result, () => deps.reader.listDemoted(
      deps.runtimeProjectId,
      { limit: deps.maxDemotedCandidates ?? MAX_DEMOTED_CANDIDATES, since: new Date(now - DEMOTED_WINDOW_MS).toISOString() },
    ))
    result.demotedCandidates = demoted.length

    // Je Konto EIN Lesen, egal in wie vielen Communities und Fällen es steht.
    interface UserWork { access: Array<{ row: RemovedMembership, disabled: boolean }>, demoted: RemovedMembership[] }
    const byUser = new Map<string, UserWork>()
    const work = (userId: string): UserWork => {
      let entry = byUser.get(userId)
      if (!entry) {
        entry = { access: [], demoted: [] }
        byUser.set(userId, entry)
      }
      return entry
    }
    for (const row of page.rows) work(row.userId).access.push({ row, disabled: false })
    for (const row of disabled) work(row.userId).access.push({ row, disabled: true })
    for (const row of demoted) work(row.userId).demoted.push(row)

    for (const [userId, { access, demoted: demotedRows }] of byUser) {
      let labels: string[] | null
      try {
        labels = await deps.getUserLabels(userId)
      }
      catch {
        result.failed += access.length + demotedRows.length
        continue
      }
      if (labels === null) {
        result.skipped += access.length + demotedRows.length
        continue
      }
      // Lokaler Stand: was dieser Lauf entzogen hat, ist weg — ein späterer
      // Fall desselben Kontos (stillgelegt UND herabgestuft) schreibt nicht
      // noch einmal.
      const have = new Set(labels)

      // (1) Zeilen OHNE Zugang (`removed`, oder `active` in stillgelegter
      //     Community): beide Labels der Community weg.
      for (const { row, disabled: inDisabled } of access) {
        const communityLabels = communityLabelsFor(row.communityId)
        if (communityLabels.length === 0) {
          result.skipped++
          continue
        }
        if (!communityLabels.some(label => have.has(label))) continue

        let hasAccess: boolean
        try {
          hasAccess = await deps.reader.hasAccess(deps.runtimeProjectId, row.communityId, userId)
        }
        catch {
          result.failed++
          continue
        }
        if (hasAccess) {
          // Wieder eingeladen bzw. Community wieder eingeschaltet, seit die
          // Zeile gelesen wurde — das Label gehört ihm.
          result.skipped++
          continue
        }

        result.stale++
        if (inDisabled) result.disabledStale++
        if (mode !== 'apply') continue

        try {
          const revoke = await deps.revoke(row.communityId, userId)
          if (revoke.revoked) {
            result.revoked++
            for (const label of communityLabels) have.delete(label)
            logEvent('warn', 'community_label.reconcile_revoked', {
              userId,
              communityId: row.communityId,
              ...(inDisabled ? { case: 'disabled' } : {}),
            })
          }
          else {
            result.failed++
          }
        }
        catch {
          result.failed++
        }
      }

      // (2) Herabgestuft: NUR das Moderations-Label weg, die Zugehörigkeit bleibt.
      for (const row of demotedRows) {
        const modLabel = communityModeratorLabel(row.communityId)
        if (!modLabel) {
          result.skipped++
          continue
        }
        if (!have.has(modLabel)) continue

        let moderates: boolean
        try {
          moderates = await deps.reader.moderatesNow(deps.runtimeProjectId, row.communityId, userId)
        }
        catch {
          result.failed++
          continue
        }
        if (moderates) {
          // Wieder hochgestuft, seit die Zeile gelesen wurde.
          result.skipped++
          continue
        }

        result.stale++
        result.demotedStale++
        if (mode !== 'apply') continue

        try {
          const revoke = await deps.revokeModerator(row.communityId, userId)
          if (revoke.revoked) {
            result.revoked++
            have.delete(modLabel)
            logEvent('warn', 'community_label.reconcile_revoked', { userId, communityId: row.communityId, case: 'demoted' })
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

/**
 * Eine der zwei `active`-Listen lesen: Deckel ⇒ `truncated` + Log-Zeile,
 * Störung ⇒ `failed` + Log-Zeile und eine leere Liste (der Rest läuft weiter).
 */
async function readList(
  list: 'disabled' | 'demoted',
  result: LabelReconcileResult,
  read: () => Promise<MembershipList>,
): Promise<RemovedMembership[]> {
  try {
    const { rows, truncated } = await read()
    if (truncated) {
      result.truncated = true
      logEvent('warn', 'community_label.reconcile_truncated', { list, limit: rows.length })
    }
    return rows
  }
  catch {
    result.failed++
    logEvent('error', 'community_label.reconcile_read_failed', { list })
    return []
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
    revokeModerator: async (communityId, userId) => await revokeCommunityModeratorLabel(undefined, communityId, userId),
  })
}
