/**
 * Health-Abfragen gegen die Appwrite-Instanz — als schlanker REST-Helfer
 * statt über das SDK.
 *
 * GRUND: node-appwrite kennt den `Health`-Service nicht mehr (seit 27
 * entfernt). Die Endpunkte selbst gibt es auf unserem Server (2.0)
 * unverändert, sie sind nur nicht mehr im SDK abgebildet. Der Helfer ersetzt
 * deshalb GENAU die fünf Methoden, die dieses Repo je benutzt hat
 * (`get`/`getDB`/`getCache`/`getStorage`/`getTime`) — gleiche Namen, gleiche
 * Antwort-Form, damit die Aufrufstellen (core/server/api/health.ts,
 * admin/server/api/admin/system.get.ts) unverändert bleiben.
 *
 * Zwei Eigenheiten mit Grund:
 * (1) TIMEOUT. Das SDK hatte keinen; ein hängender Health-Endpunkt hielt den
 *     Uptime-Check und die Systemseite beliebig lange auf. 5 s sind hier
 *     großzügig — die Endpunkte antworten sonst im Millisekunden-Bereich.
 * (2) KEINE FEHLERDETAILS NACH AUSSEN. Ein fehlgeschlagener Abruf wirft einen
 *     nackten 502 (Endpoint, Statuscode und Appwrite-Meldung bleiben drin);
 *     die Aufrufer entscheiden selbst, ob sie das fangen (Systemseite →
 *     Status 'unknown') oder durchreichen (/api/health → nicht-2xx = down).
 */

/**
 * Antwort eines Health-Endpunkts. Appwrite antwortet je nach Endpunkt mit
 * EINEM Status (`/health`) oder mit einer LISTE (`/health/db` kann mehrere
 * Datenbanken kennen) — beide Formen sind hier abgebildet, das Auswerten
 * bleibt beim Aufrufer (unverändert zum SDK-Verhalten).
 */
export interface AppwriteHealthStatus {
  name?: string
  status?: string
  ping?: number
  statuses?: AppwriteHealthStatus[]
}

/**
 * Antwort von `/health/time` — Feldnamen wie im Appwrite-Modell `HealthTime`
 * (`remoteTime`/`localTime`, NICHT `remote`/`local`). Gebraucht wird nur
 * `diff`: die Abweichung zur Atomzeit in Millisekunden.
 */
export interface AppwriteHealthTime {
  remoteTime?: number
  localTime?: number
  diff: number
}

const TIMEOUT_MS = 5_000

/**
 * Antwort-Format, das node-appwrite 29 selbst mitschickt. Explizit gesetzt,
 * damit dieser Helfer und das SDK GARANTIERT dieselben Formen sehen: ohne den
 * Header wendet der Server sein NEUESTES Format an — läge der Helfer damit auf
 * einem anderen Stand als jeder SDK-Aufruf daneben, und zwar lautlos. Beim
 * nächsten SDK-Bump mitziehen (Wert steht in dessen `dist/client.js`; das
 * Web-SDK 27 sendet denselben).
 */
const RESPONSE_FORMAT = '2.0.0'

async function fetchHealth<T>(endpoint: string, projectId: string, apiKey: string, path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, {
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'X-Appwrite-Response-Format': RESPONSE_FORMAT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }
  catch {
    // Netzfehler/Timeout — bewusst ohne Ursache nach außen.
    throw createError({ status: 502, statusText: 'Appwrite health check failed' })
  }
  if (!response.ok) {
    throw createError({ status: 502, statusText: 'Appwrite health check failed' })
  }
  return await response.json() as T
}

/**
 * Ersatz für `new Health(client)` — dieselben Methodennamen, damit die
 * Aufrufstellen sich nicht ändern. Wird von `createAdminClient()` als
 * `health`-Getter angeboten (lazy, wie die SDK-Services).
 */
export function createAppwriteHealth(endpoint: string, projectId: string, apiKey: string) {
  return {
    get: () => fetchHealth<AppwriteHealthStatus>(endpoint, projectId, apiKey, '/health'),
    getDB: () => fetchHealth<AppwriteHealthStatus>(endpoint, projectId, apiKey, '/health/db'),
    getCache: () => fetchHealth<AppwriteHealthStatus>(endpoint, projectId, apiKey, '/health/cache'),
    getStorage: () => fetchHealth<AppwriteHealthStatus>(endpoint, projectId, apiKey, '/health/storage'),
    getTime: () => fetchHealth<AppwriteHealthTime>(endpoint, projectId, apiKey, '/health/time'),
  }
}
