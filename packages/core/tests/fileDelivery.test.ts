import { describe, expect, it } from 'vitest'
import { FILE_RESPONSE_HEADERS, contentDisposition, decideFileDelivery } from '../shared/fileDelivery'

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D])
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10])
const HTML = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')

describe('decideFileDelivery — der Typ kommt nie ungeprüft aus dem Speicher', () => {
  it('echtes PNG mit Typ image/png ⇒ inline image/png', () => {
    const result = decideFileDelivery({ storedType: 'image/png', bytes: PNG, name: 'shot.png' })
    expect(result.inline).toBe(true)
    expect(result.contentType).toBe('image/png')
    expect(result.disposition.startsWith('inline;')).toBe(true)
  })

  it('der Antwort-Typ ist der ERKANNTE, nicht der gespeicherte', () => {
    const result = decideFileDelivery({ storedType: 'image/png', bytes: JPEG, name: 'x.png' })
    expect(result.contentType).toBe('image/jpeg')
  })

  it('gespeicherter Typ text/html ⇒ Download ohne text/html', () => {
    const result = decideFileDelivery({ storedType: 'text/html', bytes: HTML, name: 'a.html' })
    expect(result.inline).toBe(false)
    expect(result.contentType).toBe('application/octet-stream')
    expect(result.disposition.startsWith('attachment;')).toBe(true)
  })

  it('Typ image/png, Inhalt HTML ⇒ Download', () => {
    const result = decideFileDelivery({ storedType: 'image/png', bytes: HTML, name: 'a.png' })
    expect(result.inline).toBe(false)
    expect(result.contentType).toBe('application/octet-stream')
  })

  it('SVG nie inline, auch nicht mit Bild-Typ', () => {
    for (const storedType of ['image/svg+xml', 'image/png']) {
      const result = decideFileDelivery({ storedType, bytes: SVG, name: 'a.svg' })
      expect(result.inline).toBe(false)
      expect(result.contentType).toBe('application/octet-stream')
    }
  })

  it('PDF und Text gehen als Download', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7')
    expect(decideFileDelivery({ storedType: 'application/pdf', bytes: pdf, name: 'a.pdf' }).inline).toBe(false)
    expect(decideFileDelivery({ storedType: 'text/plain', bytes: HTML, name: 'a.txt' }).contentType).toBe('application/octet-stream')
  })

  it('leerer oder fehlender Typ ⇒ Download', () => {
    expect(decideFileDelivery({ storedType: '', bytes: PNG, name: 'a' }).inline).toBe(false)
    expect(decideFileDelivery({ storedType: undefined, bytes: PNG, name: 'a' }).inline).toBe(false)
  })

  it('allowInlineImages: false ⇒ auch ein echtes Bild als Download', () => {
    const result = decideFileDelivery({ storedType: 'image/png', bytes: PNG, name: 'a.png', allowInlineImages: false })
    expect(result.inline).toBe(false)
    expect(result.contentType).toBe('application/octet-stream')
  })
})

describe('contentDisposition — der Dateiname ist sicher kodiert', () => {
  it('Anführungszeichen, Zeilenumbrüche und Pfade landen nicht im Kopf', () => {
    const value = contentDisposition('attachment', '../../a"b\r\nSet-Cookie: x=1;.html')
    expect(value).not.toMatch(/[\r\n]/)
    const fallback = /filename="([^"]*)"/.exec(value)?.[1]
    expect(fallback).toBeDefined()
    expect(fallback).not.toContain('/')
    expect(value).toContain('filename*=UTF-8\'\'')
    expect(value.split('filename*=')[1]).not.toMatch(/["; ]/)
  })

  it('Umlaute bleiben über filename* erhalten', () => {
    const value = contentDisposition('attachment', 'Übersicht (final).pdf')
    expect(value).toContain('filename*=UTF-8\'\'%C3%9Cbersicht%20%28final%29.pdf')
    expect(value).toMatch(/filename="[\x20-\x7E]+"/)
  })

  it('leerer Name ⇒ Ersatzname', () => {
    expect(contentDisposition('attachment', '')).toContain('filename="file"')
    expect(contentDisposition('attachment', null)).toContain('filename="file"')
  })
})

describe('FILE_RESPONSE_HEADERS', () => {
  it('nosniff und Sandbox-CSP', () => {
    expect(FILE_RESPONSE_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    expect(FILE_RESPONSE_HEADERS['Content-Security-Policy']).toBe('default-src \'none\'; sandbox')
  })
})
