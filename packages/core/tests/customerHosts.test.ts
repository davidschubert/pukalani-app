import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  customerLabel,
  customerMode,
  customerStatusLine,
  DEFAULT_URL,
  MAX_HOSTS,
  namesAllowed,
  numbersText,
  parseNumbers,
  parseWatchHosts,
  planCustomerChecks,
  readCustomerHosts,
  safeErrorCode,
  SECRET_HEADER,
  UNREAD_TEXT,
  watchHostsUrl,
} from '../../../scripts/ops/customer-hosts.mjs'
import { composeCustomerMail, recipients, runCustomerMail } from '../../../scripts/ops/customer-hosts-mail.mjs'
import { judgeCert } from '../../../scripts/ops/verify-tls.mjs'

/**
 * WA1 d (2026-11-18): die Wächter lesen die Kundendomains ZUSÄTZLICH zur
 * festen Liste aus dem Control Plane. Vier Zusagen, je mit Gegenprobe:
 *  1. ohne Geheimnis oder ohne Antwort ändert sich nichts (eine Zeile, grün);
 *  2. ein Host-Name eines Kunden steht in keiner Ausgabe;
 *  3. erst zählen (`count`), dann Alarm (`alarm`);
 *  4. das Geheimnis reist nur verschlüsselt (oder auf dem eigenen Rechner).
 */
const REPO = join(__dirname, '..', '..', '..')
// Ein erfundener Wert in der Länge eines echten — kein Geheimnis.
const PROBE = 'c3'.repeat(32)
const LIST = [
  { host: 'alpha.example', health: true },
  { host: 'forum.kunde-geheim.example', health: true },
  { host: 'www.alpha.example', health: false },
]

function answer(status: number, body: unknown = {}) {
  return { status, json: async () => body } as unknown as Response
}

function fetchSequence(...steps: Array<Response | Error>) {
  const calls: Array<{ url: string, init: RequestInit }> = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]
    if (step instanceof Error) throw step
    return step
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

describe('watchHostsUrl — wohin das Geheimnis reisen darf', () => {
  it('ohne Angabe die Adresse der Betreiber-App', () => {
    expect(watchHostsUrl({})).toBe(DEFAULT_URL)
    expect(DEFAULT_URL.startsWith('https://')).toBe(true)
  })

  it.each([
    'https://staging.example/api/control/watch/hosts',
    'http://localhost:3404/api/control/watch/hosts',
    'http://127.0.0.1:3404/api/control/watch/hosts',
    'http://[::1]:3404/api/control/watch/hosts',
  ])('erlaubt: %s', (url) => {
    expect(watchHostsUrl({ PUKALANI_WATCH_HOSTS_URL: url })).toBe(url)
  })

  it.each([
    ['unverschlüsselt an einen fremden Host', 'http://staging.example/api/control/watch/hosts'],
    ['ein Name, der nur wie der eigene Rechner beginnt', 'http://localhost.example/x'],
    ['kein Web-Schema', 'file:///etc/hosts'],
    ['keine Adresse', 'nicht eine adresse'],
  ])('nicht erlaubt: %s', (_label, url) => {
    expect(watchHostsUrl({ PUKALANI_WATCH_HOSTS_URL: url })).toBeNull()
  })
})

