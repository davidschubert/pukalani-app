import type {
  ClaimResponse,
  EventsAckResponse,
  HeartbeatResponse,
  RunAttachmentsResponse,
  RunEventPayload,
  RunFinalStatus,
  SessionEndState,
  TranscriptUploadResponse,
} from './protocol.ts'

/**
 * Die HTTP-Seite der Naht — docs/archiv/AI-RUNNER.md § 5.
 *
 * Kein SDK, kein Client-Framework: globales `fetch` reicht, und jede
 * Abhängigkeit weniger ist eine Zeile weniger, die auf einem Rechner mit
 * Dateisystem-Zugriff ausgeführt wird.
 *
 * DAS SECRET REIST AUSSCHLIESSLICH IM `Authorization`-HEADER (§ 5) — nie als
 * Query-Parameter: die landen in nginx-Logs, in Referrern und in der
 * Shell-History. Es taucht deshalb auch in keiner Fehlermeldung dieser Datei
 * auf; `ApiError` trägt Status, Pfad und den (gekürzten) Antworttext.
 */

/**
 * `BodyInit` gibt es in @types/node nicht als globalen Namen (nur `RequestInit`
 * ist global deklariert) — deshalb hier abgeleitet statt geraten.
 */
type RequestBody = NonNullable<RequestInit['body']>

export class ApiError extends Error {
  override name = 'ApiError'
  status: number
  path: string

  constructor(status: number, path: string, message: string) {
    super(`${status} ${path}: ${message}`)
    this.status = status
    this.path = path
  }
}

/** 4xx heisst „so wird das nie klappen" — ein Wiederholungsversuch ist Unsinn (429 ausgenommen). */
export function isPermanentApiError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429
}

const DEFAULT_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

export class RunnerApi {
  #endpoint: string
  #token: string

  constructor(endpoint: string, token: string) {
    this.#endpoint = endpoint.replace(/\/+$/, '')
    this.#token = token
  }

  async #request(path: string, init: { method: string, body?: RequestBody, json?: unknown, timeoutMs?: number }): Promise<Response> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.#token}` }
    let body = init.body
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(init.json)
    }

    let response: Response
    try {
      response = await fetch(`${this.#endpoint}${path}`, {
        method: init.method,
        headers,
        body,
        signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
    }
    catch (error) {
      // Netz, DNS, Standby, VPN — kein HTTP-Status. Status 0 heisst hier
      // „nicht angekommen", und der Backoff behandelt es als vorübergehend.
      throw new ApiError(0, path, (error as Error).message)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new ApiError(response.status, path, text.slice(0, 500) || response.statusText)
    }
    return response
  }

  async #json<T>(path: string, init: { method: string, body?: RequestBody, json?: unknown, timeoutMs?: number }): Promise<T> {
    const response = await this.#request(path, init)
    return await response.json() as T
  }

  /** „Hast du was für mich?" — `{ run: null }` ist der Normalfall, kein Fehler. */
  async claim(): Promise<ClaimResponse> {
    return await this.#json<ClaimResponse>('/api/runner/runs/claim', { method: 'POST' })
  }

  async listAttachments(runId: string): Promise<RunAttachmentsResponse> {
    return await this.#json<RunAttachmentsResponse>(`/api/runner/runs/${runId}/files`, { method: 'GET' })
  }

  async downloadAttachment(runId: string, fileId: string): Promise<Buffer> {
    const response = await this.#request(`/api/runner/runs/${runId}/files/${fileId}`, {
      method: 'GET',
      timeoutMs: UPLOAD_TIMEOUT_MS,
    })
    return Buffer.from(await response.arrayBuffer())
  }

  /**
   * Fortschritt, gebündelt. Die ANTWORT ist der einzige Weg, auf dem der
   * Runner von einem Abbruch im Board erfährt (§ 9) — sie wird deshalb
   * ausgewertet und nicht weggeworfen.
   */
  async postEvents(runId: string, body: { events: RunEventPayload[], sessionId?: string, workBranch?: string }): Promise<EventsAckResponse> {
    return await this.#json<EventsAckResponse>(`/api/runner/runs/${runId}/events`, { method: 'POST', json: body })
  }

  async finish(runId: string, body: { status: RunFinalStatus, resultJson?: string, error?: string, sessionId?: string, workBranch?: string }): Promise<void> {
    await this.#request(`/api/runner/runs/${runId}/finish`, { method: 'POST', json: body })
  }

  /**
   * Der Poll für einen interaktiven Lauf (§ 7.3): „ist die Sitzung vorbei?".
   * Der Daemon fragt das, während das Terminal im Vordergrund läuft — es gibt
   * keinen Elternprozess, der den Ausgang mitläse.
   */
  async sessionEnded(runId: string): Promise<SessionEndState> {
    return await this.#json<SessionEndState>(`/api/runner/runs/${runId}/session-end`, { method: 'GET' })
  }

  /**
   * Das Transkript als multipart. FELDNAME `file` — so liest es
   * `transcript.post.ts`; der Dateiname ist nur Anzeige (der Server benennt
   * die Datei ohnehin nach der Run-Id).
   */
  async uploadTranscript(runId: string, data: Buffer): Promise<TranscriptUploadResponse> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(data)], { type: 'application/x-ndjson' }), 'transcript.jsonl')
    // Kein `json`: FormData setzt seine eigene Content-Type-Grenze selbst —
    // ein von Hand gesetzter Header zerstört sie.
    return await this.#json<TranscriptUploadResponse>(`/api/runner/runs/${runId}/transcript`, {
      method: 'POST',
      body: form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    })
  }

  async heartbeat(capabilities: Record<string, unknown>): Promise<HeartbeatResponse> {
    return await this.#json<HeartbeatResponse>('/api/runner/runners/heartbeat', { method: 'POST', json: { capabilities } })
  }
}

/**
 * Exponentieller Backoff bis 60 s (§ 5: ein Poll-Loop mit Fehler ist eine
 * Selbst-DoS gegen die eigene Konsole). PUR, damit die Kurve prüfbar ist:
 * 0 ⇒ Poll-Abstand, danach Verdoppeln, gedeckelt.
 */
export const MAX_BACKOFF_SECONDS = 60

export function nextBackoffSeconds(previous: number, pollSeconds: number): number {
  const base = Math.max(pollSeconds, 1)
  if (previous <= 0) return base
  return Math.min(MAX_BACKOFF_SECONDS, previous * 2)
}
