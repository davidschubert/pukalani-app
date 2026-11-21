import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { NuxtLayout, NuxtPage, UApp } from '#components'
import { useBrandWorkspaceStore } from '../../app/stores/brandWorkspace'
import { BRAND_ADVISORS, BRAND_VOICE, advisorIsVoice } from '../../shared/brandAdvisors'
import { slotsForStep } from '../../shared/slotRegistry'
import {
  WORKSHOP_FIRST_DRAFT,
  WORKSHOP_GEORGE_LINE,
  WORKSHOP_OLDER_DRAFT,
  WORKSHOP_PROFILE_ID,
  WORKSHOP_STEP_KEY,
  WORKSHOP_VERSIONS_SLOT,
  workshopMessages,
  workshopProfileDetail,
  workshopProfileList,
  workshopSiteAnalyzed,
  workshopStepDetail,
  workshopVersions,
} from './support/workshopFixtures'

/**
 * RAUCH-TEST DER WERKSTATT (Q21, ARC-001).
 *
 * Die Werkstatt ist die größte Seite des Projekts. Dieser Test baut sie EINMAL
 * so auf, wie ein Konto sie sieht — `UApp`, Layout, Seite im Router — mit
 * gestellten Antworten (`support/workshopFixtures.ts`): kein Netz, keine
 * Datenbank, keine KI. Er sagt nicht, dass jede Funktion stimmt; er sagt, dass
 * die Seite nach einem Umbau noch STEHT. Das ist die Bedingung dafür, sie in
 * Teile zu schneiden.
 *
 * Geprüft wird:
 *   1. die Seite erscheint, ohne Fehler und ohne Vue-Warnung;
 *   2. die Hauptbereiche sind da — über Rollen und Überschriften (Q09): genau
 *      ein `main`, der Kapitel-Name als einzige `h1`, die Navigation
 *      „Fortschritt", das Gespräch, je Feld des Kapitels eine Karte im Log;
 *   3. ein Klick-Weg: „Website lesen" → Zustimmung → „Ja, lesen" ruft die
 *      (gestellte) Analyse-Route und meldet das Ergebnis. Der Weg geht durch
 *      den ersten herausgeschnittenen Abschnitt `BwSiteStrip`.
 *
 * Die Erwartungen kommen aus der Sprachdatei und dem Feld-Katalog, nicht aus
 * der Antwort der Seite (Beweis-Regel 1).
 */

/**
 * Die Sprachdatei ROH gelesen: ein `import` der JSON geht im Nuxt-Projekt
 * durch den i18n-Übersetzer und liefert vorkompilierte Nachrichten statt Text
 * (auch mit `?raw`).
 */
// `import.meta.url` ist in der Nuxt-Umgebung keine Datei-Adresse; Vitest
// läuft immer im Paket-Ordner (`pnpm test`, CI).
const de = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/de.json'), 'utf8')) as {
  brand: {
    steps: Record<string, string>
    labels: Record<string, unknown>
    workspace: {
      site: Record<'never' | 'start' | 'consent' | 'confirm' | 'done', string>
      regions: Record<'rail' | 'log', string>
      advisorInfo: Record<'open' | 'desc', string>
      versions: Record<'open' | 'title' | 'use' | 'first', string>
      conflict: Record<'title' | 'mineLabel' | 'serverLabel' | 'loadServer', string>
    }
  }
}
const site = de.brand.workspace.site
const base = `/api/brand/profiles/${WORKSHOP_PROFILE_ID}`

const calls = { analyze: 0, ai: 0, versions: 0 }

