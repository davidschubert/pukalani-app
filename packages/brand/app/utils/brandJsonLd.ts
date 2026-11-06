/**
 * Structured Data als `<script type="application/ld+json">` — für Seiten, die
 * im LAYER liegen.
 *
 * ── WARUM NICHT DER HELFER DER APP ────────────────────────────────────────
 * `apps/branding/app/utils/jsonLd.ts` (und die gleichlautende Fassung in
 * apps/portfolio) gehört den App-Seiten /about, /team und /. Eine Layer-Seite
 * darf ihn nicht importieren: der brand-Layer läuft auch in Apps, die diese
 * Datei nicht haben — der Import wäre eine Abhängigkeit vom Wirt (A14). Zwei
 * Zeilen Helfer sind billiger als ein geteilter Vertrag; genau diese
 * Begründung steht schon im Kopf der App-Fassung.
 *
 * Das `<` wird zu `<` escapet: ohne das könnte ein Datenwert die Zeichen
 * `</script>` enthalten und den Script-Block vorzeitig schliessen. JSON-LD
 * erlaubt die Escape-Sequenz, jeder Parser liest sie wieder als `<`.
 *
 * Der `type` bleibt ein LITERAL (`as const`): unhead 3 diskriminiert die
 * Script-Union über genau dieses Feld.
 */
export function brandJsonLdScript(graph: unknown) {
  return {
    type: 'application/ld+json' as const,
    innerHTML: JSON.stringify(graph).replace(/</g, '\\u003c'),
  }
}
