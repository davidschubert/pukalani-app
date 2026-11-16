/**
 * Spaltengröße von `audit_logs.metadata` (system-001: varchar 4000). Die
 * Metadaten müssen als JSON darunter bleiben, sonst lehnt Appwrite die GANZE
 * Zeile ab — der Eintrag fehlte dann ganz statt nur gekürzt.
 */
export const AUDIT_METADATA_MAX_CHARS = 4000
/** Luft für die übrigen Felder und spätere Ergänzungen. */
const ID_LIST_BUDGET = 3500

/**
 * Ziel-Ids einer Sammel-Aktion für das Protokoll (BE-021, 2026-11-16): bis
 * hierher stand dort nur die ANZAHL — wer gesperrt wurde, ließ sich
 * nachträglich nicht mehr sagen. Jetzt stehen die Ids darin, so viele, wie
 * sicher in die Spalte passen; `truncated` sagt, ob welche fehlen, `total`,
 * wie viele es waren. Pur, damit die Grenze getestet ist.
 */
export function auditIdList(ids: readonly string[], budget: number = ID_LIST_BUDGET): { ids: string[], total: number, truncated: boolean } {
  const kept: string[] = []
  let used = 2 // die Klammern des Arrays
  for (const id of ids) {
    const cost = JSON.stringify(id).length + (kept.length > 0 ? 1 : 0)
    if (used + cost > budget) break
    kept.push(id)
    used += cost
  }
  return { ids: kept, total: ids.length, truncated: kept.length < ids.length }
}
