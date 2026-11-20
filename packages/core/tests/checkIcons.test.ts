import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkFallbackSwitch,
  checkIconNames,
  checkTree,
  checkUiIconOverrides,
  findIconNames,
  iconKeysOf,
} from '../../../scripts/check-icons.mjs'

/**
 * DER WÄCHTER `pnpm check:icons` (FE-002). Er prüft jeden fest geschriebenen
 * Symbol-Namen gegen die installierten Symbol-Pakete, die Standard-Symbole
 * von Nuxt UI gegen die Überschreibungen des Core und den Schalter, der den
 * Abruf fehlender Symbole bei einem fremden Dienst abstellt. Ein Wächter, der
 * nie rot wird, ist keiner — deshalb je Regel eine Gegenprobe.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const collections = {
  'ph': new Set(['heart', 'smiley', 'arrow-up-right']),
  'circle-flags': new Set(['de']),
  'lucide': new Set(['mail']),
}
const installed = {
  'packages/core': new Set(['ph', 'circle-flags']),
  'apps/help': new Set(['ph', 'lucide']),
  'packages/posts': new Set<string>(),
}

function violationsOf(source: string, path = 'packages/posts/app/pages/probe.vue'): string[] {
  return checkIconNames([{ path, source }], { collections, installed }).violations
}

describe('der echte Baum', () => {
  it('kein Befund, und es wird wirklich etwas geprüft', () => {
    const report = checkTree(repoRoot)
    expect(report.violations).toEqual([])
    expect(report.count).toBeGreaterThan(2000)
    expect(report.collections).toContain('ph')
    expect(report.defaultKeys).toBeGreaterThan(30)
  })
})

describe('Regel 1: der Name existiert im Paket', () => {
  it('ein vorhandener Name ist in Ordnung', () => {
    expect(violationsOf('<UButton icon="i-ph-heart" />')).toEqual([])
  })

  it('GEGENPROBE: ein Name, den es nicht gibt, ist rot — mit Datei und Zeile', () => {
    const violations = violationsOf('<div />\n<UButton icon="i-ph-smiley-plus" />')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('packages/posts/app/pages/probe.vue:2')
    expect(violations[0]).toContain('i-ph-smiley-plus')
  })

  it('ein Paket-Name mit Bindestrich wird als Paket gelesen', () => {
    expect(findIconNames(`'i-circle-flags-de'`, Object.keys(collections))).toEqual([
      { prefix: 'circle-flags', name: 'de', line: 1 },
    ])
  })

  it('zusammengesetzte Namen werden übersprungen, nicht geraten', () => {
    expect(findIconNames('`i-circle-flags-${code}`', Object.keys(collections))).toEqual([])
    expect(findIconNames(`'i-ph-' + name`, Object.keys(collections))).toEqual([])
  })

  it('ein Wort, das nur so endet, ist kein Symbol', () => {
    expect(findIconNames('class="multi-ph-heart"', Object.keys(collections))).toEqual([])
  })
})

describe('Regel 2: das Paket ist dort eingetragen, wo der Name steht', () => {
  it('ein Layer ohne eigenes Paket nimmt das des Core', () => {
    expect(violationsOf('icon: "i-ph-heart"')).toEqual([])
  })

  it('die App mit eigenem Paket darf es nutzen', () => {
    expect(violationsOf('icon: "i-lucide-mail"', 'apps/help/app/app.vue')).toEqual([])
  })

  it('GEGENPROBE: ein Paket, das nur eine andere App hat, ist rot', () => {
    const violations = violationsOf('icon: "i-lucide-mail"')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('weder in packages/posts noch im Core')
  })
})

describe('Regel 3: jedes Standard-Symbol von Nuxt UI ist überschrieben', () => {
  it('liest die Schlüssel aus beiden Schreibweisen', () => {
    expect(iconKeysOf(`const defaultIcons = {\n  close: "i-lucide-x",\n  star: "i-lucide-star"\n};`)).toEqual(['close', 'star'])
    expect(iconKeysOf(`ui: {\n  icons: {\n    close: 'i-ph-x',\n  }\n}`)).toEqual(['close'])
  })

  it('GEGENPROBE: ein fehlender Schlüssel ist rot', () => {
    expect(checkUiIconOverrides(['close', 'star'], ['close'])).toHaveLength(1)
    expect(checkUiIconOverrides(['close', 'star'], ['close', 'star'])).toEqual([])
  })
})

describe('Regel 4: kein Abruf fehlender Symbole bei einem fremden Dienst', () => {
  const on = `export default defineNuxtConfig({\n  icon: {\n    fallbackToApi: false,\n  },\n})`

  it('der Schalter steht', () => {
    expect(checkFallbackSwitch(on)).toEqual([])
  })

  it('GEGENPROBE: ohne Block, mit `true` oder nur im Kommentar ist es rot', () => {
    expect(checkFallbackSwitch('export default defineNuxtConfig({\n  modules: [],\n})')).toHaveLength(1)
    expect(checkFallbackSwitch(on.replace('false', 'true'))).toHaveLength(1)
    expect(checkFallbackSwitch('export default defineNuxtConfig({\n  // icon: { fallbackToApi: false }\n  icon: {\n  },\n})')).toHaveLength(1)
  })
})
