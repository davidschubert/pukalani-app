import { runTransitionAllowed } from '../../../../../shared/runGuards'
import { RUNS_TABLE, type RunRow } from '../../../../../shared/types/runner'

/**
 * Freigeben: `draft → queued` — docs/archiv/AI-RUNNER.md § 4/§ 5, Board-Seite.
 *
 * DIE ZWEITE HÄLFTE DES ANLEGENS (Paket 3). `runs` legt einen Entwurf an, das
 * Board lädt die Anhänge dazu, und ERST dieser Ruf stellt den Auftrag in die
 * Schlange. Vorher kann ihn kein Runner sehen (`claim` filtert auf `queued`,
 * und die Zustandstabelle gibt dem Runner aus `draft` gar keinen Übergang).
 *
 * AB HIER IST DER AUFTRAG VERSIEGELT: `runs/:id/files` antwortet danach 409.
 * Das ist Absicht und nicht Bequemlichkeit — ein Anhang, der eintrifft, während
 * der Lauf schon arbeitet, würde nie gelesen (der Runner zieht sein Material
 * einmal, § 7.2 Schritt 4), stünde aber im Bericht. Ein Auftrag, der sich nach
 * dem Abschicken noch ändert, ist kein Auftrag.
 */
export default defineEventHandler(async (event): Promise<RunRow> => {
  requirePermission(event, 'runner.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const run = await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not load run')
  })

  if (!runTransitionAllowed(run.status, 'queued', 'board')) {
    // Fachlicher Grund statt „ging nicht": ein doppelt abgeschickter Entwurf
    // ist kein Fehler des Klickenden, sondern ein zweiter Klick.
    throw createError({ status: 409, statusText: 'Run is not a draft', data: { code: 'not_a_draft' } })
  }

  return await tablesDB.updateRow<RunRow>({
    databaseId, tableId: RUNS_TABLE, rowId: id,
    data: { status: 'queued' },
  }).catch((error) => {
    throw toH3Error(error, 'Could not queue run')
  })
})
