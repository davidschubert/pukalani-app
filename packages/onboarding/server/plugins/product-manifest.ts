import manifest from '../../product.manifest'

/**
 * Registriert das Produkt-Manifest beim Core (Laufzeit-Registry, F2/F7) —
 * wie die anderen Foundation-Layer (core, system, admin, themes).
 *
 * `onboarding` ist `tier: 'foundation'` und damit nie schaltbar; das Plugin
 * ändert kein Verhalten, sondern löst das `apiPrefixes`-Versprechen ein und
 * zeigt das Produkt im Betreiber-Katalog als Grundgerüst. Nachgerüstet
 * 2026-09-09 (PM1, Davids Entscheidung); `pnpm check:manifests` erzwingt das
 * Plugin seither für jeden Layer mit `apiPrefixes`.
 */
export default defineNitroPlugin(() => {
  registerProductManifest(manifest)
})
