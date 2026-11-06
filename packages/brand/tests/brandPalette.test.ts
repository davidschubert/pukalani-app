import { describe, expect, it } from 'vitest'
import { BRAND_GRADIENTS, brandGradientFor } from '../shared/brandPalette'

/**
 * Die Kachel-Farbwelten (Davids Auftrag 2026-09-03) — was hier festgenagelt
 * wird, ist die STABILITÄT: die Zuweisung hängt an der Profil-Id und darf
 * sich nie wieder bewegen, sonst färben sich alle Bestands-Kacheln um.
 */
describe('brandPalette', () => {
  it('die drei abgenommenen Dummy-Dreiklänge führen die Tabelle an', () => {
    expect(BRAND_GRADIENTS[0]).toEqual(['#e8d3b8', '#b98a5e', '#4a3123'])
    expect(BRAND_GRADIENTS[1]).toEqual(['#e2e4ea', '#8a93ad', '#2b3148'])
    expect(BRAND_GRADIENTS[2]).toEqual(['#dfe8e4', '#6f9184', '#22392f'])
  })

  it('jede Welt ist ein Dreiklang aus gültigen Hex-Farben', () => {
    expect(BRAND_GRADIENTS.length).toBeGreaterThanOrEqual(12)
    for (const gradient of BRAND_GRADIENTS) {
      expect(gradient).toHaveLength(3)
      for (const color of gradient) expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('dieselbe Id liefert für immer dieselbe Welt', () => {
    const first = brandGradientFor('6a9731c600122eaf065a')
    expect(brandGradientFor('6a9731c600122eaf065a')).toEqual(first)
    expect(BRAND_GRADIENTS).toContainEqual(first)
  })

  it('verschiedene Ids streuen über mehrere Welten (Appwrite-Id-Form)', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `68b${i.toString(16).padStart(17, '0')}`)
    const distinct = new Set(seeds.map(seed => brandGradientFor(seed).join()))
    expect(distinct.size).toBeGreaterThanOrEqual(6)
  })

  it('Gegenprobe: die Rückgabe ist eine Kopie, kein Tabellen-Verweis', () => {
    const gradient = brandGradientFor('x')
    gradient[0] = '#000000'
    expect(BRAND_GRADIENTS).not.toContainEqual(gradient)
  })
})
