import { accountPageRedirect } from '../../../../packages/marketing/shared/accountPages'

/**
 * Konto-Seiten des Core-Layers ⇒ 301 in den Kundenbereich (SEO-002) — diese
 * Site hat keine Konten. Regel, Ziel-Quelle und Begründung bei
 * `accountPageRedirect()` (packages/marketing/shared/accountPages.ts).
 * Nur GET/HEAD: ein Formular-Absenden gibt es hier nicht, und ein 301 auf
 * einen POST wäre ein stiller Methodenwechsel.
 */
export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const { marketingSignInUrl, marketingStartUrl } = useRuntimeConfig(event).public
  const target = accountPageRedirect(event.path.split('?')[0] ?? '/', {
    signInUrl: String(marketingSignInUrl ?? ''),
    startUrl: String(marketingStartUrl ?? ''),
  })
  if (target) return sendRedirect(event, target, 301)
})