describe('parseWatchHosts — die feste Form der Antwort', () => {
  it('nimmt genau Host und Ja/Nein, weitere Felder reisen nicht mit', () => {
    expect(parseWatchHosts({ hosts: [{ host: 'alpha.example', health: true, name: 'Geheim', id: 'c-1' }] })).toEqual([{ host: 'alpha.example', health: true }])
    expect(parseWatchHosts({ hosts: [] })).toEqual([])
  })

  it.each([
    ['keine Liste', { hosts: 'alpha.example' }],
    ['kein Objekt', null],
    ['ein Eintrag ohne Ja/Nein', { hosts: [{ host: 'alpha.example' }] }],
    ['ein Eintrag mit Großbuchstaben', { hosts: [{ host: 'Alpha.example', health: true }] }],
    ['ein Eintrag mit Pfad', { hosts: [{ host: 'alpha.example/x', health: true }] }],
    ['ein Eintrag mit Zeilenumbruch', { hosts: [{ host: 'alpha.example\n::error::x', health: true }] }],
    ['ein Doppel', { hosts: [{ host: 'alpha.example', health: true }, { host: 'alpha.example', health: false }] }],
    ['ein guter und ein kaputter Eintrag — die ganze Liste fällt', { hosts: [{ host: 'alpha.example', health: true }, { host: 'x', health: true }] }],
    ['mehr als der Deckel', { hosts: Array.from({ length: MAX_HOSTS + 1 }, (_, i) => ({ host: `k${i}.example`, health: true })) }],
  ])('verwirft: %s', (_label, body) => {
    expect(parseWatchHosts(body)).toBeNull()
  })

  it('die Form ist dieselbe wie auf der Seite der Route', () => {
    const form = (path: string) => /const HOST_FORM = (\/.+\/)\n/.exec(readFileSync(join(REPO, path), 'utf8'))?.[1]
    expect(form('scripts/ops/customer-hosts.mjs')).toBeTruthy()
    expect(form('scripts/ops/customer-hosts.mjs')).toBe(form('packages/control/shared/watchHosts.ts'))
  })
})

describe('readCustomerHosts — lesen, ohne je rot zu werden', () => {
  const env = { PUKALANI_WATCH_HOSTS_SECRET: PROBE }

  it('ohne Geheimnis: „nicht gelesen", und es geht KEIN Aufruf hinaus', async () => {
    const { fetchFn, calls } = fetchSequence(answer(200, { hosts: LIST }))
    expect(await readCustomerHosts({ env: {}, fetchFn })).toEqual({ state: 'unread', reason: 'kein-geheimnis' })
    expect(await readCustomerHosts({ env: { PUKALANI_WATCH_HOSTS_SECRET: '  ' }, fetchFn })).toEqual({ state: 'unread', reason: 'kein-geheimnis' })
    expect(calls).toEqual([])
  })

  it('eine nicht erlaubte Adresse: „nicht gelesen", kein Aufruf', async () => {
    const { fetchFn, calls } = fetchSequence(answer(200, { hosts: LIST }))
    expect(await readCustomerHosts({ env: { ...env, PUKALANI_WATCH_HOSTS_URL: 'http://fremd.example/x' }, fetchFn })).toEqual({ state: 'unread', reason: 'adresse' })
    expect(calls).toEqual([])
  })

  it('liest die Liste, schickt das Geheimnis als Kopfzeile und folgt keiner Umleitung', async () => {
    const { fetchFn, calls } = fetchSequence(answer(200, { hosts: LIST }))
    expect(await readCustomerHosts({ env, fetchFn })).toEqual({ state: 'read', hosts: LIST })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(DEFAULT_URL)
    expect((calls[0]!.init.headers as Record<string, string>)[SECRET_HEADER]).toBe(PROBE)
    expect(calls[0]!.init.redirect).toBe('error')
  })

  it.each([
    ['401', answer(401), 'abgelehnt', 1],
    ['404 (kein Geheimnis auf der Site)', answer(404), 'route-fehlt', 1],
    ['eine Antwort, die kein JSON ist', { status: 200, json: async () => { throw new Error('kein JSON') } } as unknown as Response, 'form', 1],
    ['eine Antwort außerhalb der Form', answer(200, { hosts: [{ host: 'x' }] }), 'form', 1],
    ['ein Fehler der Gegenseite — nach genau einem zweiten Versuch', answer(503), 'fehler', 2],
    ['nicht erreichbar — nach genau einem zweiten Versuch', new Error('getaddrinfo ENOTFOUND admin.pukalani.app'), 'nicht-erreichbar', 2],
  ])('%s ⇒ „nicht gelesen"', async (_label, step, reason, expectedCalls) => {
    const { fetchFn, calls } = fetchSequence(step)
    expect(await readCustomerHosts({ env, fetchFn, retryDelayMs: 1 })).toEqual({ state: 'unread', reason })
    expect(calls).toHaveLength(expectedCalls)
    expect(UNREAD_TEXT[reason as keyof typeof UNREAD_TEXT]).toBeTruthy()
  })

  it('ein Aussetzer ist kein Befund: erst ein Fehler, dann die Liste', async () => {
    const { fetchFn, calls } = fetchSequence(new Error('ECONNRESET'), answer(200, { hosts: LIST }))
    expect(await readCustomerHosts({ env, fetchFn, retryDelayMs: 1 })).toEqual({ state: 'read', hosts: LIST })
    expect(calls).toHaveLength(2)
  })
})

