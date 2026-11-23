import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createError, getQuery, readBody, setResponseHeader } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { NuxtLayout, NuxtPage, UApp } from '#components'
import { useRouter } from '#imports'
import { useBrandWorkspaceStore } from '../../app/stores/brandWorkspace'
import { BRAND_ADVISORS, BRAND_VOICE, advisorIsVoice } from '../../shared/brandAdvisors'
import { slotsForStep } from '../../shared/slotRegistry'
import {
  DESIGN_PROFILE_ID,
  DESIGN_STEP_KEY,
  designMessages,
  designProfileDetail,
  designProfileList,
  designSave,
  designStepDetail,
  WORKSHOP_CHOICE_ANSWER,
  WORKSHOP_CHOICE_SLOT,
  WORKSHOP_CONFIRM_SLOT,
  WORKSHOP_CONFIRM_VALUE,
  WORKSHOP_FIRST_DRAFT,
  WORKSHOP_GEORGE_REPLY,
  WORKSHOP_HINT,
  WORKSHOP_NEW_DRAFT,
  WORKSHOP_FOREIGN_SLOT,
  WORKSHOP_FOREIGN_STEP,
  WORKSHOP_FOREIGN_VALUE,
  WORKSHOP_GEORGE_LINE,
  WORKSHOP_OLDER_DRAFT,
  WORKSHOP_PROFILE_ID,
  WORKSHOP_STEP_KEY,
  WORKSHOP_TITLE,
  WORKSHOP_VERSIONS_SLOT,
  workshopForeignStepDetail,
  workshopMessages,
  workshopProfileDetail,
  workshopProfileList,
  workshopSave,
  workshopSiteAnalyzed,
  workshopStepDetail,
  workshopConverseStream,
  workshopGenerateStream,
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
    color: { base: Record<'title', string> }
    steps: Record<string, string>
    brands: { card: Record<'remaining', string> }
    labels: Record<string, unknown>
    example: Record<string, Record<string, Record<'solo' | 'team', string> | undefined> | undefined>
    workspace: {
      example: Record<'show' | 'hide' | 'take' | 'quoted', string>
      site: Record<'never' | 'start' | 'consent' | 'confirm' | 'done', string>
      regions: Record<'rail' | 'log', string>
      advisorInfo: Record<'open' | 'desc', string>
      answerSlot: string
      slotActionName: string
      submitChoice: string
      sendOwnAnswer: string
      retryWithHint: string
      generate: Record<'hintLabel', string>
      reviseSlot: string
      reviseApply: string
      reviseDiscard: string
      confirmQuestion: string
      confirmSlot: string
      bar: Record<'showNav' | 'hideNav' | 'showLog' | 'hideLog', string>
      log: Record<'overall', string>
      versions: Record<'open' | 'title' | 'use' | 'first', string>
      conflict: Record<'title' | 'mineLabel' | 'serverLabel' | 'loadServer', string>
    }
  }
}
const site = de.brand.workspace.site
const base = `/api/brand/profiles/${WORKSHOP_PROFILE_ID}`

const calls = { analyze: 0, ai: 0, versions: 0, foreign: 0, converse: 0, generate: 0 }
/** Welche KI-Route ein Fall ausdrücklich mit einem GESTELLTEN Strom bedient (s. unten). */
const aiStub = { converse: false, generate: false }
/** Was die Seite an die gestellte Route geschickt hat. */
const aiBodies: { converse: Record<string, unknown> | null, generate: Record<string, unknown> | null } = { converse: null, generate: null }
/**
 * Der Konflikt-Fall lässt das NÄCHSTE Speichern mit 409 enden — so entsteht
 * der Dialog auch im Betrieb (`applyConflict` im 409-Zweig des Autosave).
 * `served`: danach liefert das Kapitel den neueren Stand; `sent` ist, was der
 * Autosave geschickt hat.
 */
const saveConflict: { armed: boolean, served: boolean, sent: Record<string, { value?: string }> | null } = {
  armed: false,
  served: false,
  sent: null,
}
/** Erst der Farbwelt-Fall listet die zweite Marke (die Leiste der ersten Fälle bleibt gleich). */
const designProfileListed = { on: false }

