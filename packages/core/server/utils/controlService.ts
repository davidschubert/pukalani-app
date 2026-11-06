import { Account, Client } from 'node-appwrite'
import type { H3Event } from 'h3'
import { seamSecretToSend } from './sharedSeamSecret'

/**
 * Der Ruf ins Control Plane — als GENERISCHER Transport im Fundament.
 *
 * Er stand bis E10 nur im onboarding-Layer (`server/utils/controlPlane.ts`).
 * Mit dem zentralen Kunden-Feedback braucht ihn ein ZWEITER Layer (feedback),
 * und der lebt in Apps ohne onboarding (apps/control). Zwei Kopien derselben
 * Vertrauensnaht wären genau die Sorte Doppelpflege, bei der eines Tages nur
 * eine der beiden einen Fehlerfall richtig behandelt.
 *
 * DASS DAS IM CORE STEHEN DARF, ist kein Aufweichen von A14: hier ist keine
 * Produktkenntnis drin. Der Transport weiß von einem Pfad, einem Body, einem
 * Secret und einem Appwrite-JWT — nicht davon, was am anderen Ende passiert.
 * Die Semantik (welcher Pfad, welche Nutzlast) bleibt beim rufenden Layer.
 *
 * Die Runtime-Config-Schlüssel heißen weiter `onboardingControlUrl` /
 * `onboardingServiceSecret`. Das ist bewusst NICHT umbenannt: sie sind als
 * `NUXT_ONBOARDING_CONTROL_URL` / `NUXT_ONBOARDING_SERVICE_SECRET` auf jeder
 * Maschine gesetzt, und ein Umbenennen wäre ein Deployment-Bruch für einen
 * kosmetischen Gewinn.
 *
 * Fehler werden bewusst DURCHGELASSEN, nicht geglättet: 4xx sind Aussagen über
 * die Eingabe. Nur was gar nicht antwortet, wird zu 503 — dann ist die
 * Gegenseite gestört, nicht die Eingabe.
 */

export interface ControlServiceConfig {
  url: string
  secret: string
}

const SERVICE_HEADER = 'x-pukalani-onboarding-secret'

/**
 * SEIT DEM 2026-08-18 ASYNC (A0-Rest): das Service-Secret kann jetzt auch aus
 * der Betreiber-Konsole kommen (`instance_secrets`, Sorte `onboarding-service`),
 * und die Ablage zu lesen ist ein Appwrite-Ruf.
 *
 * DER UMBAU WAR VERTRETBAR, weil es genau ZWEI Aufrufstellen gibt und beide
 * ohnehin in async-Funktionen sitzen: `callControlService` hier unten und der
 * Namens-Wrapper `controlPlaneConfig` im onboarding-Layer. Kein Vergleich zum
 * Empfänger-Gate im Control Plane, das 50 Routen aufrufen — dort hängt am
 * vergessenen `await` ein FAIL-OPEN, hier nur ein Typfehler (die Antwort wäre
 * ein Promise ohne `url`).
 *
 * Rangfolge Konsole → Env: dieselbe wie bei jedem anderen Zugang. Begründung
 * und die Rotations-Reihenfolge: `sharedSeamSecret.ts`.
 */
export async function controlServiceConfig(event: H3Event): Promise<ControlServiceConfig> {
  const config = useRuntimeConfig(event) as {
    onboardingControlUrl?: string
    onboardingServiceSecret?: string
  }
  const url = (config.onboardingControlUrl || '').replace(/\/+$/, '')
  const secret = await seamSecretToSend(event, 'onboarding-service', config.onboardingServiceSecret)
  if (!url || !secret) {
    // 503 statt 404: hier ist etwas FALSCH KONFIGURIERT, nicht abwesend — der
    // Unterschied entscheidet, ob jemand danach sucht.
    logEvent('error', 'control_service.not_configured', { hasUrl: !!url, hasSecret: !!secret })
    throw createError({ status: 503, statusText: 'Control plane is not configured' })
  }
  return { url, secret }
}

/**
 * Ist die Naht überhaupt konfiguriert? (Für Aufrufer, die sauber degradieren
 * müssen, statt einen 503 zu werfen — z. B. ein Dashboard-Bereich, der das
 * restliche Dashboard nicht mitreißen darf.)
 *
 * EBENFALLS ASYNC seit dem 2026-08-18, und zwar zwingend: sonst meldete eine
 * Instanz, deren Secret NUR in der Konsole steht, „nicht konfiguriert" — und
 * die Aufrufer degradierten still, obwohl die Naht steht. Genau die Sorte
 * Wirkungslosigkeit, gegen die die Konsolen-Ablage gebaut ist.
 */
