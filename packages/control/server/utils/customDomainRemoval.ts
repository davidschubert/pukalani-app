import type { TablesDB } from 'node-appwrite'
import { customDomainForms } from '../../shared/customDomain'
import { CUSTOM_DOMAIN_CLEARED_PATCH } from '../../shared/customDomainSweep'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { removePloiTenant, type PloiConfig } from './ploi'

/**
 * EINEN DOMAIN-EINTRAG LEEREN — der eine Weg für „Domain entfernen" (Owner,
 * `remove.post.ts`) und „Eintrag verfallen" (Fristen-Lauf, BE-014).
 *
 * REIHENFOLGE IST DIE GANZE ENTSCHEIDUNG: erst die ZEILE leeren, dann bei ploi
 * aufräumen. Die Zeile ist die Wahrheit — sobald dort nichts mehr steht, löst
 * der Host bei uns nicht mehr auf (404), und die Subdomain hört auf, mit 301
 * dorthin zu zeigen. Umgekehrt gäbe es ein Fenster, in dem die Community auf
 * eine Adresse umleitet, die nginx schon nicht mehr kennt.
 *
 * DAS AUFRÄUMEN IST FAIL-SOFT: ein zurückgelassener nginx-vHost ist
 * Hausarbeit, kein Sicherheitsproblem (er zeigt auf eine App, die den Host
 * nicht kennt, und die antwortet 404). Der Schreibvorgang auf die Zeile wirft
 * dagegen — der Aufrufer entscheidet, was ein Fehlschlag heißt.
 *
 * Die Freigabe (`customDomainApproved`) bleibt stehen: sie gehört der
 * Community, nicht der Domain (`CUSTOM_DOMAIN_CLEARED_PATCH`).
 */
export async function clearCustomDomainEntry(input: {
  tablesDB: TablesDB
  databaseId: string
  row: Pick<TenantRow, '$id' | 'customDomain'>
  ploi: PloiConfig
}): Promise<TenantRow> {
  const previous = input.row.customDomain || ''
  const saved = await input.tablesDB.updateRow<TenantRow>({
    databaseId: input.databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: input.row.$id,
    data: { ...CUSTOM_DOMAIN_CLEARED_PATCH },
  })

  if (previous) {
    for (const form of customDomainForms(previous)) {
      const result = await removePloiTenant(input.ploi, form).catch((error: unknown) => ({
        ok: false, skipped: false, message: error instanceof Error ? error.message : String(error),
      }))
      if (!result.ok && !result.skipped) {
        logEvent('warn', 'community.custom_domain_cleanup_failed', {
          communityId: input.row.$id, domain: form, detail: result.message.slice(0, 200),
        })
      }
    }
  }
  return saved
}
