import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import * as core from '../../core/server/utils/aiKillSwitch'

/**
 * DER BRAND-ABSCHALTER HÄNGT AM CORE-RIEGEL (P17, BE-006).
 *
 * `app_config.brandAiEnabled` war bis hierher eine Frage, die jede Route
 * SELBST stellen musste — zwei Check-Wege vergassen sie. Das Plugin meldet
 * den Schalter beim Core an; ab dann fragt jeder der fünf Transporte ihn vor
 * dem Senden, auch für Konsumenten, die von brand nichts wissen.
 */

let brandAiEnabled: unknown
let readFails: boolean

const tablesDB = {
  getRow: vi.fn(async () => {
    if (readFails) throw new Error('db down')
    return { $id: 'global', brandAiEnabled }
  }),
}

vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

vi.stubGlobal('registerAiKillSwitch', core.registerAiKillSwitch)
const plugin = (await import('../server/plugins/ai-kill-switch')).default as unknown as () => void

function newEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

beforeEach(() => {
  core.clearAiKillSwitches()
  brandAiEnabled = true
  readFails = false
  tablesDB.getRow.mockClear()
})

describe('server/plugins/ai-kill-switch.ts', () => {
  it('meldet `readBrandAiEnabled` unter dem Namen `brand` an (Quelltext)', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '..', 'server', 'plugins', 'ai-kill-switch.ts'), 'utf8')
    expect(source).toContain(`registerAiKillSwitch('brand', readBrandAiEnabled)`)
  })

  it('Schalter an ⇒ der Riegel ist offen', async () => {
    plugin()
    expect(await core.aiSwitchedOn(newEvent())).toBe(true)
  })

  it('Schalter aus ⇒ jeder Transport sieht „aus"', async () => {
    plugin()
    brandAiEnabled = false
    await expect(core.assertAiSwitchedOn(newEvent())).rejects.toMatchObject({
      status: 503,
      data: { code: 'ai_disabled' },
    })
  })

  it('unlesbare Zeile ⇒ aus (fail-closed wie bisher)', async () => {
    plugin()
    readFails = true
    expect(await core.aiSwitchedOn(newEvent())).toBe(false)
  })

  it('je Anfrage nur EIN Lesen der Zeile, auch bei mehreren Modell-Aufrufen', async () => {
    plugin()
    const event = newEvent()
    await core.aiSwitchedOn(event)
    await core.assertAiSwitchedOn(event)
    await core.assertAiSwitchedOn(event)
    expect(tablesDB.getRow).toHaveBeenCalledTimes(1)
  })
})
