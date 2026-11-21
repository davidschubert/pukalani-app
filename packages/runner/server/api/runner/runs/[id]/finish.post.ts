import type { H3Event } from 'h3'
import { runFinishSchema } from '../../../../../schemas/run'
import { runTransitionAllowed } from '../../../../../shared/runGuards'
import { RUNS_TABLE, type RunFinishResponse, type RunRow } from '../../../../../shared/types/runner'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * Der Abschluss — docs/archiv/AI-RUNNER.md § 5/§ 7.2 Schritt 9.
 *
 * `succeeded` ist hier eine BEHAUPTUNG DES RUNNERS, keine Messung des
 * Servers: nur der Elternprozess auf dem Mac sieht `permission_denials` und
 * das `post_turn_summary` und kann `needs_input` von echtem Erfolg
 * unterscheiden (§ 11 — ein blockierter Lauf endet in der CLI als „success").
 * Der Server prüft deshalb nur, ob der Übergang überhaupt erlaubt ist.
 */
export default defineEventHandler(async (event): Promise<RunFinishResponse> => {
  const caller = await requireRunner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, runFinishSchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })
  requireOwnRun(caller.$id, run.runnerId)

  /**
   * DECKT AUCH „SCHON ABGEBROCHEN" AB, und das ist der wichtigere Fall: das
   * Board hat gestoppt, der Runner lief noch bis zur nächsten Meldung weiter
   * und will jetzt `succeeded` melden. Aus einem terminalen Zustand führt kein
   * Weg (§ 4) — `cancelled` bleibt stehen. Sonst könnte ein Abbruch im Nachlauf
   * still zurückgenommen werden, und der Bericht behauptete Arbeit, die
   * niemand mehr wollte.
   */
  if (!runTransitionAllowed(run.status, body.status, 'runner')) {
    throw createError({ status: 409, statusText: 'Run cannot be finished', data: { code: 'not_finishable' } })
  }

  // Erst-Wert-Regel wie in `events` (§ 7.2 Schritt 1): stempeln, nie ersetzen.
  const stamps: Record<string, string> = {}
  if (body.sessionId && !run.sessionId) stamps.sessionId = body.sessionId
  if (body.workBranch && !run.workBranch) stamps.workBranch = body.workBranch

  const finished = await tablesDB.updateRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: id,
    data: {
      ...stamps,
      status: body.status,
      resultJson: body.resultJson,
      error: body.error,
      finishedAt: new Date().toISOString(),
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not finish run')
  })

  /**
   * GLOCKE + MAIL FÜR DEN ERSTELLER (Aufgabe „Glocke und E-Mail bei Lauf-Ende").
   * NUR bei echten Endzuständen — `cancelled` meldet bewusst NICHTS: der Abbruch
   * kam aus dem Board, der Mensch weiß schon Bescheid. Fail-soft in doppelter
   * Hinsicht (`notify()` wirft ohnehin nie, `notifyRunFinished` fängt zusätzlich
   * jeden Fehler): eine misslungene Benachrichtigung darf den bereits
   * geschriebenen Abschluss NIE kippen.
   */
  if (finished.status === 'succeeded' || finished.status === 'needs_input' || finished.status === 'failed') {
    await notifyRunFinished(event, finished)
  }

  return { run: finished }
})

/**
 * Meldet dem Ersteller das Ende seines Laufs — in die Glocke (immer) und, je
 * nach seiner `prefs.emailNotifications`, per E-Mail (das erledigt `notify()`
 * selbst). `scope: 'account'`, weil die Konsole mandantenlos ist (C15) und der
 * Empfänger ein Konto DIESES Projekts ist; die Glocke hängt in apps/control
 * (accountBell).
 *
 * STILL ÜBERSPRUNGEN, wenn `createdBy` kein echtes Konto ist: Skript-Läufe
 * tragen dort einen Platzhalter (z. B. 'claude'), der als User-Id nicht
 * existiert — eine Glocken-Zeile für einen Phantom-Empfänger läse niemand. Die
 * EXISTENZ ist die Prüfung (users.get 404 ⇒ überspringen), nicht ein
 * Sentinel-Vergleich, der den nächsten Platzhalter übersähe.
 */
async function notifyRunFinished(event: H3Event, run: RunRow): Promise<void> {
  try {
    if (!run.createdBy) return
    const { users } = createAdminClient(event)
    const exists = await users.get({ userId: run.createdBy }).then(() => true).catch(softFail('runner:api/runner/runs/[id]/finish.post:get', false))
    if (!exists) return

    /**
     * Der LINK kommt aus dem App-Mapping (A14): der `runner`-Layer kennt
     * `tickets` NICHT, also trägt die App je `subjectType` ein Pfad-Präfix ein
     * (`pukalani.runner.subjectLinks`). Ohne Eintrag führt die Meldung auf das
     * Board — nie ins Leere.
     */
    const appConfig = useAppConfig() as { pukalani?: { runner?: { subjectLinks?: Record<string, string> } } }
    const prefix = appConfig.pukalani?.runner?.subjectLinks?.[run.subjectType]
    const link = prefix ? `${prefix}${run.subjectId}` : '/dashboard/runner'

    // {name} in den Glocken-Texten. Der Layer kennt keine Ticket-Titel (A14),
    // also der neutrale Bezug „<subjectType> <subjectId>" (liest sich als
    // „ticket 6a85…", genau wie im Board).
    const base = {
      recipientId: run.createdBy,
      title: `${run.subjectType} ${run.subjectId}`,
      link,
      scope: 'account' as const,
    }

    /**
     * EIN TYP JE ENDZUSTAND — die Glocke hat für jeden einen eigenen Text (die
     * Rückfrage klingt nach Handeln). Bewusst DREI Literale statt eines
     * `run.${status}`: nur so sieht der C17-Strukturtest
     * (packages/core/tests/notificationBellTexts.test.ts) die Typen und nagelt
     * jeden an seinen messageKey-Zweig + de/en-Text — ein dynamischer Typ wäre
     * für das Netz unsichtbar, und genau das macht ein Loch unsichtbar.
     */
    if (run.status === 'succeeded') {
      await notify(event, {
        ...base,
        type: 'run.succeeded',
        body: '',
      })
    }
    else if (run.status === 'needs_input') {
      await notify(event, {
        ...base,
        type: 'run.needs_input',
        body: '',
      })
    }
    else {
      await notify(event, {
        ...base,
        type: 'run.failed',
        body: run.error,
      })
    }
  }
  catch (error) {
    console.warn('[runner] Lauf-Ende-Benachrichtigung fehlgeschlagen (best-effort):', error)
  }
}