describe('planCustomerChecks — was dieser Lauf prüft', () => {
  const fixedHosts = ['alpha.example', 'pukalani.app']

  it('count: alle Hosts der Route, mit ihrer Stelle in der Liste', () => {
    const plan = planCustomerChecks({ hosts: LIST, fixedHosts, mode: 'count' })
    expect(plan.map(entry => [entry.nr, entry.of, entry.host, entry.inFixed])).toEqual([
      [1, 3, 'alpha.example', true],
      [2, 3, 'forum.kunde-geheim.example', false],
      [3, 3, 'www.alpha.example', false],
    ])
  })

  it('alarm: nur was die feste Liste nicht kennt — die Nummern bleiben die der Route', () => {
    const plan = planCustomerChecks({ hosts: LIST, fixedHosts, mode: 'alarm' })
    expect(plan.map(entry => [entry.nr, entry.host])).toEqual([[2, 'forum.kunde-geheim.example'], [3, 'www.alpha.example']])
  })

  it('Probealarm: der erste Host gilt als kaputt, auch wenn die feste Liste ihn kennt — genau einmal', () => {
    const plan = planCustomerChecks({ hosts: LIST, fixedHosts, mode: 'alarm', drill: true })
    expect(plan.map(entry => [entry.nr, entry.drill])).toEqual([[1, true], [2, false], [3, false]])
    expect(planCustomerChecks({ hosts: LIST, fixedHosts, mode: 'count', drill: true }).filter(entry => entry.nr === 1)).toHaveLength(1)
    expect(planCustomerChecks({ hosts: [], fixedHosts, mode: 'alarm', drill: true })).toEqual([])
  })

  it('der Modus ist `count`, solange nicht ausdrücklich `alarm` gesetzt ist', () => {
    expect(customerMode({})).toBe('count')
    expect(customerMode({ PUKALANI_CUSTOMER_HOSTS_MODE: 'Alarm' })).toBe('count')
    expect(customerMode({ PUKALANI_CUSTOMER_HOSTS_MODE: 'alarm' })).toBe('alarm')
  })
})