const designBase = `/api/brand/profiles/${DESIGN_PROFILE_ID}`
registerEndpoint(designBase, () => designProfileDetail())
registerEndpoint(`${designBase}/steps/${DESIGN_STEP_KEY}`, {
  method: 'GET',
  handler: () => designStepDetail(),
})
registerEndpoint(`${designBase}/steps/${DESIGN_STEP_KEY}`, {
  method: 'PATCH',
  handler: async event => designSave(await readBody(event)),
})
registerEndpoint(`${designBase}/messages`, event => designMessages(String(getQuery(event).session ?? '')))
for (const route of ['converse', 'generate']) {
  registerEndpoint(`${designBase}/steps/${DESIGN_STEP_KEY}/${route}`, () => {
    calls.ai += 1
    throw new Error('KI im Rauch-Test aufgerufen')
  })
}

registerEndpoint('/api/brand/profiles', () => (designProfileListed.on ? designProfileList() : workshopProfileList()))
registerEndpoint(base, () => workshopProfileDetail())
registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}`, {
  method: 'GET',
  // Nach dem gestellten 409 liest die Seite den neueren Stand (Revision 2).
  handler: () => (saveConflict.served ? { ...workshopStepDetail(), revision: 2 } : workshopStepDetail()),
})
// Ein FREMDES Kapitel, das der Log beim Aufklappen lesend holt.
registerEndpoint(`${base}/steps/${WORKSHOP_FOREIGN_STEP}`, () => {
  calls.foreign += 1
  return workshopForeignStepDetail()
})
registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}/generations`, (event) => {
  calls.versions += 1
  return workshopVersions(String(getQuery(event).slotId ?? ''))
})
registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}`, {
  method: 'PATCH',
  handler: async (event) => {
    const body = await readBody(event)
    if (saveConflict.armed) {
      saveConflict.armed = false
      saveConflict.served = true
      saveConflict.sent = body.slots
      throw createError({ status: 409, statusText: 'Conflict' })
    }
    return workshopSave(body)
  },
})
registerEndpoint(`${base}/messages`, event => workshopMessages(String(getQuery(event).session ?? '')))
registerEndpoint(`${base}/analyze`, {
  method: 'POST',
  handler: () => {
    calls.analyze += 1
    return workshopSiteAnalyzed()
  },
})
// KI-Routen: ein Rauch-Test löst sie NIE ungestellt aus (der Eröffnungszug
// bleibt aus, weil der Verlauf schon einen Zug von George hat). Ein Fall, der
// den Klick eines Moduls prüft, der zu George führt, SCHARF-SCHALTET genau eine
// Route (`aiStub`) und bekommt einen gestellten Strom
// (`workshopConverseStream`/`workshopGenerateStream`, ohne KI); das zählt
// `calls.converse`/`calls.generate`. Jeder Aufruf OHNE Schalter zählt weiter
// in `calls.ai` und antwortet mit einem Fehler — `calls.ai === 0` am Ende
// jedes Falls heisst also weiterhin: kein ungestellter KI-Aufruf.
for (const route of ['converse', 'generate'] as const) {
  registerEndpoint(`${base}/steps/${WORKSHOP_STEP_KEY}/${route}`, {
    method: 'POST',
    handler: async (event) => {
      if (!aiStub[route]) {
        calls.ai += 1
        throw new Error('KI im Rauch-Test aufgerufen')
      }
      const body = await readBody(event)
      calls[route] += 1
      aiBodies[route] = body
      setResponseHeader(event, 'content-type', 'text/event-stream')
      return route === 'converse' ? workshopConverseStream() : workshopGenerateStream(String(body.slotId ?? ''))
    },
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
    calls.foreign = 0
    calls.converse = 0
    calls.generate = 0
    aiStub.converse = false
    aiStub.generate = false
    aiBodies.converse = null
    aiBodies.generate = null
    saveConflict.armed = false
    saveConflict.served = false
    saveConflict.sent = null
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

    // 4. Der Log: ein fremdes Kapitel aufklappen holt seine Felder EINMAL
    // (lesend, ohne Knöpfe); zu und wieder auf holt nichts neu.
    const foreignToggle = () => {
      const button = wrapper.findAll('h2 button').find(entry => entry.text().includes(de.brand.steps[WORKSHOP_FOREIGN_STEP]!))
      if (!button) throw new Error('Kapitel-Knopf im Log fehlt')
      return button
    }
    expect(foreignToggle().attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain(WORKSHOP_FOREIGN_VALUE)
    await foreignToggle().trigger('click')
    await flushPromises()
    expect(calls.foreign).toBe(1)
    expect(foreignToggle().attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain(WORKSHOP_FOREIGN_VALUE)
    expect(wrapper.findAll('h3').map(entry => entry.text().trim())).toContain(fieldLabel(WORKSHOP_FOREIGN_SLOT))
    await foreignToggle().trigger('click')
    expect(wrapper.text()).not.toContain(WORKSHOP_FOREIGN_VALUE)
    await foreignToggle().trigger('click')
    await flushPromises()
    expect(calls.foreign).toBe(1)
    expect(wrapper.text()).toContain(WORKSHOP_FOREIGN_VALUE)

    // „Beantworten" an einer leeren Frage-Karte springt in ihre Session (eine
    // andere als die offene `a.origin`); der Knopf nennt sein Feld (UX-011).
    const praise = fieldLabel('a.customerPraise')!
    const answer = wrapper.find(`button[aria-label="${de.brand.workspace.slotActionName
      .replace('{action}', de.brand.workspace.answerSlot).replace('{field}', praise)}"]`)
    expect(answer.exists()).toBe(true)
    await answer.trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(useRouter().currentRoute.value.query.s).toBe('a.customerPraise'))

    // 5. Leiste, Balken, Fortschritt (WS1 g): der Gesamtfortschritt unten im
    // Log, die eigene Marke in der Leiste, eine Session der Leiste führt in
    // die Adresse, und beide Spalten lassen sich über den Balken einklappen.
    const bar = de.brand.workspace.bar
    expect(wrapper.text()).toContain(de.brand.workspace.log.overall)
    expect(wrapper.text()).toContain(de.brand.brands.card.remaining.replace('{minutes}', '45'))
    expect(wrapper.find('nav[aria-label="Fortschritt"]').text()).toContain(WORKSHOP_TITLE)
    const complaints = fieldLabel('a.complaints')!
    const railEntry = wrapper.find('nav[aria-label="Fortschritt"]').findAll('button')
      .find(entry => entry.text().trim().startsWith(complaints))
    expect(railEntry).toBeDefined()
    await railEntry!.trigger('click')
    await vi.waitFor(() => expect(useRouter().currentRoute.value.query.s).toBe('a.complaints'))
    // Die offene Session trägt in der Leiste `aria-current` — genau eine.
    await vi.waitFor(() => {
      const current = wrapper.find('nav[aria-label="Fortschritt"]').findAll('button[aria-current="true"]')
      expect(current.map(entry => entry.text().trim().startsWith(complaints))).toEqual([true])
    })
    // Der Schalter im Balken trägt `aria-expanded`; der Schliess-Knopf des
    // mobilen Overlays heißt genauso, hat es aber nicht.
    const navToggle = () => wrapper.find(`button[aria-expanded][aria-label="${bar.hideNav}"], button[aria-expanded][aria-label="${bar.showNav}"]`)
    expect(navToggle().attributes('aria-label')).toBe(bar.hideNav)
    expect(navToggle().attributes('aria-expanded')).toBe('true')
    await navToggle().trigger('click')
    expect(navToggle().attributes('aria-label')).toBe(bar.showNav)
    expect(navToggle().attributes('aria-expanded')).toBe('false')
    await navToggle().trigger('click')
    expect(navToggle().attributes('aria-expanded')).toBe('true')
    const logToggle = () => wrapper.find(`button[aria-label="${bar.hideLog}"], button[aria-label="${bar.showLog}"]`)
    expect(logToggle().attributes('aria-label')).toBe(bar.hideLog)
    await logToggle().trigger('click')
    expect(logToggle().attributes('aria-label')).toBe(bar.showLog)
    await logToggle().trigger('click')
    expect(logToggle().attributes('aria-label')).toBe(bar.hideLog)

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
    // Konflikt (409) so, wie er im Betrieb entsteht: der Autosave schickt die
    // gewählte Fassung, der Server lehnt ab, die Seite liest den neueren Stand
    // (Revision 2, dort steht die erste Fassung) und zeigt beide nebeneinander.
    // NIE `store.conflict` von Hand setzen: dann läuft der Autosave der Wahl
    // noch, und unter Last überschreibt seine späte Antwort die Serverfassung
    // NACH dem Auflösen (FL1, rot auf `main` 2026-11-22).
    saveConflict.armed = true
    await clickInBody(ws.versions.use)
    expect(bodyText()).not.toContain(ws.versions.first)
    const store = useBrandWorkspaceStore()
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_OLDER_DRAFT)

    // Auf das Ereignis warten (den Dialog), nicht auf Zeit: der Autosave
    // wartet 750 ms, dann Speichern, 409 und Nachlesen.
    await vi.waitFor(() => expect(bodyText()).toContain(ws.conflict.title), { timeout: 10_000 })
    expect(saveConflict.sent?.[WORKSHOP_VERSIONS_SLOT]?.value).toBe(WORKSHOP_OLDER_DRAFT)
    expect(store.syncState).toBe('conflict')
    expect(bodyText()).toContain(ws.conflict.mineLabel)
    expect(bodyText()).toContain(ws.conflict.serverLabel)
    // „Serverfassung laden" übernimmt den VOLLEN Stand des Kapitels.
    await clickInBody(ws.conflict.loadServer)
    expect(store.conflict).toBeNull()
    expect(store.revision).toBe(2)
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_FIRST_DRAFT)
    expect(store.hasPendingWork).toBe(false)
    expect(bodyText()).not.toContain(ws.conflict.mineLabel)

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })
  it('Bestätigungs-Modul: korrigieren, verwerfen, übernehmen (WS1 c)', async () => {
    designProfileListed.on = false
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}?s=${WORKSHOP_CONFIRM_SLOT}`,
    })
    await flushPromises()
    const ws = de.brand.workspace
    const store = useBrandWorkspaceStore()
    const frame = () => wrapper.find('main .bw-draft-frame')
    const stageButton = (label: string) => {
      const button = wrapper.find('main').findAll('button.bw-confirm').find(entry => entry.text().trim() === label)
      if (!button) throw new Error(`Knopf „${label}" fehlt auf der Bühne`)
      return button
    }

    // Die Karte: Feld-Name, Wert, Abschluss-Frage, „Korrigieren" und „Bestätigen".
    expect(frame().text()).toContain(fieldLabel(WORKSHOP_CONFIRM_SLOT))
    expect(frame().text()).toContain(WORKSHOP_CONFIRM_VALUE)
    expect(wrapper.find('main').text()).toContain(ws.confirmQuestion)
    expect(stageButton(ws.confirmSlot).exists()).toBe(true)

    // Korrigieren öffnet das Feld; Verwerfen stellt den alten Wert wieder her.
    await stageButton(ws.reviseSlot).trigger('click')
    expect(frame().find('textarea').exists()).toBe(true)
    await frame().find('textarea').setValue('Etwas anderes.')
    expect(store.slotValue(WORKSHOP_CONFIRM_SLOT)).toBe('Etwas anderes.')
    await stageButton(ws.reviseDiscard).trigger('click')
    await flushPromises()
    expect(store.slotValue(WORKSHOP_CONFIRM_SLOT)).toBe(WORKSHOP_CONFIRM_VALUE)
    expect(frame().find('textarea').exists()).toBe(false)

    // Korrigieren und übernehmen: der neue Wert bleibt, das Feld schließt.
    await stageButton(ws.reviseSlot).trigger('click')
    await frame().find('textarea').setValue('Wir hören zu und fragen nach.')
    await stageButton(ws.reviseApply).trigger('click')
    expect(frame().find('textarea').exists()).toBe(false)
    expect(store.slotValue(WORKSHOP_CONFIRM_SLOT)).toBe('Wir hören zu und fragen nach.')
    expect(frame().text()).toContain('Wir hören zu und fragen nach.')

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })

  it('Farbwelt: das Werkzeug legt seine Werte selbst vor, eine Wahl geht in den Store (WS1 d)', async () => {
    designProfileListed.on = true
    const wrapper = await mountSuspended(Shell, { route: `/brand/${DESIGN_PROFILE_ID}/${DESIGN_STEP_KEY}` })
    await flushPromises()
    const store = useBrandWorkspaceStore()

    expect(wrapper.find('main h1').text()).toBe(de.brand.steps[DESIGN_STEP_KEY])
    expect(wrapper.findAll('h2').map(entry => entry.text().trim())).toContain(de.brand.color.base.title)

    // Nach dem Mount belegt das Kapitel sich selbst vor: der gewählte
    // Basis-Kandidat (aria-pressed) steht als Wert im Store.
    // Nur der Abschnitt „Basis": die Karten unter seiner Überschrift.
    const baseCards = () => {
      const title = wrapper.findAll('h2').find(entry => entry.text().trim() === de.brand.color.base.title)!
      const section = title.element.parentElement!.parentElement!
      return [...section.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')]
    }
    const hexOf = (card: HTMLButtonElement) => card.querySelector('.font-mono')?.textContent?.trim() ?? ''
    await vi.waitFor(() => expect(store.slotValue('h.base')).toMatch(/^#[0-9a-f]{6}$/i))
    const pressed = baseCards().filter(card => card.getAttribute('aria-pressed') === 'true')
    expect(pressed.map(hexOf)).toEqual([store.slotValue('h.base')])

    // Eine andere Wahl geht denselben Weg wie jede Eingabe: Store, dann Autosave.
    const other = baseCards().find(card => card.getAttribute('aria-pressed') !== 'true' && !card.disabled)
    expect(other).toBeDefined()
    const target = hexOf(other!)
    other!.click()
    await flushPromises()
    expect(store.slotValue('h.base')).toBe(target)
    expect(baseCards().filter(card => card.getAttribute('aria-pressed') === 'true').map(hexOf)).toEqual([target])

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })

  /*
   * DIE ZWEI MODULE IM ZUG, DIE ZU GEORGE FÜHREN (WS1 c-Rest). Beide laufen
   * NACH der Farbwelt: der Wechsel zurück auf das erste Probe-Profil lädt das
   * Kapitel frisch (Revision 1, die erste Fassung in `a.category`) — kein Fall
   * davor hinterlässt hier einen halben Stand. Die KI-Route ist je Fall
   * ausdrücklich gestellt (`aiStub`), `calls.ai` bleibt 0.
   */
  it('Options-Modul: die eigene Antwort geht als Zug an George (WS1 c-Rest)', async () => {
    designProfileListed.on = false
    aiStub.converse = true
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}?s=${WORKSHOP_CHOICE_SLOT}`,
    })
    await flushPromises()
    const ws = de.brand.workspace
    const main = () => wrapper.find('main')

    // Das Modul: ein Feld für die eigene Formulierung, „Übermitteln" gesperrt,
    // solange es leer ist; das Prompt unten ist für eine Auswahl gesperrt.
    const own = () => main().find(`input[aria-label="${ws.sendOwnAnswer}"]`)
    expect(own().exists()).toBe(true)
    const submit = () => buttonNamed(wrapper, ws.submitChoice)
    expect(submit().attributes('disabled')).toBeDefined()
    await own().setValue(WORKSHOP_CHOICE_ANSWER)
    expect(submit().attributes('disabled')).toBeUndefined()

    // Der Klick: eigene Blase, Zug an George (mit der Session), seine Antwort.
    await submit().trigger('click')
    await vi.waitFor(() => expect(main().text()).toContain(WORKSHOP_GEORGE_REPLY))
    expect(calls.converse).toBe(1)
    expect(aiBodies.converse).toMatchObject({ text: WORKSHOP_CHOICE_ANSWER, sessionKey: WORKSHOP_CHOICE_SLOT })
    expect(main().text()).toContain(WORKSHOP_CHOICE_ANSWER)
    expect((own().element as HTMLInputElement).value).toBe('')

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })

  it('Antwort-Modul: das Beispiel auf- und zuklappen und ins Prompt übernehmen (WS1 c-Rest)', async () => {
    designProfileListed.on = false
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}?s=a.customerPraise`,
    })
    await flushPromises()
    const example = de.brand.workspace.example
    // Solo-Fassung (`teamExample`, das Probe-Profil ist `solo`).
    const text = de.brand.example.a!.customerPraise!.solo
    const toggle = () => wrapper.find('main').findAll('button[aria-expanded]')
      .find(entry => [example.show, example.hide].includes(entry.text().trim()))
    expect(toggle()?.text().trim()).toBe(example.show)
    expect(toggle()?.attributes('aria-expanded')).toBe('false')
    await toggle()!.trigger('click')
    expect(toggle()?.text().trim()).toBe(example.hide)
    const quoted = buttonNamed(wrapper, example.quoted.replace('{text}', text).replace('{hint}', example.take))
    await quoted.trigger('click')
    expect((wrapper.find('main textarea').element as HTMLTextAreaElement).value).toBe(text)
    await toggle()!.trigger('click')
    expect(toggle()?.text().trim()).toBe(example.show)
    expect(wrapper.text()).not.toContain(example.take)

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })

  it('Entwurfs-Modul: korrigieren, verwerfen, nochmal mit Hinweis (WS1 c-Rest)', async () => {
    designProfileListed.on = false
    aiStub.generate = true
    const wrapper = await mountSuspended(Shell, {
      route: `/brand/${WORKSHOP_PROFILE_ID}/${WORKSHOP_STEP_KEY}?s=${WORKSHOP_VERSIONS_SLOT}`,
    })
    await flushPromises()
    const ws = de.brand.workspace
    const store = useBrandWorkspaceStore()
    const main = () => wrapper.find('main')
    // Ohne George-Entwurf trägt die Karte keinen gestrichelten Rahmen; der
    // Editor ist die Textbox, die den Wert des Felds zeigt (das Prompt
    // darunter ist leer).
    const editor = () => main().findAll('textarea')
      .find(entry => (entry.element as HTMLTextAreaElement).value === store.slotValue(WORKSHOP_VERSIONS_SLOT))

    // Die Karte: Feld-Name, die erste Fassung, die Weiter-Wege.
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_FIRST_DRAFT)
    expect(main().text()).toContain(WORKSHOP_FIRST_DRAFT)
    expect(editor()).toBeUndefined()
    expect(buttonNamed(wrapper, ws.versions.open).exists()).toBe(true)

    // Korrigieren öffnet das Feld, Verwerfen stellt die Fassung wieder her.
    await buttonNamed(wrapper, ws.reviseSlot).trigger('click')
    expect(editor()).toBeDefined()
    await editor()!.setValue('Etwas ganz anderes')
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe('Etwas ganz anderes')
    await buttonNamed(wrapper, ws.reviseDiscard).trigger('click')
    await flushPromises()
    expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_FIRST_DRAFT)
    expect(editor()).toBeUndefined()

    // „Nochmal, mit Hinweis" klappt die Hinweis-Zeile auf; der Hinweis reist
    // mit dem Erzeugen-Aufruf, der gestellte Entwurf landet im Feld, und die
    // Zeile schliesst sich wieder.
    const retry = () => buttonNamed(wrapper, ws.retryWithHint)
    expect(retry().attributes('aria-expanded')).toBe('false')
    await retry().trigger('click')
    expect(retry().attributes('aria-expanded')).toBe('true')
    const hintLabel = ws.generate.hintLabel.replace('{voice}', BRAND_VOICE.name)
    const hintInput = () => main().find(`input[aria-label="${hintLabel}"]`)
    await hintInput().setValue(WORKSHOP_HINT)
    await main().find(`button[aria-label="${hintLabel}"]`).trigger('click')
    await vi.waitFor(() => expect(store.slotValue(WORKSHOP_VERSIONS_SLOT)).toBe(WORKSHOP_NEW_DRAFT))
    await flushPromises()
    expect(calls.generate).toBe(1)
    expect(aiBodies.generate).toMatchObject({ slotId: WORKSHOP_VERSIONS_SLOT, hint: WORKSHOP_HINT })
    expect(main().text()).toContain(WORKSHOP_NEW_DRAFT)
    expect(hintInput().exists()).toBe(false)

    expect(calls.ai).toBe(0)
    expect(unexpected(warn)).toEqual([])
    expect(unexpected(error)).toEqual([])
  })
})
