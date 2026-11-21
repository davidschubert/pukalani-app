/**
 * FAQPage-JSON-LD STEHT NUR AUF /faq (SEO-008, 2026-11-21).
 *
 * Bis dahin trugen Startseite und /faq dieselben Fragen als strukturierte
 * Daten — zwei Seiten, die um dasselbe Suchergebnis konkurrieren. Geprüft am
 * Quelltext der Seiten (die Seiten laufen hier nicht): die Startseite nennt
 * den Typ nicht mehr, zeigt die Fragen aber weiter sichtbar (`FaqSection`),
 * /faq trägt ihn genau einmal.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pages = fileURLToPath(new URL('../app/pages/', import.meta.url))
const index = readFileSync(`${pages}index.vue`, 'utf8')
const faq = readFileSync(`${pages}faq.vue`, 'utf8')

/** Nur der Code, nicht die Kommentare — die Startseite ERKLÄRT, warum der Typ fehlt. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('marketing: FAQPage-JSON-LD', () => {
  it('die Startseite trägt keinen FAQPage-Knoten', () => {
    expect(code(index)).not.toMatch(/'@type':\s*'FAQPage'/)
  })

  it('die Startseite zeigt die Fragen weiter sichtbar', () => {
    expect(code(index)).toContain('<FaqSection />')
  })

  it('/faq trägt FAQPage genau einmal (Gegenprobe: das Muster trifft)', () => {
    expect(code(faq).match(/'@type':\s*'FAQPage'/g)).toHaveLength(1)
  })
})