export async function controlServiceAvailable(event: H3Event): Promise<boolean> {
  const config = useRuntimeConfig(event) as {
    onboardingControlUrl?: string
    onboardingServiceSecret?: string
  }
  if (!(config.onboardingControlUrl || '')) return false
  return Boolean(await seamSecretToSend(event, 'onboarding-service', config.onboardingServiceSecret))
}

/**
 * Kurzlebiges JWT des eingeloggten Nutzers (wie beim Realtime-Token).
 *
 * `sessionSecret` ist die Ausnahme für Vorgänge BEI DER ANMELDUNG: dort ist die
 * Session eine Millisekunde alt und steckt noch nicht im Request-Cookie
 * (setSessionCookie schreibt in die ANTWORT), also gibt es weder
 * `event.context.user` noch einen brauchbaren Session-Client.
 */
export async function mintServiceJwt(event: H3Event, sessionSecret?: string): Promise<string> {
  if (sessionSecret) {
    const config = useRuntimeConfig(event)
    const client = new Client()
      .setEndpoint(config.public.appwriteEndpoint)
      .setProject(config.public.appwriteProjectId)
      .setSession(sessionSecret)
    // node-appwrite 28: `account.createJWT` ist entfernt, geminzt wird jetzt am
    // ADMIN-Client (`users.createJWT`). Der braucht eine userId — und die darf
    // NICHT vom Aufrufer kommen. Deshalb zuerst `account.get()` mit dem
    // Session-Client: der Ruf BEWEIST die Session (kein Konto ⇒ Fehler ⇒ 401)
    // und liefert dieselbe userId, die das alte Verfahren implizit benutzte.
    const userId = await new Account(client).get()
      .then(user => user.$id)
      .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
    const { users } = createAdminClient(event)
    const { jwt } = await users.createJWT({ userId, duration: 120 })
      .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
    return jwt
  }

  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  // Hier ist die Session bereits durch die Auth-Middleware belegt
  // (`event.context.user`) — die userId kommt aus dem Context, nie aus dem Body.
  const { users } = createAdminClient(event)
  const { jwt } = await users.createJWT({ userId: event.context.user.$id, duration: 120 })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return jwt
}

/** Dasselbe, aber ohne Session einfach kein JWT — für Wege, die bewusst auch
 *  anonym gehen dürfen (Feedback senden, Entscheidung 4). */
export async function mintServiceJwtIfPossible(event: H3Event): Promise<string | undefined> {
  if (!event.context.user) return undefined
  return await mintServiceJwt(event).catch(() => undefined)
}

export async function callControlService<T>(event: H3Event, path: string, body: Record<string, unknown>): Promise<T> {
  const { url, secret } = await controlServiceConfig(event)
  try {
    // Cast: $fetch typisiert die Antwort über NitroFetchRequest (die Route liegt
    // in einer ANDEREN App, also gibt es hier keine abgeleiteten Route-Typen).
    // Fremder Dienst (das Control Plane ist ein EIGENES Deployment), deshalb
    // `, string` als Anfrage-Generic — Begruendung in
    // apps/platform/server/utils/tenantBrandMark.ts.
    return await $fetch<T>(`${url}${path}`, {
      method: 'POST',
      headers: { [SERVICE_HEADER]: secret },
      body,
      timeout: 15_000,
    }) as T
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status
      ?? (error as { statusCode?: number }).statusCode
    const statusText = (error as { statusText?: string, statusMessage?: string }).statusText
      ?? (error as { statusMessage?: string }).statusMessage
    // 4xx = Aussage über die Eingabe → unverändert weitergeben. MIT `data`:
    // die Gegenseite legt ihren fachlichen Grund als `reason` ins Envelope
    // (last_owner, community_muted, …). ZWEI Envelopes hintereinander, und das
    // ist die Stelle, an der man sich vertut: das Control Plane ist selbst eine
    // pukalani-App, seine Antwort ist also schon das fertige Envelope
    // `{ ok, code, message, reason }` und steckt bei $fetch in `error.data`.
    // Der Grund muss deshalb aus `data.reason` gelesen und als `data.code` NEU
    // gesetzt werden — dann macht unser eigener Error-Handler daraus wieder ein
    // `reason` für den Browser. Weitergegeben wird ausschließlich dieser
    // Schlüssel — keine Appwrite-Details, keine fremden Nutzlasten.
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const payload = (error as { data?: { reason?: unknown } }).data
      const reason = typeof payload?.reason === 'string' ? payload.reason : null
      throw createError({
        status,
        statusText: statusText || 'Request rejected',
        ...(reason ? { data: { code: reason } } : {}),
      })
    }
    logEvent('error', 'control_service.unreachable', {
      path,
      status: status ?? 0,
      message: error instanceof Error ? error.message : String(error),
    })
    throw createError({ status: 503, statusText: 'Control plane is temporarily unavailable' })
  }
}
