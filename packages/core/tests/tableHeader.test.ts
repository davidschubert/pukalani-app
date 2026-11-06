import { describe, it, expect } from 'vitest'
import { srOnlyHeader } from '../app/utils/tableHeader'

/**
 * Der Helfer ersetzt `header: () => ''` (H1, 2026-09-06). Geprüft wird beides:
 * dass ein echter Textknoten entsteht (das war der Hydration-Fehler) und dass
 * ein leerer Name auffliegt statt still durchzurutschen.
 */
describe('srOnlyHeader', () => {
  it('rendert einen sr-only-Span mit dem Text', () => {
    const vnode = srOnlyHeader('Aktionen')()
    expect(vnode.type).toBe('span')
    expect(vnode.props).toEqual({ class: 'sr-only' })
    expect(vnode.children).toBe('Aktionen')
  })

  it('nimmt eine Funktion, damit ein Sprachwechsel nach dem Spaltenbau ankommt', () => {
    let locale = 'de'
    const header = srOnlyHeader(() => (locale === 'de' ? 'Aktionen' : 'Actions'))
    expect(header().children).toBe('Aktionen')
    locale = 'en'
    expect(header().children).toBe('Actions')
  })

  it('wirft bei leerem Namen — sonst wäre die Falle nur umbenannt', () => {
    expect(() => srOnlyHeader('')()).toThrow(/leerer Spaltenname/)
    expect(() => srOnlyHeader(() => '')()).toThrow(/leerer Spaltenname/)
  })

  it('baut erst beim Rendern — der Fehler entsteht nicht schon beim Spaltenbau', () => {
    expect(() => srOnlyHeader('')).not.toThrow()
  })
})
