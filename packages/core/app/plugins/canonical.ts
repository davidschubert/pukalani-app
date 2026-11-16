import { canonicalPluginOrigin } from '../../shared/seoOrigin'

/**
 * Setzt auf jeder Page ein <link rel="canonical"> auf die kanonische, Slash-lose
 * URL — Gegenstück zur trailing-slash-Middleware. Nutzt die konfigurierte
 * Produktions-URL (NUXT_PUBLIC_APP_URL); im Dev fällt es auf den Request-Origin
 * zurück. Query-Parameter bleiben außen vor (Canonical zeigt auf den reinen Pfad).
 *
 * Mit `pukalani.seo.originFromRequest` dieselbe Basis wie `useLocaleSeoHead`
 * (Host der Anfrage, Schema aus der Env) — sonst zeigte eine Einzel-Site mit
 * eigener Domain hier auf die Standard-Adresse. Begründung und Messung:
 * `canonicalPluginOrigin` in shared/seoOrigin.ts.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const config = useRuntimeConfig()
  const appConfig = useAppConfig() as { pukalani?: { seo?: { originFromRequest?: boolean } } }
  const requestUrl = useRequestURL()
  const publicConfig = config.public as { appUrl?: unknown, i18n?: { baseUrl?: unknown } }

  useHead(() => {
    const origin = canonicalPluginOrigin({
      originFromRequest: appConfig.pukalani?.seo?.originFromRequest === true,
      requestOrigin: requestUrl.origin,
      appUrl: typeof publicConfig.appUrl === 'string' ? publicConfig.appUrl : '',
      i18nBaseUrl: typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : '',
    })
    const path = route.path.length > 1 ? route.path.replace(/\/+$/, '') : route.path
    return { link: [{ rel: 'canonical', href: origin + path }] }
  })
})
