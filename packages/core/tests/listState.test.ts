import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import type { Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { listState, type ListState } from '../app/utils/listState'
import { installNuxtGlobals, loadSfc, uiStubs } from './support/sfc'

/**
 * Die vier Zustände einer Liste (FE-004, Q14).
 *
 * GEGENPROBE (2026-11-21): mit der alten Rechnung der Seiten
 * (`status !== 'pending' && !list.length` ⇒ leer) wird der erste Fall rot —
 * ein gescheiterter Abruf hieß „leer".
 */
describe('listState', () => {
  it('ein gescheiterter Abruf ist NIE „leer" (FE-004)', () => {
    expect(listState({ status: 'error', error: new Error('x'), empty: true })).toBe('error')
    expect(listState({ status: 'error', error: new Error('x'), empty: false })).toBe('error')
  })

  it('vor dem Ergebnis lädt die Liste — auf dem Server (idle) wie im Browser (pending), Q15', () => {
    expect(listState({ status: 'idle', empty: true })).toBe('loading')
    expect(listState({ status: 'pending', empty: true })).toBe('loading')
  })

  it('ein Neuabruf mit Daten zeigt weiter die Daten', () => {
    expect(listState({ status: 'pending', empty: false })).toBe('ready')
  })

  it('ein Neuversuch nach einem Fehler läuft als „lädt", auch wenn `error` noch steht', () => {
    expect(listState({ status: 'pending', error: new Error('alt'), empty: true })).toBe('loading')
  })

  it('fertig: leer oder Daten', () => {
    expect(listState({ status: 'success', error: null, empty: true })).toBe('empty')
    expect(listState({ status: 'success', error: undefined, empty: false })).toBe('ready')
  })

  it('ein gesetzter Fehler ohne Fehler-Status ist trotzdem ein Fehler', () => {
    expect(listState({ status: 'success', error: new Error('x'), empty: true })).toBe('error')
  })
})

const components = resolve(__dirname, '../app/components/core')
let ListStateComponent: Component
let shared: Record<string, Component>

beforeAll(async () => {
  installNuxtGlobals()
  shared = {
    ...uiStubs,
    CoreLoadingState: await loadSfc(`${components}/LoadingState.vue`, { inline: true }),
    CoreLoadError: await loadSfc(`${components}/LoadError.vue`, { inline: true }),
    CoreEmptyState: await loadSfc(`${components}/EmptyState.vue`, { inline: true }),
  }
  ListStateComponent = await loadSfc(`${components}/ListState.vue`, { inline: true })
})

async function render(state: ListState, extra: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({
    render: () => h(ListStateComponent, { state, emptyTitle: 'Noch keine Mitglieder', emptyDescription: 'Lade jemanden ein.', retry: () => {}, ...extra }, { default: () => h('table', { 'data-rows': '' }) }),
  })
  for (const [name, component] of Object.entries(shared)) app.component(name, component)
  return renderToString(app)
}

describe('CoreListState', () => {
  it('lädt: Lade-Symbol aus der Konfiguration, „Lädt …" für Vorleseprogramme, keine Tabelle', async () => {
    const html = await render('loading')
    expect(html).toContain('data-loading')
    expect(html).toContain('i-test-loading')
    expect(html).toContain('ui.listState.loading')
    expect(html).not.toContain('data-rows')
  })

  it('Fehler: steht im role="alert", mit „Noch einmal versuchen", und sagt NICHT „leer"', async () => {
    const html = await render('error')
    const alert = html.slice(html.indexOf('role="alert"'))
    expect(alert).toContain('data-load-error')
    expect(alert).toContain('ui.listState.errorTitle')
    expect(alert).toContain('ui.listState.retry')
    expect(html).not.toContain('Noch keine Mitglieder')
    expect(html).not.toContain('data-rows')
  })

  it('Fehler ohne `retry`: kein Knopf, der nichts tut', async () => {
    const html = await render('error', { retry: undefined })
    expect(html).not.toContain('ui.listState.retry')
  })

  it('leer: der leere Zustand mit seinem Text steht im role="status"', async () => {
    const html = await render('empty')
    const status = html.slice(html.indexOf('role="status"'), html.indexOf('role="alert"'))
    expect(status).toContain('data-empty-state')
    expect(status).toContain('Noch keine Mitglieder')
    expect(html).not.toContain('data-load-error')
  })

  it('Daten: nur der Inhalt, kein Lade-, Fehler- oder Leer-Kasten', async () => {
    const html = await render('ready')
    expect(html).toContain('data-rows')
    expect(html).not.toContain('data-loading')
    expect(html).not.toContain('data-load-error')
    expect(html).not.toContain('data-empty-state')
  })

  it('beide Ansage-Bereiche gibt es in JEDEM Zustand (sonst wird der erste Wechsel nicht angesagt)', async () => {
    for (const state of ['loading', 'error', 'empty', 'ready'] as const) {
      const html = await render(state)
      expect(html, state).toContain('role="status"')
      expect(html, state).toContain('role="alert"')
    }
  })
})

describe('CoreLoadError', () => {
  it('„Noch einmal versuchen" ruft `retry` genau einmal, auch bei Doppelklick', async () => {
    const LoadError = await loadSfc(`${components}/LoadError.vue`, { inline: false })
    let calls = 0
    let release: () => void = () => {}
    const retry = () => {
      calls++
      return new Promise<void>((done) => { release = done })
    }
    const bindings = LoadError.setup!({ retry }, { expose: () => {}, emit: () => {}, attrs: {}, slots: {} }) as { onRetry: () => Promise<void>, busy: { value: boolean } }
    const first = bindings.onRetry()
    expect(bindings.busy.value).toBe(true)
    await bindings.onRetry()
    release()
    await first
    expect(calls).toBe(1)
    expect(bindings.busy.value).toBe(false)
  })

  it('wirft `retry` einen Fehler, wird der Knopf wieder frei', async () => {
    const LoadError = await loadSfc(`${components}/LoadError.vue`, { inline: false })
    const bindings = LoadError.setup!({ retry: () => Promise.reject(new Error('weg')) }, { expose: () => {}, emit: () => {}, attrs: {}, slots: {} }) as { onRetry: () => Promise<void>, busy: { value: boolean } }
    await expect(bindings.onRetry()).rejects.toThrow('weg')
    expect(bindings.busy.value).toBe(false)
  })
})
