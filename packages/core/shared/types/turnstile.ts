/**
 * TYPEN RUND UM CLOUDFLARE TURNSTILE — Server-Antwort und Browser-API.
 *
 * Bewusst selbst deklariert statt eines npm-Pakets: wir brauchen genau eine
 * Antwortform und drei Methoden. Seit Nitros Routen-Typisierung aus ist
 * (CLAUDE.md), nennt jeder `$fetch` seinen Antworttyp ohnehin selbst.
 *
 * KEINE DOM-TYPEN HIER: `shared/` wird auch im SERVER-tsconfig gesehen, und
 * der kennt `HTMLElement` nicht (lib: webworker). Der Container ist deshalb
 * strukturell beschrieben — ein Element erfüllt ihn, ein Selektor auch.
 */

/** Antwort von `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`. */
export interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  action?: string
  hostname?: string
}

export type TurnstileContainer = string | { readonly nodeType: number }

export interface TurnstileRenderOptions {
  sitekey: string
  action?: string
  theme?: 'auto' | 'light' | 'dark'
  language?: string
  appearance?: 'always' | 'execute' | 'interaction-only'
  size?: 'normal' | 'flexible' | 'compact'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

/** Das, was `api.js` als `window.turnstile` bereitstellt (Ausschnitt). */
export interface TurnstileApi {
  render: (container: TurnstileContainer, options: TurnstileRenderOptions) => string | undefined
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}
