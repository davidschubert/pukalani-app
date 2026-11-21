import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CSP_REPORT_MAX_BYTES,
  CSP_REPORT_MAX_ITEMS,
  CSP_REPORT_PATH,
  cspSourceLabel,
  cspViolationKey,
  readCspReports,
} from '../shared/cspReport'
import { scriptCspReportOnly } from '../shared/securityHeaders'
import { createCspReportCap } from '../server/utils/cspReportCap'

/**
 * BERICHTE DER SKRIPT-REGEL (SE1 a, 2026-11-17).
 *
 * Die Regel beobachtet nur; ihre Kopfzeile nennt jetzt eine Annahme-Route.
 * Geprüft wird, was beim Umbauen still kaputtgeht:
 *  1. Kopfzeile und Route nennen dieselbe Adresse.
 *  2. Nur die zwei Formen, die ein Browser schickt, kommen durch.
 *  3. Behalten werden vier kurze Wörter — keine volle Adresse, keine Query.
 *  4. Browser-Erweiterungen und fremde Seiten fallen heraus.
 *  5. Die Route deckelt Größe und Menge und schreibt nichts über Personen.
 */

const HOST = 'app.example.test'
const MARK = 'GEHEIM-MARKER'

function legacy(report: Record<string, unknown>) {
  return { 'csp-report': { 'document-uri': `https://${HOST}/dashboard/einstellungen`, 'effective-directive': 'script-src-elem', ...report } }
}

describe('Kopfzeile und Route', () => {
  it('die Kopfzeile nennt genau die Route, die es gibt', () => {
    expect(scriptCspReportOnly([])).toContain(`report-uri ${CSP_REPORT_PATH}`)
    const file = fileURLToPath(new URL(`../server${CSP_REPORT_PATH}.post.ts`, import.meta.url))
    expect(existsSync(file), file).toBe(true)
  })
})

describe('Zod probiert im Browser kein `new Function`', () => {
  // Lokal am Build gemessen: ohne den Schalter schickt JEDER Seitenaufruf
  // einen Bericht `script-src eval` — Zods eigene Probe, kein Verstoß.
  it('der Schalter steht auf Modul-Ebene, vor dem Plugin, und das Plugin lädt als erstes', () => {
    const file = fileURLToPath(new URL('../app/plugins/00.zod-jitless.client.ts', import.meta.url))
    const source = readFileSync(file, 'utf8')
    const config = source.indexOf('\nconfig({ jitless: true })\n')
    expect(config).toBeGreaterThan(0)
    // Der schlanke Einstieg (Q22, PERF-010): der volle Einstieg `zod` zog
    // die ganze Bibliothek in den Einstieg jeder Seite.
    expect(source).toContain("import { config } from 'zod/v4/core'")
    expect(source).not.toMatch(/from 'zod'/)
    expect(config).toBeLessThan(source.indexOf('export default defineNuxtPlugin'))
    expect(source).toContain('enforce: \'pre\'')
  })
})

describe('cspSourceLabel — nur die Herkunft bleibt', () => {
  it.each([
    [`https://cdn.example/pfad/datei.js?key=${MARK}#${MARK}`, 'https://cdn.example'],
    ['HTTPS://CDN.Example:8443/x', 'https://cdn.example:8443'],
    ['inline', 'inline'],
    ['eval', 'eval'],
    ['data', 'data'],
    ['data:text/javascript;base64,AAAA', 'data'],
    ['chrome-extension://abcdefgh/inject.js', 'chrome-extension'],
    ['', ''],
    ['kein url mit leerzeichen', ''],
    [42, ''],
    [`https://${'a'.repeat(3000)}.example`, ''],
  ])('%s ⇒ %s', (input, expected) => {
    expect(cspSourceLabel(input)).toBe(expected)
  })
})

