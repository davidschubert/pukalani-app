import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { E2E_AUF_DER_BUEHNE, e2eEnv, summarizeReport } from '../../../scripts/buehne/e2e.mjs'

/**
 * BT1 a: E2E-Dateien laufen nachts auf der Bühne (`pnpm buehne e2e`,
 * scripts/buehne/e2e.mjs). Geprüft wird hier ohne Netz: dass die Variablen
 * aus dem Stand der Bühne richtig abgeleitet werden, dass ein ÜBERSPRUNGENER
 * Test rot zählt (sonst liefe der Schritt still leer), und dass die Spec genau
 * die Variablen liest, die der Befehl setzt.
 */
const REPO = join(__dirname, '..', '..', '..')

// Ein Stand wie aus `pnpm buehne up --suffix x` — nur die Felder, die zählen.
const state = {
  platformPort: 3150,
  poolProject: 'account',
  communities: {
    a: { host: 'kunde-a-x.localhost', accounts: { removed: { userId: 'u-removed' }, owner: { userId: 'u-owner' } } },
    b: { host: 'kunde-b-x.localhost', accounts: { owner: { userId: 'u-b' } } },
  },
}
const platformEnv = {
  NUXT_PUBLIC_APPWRITE_ENDPOINT: 'http://localhost/v1',
  NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'account',
  NUXT_APPWRITE_KEY: 'pool-runtime-value',
}

describe('Variablen aus dem Stand der Bühne', () => {
  it('Pool-Spec: Host von A auf dem Platform-Port, Pool-Projekt, Laufzeit-Schlüssel, entferntes Konto', () => {
    const env = e2eEnv({ state, platformEnv, controlPort: 3004 })
    expect(env.comments).toEqual({
      PW_EXTERNAL_SERVER: '1',
      PW_BASE_URL: 'http://kunde-a-x.localhost:3150',
      PW_POOL_URL: 'http://kunde-a-x.localhost:3150',
      PW_POOL_ENDPOINT: 'http://localhost/v1',
      PW_POOL_PROJECT: 'account',
      PW_POOL_KEY: 'pool-runtime-value',
      PW_POOL_REMOVED_USER_ID: 'u-removed',
      PW_POOL_URL_B: 'http://kunde-b-x.localhost:3150',
      PW_POOL_OWNER_B_USER_ID: 'u-b',
    })
    expect(env.control).toEqual({ PW_EXTERNAL_SERVER: '1', PW_BASE_URL: 'http://localhost:3004' })
    // Ohne Port steht die Studio-Site nicht: keine Variablen, ihre Dateien laufen nicht.
    expect(env).not.toHaveProperty('portfolio')
  })

  it('Studio-Site (BT1 a): nur mit Port, eigener Server auf localhost, ohne Pool-Variablen', () => {
    const env = e2eEnv({ state, platformEnv, controlPort: 3004, portfolioPort: 3005, clientAddress: '10.28.1.2' })
    expect(env.portfolio).toEqual({ PW_EXTERNAL_SERVER: '1', PW_BASE_URL: 'http://localhost:3005' })
  })

  it('eine Aufrufer-Adresse geht nur an die Pool-Spec, und nur wenn es eine gibt', () => {
    const env = e2eEnv({ state, platformEnv, controlPort: 3004, clientAddress: '10.28.1.2' })
    expect(env.comments.PW_CLIENT_ADDRESS).toBe('10.28.1.2')
    expect(env.control).not.toHaveProperty('PW_CLIENT_ADDRESS')
    expect(e2eEnv({ state, platformEnv, controlPort: 3004 }).comments).not.toHaveProperty('PW_CLIENT_ADDRESS')
  })

  it('ein abweichender Platform-Port schlägt den Stand', () => {
    expect(e2eEnv({ state, platformEnv, platformPort: 3160, controlPort: 3164 }).comments.PW_POOL_URL).toBe('http://kunde-a-x.localhost:3160')
  })

  it('ohne entferntes Konto, ohne Schlüssel oder bei fremdem Pool-Projekt: Abbruch statt halber Variablen', () => {
    const noRemoved = { ...state, communities: { ...state.communities, a: { host: 'kunde-a-x.localhost', accounts: {} } } }
    expect(() => e2eEnv({ state: noRemoved, platformEnv, controlPort: 3004 })).toThrow(/entfernten Konto/)
    const noOwnerB = { ...state, communities: { ...state.communities, b: { host: 'kunde-b-x.localhost', accounts: {} } } }
    expect(() => e2eEnv({ state: noOwnerB, platformEnv, controlPort: 3004 })).toThrow(/Community B/)
    expect(() => e2eEnv({ state, platformEnv: { ...platformEnv, NUXT_APPWRITE_KEY: '' }, controlPort: 3004 })).toThrow(/Schlüssel/)
    expect(() => e2eEnv({ state, platformEnv: { ...platformEnv, NUXT_PUBLIC_APPWRITE_PROJECT_ID: 'other' }, controlPort: 3004 })).toThrow(/Pool-Projekt/)
  })
})

