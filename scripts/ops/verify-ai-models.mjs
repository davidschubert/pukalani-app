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
 * Exit 0 = alles gut · Exit 1 = mindestens ein Slug ist nicht erreichbar ·
 * Exit 2 = OpenRouter selbst war nicht erreichbar. Der dritte Fall sagt
 * nichts über die Modelle: bis 2026-11-13 wurde ein gescheiterter
 * Endpunkt-Abruf still als „hat keinen der verlangten Endpunkte" gewertet,
 * und eine Netz-Störung sah aus wie ein totes Modell.
 */
import { globSync, readFileSync } from 'node:fs'
import {
  MODEL_FIELDS,
  MODEL_LIST_FIELDS,
  REQUIRED_ENDPOINT,
  isEuEndpoint,
  isLocationlessEndpoint,
} from './ai-model-endpoints.mjs'

const MODELS_URL = 'https://openrouter.ai/api/v1/models?zdr=true'
const ENDPOINTS_URL = slug => `https://openrouter.ai/api/v1/models/${slug}/endpoints`

/**
 * WO MODELLE KONFIGURIERT WERDEN. Bewusst die `app.config.ts`-Dateien und
 * nicht der ganze Baum: dort steht die WAHL, überall sonst stehen Beispiele,
 * Kommentare und Testdaten — und ein Wächter, der Kommentare prüft, meldet
 * Unsinn.
 */
const CONFIG_GLOBS = ['packages/*/app/app.config.ts', 'apps/*/app/app.config.ts']

// Die Tabellen (Modell-Felder, verlangte Endpunkte) stehen seit 2026-11-13 in
// einem eigenen Daten-Modul — ein Test bindet sie dort an die Routing-
// Konstanten des Codes (Finding BE-004: `imageModel` fehlte hier, und der
// Wächter blieb grün, während jeder Bild-Aufruf 404 antwortete).
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

/** Drei Versuche, kurzer Abstand — eine einzelne Netz-Störung ist kein Befund. */
const FETCH_ATTEMPTS = 3
const FETCH_PAUSE_MS = 1500

async function fetchJson(url) {
  let lastError
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
      return await res.json()
    }
    catch (error) {
      lastError = error
      if (attempt < FETCH_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, FETCH_PAUSE_MS))
    }
  }
  throw lastError
}

/**
 * DER EIGENE AUSGANG FÜR „OPENROUTER NICHT ERREICHBAR" — Exit 2, nicht 1.
 * Die Meldung sagt, dass über die Modelle NICHTS bekannt ist: ein Mensch soll
 * hier nicht nach einem Ersatzmodell suchen, sondern den Lauf wiederholen.
 * Der eigene Code trennt das auch für Maschinen: `production-watch.yml` wertet
 * Exit 2 als Warnung (Lauf bleibt grün) und nur Exit 1 als Befund — sonst
 * öffnete jede Netz-Störung bei OpenRouter ein Produktions-Alarm-Issue.
 */
function unreachable(url, error) {
  console.log()
  console.log('✖ OpenRouter nicht erreichbar, keine Aussage über die Modelle.')
  console.log(`   ${url}`)
  console.log(`   ${error instanceof Error ? error.message : String(error)} (nach ${FETCH_ATTEMPTS} Versuchen)`)
  console.log('   Lauf später wiederholen — das ist KEIN Befund über eine Modell-Wahl.')
  process.exit(2)
}

const slugs = collectSlugs()
if (slugs.length === 0) {
  console.log('Keine Modell-Slugs konfiguriert — nichts zu prüfen.')
  process.exit(0)
}

const zdr = await fetchJson(MODELS_URL).catch(error => unreachable(MODELS_URL, error))
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
    endpointCache.set(
      slug,
      await fetchJson(ENDPOINTS_URL(slug)).catch(error => unreachable(ENDPOINTS_URL(slug), error)),
    )
  }
  const data = endpointCache.get(slug)
  const tags = (data?.data?.endpoints ?? []).map(endpoint => endpoint.tag)
  // NUR EINE INFO, kein Befund: verlangt das Feld ausschließlich ortlose
  // Endpunkte (heute `imageModel` → `google-vertex/global`) und hat das Modell
  // inzwischen einen EU-Endpunkt, ist eine bewusste Entscheidung fällig —
  // umpinnen UND die Hinweistexte (Werkstatt, Datenschutztext) anpassen.
  const euTags = needed.every(isLocationlessEndpoint) ? tags.filter(isEuEndpoint) : []
  const euInfo = euTags.length > 0
    ? `   ℹ EU-Endpunkt vorhanden: ${euTags.join(', ')} — Pin und Hinweistexte prüfen\n`
    : ''
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
    if (euInfo) console.log(euInfo)
    continue
  }
  console.log(`✔ ${slug} (${where}) — inkl. ${usable.join(', ')}`)
  if (euInfo) console.log(euInfo)
}

console.log()
if (broken > 0) {
  console.log(`${broken} Modell-Wahl${broken === 1 ? '' : 'en'} nicht erreichbar.`)
  console.log('Ein Ersatz steht in der ZDR-Liste: https://openrouter.ai/api/v1/models?zdr=true')
  process.exit(1)
}
console.log(`Alle ${slugs.length} Modell-Wahlen sind unter unseren Bedingungen erreichbar.`)
