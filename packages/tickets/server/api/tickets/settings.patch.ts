import { z } from 'zod'
import { aiModelCheckRejection } from '../../../../core/shared/aiModelEndpoints'
import type { AiModelCheck } from '../../../../core/shared/aiModelEndpoints'
import { forgetInstanceRead } from '../../../../core/server/utils/instanceReadCache'

/**
 * KI-Modell zur Laufzeit wechseln — schreibt app_config.ticketsAiModel
 * (system-015). Leerer String = zurück auf den Build-Default aus
 * pukalani.tickets.ai. Erlaubt sind OpenRouter-artige Ids (vendor/model).
 *
 * WARUM HIER `system.manage` UND NICHT `tickets.manage` (Paritäts-Audit
 * 2026-08-02): `app_config/global` ist die INSTANZ-Einstellungszeile, EINE Row
 * pro Projekt. Jeder andere Schreiber darauf (admin/config.patch,
 * admin/themes/settings.patch, admin/products/[key].patch) verlangt
 * `system.manage` — nur diese Route verlangte `tickets.manage`, und die liegt
 * im MODERATOR-Bündel (authz.ts). Ein Moderator konnte damit eine
 * Instanz-Einstellung ändern, die jede KI-Triage auf Kosten des Betreibers
 * über ein anderes (teureres) Modell schickt.
 *
 * Die TRENNLINIE ist deshalb bewusst nicht „Ticket-Fläche vs. Rest", sondern
 * WAS geschrieben wird: das Board BEDIENEN bleibt `tickets.manage` (alle
 * anderen Routen inkl. settings.get), die Instanz UMSTELLEN ist
 * Betreiber-Sache. `system.manage` ist die strikt höhere Hürde — der
 * admin-Operator hält beide Capabilities, für ihn ändert sich nichts.
 *
 * DER ZWEITE SPEICHERWEG FÜR EIN MODELL AUS DER KONSOLE (KI1 c, 2026-11-17):
 * dieselbe Prüfung wie `admin/config.patch.ts` — ein neues, nicht leeres
 * Modell ohne Europa-Endpunkt (oder unbekannt) ⇒ 422, nichts gespeichert;
 * nicht prüfbar ⇒ gespeichert mit `aiModelCheck: 'unverified'`.
 */
const bodySchema = z.object({
  model: z.string().trim().max(100)
    .regex(/^$|^[\w.-]+\/[\w.:-]+$/, 'Erwartet vendor/model oder leer'),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const { model } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  let aiModelCheck: AiModelCheck | undefined
  if (model && model !== await readStoredTicketsModel(tablesDB, databaseId)) {
    aiModelCheck = await checkAiModelEndpoints(model, { baseUrl: getTicketsAiConfig().baseUrl })
    const code = aiModelCheckRejection(aiModelCheck)
    if (code) {
      throw createError({ status: 422, statusText: 'AI model not usable', data: { code } })
    }
  }

  await tablesDB.updateRow({
    databaseId,
    tableId: 'app_config',
    rowId: 'global',
    data: { ticketsAiModel: model },
  }).catch((error) => {
    throw toH3Error(error, 'Could not save board settings')
  }).finally(() => forgetInstanceRead('app_config')) // Instanz-Merker (Q12)

  const effective = await getEffectiveTicketsAiConfig(event)
  return aiModelCheck
    ? { model: effective.model, defaultModel: effective.defaultModel, aiModelCheck }
    : { model: effective.model, defaultModel: effective.defaultModel }
})

/** Gespeichertes `app_config.ticketsAiModel` — leer bei fehlender Zeile, fehlendem Feld oder Lesefehler (dann wird geprüft). */
async function readStoredTicketsModel(tablesDB: ReturnType<typeof createAdminClient>['tablesDB'], databaseId: string): Promise<string> {
  try {
    const row = await tablesDB.getRow<import('node-appwrite').Models.Row & { ticketsAiModel?: string }>({
      databaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    return typeof row.ticketsAiModel === 'string' ? row.ticketsAiModel.trim() : ''
  }
  catch {
    return ''
  }
}
