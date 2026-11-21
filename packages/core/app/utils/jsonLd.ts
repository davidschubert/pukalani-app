/**
 * Structured Data als `<script type="application/ld+json">` — die EINE Hilfe
 * für Apps und Layer (Q26; vorher je eine Kopie in branding, portfolio und
 * brand).
 *
 * Das `<` wird zu `<` escapet: ohne das könnte ein Datenwert die Zeichen
 * `</script>` enthalten und den Script-Block vorzeitig schließen — aus einem
 * Textfeld würde ausführbares Markup. JSON-LD erlaubt die Escape-Sequenz, jeder
 * Parser liest sie wieder als `<`.
 *
 * Der Rückgabewert geht direkt in `useHead({ script: [...] })`. Der `type`
 * bleibt ein LITERAL (`as const`): unhead 3 diskriminiert die Script-Union
 * über genau dieses Feld — als weiter `string` typisiert landet der Eintrag im
 * falschen Zweig und der Aufruf wird zum Typfehler.
 */
export function jsonLdScript(graph: unknown) {
  return {
    type: 'application/ld+json' as const,
    innerHTML: JSON.stringify(graph).replace(/</g, '\\u003c'),
  }
}
