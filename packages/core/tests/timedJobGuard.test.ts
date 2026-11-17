import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TIMED_JOB_NAME_PATTERN } from '../server/utils/timedJob'

/**
 * WÄCHTER: ZEIT-LÄUFE NUR ÜBER `defineTimedJob` (OPS-011, seit 2026-11-16).
 *
 * Ein täglicher Wächter auf dem Server zählt die `job.run`-Zeilen je
 * Kennung. Ein Takt, der an der Hilfe vorbei mit `setInterval` startet,
 * schreibt keine — er wäre für den Wächter unsichtbar, gleich ob er läuft,
 * scheitert oder steht. Deshalb hier, über ALLE Plugins aller Layer und
 * Apps:
 *  (a) kein `setInterval(` außerhalb der Hilfe (Ausnahmen nur mit Grund in
 *      `EXEMPT`; eine Ausnahme, die nicht mehr nötig ist, wird ebenfalls rot),
 *  (b) jede Kennung ist ein String-Literal, erfüllt das Muster und ist
 *      repo-weit eindeutig (zur Laufzeit gälte sonst nur die erste),
 *  (c) die Liste der Kennungen steht unten fest. Ein neuer oder umbenannter
 *      Lauf macht den Test rot, und wer ihn grün macht, zieht die Liste
 *      bewusst nach — neuer Lauf ⇒ auch `ops/timed-jobs.conf` nachziehen
 *      (dort steht, wie oft der Wächter je Kennung eine Zeile erwartet).
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Plugin-Dateien mit begründetem `setInterval(` — heute keine. */
const EXEMPT: Record<string, string> = {}

/** Sortiert. Neuer oder umbenannter Lauf ⇒ hier UND in `ops/timed-jobs.conf` nachziehen. */
const EXPECTED_JOB_NAMES = [
  'audit-log-retention',
  'brand-check-erasure',
  'brand-events-sweep',
  'brand-intro-retention',
  'brand-waitlist-retention',
  'custom-domain-notice',
  'custom-domain-sweep',
  'email-digest',
  'entitlements-pull',
  'event-reminders',
  'gdpr-export-prune',
  'guest-author-prune',
  'health-sweep',
  'insights-corrections-sweep',
  'insights-radar',
  'insights-subscribers-sweep',
  'intro-request-retention',
  'invite-request-prune',
  'label-reconcile',
  'market-raw-text-sweep',
  'message-report-evidence',
  'past-due-notice',
  'past-due-sweep',
  'reporter-email-prune',
  'run-retention',
  'trial-sweep',
]

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (name.endsWith('.ts')) found.push(path)
  }
  return found
}

function pluginFiles(): string[] {
  const files: string[] = []
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(ROOT, group))) {
      files.push(...walk(join(ROOT, group, name, 'server', 'plugins')))
    }
  }
  return files.map(file => relative(ROOT, file).split('\\').join('/')).sort()
}

const FILES = pluginFiles()
const SOURCES = new Map(FILES.map(file => [file, readFileSync(join(ROOT, file), 'utf8')]))

/** Kommentare fallen weg — ein `setInterval(` in einer Begründung zählt nicht. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

interface FoundJob { file: string, name: string | null }

function findJobs(): FoundJob[] {
  const jobs: FoundJob[] = []
  for (const [file, source] of SOURCES) {
    const body = code(source)
    const calls = body.split('defineTimedJob(').slice(1)
    for (const call of calls) {
      const literal = /^\s*\{\s*name:\s*'([^'\n]*)'\s*,/.exec(call)
      jobs.push({ file, name: literal ? literal[1]! : null })
    }
  }
  return jobs
}

describe('Wächter: Zeit-Läufe nur über defineTimedJob', () => {
  it('findet die Plugins überhaupt (sonst prüfte der Test nichts)', () => {
    expect(FILES.length).toBeGreaterThan(20)
    expect(FILES).toContain('packages/core/server/plugins/email-digest.ts')
  })

  it('(a) kein setInterval( in einem Plugin außerhalb der Ausnahmen', () => {
    const offenders = FILES.filter(file => !(file in EXEMPT) && code(SOURCES.get(file)!).includes('setInterval('))
    expect(offenders).toEqual([])
  })

  it('(a) jede Ausnahme ist noch nötig und hat einen Grund', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.trim().length, file).toBeGreaterThan(20)
      expect(SOURCES.has(file), `${file} gibt es nicht mehr`).toBe(true)
      expect(code(SOURCES.get(file)!).includes('setInterval('), `${file} braucht die Ausnahme nicht mehr`).toBe(true)
    }
  })

  it('(b) jede Kennung ist ein String-Literal und erfüllt das Muster', () => {
    const jobs = findJobs()
    expect(jobs.filter(job => job.name === null).map(job => job.file)).toEqual([])
    expect(jobs.filter(job => !TIMED_JOB_NAME_PATTERN.test(job.name ?? '')).map(job => `${job.file}: ${job.name}`)).toEqual([])
  })

  it('(b) jede Kennung ist repo-weit eindeutig', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const job of findJobs()) {
      if (job.name === null) continue
      const before = seen.get(job.name)
      if (before) duplicates.push(`${job.name}: ${before} + ${job.file}`)
      else seen.set(job.name, job.file)
    }
    expect(duplicates).toEqual([])
  })

  it('(c) die Kennungen sind genau die festgehaltenen (neuer Lauf ⇒ Liste und ops/timed-jobs.conf nachziehen)', () => {
    const names = findJobs().map(job => job.name ?? '').sort()
    expect(names).toEqual(EXPECTED_JOB_NAMES)
    expect([...EXPECTED_JOB_NAMES].sort()).toEqual(EXPECTED_JOB_NAMES)
  })
})
