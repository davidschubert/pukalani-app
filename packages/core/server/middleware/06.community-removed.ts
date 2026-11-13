import { COMMUNITY_REMOVED_CODE, isApiPath, removedApiAllowed } from '../../shared/communityRemoval'
import { isRemovedFromCommunity } from '../utils/communityRemoval'

/**
 * ENTFERNTE KONTEN SIND DRAUSSEN (SEC-030 Teil 2, seit 2026-11-13 — Davids
 * Entscheidung: wer aus einer Community entfernt wurde, kann dort nichts mehr
 * schreiben, auch keine privaten Antworten, und bekommt keinen Zugriff mehr,
 * sondern den Hinweis, dass ein Administrator ihn entfernt hat).
 *
 * WARUM DIESER DATEINAME: Nitro sortiert die Middleware lexikografisch
 * (siehe Kopf von `06.community-label.ts`). `06.community-removed` liegt
 * damit NACH `06.community-label` (`l` < `r`) und VOR `07.community-role`
 * (`e` < `o`). NACH dem Label, weil die Label-Middleware für eine entfernte
 * Person das Lese-Publikum einzieht (Selbstheilung, auch über die
 * Erlaubnisliste hinweg — ein Besuch von `/api/auth/me` genügt) und diese
 * Sperre das nicht verhindern darf; nach `05.rate-limit` und
 * `03.csrf-origin`, damit ein gedrosselter oder abgewiesener Request keine
 * Auflösung auslöst.
 *
 * WAS SIE TUT, für einen angemeldeten Nutzer auf einem Pool-Host:
 *  - `event.context.communityRemoved = true`, wenn er entfernt ist (Seiten
 *    UND API) — der Server-Plugin `tenant-brand.server.ts` spiegelt das in
 *    den Client, die Routen-Middleware führt dann auf die Hinweisseite;
 *  - für `/api/**` außerhalb der Erlaubnisliste 403 mit
 *    `data: { code: 'community_removed' }` — VOR jeder Route, also auch vor
 *    Lese-Routen, privaten Nachrichten, Anwesenheit, Glocke und
 *    Realtime-Token. Die Erlaubnisliste ist fail-closed
 *    (`shared/communityRemoval.ts`), Layer melden eigene Pfade über
 *    `pukalani.community.removedAllowedApi` an;
 *  - für Seiten-Requests wirft sie NICHTS: die Hinweisseite ist selbst eine
 *    Seite, und die Umleitung macht die Routen-Middleware mit `localePath()`.
 *
 * Interne Pfade (`/_nuxt`, `/_i18n`, …) überspringt sie: sie tragen keine
 * Community-Daten, und die Hinweisseite braucht sie zum Rendern.
 *
 * KOSTEN: für ein Mitglied eine Rollen-Auflösung aus dem 30-s-Cache — dieselbe,
 * die `06.community-label.ts` eine Datei vorher schon gefragt hat. Nur wer
 * KEINE Rolle hat, kostet zusätzlich den gebündelten Resolver „ehemalig"
 * (60-s-Cache je Nutzer).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const tenant = event.context.tenant
  if (!user?.$id || tenant?.mode !== 'pool' || !tenant.communityId) return

  const path = event.path.split('?')[0] ?? ''
  if (path.startsWith('/_')) return

  if (!await isRemovedFromCommunity(event)) return
  event.context.communityRemoved = true

  if (!isApiPath(path)) return

  const appConfig = useAppConfig() as {
    pukalani?: { community?: { removedAllowedApi?: string[] } }
  }
  if (removedApiAllowed(path, appConfig.pukalani?.community?.removedAllowedApi ?? [])) return

  throw createError({ status: 403, statusText: 'Forbidden', data: { code: COMMUNITY_REMOVED_CODE } })
})
