/**
 * EINE UNBEKANNTE CHECK-KENNUNG ANTWORTET MIT 404 (SEO-008, 2026-11-21).
 *
 * `/brand-check/<id>` zeigt bei „gibt es nicht" bewusst die ruhige Leerseite
 * statt der Fehlerseite (Kopf der Seite) — der STATUS war dabei aber 200, und
 * jede erfundene Kennung stand als Seite da. Jetzt dasselbe Muster wie
 * `discover/[slug].vue`: Seite ruhig, `setResponseStatus(…, 404)`.
 *
 * Geprüft am Quelltext (die Seite läuft hier nicht): der Status wird gesetzt,
 * und NUR im Zweig einer 404 der Route — ein 503 (Datenbank weg) wird nicht zu
 * „gibt es nicht". Was dieser Test NICHT beweist: die Antwort am laufenden
 * Server (Abruf `/brand-check/gibt-es-nicht` ⇒ 404 mit Leerseite).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const page = readFileSync(fileURLToPath(new URL('../app/pages/brand-check/[id].vue', import.meta.url)), 'utf8')
const script = page.slice(0, page.indexOf('</script>'))

describe('brand-check/[id]: Status bei unbekannter Kennung', () => {
  it('greift das Request-Ereignis VOR dem Abruf (nach einem await fehlt der Nuxt-Kontext)', () => {
    const grab = script.indexOf('const requestEvent = useRequestEvent()')
    const fetchCall = script.indexOf('await useAsyncData')
    expect(grab).toBeGreaterThan(-1)
    expect(grab).toBeLessThan(fetchCall)
  })

  it('setzt 404 nur im Zweig „Route sagt 404"', () => {
    expect(script).toMatch(/if \(status === 404 && requestEvent\) setResponseStatus\(requestEvent, 404\)/)
  })

  it('GEGENPROBE: kein anderer Status wird gesetzt, und kein createError macht daraus die Fehlerseite', () => {
    const calls = [...script.matchAll(/setResponseStatus\(requestEvent, (\d+)\)/g)].map(match => match[1])
    expect(calls.length).toBeGreaterThan(0)
    expect(new Set(calls)).toEqual(new Set(['404']))
    expect(script).not.toMatch(/createError\(|showError\(/)
  })

  it('die ruhige Leerseite bleibt der Zustand für „gibt es nicht"', () => {
    expect(page).toContain('data-check-missing')
  })
})
