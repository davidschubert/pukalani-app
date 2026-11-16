import { describe, expect, it } from 'vitest'
import { isAuditUnavailable, isReauthRequired, unwrapBlobError } from '../app/utils/fetchError'

/**
 * BE-021/SEC-034 (2026-11-16): zwei Gründe müssen an Datei-Downloads
 * ankommen — „frische Anmeldung nötig" und „Protokoll nicht erreichbar, nichts
 * herausgegeben". Ein `$fetch` mit `responseType: 'blob'` liest aber auch die
 * Fehler-Antwort als Blob; ohne `unwrapBlobError` sähe die Oberfläche keinen
 * der beiden Gründe.
 */
describe('isAuditUnavailable', () => {
  it('erkennt den Grund aus dem Envelope — und nur ihn', () => {
    expect(isAuditUnavailable({ data: { reason: 'audit_unavailable' } })).toBe(true)
    expect(isAuditUnavailable({ data: { reason: 'reauth_required' } })).toBe(false)
    expect(isAuditUnavailable({ statusCode: 503 })).toBe(false)
    expect(isAuditUnavailable(null)).toBe(false)
  })
})

describe('unwrapBlobError', () => {
  it('liest einen JSON-Blob als Envelope', async () => {
    const blob = new Blob([JSON.stringify({ ok: false, code: 'FORBIDDEN', reason: 'reauth_required' })], { type: 'application/json' })
    const error = await unwrapBlobError({ statusCode: 403, data: blob })
    expect(isReauthRequired(error)).toBe(true)
    expect((error as { statusCode?: number }).statusCode).toBe(403)
  })

  it('kein Blob oder kein JSON ⇒ der Fehler kommt unverändert zurück', async () => {
    const plain = { data: { reason: 'audit_unavailable' } }
    expect(await unwrapBlobError(plain)).toBe(plain)
    const broken = { data: new Blob(['kein json']) }
    expect(await unwrapBlobError(broken)).toBe(broken)
    expect(await unwrapBlobError(undefined)).toBeUndefined()
  })
})
