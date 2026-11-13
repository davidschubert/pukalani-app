import { describe, expect, it } from 'vitest'
import {
  AVATAR_BUCKET_EXTENSIONS,
  AVATAR_IMAGE_TYPES,
  STORAGE_FILE_RESPONSE_HEADERS,
  avatarFileName,
  isAvatarImageMime,
  sniffImageMime,
} from '../shared/avatarImage'

/**
 * SEC-001 — die EINE Bildregel für Profilbilder: Erkennung am Inhalt und die
 * Typ-Tabelle. Dass Migration system-039 dieselben Werte trägt, hält
 * `avatarBucketMigration.test.ts` fest.
 */

const bytes = (...values: number[]) => Uint8Array.from(values)
const ascii = (text: string) => new TextEncoder().encode(text)

const PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00)
const JPEG = bytes(0xFF, 0xD8, 0xFF, 0xE0, 0x00)
const WEBP = Uint8Array.from([...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBPVP8 ')])
const GIF = ascii('GIF89a\u0001\u0000')

describe('sniffImageMime', () => {
  it('erkennt die vier erlaubten Formate am Inhalt', () => {
    expect(sniffImageMime(PNG)).toBe('image/png')
    expect(sniffImageMime(JPEG)).toBe('image/jpeg')
    expect(sniffImageMime(WEBP)).toBe('image/webp')
    expect(sniffImageMime(GIF)).toBe('image/gif')
    expect(sniffImageMime(ascii('GIF87a....'))).toBe('image/gif')
  })

  it('erkennt einen Buffer genauso wie ein Uint8Array', () => {
    expect(sniffImageMime(Buffer.from(PNG))).toBe('image/png')
  })

  it('Gegenprobe: HTML, SVG-Text, leer, zu kurz und RIFF ohne WEBP → null', () => {
    expect(sniffImageMime(ascii('<!doctype html><script>alert(1)</script>'))).toBeNull()
    expect(sniffImageMime(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImageMime(new Uint8Array())).toBeNull()
    expect(sniffImageMime(PNG.subarray(0, 7))).toBeNull()
    expect(sniffImageMime(bytes(0xFF, 0xD8))).toBeNull()
    expect(sniffImageMime(Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]))).toBeNull()
  })
})

describe('isAvatarImageMime', () => {
  it('nimmt die vier Bildtypen', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isAvatarImageMime(mime)).toBe(true)
    }
  })

  it('Gegenprobe: SVG, HTML, Leeres und Nicht-Strings → false', () => {
    expect(isAvatarImageMime('image/svg+xml')).toBe(false)
    expect(isAvatarImageMime('text/html')).toBe(false)
    expect(isAvatarImageMime('')).toBe(false)
    expect(isAvatarImageMime(undefined)).toBe(false)
    expect(isAvatarImageMime(null)).toBe(false)
    expect(isAvatarImageMime('toString')).toBe(false)
  })
})

describe('avatarFileName', () => {
  it('leitet den Namen aus dem Typ ab', () => {
    expect(avatarFileName('image/png')).toBe('avatar.png')
    expect(avatarFileName('image/jpeg')).toBe('avatar.jpg')
    expect(avatarFileName('image/webp')).toBe('avatar.webp')
    expect(avatarFileName('image/gif')).toBe('avatar.gif')
  })

  it('jede Endung der Tabelle steht in der Endungsliste des Buckets', () => {
    for (const extension of Object.values(AVATAR_IMAGE_TYPES)) {
      expect(AVATAR_BUCKET_EXTENSIONS).toContain(extension)
    }
  })
})

describe('Schutz-Kopfzeilen', () => {
  it('nosniff und eine CSP mit sandbox', () => {
    expect(STORAGE_FILE_RESPONSE_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    expect(STORAGE_FILE_RESPONSE_HEADERS['Content-Security-Policy']).toContain('sandbox')
    expect(STORAGE_FILE_RESPONSE_HEADERS['Content-Security-Policy']).toContain('default-src \'none\'')
  })
})
