import type { H3Event } from 'h3'
import { appwriteEndpointConfigured } from '../../shared/appwriteConfigured'

/**
 * Hat die App dieses Requests eine Appwrite-Instanz? Regel und Anlass:
 * shared/appwriteConfigured.ts. Für optionale Leser, die auf einer App ohne
 * Appwrite (help) still „nichts" antworten sollen, statt einen Admin-Client
 * zu bauen, der am leeren Endpunkt scheitert.
 */
export function appwriteConfigured(event?: H3Event): boolean {
  return appwriteEndpointConfigured(useRuntimeConfig(event).public.appwriteEndpoint)
}
