import { runEmailDigestSweep } from '../utils/emailDigest'

/**
 * Digest-Intervall: prüft alle 30 Minuten, welche 'digest'-User fällige
 * ungelesene Notifications haben (Dueness pro User: prefs.emailDigestLastAt,
 * ~täglich — Details in emailDigest.ts). `defineTimedJob` statt experimenteller
 * Nitro-scheduledTasks — Single-Instanz-Annahme wie beim Rate-Limit
 * dokumentiert; manuell auslösbar über POST /api/notifications/run-digest.
 * Ohne konfiguriertes SMTP ist der Sweep ein sofortiger no-op.
 */
const SWEEP_INTERVAL_MS = 30 * 60 * 1000

export default defineNitroPlugin(async () => {
  if (!await mailerConfigured()) return
  // Kein Sofortlauf (wie bisher): der erste Takt kommt nach 30 min. Fehler je
  // Empfänger bleiben fachlich (`result.errors`); nur ein Wurf des ganzen
  // Laufs ist `failed` — bis OPS-011 endete der als unbehandelte Ablehnung.
  // unref, damit der Timer einen sauberen Exit (CLI/Tests) nicht offen hält.
  defineTimedJob({
    name: 'email-digest',
    everyMs: SWEEP_INTERVAL_MS,
    unref: true,
    run: async () => {
      const result = await runEmailDigestSweep()
      if (result.sent || result.errors) {
        console.info(`[core] Digest-Sweep: ${result.sent} gesendet, ${result.skipped} übersprungen, ${result.errors} Fehler (${result.candidates} Kandidaten)`)
      }
    },
  })
})
