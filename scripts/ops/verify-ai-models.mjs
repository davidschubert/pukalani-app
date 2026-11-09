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
const MODEL_FIELDS = [
  'model',
  'visionModel',
  'imageModel',
  'videoModel',
  'reviewModel',
  'ticketsAiModel',
  // Seit AI1 mitgeprüft: beide waren LEER und damit unsichtbar, aber sie sind
  // echte Konfigurationsfelder (`pukalani.market.ai`) und gehen über
  // `BRAND_PROVIDER_ROUTING` — ein dort eingetragener Slug ohne EU-Endpunkt
  // wäre ein 404 ohne Wächter.
  'extractModel',
  'reportModel',
]

/**
 * FELDER, DIE EINE LISTE TRAGEN. `outsideViewModels` ist das einzige heute:
 * die KI-Aussensicht des Marktvergleichs verlangt zwei Modelle VERSCHIEDENER
 * Anbieter, und der Kopf von `packages/market/app/app.config.ts` lädt dazu
 * ein. Ein Wächter, der nur `feld: '…'` kennt, hätte genau diese Einladung
 * nicht gesehen.
 */
const MODEL_LIST_FIELDS = ['outsideViewModels']

/**
 * WER EINEN ORT VERLANGT — und WELCHE Orte reichen.
 *
 * Der Wert ist eine LISTE, weil `provider.only` eine Allowlist ist: der
 * Aufruf gelingt, sobald das Modell MINDESTENS EINEN dieser Endpunkte hat.
 * Eine Liste mit einem Eintrag ist deshalb die strengste Form, nicht die
 * schwächste — sie lässt genau eine Route zu.
 *
 * - `visionModel` / `videoModel` reichen Kundenmaterial hin und gehen über
 *   `BRAND_PROVIDER_ROUTING_VERTEX_EU` (`only: ['google-vertex/eu']`) —
 *   Davids Entscheidung 2026-10-27.
 * - Die TEXT-Felder gehen seit AI1 (Davids Entscheidung 2026-11-09) über die
 *   Basis `BRAND_PROVIDER_ROUTING` mit BEIDEN EU-Endpunkten des Textmodells.
 *   Für sie genügt „irgendwo ZDR" nicht mehr: ohne einen dieser zwei
 *   Endpunkte antwortet jeder Aufruf 404.
 *
 * NICHT HIER DRIN steht `ticketsAiModel` — die Ticket-Triage und der
 * Moderations-Assist geben GAR KEIN `providerRouting` mit (nachgeprüft
 * 2026-11-09), für sie ist also auch kein Ort verlangt. Ein Feld hier
 * einzutragen, dessen Aufrufer die Konstante nicht benutzt, würde einen
 * Zwang erfinden, den der Code nicht kennt.
 *
 * MITFÜHREN, wenn sich das Pinning in
 * `packages/brand/server/utils/brandProviderRouting.ts` ändert. Das ist eine
 * Verabredung, kein Beweis — ein Skript kann nicht sehen, welche Konstante
 * ein Aufrufer mitgibt.
 */
const TEXT_EU_ENDPOINTS = ['amazon-bedrock/eu-west-1', 'google-vertex/europe']

const REQUIRED_ENDPOINT = {
  visionModel: ['google-vertex/eu'],
  videoModel: ['google-vertex/eu'],
  model: TEXT_EU_ENDPOINTS,
  reviewModel: TEXT_EU_ENDPOINTS,
  extractModel: TEXT_EU_ENDPOINTS,
  reportModel: TEXT_EU_ENDPOINTS,
  outsideViewModels: TEXT_EU_ENDPOINTS,
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
      for (const field of MODEL_LIST_FIELDS) {
        // `outsideViewModels: ['a/b', 'c/d']` — die KLAMMER wird gelesen, die
        // Slugs darin einzeln. `[^\]]*` bleibt in der Klammer, damit ein
        // leeres `[] as string[]` nichts liefert (so steht es heute: leer
        // heisst „aus", und das ist kein Befund).
        const re = new RegExp(`[{\\s]${field}:\\s*\\[([^\\]]*)\\]`, 'g')
        for (const match of source.matchAll(re)) {
          for (const raw of match[1].split(',')) {
            const slug = raw.trim().replace(/^['"`]|['"`]$/g, '').trim()
            if (slug) found.push({ file, field, slug })
          }
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
  // EINER genügt: `provider.only` ist eine Allowlist, OpenRouter wählt
  // darin. Fehlen ALLE, ist der Aufruf ein 404.
  const usable = needed.filter(tag => tags.includes(tag))
  if (usable.length === 0) {
    broken += 1
    console.log(`✖ ${slug}`)
    console.log(`   ${where}`)
    console.log('   ist ZDR-fähig, hat aber keinen der verlangten Endpunkte — der Pin')
    console.log(`   macht daraus ein 404. verlangt (einer genügt): ${needed.join(', ')}`)
    console.log(`   vorhanden: ${tags.join(', ') || '—'}\n`)
    continue
  }
  console.log(`✔ ${slug} (${where}) — inkl. ${usable.join(', ')}`)
}

console.log()
if (broken > 0) {
  console.log(`${broken} Modell-Wahl${broken === 1 ? '' : 'en'} nicht erreichbar.`)
  console.log('Ein Ersatz steht in der ZDR-Liste: https://openrouter.ai/api/v1/models?zdr=true')
  process.exit(1)
}
console.log(`Alle ${slugs.length} Modell-Wahlen sind unter unseren Bedingungen erreichbar.`)