describe('kein Host-Name eines Kunden in einer Ausgabe', () => {
  const entry = planCustomerChecks({ hosts: LIST, fixedHosts: [], mode: 'count' })[1]!

  it('die Bezeichnung ist die Nummer — den Namen gibt es nur von Hand', () => {
    expect(customerLabel(entry)).toBe('Kundendomain 2/3')
    expect(customerLabel(entry, { names: true })).toBe('forum.kunde-geheim.example (Kundendomain 2/3)')
  })

  it('`--namen` wirkt nur außerhalb eines CI-Laufs', () => {
    expect(namesAllowed({ argv: ['node', 'x', '--namen'], env: {} })).toBe(true)
    expect(namesAllowed({ argv: ['node', 'x'], env: {} })).toBe(false)
    expect(namesAllowed({ argv: ['node', 'x', '--namen'], env: { GITHUB_ACTIONS: 'true' } })).toBe(false)
    expect(namesAllowed({ argv: ['node', 'x', '--namen'], env: { CI: 'true' } })).toBe(false)
  })

  it('von einem Fehler bleibt nur das Kürzel', () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND forum.kunde-geheim.example'), { code: 'ENOTFOUND' })
    expect(safeErrorCode(error)).toBe('ENOTFOUND')
    expect(safeErrorCode(new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) }))).toBe('ECONNRESET')
    expect(safeErrorCode({ code: 'forum.kunde-geheim.example' })).toBe('Fehler')
    expect(safeErrorCode(undefined)).toBe('Fehler')
  })

  it('die kurze Fassung eines Zertifikats-Urteils nennt weder SAN-Einträge noch den Fehlertext', () => {
    const now = Date.parse('2026-11-18T00:00:00Z')
    const cert = (san: string, validTo: string) => ({ subject: { CN: 'x' }, subjectaltname: san, valid_to: validTo })
    const host = 'forum.kunde-geheim.example'
    const verdicts = [
      judgeCert({ cert: cert(`DNS:${host}`, 'Mar 1 00:00:00 2027 GMT') }, host, now),
      judgeCert({ cert: cert(`DNS:${host}`, 'Nov 20 00:00:00 2026 GMT') }, host, now),
      judgeCert({ cert: cert('DNS:*.pukalani.app, DNS:anderer-kunde.example', 'Mar 1 00:00:00 2027 GMT') }, host, now),
      judgeCert({ error: `Hostname/IP does not match: ${host}`, code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, host, now),
    ]
    expect(verdicts.map(verdict => verdict.ok)).toEqual([true, false, false, false])
    expect(verdicts.map(verdict => verdict.short)).toEqual([
      'gültig (103 Tage)',
      'läuft in 2 Tagen ab',
      'das ausgelieferte Zertifikat deckt den Host nicht ab',
      'kein Zertifikat (ERR_TLS_CERT_ALTNAME_INVALID)',
    ])
    for (const verdict of verdicts) expect(verdict.short).not.toMatch(/kunde|example/)
    // Gegenprobe: die lange Fassung (für die feste Liste) nennt die SAN-Einträge.
    expect(verdicts[2]!.text).toContain('anderer-kunde.example')
  })

  it('die Status-Zeile nennt Zahlen, keine Namen', () => {
    const read = { state: 'read' as const, hosts: LIST }
    const count = customerStatusLine(read, planCustomerChecks({ hosts: LIST, fixedHosts: ['alpha.example'], mode: 'count' }), 'count')
    const alarm = customerStatusLine(read, planCustomerChecks({ hosts: LIST, fixedHosts: ['alpha.example'], mode: 'alarm' }), 'alarm')
    expect(count).toBe('Kundendomains: 3 aus dem Control Plane gelesen, 3 werden hier geprüft, Befunde nur gezählt.')
    expect(alarm).toBe('Kundendomains: 3 aus dem Control Plane gelesen, 2 davon stehen nicht in der festen Liste und werden hier geprüft.')
    expect(customerStatusLine({ state: 'unread', reason: 'kein-geheimnis' }, [], 'count')).toBe('Kundendomains: nicht gelesen — in diesem Lauf ist kein Geheimnis gesetzt. Geprüft wird die feste Liste.')
  })

  it('die Nummern reisen als Ziffern und Kommas — nichts anderes kommt zurück', () => {
    expect(numbersText([{ nr: 5 }, { nr: 2 }, { nr: 5 }])).toBe('2,5')
    expect(parseNumbers('2,5')).toEqual([2, 5])
    expect(parseNumbers(' 3 ')).toEqual([3])
    for (const junk of ['', '2;5', '2, 5', '$(id)', 'alpha.example', '2,', undefined]) expect(parseNumbers(junk)).toEqual([])
  })

  it('in den zwei Wächter-Skripten steht der Name einer Kundendomain in keiner Ausgabe-Zeile', () => {
    for (const file of ['verify-tls.mjs', 'verify-health.mjs']) {
      const source = readFileSync(join(REPO, 'scripts', 'ops', file), 'utf8')
      const output = source.split('\n').filter(line => /console\.(log|error|warn)|appendFileSync\(|failures\.push\(/.test(line))
      expect(output.length).toBeGreaterThan(10)
      for (const line of output) expect(line, `${file}: ${line.trim()}`).not.toMatch(/\b(entry|ziel)\.host\b/)
    }
  })
})

describe('customer-hosts-mail.mjs — die private Mail mit den Namen', () => {
  it('nennt je Nummer den Namen; eine Nummer außerhalb der Liste steht als eigene Zeile da', () => {
    const mail = composeCustomerMail({ hosts: LIST, numbers: [2, 7], runUrl: 'https://github.example/run/1' })
    expect(mail.subject).toBe('🔴 Produktions-Alarm: betroffene Kundendomains')
    expect(mail.text).toContain('- forum.kunde-geheim.example (Kundendomain 2/3)')
    expect(mail.text).toContain('- Kundendomain 7: steht nicht mehr an dieser Stelle der Liste')
    expect(mail.text).toContain('Lauf: https://github.example/run/1')
    expect(mail.text).not.toContain('alpha.example')
  })

  it('die Empfänger dürfen eine Kommaliste sein', () => {
    expect(recipients(' a@example.test , b@example.test,, ')).toEqual(['a@example.test', 'b@example.test'])
    expect(recipients(undefined)).toEqual([])
  })

  const base = { PUKALANI_WATCH_HOSTS_SECRET: PROBE, PUKALANI_CUSTOMER_NUMBERS: '2', RESEND_API_KEY: 're_probe', ALARM_MAIL_TO: 'alarm@example.test', RUN_URL: 'https://github.example/run/1' }

  async function run(env: Record<string, string>, ...steps: Array<Response | Error>) {
    const { fetchFn, calls } = fetchSequence(...steps)
    const lines: string[] = []
    const code = await runCustomerMail({ env, fetchFn, log: line => lines.push(line), retryDelayMs: 1 })
    return { code, calls, out: lines.join('\n') }
  }

  it('schickt genau eine Mail mit dem Namen — und gibt selbst nur eine Zahl aus', async () => {
    const { code, calls, out } = await run(base, answer(200, { hosts: LIST }), answer(200, { id: 'x' }))
    expect(code).toBe(0)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toBe('https://api.resend.com/emails')
    const sent = JSON.parse(String(calls[1]!.init.body)) as { to: string[], subject: string, text: string }
    expect(sent.to).toEqual(['alarm@example.test'])
    expect(sent.text).toContain('forum.kunde-geheim.example (Kundendomain 2/3)')
    expect(out).toBe('Mail mit den Namen gesendet (1 Kundendomain).')
    expect(out).not.toMatch(/kunde-geheim|alarm@|re_probe/)
  })

  it('dieselbe Nummer aus zwei Blicken (Zertifikat und Erreichbarkeit) steht einmal in der Mail', async () => {
    const { code, calls, out } = await run({ ...base, PUKALANI_CUSTOMER_NUMBERS: '2,1,2' }, answer(200, { hosts: LIST }), answer(200, { id: 'x' }))
    expect(code).toBe(0)
    const sent = JSON.parse(String(calls[1]!.init.body)) as { text: string }
    expect(sent.text.match(/Kundendomain 2\/3/g)).toHaveLength(1)
    expect(sent.text.indexOf('Kundendomain 1/3')).toBeLessThan(sent.text.indexOf('Kundendomain 2/3'))
    expect(out).toBe('Mail mit den Namen gesendet (2 Kundendomains).')
  })

  it.each([
    ['keine Nummern', { PUKALANI_CUSTOMER_NUMBERS: '' }],
    ['Nummern, die keine sind', { PUKALANI_CUSTOMER_NUMBERS: 'forum.kunde-geheim.example' }],
    ['kein Resend-Schlüssel', { RESEND_API_KEY: '' }],
    ['kein Empfänger', { ALARM_MAIL_TO: ' ' }],
  ])('%s ⇒ nichts geht hinaus, Exit 0', async (_label, change) => {
    const { code, calls } = await run({ ...base, ...change }, answer(200, { hosts: LIST }))
    expect(code).toBe(0)
    expect(calls).toEqual([])
  })

  it('Liste nicht lesbar ⇒ keine Mail, Exit 1, ein Satz ohne Namen', async () => {
    const { code, calls, out } = await run(base, answer(404))
    expect(code).toBe(1)
    expect(calls).toHaveLength(1)
    expect(out).toContain('Mail NICHT raus')
  })

  it('Resend lehnt ab ⇒ Exit 1, die Antwort wird nicht zitiert', async () => {
    const { code, out } = await run(base, answer(200, { hosts: LIST }), answer(422, { message: 'Invalid `to` field: alarm@example.test' }))
    expect(code).toBe(1)
    expect(out).toBe('Resend antwortet HTTP 422 — Mail mit den Namen NICHT raus.')
  })
})

describe('die Wächter-Skripte ohne Geheimnis und ohne Antwort (kein Aufruf nach außen)', () => {
  let server: Server | undefined

  afterEach(async () => {
    server?.closeAllConnections()
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
    server = undefined
  })

  async function listServer(status: number, body: string): Promise<string> {
    server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(body)
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/control/watch/hosts`
  }

  // Nicht `spawnSync`: der Listen-Server dieses Tests muss währenddessen antworten.
  function run(script: string, env: Record<string, string>): Promise<{ code: number | null, out: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [join(REPO, 'scripts', 'ops', script), '--nur-kundendomains'], {
        env: { PATH: process.env.PATH ?? '', ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      child.stdout.on('data', chunk => (out += String(chunk)))
      child.stderr.on('data', chunk => (out += String(chunk)))
      child.on('close', code => resolve({ code, out }))
    })
  }

  it.each(['verify-tls.mjs', 'verify-health.mjs'])('%s ohne Geheimnis: eine Zeile, Exit 0', async (script) => {
    const { code, out } = await run(script, {})
    expect(code).toBe(0)
    expect(out).toContain('Kundendomains: nicht gelesen — in diesem Lauf ist kein Geheimnis gesetzt. Geprüft wird die feste Liste.')
    expect(out).toContain('✔ Kein roter Befund an einer Kundendomain.')
  })

  it.each([
    ['die Route gibt es nicht (404)', 404, '{}', UNREAD_TEXT['route-fehlt']],
    ['das Geheimnis wird abgelehnt (401)', 401, '{}', UNREAD_TEXT.abgelehnt],
    ['die Antwort hat nicht die feste Form', 200, '{"hosts":[{"host":"KUNDE-GEHEIM.example","health":true}]}', UNREAD_TEXT.form],
  ])('mit Geheimnis, aber %s: eine Zeile, Exit 0 — auch im Modus alarm', async (_label, status, body, text) => {
    const url = await listServer(status, body)
    for (const script of ['verify-tls.mjs', 'verify-health.mjs']) {
      const { code, out } = await run(script, { PUKALANI_WATCH_HOSTS_SECRET: PROBE, PUKALANI_WATCH_HOSTS_URL: url, PUKALANI_CUSTOMER_HOSTS_MODE: 'alarm' })
      expect(code, out).toBe(0)
      expect(out).toContain(`Kundendomains: nicht gelesen — ${text}. Geprüft wird die feste Liste.`)
      expect(out).not.toContain('KUNDE-GEHEIM')
    }
  })

  it('eine leere Liste: gelesen, nichts zu prüfen, Exit 0', async () => {
    const url = await listServer(200, '{"hosts":[]}')
    const { code, out } = await run('verify-tls.mjs', { PUKALANI_WATCH_HOSTS_SECRET: PROBE, PUKALANI_WATCH_HOSTS_URL: url })
    expect(code).toBe(0)
    expect(out).toContain('Kundendomains: 0 aus dem Control Plane gelesen')
  })
})
