import type { H3Event } from 'h3'
import { communitySettingsRowId } from '../../shared/communitySettingsRow'

/**
 * Die Row-Id der Community-Einstellungen DIESES Requests — Navigation,
 * Sucheintrag, Weiterleitungen (Regel + Begründung: shared/communitySettingsRow.ts).
 * `null` = hier gibt es keine Zeile (Kontroll-Host): Leser antworten leer,
 * Schreib-Routen 404.
 */
export function communitySettingsRowIdFor(event: H3Event): string | null {
  return communitySettingsRowId(useTenant(event), event.context.controlCenter === true)
}