describe('readCspReports — die alte Form (application/csp-report)', () => {
  it('behält Anweisung, Herkunft und den ersten Abschnitt des Pfads', () => {
    const batch = readCspReports('application/csp-report', legacy({
      'document-uri': `https://${HOST}/reset-password/${MARK}?secret=${MARK}`,
      'blocked-uri': `https://fremd.example/skript.js?token=${MARK}`,
      'source-file': `https://${HOST}/_nuxt/entry.js`,
      'script-sample': MARK,
      'referrer': `https://woanders.example/${MARK}`,
    }), HOST)
    expect(batch).toEqual({
      violations: [{ directive: 'script-src-elem', blocked: 'https://fremd.example', source: `https://${HOST}`, area: '/reset-password' }],
      ignored: 0,
    })
    expect(JSON.stringify(batch)).not.toContain(MARK)
  })

  it('liest die Anweisung alter Browser aus `violated-directive` (erstes Wort)', () => {
    const batch = readCspReports('application/csp-report; charset=utf-8', {
      'csp-report': { 'document-uri': `https://${HOST}/`, 'violated-directive': 'script-src \'self\' https://a.example', 'blocked-uri': 'eval' },
    }, HOST)
    expect(batch?.violations).toEqual([{ directive: 'script-src', blocked: 'eval', source: '', area: '/' }])
  })

  it.each([
    ['Erweiterung als Quelle', { 'blocked-uri': 'chrome-extension://abc/x.js' }],
    ['Erweiterung als Datei', { 'blocked-uri': 'https://fremd.example/x.js', 'source-file': 'moz-extension://abc/content.js' }],
    ['Safari-Maske', { 'blocked-uri': 'webkit-masked-url://hidden/' }],
    ['fremde Seite', { 'document-uri': 'https://woanders.example/', 'blocked-uri': 'https://fremd.example/x.js' }],
    ['andere Regel', { 'effective-directive': 'img-src', 'blocked-uri': 'https://fremd.example/x.png' }],
    ['ohne lesbare Quelle', { 'blocked-uri': '' }],
  ])('%s ⇒ aussortiert, kein Verstoß', (_name, report) => {
    expect(readCspReports('application/csp-report', legacy(report), HOST)).toEqual({ violations: [], ignored: 1 })
  })

  it.each([
    ['falscher Typ', 'application/json', legacy({ 'blocked-uri': 'eval' })],
    ['kein Typ', undefined, legacy({ 'blocked-uri': 'eval' })],
    ['Liste statt Objekt', 'application/csp-report', [legacy({ 'blocked-uri': 'eval' })]],
    ['ohne csp-report', 'application/csp-report', { etwas: 'anderes' }],
    ['ohne Seite', 'application/csp-report', { 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'eval' } }],
    ['Seite ist keine Adresse', 'application/csp-report', legacy({ 'document-uri': 'keine adresse', 'blocked-uri': 'eval' })],
    ['ohne Anweisung', 'application/csp-report', { 'csp-report': { 'document-uri': `https://${HOST}/`, 'blocked-uri': 'eval' } }],
  ])('%s ⇒ kein Bericht', (_name, type, body) => {
    expect(readCspReports(type, body, HOST)).toBeNull()
  })
})

describe('readCspReports — die Form der Reporting-API (application/reports+json)', () => {
  const item = (body: Record<string, unknown>, type = 'csp-violation') => ({
    type,
    age: 1,
    url: `https://${HOST}/x?${MARK}`,
    user_agent: MARK,
    body: { documentURL: `https://${HOST}/de/dashboard?${MARK}`, effectiveDirective: 'script-src-elem', ...body },
  })

  it('liest jeden Verstoß der Liste und überspringt andere Sorten', () => {
    const batch = readCspReports('application/reports+json', [
      item({ blockedURL: 'https://fremd.example/a.js' }),
      item({}, 'deprecation'),
      item({ blockedURL: 'chrome-extension://abc/b.js' }),
    ], HOST)
    expect(batch).toEqual({
      violations: [{ directive: 'script-src-elem', blocked: 'https://fremd.example', source: '', area: '/de' }],
      ignored: 1,
    })
    expect(JSON.stringify(batch)).not.toContain(MARK)
  })

  it.each([
    ['leere Liste', []],
    ['zu viele Einträge', Array.from({ length: CSP_REPORT_MAX_ITEMS + 1 }, () => item({ blockedURL: 'eval' }))],
    ['Eintrag ist kein Objekt', ['text']],
    ['Verstoß ohne Rumpf', [{ type: 'csp-violation' }]],
    ['Objekt statt Liste', item({ blockedURL: 'eval' })],
  ])('%s ⇒ kein Bericht', (_name, body) => {
    expect(readCspReports('application/reports+json', body, HOST)).toBeNull()
  })
})

describe('Mengen-Deckel: je Fenster jeder Verstoß einmal, höchstens `max` verschiedene', () => {
  it('Wiederholung ⇒ still, über dem Deckel einmal melden, neues Fenster ⇒ wieder offen', () => {
    let now = 0
    const cap = createCspReportCap({ max: 2, windowMs: 1000, now: () => now })
    expect(cap.take('a')).toBe('accept')
    expect(cap.take('a')).toBe('repeat')
    expect(cap.take('b')).toBe('accept')
    expect(cap.take('c')).toBe('cap')
    expect(cap.take('d')).toBe('drop')
    // Ein bekannter Verstoß bleibt auch über dem Deckel eine Wiederholung.
    expect(cap.take('a')).toBe('repeat')
    now = 1000
    expect(cap.take('a')).toBe('accept')
    expect(cap.take('c')).toBe('accept')
  })
})

