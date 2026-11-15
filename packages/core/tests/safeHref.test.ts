import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HTTP_URL_PROTOCOL, isHttpUrl, safeExternalHref } from '../shared/safeHref'

/**
 * SEC-021: ein Link aus gespeicherten Daten zeigt nur auf http oder https.
 * Gegenbeispiele bewusst unverfänglich — die Regel ist „nur http(s)", nicht
 * eine Liste verbotener Schemata.
 */
describe('isHttpUrl — nur absolute http(s)-Adressen', () => {
  it.each([
    'https://example.com',
    'http://example.com/pfad?x=1#anker',
    'HTTPS://EXAMPLE.COM',
    'https://example.com:8443/a',
  ])('nimmt %s an', (value) => {
    expect(isHttpUrl(value)).toBe(true)
  })

  it.each([
    ['ein anderes Schema', 'javascript:void(0)'],
    ['ein Daten-Schema', 'data:text/plain,x'],
    ['ein Datei-Transfer-Schema', 'ftp://example.com'],
    ['einen relativen Pfad', '/intern'],
    ['eine protokoll-relative Adresse', '//example.com'],
    ['ein Schema ohne Schrägstriche', 'https:example.com'],
    ['führende Leerzeichen', ' https://example.com'],
    ['abschließende Leerzeichen', 'https://example.com '],
    ['einen Zeilenumbruch', 'https://exa\nmple.com'],
    ['einen Tabulator', 'https://exa\tmple.com'],
    ['ein Steuerzeichen', '\u0001https://example.com'],
    ['einen leeren Wert', ''],
    ['einen Wert ohne Host', 'https://'],
  ])('lehnt %s ab', (_label, value) => {
    expect(isHttpUrl(value)).toBe(false)
  })

  it.each([null, undefined, 42, {}, ['https://example.com']])('lehnt Nicht-Zeichenketten ab (%s)', (value) => {
    expect(isHttpUrl(value)).toBe(false)
  })
})

describe('safeExternalHref — die Adresse oder nichts', () => {
  it('gibt eine http(s)-Adresse unverändert zurück', () => {
    expect(safeExternalHref('https://example.com/a')).toBe('https://example.com/a')
  })

  it('gibt für jedes andere Schema undefined zurück (kein Link)', () => {
    expect(safeExternalHref('javascript:void(0)')).toBeUndefined()
    expect(safeExternalHref('data:text/plain,x')).toBeUndefined()
    expect(safeExternalHref('ftp://example.com')).toBeUndefined()
    expect(safeExternalHref(null)).toBeUndefined()
    expect(safeExternalHref('')).toBeUndefined()
  })
})

describe('HTTP_URL_PROTOCOL — wirkt in der installierten Zod-Version', () => {
  const schema = z.url({ protocol: HTTP_URL_PROTOCOL })

  it('nimmt http und https an', () => {
    expect(schema.safeParse('https://example.com').success).toBe(true)
    expect(schema.safeParse('http://example.com').success).toBe(true)
  })

  it('lehnt andere Schemata ab', () => {
    expect(schema.safeParse('javascript:void(0)').success).toBe(false)
    expect(schema.safeParse('data:text/plain,x').success).toBe(false)
    expect(schema.safeParse('ftp://example.com').success).toBe(false)
  })

  it('ohne die Option nimmt z.url() jedes Schema an (darum die Konstante)', () => {
    expect(z.url().safeParse('ftp://example.com').success).toBe(true)
  })
})
