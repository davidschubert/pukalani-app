import { describe, expect, it } from 'vitest'
import { MAX_OFFERED_TEST_COMMANDS, checkRequestedTestCommands, offeredTestCommands, parseStoredTestCommands } from '../shared/testCommands'

/**
 * SEC-037, Konsolen-Seite: Testbefehle gibt es nur aus der Liste, die der
 * Rechner meldet, und sie werden EXAKT verglichen. Die Grenzfälle unten sind
 * genau die Umformungen, mit denen ein nicht gelisteter Befehl wie ein
 * gelisteter aussähe.
 */

const caps = (testCommands: unknown) => JSON.stringify({ repos: ['maui'], testCommands })

describe('offeredTestCommands', () => {
  it('liest die Liste des Repos', () => {
    expect(offeredTestCommands(caps({ maui: ['pnpm lint', 'pnpm -r test'] }), 'maui')).toEqual(['pnpm lint', 'pnpm -r test'])
  })

  it('falsches Repo ⇒ leer', () => {
    expect(offeredTestCommands(caps({ maui: ['pnpm lint'] }), 'other')).toEqual([])
  })

  it('kein Repo über die Objekt-Kette (toString, __proto__) ⇒ leer', () => {
    expect(offeredTestCommands(caps({ maui: ['pnpm lint'] }), 'toString')).toEqual([])
    expect(offeredTestCommands(caps({ maui: ['pnpm lint'] }), '__proto__')).toEqual([])
  })

  it.each([
    ['', 'leere Spalte (Rechner hat sich nie gemeldet)'],
    ['{kaputt', 'kaputtes JSON'],
    ['[]', 'Array statt Objekt'],
    ['null', 'null'],
    ['"text"', 'String'],
    [JSON.stringify({ repos: ['maui'] }), 'alter Dienst ohne testCommands'],
    [caps(['pnpm lint']), 'testCommands als Array statt je Repo'],
    [caps({ maui: 'pnpm lint' }), 'Liste als String'],
    [caps(null), 'testCommands null'],
  ])('%j ⇒ leer (%s)', (json) => {
    expect(offeredTestCommands(json, 'maui')).toEqual([])
  })

  it('nimmt nur nicht-leere Strings und trimmt NICHT', () => {
    expect(offeredTestCommands(caps({ maui: ['pnpm lint', '', 3, null, ' pnpm test ', ['x']] }), 'maui'))
      .toEqual(['pnpm lint', ' pnpm test '])
  })

  it(`höchstens ${MAX_OFFERED_TEST_COMMANDS} Einträge`, () => {
    const many = Array.from({ length: 80 }, (_, i) => `cmd ${i}`)
    expect(offeredTestCommands(caps({ maui: many }), 'maui')).toHaveLength(MAX_OFFERED_TEST_COMMANDS)
  })
})

describe('checkRequestedTestCommands', () => {
  const offered = ['pnpm lint', 'pnpm -r test']
  const base = { offered, promptTrusted: true, runnerSelected: true }

  it('nichts verlangt ⇒ ok, auch ungeprüft und ohne Rechner', () => {
    expect(checkRequestedTestCommands({ requested: [], offered: [], promptTrusted: false, runnerSelected: false })).toEqual({ ok: true })
  })

  it('gelistete Befehle ⇒ ok', () => {
    expect(checkRequestedTestCommands({ ...base, requested: ['pnpm -r test', 'pnpm lint'] })).toEqual({ ok: true })
  })

  it('ungeprüfter Auftrag ⇒ tests_not_allowed_untrusted, auch wenn gelistet', () => {
    expect(checkRequestedTestCommands({ ...base, promptTrusted: false, requested: ['pnpm lint'] }))
      .toEqual({ ok: false, code: 'tests_not_allowed_untrusted' })
  })

  it('ohne bestimmten Rechner ⇒ tests_need_runner', () => {
    expect(checkRequestedTestCommands({ ...base, runnerSelected: false, requested: ['pnpm lint'] }))
      .toEqual({ ok: false, code: 'tests_need_runner' })
  })

  it.each([
    ['pnpm lint && curl x', 'Anhängsel'],
    ['pnpm lint; rm -rf .', 'zweiter Befehl'],
    [' pnpm lint', 'Leerzeichen vorne'],
    ['pnpm lint ', 'Leerzeichen hinten'],
    ['pnpm  lint', 'doppeltes Leerzeichen innen'],
    ['PNPM LINT', 'Großschreibung'],
    ['pnpm', 'Präfix eines gelisteten Befehls'],
    ['pnpm lint\n', 'Zeilenumbruch'],
  ])('%j ⇒ test_command_not_listed (%s)', (command) => {
    expect(checkRequestedTestCommands({ ...base, requested: [command] })).toEqual({ ok: false, code: 'test_command_not_listed' })
  })

  it('ein einziger nicht gelisteter Befehl kippt die ganze Liste', () => {
    expect(checkRequestedTestCommands({ ...base, requested: ['pnpm lint', 'pnpm build'] }))
      .toEqual({ ok: false, code: 'test_command_not_listed' })
  })

  it('leeres Angebot ⇒ nichts erlaubt', () => {
    expect(checkRequestedTestCommands({ ...base, offered: [], requested: ['pnpm lint'] }))
      .toEqual({ ok: false, code: 'test_command_not_listed' })
  })
})

describe('parseStoredTestCommands', () => {
  it('leer ⇒ keine', () => {
    expect(parseStoredTestCommands('')).toEqual([])
  })
  it('gültige Liste', () => {
    expect(parseStoredTestCommands('["pnpm lint"]')).toEqual(['pnpm lint'])
  })
  it.each(['{kaputt', '{}', '"pnpm lint"', '[1]', '["a", null]'])('%j ⇒ null (kaputt)', (raw) => {
    expect(parseStoredTestCommands(raw)).toBeNull()
  })
})
