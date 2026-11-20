import { resolveEmbedOrigins } from '../../shared/embedOrigins'
import { listEmbedSites } from '../utils/embedSites'
import { embedStaticOrigins } from '../utils/embedStaticOrigins'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * Registriert /embed bei der core Frame-Ancestors-Registry (expliziter
 * Vertrag, Embed-Plan E0-3): Ist das Gate pukalani.comments.embed aktiv, dürfen
 * die statisch konfigurierten Origins PLUS die aktiven Sites der Registry
 * (embed_sites, E3) die Seite framen — alle anderen Routen behalten den
 * 'self'-Default (Clickjacking-Schutz). '*' in allowedOrigins bleibt die
 * bewusste „offen wie Disqus"-Betreiber-Option (Plan § 6.7).
 * Lokale Einbetter (localhost/127.0.0.1) kommen NUR im Dev-Server oder mit
 * `NUXT_COMMENTS_EMBED_LOCAL_ORIGINS=true` dazu (BE-023, embedStaticOrigins.ts).
 */
export default defineNitroPlugin(() => {
  registerEmbeddableRoute({
    prefix: '/embed',
    origins: async (event) => {
      const appConfig = useAppConfig(event) as {
        pukalani?: { comments?: { embed?: { enabled?: boolean, allowedOrigins?: string[] } } }
      }
      const embed = appConfig.pukalani?.comments?.embed
      if (!embed?.enabled) return []
      const staticOrigins = embedStaticOrigins(event, embed.allowedOrigins)
      if (staticOrigins.includes('*')) return ['*']
      // Registry-Lese-Fehler → nur statische Liste (fail-safe: nie 500 im
      // Header-Pfad, aber auch nie stillschweigend '*')
      const sites = await listEmbedSites(event).catch(softFail('comments:plugins/embed-frame:listEmbedSites', []))
      return resolveEmbedOrigins(staticOrigins, sites)
    },
  })
})