describe('POST /api/telemetry/csp-report', () => {
  const logged = vi.fn<(level: string, name: string, data: Record<string, unknown>) => void>()
  type Handler = (event: object) => Promise<null>
  let handler: Handler
  let request: { type?: string, raw?: string, length?: string | null }
  let status: number | undefined

  function send(body: unknown, type = 'application/csp-report') {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    request = { type, raw }
    return handler({ context: { user: { $id: `konto-${MARK}` } } })
  }

  beforeEach(async () => {
    logged.mockReset()
    status = undefined
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
    vi.stubGlobal('getRequestHeader', (_event: object, name: string) => {
      if (name === 'content-type') return request.type
      if (name === 'content-length') return request.length === null ? undefined : request.length ?? String(Buffer.byteLength(request.raw ?? ''))
      return undefined
    })
    vi.stubGlobal('readRawBody', async () => request.raw)
    vi.stubGlobal('getRequestURL', () => new URL(`https://${HOST}${CSP_REPORT_PATH}`))
    vi.stubGlobal('setResponseStatus', (_event: object, code: number) => { status = code })
    vi.stubGlobal('logEvent', logged)
    vi.resetModules()
    handler = (await import('../server/api/telemetry/csp-report.post')).default as unknown as Handler
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schreibt einen Verstoß als eine Zeile mit vier Wörtern — nichts über Konto oder Adresse', async () => {
    await expect(send(legacy({ 'blocked-uri': `https://fremd.example/x.js?${MARK}` }))).resolves.toBeNull()
    expect(status).toBe(204)
    expect(logged.mock.calls).toEqual([
      ['warn', 'csp.report', { directive: 'script-src-elem', blocked: 'https://fremd.example', source: '', area: '/dashboard' }],
    ])
    expect(JSON.stringify(logged.mock.calls)).not.toContain(MARK)
  })

  it('derselbe Verstoß noch einmal ⇒ 204, aber keine zweite Zeile', async () => {
    await send(legacy({ 'blocked-uri': 'https://fremd.example/x.js' }))
    await send(legacy({ 'blocked-uri': 'https://fremd.example/anderer-pfad.js' }))
    expect(logged).toHaveBeenCalledTimes(1)
  })

  it('Bericht aus einer Browser-Erweiterung ⇒ 204 und keine Zeile', async () => {
    await expect(send(legacy({ 'blocked-uri': 'chrome-extension://abc/x.js' }))).resolves.toBeNull()
    expect(status).toBe(204)
    expect(logged).not.toHaveBeenCalled()
  })

  it('über 40 verschiedenen Verstößen je Stunde: EINE Deckel-Zeile, danach Ruhe', async () => {
    for (let i = 0; i < 45; i++) await send(legacy({ 'blocked-uri': `https://quelle-${i}.example/x.js` }))
    const names = logged.mock.calls.map(([, name]) => name)
    expect(names.filter(name => name === 'csp.report')).toHaveLength(40)
    expect(logged.mock.calls.filter(([, name]) => name === 'csp.report_capped')).toEqual([['warn', 'csp.report_capped', { max: 40 }]])
  })

  it.each([
    ['zu groß angegeben', { length: String(CSP_REPORT_MAX_BYTES + 1) }, 413],
    ['ohne Längenangabe', { length: null }, 413],
    ['Länge ist keine Zahl', { length: 'viel' }, 413],
  ])('%s ⇒ %s, nichts eingelesen', async (_name, patch, expected) => {
    const read = vi.fn(async () => '{}')
    vi.stubGlobal('readRawBody', read)
    request = { type: 'application/csp-report', raw: '{}', ...patch }
    await expect(handler({ context: {} })).rejects.toMatchObject({ status: expected })
    expect(read).not.toHaveBeenCalled()
    expect(logged).not.toHaveBeenCalled()
  })

  it('länger als angegeben ⇒ 400', async () => {
    request = { type: 'application/csp-report', raw: `{"x":"${'a'.repeat(CSP_REPORT_MAX_BYTES)}"}`, length: '10' }
    await expect(handler({ context: {} })).rejects.toMatchObject({ status: 400 })
  })

  it.each([
    ['kein JSON', 'kein json', 'application/csp-report'],
    ['falsche Form', { irgendwas: true }, 'application/csp-report'],
    ['falscher Typ', legacy({ 'blocked-uri': 'eval' }), 'application/json'],
    ['leer', '', 'application/csp-report'],
  ])('%s ⇒ 400 und keine Zeile', async (_name, body, type) => {
    await expect(send(body, type)).rejects.toMatchObject({ status: 400 })
    expect(logged).not.toHaveBeenCalled()
  })

  it('zwei gleiche Schlüssel entstehen nur aus denselben vier Wörtern', () => {
    const a = { directive: 'script-src', blocked: 'eval', source: '', area: '/' }
    expect(cspViolationKey(a)).toBe(cspViolationKey({ ...a }))
    expect(cspViolationKey(a)).not.toBe(cspViolationKey({ ...a, area: '/de' }))
  })
})
