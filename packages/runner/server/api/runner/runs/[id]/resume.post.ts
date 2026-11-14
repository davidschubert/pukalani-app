import { ID } from 'node-appwrite'
import { resumeRunSchema } from '../../../../../schemas/run'
import { buildResumeRunFields, permissionModeAllowed, runResumeAllowed } from '../../../../../shared/runGuards'
import { checkRequestedTestCommands, offeredTestCommands, parseStoredTestCommands } from '../../../../../shared/testCommands'
import { resolveRunSubjectTrust } from '../../../../utils/runSubjectTrust'
import { RUNNERS_TABLE, RUNS_TABLE, type RunRow, type RunnerRow } from '../../../../../shared/types/runner'

/**
 * Eine `needs_input`-Rückfrage beantworten — docs/plans/AI-RUNNER.md § 4 / § 9.
 *
 * `needs_input` ist TERMINAL (§ 4): der alte Lauf wird NICHT wiederbelebt —
 * sonst hätte er zwei Berichte, zwei Kostenzeilen und keine ehrliche Dauer.
 * Stattdessen entsteht ein NEUER Lauf, der über `--resume <sessionId>` an die
 * Session des Vorgängers anknüpft (der Runner baut das, § 9). Die Antwort ist
 * sein Auftragstext.
 *
 * DER VORGÄNGER STECKT IM PFAD (`:id`), NICHT IM BODY: man kann sich keinen
 * fremden Lauf als Anker unterschieben, und alle Ausführungs-Felder (Rechner,
 * Repo, Modell, Modus, Budget, Testbefehle UND `promptTrusted`) ERBT der neue
 * Lauf aus dem Vorgänger (`buildResumeRunFields`) — nie aus dem Aufrufer
 * (§ 8.2: eine Fortsetzung wäscht die Herkunft nicht rein). `promptTrusted`
 * ist dabei höchstens so gut wie beim Vorgänger UND wie die HEUTIGE Herkunft
 * des Subjekts (SEC-038) — siehe unten.
 */
