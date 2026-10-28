#!/usr/bin/env node
/**
 * KI-MODELL-WÄCHTER: steht jeder konfigurierte Modell-Slug bei OpenRouter
 * überhaupt noch unter unseren Datenschutz-Bedingungen zur Verfügung?
 *
 *   node scripts/ops/verify-ai-models.mjs        # alle Slugs
 *   pnpm ops:ai-models
 *
 * WARUM ES DAS GIBT (Vorfall 2026-10-27, zum zweiten Mal): ein Modell-Slug
 * bei OpenRouter ist kein Versprechen, sondern ein ANGEBOT — und Angebote
 * verschwinden. `google/gemini-2.5-flash` stand im September in der
 * ZDR-gefilterten Modell-Liste und hatte sieben Routen; im Oktober waren es
 * drei Routen über „Google AI Studio", und AI Studio ist nicht ZDR-fähig.
 * Weil `BRAND_PROVIDER_ROUTING` auf `zdr: true` + `allowFallbacks: false`
 * pinnt, antwortete JEDER Aufruf **404 „No endpoints found matching your
 * data policy"** — die Inspirationslesung von branding.supply war wochenlang
 * tot, während `brandAiEnabled` auf Prod AN stand. Vorher traf dieselbe
 * Falle `google/gemini-2.5-flash-image-preview`.
 *
 * Das Tückische: die Funktion ist nicht ABGESCHALTET, sie SCHEITERT. Es gibt
 * keinen Typfehler, keinen Lint-Befund, keinen roten Test — der Code ist ja
 * richtig, nur die Gegenseite hat sich geändert. Genau diese Lücke schließt
 * dieses Skript.
 *
 * Es braucht KEINEN Schlüssel: `/models?zdr=true` ist öffentlich. Damit ist
 * es gefahrlos wiederholbar und kostet nichts. Was es NICHT kann: beweisen,
 * dass ein Aufruf gelingt — das kann nur eine echte Anfrage. Es beweist die
 * notwendige Bedingung, und die war beide Male die gerissene.
 *
 * Exit 0 = alles gut · Exit 1 = mindestens ein Slug ist nicht erreichbar.
 */
import { globSync, readFileSync } from 'node:fs'

const MODELS_URL = 'https://openrouter.ai/api/v1/models?zdr=true'
const ENDPOINTS_URL = slug => `https://openrouter.ai/api/v1/models/${slug}/endpoints`

/**
 * WO MODELLE KONFIGURIERT WERDEN. Bewusst die `app.config.ts`-Dateien und
 * nicht der ganze Baum: dort steht die WAHL, überall sonst stehen Beispiele,
 * Kommentare und Testdaten — und ein Wächter, der Kommentare prüft, meldet
 * Unsinn.
 */
const CONFIG_GLOBS = ['packages/*/app/app.config.ts', 'apps/*/app/app.config.ts']

/**
 * Felder, die einen Modell-Slug tragen. Ein NEUES Modell-Feld gehört hier
 * hinein, sonst ist es ungedeckt — dieselbe Regel wie bei der
 * `FIELDS`-Tabelle von `check-i18n-keys.mjs`.
 */
const MODEL_FIELDS = ['model', 'visionModel', 'imageModel', 'videoModel', 'reviewModel', 'ticketsAiModel']

/**
 * WER EINEN ORT VERLANGT. Die Inspirationslesung und (ab K5) das Videolesen
 * gehen über `BRAND_PROVIDER_ROUTING_EU`, also mit
 * `only: ['google-vertex/eu']` — für diese Felder genügt „irgendwo ZDR"
 * nicht, der EU-Endpunkt muss es auch geben. Davids Entscheidung 2026-10-27.
 *
 * MITFÜHREN, wenn sich das Pinning in
 * `packages/brand/server/utils/brandProviderRouting.ts` ändert. Das ist eine
 * Verabredung, kein Beweis — ein Skript kann nicht sehen, welche Konstante
 * ein Aufrufer mitgibt.
 */
const REQUIRED_ENDPOINT = {
  visionModel: 'google-vertex/eu',
  videoModel: 'google-vertex/eu',
}

/** Alle gesetzten Slugs aus den Konfigurationen — leere Werte heißen „aus". */
function collectSlugs() {
  const found = []
  for (const pattern of CONFIG_GLOBS) {
    for (const file of globSync(pattern)) {
      const source = readFileSync(file, 'utf8')
      for (const field of MODEL_FIELDS) {
        // NICHT an den Zeilenanfang gebunden: `ai: { reviewModel: '…' },`
        // steht in packages/brand einzeilig und fiel sonst durch. `[{\s]`
        // davor verhindert, dass `model:` auch `visionModel:` trifft.
        const re = new RegExp(`[{\\s]${field}:\\s*'([^']*)'`, 'g')
        for (const match of source.matchAll(re)) {
          const slug = match[1].trim()
          if (slug) found.push({ file, field, slug })
        }
      }
    }
  }
  return found
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

const slugs = collectSlugs()
if (slugs.length === 0) {
  console.log('Keine Modell-Slugs konfiguriert — nichts zu prüfen.')
  process.exit(0)
}

const zdr = await fetchJson(MODELS_URL)
const zdrIds = new Set((zdr.data ?? []).map(entry => entry.id))
console.log(`OpenRouter meldet ${zdrIds.size} Modelle mit Zero-Data-Retention.\n`)

let broken = 0
// Endpunkt-Listen nur einmal je Slug holen.
const endpointCache = new Map()

for (const { file, field, slug } of slugs) {
  const where = `${file.replace(/^.*\/(?=(packages|apps)\/)/, '')} · ${field}`
  if (!zdrIds.has(slug)) {
    broken += 1
    console.log(`✖ ${slug}`)
    console.log(`   ${where}`)
    console.log('   steht NICHT in der ZDR-Liste — jeder Aufruf unter `zdr: true` antwortet 404.')
    console.log(`   Angebot heute: ${ENDPOINTS_URL(slug)}\n`)
    continue
  }

  const needed = REQUIRED_ENDPOINT[field]
  if (!needed) {
    console.log(`✔ ${slug} (${where})`)
    continue
  }

  if (!endpointCache.has(slug)) {
    endpointCache.set(slug, await fetchJson(ENDPOINTS_URL(slug)).catch(() => null))
  }
  const data = endpointCache.get(slug)
  const tags = (data?.data?.endpoints ?? []).map(endpoint => endpoint.tag)
  if (!tags.includes(needed)) {
    broken += 1
    console.log(`✖ ${slug}`)
    console.log(`   ${where}`)
    console.log(`   ist ZDR-fähig, hat aber keinen \`${needed}\`-Endpunkt — der EU-Pin`)
    console.log('   (`BRAND_PROVIDER_ROUTING_EU`) macht daraus ein 404.')
    console.log(`   vorhanden: ${tags.join(', ') || '—'}\n`)
    continue
  }
  console.log(`✔ ${slug} (${where}) — inkl. ${needed}`)
}

console.log()
if (broken > 0) {
  console.log(`${broken} Modell-Wahl${broken === 1 ? '' : 'en'} nicht erreichbar.`)
  console.log('Ein Ersatz steht in der ZDR-Liste: https://openrouter.ai/api/v1/models?zdr=true')
  process.exit(1)
}
console.log(`Alle ${slugs.length} Modell-Wahlen sind unter unseren Bedingungen erreichbar.`)
