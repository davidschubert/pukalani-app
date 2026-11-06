import manifest from '../../product.manifest'

/**
 * Registriert das Produkt-Manifest beim Core (Laufzeit-Registry, F2/F7).
 *
 * OHNE DIESE ZEILE IST `apiPrefixes` EIN VERSPRECHEN OHNE WIRKUNG: die
 * Produkt-Middleware (`core/server/middleware/04.product-gate.ts`) läuft über
 * `getProductRegistry()`, und was dort nicht steht, kann sie nicht abschalten.
 * Die Notabschaltung `app_config.products.insights.enabled = false` (§9.1
 * Nr. 3) hängt genau daran — und ebenso das Gate des Fristen-Sweeps
 * (`corrections-sweep.ts`), das fragt, ob der Layer in DIESE App
 * einkompiliert ist.
 */
export default defineNitroPlugin(() => {
  registerProductManifest(manifest)
})
