import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { isAbsolute, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * BE-026 (2026-11-15): `scripts/bootstrap.mjs` gegen einen STELLVERTRETER
 * statt gegen Appwrite. Der Stellvertreter (`node:http`, zufälliger Port)
 * schreibt jede Anfrage mit; geprüft wird, dass die Wache VOR dem ersten
 * Schreibzugriff steht und nur ein positiver Befund „leer" weiterlässt.
 *
 * Gegen eine echte Instanz läuft hier NICHTS: alle Adressen zeigen auf
 * 127.0.0.1, und jede Anfrage außer der Tabellen-Liste bekommt 500.
 *
 * `BOOTSTRAP_SCRIPT` (relativ zur Repo-Wurzel oder absolut) tauscht das
 * Skript aus — damit lief derselbe Test vor dem Löschen gegen die alte
 * Kopie `apps/_template/scripts/bootstrap.ts` (Beleg „vorher rot"). Eine
 * `.ts`-Datei startet mit `--experimental-strip-types`.
 */
const REPO = join(__dirname, '..', '..', '..')
const override = process.env.BOOTSTRAP_SCRIPT
const SCRIPT = override
  ? (isAbsolute(override) ? override : join(REPO, override))
  : join(REPO, 'scripts', 'bootstrap.mjs')
const TIMEOUT = 30_000
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

type Scenario = { status: number, body: unknown }
type Logged = { method: string, url: string }

const SCENARIOS = {
  fresh: { status: 404, body: { code: 404, type: 'database_not_found', message: 'Database not found' } },
  freshEmpty: { status: 200, body: { total: 0, tables: [] } },
  populated: { status: 200, body: { total: 69, tables: [], rows: [] } },
  unauthorized: { status: 401, body: { code: 401, type: 'general_unauthorized_scope', message: 'missing scopes' } },
} satisfies Record<string, Scenario>

let server: Server | null = null

async function startStub(scenario: Scenario): Promise<{ endpoint: string, log: Logged[] }> {
  const log: Logged[] = []
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    req.resume()
    req.on('end', () => {
      const method = req.method ?? 'GET'
      const url = req.url ?? ''
      log.push({ method, url })
      const isTableRead = method === 'GET' && url.startsWith('/v1/tablesdb/main/tables')
      const { status, body } = isTableRead ? scenario : { status: 500, body: { code: 500, message: 'Stellvertreter: nicht vorgesehen' } }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Connection': 'close' })
      res.end(JSON.stringify(body))
    })
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { endpoint: `http://127.0.0.1:${port}/v1`, log }
}

/** Ein Port, auf dem sicher niemand lauscht: kurz belegen, wieder freigeben. */
async function deadEndpoint(): Promise<string> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return `http://127.0.0.1:${port}/v1`
}

function run(endpoint: string, args: string[]): Promise<{ code: number | null, out: string }> {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('NUXT_')) env[key] = value
  }
  Object.assign(env, {
    NUXT_PUBLIC_APPWRITE_ENDPOINT: endpoint,
    NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'stub-project',
    NUXT_PUBLIC_APPWRITE_DATABASE_ID: 'main',
    NUXT_APPWRITE_KEY: 'stub-key',
  })
  const nodeArgs = SCRIPT.endsWith('.ts') ? ['--experimental-strip-types', SCRIPT] : [SCRIPT]
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, ...args], { cwd: REPO, env })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT - 5_000)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

const writes = (log: Logged[]) => log.filter(entry => WRITE_METHODS.has(entry.method))

afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise<void>(resolve => server!.close(() => resolve()))
  server = null
})

describe(`Bootstrap-Skript gegen einen Stellvertreter (${override ?? 'scripts/bootstrap.mjs'})`, () => {
  it('Sicherung: kein apps/_template/.env, das die Migrationen auf eine echte Instanz lenken könnte', () => {
    expect(existsSync(join(REPO, 'apps', '_template', '.env'))).toBe(false)
  })

  it('befüllt ⇒ Exit ≠ 0 und keine einzige schreibende Anfrage', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.populated)
    const { code, out } = await run(endpoint, ['--app', '_template'])
    expect(code, out).not.toBe(0)
    expect(writes(log), out).toEqual([])
    expect(out).toContain('pnpm migrate --app _template')
  })

  it('401 ⇒ Exit ≠ 0 und keine schreibende Anfrage', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.unauthorized)
    const { code, out } = await run(endpoint, ['--app', '_template'])
    expect(code, out).not.toBe(0)
    expect(writes(log), out).toEqual([])
  })

  it('Server nicht erreichbar ⇒ Exit ≠ 0', { timeout: TIMEOUT }, async () => {
    const { code, out } = await run(await deadEndpoint(), ['--app', '_template'])
    expect(code, out).not.toBe(0)
  })

  it('frisch (404 database_not_found) + --check ⇒ Exit 0, nichts geschrieben', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.fresh)
    const { code, out } = await run(endpoint, ['--app', '_template', '--check'])
    expect(code, out).toBe(0)
    expect(writes(log), out).toEqual([])
    expect(log.some(entry => entry.method === 'GET' && entry.url === '/v1/tablesdb/main/tables'), out).toBe(true)
  })

  it('frisch (200, total 0) + --check ⇒ Exit 0, nichts geschrieben', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.freshEmpty)
    const { code, out } = await run(endpoint, ['--app', '_template', '--check'])
    expect(code, out).toBe(0)
    expect(writes(log), out).toEqual([])
  })

  it('befüllt + --force --check ⇒ Exit 0 mit Warnung, nichts geschrieben', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.populated)
    const { code, out } = await run(endpoint, ['--app', '_template', '--force', '--check'])
    expect(code, out).toBe(0)
    expect(out).toContain('--force')
    expect(out).toMatch(/ÜBERSPRUNGEN/)
    expect(writes(log), out).toEqual([])
  })

  it('ohne --app ⇒ Exit ≠ 0, keine Anfrage', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.fresh)
    const { code, out } = await run(endpoint, ['--check'])
    expect(code, out).not.toBe(0)
    expect(log, out).toEqual([])
  })

  it('--app ohne passenden Ordner ⇒ Exit ≠ 0, keine Anfrage', { timeout: TIMEOUT }, async () => {
    const { endpoint, log } = await startStub(SCENARIOS.fresh)
    const { code, out } = await run(endpoint, ['--app', 'gibt-es-nicht', '--check'])
    expect(code, out).not.toBe(0)
    expect(log, out).toEqual([])
  })
})
