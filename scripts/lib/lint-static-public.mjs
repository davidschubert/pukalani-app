/**
 * Statische `public`-Ordner, die der Lint auslässt (LN1, 2026-11-18).
 *
 * `@nuxt/eslint-config` nimmt JEDEN Ordner namens `public` vom Lint aus —
 * gemeint sind die statischen Dateien einer App. Das Muster trifft aber
 * auch Routen-Ordner wie `server/api/insights/public/`.
 * Zwölf Routen-Dateien liefen deshalb durch keinen Lint.
 *
 * Beide Configs (`eslint.config.mjs`, `eslint.typed.config.mjs`) heben die
 * breite Ausnahme auf und setzen dafür diese Liste: `public` nur an der
 * Wurzel einer App, eines Layers, eines Layer-Playgrounds und der Doku-Site.
 * Ein `public`-Ordner tiefer im Baum ist Code und wird geprüft.
 *
 * Die Muster sind relativ zur Wurzel des Repos (dort liegen beide Configs).
 */
export const STATIC_PUBLIC_DIRS = [
  'apps/*/public',
  'packages/*/public',
  'packages/*/.playground/public',
  'docs/public',
]

/** Hebt die breite Ausnahme auf und nimmt nur die statischen Ordner wieder aus. */
export const staticPublicIgnores = ['!**/public', ...STATIC_PUBLIC_DIRS]