export default defineEventHandler(async (event): Promise<RunRow> => {
  const user = requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, resumeRunSchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const predecessor = await tablesDB.getRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })

  /**
   * DER EINE WÄCHTER (§ 4 / § 9): nur ein `needs_input`-Lauf MIT Session ist
   * fortsetzbar. Jeder andere Zustand (fertig, gescheitert, abgebrochen, noch
   * laufend) ist keine offene Frage; ein `needs_input` ohne Session hat nichts,
   * worauf `--resume` zeigen könnte. Der Boundary-Fall des Konzepts.
   */
  if (!runResumeAllowed(predecessor)) {
    throw createError({ status: 409, statusText: 'Run cannot be resumed', data: { code: 'not_resumable' } })
  }

  /**
   * DER VERTRAUENS-WERT DER FORTSETZUNG (SEC-038):
   * nie besser als der Vorgänger UND nie besser als die heutige Herkunft des
   * Subjekts. Wurde das Ticket seit dem ersten Lauf von einem Konto ohne
   * Betreiber-Rolle umgeschrieben, ist auch die Antwort darauf kein geprüfter
   * Auftrag mehr. Ein inzwischen gelöschtes Subjekt macht die Fortsetzung
   * ungeprüft, nicht unmöglich (die Rückfrage hängt am Lauf, nicht am Ticket).
   * Ein Resolver-Ausfall wird als 503 durchgereicht — nicht geraten.
   */
  const subject = await resolveRunSubjectTrust(event, predecessor.subjectType, predecessor.subjectId)
  // Die UND-Verknüpfung mit dem Vorgänger macht `buildResumeRunFields` (pur, getestet).
  const fields = buildResumeRunFields(predecessor, body.answer, subject.found && subject.trusted)

  /**
   * Die Modus-Sperre aus § 8.2 auch hier — sie hing schon am Vorgänger, aber
   * ein vererbter Wert wird trotzdem geprüft: fiele der Vorgänger je durch
   * einen ungeprüften Modus (Alt-Daten, geänderte Regel), dürfte die
   * Fortsetzung ihn nicht stillschweigend weitertragen.
   */
  if (!permissionModeAllowed(fields.permissionMode, fields.promptTrusted)) {
    throw createError({
      status: 400,
      statusText: 'Permission mode not allowed for an untrusted prompt',
      data: { code: 'mode_not_allowed_untrusted' },
    })
  }

  /**
   * Die Fortsetzung MUSS auf DENSELBEN Rechner (der Session-File liegt genau
   * dort). Steht der nicht bereit, wäre der Lauf eine Zeile in einer Schlange,
   * die niemand leert — lieber sofort ein klares 400 als ein stummes Warten.
   * `runnerId: ''` (Alt-Daten ohne Ziel) bleibt wie bei `runs` ungeprüft.
   */
  let runner: RunnerRow | null = null
  if (fields.runnerId) {
    runner = await tablesDB.getRow<RunnerRow>({
      databaseId, tableId: RUNNERS_TABLE, rowId: fields.runnerId,
    }).catch(() => null)
    if (!runner || runner.status !== 'active') {
      throw createError({ status: 400, statusText: 'Runner unavailable', data: { code: 'runner_unavailable' } })
    }
  }

  /**
   * DIE GEERBTEN TESTBEFEHLE gehen durch dieselbe Prüfung wie beim Anlegen
   * (SEC-037) — mit dem Vertrauens-Wert DIESER Fortsetzung und der HEUTIGEN
   * Liste des Rechners. Ein kaputter gespeicherter Wert wird abgelehnt wie ein
   * nicht gelisteter Befehl, statt still als „keine Tests" weiterzulaufen.
   */
  const inheritedTests = parseStoredTestCommands(fields.testCommands)
  if (inheritedTests === null) {
    throw createError({ status: 400, statusText: 'Test commands not allowed', data: { code: 'test_command_not_listed' } })
  }
  const testCheck = checkRequestedTestCommands({
    requested: inheritedTests,
    offered: runner ? offeredTestCommands(runner.capabilitiesJson, fields.repoKey) : [],
    promptTrusted: fields.promptTrusted,
    runnerSelected: runner !== null,
  })
  if (!testCheck.ok) {
    throw createError({ status: 400, statusText: 'Test commands not allowed', data: { code: testCheck.code } })
  }

  /**
   * DIREKT ALS `queued`, nicht als `draft`: der Wettlauf, den `draft` löst,
   * kommt allein von den ANHÄNGEN (sie brauchen erst eine `runId`, § 4). Eine
   * Fortsetzung trägt keine Anhänge — der neue Auftragstext IST die Antwort —,
   * also gibt es nichts hochzuladen und nichts zu versiegeln.
   */
  const run = await tablesDB.createRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: ID.unique(),
    // ALLE Spalten explizit (Muster `createRow<TenantRow>`): eine neue Spalte
    // soll hier einen Fehler erzeugen und eine Entscheidung erzwingen.
    data: {
      subjectType: fields.subjectType,
      subjectId: fields.subjectId,
      runnerId: fields.runnerId,
      executor: 'claude-code',
      status: 'queued',
      repoKey: fields.repoKey,
      baseBranch: fields.baseBranch,
      workBranch: '',
      model: fields.model,
      permissionMode: fields.permissionMode,
      interactive: false,
      promptSource: fields.promptSource,
      promptTrusted: fields.promptTrusted,
      testCommands: fields.testCommands,
      // Keine Anhänge bei einer Fortsetzung (siehe oben).
      attachmentsJson: '',
      maxBudgetUsd: fields.maxBudgetUsd,
      // Die NEUE Session kennt erst der Runner (er startet mit `--resume` und
      // liest sie aus dem Abschluss-JSON, § 9) — hier steht sie noch nicht.
      sessionId: '',
      resumeSessionId: fields.resumeSessionId,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      resultJson: '',
      error: '',
      createdBy: user.$id,
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create resume run')
  })

  setResponseStatus(event, 201)
  return run
})
