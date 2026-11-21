/**
 * Wächter der Wortliste für Kundentexte (Q16). Liste, Ausnahmen und Gründe:
 * `scripts/lib/customer-words.mjs`. Rot, wenn ein verbanntes Wort in einer
 * Sprachdatei oder einem Kundentext steht, oder wenn ein Manifest mit
 * `tier: 'optional'` keinen Kundentext (`customerDescription`) hat.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRepoTexts, findViolations, missingCustomerTexts, readManifests } from './lib/customer-words.mjs'

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')

const hits = findViolations(collectRepoTexts(root))
const missing = missingCustomerTexts(readManifests(root))

for (const h of hits) {
  console.error(`✗ ${h.file} · ${h.key} — „${h.rule}“: ${h.text.slice(0, 120)}\n    richtig: ${h.good}`)
}
for (const f of missing) {
  console.error(`✗ ${f} — tier 'optional' ohne customerDescription (de und en)`)
}
if (hits.length || missing.length) {
  console.error(`\ncheck:customer-words: ${hits.length} verbannte Wörter, ${missing.length} Manifeste ohne Kundentext.`)
  process.exit(1)
}
console.log('check:customer-words: sauber.')
