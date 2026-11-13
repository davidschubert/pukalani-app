import { createAdminClient } from '../lib/appwrite'

/**
 * Health-Check gegen die Appwrite-Instanz via AdminClient (Scope: health.read).
 *
 * Bewusst methodenneutral (Datei `health.ts`, NICHT `health.get.ts`): Uptime-
 * Monitore (UptimeRobot Free-Plan) und Load-Balancer prüfen oft per HEAD —
 * ein GET-only-Handler lieferte HEAD → 404 und damit falsche DOWN-Alerts.
 * H3 verwirft den Body bei HEAD automatisch; der Statuscode ist das Signal.
 *
 * ZWISCHENSPEICHER STATT DROSSEL (BE-002): die Route ist ohne Anmeldung
 * erreichbar, und jeder Aufruf traf Appwrite — ein billiger Hebel für
 * Dauerfeuer. Eine 429 wäre hier aber die falsche Antwort: die Wächter
 * (`verify-health.mjs`), der Deploy-Beweis und UptimeRobot dürfen NIE eine
 * 429 sehen, sonst meldet die Überwachung einen Ausfall, den es nicht gibt.
 * Deshalb hält jeder Prozess das Ergebnis der Appwrite-Abfrage 5 Sekunden,
 * und gleichzeitige Aufrufe teilen sich EINE laufende Abfrage. Auch ein
 * Fehlschlag wird so lange gehalten (bei einem Ausfall soll nicht jeder
 * Aufruf Appwrite erneut treffen) und wie bisher als Fehler weitergegeben.
 * `build` kommt aus der Laufzeit-Config und wird nicht zwischengespeichert.
 *
 * Das frühere Feld `user` (Spiegel von `event.context.user`) ist entfallen:
 * kein Leser im Repo, und eine Infra-Route soll keine Sitzungsdaten tragen.
 */
const CACHE_MS = 5_000

/**
 * Wie lange sich Aufrufe eine LAUFENDE Abfrage teilen. Der Appwrite-Client hat
 * keine eigene Frist: bliebe eine Abfrage für immer offen, hinge ohne diese
 * Grenze jeder spätere Aufruf an ihr — und `/api/health` wäre bis zum
 * Neustart des Prozesses stumm. Danach startet der nächste Aufruf eine neue.
 */
const IN_FLIGHT_MS = 10_000

/** Die laufende oder zuletzt beendete Abfrage; ab Ende gilt `CACHE_MS`. */
let cached: { result: Promise<boolean>, expiresAt: number } | null = null

function appwriteHealthy(event: Parameters<typeof createAdminClient>[0]): Promise<boolean> {
  if (cached && Date.now() < cached.expiresAt) return cached.result

  const entry = {
    result: createAdminClient(event).health.get().then(status => status.status === 'pass'),
    // Solange die Abfrage läuft, teilen sich alle Aufrufe dieselbe (befristet).
    expiresAt: Date.now() + IN_FLIGHT_MS,
  }
  const settle = () => {
    entry.expiresAt = Date.now() + CACHE_MS
  }
  entry.result.then(settle, settle)
  cached = entry
  return entry.result
}

export default defineEventHandler(async (event) => {
  const ok = await appwriteHealthy(event)

  return {
    ok,
    // Deployter Commit (Build-Zeit) — Basis der Deploy-Verifikation (A.5)
    build: useRuntimeConfig(event).public.buildSha || null,
  }
})
