import { describe, expect, it } from 'vitest'
import { isUploadImage } from '../server/utils/uploadImage'

const pad = (bytes: number[]) => Uint8Array.from([...bytes, ...Array(16).fill(0)])

describe('isUploadImage', () => {
  it('nimmt JPEG, PNG und WebP am Inhalt', () => {
    expect(isUploadImage(pad([0xFF, 0xD8, 0xFF]))).toBe(true)
    expect(isUploadImage(pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))).toBe(true)
    expect(isUploadImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(true)
  })

  it('lehnt GIF, Text und zu kurze Daten ab', () => {
    expect(isUploadImage(pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(false)
    expect(isUploadImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(false)
    expect(isUploadImage(Uint8Array.from([0xFF, 0xD8, 0xFF, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })
})
