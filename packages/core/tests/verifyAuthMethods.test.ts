import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_ENDPOINT, PROBE_BODY, PROJECTS, classifyAuthProbe } from '../../../scripts/ops/verify-auth-methods.mjs'

/**
 * TÄGLICHER BLICK „Anmelde-Wege der Datenbank von außen zu?" (SV1 b,
 * 2026-11-17).
 *
 * Die sechs Schalter sind eine Einstellung in der Verwaltung, kein Code. Der
 * Blick fragt je Projekt einmal von außen und wird rot, wenn ein Weg wieder
 * offen ist. Geprüft wird hier:
 *  1. die Deutung (501 zu, 401 offen, Störung = keine Aussage, alles andere
 *     = die Probe ist veraltet),
 *  2. der ganze Lauf gegen einen Stellvertreter der Datenbank — MIT
 *     Gegenprobe: ein offenes Projekt macht den Lauf rot und schreibt den
 *     Satz fürs Issue,
 *  3. dass die Probe nichts mitschickt, was ein Geheimnis ist, und dass die
 *     Projekt-Liste zu den ausgerollten Apps passt.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(REPO, 'scripts', 'ops', 'verify-auth-methods.mjs')

describe('classifyAuthProbe', () => {
  it.each([
    [501, 'user_auth_method_unsupported', 'closed'],
    [401, 'user_invalid_credentials', 'open'],
    [401, '', 'open'],
    [429, 'general_rate_limit_exceeded', 'inconclusive'],
    [500, '', 'inconclusive'],
    [502, '', 'inconclusive'],
    [0, '', 'inconclusive'],
    // Eine Probe, die nicht mehr prüft, was sie soll, darf nicht grün bleiben.
    [501, 'general_not_implemented', 'unexpected'],
    [404, 'project_not_found', 'unexpected'],
    [400, 'general_argument_invalid', 'unexpected'],
    [201, '', 'unexpected'],
    [403, 'general_unknown_origin', 'unexpected'],
  ])('Status %s, Kennung „%s" ⇒ %s', (status, type, expected) => {
    expect(classifyAuthProbe(status, type)).toBe(expected)
  })
})

describe('die Probe selbst', () => {
  it('nennt eine reservierte Probe-Adresse und kein Geheimnis', () => {
    expect(PROBE_BODY.email).toMatch(/@example\.test$/)
    expect(PROBE_BODY.password).toMatch(/^x+$/)
    const source = readFileSync(SCRIPT, 'utf8')
    expect(source).not.toMatch(/x-appwrite-key|APPWRITE_KEY|NUXT_APPWRITE|secrets\./i)
    expect(DEFAULT_ENDPOINT).toBe('https://api.pukalani.app/v1')
  })

  it('prüft genau die Projekte der ausgerollten Apps', async () => {
    const projects = new Set<string>()
    for (const app of ['platform', 'control', 'portfolio', 'branding']) {
      const manifest = (await import(`../../../apps/${app}/site.manifest.ts`)).default as { appwriteProjects: string[] }
      for (const project of manifest.appwriteProjects) projects.add(project)
    }
    expect([...PROJECTS].sort()).toEqual([...projects].sort())
  })

  it('der tägliche Wächter ruft das Skript ohne Secret, auch wenn ein Blick davor rot war', () => {
    const workflow = readFileSync(join(REPO, '.github', 'workflows', 'production-watch.yml'), 'utf8')
    const step = workflow.slice(workflow.indexOf('- name: Anmelde-Wege der Datenbank von außen zu?'))
    const body = step.slice(0, step.indexOf('\n      - name:', 10))
    expect(body).toContain('run: node scripts/ops/verify-auth-methods.mjs')
    expect(body).toContain('if: always()')
    expect(body).toContain('PUKALANI_FINDINGS_FILE')
    expect(body).not.toContain('secrets.')
  })
})

describe('der ganze Lauf gegen einen Stellvertreter der Datenbank', () => {
  let server: Server
  let endpoint: string
  let dir: string
  const seen: { project: string, key: string | undefined, body: string }[] = []
  /** Was der Stellvertreter je Projekt antwortet. */
  let answers: Record<string, { status: number, type?: string }>

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'verify-auth-methods-'))
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', chunk => chunks.push(chunk as Buffer))
      req.on('end', () => {
        const project = String(req.headers['x-appwrite-project'])
        seen.push({ project, key: req.headers['x-appwrite-key'] as string | undefined, body: Buffer.concat(chunks).toString('utf8') })
        const answer = req.method === 'POST' && req.url === '/v1/account/sessions/email' ? answers[project] : undefined
        res.writeHead(answer?.status ?? 404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: 'GEHEIM-MARKER in der Meldung', type: answer?.type ?? 'general_route_not_found' }))
      })
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    rmSync(dir, { recursive: true, force: true })
  })

  function run(findings: string, ...args: string[]) {
    return new Promise<{ code: number | null, out: string }>((done) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], {
        env: { ...process.env, PUKALANI_AUTH_PROBE_ENDPOINT: endpoint, PUKALANI_AUTH_PROBE_RETRY_MS: '10', PUKALANI_FINDINGS_FILE: join(dir, findings) },
      })
      let out = ''
      child.stdout.on('data', chunk => (out += String(chunk)))
      child.stderr.on('data', chunk => (out += String(chunk)))
      child.on('close', code => done({ code, out }))
    })
  }

  const closed = { status: 501, type: 'user_auth_method_unsupported' }

  it('alle vier zu ⇒ grün, je Projekt ein Aufruf ohne Schlüssel', async () => {
    seen.length = 0
    answers = { account: closed, admin: closed, portfolio: closed, branding: closed }
    const { code, out } = await run('gruen.txt')
    expect(code).toBe(0)
    expect(out).toContain('✔ Nichts Rotes.')
    expect(seen.map(call => call.project)).toEqual(PROJECTS)
    expect(seen.every(call => call.key === undefined)).toBe(true)
    expect(seen.every(call => call.body === JSON.stringify(PROBE_BODY))).toBe(true)
  })

  it('GEGENPROBE: ein Projekt wieder offen ⇒ rot, und der Satz fürs Issue nennt Projekt und Handgriff', async () => {
    answers = { account: closed, admin: { status: 401, type: 'user_invalid_credentials' }, portfolio: closed, branding: closed }
    const { code, out } = await run('rot.txt')
    expect(code).toBe(1)
    expect(out).toContain('✗ admin')
    expect(out).toContain('OFFEN (401)')
    const findings = readFileSync(join(dir, 'rot.txt'), 'utf8').trim().split('\n')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatch(/^Anmelde-Wege: Projekt admin: .*wieder offen\. Zu tun: .*ANMELDE-REGELN\.md/)
    // Nie eine Meldung der Datenbank im Protokoll oder im Issue.
    expect(out).not.toContain('GEHEIM-MARKER')
    expect(findings[0]).not.toContain('GEHEIM-MARKER')
  })

  it('Störung (5xx, 429) ⇒ zweiter Versuch, dann „keine Aussage" und NICHT rot', async () => {
    seen.length = 0
    answers = { account: { status: 502 }, admin: { status: 429, type: 'general_rate_limit_exceeded' }, portfolio: closed, branding: closed }
    const { code, out } = await run('stoerung.txt')
    expect(code).toBe(0)
    expect(out.match(/keine Aussage/g)).toHaveLength(2)
    expect(seen.filter(call => call.project === 'account')).toHaveLength(2)
  })

  it('unbekanntes Projekt oder geänderte Schnittstelle ⇒ rot (die Probe prüft nicht mehr, was sie soll)', async () => {
    answers = { account: closed, admin: closed, portfolio: { status: 404, type: 'project_not_found' }, branding: closed }
    const { code, out } = await run('veraltet.txt')
    expect(code).toBe(1)
    expect(out).toContain('unerwartete Antwort (Status 404, project_not_found)')
  })

  it('ein einzelnes Projekt lässt sich von Hand prüfen; ein unbekanntes ist ein Aufruf-Fehler', async () => {
    seen.length = 0
    answers = { branding: closed }
    expect((await run('einzeln.txt', 'branding')).code).toBe(0)
    expect(seen.map(call => call.project)).toEqual(['branding'])
    expect((await run('falsch.txt', 'gibt-es-nicht')).code).toBe(2)
  })
})
