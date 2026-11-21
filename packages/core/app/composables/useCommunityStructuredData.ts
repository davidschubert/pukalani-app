import { resolveCommunitySeo } from '../../shared/communitySeo'
import { communityStructuredDataAllowed } from '../../shared/communityStructuredData'
import { primaryLocalePath } from '../../shared/primaryLocale'
import { resolveSeoOrigin } from '../../shared/seoOrigin'

/**
 * Strukturierte Daten einer Seite mit Nutzerinhalt (SU1, SEO-003): der EINE
 * Aufruf für Diskussion, Kurs und Termin. Regeln und Begründung:
 * `shared/communityStructuredData.ts`.
 *
 * `source` liefert das Objekt OHNE `@context` (den setzt diese Hilfe) oder
 * `null`, wenn die Seite nichts aussagen soll (z. B. ein geschwärzter Termin).
 * Die Daten gehen durch `jsonLdScript` — `<` wird escapet, ein Titel mit
 * `</script>` schließt den Block nicht.
 */
export function useCommunityStructuredData(source: () => Record<string, unknown> | null): void {
  const { membersOnly } = useTenantAudience()
  const communitySeo = useCommunitySeoSettings()

  useHead(() => {
    const allowed = communityStructuredDataAllowed({
      membersOnly: membersOnly.value,
      noindex: resolveCommunitySeo(communitySeo.value).noindex,
    })
    const graph = allowed ? source() : null
    return { script: graph ? [jsonLdScript({ '@context': 'https://schema.org', ...graph })] : [] }
  })
}

/**
 * Die maßgebliche, absolute Adresse eines Inhalts: Hauptsprache der Community
 * (Q10) auf dem Origin, den auch `canonical` nimmt (`useLocaleSeoHead`).
 * `path` ist OHNE Sprach-Vorsatz.
 */
export function useCommunityContentUrl(path: () => string): ComputedRef<string> {
  const primary = usePrimaryLocale()
  const requestUrl = useRequestURL()
  const appConfig = useAppConfig() as { pukalani?: { seo?: { originFromRequest?: boolean } } }
  const publicConfig = useRuntimeConfig().public as { i18n?: { baseUrl?: unknown } }
  const configuredBaseUrl = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : ''
  const origin = appConfig.pukalani?.seo?.originFromRequest === true
    ? resolveSeoOrigin(requestUrl.origin, configuredBaseUrl) || requestUrl.origin
    : (configuredBaseUrl.replace(/\/+$/, '') || requestUrl.origin)

  return computed(() => `${origin}${primaryLocalePath(path(), primary.value)}`)
}
