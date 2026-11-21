import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Component } from 'vue'
import { installNuxtGlobals, loadSfc } from './support/sfc'

/**
 * Der Bestätigungs-Dialog, der `confirm()` des Browsers ersetzt (UI-005, Q14).
 * Geprüft wird das Verhalten des Bestätigen-Knopfes ohne Browser: ohne
 * Aktion schließt er mit „ja", mit Aktion erst nach ihrem Ende, ein
 * Doppelklick löst sie nur einmal aus, ein Fehler reist zum Aufrufer.
 */
type Result = { ok: boolean, error?: unknown }
type Bindings = { onConfirm: () => Promise<void>, busy: { value: boolean } }

const file = resolve(__dirname, '../app/components/core/ConfirmDialog.vue')
let Dialog: Component & { setup?: (...args: unknown[]) => Record<string, unknown> }

beforeAll(async () => {
  installNuxtGlobals()
  Dialog = await loadSfc(file, { inline: false })
})

function open(props: Record<string, unknown>): { bindings: Bindings, closed: Result[] } {
  const closed: Result[] = []
  const emit = (event: string, result: Result) => { if (event === 'close') closed.push(result) }
  const bindings = Dialog.setup!({ title: 'Löschen?', ...props }, { expose: () => {}, emit, attrs: {}, slots: {} }) as unknown as Bindings
  return { bindings, closed }
}

describe('CoreConfirmDialog', () => {
  it('ohne Aktion: Bestätigen schließt sofort mit ok', async () => {
    const { bindings, closed } = open({})
    await bindings.onConfirm()
    expect(closed).toEqual([{ ok: true }])
  })

  it('mit Aktion: schließt erst nach der Aktion; ein zweiter Klick löst sie nicht noch einmal aus', async () => {
    let calls = 0
    let release: () => void = () => {}
    const { bindings, closed } = open({ action: () => { calls++; return new Promise<void>((done) => { release = done }) } })
    const first = bindings.onConfirm()
    expect(bindings.busy.value).toBe(true)
    expect(closed).toEqual([])
    await bindings.onConfirm()
    release()
    await first
    expect(calls).toBe(1)
    expect(closed).toEqual([{ ok: true }])
    expect(bindings.busy.value).toBe(false)
  })

  it('ein Fehler der Aktion schließt mit ok=false und reicht den Fehler weiter', async () => {
    const failure = new Error('Server sagt nein')
    const { bindings, closed } = open({ action: () => Promise.reject(failure) })
    await bindings.onConfirm()
    expect(closed).toEqual([{ ok: false, error: failure }])
  })
})
