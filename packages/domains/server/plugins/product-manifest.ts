import manifest from '../../product.manifest'

/**
 * Registriert das Produkt-Manifest beim Core (Laufzeit-Registry, F2/F7).
 *
 * OHNE DIESE ZEILE IST `apiPrefixes` EIN VERSPRECHEN OHNE WIRKUNG: die
 * Produkt-Middleware (`core/server/middleware/04.product-gate.ts`) läuft über
 * `getProductRegistry()`, und was dort nicht steht, kann sie nicht abschalten.
 * Bis 2026-09-09 fehlte das Plugin (PM1): die Notabschaltung
 * `app_config.products.domains.enabled = false` traf `/api/site/domain/**`
 * nie, und das Produkt fehlte im Betreiber-Katalog von pukalani.studio.
 * `pnpm check:manifests` erzwingt das Plugin seither für jeden Layer mit
 * `apiPrefixes`.
 */
export default defineNitroPlugin(() => {
  registerProductManifest(manifest)
})
