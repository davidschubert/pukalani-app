import { accountAreaUrl } from '../../shared/customDomainScope'
import { resolveControlHosts } from '../../shared/controlCenter'

/**
 * Läuft diese Seite auf der EIGENEN DOMAIN einer Community im Modus `write`
 * (PK1 E1b-2)? Dann gibt es hier nur Mitmachen: Konto, Geräte, Export,
 * Löschen, Community-Wechsel und Verwalten liegen im Kundenbereich bzw. unter
 * der Pukalani-Adresse, und ihre Routen antworten hier 404.
 *
 * Der Wert kommt per SSR aus `event.context.customDomainScope`
 * (`01.custom-domain-scope.ts` → `tenant-brand.server.ts`) — der Browser
 * rechnet nichts nach und kennt den Schalter nicht. Überall sonst `false`.
 * NUR UX-Schicht: die Grenze ist die Middleware.
 */
export function useCustomDomainScope() {
  return useState<boolean>('pukalani-custom-domain-scope', () => false)
}

/**
 * Läuft die Live-Verbindung auf dieser eigenen Domain über unseren Server
 * (PK1 E1d)? Spiegel von `event.context.liveRelay`; nur zusammen mit
 * `useCustomDomainScope()` sinnvoll. Leser: `useRealtimeClient.ts`.
 */
export function useLiveRelay() {
  return useState<boolean>('pukalani-live-relay', () => false)
}

/**
 * Adresse des Kundenbereichs (erster Kontroll-Host aus der vorhandenen
 * Config, nie fest geschrieben) — leer, wenn keiner eingestellt ist.
 */
export function useAccountAreaUrl(): string {
  const config = useRuntimeConfig()
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { controlHosts?: string[] } } }
  const hosts = resolveControlHosts(
    (config.public as { tenancy?: { controlHosts?: string } }).tenancy?.controlHosts,
    appConfig.pukalani?.tenancy?.controlHosts,
  )
  return accountAreaUrl(hosts, useRequestURL().port)
}
