import { closeAllLiveRelays } from '../utils/liveRelay'
import { LIVE_RELAY_PATH } from '../../shared/liveRelay'

/**
 * WEBSOCKET NUR FÜR DIE LIVE-VERBINDUNG (PK1 E1d).
 *
 * Mit `nitro.experimental.websocket` (nur die Platform) hängt Nitro einen
 * `upgrade`-Empfänger an den Server, und crossws nähme dann JEDEN Pfad als
 * WebSocket an — eine Route ohne eigene Hooks bekäme eine Verbindung, die
 * nichts tut, aber offen bleibt (vorher: Node schloss den Socket sofort). Der
 * globale `upgrade`-Hook hier lässt nur `/api/live/realtime` durch, alles
 * andere bekommt 404 wie vorher. In der Entwicklung bleiben Nuxts eigene
 * Pfade (`/_…`, z. B. Vites HMR) unberührt.
 *
 * Beim Herunterfahren schließt er alle Live-Verbindungen sauber.
 *
 * Ohne WebSocket im Build (alle anderen Apps) tut das Plugin nichts.
 */
interface UpgradeRequest { url: string }
type WebsocketOptions = { hooks?: { upgrade?: (request: UpgradeRequest) => unknown } & Record<string, unknown> } & Record<string, unknown>

export function liveUpgradeGuard(request: UpgradeRequest, dev: boolean): Response | undefined {
  let path: string
  try {
    path = new URL(request.url).pathname
  }
  catch {
    return new Response(null, { status: 404 })
  }
  if (path === LIVE_RELAY_PATH) return undefined
  if (dev && path.startsWith('/_')) return undefined
  return new Response(null, { status: 404 })
}

export default defineNitroPlugin((nitroApp) => {
  if (!import.meta._websocket) return
  const app = nitroApp.h3App as unknown as { options: { websocket?: WebsocketOptions } }
  const previous = app.options.websocket ?? {}
  app.options.websocket = {
    ...previous,
    hooks: {
      ...previous.hooks,
      upgrade: (request: UpgradeRequest) => liveUpgradeGuard(request, import.meta.dev),
    },
  }
  nitroApp.hooks.hook('close', () => closeAllLiveRelays())
})
