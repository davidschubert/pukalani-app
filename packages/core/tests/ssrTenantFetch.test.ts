import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * IM SSR VERLIERT `$fetch` DEN MANDANTEN.
 *
 * Im Pool entscheidet der HOST, welcher Community eine Anfrage gilt
 * (`00.tenant.ts`). Ein blankes `$fetch('/api/…')` aus einer Komponente heraus
 * läuft beim serverseitigen Rendern durch Nitros internen Handler und trägt
 * die Kopfzeilen des ursprünglichen Requests NICHT mit — die Route antwortet
 * dann `404 Unknown host`. Richtig ist `useRequestFetch()` (oder `useFetch`,
 * das es intern benutzt).
 *
 * WARUM DAS EINEN WÄCHTER VERDIENT: der Fehler ist im Betrieb fast unsichtbar.
 * Er wirft nichts, er loggt nichts, er sieht aus wie „keine Daten" — und
 * `useAsyncData` merkt sich den Fehlschlag, sodass auch der Browser ihn nicht
 * mehr heilt. Auf `demo.pukalani.app` stand deshalb „Aktuell sind keine Events
 * geplant", während der Kalender direkt darunter die Termine anzeigte (er lädt
 * clientseitig). Aufgefallen ist das erst, als überhaupt Termine da waren —
 * bei einer leeren Tabelle ist ein leeres Ergebnis nicht von einem kaputten zu
 * unterscheiden. Zwei Dateien hatten dasselbe Muster (2026-08-15).
 *
 * Geprüft wird die QUELLE, weil der Fehler ein Weglassen ist: `useRequestFetch`
 * fehlt schlicht. Ein Laufzeit-Test müsste dafür eine Nuxt-App mit
 * Mandanten-Auflösung hochfahren.
 */

const wurzel = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Layer, deren App-Code auf einem MANDANTEN-Host laufen kann. `system` ist
 * Fundament ohne App-Code, `marketing`/`help` sind Single-Host — dort gibt es
 * keinen Mandanten, den man verlieren könnte.
 *
 * `core` STEHT SEIT DEM 2026-09-08 MIT DRIN (U15 Teil 3). Hier stand vorher
 * „core ist Fundament, dort gibt es keinen Mandanten" — und das war eine
 * Verwechslung von SCHICHT und LAUFZEIT: ein core-COMPOSABLE läuft in genau der
 * Seite, in der es aufgerufen wird, also auch auf jedem Mandanten-Host.
 * `useCommunityNav()` holt von dort zwei Routen, und beide antworten „404
 * Unknown host", wenn der Aufruf den Host verliert. Der Anlass ist also nicht
 * Vollständigkeit, sondern eine Datei, die es vorher nicht gab.
 */
const LAYER = ['core', 'blueprint', 'brand', 'posts', 'comments', 'events', 'courses', 'pages', 'onboarding', 'admin', 'themes', 'moderation']

const dateien = LAYER.flatMap(layer =>
  globSync(`packages/${layer}/app/**/*.{vue,ts}`, { cwd: wurzel }).map(p => `${wurzel}${p}`),
)

describe('SSR-Abrufe halten den Mandanten', () => {
  it('findet überhaupt Dateien (sonst prüft der Test nichts)', () => {
    expect(dateien.length).toBeGreaterThan(50)
  })

  it('kein rohes $fetch in useAsyncData/useLazyAsyncData', () => {
    const treffer: string[] = []
    for (const datei of dateien) {
      const quelle = readFileSync(datei, 'utf8')
      if (!/useAsyncData|useLazyAsyncData/.test(quelle)) continue
      // Der Aufruf und sein Rumpf stehen dicht beieinander; 400 Zeichen decken
      // auch mehrzeilige Varianten ab, ohne den Rest der Datei einzufangen.
      for (const m of quelle.matchAll(/use(?:Lazy)?AsyncData[\s\S]{0,400}/g)) {
        const block = m[0]
        if (/(?<![\w.])\$fetch\s*[<(]/.test(block) && !/useRequestFetch|requestFetch\s*[<(]/.test(block)) {
          treffer.push(datei.slice(wurzel.length))
          break
        }
      }
    }
    expect(
      treffer,
      `Diese Dateien holen im SSR ohne Host — useRequestFetch() nehmen:\n  ${treffer.join('\n  ')}`,
    ).toEqual([])
  })
})
