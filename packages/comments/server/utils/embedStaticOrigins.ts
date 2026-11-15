import type { H3Event } from 'h3'
import { embedLocalDevOriginsFor } from '../../shared/embedOrigins'

/**
 * Lokale Einbetter dieses Prozesses (BE-023): im Dev-Server (`import.meta.dev`
 * ersetzt Nitro beim Bündeln durch `nitro.options.dev` — `nuxi dev` ⇒ true,
 * `nuxi build` ⇒ false) oder mit `NUXT_COMMENTS_EMBED_LOCAL_ORIGINS=true`.
 * Die Variable ist für einen lokal gebauten Stand gedacht und wird auf keinem
 * Server gesetzt.
 */
export function embedLocalDevOrigins(event: H3Event): string[] {
  const config = useRuntimeConfig(event) as { commentsEmbedLocalOrigins?: unknown }
  return embedLocalDevOriginsFor(Boolean(import.meta.dev), config.commentsEmbedLocalOrigins)
}

/**
 * Statische Einbetter-Origins = App-Konfiguration + lokale Einbetter. Die
 * EINE Stelle für beide Leser (CSP-Plugin und /embed-Hostprüfung), damit
 * Header und freundliche Meldung nie verschiedener Meinung sind.
 */
export function embedStaticOrigins(event: H3Event, configured: string[] | undefined): string[] {
  return [...new Set([...(configured ?? []), ...embedLocalDevOrigins(event)])]
}
