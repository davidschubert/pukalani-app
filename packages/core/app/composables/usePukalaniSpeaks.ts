import { pukalaniSpeaks } from '../../shared/brandFamily'
import { useIsControlCenter } from './useControlCenter'

/**
 * Spricht auf dieser Seite Pukalani selbst (Kontroll-Host wie der
 * Kundenbereich, kein Mandant)? Dann zeigen Anmeldung und Kundenbereich das
 * Pukalani-Zeichen (`PukaMark`), sonst nicht (R4, Regel in
 * `shared/brandFamily.ts`). Host und Tenant-Name kommen aus dem Request bzw.
 * dem SSR-Payload — Server und Browser rechnen dasselbe.
 */
export function usePukalaniSpeaks() {
  const tenantBrand = useTenantBrand()
  const controlHost = useIsControlCenter()
  return computed(() => pukalaniSpeaks({ tenantBrand: tenantBrand.value, controlHost }))
}
