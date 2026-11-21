import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as vue from 'vue'
import type { Component } from 'vue'

/**
 * Eine Komponente des Core OHNE Nuxt laden (Q14): die Datei wird mit dem
 * Compiler von Vue übersetzt, der übersetzte Text landet in einem
 * Wegwerf-Ordner und wird von Vitest importiert (das entfernt die Typen).
 *
 * Die Auto-Importe von Nuxt (`ref`, `computed`, `useI18n`, `useAppConfig`)
 * stellt `installNuxtGlobals()` als globale Namen bereit; `t()` gibt den
 * Schlüssel zurück, damit der Test den Text-Schlüssel sieht und nicht die
 * Übersetzung.
 *
 * `inline: true` baut die Vorlage ein (zum Rendern mit `renderToString`),
 * `inline: false` lässt `setup()` seine Bindungen zurückgeben (zum Aufrufen
 * von Handlern ohne Browser).
 */
const outDir = mkdtempSync(join(tmpdir(), 'pukalani-sfc-'))
let counter = 0

export async function loadSfc(file: string, options: { inline: boolean }): Promise<Component & { setup?: (...args: unknown[]) => Record<string, unknown> }> {
  const source = readFileSync(file, 'utf8')
  const { descriptor } = parse(source, { filename: file })
  const script = compileScript(descriptor, { id: `t${counter}`, inlineTemplate: options.inline })
  const target = join(outDir, `${basename(file, '.vue')}-${counter++}.ts`)
  writeFileSync(target, script.content)
  const mod = await import(/* @vite-ignore */ target) as { default: Component }
  return mod.default as Component & { setup?: (...args: unknown[]) => Record<string, unknown> }
}

export function installNuxtGlobals(): void {
  const g = globalThis as Record<string, unknown>
  g.ref = vue.ref
  g.computed = vue.computed
  g.useI18n = () => ({ t: (key: string) => key })
  g.useAppConfig = () => ({ ui: { icons: { loading: 'i-test-loading' } } })
}

/** Platzhalter für die Nuxt-UI-Bausteine: sichtbar, was ankommt. */
export const uiStubs: Record<string, Component> = {
  UEmpty: vue.defineComponent({
    props: { icon: String, title: String, description: String },
    setup(props, { slots }) {
      return () => vue.h('div', { 'data-u-empty': props.icon }, [
        vue.h('h2', props.title),
        vue.h('p', props.description),
        slots.actions?.(),
      ])
    },
  }),
  UButton: vue.defineComponent({
    props: { label: String, loading: Boolean, to: String, icon: String, color: String, variant: String },
    setup(props) {
      return () => vue.h('button', { 'data-loading': props.loading ? 'true' : undefined }, props.label)
    },
  }),
  UIcon: vue.defineComponent({
    props: { name: String },
    setup(props) {
      return () => vue.h('i', { 'data-icon': props.name })
    },
  }),
}
