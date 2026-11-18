/**
 * CW1 b (Davids Entscheidung 2026-11-18): die Pflicht-Prüfung `secrets` liest
 * nur die Historie des geprüften Zweigs; ALLE Zweige liest einmal am Tag der
 * Lauf `secrets-watch.yml`, als Hinweis mit Issue.
 *
 * Der Test hält die zwei Hälften zusammen: fiele der tägliche Lauf weg oder
 * läse auch er nur einen Zweig, sähe niemand mehr einen Fund in einem Zweig,
 * der nie ein Pull Request wird. Und er hält Version und Prüfsumme von
 * gitleaks in beiden Dateien gleich.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url)), 'utf8')

/** Nur die Zeilen, die etwas tun — Kommentare zählen nicht. */
const active = (source: string) => source.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')

const scanLines = (source: string) => active(source).split('\n').filter(line => /gitleaks" git /.test(line))
const pin = (source: string, key: string) => active(source).match(new RegExp(`${key}:\\s*(\\S+)`))?.[1]

describe('Geheimnis-Prüfung: Pflicht je Zweig, täglich alle Zweige (CW1 b)', () => {
  const lint = read('lint.yml')
  const watch = read('secrets-watch.yml')

  it('lint.yml: die Pflicht-Prüfung liest genau die Historie des geprüften Commits', () => {
    const lines = scanLines(lint)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('--log-opts="--full-history HEAD"')
    expect(lines[0]).toContain('--redact')
    expect(lines[0]).toContain('--exit-code 1')
  })

  it('secrets-watch.yml: der tägliche Lauf liest alle Zweige (keine Einschränkung) und läuft nach Zeitplan', () => {
    const lines = scanLines(watch)
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('--log-opts')
    expect(lines[0]).toContain('--redact')
    expect(lines[0]).toContain('--exit-code 1')
    expect(active(watch)).toMatch(/schedule:\s*\n\s*- cron: '/)
    expect(active(watch)).toContain('fetch-depth: 0')
  })

  it('secrets-watch.yml: ein roter Lauf wird ein Issue, kein Tor', () => {
    expect(active(watch)).toContain('LABEL: geheimnis-alarm')
    expect(active(watch)).toContain('gh issue create')
    expect(active(watch)).toContain('gh issue close')
    // Kein Name, an dem das Ausliefer-Tor oder eine Pflicht-Prüfung hängt.
    expect(active(watch)).not.toMatch(/^name:\s*(Lint|Test|Typecheck|E2E)/m)
  })

  it('beide Dateien nehmen dieselbe gitleaks-Datei (Version und Prüfsumme)', () => {
    expect(pin(lint, 'GITLEAKS_VERSION')).toBeTruthy()
    expect(pin(watch, 'GITLEAKS_VERSION')).toBe(pin(lint, 'GITLEAKS_VERSION'))
    expect(pin(lint, 'GITLEAKS_SHA256')).toMatch(/^[0-9a-f]{64}$/)
    expect(pin(watch, 'GITLEAKS_SHA256')).toBe(pin(lint, 'GITLEAKS_SHA256'))
  })
})
