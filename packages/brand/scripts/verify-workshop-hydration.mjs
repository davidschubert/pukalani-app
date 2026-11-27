#!/usr/bin/env node
/**
 * WERKSTATT: SERVER-FASSUNG GEGEN BROWSER-FASSUNG — der Prüfweg vor jedem
 * weiteren WS1-Schnitt (2026-11-25).
 *
 * Der Rauch-Test (`tests/render/workshopPage.test.ts`) baut die Seite NUR im
 * Browser auf. Den heiklen Teil eines Schnitts — welche Daten der Server in
 * die Nutzlast legt, in welcher Reihenfolge `await` in `setup` läuft, was vor
 * und was nach dem Einhängen geschieht — sieht er nicht. Vue meldet eine
 * Abweichung zwischen Server und Browser nur in der Konsole.
 *
 * Dieses Skript lädt die Werkstatt FRISCH VOM SERVER eines laufenden
 * Dev-Servers und verlangt eine Konsole ohne „Hydration" und ohne „Failed to
 * resolve component" (dieselbe Regel wie `apps/comments/e2e/support/hydration.ts`).
 * Geprüft wird das offene erste Kapitel (die übrigen sind gesperrt), dazu ein zweites Laden des
 * ersten Kapitels (dann mit Verlauf aus dem ersten Besuch).
 *
 * KEIN KI-AUFRUF: `…/converse`, `…/generate`, `…/analyze`, `…/check` und
 * `…/dna/propose` werden im Browser abgefangen und mit 503 beantwortet; ihre
 * Zahl steht im Bericht. Die Seite zeigt dann ihren Fehler-Zustand — der ist
 * für die Frage „stimmen Server und Browser überein?" gleichwertig.
 *
 * NUR LOKAL (Ziel-Prüfung `assert-target.mjs`). Aus packages/brand, gegen
 * einen LAUFENDEN Dev-Server von apps/branding:
 *   node --env-file=../../apps/branding/.env scripts/verify-workshop-hydration.mjs http://localhost:3010
 * Mit `--step=<kapitel>` (mehrfach erlaubt) lädt es zusätzlich weitere
 * Kapitel einer FRISCHEN Marke — z. B. `--step=aiguide` (WS2 a: der
 * Ladezustand von `BwKitPromptsPanel`; das Wegwerf-Konto hat eine
 * `brand_access`-Zeile und ist damit Beta, die Ableitung also offen).
 * Mit `--screenshot=<datei.png>` legt es ein Bild des zweiten Besuchs ab
 * (Vorher/Nachher eines Schnitts; der Titel der Wegwerf-Marke enthält die Zeit).
 *
 * Legt ein Wegwerf-Konto samt Zugangszeile und Marke an und räumt alles
 * wieder weg — auch im Fehlerfall. Ausgabe nennt nie ein Sitzungs-Geheimnis.
 */
import '../../../scripts/lib/assert-target.mjs'
import { confirmProbeConsent, removeProbeConsent, removeProbeRows } from '../../../scripts/lib/probe-stage.mjs'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const playwrightEntry = new URL('../../../apps/comments/node_modules/@playwright/test/index.mjs', import.meta.url)
const { chromium } = await import(playwrightEntry.href).catch(() => {
  console.error('✗ Playwright nicht gefunden — `pnpm install` in apps/comments und einmalig `npx playwright install chromium`.')
  process.exit(1)
})

const screenshotArg = process.argv.slice(2).find(arg => arg.startsWith('--screenshot='))
const screenshotPath = screenshotArg ? screenshotArg.slice('--screenshot='.length) : null
const extraSteps = process.argv.slice(2).filter(arg => arg.startsWith('--step=')).map(arg => arg.slice('--step='.length))
const positional = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const base = (positional ?? process.env.BRANDING_URL ?? `http://localhost:${process.env.BRANDING_PORT ?? 3010}`).replace(/\/$/, '')
const port = Number(new URL(base).port || 80)
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY || process.env.NUXT_APPWRITE_MIGRATIONS_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/branding/.env aufrufen.')
  process.exit(1)
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`✗ ${base} ist kein lokaler Dev-Server.`)
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)

