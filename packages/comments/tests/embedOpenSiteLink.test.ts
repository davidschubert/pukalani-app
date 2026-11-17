import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * „SEITE ÖFFNEN" IM EINGEBETTETEN KOMMENTAR-BEREICH (SE1 f, 2026-11-17).
 *
 * Blockiert der Browser das Anmelde-Fenster, zeigt der Rahmen einen Link zur
 * Seite. Bis hierher trug er die fest eingestellte Adresse der App
 * (`public.appUrl`). Bei einer Site mit eigener Domain ist das die
 * Standard-Adresse: die Anmeldung landete auf einem anderen Host als der
 * Rahmen, und der Rahmen blieb abgemeldet.
 *
 * Jetzt ist der Link ein interner Pfad — also der Host, der den Rahmen
 * ausliefert, derselbe wie beim Anmelde-Fenster (`useEmbedLogin`, relativ).
 * Geprüft am Quelltext, weil die Komponente nur im Browser lebt.
 */
const source = readFileSync(fileURLToPath(new URL('../app/components/CommentSection.vue', import.meta.url)), 'utf8')
const login = readFileSync(fileURLToPath(new URL('../app/composables/useEmbedLogin.ts', import.meta.url)), 'utf8')

describe('Kommentar-Bereich im Rahmen: „Seite öffnen"', () => {
  it('beide Links führen über den internen Pfad, nicht über eine fest eingestellte Adresse', () => {
    const links = source.match(/<ULink[^>]*>\s*\{\{ t\('comments\.embed\.openSite'\) \}\}/g) ?? []
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toContain(':to="siteHomePath"')
      expect(link).not.toContain(':href')
    }
    expect(source).toContain('const siteHomePath = computed(() => localePath(\'/\'))')
    expect(source).not.toMatch(/public\.appUrl\s*\|\|/)
  })

  it('GEGENPROBE: das Anmelde-Fenster öffnet ebenfalls relativ — beide Wege landen auf demselben Host', () => {
    expect(login).toMatch(/window\.open\(`\$\{localePath\('\/login'\)\}\?embed=1`/)
  })
})
