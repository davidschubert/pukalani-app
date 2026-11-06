import manifest from '../../product.manifest'

/**
 * Registriert das Produkt-Manifest beim Core (Laufzeit-Registry, F2/F7).
 *
 * FEHLTE SEIT M1 (2026-09-05) — gefunden bei der Prüfung von BI1 I1 am
 * 2026-09-09, als der insights-Layer dasselbe Plugin bekam: `market` war der
 * einzige Produkt-Layer mit `apiPrefixes`, der sich NIE registriert hat.
 * Zwei Zusagen liefen damit still leer: (1) die Notabschaltung
 * `app_config.products.market.enabled = false` traf `/api/market/**` nicht —
 * die Produkt-Middleware (`core/server/middleware/04.product-gate.ts`) kennt
 * nur REGISTRIERTE Manifeste; (2) der Rohtext-Sweep (`raw-text-sweep.ts`)
 * fragt `getProductRegistry().has('market')` und stieg deshalb bei jedem
 * Lauf aus — der gefilterte Text fremder Websites blieb über die zugesagte
 * 24-Stunden-Frist hinaus liegen. Kein Wächter sah es: `check:manifests`
 * prüft die Datei `product.manifest.ts`, nicht ihre Registrierung.
 */
export default defineNitroPlugin(() => {
  registerProductManifest(manifest)
})
