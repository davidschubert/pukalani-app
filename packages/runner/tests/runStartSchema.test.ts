import { describe, expect, it } from 'vitest'
import { budgetFromInput, createRunStartSchema } from '../schemas/runStart'

/**
 * RU1 (b), 2026-11-21: das Budget-Feld des Start-Formulars lehnte JEDE Zahl ab.
 * `UInput type="number"` gibt die Eingabe als ZAHL weiter (nur das geleerte
 * Feld bleibt ''), das Schema verlangte einen Text — „expected string,
 * received number", und der Start-Knopf blieb gesperrt. Auf der echten Seite
 * gefunden, kein Test hatte es gesehen: das Schema war nie mit dem Wert
 * geprüft worden, den das Feld wirklich liefert.
 */

const base = {
  runnerId: 'runner-1',
  model: 'sonnet',
  permissionMode: 'plan' as const,
  repoKey: 'maui',
  testCommands: [],
  interactive: false,
}

const parse = (maxBudgetText: unknown) =>
  createRunStartSchema().safeParse({ ...base, maxBudgetText })

describe('budgetFromInput', () => {
  it.each([
    ['', 0, 'geleertes Feld = kein eigener Deckel'],
    ['   ', 0, 'nur Leerzeichen'],
    [0, 0, 'Zahl 0'],
    [5, 5, 'Zahl, wie UInput type="number" sie liefert'],
    [2.5, 2.5, 'halbe Schritte'],
    [100, 100, 'obere Grenze'],
    ['5', 5, 'Zahl als Text'],
    ['2.5', 2.5, 'Kommazahl als Text'],
  ])('%j ⇒ %j (%s)', (input, expected) => {
    expect(budgetFromInput(input)).toBe(expected)
  })

  it.each([
    [-1, 'negativ'],
    [100.5, 'über der Grenze'],
    ['101', 'über der Grenze als Text'],
    ['abc', 'kein Zahl-Text'],
    ['2,5', 'Komma statt Punkt'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'unendlich'],
    [null, 'null'],
    [undefined, 'fehlt'],
    [true, 'Wahrheitswert'],
  ])('%j ⇒ ungültig (%s)', (input) => {
    expect(budgetFromInput(input)).toBeNull()
  })
})

describe('createRunStartSchema — Budget-Feld', () => {
  it('nimmt die ZAHL an, die das Feld liefert (der Fehler von der echten Seite)', () => {
    const result = parse(5)
    expect(result.success).toBe(true)
  })

  it('nimmt das geleerte Feld und einen Zahl-Text an', () => {
    expect(parse('').success).toBe(true)
    expect(parse('7.5').success).toBe(true)
  })

  it('lehnt ab, was kein Betrag von 0 bis 100 ist — mit der Budget-Meldung', () => {
    // `null` und `true` scheitern schon am Typ — auch dort steht der eigene
    // Satz, nicht die rohe englische Meldung von Zod.
    for (const bad of [-1, 101, 'abc', null, true]) {
      const result = parse(bad)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.map(issue => issue.message)).toContain('runner.form.errors.budget')
        expect(result.error.issues.map(issue => issue.path.join('.'))).toContain('maxBudgetText')
      }
    }
  })
})