const MISMATCH = /hydration|failed to resolve component/i
const AI_ROUTE = /\/api\/brand\/profiles\/[^/]+\/(steps\/[^/]+\/(converse|generate)|analyze|check|dna\/propose)(\?|$)/

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`) }
}

const stamp = Date.now().toString(36)
let user = null
let accessRowId = null
let profileId = null
let browser = null
let cookieHeader = ''

/** Dieselbe Frage wie im E2E: App hängt, und die SEITE hat ihren Knoten übernommen. */
const pageHydrated = (selector) => {
  const root = document.querySelector('#__nuxt')
  const el = document.querySelector(selector)
  return Boolean(root?.__vue_app__ && el && el.__vnode !== undefined)
}

try {
  user = await users.create({
    userId: ID.unique(),
    email: `workshop-hydration-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Werkstatt Probe ${stamp}`,
  })
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  accessRowId = ID.unique()
  await tablesDB.createRow({
    databaseId, tableId: 'brand_access', rowId: accessRowId,
    data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
  })
  const session = await users.createSession({ userId: user.$id })
  cookieHeader = `a_session_${projectId}=${encodeURIComponent(session.secret)}`
  // branding.supply verlangt die AGB-Zustimmung, bevor ein Konto schreibt.
  await confirmProbeConsent({ port, cookie: cookieHeader })

  const created = await fetch(`${base}/api/brand/profiles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader, origin: base },
    body: JSON.stringify({
      title: `Probe ${stamp}`,
      contentLocale: 'en',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Bakery',
      about: 'A small neighbourhood bakery baking sourdough bread every morning.',
      audience: 'People living nearby who want good bread before work.',
    }),
  })
  if (!created.ok) throw new Error(`Marke anlegen: HTTP ${created.status}`)
  const createdBody = await created.json()
  profileId = createdBody.profile?.id ?? createdBody.profile?.$id
  const journey = (createdBody.journey ?? []).map(step => step.stepKey)
  check('Marke angelegt', Boolean(profileId) && journey.length > 0, `Antwort ohne Id oder Reise`)

  browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: base })
  await context.addCookies([{
    name: `a_session_${projectId}`, value: session.secret,
    domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax',
  }])
  let aiCalls = 0
  await context.route(AI_ROUTE, (route) => {
    aiCalls++
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"code":"unavailable"}' })
  })

  const page = await context.newPage()
  const messages = []
  page.on('console', (msg) => {
    if (msg.type() !== 'warning' && msg.type() !== 'error') return
    const text = msg.text()
    if (MISMATCH.test(text)) messages.push(text.split('\n').slice(0, 3).join(' ').slice(0, 300))
  })

  // Nur das offene Kapitel: gesperrte Kapitel zeigen keine Werkstatt.
  // Weitere Kapitel nur auf Wunsch (`--step=`) und nur, wenn die Reise sie kennt.
  // Die Ableitung (z. B. `aiguide`) öffnet erst mit fertiger Foundation: sie
  // wird hier server-seitig gesetzt, wie in `verify-brand-kit.mjs`
  // (`completeFoundation`) — der WEG dorthin ist nicht Gegenstand dieser Probe.
  if (extraSteps.length > 0) {
    const seed = async (stepKey, values) => {
      const rowId = `${profileId}_${stepKey}`
      const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
      const slots = JSON.parse(row.slots || '{}')
      for (const [slotId, value] of Object.entries(values)) slots[slotId] = { ...slots[slotId], latestDraft: value, confirmed: value }
      await tablesDB.updateRow({ databaseId, tableId: 'brand_steps', rowId, data: { slots: JSON.stringify(slots), revision: (row.revision ?? 0) + 1 } })
    }
    await seed('values', { 'c.final': '- Clarity\n- Craft\n- Care' })
    await seed('archetype', { 'd.primary': 'sage', 'd.toneWords': '- calm\n- grounded\n- warm' })
    await seed('result', { 'result.direction': 'warm-editorial' })
    await tablesDB.updateRow({ databaseId, tableId: 'brand_steps', rowId: `${profileId}_result`, data: { state: 'done' } })
  }
  for (const stepKey of extraSteps) {
    check(`${stepKey}: steht in der Reise`, journey.includes(stepKey), journey.join(', '))
  }
  const visits = [journey[0], journey[0], ...extraSteps.filter(stepKey => journey.includes(stepKey))]
  for (const [index, stepKey] of visits.entries()) {
    const href = `/brand/${profileId}/${stepKey}`
    let status = 0
    // Wie im E2E mit Wiederholung: der Dev-Server lädt eine Seite nach dem
    // ersten Bündeln einmal neu; gezählt wird der Lauf, der zu Ende kommt.
    for (let attempt = 1; attempt <= 3; attempt++) {
      messages.length = 0
      try {
        const response = await page.goto(href)
        status = response?.status() ?? 0
        await page.waitForFunction(pageHydrated, 'main h1', { timeout: 60_000 })
        await page.waitForLoadState('networkidle', { timeout: 30_000 })
        break
      }
      catch (error) {
        if (attempt === 3) throw new Error(`${href}: ${error instanceof Error ? error.message.split('\n')[0] : error}`, { cause: error })
      }
    }
    const label = index === 1 ? `${stepKey} (zweiter Besuch)` : stepKey
    check(`${label}: Server antwortet 200`, status === 200, `HTTP ${status}`)
    check(`${label}: keine Abweichung zwischen Server und Browser`, messages.length === 0, messages.join('\n    '))
    // WS2 a: im Kapitel AI-Guidelines muss das Vorlagen-Panel auch WIRKLICH
    // dastehen — sonst wäre „keine Abweichung" ein Beweis über nichts.
    if (stepKey === 'aiguide') {
      check(`${label}: Vorlagen-Panel steht da`, await page.locator('[data-brand-kit-prompts]').count() === 1)
    }
  }
  // Optional ein Bild des zweiten Besuchs — für Vorher/Nachher eines Schnitts.
  if (screenshotPath) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log(`  Bild: ${screenshotPath}`)
  }
  console.log(`  abgefangene KI-Aufrufe: ${aiCalls}`)
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error instanceof Error ? error.message : error}`)
}
finally {
  await browser?.close().catch(() => {})
  if (profileId) {
    const res = await fetch(`${base}/api/brand/profiles/${profileId}`, {
      method: 'DELETE', headers: { cookie: cookieHeader, origin: base },
    }).catch(() => null)
    if (!res?.ok) console.error(`! Marke über die Route nicht gelöscht (HTTP ${res?.status ?? '—'}) — räume direkt ab`)
    for (const tableId of ['brand_steps', 'brand_messages', 'brand_events']) {
      await removeProbeRows({ tablesDB, databaseId, tableId, column: 'profileId', value: profileId }).catch(e => console.error(`! ${tableId}: ${e.message}`))
    }
  }
  if (user) {
    await removeProbeRows({ tablesDB, databaseId, tableId: 'brand_profiles', column: 'ownerId', value: user.$id }).catch(e => console.error(`! brand_profiles: ${e.message}`))
    if (accessRowId) await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: accessRowId }).catch(e => console.error(`! brand_access: ${e.message}`))
    await removeProbeConsent({ tablesDB, databaseId, userId: user.$id }).catch(e => console.error(`! Zustimmung: ${e.message}`))
    await users.delete({ userId: user.$id }).catch(e => console.error(`! Konto: ${e.message}`))
    const left = await tablesDB.listRows({ databaseId, tableId: 'brand_profiles', queries: [Query.equal('ownerId', user.$id), Query.limit(1)] }).catch(() => null)
    if (left?.total) { failed++; console.error(`✗ ${left.total} Marke(n) des Wegwerf-Kontos übrig`) }
  }
}

console.log(`\n${passed} grün, ${failed} rot`)
process.exit(failed ? 1 : 0)
