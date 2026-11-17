import { AppwriteException } from 'node-appwrite'
import { z } from 'zod'
import { aiModelCheckRejection } from '../../../../core/shared/aiModelEndpoints'
import type { AiModelCheck } from '../../../../core/shared/aiModelEndpoints'

const configSchema = z.object({
  registrationEnabled: z.boolean(),
  commentsEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
  // Globales KI-Model-Override (app_config.aiModel, system-016) — leer =
  // zurück auf den Build-Default aus pukalani.ai; OpenRouter-artige Ids (vendor/model).
  // Optional: alte Clients ohne das Feld patchen nur die Flags.
  aiModel: z.string().trim().max(100)
    .regex(/^$|^[\w.-]+\/[\w.:-]+$/, 'Erwartet vendor/model oder leer')
    .optional(),
})

/**
 * Produkt-Flags setzen (Upsert der app_config/global-Zeile) + Audit.
 *
 * KI-MODELL WIRD BEIM SPEICHERN GEPRÜFT (KI1 c, 2026-11-17): der Text-Transport
 * bindet jeden Aufruf an die zwei Europa-Endpunkte; ein Modell ohne einen davon
 * scheiterte bisher erst beim ersten Aufruf (503 `ai_endpoint_unavailable`).
 * Geprüft wird NUR, wenn `aiModel` mitkommt, nicht leer ist UND sich vom
 * gespeicherten Wert unterscheidet — das Umschalten der anderen Schalter hängt
 * so nie am Netz und scheitert nie an einem alten Wert.
 *  · kein Europa-Endpunkt / unbekanntes Modell ⇒ 422, NICHTS wird gespeichert;
 *  · nicht prüfbar (Frist, Störung beim Vermittler) ⇒ gespeichert, die Antwort
 *    trägt `aiModelCheck: 'unverified'` — ein Ausfall blockiert nie;
 *  · in Ordnung ⇒ gespeichert, `aiModelCheck: 'ok'`.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const data = await readValidatedBody(event, configSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  let aiModelCheck: AiModelCheck | undefined
  if (data.aiModel && data.aiModel !== await readStoredAiModel(admin, databaseId)) {
    aiModelCheck = await checkAiModelEndpoints(data.aiModel, { baseUrl: getAiConfig().baseUrl })
    const code = aiModelCheckRejection(aiModelCheck)
    if (code) {
      throw createError({ status: 422, statusText: 'AI model not usable', data: { code } })
    }
  }

  try {
    await admin.tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }
  catch (error) {
    // NUR wenn die Zeile fehlt anlegen — andere Fehler nicht verschlucken
    // (sonst 409 vom Create, der den echten Fehler maskiert).
    if (error instanceof AppwriteException && error.code === 404) {
      await admin.tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
        .catch(e => { throw toH3Error(e, 'Could not save configuration') })
    }
    else {
      throw toH3Error(error, 'Could not save configuration')
    }
  }

  await recordAudit(event, {
    action: 'config.updated',
    targetType: 'config',
    targetId: 'global',
    metadata: aiModelCheck ? { ...data, aiModelCheck } : data,
  })

  return aiModelCheck ? { ...data, aiModelCheck } : data
})

/**
 * Der gespeicherte Wert von `app_config.aiModel` — leer, wenn die Zeile oder
 * das Feld fehlt. Ein Lesefehler heißt ebenfalls leer: dann wird geprüft, und
 * im schlimmsten Fall heißt das `unverified` (gespeichert), nie ein falsches
 * „unverändert".
 */
async function readStoredAiModel(admin: ReturnType<typeof createAdminClient>, databaseId: string): Promise<string> {
  try {
    const row = await admin.tablesDB.getRow<import('node-appwrite').Models.Row & { aiModel?: string }>({
      databaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    return typeof row.aiModel === 'string' ? row.aiModel.trim() : ''
  }
  catch {
    return ''
  }
}
