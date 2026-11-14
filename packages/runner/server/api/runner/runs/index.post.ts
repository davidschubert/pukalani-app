import { ID } from 'node-appwrite'
import { createRunSchema } from '../../../../schemas/run'
import { permissionModeAllowed } from '../../../../shared/runGuards'
import { checkRequestedTestCommands, offeredTestCommands } from '../../../../shared/testCommands'
import { resolveRunSubjectTrust } from '../../../utils/runSubjectTrust'
import { RUNNERS_TABLE, RUNS_TABLE, type RunRow, type RunnerRow } from '../../../../shared/types/runner'

/**
 * Einen Lauf anlegen — docs/plans/AI-RUNNER.md § 5, Board-Seite.
 *
 * Der Lauf wird hier nur HINGELEGT; abgeholt wird er vom Runner
 * (`runs/claim`). Es gibt bewusst keinen Weg, einem Rechner einen Lauf
 * aufzudrängen: der Rechner entscheidet, wann er arbeitet.
 *
 * ER ENTSTEHT ALS `draft`, NICHT ALS `queued` (Paket 3, Änderung gegenüber
 * dem ursprünglichen § 5). Grund ist ein Wettrennen, das man nur EINMAL
 * beobachtet: Anhänge brauchen eine `runId` und können erst NACH dieser Zeile
 * hochgeladen werden — ein `queued`-Lauf ist aber binnen Sekunden geclaimt,
 * und der Runner zieht sein Material genau einmal (§ 7.2 Schritt 4). Der
 * Auftrag liefe dann mit halben Anhängen los, ohne dass irgendwo ein Fehler
 * stünde. Freigegeben wird deshalb ausdrücklich, mit `runs/:id/queue`.
 */
export default defineEventHandler(async (event): Promise<RunRow> => {
  const user = requirePermission(event, 'runner.manage')
  const body = await readValidatedBody(event, createRunSchema.parse)

  /**
   * WER „GEPRÜFT" SAGT, IST DER SERVER (SEC-038). Die Herkunft des Subjekts
   * beantwortet der Layer, dem es gehört (Resolver, in der App verdrahtet) —
   * nie der Body. Ein Subjekt, das es nicht gibt, bekommt keinen Lauf: ohne
   * Subjekt gibt es auch keine Herkunft, die man prüfen könnte.
   */
  const { found, trusted: promptTrusted } = await resolveRunSubjectTrust(event, body.subjectType, body.subjectId)
  if (!found) {
    throw createError({ status: 404, statusText: 'Subject not found', data: { code: 'subject_not_found' } })
  }

  /**
   * DIE SPERRE AUS § 8.2, SERVERSEITIG. Sie steht hier und nicht nur in der
   * Oberfläche, weil eine ausgegraute Schaltfläche keine Sicherung ist — der
   * Aufrufer dieser Route ist HTTP, nicht ein Formular. Der Runner prüft
   * dasselbe noch einmal (§ 8.1: die Grenze liegt auf dem Mac).
   */
  if (!permissionModeAllowed(body.permissionMode, promptTrusted)) {
    throw createError({
      status: 400,
      statusText: 'Permission mode not allowed for an untrusted prompt',
      data: { code: 'mode_not_allowed_untrusted' },
    })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  /**
   * Ein GEZIELTER Lauf braucht einen Rechner, der ihn holen kann. Ohne diese
   * Prüfung landet er als `queued` in einer Schlange, aus der ihn niemand
   * nimmt (`claim` filtert auf `runnerId ∈ {'', eigene Id}`) — er sähe
   * „gleich geht's los" aus und wartet auf einen Rechner, den es nicht gibt.
   * `runnerId: ''` (beliebiger) bleibt bewusst ungeprüft.
   */
  let runner: RunnerRow | null = null
  if (body.runnerId) {
    runner = await tablesDB.getRow<RunnerRow>({
      databaseId, tableId: RUNNERS_TABLE, rowId: body.runnerId,
    }).catch(() => null)
    if (!runner || runner.status !== 'active') {
      throw createError({ status: 400, statusText: 'Runner unavailable', data: { code: 'runner_unavailable' } })
    }
  }

  /**
   * TESTBEFEHLE NUR AUS DER LISTE DES RECHNERS (SEC-037). Das ist die ZWEITE
   * Sicherung und vor allem eine frühe, verständliche Absage — die eigentliche
   * Grenze ist die lokale Liste auf dem Rechner, der Server kennt nur deren
   * Anzeige-Kopie aus dem Heartbeat. Folge, gewollt: meldet ein Rechner (noch)
   * keine Liste, lässt der Server keinen einzigen Testbefehl durch.
   */
  const testCheck = checkRequestedTestCommands({
    requested: body.testCommands,
    offered: runner ? offeredTestCommands(runner.capabilitiesJson, body.repoKey) : [],
    promptTrusted,
    runnerSelected: runner !== null,
  })
  if (!testCheck.ok) {
    throw createError({ status: 400, statusText: 'Test commands not allowed', data: { code: testCheck.code } })
  }

  const run = await tablesDB.createRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: ID.unique(),
    // ALLE Spalten explizit (Muster `createRow<TenantRow>`): eine neue Spalte
    // soll hier einen Fehler erzeugen und eine Entscheidung erzwingen, statt
    // still auf ihrem Default zu landen.
    data: {
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      runnerId: body.runnerId,
      // Heute immer 'claude-code' (§ 2) — die Spalte spart später eine Migration.
      executor: 'claude-code',
      // Siehe Kopf: freigegeben wird mit `runs/:id/queue`, wenn die Anhänge liegen.
      status: 'draft',
      repoKey: body.repoKey,
      baseBranch: body.baseBranch,
      // Kommt vom RUNNER, sobald die CLI ihn vergeben hat (§ 7.2) — nie von hier.
      workBranch: '',
      model: body.model,
      permissionMode: body.permissionMode,
      // headless oder interaktiv (§ 7.3) — die Wahl trifft das Formular; der
      // Runner öffnet bei true ein Terminal statt der headless-Pipe.
      interactive: body.interactive,
      promptSource: body.promptSource,
      // Der SERVER-Wert von oben, nie ein Feld aus dem Body (SEC-038).
      promptTrusted,
      testCommands: body.testCommands.length ? JSON.stringify(body.testCommands) : '',
      // Füllt `runs/:id/files` — solange der Lauf `draft` ist (§ 6).
      attachmentsJson: '',
      maxBudgetUsd: body.maxBudgetUsd,
      // Die Session-Id würfelt der RUNNER vor dem Start und meldet sie sofort
      // (§ 7.2 Schritt 1) — hier steht sie noch nicht fest.
      sessionId: '',
      // Ein frischer Lauf knüpft an nichts an — Fortsetzungen entstehen NUR
      // über `runs/:id/resume` (§ 9), nie hier.
      resumeSessionId: '',
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      resultJson: '',
      error: '',
      createdBy: user.$id,
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create run')
  })

  setResponseStatus(event, 201)
  return run
})
