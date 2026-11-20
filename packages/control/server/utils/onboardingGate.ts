import { AppwriteException } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  FAILSAFE_ONBOARDING_GATE,
  onboardingInviteRequired,
  type OnboardingGateState,
} from '../../../core/shared/onboardingGate'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * Das Early-Access-Tor als LAUFZEIT-Einstellung (U2, 2026-08-10).
 *
 * WO DER ZUSTAND LIEGT UND WARUM DORT: in `app_config/global` des
 * CONTROL-Projekts (Spalte `onboardingInviteOnly`, system-030). Das ist der
 * bestehende Ort für Betreiber-Laufzeit-Schalter (`registrationEnabled`,
 * `maintenanceMode`, `aiModel`) — eine eigene Tabelle für einen einzelnen
 * Boolean wäre eine zweite Wahrheit mit eigener Migration, eigenem Leser und
 * eigener Verfallszeit.
 *
 * WARUM IM CONTROL PLANE UND NICHT IN DER PLATFORM-APP: hier steht die
 * Prüfung, die tatsächlich ablehnt (site.post.ts). Ein Schalter, der woanders
 * liegt als die Durchsetzung, ist eine Ansage, keine Regel.
 *
 * KEIN Cache: gelesen wird beim Anlegen einer Community (selten) und von der
 * Service-Naht — und DIE cacht bereits eine Ebene weiter oben, wo der Verkehr
 * ist (packages/onboarding/server/api/onboarding/gate.get.ts). Ein zweiter
 * Cache hier verlängerte nur das Fenster, in dem der Schalter noch nicht wirkt.
 */
export async function readOnboardingGate(event?: H3Event): Promise<OnboardingGateState> {
  // getAppConfig fällt bei fehlender Zeile/Tabelle/Verbindung selbst auf
  // DEFAULT_APP_CONFIG zurück — und dessen `onboardingInviteOnly` ist `true`.
  const config = await getAppConfig(event).catch(softFail('control:utils/onboardingGate:getAppConfig', null))
  if (!config) return { ...FAILSAFE_ONBOARDING_GATE }
  return { inviteRequired: onboardingInviteRequired(config.onboardingInviteOnly) }
}

/**
 * Den Schalter umlegen. Upsert wie in der Admin-Config-Route: `updateRow`, bei
 * 404 `createRow` — die Zeile `global` entsteht auf einer frischen Instanz
 * erst mit dem ersten Schreibvorgang.
 *
 * Geschrieben wird GENAU dieses eine Feld. Ein Voll-Patch (wie ihn die
 * Admin-Config-Seite fährt) würde `registrationEnabled` & Co. mit dem Stand
 * des Aufrufers überschreiben — hier weiß niemand etwas über sie.
 */
export async function writeOnboardingGate(event: H3Event, inviteRequired: boolean): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const data = { onboardingInviteOnly: inviteRequired }

  try {
    await admin.tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }
  catch (error) {
    if (error instanceof AppwriteException && error.code === 404) {
      await admin.tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
        .catch(e => { throw toH3Error(e, 'Could not save the onboarding gate') })
    }
    else {
      throw toH3Error(error, 'Could not save the onboarding gate')
    }
  }
}