registerEndpoint('/api/brand/profiles', () => workshopProfileList())
registerEndpoint(base, () => workshopProfileDetail())
registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}`, () => workshopStepDetail())
registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}/generations`, (event) => {
  calls.versions += 1
  return workshopVersions(String(getQuery(event).slotId ?? ''))
})
registerEndpoint(`${base}/messages`, event => workshopMessages(String(getQuery(event).session ?? '')))
registerEndpoint(`${base}/analyze`, {
  method: 'POST',
  handler: () => {
    calls.analyze += 1
    return workshopSiteAnalyzed()
  },
})
// KI-Routen: ein Rauch-Test darf sie NIE auslösen (der Eröffnungszug bleibt
// aus, weil der Verlauf schon einen Zug von George hat). Sie zählen mit und
// antworten mit einem Fehler, statt still etwas zu liefern.
for (const route of ['converse', 'generate']) {
  registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}/${route}`, () => {
    calls.ai += 1
    throw new Error('KI im Rauch-Test aufgerufen')
  })
}

/** Wie im Betrieb: `UApp` (Tooltip-/Toast-Rahmen), Layout, Seite im Router. */
const Shell = defineComponent({
  setup: () => () => h(UApp, null, () => h(NuxtLayout, null, () => h(NuxtPage))),
})

/**
 * ERLAUBTE MELDUNG, MIT GRUND: die Kopfzeile der Site (`BwSiteNav`) verlinkt
 * `/about`. Die Seite gibt es in `apps/branding`, nicht im Playground, der hier
 * die App ist — vue-router meldet deshalb „No match". Jede andere Meldung,
 * jede Vue-Warnung und jeder Fehler macht den Test rot.
 */
const ALLOWED = [/^\[VUE_ROUTER_R0004\] No match found for location with path "\/about"/]

function unexpected(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map(args => args.map(String).join(' '))
    .filter(line => !ALLOWED.some(rule => rule.test(line)))
}

/**
 * Modale hängen ihren Inhalt an `body` (Teleport) — dort sucht der Test sie,
 * nicht im Wrapper.
 */
function bodyText(): string {
  return document.body.textContent ?? ''
}

async function clickInBody(label: string): Promise<void> {
  const button = [...document.body.querySelectorAll('button')].find(entry => entry.textContent?.trim() === label)
  if (!button) throw new Error(`Knopf „${label}" fehlt im Dokument`)
  button.click()
  await flushPromises()
}

function buttonNamed(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find(entry => entry.text().trim() === label)
  if (!button) throw new Error(`Knopf „${label}" fehlt`)
  return button
}

