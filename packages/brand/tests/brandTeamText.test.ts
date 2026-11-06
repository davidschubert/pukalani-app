import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { teamTextKeyFor } from '../shared/brandTeamText'

/**
 * DIE SOLO-WEICHE AUSSERHALB DER KATALOG-FRAGEN (BW1-Inhaltsrunde 2026-09-09).
 *
 * Die Fragen selbst prüft `i18nCatalog.test.ts` seit `1ba268db`. Hier steht
 * das Gegenstück für alles, was zu KEINEM Slot gehört: Georges
 * Kapitel-Einstiege und die Phasen-Intros der Berater — und der Wächter, der
 * dafür sorgt, dass die Oberfläche des Wizards anredefrei BLEIBT.
 *
 * ── WARUM EIN WÄCHTER UND NICHT NUR EINE RUNDE ────────────────────────────
 * Die Runde hat 162 Texte umgeschrieben. Ohne Wächter ist der nächste neue
 * Hinweis wieder „Tragt eure Farbe ein" — niemand schlägt vor jedem Satz die
 * Entscheidung nach, und Typecheck, Lint und die übrigen Tests sehen eine
 * falsche Anrede nicht. Genau so ist `market` monatelang ohne Plugin gefahren
 * (PM1) und genau so stand `legal.imprint` vier Tage im Fuss von
 * comments.pukalani.app.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const de = JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')) as Record<string, unknown>
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8')) as Record<string, unknown>

function flatten(node: unknown, prefix: string, into: Map<string, string>): Map<string, string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') into.set(path, value)
    else flatten(value, path, into)
  }
  return into
}

const deValues = flatten(de, '', new Map())
const enValues = flatten(en, '', new Map())

/**
 * DIE BEREICHE DER WIZARD-OBERFLÄCHE — sie sprechen niemanden mit „ihr" an.
 *
 * Der Wizard spricht „du" (Davids Copy-Regel 2026-09-04), die Marketing-Seiten
 * sprechen „ihr". Diese Liste ist deshalb bewusst eine AUFZÄHLUNG und kein
 * „alles ausser Marketing": ein neuer Bereich soll die Entscheidung einmal
 * bewusst treffen, statt sie durch ein Präfix geerbt zu bekommen.
 */
const WIZARD_PREFIXES = [
  'brand.stepInfo.', 'brand.help.', 'brand.kit.', 'brand.dna.', 'brand.color.',
  'brand.type.', 'brand.mark.', 'brand.imagery.', 'brand.motion.', 'brand.scene.',
  'brand.designLayer.', 'brand.inspiration.', 'brand.reading.', 'brand.myScores.',
  'brand.document.', 'brand.acceptance.', 'brand.nav.', 'brand.workspace.',
  'brand.advisors.', 'brand.choice.', 'brand.rebrand.', 'brand.check.criteria.',
  'brand.check.document.',
]

/**
 * Die zweite Person Plural. „ihre"/„ihrem" fehlen bewusst (dritte Person:
 * „die Produkte heissen nach ihr"), `ihr` steht nur mit Wortgrenze — derselbe
 * Zuschnitt wie im Anrede-Wächter der Fragen.
 */
const PLURAL = /(^|[^a-zäöüß])(ihr|euch|euer|eure|eurem|euren|eures|eurer|habt|seid|wollt|könnt|müsst|sollt|würdet|hättet|nehmt|bewertet)([^a-zäöüß]|$)/i

/** Nur die dritte Person Singular — „nach ihr", „ihr Score", „ihr Zutun". */
const THIRD_PERSON = /(^|[^a-zäöüß])ihr([^a-zäöüß]|$)/i

describe('teamTextKeyFor', () => {
  it('nimmt die Fassung der Weiche, wenn es sie gibt', () => {
    const has = (key: string) => key.endsWith('.solo') || key.endsWith('.team')
    expect(teamTextKeyFor('x.y', 'solo', has)).toBe('x.y.solo')
    expect(teamTextKeyFor('x.y', 'team', has)).toBe('x.y.team')
  })

  it('fällt auf den Basis-Schlüssel zurück, wenn der Text keine Weiche trägt', () => {
    expect(teamTextKeyFor('x.y', 'solo', () => false)).toBe('x.y')
    expect(teamTextKeyFor('x.y', 'team', () => false)).toBe('x.y')
  })

  it('nimmt die Solo-Fassung, wenn nur sie existiert — und umgekehrt', () => {
    // Ein halbes Paar ist ein Fehler im Katalog (der Wächter unten fängt ihn),
    // aber die Funktion selbst darf daran nicht zerbrechen.
    expect(teamTextKeyFor('x.y', 'solo', key => key === 'x.y.solo')).toBe('x.y.solo')
    expect(teamTextKeyFor('x.y', 'team', key => key === 'x.y.solo')).toBe('x.y')
  })
})

describe('Anrede der Wizard-Oberfläche', () => {
  it('kein Wizard-Text spricht mit „ihr/euch" — ausser der Team-Seite einer Weiche', () => {
    const offenders: string[] = []
    for (const [key, value] of deValues) {
      if (!WIZARD_PREFIXES.some(prefix => key.startsWith(prefix))) continue
      if (key.endsWith('.team')) continue // die Team-Fassung DARF und MUSS so sprechen
      if (!PLURAL.test(value)) continue
      // „ihr" allein kann die dritte Person sein („danach steht hier ihr Score").
      const onlyThirdPerson = THIRD_PERSON.test(value)
        && !/(^|[^a-zäöüß])(euch|euer|eure|eurem|euren|eures|eurer|habt|seid|wollt|könnt|müsst|sollt|würdet|hättet|nehmt|bewertet)([^a-zäöüß]|$)/i.test(value)
        && !/(^|[^a-zäöüß])ihr\s+(seid|habt|wollt|könnt|müsst|sollt|steht|bekommt|wisst)/i.test(value)
      if (onlyThirdPerson) continue
      offenders.push(`${key}: ${value.slice(0, 90)}`)
    }
    expect(offenders).toEqual([])
  })

  it('jede Weiche trägt BEIDE Fassungen, und zwar in beiden Sprachen', () => {
    const gaps: string[] = []
    for (const key of deValues.keys()) {
      if (!key.endsWith('.solo')) continue
      const base = key.slice(0, -'.solo'.length)
      if (!deValues.has(`${base}.team`)) gaps.push(`${base}: Team-Fassung fehlt in de`)
      if (!enValues.has(`${base}.solo`) || !enValues.has(`${base}.team`)) {
        // `you` ist beides — die englischen Kinder tragen denselben Satz. Sie
        // stehen trotzdem da, weil `i18nCatalog.test.ts` für beide Sprachen
        // denselben Schlüsselvorrat verlangt.
        gaps.push(`${base}: englische Fassungen fehlen`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('die Solo-Fassung einer Weiche spricht nie mit „ihr/euch"', () => {
    const offenders: string[] = []
    for (const [key, value] of deValues) {
      if (!key.endsWith('.solo')) continue
      if (PLURAL.test(value)) offenders.push(`${key}: ${value.slice(0, 90)}`)
    }
    expect(offenders).toEqual([])
  })
})
