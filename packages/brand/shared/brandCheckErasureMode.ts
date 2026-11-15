/**
 * DIE DREI STELLUNGEN DES LÖSCH-LAUFS DER PRÜFERGEBNISSE
 * (`pukalani.brand.checkErasure`, SEC-015/SEC-026).
 *
 * Nur die FORM liegt hier in `shared/`, weil `app/app.config.ts` sie als
 * Annotation braucht — ohne sie leitete TypeScript aus dem Layer-Default den
 * engen Typ `'off'` ab, und eine App, die `'dry-run'` setzt, bekäme einen
 * Typfehler. Die Auflösung eines Werts und der Lauf selbst stehen in
 * `server/utils/brandCheckErasureRun.ts`.
 */
export const BRAND_CHECK_ERASURE_MODES = ['off', 'dry-run', 'apply'] as const

export type BrandCheckErasureMode = (typeof BRAND_CHECK_ERASURE_MODES)[number]
