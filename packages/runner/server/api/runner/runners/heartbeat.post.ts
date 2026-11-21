import { runnerHeartbeatSchema } from '../../../../schemas/run'
import { RUNNERS_TABLE, type HeartbeatResponse, type RunnerRow } from '../../../../shared/types/runner'

/**
 * „Ich lebe" — docs/archiv/AI-RUNNER.md § 5, Runner-Seite.
 *
 * DIE EINZIGE Route, die `lastSeenAt` stempelt. Der Claim-Poll tut es
 * bewusst NICHT (server/utils/runnerAuth.ts): er läuft alle paar Sekunden und
 * würde rund um die Uhr eine Zeile umschreiben, damit ein Feld sich um zwei
 * Sekunden bewegt.
 *
 * `capabilitiesJson` ist eine ANZEIGE-KOPIE (§ 8.1) — was der Rechner wirklich
 * erlaubt (Repos, Modi, Budget), steht in seiner LOKALEN Config und wird nie
 * von hier gelesen. Die Datenbank darf auswählen, was der Runner erlaubt, nie
 * umgekehrt.
 */
export default defineEventHandler(async (event): Promise<HeartbeatResponse> => {
  const caller = await requireRunner(event)
  const body = await readValidatedBody(event, runnerHeartbeatSchema.parse)

  const serialized = JSON.stringify(body.capabilities)
  // Gemessen wird NACH dem Serialisieren — die Spalte fasst 4000 Zeichen, und
  // ein Objekt hat keine Länge. Lieber ein sprechendes 400 als ein Appwrite-
  // Fehler, den der Runner als „Naht kaputt" liest.
  if (serialized.length > 4000) {
    throw createError({ status: 400, statusText: 'Capabilities too large', data: { code: 'capabilities_too_large' } })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const lastSeenAt = new Date().toISOString()

  await tablesDB.updateRow<RunnerRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RUNNERS_TABLE,
    rowId: caller.$id,
    data: { lastSeenAt, capabilitiesJson: serialized },
  }).catch((error) => {
    throw toH3Error(error, 'Could not update runner')
  })

  return { ok: true, lastSeenAt }
})