/** Die Beschriftung eines Felds im Log — `brand.labels.<id>` (useBrandFieldLabel). */
function fieldLabel(slotId: string): string | undefined {
  let node: unknown = de.brand.labels
  for (const part of slotId.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return typeof node === 'string' ? node : undefined
}

describe('Werkstatt-Seite (Rauch-Test, Q21)', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    calls.analyze = 0
    calls.ai = 0
    calls.versions = 0
    warn = vi.spyOn(console, 'warn')
    error = vi.spyOn(console, 'error')
  })
  afterEach(() => {
    warn.mockRestore()
    error.mockRestore()
  })

  it('erscheint mit allen Hauptbereichen, und „Website lesen" funktioniert', async () => {
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}`,
    })
    await flushPromises()

    // 2. Hauptbereiche (Q09)
    expect(wrapper.findAll('main')).toHaveLength(1)
    const h1 = wrapper.findAll('h1')
    expect(h1).toHaveLength(1)
    expect(h1[0]!.text()).toBe(de.brand.steps.context)
    expect(wrapper.find('nav[aria-label="Fortschritt"]').exists()).toBe(true)
    expect(wrapper.find('main').text()).toContain(WORKSHOP_GEORGE_LINE)
    // Q09-Rest: Kopfzeile der Bühne (mit der h1) und Eingabefeld liegen IN
    // `main`; die zwei Seitenspalten tragen je einen eigenen Namen.
    expect(wrapper.find('main h1').exists()).toBe(true)
    expect(wrapper.find('main textarea').exists()).toBe(true)
    const asides = wrapper.findAll('aside').map(entry => entry.attributes('aria-label'))
    expect(asides).toEqual(expect.arrayContaining([de.brand.workspace.regions.rail, de.brand.workspace.regions.log]))
    const cardTitles = wrapper.findAll('h3').map(entry => entry.text().trim())
    const expectedCards = slotsForStep(WORKSHOP_STEP_KEY)
      .map(slot => fieldLabel(slot.id))
      .filter((label): label is string => Boolean(label))
    expect(expectedCards.length).toBeGreaterThan(3)
    for (const label of expectedCards) expect(cardTitles).toContain(label)

    // 3. Klick-Weg durch den Website-Streifen
    expect(wrapper.text()).toContain(site.never)
    await buttonNamed(wrapper, site.start).trigger('click')
    expect(wrapper.text()).toContain(site.consent)
    await buttonNamed(wrapper, site.confirm).trigger('click')
    await flushPromises()
    expect(calls.analyze).toBe(1)
    expect(wrapper.text()).toContain(site.done.replace('{chars}', '4321'))
    expect(wrapper.text()).not.toContain(site.consent)

    // 1. ohne Fehler, ohne Vue-Warnung, ohne KI
    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })
  it('öffnet den Steckbrief, die früheren Fassungen und den Konflikt-Dialog', async () => {
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}?s=${WORKSHOP_VERSIONS_SLOT}`,
    })
    await flushPromises()
    const ws = de.brand.workspace

    // Steckbrief: der Avatar im Zug öffnet ihn; das Team ohne die Stimme.
    const avatar = wrapper.find(`button[aria-label="${ws.advisorInfo.open.replace('{name}', BRAND_VOICE.name)}"]`)
    expect(avatar.exists()).toBe(true)
    await avatar.trigger('click')
    await flushPromises()
    expect(bodyText()).toContain(BRAND_VOICE.fullName)
    expect(bodyText()).toContain(ws.advisorInfo.desc)
    const team = BRAND_ADVISORS.filter(member => !advisorIsVoice(member.key))
    expect(team.length).toBeGreaterThan(0)
    for (const member of team) expect(bodyText()).toContain(member.fullName)
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')?.click()
    await flushPromises()
    expect(bodyText()).not.toContain(ws.advisorInfo.desc)

    // Frühere Fassungen: Knopf an der Karte der Ableitung → Liste → „In den Editor".
    await buttonNamed(wrapper, ws.versions.open).trigger('click')
    await flushPromises()
    expect(calls.versions).toBe(1)
    expect(bodyText()).toContain(ws.versions.title)
    // Der Dialog holt die Historie selbst, sobald er ein Feld bekommt — auf
    // das Ergebnis warten, nicht auf eine feste Zahl von Runden.
    await vi.waitFor(() => expect(bodyText()).toContain(WORKSHOP_OLDER_DRAFT))
    expect(bodyText()).toContain(ws.versions.first)
    await clickInBody(ws.versions.use)
    expect(bodyText()).not.toContain(ws.versions.first)
    const store = useBrandWorkspaceStore()
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_OLDER_DRAFT)

    // Konflikt (409): beide Fassungen nebeneinander; „Serverfassung laden" löst ihn.
    store.conflict = {
      revision: 2,
      slots: {
        [WORKSHOP_VERSIONS_SLOT]: {
          firstDraft: WORKSHOP_FIRST_DRAFT,
          latestDraft: WORKSHOP_FIRST_DRAFT,
          confirmed: null,
          confidence: null,
          updatedAt: null,
        },
      },
    }
    await flushPromises()
    expect(bodyText()).toContain(ws.conflict.title)
    expect(bodyText()).toContain(ws.conflict.mineLabel)
    expect(bodyText()).toContain(ws.conflict.serverLabel)
    await clickInBody(ws.conflict.loadServer)
    expect(store.conflict).toBeNull()
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_FIRST_DRAFT)
    expect(bodyText()).not.toContain(ws.conflict.mineLabel)

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })
})
