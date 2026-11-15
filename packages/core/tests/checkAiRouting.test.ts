import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ROUTING_CONSTANTS,
  checkAiRouting,
  checkDirectEndpoint,
  checkRoutingConstants,
  checkRoutingKeys,
  readSources,
} from '../../../scripts/check-ai-routing.mjs'
import { AI_TEXT_PROVIDER_ROUTING } from '../shared/aiProviderRouting'

/**
 * DER WÄCHTER `pnpm check:ai-routing` (P17, SEC-005). Er listet jede
 * KI-Aufrufstelle mit ihrer Bindung und wird rot, wenn eine Stelle eine
 * Bindung ohne Namen mitgibt, einen unbekannten Namen nennt, Bild/Vision/Video
 * ohne Ort ruft, ein Ort ausserhalb der EU ohne eingetragene Ausnahme steht
 * oder jemand `chat/completions` am Transport vorbei ruft. Ein Wächter, der
 * nie rot wird, ist keiner — deshalb hier je Regel eine Gegenprobe.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ok = { path: 'packages/x/server/api/ok.ts', source: 'await aiCompleteJson(event, p, { label: "x" })' }

function violationsOf(source: string, path = 'packages/x/server/api/probe.ts'): string[] {
  return checkAiRouting([{ path, source }], { minimum: { text: 0, vision: 0, video: 0, image: 0 } }).violations
}

describe('der echte Baum', () => {
  const sources = readSources(repoRoot)

  it('jede Aufrufstelle ist gebunden, keine Mindestzahl unterschritten', () => {
    const report = checkAiRouting(sources.server)
    expect(report.violations).toEqual([])
    expect(report.counts.text).toBeGreaterThanOrEqual(15)
    expect(report.counts.vision).toBeGreaterThanOrEqual(1)
    expect(report.counts.video).toBeGreaterThanOrEqual(1)
    expect(report.counts.image).toBeGreaterThanOrEqual(1)
  })

  it('niemand ruft `chat/completions` am Transport vorbei', () => {
    expect(checkDirectEndpoint(sources.all)).toEqual([])
  })

  it('die Tabelle selbst ist in Ordnung', () => {
    expect(checkRoutingConstants(ROUTING_CONSTANTS)).toEqual([])
  })

  it('kein `providerRouting`-Schlüssel im Server-Code trägt ein loses Objekt', () => {
    expect(checkRoutingKeys(sources.server)).toEqual([])
  })
})

describe('Bindung an den Code', () => {
  it('AI_TEXT_PROVIDER_ROUTING der Tabelle = die Core-Konstante', () => {
    expect(ROUTING_CONSTANTS.AI_TEXT_PROVIDER_ROUTING.only).toEqual([...AI_TEXT_PROVIDER_ROUTING.only])
  })
})

describe('Gegenproben', () => {
  it('Text ohne Angabe ist erlaubt (Voreinstellung EU)', () => {
    expect(violationsOf(ok.source)).toEqual([])
  })

  it('benannte Konstante, auch als Spread, ist erlaubt', () => {
    expect(violationsOf('await aiCompleteJson(event, p, { providerRouting: BRAND_PROVIDER_ROUTING })')).toEqual([])
    expect(violationsOf('await aiVisionJson(event, i, p, { providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_EU } })')).toEqual([])
  })

  it('ROT: loses Objekt-Literal', () => {
    expect(violationsOf('await aiCompleteJson(event, p, { providerRouting: { zdr: true, only: ["x/eu"] } })')).toHaveLength(1)
  })

  it('ROT: unbekannte Konstante', () => {
    expect(violationsOf('await aiCompleteJson(event, p, { providerRouting: { ...MEIN_ROUTING } })')).toHaveLength(1)
  })

  it('ROT: Vision, Video und Bild ohne Angabe', () => {
    expect(violationsOf('await aiVisionJson(event, images, p, { model })')).toHaveLength(1)
    expect(violationsOf('await aiVideoJsonDetailed(event, videos, p, { model })')).toHaveLength(1)
    expect(violationsOf('await aiImage(event, p, { model })')).toHaveLength(1)
  })

  it('ROT: Durchreichen ohne eingetragene Quelle', () => {
    expect(violationsOf('await aiCompleteJsonDetailed(event, p, { providerRouting: run.providerRouting })')).toHaveLength(1)
  })

  it('ein Kommentar täuscht den Scan nicht', () => {
    expect(violationsOf('// await aiImage(event, p, { model })\nconst x = 1')).toEqual([])
    expect(violationsOf('await aiImage(event, p, {\n  // providerRouting: BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL\n  model,\n})')).toHaveLength(1)
  })

  it('ROT: Nicht-EU-Ort ohne Ausnahme, mit Ausnahme erlaubt', () => {
    expect(checkRoutingConstants({ US_ROUTING: { only: ['google-vertex/us'] } })).toHaveLength(1)
    expect(checkRoutingConstants({ LEER: { only: [] } })).toHaveLength(1)
    expect(checkRoutingConstants({
      GLOBAL: { only: ['google-vertex/global'], exception: { reason: 'kein EU-Endpunkt', decided: '2026-11-13, David' } },
    })).toEqual([])
  })

  it('ROT: `chat/completions` in einer fremden Datei', () => {
    const direct = [{ path: 'packages/x/server/utils/eigenerWeg.ts', source: 'await fetch(`${base}/chat/completions`, {})' }]
    expect(checkDirectEndpoint(direct)).toHaveLength(1)
    const transport = [{ path: 'packages/core/server/utils/aiComplete.ts', source: 'await fetch(`${base}/chat/completions`, {})' }]
    expect(checkDirectEndpoint(transport)).toEqual([])
  })

  it('ROT: Bindung in einer Variablen gebaut, dann als Ganzes übergeben', () => {
    // Die Aufruf-Prüfung sähe hier „Voreinstellung" — der Schlüssel-Scan nicht.
    const source = [
      'const options = { label: "x", providerRouting: { only: ["openai/us"] } }',
      'await aiCompleteJson(event, p, options)',
    ].join('\n')
    const files = [{ path: 'packages/x/server/api/probe.ts', source }]
    expect(violationsOf(source)).toEqual([])
    expect(checkRoutingKeys(files).join('\n')).toMatch(/loses Objekt/)
  })

  it('Schlüssel-Scan: Konstante, Typ-Angaben und eingetragenes Durchreichen sind erlaubt', () => {
    const allowed = [
      'interface Run { providerRouting: { zdr: boolean, only: readonly string[] } }',
      'interface Options { providerRouting?: AiProviderRouting }',
      'const a = { providerRouting: { ...BRAND_PROVIDER_ROUTING } }',
      'const b = { providerRouting: AI_TEXT_PROVIDER_ROUTING }',
    ].join('\n')
    expect(checkRoutingKeys([{ path: 'packages/x/server/utils/a.ts', source: allowed }])).toEqual([])
    const passed = 'await aiCompleteJson(event, p, { providerRouting: run.providerRouting })'
    expect(checkRoutingKeys([{ path: 'packages/x/server/api/b.ts', source: passed }])).toHaveLength(1)
    expect(checkRoutingKeys(
      [{ path: 'packages/x/server/api/b.ts', source: passed }],
      { delegates: { 'packages/x/server/api/b.ts': { source: 'packages/x/server/utils/a.ts', constant: 'BRAND_PROVIDER_ROUTING' } } },
    )).toEqual([])
    expect(checkRoutingKeys([{ path: 'packages/x/server/api/c.ts', source: 'const o = { providerRouting: { ...EIGENE_LISTE } }' }]).join('\n'))
      .toMatch(/unbekannte Konstante/)
  })

  it('ein eingetragenes Prüfskript muss die volle Bindung wörtlich senden', () => {
    const path = 'packages/x/scripts/verify.mjs'
    const directScripts = { [path]: 'Prüfskript' }
    const bound = 'fetch(`${b}/chat/completions`, { body: { provider: { zdr: true, data_collection: \'deny\', only: [\'amazon-bedrock/eu-west-1\', \'google-vertex/europe\'], allow_fallbacks: false } } })'
    expect(checkDirectEndpoint([{ path, source: bound }], { directScripts })).toEqual([])
    const unbound = 'fetch(`${b}/chat/completions`, { body: { provider: { zdr: true, data_collection: \'deny\', allow_fallbacks: false } } })'
    expect(checkDirectEndpoint([{ path, source: unbound }], { directScripts }).join('\n')).toMatch(/volle Bindung/)
    expect(checkDirectEndpoint([{ path, source: bound }]).join('\n')).toMatch(/am Transport vorbei/)
  })

  it('ROT: ein leerer Scan ist nicht grün', () => {
    expect(checkAiRouting([ok]).violations.join('\n')).toMatch(/Mindestzahl|mindestens/)
  })
})
