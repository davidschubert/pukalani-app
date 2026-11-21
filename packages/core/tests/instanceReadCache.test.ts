import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Q12 (PERF-005): Instanz-Lesungen (`app_config`, `custom_themes`,
 * `custom_fonts`) höchstens 15 s gemerkt, jeder Schreiber räumt sofort.
 */

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteProjectId: 'proj' } }))
const { cachedInstanceRead, forgetInstanceRead, INSTANCE_READ_TTL_MS } = await import('../server/utils/instanceReadCache')

describe('instanceReadCache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
    for (const name of ['app_config', 'custom_themes', 'custom_fonts'] as const) forgetInstanceRead(name)
  })
  afterEach(() => vi.useRealTimers())

  it('liest innerhalb der Frist einmal, danach neu', async () => {
    const read = vi.fn(async () => ({ registrationEnabled: true }))
    await cachedInstanceRead(undefined, 'app_config', read)
    await cachedInstanceRead(undefined, 'app_config', read)
    expect(read).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + INSTANCE_READ_TTL_MS)
    await cachedInstanceRead(undefined, 'app_config', read)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('gleichzeitige Lesungen teilen sich eine Abfrage', async () => {
    const read = vi.fn(async () => [{ $id: 't1' }])
    await Promise.all([1, 2, 3].map(() => cachedInstanceRead(undefined, 'custom_themes', read)))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('Schreiben räumt sofort — auch eine Lesung, die gerade unterwegs war', async () => {
    let resolveOld!: (v: { maintenanceMode: boolean }) => void
    const old = cachedInstanceRead(undefined, 'app_config', () => new Promise(r => { resolveOld = r }))
    forgetInstanceRead('app_config')
    resolveOld({ maintenanceMode: false })
    await old
    const fresh = vi.fn(async () => ({ maintenanceMode: true }))
    expect(await cachedInstanceRead(undefined, 'app_config', fresh)).toEqual({ maintenanceMode: true })
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('räumt nur die genannte Tabelle', async () => {
    const fonts = vi.fn(async () => [{ $id: 'f1' }])
    await cachedInstanceRead(undefined, 'custom_fonts', fonts)
    forgetInstanceRead('custom_themes')
    await cachedInstanceRead(undefined, 'custom_fonts', fonts)
    expect(fonts).toHaveBeenCalledTimes(1)
  })

  it('Fehler werden nicht gemerkt', async () => {
    const read = vi.fn(async () => { throw new Error('503') })
    await expect(cachedInstanceRead(undefined, 'custom_fonts', read)).rejects.toThrow('503')
    await expect(cachedInstanceRead(undefined, 'custom_fonts', read)).rejects.toThrow('503')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('jeder Treffer ist eine Kopie (die Route setzt den Mandanten-Vibe darüber)', async () => {
    const first = await cachedInstanceRead(undefined, 'app_config', async () => ({ themeSettings: { a: 1 } as Record<string, number> }))
    first.themeSettings.b = 2
    expect(await cachedInstanceRead(undefined, 'app_config', async () => ({ themeSettings: {} }))).toEqual({ themeSettings: { a: 1 } })
  })
})
