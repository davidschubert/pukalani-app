import { createLabelReconcileReader } from '../../../../packages/control/server/utils/labelReconcileReader'
import { labelReconcileMode, registerLabelReconcileReader, runLabelReconcile } from '../../../../packages/onboarding/server/utils/labelReconcile'

/**
 * A14-Komposition für den LABEL-ABGLEICH (SEC-024, seit 2026-11-13): ein
 * Community-Label, das nach „Zugang entziehen" hängen blieb, wird stündlich
 * nachgezogen. Die ganze Begründung — was der Lauf tut und was er NIE tut —
 * steht im Kopf von packages/onboarding/server/utils/labelReconcile.ts,
 * Betrieb im Runbook docs/runbooks/LABEL-ABGLEICH.md.
 *
 * Die App verdrahtet die zwei Hälften wie bei der Zahlungswarnung
 * (past-due-notice.ts): LESEN gehört dem control-Layer (`community_members`,
 * Cross-Projekt-Read mit dem read-only-Schlüssel), ENTZIEHEN dem
 * onboarding-/core-Layer (Labels liegen im Pool-Projekt dieser App).
 *
 * SCHALTER `pukalani.community.labelReconcile` ('off' | 'dry-run' | 'apply';
 * Core-Default 'off'). Der Leser wird IMMER registriert, wenn die Control-Env
 * da ist — die Ops-Route kann damit auch bei 'off' einen Probelauf machen.
 * Der Takt läuft nur bei 'dry-run'/'apply'; ein ungültiger Wert gilt als
 * 'off' und schreibt eine Fehlerzeile.
 *
 * TAKT stündlich. Erster Lauf VERSETZT zur Zahlungswarnung (die startet nach
 * 45 s): zwei Läufe im selben Augenblick teilten sich sonst den Boot-Moment
 * und das read-only-Kontingent des Control Plane.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000

export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    // Dieselbe Bedingung wie Tenant-Resolver und Zahlungswarnung — deren
    // Meldung beim Start genügt.
    return
  }

  registerLabelReconcileReader(createLabelReconcileReader({ endpoint, projectId, apiKey, databaseId }))

  const mode = labelReconcileMode()
  if (mode === 'off') return

  const sweep = () => {
    // Die Zusammenfassung schreibt der Lauf selbst (logEvent); hier landet nur,
    // was ihn als Ganzes scheitern ließ (erste Seite des Lesers).
    void runLabelReconcile(mode).catch((error: unknown) => {
      console.error('[platform] Label-Abgleich fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
