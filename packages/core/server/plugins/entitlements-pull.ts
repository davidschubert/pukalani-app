import { runEntitlementsPull } from '../utils/entitlementsPull'

/**
 * Entitlement-Pull-Intervall (F3/M8-Vorbereitung): Die Site MUSS ihr
 * signiertes Dokument mindestens alle 15 min pullen (Strategie § F3 —
 * Push/Realtime wäre nur Beschleunigung, nie der einzige Kanal). Ohne
 * NUXT_ENTITLEMENTS_URL sofortiger no-op (Klasse-A-Sites ohne Zustellung
 * laufen unverändert; die Gates bleiben neutral). Gleiches Muster wie
 * Digest-/Health-Sweep: `defineTimedJob` + Erst-Lauf, Single-Instanz-Annahme;
 * manuell auslösbar über POST /api/platform/entitlements/refresh.
 */
const PULL_INTERVAL_MS = 15 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10 * 1000

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().entitlementsUrl) return

  defineTimedJob({
    name: 'entitlements-pull',
    everyMs: PULL_INTERVAL_MS,
    firstRunMs: FIRST_RUN_DELAY_MS,
    unref: true,
    run: async () => {
      const result = await runEntitlementsPull()
      if (result.status === 'updated') {
        console.info(`[core] Entitlements aktualisiert — ${result.detail}`)
      }
      else if (result.status === 'error') {
        // Die Util meldet den Fehlschlag als ERGEBNIS (die Hand-Route zeigt
        // ihn so an); für den Takt wird er zum Wurf, damit `job.run` ihn als
        // `failed` zählt. Last-known-good bleibt aktiv.
        throw new Error(`Entitlement-Pull fehlgeschlagen: ${result.detail ?? 'unbekannt'}`)
      }
    },
  })
})
