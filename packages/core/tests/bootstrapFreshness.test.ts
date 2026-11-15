import { describe, expect, it } from 'vitest'
import { decideFreshness } from '../../../scripts/bootstrap-lib/freshness.mjs'

/**
 * BE-026 (2026-11-15): die Wache von `scripts/bootstrap.mjs`. Nur ein
 * POSITIVER Befund „leer" lässt den Lauf weiter — die alte Wache wertete jeden
 * Fehler (kein Leserecht, falsche Datenbank, Netz) als „frische Instanz".
 * Antworten wie gemessen gegen Appwrite 2.7.1.
 */
describe('decideFreshness — Wache des Bootstrap-Skripts', () => {
  it('404 database_not_found ⇒ frisch', () => {
    const result = decideFreshness({ status: 404, body: { code: 404, type: 'database_not_found', message: 'Database not found' }, force: false })
    expect(result.proceed).toBe(true)
    expect(result.verdict).toBe('fresh')
  })

  it('200 mit total 0 ⇒ frisch', () => {
    const result = decideFreshness({ status: 200, body: { total: 0, tables: [] }, force: false })
    expect(result.proceed).toBe(true)
    expect(result.verdict).toBe('fresh')
  })

  it('200 mit total > 0 ⇒ befüllt, Abbruch mit Hinweis auf pnpm migrate und --force', () => {
    const result = decideFreshness({ status: 200, body: { total: 69, tables: [] }, force: false, app: 'comments' })
    expect(result.proceed).toBe(false)
    expect(result.verdict).toBe('populated')
    expect(result.message).toContain('69')
    expect(result.message).toContain('pnpm migrate --app comments')
    expect(result.message).toContain('--force')
  })

  it('401 (kein/falscher Schlüssel, fehlendes Recht) ⇒ kann nicht prüfen', () => {
    const result = decideFreshness({ status: 401, body: { code: 401, type: 'general_unauthorized_scope' }, force: false })
    expect(result.proceed).toBe(false)
    expect(result.verdict).toBe('unknown')
    expect(result.message).toContain('401')
    expect(result.message).toContain('general_unauthorized_scope')
  })

  it('403 und 500 ⇒ kann nicht prüfen', () => {
    for (const status of [403, 500, 502]) {
      const result = decideFreshness({ status, body: { message: 'x' }, force: false })
      expect(result.proceed, String(status)).toBe(false)
      expect(result.verdict).toBe('unknown')
    }
  })

  it('404 ohne database_not_found (z. B. falsche Adresse) ⇒ kann nicht prüfen', () => {
    expect(decideFreshness({ status: 404, body: { type: 'general_route_not_found' }, force: false }).verdict).toBe('unknown')
    expect(decideFreshness({ status: 404, body: null, force: false }).verdict).toBe('unknown')
  })

  it('Netzfehler ⇒ kann nicht prüfen', () => {
    const result = decideFreshness({ status: null, body: null, networkError: 'fetch failed (connect ECONNREFUSED)', force: false })
    expect(result.proceed).toBe(false)
    expect(result.verdict).toBe('unknown')
    expect(result.message).toContain('ECONNREFUSED')
  })

  it('unlesbarer Rumpf oder 200 ohne Zahl ⇒ kann nicht prüfen', () => {
    for (const body of [null, 'kaputt', {}, { total: '3' }, { total: -1 }, { total: 1.5 }, [1, 2]]) {
      const result = decideFreshness({ status: 200, body, force: false })
      expect(result.proceed, JSON.stringify(body)).toBe(false)
      expect(result.verdict).toBe('unknown')
    }
  })

  it('--force überspringt die Wache mit Warnung — auch bei befüllt, 401 und Netzfehler', () => {
    for (const input of [
      { status: 200, body: { total: 69 } },
      { status: 401, body: {} },
      { status: null, body: null, networkError: 'fetch failed' },
    ]) {
      const result = decideFreshness({ ...input, force: true })
      expect(result.proceed).toBe(true)
      expect(result.verdict).toBe('forced')
      expect(result.message).toContain('--force')
    }
  })
})
