import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * JEDE Ref des Workspace-Stores gehört ins Return — sonst überlebt sie die
 * SSR-Hydration nicht.
 *
 * Pinia serialisiert in den SSR-Payload nur, was der Setup-Store ZURÜCKGIBT.
 * Eine private Ref wird server-seitig befüllt (der SSR-HTML-Strom zeigt den
 * richtigen Zustand), startet im Browser aber wieder bei ihrem Startwert —
 * und die Hydration nimmt den Zustand still zurück. Live erwischt am
 * 2026-09-03: `serverConfidence` war privat, die Konfidenz-Weiche zeigte die
 * gespeicherte Wahl nur bis zur Hydration (PATCH 200, GET trug den Wert,
 * Chip trotzdem leer).
 *
 * Der Store läuft nur in Nuxt (Auto-Imports), deshalb prüft dieser Wächter
 * den QUELLTEXT: jeder `const <name> = ref(…)` im Setup muss namentlich im
 * Return-Objekt stehen.
 */
describe('brandWorkspace store state', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../app/stores/brandWorkspace.ts', import.meta.url)),
    'utf8',
  )

  it('gibt jede Ref des Setups zurück (SSR-Payload-Pflicht)', () => {
    const refNames = [...source.matchAll(/^ {2}const (\w+) = ref[<(]/gm)].map(m => m[1]!)
    expect(refNames.length).toBeGreaterThanOrEqual(18)
    expect(refNames).toContain('serverConfidence')
    expect(refNames).toContain('localConfidence')

    const returnBlock = source.slice(source.lastIndexOf('  return {'))
    const missing = refNames.filter(name => !new RegExp(`^ {4}${name},$`, 'm').test(returnBlock))
    expect(missing).toEqual([])
  })

  /**
   * UND KEINE AKTION, DIE NIEMAND RUFT (Paket 8, 2026-09-05).
   *
   * `reopenStep()` stand ein Paket lang im Store, ohne dass irgendwo ein Knopf
   * daran hing: sein Aufrufer war mit 3c-ii auf die Abnahme-Seite gezogen und
   * heisst dort `restart`. Eine tote Aktion sieht aus wie ein vorhandener Weg
   * — sie verspricht der nächsten Sitzung eine Bedienung, die es nicht gibt,
   * und ihre `journey`-Nachführung prüft niemand mehr gegen.
   *
   * Gezählt wird über den ganzen Layer-Quelltext (`app/`): ein Name, der nur
   * an seiner Definition und in der Rückgabe steht, wird nirgends gerufen —
   * auch nicht vom Store selbst (so bleibt `clearGeorgeDraft` gültig, das
   * zwei interne Aufrufer hat).
   */
  it('gibt keine Funktion zurück, die im Layer niemand ruft', () => {
    const appDir = fileURLToPath(new URL('../app', import.meta.url))
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|vue)$/.test(entry.name)) files.push(full)
      }
    }
    walk(appDir)
    const blob = files.map(file => readFileSync(file, 'utf8')).join('\n')

    const returnBlock = source.slice(source.lastIndexOf('  return {'))
    const returned = [...returnBlock.matchAll(/^ {4}(\w+),$/gm)].map(match => match[1]!)
    const functions = returned.filter(name =>
      new RegExp(`^ {2}(?:async )?function ${name}\\b`, 'm').test(source))
    expect(functions.length).toBeGreaterThanOrEqual(35)

    // Definition + Rückgabe = 2 Vorkommen; alles darüber ist ein Aufruf.
    const dead = functions.filter(name =>
      (blob.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length <= 2)
    expect(dead).toEqual([])
  })

  /**
   * UND ZWEI FRAGEN IN ZWEI FELDERN (Paket 9, 2026-09-05).
   *
   * `denied` beantwortet „hat dieses KONTO Zugang?" (Antwort der Datentür auf
   * die Liste), `profileDenied` „gibt es DIESES Branding hier?" (Antwort auf
   * das Profil). Sie standen bis Paket 9 in EINEM Feld, und weil die Werkstatt
   * erst das Profil und danach die Liste holt, nahm der Listen-Abruf einem
   * eingeloggten Menschen das Profil-404 in derselben Funktion wieder weg —
   * übrig blieb eine Werkstatt-Hülle mit HTTP 200 statt einer 404-Seite.
   *
   * Geprüft wird deshalb die TRENNUNG selbst: kein Schreibzugriff kreuzt die
   * Grenze. Das ist die Zusage, an der die 404-Seite hängt — ein Test über den
   * laufenden Store ginge nicht, der Store lebt von Nuxts Auto-Imports.
   */
  it('trennt Listen-404 und Profil-404 in zwei Feldern', () => {
    const body = (name: string): string => {
      const start = source.indexOf(`\n  ${name}`) >= 0
        ? source.indexOf(`\n  ${name}`)
        : source.indexOf(`\n  async ${name}`)
      expect(start).toBeGreaterThan(0)
      const end = source.indexOf('\n  }\n', start)
      expect(end).toBeGreaterThan(start)
      return source.slice(start, end)
    }
    /** `denied.value`, aber NICHT als Ende von `profileDenied.value`. */
    const writesDenied = (text: string): boolean => /(?<![A-Za-z])denied\.value\s*=/.test(text)
    const writesProfileDenied = (text: string): boolean => /profileDenied\.value\s*=/.test(text)

    const list = body('function loadProfiles')
    expect(writesDenied(list)).toBe(true)
    expect(writesProfileDenied(list)).toBe(false)

    for (const name of ['function loadProfile(', 'function loadStep(', 'function applyDetail(']) {
      const text = body(name)
      expect([name, writesProfileDenied(text)]).toEqual([name, true])
      expect([name, writesDenied(text)]).toEqual([name, false])
    }

    // `reset()` räumt BEIDE — sonst überlebte ein Zustand seinen Anlass.
    const reset = body('function reset(')
    expect(writesDenied(reset) && writesProfileDenied(reset)).toBe(true)
  })
})
