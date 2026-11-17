import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { PAGES_TABLE } from '../shared/types/page'

/**
 * BE-019 (3) — Kontingent für Seiten.
 *
 * `PUT /api/pages` legt je slug+Sprache eine Zeile an, fragte aber kein
 * Kontingent: ein Skript mit Redaktionsrechten konnte im geteilten Pool
 * beliebig viele Zeilen anlegen. Jetzt fragt der Zweig, der eine NEUE Zeile
 * anlegt, `assertPoolWriteQuota` mit `kind: 'pages'` — VOR dem Anlegen. Das
 * Bearbeiten einer vorhandenen Fassung fragt nicht: wer am Limit steht, muss
 * sein Impressum trotzdem korrigieren können.
 *
 * Geprüft am echten Handler gegen die nachgebaute Datentür.
 */

/** Der Inhalt des ersten `{ … }`-Blocks hinter `opener` (Klammern gezählt). */
function blockAfter(source: string, opener: RegExp): string {
  const match = opener.exec(source)
  if (!match) throw new Error(`nicht gefunden: ${opener}`)
  const open = match.index + match[0].length - 1
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error(`nicht geschlossen: ${opener}`)
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const loadPut = () => import('../server/api/pages/index.put')

const existing = (): FakeRow => ({
  $id: 'pg-1', communityId: 'c-a', slug: 'imprint', locale: 'de', title: 'Impressum', body: 'alt', status: 'published', sortOrder: 90,
})

function quotaProbe(door: ReturnType<typeof fakeDoor>, verdict?: { status: number, statusText: string, data: { code: string } }) {
  const seen: Array<{ kind: string, tableId: string, doorCallsBefore: string[] }> = []
  const assertPoolWriteQuota = vi.fn(async (_event: unknown, options: { kind: string, tableId: string }) => {
    seen.push({ ...options, doorCallsBefore: door.calls.map(c => c.method) })
    if (verdict) throw verdict
  })
  return { seen, assertPoolWriteQuota }
}

const globals = (assertPoolWriteQuota: unknown) => ({
  requireCommunityPermission: async () => ({ actor: 'member' }),
  forgetPublicPages: () => {},
  assertPoolWriteQuota,
})

describe('PUT /api/pages — Kontingent nur beim Anlegen', () => {
  it('neue Fassung: fragt das Kontingent mit kind pages VOR dem Anlegen', async () => {
    const door = fakeDoor({ rows: { [PAGES_TABLE]: [existing()] } })
    const { seen, assertPoolWriteQuota } = quotaProbe(door)
    const run = await runDoorRoute(loadPut, {
      door,
      body: { slug: 'imprint', locale: 'en', title: 'Imprint', body: 'x', status: 'draft' },
      globals: globals(assertPoolWriteQuota),
    })

    expect(run.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.kind).toBe('pages')
    expect(seen[0]!.tableId).toBe(PAGES_TABLE)
    expect(seen[0]!.doorCallsBefore).not.toContain('create')
    expect(door.calls.map(c => c.method)).toContain('create')
  })

  it.each([
    ['quota_reached', 'Quota exceeded'],
    ['quota_reached_today', 'Daily quota exceeded'],
  ])('ein 429 (%s) verhindert das Anlegen und reist unverändert hinaus', async (code, statusText) => {
    const door = fakeDoor({ rows: { [PAGES_TABLE]: [] } })
    const { assertPoolWriteQuota } = quotaProbe(door, { status: 429, statusText, data: { code } })
    const run = await runDoorRoute(loadPut, {
      door,
      body: { slug: 'about', locale: 'en', title: 'About', body: 'x', status: 'published' },
      globals: globals(assertPoolWriteQuota),
    })

    expect(run.status).toBe(429)
    expect(run.error?.data?.code).toBe(code)
    expect(door.calls.map(c => c.method)).not.toContain('create')
    expect(door.rows[PAGES_TABLE]).toEqual([])
  })

  it('vorhandene Fassung bearbeiten: kein Kontingent, auch wenn es voll wäre', async () => {
    const door = fakeDoor({ rows: { [PAGES_TABLE]: [existing()] } })
    const { seen, assertPoolWriteQuota } = quotaProbe(door, { status: 429, statusText: 'Quota exceeded', data: { code: 'quota_reached' } })
    const run = await runDoorRoute(loadPut, {
      door,
      body: { slug: 'imprint', locale: 'de', title: 'Impressum', body: 'neu', status: 'published' },
      globals: globals(assertPoolWriteQuota),
    })

    expect(run.status).toBe(200)
    expect(seen).toEqual([])
    expect(door.calls.map(c => c.method)).toEqual(['find', 'update'])
    expect(door.rows[PAGES_TABLE]![0]!.body).toBe('neu')
  })
})

describe('der Katalog nennt Zahlen für pages', () => {
  // „Wer einen neuen Haken setzt, setzt die Zahlen mit" (core/server/utils/
  // tenantQuota.ts): ohne Zeile im Katalog ist der Haken ein stilles No-op.
  it('alle drei Pläne der Platform-App tragen pages: 50 am Tag, 300 gesamt', () => {
    // Als TEXT gelesen: ein Layer-Test importiert nichts aus apps/ (in der CI
    // fehlt dort .nuxt/ — Wächter core/tests/layerTestsNoAppImports.test.ts).
    const source = readFileSync(fileURLToPath(new URL('../../../apps/platform/app/app.config.ts', import.meta.url)), 'utf8')
    const plans = blockAfter(blockAfter(source, /\bquota:\s*\{/), /\bplans:\s*\{/)
    const planKeys = ['basic', 'personal', 'pro']
    for (const plan of planKeys) {
      const block = blockAfter(plans, new RegExp(`\\b${plan}:\\s*\\{`))
      expect(block.replace(/\/\/.*$/gm, ''), plan).toMatch(/\bpages:\s*\{\s*perDay:\s*50,\s*total:\s*300\s*\}/)
    }
    // basic ist der Rückfall für unbekannte Pläne (erster Katalog-Key).
    expect(plans.search(/\bbasic:/)).toBeLessThan(plans.search(/\bpersonal:/))
  })

  it('der Verbrauchs-Posten nutzt dieselbe Art und Tabelle wie die Bremse', () => {
    const plugin = readFileSync(fileURLToPath(new URL('../server/plugins/community-usage.ts', import.meta.url)), 'utf8')
    expect(plugin).toContain('registerCommunityUsageCounter({ kind: \'pages\', tableId: PAGES_TABLE })')
    const route = readFileSync(fileURLToPath(new URL('../server/api/pages/index.put.ts', import.meta.url)), 'utf8')
    expect(route).toContain('assertPoolWriteQuota(event, { kind: \'pages\', tableId: PAGES_TABLE })')
  })
})
