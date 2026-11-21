import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { cachedInstanceRead } from './instanceReadCache'
import { DEFAULT_APP_CONFIG, parseProductsColumn, type AppConfig } from '../../shared/types/config'

/**
 * Liest die Laufzeit-Produkt-Flags (app_config/global). Fällt bei fehlender
 * Zeile/Table oder Fehler auf permissive Defaults zurück, damit ein Config-
 * Problem die App nie blockiert. Die Table gehört dem system-Layer.
 * event optional: Intervall-Plugins rufen ohne Request-Kontext auf —
 * gleiches Muster wie createAdminClient().
 *
 * app_config ist Table-read(any) (system-005, für Realtime-Config-Flags und
 * Theme-Live-Propagation an Gäste) — hier stehen deshalb AUSSCHLIESSLICH
 * öffentliche Werte. Server-only-Werte (signiertes Entitlement-Dokument)
 * liegen seit system-020 in app_secrets: server/utils/entitlementsStore.ts.
 */
export async function getAppConfig(event?: H3Event): Promise<AppConfig> {
  try {
    const config = useRuntimeConfig(event)
    // Höchstens 15 s alt, jeder Schreiber räumt (Q12, `instanceReadCache.ts`).
    const row = await cachedInstanceRead(event, 'app_config', () =>
      createAdminClient(event).tablesDB.getRow<Models.Row & { products?: string } & Partial<Omit<AppConfig, 'products'>>>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: 'app_config',
        rowId: 'global',
      }))
    return {
      registrationEnabled: row.registrationEnabled ?? DEFAULT_APP_CONFIG.registrationEnabled,
      commentsEnabled: row.commentsEnabled ?? DEFAULT_APP_CONFIG.commentsEnabled,
      maintenanceMode: row.maintenanceMode ?? DEFAULT_APP_CONFIG.maintenanceMode,
      // Fehlende Spalte (Deploy vor system-030) ⇒ Einladung nötig. Der `??`
      // hält ein ausdrückliches `false` fest — nur die ABWESENHEIT fällt zurück.
      onboardingInviteOnly: row.onboardingInviteOnly ?? DEFAULT_APP_CONFIG.onboardingInviteOnly,
      // Spalte ist ein JSON-String (system-018) — fehlertolerant geparst
      products: parseProductsColumn(row.products),
    }
  }
  catch {
    return { ...DEFAULT_APP_CONFIG }
  }
}
