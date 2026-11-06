/**
 * Structured Data als `<script type="application/ld+json">` — dieselbe
 * Fassung wie `apps/portfolio/app/utils/jsonLd.ts` (bewusst je App, nicht im
 * Core: zwei Zeilen Helfer sind billiger als ein Core-Vertrag für zwei Apps).
 *
 * Das `<` wird zu `<` escapet: ohne das könnte ein Datenwert die Zeichen
 * `</script>` enthalten und den Script-Block vorzeitig schliessen. JSON-LD
 * erlaubt die Escape-Sequenz, jeder Parser liest sie wieder als `<`.
 *
 * Der `type` bleibt ein LITERAL (`as const`): unhead 3 diskriminiert die
 * Script-Union über genau dieses Feld.
 */
export function jsonLdScript(graph: unknown) {
  return {
    type: 'application/ld+json' as const,
    innerHTML: JSON.stringify(graph).replace(/</g, '\\u003c'),
  }
}