// Aufbau wie Playwrights JSON-Bericht (Datei → describe → spec → tests[].status).
const report = (statuses: string[], errors: unknown[] = []) => ({
  errors,
  suites: [{
    title: 'community-removed.spec.ts',
    specs: [],
    suites: [{
      title: 'Entfernt',
      specs: statuses.map((status, i) => ({ title: `Fall ${i + 1}`, tests: [{ status }] })),
    }],
  }],
})

describe('Bericht lesen: übersprungen zählt als rot', () => {
  it('alles bestanden ⇒ keine Probleme', () => {
    const summary = summarizeReport(report(['expected', 'expected']))
    expect(summary.passed).toEqual(['Entfernt › Fall 1', 'Entfernt › Fall 2'])
    expect(summary.problems).toEqual([])
  })

  it('übersprungen, fehlgeschlagen und „flaky" stehen beim Namen', () => {
    const summary = summarizeReport(report(['expected', 'skipped', 'unexpected', 'flaky']))
    expect(summary.problems).toEqual([
      'fehlgeschlagen: Entfernt › Fall 3',
      'erst im zweiten Versuch grün: Entfernt › Fall 4',
      'übersprungen: Entfernt › Fall 2',
    ])
  })

  it('kein Test gelaufen oder ein Fehler außerhalb der Tests ⇒ rot', () => {
    expect(summarizeReport(report([])).problems).toEqual(['kein einziger Test gelaufen'])
    expect(summarizeReport(report(['expected'], [{ message: 'worker did not exit\nstack' }])).problems).toEqual(['Fehler außerhalb der Tests: worker did not exit'])
  })
})

describe('Die Dateien passen zum Repo', () => {
  it('jede eingetragene Datei gibt es', () => {
    for (const entry of E2E_AUF_DER_BUEHNE) expect(existsSync(join(REPO, 'apps', entry.app, entry.datei)), entry.datei).toBe(true)
  })

  it('die Pool-Specs lesen zusammen genau die Variablen, die der Befehl für sie setzt', () => {
    const read = new Set<string>()
    for (const entry of E2E_AUF_DER_BUEHNE.filter(entry => entry.app === 'comments')) {
      const source = readFileSync(join(REPO, 'apps/comments', entry.datei), 'utf8')
      for (const match of source.matchAll(/process\.env\.(PW_[A-Z_]+)/g)) read.add(match[1]!)
    }
    // PW_BASE_URL und PW_EXTERNAL_SERVER liest die Playwright-Konfiguration, nicht die Spec.
    const forConfig = new Set(['PW_BASE_URL', 'PW_EXTERNAL_SERVER'])
    const provided = Object.keys(e2eEnv({ state, platformEnv, controlPort: 3004, clientAddress: '10.28.1.2' }).comments).filter(key => !forConfig.has(key)).sort()
    expect([...read].sort()).toEqual(provided)
  })

  it('die sechs Dateien der Studio-Site stehen alle drin, gegen ihren eigenen Server', () => {
    const portfolio = E2E_AUF_DER_BUEHNE.filter(entry => entry.app === 'portfolio')
    expect(portfolio.every(entry => entry.server === 'portfolio')).toBe(true)
    const inRepo = readdirSync(join(REPO, 'apps/portfolio/e2e')).filter(name => name.endsWith('.spec.ts')).map(name => `e2e/${name}`).sort()
    expect(portfolio.map(entry => entry.datei).sort()).toEqual(inRepo)
  })

  it('jede Playwright-Konfiguration startet mit PW_EXTERNAL_SERVER keinen eigenen Server', () => {
    for (const app of new Set(E2E_AUF_DER_BUEHNE.map(entry => entry.app))) {
      const config = readFileSync(join(REPO, 'apps', app, 'playwright.config.ts'), 'utf8')
      expect(config, app).toMatch(/webServer:\s*process\.env\.PW_EXTERNAL_SERVER\s*\?\s*undefined/)
    }
  })

  it('in buehne.yml läuft `buehne.mjs e2e` nur nachts', () => {
    // Ohne Kommentarzeilen — die nennen den Befehl auch.
    const yaml = readFileSync(join(REPO, '.github/workflows/buehne.yml'), 'utf8').split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
    const steps = yaml.split(/\n(?=\s+- name: )/)
    const e2eSteps = steps.filter(step => /buehne\.mjs e2e\b/.test(step))
    expect(e2eSteps).toHaveLength(1)
    expect(e2eSteps[0]).toMatch(/if: env\.LAUF == 'nacht'/)
  })
})
